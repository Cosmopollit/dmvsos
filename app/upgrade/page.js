'use client';
import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { t } from '@/lib/translations';
import { getSavedLang, saveLang } from '@/lib/lang';
import { PASS_META } from '@/lib/plans';
import { examRulesFor, passPercentFor } from '@/lib/exam-rules';
import { agencyAbbrForState, AGENCY_FULL_NAMES } from '@/lib/agencies';
import { questionCountForState, questionCountForStateCategory } from '@/lib/state-question-counts';
import { trackBeginCheckout, trackCheckoutError } from '@/lib/gtag';
import { useExperiment } from '@/lib/experiments';
import SupportFooter from '@/app/components/SupportFooter';
import GradientButton from '@/app/components/GradientButton';

const langs = [
  { label: 'EN', code: 'en' },
  { label: 'RU', code: 'ru' },
  { label: 'ES', code: 'es' },
  { label: 'ZH', code: 'zh' },
  { label: 'UA', code: 'ua' },
];

function UpgradeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, hasCar, hasMoto, hasCdl } = useAuth();
  useExperiment('upgrade_visit', user?.id);
  const [lang, setLangState] = useState(searchParams.get('lang') || getSavedLang());
  // useSearchParams can be empty on the very first render (Suspense
  // hydration), so the useState seed above may fall back to the saved lang
  // and stick — an explicit ?lang= link then silently loses to localStorage.
  // Re-sync once params resolve: the URL wins.
  useEffect(() => {
    const p = searchParams.get('lang');
    if (p && t[p] && p !== lang) setLangState(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);
  const [showLangMenu, setShowLangMenu] = useState(false);
  const currentLang = langs.find(l => l.code === lang) || langs[0];
  function switchLang(code) { setLangState(code); saveLang(code); setShowLangMenu(false); }
  const preselect = searchParams.get('plan');
  const tex = t[lang] || t.en;

  // The buyer's context: the home selector persists his state, so the money
  // page can sell HIS bank ("565 Texas questions, your access 3.5%") instead
  // of a generic three-card catalog. Free-tier-only per the base-access rule;
  // read after mount (localStorage, guarded).
  const [ctxState, setCtxState] = useState(null);
  useEffect(() => {
    try {
      const s = localStorage.getItem('dmvsos_state');
      if (s && questionCountForState(s)) setCtxState(s);
    } catch { /* blocked storage: generic catalog */ }
  }, []);
  // Category context for the whole page: the explicit plan param wins, else
  // Car (the dominant journey). Drives the terminal AND the card order.
  const ctxPlanId = ['onetime_moto', 'onetime_cdl'].includes(preselect) ? preselect : 'onetime_auto';
  const showTerminal = !!ctxState && !hasCar && !hasMoto && !hasCdl;

  const [loadingPlan, setLoadingPlan] = useState(null);
  // Per-card notice rendered right under the tapped Buy button (the old global
  // error line sat below the bureaucracy block — off-screen on mobile, so a
  // failed tap looked like "nothing happened"). type: 'error' | 'owned'.
  const [cardNotice, setCardNotice] = useState(null);
  // Guard against the auto-resume effect firing more than once on the same
  // mount. Without this, if React StrictMode double-invokes effects in dev,
  // we'd issue two checkout-session-create calls in a row.
  const autoCheckoutFiredRef = useRef(false);

  // Prices, IDs, icons, badges — single source of truth: lib/plans.js.
  // Translations and CTA labels still come from tex (lib/translations.js).
  const plans = [
    {
      ...PASS_META.moto,
      img: '/vehicles/moto-hero.png',
      name: tex.planMotoPass,
      duration: tex.planDuration,
      features: tex.featMoto,
      btnLabel: tex.planGetMoto,
    },
    {
      ...PASS_META.auto,
      img: '/vehicles/mustang.png',
      name: tex.planAutoPass,
      duration: tex.planDuration,
      badge: tex.mostPopular,
      features: tex.featCar,
      btnLabel: tex.planGetAuto,
    },
    {
      ...PASS_META.cdl,
      img: '/vehicles/truck-hero.png',
      name: tex.planCdlPro,
      duration: tex.planDuration,
      badge: tex.planCdlBadge || 'Car tests included',
      features: tex.featCdl,
      btnLabel: tex.planGetCdl,
    },
  ];

  async function handleCheckout(planId) {
    // Login-before-purchase gate. The pricing page itself stays public so
    // Google/Bing/AI crawlers and curious visitors can read prices and plan
    // features, but the actual "Buy" action requires a verified email. This
    // prevents the entire class of checkout-email-typo failures that put
    // user purchases on phantom auth.users tied to misspelled emails (Galina
    // case 2026-06-06: paid as galina.sarana.by@gmail.com — a typo of her
    // real galina.sarana@gmail.com — and lost access until manual recovery).
    // After login the user lands back on /upgrade with their selected plan
    // pre-highlighted and Stripe receives the verified email from session.
    if (!user) {
      // After login, return to /upgrade with the plan still selected and
      // intent=checkout flagged so the auto-resume effect below fires Stripe
      // checkout without the user having to click Buy twice. The intent flag
      // lives INSIDE the `next` value (not as a sibling) so /login forwards
      // it intact when it does router.push(safeInternalPath(next)).
      const next = `/upgrade?plan=${planId}&lang=${lang}&intent=checkout`;
      router.push(`/login?next=${encodeURIComponent(next)}&lang=${lang}`);
      return;
    }
    setLoadingPlan(planId);
    setCardNotice(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const fetchOpts = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Pass current UI lang so the API can localize Stripe Checkout
        // (Stripe defaults to English-via-browser when locale is not set).
        body: JSON.stringify({ planType: planId, lang }),
      };
      if (session?.access_token) {
        fetchOpts.headers['Authorization'] = `Bearer ${session.access_token}`;
      }
      const res = await fetch('/api/create-checkout', fetchOpts);
      // Stale cached session: the server rejected the token. Re-login and
      // come back with the checkout intent intact (mirrors the not-logged-in
      // branch above) instead of dead-ending on a generic error.
      if (res.status === 401) {
        trackCheckoutError(401, 'upgrade');
        const next = `/upgrade?plan=${planId}&lang=${lang}&intent=checkout`;
        router.push(`/login?next=${encodeURIComponent(next)}&lang=${lang}`);
        return;
      }
      const data = await res.json();
      // User already owns this type → explain it in the card (a silent redirect
      // to /profile read as "the button is broken").
      if (res.status === 409 && data?.error === 'pass_already_active') {
        setCardNotice({ planId, type: 'owned' });
        return;
      }
      if (data?.url) {
        // Funnel step fires only once we're actually sending the user to Stripe
        // (not on the 409 own-already / error paths). planId is onetime_<type>.
        trackBeginCheckout(planId.replace('onetime_', ''), 'new');
        window.location.href = data.url;
      } else {
        trackCheckoutError(res.status, 'upgrade');
        setCardNotice({ planId, type: 'error' });
      }
    } catch {
      trackCheckoutError('network', 'upgrade');
      setCardNotice({ planId, type: 'error' });
    } finally {
      setLoadingPlan(null);
    }
  }

  // Auto-resume checkout after login redirect. When an anonymous user clicks
  // "Buy", they're sent to /login with ?next=/upgrade?plan=X&intent=checkout.
  // After login they're routed back here (password sign-in via router.push;
  // OAuth via the sessionStorage `postLoginRedirect` round-trip handled in
  // AuthContext). Detect that case (signed-in + the intent flag + a
  // preselected plan) and fire the Stripe checkout automatically so the
  // user doesn't have to click "Buy" a second time.
  useEffect(() => {
    if (autoCheckoutFiredRef.current) return;
    if (!user) return;
    if (searchParams.get('intent') !== 'checkout') return;
    if (!preselect) return;
    autoCheckoutFiredRef.current = true;
    // Disarm the history entry: Back from Stripe re-mounts this page with the
    // same URL, and a live `intent` param would re-launch Stripe checkout.
    const params = new URLSearchParams(searchParams.toString());
    params.delete('intent');
    router.replace(`/upgrade?${params.toString()}`, { scroll: false });
    handleCheckout(preselect);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, preselect]);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 relative"
      style={{ background: 'linear-gradient(180deg, #0A1A38 0%, #0B1C3D 45%, #071021 100%)' }}>
      {/* Depth layer: a flat navy read as unfinished. Two soft radial glows
          (cool up top, a warm hint low near the pricing) in a clipped layer —
          clipping stays OFF the content so badges/dropdowns never get cut. */}
      <div aria-hidden="true" className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-48 left-1/2 -translate-x-1/2 w-[720px] h-[720px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(37,99,235,0.16) 0%, transparent 65%)' }} />
        <div className="absolute -bottom-56 -right-40 w-[560px] h-[560px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(245,158,11,0.07) 0%, transparent 70%)' }} />
      </div>

      {/* Lang switcher */}
      <div className="absolute top-4 right-4 z-10">
        <div className="relative">
          <button type="button" onClick={() => setShowLangMenu(v => !v)} onBlur={() => setTimeout(() => setShowLangMenu(false), 150)}
            className="flex items-center gap-1 text-xs font-semibold text-white bg-white/10 border border-white/20 rounded-full px-2.5 py-1.5 hover:border-white/40 transition-colors">
            <span>{currentLang.label}</span><svg width="9" height="9" viewBox="0 0 12 12" className="ml-0.5" style={{ fill: 'rgba(255,255,255,0.5)' }}><path d="M6 8L1 3h10z" /></svg>
          </button>
          {showLangMenu && (
            <div className="absolute right-0 top-full mt-1 bg-[#13284d] border border-white/15 rounded-xl shadow-lg z-50 py-1 min-w-[90px]">
              {langs.map(l => (
                <button key={l.code} type="button" onMouseDown={() => switchLang(l.code)}
                  className={`w-full text-left px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 hover:bg-white/10 transition-colors ${lang === l.code ? 'text-[#F59E0B]' : 'text-[#94A3B8]'}`}>
                  <span>{l.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Logo */}
      <Link href="/" className="inline-block">
        <div className="flex items-center gap-3 mb-8 cursor-pointer hover:opacity-80">
          <Image src="/logo.png" alt="DMVSOS" width={36} height={36} className="rounded-lg" />
          <span className="text-xl font-bold text-white" style={{ letterSpacing: '-0.02em' }}>DMVSOS</span>
        </div>
      </Link>

      {/* Hero */}
      <div className="text-center mb-6 max-w-lg">
        <h1 className="text-3xl font-bold text-white mb-3">
          {(tex.upgradeHero || 'Practice tonight.\nPass tomorrow.').split('\n').map((line, i, arr) => (
            <span key={i}>{line}{i < arr.length - 1 ? <br /> : null}</span>
          ))}
        </h1>
        <p className="text-[#94A3B8] text-base">{tex.upgradeSubtext}</p>
      </div>

      {/* Coverage tagline. Replaces the older 3-column "35K+ / 50 / 5"
          stats grid. Same facts, one confident line — emphasis via bold
          rather than ALL CAPS, per brand voice. */}
      <p className="text-sm sm:text-[15px] text-white/90 text-center mb-6 max-w-md font-medium tracking-tight">
        <span className="font-bold text-[#F59E0B]">{tex.statsLine?.split(' ')[0] || 'All'}</span>{' '}
        {(tex.statsLine || 'All 25,000+ questions · 5 languages · all 50 states').split(' ').slice(1).join(' ')}
      </p>

      {/* Personal terminal header: continues the paywall's "open the bank"
          story on the money page with the buyer's own facts — his state's
          agency + exam format (competence) and his real access share. All
          numbers live (state-question-counts manifest + exam-rules). Free
          users only: the base game drops entirely once he buys. */}
      {showTerminal && (() => {
        // ONE coherent story: the terminal shows the bank of the category the
        // buyer is actually preparing for, and solves it with the gold CTA
        // right there — a meter with no action reads as a lost infographic.
        // Numbers are the CATEGORY bank, so what the meter shows is exactly
        // what the button buys.
        const catForRules = ctxPlanId === 'onetime_moto' ? 'motorcycle' : ctxPlanId === 'onetime_cdl' ? 'cdl' : 'car';
        const rule = examRulesFor(ctxState, catForRules);
        const passPct = passPercentFor(ctxState, catForRules);
        const bank = questionCountForStateCategory(ctxState, catForRules) || questionCountForState(ctxState);
        const ctxPlan = plans.find(p => p.id === ctxPlanId);
        const seen = Math.min(ctxPlanId === 'onetime_moto' ? 5 : 20, bank);
        const pct = Math.max(0.1, Math.round((seen / bank) * 1000) / 10);
        const stateName = ctxState.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
        const catLabel = ctxPlanId === 'onetime_moto' ? (tex.catMoto || 'Motorcycle')
          : ctxPlanId === 'onetime_cdl' ? (tex.catCdl || 'Truck (CDL)') : (tex.catCar || 'Car');
        const nf = bank.toLocaleString('en-US');
        return (
          // Department-document card: paper body + institutional navy header
          // strip with a seal — the layout language of an agency portal, with
          // honest wording (it's OUR bank's registry, no gov claim).
          <div className="w-full max-w-2xl mb-6 rounded-xl border border-[#CBD5E1] text-left shadow-xl overflow-hidden bg-white">
            <div className="flex items-center gap-3.5 px-5 py-3.5" style={{ background: '#0B1C3D' }}>
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" className="shrink-0" aria-hidden="true">
                <circle cx="12" cy="12" r="10.2" stroke="#F59E0B" strokeWidth="1.4" />
                <circle cx="12" cy="12" r="7.6" stroke="#F59E0B" strokeWidth="1" strokeDasharray="1.6 2.2" />
                <path d="M12 7.2l1.35 2.74 3.02.44-2.18 2.13.51 3.01L12 14.1l-2.7 1.42.51-3.01-2.18-2.13 3.02-.44L12 7.2z" fill="#F59E0B" />
              </svg>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] tracking-[0.18em] uppercase text-[#93B4E7] font-semibold">
                  DMVSOS · {(tex.offBankLabel || 'Question bank')}
                </div>
                <div className="text-white font-bold text-[15px] leading-tight truncate mt-0.5 uppercase tracking-wide">
                  {stateName} · {catLabel}
                </div>
              </div>
            </div>
            <div className="px-5 pt-2 pb-5">
              {/* Registry lookup, row by row (BeenVerified-style ceremony in an
                  administrative tone): each line reports "Checking..." then the
                  found value. All values are live data; the theater is only in
                  the pacing. STAGGER = seconds between rows; values resolve
                  RESOLVE seconds after their row appears. */}
              {(() => {
                const abbr = agencyAbbrForState(ctxState);
                const scanRows = [
                  { label: tex.offJurisdiction || 'Jurisdiction',
                    value: AGENCY_FULL_NAMES[abbr] ? `${abbr} · ${AGENCY_FULL_NAMES[abbr]}` : abbr },
                  ...(rule?.questions && passPct ? [{
                    label: tex.offExamLabel || 'Exam',
                    value: `${rule.questions} ${tex.modeQuestions || 'questions'} · ${passPct}%` }] : []),
                  { label: tex.offBankLabel || 'Question bank',
                    value: (tex.offRecordsFound || '{n} records found').replace('{n}', nf), strong: true },
                  { label: tex.offLangsLabel || 'Languages',
                    value: '5 · EN RU ES 中文 UA' },
                ];
                const STAGGER = 0.5, RESOLVE = 0.65;
                return scanRows.map((row, i) => (
                  <div key={row.label} className="off-row flex items-baseline gap-2 py-2.5 border-b border-[#EEF2F7] text-sm"
                    style={{ animationDelay: `${i * STAGGER}s` }}>
                    <span className="text-[#64748B] shrink-0">{row.label}</span>
                    {/* Form-style dotted leader between label and value. */}
                    <span aria-hidden="true" className="flex-1 self-center border-b border-dotted border-[#CBD5E1] min-w-[16px] translate-y-[3px]" />
                    <span className="relative text-right min-w-0">
                      <span className="off-checking absolute right-0 top-0 inline-flex items-center gap-1.5 text-[#94A3B8] whitespace-nowrap"
                        style={{ animationDelay: `${i * STAGGER + RESOLVE}s` }}>
                        <span className="w-3 h-3 rounded-full border-2 border-[#94A3B8] border-t-transparent animate-spin shrink-0" />
                        <span className="italic">{tex.offChecking || 'Checking...'}</span>
                      </span>
                      <span className={`off-value inline-flex items-baseline gap-1.5 ${row.strong ? 'text-[#B45309]' : 'text-[#0B1C3D]'} font-semibold`}
                        style={{ animationDelay: `${i * STAGGER + RESOLVE}s` }}>
                        <svg width="12" height="12" viewBox="0 0 16 16" className="shrink-0 self-center" aria-hidden="true">
                          <circle cx="8" cy="8" r="8" fill="#16A34A" />
                          <path d="M4.5 8l2.2 2.2L11.5 5.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                        </svg>
                        <span>{row.value}</span>
                      </span>
                    </span>
                  </div>
                ));
              })()}
              <div className="off-row pt-2.5" style={{ animationDelay: '2.2s' }}>
                <div className="flex items-baseline justify-between gap-4 text-sm mb-2">
                  <span className="text-[#64748B] shrink-0">{tex.offAccessLabel || 'Your access'}</span>
                  <span className="text-[#0B1C3D] font-semibold">
                    {seen} / {nf} · <span className="text-[#B45309] font-bold">{pct}%</span>
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-[#E2E8F0] overflow-hidden">
                  <div className="h-full rounded-full bg-[#F59E0B]" style={{ width: `${Math.max(2, pct)}%` }} />
                </div>
              </div>
              {/* The answer to the meter, right where the problem is shown:
                  buys exactly the bank counted above. */}
              <div className="off-row mt-5" style={{ animationDelay: '2.6s' }}>
                <GradientButton
                  variant="gold"
                  onClick={() => handleCheckout(ctxPlanId)}
                  className={loadingPlan !== null ? 'pointer-events-none opacity-60' : ''}>
                  <span className="text-[15px]">
                    {loadingPlan === ctxPlanId ? '…' : (tex.termUnlockCta || 'Unlock all {n} questions · {price}')
                      .replace('{n}', String(bank))
                      .replace('{price}', ctxPlan?.price || '')}
                  </span>
                </GradientButton>
                {cardNotice?.planId === ctxPlanId && cardNotice.type === 'error' && (
                  <p className="mt-2 text-xs text-center font-medium text-[#DC2626]">
                    {tex.checkoutError || 'Something went wrong. Please try again.'}
                  </p>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* 3 Plan cards */}
      <div className="w-full max-w-2xl flex flex-col sm:flex-row gap-4 mb-6">
        {plans.map((plan) => {
          const isPreselected = preselect === plan.id;
          // Already own this category? Show an Active state instead of a Buy
          // button (the server also blocks the purchase with a 409, but the UI
          // shouldn't pitch a paid user something they already have).
          const owned = { moto: hasMoto, auto: hasCar, cdl: hasCdl }[plan.pass_type];
          const isBlue = plan.style === 'blue';
          const isGold = plan.style === 'gold';
          // The flagship "Most popular" card (Auto) gets the app-style
          // emphasis: a subtle surface gradient + a slow shine sweep, reusing
          // the existing gradient-btn-shine keyframe. Plan order, features,
          // prices, and the badge are untouched.
          const isMostPopular = plan.badge === tex.mostPopular;
          return (
            <div
              key={plan.id}
              className={`flex-1 rounded-2xl p-5 flex flex-col relative shadow-xl w-full max-w-[420px] mx-auto sm:max-w-none sm:mx-0 ${
                showTerminal && plan.id === ctxPlanId ? 'order-first sm:order-none ' : ''
              }${
                isGold
                  ? 'border-2 border-[#F59E0B]'
                  : isBlue
                  ? 'border-2 border-[#2563EB]'
                  : 'border border-[#E2E8F0]'
              } ${isPreselected ? 'ring-2 ring-offset-2 ring-offset-[#0B1C3D] ring-[#F59E0B]' : ''}`}
              style={isMostPopular
                ? { background: 'linear-gradient(160deg, #FFFFFF 0%, #F4F8FF 100%)' }
                : { background: '#FFFFFF' }}
            >
              {/* Shine lives in its own clipped layer: overflow-hidden on the
                  CARD was cutting the -top-3 badges in half (Most popular /
                  Car tests included) — same clipping class of bug as the
                  state-landing language dropdown. */}
              {isMostPopular && (
                <span aria-hidden="true" className="absolute inset-0 overflow-hidden rounded-2xl pointer-events-none">
                  <span className="gradient-btn-shine absolute inset-y-0 -left-1/2 w-1/2" />
                </span>
              )}
              {plan.badge && (
                <span className={`absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] font-bold px-3 py-1 rounded-full whitespace-nowrap ${
                  isGold ? 'bg-[#F59E0B] text-[#0B1C3D]' : 'bg-[#2563EB] text-white'
                }`}>
                  {plan.badge}
                </span>
              )}
              <div className="h-[78px] flex items-center justify-center mt-1 mb-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={plan.img} alt="" aria-hidden="true" className="max-h-[74px] w-auto object-contain" />
              </div>
              <div className="text-sm font-bold mb-1" style={{ color: isGold ? '#B45309' : isBlue ? '#2563EB' : '#D97706' }}>
                {plan.name}
              </div>
              <div className="text-3xl font-black mb-0.5 text-[#0B1C3D]">{plan.price}</div>
              <div className="text-xs text-[#64748B]">{plan.duration}</div>
              <div className="text-[10px] mb-4 mt-0.5 text-[#94A3B8]">{tex.extensionHint}</div>
              <ul className="space-y-2 mb-5 flex-1">
                {plan.features.filter(f => lang !== 'en' || !/🌐/u.test(f)).map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-[#475569]">
                    <svg width="15" height="15" viewBox="0 0 16 16" className="shrink-0 mt-0.5">
                      <circle cx="8" cy="8" r="8" fill="#16A34A" />
                      <path d="M4.5 8l2.2 2.2L11.5 5.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                    </svg>
                    {/* Per-state agency rule: with a known buyer state, the
                        generic "DMV" in feature copy becomes his real agency
                        (a Texan reads "DPS exam simulation", not DMV). */}
                    <span>{(() => {
                      const clean = String(f).replace(/^[^\p{L}\p{N}]+/u, '');
                      return ctxState ? clean.replace(/\bDMV\b/g, agencyAbbrForState(ctxState)) : clean;
                    })()}</span>
                  </li>
                ))}
              </ul>
              {owned ? (
                <div className="mt-auto">
                  <div className="flex items-center justify-center gap-1.5 mb-2 text-[#15803D] font-bold text-sm">
                    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="8" fill="#16A34A" /><path d="M4.5 8l2.2 2.2L11.5 5.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" /></svg>
                    {tex.planActive || 'Active'}
                  </div>
                  <Link href="/profile" className="block w-full text-center py-3.5 rounded-2xl font-bold text-sm bg-[#F0FDF4] text-[#15803D] border-[1.5px] border-[#16A34A] hover:bg-[#DCFCE7] transition-all">
                    {tex.planManage || 'Manage / Extend'}
                  </Link>
                </div>
              ) : (
                <GradientButton
                  variant={isGold ? 'gold' : 'blue'}
                  onClick={() => handleCheckout(plan.id)}
                  className={`text-sm ${loadingPlan !== null ? 'pointer-events-none opacity-60' : ''}`}
                >
                  {loadingPlan === plan.id ? '…' : plan.btnLabel}
                </GradientButton>
              )}
              {/* Inline notice right under the tapped button — visible where
                  the user is looking, instead of a line below the fold. */}
              {cardNotice?.planId === plan.id && (
                cardNotice.type === 'owned' ? (
                  <p className="mt-2 text-xs text-center font-medium text-[#16A34A]">
                    {tex.alreadyOwnPass || 'You already have this pass.'}{' '}
                    <Link href="/profile" className="underline font-semibold">{tex.planManage || 'Manage / Extend'}</Link>
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-center font-medium text-[#DC2626]">
                    {tex.checkoutError || 'Something went wrong. Please try again.'}
                  </p>
                )
              )}
            </div>
          );
        })}
      </div>

      {/* Price anchor — factual comparison, no fear copy, no guarantees. */}
      <p className="text-center text-xs text-[#94A3B8] -mt-2 mb-5">
        {tex.priceAnchor || 'Less than a single driving lesson'}
      </p>

      {/* Free tier chip — demoted BELOW the plans: people arriving with buy
          intent used to see the free exit as the first interactive element. */}
      <Link href={`/?lang=${lang}`} className="w-full max-w-2xl mb-5 rounded-2xl p-4 border border-white/10 bg-white/5 flex items-center gap-4 cursor-pointer hover:bg-white/10 hover:border-white/20 transition-colors">
        <svg width="22" height="22" viewBox="0 0 24 24" className="shrink-0" style={{ fill: '#16A34A' }}><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" /></svg>
        <div className="flex-1">
          <div className="text-sm font-bold text-white">{tex.freePracticeLabel}</div>
          <div className="text-xs text-[#94A3B8] mt-0.5">{tex.freePracticeDesc}</div>
        </div>
        <span className="text-xs font-semibold text-[#16A34A] bg-[#16A34A]/10 px-2.5 py-1 rounded-full border border-[#16A34A]/20 shrink-0">
          {tex.freePracticePrice}
        </span>
      </Link>

      {/* CDL endorsements teaser */}
      <div className="w-full max-w-2xl mb-5 rounded-2xl p-4 border border-white/10 bg-white/5 text-center">
        <div className="text-xs text-[#94A3B8]">
          <span className="text-white font-semibold">{tex.planCdlPro}</span> ·
          <span className="text-[#F59E0B] font-medium"> {tex.endorsementsSoon}</span>
          {' '}({tex.endorsementsList})
        </div>
      </div>

      {/* Bureaucracy help · warm reassurance block. We sell more than tests;
          the pass also unlocks human guidance through the license process
          (docs, scheduling, exam day, support). Reinforces brand mission of
          helping with US bureaucracy, especially for non-native speakers. */}
      <div className="w-full max-w-2xl mb-6 rounded-2xl p-5 sm:p-6 border border-[#F59E0B]/30"
        style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.08) 0%, rgba(37,99,235,0.06) 100%)' }}>
        <div className="flex items-start gap-3 mb-3">
          {/* Route glyph: we guide you along the path (was a generic dial). */}
          <svg width="24" height="24" viewBox="0 0 24 24" className="shrink-0 mt-0.5" fill="none" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="5" cy="19" r="2.2" />
            <circle cx="19" cy="5" r="2.2" />
            <path d="M7 17.5C11 14 8.5 10.5 12 8.5c2.2-1.3 4-1 5-1.5" />
          </svg>
          <div>
            <h3 className="text-base font-bold text-white leading-tight">
              {tex.bureaucracyHelpTitle || 'Getting your license can be confusing'}
            </h3>
            <p className="text-sm text-[#94A3B8] mt-1.5">
              {tex.bureaucracyHelpIntro || 'With a pass, you get more than tests. We guide you through the whole process.'}
            </p>
          </div>
        </div>
        {/* One meaning-bearing glyph per line (document / calendar / exam
            sheet / chat) — four identical check bullets read as filler. */}
        <ul className="flex flex-col gap-2.5 mt-4 ml-9">
          {[
            { label: tex.bureaucracyHelpDocs || 'What documents to bring',
              icon: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /><path d="M9 13h6M9 17h4" /></> },
            { label: tex.bureaucracyHelpSchedule || 'Where and how to schedule your exam',
              icon: <><rect x="4" y="5" width="16" height="16" rx="2" /><path d="M8 3v4M16 3v4M4 10h16" /><path d="M9.5 15.5l2 2 3.5-3.5" /></> },
            { label: tex.bureaucracyHelpExpect || 'What to expect on exam day',
              icon: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4.5V3h6v1.5" /><path d="M9 10h6M9 13.5h6M9 17h3.5" /></> },
            { label: tex.bureaucracyHelpAsk || 'Got questions? Ask us anytime',
              icon: <><path d="M21 12a8 8 0 0 1-8 8H4l2.3-2.9A8 8 0 1 1 21 12z" /><path d="M9.5 10.2a2.5 2.5 0 1 1 3.4 2.3c-.7.3-.9.7-.9 1.5" /><path d="M12 17h.01" /></> },
          ].map(({ label, icon }, i) => (
            <li key={i} className="flex items-center gap-3 text-sm text-[#94A3B8]">
              <span className="w-8 h-8 rounded-lg shrink-0 flex items-center justify-center border border-white/10 bg-white/[0.06]">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{icon}</svg>
              </span>
              <span>{label}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* No refund or guarantee claims anywhere: there is no pass guarantee,
          no money-back, no 24h refund, on any plan. All sales are final. */}

      <p className="text-center text-xs text-[#64748B] mb-6">
        {tex.cancelAnytime || 'One-time payment · 30 days · No subscription'}
      </p>

      <button type="button" onClick={() => router.push('/')} className="text-[#94A3B8] text-sm hover:text-white">
        {tex.back}
      </button>

      <SupportFooter lang={lang} dark={true} />
    </main>
  );
}

export default function Upgrade() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-[#0B1C3D] flex items-center justify-center"><div className="w-6 h-6 border-2 border-[#94A3B8] border-t-transparent rounded-full animate-spin" /></main>}>
      <UpgradeContent />
    </Suspense>
  );
}
