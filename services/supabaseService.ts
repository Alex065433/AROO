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
      // Check if it's a UUID or an operator ID
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(additionalData.parentId);
      let query = supabase.from('profiles').select('id, operator_id');
      
      if (isUuid) {
        query = query.or(`id.eq.${additionalData.parentId},operator_id.eq.${additionalData.parentId}`);
      } else {
        query = query.eq('operator_id', additionalData.parentId);
      }
      
      const { data: explicitParent } = await query.single();
      
      if (explicitParent) {
        // Even with explicit parent, find the next available spot on that side
        // to prevent duplicate side assignments
        try {
          const binaryResult = await this.findBinaryParent(explicitParent.id, side);
          parentId = binaryResult.parentId;
          finalSide = binaryResult.side;
        } catch (err) {
          console.warn('Binary parent search failed for explicit parent, defaulting to explicit parent:', err);
          parentId = explicitParent.id;
          finalSide = side;
        }
      } else {
        // Fallback to spillover from sponsor if explicit parent not found
        try {
          const binaryResult = await this.findBinaryParent(sponsor.id, side);
          parentId = binaryResult.parentId;
          finalSide = binaryResult.side;
        } catch (err) {
          console.warn('Binary parent search failed, defaulting to sponsor:', err);
        }
      }
    } else {
      // Standard spillover logic from sponsor
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
        sponsor_id: profileData.sponsor_id,
        parent_id: profileData.parent_id,
        side: profileData.side,
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
  async activatePackage(uid: string, amount: number, options: { adminId?: string, isFree?: boolean } = {}) {
    const { adminId, isFree } = options;

    // 1. Handle payment deduction unless it's free
    if (!isFree) {
      if (adminId) {
        const adminProfile = await this.getUserProfile(adminId);
        if (!adminProfile) throw new Error('Admin not found');
        
        if ((adminProfile.wallets?.master?.balance || 0) < amount) {
          throw new Error('Insufficient admin funds');
        }

        // Deduct from admin wallet
        const updatedWallets = {
          ...adminProfile.wallets,
          master: {
            ...adminProfile.wallets?.master,
            balance: (adminProfile.wallets?.master?.balance || 0) - amount
          }
        };

        await supabase
          .from('profiles')
          .update({ wallets: updatedWallets })
          .eq('id', adminId);

        // Log admin deduction
        await supabase.from('payments').insert([{
          uid: adminId,
          amount: -amount,
          type: 'admin_fund_usage',
          status: 'finished',
          method: 'INTERNAL',
          created_at: new Date().toISOString()
        }]);
      } else {
        // Deduct from user's own master wallet
        const profile = await this.getUserProfile(uid);
        if (!profile) throw new Error('User not found');
        if ((profile.wallets?.master?.balance || 0) < amount) {
          throw new Error('Insufficient funds');
        }

        // Deduct from wallet
        const updatedWallets = {
          ...profile.wallets,
          master: {
            ...profile.wallets?.master,
            balance: (profile.wallets?.master?.balance || 0) - amount
          }
        };

        await supabase
          .from('profiles')
          .update({ wallets: updatedWallets })
          .eq('id', uid);
      }
    }

    // 2. Log the activation for the user (this will trigger all MLM logic in DB)
    const { error } = await supabase.from('payments').insert([{
      uid,
      amount,
      type: 'package_activation',
      status: 'finished',
      method: 'INTERNAL',
      order_description: 'INCENTIVE POOL ACCRUAL',
      created_at: new Date().toISOString()
    }]);

    if (error) throw error;

    // 3. Update user status and active package
    await supabase
      .from('profiles')
      .update({
        status: 'active',
        active_package: amount
      })
      .eq('id', uid);

    // 4. Add Notification
    const pkg = PACKAGES.find(p => p.price === amount);
    await this.addNotification(uid, 'Package Activated', `Your ${pkg?.name || 'Package'} has been activated successfully.`, 'reward');
    
    return true;
  },

  async addFunds(uid: string, amount: number) {
    const profile = await this.getUserProfile(uid);
    if (!profile) throw new Error('User not found');

    const currentBalance = profile.wallets?.master?.balance || 0;

    const updatedWallets = {
      ...profile.wallets,
      master: {
        ...profile.wallets?.master,
        balance: currentBalance + amount
      }
    };

    const { error } = await supabase
      .from('profiles')
      .update({ wallets: updatedWallets })
      .eq('id', uid);

    if (error) throw error;

    // Log the deposit/fund addition
    await supabase.from('payments').insert([{
      uid,
      amount,
      type: 'deposit',
      status: 'finished',
      method: 'INTERNAL',
      created_at: new Date().toISOString()
    }]);

    return true;
  },

  // Daily and Weekly Payout System
  async processDailyPayouts() {
    const { error } = await supabase.rpc('process_daily_payouts');
    if (error) throw error;
    return true;
  },

  async processBinaryMatching() {
    const { error } = await supabase.rpc('process_daily_payouts');
    if (error) throw error;
    return true;
  },

  async processRankAndRewards() {
    const { error } = await supabase.rpc('process_rank_and_rewards');
    if (error) throw error;
    return true;
  },

  async claimWallet(walletKey: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { error } = await supabase.rpc('claim_wallet', {
      p_user_id: user.id,
      p_wallet_key: walletKey
    });

    if (error) throw error;
    return true;
  },

  async processWeeklyIncome() {
    // Weekly rank bonuses could be handled here or via a cron job
    const { data: users } = await supabase.from('profiles').select('*').gt('rank', 1);
    if (!users) return;

    for (const user of users) {
      const rankData = RANKS.find(r => r.level === user.rank);
      if (rankData && rankData.weeklyEarning > 0) {
        await supabase.from('payments').insert([{
          uid: user.id,
          amount: rankData.weeklyEarning,
          type: 'rank_bonus',
          status: 'finished',
          method: 'INTERNAL',
          created_at: new Date().toISOString()
        }]);
      }
    }
    return true;
  },

  // Team Collection
  async getTeamCollection(uid: string) {
    // Sync node balances first
    await supabase.rpc('update_node_balances');

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
      totalCollected += parseFloat(node.balance || 0);
      
      // Reset node balance
      await supabase
        .from('team_collection')
        .update({ balance: 0, updated_at: new Date().toISOString() })
        .eq('node_id', node.node_id);
    }

    if (totalCollected <= 0) return 0;

    // 2. Add to user's master wallet via payment record (trigger will handle wallet update)
    await supabase.from('payments').insert([{
      uid,
      amount: totalCollected,
      type: 'team_collection',
      status: 'finished',
      method: 'INTERNAL',
      created_at: new Date().toISOString(),
      order_description: `Consolidated collection from ${nodeIds.length} nodes`
    }]);

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
  async findBinaryParent(startNodeId: string, side: 'LEFT' | 'RIGHT'): Promise<{ parentId: string, side: 'LEFT' | 'RIGHT' }> {
    let currentParentId = startNodeId;
    
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
      
      const newTeamSize = { 
        left: parent.team_size?.left || 0, 
        right: parent.team_size?.right || 0 
      };
      if (side === 'LEFT') newTeamSize.left += 1;
      else newTeamSize.right += 1;
      
      await supabase
        .from('profiles')
        .update({ team_size: newTeamSize })
        .eq('id', parentId);
        
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
      status: 'finished',
      method: 'INTERNAL',
      created_at: new Date().toISOString()
    }]);
  },

  async getBinaryTree(rootUid: string) {
    // Check if rootUid is a UUID or an operator ID
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rootUid);
    let rootId = rootUid;
    
    if (!isUuid) {
      const { data: rootProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('operator_id', rootUid)
        .single();
      if (rootProfile) rootId = rootProfile.id;
      else return {};
    }
    
    // Fetch the entire downline in one recursive query
    const { data: downline, error } = await supabase.rpc('get_binary_downline', { root_id: rootId });
    
    let finalDownline = downline;
    if (error || !downline || downline.length === 0) {
      // Fallback: fetch at least the root node if RPC fails or returns nothing
      const { data: rootNode } = await supabase.from('profiles').select('*').eq('id', rootId).single();
      if (rootNode) {
        finalDownline = [rootNode];
      } else {
        return {};
      }
    }

    const tree: Record<string, any> = {};
    const rootProfile = finalDownline.find((p: any) => p.id === rootId);
    if (!rootProfile) return {};

    const buildNode = (node: any, path: string) => {
      tree[path] = {
        id: node.operator_id,
        name: node.name,
        rank: node.rank_name || 'Partner',
        status: node.active_package > 0 ? 'Active' : 'Pending',
        joinDate: node.created_at?.split('T')[0],
        totalTeam: (node.team_size?.left || 0) + (node.team_size?.right || 0),
        team_size: node.team_size || { left: 0, right: 0 },
        leftVolume: ((node.matching_volume?.left || 0) * 50).toFixed(2),
        rightVolume: ((node.matching_volume?.right || 0) * 50).toFixed(2),
        parentId: node.parent_id,
        sponsorId: node.sponsor_id,
        email: node.email,
        side: node.side || 'ROOT',
        uid: node.id
      };
    };

    buildNode(rootProfile, 'root');

    // Build the tree structure by matching parent_id and side
    const processChildren = (parentId: string, parentPath: string) => {
      const children = finalDownline.filter((p: any) => p.parent_id === parentId);
      children.forEach((child: any) => {
        if (child.side) {
          const childPath = `${parentPath}-${child.side.toLowerCase()}`;
          buildNode(child, childPath);
          processChildren(child.id, childPath);
        }
      });
    };

    processChildren(rootId, 'root');

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

  // Admin Functions
  async rebuildTreeCounts() {
    const { error } = await supabase.rpc('rebuild_team_sizes');
    if (error) throw error;
    return true;
  },

  async rebuildCumulativeVolume() {
    const { error } = await supabase.rpc('rebuild_cumulative_volume');
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
