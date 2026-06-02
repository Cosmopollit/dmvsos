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
import { useExperiment } from '@/lib/experiments';
import SupportFooter from '@/app/components/SupportFooter';
import WelcomeBanner from '@/app/components/WelcomeBanner';

const codeToName = { en: 'English', ru: 'Русский', es: 'Español', zh: '中文', ua: 'Українська' };

export default function Home() {
  const { user, isPro, planType } = useAuth();
  useExperiment('home_visit', user?.id);
  const [lang, setLang] = useState(() => codeToName[getSavedLang()] || 'English');
  const [state, setState] = useState('');
  const [liveCount] = useState(() => Math.floor(Math.random() * 30) + 30);
  const [showLangMenu, setShowLangMenu] = useState(false);
  const stateSelectRef = useRef(null);
  const router = useRouter();

  const langToCode = { English: 'en', 'Русский': 'ru', 'Español': 'es', '中文': 'zh', 'Українська': 'ua' };
  const langCode = langToCode[lang] || 'en';
  const tex = t[langCode] || t.en;

  // ?lang=xx in URL (e.g. from a Google hreflang result) overrides the saved lang.
  // Also pre-select the state from the geo cookie set by proxy.js, and suggest
  // the browser language banner if nothing is saved yet.
  const [suggestedLang, setSuggestedLang] = useState(null);
  useEffect(() => {
    const urlLang = new URLSearchParams(window.location.search).get('lang');
    const valid = ['en', 'ru', 'es', 'zh', 'ua'];
    if (urlLang && valid.includes(urlLang) && urlLang !== langCode) {
      setLang(codeToName[urlLang]);
      saveLang(urlLang);
    } else if (!hasSavedLang() && !isLangBannerDismissed()) {
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
  const steps = [
    { emoji: '📱', label: tex.step1, msg: tex.stepMsg1 },
    { emoji: '🏛️', label: tex.step2, msg: tex.stepMsg2 },
    { emoji: '🪪', label: tex.step3, msg: tex.stepMsg3 },
    { emoji: '🚗', label: tex.step4, msg: tex.stepMsg4 },
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
      {
        '@type': 'Question',
        name: 'What is the Pass Guarantee?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: `CDL Pro (${PASS_META.cdl.price}, 30-day access) includes a 100% money-back guarantee if you fail your CDL test, plus direct support via Telegram in your language.`,
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
                <span className="text-[#94A3B8] text-[10px] ml-0.5">▾</span>
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
                      <span className="hidden sm:inline text-[10px] font-semibold bg-[#F3F4F6] text-[#9CA3AF] px-1.5 py-0.5 rounded-full whitespace-nowrap">Free</span>
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

        {/* Row 2: nav links  ·  centered */}
        <div className="flex items-center justify-center gap-2 pb-3">
          <Link href="/dmv-test"
            className="text-xs font-semibold text-[#2563EB] bg-[#EFF6FF] border border-[#BFDBFE] rounded-full px-3 py-1 hover:bg-[#DBEAFE] transition-colors">
            📋 {tex.practiceTests}
          </Link>
          <Link href="/manuals"
            className="text-xs font-semibold text-[#64748B] bg-white border border-[#E2E8F0] rounded-full px-3 py-1 hover:border-[#2563EB] hover:text-[#2563EB] transition-colors">
            📖 {tex.navManuals}
          </Link>
          {/* "Courses · soon" tab removed 2026-05-26 — promising vapor was
              reading as a marketing tease and competing for attention with
              the actual product. Will return when courses ship. */}
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
                {suggestedTex.openInLanguage || `Open in ${suggested.name} →`}
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
          {tex.heroTitle}
        </h1>
        <p className="text-[15px] font-normal leading-relaxed mb-3"
          style={{ color: '#64748B', letterSpacing: '-0.01em' }}>
          {tex.heroSub}
        </p>
        {/* Trust-line is interactive: amber-tinted pill with a closed-lock
            icon whose shackle rotates open on hover. Click navigates to the
            /upgrade page — the line tells the user the same questions are
            "locked" behind a Pass and invites them to unlock. */}
        {tex.heroTrustLine && (
          <button
            type="button"
            onClick={() => router.push(`/upgrade?lang=${langCode}`)}
            className="group hero-trust-pill inline-flex items-center gap-2 px-4 py-2 rounded-full transition-all duration-300 cursor-pointer"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" className="shrink-0" style={{ overflow: 'visible' }}>
              <rect x="6" y="11" width="12" height="9" rx="2" fill="#F59E0B" />
              <path
                className="hero-trust-shackle"
                d="M8 11V8a4 4 0 0 1 8 0v3"
                stroke="#92400E"
                strokeWidth="2"
                fill="none"
                strokeLinecap="round"
              />
            </svg>
            <span className="text-[14px] font-semibold tracking-tight" style={{ color: '#0B1C3D', letterSpacing: '-0.01em' }}>
              {tex.heroTrustLine}
            </span>
            <span className="hero-trust-arrow text-sm" style={{ color: '#94A3B8' }}>
              →
            </span>
          </button>
        )}
        <style jsx>{`
          .hero-trust-pill {
            background: linear-gradient(135deg, rgba(245, 158, 11, 0.08) 0%, rgba(37, 99, 235, 0.06) 100%);
            border: 1px solid rgba(245, 158, 11, 0.28);
            box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
          }
          .hero-trust-pill:hover {
            background: linear-gradient(135deg, rgba(245, 158, 11, 0.18) 0%, rgba(37, 99, 235, 0.10) 100%);
            border-color: rgba(245, 158, 11, 0.55);
            transform: translateY(-1px);
            box-shadow: 0 6px 16px -4px rgba(245, 158, 11, 0.25);
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
                  { id: 'dmv',  icon: '🚗', label: tex.catCar,  freeCount: 20, price: '$29.99', gradient: 'linear-gradient(135deg, #EFF6FF, #DBEAFE)', accent: '#2563EB' },
                  { id: 'cdl',  icon: '🚛', label: tex.catCdl,  freeCount: 20, price: '$49.99', gradient: 'linear-gradient(135deg, #F0F9FF, #E0F2FE)', accent: '#0EA5E9' },
                  { id: 'moto', icon: '🏍️', label: tex.catMoto, freeCount: 5,  price: '$19.99', gradient: 'linear-gradient(135deg, #FFF7ED, #FFEDD5)', accent: '#D97706' },
                ].map(cat => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => {
                      if (cat.id === 'cdl') router.push(`/cdl-category?state=${state}&lang=${langCode}`);
                      else router.push(`/test?state=${state}&category=${cat.id}&lang=${langCode}`);
                    }}
                    className="rounded-2xl p-4 flex items-center gap-3 hover:shadow-md transition-all text-left border-2 border-white/60 shadow-sm hover:-translate-y-0.5"
                    style={{ background: cat.gradient }}
                  >
                    <span className="text-3xl shrink-0">{cat.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-[#1E293B] text-[15px]">{cat.label}</div>
                      <div className="text-[12px] text-[#64748B] mt-0.5">
                        <span className="font-semibold text-[#16A34A]">{cat.freeCount} {tex.freeWord || 'free'}</span>
                        <span className="text-[#CBD5E1] mx-1.5">·</span>
                        <span>{tex.priceFrom || 'from'} <span className="font-semibold" style={{ color: cat.accent }}>{cat.price}</span></span>
                      </div>
                    </div>
                    <span className="text-[#94A3B8] text-lg shrink-0">→</span>
                  </button>
                ))}
              </div>
              {isPro && (
                <p className="text-xs text-center mt-4 text-[#B45309] font-medium">{tex.proActive}</p>
              )}
              <p className="text-xs text-gray-400 mt-3 text-center">🟢 {liveCount} {tex.practicingNow}</p>
            </>
          ) : (
            <p className="text-sm text-center text-[#94A3B8] py-4 mt-2">
              ↑ {tex.pickStateFirst || 'Choose your state to continue'}
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
          <div className="w-11 h-11 rounded-xl bg-blue-100 flex items-center justify-center text-2xl shrink-0 group-hover:bg-blue-200 transition-colors">📖</div>
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
          <div className="text-blue-400 shrink-0 group-hover:text-blue-600 font-bold">→</div>
        </Link>
      </div>

      {/* Stats bar */}
      <section className="w-full max-w-lg mx-auto px-4 mb-8">
        <div className="grid grid-cols-4 gap-2">
          {[
            { value: '5K+', label: tex.statUsers },
            { value: '30K+', label: tex.statQuestions },
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

      {/* How it works  ·  static 4-column grid */}
      <section className="w-full max-w-lg mx-auto mb-8 px-4">
        <h2 className="text-center text-lg font-bold text-[#0B1C3D] mb-6">
          {tex.howItWorks}
        </h2>

        <div className="grid grid-cols-4 gap-2">
          {steps.map((step, i) => (
            <div
              key={i}
              className="flex flex-col items-center p-3 rounded-2xl bg-white border border-[#F1F5F9] shadow-sm"
            >
              {/* Step number */}
              <div className="w-5 h-5 rounded-full bg-[#2563EB] text-white text-[10px] font-bold flex items-center justify-center mb-2">
                {i + 1}
              </div>
              <span className="text-3xl mb-2 block">{step.emoji}</span>
              <span className="text-xs text-center font-semibold leading-tight text-[#0B1C3D]">
                {step.label}
              </span>
              <span className="text-[10px] text-center text-[#94A3B8] mt-1 leading-tight">
                {step.msg}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section className="w-full max-w-2xl mx-auto mb-8 px-4">
        <h2 className="text-xl font-bold text-[#0B1C3D] text-center mb-2">{tex.pricingHeading}</h2>
        <p className="text-sm text-[#64748B] text-center mb-6 leading-relaxed max-w-md mx-auto">{tex.pricingSubtext}</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

          {/* Moto Pass  ·  white, gray border */}
          <div className="bg-white rounded-2xl p-5 border border-[#E2E8F0] shadow-sm flex flex-col text-center">
            <div className="text-3xl mb-2">🏍️</div>
            <h3 className="text-sm font-bold text-[#2563EB] mb-1">{tex.planMotoPass}</h3>
            <div className="text-2xl font-black text-[#0B1C3D] mb-0.5">{PASS_META.moto.price}</div>
            <div className="text-xs text-[#64748B] mb-3">{tex.planDuration}</div>
            <ul className="space-y-1.5 text-xs text-[#475569] mb-4 text-left flex-1">
              {(tex.featMoto || []).map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
            <button type="button" onClick={() => router.push(`/upgrade?lang=${langCode}&plan=${PASS_META.moto.id}`)}
              className="w-full py-2.5 rounded-xl font-semibold text-sm border border-[#E2E8F0] text-[#0B1C3D] hover:bg-[#F1F5F9] transition-all">
              {tex.planGetMoto}
            </button>
          </div>

          {/* Auto Pass  ·  dark navy, blue border, MOST POPULAR */}
          <div className="relative bg-[#0B1C3D] rounded-2xl p-5 border-2 border-[#2563EB] shadow-sm flex flex-col text-center">
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#2563EB] text-white text-[10px] font-bold px-3 py-1 rounded-full whitespace-nowrap">
              {tex.mostPopular}
            </span>
            <div className="text-3xl mb-2 mt-1">🚗</div>
            <h3 className="text-sm font-bold text-[#F59E0B] mb-1">{tex.planAutoPass}</h3>
            <div className="text-2xl font-black text-white mb-0.5">{PASS_META.auto.price}</div>
            <div className="text-xs text-[#94A3B8] mb-3">{tex.planDuration}</div>
            <ul className="space-y-1.5 text-xs text-[#CBD5E1] mb-4 text-left flex-1">
              {(tex.featCar || []).map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
            <button type="button" onClick={() => router.push(`/upgrade?lang=${langCode}&plan=${PASS_META.auto.id}`)}
              className="w-full py-2.5 rounded-xl font-bold text-sm bg-[#2563EB] text-white hover:bg-[#1D4ED8] transition-all">
              {tex.planGetAuto}
            </button>
          </div>

          {/* CDL Pro  ·  white, gold border */}
          <div className="relative bg-white rounded-2xl p-5 border-2 border-[#F59E0B] shadow-sm flex flex-col text-center">
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#F59E0B] text-[#0B1C3D] text-[10px] font-bold px-3 py-1 rounded-full whitespace-nowrap">
              {tex.planGuaranteedBadge}
            </span>
            <div className="text-3xl mb-2 mt-1">🚛</div>
            <h3 className="text-sm font-bold text-[#92400E] mb-1">{tex.planCdlPro}</h3>
            <div className="text-2xl font-black text-[#0B1C3D] mb-0.5">{PASS_META.cdl.price}</div>
            <div className="text-xs text-[#64748B] mb-3">{tex.planDuration}</div>
            <ul className="space-y-1.5 text-xs text-[#475569] mb-4 text-left flex-1">
              {(tex.featCdl || []).map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
            <button type="button" onClick={() => router.push(`/upgrade?lang=${langCode}&plan=${PASS_META.cdl.id}`)}
              className="w-full py-2.5 rounded-xl font-semibold text-sm bg-[#F59E0B] text-[#0B1C3D] hover:bg-[#FBBF24] transition-all">
              {tex.planGetCdl}
            </button>
          </div>

        </div>
        <p className="text-center text-sm text-[#64748B] mt-4">{tex.pricingValueProp}</p>
        <p className="text-center text-sm text-[#64748B] mt-2">
          <button type="button"
            onClick={() => document.getElementById('state-selector')?.scrollIntoView({ behavior: 'smooth' })}
            className="text-[#2563EB] hover:underline font-medium">
            {tex.pricingStartFree || 'Or start free  ·  20 questions, no signup needed →'}
          </button>
        </p>
      </section>

      {/* Social proof */}
      <section className="w-full max-w-lg mx-auto mb-8 px-4">
        <h2 className="text-lg font-bold text-[#0B1C3D] text-center mb-6">{tex.socialProofTitle}</h2>
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="bg-white rounded-2xl p-4 text-center shadow-sm border border-[#E2E8F0]/60">
            <div className="text-2xl font-black text-[#2563EB]">34K+</div>
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
        <p className="text-center text-xs mt-1">
          <a href="https://www.trustpilot.com/review/dmvsos.com" target="_blank" rel="noopener noreferrer"
            className="text-[#2563EB] hover:underline">{tex.socialProofTrustpilot}</a>
        </p>
      </section>

      {/* FAQ */}
      <section className="w-full max-w-lg mx-auto mb-8 px-4">
        <h2 className="text-lg font-bold text-[#0B1C3D] text-center mb-5">{tex.faqTitle}</h2>
        <div className="flex flex-col gap-2">
          {(tex.faq || []).map((item, i) => (
            <details key={i} className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm group">
              <summary className="px-5 py-4 text-sm font-semibold text-[#0B1C3D] cursor-pointer list-none flex items-center justify-between">
                <span>{item.q}</span>
                <span className="text-[#94A3B8] text-xs group-open:rotate-180 transition-transform ml-3 shrink-0">▾</span>
              </summary>
              <p className="px-5 pb-4 text-sm text-[#475569] leading-relaxed">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="w-full max-w-lg mx-auto mb-8 px-4">
        <button
          type="button"
          onClick={() => document.getElementById('state-selector')?.scrollIntoView({ behavior: 'smooth' })}
          className="w-full py-4 rounded-2xl font-semibold text-base bg-[#2563EB] text-white hover:bg-[#1D4ED8] transition-all shadow-sm"
        >
          {tex.finalCtaText || 'Ready? Choose your state and start practicing →'}
        </button>
      </section>

      {/* Footer with guarantee badge */}
      <footer className="w-full max-w-lg mx-auto px-4 mt-8 pb-8">
        <div className="text-center mb-4">
          <span className="inline-flex items-center gap-1.5 text-xs text-[#10B981] font-medium bg-[#ECFDF5] px-3 py-1.5 rounded-full">
            🛡️ {tex.guaranteeBadge}
          </span>
        </div>
        <p className="text-xs text-[#94A3B8] text-center leading-relaxed">
          {tex.footerLegal || 'By continuing, you agree to our'}{' '}
          <Link href="/terms" className="text-[#2563EB] font-medium">{tex.terms || 'Terms'}</Link> {tex.and || 'and'}{' '}
          <Link href="/privacy" className="text-[#2563EB] font-medium">{tex.privacy || 'Privacy Policy'}</Link>.<br />
          {tex.footerFree || 'Free for everyone. No credit card needed.'}
        </p>
      </footer>

      <SupportFooter lang={langCode} />
    </main>
  );
}
