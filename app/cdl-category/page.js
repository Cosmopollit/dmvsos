'use client';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { t } from '@/lib/translations';
import { getSavedLang, saveLang } from '@/lib/lang';
import { STATE_OPTIONS } from '@/lib/states';

const cdlSubs = [
  { id: 'general_knowledge', img: '/illustrations/cdl-general.png',      titleKey: 'cdlGeneral',     descKey: 'cdlGeneralDesc',     gradient: 'linear-gradient(135deg, #F0F9FF, #E0F2FE)', accent: '#0EA5E9' },
  { id: 'air_brakes',        img: '/illustrations/cdl-brakes.png',       titleKey: 'cdlAirBrakes',   descKey: 'cdlAirBrakesDesc',   gradient: 'linear-gradient(135deg, #EEF2FF, #E0E7FF)', accent: '#6366F1' },
  { id: 'combination_vehicles', img: '/illustrations/cdl-combination.png', titleKey: 'cdlCombination', descKey: 'cdlCombinationDesc', gradient: 'linear-gradient(135deg, #F5F3FF, #EDE9FE)', accent: '#8B5CF6' },
];

const langs = [
  { label: 'EN', code: 'en' },
  { label: 'RU', code: 'ru' },
  { label: 'ES', code: 'es' },
  { label: 'ZH', code: 'zh' },
  { label: 'UA', code: 'ua' },
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
        <button type="button" onClick={() => router.push(`/category?state=${state}&lang=${lang}`)} className="text-sm text-[#94A3B8] hover:text-[#2563EB] transition font-medium">
          {tex.back}
        </button>
        <Link href="/" className="flex items-center gap-2 cursor-pointer hover:opacity-90 transition">
          <Image src="/logo.png" alt="DMVSOS" width={28} height={28} className="rounded-lg" />
          <span className="text-lg font-bold text-[#0B1C3D]" style={{ letterSpacing: '-0.02em' }}>DMVSOS</span>
        </Link>
        {/* Language switcher */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowLangMenu(v => !v)}
            onBlur={() => setTimeout(() => setShowLangMenu(false), 150)}
            className="flex items-center gap-1 text-xs font-semibold text-[#64748B] bg-white border border-[#E2E8F0] rounded-full px-2.5 py-1.5 hover:border-[#2563EB] transition-colors"
          >
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
                  <span>{l.label}</span>
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
        <div className="flex justify-center mb-3">
          <img src="/vehicles/truck-hero.png" alt="" width={96} height={48} className="object-contain select-none" />
        </div>
        <h2 className="text-xl font-bold text-[#1E293B] mb-1">{tex.catCdl || 'CDL Test'}</h2>
        <p className="text-sm text-[#94A3B8]">{tex.cdlChooseSub || 'Choose a test section'}</p>
      </div>

      <div className="w-full max-w-md flex flex-col gap-4">
        {cdlSubs.map(sub => (
          <button
            key={sub.id}
            type="button"
            onClick={() => router.push(`/test?state=${state}&category=cdl&subcategory=${sub.id}&lang=${lang}`)}
            className="group relative w-full rounded-2xl py-5 pl-5 pr-[150px] min-h-[112px] flex items-center text-left border border-white/60 shadow-md hover:shadow-lg hover:-translate-y-0.5 active:scale-[0.98] transition-all overflow-hidden"
            style={{ background: sub.gradient }}
          >
            {/* Soft diagonal shine sweeping across the card on an interval — the
                app's "переливание". Reuses the existing .gradient-btn-shine
                utility (btn-shine keyframe) as an absolute overlay strip. */}
            <span aria-hidden="true" className="gradient-btn-shine pointer-events-none absolute top-0 bottom-0 -left-1/4 w-1/3 z-20" />
            <div className="flex-1 min-w-0 z-10">
              <span className="font-bold text-[#1E293B] text-lg block">{tex[sub.titleKey] || sub.id.replace(/_/g, ' ')}</span>
              <div className="text-sm text-[#64748B] mt-0.5 leading-snug">{tex[sub.descKey] || ''}</div>
            </div>
            {/* Illustration tucked into the right side of the card — capped
                in BOTH dimensions so every truck (cab-only, cab+trailer, with
                stacked gauges) lands in the same visual envelope. Soft fade on
                the left edge so it never visually crowds the title. */}
            <img
              src={sub.img}
              alt=""
              className="absolute right-3 top-1/2 -translate-y-1/2 max-w-[96px] max-h-[84px] w-auto h-auto object-contain select-none pointer-events-none"
              style={{ WebkitMaskImage: 'linear-gradient(to right, transparent 0, #000 22%)', maskImage: 'linear-gradient(to right, transparent 0, #000 22%)' }}
              aria-hidden="true"
            />
          </button>
        ))}
      </div>

      {/* Manual link */}
      {state && (
        <div className="w-full max-w-md mt-6 text-center">
          <a href={`/manuals/${state}/cdl`} className="text-sm text-[#2563EB] hover:underline font-medium">
            {tex.readManual || 'Read the official CDL manual'}
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
