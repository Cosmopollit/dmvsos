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

    // Pull passes via /api/account/passes — a server endpoint that
    // unions active_passes across every auth.users.id sharing this
    // email. This way a user who signed up with email/password and
    // also paid via Google OAuth (separate auth.users.id) still sees
    // their Pro status. profiles fallback for legacy subscription
    // holders is handled inside the same endpoint.
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) { if (!cancelled) clearAll(); return; }

        const res = await fetch('/api/account/passes', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) { if (!cancelled) clearAll(); return; }
        const data = await res.json();
        if (cancelled) return;

        const now = new Date();
        const passes = {};
        let maxExpires = null;
        let latestType = null;
        for (const row of data.active_passes || []) {
          const exp = new Date(row.expires_at);
          if (exp > now) {
            // Keep the latest expiry per pass_type (in case duplicates exist
            // across user_ids — pick the longest-lived one).
            if (!passes[row.pass_type] || exp > passes[row.pass_type]) {
              passes[row.pass_type] = exp;
            }
            if (!maxExpires || exp > maxExpires) {
              maxExpires = exp;
              latestType = row.pass_type;
            }
          }
        }
        setActivePasses(passes);

        let car = !!passes.auto;
        let moto = !!passes.moto;
        let cdl = !!passes.cdl;
        let pt = latestType;
        let exp = maxExpires;

        if (!car && !moto && !cdl) {
          const lp = data.legacy_profile?.plan_type ?? null;
          const lpExp = data.legacy_profile?.plan_expires_at ? new Date(data.legacy_profile.plan_expires_at) : null;
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
      } catch { if (!cancelled) clearAll(); }
    })();
    return () => { cancelled = true; };
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
