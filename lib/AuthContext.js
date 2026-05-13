'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { getSavedLang } from './lang';

const AuthContext = createContext({
  user: null,
  isPro: false,
  hasCar: false, hasMoto: false, hasCdl: false,
  planType: null,
  planExpiresAt: null,
  activePasses: {}, // { moto: ExpiresAt, auto: ExpiresAt, cdl: ExpiresAt }
  loading: true,
});

// Legacy plan types from profiles.plan_type (subscription + legacy one-time).
// Each one grants access to a set of categories.
const LEGACY_PLAN_GRANTS = {
  car_pass:        { car: true },
  moto_pass:       { moto: true },
  cdl_pass:        { cdl: true },
  quick_pass:      { car: true, moto: true, cdl: true },   // legacy all-access
  full_prep:       { car: true, moto: true, cdl: true },   // legacy all-access
  guaranteed_pass: { car: true, moto: true, cdl: true },   // legacy all-access
};

// New per-type pass_type values from active_passes.
const NEW_PASS_TO_CATEGORY = { auto: 'car', moto: 'moto', cdl: 'cdl' };

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isPro, setIsPro] = useState(false);
  const [hasCar, setHasCar] = useState(false);
  const [hasMoto, setHasMoto] = useState(false);
  const [hasCdl, setHasCdl] = useState(false);
  const [planType, setPlanType] = useState(null);
  const [planExpiresAt, setPlanExpiresAt] = useState(null);
  const [activePasses, setActivePasses] = useState({});
  const [loading, setLoading] = useState(true);

  function clearAll() {
    setIsPro(false);
    setHasCar(false); setHasMoto(false); setHasCdl(false);
    setPlanType(null); setPlanExpiresAt(null);
    setActivePasses({});
  }

  useEffect(() => {
    document.documentElement.lang = getSavedLang();
    supabase.auth.getSession().then(({ data }) => {
      setUser(data?.session?.user ?? null);
      setLoading(false);
    }).catch(() => setLoading(false));

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null;
      setUser(u);
      if (!u) clearAll();
    });
    return () => subscription?.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user?.id || !user?.email) return;

    // New model: per-type passes from active_passes (one row per pass_type).
    // Legacy fallback: profiles.plan_type for users still on old subscription/one-time.
    Promise.all([
      supabase
        .from('active_passes')
        .select('pass_type, expires_at')
        .eq('user_id', user.id),
      supabase
        .from('profiles')
        .select('plan_type, plan_expires_at')
        .ilike('email', user.email)
        .maybeSingle(),
    ])
      .then(([passesRes, profileRes]) => {
        const now = new Date();
        // TEMP debug — remove once active_passes flow is verified in production
        // eslint-disable-next-line no-console
        console.log('[AuthContext] user.id=', user.id,
          '| active_passes rows:', passesRes.data,
          '| error:', passesRes.error,
          '| profile:', profileRes.data);

        // Build active_passes map from new table
        const passes = {};
        let maxExpires = null;
        let latestType = null;
        for (const row of passesRes.data || []) {
          const exp = new Date(row.expires_at);
          if (exp > now) {
            passes[row.pass_type] = exp;
            if (!maxExpires || exp > maxExpires) {
              maxExpires = exp;
              latestType = row.pass_type;
            }
          }
        }
        setActivePasses(passes);

        // Grants from new model (auto → car, moto → moto, cdl → cdl)
        let car = !!passes.auto;
        let moto = !!passes.moto;
        let cdl = !!passes.cdl;
        let pt = latestType;
        let exp = maxExpires;

        // Legacy fallback: if no new-model passes but profile still has an active
        // legacy plan, honor it (subscription holders + pre-migration one-time).
        if (!car && !moto && !cdl) {
          const lp = profileRes.data?.plan_type ?? null;
          const lpExp = profileRes.data?.plan_expires_at ? new Date(profileRes.data.plan_expires_at) : null;
          if (lp && lpExp && lpExp > now) {
            const grants = LEGACY_PLAN_GRANTS[lp] || {};
            car = !!grants.car; moto = !!grants.moto; cdl = !!grants.cdl;
            pt = lp;
            exp = lpExp;
          }
        }

        setHasCar(car); setHasMoto(moto); setHasCdl(cdl);
        setIsPro(car || moto || cdl);
        setPlanType(pt);
        setPlanExpiresAt(exp);
      })
      .catch(() => clearAll());
  }, [user?.id, user?.email]);

  return (
    <AuthContext.Provider value={{
      user, isPro, hasCar, hasMoto, hasCdl,
      planType, planExpiresAt, activePasses, loading,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

// Silence linter for unused legacy helper reference
export { NEW_PASS_TO_CATEGORY };
