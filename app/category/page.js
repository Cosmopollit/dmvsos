'use client';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { t } from '@/lib/translations';
import { getSavedLang, saveLang } from '@/lib/lang';
import { useAuth } from '@/lib/AuthContext';
import { STATE_OPTIONS } from '@/lib/states';
import { flags } from '@/lib/flags';

const categories = [
  { id: 'dmv',  icon: '🚗', titleKey: 'catCar',  descKey: 'carDesc',   color: '#2563EB', gradient: 'linear-gradient(135deg, #EFF6FF, #DBEAFE)', emojiSize: 'text-6xl' },
  { id: 'cdl',  icon: '🚛', titleKey: 'catCdl',  descKey: 'truckDesc', color: '#0EA5E9', gradient: 'linear-gradient(135deg, #F0F9FF, #E0F2FE)', emojiSize: 'text-4xl' },
  { id: 'moto', icon: '🏍️', titleKey: 'catMoto', descKey: 'motoDesc',  color: '#D97706', gradient: 'linear-gradient(135deg, #FFF7ED, #FFEDD5)', emojiSize: 'text-4xl' },
];

const langs = [
  { label: 'EN', flag: flags.us, code: 'en' },
  { label: 'RU', flag: flags.ru, code: 'ru' },
  { label: 'ES', flag: flags.es, code: 'es' },
  { label: 'ZH', flag: flags.cn, code: 'zh' },
  { label: 'UA', flag: flags.ua, code: 'ua' },
];

// slug → "Washington" display name
function slugToStateName(slug) {
  if (!slug) return '';
  const match = STATE_OPTIONS.find(s =>
    s.replace(/\s*\([A-Z]{2}\)\s*$/, '').trim().toLowerCase().replace(/\s+/g, '-') === slug
  );
  return match ? match.replace(/\s*\([A-Z]{2}\)\s*$/, '').trim() : slug;
}

const cdlSubs = [
  { id: 'general_knowledge', icon: '📋', titleKey: 'cdlGeneral', descKey: 'cdlGeneralDesc', color: '#0EA5E9' },
  { id: 'air_brakes',        icon: '💨', titleKey: 'cdlAirBrakes', descKey: 'cdlAirBrakesDesc', color: '#6366F1' },
  { id: 'combination',       icon: '🔗', titleKey: 'cdlCombination', descKey: 'cdlCombinationDesc', color: '#8B5CF6' },
];

function CategoryContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const state = searchParams.get('state') ?? '';
  const [lang, setLangState] = useState(searchParams.get('lang') || getSavedLang());
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [cdlExpanded, setCdlExpanded] = useState(false);
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
        <h2 className="text-xl font-bold text-[#1E293B] mb-1">{tex.chooseTest}</h2>
        <p className="text-sm text-[#94A3B8]">{tex.selectLicense}</p>
      </div>

      <div className="w-full max-w-md flex flex-col gap-4">
        {categories.map((cat) => (
          <div key={cat.id}>
            <button
              type="button"
              onClick={() => {
                if (cat.id === 'cdl') {
                  setCdlExpanded(v => !v);
                } else {
                  router.push(`/test?state=${state}&category=${cat.id}&lang=${lang}`);
                }
              }}
              className="w-full rounded-2xl p-5 flex items-center gap-5 hover:shadow-lg transition-all text-left border-2 border-white/60 shadow-md"
              style={{ background: cat.gradient }}
            >
              <div className={`flex-shrink-0 ${cat.emojiSize}`}>
                {cat.icon}
              </div>
              <div className="flex-1 min-w-0">
                <span className="font-bold text-[#1E293B] text-lg">{tex[cat.titleKey]}</span>
                <div className="text-sm text-[#64748B] mt-0.5">{tex[cat.descKey]}</div>
              </div>
              <div className="text-[#94A3B8] text-lg shrink-0">
                {cat.id === 'cdl' ? (cdlExpanded ? '▾' : '→') : '→'}
              </div>
            </button>

            {/* CDL subcategories */}
            {cat.id === 'cdl' && cdlExpanded && (
              <div className="flex flex-col gap-2 mt-2 pl-4">
                {cdlSubs.map(sub => (
                  <button
                    key={sub.id}
                    type="button"
                    onClick={() => router.push(`/test?state=${state}&category=cdl&subcategory=${sub.id}&lang=${lang}`)}
                    className="rounded-xl p-4 flex items-center gap-4 hover:shadow-md transition-all text-left bg-white border border-[#E2E8F0]"
                  >
                    <div className="text-2xl flex-shrink-0">{sub.icon}</div>
                    <div className="flex-1 min-w-0">
                      <span className="font-semibold text-[#1E293B] text-base">{tex[sub.titleKey] || sub.id.replace(/_/g, ' ')}</span>
                      <div className="text-xs text-[#64748B] mt-0.5">{tex[sub.descKey] || ''}</div>
                    </div>
                    <div className="text-[#94A3B8] text-sm shrink-0">→</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Manual link */}
      {state && (
        <div className="w-full max-w-md mt-6 text-center">
          <a href={`/manuals/${state}`} className="text-sm text-[#2563EB] hover:underline font-medium">
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
