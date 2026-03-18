import { supabase } from './supabase';

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
    const ADMIN_ID = "AROWIN_ADMIN_001";
    const ADMIN_SECRET = "CORE_PROTOCOL_777";

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
    // Step 1: get email from operator_id
    const { data, error } = await supabase
      .from("profiles")
      .select("email")
      .eq("operator_id", operatorId)
      .single();

    if (error || !data) {
      throw new Error("Invalid Operator ID");
    }

    // Step 2: login using email
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
    // 1. Create Supabase Auth User
    // NOTE: If this fails with "Database error saving new user", it is almost certainly
    // a failing trigger in your Supabase project (e.g., handle_new_user).
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
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
    const operatorId = `ARW-${Math.floor(100000 + Math.random() * 900000)}`;

    // 2. Find Sponsor and Binary Parent
    const { data: sponsor } = await supabase
      .from('profiles')
      .select('id')
      .eq('operator_id', sponsorId)
      .single();

    if (!sponsor) throw new Error('Invalid Sponsor ID');

    // Find the correct parent in the binary tree (spillover logic)
    let parentId = sponsor.id;
    let finalSide = side;
    
    try {
      const binaryResult = await this.findBinaryParent(sponsor.id, side);
      parentId = binaryResult.parentId;
      finalSide = binaryResult.side;
    } catch (err) {
      console.warn('Binary parent search failed, defaulting to sponsor:', err);
    }

    // 3. Prepare Profile Data
    // We use snake_case for database columns
    const profileData = {
      id: user.id,
      email: user.email,
      operator_id: operatorId,
      name: additionalData.name || email.split('@')[0],
      mobile: additionalData.mobile || '',
      withdrawal_password: additionalData.withdrawalPassword || '',
      two_factor_pin: additionalData.twoFactorPin || '123456',
      sponsor_id: sponsor.id,
      parent_id: parentId,
      side: finalSide,
      rank: 1,
      wallets: {
        master: { balance: 0, currency: 'USDT' },
        referral: { balance: 0, currency: 'USDT' },
        matching: { balance: 0, currency: 'USDT' },
        rankBonus: { balance: 0, currency: 'USDT' },
        rewards: { balance: 0, currency: 'USDT' },
      },
      team_size: { left: 0, right: 0 },
      matched_pairs: 0,
      role: email === 'kethankumar130@gmail.com' ? 'admin' : 'user',
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
  async activatePackage(uid: string, amount: number) {
    // 1. Log the activation
    const { error } = await supabase.from('payments').insert([{
      uid,
      amount,
      type: 'package_activation',
      status: 'completed',
      method: 'INTERNAL',
      created_at: new Date().toISOString()
    }]);

    if (error) throw error;

    // 2. Generate 3 Team Collection Nodes for the user
    const teamNodes = [];
    for (let i = 1; i <= 3; i++) {
      teamNodes.push({
        uid,
        node_id: `NODE-${Math.floor(100000 + Math.random() * 900000)}`,
        name: `Node ${i} (Package ${amount})`,
        balance: 0,
        eligible: true,
        created_at: new Date().toISOString()
      });
    }
    
    await supabase.from('team_collection').insert(teamNodes);

    // 3. Update Profile Active Package
    await supabase
      .from('profiles')
      .update({ active_package: amount })
      .eq('id', uid);

    // 4. Process MLM Income
    await this.processIncome(uid, amount);
    
    // 5. Update Rank
    await this.checkAndUpdateRank(uid);
    
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
      const updatedWallets = { ...profile.wallets };
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
    
    // Find the highest rank the user qualifies for
    // RANKS are defined in constants.tsx, but we'll use a local copy or logic here
    // Based on constants.tsx:
    const rankRequirements = [
      { level: 1, required: 1 },
      { level: 2, required: 3 },
      { level: 3, required: 7 },
      { level: 4, required: 15 },
      { level: 5, required: 31 },
      { level: 6, required: 100 },
      { level: 7, required: 250 },
      { level: 8, required: 500 },
      { level: 9, required: 1000 },
      { level: 10, required: 2500 },
      { level: 11, required: 5000 },
      { level: 12, required: 10000 },
    ];

    let newRank = 1;
    for (const req of rankRequirements) {
      if (leftCount >= req.required && rightCount >= req.required) {
        newRank = req.level;
      } else {
        break;
      }
    }

    if (newRank > (profile.rank || 1)) {
      await supabase
        .from('profiles')
        .update({ rank: newRank })
        .eq('id', uid);
      
      console.log(`User ${uid} promoted to Rank ${newRank}`);
    }
  },

  // Payments
  async getPayments(uid: string) {
    let query = supabase.from('payments').select('*');
    
    if (uid !== 'all') {
      query = query.eq('uid', uid);
    }
    
    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;
    return data;
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

    // 1. Referral Bonus (10% to direct sponsor)
    if (profile.sponsor_id) {
      const referralBonus = amount * 0.10;
      const sponsor = await this.getUserProfile(profile.sponsor_id);
      if (sponsor) {
        const updatedWallets = { ...sponsor.wallets };
        updatedWallets.referral.balance += referralBonus;
        updatedWallets.master.balance += referralBonus;
        await this.createUserProfile(sponsor.id, { wallets: updatedWallets });
        
        // Log transaction
        await supabase.from('payments').insert([{
          uid: sponsor.id,
          amount: referralBonus,
          type: 'referral_bonus',
          status: 'completed',
          method: 'INTERNAL',
          created_at: new Date().toISOString()
        }]);
      }
    }

    // 2. Binary Matching Bonus (10% of matching volume for all ancestors)
    // This is complex and usually handled by a daily cron, but we'll do a simplified version here
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

      // Update parent's volume (we'll use master wallet balance as a proxy for volume for now)
      // In a real app, you'd have separate volume fields
      const matchingBonus = amount * 0.10; // 10% matching
      
      // Simplified: If both sides have volume, pay matching
      // This is a placeholder for real binary logic
      console.log(`Processing matching for ancestor ${parentId} on side ${side}`);
      
      currentId = parentId;
    }
  },

  async getBinaryTree(rootUid: string) {
    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('*');
    
    if (error) throw error;

    const rootProfile = profiles.find(p => p.id === rootUid || p.operator_id === rootUid);
    if (!rootProfile) return {};

    const tree: Record<string, any> = {
      'root': {
        id: rootProfile.operator_id,
        name: rootProfile.name,
        rank: rootProfile.rank_name || 'Partner',
        status: 'Active',
        joinDate: rootProfile.created_at?.split('T')[0],
        totalTeam: (rootProfile.team_size?.left || 0) + (rootProfile.team_size?.right || 0),
        leftVolume: rootProfile.wallets?.master?.balance?.toFixed(2) || '0.00',
        rightVolume: '0.00',
        parentId: null,
        side: 'ROOT',
        uid: rootProfile.id
      }
    };

    // Find children
    const children = profiles.filter(p => p.parent_id === rootProfile.id);
    children.forEach(child => {
      const nodeId = child.side === 'LEFT' ? 'l1' : 'r1';
      tree[nodeId] = {
        id: child.operator_id,
        name: child.name,
        rank: child.rank_name || 'Partner',
        status: 'Active',
        joinDate: child.created_at?.split('T')[0],
        totalTeam: (child.team_size?.left || 0) + (child.team_size?.right || 0),
        leftVolume: child.wallets?.master?.balance?.toFixed(2) || '0.00',
        rightVolume: '0.00',
        parentId: 'root',
        side: child.side,
        uid: child.id
      };
    });

    return tree;
  },

  async findUserByOperatorId(operatorId: string) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('operator_id', operatorId)
      .single();
    if (error) return null;
    return data;
  },

  async updatePassword(newPassword: string) {
    const { error } = await supabase.auth.updateUser({
      password: newPassword
    });
    if (error) throw error;
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
    if (message.includes('Invalid Operator ID')) return 'Invalid Operator ID. Please check and try again.';
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
      .select('id, wallets, active_package');
    
    if (usersError) throw usersError;

    const { data: payments, error: paymentsError } = await supabase
      .from('payments')
      .select('amount, type, status');

    if (paymentsError) throw paymentsError;

    const totalUsers = users?.length || 0;
    const activeUsers = users?.filter(u => u.active_package > 0).length || 0;
    const totalDeposits = payments?.filter(p => p.type === 'deposit' && p.status === 'completed')
      .reduce((sum, p) => sum + p.amount, 0) || 0;
    const totalWithdrawals = payments?.filter(p => p.type === 'withdrawal' && p.status === 'completed')
      .reduce((sum, p) => sum + p.amount, 0) || 0;
    
    return {
      totalUsers,
      activeUsers,
      blockedUsers: 0,
      totalDeposits,
      totalWithdrawals,
      platformRevenue: totalDeposits * 0.05 // Mock 5% fee revenue
    };
  },

  async addFunds(uid: string, amount: number) {
    const profile = await this.getUserProfile(uid);
    if (!profile) throw new Error('User not found');

    const updatedWallets = { ...profile.wallets };
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
  }
};
