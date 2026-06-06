'use client';
import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from './supabase';
import { getSavedLang } from './lang';
import { safeInternalPath } from './safeNext';

const AuthContext = createContext({
  user: null,
  isPro: false,
  hasCar: false, hasMoto: false, hasCdl: false,
  planType: null,
  planExpiresAt: null,
  activePasses: {}, // { moto: ExpiresAt, auto: ExpiresAt, cdl: ExpiresAt }
  loading: true,
  refreshPasses: async () => false,
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

  // Single source of truth for "what does this user own". Pulls passes via
  // /api/account/passes — a server endpoint that unions active_passes across
  // every auth.users.id sharing this email, so a user who signed up with
  // email/password AND paid via Google OAuth (separate auth.users.id) still
  // sees Pro. Returns true if any active pass (or legacy plan) was found, so
  // the post-login poller below knows whether to keep retrying through the
  // webhook-processing window.
  const fetchPasses = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { clearAll(); return false; }

      const res = await fetch('/api/account/passes', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { return false; } // transient — don't wipe a known-good state

      const data = await res.json();
      const now = new Date();
      const passes = {};
      let maxExpires = null;
      let latestType = null;
      for (const row of data.active_passes || []) {
        const exp = new Date(row.expires_at);
        if (exp > now) {
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
      return car || moto || cdl;
    } catch {
      return false;
    }
  }, []);

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

  // Fetch passes whenever the signed-in identity changes. Then, ONLY when a
  // payment just completed, poll a few times to close the post-payment race:
  // a user lands logged-in via the /success magic-link before the Stripe
  // webhook has finished writing active_passes (cold starts can exceed the
  // /success 4s wait). Without the poll, AuthContext cached "free" and the
  // user saw the paywall right after paying until a hard refresh (Galina).
  //
  // The poll is gated behind the dmvsos_just_paid sessionStorage flag (set by
  // /success). Otherwise every free user would hammer /api/account/passes —
  // which scans the whole user table to union same-email passes — four times
  // on every single page load, for nothing. Free browsing stays one call.
  useEffect(() => {
    if (!user?.id || !user?.email) return;
    let cancelled = false;
    const timers = [];
    (async () => {
      const found = await fetchPasses();
      if (cancelled || found) return;

      let justPaid = false;
      try { justPaid = sessionStorage.getItem('dmvsos_just_paid') === '1'; } catch { /* private mode */ }
      if (!justPaid) return;
      try { sessionStorage.removeItem('dmvsos_just_paid'); } catch { /* ignore */ }

      const delays = [2000, 4000, 8000];
      for (const d of delays) {
        await new Promise(r => { const t = setTimeout(r, d); timers.push(t); });
        if (cancelled) return;
        const got = await fetchPasses();
        if (cancelled || got) return;
      }
    })();
    return () => { cancelled = true; timers.forEach(clearTimeout); };
  }, [user?.id, user?.email, fetchPasses]);

  // Re-fetch when the tab regains focus. Covers the case where pass state
  // changed server-side while the tab sat in the background (admin grant,
  // a purchase completed in another tab, expiry crossing). Without this an
  // open tab kept showing stale "free" until a full reload. Throttled to at
  // most once per 30s so rapid alt-tabbing can't hammer /api/account/passes
  // (which does a full user-table scan per call).
  const lastVisibleFetchRef = useRef(0);
  useEffect(() => {
    if (!user?.id) return;
    function onVisible() {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - lastVisibleFetchRef.current < 30000) return;
      lastVisibleFetchRef.current = now;
      fetchPasses();
    }
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [user?.id, fetchPasses]);

  // Consume the post-OAuth redirect target. OAuth lands on the bare origin
  // (the only whitelisted Supabase redirect), so /login stashes the intended
  // ?next in sessionStorage before kicking off the provider flow. Once the
  // session resolves here, navigate there once. Email/password logins don't
  // use this path — they router.push(next) directly — so there's no
  // double-handling.
  const consumedRedirectRef = useRef(false);
  useEffect(() => {
    if (!user?.id || consumedRedirectRef.current) return;
    let target = null;
    try { target = sessionStorage.getItem('postLoginRedirect'); } catch { /* private mode */ }
    if (!target) return;
    consumedRedirectRef.current = true;
    try { sessionStorage.removeItem('postLoginRedirect'); } catch { /* ignore */ }
    const safe = safeInternalPath(target, '/');
    if (safe && safe !== '/') {
      // Full navigation so the destination (e.g. /upgrade) mounts fresh with
      // the resolved session and its own auto-resume effect can fire.
      window.location.assign(safe);
    }
  }, [user?.id]);

  return (
    <AuthContext.Provider value={{
      user, isPro, hasCar, hasMoto, hasCdl,
      planType, planExpiresAt, activePasses, loading,
      refreshPasses: fetchPasses,
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
