'use client';
import { useState } from 'react';

const features = [
  'All 50 states',
  'All categories',
  '4 languages',
  'Unlimited tests',
];

export default function Upgrade() {
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

  return (
    <main className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md text-center">
        {/* Logo */}
        <div className="inline-flex items-center gap-3 mb-8">
          <div className="w-11 h-11 bg-[#0B1C3D] rounded-xl flex items-center justify-center">
            <span className="text-[#F59E0B] text-lg font-bold">✦</span>
          </div>
          <span className="text-[26px] font-bold text-[#0B1C3D] tracking-tight">
            DMV<span className="text-[#2563EB]">SOS</span>
          </span>
        </div>

        <h1 className="text-2xl font-bold text-[#1E293B] mb-2">Upgrade to Pro</h1>
        <p className="text-4xl font-bold text-[#0B1C3D] mb-6">$39<span className="text-lg font-normal text-[#94A3B8]">/month</span></p>

        <ul className="bg-white rounded-2xl border border-[#E2E8F0] p-6 text-left mb-6 space-y-3">
          {features.map((f) => (
            <li key={f} className="flex items-center gap-3 text-[#1E293B]">
              <span className="text-[#16A34A]">✓</span>
              {f}
            </li>
          ))}
        </ul>

        <button
          onClick={handleSubscribe}
          disabled={loading}
          className="w-full bg-[#0B1C3D] text-white py-4 rounded-xl font-semibold text-base hover:bg-[#132248] disabled:opacity-70 transition-all"
        >
          {loading ? 'Redirecting…' : 'Subscribe Now'}
        </button>
      </div>
    </main>
  );
}
