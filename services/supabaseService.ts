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
  // Helper to check if a string is a valid UUID
  isUuid(str: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
  },

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
        .limit(1)
        .maybeSingle();
      
      if (adminProfile) {
        localStorage.setItem('arowin_supabase_user', JSON.stringify({ ...adminProfile, role: 'admin' }));
        return { ...adminProfile, role: 'admin' };
      }
      
      // Fallback if profile not found
      const fallbackAdmin = {
        id: '00000000-0000-0000-0000-000000000000',
        email: 'kethankumar130@gmail.com',
        name: 'System Administrator',
        role: 'admin',
        operator_id: ADMIN_ID
      };
      localStorage.setItem('arowin_supabase_user', JSON.stringify(fallbackAdmin));
      return fallbackAdmin;
    }

    // Try regular login but check for admin role
    try {
      const profile = await this.login(adminId, secretKey);
      if (profile && (profile.role === 'admin' || profile.email === 'kethankumar130@gmail.com')) {
        const adminProfile = { ...profile, role: 'admin' };
        localStorage.setItem('arowin_supabase_user', JSON.stringify(adminProfile));
        return adminProfile;
      }
      // If not an admin, we still throw the admin error below
    } catch (e) {
      // Ignore regular login errors and throw the admin one
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
    
    // Removed admin approval check as per user request
    // if (data.status === 'pending' && data.role !== 'admin') {
    //   throw new Error("Your account is pending activation by the administrator. Please wait for approval.");
    // }

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
    const isSponsorUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanSponsorId);
    
    let sponsorQuery = supabase.from('profiles').select('id');
    
    if (isSponsorUuid) {
      sponsorQuery = sponsorQuery.eq('id', cleanSponsorId);
    } else {
      if (/^\d{6}$/.test(cleanSponsorId)) {
        cleanSponsorId = `ARW-${cleanSponsorId}`;
      }
      if (/^ARW\d{6}$/i.test(cleanSponsorId)) {
        cleanSponsorId = `ARW-${cleanSponsorId.substring(3).toUpperCase()}`;
      }
      sponsorQuery = sponsorQuery.ilike('operator_id', cleanSponsorId);
    }

    const { data: sponsor, error: sponsorError } = await sponsorQuery.single();

    if (sponsorError || !sponsor) {
      // Check if this is the first user (bootstrap)
      const { count } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true });
      
      if (count !== 0) {
        throw new Error('Invalid Sponsor ID');
      }
      
      // If it's the first user, they can be their own sponsor or have no sponsor
    }

    // Find the correct parent in the binary tree
    let parentId = sponsor?.id || null;
    let finalSide = side;
    
    // If an explicit parent is provided in additionalData, use it
    if (additionalData.parentId && sponsor) {
      // Verify parent exists
      // Check if it's a UUID or an operator ID
        // Check if parentId is a valid UUID to avoid type mismatch error (uuid = text)
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
      } else if (sponsor) {
        // Fallback to spillover from sponsor if explicit parent not found
        try {
          const binaryResult = await this.findBinaryParent(sponsor.id, side);
          parentId = binaryResult.parentId;
          finalSide = binaryResult.side;
        } catch (err) {
          console.warn('Binary parent search failed, defaulting to sponsor:', err);
        }
      }
    } else if (sponsor) {
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
      sponsor_id: sponsor?.id || null,
      parent_id: parentId,
      side: finalSide,
      rank: 1,
      package_amount: 50, // Default joining package
      total_income: 0,
      wallets: {
        master: { balance: 0, currency: 'USDT' },
        referral: { balance: 0, currency: 'USDT' },
        matching: { balance: 0, currency: 'USDT' },
        yield: { balance: 0, currency: 'USDT' },
        rankBonus: { balance: 0, currency: 'USDT' },
        incentive: { balance: 0, currency: 'USDT' },
        rewards: { balance: 0, currency: 'USDT' },
      },
      team_size: { left: 0, right: 0 },
      matching_volume: { left: 0, right: 0 },
      matched_pairs: 0,
      role: email === 'kethankumar130@gmail.com' ? 'admin' : 'user',
      status: 'active', // Default to active as per user request
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
        status: 'active',
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

    // Update binary counts up the tree
    try {
      await supabase.rpc('update_binary_count', { p_user_id: user.id });
    } catch (err) {
      console.warn('Failed to update binary counts:', err);
    }

    // Send Welcome Email
    try {
      await this.sendWelcomeEmail(email, profileData.name);
    } catch (err) {
      console.warn('Failed to send welcome email:', err);
    }

    return { ...profileData, uid: user.id };
  },

  async sendWelcomeEmail(email: string, name: string) {
    const functionUrl = 'https://jhlxehnwnlzftoylancq.supabase.co/functions/v1/send-email';
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    try {
      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseAnonKey}`
        },
        body: JSON.stringify({
          email: email,
          subject: "Welcome Message",
          html: `Welcome ${name}`
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Email function error:', errorData);
        throw new Error(errorData.message || 'Failed to send email');
      }

      return await response.json();
    } catch (error) {
      console.error('Error calling send-email function:', error);
      throw error;
    }
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

  subscribeToProfile(uid: string, callback: (profile: any) => void) {
    const channel = supabase
      .channel(`profile:${uid}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${uid}`,
        },
        (payload) => {
          console.log('Profile updated in real-time:', payload.new);
          callback(payload.new);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
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

  async getUserProfile(uid: string, columns: string = '*') {
    let queryColumns = columns;
    if (columns !== '*' && !columns.includes('left_count')) {
      queryColumns += ', left_count, right_count';
    }

    const { data, error } = await supabase
      .from('profiles')
      .select(queryColumns)
      .eq('id', uid)
      .single();
    if (error) return null;
    
    const profile = data as any;
    // Force admin role for the owner
    if (profile.email === 'kethankumar130@gmail.com') {
      profile.role = 'admin';
    }
    
    // Map column-based counts to team_size for frontend compatibility
    if (profile.left_count !== undefined && profile.right_count !== undefined) {
      profile.team_size = {
        left: Number(profile.left_count) || 0,
        right: Number(profile.right_count) || 0
      };
    }
    
    return profile;
  },

  // Package Activation
  /**
   * Activates a package for a user by calling the Supabase RPC directly.
   * This bypasses frontend balance checks and relies on the backend as the source of truth.
   */
  async activatePackage(uid: string, amount: number, options: { isFree?: boolean } = {}) {
    const { isFree } = options;
    const finalAmount = isFree ? 0 : amount;

    try {
      // 1. Get user profile
      const userProfile = await this.getUserProfile(uid);
      if (!userProfile) throw new Error("User not found");

      // 2. Check and deduct balance if not free
      const isAdmin = userProfile.email === 'kethankumar130@gmail.com' || userProfile.role === 'admin';
      const shouldSkipBalanceCheck = isFree || isAdmin;

      if (finalAmount > 0 && !shouldSkipBalanceCheck) {
        // Check all possible balance sources
        const masterBalance = Number(userProfile.wallet_balance ?? userProfile.deposit_wallet ?? (userProfile.wallets?.master?.balance || 0));
        
        if (masterBalance < finalAmount) {
          throw new Error(`Insufficient balance. Required: ${finalAmount} USDT, Available: ${masterBalance} USDT`);
        }

        // Deduct balance from all sources to keep them in sync
        const newWallets = { ...userProfile.wallets };
        if (newWallets.master) {
          newWallets.master.balance = Math.max(0, Number(newWallets.master.balance || 0) - finalAmount);
        }

        const updateData: any = { 
          wallets: newWallets,
          wallet_balance: Math.max(0, Number(userProfile.wallet_balance || 0) - finalAmount)
        };
        
        if (userProfile.deposit_wallet !== undefined) {
          updateData.deposit_wallet = Math.max(0, Number(userProfile.deposit_wallet || 0) - finalAmount);
        }

        const { error: updateError } = await supabase
          .from('profiles')
          .update(updateData)
          .eq('id', uid);
        
        if (updateError) throw updateError;
      }

      // 3. Update active_package and total_deposit
      const { error: packageError } = await supabase
        .from('profiles')
        .update({ 
          active_package: amount, 
          total_deposit: (Number(userProfile.total_deposit) || 0) + amount,
          status: 'active'
        })
        .eq('id', uid);

      if (packageError) throw packageError;

      // 4. Create Team Collection Nodes if package has nodes
      const packageData = PACKAGES.find(p => p.price === amount);
      if (packageData) {
        // Internal Referral Bonus (5% of all sub-IDs)
        const internalReferralBonus = ((packageData.nodes - 1) * 50) * 0.05;
        if (internalReferralBonus > 0) {
          await this.addIncome(uid, internalReferralBonus, 'referral_bonus');
        }

        // Internal Matching Bonus (based on internal tree structure)
        const internalMatchingBonusMap: Record<number, number> = {
          50: 0,
          150: 5,
          350: 15,
          750: 85,
          1550: 245,
          3150: 645,
          6350: 1540,
          12750: 3080
        };
        const internalMatchingBonus = internalMatchingBonusMap[amount] || 0;
        if (internalMatchingBonus > 0) {
          await this.addIncome(uid, internalMatchingBonus, 'matching_bonus');
        }

        // Update user's own business counts for their internal tree (for rank qualification)
        // Formula: (nodes - 1) / 2 gives the units on each side
        // Starter (3 nodes) -> 1 unit left, 1 unit right (Qualifies for Starter rank)
        // Bronze (7 nodes) -> 3 units left, 3 units right (Qualifies for Bronze rank)
        const internalCount = (packageData.nodes - 1) / 2;
        if (internalCount > 0) {
          await supabase.from('profiles').update({
            left_count: internalCount,
            right_count: internalCount,
            team_size: { left: internalCount, right: internalCount }
          }).eq('id', uid);
        }

        // Create IDs in Team Collection
        // According to the image, "NO. OF IDS" is packageData.nodes
        const numIds = packageData.nodes;
        if (numIds > 0) {
          const nodesToCreate = [];
          const numRankNodes = (numIds + 1) / 2;
          const timestamp = Date.now().toString().slice(-6);
          
          for (let i = 0; i < numIds; i++) {
            // Only the first numRankNodes are "Rank Nodes"
            nodesToCreate.push({
              uid: uid,
              node_id: `${userProfile.operator_id}-ID${timestamp}-${i + 1}`,
              name: `${userProfile.name} Node ${i + 1}`,
              balance: 0,
              eligible: i < numRankNodes, // First N nodes are rank nodes
              created_at: new Date().toISOString(),
              type: 'mining'
            });
          }
          
          const { error: nodeError } = await supabase.from('team_collection').insert(nodesToCreate);
          if (nodeError) console.error('Failed to create team nodes:', nodeError);
        }
      }

      // 5. Referral Bonus (5% of total package price to sponsor)
      if (userProfile.sponsor_id && amount > 0) {
        const referralBonus = amount * 0.05;
        await this.addIncome(userProfile.sponsor_id, referralBonus, 'referral_bonus');
      }

      // 5. Update Team Business & Team Size up the tree
      const pkg = PACKAGES.find(p => p.price === amount);
      // Rank Units logic:
      // Activation (1 node) -> 1 unit
      // Starter (3 nodes) -> 1 unit (User said "3 starters for Bronze", so 1 Starter pkg = 1 unit)
      // Bronze (7 nodes) -> 3 units (1 Bronze pkg = 3 units = Bronze rank)
      // Silver (15 nodes) -> 7 units (1 Silver pkg = 7 units = Silver rank)
      const rankUnitsToAdd = pkg ? Math.max(1, (pkg.nodes - 1) / 2) : 1;

      let currentId = uid;
      while (true) {
        const { data: currentProfile, error } = await supabase
          .from('profiles')
          .select('parent_id, side')
          .eq('id', currentId)
          .single();
        
        if (error || !currentProfile || !currentProfile.parent_id) break;

        const parentId = currentProfile.parent_id;
        const side = currentProfile.side;

        const { data: parentProfile } = await supabase
          .from('profiles')
          .select('left_business, right_business, left_count, right_count, team_size')
          .eq('id', parentId)
          .single();

        if (parentProfile) {
          const updateData: any = {};
          const newTeamSize = { 
            left: Number(parentProfile.left_count ?? parentProfile.team_size?.left ?? 0),
            right: Number(parentProfile.right_count ?? parentProfile.team_size?.right ?? 0)
          };

          if (side === 'LEFT') {
            updateData.left_business = (Number(parentProfile.left_business) || 0) + amount;
            updateData.left_count = (Number(parentProfile.left_count) || 0) + rankUnitsToAdd;
            newTeamSize.left += rankUnitsToAdd;
          } else if (side === 'RIGHT') {
            updateData.right_business = (Number(parentProfile.right_business) || 0) + amount;
            updateData.right_count = (Number(parentProfile.right_count) || 0) + rankUnitsToAdd;
            newTeamSize.right += rankUnitsToAdd;
          }
          
          updateData.team_size = newTeamSize;

          await supabase
            .from('profiles')
            .update(updateData)
            .eq('id', parentId);
          
          // Check for rank update for parent
          await this.checkAndUpdateRank(parentId);
        }

        currentId = parentId;
      }

      // 6. Log activation payment
      await supabase.from('payments').insert({
        uid: uid,
        amount: finalAmount,
        type: 'package_activation',
        method: isFree ? 'FREE' : 'WALLET',
        description: `Package Activation: $${amount}${isFree ? ' (FREE)' : ''}`,
        status: 'finished',
        currency: 'usdtbsc'
      });

      // Final rank check for the user themselves
      await this.checkAndUpdateRank(uid);

      return { success: true };
    } catch (error: any) {
      console.error('Error in activatePackage:', error);
      throw error;
    }
  },

  async addFunds(uid: string, amount: number) {
    try {
      const response = await fetch('/api/admin/add-funds', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ uid, amount }),
      });

      let result;
      const responseText = await response.text();
      try {
        result = JSON.parse(responseText);
      } catch (e) {
        throw new Error(`Server returned an invalid response: ${responseText.substring(0, 100)}...`);
      }

      if (!response.ok) throw new Error(result.error || 'Failed to add funds');
      
      return true;
    } catch (error) {
      console.error('Error in addFunds:', error);
      throw error;
    }
  },

  // Daily and Weekly Payout System
  async processDailyPayouts() {
    try {
      // 1. Fetch all users with business volume
      const { data: users, error } = await supabase
        .from('profiles')
        .select('*')
        .or('left_business.gt.0,right_business.gt.0');

      if (error) throw error;

      for (const user of users) {
        const leftBusiness = Number(user.left_business) || 0;
        const rightBusiness = Number(user.right_business) || 0;

        // Calculate matching volume (minimum of left and right)
        const matchedVolume = Math.min(leftBusiness, rightBusiness);

        if (matchedVolume > 0) {
          // Calculate 10% matching bonus
          const matchingBonus = matchedVolume * 0.10;

          // Deduct matched volume from both sides
          const newLeftBusiness = leftBusiness - matchedVolume;
          const newRightBusiness = rightBusiness - matchedVolume;

          // Update business volume first
          await supabase
            .from('profiles')
            .update({
              left_business: newLeftBusiness,
              right_business: newRightBusiness
            })
            .eq('id', user.id);

          // Add income via addIncome (handles capping and logging)
          await this.addIncome(user.id, matchingBonus, 'matching_bonus');
        }

        // Always check rank for active users
        if (user.active_package > 0) {
          await this.checkAndUpdateRank(user.id);
        }
      }

      return { success: true };
    } catch (error: any) {
      console.error('Error in processDailyPayouts:', error);
      throw error;
    }
  },

  async processBinaryMatching() {
    return await this.processDailyPayouts();
  },

  async processRankAndRewards() {
    try {
      const { data: users, error } = await supabase
        .from('profiles')
        .select('id')
        .gt('active_package', 0);

      if (error) throw error;

      for (const user of users) {
        await this.checkAndUpdateRank(user.id);
      }
      return true;
    } catch (error: any) {
      console.error('Error in processRankAndRewards:', error);
      throw error;
    }
  },

  async claimWallet(walletKey: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase.rpc('claim_wallet', {
      p_user_id: user.id,
      p_wallet_key: walletKey
    });

    if (error) throw error;
    if (data && !data.success) {
      throw new Error(data.message || 'Failed to claim wallet');
    }
    return data;
  },

  async processWeeklyIncome() {
    // Weekly rank bonuses could be handled here or via a cron job
    const { data: users } = await supabase.from('profiles').select('*').gt('rank', 1);
    if (!users) return;

    for (const user of users) {
      const rankData = RANKS.find(r => r.level === user.rank);
      if (rankData && rankData.weeklyEarning > 0) {
        await this.addIncome(user.id, rankData.weeklyEarning, 'rank_bonus');
      }
    }
    return true;
  },

  // Team Collection
  async getTeamCollection(uid: string) {
    try {
      // 1. Fetch user profile to get package info
      const profile = await this.getUserProfile(uid);
      if (!profile || !profile.active_package) return [];

      const packageData = PACKAGES.find(p => p.price === profile.active_package);
      if (!packageData) return [];

      // 2. Fetch nodes
      const { data: nodes, error } = await supabase
        .from('team_collection')
        .select('*')
        .eq('uid', uid);

      if (error || !nodes || nodes.length === 0) return [];

      // Calculate earning per node per second
      const totalWeeklyEarning = packageData.weeklyEarning;
      if (totalWeeklyEarning <= 0) return nodes;

      const earningPerNodePerWeek = totalWeeklyEarning / nodes.length;
      const earningPerNodePerSecond = earningPerNodePerWeek / (7 * 24 * 60 * 60);

      const now = new Date();
      const updatedNodes = nodes.map(node => {
        if (!node.eligible) return node;

        const lastUpdate = new Date(node.created_at);
        const secondsElapsed = Math.max(0, (now.getTime() - lastUpdate.getTime()) / 1000);
        
        const accruedBalance = secondsElapsed * earningPerNodePerSecond;
        const newBalance = (Number(node.balance) || 0) + accruedBalance;

        return {
          ...node,
          balance: newBalance
        };
      });

      return updatedNodes;
    } catch (err) {
      console.error('Error in getTeamCollection:', err);
      return [];
    }
  },

  async collectFromNodes(uid: string, nodeIds: string[]) {
    try {
      // 1. Fetch nodes and user profile
      const [profile, { data: nodes }] = await Promise.all([
        this.getUserProfile(uid),
        supabase.from('team_collection').select('*').in('node_id', nodeIds).eq('uid', uid)
      ]);

      if (!profile || !nodes || nodes.length === 0) return 0;

      const packageData = PACKAGES.find(p => p.price === profile.active_package);
      if (!packageData) return 0;

      const totalWeeklyEarning = packageData.weeklyEarning;
      const earningPerNodePerWeek = totalWeeklyEarning / nodes.length; // This should be based on total nodes user has, not just selected ones
      // Wait, nodes.length here is only the selected ones. We need the total count of nodes for the user.
      const { count: totalNodesCount } = await supabase
        .from('team_collection')
        .select('*', { count: 'exact', head: true })
        .eq('uid', uid);
      
      const actualTotalNodes = totalNodesCount || nodes.length;
      const earningPerNodePerSecond = (totalWeeklyEarning / actualTotalNodes) / (7 * 24 * 60 * 60);

      let totalCollected = 0;
      const now = new Date();

      for (const node of nodes) {
        let nodeBalance = Number(node.balance) || 0;
        
        if (node.eligible) {
          const lastUpdate = new Date(node.created_at);
          const secondsElapsed = Math.max(0, (now.getTime() - lastUpdate.getTime()) / 1000);
          nodeBalance += secondsElapsed * earningPerNodePerSecond;
        }

        totalCollected += nodeBalance;
        
        // Reset node balance and update timestamp
        await supabase
          .from('team_collection')
          .update({ balance: 0, created_at: now.toISOString() })
          .eq('node_id', node.node_id);
      }

      if (totalCollected <= 0) return 0;

      // 2. Add to user's master wallet via addIncome
      await this.addIncome(uid, totalCollected, 'team_collection');

      return totalCollected;
    } catch (err) {
      console.error('Error in collectFromNodes:', err);
      throw err;
    }
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
          await this.addIncome(uid, rankData.reward, 'rank_reward');
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

  async updatePaymentStatus(paymentId: string, status: string) {
    try {
      // Fetch the payment first to check if it's a withdrawal and if we need to refund
      const { data: payment, error: fetchError } = await supabase
        .from('payments')
        .select('*')
        .eq('id', paymentId)
        .single();
      
      if (fetchError) throw fetchError;

      const { data, error } = await supabase
        .from('payments')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', paymentId)
        .select()
        .single();

      if (error) throw error;

      // If a withdrawal is rejected, refund the user
      if (payment.type === 'withdrawal' && status === 'rejected') {
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('wallet_balance, wallets')
          .eq('id', payment.uid)
          .single();
        
        if (!profileError && profile) {
          const newWallets = { ...profile.wallets };
          newWallets.master = newWallets.master || { balance: 0, currency: 'USDT' };
          newWallets.master.balance += payment.amount;

          await supabase
            .from('profiles')
            .update({ 
              wallet_balance: (Number(profile.wallet_balance) || 0) + payment.amount,
              wallets: newWallets
            })
            .eq('id', payment.uid);
        }
      }

      return data;
    } catch (error) {
      console.error('Error updating payment status:', error);
      throw error;
    }
  },

  async createWithdrawal(uid: string, amount: number, address: string) {
    try {
      const profile = await this.getUserProfile(uid);
      if (!profile) throw new Error('User not found');

      const balance = Number(profile.wallet_balance || 0);
      if (balance < amount) {
        throw new Error('Insufficient balance');
      }

      // 1. Deduct balance immediately (to prevent double spending)
      const newWallets = { ...profile.wallets };
      newWallets.master = newWallets.master || { balance: 0, currency: 'USDT' };
      newWallets.master.balance -= amount;

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ 
          wallet_balance: balance - amount,
          wallets: newWallets
        })
        .eq('id', uid);

      if (updateError) throw updateError;

      // 2. Create a pending withdrawal record
      const numericAmount = Number(amount);
      if (isNaN(numericAmount) || numericAmount <= 0) {
        throw new Error('Invalid withdrawal amount');
      }

      const { data, error } = await supabase
        .from('payments')
        .insert({
          uid,
          amount: numericAmount,
          type: 'withdrawal',
          status: 'pending',
          method: 'USDT (BEP20)',
          order_description: `Withdrawal to ${address.substring(0, 6)}...${address.substring(address.length - 4)}`,
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) {
        // Refund if insertion fails
        await supabase
          .from('profiles')
          .update({ 
            wallet_balance: balance,
            wallets: profile.wallets
          })
          .eq('id', uid);
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Error creating withdrawal:', error);
      throw error;
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
    if (type === 'matching_bonus') {
      // Only users with $150 package or higher get matching bonus (Capping starts at $150)
      if ((profile.active_package || 0) < 150) {
        return;
      }

      // Per-transaction capping: Max $5 per matching bonus
      const transactionCapping = 5;
      payableAmount = Math.min(amount, transactionCapping);
      
      // The capped amount goes to the 'capping_box' wallet
      const newWallets = { ...profile.wallets };
      newWallets['capping_box'] = newWallets['capping_box'] || { balance: 0, currency: 'USDT' };
      newWallets['capping_box'].balance += payableAmount;

      await supabase
        .from('profiles')
        .update({ 
          wallets: newWallets,
          total_income: (Number(profile.total_income) || 0) + payableAmount,
          matching_income: (Number(profile.matching_income) || 0) + payableAmount
        })
        .eq('id', uid);
      
      return; // Handled separately for matching bonus
    }
    
    // Update wallet directly
    const newWallets = { ...profile.wallets };
    let walletKey = 'master'; // default
    if (type === 'referral_bonus') walletKey = 'referral';
    else if (type === 'matching_bonus') walletKey = 'matching';
    else if (type === 'rank_bonus') walletKey = 'rankBonus';
    else if (type === 'rank_reward') walletKey = 'rewards';
    else if (type === 'team_collection') walletKey = 'yield'; 
    else if (type === 'incentive_accrual') walletKey = 'incentive';

    newWallets[walletKey] = newWallets[walletKey] || { balance: 0, currency: 'USDT' };
    newWallets[walletKey].balance += payableAmount;

    const updateData: any = {
      wallets: newWallets,
      total_income: (Number(profile.total_income) || 0) + payableAmount
    };

    // Keep specific income columns in sync
    if (walletKey === 'master') {
      updateData.wallet_balance = (Number(profile.wallet_balance) || 0) + payableAmount;
    } else if (walletKey === 'referral') {
      updateData.referral_income = (Number(profile.referral_income) || 0) + payableAmount;
    } else if (walletKey === 'matching') {
      updateData.matching_income = (Number(profile.matching_income) || 0) + payableAmount;
    } else if (walletKey === 'yield') {
      updateData.yield_income = (Number(profile.yield_income) || 0) + payableAmount;
    } else if (walletKey === 'rankBonus') {
      updateData.rank_income = (Number(profile.rank_income) || 0) + payableAmount;
    } else if (walletKey === 'rewards') {
      updateData.incentive_income = (Number(profile.incentive_income) || 0) + payableAmount;
    } else if (walletKey === 'incentive') {
      // If we have an incentive_income column, we could use it, but here rewards maps to incentive_income
      // Let's just update total_income and wallets for now if no specific column
    }

    await supabase
      .from('profiles')
      .update(updateData)
      .eq('id', uid);

    // Log transaction via payments table
    const { error: paymentError } = await supabase.from('payments').insert({
      uid: uid,
      amount: payableAmount,
      type: type,
      method: 'INTERNAL',
      description: `Income: ${type.replace('_', ' ').toUpperCase()}`,
      status: 'finished',
      currency: 'usdtbsc'
    });

    if (paymentError) throw paymentError;
    
    console.log(`Income of ${payableAmount} (${type}) credited to ${uid} directly.`);
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
    
    let finalDownline = downline || [];
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
    
    // Map nodes by parent ID and side for efficient binary tree construction
    const nodesByParent = new Map<string, Record<string, any>>();
    finalDownline.forEach((p: any) => {
      if (p.parent_id) {
        if (!nodesByParent.has(p.parent_id)) {
          nodesByParent.set(p.parent_id, {});
        }
        const parentChildren = nodesByParent.get(p.parent_id)!;
        if (p.side) {
          parentChildren[p.side.toUpperCase()] = p;
        }
      }
    });

    const rootProfile = finalDownline.find((p: any) => p.id === rootId);
    if (!rootProfile) return {};

    const buildNode = (node: any, path: string) => {
      const leftCount = parseInt(node.left_count || node.team_size?.left || '0');
      const rightCount = parseInt(node.right_count || node.team_size?.right || '0');
      
      tree[path] = {
        id: node.operator_id,
        name: node.name || node.operator_id,
        rank: node.rank_name || 'Partner',
        status: node.status === 'active' ? 'Active' : 'Pending',
        joinDate: node.created_at?.split('T')[0] || 'N/A',
        totalTeam: leftCount + rightCount,
        team_size: { left: leftCount, right: rightCount },
        leftBusiness: (Number(node.left_business) || (node.matching_volume?.left || 0) * 50).toFixed(2),
        rightBusiness: (Number(node.right_business) || (node.matching_volume?.right || 0) * 50).toFixed(2),
        parentId: node.parent_id,
        sponsorId: node.sponsor_id,
        email: node.email,
        side: node.side || 'ROOT',
        uid: node.id
      };

      // Recursively process children
      const children = nodesByParent.get(node.id);
      if (children) {
        if (children.LEFT) buildNode(children.LEFT, `${path}-left`);
        if (children.RIGHT) buildNode(children.RIGHT, `${path}-right`);
      }
    };

    buildNode(rootProfile, 'root');

    // Add any "orphaned" nodes that were returned by the RPC but not connected in the tree
    finalDownline.forEach((node: any) => {
      const alreadyInTree = Object.values(tree).some((n: any) => n.uid === node.id);
      if (!alreadyInTree && node.id !== rootId) {
        buildNode(node, `orphan-${node.id}`);
      }
    });

    return tree;
  },

  async rebuildNetwork() {
    const { error } = await supabase.rpc('rebuild_network');
    if (error) throw error;
    return true;
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
        totalTeam: (Number(child.left_count) || child.team_size?.left || 0) + (Number(child.right_count) || child.team_size?.right || 0),
        leftBusiness: (Number(child.left_business) || (child.matching_volume?.left || 0) * 50).toFixed(2) || '0.00',
        rightBusiness: (Number(child.right_business) || (child.matching_volume?.right || 0) * 50).toFixed(2) || '0.00',
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

  async getUserCount() {
    const { count, error } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true });
    
    if (error) throw error;
    return { count: count || 0 };
  },

  async fixSystemWallets() {
    const { error } = await supabase.rpc('fix_system_wallets');
    if (error) throw error;
    return true;
  },

  async findUserByOperatorId(operatorId: string) {
    let cleanId = operatorId.trim();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanId);
    
    if (isUuid) {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', cleanId)
        .single();
      if (!error && data) return data;
    }

    if (/^\d{6}$/.test(cleanId)) {
      cleanId = `ARW-${cleanId}`;
    }
    if (/^ARW\d{6}$/i.test(cleanId)) {
      cleanId = `ARW-${cleanId.substring(3).toUpperCase()}`;
    }
    
    // Try exact match first on operator_id or id (if it's a UUID)
    let query = supabase.from('profiles').select('*');
    if (isUuid) {
      query = query.or(`id.eq.${cleanId},operator_id.eq.${cleanId}`);
    } else {
      query = query.eq('operator_id', cleanId);
    }
    
    let { data, error } = await query.single();

    // Fallback to ilike on operator_id if not found
    if ((error || !data) && !isUuid) {
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

  async getTransactions(uid: string) {
    // 1. Try fetching from transactions table
    const { data: transactions, error: tError } = await supabase
      .from('transactions')
      .select('*')
      .eq('uid', uid)
      .order('created_at', { ascending: false });
    
    // 2. Fetch from payments as well to ensure we have everything
    const { data: payments, error: pError } = await supabase
      .from('payments')
      .select('*')
      .eq('uid', uid)
      .in('type', ['referral_bonus', 'matching_bonus', 'matching_income', 'rank_bonus', 'rank_reward', 'reward_income', 'team_collection', 'incentive_accrual', 'claim', 'withdrawal', 'deposit', 'package_activation'])
      .order('created_at', { ascending: false });

    // 3. Combine and deduplicate if necessary, or just return the most complete set
    // For now, if transactions has data, use it, otherwise use payments
    if (!tError && transactions && transactions.length > 0) {
      return transactions;
    }

    if (!pError && payments) {
      return payments;
    }

    return [];
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
    const { data, error } = await supabase.rpc('admin_create_ticket_rpc', {
      p_uid: uid,
      p_subject: subject,
      p_message: message
    });
    
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

  async processSystemIncomes() {
    // This is a manual trigger for testing all income protocols
    try {
      console.log('Starting Manual System Income Sync...');
      
      // 1. Process Weekly Incentives (ROI) - Placeholder for future logic
      // const { error: weeklyError } = await supabase.rpc('process_weekly_incentives');
      // if (weeklyError) throw weeklyError;

      // 2. Process Daily Payouts (Capping Reset, Binary Matching, Rank Check)
      await this.processDailyPayouts();
      
      // 3. Process Rank & Rewards (Weekly Bonus)
      await this.processRankAndRewards();
      
      return { success: true, message: 'System Income Protocols Executed Successfully' };
    } catch (error) {
      console.error('Error in manual income sync:', error);
      throw error;
    }
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

  async updateUser(uid: string, data: any) {
    if (!this.isUuid(uid)) throw new Error('Invalid User ID format (UUID required)');
    const { error } = await supabase
      .from('profiles')
      .update(data)
      .eq('id', uid);
    if (error) throw error;
    return true;
  },

  async updateUserStatus(uid: string, status: 'active' | 'pending' | 'blocked') {
    if (!this.isUuid(uid)) throw new Error('Invalid User ID format (UUID required)');
    const { error } = await supabase
      .from('profiles')
      .update({ status })
      .eq('id', uid);
    if (error) throw error;
    return true;
  },

  async deleteUser(uid: string) {
    if (!this.isUuid(uid)) throw new Error('Invalid User ID format (UUID required)');
    // 1. Delete profile
    const { error: profileError } = await supabase
      .from('profiles')
      .delete()
      .eq('id', uid);
    if (profileError) throw profileError;

    // 3. Delete payments
    await supabase.from('payments').delete().eq('uid', uid);
    
    // 4. Delete team nodes
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
    const { error } = await supabase.rpc('admin_add_notification_rpc', {
      p_uid: uid,
      p_title: title,
      p_message: message,
      p_type: type
    });
    
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

  async verifyWithdrawalPassword(uid: string, password: string) {
    const { data, error } = await supabase
      .from('profiles')
      .select('withdrawal_password')
      .eq('id', uid)
      .single();
    
    if (error || !data) return false;
    
    const storedPassword = data.withdrawal_password;
    // If password is not set, allow any password for now (or handle as error)
    if (!storedPassword) return true; 
    
    // Use robust comparison (trim and string conversion)
    return String(storedPassword).trim() === String(password).trim();
  },

  onNotificationsChange(uid: string, callback: (payload: any) => void) {
    const channel = supabase
      .channel(`notifications-${uid}`)
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'notifications',
        filter: `uid=eq.${uid}`
      }, callback)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }
};
