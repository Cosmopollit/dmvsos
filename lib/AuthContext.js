'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { getSavedLang } from './lang';

const AuthContext = createContext({ user: null, isPro: false, hasCar: false, hasMoto: false, hasCdl: false, planType: null, planExpiresAt: null, loading: true });

// Legacy plans unlock everything; new plans are category-specific
const CAR_PLANS  = new Set(['car_pass',  'cdl_pass', 'quick_pass', 'full_prep', 'guaranteed_pass']);
const MOTO_PLANS = new Set(['moto_pass', 'quick_pass', 'full_prep', 'guaranteed_pass']);
const CDL_PLANS  = new Set(['cdl_pass',  'quick_pass', 'full_prep', 'guaranteed_pass']);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isPro, setIsPro] = useState(false);
  const [hasCar, setHasCar] = useState(false);
  const [hasMoto, setHasMoto] = useState(false);
  const [hasCdl, setHasCdl] = useState(false);
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
        setHasCar(false);
        setHasMoto(false);
        setHasCdl(false);
        setPlanType(null);
        setPlanExpiresAt(null);
      }
    });

    return () => subscription?.unsubscribe();
  }, []);

  // Fetch pro status when user changes. Sign-out clearing is handled by
  // onAuthStateChange above — no need to also clear here.
  useEffect(() => {
    if (!user?.email) return;
    // Case-insensitive match — Supabase emails from Google OAuth are lowercase,
    // but legacy profiles may have mixed case.
    supabase
      .from('profiles')
      .select('plan_type, plan_expires_at')
      .ilike('email', user.email)
      .maybeSingle()
      .then(({ data: profile }) => {
        const pt = profile?.plan_type ?? null;
        const exp = profile?.plan_expires_at ? new Date(profile.plan_expires_at) : null;
        // Single source of truth: plan is active iff expires_at is in the future.
        // Drop legacy is_pro fallback — expired one-time plans stay "Pro" forever.
        const pro = pt !== null && exp !== null && exp > new Date();
        setIsPro(pro);
        setHasCar(pro && CAR_PLANS.has(pt));
        setHasMoto(pro && MOTO_PLANS.has(pt));
        setHasCdl(pro && CDL_PLANS.has(pt));
        setPlanType(pt);
        setPlanExpiresAt(exp);
      })
      .catch(() => {
        setIsPro(false);
        setHasCar(false);
        setHasMoto(false);
        setHasCdl(false);
        setPlanType(null);
        setPlanExpiresAt(null);
      });
  }, [user?.email]);

  return (
    <AuthContext.Provider value={{ user, isPro, hasCar, hasMoto, hasCdl, planType, planExpiresAt, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
