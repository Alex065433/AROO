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

        if (!data) {
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
          throw new Error("User profile not found. Please contact support.");
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
    
    // Always look up the sponsor first (the person who referred)
    let cleanSponsorId = sponsorId.trim();
    if (/^\d{6}$/.test(cleanSponsorId)) cleanSponsorId = `ARW-${cleanSponsorId}`;
    if (/^ARW\d{6}$/i.test(cleanSponsorId)) cleanSponsorId = `ARW-${cleanSponsorId.substring(3).toUpperCase()}`;
    if (/^ARW-\d{6}$/i.test(cleanSponsorId)) cleanSponsorId = `ARW-${cleanSponsorId.substring(4).toUpperCase()}`;

    const isSponsorUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanSponsorId);
    let sponsorQuery = supabase.from('profiles').select('id, operator_id');
    if (isSponsorUuid) sponsorQuery = sponsorQuery.eq('id', cleanSponsorId);
    else sponsorQuery = sponsorQuery.ilike('operator_id', cleanSponsorId);

    const { data: foundSponsor } = await sponsorQuery.maybeSingle();
    sponsor = foundSponsor;

    // 2. Determine Placement Parent - STRICT DIRECT PLACEMENT
    if (additionalData.parentId) {
      const isUuid = this.isUuid(additionalData.parentId);
      let parentQuery = supabase.from('profiles').select('id, operator_id');
      if (isUuid) parentQuery = parentQuery.eq('id', additionalData.parentId);
      else parentQuery = parentQuery.eq('operator_id', additionalData.parentId);
      
      const { data: explicitParent } = await parentQuery.maybeSingle();
      if (explicitParent) {
        parentId = explicitParent.id;
      }
    }

    // If no explicit parent, use sponsor as parent (Direct Placement)
    if (!parentId && sponsor) {
      parentId = sponsor.id;
    }

    // If still no sponsor/parent, check if it's the first user
    if (!sponsor && !parentId) {
      const { count } = await supabase.from('profiles').select('*', { count: 'exact', head: true });
      if (count !== 0) throw new Error('Invalid Sponsor ID');
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
      package_amount: 0, // Start with 0 until activated
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
      left_count: 0,
      right_count: 0,
      left_business: 0,
      right_business: 0,
      left_volume: 0,
      right_volume: 0,
      matched_pairs: 0,
      role: 'user',
      status: 'active',
      created_at: new Date().toISOString(),
    };

    // 4. Insert Profile
    const { error: profileError } = await supabase
      .from('profiles')
      .insert([profileData]);

    if (profileError) {
      if (profileError.message.includes('UNIQUE_BINARY_POSITION') || profileError.message.includes('idx_unique_binary_placement') || profileError.code === '23505') {
        throw new Error(`The ${finalSide} position under this sponsor/parent is already taken. Please choose a different position or parent.`);
      }
      throw new Error(`Profile Sync Error: ${profileError.message}`);
    }

    // 5. Verify Placement (Requirement 1)
    console.log(`Verifying placement for ${user.id}: parent=${parentId}, side=${finalSide}`);
    const { data: verifiedProfile, error: verifyError } = await supabase
      .from('profiles')
      .select('id, parent_id, side, operator_id')
      .eq('id', user.id)
      .single();

    if (verifyError || !verifiedProfile) {
      console.error('Placement verification failed:', verifyError);
    } else {
      const isParentCorrect = verifiedProfile.parent_id === parentId;
      const isSideCorrect = verifiedProfile.side === finalSide;
      
      if (!isParentCorrect || !isSideCorrect) {
        console.error(`Placement Mismatch! Expected: parent=${parentId}, side=${finalSide}. Got: parent=${verifiedProfile.parent_id}, side=${verifiedProfile.side}`);
        // We could throw here, but the record is already inserted. 
        // For now, we log it clearly for debug support (Requirement 6).
      } else {
        console.log(`Placement Verified: ${verifiedProfile.operator_id} is correctly placed under ${parentId} on ${finalSide} side.`);
      }
    }

    // 6. Update binary counts (Requirement 2)
    try {
      console.log('Updating binary counts via sequential distribution...');
      const startTime = new Date().toISOString();
      // Use distributeTreeIncome with amount 0 to only update counts
      await this.distributeTreeIncome(user.id, 0, true);
      // Still trigger matching in case this placement qualifies any ancestors
      await supabase.rpc('process_binary_matching');
      
      // Verify matching income generation (Requirement)
      await this.verifyMatchingGenerated(startTime);
    } catch (err: any) {
      console.warn('Failed to update binary counts or process matching:', err);
      if (err.message === 'matching not generated') {
        throw err;
      }
    }

    // Send Welcome Email
    try {
      await this.sendWelcomeEmail(user.id);
    } catch (err) {
      console.warn('Failed to send welcome email:', err);
    }

    return { ...profileData, uid: user.id, verifiedPlacement: verifiedProfile };
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

      const isFirstPackage = !userProfile.active_package || userProfile.active_package === 0;

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

      // 5. Create Sub-Nodes in Team Collection and Profiles if package has multiple nodes
      const packageData = PACKAGES.find(p => p.price === amount);
      if (packageData && packageData.nodes > 1) {
        // Get all existing sub-nodes for this user to rebuild the tree structure
        const { data: existingProfiles } = await supabase
          .from('profiles')
          .select('id, operator_id')
          .like('operator_id', `${userProfile.operator_id}-%`)
          .eq('sponsor_id', uid)
          .order('operator_id', { ascending: true });
        
        // Root node is always at index 0
        const nodeIds = [uid];
        
        // Add existing sub-nodes to nodeIds in order
        if (existingProfiles) {
          existingProfiles.forEach(p => {
            if (p.id !== uid) {
              nodeIds.push(p.id);
            }
          });
        }

        const numSubNodes = packageData.nodes - 1;
        console.log(`Creating ${numSubNodes} sub-nodes for package ${packageData.name}. Existing nodes: ${nodeIds.length}`);
        
        const teamCollectionToInsert: any[] = [];
        const profilesToInsert: any[] = [];
        
        for (let i = 0; i < numSubNodes; i++) {
          const subNodeIndex = nodeIds.length; // Next available index in the binary tree
          const subNodeOperatorId = `${userProfile.operator_id}-${String(subNodeIndex + 1).padStart(2, '0')}`;
          
          const parentIndex = Math.floor((subNodeIndex - 1) / 2);
          const side = (subNodeIndex % 2 === 1) ? 'LEFT' : 'RIGHT';
          const parentId = nodeIds[parentIndex];
          const newNodeId = self.crypto.randomUUID();
          
          // Add to team_collection
          teamCollectionToInsert.push({
            uid: uid,
            node_id: subNodeOperatorId,
            name: `${userProfile.name} Node ${subNodeIndex + 1}`,
            balance: 0,
            eligible: true,
            created_at: new Date().toISOString()
          });

          // Add to profiles
          profilesToInsert.push({
            id: newNodeId,
            email: `${subNodeOperatorId.toLowerCase()}@arowin.internal`,
            operator_id: subNodeOperatorId,
            name: `${userProfile.name} Node ${subNodeIndex + 1}`,
            sponsor_id: uid,
            parent_id: parentId,
            side: side,
            position: side.toLowerCase(),
            status: 'active',
            is_active: true,
            active_package: 50, // Base package for sub-nodes
            package_amount: 50,
            role: 'user',
            created_at: new Date().toISOString(),
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
            left_count: 0,
            right_count: 0,
            left_business: 0,
            right_business: 0,
            left_volume: 0,
            right_volume: 0,
            matched_pairs: 0
          });

          // Add the new ID to nodeIds so it can be a parent for subsequent nodes in this loop
          nodeIds.push(newNodeId);
        }

        // Batch Insert into profiles
        console.log(`Batch inserting ${profilesToInsert.length} sub-profiles...`);
        if (isAdmin) {
          await this.adminQuery('profiles', 'insert', profilesToInsert);
        } else {
          const { error: profileInsertError } = await supabase.from('profiles').insert(profilesToInsert);
          if (profileInsertError) {
            console.error('Profile sub-node insert failed, trying admin query:', profileInsertError);
            await this.adminQuery('profiles', 'insert', profilesToInsert);
          }
        }

        // Process counts and income for each sub-node
        for (const subProfile of profilesToInsert) {
          try {
            // Distribute business volume and counts (each sub-node is $50)
            await this.distributeTreeIncome(subProfile.id, 50, true);
          } catch (subNodeError) {
            console.error(`Error processing sub-node ${subProfile.operator_id}:`, subNodeError);
          }
        }

        // Batch Insert into team collection
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
      console.log(`Distributing tree income for ${uid}, amount: ${amount}`);
      await this.distributeTreeIncome(uid, amount, isFirstPackage);

      // 10. Trigger Backend Matching and Rank Logic (Requirement 2 & 3)
      console.log('Triggering backend matching and rank updates...');
      try {
        const startTime = new Date().toISOString();
        // First process matching income (Requirement 2)
        await supabase.rpc('process_binary_matching');
        
        // Verify matching income generation (Requirement)
        await this.verifyMatchingGenerated(startTime);

        // Then update ranks based on new volumes/counts
        await supabase.rpc('update_user_ranks');
      } catch (rpcErr: any) {
        console.warn('Backend income/rank processing failed:', rpcErr);
        if (rpcErr.message === 'matching not generated') {
          throw rpcErr;
        }
      }

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

  async distributeTreeIncome(uid: string, amount: number, isFirstPackage: boolean = true) {
    return this.distributeTreeIncomeSequential(uid, amount, isFirstPackage);
  },

  async distributeTreeIncomeSequential(uid: string, amount: number, isFirstPackage: boolean = true) {
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
        .select('left_business, right_business, left_count, right_count, left_volume, right_volume')
        .eq('id', parentId)
        .single();

      if (parentProfile) {
        const updateData: any = {};
        
        if (side === 'LEFT') {
          updateData.left_business = (Number(parentProfile.left_business) || 0) + amount;
          updateData.left_volume = (Number(parentProfile.left_volume) || 0) + amount;
          if (isFirstPackage) {
            updateData.left_count = (Number(parentProfile.left_count) || 0) + 1;
          }
        } else if (side === 'RIGHT') {
          updateData.right_business = (Number(parentProfile.right_business) || 0) + amount;
          updateData.right_volume = (Number(parentProfile.right_volume) || 0) + amount;
          if (isFirstPackage) {
            updateData.right_count = (Number(parentProfile.right_count) || 0) + 1;
          }
        }

        try {
          // Update business volumes and counts via backend (Requirement 3)
          await this.systemQuery('profiles', 'update', updateData, { id: parentId });
          
          // Log volume distribution for debug support (Requirement 6)
          console.log(`Volume Distributed: ${amount} added to ${side} of ${parentId}`);
        } catch (updateErr) {
          console.error(`Error updating tree volumes for parent ${parentId}:`, updateErr);
        }

        await this.checkAndUpdateRank(parentId);
      }

      currentId = parentId;
    }
  },

  async systemQuery(table: string, operation: 'insert' | 'update' | 'delete', data?: any, match?: Record<string, any>) {
    const result = await apiFetch('admin-query', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer CORE_SECURE_999`,
      },
      body: JSON.stringify({ table, operation, data, match }),
    });
    return result;
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
      console.log('Processing Daily Payouts (Binary Matching & Yield)...');
      
      // 1. Update Ranks first to ensure correct capping
      const { error: rankError } = await supabase.rpc('update_user_ranks');
      if (rankError) {
        console.warn('update_user_ranks RPC failed, falling back to manual check:', rankError);
      }

      // 2. Process Binary Matching (with capping logic)
      const { error: matchingError } = await supabase.rpc('process_binary_matching');
      if (matchingError) {
        console.error('process_binary_matching RPC failed:', matchingError);
        throw matchingError;
      }

      // 3. Process Daily Yield (ROI)
      const { error: yieldError } = await supabase.rpc('process_daily_yield');
      if (yieldError) {
        console.warn('process_daily_yield RPC failed, it might not be implemented yet:', yieldError);
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
      console.log('Processing Weekly Rank Bonuses...');
      
      // Call the weekly bonus RPC
      const { error: bonusError } = await supabase.rpc('process_weekly_rank_bonus');
      if (bonusError) {
        console.error('process_weekly_rank_bonus RPC failed:', bonusError);
        throw bonusError;
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
      const { data: team, error } = await supabase
        .from('team_collection')
        .select('*')
        .eq('uid', uid)
        .order('created_at', { ascending: true });

      if (error || !team) return [];
      
      // Get user profile to show package info
      const { data: profile } = await supabase.from('profiles').select('active_package').eq('id', uid).single();
      
      return team.map((p: any) => ({
        id: p.id,
        node_id: p.node_id,
        name: p.name,
        package_name: profile?.active_package ? `Package $${profile.active_package}` : 'Pending',
        package_amount: profile?.active_package || 0,
        daily_yield: 0,
        balance: p.balance || 0,
        last_collection: p.created_at,
        status: 'active',
        created_at: p.created_at,
      }));
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
      // 0. Trigger backend income generation before collection (Requirement 3)
      console.log('Triggering backend income generation before collection...');
      try {
        const startTime = new Date().toISOString();
        await supabase.rpc('process_daily_yield');
        await supabase.rpc('process_binary_matching');
        
        // Verify matching income generation (Requirement)
        // Note: This might throw if no matching was generated, as per user requirement "do not proceed"
        await this.verifyMatchingGenerated(startTime);
      } catch (rpcErr) {
        console.warn('Backend income generation verification failed:', rpcErr);
        // If it's the specific "matching not generated" error, we might want to stop
        if (rpcErr.message === 'matching not generated') {
          throw rpcErr;
        }
      }

      // 1. Fetch nodes and user profile
      const [profile, { data: teamNodes }] = await Promise.all([
        this.getUserProfile(uid),
        supabase.from('team_collection').select('*').in('node_id', nodeIds).eq('uid', uid)
      ]);

      if (!profile || !teamNodes || teamNodes.length === 0) return 0;

      // 2. Fetch sub-profiles
      const { data: subProfiles } = await supabase
        .from('profiles')
        .select('id, operator_id, wallets, referral_income, matching_income, yield_income')
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
        
        // Get sub-profile incomes from wallets (Requirement 5)
        const wallets = subProfile?.wallets || {};
        const referralIncome = Number(wallets.referral?.balance) || 0;
        const matchingIncome = Number(wallets.matching?.balance) || 0;
        const yieldIncome = Number(wallets.yield?.balance) || 0;
        const rankBonus = Number(wallets.rankBonus?.balance) || 0;
        const rewards = Number(wallets.rewards?.balance) || 0;
        const manualBalance = Number(node.balance) || 0;

        const nodeTotal = accruedYield + referralIncome + matchingIncome + yieldIncome + rankBonus + rewards + manualBalance;
        totalCollected += nodeTotal;

        // Reset sub-profile wallets in profiles table (Requirement 5)
        if (subProfile) {
          const newWallets = { ...wallets };
          newWallets.referral = { balance: 0, currency: 'USDT' };
          newWallets.matching = { balance: 0, currency: 'USDT' };
          newWallets.yield = { balance: 0, currency: 'USDT' };
          newWallets.rankBonus = { balance: 0, currency: 'USDT' };
          newWallets.rewards = { balance: 0, currency: 'USDT' };
          
          await supabase
            .from('profiles')
            .update({ wallets: newWallets })
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
        const currentUser = this.getCurrentUser();
        const isAdmin = currentUser?.role === 'admin' || currentUser?.operator_id === 'ADMIN_AROWIN_2026';

        if (isAdmin) {
          // Use adminQuery to bypass RLS and get joined data
          const payments = await this.adminQuery('payments', 'select', '*, profiles(name, email)');
          const transactions = await this.adminQuery('transactions', 'select', '*, profiles(name, email)');
          
          const combinedData = [];
          if (Array.isArray(payments)) combinedData.push(...payments);
          if (Array.isArray(transactions)) combinedData.push(...transactions);
          
          combinedData.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
          return combinedData;
        }

        // Fallback for non-admin
        const { data: directPayments } = await supabase
          .from('payments')
          .select('*, profiles(name, email)')
          .order('created_at', { ascending: false });
          
        const { data: directTransactions } = await supabase
          .from('transactions')
          .select('*, profiles(name, email)')
          .order('created_at', { ascending: false });

        const combinedData = [];
        if (directPayments) combinedData.push(...directPayments);
        if (directTransactions) combinedData.push(...directTransactions);

        combinedData.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        return combinedData;
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
      // EXTREME PLACEMENT LOGIC (as requested by user "LEFT REFFERAL IS GOING TO RIGHT")
      // This ensures that if they choose LEFT, they always stay on the LEFT branch of the subtree.
      let currentId = startNodeId;
      let depth = 0;
      const maxDepth = 1000;

      while (depth < maxDepth) {
        const { data: child, error } = await supabase.from('profiles')
          .select('id')
          .eq('parent_id', currentId)
          .or(`side.eq.${side},position.eq.${side.toLowerCase()}`)
          .limit(1)
          .maybeSingle();

        if (error || !child) {
          // Found an empty spot on the extreme side
          return { parentId: currentId, side };
        }

        currentId = child.id;
        depth++;
      }

      return { parentId: currentId, side };
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

    try {
      await this.systemQuery('profiles', 'update', updateData, { id: uid });
    } catch (updateError) {
      console.error('Failed to update income via system query:', updateError);
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

    const currentUser = this.getCurrentUser();
    const isAdmin = currentUser?.role === 'admin' || 
                    currentUser?.operator_id === 'ADMIN_AROWIN_2026' || 
                    currentUser?.operator_id === 'ARW-ADMIN-01' ||
                    currentUser?.email === 'admin@arowin.internal';

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
        totalTeam: (Number(child.left_count) || 0) + (Number(child.right_count) || 0),
        leftBusiness: (Number(child.left_business) || 0).toFixed(2),
        rightBusiness: (Number(child.right_business) || 0).toFixed(2),
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
    const activeUsers = users?.filter(u => u?.active_package > 0).length || 0;
    const blockedUsers = users?.filter(u => u?.status === 'blocked').length || 0;
    const totalDeposits = payments?.filter(p => p?.type === 'deposit' && p?.status === 'finished')
      .reduce((sum, p) => sum + (p?.amount || 0), 0) || 0;
    const totalWithdrawals = payments?.filter(p => p?.type === 'withdrawal' && p?.status === 'completed')
      .reduce((sum, p) => sum + (p?.amount || 0), 0) || 0;
    const pendingWithdrawals = payments?.filter(p => p?.type === 'withdrawal' && p?.status === 'pending')
      .reduce((sum, p) => sum + (p?.amount || 0), 0) || 0;
    
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
  },

  async verifyMatchingGenerated(startTime: string) {
    console.log(`Verifying matching income generation since ${startTime}...`);
    
    // We check transactions table for new matching income rows
    // User also mentioned team_collection, but transactions is the source of truth for income events
    const { data, error } = await supabase
      .from('transactions')
      .select('id, amount, description')
      .eq('type', 'income')
      .ilike('description', '%Matching%')
      .gt('created_at', startTime);
    
    if (error) {
      console.error('Error verifying matching income:', error);
      return false;
    }

    if (!data || data.length === 0) {
      console.error('matching not generated');
      // Requirement: "do not proceed"
      throw new Error('matching not generated');
    }

    console.log(`Verified: ${data.length} new matching income rows found.`);
    return true;
  }
};