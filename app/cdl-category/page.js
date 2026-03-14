'use client';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { t } from '@/lib/translations';
import { getSavedLang, saveLang } from '@/lib/lang';
import { STATE_OPTIONS } from '@/lib/states';
import { flags } from '@/lib/flags';

const cdlSubs = [
  { id: 'general_knowledge', icon: '📋', titleKey: 'cdlGeneral', descKey: 'cdlGeneralDesc', gradient: 'linear-gradient(135deg, #F0F9FF, #E0F2FE)' },
  { id: 'air_brakes',        icon: '💨', titleKey: 'cdlAirBrakes', descKey: 'cdlAirBrakesDesc', gradient: 'linear-gradient(135deg, #EEF2FF, #E0E7FF)' },
  { id: 'combination',       icon: '🔗', titleKey: 'cdlCombination', descKey: 'cdlCombinationDesc', gradient: 'linear-gradient(135deg, #F5F3FF, #EDE9FE)' },
];

const langs = [
  { label: 'EN', flag: flags.us, code: 'en' },
  { label: 'RU', flag: flags.ru, code: 'ru' },
  { label: 'ES', flag: flags.es, code: 'es' },
  { label: 'ZH', flag: flags.cn, code: 'zh' },
  { label: 'UA', flag: flags.ua, code: 'ua' },
];

function slugToStateName(slug) {
  if (!slug) return '';
  const match = STATE_OPTIONS.find(s =>
    s.replace(/\s*\([A-Z]{2}\)\s*$/, '').trim().toLowerCase().replace(/\s+/g, '-') === slug
  );
  return match ? match.replace(/\s*\([A-Z]{2}\)\s*$/, '').trim() : slug;
}

function CdlCategoryContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const state = searchParams.get('state') ?? '';
  const [lang, setLangState] = useState(searchParams.get('lang') || getSavedLang());
  const [showLangMenu, setShowLangMenu] = useState(false);
  const tex = t[lang] || t.en;
  const currentLang = langs.find(l => l.code === lang) || langs[0];
  const stateName = slugToStateName(state);

  function switchLang(code) {
    setLangState(code);
    saveLang(code);
    setShowLangMenu(false);
  }

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
        {/* Language switcher */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowLangMenu(v => !v)}
            onBlur={() => setTimeout(() => setShowLangMenu(false), 150)}
            className="flex items-center gap-1 text-xs font-semibold text-[#64748B] bg-white border border-[#E2E8F0] rounded-full px-2.5 py-1.5 hover:border-[#2563EB] transition-colors"
          >
            <span>{currentLang.flag}</span>
            <span>{currentLang.label}</span>
            <span className="text-[#94A3B8] text-[10px] ml-0.5">▾</span>
          </button>
          {showLangMenu && (
            <div className="absolute right-0 top-full mt-1 bg-white border border-[#E2E8F0] rounded-xl shadow-lg z-50 py-1 min-w-[90px]">
              {langs.map(l => (
                <button
                  key={l.code}
                  type="button"
                  onMouseDown={() => switchLang(l.code)}
                  className={`w-full text-left px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 hover:bg-[#F8FAFC] transition-colors ${lang === l.code ? 'text-[#2563EB]' : 'text-[#64748B]'}`}
                >
                  <span>{l.flag}</span> <span>{l.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="text-center mb-8 mt-12">
        {stateName && (
          <p className="text-sm font-semibold text-[#2563EB] mb-1 uppercase tracking-wide">{stateName}</p>
        )}
        <div className="text-4xl mb-3">🚛</div>
        <h2 className="text-xl font-bold text-[#1E293B] mb-1">{tex.catCdl || 'CDL Test'}</h2>
        <p className="text-sm text-[#94A3B8]">{tex.cdlChooseSub || 'Choose a test section'}</p>
      </div>

      <div className="w-full max-w-md flex flex-col gap-4">
        {cdlSubs.map(sub => (
          <button
            key={sub.id}
            type="button"
            onClick={() => router.push(`/test?state=${state}&category=cdl&subcategory=${sub.id}&lang=${lang}`)}
            className="w-full rounded-2xl p-5 flex items-center gap-5 hover:shadow-lg transition-all text-left border-2 border-white/60 shadow-md"
            style={{ background: sub.gradient }}
          >
            <div className="text-4xl flex-shrink-0">{sub.icon}</div>
            <div className="flex-1 min-w-0">
              <span className="font-bold text-[#1E293B] text-lg">{tex[sub.titleKey] || sub.id.replace(/_/g, ' ')}</span>
              <div className="text-sm text-[#64748B] mt-0.5">{tex[sub.descKey] || ''}</div>
            </div>
            <div className="text-[#94A3B8] text-lg shrink-0">→</div>
          </button>
        ))}
      </div>

      {/* Manual link */}
      {state && (
        <div className="w-full max-w-md mt-6 text-center">
          <a href={`/manuals/${state}/cdl`} className="text-sm text-[#2563EB] hover:underline font-medium">
            {tex.readManual || 'Read the official CDL manual'} →
          </a>
        </div>
      )}
    </main>
  );
}

export default function CdlCategory() {
  return (
    <Suspense fallback={<main className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #EFF6FF 0%, #FFF7ED 100%)' }}><div className="w-6 h-6 border-2 border-[#94A3B8] border-t-transparent rounded-full animate-spin" /></main>}>
      <CdlCategoryContent />
    </Suspense>
  );
}
