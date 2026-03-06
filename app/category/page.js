'use client';
import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { t } from '@/lib/translations';
import { getSavedLang } from '@/lib/lang';
import { useAuth } from '@/lib/AuthContext';

const categories = [
  { id: 'dmv', icon: '🚗', titleKey: 'catCar', descKey: 'carDesc', freeQuestions: 20, proQuestions: 40, timeMin: 25, color: '#2563EB', gradient: 'linear-gradient(135deg, #EFF6FF, #DBEAFE)', emojiSize: 'text-6xl' },
  { id: 'cdl', icon: '🚛', titleKey: 'catCdl', descKey: 'truckDesc', freeQuestions: 20, proQuestions: 50, timeMin: 35, color: '#0EA5E9', gradient: 'linear-gradient(135deg, #F0F9FF, #E0F2FE)', emojiSize: 'text-4xl' },
  { id: 'moto', icon: '🏍️', titleKey: 'catMoto', descKey: 'motoDesc', freeQuestions: 20, proQuestions: 30, timeMin: 20, color: '#D97706', gradient: 'linear-gradient(135deg, #FFF7ED, #FFEDD5)', emojiSize: 'text-4xl' },
];

function CategoryContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const state = searchParams.get('state') ?? '';
  const lang = searchParams.get('lang') || getSavedLang();
  const tex = t[lang] || t.en;
  const { isPro } = useAuth();

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 relative" style={{ background: 'linear-gradient(135deg, #EFF6FF 0%, #FFF7ED 100%)' }}>
      {/* Header */}
      <div className="absolute top-4 left-4 right-4 flex items-center justify-between">
        <button type="button" onClick={() => router.back()} className="text-sm text-[#94A3B8] hover:text-[#2563EB] transition font-medium">
          {tex.back}
        </button>
        <a href="/" className="flex items-center gap-2 cursor-pointer hover:opacity-90 transition">
          <Image src="/logo.png" alt="DMVSOS" width={28} height={28} className="rounded-lg" />
          <span className="text-lg font-bold text-[#0B1C3D]" style={{ letterSpacing: '-0.02em' }}>DMVSOS</span>
        </a>
        <div className="w-16" />
      </div>

      <div className="text-center mb-8 mt-12">
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
              <span className="font-bold text-[#1E293B] text-lg">{tex[cat.titleKey]}</span>
              <div className="text-sm text-[#64748B] mt-0.5">{tex[cat.descKey]}</div>
            </div>
            <div className="text-[#94A3B8] text-lg shrink-0">→</div>
          </button>
        ))}
      </div>

      {/* Manual link */}
      {state && (
        <div className="w-full max-w-md mt-6 text-center">
          <a
            href={`/manuals/${state}`}
            className="text-sm text-[#2563EB] hover:underline font-medium"
          >
            {tex.readManual} →
          </a>
        </div>
      )}
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
