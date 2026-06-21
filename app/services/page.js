'use client';

import { Suspense, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { t } from '@/lib/translations';
import { getSavedLang, saveLang } from '@/lib/lang';
import { useAuth } from '@/lib/AuthContext';
import { SERVICE_CATEGORIES } from '@/lib/services';
import { flags } from '@/lib/flags';

const langs = [
  { label: 'EN', flag: flags.us, code: 'en' },
  { label: 'RU', flag: flags.ru, code: 'ru' },
  { label: 'ES', flag: flags.es, code: 'es' },
  { label: 'ZH', flag: flags.cn, code: 'zh' },
  { label: 'UA', flag: flags.ua, code: 'ua' },
];

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
          <h1 className="text-2xl font-bold text-[#0B1C3D] mb-2">{tex.servicesHubTitle || 'Find help nearby'}</h1>
          <p className="text-sm text-[#64748B] leading-relaxed">
            {tex.servicesHubSubtitle || 'Trusted help for new drivers, in your language. Pick a service and we will find it near you.'}
          </p>
        </div>

        {/* Pro lock banner */}
        {!isPro && (
          <div className="bg-[#FEF3C7] border border-[#FDE68A] rounded-xl p-3 mb-4 flex items-start gap-2">
            <span className="text-lg leading-none mt-0.5">✨</span>
            <p className="text-sm text-[#92400E] font-semibold leading-snug flex-1">
              {tex.servicesLockedBody || 'Finding nearby help is part of Pro. Unlock it with any pass.'}
            </p>
          </div>
        )}

        {/* Category cards */}
        <div className="flex flex-col gap-3">
          {SERVICE_CATEGORIES.map(cat => {
            const locked = !isPro;
            const soon = cat.status === 'soon';
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => openCategory(cat)}
                className="w-full bg-white rounded-2xl border border-[#E2E8F0] shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all p-4 flex items-center gap-4 text-left"
              >
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0 ${locked ? 'bg-[#F1F5F9]' : 'bg-[#EFF6FF]'}`}>
                  <span aria-hidden="true">{cat.icon}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-[#0B1C3D] text-[15px]">{tex[cat.titleKey] || cat.id}</div>
                  <div className="text-xs text-[#64748B] mt-0.5 leading-snug line-clamp-2">{tex[cat.descKey] || ''}</div>
                </div>
                {locked ? (
                  <span aria-label="locked" className="text-[#94A3B8] text-lg">🔒</span>
                ) : soon ? (
                  <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full bg-[#FEF3C7] text-[#92400E]">{tex.soonTag || 'Soon'}</span>
                ) : (
                  <span className="text-[#94A3B8] text-lg">›</span>
                )}
              </button>
            );
          })}
        </div>

        {!isPro && (
          <button
            type="button"
            onClick={() => router.push(`/upgrade?lang=${lang}`)}
            className="w-full mt-5 bg-[#2563EB] text-white py-4 rounded-xl font-bold text-base hover:bg-[#1D4ED8] transition"
          >
            {tex.servicesUnlockCta || 'Unlock with Pro'}
          </button>
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
