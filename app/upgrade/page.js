'use client';
import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { supabase } from '@/lib/supabase';
import { t } from '@/lib/translations';
import { getSavedLang, saveLang } from '@/lib/lang';
import { flags } from '@/lib/flags';

const langs = [
  { label: 'EN', flag: flags.us, code: 'en' },
  { label: 'RU', flag: flags.ru, code: 'ru' },
  { label: 'ES', flag: flags.es, code: 'es' },
  { label: 'ZH', flag: flags.cn, code: 'zh' },
  { label: 'UA', flag: flags.ua, code: 'ua' },
];

function UpgradeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [lang, setLangState] = useState(searchParams.get('lang') || getSavedLang());
  const [showLangMenu, setShowLangMenu] = useState(false);
  const currentLang = langs.find(l => l.code === lang) || langs[0];
  function switchLang(code) { setLangState(code); saveLang(code); setShowLangMenu(false); }
  const preselect = searchParams.get('plan');
  const tex = t[lang] || t.en;

  const [loadingPlan, setLoadingPlan] = useState(null);
  const [error, setError] = useState(false);

  const plans = [
    {
      id: 'moto_pass',
      name: 'Moto Pass',
      icon: '🏍️',
      price: '$9.99',
      duration: tex.planDuration || 'Monthly · Cancel anytime',
      badge: null,
      style: 'outline',
      features: [
        '✓ Full Motorcycle question bank',
        '✓ All 50 states · 5 languages',
        '✓ All exam modes unlocked',
        '✓ Real exam simulation',
        '✓ Detailed explanations',
      ],
      btnLabel: 'Get Moto Pass  ·  $9.99',
    },
    {
      id: 'car_pass',
      name: 'Auto Pass',
      icon: '🚗',
      price: '$29.99',
      duration: tex.planDuration || 'Monthly · Cancel anytime',
      badge: tex.mostPopular || 'MOST POPULAR',
      style: 'blue',
      features: [
        '✓ Full Car question bank',
        '✓ All 50 states · 5 languages',
        '✓ All exam modes unlocked',
        '✓ Real exam simulation (60 min)',
        '✓ Detailed explanations',
      ],
      btnLabel: 'Get Auto Pass  ·  $29.99',
    },
    {
      id: 'cdl_pass',
      name: 'CDL Pro',
      icon: '🚛',
      price: '$59.99',
      duration: tex.planDuration || 'Monthly · Cancel anytime',
      badge: '🛡️ GUARANTEED',
      style: 'gold',
      features: [
        '✓ Full CDL question bank',
        '✓ Car tests included',
        '✓ All 50 states · 5 languages',
        '✓ All exam modes unlocked',
        '🛡️ Pass or 100% refund',
      ],
      btnLabel: 'Get CDL Pro  ·  $59.99',
    },
  ];

  async function handleCheckout(planId) {
    setLoadingPlan(planId);
    setError(false);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const fetchOpts = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planType: planId }),
      };
      if (session?.access_token) {
        fetchOpts.headers['Authorization'] = `Bearer ${session.access_token}`;
      }
      const res = await fetch('/api/create-checkout', fetchOpts);
      const data = await res.json();
      if (data?.url) window.location.href = data.url;
      else setError(true);
    } catch {
      setError(true);
    } finally {
      setLoadingPlan(null);
    }
  }

  return (
    <main className="min-h-screen bg-[#0B1C3D] flex flex-col items-center justify-center p-6 relative">

      {/* Lang switcher */}
      <div className="absolute top-4 right-4 z-10">
        <div className="relative">
          <button type="button" onClick={() => setShowLangMenu(v => !v)} onBlur={() => setTimeout(() => setShowLangMenu(false), 150)}
            className="flex items-center gap-1 text-xs font-semibold text-white bg-white/10 border border-white/20 rounded-full px-2.5 py-1.5 hover:border-white/40 transition-colors">
            <span>{currentLang.flag}</span><span>{currentLang.label}</span><span className="text-white/50 text-[10px] ml-0.5">▾</span>
          </button>
          {showLangMenu && (
            <div className="absolute right-0 top-full mt-1 bg-[#1E3A5F] border border-white/20 rounded-xl shadow-lg z-50 py-1 min-w-[90px]">
              {langs.map(l => (
                <button key={l.code} type="button" onMouseDown={() => switchLang(l.code)}
                  className={`w-full text-left px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 hover:bg-white/10 transition-colors ${lang === l.code ? 'text-[#F59E0B]' : 'text-[#94A3B8]'}`}>
                  <span>{l.flag}</span> <span>{l.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Logo */}
      <a href="/" className="inline-block">
        <div className="flex items-center gap-3 mb-8 cursor-pointer hover:opacity-80">
          <Image src="/logo.png" alt="DMVSOS" width={40} height={40} className="rounded-xl" />
          <span className="text-2xl font-bold text-white">DMV<span className="text-[#F59E0B]">SOS</span></span>
        </div>
      </a>

      {/* Hero */}
      <div className="text-center mb-6 max-w-lg">
        <h1 className="text-3xl font-bold text-white mb-3">
          {(tex.upgradeHero || 'Practice tonight.\nPass tomorrow.').split('\n').map((line, i, arr) => (
            <span key={i}>{line}{i < arr.length - 1 ? <br /> : null}</span>
          ))}
        </h1>
        <p className="text-[#94A3B8] text-base">{tex.upgradeSubtext}</p>
      </div>

      {/* Social proof */}
      <div className="flex gap-6 mb-6 text-center">
        <div>
          <div className="text-2xl font-bold text-[#F59E0B]">35K+</div>
          <div className="text-xs text-[#94A3B8]">{tex.statQuestions || 'questions'}</div>
        </div>
        <div className="w-px bg-[#1E3A5F]" />
        <div>
          <div className="text-2xl font-bold text-[#F59E0B]">50</div>
          <div className="text-xs text-[#94A3B8]">{tex.statStates}</div>
        </div>
        <div className="w-px bg-[#1E3A5F]" />
        <div>
          <div className="text-2xl font-bold text-[#F59E0B]">5</div>
          <div className="text-xs text-[#94A3B8]">{tex.statLanguages}</div>
        </div>
      </div>

      {/* Free tier chip */}
      <div className="w-full max-w-2xl mb-5 rounded-2xl p-4 border border-white/10 bg-white/5 flex items-center gap-4">
        <span className="text-2xl">✏️</span>
        <div className="flex-1">
          <div className="text-sm font-bold text-white">Free Practice · Car</div>
          <div className="text-xs text-[#94A3B8] mt-0.5">20 questions · always included · all 50 states</div>
        </div>
        <span className="text-xs font-semibold text-[#16A34A] bg-[#16A34A]/10 px-2.5 py-1 rounded-full border border-[#16A34A]/20 shrink-0">
          ✓ Free
        </span>
      </div>

      {/* 3 Plan cards */}
      <div className="w-full max-w-2xl flex flex-col sm:flex-row gap-4 mb-6">
        {plans.map((plan) => {
          const isPreselected = preselect === plan.id;
          const isBlue = plan.style === 'blue';
          const isGold = plan.style === 'gold';
          return (
            <div
              key={plan.id}
              className={`flex-1 rounded-2xl p-6 flex flex-col relative ${
                isBlue
                  ? 'bg-[#0B1C3D] border-2 border-[#2563EB]'
                  : isGold
                  ? 'bg-white border-2 border-[#F59E0B]'
                  : 'bg-white border border-[#E2E8F0]'
              } ${isPreselected ? 'ring-2 ring-offset-2 ring-offset-[#0B1C3D] ring-[#F59E0B]' : ''}`}
            >
              {plan.badge && (
                <span className={`absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] font-bold px-3 py-1 rounded-full whitespace-nowrap ${
                  isGold ? 'bg-[#F59E0B] text-[#0B1C3D]' : 'bg-[#2563EB] text-white'
                }`}>
                  {plan.badge}
                </span>
              )}
              <div className="text-3xl mb-3 mt-1">{plan.icon}</div>
              <div className={`text-sm font-bold mb-1 ${isBlue ? 'text-[#F59E0B]' : isGold ? 'text-[#92400E]' : 'text-[#2563EB]'}`}>
                {plan.name}
              </div>
              <div className={`text-3xl font-black mb-1 ${isBlue ? 'text-white' : 'text-[#0B1C3D]'}`}>
                {plan.price}
              </div>
              <div className={`text-xs mb-5 ${isBlue ? 'text-[#94A3B8]' : 'text-[#64748B]'}`}>
                {plan.duration}
              </div>
              <ul className="space-y-2 mb-5 flex-1">
                {plan.features.map((f, i) => (
                  <li key={i} className={`text-xs ${isBlue ? 'text-[#CBD5E1]' : 'text-[#475569]'}`}>
                    {f}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => handleCheckout(plan.id)}
                disabled={loadingPlan !== null}
                className={`w-full py-3 rounded-xl font-bold text-sm transition disabled:opacity-60 ${
                  isBlue
                    ? 'bg-[#2563EB] text-white hover:bg-[#1D4ED8]'
                    : isGold
                    ? 'bg-[#F59E0B] text-[#0B1C3D] hover:bg-[#FBBF24]'
                    : 'bg-[#F1F5F9] text-[#0B1C3D] hover:bg-[#E2E8F0]'
                }`}
              >
                {loadingPlan === plan.id ? '…' : plan.btnLabel}
              </button>
            </div>
          );
        })}
      </div>

      {/* CDL endorsements teaser */}
      <div className="w-full max-w-2xl mb-5 rounded-2xl p-4 border border-white/10 bg-white/5 text-center">
        <div className="text-xs text-[#94A3B8]">
          <span className="text-white font-semibold">CDL Pro</span> includes general CDL knowledge ·
          <span className="text-[#F59E0B] font-medium"> Endorsement add-ons coming soon</span>
          {' '}(Hazmat, School Bus, Tanker, Passenger…)
        </div>
      </div>

      {/* Value prop */}
      <p className="text-[#94A3B8] text-sm text-center max-w-md mb-4">
        {tex.pricingValueProp || '🛡️ One failed test = $50+ fees + weeks waiting. Plans pay for themselves.'}
      </p>

      {error && (
        <p className="text-center text-xs text-red-400 font-medium mb-4">
          {tex.checkoutError || 'Something went wrong. Please try again.'}
        </p>
      )}

      <p className="text-center text-xs text-[#64748B] mb-6">
        {tex.cancelAnytime || 'Monthly subscription · Cancel anytime'}
      </p>

      <button type="button" onClick={() => router.push('/')} className="text-[#94A3B8] text-sm hover:text-white">
        {tex.back}
      </button>
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
