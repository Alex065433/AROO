import { supabase } from './supabase';
import { PACKAGES, RANKS, MOCK_USER, RANK_NAMES } from '../constants';
import { apiFetch } from '../src/lib/api';

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

  // Helper for timeout
  async withTimeout<T>(promise: Promise<T>, ms: number = 25000, errorMessage: string = "Request timed out. The database might be waking up."): Promise<T> {
    const timeout = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error(errorMessage)), ms)
    );
    return Promise.race([promise, timeout]);
  },

  // Auth
  async login(identifier: string, secret: string) {
    // Check if Supabase is configured
    const supabaseUrl = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_SUPABASE_URL) || (typeof process !== 'undefined' && process.env ? process.env.VITE_SUPABASE_URL : undefined);
    if (!supabaseUrl || supabaseUrl.includes('placeholder')) {
      throw new Error("Database connection not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in settings.");
    }

    let cleanId = identifier.trim();
    let email = cleanId;

    // Administrative ID Protocol Resolution
    const isAdminId = cleanId.toUpperCase() === 'ARW-ADMIN-01';
    
    if (isAdminId) {
      email = 'admin@arowin.internal';
    }

    // Normalize Operator ID format if it's not an email
    if (!cleanId.includes('@') && !isAdminId) {
      if (/^\d{6}$/.test(cleanId)) {
        cleanId = `ARW-${cleanId}`;
      } else if (/^ARW\d{6}$/i.test(cleanId)) {
        cleanId = `ARW-${cleanId.substring(3).toUpperCase()}`;
      } else if (/^ARW-\d{6}$/i.test(cleanId)) {
        cleanId = `ARW-${cleanId.substring(4).toUpperCase()}`;
      }

      // Resolve email from Operator ID
      try {
        const { data: profile, error } = await this.withTimeout(
          supabase.from("profiles").select("email").ilike("operator_id", cleanId).single(),
          20000,
          "Database is waking up. Please wait a moment and try again."
        );
        
        if (error) {
          // If it's a real error (not just not found), throw it
          if (error.code !== 'PGRST116') throw error; 
          // PGRST116 is "JSON object requested, but no rows were returned"
        }
        
        if (profile) {
          email = profile.email;
          console.log(`Resolved Operator ID ${cleanId} to real email: ${email}`);
        } else {
          // Fallback to internal email format if not found in profiles
          email = `${cleanId.toLowerCase()}@arowin.internal`;
          console.log(`Resolved Operator ID ${cleanId} to internal email: ${email}`);
        }
      } catch (e: any) {
        // If it's a timeout, propagate it
        if (e.message?.includes('waking up') || e.message?.includes('timed out')) {
          throw e;
        }
        // Otherwise fallback to internal format
        email = `${cleanId.toLowerCase()}@arowin.internal`;
        console.log(`Resolved Operator ID ${cleanId} to internal email (fallback): ${email}`);
      }
    }

    // Perform Supabase Auth login
    try {
      console.log(`Attempting login for: ${email}`);
      const { data: authData, error: authError } = await this.withTimeout(
        supabase.auth.signInWithPassword({ email, password: secret })
      );

      if (authError) {
        // Special handling for hardcoded admin to allow access even if Auth is broken
        if (isAdminId && secret === 'INITIALIZE_AROWIN_2026') {
          console.warn('Admin Auth failed, but secret is correct. Using bootstrap session.');
          return {
            user: { id: 'admin-bootstrap-id', email: 'admin@arowin.internal' },
            session: { access_token: 'BOOTSTRAP_ADMIN_TOKEN' }
          } as any;
        }

        // Only log non-credential errors as errors, credential errors are normal user behavior
        if (!authError.message?.toLowerCase().includes('invalid login credentials')) {
          console.error(`Auth error for ${email}:`, authError);
        }
        
        // Fallback: try internal email if real email failed (for legacy/internal accounts)
        // This handles cases where user enters email but Auth uses arw-XXXXXX@arowin.internal
        const isEmailInput = cleanId.includes('@');
        
        if (isEmailInput || !cleanId.includes('@')) {
          let internalEmailsToTry: string[] = [];
          
          if (!isEmailInput) {
            internalEmailsToTry.push(`${cleanId.toLowerCase()}@arowin.internal`);
          } else {
            // It's an email input, find profiles with this email (case-insensitive)
            try {
              const { data: profiles, error: profileError } = await this.withTimeout(
                supabase.from("profiles").select("operator_id").ilike("email", cleanId),
                10000
              );
              
              if (profileError) throw profileError;
              
              if (profiles && profiles.length > 0) {
                if (profiles.length > 1) {
                  // Multiple profiles found for this email, tell user to use Operator ID
                  throw new Error(`Multiple accounts found for ${cleanId}. Please use your Operator ID (e.g. ARW-XXXXXX) to log in.`);
                }
                internalEmailsToTry.push(`${profiles[0].operator_id.toLowerCase()}@arowin.internal`);
              } else {
                // No profile found for this email
                console.warn(`No profile found for email: ${cleanId}`);
                // We don't throw yet, we'll let the original authError handle it or throw a custom one below
              }
            } catch (e: any) {
              if (e.message?.includes('Multiple accounts')) throw e;
              console.error('Error finding profiles for email:', e);
            }
          }

          if (internalEmailsToTry.length === 0 && isEmailInput) {
             throw new Error(`Authentication Failed: No account found for "${cleanId}". Please ensure you have registered.`);
          }

          for (const internalEmail of internalEmailsToTry) {
            console.log(`Retrying with internal email: ${internalEmail}`);
            const { data: retryData, error: retryError } = await this.withTimeout(
              supabase.auth.signInWithPassword({ email: internalEmail, password: secret })
            );
            
            if (!retryError) {
              // Trigger background fetch
              this.getUserProfile(retryData.user.id).catch(console.error);
              return retryData;
            }
            
            if (retryError.message?.toLowerCase().includes('invalid login credentials')) {
              // If it's an email input, we already tried the real email and it failed.
              // If the internal email also fails with invalid credentials, it's a final failure.
              throw new Error(`Authentication Failed: Invalid credentials for identity "${cleanId}". Please check your password.`);
            }
          }
        }
        
        if (authError.message?.toLowerCase().includes('invalid login credentials')) {
          throw new Error(`Authentication Failed: Invalid credentials for ${email}. Please verify your email and password.`);
        }
        throw authError;
      }

      console.log(`Login successful for: ${email}`);
      // Trigger background fetch
      this.getUserProfile(authData.user.id).catch(console.error);
      
      // Return auth data immediately
      return authData;
    } catch (e: any) {
      console.error(`Login catch block for ${email}:`, e);
      
      // If it's already our custom error, just rethrow it
      if (e.message?.includes('Authentication Failed')) {
        throw e;
      }
      
      if (e.message?.toLowerCase().includes('invalid login credentials')) {
        throw new Error(`Authentication Failed: Invalid credentials or system signature for ${email}.`);
      }
      
      // Handle other common Supabase errors
      if (e.message?.includes('Email not confirmed')) {
        throw new Error(`Authentication Failed: Email not confirmed. Please check your inbox.`);
      }
      
      throw e;
    }
  },

  async getUserProfile(userId: string, columns: string = "*", retries: number = 2) {
    let lastError: any;
    
    for (let i = 0; i <= retries; i++) {
      try {
        // Use a longer timeout (60s) to allow for database wake-up
        const { data, error } = await this.withTimeout(
          supabase.from("profiles").select(columns).eq("id", userId).maybeSingle(),
          60000 
        );

        if (error) {
          // If profile doesn't exist in DB but user is authenticated, 
          // check if it's the admin email to allow access
          const { data: { user } } = await supabase.auth.getUser();
          if (user && user.email === 'admin@arowin.internal') {
            return {
              id: userId,
              email: user.email,
              role: 'admin',
              full_name: 'System Administrator',
              status: 'active',
              operator_id: 'ARW-ADMIN-01'
            };
          }
          throw error;
        }
        
        const profile = data as any;
        
        if (profile.status === 'blocked') {
          throw new Error("Your account has been blocked. Please contact system administration.");
        }

        // Force admin role for Administrative Protocol
        if (profile.email === 'admin@arowin.internal') {
          profile.role = 'admin';
        }
        
        // Map column-based counts to team_size for frontend compatibility
        if (profile.left_count !== undefined && profile.right_count !== undefined) {
          profile.team_size = {
            left: Number(profile.left_count) || 0,
            right: Number(profile.right_count) || 0
          };
        }

        // Persist to local storage for fast fallback
        localStorage.setItem('arowin_supabase_user', JSON.stringify(profile));
        return profile;
      } catch (e: any) {
        lastError = e;
        const isTimeout = e.message?.includes('timed out') || e.message?.includes('waking up');
        
        if (isTimeout && i < retries) {
          console.warn(`Profile fetch attempt ${i + 1} timed out, retrying...`);
          // Wait a bit before retrying
          await new Promise(resolve => setTimeout(resolve, 2000));
          continue;
        }
        
        // If it's a non-timeout error or we're out of retries, break and handle
        break;
      }
    }

    // If we get here, all retries failed or we hit a non-timeout error
    console.warn("Background profile fetch failed, using cache if available:", lastError.message);
    throw lastError;
  },

  getCurrentUser() {
    const saved = localStorage.getItem('arowin_supabase_user');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return null;
      }
    }
    return null;
  },

  async logout() {
    const user = this.getCurrentUser();
    if (user?.id) {
      localStorage.removeItem(`2fa_verified_${user.id}`);
    }
    localStorage.removeItem('arowin_supabase_user');
    await supabase.auth.signOut();
  },

  async loginWithGoogle() {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
    });
    if (error) throw error;
    return data;
  },

  formatError(err: any): string {
    if (typeof err === 'string') return err;
    if (err.message) {
      if (err.message.includes('Invalid login credentials')) return "Invalid credentials.";
      if (err.message.includes('Email not confirmed')) return "Please confirm your email address.";
      return err.message;
    }
    return "An unexpected error occurred.";
  },

  async register(email: string, password: string, sponsorId: string, side: 'LEFT' | 'RIGHT', additionalData: any = {}) {
    const operatorId = `ARW-${Math.floor(100000 + Math.random() * 900000)}`;
    const internalEmail = `${(operatorId || '').toLowerCase()}@arowin.internal`;

    // 1. Create Supabase Auth User with internal email to allow unlimited IDs per real email
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

    // 1. Find Sponsor and Parent
    let sponsor = null;
    let parentId = null;
    let finalSide = (side || 'LEFT').toUpperCase() as 'LEFT' | 'RIGHT';
    let isSpillover = false;

    // Determine if it's a spillover join (manual placement)
    if (additionalData.parentId) {
      isSpillover = true;
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(additionalData.parentId);
      let parentQuery = supabase.from('profiles').select('id, operator_id');
      
      if (isUuid) {
        parentQuery = parentQuery.or(`id.eq.${additionalData.parentId},operator_id.eq.${additionalData.parentId}`);
      } else {
        parentQuery = parentQuery.eq('operator_id', additionalData.parentId);
      }
      
      const { data: explicitParent } = await parentQuery.maybeSingle();
      
      if (explicitParent) {
        console.log(`Spillover join under parent: ${explicitParent.operator_id}`);
        // Rule: sponsor_id = that parent, parent_id = that parent (or BFS under it)
        sponsor = explicitParent;
        try {
          const binaryResult = await this.findBinaryParent(explicitParent.id, finalSide);
          parentId = binaryResult.parentId;
          finalSide = binaryResult.side;
        } catch (err) {
          console.warn('Binary parent search failed for spillover:', err);
          // If search fails, we must NOT just use explicitParent.id as it might be full.
          // But we have no other choice here if findBinaryParent throws.
          // However, findBinaryParent is designed to return a fallback instead of throwing.
          parentId = explicitParent.id;
        }
      }
    }

    // If not spillover or parent not found, handle as direct referral
    if (!isSpillover || !sponsor) {
      let cleanSponsorId = sponsorId.trim();
      
      // Normalize Operator ID format
      if (/^\d{6}$/.test(cleanSponsorId)) {
        cleanSponsorId = `ARW-${cleanSponsorId}`;
      }
      if (/^ARW\d{6}$/i.test(cleanSponsorId)) {
        cleanSponsorId = `ARW-${cleanSponsorId.substring(3).toUpperCase()}`;
      }
      if (/^ARW-\d{6}$/i.test(cleanSponsorId)) {
        cleanSponsorId = `ARW-${cleanSponsorId.substring(4).toUpperCase()}`;
      }

      const isSponsorUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanSponsorId);
      let sponsorQuery = supabase.from('profiles').select('id, operator_id');
      
      if (isSponsorUuid) {
        sponsorQuery = sponsorQuery.eq('id', cleanSponsorId);
      } else {
        sponsorQuery = sponsorQuery.ilike('operator_id', cleanSponsorId);
      }

      const { data: foundSponsor, error: sponsorError } = await sponsorQuery.maybeSingle();

      if (sponsorError || !foundSponsor) {
        const { count } = await supabase.from('profiles').select('*', { count: 'exact', head: true });
        if (count !== 0) {
          throw new Error('Invalid Sponsor ID');
        }
        // First user bootstrap
      } else {
        sponsor = foundSponsor;
        console.log(`Direct referral join under sponsor: ${sponsor.operator_id}`);
        try {
          const binaryResult = await this.findBinaryParent(sponsor.id, finalSide);
          parentId = binaryResult.parentId;
          finalSide = binaryResult.side;
        } catch (err) {
          console.warn('Binary parent search failed for referral:', err);
          // Fallback to sponsor.id if search fails
          parentId = sponsor.id;
        }
      }
    }

    // 3. Prepare Profile Data
    const profileData = {
      id: user.id,
      email: email.toLowerCase(),
      operator_id: operatorId,
      name: additionalData.name || email.split('@')[0],
      mobile: additionalData.mobile || '',
      withdrawal_password: additionalData.withdrawalPassword || '',
      two_factor_pin: additionalData.twoFactorPin || '',
      sponsor_id: sponsor?.id || null,
      parent_id: parentId,
      side: finalSide,
      position: finalSide.toLowerCase(),
      rank: 1,
      package_amount: 50,
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
      role: 'user',
      status: 'active',
      created_at: new Date().toISOString(),
    };

    // 4. Upsert Profile
    // We try to save the full profile. If it fails due to missing columns, 
    // we try a minimal profile so the user can at least log in.
    let { error: profileError } = await supabase
      .from('profiles')
      .upsert([profileData], { onConflict: 'id' });

    if (profileError && profileError.message.includes('column')) {
      console.warn('Database schema mismatch detected. Attempting minimal profile creation...', profileError);
      const minimalProfile = {
        id: user.id,
        email: email,
        operator_id: operatorId,
        sponsor_id: profileData.sponsor_id,
        parent_id: profileData.parent_id,
        side: profileData.side,
        name: profileData.name,
        role: profileData.role,
        status: 'active',
        two_factor_pin: profileData.two_factor_pin || '123456',
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
      await this.sendWelcomeEmail(user.id);
    } catch (err) {
      console.warn('Failed to send welcome email:', err);
    }

    return { ...profileData, uid: user.id };
  },

  async registerUser(name: string, email: string) {
    if (!email) {
      throw new Error('Invalid email address. Please use a real email like Gmail.');
    }

    try {
      // 1. Insert into profiles
      const { data, error } = await supabase
        .from('profiles')
        .insert([
          {
            name: name,
            email: email,
            operator_id: `ARW-${Math.floor(100000 + Math.random() * 900000)}`,
            status: 'active',
            role: 'user',
            created_at: new Date().toISOString()
          }
        ])
        .select();

      // 3. Safety check
      if (error || !data || data.length === 0) {
        console.error('Insert failed or data empty:', error);
        throw new Error('Failed to insert user profile.');
      }

      // 4. Extract UUID
      const userId = data[0].id;

      // 5. Console logs
      console.log('Inserted data:', data[0]);
      console.log('userId:', userId);

      // 6. Add 500ms delay
      console.log("⏳ Waiting 500ms for database replication before sending email...");
      await new Promise(resolve => setTimeout(resolve, 500));

      // 7. Call Edge Function
      const functionUrl = 'https://jhlxehnwnlzftoylancq.supabase.co/functions/v1/send-email';
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      const responseData = await apiFetch(functionUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseAnonKey}`
        },
        body: JSON.stringify({
          user_id: userId,
          type: "welcome"
        })
      });

      console.log('Response from Edge Function:', responseData);

      // 8. Return success
      return { success: true, user: data[0], emailResponse: responseData };

    } catch (error) {
      console.error('registerUser error:', error);
      throw error;
    }
  },

  async sendWelcomeEmail(userId: string) {
    const functionUrl = 'https://jhlxehnwnlzftoylancq.supabase.co/functions/v1/send-email';
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    try {
      // IMPORTANT: Add delay after insert to fix the "User not found" timing issue
      // This gives Supabase enough time to replicate the new row before the Edge Function queries it
      console.log("⏳ Waiting 500ms for database replication before sending email...");
      await new Promise(resolve => setTimeout(resolve, 500));

      const responseData = await apiFetch(functionUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseAnonKey}`
        },
        body: JSON.stringify({
          user_id: userId,
          type: "welcome"
        })
      });

      return responseData;
    } catch (error) {
      console.error('Error calling send-email function:', error);
      // Don't throw here to prevent registration failure if email fails
      return { error: 'Email delivery failed' };
    }
  },

  // Password Reset
  async requestPasswordReset(email: string) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login?reset=true`,
    });
    if (error) throw error;
    return true;
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
        }).catch(err => {
          console.warn("Auth change profile fetch failed:", err.message);
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

  // User Profiles
  async createUserProfile(uid: string, data: any) {
    const { error } = await supabase
      .from('profiles')
      .upsert({ id: uid, ...data });
    if (error) throw error;
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
      const currentUser = this.getCurrentUser();
      const isAdmin = currentUser?.role === 'admin' || 
                      currentUser?.operator_id === 'ADMIN_AROWIN_2026' || 
                      currentUser?.operator_id === 'ARW-ADMIN-01' ||
                      currentUser?.email === 'admin@arowin.internal';
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
      const packageUpdateData = { 
        active_package: amount, // Use the actual package amount
        total_deposit: (Number(userProfile.total_deposit) || 0) + amount,
        status: 'active'
      };

      if (isAdmin) {
        try {
          await this.adminQuery('profiles', 'update', packageUpdateData, { id: uid });
        } catch (packageError) {
          throw packageError;
        }
      } else {
        const { error: packageError } = await supabase
          .from('profiles')
          .update(packageUpdateData)
          .eq('id', uid);

        if (packageError) throw packageError;
      }

      // 4. Create Team Collection entry for the main node if it doesn't exist
      const { data: existingMainNode } = await supabase
        .from('team_collection')
        .select('id')
        .eq('uid', uid)
        .eq('node_id', userProfile.operator_id)
        .single();

      if (!existingMainNode) {
        const mainTeamNode = {
          uid: uid,
          node_id: userProfile.operator_id,
          name: userProfile.name,
          balance: 0,
          eligible: true,
          created_at: new Date().toISOString()
        };
        if (isAdmin) {
          await this.adminQuery('team_collection', 'insert', mainTeamNode);
        } else {
          const { error: mainTeamError } = await supabase.from('team_collection').insert(mainTeamNode);
          if (mainTeamError) {
            console.error('Main team node insert failed, trying admin query:', mainTeamError);
            await this.adminQuery('team_collection', 'insert', mainTeamNode);
          }
        }
      }

      // 5. Create Sub-Nodes in Team Collection if package has multiple nodes
      const packageData = PACKAGES.find(p => p.price === amount);
      if (packageData && packageData.nodes > 1) {
        const numSubNodes = packageData.nodes - 1;
        console.log(`Creating ${numSubNodes} sub-nodes in team collection for package ${packageData.name}`);
        
        const teamCollectionToInsert: any[] = [];
        
        for (let i = 0; i < numSubNodes; i++) {
          const subNodeIndex = i + 1;
          const subNodeOperatorId = `${userProfile.operator_id}-${String(subNodeIndex + 1).padStart(2, '0')}`;
          
          teamCollectionToInsert.push({
            uid: uid,
            node_id: subNodeOperatorId,
            name: `${userProfile.name} Node ${subNodeIndex + 1}`,
            balance: 0,
            eligible: true,
            created_at: new Date().toISOString()
          });
        }

        // Batch Insert Sub-Nodes into team collection
        console.log(`Batch inserting ${teamCollectionToInsert.length} sub-nodes into team collection...`);
        if (isAdmin) {
          await this.adminQuery('team_collection', 'insert', teamCollectionToInsert);
        } else {
          const { error: teamInsertError } = await supabase.from('team_collection').insert(teamCollectionToInsert);
          if (teamInsertError) {
            console.error('Team collection insert failed, trying admin query:', teamInsertError);
            await this.adminQuery('team_collection', 'insert', teamCollectionToInsert);
          }
        }
      }

      // 8. Referral Bonus for the main node (5% of total amount to the external sponsor)
      if (userProfile.sponsor_id && amount > 0) {
        const mainNodeReferralBonus = amount * 0.05;
        // We don't have the sponsor's profile handy, so we'll let addIncome fetch it
        await this.addIncome(userProfile.sponsor_id, mainNodeReferralBonus, 'referral_bonus');
      }

      // 9. Update business and matching up the tree for the main node (total amount)
      await this.distributeTreeIncome(uid, amount);

      // 6. Log activation payment
      const paymentData = {
        uid: uid,
        amount: finalAmount,
        type: 'package_activation',
        method: isFree ? 'FREE' : 'WALLET',
        description: `Package Activation: $${amount}${isFree ? ' (FREE)' : ''}`,
        status: 'finished',
        currency: 'usdtbsc'
      };

      if (isAdmin) {
        try {
          await this.adminQuery('payments', 'insert', paymentData);
        } catch (error) {
          console.error('Failed to log payment via admin query:', error);
        }
      } else {
        await supabase.from('payments').insert(paymentData);
      }

      // Final rank check for the user themselves
      await this.checkAndUpdateRank(uid);

      return { success: true };
    } catch (error: any) {
      console.error('Error in activatePackage:', error);
      throw error;
    }
  },

  async distributeTreeIncome(uid: string, amount: number) {
    const currentUser = this.getCurrentUser();
    const isAdmin = currentUser?.role === 'admin' || 
                    currentUser?.operator_id === 'ADMIN_AROWIN_2026' || 
                    currentUser?.operator_id === 'ARW-ADMIN-01' ||
                    currentUser?.email === 'admin@arowin.internal';

    try {
      // 1. Fetch all ancestors in one go using RPC
      const { data: ancestors, error: rpcError } = await supabase.rpc('get_binary_ancestors', { p_user_id: uid });
      
      if (rpcError || !ancestors) {
        console.warn('RPC get_binary_ancestors failed, falling back to sequential updates:', rpcError);
        return this.distributeTreeIncomeSequential(uid, amount);
      }

      // 2. Process each ancestor
      let childSide = '';
      const { data: startNode } = await supabase.from('profiles').select('side').eq('id', uid).single();
      childSide = startNode?.side || '';

      for (const ancestor of ancestors) {
        const parentId = ancestor.id;
        const side = childSide;

        const updateData: any = {};
        const newTeamSize = { 
          left: Number(ancestor.left_count ?? ancestor.team_size?.left ?? 0),
          right: Number(ancestor.right_count ?? ancestor.team_size?.right ?? 0)
        };
        const matchingVolume = ancestor.matching_volume || { left: 0, right: 0 };
        let newMatchedPairs = ancestor.matched_pairs || 0;
        let matchingIncomeToAdd = 0;

        if (side === 'LEFT') {
          updateData.left_business = (Number(ancestor.left_business) || 0) + amount;
          updateData.left_count = (Number(ancestor.left_count) || 0) + 1;
          newTeamSize.left += 1;
          matchingVolume.left = (Number(matchingVolume.left) || 0) + amount;
        } else if (side === 'RIGHT') {
          updateData.right_business = (Number(ancestor.right_business) || 0) + amount;
          updateData.right_count = (Number(ancestor.right_count) || 0) + 1;
          newTeamSize.right += 1;
          matchingVolume.right = (Number(matchingVolume.right) || 0) + amount;
        }

        // Calculate matching income (10% of matched volume)
        const matchedAmount = Math.min(matchingVolume.left, matchingVolume.right);
        if (matchedAmount > 0) {
          matchingIncomeToAdd = matchedAmount * 0.10;
          matchingVolume.left -= matchedAmount;
          matchingVolume.right -= matchedAmount;
          newMatchedPairs += matchedAmount;
        }

        updateData.team_size = newTeamSize;
        updateData.matching_volume = matchingVolume;
        updateData.matched_pairs = newMatchedPairs;

        // Merge matching income update if applicable to save a DB call
        if (matchingIncomeToAdd > 0) {
          const newWallets = { ...(ancestor.wallets || {}) };
          const walletKey = 'matching';
          newWallets[walletKey] = newWallets[walletKey] || { balance: 0, currency: 'USDT' };
          newWallets[walletKey].balance = (Number(newWallets[walletKey].balance) || 0) + matchingIncomeToAdd;
          
          updateData.wallets = newWallets;
          updateData.total_income = (Number(ancestor.total_income) || 0) + matchingIncomeToAdd;
          
          // Log transaction asynchronously to not block
          this.adminQuery('transactions', 'insert', {
            uid: parentId,
            user_id: parentId,
            amount: matchingIncomeToAdd,
            type: 'income',
            description: 'Binary Matching Income',
            status: 'completed',
            created_at: new Date().toISOString()
          }).catch(e => console.error('Failed to log matching income transaction:', e));
        }

        if (isAdmin) {
          await this.adminQuery('profiles', 'update', updateData, { id: parentId });
        } else {
          await supabase.from('profiles').update(updateData).eq('id', parentId);
        }
        
        // Pass the updated data to checkAndUpdateRank to avoid another fetch
        const updatedAncestor = { ...ancestor, ...updateData };
        await this.checkAndUpdateRank(parentId, updatedAncestor);

        // Prepare for next ancestor
        childSide = ancestor.side;
      }
    } catch (err) {
      console.error('Error in distributeTreeIncome:', err);
    }
  },

  async distributeTreeIncomeSequential(uid: string, amount: number) {
    const currentUser = this.getCurrentUser();
    const isAdmin = currentUser?.role === 'admin' || 
                    currentUser?.operator_id === 'ADMIN_AROWIN_2026' || 
                    currentUser?.operator_id === 'ARW-ADMIN-01' ||
                    currentUser?.email === 'admin@arowin.internal';

    let currentId = uid;
    let loopDepth = 0;
    const MAX_LOOP_DEPTH = 1000;
    
    while (loopDepth < MAX_LOOP_DEPTH) {
      loopDepth++;
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
        .select('left_business, right_business, left_count, right_count, team_size, matching_volume, matched_pairs')
        .eq('id', parentId)
        .single();

      if (parentProfile) {
        const updateData: any = {};
        const newTeamSize = { 
          left: Number(parentProfile.left_count ?? parentProfile.team_size?.left ?? 0),
          right: Number(parentProfile.right_count ?? parentProfile.team_size?.right ?? 0)
        };
        const matchingVolume = parentProfile.matching_volume || { left: 0, right: 0 };
        let newMatchedPairs = parentProfile.matched_pairs || 0;
        let matchingIncomeToAdd = 0;

        if (side === 'LEFT') {
          updateData.left_business = (Number(parentProfile.left_business) || 0) + amount;
          updateData.left_count = (Number(parentProfile.left_count) || 0) + 1;
          newTeamSize.left += 1;
          matchingVolume.left = (Number(matchingVolume.left) || 0) + amount;
        } else if (side === 'RIGHT') {
          updateData.right_business = (Number(parentProfile.right_business) || 0) + amount;
          updateData.right_count = (Number(parentProfile.right_count) || 0) + 1;
          newTeamSize.right += 1;
          matchingVolume.right = (Number(matchingVolume.right) || 0) + amount;
        }

        const matchedAmount = Math.min(matchingVolume.left, matchingVolume.right);
        if (matchedAmount > 0) {
          matchingIncomeToAdd = matchedAmount * 0.10;
          matchingVolume.left -= matchedAmount;
          matchingVolume.right -= matchedAmount;
          newMatchedPairs += matchedAmount;
        }

        updateData.team_size = newTeamSize;
        updateData.matching_volume = matchingVolume;
        updateData.matched_pairs = newMatchedPairs;

        if (isAdmin) {
          await this.adminQuery('profiles', 'update', updateData, { id: parentId });
        } else {
          await supabase.from('profiles').update(updateData).eq('id', parentId);
        }
        
        if (matchingIncomeToAdd > 0) {
          await this.addIncome(parentId, matchingIncomeToAdd, 'matching_income');
        }

        await this.checkAndUpdateRank(parentId);
      }

      currentId = parentId;
    }
  },

  async adminQuery(table: string, operation: 'insert' | 'update' | 'delete', data?: any, match?: Record<string, any>) {
    const currentUser = this.getCurrentUser();
    let token = '';
    
    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData.session?.access_token) {
      token = sessionData.session.access_token;
    } else if (currentUser?.operator_id === 'ADMIN_AROWIN_2026' || currentUser?.operator_id === 'ARW-ADMIN-01') {
      token = 'CORE_SECURE_999';
    }

    if (!token) {
      throw new Error("No active session found. Please log in again.");
    }

    const result = await apiFetch('admin-query', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ table, operation, data, match }),
    });

    return result;
  },

  async addFunds(uid: string, amount: number) {
    try {
      let { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      console.log('addFunds: getSession result:', { session: !!session, error: sessionError });

      if (!session) {
        console.log('addFunds: No active session found, attempting refresh...');
        try {
          const { data: { session: refreshedSession }, error: refreshError } = await supabase.auth.refreshSession();
          if (refreshError || !refreshedSession) {
            throw refreshError || new Error('Auth session missing');
          }
          session = refreshedSession;
        } catch (err) {
          console.warn('addFunds: Session refresh failed, checking for admin fallback');
          // Fallback for hardcoded admin
          const currentUser = this.getCurrentUser();
          if (currentUser?.operator_id === 'ADMIN_AROWIN_2026' || currentUser?.operator_id === 'ARW-ADMIN-01' || currentUser?.role === 'admin') {
            console.log('addFunds: Using hardcoded admin secret as token');
            session = { access_token: 'CORE_SECURE_999' } as any;
          } else {
            throw new Error('No active session found. Please log in again.');
          }
        }
      }
      
      if (!session) {
        throw new Error('No active session found. Please log in again.');
      }

      const token = session.access_token;

      console.log(`addFunds: Requesting funds addition for ${uid}, amount: ${amount}, token length: ${token.length}`);
      
      try {
        const result = await apiFetch('admin-query', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ user_id: uid, amount }),
        });
        console.log('addFunds: Successfully added funds via Edge Function');
        return true;
      } catch (fetchErr) {
        console.warn('addFunds: Edge Function failed, attempting direct database update fallback...', fetchErr);
        
        // Fallback: Direct database update if Edge Function is not deployed
        // This requires the user to have appropriate RLS permissions or be an admin
        const { data: profile } = await supabase.from('profiles').select('wallet_balance, wallets').eq('id', uid).single();
        
        const currentBalance = Number(profile?.wallet_balance || 0);
        const newBalance = currentBalance + amount;
        
        const newWallets = { ...(profile?.wallets || {}) };
        if (newWallets.master) {
          newWallets.master.balance = Number(newWallets.master.balance || 0) + amount;
        } else {
          newWallets.master = { balance: amount, currency: 'USDT' };
        }

        const { error: updateError } = await supabase
          .from('profiles')
          .update({ 
            wallet_balance: newBalance,
            wallets: newWallets
          })
          .eq('id', uid);
          
        if (updateError) throw updateError;
        
        console.log('addFunds: Successfully added funds via Direct DB Fallback');
        return true;
      }
    } catch (error) {
      console.error('Error in addFunds:', error);
      throw error;
    }
  },

  async setupAdmin(secret: string) {
    try {
      try {
        const data = await apiFetch('admin-setup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ secret })
        });
        return data;
      } catch (fetchErr) {
        console.warn('setupAdmin: Edge Function failed, attempting direct database setup fallback...', fetchErr);
        
        // Fallback: If Edge Function is not deployed, we can't do much for Auth
        // but we can ensure the admin profile exists in the DB
        if (secret === 'INITIALIZE_AROWIN_2026') {
          const { data: existing } = await supabase.from('profiles').select('id').eq('operator_id', 'ARW-ADMIN-01').single();
          if (!existing) {
            console.log('setupAdmin Fallback: Creating admin profile in database');
            await supabase.from('profiles').insert({
              operator_id: 'ARW-ADMIN-01',
              name: 'System Administrator',
              email: 'admin@arowin.internal',
              role: 'admin',
              status: 'active'
            });
          }
          return { success: true, message: 'Admin profile verified in database (Fallback Mode)' };
        }
        throw fetchErr;
      }
    } catch (error) {
      console.error('Error in setupAdmin:', error);
      throw error;
    }
  },

  // Daily and Weekly Payout System
  async processDailyPayouts() {
    try {
      // 1. Fetch all active users
      const { data: users, error } = await supabase
        .from('profiles')
        .select('*')
        .gt('active_package', 0);

      if (error) throw error;

      for (const user of users) {
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

    if (error) {
      console.warn('RPC claim_wallet failed, falling back to client-side claim:', error);
      // Client-side fallback
      const profile = await this.getUserProfile(user.id);
      if (!profile) throw new Error('User not found');
      
      const wallets = profile.wallets || {};
      const wallet = wallets[walletKey];
      if (!wallet || !wallet.balance || wallet.balance <= 0) {
        throw new Error('No balance to claim');
      }
      
      const claimAmount = Number(wallet.balance);
      const newWallets = { ...wallets };
      newWallets[walletKey] = { ...wallet, balance: 0 };
      newWallets.master = newWallets.master || { balance: 0, currency: 'USDT' };
      newWallets.master.balance = Number(newWallets.master.balance) + claimAmount;
      
      const newWalletBalance = Number(profile.wallet_balance || 0) + claimAmount;
      
      const { error: updateError } = await supabase.from('profiles').update({
        wallets: newWallets,
        wallet_balance: newWalletBalance
      }).eq('id', user.id);
      
      if (updateError) throw updateError;
      
      // Log transaction
      await supabase.from('payments').insert({
        uid: user.id,
        amount: claimAmount,
        type: 'claim',
        method: 'INTERNAL',
        description: `Claimed ${walletKey} to Master Vault`,
        status: 'finished',
        currency: 'usdtbsc'
      });
      
      return { success: true, claimed_amount: claimAmount, new_master_balance: newWallets.master.balance };
    }

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
      // 1. Fetch user profile to get package info and operator_id
      const profile = await this.getUserProfile(uid);
      if (!profile || !profile.active_package) return [];

      const packageData = PACKAGES.find(p => p.price === profile.active_package);
      if (!packageData) return [];

      // 2. Fetch nodes from team_collection (these are the sub-nodes linked to this user)
      const { data: teamNodes, error: teamError } = await supabase
        .from('team_collection')
        .select('*')
        .eq('uid', uid);

      if (teamError || !teamNodes) return [];

      // 3. Fetch sub-profiles from profiles table to get their real-time balances
      // We identify sub-profiles by their operator_id (e.g., ARW-123456-02)
      const nodeOperatorIds = teamNodes.map(n => n.node_id);
      const { data: subProfiles, error: profileError } = await supabase
        .from('profiles')
        .select('operator_id, referral_income, matching_income, yield_income, wallets')
        .in('operator_id', nodeOperatorIds);

      const subProfilesMap = new Map();
      if (subProfiles) {
        subProfiles.forEach(p => subProfilesMap.set(p.operator_id, p));
      }

      // 4. Calculate yield and combine with other incomes
      const totalWeeklyEarning = packageData.weeklyEarning;
      // For yield calculation, we use the number of nodes in the package
      const totalNodesInPackage = packageData.nodes || 1;
      const earningPerNodePerWeek = totalWeeklyEarning / totalNodesInPackage;
      const earningPerNodePerSecond = earningPerNodePerWeek / (7 * 24 * 60 * 60);

      const now = new Date();
      const updatedNodes = teamNodes.map(node => {
        const subProfile = subProfilesMap.get(node.node_id);
        
        // Calculate yield accrued since last collection (stored in created_at of team_collection)
        const lastUpdate = new Date(node.created_at);
        const secondsElapsed = Math.max(0, (now.getTime() - lastUpdate.getTime()) / 1000);
        const accruedYield = secondsElapsed * earningPerNodePerSecond;
        
        // Total balance = accrued yield + referral income + matching income + yield income (from sub-profile wallets)
        const referralIncome = Number(subProfile?.wallets?.referral?.balance) || 0;
        const matchingIncome = Number(subProfile?.wallets?.matching?.balance) || 0;
        const yieldIncome = Number(subProfile?.wallets?.yield?.balance) || 0;
        const rankBonus = Number(subProfile?.wallets?.rankBonus?.balance) || 0;
        const rewards = Number(subProfile?.wallets?.rewards?.balance) || 0;
        const manualBalance = Number(node.balance) || 0;
        
        const totalBalance = accruedYield + referralIncome + matchingIncome + yieldIncome + rankBonus + rewards + manualBalance;

        return {
          ...node,
          balance: totalBalance,
          package_name: packageData.name,
          package_amount: packageData.price,
          daily_yield: (earningPerNodePerWeek / 7),
          status: node.eligible ? 'active' : 'inactive'
        };
      });

      return updatedNodes;
    } catch (err) {
      console.error('Error in getTeamCollection:', err);
      return [];
    }
  },

  // Rank Breakdown
  async getRankBreakdown(rootId: string) {
    try {
      // Use the get_binary_downline RPC which we know exists
      const { data: downline, error } = await supabase.rpc('get_binary_downline', { root_id: rootId });
      
      if (error || !downline) {
        console.error('Error fetching downline for rank breakdown:', error);
        return null;
      }

      // Get direct children to separate left and right
      const { data: children } = await supabase
        .from('profiles')
        .select('id, side')
        .eq('parent_id', rootId);

      const leftRootId = children?.find(c => c.side === 'LEFT')?.id;
      const rightRootId = children?.find(c => c.side === 'RIGHT')?.id;

      const left: Record<string, number> = {};
      const right: Record<string, number> = {};
      
      RANK_NAMES.forEach(name => {
        left[name] = 0;
        right[name] = 0;
      });

      if (leftRootId) {
        const { data: leftDownline } = await supabase.rpc('get_binary_downline', { root_id: leftRootId });
        if (leftDownline) {
          leftDownline.forEach((node: any) => {
            const rankIndex = (node.rank || 1) - 1;
            const rankName = RANK_NAMES[rankIndex];
            if (rankName) left[rankName] = (left[rankName] || 0) + 1;
          });
        }
      }

      if (rightRootId) {
        const { data: rightDownline } = await supabase.rpc('get_binary_downline', { root_id: rightRootId });
        if (rightDownline) {
          rightDownline.forEach((node: any) => {
            const rankIndex = (node.rank || 1) - 1;
            const rankName = RANK_NAMES[rankIndex];
            if (rankName) right[rankName] = (right[rankName] || 0) + 1;
          });
        }
      }

      return { left, right };
    } catch (err) {
      console.error('Error in getRankBreakdown:', err);
      return null;
    }
  },

  async collectFromNodes(uid: string, nodeIds: string[]) {
    try {
      // 1. Fetch nodes and user profile
      const [profile, { data: teamNodes }] = await Promise.all([
        this.getUserProfile(uid),
        supabase.from('team_collection').select('*').in('node_id', nodeIds).eq('uid', uid)
      ]);

      if (!profile || !teamNodes || teamNodes.length === 0) return 0;

      // 2. Fetch sub-profiles
      const { data: subProfiles } = await supabase
        .from('profiles')
        .select('id, operator_id, referral_income, matching_income, yield_income')
        .in('operator_id', nodeIds);

      const subProfilesMap = new Map();
      if (subProfiles) {
        subProfiles.forEach(p => subProfilesMap.set(p.operator_id, p));
      }

      const packageData = PACKAGES.find(p => p.price === profile.active_package);
      const totalWeeklyEarning = packageData?.weeklyEarning || 0;
      const totalNodesInPackage = packageData?.nodes || 1;
      const earningPerNodePerSecond = (totalWeeklyEarning / totalNodesInPackage) / (7 * 24 * 60 * 60);

      let totalCollected = 0;
      const now = new Date();

      for (const node of teamNodes) {
        const subProfile = subProfilesMap.get(node.node_id);
        
        // Calculate yield
        const lastUpdate = new Date(node.created_at);
        const secondsElapsed = Math.max(0, (now.getTime() - lastUpdate.getTime()) / 1000);
        const accruedYield = secondsElapsed * earningPerNodePerSecond;
        
        // Get sub-profile incomes
        const referralIncome = Number(subProfile?.wallets?.referral?.balance) || 0;
        const matchingIncome = Number(subProfile?.wallets?.matching?.balance) || 0;
        const yieldIncome = Number(subProfile?.wallets?.yield?.balance) || 0;
        const rankBonus = Number(subProfile?.wallets?.rankBonus?.balance) || 0;
        const rewards = Number(subProfile?.wallets?.rewards?.balance) || 0;
        const manualBalance = Number(node.balance) || 0;

        const nodeTotal = accruedYield + referralIncome + matchingIncome + yieldIncome + rankBonus + rewards + manualBalance;
        totalCollected += nodeTotal;

        // Reset sub-profile wallets in profiles table
        if (subProfile) {
          const newWallets = { ...(subProfile.wallets || {}) };
          newWallets.referral = { balance: 0, currency: 'USDT' };
          newWallets.matching = { balance: 0, currency: 'USDT' };
          newWallets.yield = { balance: 0, currency: 'USDT' };
          newWallets.rankBonus = { balance: 0, currency: 'USDT' };
          newWallets.rewards = { balance: 0, currency: 'USDT' };
          
          const resetData = {
            wallets: newWallets
          };
          
          await supabase
            .from('profiles')
            .update(resetData)
            .eq('id', subProfile.id);
        }

        // Reset team_collection node and update timestamp
        await supabase
          .from('team_collection')
          .update({ balance: 0, created_at: now.toISOString() })
          .eq('node_id', node.node_id);
      }

      if (totalCollected > 0) {
        // 3. Add to main user's master wallet
        // We use 'team_collection_claim' which should go directly to master wallet balance
        await this.addIncome(uid, totalCollected, 'team_collection_claim');
      }

      return totalCollected;
    } catch (err) {
      console.error('Error in collectFromNodes:', err);
      throw err;
    }
  },

  // Rank Ladder Logic
  async checkAndUpdateRank(uid: string, existingProfile?: any) {
    const profile = existingProfile || await this.getUserProfile(uid);
    if (!profile) return;

    const currentUser = this.getCurrentUser();
    const isAdmin = currentUser?.role === 'admin' || currentUser?.operator_id === 'ADMIN_AROWIN_2026';

    // CRITICAL: Without ID activation (active_package), rank should not unlock
    if (!profile.active_package || profile.active_package < 50) {
      if (profile.rank > 1) {
        if (isAdmin) {
          try {
            await this.adminQuery('profiles', 'update', { rank: 1 }, { id: uid });
          } catch (error) {
            console.error('Failed to reset rank via admin query:', error);
          }
        } else {
          await supabase.from('profiles').update({ rank: 1 }).eq('id', uid);
        }
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

      if (isAdmin) {
        try {
          await this.adminQuery('profiles', 'update', { rank: newRank }, { id: uid });
        } catch (error) {
          console.error('Failed to update rank via admin query:', error);
        }
      } else {
        await supabase
          .from('profiles')
          .update({ rank: newRank })
          .eq('id', uid);
      }
      
      console.log(`User ${uid} promoted to Rank ${newRank}`);
    }
  },

  // Payments
  async getPayments(uid: string) {
    try {
      if (uid === 'all') {
        // Try direct query first (works if RLS allows admin)
        const { data: directPayments, error: directError } = await supabase
          .from('payments')
          .select('*')
          .order('created_at', { ascending: false });
          
        const { data: directTransactions, error: directTxError } = await supabase
          .from('transactions')
          .select('*')
          .order('created_at', { ascending: false });

        const combinedData = [];
        if (!directError && directPayments) combinedData.push(...directPayments);
        if (!directTxError && directTransactions) combinedData.push(...directTransactions);

        if (combinedData.length > 0) {
          combinedData.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
          return combinedData;
        }

        let token = localStorage.getItem('arowin_admin_token') || 'CORE_SECURE_999';
        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData.session?.access_token) {
           token = sessionData.session.access_token;
        }
        
        const paymentsData = await apiFetch('admin-query', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            table: 'payments',
            operation: 'select',
            order: { column: 'created_at', ascending: false }
          })
        }).catch(() => []);

        const transactionsData = await apiFetch('admin-query', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            table: 'transactions',
            operation: 'select',
            order: { column: 'created_at', ascending: false }
          })
        }).catch(() => []);
        
        const combinedAdminData = [...(paymentsData || []), ...(transactionsData || [])];
        combinedAdminData.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        
        return combinedAdminData;
      }

      // For specific user, use getTransactions which already combines both
      return this.getTransactions(uid);
    } catch (err) {
      console.error('Error fetching payments:', err);
      return [];
    }
  },

  async updatePaymentStatus(paymentId: string, status: string) {
    try {
      const currentUser = this.getCurrentUser();
      const isAdmin = currentUser?.role === 'admin' || currentUser?.operator_id === 'ADMIN_AROWIN_2026';

      // Fetch the payment first to check if it's a withdrawal and if we need to refund
      const { data: payment, error: fetchError } = await supabase
        .from('payments')
        .select('*')
        .eq('id', paymentId)
        .single();
      
      if (fetchError) throw fetchError;

      let data;
      if (isAdmin) {
        try {
          // Note: adminQuery doesn't return the updated row directly in the same way, 
          // but we can just assume success if it doesn't throw.
          await this.adminQuery('payments', 'update', { status, updated_at: new Date().toISOString() }, { id: paymentId });
          data = { ...payment, status, updated_at: new Date().toISOString() };
        } catch (error) {
          throw error;
        }
      } else {
        const { data: updateData, error } = await supabase
          .from('payments')
          .update({ status, updated_at: new Date().toISOString() })
          .eq('id', paymentId)
          .select()
          .single();

        if (error) throw error;
        data = updateData;
      }

      // If a deposit is approved, update the user's balance
      if (payment.type === 'deposit' && (status === 'completed' || status === 'finished') && payment.status !== 'completed' && payment.status !== 'finished') {
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('wallet_balance, wallets')
          .eq('id', payment.uid)
          .single();
        
        if (!profileError && profile) {
          const numericAmount = Number(payment.amount);
          const newBalance = (Number(profile.wallet_balance) || 0) + numericAmount;
          
          let newWallets = profile.wallets || {};
          if (typeof newWallets === 'string') {
            try { newWallets = JSON.parse(newWallets); } catch (e) { newWallets = {}; }
          }
          
          if (!newWallets.master) newWallets.master = { balance: 0, currency: 'USDT' };
          newWallets.master.balance = (Number(newWallets.master.balance) || 0) + numericAmount;

          const updateProfileData = { 
            wallet_balance: newBalance,
            wallets: newWallets
          };

          if (isAdmin) {
            try {
              await this.adminQuery('profiles', 'update', updateProfileData, { id: payment.uid });
            } catch (error) {
              console.error('Failed to update user balance via admin query:', error);
            }
          } else {
            await supabase
              .from('profiles')
              .update(updateProfileData)
              .eq('id', payment.uid);
          }
        }
      }

      // If a withdrawal is rejected, refund the user
      if (payment.type === 'withdrawal' && status === 'rejected' && payment.status !== 'rejected') {
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('wallet_balance, wallets')
          .eq('id', payment.uid)
          .single();
        
        if (!profileError && profile) {
          const newWallets = { ...profile.wallets };
          newWallets.master = newWallets.master || { balance: 0, currency: 'USDT' };
          newWallets.master.balance += payment.amount;

          const updateProfileData = { 
            wallet_balance: (Number(profile.wallet_balance) || 0) + payment.amount,
            wallets: newWallets
          };

          if (isAdmin) {
            try {
              await this.adminQuery('profiles', 'update', updateProfileData, { id: payment.uid });
            } catch (error) {
              console.error('Failed to refund user via admin query:', error);
            }
          } else {
            await supabase
              .from('profiles')
              .update(updateProfileData)
              .eq('id', payment.uid);
          }
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
      if (amount < 10) {
        throw new Error('Minimum withdrawal amount is 10 USDT');
      }

      const profile = await this.getUserProfile(uid);
      if (!profile) throw new Error('User not found');

      const balance = Number(profile.wallet_balance || 0);
      if (balance < amount) {
        throw new Error('Insufficient balance');
      }

      // 10% Transaction Fee (Page 14)
      const fee = amount * 0.10;
      const netAmount = amount - fee;

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

      // 2. Create withdrawal transaction
      const { error: txError } = await supabase
        .from('transactions')
        .insert({
          uid: uid,
          user_id: uid,
          amount: amount,
          type: 'withdrawal',
          description: `Withdrawal to ${address} (Net: ${netAmount.toFixed(2)} USDT, Fee: ${fee.toFixed(2)} USDT)`,
          status: 'pending'
        });

      if (txError) console.error('Error logging withdrawal transaction:', txError);

      return { success: true, netAmount, fee };
    } catch (error) {
      console.error('Error creating withdrawal:', error);
      throw error;
    }
  },

  // MLM Logic
  async findBinaryParent(startNodeId: string, side: 'LEFT' | 'RIGHT'): Promise<{ parentId: string, side: 'LEFT' | 'RIGHT' }> {
    try {
      // 1. Check if the direct side is available
      // Check both 'side' and 'position' columns to be safe against data inconsistencies
      // Use .limit(1) to ensure we don't get 406 errors if duplicates already exist
      const { data: directChild } = await supabase.from('profiles')
        .select('id')
        .eq('parent_id', startNodeId)
        .or(`side.eq.${side},position.eq.${side.toLowerCase()}`)
        .limit(1)
        .maybeSingle();

      if (!directChild) {
        return { parentId: startNodeId, side };
      }

      // 2. If full, use BFS within the subtree rooted at directChild
      // Fetch the entire downline to perform BFS in memory for speed and stability
      const { data: downline, error } = await supabase.rpc('get_binary_downline', { root_id: startNodeId });
      
      if (error || !downline) {
        console.warn('RPC get_binary_downline failed, falling back to sequential search');
        // Avoid circular dependency by implementing a simple sequential search here
        return this.findBinaryParentSimpleSequential(startNodeId, side);
      }

      // Build a map of children for efficient lookup
      const nodesByParent = new Map<string, { left?: string, right?: string }>();
      downline.forEach((p: any) => {
        if (p.parent_id) {
          if (!nodesByParent.has(p.parent_id)) nodesByParent.set(p.parent_id, {});
          const children = nodesByParent.get(p.parent_id)!;
          // Check both side and position for mapping
          const s = (p.side || p.position || '').trim().toUpperCase();
          if (s === 'LEFT') children.left = p.id;
          else if (s === 'RIGHT') children.right = p.id;
        }
      });

      // BFS starting from the directChild on the requested side
      const queue = [directChild.id];
      const visited = new Set([directChild.id]);

      while (queue.length > 0) {
        const currentId = queue.shift()!;
        const children = nodesByParent.get(currentId) || {};

        // Check left first, then right
        if (!children.left) return { parentId: currentId, side: 'LEFT' };
        if (!children.right) return { parentId: currentId, side: 'RIGHT' };

        if (!visited.has(children.left)) {
          visited.add(children.left);
          queue.push(children.left);
        }
        if (!visited.has(children.right)) {
          visited.add(children.right);
          queue.push(children.right);
        }
      }

      // If BFS fails (should not happen in a binary tree), fallback to start node
      return { parentId: startNodeId, side };
    } catch (err) {
      console.error('Error in findBinaryParent:', err);
      return { parentId: startNodeId, side };
    }
  },

  // Helper for findBinaryParent to avoid circular dependency
  async findBinaryParentSimpleSequential(startNodeId: string, side: 'LEFT' | 'RIGHT'): Promise<{ parentId: string, side: 'LEFT' | 'RIGHT' }> {
    try {
      const { data: directChild } = await supabase.from('profiles')
        .select('id')
        .eq('parent_id', startNodeId)
        .or(`side.eq.${side},position.eq.${side.toLowerCase()}`)
        .limit(1)
        .maybeSingle();

      if (!directChild) return { parentId: startNodeId, side };

      const queue = [directChild.id];
      let depth = 0;
      while (queue.length > 0 && depth < 100) {
        const currentId = queue.shift()!;
        depth++;
        
        const { data: children } = await supabase.from('profiles')
          .select('id, side, position')
          .eq('parent_id', currentId);

        const leftChild = children?.find(c => (c.side || c.position || '').trim().toUpperCase() === 'LEFT');
        const rightChild = children?.find(c => (c.side || c.position || '').trim().toUpperCase() === 'RIGHT');

        if (!leftChild) return { parentId: currentId, side: 'LEFT' };
        if (!rightChild) return { parentId: currentId, side: 'RIGHT' };

        queue.push(leftChild.id);
        queue.push(rightChild.id);
      }
      return { parentId: startNodeId, side };
    } catch (err) {
      return { parentId: startNodeId, side };
    }
  },

  async findBinaryParentSequential(startNodeId: string, side: 'LEFT' | 'RIGHT'): Promise<{ parentId: string, side: 'LEFT' | 'RIGHT' }> {
    return this.findBinaryParent(startNodeId, side);
  },

  async updateAncestorsTeamSize(uid: string) {
    let currentId = uid;
    let loopDepth = 0;
    const MAX_LOOP_DEPTH = 1000;
    
    while (loopDepth < MAX_LOOP_DEPTH) {
      loopDepth++;
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('parent_id, side')
        .eq('id', currentId)
        .maybeSingle();
      
      if (error || !profile || !profile.parent_id) break;
      
      const parentId = profile.parent_id;
      const side = profile.side;
      
      // Fetch parent's current team size and counts
      const { data: parent, error: parentError } = await supabase
        .from('profiles')
        .select('team_size, left_count, right_count')
        .eq('id', parentId)
        .maybeSingle();
        
      if (parentError || !parent) break;
      
      const newTeamSize = { 
        left: Number(parent.team_size?.left || parent.left_count || 0), 
        right: Number(parent.team_size?.right || parent.right_count || 0) 
      };
      
      const updateData: any = {};
      
      if (side === 'LEFT') {
        newTeamSize.left += 1;
        updateData.left_count = newTeamSize.left;
      } else {
        newTeamSize.right += 1;
        updateData.right_count = newTeamSize.right;
      }
      
      updateData.team_size = newTeamSize;
      
      await supabase
        .from('profiles')
        .update(updateData)
        .eq('id', parentId);
        
      currentId = parentId;
    }
  },

  async addIncome(uid: string, amount: number, type: string, options: { skipNodeDistribution?: boolean, existingProfile?: any } = {}) {
    const { skipNodeDistribution, existingProfile } = options;
    const profile = existingProfile || await this.getUserProfile(uid);
    if (!profile) return;

    let payableAmount = amount;
    
    // Determine wallet key and if we should update total_income
    let walletKey = 'master';
    let shouldUpdateTotalIncome = true;
    
    if (type === 'referral_bonus') walletKey = 'referral';
    else if (type === 'matching_bonus' || type === 'matching_income') walletKey = 'matching';
    else if (type === 'rank_bonus') walletKey = 'rankBonus';
    else if (type === 'rank_reward') walletKey = 'rewards';
    else if (type === 'team_collection' || type === 'team_collection_yield') walletKey = 'yield'; 
    else if (type === 'team_collection_balance' || type === 'team_collection_claim') {
      walletKey = 'master';
      shouldUpdateTotalIncome = false; // Already counted when distributed to nodes or earned by sub-nodes
    }
    else if (type === 'incentive_accrual') walletKey = 'incentive';

    // Standard Wallet Update
    const newWallets = { ...profile.wallets };
    
    // Initialize wallets if missing
    newWallets.master = newWallets.master || { balance: 0, currency: 'USDT' };
    if (walletKey !== 'master') {
      newWallets[walletKey] = newWallets[walletKey] || { balance: 0, currency: 'USDT' };
    }

    // Logic change: Don't add to master directly for bonuses/yields
    // Only add to master if it's a direct deposit or a claim (which is handled elsewhere)
    // or if it's a specific type that SHOULD go to master (like team_collection_balance)
    
    let amountToMaster = 0;
    let amountToSpecific = 0;

    if (walletKey === 'master') {
      amountToMaster = payableAmount;
    } else {
      amountToSpecific = payableAmount;
    }

    if (amountToMaster > 0) {
      newWallets.master.balance += amountToMaster;
    }
    
    if (amountToSpecific > 0 && walletKey !== 'master') {
      newWallets[walletKey].balance += amountToSpecific;
    }

    const updateData: any = {
      wallets: newWallets,
      // wallet_balance only tracks what's in the master wallet (available for withdrawal)
      wallet_balance: (Number(profile.wallet_balance) || 0) + amountToMaster
    };
    
    if (shouldUpdateTotalIncome) {
      updateData.total_income = (Number(profile.total_income) || 0) + payableAmount;
    }

    // Always update the specific income column for tracking
    if (walletKey === 'referral') updateData.referral_income = (Number(profile.referral_income) || 0) + payableAmount;
    else if (walletKey === 'matching') updateData.matching_income = (Number(profile.matching_income) || 0) + payableAmount;
    else if (walletKey === 'yield') updateData.yield_income = (Number(profile.yield_income) || 0) + payableAmount;
    else if (walletKey === 'rankBonus') updateData.rank_income = (Number(profile.rank_income) || 0) + payableAmount;
    else if (walletKey === 'rewards') updateData.incentive_income = (Number(profile.incentive_income) || 0) + payableAmount;

    const currentUser = this.getCurrentUser();
    const isAdmin = currentUser?.role === 'admin' || currentUser?.operator_id === 'ADMIN_AROWIN_2026' || currentUser?.operator_id === 'ARW-ADMIN-01';

    if (isAdmin) {
      try {
        await this.adminQuery('profiles', 'update', updateData, { id: uid });
      } catch (updateError) {
        console.error('Failed to update income via admin query:', updateError);
      }
    } else {
      await supabase
        .from('profiles')
        .update(updateData)
        .eq('id', uid);
    }

    // Log transaction via payments table
    const paymentData = {
      uid: uid,
      amount: payableAmount,
      type: type,
      method: 'INTERNAL',
      description: `Income: ${type.replace('_', ' ').toUpperCase()}`,
      status: 'finished',
      currency: 'usdtbsc'
    };

    if (isAdmin) {
      try {
        await this.adminQuery('payments', 'insert', paymentData);
      } catch (paymentError) {
        console.error('Failed to log income payment via admin query:', paymentError);
      }
    } else {
      const { error: paymentError } = await supabase.from('payments').insert(paymentData);
      if (paymentError) throw paymentError;
    }
    
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
    
    let finalDownline: any[] = [];

    if (error || !downline || downline.length === 0) {
      console.warn('RPC get_binary_downline failed or returned empty, falling back to recursive JS fetch:', error);
      
      // Recursive JS Fallback
      const fetchDownline = async (parentId: string, currentDepth: number = 0): Promise<any[]> => {
        if (currentDepth > 10) return []; // Limit depth for safety
        
        const { data: children, error: childError } = await supabase
          .from('profiles')
          .select('*')
          .eq('parent_id', parentId);
          
        if (childError || !children) return [];
        
        let results = [...children];
        for (const child of children) {
          const descendants = await fetchDownline(child.id, currentDepth + 1);
          results = [...results, ...descendants];
        }
        return results;
      };

      const { data: rootNode } = await supabase.from('profiles').select('*').eq('id', rootId).single();
      if (rootNode) {
        const descendants = await fetchDownline(rootId);
        finalDownline = [rootNode, ...descendants];
      } else {
        return {};
      }
    } else {
      finalDownline = downline;
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
        const side = (p.side || '').trim().toUpperCase();
        
        if (side === 'LEFT' || side === 'RIGHT') {
          if (!parentChildren[side]) {
            parentChildren[side] = p;
          }
        } else {
          // Fallback for missing or invalid side
          if (!parentChildren['LEFT']) parentChildren['LEFT'] = p;
          else if (!parentChildren['RIGHT']) parentChildren['RIGHT'] = p;
        }
      }
    });

    const rootProfile = finalDownline.find((p: any) => p.id === rootId);
    if (!rootProfile) return {};

    const visited = new Set<string>();
    const MAX_DEPTH = 100;

    const buildNode = (node: any, path: string, depth: number = 0) => {
      if (visited.has(node.id) || depth > MAX_DEPTH) return;
      visited.add(node.id);

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
        leftBusiness: (Number(node.left_business) || 0).toFixed(2),
        rightBusiness: (Number(node.right_business) || 0).toFixed(2),
        parentId: node.parent_id,
        sponsorId: node.sponsor_id,
        email: node.email,
        side: node.side || 'ROOT',
        uid: node.id,
        nodeCount: 0 // Removed team_collection node count
      };

      // Recursively process children
      const children = nodesByParent.get(node.id);
      if (children) {
        if (children.LEFT) buildNode(children.LEFT, `${path}-left`, depth + 1);
        if (children.RIGHT) buildNode(children.RIGHT, `${path}-right`, depth + 1);
      }
    };

    buildNode(rootProfile, 'root');

    // Add any "orphaned" nodes that were returned by the RPC but not connected in the tree
    finalDownline.forEach((node: any) => {
      if (!visited.has(node.id) && node.id !== rootId) {
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
      const childPath = `${parentPath}-${(child.side || 'LEFT').toLowerCase()}`;
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
        .maybeSingle();
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
    
    let { data, error } = await query.maybeSingle();

    // Fallback to ilike on operator_id if not found
    if ((error || !data) && !isUuid) {
      const { data: retryData, error: retryError } = await supabase
        .from('profiles')
        .select('*')
        .ilike('operator_id', cleanId)
        .maybeSingle();
      
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
      .or(`uid.eq.${uid},user_id.eq.${uid}`)
      .order('created_at', { ascending: false });
    
    // 2. Fetch from payments as well to ensure we have everything
    const { data: payments, error: pError } = await supabase
      .from('payments')
      .select('*')
      .eq('uid', uid)
      .in('type', ['referral_bonus', 'matching_bonus', 'matching_income', 'rank_bonus', 'rank_reward', 'reward_income', 'team_collection', 'incentive_accrual', 'claim', 'withdrawal', 'deposit', 'package_activation'])
      .order('created_at', { ascending: false });

    // 3. Combine and deduplicate if necessary, or just return the most complete set
    const combined = [];
    if (!tError && transactions) {
      combined.push(...transactions);
    }
    if (!pError && payments) {
      combined.push(...payments);
    }

    // Sort combined by created_at descending
    combined.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return combined;
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
    const currentUser = this.getCurrentUser();
    const isAdmin = currentUser?.role === 'admin' || currentUser?.operator_id === 'ADMIN_AROWIN_2026';

    if (isAdmin) {
      try {
        await this.adminQuery('profiles', 'update', data, { id: uid });
        return true;
      } catch (error) {
        throw error;
      }
    } else {
      const { error } = await supabase
        .from('profiles')
        .update(data)
        .eq('id', uid);
      if (error) throw error;
      return true;
    }
  },

  async updateUserStatus(uid: string, status: 'active' | 'pending' | 'blocked') {
    if (!this.isUuid(uid)) throw new Error('Invalid User ID format (UUID required)');
    const currentUser = this.getCurrentUser();
    const isAdmin = currentUser?.role === 'admin' || currentUser?.operator_id === 'ADMIN_AROWIN_2026';

    if (isAdmin) {
      try {
        await this.adminQuery('profiles', 'update', { status }, { id: uid });
        return true;
      } catch (error) {
        throw error;
      }
    } else {
      const { error } = await supabase
        .from('profiles')
        .update({ status })
        .eq('id', uid);
      if (error) throw error;
      return true;
    }
  },

  async deleteUser(uid: string) {
    if (!this.isUuid(uid)) throw new Error('Invalid User ID format (UUID required)');
    const currentUser = this.getCurrentUser();
    const isAdmin = currentUser?.role === 'admin' || currentUser?.operator_id === 'ADMIN_AROWIN_2026';

    if (isAdmin) {
      try {
        await this.adminQuery('profiles', 'delete', undefined, { id: uid });
        await this.adminQuery('payments', 'delete', undefined, { uid: uid });
        await this.adminQuery('team_collection', 'delete', undefined, { uid: uid });
        return true;
      } catch (error) {
        throw error;
      }
    } else {
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
    }
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