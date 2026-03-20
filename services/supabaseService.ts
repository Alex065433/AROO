import { supabase } from './supabase';
import { PACKAGES, RANKS, MOCK_USER } from '../constants';

export interface Ticket {
  id?: string;
  uid: string;
  subject: string;
  message: string;
  status: 'open' | 'closed';
  created_at: string;
}

export const supabaseService = {
  // Auth
  async adminLogin(adminId: string, secretKey: string) {
    // Unique Administration ID and Password logic
    const ADMIN_ID = "ADMIN_AROWIN_2026";
    const ADMIN_SECRET = "CORE_SECURE_999";

    if (adminId === ADMIN_ID && secretKey === ADMIN_SECRET) {
      // Return a mock admin profile or fetch the actual admin user
      const { data: adminProfile } = await supabase
        .from("profiles")
        .select("*")
        .eq("email", "kethankumar130@gmail.com")
        .single();
      
      if (adminProfile) {
        localStorage.setItem('arowin_supabase_user', JSON.stringify({ ...adminProfile, role: 'admin' }));
        return { ...adminProfile, role: 'admin' };
      }
      
      // Fallback if profile not found
      const fallbackAdmin = {
        id: 'admin-id',
        email: 'kethankumar130@gmail.com',
        name: 'System Administrator',
        role: 'admin',
        operator_id: ADMIN_ID
      };
      localStorage.setItem('arowin_supabase_user', JSON.stringify(fallbackAdmin));
      return fallbackAdmin;
    }

    throw new Error("Invalid Administrative Credentials. Access Denied.");
  },

  async login(operatorId: string, password: string) {
    let cleanId = operatorId.trim();
    
    // Normalize Operator ID format
    // 1. If it's just 6 digits, prepend ARW-
    if (/^\d{6}$/.test(cleanId)) {
      cleanId = `ARW-${cleanId}`;
    }
    // 2. If it's ARW followed by 6 digits (no hyphen), insert hyphen
    if (/^ARW\d{6}$/i.test(cleanId)) {
      cleanId = `ARW-${cleanId.substring(3).toUpperCase()}`;
    }
    
    // Step 1: get profile from operator_id
    // Try exact match first
    let { data, error } = await supabase
      .from("profiles")
      .select("email, status, role")
      .eq("operator_id", cleanId)
      .single();

    // If not found, try case-insensitive (ilike)
    if (error || !data) {
      const { data: retryData, error: retryError } = await supabase
        .from("profiles")
        .select("email, status, role")
        .ilike("operator_id", cleanId)
        .single();
      
      if (!retryError && retryData) {
        data = retryData;
        error = null;
      }
    }

    // If still not found, maybe it's an email?
    if (error || !data) {
      if (cleanId.includes('@')) {
        // Use ilike and handle potential quotes in the or filter
        const { data: emailData, error: emailError } = await supabase
          .from("profiles")
          .select("email, status, role")
          .or(`email.ilike."${cleanId}",real_email.ilike."${cleanId}"`)
          .single();
        
        if (!emailError && emailData) {
          data = emailData;
          error = null;
        }
      }
    }

    if (error || !data) {
      throw new Error("Invalid Operator ID or Email");
    }

    // Check if account is active (unless it's an admin)
    if (data.status === 'blocked') {
      throw new Error("Your account has been blocked by the administrator. Please contact support.");
    }
    
    if (data.status === 'pending' && data.role !== 'admin') {
      throw new Error("Your account is pending activation by the administrator. Please wait for approval.");
    }

    // Step 2: login using email (which is the internal email)
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: password
    });

    if (authError) throw authError;

    // Fetch full profile to store in local storage
    const profile = await this.getUserProfile(authData.user.id);
    localStorage.setItem('arowin_supabase_user', JSON.stringify(profile));
    return profile;
  },

  async loginWithGoogle() {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
    });
    if (error) throw error;
    return data;
  },

  async register(email: string, password: string, sponsorId: string, side: 'LEFT' | 'RIGHT', additionalData: any = {}) {
    const operatorId = `ARW-${Math.floor(100000 + Math.random() * 900000)}`;
    const internalEmail = `${operatorId}@arowin.internal`;

    // 1. Create Supabase Auth User with internal email to allow multiple accounts per real email
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: internalEmail,
      password,
    });

    if (authError) {
      if (authError.message.includes('Database error saving new user')) {
        throw new Error('Supabase Trigger Error: Your "profiles" table or trigger is misconfigured. Please run the SQL fix in the Supabase SQL Editor.');
      }
      throw authError;
    }
    
    if (!authData.user) throw new Error('User creation failed');
    const user = authData.user;

    // 2. Find Sponsor and Binary Parent
    // Normalize Operator ID format
    let cleanSponsorId = sponsorId.trim();
    if (/^\d{6}$/.test(cleanSponsorId)) {
      cleanSponsorId = `ARW-${cleanSponsorId}`;
    }
    if (/^ARW\d{6}$/i.test(cleanSponsorId)) {
      cleanSponsorId = `ARW-${cleanSponsorId.substring(3).toUpperCase()}`;
    }

    const { data: sponsor } = await supabase
      .from('profiles')
      .select('id')
      .ilike('operator_id', cleanSponsorId)
      .single();

    if (!sponsor) throw new Error('Invalid Sponsor ID');

    // Find the correct parent in the binary tree
    let parentId = sponsor.id;
    let finalSide = side;
    
    // If an explicit parent is provided in additionalData, use it
    if (additionalData.parentId) {
      // Verify parent exists
      const { data: explicitParent } = await supabase
        .from('profiles')
        .select('id, operator_id')
        .or(`id.eq.${additionalData.parentId},operator_id.eq.${additionalData.parentId}`)
        .single();
      
      if (explicitParent) {
        parentId = explicitParent.id;
        finalSide = side;
      } else {
        // Fallback to spillover if explicit parent not found
        try {
          const binaryResult = await this.findBinaryParent(sponsor.id, side);
          parentId = binaryResult.parentId;
          finalSide = binaryResult.side;
        } catch (err) {
          console.warn('Binary parent search failed, defaulting to sponsor:', err);
        }
      }
    } else {
      // Standard spillover logic
      try {
        const binaryResult = await this.findBinaryParent(sponsor.id, side);
        parentId = binaryResult.parentId;
        finalSide = binaryResult.side;
      } catch (err) {
        console.warn('Binary parent search failed, defaulting to sponsor:', err);
      }
    }

    // 3. Prepare Profile Data
    // We use snake_case for database columns
    const profileData = {
      id: user.id,
      email: internalEmail,
      real_email: email,
      operator_id: operatorId,
      name: additionalData.name || email.split('@')[0],
      mobile: additionalData.mobile || '',
      withdrawal_password: additionalData.withdrawalPassword || '',
      two_factor_pin: additionalData.twoFactorPin || '123456',
      sponsor_id: sponsor.id,
      parent_id: parentId,
      side: finalSide,
      rank: 1,
      package_amount: 50, // Default joining package
      wallets: {
        master: { balance: 0, currency: 'USDT' },
        referral: { balance: 0, currency: 'USDT' },
        matching: { balance: 0, currency: 'USDT' },
        rankBonus: { balance: 0, currency: 'USDT' },
        rewards: { balance: 0, currency: 'USDT' },
      },
      team_size: { left: 0, right: 0 },
      matching_volume: { left: 0, right: 0 },
      matched_pairs: 0,
      role: email === 'kethankumar130@gmail.com' ? 'admin' : 'user',
      status: email === 'kethankumar130@gmail.com' ? 'active' : 'pending',
      created_at: new Date().toISOString(),
    };

    // 4. Upsert Profile
    // We try to save the full profile. If it fails due to missing columns, 
    // we try a minimal profile so the user can at least log in.
    let { error: profileError } = await supabase
      .from('profiles')
      .upsert([profileData], { onConflict: 'id' });

    if (profileError && profileError.message.includes('column')) {
      console.warn('Database schema mismatch detected. Attempting minimal profile creation...');
      const minimalProfile = {
        id: user.id,
        email: user.email,
        operator_id: operatorId,
        name: profileData.name,
        role: profileData.role,
        wallets: profileData.wallets, // Ensure wallets exist even in minimal profile
        created_at: profileData.created_at
      };
      
      const { error: retryError } = await supabase
        .from('profiles')
        .upsert([minimalProfile], { onConflict: 'id' });
      
      if (!retryError) {
        console.log('Minimal profile created successfully. Please run the SQL migration to enable full features.');
        return { ...minimalProfile, uid: user.id, schemaWarning: true };
      }
      profileError = retryError;
    }

    if (profileError) {
      console.error('Supabase Profile Creation Error:', profileError);
      throw new Error(`Profile Sync Error: ${profileError.message}`);
    }

    // 5. Update Ancestors Team Size
    await this.updateAncestorsTeamSize(user.id);

    return { ...profileData, uid: user.id };
  },

  async logout() {
    await supabase.auth.signOut();
    localStorage.removeItem('arowin_supabase_user');
  },

  onAuthChange(callback: (user: any) => void) {
    // Combine Supabase Auth and our custom session
    const localUser = localStorage.getItem('arowin_supabase_user');
    if (localUser) {
      callback(JSON.parse(localUser));
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        // Fetch profile
        this.getUserProfile(session.user.id).then(profile => {
          callback(profile);
        });
      } else if (!localUser) {
        callback(null);
      }
    });

    return () => subscription.unsubscribe();
  },

  getCurrentUser() {
    const localUser = localStorage.getItem('arowin_supabase_user');
    return localUser ? JSON.parse(localUser) : null;
  },

  // User Profiles
  async createUserProfile(uid: string, data: any) {
    const { error } = await supabase
      .from('profiles')
      .upsert({ id: uid, ...data });
    if (error) throw error;
  },

  async getUserProfile(uid: string) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', uid)
      .single();
    if (error) return null;
    
    // Force admin role for the owner
    if (data.email === 'kethankumar130@gmail.com') {
      data.role = 'admin';
    }
    
    return data;
  },

  // Package Activation
  async activatePackage(uid: string, amount: number, adminId?: string) {
    // 1. If adminId is provided, deduct from admin's master wallet
    if (adminId) {
      const adminProfile = await this.getUserProfile(adminId);
      if (!adminProfile) throw new Error('Admin not found');
      
      if ((adminProfile.wallets?.master?.balance || 0) < amount) {
        throw new Error('Insufficient admin funds');
      }

      const updatedAdminWallets = { ...MOCK_USER.wallets, ...adminProfile.wallets };
      updatedAdminWallets.master.balance -= amount;

      await supabase
        .from('profiles')
        .update({ wallets: updatedAdminWallets })
        .eq('id', adminId);
        
      // Log admin deduction
      await supabase.from('payments').insert([{
        uid: adminId,
        amount: -amount,
        type: 'admin_fund_usage',
        status: 'completed',
        method: 'INTERNAL',
        created_at: new Date().toISOString()
      }]);
    }

    // 2. Log the activation for the user
    const { error } = await supabase.from('payments').insert([{
      uid,
      amount,
      type: 'package_activation',
      status: 'completed',
      method: 'INTERNAL',
      created_at: new Date().toISOString()
    }]);

    if (error) throw error;

    // 3. Generate Team Collection Nodes for the user based on package
    const pkg = PACKAGES.find(p => p.price === amount);
    const nodeCount = pkg?.nodes || 3;
    
    const teamNodes = [];
    for (let i = 1; i <= nodeCount; i++) {
      teamNodes.push({
        uid,
        node_id: `NODE-${Math.floor(100000 + Math.random() * 900000)}`,
        name: `Node ${i} (${pkg?.name || 'Package ' + amount})`,
        balance: 0,
        eligible: true,
        created_at: new Date().toISOString()
      });
    }
    
    await supabase.from('team_collection').insert(teamNodes);

    // 4. Update Profile Active Package
    await supabase
      .from('profiles')
      .update({ active_package: amount })
      .eq('id', uid);

    // 5. Process MLM Income
    await this.processIncome(uid, amount);
    
    // 6. Update Rank
    await this.checkAndUpdateRank(uid);

    // 7. Add Notification
    await this.addNotification(uid, 'Package Activated', `Your ${pkg?.name || 'Package'} has been activated successfully.`, 'reward');
    
    return true;
  },

  // Daily and Weekly Payout System
  async processDailyPayouts() {
    // This would normally be a cron job, but we'll provide it for admin use
    const users = await this.getAllUsers();
    if (!users) return;

    for (const user of users) {
      // 1. Reset daily capping tracking
      const today = new Date().toISOString().split('T')[0];
      await supabase
        .from('profiles')
        .update({ daily_income: { date: today, amount: 0 } })
        .eq('id', user.id);
      
      // 2. Process Binary Matching (Daily)
      await this.processBinaryMatchingForUser(user.id);

      // 3. Check for rank auto-upgrade
      await this.checkAndUpdateRank(user.id);
    }
    return true;
  },

  async processBinaryMatchingForUser(uid: string) {
    const profile = await this.getUserProfile(uid);
    if (!profile || profile.active_package <= 0) return;

    const volume = profile.matching_volume || { left: 0, right: 0 };
    const matchAmount = Math.min(volume.left, volume.right);

    if (matchAmount >= 50) {
      // 1 Pair = $50 matching on both sides
      const pairs = Math.floor(matchAmount / 50);
      const matchValue = pairs * 50;
      
      // Matching Income = 10% of pair value ($50 + $50 = $100, so $10 per pair)
      const matchingIncome = pairs * 10;
      
      // Pay matching income with capping
      await this.addIncome(uid, matchingIncome, 'matching_income');
      
      // Update matched pairs count and volume (carry-forward)
      const newVolume = {
        left: volume.left - matchValue,
        right: volume.right - matchValue
      };

      await supabase
        .from('profiles')
        .update({ 
          matched_pairs: (profile.matched_pairs || 0) + pairs,
          matching_volume: newVolume
        })
        .eq('id', uid);
      
      console.log(`User ${uid} processed ${pairs} pairs. New volume: L:${newVolume.left} R:${newVolume.right}`);
    }
  },

  async processBinaryMatching() {
    const users = await this.getAllUsers();
    if (!users) return;

    for (const user of users) {
      await this.processBinaryMatchingForUser(user.id);
    }
  },

  async processRankAndRewards() {
    const users = await this.getAllUsers();
    if (!users) return;

    for (const user of users) {
      await this.checkAndUpdateRank(user.id);
      
      // Process Rank Bonus (Weekly/Monthly based on logic)
      const rankData = RANKS.find(r => r.level === (user.rank || 1));
      if (rankData && rankData.weeklyEarning > 0) {
        await this.addIncome(user.id, rankData.weeklyEarning, 'rank_bonus');
      }
    }
  },

  async processWeeklyIncome() {
    const users = await this.getAllUsers();
    if (!users) return;

    const today = new Date();
    
    for (const user of users) {
      if (user.active_package > 0) {
        const rankData = RANKS.find(r => r.level === (user.rank || 1));
        if (rankData && rankData.weeklyEarning > 0) {
          // Add weekly rank bonus
          await this.addIncome(user.id, rankData.weeklyEarning, 'rank_bonus');
        }
      }
    }
    return true;
  },

  // Team Collection
  async getTeamCollection(uid: string) {
    const { data, error } = await supabase
      .from('team_collection')
      .select('*')
      .eq('uid', uid);
    if (error) return [];
    return data;
  },

  async collectFromNodes(uid: string, nodeIds: string[]) {
    // 1. Fetch nodes
    const { data: nodes } = await supabase
      .from('team_collection')
      .select('*')
      .in('node_id', nodeIds)
      .eq('uid', uid);
    
    if (!nodes || nodes.length === 0) return 0;

    let totalCollected = 0;
    for (const node of nodes) {
      // For simulation, each node gives 5.25 USDT
      totalCollected += 5.25;
      
      // Reset node balance (if we were tracking it)
      await supabase
        .from('team_collection')
        .update({ balance: 0 })
        .eq('node_id', node.node_id);
    }

    // 2. Add to user's master wallet
    const profile = await this.getUserProfile(uid);
    if (profile) {
      const updatedWallets = { ...MOCK_USER.wallets, ...profile.wallets };
      updatedWallets.master.balance += totalCollected;
      await this.createUserProfile(uid, { wallets: updatedWallets });
      
      // Log transaction
      await supabase.from('payments').insert([{
        uid,
        amount: totalCollected,
        type: 'team_collection',
        status: 'completed',
        method: 'INTERNAL',
        created_at: new Date().toISOString()
      }]);
    }

    return totalCollected;
  },

  // Rank Ladder Logic
  async checkAndUpdateRank(uid: string) {
    const profile = await this.getUserProfile(uid);
    if (!profile) return;

    // CRITICAL: Without ID activation (active_package), rank should not unlock
    if (!profile.active_package || profile.active_package < 50) {
      if (profile.rank > 1) {
        await supabase.from('profiles').update({ rank: 1 }).eq('id', uid);
      }
      return;
    }

    const leftCount = profile.team_size?.left || 0;
    const rightCount = profile.team_size?.right || 0;
    
    // Find the highest rank the user qualifies for using criteria from constants.tsx
    let newRank = 1;
    for (const rank of RANKS) {
      if (leftCount >= rank.requiredLeft && rightCount >= rank.requiredRight) {
        newRank = rank.level;
      } else {
        break;
      }
    }

    if (newRank > (profile.rank || 1)) {
      // Award one-time rewards for all ranks achieved between current and new
      for (let r = (profile.rank || 1) + 1; r <= newRank; r++) {
        const rankData = RANKS.find(rank => rank.level === r);
        if (rankData && rankData.reward > 0) {
          await this.addIncome(uid, rankData.reward, 'reward_income');
          console.log(`User ${uid} earned reward for Rank ${r}: ${rankData.reward}`);
        }
      }

      await supabase
        .from('profiles')
        .update({ rank: newRank })
        .eq('id', uid);
      
      console.log(`User ${uid} promoted to Rank ${newRank}`);
    }
  },

  // Payments
  async getPayments(uid: string) {
    try {
      let query = supabase.from('payments').select('*');
      
      if (uid !== 'all') {
        query = query.eq('uid', uid);
      }
      
      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) {
        if (error.code === 'PGRST204' || error.code === 'PGRST205') {
          console.warn('Payments table not found. Returning empty list.');
          return [];
        }
        throw error;
      }
      return data;
    } catch (err) {
      console.error('Error fetching payments:', err);
      return [];
    }
  },

  // MLM Logic
  async findBinaryParent(sponsorId: string, side: 'LEFT' | 'RIGHT'): Promise<{ parentId: string, side: 'LEFT' | 'RIGHT' }> {
    let currentParentId = sponsorId;
    
    while (true) {
      const { data: children, error } = await supabase
        .from('profiles')
        .select('id, side')
        .eq('parent_id', currentParentId);
      
      if (error) throw error;
      
      const sideChild = children?.find(c => c.side === side);
      if (!sideChild) {
        // Found an empty spot on the desired side
        return { parentId: currentParentId, side };
      } else {
        // Move down to the child and continue searching on the same side
        currentParentId = sideChild.id;
      }
    }
  },

  async updateAncestorsTeamSize(uid: string) {
    let currentId = uid;
    
    while (true) {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('parent_id, side')
        .eq('id', currentId)
        .single();
      
      if (error || !profile || !profile.parent_id) break;
      
      const parentId = profile.parent_id;
      const side = profile.side;
      
      // Fetch parent's current team size
      const { data: parent, error: parentError } = await supabase
        .from('profiles')
        .select('team_size')
        .eq('id', parentId)
        .single();
        
      if (parentError || !parent) break;
      
      const newTeamSize = { ...parent.team_size };
      if (side === 'LEFT') newTeamSize.left += 1;
      else newTeamSize.right += 1;
      
      await supabase
        .from('profiles')
        .update({ team_size: newTeamSize })
        .eq('id', parentId);
        
      currentId = parentId;
    }
  },

  async processIncome(uid: string, amount: number) {
    const profile = await this.getUserProfile(uid);
    if (!profile) return;

    // 1. Referral Bonus (5% to direct sponsor)
    if (profile.sponsor_id) {
      const referralBonus = amount * 0.05; // 5% of package
      const sponsor = await this.getUserProfile(profile.sponsor_id);
      if (sponsor && sponsor.active_package > 0) {
        await this.addIncome(sponsor.id, referralBonus, 'referral_bonus');
      }
    }

    // 2. Update Ancestors Volume (Carry-forward)
    let currentId = uid;
    while (true) {
      const { data: node, error } = await supabase
        .from('profiles')
        .select('parent_id, side')
        .eq('id', currentId)
        .single();
        
      if (error || !node || !node.parent_id) break;
      
      const parentId = node.parent_id;
      const side = node.side;
      
      const parent = await this.getUserProfile(parentId);
      if (!parent) break;

      // Update parent's volume (Carry-forward logic)
      const newVolume = { ...parent.matching_volume || { left: 0, right: 0 } };
      if (side === 'LEFT') newVolume.left += amount;
      else newVolume.right += amount;

      await supabase
        .from('profiles')
        .update({ matching_volume: newVolume })
        .eq('id', parentId);
      
      // Trigger binary matching immediately for the ancestor
      await this.processBinaryMatchingForUser(parentId);
      
      currentId = parentId;
    }
  },

  async addIncome(uid: string, amount: number, type: string) {
    const profile = await this.getUserProfile(uid);
    if (!profile) return;

    let payableAmount = amount;

    // Only apply daily capping to matching income
    if (type === 'matching_income') {
      const today = new Date().toISOString().split('T')[0];
      const dailyIncome = profile.daily_income || { date: '', amount: 0 };
      
      let currentDailyAmount = dailyIncome.date === today ? dailyIncome.amount : 0;
      
      // Capping based on rank
      const rankData = RANKS.find(r => r.level === (profile.rank || 1));
      const capping = rankData?.dailyCapping || 250;

      const remainingCapping = capping - currentDailyAmount;
      if (remainingCapping <= 0) return; // Capped for today

      payableAmount = Math.min(amount, remainingCapping);

      // Update daily income tracking for capping
      await supabase
        .from('profiles')
        .update({ 
          daily_income: { date: today, amount: currentDailyAmount + payableAmount }
        })
        .eq('id', uid);
    }
    
    // Update Wallets
    const updatedWallets = { ...MOCK_USER.wallets, ...profile.wallets };
    updatedWallets.master.balance += payableAmount;
    if (type === 'referral_bonus') updatedWallets.referral.balance += payableAmount;
    if (type === 'matching_income') updatedWallets.matching.balance += payableAmount;
    if (type === 'rank_bonus') updatedWallets.rankBonus.balance += payableAmount;
    if (type === 'reward_income') updatedWallets.rewards.balance += payableAmount;
    
    await supabase
      .from('profiles')
      .update({ 
        wallets: updatedWallets,
        total_income: (profile.total_income || 0) + payableAmount
      })
      .eq('id', uid);

    // Log transaction
    await supabase.from('payments').insert([{
      uid,
      amount: payableAmount,
      type,
      status: 'completed',
      method: 'INTERNAL',
      created_at: new Date().toISOString()
    }]);
  },

  async getBinaryTree(rootUid: string) {
    const { data: rootProfile, error } = await supabase
      .from('profiles')
      .select('*')
      .or(`id.eq.${rootUid},operator_id.eq.${rootUid}`)
      .single();
    
    if (error || !rootProfile) return {};

    const tree: Record<string, any> = {};

    const buildNode = (node: any, path: string) => {
      tree[path] = {
        id: node.operator_id,
        name: node.name,
        rank: node.rank_name || 'Partner',
        status: node.active_package > 0 ? 'Active' : 'Pending',
        joinDate: node.created_at?.split('T')[0],
        totalTeam: (node.team_size?.left || 0) + (node.team_size?.right || 0),
        team_size: node.team_size || { left: 0, right: 0 },
        leftVolume: (node.matching_volume?.left || 0).toFixed(2) || '0.00',
        rightVolume: (node.matching_volume?.right || 0).toFixed(2) || '0.00',
        parentId: node.parent_id,
        side: node.side || 'ROOT',
        uid: node.id
      };
    };

    buildNode(rootProfile, 'root');

    // Optimized fetch: Fetch levels iteratively to reduce query count and increase depth
    let currentLevelNodes = [{ id: rootProfile.id, path: 'root' }];
    const maxDepth = 10; // Increased depth to 10 levels (~1023 nodes)

    for (let depth = 0; depth < maxDepth; depth++) {
      const parentIds = currentLevelNodes.map(n => n.id);
      if (parentIds.length === 0) break;

      const { data: children, error: fetchError } = await supabase
        .from('profiles')
        .select('*')
        .in('parent_id', parentIds);

      if (fetchError || !children || children.length === 0) break;

      const nextLevelNodes: { id: string, path: string }[] = [];
      
      children.forEach(child => {
        const parent = currentLevelNodes.find(p => p.id === child.parent_id);
        if (parent) {
          const childPath = `${parent.path}-${child.side.toLowerCase()}`;
          buildNode(child, childPath);
          nextLevelNodes.push({ id: child.id, path: childPath });
        }
      });

      currentLevelNodes = nextLevelNodes;
    }

    return tree;
  },

  async getBinaryChildren(parentId: string, parentPath: string) {
    const { data: children, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('parent_id', parentId);
    
    if (error) throw error;

    const nodes: Record<string, any> = {};
    children?.forEach(child => {
      const childPath = `${parentPath}-${child.side.toLowerCase()}`;
      nodes[childPath] = {
        id: child.operator_id,
        name: child.name,
        rank: child.rank_name || 'Partner',
        status: child.active_package > 0 ? 'Active' : 'Pending',
        joinDate: child.created_at?.split('T')[0],
        totalTeam: (child.team_size?.left || 0) + (child.team_size?.right || 0),
        leftVolume: (child.matching_volume?.left || 0).toFixed(2) || '0.00',
        rightVolume: (child.matching_volume?.right || 0).toFixed(2) || '0.00',
        parentId: child.parent_id,
        side: child.side || 'ROOT',
        uid: child.id
      };
    });

    return nodes;
  },

  async getReferrals(uid: string) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, name, operator_id, email, created_at, active_package, rank_name')
      .eq('sponsor_id', uid)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return data;
  },

  async findUserByOperatorId(operatorId: string) {
    let cleanId = operatorId.trim();
    if (/^\d{6}$/.test(cleanId)) {
      cleanId = `ARW-${cleanId}`;
    }
    if (/^ARW\d{6}$/i.test(cleanId)) {
      cleanId = `ARW-${cleanId.substring(3).toUpperCase()}`;
    }
    
    // Try exact match first
    let { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('operator_id', cleanId)
      .single();

    // Fallback to ilike
    if (error || !data) {
      const { data: retryData, error: retryError } = await supabase
        .from('profiles')
        .select('*')
        .ilike('operator_id', cleanId)
        .single();
      
      if (!retryError && retryData) {
        data = retryData;
        error = null;
      }
    }

    if (error) return null;
    return data;
  },

  async updatePassword(newPassword: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { error } = await supabase.auth.updateUser({
      password: newPassword
    });
    if (error) throw error;

    // Add Notification
    await this.addNotification(user.id, 'Password Updated', 'Your account password has been successfully updated.', 'update');

    return true;
  },

  async updateSecuritySettings(uid: string, data: { withdrawal_password?: string, two_factor_pin?: string }) {
    const { error } = await supabase
      .from('profiles')
      .update(data)
      .eq('id', uid);
    if (error) throw error;
    return true;
  },

  async getAbsoluteRoot() {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .is('parent_id', null)
      .single();
    if (error) return null;
    return data;
  },

  formatError(error: any): string {
    const message = error?.message || '';
    if (message.includes('Invalid Operator ID') || message.includes('Invalid Email')) {
      return 'Invalid Operator ID or Email. Please check and try again.';
    }
    if (message.includes('Invalid Password')) return 'Invalid Password. Please check and try again.';
    if (message.includes('Database error saving new user')) {
      return 'Database error saving new user. This usually means a Supabase trigger or RLS policy is failing. Ensure your "profiles" table has all required columns and correct RLS policies.';
    }
    if (message.includes('duplicate key value violates unique constraint')) {
      return 'This user or operator ID already exists. Please try another email or check your sponsor ID.';
    }
    return message || 'An unexpected error occurred.';
  },

  // Support Tickets
  async createTicket(uid: string, subject: string, message: string) {
    const { data, error } = await supabase
      .from('tickets')
      .insert([{
        uid,
        subject,
        message,
        status: 'open',
        created_at: new Date().toISOString()
      }])
      .select()
      .single();
    
    if (error) throw error;
    return data.id;
  },

  async getTickets(uid: string) {
    const { data, error } = await supabase
      .from('tickets')
      .select('*')
      .eq('uid', uid)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  },

  // Admin Functions
  async getAllUsers() {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  },

  async getAdminStats() {
    const { data: users, error: usersError } = await supabase
      .from('profiles')
      .select('id, wallets, active_package, status');
    
    if (usersError) throw usersError;

    const { data: payments, error: paymentsError } = await supabase
      .from('payments')
      .select('amount, type, status');

    if (paymentsError) throw paymentsError;

    const totalUsers = users?.length || 0;
    const activeUsers = users?.filter(u => u.active_package > 0).length || 0;
    const blockedUsers = users?.filter(u => u.status === 'blocked').length || 0;
    const totalDeposits = payments?.filter(p => p.type === 'deposit' && p.status === 'finished')
      .reduce((sum, p) => sum + p.amount, 0) || 0;
    const totalWithdrawals = payments?.filter(p => p.type === 'withdrawal' && p.status === 'completed')
      .reduce((sum, p) => sum + p.amount, 0) || 0;
    const pendingWithdrawals = payments?.filter(p => p.type === 'withdrawal' && p.status === 'pending')
      .reduce((sum, p) => sum + p.amount, 0) || 0;
    
    // Platform revenue is 5% of all successful deposits
    const platformRevenue = totalDeposits * 0.05;
    
    return {
      totalUsers,
      activeUsers,
      blockedUsers,
      totalDeposits,
      totalWithdrawals,
      pendingWithdrawals,
      platformRevenue
    };
  },

  async getAdminChartData() {
    const { data: payments, error } = await supabase
      .from('payments')
      .select('amount, type, status, created_at')
      .eq('status', 'finished')
      .eq('type', 'deposit')
      .order('created_at', { ascending: true });

    if (error) throw error;

    // Group by date
    const grouped = payments.reduce((acc: any, p) => {
      const date = new Date(p.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      acc[date] = (acc[date] || 0) + p.amount;
      return acc;
    }, {});

    return Object.entries(grouped).map(([name, revenue]) => ({ name, revenue }));
  },

  async getAdminRegistrationData() {
    const { data: users, error } = await supabase
      .from('profiles')
      .select('created_at')
      .order('created_at', { ascending: true });

    if (error) throw error;

    // Group by day of week
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const grouped = users.reduce((acc: any, u) => {
      const day = days[new Date(u.created_at).getDay()];
      acc[day] = (acc[day] || 0) + 1;
      return acc;
    }, {});

    return days.map(day => ({ name: day, value: grouped[day] || 0 }));
  },

  async processSystemIncomes() {
    // This is a manual trigger for testing all income protocols
    try {
      console.log('Starting Manual System Income Sync...');
      
      // 1. Process Daily Payouts (Capping Reset, Binary Matching, Rank Check)
      await this.processDailyPayouts();
      
      // 2. Process Rank & Rewards (Weekly Bonus)
      await this.processRankAndRewards();
      
      return { success: true, message: 'System Income Protocols Executed Successfully' };
    } catch (error) {
      console.error('Error in manual income sync:', error);
      throw error;
    }
  },

  async addFunds(uid: string, amount: number) {
    const profile = await this.getUserProfile(uid);
    if (!profile) throw new Error('User not found');

    const updatedWallets = { ...MOCK_USER.wallets, ...profile.wallets };
    updatedWallets.master.balance += amount;

    const { error } = await supabase
      .from('profiles')
      .update({ wallets: updatedWallets })
      .eq('id', uid);

    if (error) throw error;

    // Log transaction
    await supabase.from('payments').insert([{
      uid,
      amount,
      type: 'admin_credit',
      status: 'completed',
      method: 'INTERNAL',
      created_at: new Date().toISOString()
    }]);

    return true;
  },

  async updateUser(uid: string, data: any) {
    const { error } = await supabase
      .from('profiles')
      .update(data)
      .eq('id', uid);
    if (error) throw error;
    return true;
  },

  async updateUserStatus(uid: string, status: 'active' | 'pending' | 'blocked') {
    const { error } = await supabase
      .from('profiles')
      .update({ status })
      .eq('id', uid);
    if (error) throw error;
    return true;
  },

  async deleteUser(uid: string) {
    // 1. Delete profile
    const { error: profileError } = await supabase
      .from('profiles')
      .delete()
      .eq('id', uid);
    if (profileError) throw profileError;

    // 2. Delete payments
    await supabase.from('payments').delete().eq('uid', uid);
    
    // 3. Delete team nodes
    await supabase.from('team_collection').delete().eq('uid', uid);

    return true;
  },

  // Notifications
  async getNotifications(uid: string) {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('uid', uid)
      .order('created_at', { ascending: false })
      .limit(20);
    
    if (error) {
      console.warn('Notifications table might not exist yet:', error);
      return [];
    }
    return data;
  },

  async addNotification(uid: string, title: string, message: string, type: 'alert' | 'update' | 'reward' = 'update') {
    const { error } = await supabase
      .from('notifications')
      .insert([{
        uid,
        title,
        message,
        type,
        is_new: true,
        created_at: new Date().toISOString()
      }]);
    
    if (error) {
      console.warn('Failed to add notification (table might not exist):', error);
    }
  },

  async markNotificationsAsRead(uid: string) {
    const { error } = await supabase
      .from('notifications')
      .update({ is_new: false })
      .eq('uid', uid)
      .eq('is_new', true);
    
    if (error) {
      console.warn('Failed to mark notifications as read:', error);
    }
  },

  onNotificationsChange(uid: string, callback: (payload: any) => void) {
    return supabase
      .channel(`notifications-${uid}`)
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'notifications',
        filter: `uid=eq.${uid}`
      }, callback)
      .subscribe();
  }
};
