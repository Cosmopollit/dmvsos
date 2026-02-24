'use client';
import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { t } from '@/lib/translations';
import { getSavedLang } from '@/lib/lang';

const categories = [
  { id: 'dmv', icon: '🚗', titleKey: 'catCar', descKey: 'carDesc', questions: 40, timeMin: 25, color: '#2563EB', gradient: 'linear-gradient(135deg, #EFF6FF, #DBEAFE)', badge: null, emojiSize: 'text-6xl' },
  { id: 'cdl', icon: '🚛', titleKey: 'catCdl', descKey: 'truckDesc', questions: 50, timeMin: 35, color: '#0EA5E9', gradient: 'linear-gradient(135deg, #F0F9FF, #E0F2FE)', badge: null, emojiSize: 'text-4xl' },
  { id: 'moto', icon: '🏍️', titleKey: 'catMoto', descKey: 'motoDesc', questions: 30, timeMin: 20, color: '#D97706', gradient: 'linear-gradient(135deg, #FFF7ED, #FFEDD5)', badge: null, emojiSize: 'text-4xl' },
];

function CategoryContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const state = searchParams.get('state') ?? '';
  const lang = searchParams.get('lang') || getSavedLang();
  const tex = t[lang] || t.en;

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 relative" style={{ background: 'linear-gradient(135deg, #EFF6FF 0%, #FFF7ED 100%)' }}>
      <button type="button" aria-label="Close" onClick={() => router.push('/')} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-2xl">
        ✕
      </button>
      <div className="text-center mb-8">
        <span className="text-2xl font-black text-[#0B1C3D] tracking-tight">
          DMVSOS
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
            className="rounded-2xl p-5 flex items-center gap-5 hover:shadow-lg transition-all text-left border-2 border-white/60 shadow-md"
            style={{ background: cat.gradient }}
          >
            <div className={`flex-shrink-0 ${cat.emojiSize}`}>
              {cat.icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-[#1E293B] text-lg">{tex[cat.titleKey]}</span>
                {cat.badge && (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-white/70 text-[#475569]">
                    {cat.badge}
                  </span>
                )}
              </div>
              <div className="text-sm text-[#64748B] mt-0.5 mb-2">{tex[cat.descKey]}</div>
              <div className="flex gap-2 flex-wrap">
                <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-white/70" style={{ color: cat.color }}>
                  {cat.questions} {tex.questionsLabel || 'questions'}
                </span>
                <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-white/70" style={{ color: cat.color }}>
                  ⏱ {cat.timeMin} {tex.minLabel || 'min'}
                </span>
              </div>
            </div>
            <div className="text-[#94A3B8] text-lg shrink-0">→</div>
          </button>
        ))}
      </div>
    </main>
  );
}

export default function Category() {
  return (
    <Suspense fallback={<main className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #EFF6FF 0%, #FFF7ED 100%)' }}><div className="w-6 h-6 border-2 border-[#94A3B8] border-t-transparent rounded-full animate-spin" /></main>}>
      <CategoryContent />
    </Suspense>
  );
}