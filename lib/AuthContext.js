'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { getSavedLang } from './lang';

const AuthContext = createContext({ user: null, isPro: false, planType: null, planExpiresAt: null, loading: true });

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isPro, setIsPro] = useState(false);
  const [planType, setPlanType] = useState(null);
  const [planExpiresAt, setPlanExpiresAt] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Set <html lang> from saved preference
    document.documentElement.lang = getSavedLang();

    // Initial session check
    supabase.auth.getSession().then(({ data }) => {
      const u = data?.session?.user ?? null;
      setUser(u);
      setLoading(false);
    }).catch(() => setLoading(false));

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null;
      setUser(u);
      if (!u) {
        setIsPro(false);
        setPlanType(null);
        setPlanExpiresAt(null);
      }
    });

    return () => subscription?.unsubscribe();
  }, []);

  // Fetch pro status when user changes
  useEffect(() => {
    if (!user?.email) {
      setIsPro(false);
      setPlanType(null);
      setPlanExpiresAt(null);
      return;
    }
    supabase
      .from('profiles')
      .select('is_pro, plan_type, plan_expires_at')
      .eq('email', user.email)
      .single()
      .then(({ data: profile }) => {
        const pt = profile?.plan_type ?? null;
        const exp = profile?.plan_expires_at ? new Date(profile.plan_expires_at) : null;
        const active = pt !== null && exp !== null && exp > new Date();
        setIsPro(active || (profile?.is_pro ?? false));
        setPlanType(pt);
        setPlanExpiresAt(exp);
      })
      .catch(() => {
        setIsPro(false);
        setPlanType(null);
        setPlanExpiresAt(null);
      });
  }, [user?.email]);

  return (
    <AuthContext.Provider value={{ user, isPro, planType, planExpiresAt, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
