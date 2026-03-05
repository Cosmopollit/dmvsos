'use client';
import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { t } from '@/lib/translations';
import { getSavedLang, saveLang } from '@/lib/lang';
import { STATE_OPTIONS, stateToSlug } from '@/lib/states';
import { flags } from '@/lib/flags';

const codeToName = { en: 'English', ru: 'Русский', es: 'Español', zh: '中文', ua: 'Українська' };

export default function Home() {
  const { user, isPro, planType } = useAuth();
  const [lang, setLang] = useState(() => codeToName[getSavedLang()] || 'English');
  const [state, setState] = useState('');
  const [liveCount] = useState(() => Math.floor(Math.random() * 30) + 30);
  const [showLangMenu, setShowLangMenu] = useState(false);
  const stateSelectRef = useRef(null);
  const router = useRouter();

  const langToCode = { English: 'en', 'Русский': 'ru', 'Español': 'es', '中文': 'zh', 'Українська': 'ua' };
  const langCode = langToCode[lang] || 'en';
  const tex = t[langCode] || t.en;

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
        name: 'Is this a subscription? Will I be charged again?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'No. All plans are one-time payments. No subscription, no auto-renewal, no hidden charges.',
        },
      },
      {
        '@type': 'Question',
        name: 'How long does access last?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Quick Pass gives 7 days of access, Full Prep gives 30 days, and Guaranteed Pass gives 90 days.',
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
        name: "What's the difference between Quick Pass and Full Prep?",
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Quick Pass ($7.99) gives 7 days access to the full question bank. Full Prep ($14.99) adds detailed explanations, progress tracking, and 30 days of access.',
        },
      },
      {
        '@type': 'Question',
        name: 'What is the Pass Guarantee?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Guaranteed Pass ($39.99) includes a 100% money-back guarantee if you fail your DMV test. It also includes 90 days of access and direct support via Telegram and WhatsApp in your language.',
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

      {/* Background blobs */}
      <div className="fixed top-[-200px] right-[-200px] w-[600px] h-[600px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(26,86,219,0.08) 0%, transparent 70%)' }} />
      <div className="fixed bottom-[-150px] left-[-150px] w-[500px] h-[500px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(245,158,11,0.06) 0%, transparent 70%)' }} />

      {/* Header: logo + lang dropdown + user | nav links row */}
      <header className="w-full max-w-lg mx-auto pt-5 pb-0 px-4">
        {/* Row 1: logo + compact lang + user/login */}
        <div className="flex items-center justify-between pb-3">
          <a href="/" className="flex items-center gap-2 cursor-pointer hover:opacity-90 transition">
            <Image src="/logo.png" alt="DMVSOS" width={32} height={32} className="rounded-lg" />
            <span className="text-lg font-bold text-[#0B1C3D]" style={{ letterSpacing: '-0.02em' }}>DMVSOS</span>
          </a>
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
                    {planType === 'guaranteed_pass' && (
                      <span className="hidden sm:inline text-[10px] font-semibold bg-[#FEF3C7] text-[#B45309] px-1.5 py-0.5 rounded-full whitespace-nowrap">Guaranteed</span>
                    )}
                    {planType === 'full_prep' && (
                      <span className="hidden sm:inline text-[10px] font-semibold bg-[#DBEAFE] text-[#1D4ED8] px-1.5 py-0.5 rounded-full whitespace-nowrap">Full Prep</span>
                    )}
                    {planType === 'quick_pass' && (
                      <span className="hidden sm:inline text-[10px] font-semibold bg-[#F3F4F6] text-[#4B5563] px-1.5 py-0.5 rounded-full whitespace-nowrap">Quick Pass</span>
                    )}
                    {!planType && (
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

        {/* Row 2: nav links — centered */}
        <div className="flex items-center justify-center gap-2 pb-3">
          <a href="/dmv-test"
            className="text-xs font-semibold text-[#2563EB] bg-[#EFF6FF] border border-[#BFDBFE] rounded-full px-3 py-1 hover:bg-[#DBEAFE] transition-colors">
            📋 Practice Tests
          </a>
          <a href="/manuals"
            className="text-xs font-semibold text-[#64748B] bg-white border border-[#E2E8F0] rounded-full px-3 py-1 hover:border-[#2563EB] hover:text-[#2563EB] transition-colors">
            📖 Manuals
          </a>
        </div>
      </header>

      {/* Hero section */}
      <section className="w-full max-w-lg mx-auto px-4 pt-1 pb-5 text-center">
        {/* H1 headline — DM Sans, Anthropic-style */}
        <h1 className="text-[32px] sm:text-[42px] font-semibold text-[#0B1C3D] leading-[1.13] mb-3 whitespace-pre-line"
          style={{ fontFamily: "'DM Sans', var(--font-dm-sans), sans-serif", letterSpacing: '-0.025em' }}>
          {tex.heroTitle}
        </h1>

        {/* Subheadline */}
        <p className="text-[15px] font-normal leading-relaxed"
          style={{ color: '#64748B', letterSpacing: '-0.01em' }}>
          {tex.heroSub}
        </p>
      </section>

      {/* State selector card */}
      <div id="state-selector" className="w-full max-w-lg mx-auto px-4 mb-8">
        <div className="bg-white rounded-3xl shadow-2xl p-6 sm:p-8 border border-[#E2E8F0]/40" style={{ borderTop: '4px solid #2563EB' }}>

        <p className="text-sm text-[#94A3B8] mb-5">{tex.selectStateLabel}</p>

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

        {(() => {
          const isProWithState = user && isPro && state;
          const buttonLabel = !state ? tex.ctaNoState : (isProWithState ? tex.ctaProReady : tex.ctaReady);
          const isAmber = isProWithState;
          return (
            <>
              <button
                type="button"
                onClick={() => {
                  if (state) {
                    router.push(`/category?state=${state}&lang=${langCode}`);
                  } else {
                    document.getElementById('state-selector')?.scrollIntoView({ behavior: 'smooth' });
                    stateSelectRef.current?.focus();
                  }
                }}
                className={`w-full mt-4 py-4 rounded-xl font-semibold text-[15px] flex items-center justify-center gap-2 transition-all ${
                  !state
                    ? 'bg-[#E2E8F0] text-[#94A3B8] cursor-default'
                    : `text-white cursor-pointer btn-pulse ${isAmber ? 'bg-[#F59E0B] hover:bg-[#D97706]' : 'bg-[#2563EB] hover:bg-[#1D4ED8]'}`
                }`}
              >
                {buttonLabel}
              </button>
              {isPro && state ? (
                <p className="text-xs text-center mt-3 text-[#B45309] font-medium">{tex.proActive}</p>
              ) : (
                <div className="flex flex-wrap gap-2 justify-center mt-3">
                  <span className="inline-flex items-center gap-1 text-xs text-[#64748B] bg-[#F1F5F9] px-2.5 py-1 rounded-full">{tex.trust1}</span>
                  <span className="inline-flex items-center gap-1 text-xs text-[#64748B] bg-[#F1F5F9] px-2.5 py-1 rounded-full">{tex.trust2}</span>
                  <span className="inline-flex items-center gap-1 text-xs text-[#64748B] bg-[#F1F5F9] px-2.5 py-1 rounded-full">{tex.trust3}</span>
                </div>
              )}
            </>
          );
        })()}
        {state && (
          <p className="text-xs text-gray-400 mt-2 text-center">🟢 {liveCount} {tex.practicingNow}</p>
        )}
        </div>
      </div>

      {/* Driver Manual link */}
      <div className="w-full max-w-lg mx-auto px-4 mb-4">
        <a
          href="/manuals"
          className="flex items-center gap-3 bg-white rounded-2xl px-4 py-3.5 shadow-sm border border-[#E2E8F0]/60 hover:border-[#2563EB] hover:shadow-md transition-all group"
        >
          <div className="w-9 h-9 rounded-lg bg-[#EFF6FF] flex items-center justify-center text-lg shrink-0 group-hover:bg-[#DBEAFE] transition-colors">📖</div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-[#0B1C3D] group-hover:text-[#2563EB]">
              {tex.manualsSectionTitle}
            </div>
            <div className="text-[11px] text-[#94A3B8]">
              {tex.manualsSectionDesc}
            </div>
          </div>
          <div className="text-[#94A3B8] shrink-0 group-hover:text-[#2563EB]">→</div>
        </a>
      </div>

      {/* Stats bar */}
      <section className="w-full max-w-lg mx-auto px-4 mb-8">
        <div className="grid grid-cols-4 gap-2">
          {[
            { value: '5K+', label: tex.statUsers },
            { value: '34K+', label: tex.statQuestions },
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

      {/* How it works — static 4-column grid */}
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

      {/* Pricing CTA — link to /upgrade for full plan cards */}
      <section className="w-full max-w-lg mx-auto mb-8 px-4">
        <div className="bg-[#0B1C3D] rounded-2xl p-6 text-center">
          <h2 className="text-lg font-bold text-white mb-1">{tex.pricingHeading}</h2>
          <p className="text-sm text-[#94A3B8] mb-4">{tex.pricingSubtext || 'From $7.99 · One payment · No subscription'}</p>
          <div className="flex items-center justify-center gap-3 flex-wrap mb-4">
            <span className="text-xs font-semibold text-[#CBD5E1] bg-[#1E3A5F] px-3 py-1.5 rounded-full">Quick Pass $7.99 · 7 days</span>
            <span className="text-xs font-bold text-white bg-[#2563EB] px-3 py-1.5 rounded-full">{tex.mostPopular || 'MOST POPULAR'} · Full Prep $14.99 · 30 days</span>
            <span className="text-xs font-semibold text-[#B45309] bg-[#FEF3C7] px-3 py-1.5 rounded-full">🛡️ Guaranteed Pass $39.99 · 90 days</span>
          </div>
          <button type="button" onClick={() => router.push(`/upgrade?lang=${langCode}`)}
            className="w-full py-3 rounded-xl font-bold text-sm bg-[#2563EB] text-white hover:bg-[#1D4ED8] transition-all">
            {tex.planGetFullPrep || 'See all plans →'}
          </button>
          <p className="text-xs text-[#64748B] mt-3">{tex.cancelAnytime || 'One payment · No subscription · No auto-renewal'}</p>
        </div>
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
          <a href="/terms" className="text-[#2563EB] font-medium">{tex.terms || 'Terms'}</a> {tex.and || 'and'}{' '}
          <a href="/privacy" className="text-[#2563EB] font-medium">{tex.privacy || 'Privacy Policy'}</a>.<br />
          {tex.footerFree || 'Free for everyone. No credit card needed.'}
        </p>
      </footer>

    </main>
  );
}
