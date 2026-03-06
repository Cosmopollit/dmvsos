'use client';
import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { supabase } from '@/lib/supabase';
import { t } from '@/lib/translations';
import { getSavedLang } from '@/lib/lang';

function UpgradeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const lang = searchParams.get('lang') || getSavedLang();
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
      duration: '30 days · one payment',
      badge: tex.mostPopular || 'MOST POPULAR',
      style: 'blue',
      features: [
        '✓ Full Motorcycle question bank',
        '✓ Car tests included',
        '✓ All 50 states · 5 languages',
        '✓ All exam modes unlocked',
        '✓ Real exam simulation (60 min)',
      ],
      btnLabel: 'Get Moto Pass  ·  $9.99',
    },
    {
      id: 'cdl_pass',
      name: 'CDL Pro',
      icon: '🚛',
      price: '$19.99',
      duration: '30 days · one payment',
      badge: '🛡️ GUARANTEED',
      style: 'gold',
      features: [
        '✓ Full CDL question bank',
        '✓ Car tests included',
        '✓ All 50 states · 5 languages',
        '✓ All exam modes unlocked',
        '🛡️ Pass or 100% refund',
      ],
      btnLabel: 'Get CDL Pro  ·  $19.99',
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
    <main className="min-h-screen bg-[#0B1C3D] flex flex-col items-center justify-center p-6">

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
        <p className="text-[#94A3B8] text-base">
          {tex.upgradeSubtext}
        </p>
      </div>

      {/* Social proof */}
      <div className="flex gap-6 mb-6 text-center">
        <div>
          <div className="text-2xl font-bold text-[#F59E0B]">35K+</div>
          <div className="text-xs text-[#94A3B8]">{tex.statQuestions || 'questions'}</div>
        </div>
        <div className="w-px bg-[#1E3A5F]"></div>
        <div>
          <div className="text-2xl font-bold text-[#F59E0B]">50</div>
          <div className="text-xs text-[#94A3B8]">{tex.statStates}</div>
        </div>
        <div className="w-px bg-[#1E3A5F]"></div>
        <div>
          <div className="text-2xl font-bold text-[#F59E0B]">5</div>
          <div className="text-xs text-[#94A3B8]">{tex.statLanguages}</div>
        </div>
      </div>

      {/* Free tier chip */}
      <div className="w-full max-w-md mb-5 rounded-2xl p-4 border border-white/10 bg-white/5 flex items-center gap-4">
        <span className="text-3xl">🚗</span>
        <div className="flex-1">
          <div className="text-sm font-bold text-white">Car Tests · Free</div>
          <div className="text-xs text-[#94A3B8] mt-0.5">20 questions · always included · all 50 states</div>
        </div>
        <span className="text-xs font-semibold text-[#16A34A] bg-[#16A34A]/10 px-2.5 py-1 rounded-full border border-[#16A34A]/20 shrink-0">
          ✓ Free
        </span>
      </div>

      {/* 2 Plan cards */}
      <div className="w-full max-w-md flex flex-col sm:flex-row gap-4 mb-6">
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
                  : 'bg-white border-2 border-[#F59E0B]'
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
              <div className={`text-sm font-bold mb-1 ${isBlue ? 'text-[#F59E0B]' : 'text-[#92400E]'}`}>
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
                    : 'bg-[#F59E0B] text-[#0B1C3D] hover:bg-[#FBBF24]'
                }`}
              >
                {loadingPlan === plan.id ? '…' : plan.btnLabel}
              </button>
            </div>
          );
        })}
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

      {/* Fine print */}
      <p className="text-center text-xs text-[#64748B] mb-6">
        {tex.cancelAnytime || 'One payment · No subscription · No auto-renewal'}
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
