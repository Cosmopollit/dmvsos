'use client';
import { useRouter } from 'next/navigation';
import { t } from '@/lib/translations';
import { getSavedLang } from '@/lib/lang';

export default function Success() {
  const router = useRouter();
  const lang = getSavedLang();
  const tex = t[lang] || t.en;

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

        {/* Success card */}
        <div className="bg-white rounded-2xl p-8 shadow-lg border border-[#E2E8F0] mb-6">
          <div className="w-16 h-16 bg-[#F0FDF4] rounded-full flex items-center justify-center mx-auto mb-5">
            <span className="text-4xl text-[#16A34A]">✓</span>
          </div>
          <h1 className="text-xl font-bold text-[#0B1C3D] mb-3">{tex.paymentSuccess || 'Payment successful!'}</h1>
          <p className="text-[#475569] text-sm leading-relaxed mb-6">
            {tex.welcomePro || 'Welcome to DMVSOS Pro! You now have access to all tests.'}
          </p>

          <button type="button" onClick={() => router.push(`/?lang=${lang}`)}
            className="w-full bg-[#2563EB] text-white py-4 rounded-xl font-semibold text-base hover:bg-[#1D4ED8] hover:-translate-y-0.5 hover:shadow-lg transition-all mb-3">
            {tex.startPracticing || 'Start practicing'}
          </button>
          <button type="button" onClick={() => router.push('/')}
            className="w-full bg-white border-2 border-[#E2E8F0] text-[#1E293B] py-3 rounded-xl font-semibold text-base hover:border-[#2563EB] hover:text-[#2563EB] transition-all">
            {tex.home || 'Go to home'}
          </button>
        </div>
      </div>
    </main>
  );
}
