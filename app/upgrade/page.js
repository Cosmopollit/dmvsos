'use client';
import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { t } from '@/lib/translations';

function UpgradeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const lang = searchParams.get('lang') || 'en';
  const tex = t[lang] || t.en;

  const [loading, setLoading] = useState(false);

  async function handleSubscribe() {
    setLoading(true);
    try {
      const res = await fetch('/api/create-checkout', { method: 'POST' });
      const data = await res.json();
      if (data?.url) window.location.href = data.url;
    } finally {
      setLoading(false);
    }
  }

  const features = Array.isArray(tex.upgradeFeatures) ? tex.upgradeFeatures : [];

  return (
    <main className="min-h-screen bg-[#0B1C3D] flex flex-col items-center justify-center p-6">

      {/* Logo */}
      <div className="flex items-center gap-3 mb-8">
        <img src="/logo.png" alt="DMVSOS" className="w-10 h-10 rounded-xl" />
        <span className="text-2xl font-bold text-white">DMV<span className="text-[#F59E0B]">SOS</span></span>
      </div>

      {/* Hero */}
      <div className="text-center mb-8 max-w-lg">
        <div className="text-5xl mb-4">👑</div>
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
          <div className="text-2xl font-bold text-[#F59E0B]">94%</div>
          <div className="text-xs text-[#94A3B8]">pass rate</div>
        </div>
        <div className="w-px bg-[#1E3A5F]"></div>
        <div>
          <div className="text-2xl font-bold text-[#F59E0B]">50</div>
          <div className="text-xs text-[#94A3B8]">states</div>
        </div>
        <div className="w-px bg-[#1E3A5F]"></div>
        <div>
          <div className="text-2xl font-bold text-[#F59E0B]">5</div>
          <div className="text-xs text-[#94A3B8]">languages</div>
        </div>
      </div>

      {/* Pricing card */}
      <div className="bg-white rounded-2xl p-8 w-full max-w-md mb-6">
        <div className="flex justify-between items-start mb-6">
          <div>
            <div className="text-sm font-bold text-[#F59E0B] mb-1">PRO PLAN</div>
            <div className="text-4xl font-bold text-[#0B1C3D]">$39<span className="text-lg font-normal text-gray-400">/mo</span></div>
          </div>
          <span className="bg-[#F59E0B] text-black text-xs font-bold px-3 py-1 rounded-full">POPULAR</span>
        </div>

        <div className="space-y-3 mb-6">
          {features.map((f, i) => (
            <div key={i} className="text-[#1E293B] text-sm">{f}</div>
          ))}
        </div>

        <button
          onClick={handleSubscribe}
          disabled={loading}
          className="w-full bg-[#F59E0B] text-black font-bold py-4 rounded-xl text-lg hover:bg-[#D97706] transition disabled:opacity-70"
        >
          {loading ? '…' : (tex.upgradeCta || '🚗 Get Pro Access — $39/mo')}
        </button>

        <p className="text-center text-xs text-gray-400 mt-3">
          {tex.upgradeCancel}
        </p>
      </div>

      {/* Testimonial */}
      <div className="bg-[#1E3A5F] rounded-2xl p-6 w-full max-w-md mb-6">
        <p className="text-white text-sm italic mb-3">
          {tex.upgradeTestimonial}
        </p>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-[#F59E0B] flex items-center justify-center text-black font-bold text-sm">M</div>
          <div>
            <div className="text-white text-sm font-semibold">{tex.upgradeTestimonialAuthor}</div>
          </div>
        </div>
      </div>

      <button onClick={() => router.back()} className="text-[#94A3B8] text-sm hover:text-white">
        ← Back
      </button>
    </main>
  );
}

export default function Upgrade() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-[#0B1C3D] flex items-center justify-center"><p className="text-[#94A3B8]">Loading…</p></main>}>
      <UpgradeContent />
    </Suspense>
  );
}
