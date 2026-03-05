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
      id: 'quick_pass',
      name: 'Quick Pass',
      price: '$7.99',
      duration: tex.quickPassDuration || '7 days · one payment',
      badge: null,
      style: 'outline',
      features: tex.quickPassFeatures || ['Full question bank', 'All 50 states', 'Car, CDL & Motorcycle', '5 languages'],
      btnLabel: tex.planGetQuickPass || 'Get Quick Pass — $7.99',
    },
    {
      id: 'full_prep',
      name: 'Full Prep',
      price: '$14.99',
      duration: tex.fullPrepDuration || '30 days · one payment',
      badge: tex.mostPopular || 'MOST POPULAR',
      style: 'blue',
      features: tex.fullPrepFeatures || ['Everything in Quick Pass', 'Challenge Bank (coming soon)', 'Readiness Meter (coming soon)', 'Detailed explanations'],
      btnLabel: tex.planGetFullPrep || 'Get Full Prep — $14.99',
    },
    {
      id: 'guaranteed_pass',
      name: 'Guaranteed Pass',
      price: '$39.99',
      duration: tex.guaranteedPassDuration || '90 days · one payment',
      badge: tex.planGuaranteedBadge || '🛡️ GUARANTEED',
      style: 'gold',
      features: tex.guaranteedPassFeatures || ['Everything in Full Prep', '🛡️ Pass or 100% refund', 'Priority support', 'Study checklist'],
      btnLabel: tex.planGetGuaranteedPass || 'Get Guaranteed Pass — $39.99',
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
      <div className="text-center mb-8 max-w-lg">
        <h1 className="text-3xl font-bold text-white mb-3">
          {(tex.upgradeHero || 'Practice tonight.\nPass tomorrow.').split('\n').map((line, i, arr) => (
            <span key={i}>{line}{i < arr.length - 1 ? <br /> : null}</span>
          ))}
        </h1>
        <p className="text-[#94A3B8] text-lg">
          {tex.upgradeSubtext}
        </p>
      </div>

      {/* Social proof */}
      <div className="flex gap-6 mb-8 text-center">
        <div>
          <div className="text-2xl font-bold text-[#F59E0B]">34K+</div>
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

      {/* 3 Plan cards */}
      <div className="w-full max-w-2xl flex flex-col sm:flex-row gap-4 mb-6">
        {plans.map((plan) => {
          const isPreselected = preselect === plan.id;
          const isBlue = plan.style === 'blue';
          const isGold = plan.style === 'gold';
          const isOutline = plan.style === 'outline';
          return (
            <div
              key={plan.id}
              className={`flex-1 rounded-2xl p-6 flex flex-col relative ${
                isBlue
                  ? 'bg-[#0B1C3D] border-2 border-[#2563EB]'
                  : isGold
                  ? 'bg-white border-2 border-[#F59E0B]'
                  : 'bg-white border border-[#E2E8F0]'
              } ${isPreselected ? 'ring-2 ring-[#F59E0B]' : ''}`}
            >
              {plan.badge && (
                <span className={`absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] font-bold px-3 py-1 rounded-full whitespace-nowrap ${
                  isGold ? 'bg-[#F59E0B] text-[#0B1C3D]' : 'bg-[#2563EB] text-white'
                }`}>
                  {plan.badge}
                </span>
              )}
              <div className={`text-sm font-bold mb-1 mt-1 ${isBlue ? 'text-[#F59E0B]' : isGold ? 'text-[#92400E]' : 'text-[#2563EB]'}`}>
                {plan.name}
              </div>
              <div className={`text-3xl font-black mb-1 ${isBlue ? 'text-white' : 'text-[#0B1C3D]'}`}>
                {plan.price}
              </div>
              <div className={`text-xs mb-4 ${isBlue ? 'text-[#94A3B8]' : 'text-[#64748B]'}`}>
                {plan.duration}
              </div>
              <ul className="space-y-2 mb-5 flex-1">
                {plan.features.map((f, i) => (
                  <li key={i} className={`text-xs flex items-start gap-1.5 ${isBlue ? 'text-[#CBD5E1]' : 'text-[#475569]'}`}>
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
                    ? 'bg-[#2563EB] text-white hover:bg-[#1D4ED8] animate-pulse'
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

      {/* Value prop */}
      <p className="text-[#94A3B8] text-sm text-center max-w-md mb-6">
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
