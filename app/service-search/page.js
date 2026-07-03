'use client';

import { Suspense, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { t } from '@/lib/translations';
import { getSavedLang, saveLang } from '@/lib/lang';
import { serviceById, serviceMapsUrl, serviceWebUrl, logServiceLead } from '@/lib/services';
import { STATE_DISPLAY } from '@/lib/manual-data';
import StateSearchDropdown from '@/app/manuals/StateSearchDropdown';
import GradientButton from '@/app/components/GradientButton';

// Category illustration for the hero, keyed by service id (same art as the
// /services cards). Unknown/missing id falls back to the instructor art.
const ART = {
  instructor: '/services/instructor.png',
  courses: '/services/courses.png',
  translator_notary: '/services/translator.png',
  car_insurance: '/services/insurance.png',
};

const langs = [
  { label: 'EN', code: 'en' },
  { label: 'RU', code: 'ru' },
  { label: 'ES', code: 'es' },
  { label: 'ZH', code: 'zh' },
  { label: 'UA', code: 'ua' },
];

function ServiceSearchContent() {
  const router = useRouter();
  const params = useSearchParams();
  const id = params.get('id') || '';
  const [lang, setLangState] = useState(params.get('lang') || getSavedLang());
  const [state, setState] = useState(params.get('state') || '');
  const [showLangMenu, setShowLangMenu] = useState(false);
  const tex = t[lang] || t.en;
  const currentLang = langs.find(l => l.code === lang) || langs[0];
  const svc = serviceById(id);
  const queryHead = svc?.queryHead || 'driving school';
  const stateName = state ? (STATE_DISPLAY[state] || state) : '';
  const title = svc ? (tex[svc.titleKey] || svc.id) : (tex.servicesHubTitle || 'Find help nearby');

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
            <span>{currentLang.label}</span>
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" className="ml-0.5 text-[#94A3B8]" aria-hidden="true"><path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          {showLangMenu && (
            <div className="absolute right-0 top-full mt-1 bg-white border border-[#E2E8F0] rounded-xl shadow-lg z-50 py-1 min-w-[90px]">
              {langs.map(l => (
                <button key={l.code} type="button" onMouseDown={() => switchLang(l.code)}
                  className={`w-full text-left px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 hover:bg-[#F8FAFC] transition-colors ${lang === l.code ? 'text-[#2563EB]' : 'text-[#64748B]'}`}>
                  <span>{l.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="w-full max-w-md mt-16">
        <div className="text-center mb-5">
          <div className="flex justify-center mb-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={ART[svc?.id] || ART.instructor} alt="" className="h-16 object-contain select-none" />
          </div>
          <h1 className="text-2xl font-bold text-[#0B1C3D]">{title}</h1>
        </div>

        {/* "Soon" banner */}
        <div className="bg-[#FEF3C7] border border-[#FDE68A] rounded-xl p-4 mb-5">
          <span className="inline-block text-[10px] font-extrabold uppercase tracking-wide px-2 py-0.5 rounded-full bg-[#FBBF24] text-[#0B1C3D] mb-2">{tex.soonTag || 'Soon'}</span>
          <p className="text-sm text-[#92400E] leading-relaxed">
            {tex.serviceSearchSoonBody || 'We are lining up vetted help that speaks your language. Until then, you can search the map yourself.'}
          </p>
        </div>

        {/* State picker */}
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
            <StateSearchDropdown lang={lang} placeholder={tex.selectState?.trim() || 'Select a state…'} onSelect={setState} />
          )}
        </div>

        {!state ? (
          <p className="text-center text-sm text-[#94A3B8] mt-6">{tex.drivingSchoolsPickFirst || 'Choose your state to search.'}</p>
        ) : (
          <>
            <GradientButton
              onClick={() => { if (svc) logServiceLead(svc.id, state, lang); open(serviceMapsUrl(queryHead, state, lang)); }}
              variant="blue"
              className="mb-3"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 21s-7-5.4-7-11a7 7 0 0 1 14 0c0 5.6-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></svg>
              {tex.drivingSchoolsFindOnMap || 'Find on the map'}
            </GradientButton>

            <button
              type="button"
              onClick={() => { if (svc) logServiceLead(svc.id, state, lang); open(serviceWebUrl(queryHead, state, lang)); }}
              className="w-full bg-white border border-[#E2E8F0] text-[#2563EB] py-3.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 hover:border-[#2563EB] transition mb-4"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
              {tex.drivingSchoolsSearchWeb || 'Search the web'}
            </button>

            <p className="text-xs text-[#94A3B8] text-center leading-relaxed px-2">
              {tex.serviceSourceNote || 'Results come from Google Maps. We do not run these, so call ahead to confirm the language and price.'}
            </p>
          </>
        )}
      </div>
    </main>
  );
}

export default function ServiceSearch() {
  return (
    <Suspense fallback={<main className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #EFF6FF 0%, #FFF7ED 100%)' }}><div className="w-6 h-6 border-2 border-[#94A3B8] border-t-transparent rounded-full animate-spin" /></main>}>
      <ServiceSearchContent />
    </Suspense>
  );
}
