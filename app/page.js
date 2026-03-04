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
  const { user, isPro } = useAuth();
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

  const [demoSelected, setDemoSelected] = useState(null);
  const [demoRevealed, setDemoRevealed] = useState(false);
  const stateOptions = STATE_OPTIONS.map((display) => ({ name: display, code: stateToSlug(display) }));
  const steps = [
    { emoji: '📱', label: tex.step1, msg: tex.stepMsg1 },
    { emoji: '🏛️', label: tex.step2, msg: tex.stepMsg2 },
    { emoji: '🪪', label: tex.step3, msg: tex.stepMsg3 },
    { emoji: '🚗', label: tex.step4, msg: tex.stepMsg4 },
  ];

  const testimonials = [
    {
      text: '"Готовился на русском языке, всё понятно и чётко. Сдал с первого раза в Bellevue."',
      name: 'Михаил Д.', location: 'Bellevue, WA', initial: 'М',
      bg: 'bg-blue-100', color: 'text-blue-600', border: 'border-l-blue-500',
    },
    {
      text: '"Practiqué dos días en español y pasé el examen a la primera en Santa Monica."',
      name: 'Carlos R.', location: 'Santa Monica, CA', initial: 'C',
      bg: 'bg-orange-100', color: 'text-orange-600', border: 'border-l-orange-500',
    },
    {
      text: '"用中文练习很方便，两天后在Fort Lauderdale一次通过考试！"',
      name: 'Wei L.', location: 'Fort Lauderdale, FL', initial: 'W',
      bg: 'bg-red-100', color: 'text-red-600', border: 'border-l-red-500',
    },
    {
      text: '"I was so nervous but after practicing here every day, I passed on the first try!"',
      name: 'Sarah M.', location: 'Tacoma, WA', initial: 'S',
      bg: 'bg-green-100', color: 'text-green-600', border: 'border-l-green-500',
    },
  ];

  const faqJsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'How many questions are on the DMV written test?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Most states have between 20 and 50 questions on the DMV written knowledge test. The passing score is typically 80%. DMVSOS provides state-specific practice tests that match your state\'s actual exam format.',
        },
      },
      {
        '@type': 'Question',
        name: 'Can I take the DMV practice test in Spanish or other languages?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Yes! DMVSOS offers free DMV practice tests in English, Spanish, Russian, Chinese, and Ukrainian. Choose your preferred language and practice with real DMV-style questions.',
        },
      },
      {
        '@type': 'Question',
        name: 'Is this DMV practice test free?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Yes, DMVSOS offers a free tier with 20 practice questions per test for all 50 US states. Paid plans starting at $7.99 (30-day access) unlock the full question bank, detailed explanations, and all test types (Car, CDL, Motorcycle).',
        },
      },
      {
        '@type': 'Question',
        name: 'What types of DMV tests can I practice for?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'DMVSOS covers Car (regular driver\'s license), CDL (Commercial Driver\'s License), and Motorcycle permit tests for all 50 US states.',
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
                    {isPro ? (
                      <span className="text-[#F59E0B] font-medium text-xs">👑</span>
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-[#0B1C3D] flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                        {initial}
                      </div>
                    )}
                    <span className="hidden sm:block text-xs font-medium text-[#1E293B] max-w-[80px] truncate">{firstName}</span>
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
        <div className="grid grid-cols-5 gap-2">
          {[
            { value: '5K+', label: tex.statUsers },
            { value: '34K+', label: tex.statQuestions },
            { value: '50', label: tex.statStates },
            { value: '5', label: tex.statLanguages },
            { value: '94%', label: tex.statPassRate },
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

      {/* Motivator: 50% fail stat */}
      <section className="w-full max-w-lg mx-auto mb-8 px-4">
        <div className="bg-[#FEF3C7] border border-[#FDE68A] rounded-2xl p-5 text-center">
          <p className="text-sm font-bold text-[#92400E] mb-1">{tex.failStatTitle}</p>
          <p className="text-sm text-[#78350F] leading-relaxed">{tex.failStatText}</p>
        </div>
      </section>

      {/* Demo question */}
      <section className="w-full max-w-lg mx-auto mb-8 px-4">
        <h2 className="text-center text-lg font-bold text-[#0B1C3D] mb-4">{tex.demoTitle}</h2>
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-[#E2E8F0]/60">
          <p className="text-sm font-semibold text-[#1E293B] mb-4">{tex.demoQuestion}</p>
          <div className="flex flex-col gap-2">
            {[
              { key: 0, label: 'A', text: tex.demoA },
              { key: 1, label: 'B', text: tex.demoB },
              { key: 2, label: 'C', text: tex.demoC },
              { key: 3, label: 'D', text: tex.demoD },
            ].map((opt) => {
              const isCorrect = opt.key === 1;
              const isSelected = demoSelected === opt.key;
              let bg = 'bg-[#F8FAFC] hover:bg-[#EFF6FF] border-[#E2E8F0]';
              if (demoRevealed && isSelected && isCorrect) bg = 'bg-[#D1FAE5] border-[#10B981]';
              if (demoRevealed && isSelected && !isCorrect) bg = 'bg-[#FEE2E2] border-[#DC2626]';
              if (demoRevealed && !isSelected && isCorrect) bg = 'bg-[#D1FAE5] border-[#10B981]';
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => { if (!demoRevealed) { setDemoSelected(opt.key); setDemoRevealed(true); } }}
                  className={`w-full text-left px-4 py-3 rounded-xl border text-sm transition-all ${bg} ${demoRevealed ? 'cursor-default' : 'cursor-pointer'}`}
                >
                  <span className="font-semibold text-[#64748B] mr-2">{opt.label}.</span>
                  <span className="text-[#1E293B]">{opt.text}</span>
                </button>
              );
            })}
          </div>
          {demoRevealed && (
            <div className={`mt-4 p-3 rounded-xl text-sm ${demoSelected === 1 ? 'bg-[#ECFDF5] text-[#065F46]' : 'bg-[#FEF2F2] text-[#991B1B]'}`}>
              <p className="font-medium">{demoSelected === 1 ? tex.demoCorrect : tex.demoWrong}</p>
              <p className="mt-1 text-xs opacity-80">{tex.demoCta}</p>
            </div>
          )}
        </div>
      </section>

      {/* Testimonials — horizontal scroll on mobile, 2x2 grid on desktop */}
      <section className="w-full max-w-lg mx-auto mb-8 px-4">
        <h2 className="text-center text-xl font-bold text-[#0B1C3D] mb-1">
          {tex.testimonialsTitle}
        </h2>
        <p className="text-center text-sm text-[#64748B] mb-6">{tex.thousandsPassed}</p>

        <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-2 sm:grid sm:grid-cols-2 sm:overflow-visible">
          {testimonials.map((item, i) => (
            <div
              key={i}
              className={`min-w-[280px] sm:min-w-0 bg-white rounded-2xl p-5 shadow-sm border-l-4 ${item.border}`}
            >
              <div className="flex gap-0.5 mb-2 text-sm">⭐⭐⭐⭐⭐</div>
              <p className="text-sm text-[#475569] mb-3 leading-relaxed">{item.text}</p>
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full ${item.bg} flex items-center justify-center font-bold ${item.color} text-sm`}>
                  {item.initial}
                </div>
                <div>
                  <div className="text-sm font-semibold text-[#0B1C3D]">{item.name}</div>
                  <div className="text-xs text-gray-400">{item.location}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section className="w-full max-w-2xl mx-auto mb-8 px-4">
        <h2 className="text-xl font-bold text-[#0B1C3D] text-center mb-2">{tex.pricingHeading}</h2>
        <p className="text-sm text-[#64748B] text-center mb-6 leading-relaxed max-w-md mx-auto">{tex.pricingSubtext}</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Quick Pass */}
          <div className="bg-white rounded-2xl p-5 border border-[#E2E8F0] shadow-sm flex flex-col text-center">
            <h3 className="text-sm font-bold text-[#2563EB] mb-1">Quick Pass</h3>
            <div className="text-2xl font-black text-[#0B1C3D] mb-0.5">$7.99</div>
            <div className="text-xs text-[#64748B] mb-3">30 days · one payment</div>
            <ul className="space-y-1.5 text-xs text-[#475569] mb-4 text-left flex-1">
              <li>✓ Full question bank</li>
              <li>✓ All 50 states</li>
              <li>✓ Car, CDL & Motorcycle</li>
              <li>✓ 5 languages</li>
            </ul>
            <button type="button" onClick={() => router.push(`/upgrade?lang=${langCode}&plan=quick_pass`)}
              className="w-full py-2.5 rounded-xl font-semibold text-sm bg-[#F1F5F9] text-[#0B1C3D] hover:bg-[#E2E8F0] transition-all">
              {tex.upgradeCta || 'Get Quick Pass'}
            </button>
          </div>
          {/* Full Prep — Most Popular */}
          <div className="relative bg-[#0B1C3D] rounded-2xl p-5 border-2 border-[#2563EB] shadow-sm flex flex-col text-center">
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#2563EB] text-white text-[10px] font-bold px-3 py-1 rounded-full whitespace-nowrap">
              {tex.mostPopular}
            </span>
            <h3 className="text-sm font-bold text-[#F59E0B] mb-1 mt-1">Full Prep</h3>
            <div className="text-2xl font-black text-white mb-0.5">$14.99</div>
            <div className="text-xs text-[#94A3B8] mb-3">30 days · one payment</div>
            <ul className="space-y-1.5 text-xs text-[#CBD5E1] mb-4 text-left flex-1">
              <li>✅ Everything in Quick Pass</li>
              <li>✅ Challenge Bank (coming soon)</li>
              <li>✅ Readiness Meter (coming soon)</li>
              <li>✅ Detailed explanations</li>
            </ul>
            <button type="button" onClick={() => router.push(`/upgrade?lang=${langCode}&plan=full_prep`)}
              className="w-full py-2.5 rounded-xl font-bold text-sm bg-[#F59E0B] text-[#0B1C3D] hover:bg-[#FBBF24] transition-all">
              {tex.upgradeCta || 'Get Full Prep'}
            </button>
          </div>
          {/* Guaranteed Pass */}
          <div className="relative bg-white rounded-2xl p-5 border-2 border-[#F59E0B] shadow-sm flex flex-col text-center">
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#F59E0B] text-[#0B1C3D] text-[10px] font-bold px-3 py-1 rounded-full whitespace-nowrap">
              🛡️ GUARANTEED
            </span>
            <h3 className="text-sm font-bold text-[#92400E] mb-1 mt-1">Guaranteed Pass</h3>
            <div className="text-2xl font-black text-[#0B1C3D] mb-0.5">$39.99</div>
            <div className="text-xs text-[#64748B] mb-3">30 days · one payment</div>
            <ul className="space-y-1.5 text-xs text-[#475569] mb-4 text-left flex-1">
              <li>✅ Everything in Full Prep</li>
              <li>✅ Pass or 100% refund</li>
              <li>✅ Priority support</li>
              <li>✅ Study checklist</li>
            </ul>
            <button type="button" onClick={() => router.push(`/upgrade?lang=${langCode}&plan=guaranteed_pass`)}
              className="w-full py-2.5 rounded-xl font-semibold text-sm bg-[#0B1C3D] text-white hover:bg-[#1E3A5F] transition-all">
              {tex.upgradeCta || 'Get Guaranteed Pass'}
            </button>
          </div>
        </div>
        {/* Free start link */}
        <p className="text-center text-sm text-[#64748B] mt-4">
          Or{' '}
          <button type="button"
            onClick={() => document.getElementById('state-selector')?.scrollIntoView({ behavior: 'smooth' })}
            className="text-[#2563EB] hover:underline font-medium">
            start free — 20 questions, no signup needed →
          </button>
        </p>
      </section>

      {/* Pass Guarantee block */}
      <section className="w-full max-w-lg mx-auto mb-8 px-4">
        <div className="bg-[#ECFDF5] border border-[#A7F3D0] rounded-2xl p-6 text-center">
          <div className="text-3xl mb-2">🛡️</div>
          <h3 className="text-base font-bold text-[#065F46] mb-2">🛡️ Pass Guarantee — exclusive to Guaranteed Pass ($39.99)</h3>
          <p className="text-sm text-[#047857] leading-relaxed mb-4">{tex.guaranteeText}</p>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-[#059669] font-medium">✓ {tex.guaranteeBullet1}</span>
            <span className="text-xs text-[#059669] font-medium">✓ One payment · 30 days access · No auto-renewal</span>
            <span className="text-xs text-[#059669] font-medium">✓ {tex.guaranteeBullet3}</span>
          </div>
        </div>
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
