'use client';
import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { t } from '@/lib/translations';

const categories = [
  { id: 'dmv', icon: '🚗', titleKey: 'car', descKey: 'carDesc', questions: 40, time: '25 min', color: '#2563EB', bg: '#EFF6FF' },
  { id: 'cdl', icon: '🚛', titleKey: 'truck', descKey: 'truckDesc', questions: 50, time: '35 min', color: '#16A34A', bg: '#F0FDF4' },
  { id: 'moto', icon: '🏍️', titleKey: 'motorcycle', descKey: 'motoDesc', questions: 30, time: '20 min', color: '#D97706', bg: '#FFFBEB' },
];

function CategoryContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const state = searchParams.get('state') ?? '';
  const lang = searchParams.get('lang') || 'en';
  const tex = t[lang] || t.en;

  return (
    <main className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center p-6">
      <div className="text-center mb-8">
        <span className="text-2xl font-bold text-[#0B1C3D]">
          DMV<span className="text-[#2563EB]">SOS</span>
        </span>
        <h2 className="text-xl font-bold text-[#1E293B] mt-4 mb-1">{tex.chooseTest}</h2>
        <p className="text-sm text-[#94A3B8]">{tex.selectLicense}</p>
      </div>

      <div className="w-full max-w-md flex flex-col gap-4">
        {categories.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => router.push(`/test?state=${state}&category=${cat.id}&lang=${lang}`)}
            className="bg-white border border-[#E2E8F0] rounded-2xl p-5 flex items-center gap-5 hover:border-[#2563EB] hover:shadow-md transition-all text-left shadow-sm"
          >
            <div className="w-14 h-14 rounded-xl flex items-center justify-center text-3xl flex-shrink-0"
              style={{ background: cat.bg }}>
              {cat.icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-[#1E293B] text-lg">{tex[cat.titleKey]}</div>
              <div className="text-sm text-[#94A3B8] mt-0.5 mb-2">{tex[cat.descKey]}</div>
              <div className="flex gap-2 flex-wrap">
                <span className="text-xs font-medium px-2.5 py-1 rounded-full"
                  style={{ background: cat.bg, color: cat.color }}>
                  {cat.questions} questions
                </span>
                <span className="text-xs font-medium px-2.5 py-1 rounded-full"
                  style={{ background: cat.bg, color: cat.color }}>
                  ⏱ {cat.time}
                </span>
              </div>
            </div>
            <div className="text-[#94A3B8] text-lg shrink-0">→</div>
          </button>
        ))}
      </div>

      <button type="button" onClick={() => router.push('/')}
        className="mt-8 text-sm text-[#94A3B8] hover:text-[#2563EB] transition">
        {tex.back}
      </button>
    </main>
  );
}

export default function Category() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center">Loading…</div>}>
      <CategoryContent />
    </Suspense>
  );
}