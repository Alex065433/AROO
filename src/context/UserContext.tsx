import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '../../services/supabase';
import { supabaseService } from '../../services/supabaseService';

interface UserProfile {
  id: string;
  name: string;
  operator_id: string;
  wallet_balance: number;
  matching_income: number;
  referral_income: number;
  rank_bonus_income: number;
  yield_income: number;
  incentive_income: number;
  [key: string]: any;
}

interface UserContextType {
  user: any | null;
  profile: UserProfile | null;
  loading: boolean;
  profileLoading: boolean;
  error: string | null;
  refreshProfile: () => Promise<void>;
  logout: () => Promise<void>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export const UserProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<any | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(() => {
    // Initial sync from localStorage for fast UI response
    const saved = localStorage.getItem('arowin_supabase_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currentUserRef = React.useRef<any>(null);

  useEffect(() => {
    currentUserRef.current = user;
  }, [user]);

  const fetchProfile = async (userId: string, silent: boolean = false) => {
    if (!silent) setProfileLoading(true);
    try {
      const data = await supabaseService.getUserProfile(userId);
      if (data) {
        setProfile(data as UserProfile);
        setError(null);
      }
    } catch (err: any) {
      const isTimeout = err.message?.includes('timed out') || err.message?.includes('waking up');
      
      if (isTimeout) {
        console.warn("Profile fetch timed out, using cached data if available:", err.message);
      } else {
        console.error("Profile fetch error:", err);
      }
      
      // If we have cached data, don't show error to user unless it's a critical auth error
      if (!profile) {
        let userMessage = err.message || 'Failed to sync profile.';
        if (isTimeout) {
          userMessage = "The database is taking longer than expected to respond. Using cached data if available.";
        }
        setError(userMessage);
      }
      
      if (err?.message?.includes('not found') || err?.status === 401) {
        setProfile(null);
        localStorage.removeItem('arowin_supabase_user');
      }
    } finally {
      setProfileLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;

    const initializeAuth = async () => {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) {
          console.warn('Session error during initialization:', sessionError.message);
          if (sessionError.message?.toLowerCase().includes('refresh token not found') || 
              sessionError.message?.toLowerCase().includes('invalid_grant') ||
              sessionError.message?.toLowerCase().includes('refresh_token_not_found')) {
            // Clear everything if refresh token is invalid
            setUser(null);
            setProfile(null);
            localStorage.removeItem('arowin_supabase_user');
            try {
              await supabase.auth.signOut();
            } catch (e) {
              // Ignore sign out errors when session is already invalid
            }
          }
          throw sessionError;
        }

        if (session?.user) {
          if (mounted) {
            setUser(session.user);
            // Background fetch - non-blocking
            fetchProfile(session.user.id, true);
          }
        } else {
          if (mounted) {
            setUser(null);
            setProfile(null);
            localStorage.removeItem('arowin_supabase_user');
          }
        }
      } catch (err: any) {
        console.error('Auth initialization failed:', err.message);
        const msg = err.message?.toLowerCase() || '';
        if (msg.includes('refresh token not found') || 
            msg.includes('invalid_grant') || 
            msg.includes('refresh_token_not_found')) {
          if (mounted) {
            setUser(null);
            setProfile(null);
            localStorage.removeItem('arowin_supabase_user');
          }
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    initializeAuth();

    const { data: { subscription: authSubscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log(`Auth Event: ${event}`);
        if (session?.user) {
          setUser(session.user);
          if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
            fetchProfile(session.user.id, true);
          }
        } else {
          // If we were signed in before, clear 2FA
          if (currentUserRef.current?.id) {
            localStorage.removeItem(`2fa_verified_${currentUserRef.current.id}`);
          }
          setUser(null);
          setProfile(null);
          localStorage.removeItem('arowin_supabase_user');
        }
        setLoading(false);
      }
    );

    return () => {
      mounted = false;
      authSubscription.unsubscribe();
    };
  }, []);

  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user.id);
    }
  };

  const logout = async () => {
    await supabaseService.logout();
    setUser(null);
    setProfile(null);
  };

  return (
    <UserContext.Provider value={{ user, profile, loading, profileLoading, error, refreshProfile, logout }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
};
