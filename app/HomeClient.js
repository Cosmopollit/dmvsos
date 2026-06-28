'use client';
import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { t } from '@/lib/translations';
import { getSavedLang, saveLang, hasSavedLang, detectBrowserLang, isLangBannerDismissed, dismissLangBanner } from '@/lib/lang';
import { STATE_OPTIONS, stateToSlug } from '@/lib/states';
import { flags } from '@/lib/flags';
import { PASS_META, EXTENSION } from '@/lib/plans';
import { agencyAbbrForState } from '@/lib/agencies';
import { useExperiment } from '@/lib/experiments';
import SupportFooter from '@/app/components/SupportFooter';
import WelcomeBanner from '@/app/components/WelcomeBanner';
import BreakButton from '@/app/components/BreakButton';

// Category illustrations live in /public/vehicles (transparent PNGs, same art
// used in the mobile app for a consistent look across web + native).

const codeToName = { en: 'English', ru: 'Русский', es: 'Español', zh: '中文', ua: 'Українська' };

export default function HomeClient({ initialLang = 'en' }) {
  const { user, isPro, planType } = useAuth();
  useExperiment('home_visit', user?.id);
  // A/B the hero headline (v1 control / v2 uniqueness / v3 confidence). Starts
  // on v1, switches to the assigned variant after mount — see useExperiment.
  const heroVariant = useExperiment('hero_copy', user?.id);
  // Seed from the server-read cookie (initialLang) so SSR and the first client
  // render agree — reading localStorage in the initializer would desync the two
  // and trip a hydration mismatch on the flag SVG. localStorage is reconciled
  // after mount in the effect below (no-op when it already matches the cookie).
  const [lang, setLang] = useState(() => codeToName[initialLang] || 'English');
  const [state, setState] = useState('');
  const [liveCount] = useState(() => Math.floor(Math.random() * 60) + 110);
  const [showLangMenu, setShowLangMenu] = useState(false);
  const stateSelectRef = useRef(null);
  const router = useRouter();

  const langToCode = { English: 'en', 'Русский': 'ru', 'Español': 'es', '中文': 'zh', 'Українська': 'ua' };
  const langCode = langToCode[lang] || 'en';
  const tex = t[langCode] || t.en;
  const heroTitleText = heroVariant === 'v2' ? (tex.heroTitleB || tex.heroTitle)
    : heroVariant === 'v3' ? (tex.heroTitleC || tex.heroTitle)
    : tex.heroTitle;

  // ?lang=xx in URL (e.g. from a Google hreflang result) overrides the saved lang.
  // Also pre-select the state from the geo cookie set by proxy.js, and suggest
  // the browser language banner if nothing is saved yet.
  const [suggestedLang, setSuggestedLang] = useState(null);
  // The final-CTA envelope: closed until the user tears it open.
  const [letterOpen, setLetterOpen] = useState(false);
  useEffect(() => {
    const urlLang = new URLSearchParams(window.location.search).get('lang');
    const valid = ['en', 'ru', 'es', 'zh', 'ua'];
    if (urlLang && valid.includes(urlLang) && urlLang !== langCode) {
      setLang(codeToName[urlLang]);
      saveLang(urlLang);
    } else if (hasSavedLang()) {
      // Reconcile against localStorage in the rare case it drifted from the
      // cookie used for SSR (e.g. cookie cleared but localStorage kept). No-op
      // when they agree, so the common path never re-renders or flickers.
      const saved = getSavedLang();
      if (valid.includes(saved) && saved !== langCode) {
        setLang(codeToName[saved]);
        saveLang(saved);
      }
    } else if (!isLangBannerDismissed()) {
      const detected = detectBrowserLang();
      if (detected && detected !== langCode) setSuggestedLang(detected);
    }
    // Pre-select state: prefer the user's own last pick (persisted), fall back to
    // Vercel geo only on first visit. Many users visit through VPN/proxy, so geo
    // is wrong more often than right — a saved choice is the trustworthy source.
    const savedState = localStorage.getItem('dmvsos_state');
    if (savedState) {
      setState(savedState);
    } else {
      const geoState = document.cookie
        .split('; ')
        .find(row => row.startsWith('dmvsos_geo_state='))
        ?.split('=')[1];
      if (geoState) setState(geoState);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only
  }, []);

  // Persist the state so the dropdown remembers the user's pick across visits
  useEffect(() => {
    if (state) localStorage.setItem('dmvsos_state', state);
  }, [state]);

  const langs = [
    { label: 'EN', flag: flags.us, code: 'en', name: 'English' },
    { label: 'RU', flag: flags.ru, code: 'ru', name: 'Русский' },
    { label: 'ES', flag: flags.es, code: 'es', name: 'Español' },
    { label: 'ZH', flag: flags.cn, code: 'zh', name: '中文' },
    { label: 'UA', flag: flags.ua, code: 'ua', name: 'Українська' },
  ];

  const currentLang = langs.find(l => l.name === lang) || langs[0];

  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  const stateOptions = STATE_OPTIONS.map((display) => ({ name: display, code: stateToSlug(display) }));
  // Envelope return address: "CALIFORNIA DMV" when we know the state
  // (saved pick or geo cookie), plain "DMV" otherwise.
  const stateNameForLetter = state
    ? (stateOptions.find(o => o.code === state)?.name || '').replace(/\s*\([A-Z]{2}\)\s*$/, '')
    : '';
  const agencyLabel = state ? `${stateNameForLetter} ${agencyAbbrForState(state)}`.trim() : 'DMV';
  // Road stops: practice here (brand logo) → DMV office → the license → the road.
  const steps = [
    {
      label: tex.step1, ring: '#2563EB',
      // eslint-disable-next-line @next/next/no-img-element
      icon: <img src="/logo.png" alt="" aria-hidden="true" className="w-[26px] h-[26px] rounded-md" />,
    },
    {
      label: tex.step2, ring: '#F59E0B', festive: true,
      icon: (
        <svg width="23" height="23" viewBox="0 0 24 24" fill="none" aria-hidden="true" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12.5l4.5 4.5L19 7" />
        </svg>
      ),
    },
    {
      label: tex.step3, ring: '#F59E0B',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true" stroke="#B45309" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="5" width="18" height="14" rx="2.5" />
          <circle cx="8.2" cy="11" r="1.8" />
          <path d="M5.8 15.6c.5-1.3 1.4-2 2.4-2s1.9.7 2.4 2M14 9.5h4.5M14 12.5h4.5M14 15.5h3" />
        </svg>
      ),
    },
    {
      label: tex.step4, ring: '#16A34A',
      icon: (
        <svg width="23" height="23" viewBox="0 0 24 24" fill="none" aria-hidden="true" stroke="#15803D" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 16l1.2-4.2A2 2 0 0 1 8.1 10h7.8a2 2 0 0 1 1.9 1.8L19 16M5 16h14M5 16v3h1.8l.7-1.6h9l.7 1.6H19v-3" />
          <path d="M7.6 13.4h.01M16.4 13.4h.01" />
        </svg>
      ),
    },
  ];

  const faqJsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'How does pricing work?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: `DMVSOS uses flat-rate one-time payments — no subscriptions. Moto Pass (${PASS_META.moto.price}), Auto Pass (${PASS_META.auto.price}), and CDL Pro (${PASS_META.cdl.price}) each unlock 30 days of access. Extend any pass by 30 days for ${EXTENSION.price}.`,
        },
      },
      {
        '@type': 'Question',
        name: 'Can I take the DMV practice test in Spanish or other languages?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Yes! DMVSOS offers DMV practice tests in English, Spanish, Russian, Chinese, and Ukrainian for all 50 US states.',
        },
      },
      {
        '@type': 'Question',
        name: 'Does DMVSOS cover all 50 states?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Yes. DMVSOS covers all 50 US states for Car, CDL, and Motorcycle permit tests.',
        },
      },
    ],
  });

  return (
    <main style={{ background: 'linear-gradient(135deg, #EFF6FF 0%, #FFF7ED 100%)' }} className="min-h-screen flex flex-col items-center px-4">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: faqJsonLd }}
      />

      {/* Welcome banner for fresh signups (variant=welcome) or post-purchase
          users on their first session after going Pro (variant=pro). Returns
          null silently when there is nothing to show, so no extra layout cost
          for returning users. */}
      <div className="fixed top-0 left-0 right-0 z-50">
        <WelcomeBanner />
      </div>

      {/* Background blobs */}
      <div className="fixed top-[-200px] right-[-200px] w-[600px] h-[600px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(26,86,219,0.08) 0%, transparent 70%)' }} />
      <div className="fixed bottom-[-150px] left-[-150px] w-[500px] h-[500px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(245,158,11,0.06) 0%, transparent 70%)' }} />

      {/* Header: logo + lang dropdown + user | nav links row */}
      <header className="w-full max-w-lg mx-auto pt-5 pb-0 px-4">
        {/* Row 1: logo + compact lang + user/login */}
        <div className="flex items-center justify-between pb-3">
          <Link href="/" className="flex items-center gap-2 cursor-pointer hover:opacity-90 transition">
            <Image src="/logo.png" alt="DMVSOS" width={32} height={32} className="rounded-lg" />
            <span className="text-lg font-bold text-[#0B1C3D]" style={{ letterSpacing: '-0.02em' }}>DMVSOS</span>
          </Link>
          <div className="flex items-center gap-2">
            {/* Compact language dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowLangMenu(v => !v)}
                onBlur={() => setTimeout(() => setShowLangMenu(false), 150)}
                className="flex items-center gap-1 text-xs font-semibold text-[#64748B] bg-white border border-[#E2E8F0] rounded-full px-2.5 py-1.5 hover:border-[#2563EB] transition-colors"
              >
                <span>{currentLang.flag}</span>
                <span>{currentLang.label}</span>
                <svg width="9" height="9" viewBox="0 0 12 12" className="ml-0.5 shrink-0" style={{ fill: '#94A3B8' }}><path d="M6 8L1 3h10z" /></svg>
              </button>
              {showLangMenu && (
                <div className="absolute right-0 top-full mt-1 bg-white border border-[#E2E8F0] rounded-xl shadow-lg z-50 py-1 min-w-[110px]">
                  {langs.map(l => (
                    <button
                      key={l.code}
                      type="button"
                      onMouseDown={() => { setLang(l.name); saveLang(l.code); setShowLangMenu(false); }}
                      className={`w-full text-left px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 hover:bg-[#F8FAFC] transition-colors ${lang === l.name ? 'text-[#2563EB]' : 'text-[#64748B]'}`}
                    >
                      <span>{l.flag}</span> <span>{l.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* User pill or sign-in */}
            {user ? (() => {
              const raw = user.user_metadata?.full_name || user.email || '';
              const firstName = raw.split(/\s+/)[0] || raw.split('@')[0] || '?';
              const initial = (raw || '?')[0].toUpperCase();
              return (
                <div className="flex items-center gap-1.5 bg-white border border-[#E2E8F0] rounded-full pl-1.5 pr-2.5 py-1 shadow-sm">
                  <button
                    type="button"
                    onClick={() => router.push('/profile')}
                    className="flex items-center gap-1.5 min-w-0 hover:opacity-90 transition"
                  >
                    <div className="w-6 h-6 rounded-full bg-[#0B1C3D] flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                      {initial}
                    </div>
                    <span className="hidden sm:block text-xs font-medium text-[#1E293B] max-w-[80px] truncate">{firstName}</span>
                    {isPro && ['cdl', 'cdl_pass', 'guaranteed_pass'].includes(planType) && (
                      <span className="hidden sm:inline text-[10px] font-semibold bg-[#FEF3C7] text-[#B45309] px-1.5 py-0.5 rounded-full whitespace-nowrap">CDL Pro</span>
                    )}
                    {isPro && ['auto', 'car_pass', 'full_prep'].includes(planType) && (
                      <span className="hidden sm:inline text-[10px] font-semibold bg-[#DBEAFE] text-[#1D4ED8] px-1.5 py-0.5 rounded-full whitespace-nowrap">Auto Pass</span>
                    )}
                    {isPro && ['moto', 'moto_pass', 'quick_pass'].includes(planType) && (
                      <span className="hidden sm:inline text-[10px] font-semibold bg-[#F3F4F6] text-[#4B5563] px-1.5 py-0.5 rounded-full whitespace-nowrap">Moto Pass</span>
                    )}
                    {!isPro && (
                      <span className="hidden sm:inline text-[10px] font-semibold bg-[#F3F4F6] text-[#9CA3AF] px-1.5 py-0.5 rounded-full whitespace-nowrap">{tex.freeBadge || 'Free'}</span>
                    )}
                  </button>
                  <button onClick={handleSignOut} type="button"
                    className="text-[11px] text-[#94A3B8] hover:text-[#64748B] hover:underline transition"
                    aria-label="Sign out">
                    ✕
                  </button>
                </div>
              );
            })() : (
              <button
                type="button"
                onClick={() => router.push(`/login?lang=${langCode}`)}
                className="text-sm font-medium text-[#2563EB] hover:text-[#1D4ED8] transition"
              >
                {tex.signInTitle}
              </button>
            )}
          </div>
        </div>

        {/* Row 2: nav links  ·  centered. Tests + Manuals are live for everyone;
            "Take a break" unlocks after the first finished test (see BreakButton). */}
        <div className="flex flex-wrap items-center justify-center gap-2 pb-3">
          <button type="button"
            onClick={() => document.getElementById('state-selector')?.scrollIntoView({ behavior: 'smooth' })}
            className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold text-[#2563EB] bg-[#EFF6FF] border border-[#BFDBFE] rounded-full px-3 py-1 hover:bg-[#DBEAFE] active:scale-95 transition">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 7h6M9 11h6M9 15h4" /></svg>
            {tex.practiceTests}
          </button>
          <Link href="/manuals"
            className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold text-[#64748B] bg-white border border-[#E2E8F0] rounded-full px-3 py-1 hover:border-[#2563EB] hover:text-[#2563EB] active:scale-95 transition">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 5a2 2 0 0 1 2-2h7v16H6a2 2 0 0 0-2 2V5z" /><path d="M13 3h5a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2h-5" /></svg>
            {tex.navManuals}
          </Link>
          <BreakButton langCode={langCode} />
        </div>
      </header>

      {/* Browser-language suggestion banner */}
      {suggestedLang && (() => {
        const suggested = langs.find(l => l.code === suggestedLang);
        if (!suggested) return null;
        const suggestedTex = t[suggestedLang] || t.en;
        return (
          <div className="w-full max-w-lg mx-auto px-4 mb-3">
            <div className="flex items-center gap-2 bg-white border border-[#BFDBFE] rounded-xl px-3 py-2 shadow-sm">
              <span className="text-base shrink-0">{suggested.flag}</span>
              <button
                type="button"
                onClick={() => {
                  setLang(suggested.name);
                  saveLang(suggested.code);
                  setSuggestedLang(null);
                }}
                className="flex-1 text-left text-sm font-medium text-[#2563EB] hover:text-[#1D4ED8] transition"
              >
                {suggestedTex.openInLanguage || `Open in ${suggested.name}`}
              </button>
              <button
                type="button"
                onClick={() => { dismissLangBanner(); setSuggestedLang(null); }}
                className="text-[#94A3B8] hover:text-[#64748B] text-sm px-1 shrink-0"
                aria-label="Dismiss"
              >
                ✕
              </button>
            </div>
          </div>
        );
      })()}

      {/* Hero section — title + warm reassurance + factual trust line, all
          inside the same visual block so the three messages read as a single
          paragraph instead of three orphaned text elements. */}
      <section className="w-full max-w-md mx-auto px-4 pt-1 pb-6 text-center">
        <h1 className="text-[32px] sm:text-[42px] font-semibold text-[#0B1C3D] leading-[1.13] mb-3 whitespace-pre-line"
          style={{ fontFamily: "'DM Sans', var(--font-dm-sans), sans-serif", letterSpacing: '-0.025em' }}>
          {heroTitleText}
        </h1>
        <p className="text-[15px] font-normal leading-relaxed mb-3"
          style={{ color: '#64748B', letterSpacing: '-0.01em' }}>
          {tex.heroSub}
        </p>
        {/* Real, above-the-fold trust line. Our knockout numbers (35k+ dwarfs
            competitors' few hundred) carry the credibility — no agency name so
            it reads right whether the state runs a DMV, DOL or DPS. */}
        {tex.heroTrustStats && (
          <p className="text-[12.5px] font-semibold mb-3" style={{ color: '#94A3B8', letterSpacing: '0.01em' }}>
            {tex.heroTrustStats}
          </p>
        )}
        {/* Trust-line is interactive: amber-tinted pill with a closed-lock
            icon whose shackle rotates open on hover. Click navigates to the
            /upgrade page — the line tells the user the same questions are
            "locked" behind a Pass and invites them to unlock. */}
        {!isPro && tex.heroTrustLine && (
          <button
            type="button"
            onClick={() => router.push(`/upgrade?lang=${langCode}`)}
            className="group hero-trust-pill inline-flex items-center gap-2 px-4 py-2 rounded-full transition-all duration-300 cursor-pointer"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" className="shrink-0" style={{ overflow: 'visible' }}>
              <rect x="6" y="11" width="12" height="9" rx="2" fill="#0B1C3D" />
              <path
                className="hero-trust-shackle"
                d="M8 11V8a4 4 0 0 1 8 0v3"
                stroke="#0B1C3D"
                strokeWidth="2"
                fill="none"
                strokeLinecap="round"
              />
            </svg>
            <span className="text-[14px] font-semibold tracking-tight" style={{ color: '#0B1C3D', letterSpacing: '-0.01em' }}>
              {tex.heroTrustLine}
            </span>
            <span className="hero-trust-arrow text-sm" style={{ color: '#94A3B8' }}>
            </span>
          </button>
        )}
        <style jsx>{`
          .hero-trust-pill {
            position: relative;
            overflow: hidden;
            background: linear-gradient(135deg, #FDE68A 0%, #FBBF24 100%);
            border: 1px solid rgba(180, 120, 10, 0.25);
            box-shadow: 0 4px 14px rgba(245, 158, 11, 0.30);
          }
          .hero-trust-pill::before {
            content: '';
            position: absolute;
            top: 0;
            left: -60%;
            width: 40%;
            height: 100%;
            background: linear-gradient(100deg, transparent, rgba(255, 255, 255, 0.55), transparent);
            transform: skewX(-20deg);
            animation: heroShine 3.5s ease-in-out infinite;
          }
          @keyframes heroShine {
            0% { left: -60%; }
            55%, 100% { left: 130%; }
          }
          .road-sparkle {
            display: inline-block;
            transform-origin: center;
            animation: roadSparkle 2.4s ease-in-out infinite;
          }
          @keyframes roadSparkle {
            0%, 100% { transform: scale(0.6); opacity: 0.35; }
            50% { transform: scale(1); opacity: 1; }
          }
          @media (prefers-reduced-motion: reduce) {
            .road-sparkle { animation: none; opacity: 0.85; }
          }
          .hero-trust-pill:hover {
            transform: translateY(-1px);
            box-shadow: 0 8px 20px -4px rgba(245, 158, 11, 0.42);
          }
          .hero-trust-shackle {
            transform-origin: 16px 11px;
            transition: transform 0.35s cubic-bezier(0.4, 0, 0.2, 1);
          }
          .hero-trust-pill:hover .hero-trust-shackle {
            transform: rotate(-30deg) translateX(-1px);
          }
          .hero-trust-arrow {
            opacity: 0;
            transform: translateX(-4px);
            transition: opacity 0.3s ease, transform 0.3s ease;
          }
          .hero-trust-pill:hover .hero-trust-arrow {
            opacity: 1;
            transform: translateX(0);
          }
        `}</style>
      </section>

      {/* State selector card */}
      {/* One-click start: state picker + 3 category buttons in a single card.
          Replaces the older 2-step flow (home → /category → /test). Each
          category button shows free question count + price so the offer
          is concrete before the user commits. CDL still routes through
          /cdl-category since it has subcategories (general / air-brakes /
          combination), Car and Moto skip the intermediate page entirely. */}
      <div id="state-selector" className="w-full max-w-md mx-auto px-4 mb-8">
        <div className="bg-white rounded-3xl shadow-2xl p-6 sm:p-7 border border-[#E2E8F0]/40" style={{ borderTop: '4px solid #2563EB' }}>

          <p className="text-base font-semibold text-[#0B1C3D] mb-3 text-center">{tex.selectStateLabel}</p>

          <select
            ref={stateSelectRef}
            id="home-state-select"
            name="state"
            aria-label={tex.selectStateLabel}
            value={state}
            onChange={e => setState(e.target.value)}
            className="w-full py-4 px-4 rounded-xl border-2 border-gray-100 focus:border-blue-500 outline-none text-base bg-white text-gray-700 cursor-pointer appearance-none"
            style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%236B7280' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 16px center' }}
          >
            <option value="">{tex.selectState}</option>
            {stateOptions.map(s => (
              <option key={s.code} value={s.code}>{s.name}</option>
            ))}
          </select>

          {/* (Trust claim 'те же вопросы' lives above the state card now —
              removed from inside the card to avoid duplication.) */}
          <div className="mb-4" />

          {/* Category buttons — only enabled once a state is picked. With
              geolocation auto-fill most users see this state already, so
              this is usually a single-tap surface. */}
          {state ? (
            <>
              {/* Drop the "Выберите тест" sub-heading — three labelled cards
                  below are self-explanatory and an extra heading inside the
                  card made the surface feel cramped. */}
              <div className="flex flex-col gap-3">
                {[
                  { id: 'dmv',  label: tex.catCar,  sub: tex.catCarSub,  img: '/vehicles/car-hero.png', gradient: 'linear-gradient(135deg, #EFF6FF, #DBEAFE)' },
                  { id: 'cdl',  label: tex.catCdl,  sub: tex.catCdlSub,  img: '/vehicles/truck.png', gradient: 'linear-gradient(135deg, #F0F9FF, #E0F2FE)' },
                  { id: 'moto', label: tex.catMoto, sub: tex.catMotoSub, img: '/vehicles/moto.png',  gradient: 'linear-gradient(135deg, #FFF7ED, #FFEDD5)' },
                ].map(cat => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => {
                      if (cat.id === 'cdl') router.push(`/cdl-category?state=${state}&lang=${langCode}`);
                      else router.push(`/test?state=${state}&category=${cat.id}&lang=${langCode}`);
                    }}
                    className="relative overflow-hidden rounded-2xl px-4 py-4 min-h-[72px] flex flex-col justify-center shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all text-left"
                    style={{ background: cat.gradient }}
                  >
                    <div className="relative z-10">
                      <div className="font-bold text-[#0B1C3D] text-[16px]">{cat.label}</div>
                      <div className="text-[11px] text-[#64748B] mt-0.5">{cat.sub}</div>
                    </div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={cat.img} alt="" aria-hidden="true" className="absolute right-[-6px] bottom-[-4px] h-[60px] w-auto z-0 pointer-events-none select-none" />
                  </button>
                ))}
              </div>
              {isPro && (
                <p className="text-xs text-center mt-4 text-[#B45309] font-medium">{tex.proActive}</p>
              )}
              <p className="text-xs text-gray-400 mt-3 text-center"><span className="inline-block w-2 h-2 rounded-full bg-[#16A34A] mr-1.5 align-middle" />{liveCount} {tex.practicingNow}</p>
            </>
          ) : (
            <p className="text-sm text-center text-[#94A3B8] py-4 mt-2">
              {tex.pickStateFirst || 'Choose your state to continue'}
            </p>
          )}
        </div>
      </div>

      {/* Driver Manual link */}
      <div className="w-full max-w-lg mx-auto px-4 mb-4">
        <Link
          href="/manuals"
          className="flex items-center gap-3 bg-blue-50 rounded-2xl px-4 py-4 shadow-sm border border-blue-100 border-l-4 border-l-blue-500 hover:bg-blue-100 hover:shadow-md transition-all group"
        >
          <div className="w-11 h-11 rounded-xl bg-blue-100 flex items-center justify-center shrink-0 group-hover:bg-blue-200 transition-colors">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/illustrations/manual.png" alt="" aria-hidden="true" className="w-9 h-9 object-contain" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-sm font-bold text-[#0B1C3D] group-hover:text-[#2563EB]">
                {tex.manualsSectionTitle}
              </span>
              <span className="text-[10px] font-bold bg-blue-500 text-white px-1.5 py-0.5 rounded-full leading-none">FREE</span>
            </div>
            <div className="text-[11px] text-[#64748B]">
              {tex.manualsSectionDesc}
            </div>
          </div>
          <div className="text-blue-400 shrink-0 group-hover:text-blue-600 font-bold"></div>
        </Link>
      </div>

      {/* Stats bar */}
      <section className="w-full max-w-lg mx-auto px-4 mb-8">
        <div className="grid grid-cols-4 gap-2">
          {[
            { value: '5K+', label: tex.statUsers },
            { value: '25K+', label: tex.statQuestions },
            { value: '50', label: tex.statStates },
            { value: '5', label: tex.statLanguages },
          ].map((stat) => (
            <div key={stat.label} className="bg-white rounded-2xl p-3 text-center shadow-sm border border-[#E2E8F0]/60">
              <div className="text-lg sm:text-xl font-black text-[#0B1C3D]">{stat.value}</div>
              <div className="text-[10px] text-[#94A3B8] font-medium mt-0.5">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* The road to your license — four stops on a dashed road. Stop 1 is the
          brand (practicing here), stop 2 will later link to the DMV-offices
          directory, the goal is the license, then the open road. */}
      <section className="w-full max-w-lg mx-auto mb-8 px-4">
        <h2 className="text-center text-lg font-bold text-[#0B1C3D] mb-6">
          {tex.howItWorks}
        </h2>

        <div className="bg-white rounded-2xl border border-[#F1F5F9] shadow-sm px-3 py-5">
          <div className="relative">
            <div aria-hidden="true" className="absolute left-[12%] right-[12%] top-[22px] border-t-[3px] border-dashed border-[#CBD5E1]" />
            <div className="relative grid grid-cols-4 gap-1">
              {steps.map((step, i) => (
                <div key={i} className="flex flex-col items-center text-center">
                  {step.festive ? (
                    <div className="relative">
                      {/* sparkle burst around the win */}
                      <span aria-hidden="true" className="absolute -top-1.5 -left-1.5 road-sparkle" style={{ animationDelay: '0s' }}>
                        <svg width="10" height="10" viewBox="0 0 12 12"><path d="M6 0l1 5 5 1-5 1-1 5-1-5-5-1 5-1z" fill="#F59E0B" /></svg>
                      </span>
                      <span aria-hidden="true" className="absolute -top-1 -right-2 road-sparkle" style={{ animationDelay: '.5s' }}>
                        <svg width="8" height="8" viewBox="0 0 12 12"><path d="M6 0l1 5 5 1-5 1-1 5-1-5-5-1 5-1z" fill="#FBBF24" /></svg>
                      </span>
                      <span aria-hidden="true" className="absolute -bottom-1 -right-1.5 road-sparkle" style={{ animationDelay: '1s' }}>
                        <svg width="7" height="7" viewBox="0 0 12 12"><path d="M6 0l1 5 5 1-5 1-1 5-1-5-5-1 5-1z" fill="#F59E0B" /></svg>
                      </span>
                      <div
                        className="w-11 h-11 rounded-full flex items-center justify-center"
                        style={{ background: 'linear-gradient(140deg, #FBBF24 0%, #F59E0B 100%)', boxShadow: '0 4px 14px rgba(245, 158, 11, 0.45)' }}
                      >
                        {step.icon}
                      </div>
                    </div>
                  ) : (
                    <div
                      className="w-11 h-11 rounded-full flex items-center justify-center bg-white"
                      style={{ border: `2px solid ${step.ring}`, boxShadow: '0 2px 8px rgba(11, 28, 61, 0.08)' }}
                    >
                      {step.icon}
                    </div>
                  )}
                  <span
                    className="text-[12px] leading-tight mt-2"
                    style={{ fontWeight: step.festive ? 700 : 600, color: step.festive ? '#B45309' : '#0B1C3D' }}
                  >
                    {step.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="w-full max-w-2xl mx-auto mb-8 px-4">
        <h2 className="text-xl font-bold text-[#0B1C3D] text-center mb-2">{tex.pricingHeading}</h2>
        <p className="text-sm text-[#64748B] text-center mb-6 leading-relaxed max-w-md mx-auto">{tex.pricingSubtext}</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

          {/* Moto Pass */}
          <div className="bg-white rounded-2xl p-5 border border-[#E2E8F0] shadow-sm flex flex-col">
            <div className="h-[66px] flex items-center justify-center mb-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/vehicles/moto-hero.png" alt="" aria-hidden="true" className="max-h-[62px] w-auto object-contain" />
            </div>
            <h3 className="text-sm font-bold mb-1 text-center" style={{ color: '#D97706' }}>{tex.planMotoPass}</h3>
            <div className="text-2xl font-black text-[#0B1C3D] mb-0.5 text-center">{PASS_META.moto.price}</div>
            <div className="text-xs text-[#64748B] mb-3 text-center">{tex.planDuration}</div>
            <ul className="space-y-1.5 text-xs text-[#475569] mb-4 flex-1">
              {(tex.featMoto || []).filter(f => langCode !== 'en' || !/🌐/u.test(f)).map((f, i) => (
                <li key={i} className="flex items-start gap-2">
                  <svg width="14" height="14" viewBox="0 0 16 16" className="shrink-0 mt-0.5"><circle cx="8" cy="8" r="8" fill="#16A34A" /><path d="M4.5 8l2.2 2.2L11.5 5.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" /></svg>
                  <span>{String(f).replace(/^[^\p{L}\p{N}]+/u, '')}</span>
                </li>
              ))}
            </ul>
            <button type="button" onClick={() => router.push(`/upgrade?lang=${langCode}&plan=${PASS_META.moto.id}`)}
              className="w-full py-2.5 rounded-xl font-bold text-sm bg-[#2563EB] text-white hover:bg-[#1D4ED8] transition-all">
              {tex.planGetMoto}
            </button>
          </div>

          {/* Auto Pass  ·  most popular */}
          <div className="relative bg-white rounded-2xl p-5 border-2 border-[#2563EB] shadow-md flex flex-col">
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#2563EB] text-white text-[10px] font-bold px-3 py-1 rounded-full whitespace-nowrap">
              {tex.mostPopular}
            </span>
            <div className="h-[66px] flex items-center justify-center mb-2 mt-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/vehicles/car-hero.png" alt="" aria-hidden="true" className="max-h-[62px] w-auto object-contain" />
            </div>
            <h3 className="text-sm font-bold mb-1 text-center" style={{ color: '#2563EB' }}>{tex.planAutoPass}</h3>
            <div className="text-2xl font-black text-[#0B1C3D] mb-0.5 text-center">{PASS_META.auto.price}</div>
            <div className="text-xs text-[#64748B] mb-3 text-center">{tex.planDuration}</div>
            <ul className="space-y-1.5 text-xs text-[#475569] mb-4 flex-1">
              {(tex.featCar || []).filter(f => langCode !== 'en' || !/🌐/u.test(f)).map((f, i) => (
                <li key={i} className="flex items-start gap-2">
                  <svg width="14" height="14" viewBox="0 0 16 16" className="shrink-0 mt-0.5"><circle cx="8" cy="8" r="8" fill="#16A34A" /><path d="M4.5 8l2.2 2.2L11.5 5.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" /></svg>
                  <span>{String(f).replace(/^[^\p{L}\p{N}]+/u, '')}</span>
                </li>
              ))}
            </ul>
            <button type="button" onClick={() => router.push(`/upgrade?lang=${langCode}&plan=${PASS_META.auto.id}`)}
              className="w-full py-2.5 rounded-xl font-bold text-sm bg-[#2563EB] text-white hover:bg-[#1D4ED8] transition-all">
              {tex.planGetAuto}
            </button>
          </div>

          {/* CDL Pro  ·  best value */}
          <div className="relative bg-white rounded-2xl p-5 border-2 border-[#F59E0B] shadow-md flex flex-col">
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#F59E0B] text-[#0B1C3D] text-[10px] font-bold px-3 py-1 rounded-full whitespace-nowrap">
              {tex.planCdlBadge || 'Car tests included'}
            </span>
            <div className="h-[66px] flex items-center justify-center mb-2 mt-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/vehicles/truck-hero.png" alt="" aria-hidden="true" className="max-h-[62px] w-auto object-contain" />
            </div>
            <h3 className="text-sm font-bold mb-1 text-center" style={{ color: '#B45309' }}>{tex.planCdlPro}</h3>
            <div className="text-2xl font-black text-[#0B1C3D] mb-0.5 text-center">{PASS_META.cdl.price}</div>
            <div className="text-xs text-[#64748B] mb-3 text-center">{tex.planDuration}</div>
            <ul className="space-y-1.5 text-xs text-[#475569] mb-4 flex-1">
              {(tex.featCdl || []).filter(f => langCode !== 'en' || !/🌐/u.test(f)).map((f, i) => (
                <li key={i} className="flex items-start gap-2">
                  <svg width="14" height="14" viewBox="0 0 16 16" className="shrink-0 mt-0.5"><circle cx="8" cy="8" r="8" fill="#16A34A" /><path d="M4.5 8l2.2 2.2L11.5 5.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" /></svg>
                  <span>{String(f).replace(/^[^\p{L}\p{N}]+/u, '')}</span>
                </li>
              ))}
            </ul>
            <button type="button" onClick={() => router.push(`/upgrade?lang=${langCode}&plan=${PASS_META.cdl.id}`)}
              className="w-full py-2.5 rounded-xl font-bold text-sm text-[#0B1C3D] hover:brightness-105 transition-all"
              style={{ background: 'linear-gradient(135deg, #FDE68A, #FBBF24)' }}>
              {tex.planGetCdl}
            </button>
          </div>

        </div>
        <p className="text-center text-sm text-[#64748B] mt-4">{tex.pricingValueProp}</p>
        <p className="text-center text-sm text-[#64748B] mt-2">
          <button type="button"
            onClick={() => document.getElementById('state-selector')?.scrollIntoView({ behavior: 'smooth' })}
            className="text-[#2563EB] hover:underline font-medium">
            {tex.pricingStartFree || 'Or start free  ·  20 questions, no signup needed'}
          </button>
        </p>
      </section>

      {/* Social proof */}
      <section className="w-full max-w-lg mx-auto mb-8 px-4">
        <h2 className="text-lg font-bold text-[#0B1C3D] text-center mb-6">{tex.socialProofTitle}</h2>
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="bg-white rounded-2xl p-4 text-center shadow-sm border border-[#E2E8F0]/60">
            <div className="text-2xl font-black text-[#2563EB]">25K+</div>
            <div className="text-xs text-[#94A3B8] font-medium mt-0.5">{tex.socialProofQuestionsLabel}</div>
          </div>
          <div className="bg-white rounded-2xl p-4 text-center shadow-sm border border-[#E2E8F0]/60">
            <div className="text-2xl font-black text-[#2563EB]">50</div>
            <div className="text-xs text-[#94A3B8] font-medium mt-0.5">{tex.socialProofStatesLabel}</div>
          </div>
          <div className="bg-white rounded-2xl p-4 text-center shadow-sm border border-[#E2E8F0]/60">
            <div className="text-2xl font-black text-[#2563EB]">5</div>
            <div className="text-xs text-[#94A3B8] font-medium mt-0.5">{tex.socialProofLangsLabel}</div>
          </div>
        </div>
        <p className="text-center text-xs text-[#94A3B8]">{tex.socialProofReviews}</p>
        {/* Trustpilot review link, temporarily hidden until the review flow is polished. Do NOT delete; restore when ready.
        <p className="text-center text-xs mt-1">
          <a href="https://www.trustpilot.com/review/dmvsos.com" target="_blank" rel="noopener noreferrer"
            className="text-[#2563EB] hover:underline">{tex.socialProofTrustpilot}</a>
        </p>
        */}
      </section>

      {/* FAQ — the whole section is a dropdown, and each question inside is too.
          Both collapsed by default to keep the page short. */}
      <section className="w-full max-w-lg mx-auto mb-5 px-4">
        <details className="group/sec">
          <summary className="cursor-pointer list-none flex items-center justify-center gap-2 mb-5">
            <h2 className="text-lg font-bold text-[#0B1C3D]">{tex.faqTitle}</h2>
            <span className="text-[#94A3B8] group-open/sec:rotate-180 transition-transform"><svg width="14" height="14" viewBox="0 0 12 12" style={{ fill: 'currentColor' }}><path d="M6 8L1 3h10z" /></svg></span>
          </summary>
          <div className="flex flex-col gap-2">
            {(tex.faq || []).map((item, i) => (
              <details key={i} className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm group">
                <summary className="px-5 py-4 text-sm font-semibold text-[#0B1C3D] cursor-pointer list-none flex items-center justify-between">
                  <span>{item.q}</span>
                  <span className="text-[#94A3B8] group-open:rotate-180 transition-transform ml-3 shrink-0"><svg width="12" height="12" viewBox="0 0 12 12" style={{ fill: 'currentColor' }}><path d="M6 8L1 3h10z" /></svg></span>
                </summary>
                <p className="px-5 pb-4 text-sm text-[#475569] leading-relaxed">{item.a}</p>
              </details>
            ))}
          </div>
        </details>
      </section>

      {/* Final CTA — a sealed letter from the user's DMV/DOL. The button tears
          the corner open and the license letter (value props + CTA) is inside.
          Agency line personalizes from the saved/geo state. */}
      <section className="w-full max-w-md mx-auto mb-3 px-4">
        <h2 className="text-xl font-bold text-[#0B1C3D] text-center mb-1">{tex.licCtaTitle || 'Ready to get your license?'}</h2>
        <p className="text-sm text-[#64748B] text-center mb-4">{tex.licCtaSub || "Let's practice: 20 free questions, no signup"}</p>

        <div
          className="relative overflow-hidden rounded-2xl border"
          style={{
            minHeight: 196,
            borderColor: letterOpen ? '#E2E8F0' : '#E5DCC8',
            background: letterOpen ? '#FFFFFF' : 'linear-gradient(180deg, #FFFDF7, #F6EEDC)',
            boxShadow: '0 12px 30px rgba(11, 28, 61, 0.10)',
            transition: 'background 0.5s ease 0.3s, border-color 0.5s ease 0.3s',
          }}
        >
          {/* airmail edge strip */}
          <div
            aria-hidden="true"
            className="absolute left-0 right-0 top-0 h-[7px] z-10"
            style={{
              background: 'repeating-linear-gradient(115deg, #D85A5A 0 14px, #FFFDF7 14px 26px, #3E6DB5 26px 40px, #FFFDF7 40px 52px)',
              opacity: letterOpen ? 0 : 0.9,
              transition: 'opacity 0.4s ease 0.2s',
            }}
          />

          {/* the corner that tears off — explicit identity transform when closed
              so the browser actually animates the rip (transition from 'none'
              gets skipped). */}
          <div
            aria-hidden="true"
            className="absolute right-0 top-0 z-30 pointer-events-none"
            style={{
              width: 78, height: 60,
              transformOrigin: '100% 0%',
              transform: letterOpen ? 'translate(64px, -52px) rotate(52deg)' : 'translate(0px, 0px) rotate(0deg)',
              opacity: letterOpen ? 0 : 1,
              filter: 'drop-shadow(-2px 3px 3px rgba(74, 63, 44, 0.22))',
              transition: 'transform 0.55s cubic-bezier(.45,.05,.25,1), opacity 0.3s ease 0.28s',
            }}
          >
            <svg viewBox="0 0 78 60" className="w-full h-full block">
              <path d="M0 0 H78 V54 L67 46 L58 54 L48 42 L40 50 L31 38 L23 44 L14 31 L7 35 L0 20 Z" fill="#F4ECD9" stroke="#D9CBA8" strokeWidth="1.2" />
              <path d="M3 5 L16 28" stroke="#C2AE80" strokeWidth="1.2" strokeDasharray="3 3" />
            </svg>
          </div>

          {/* closed envelope face */}
          <div
            className="absolute inset-0 z-20 flex flex-col p-4 pt-6"
            style={{
              opacity: letterOpen ? 0 : 1,
              pointerEvents: letterOpen ? 'none' : 'auto',
              transition: 'opacity 0.3s ease 0.18s',
            }}
            aria-hidden={letterOpen}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="leading-tight">
                <span className="block text-[9px] font-semibold tracking-[0.18em] text-[#A1937B]">FROM</span>
                <span className="block text-[13px] font-bold tracking-wide text-[#4A3F2C] mt-1 uppercase">
                  {(tex.licLetterFrom || 'A letter from {agency}').replace('{agency}', agencyLabel)}
                </span>
                <span className="block text-[13px] italic text-[#6B5E45] mt-2" style={{ fontFamily: 'Georgia, serif' }}>
                  {tex.licLetterTo || 'To: the best driver'}
                </span>
              </div>
              {/* US flag postage stamp with postmark ring */}
              <div className="relative shrink-0 mr-7 mt-1">
                <div className="bg-white p-[3px]" style={{ border: '1.5px dashed #C9B98F', transform: 'rotate(4deg)' }}>
                  <svg width="42" height="30" viewBox="0 0 40 28" className="block">
                    <rect width="40" height="28" fill="#fff" />
                    <g fill="#B22234">
                      <rect width="40" height="4" y="0" /><rect width="40" height="4" y="8" /><rect width="40" height="4" y="16" /><rect width="40" height="4" y="24" />
                    </g>
                    <rect width="17" height="16" fill="#3C3B6E" />
                    <g fill="#fff"><circle cx="4" cy="4" r="1.1" /><circle cx="9" cy="4" r="1.1" /><circle cx="14" cy="4" r="1.1" /><circle cx="6.5" cy="8" r="1.1" /><circle cx="11.5" cy="8" r="1.1" /><circle cx="4" cy="12" r="1.1" /><circle cx="9" cy="12" r="1.1" /><circle cx="14" cy="12" r="1.1" /></g>
                  </svg>
                </div>
                <div aria-hidden="true" className="absolute -left-4 top-2 w-[40px] h-[40px] rounded-full" style={{ border: '1.5px solid rgba(74, 63, 44, 0.3)' }} />
              </div>
            </div>

            <button
              type="button"
              onClick={() => setLetterOpen(true)}
              className="mt-auto w-full px-8 py-3.5 rounded-xl font-bold text-base text-[#0B1C3D] transition-all hover:brightness-[1.04] active:scale-[0.99]"
              style={{ background: 'linear-gradient(135deg, #FDE68A, #FBBF24)', boxShadow: '0 6px 16px rgba(245, 158, 11, 0.28)' }}
            >
              {tex.licOpenLetter || 'Open the letter'}
            </button>
          </div>

          {/* the letter inside */}
          <div
            className="relative z-10 p-4 pt-5"
            style={{
              opacity: letterOpen ? 1 : 0,
              transform: letterOpen ? 'translateY(0)' : 'translateY(14px)',
              pointerEvents: letterOpen ? 'auto' : 'none',
              transition: 'opacity 0.4s ease 0.42s, transform 0.4s ease 0.42s',
            }}
            aria-hidden={!letterOpen}
          >
            <div className="flex items-center gap-2.5 pb-2.5 mb-3 border-b border-[#F1F5F9]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="" aria-hidden="true" className="w-[24px] h-[24px] rounded-md" />
              <span className="text-[12px] font-bold tracking-[0.14em] text-[#0B1C3D]">DMVSOS</span>
              <span className="ml-auto text-[9px] font-semibold tracking-[0.16em] text-[#A3B2C6] uppercase">{agencyLabel}</span>
            </div>

            <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[13px] leading-tight items-center text-[#1E293B] mb-4">
              <span className="font-semibold text-[9.5px] text-[#A3B2C6] tracking-[0.1em]">CLASS</span><span className="font-semibold whitespace-nowrap">Car &middot; Moto &middot; CDL</span>
              <span className="font-semibold text-[9.5px] text-[#A3B2C6] tracking-[0.1em]">COVERAGE</span><span className="font-semibold">{tex.licRowCoverage || 'All 50 states'}</span>
              <span className="font-semibold text-[9.5px] text-[#A3B2C6] tracking-[0.1em]">LANGUAGES</span><span className="font-semibold">{tex.licRowLangs || '5 languages'}</span>
              <span className="font-semibold text-[9.5px] text-[#A3B2C6] tracking-[0.1em]">BANK</span><span className="font-semibold">{tex.licRowBank || '25,000+ questions'}</span>
            </div>

            <button
              type="button"
              onClick={() => document.getElementById('state-selector')?.scrollIntoView({ behavior: 'smooth' })}
              className="w-full px-8 py-3.5 rounded-xl font-bold text-base text-[#0B1C3D] transition-all hover:brightness-[1.04] active:scale-[0.99]"
              style={{ background: 'linear-gradient(135deg, #FDE68A, #FBBF24)', boxShadow: '0 6px 16px rgba(245, 158, 11, 0.28)' }}
            >
              {tex.finalCtaText || 'Choose your state and start'}
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="w-full max-w-lg mx-auto px-4 mt-3 pb-6">
        <p className="text-xs text-[#94A3B8] text-center leading-relaxed">
          {tex.footerLegal || 'By continuing, you agree to our'}{' '}
          <Link href="/terms" className="text-[#2563EB] font-medium">{tex.terms || 'Terms'}</Link> {tex.and || 'and'}{' '}
          <Link href="/privacy" className="text-[#2563EB] font-medium">{tex.privacy || 'Privacy Policy'}</Link>.
        </p>
      </footer>

      <SupportFooter lang={langCode} />
    </main>
  );
}
