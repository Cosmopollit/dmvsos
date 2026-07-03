'use client';

import { Suspense, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { t } from '@/lib/translations';
import { getSavedLang, saveLang } from '@/lib/lang';
import { useAuth } from '@/lib/AuthContext';
import { SERVICE_CATEGORIES } from '@/lib/services';
import GradientButton from '@/app/components/GradientButton';
import AnimatedLock from '@/app/components/AnimatedLock';

const langs = [
  { label: 'EN', code: 'en' },
  { label: 'RU', code: 'ru' },
  { label: 'ES', code: 'es' },
  { label: 'ZH', code: 'zh' },
  { label: 'UA', code: 'ua' },
];

// Distinct hue per category (teal / amber / violet / green) so no two cards
// blend, mirroring the app. Each ships its transparent illustration that bleeds
// off the right edge of the gradient card. Categories without art fall back to
// a plain gradient (FALLBACK_VISUAL).
const CARD_VISUALS = {
  instructor:        { grad: ['#14B8A6', '#0D9488', '#134E4A'], img: '/services/instructor.png', imgAspect: 1.518, imgH: 86 },
  courses:           { grad: ['#F59E0B', '#B45309', '#7C2D12'], img: '/services/courses.png', imgAspect: 1.371, imgH: 90 },
  translator_notary: { grad: ['#8B5CF6', '#6D28D9', '#3B0764'], img: '/services/translator.png', imgAspect: 1.118, imgH: 94 },
  car_insurance:     { grad: ['#10B981', '#047857', '#064E3B'], img: '/services/insurance.png', imgAspect: 1.109, imgH: 96 },
};
const FALLBACK_VISUAL = { grad: ['#3B82F6', '#2563EB', '#4F46E5'] };
// "In development" cards drop their vibrant hue for a calm slate so it reads as
// "coming", not "broken".
const SOON_GRAD = ['#8A98AC', '#64748B', '#475569'];

function gradientCss(colors) {
  return `linear-gradient(135deg, ${colors[0]} 0%, ${colors[1]} 50%, ${colors[2]} 100%)`;
}

function ServicesContent() {
  const router = useRouter();
  const params = useSearchParams();
  const [lang, setLangState] = useState(params.get('lang') || getSavedLang());
  const [showLangMenu, setShowLangMenu] = useState(false);
  const tex = t[lang] || t.en;
  const currentLang = langs.find(l => l.code === lang) || langs[0];
  const { isPro } = useAuth();

  function switchLang(code) {
    setLangState(code);
    saveLang(code);
    setShowLangMenu(false);
  }

  function openCategory(cat) {
    if (!isPro) {
      router.push(`/upgrade?lang=${lang}`);
      return;
    }
    if (cat.status === 'live' && cat.route) {
      router.push(`${cat.route}?lang=${lang}`);
    } else {
      router.push(`/service-search?id=${cat.id}&lang=${lang}`);
    }
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
        {/* Hero */}
        <div className="text-center mb-6">
          <div className="flex justify-center mb-3">
            <img src="/illustrations/map.png" alt="" width={140} height={114} className="select-none object-contain" />
          </div>
          <h1 className="text-2xl font-bold text-[#0B1C3D] mb-2">{tex.servicesHubTitle || 'Find help nearby'}</h1>
          <p className="text-sm text-[#64748B] leading-relaxed">
            {tex.servicesHubSubtitle || 'Trusted help for new drivers, in your language. Pick a service and we will find it near you.'}
          </p>
        </div>

        {/* Pro lock banner */}
        {!isPro && (
          <div className="bg-[#FEF3C7] border border-[#FDE68A] rounded-xl p-3 mb-4 flex items-start gap-2">
            <AnimatedLock size={18} color="#92400E" className="mt-0.5" />
            <p className="text-sm text-[#92400E] font-semibold leading-snug flex-1">
              {tex.servicesLockedBody || 'Finding nearby help is part of Pro. Unlock it with any pass.'}
            </p>
          </div>
        )}

        {/* Category cards — deep gradient per category with the illustration
            bleeding off the right, matching the app. */}
        <div className="flex flex-col gap-3">
          {SERVICE_CATEGORIES.map(cat => {
            const soon = cat.status === 'soon';
            const v = CARD_VISUALS[cat.id] || FALLBACK_VISUAL;
            const imgW = Math.round((v.imgH || 80) * (v.imgAspect || 1));
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => openCategory(cat)}
                className="relative w-full rounded-2xl shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all overflow-hidden text-left"
                style={{ background: gradientCss(soon ? SOON_GRAD : v.grad), minHeight: 96 }}
              >
                {/* Top gloss */}
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 top-0 h-[58%]"
                  style={{ background: 'linear-gradient(to bottom, rgba(255,255,255,0.18), rgba(255,255,255,0))' }}
                />

                {/* Text content */}
                <div className="relative z-10 px-[18px] py-4 max-w-[64%]">
                  <div className="font-bold text-white text-[17px]" style={{ letterSpacing: '-0.2px' }}>{tex[cat.titleKey] || cat.id}</div>
                  {soon ? (
                    <span className="inline-flex items-center gap-1 mt-1.5 rounded-full bg-white/20 border border-white/35 pl-[7px] pr-[9px] py-[3px] text-[11px] font-extrabold uppercase tracking-wide text-white">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 10V7a5 5 0 0 1 10 0v3" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" /><rect x="4.5" y="10" width="15" height="10.5" rx="2.5" stroke="currentColor" strokeWidth="2.5" /></svg>
                      {tex.soonTag || 'Soon'}
                    </span>
                  ) : null}
                  <div className="text-[13px] text-white/90 mt-1 leading-[18px] line-clamp-2">{tex[cat.descKey] || ''}</div>
                </div>

                {/* Illustration bleeding off the right (every category ships art) */}
                {v.img ? (
                  <span aria-hidden="true" className="pointer-events-none absolute right-[-6px] top-0 bottom-0 z-[1] flex items-center justify-end">
                    <Image
                      src={v.img}
                      alt=""
                      width={imgW}
                      height={v.imgH || 80}
                      className="object-contain select-none"
                      style={{ opacity: soon ? 0.5 : 1, width: imgW, height: v.imgH || 80 }}
                    />
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        {!isPro && (
          <GradientButton
            onClick={() => router.push(`/upgrade?lang=${lang}`)}
            variant="gold"
            className="mt-5"
          >
            {tex.servicesUnlockCta || 'Unlock with Pro'}
          </GradientButton>
        )}
      </div>
    </main>
  );
}

export default function Services() {
  return (
    <Suspense fallback={<main className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #EFF6FF 0%, #FFF7ED 100%)' }}><div className="w-6 h-6 border-2 border-[#94A3B8] border-t-transparent rounded-full animate-spin" /></main>}>
      <ServicesContent />
    </Suspense>
  );
}
