'use client';

import { Suspense, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { t } from '@/lib/translations';
import { getSavedLang, saveLang } from '@/lib/lang';
import { STATE_DISPLAY } from '@/lib/manual-data';
import { curatedFor, mapsSearchUrl, webSearchUrl } from '@/lib/driving-schools';
import { logServiceLead } from '@/lib/services';
import StateSearchDropdown from '@/app/manuals/StateSearchDropdown';
import { flags } from '@/lib/flags';

const langs = [
  { label: 'EN', flag: flags.us, code: 'en' },
  { label: 'RU', flag: flags.ru, code: 'ru' },
  { label: 'ES', flag: flags.es, code: 'es' },
  { label: 'ZH', flag: flags.cn, code: 'zh' },
  { label: 'UA', flag: flags.ua, code: 'ua' },
];

function DrivingSchoolsContent() {
  const router = useRouter();
  const params = useSearchParams();
  const [lang, setLangState] = useState(params.get('lang') || getSavedLang());
  const [state, setState] = useState(params.get('state') || '');
  const [showLangMenu, setShowLangMenu] = useState(false);
  const tex = t[lang] || t.en;
  const currentLang = langs.find(l => l.code === lang) || langs[0];
  const stateName = state ? (STATE_DISPLAY[state] || state) : '';
  const curated = state ? curatedFor(state, lang) : [];

  function switchLang(code) {
    setLangState(code);
    saveLang(code);
    setShowLangMenu(false);
  }

  function open(url) {
    if (typeof window !== 'undefined') window.open(url, '_blank', 'noopener');
  }

  return (
    <main className="min-h-screen flex flex-col items-center p-6 relative pb-24" style={{ background: 'linear-gradient(135deg, #EFF6FF 0%, #FFF7ED 100%)' }}>
      {/* Header */}
      <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-20">
        <button type="button" onClick={() => router.back()} className="text-sm text-[#94A3B8] hover:text-[#2563EB] transition font-medium">
          {tex.back || 'Back'}
        </button>
        <Link href={`/?lang=${lang}`} className="flex items-center gap-2 cursor-pointer hover:opacity-90 transition">
          <Image src="/logo.png" alt="DMVSOS" width={28} height={28} className="rounded-lg" />
          <span className="text-lg font-bold text-[#0B1C3D]" style={{ letterSpacing: '-0.02em' }}>DMVSOS</span>
        </Link>
        <div className="relative">
          <button type="button" onClick={() => setShowLangMenu(v => !v)} onBlur={() => setTimeout(() => setShowLangMenu(false), 150)}
            className="flex items-center gap-1 text-xs font-semibold text-[#64748B] bg-white border border-[#E2E8F0] rounded-full px-2.5 py-1.5 hover:border-[#2563EB] transition-colors">
            <span>{currentLang.flag}</span><span>{currentLang.label}</span><span className="text-[#94A3B8] text-[10px] ml-0.5">▾</span>
          </button>
          {showLangMenu && (
            <div className="absolute right-0 top-full mt-1 bg-white border border-[#E2E8F0] rounded-xl shadow-lg z-50 py-1 min-w-[90px]">
              {langs.map(l => (
                <button key={l.code} type="button" onMouseDown={() => switchLang(l.code)}
                  className={`w-full text-left px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 hover:bg-[#F8FAFC] transition-colors ${lang === l.code ? 'text-[#2563EB]' : 'text-[#64748B]'}`}>
                  <span>{l.flag}</span> <span>{l.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="w-full max-w-md mt-16">
        {/* Hero */}
        <div className="text-center mb-6">
          <div className="flex justify-center mb-3">
            <img src="/illustrations/map.png" alt="" width={140} height={114} className="select-none object-contain" />
          </div>
          <h1 className="text-2xl font-bold text-[#0B1C3D] mb-2">{tex.drivingSchoolsTitle || 'Find a driving school'}</h1>
          <p className="text-sm text-[#64748B] leading-relaxed">
            {tex.drivingSchoolsSubtitle || 'Schools near you that teach in your language. Pick your state and we will search the map.'}
          </p>
        </div>

        {/* State picker — collapsed to a label + change button once picked */}
        <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm p-4 mb-5">
          <p className="text-xs font-bold text-[#0B1C3D] uppercase tracking-wide mb-3">{tex.drivingSchoolsPickState || 'Your state'}</p>
          {state ? (
            <div className="flex items-center justify-between">
              <p className="text-base font-semibold text-[#0B1C3D]">{stateName}</p>
              <button type="button" onClick={() => setState('')} className="text-xs font-medium text-[#2563EB] hover:underline">
                {tex.changeState || 'Change'}
              </button>
            </div>
          ) : (
            <StateSearchDropdown
              lang={lang}
              placeholder={tex.selectState?.trim() || 'Select a state…'}
              onSelect={setState}
            />
          )}
          {lang !== 'en' && (
            <p className="text-xs text-[#2563EB] mt-3 flex items-start gap-1.5">
              <span>🌐</span>
              <span>{tex.drivingSchoolsLangNote || 'We will find driving schools near you.'}</span>
            </p>
          )}
        </div>

        {!state ? (
          <p className="text-center text-sm text-[#94A3B8] mt-6">{tex.drivingSchoolsPickFirst || 'Choose your state to search.'}</p>
        ) : (
          <>
            {/* Curated schools (empty by default — we never invent listings) */}
            {curated.map(s => (
              <div key={`${s.name}-${s.phone ?? s.address ?? ''}`} className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm p-4 mb-3">
                <p className="font-bold text-[#0B1C3D]">{s.name}</p>
                {s.address && <p className="text-sm text-[#64748B] mt-0.5">{s.address}</p>}
                {s.note && <p className="text-xs text-[#94A3B8] italic mt-1">{s.note}</p>}
                <div className="flex gap-4 mt-3">
                  {s.phone && (
                    <a href={`tel:${s.phone}`} className="text-sm font-semibold text-[#2563EB] hover:underline">
                      📞 {tex.drivingSchoolsCallLabel || 'Call'}
                    </a>
                  )}
                  {s.url && (
                    <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-[#2563EB] hover:underline">
                      🌐 {tex.drivingSchoolsWebsiteLabel || 'Website'}
                    </a>
                  )}
                </div>
              </div>
            ))}

            {/* Primary CTA — Google Maps */}
            <button
              type="button"
              onClick={() => { logServiceLead('instructor', state, lang); open(mapsSearchUrl(state, lang)); }}
              className="w-full bg-[#2563EB] text-white py-4 rounded-xl font-bold text-base flex items-center justify-center gap-2 hover:bg-[#1D4ED8] transition mb-3"
            >
              <span>🗺️</span>
              {tex.drivingSchoolsFindOnMap || 'Find on the map'}
            </button>

            {/* Secondary — plain web search */}
            <button
              type="button"
              onClick={() => { logServiceLead('instructor', state, lang); open(webSearchUrl(state, lang)); }}
              className="w-full bg-white border border-[#E2E8F0] text-[#2563EB] py-3.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 hover:border-[#2563EB] transition mb-4"
            >
              <span>🔍</span>
              {tex.drivingSchoolsSearchWeb || 'Search the web'}
            </button>

            <p className="text-xs text-[#94A3B8] text-center leading-relaxed px-2">
              {(tex.drivingSchoolsSourceNote || 'Results come from Google Maps. We do not run these schools, so call ahead to confirm the language and price.').replace('{state}', stateName)}
            </p>
          </>
        )}
      </div>
    </main>
  );
}

export default function DrivingSchools() {
  return (
    <Suspense fallback={<main className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #EFF6FF 0%, #FFF7ED 100%)' }}><div className="w-6 h-6 border-2 border-[#94A3B8] border-t-transparent rounded-full animate-spin" /></main>}>
      <DrivingSchoolsContent />
    </Suspense>
  );
}
