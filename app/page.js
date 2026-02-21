'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const [lang, setLang] = useState('English');
  const [state, setState] = useState('');
  const router = useRouter();

  const langs = [
    { flag: '🇺🇸', name: 'English' },
    { flag: '🇷🇺', name: 'Русский' },
    { flag: '🇪🇸', name: 'Español' },
    { flag: '🇨🇳', name: '中文' },
    { flag: '🇺🇦', name: 'Українська' },
  ];

  const states = [
    'Washington (WA)', 'California (CA)', 'New York (NY)',
    'Texas (TX)', 'Florida (FL)', 'Illinois (IL)',
    'New Jersey (NJ)', 'Arizona (AZ)', 'Oregon (OR)', 'Nevada (NV)',
  ];

  return (
    <main style={{ fontFamily: 'DM Sans, sans-serif' }} className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center p-6 relative overflow-hidden">

      {/* Background blobs */}
      <div className="fixed top-[-200px] right-[-200px] w-[600px] h-[600px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(26,86,219,0.08) 0%, transparent 70%)' }} />
      <div className="fixed bottom-[-150px] left-[-150px] w-[500px] h-[500px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(245,158,11,0.06) 0%, transparent 70%)' }} />

      {/* Brand */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-3 mb-2">
          <div className="w-11 h-11 bg-[#0B1C3D] rounded-xl flex items-center justify-center">
            <span className="text-[#F59E0B] text-lg font-bold">✦</span>
          </div>
          <span className="text-[26px] font-bold text-[#0B1C3D] tracking-tight">
            DMV<span className="text-[#2563EB]">SOS</span>
          </span>
        </div>
        <p className="text-sm text-[#94A3B8]">Free DMV practice tests for all 50 states</p>
      </div>

      {/* Language bar */}
      <div className="flex gap-2 mb-6 flex-wrap justify-center">
        {langs.map((l) => (
          <button key={l.name} onClick={() => setLang(l.name)}
            className={`px-3 py-1 rounded-full text-xs font-medium border-[1.5px] transition-all ${
              lang === l.name
                ? 'bg-[#0B1C3D] text-white border-[#0B1C3D]'
                : 'border-[#E2E8F0] text-[#94A3B8] hover:border-[#2563EB] hover:text-[#2563EB]'
            }`}>
            {l.flag} {l.name}
          </button>
        ))}
      </div>

      {/* Card */}
      <div className="bg-white rounded-2xl p-9 w-full max-w-[440px] border border-[#E2E8F0]"
        style={{ boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05), 0 20px 60px -10px rgba(11,28,61,0.1)' }}>

        {/* Step dots */}
        <div className="flex justify-center gap-2 mb-7">
          <div className="w-5 h-[6px] rounded bg-[#2563EB]" />
          <div className="w-[6px] h-[6px] rounded-full bg-[#E2E8F0]" />
          <div className="w-[6px] h-[6px] rounded-full bg-[#E2E8F0]" />
        </div>

        <h2 className="text-[22px] font-bold text-[#1E293B] mb-1">Start practicing</h2>
        <p className="text-sm text-[#94A3B8] mb-7 leading-relaxed">Choose your state, then pick how to start. No experience needed.</p>

        {/* State */}
        <label className="text-xs font-semibold text-[#1E293B] uppercase tracking-widest mb-2 block">Your state</label>
        <select value={state} onChange={e => setState(e.target.value)}
          className="w-full px-4 py-3 border-[1.5px] border-[#E2E8F0] rounded-[10px] text-[15px] text-[#1E293B] bg-[#F8FAFC] mb-6 focus:outline-none focus:border-[#2563EB] transition cursor-pointer">
          <option value="">— Select your state —</option>
          {states.map(s => <option key={s}>{s}</option>)}
        </select>

        {/* Guest button */}
<button onClick={() => router.push('/category')}
  className="w-full bg-[#0B1C3D] text-white py-4 rounded-xl font-medium text-[15px] flex items-center justify-center gap-3 mb-3 hover:bg-[#132248] hover:-translate-y-px hover:shadow-lg transition-all">
  🚗 Start as Guest
  <span className="bg-[#FEF3C7] text-[#B45309] text-[11px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">No signup</span>
</button>

        {/* Divider */}
        <div className="flex items-center gap-3 my-6">
          <div className="flex-1 h-px bg-[#E2E8F0]" />
          <span className="text-xs text-[#94A3B8] font-medium whitespace-nowrap">or save your progress</span>
          <div className="flex-1 h-px bg-[#E2E8F0]" />
        </div>

        {/* Google */}
        <button className="w-full bg-white text-[#1E293B] border-[1.5px] border-[#E2E8F0] py-3 rounded-xl font-medium text-[15px] flex items-center justify-center gap-3 mb-3 hover:bg-[#F8FAFC] hover:-translate-y-px hover:shadow transition-all">
          🔵 Continue with Google
        </button>

        {/* Apple */}
        <button className="w-full bg-black text-white py-3 rounded-xl font-medium text-[15px] flex items-center justify-center gap-3 hover:bg-[#1a1a1a] hover:-translate-y-px hover:shadow-lg transition-all">
          🍎 Continue with Apple
        </button>

        {/* Info */}
        <div className="mt-5 bg-[rgba(26,86,219,0.04)] border border-[rgba(26,86,219,0.12)] rounded-[10px] p-3 flex gap-3">
          <span className="text-base flex-shrink-0 mt-0.5">💡</span>
          <p className="text-[12.5px] text-[#475569] leading-relaxed">
            <span className="text-[#2563EB] font-semibold">Guest mode:</span> Practice right away. Sign in anytime to save your score.
          </p>
        </div>

      </div>

      {/* Footer */}
      <p className="text-xs text-[#94A3B8] mt-5 text-center leading-relaxed">
        By continuing, you agree to our{' '}
        <a href="#" className="text-[#2563EB] font-medium">Terms</a> and{' '}
        <a href="#" className="text-[#2563EB] font-medium">Privacy Policy</a>.<br />
        Free for everyone. No credit card needed.
      </p>

    </main>
  );
}