'use client';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { t } from '@/lib/translations';
import { getSavedLang } from '@/lib/lang';
import { stateToSlug } from '@/lib/states';
import { trackBeginCheckout, trackCheckoutError } from '@/lib/gtag';

// Two audit-driven nudges (2026-07 user audit), one slim bar, money case wins:
//
// 1. EXPIRY: an active pass ends within 7 days -> "extend +30 days, $9.99".
//    Passes were expiring silently; the only Extend button lived in /profile.
//    Dismissal is per-day, so the bar returns tomorrow while still relevant.
// 2. ACTIVATION: signed in, no pass, ZERO test sessions ever (86% of the
//    base at audit time) -> "start with 20 free questions". Dismissal is
//    permanent; the check self-mutes forever once any session exists.
//
// Skipped on /test (mid-test distraction), /admin and /success.

const HIDE_ON = ['/test', '/admin', '/success'];
const PASS_NAME_KEY = { moto: 'planMotoPass', auto: 'planAutoPass', cdl: 'planCdlPro' };

export default function EngagementBanners() {
  const { user, isPro, activePasses, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [lang, setLang] = useState('en');
  const [mode, setMode] = useState(null); // null | {kind:'expiry', passType, days} | {kind:'activation'}
  const [busy, setBusy] = useState(false);

  useEffect(() => { setLang(getSavedLang()); }, []);

  // Expiry candidate: soonest active pass ending within 7 days.
  useEffect(() => {
    if (loading || !user?.id) { setMode(null); return; }
    const now = Date.now();
    let best = null;
    for (const [passType, exp] of Object.entries(activePasses || {})) {
      const ms = new Date(exp).getTime() - now;
      if (ms <= 0) continue;
      const days = Math.ceil(ms / 86400000);
      if (days <= 7 && (!best || days < best.days)) best = { kind: 'expiry', passType, days };
    }
    if (best) {
      let dismissed = false;
      try { dismissed = localStorage.getItem('dmvsos_expiry_seen') === new Date().toISOString().slice(0, 10); } catch { /* blocked */ }
      setMode(dismissed ? null : best);
      return;
    }
    if (isPro) { setMode(null); return; }

    // Activation candidate: free account with zero sessions ever.
    let muted = false;
    try { muted = !!localStorage.getItem('dmvsos_activation_done'); } catch { muted = true; }
    if (muted) { setMode(null); return; }
    let cancelled = false;
    (async () => {
      const { count, error } = await supabase
        .from('test_sessions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id);
      if (cancelled || error) return;
      if (count > 0) {
        try { localStorage.setItem('dmvsos_activation_done', '1'); } catch { /* ignore */ }
        return;
      }
      setMode({ kind: 'activation' });
    })();
    return () => { cancelled = true; };
  }, [user?.id, isPro, activePasses, loading]);

  if (!mode || HIDE_ON.some(p => pathname?.startsWith(p))) return null;
  const tex = t[lang] || t.en;

  function dismiss() {
    try {
      if (mode.kind === 'expiry') localStorage.setItem('dmvsos_expiry_seen', new Date().toISOString().slice(0, 10));
      else localStorage.setItem('dmvsos_activation_done', 'dismissed');
    } catch { /* ignore */ }
    setMode(null);
  }

  async function extendNow() {
    if (busy) return;
    setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/create-checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ planType: 'extension', passType: mode.passType, lang }),
      });
      const data = await res.json();
      if (data?.url) {
        trackBeginCheckout(mode.passType, 'extension');
        window.location.href = data.url;
        return;
      }
      trackCheckoutError(res.status, 'expiry_banner');
      router.push(`/profile?lang=${lang}`);
    } catch {
      trackCheckoutError('network', 'expiry_banner');
      router.push(`/profile?lang=${lang}`);
    } finally {
      setBusy(false);
    }
  }

  function startFree() {
    let slug = null;
    try { slug = stateToSlug(localStorage.getItem('dmvsos_state') || '') || null; } catch { /* ignore */ }
    dismissActivationSoft();
    if (slug) router.push(`/test?state=${slug}&category=dmv&lang=${lang}`);
    else router.push(`/?lang=${lang}`);
  }

  // Starting the test is not "done" yet: only an actual finished session (or
  // an explicit dismiss) mutes the activation banner for good.
  function dismissActivationSoft() { setMode(null); }

  const isExpiry = mode.kind === 'expiry';
  const passName = isExpiry ? (tex[PASS_NAME_KEY[mode.passType]] || mode.passType) : null;
  const daysText = isExpiry
    ? (mode.days <= 1 ? tex.expiryToday : mode.days === 2 ? tex.expiryTomorrow : (tex.expiryInDays || '{n} days').replace('{n}', String(mode.days)))
    : null;

  return (
    <div className="fixed bottom-0 inset-x-0 z-40 px-3 pb-3 pointer-events-none">
      <div className="max-w-lg mx-auto pointer-events-auto rounded-2xl border shadow-2xl flex items-center gap-3 px-4 py-3"
        style={isExpiry
          ? { background: 'linear-gradient(135deg, #1a2f5c 0%, #0B1C3D 100%)', borderColor: 'rgba(245,158,11,0.45)' }
          : { background: 'linear-gradient(135deg, #10254D 0%, #0B1C3D 100%)', borderColor: 'rgba(255,255,255,0.15)' }}>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-white leading-snug">
            {isExpiry
              ? (tex.expiryBannerTitle || '{pass} ends {when}').replace('{pass}', passName).replace('{when}', daysText)
              : tex.activationBannerTitle}
          </p>
          <p className="text-xs text-[#94A3B8] mt-0.5">
            {isExpiry ? tex.expiryBannerBody : tex.activationBannerBody}
          </p>
        </div>
        <button type="button"
          onClick={isExpiry ? extendNow : startFree}
          className="shrink-0 px-4 py-2.5 rounded-xl text-sm font-bold whitespace-nowrap"
          style={isExpiry
            ? { background: 'linear-gradient(135deg, #FBBF24 0%, #F59E0B 55%, #D97706 100%)', color: '#0B1C3D' }
            : { background: 'linear-gradient(135deg, #3B82F6 0%, #2563EB 50%, #1D4ED8 100%)', color: '#fff' }}>
          {busy ? '…' : isExpiry ? tex.expiryBannerCta : tex.activationBannerCta}
        </button>
        <button type="button" aria-label="Dismiss" onClick={dismiss}
          className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-[#94A3B8] hover:text-white hover:bg-white/10">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
        </button>
      </div>
    </div>
  );
}
