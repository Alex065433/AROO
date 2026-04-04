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
  profile: UserProfile | null;
  loading: boolean;
  error: string | null;
  refreshProfile: () => Promise<void>;
  logout: () => Promise<void>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export const UserProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProfile = async (user: any) => {
    if (!user) {
      setProfile(null);
      setLoading(false);
      return;
    }

    console.log("FETCH START");
    console.log("USER:", user);

    try {
      setLoading(true);
      
      const timeout = setTimeout(() => {
        setLoading(false);
      }, 5000);

      const { data, error } = await supabase
        .from("profiles")
        .select("id,name,operator_id,wallet_balance,matching_income,referral_income,rank_bonus_income,yield_income,incentive_income,role,two_factor_pin")
        .eq("id", user.id)
        .single();

      clearTimeout(timeout);
      
      console.log("PROFILE:", data);

      if (error) {
        console.error("SUPABASE ERROR:", error.message, error.details);
        setError(error.message);
        setLoading(false);
        return;
      }

      setProfile(data as UserProfile);
      setError(null);
      setLoading(false);
    } catch (err: any) {
      console.error("SUPABASE ERROR:", err.message, err.details);
      setError(err.message || 'An unexpected error occurred while fetching your profile.');
      setLoading(false);
    }
  };

  useEffect(() => {
    let profileSubscription: { unsubscribe: () => void } | null = null;

    const initializeAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;

      if (!user) {
        setProfile(null);
        setLoading(false);
        return;
      }

      await fetchProfile(user);

      // Set up real-time subscription
      const channel = supabase
        .channel(`public:profiles:id=eq.${user.id}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'profiles',
            filter: `id=eq.${user.id}`,
          },
          (payload) => {
            console.log('Real-time profile update in UserContext:', payload.new);
            setProfile((prev) => ({ ...prev, ...payload.new } as UserProfile));
          }
        )
        .subscribe();

      profileSubscription = { unsubscribe: () => { supabase.removeChannel(channel); } };
    };

    initializeAuth();

    const { data: { subscription: authSubscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_IN' && session?.user) {
          setLoading(true);
          await fetchProfile(session.user);
        } else if (event === 'SIGNED_OUT') {
          setProfile(null);
          setLoading(false);
          if (profileSubscription) {
            profileSubscription.unsubscribe();
            profileSubscription = null;
          }
        }
      }
    );

    return () => {
      authSubscription.unsubscribe();
      if (profileSubscription) {
        profileSubscription.unsubscribe();
      }
    };
  }, []);

  const refreshProfile = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      await fetchProfile(session.user);
    }
  };

  const logout = async () => {
    sessionStorage.removeItem('2fa_verified');
    await supabaseService.logout();
    setProfile(null);
  };

  return (
    <UserContext.Provider value={{ profile, loading, error, refreshProfile, logout }}>
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
