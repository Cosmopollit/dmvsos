'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { t } from '@/lib/translations';
import StateSearchDropdown from './StateSearchDropdown';

const LANG_FLAGS = {
  en: '🇺🇸', es: '🇪🇸', ru: '🇷🇺', zh: '🇨🇳', ua: '🇺🇦',
  vi: '🇻🇳', ko: '🇰🇷', ar: '🇸🇦', fr: '🇫🇷', de: '🇩🇪',
  hy: '🇦🇲', hi: '🇮🇳', pa: '🇮🇳', ht: '🇭🇹', so: '🇸🇴',
  sw: '🇰🇪', my: '🇲🇲', ne: '🇳🇵', pt: '🇧🇷', ja: '🇯🇵', hmn: '🌿',
  tl: '🇵🇭', sm: '🇼🇸', to: '🇹🇴', haw: '🌺', mh: '🇲🇭', ilo: '🇵🇭', chk: '🇫🇲',
};

const LANG_NAMES = {
  en: 'English', es: 'Español', ru: 'Русский', zh: '中文', ua: 'Українська',
  vi: 'Tiếng Việt', ko: '한국어', ar: 'العربية', fr: 'Français', de: 'Deutsch',
  hy: 'Հայերեն', hi: 'हिन्दी', pa: 'ਪੰਜਾਬੀ', ht: 'Kreyòl', so: 'Soomaali',
  sw: 'Kiswahili', my: 'မြန်မာ', ne: 'नेपाली', pt: 'Português', ja: '日本語', hmn: 'Hmong',
  tl: 'Filipino', sm: 'Samoa', to: 'Faka-Tonga', haw: 'ʻŌlelo Hawaiʻi', mh: 'Kajin M̧ajeļ', ilo: 'Ilocano', chk: 'Chuukese',
};

const CAT_TABS_KEYS = [
  { id: 'all',        labelKey: 'manualsAllManuals' },
  { id: 'car',        labelKey: 'catCar' },
  { id: 'cdl',        labelKey: 'catCdl' },
  { id: 'motorcycle', labelKey: 'catMoto' },
];
const CAT_ICONS = { car: '🚗', cdl: '🚛', motorcycle: '🏍️' };

export default function ManualsLibrary({ statesData, totalPdfs, langCount, serverLang }) {
  const [activeCategory, setActiveCategory] = useState('all');

  const tex = t[serverLang] || t.en;

  const filtered = useMemo(() => {
    if (activeCategory === 'all') return statesData;
    return statesData.filter(s => s.categories.includes(activeCategory));
  }, [statesData, activeCategory]);

  return (
    <div className="w-full max-w-lg mx-auto px-4">

      {/* Hero */}
      <div className="text-center mb-8 pt-2">
        <span className="inline-block text-xs font-bold text-[#2563EB] bg-[#EFF6FF] border border-[#BFDBFE] rounded-full px-3 py-1 mb-4 uppercase tracking-widest">
          📚 Official 2026 Handbooks
        </span>
        <h1 className="text-3xl sm:text-4xl font-black text-[#0B1C3D] mb-3 leading-tight" style={{ letterSpacing: '-0.02em' }}>
          {tex.manualsHeroTitle || 'Official DMV Handbooks for All 50 States'}
        </h1>
        <p className="text-sm text-[#64748B] leading-relaxed max-w-sm mx-auto mb-5">
          {tex.manualsHeroSub || 'The largest free driver manual collection online. Download PDF or read online — in your language.'}
        </p>

        {/* Stats */}
        <div className="flex items-center justify-center gap-5 flex-wrap">
          {[
            { value: '50',                     label: tex.manualsTitle || 'States' },
            { value: String(totalPdfs || '190+'), label: tex.manualsStatPdfs || 'PDFs' },
            { value: String(langCount || '21'), label: tex.statLanguages || 'Languages' },
            { value: '100%',                   label: tex.freeLabel || 'Free' },
          ].map(({ value, label }) => (
            <div key={label} className="text-center">
              <div className="text-xl font-black text-[#0B1C3D]">{value}</div>
              <div className="text-[10px] text-[#94A3B8] font-medium uppercase tracking-wide">{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Search dropdown + category control */}
      <div className="flex flex-col gap-2 mb-6">
        {/* Searchable state dropdown */}
        <StateSearchDropdown
          lang={serverLang}
          placeholder={tex.manualsSelectPlaceholder || 'Search state... (e.g. California, NY)'}
        />

        {/* Category row — segmented control */}
        <div className="flex bg-white rounded-2xl border border-[#E2E8F0] shadow-sm p-1 gap-1">
          {CAT_TABS_KEYS.map(({ id, labelKey }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveCategory(id)}
              className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all ${
                activeCategory === id
                  ? 'bg-[#0B1C3D] text-white shadow-sm'
                  : 'text-[#64748B] hover:text-[#0B1C3D]'
              }`}
            >
              {id !== 'all' && `${CAT_ICONS[id]} `}{tex[labelKey] || id}
            </button>
          ))}
        </div>
      </div>

      {/* Results count */}
      <p className="text-xs text-[#94A3B8] mb-3 font-medium">
        {filtered.length === statesData.length
          ? `${filtered.length} ${tex.manualsTitle || 'states'}`
          : `${filtered.length} / ${statesData.length} ${tex.manualsTitle || 'states'}`}
      </p>

      {/* State grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-4xl mb-3">🔍</div>
          <p className="text-[#64748B] font-medium">{tex.noQuestionsFound || 'No states found'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 mb-10">
          {filtered.map(({ slug, name, abbr, hasOnlineManual, categories, langs, pdfCount }) => (
            <Link
              key={slug}
              href={`/manuals/${slug}`}
              className="bg-white rounded-2xl border border-[#E2E8F0] p-4 hover:border-[#2563EB] hover:shadow-md transition-all group"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  {/* Name + badges */}
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className="font-bold text-sm text-[#0B1C3D] group-hover:text-[#2563EB] transition-colors">
                      {name}
                    </span>
                    <span className="text-[10px] font-semibold text-[#94A3B8] bg-[#F8FAFC] border border-[#E2E8F0] rounded px-1.5 py-0.5">
                      {abbr}
                    </span>
                    {hasOnlineManual && (
                      <span className="text-[10px] font-semibold text-[#2563EB] bg-[#EFF6FF] border border-[#BFDBFE] rounded-full px-2 py-0.5">
                        {tex.manualsReadOnline ? 'online' : 'online'}
                      </span>
                    )}
                  </div>

                  {/* Category pills */}
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {categories.map(cat => (
                      <span key={cat} className="text-[10px] font-medium text-[#475569] bg-[#F8FAFC] border border-[#E2E8F0] rounded-full px-2 py-0.5">
                        {CAT_ICONS[cat]} {tex[`cat${cat.charAt(0).toUpperCase() + cat.slice(1)}`] || cat}
                      </span>
                    ))}
                  </div>

                  {/* Language flags */}
                  <div className="flex items-center gap-1 flex-wrap">
                    {langs.slice(0, 8).map(code => (
                      <span key={code} title={LANG_NAMES[code] || code.toUpperCase()} className="text-base leading-none">
                        {LANG_FLAGS[code] || (
                          <span className="text-[10px] font-semibold text-[#64748B] bg-[#F1F5F9] px-1.5 py-0.5 rounded">{code.toUpperCase()}</span>
                        )}
                      </span>
                    ))}
                    {langs.length > 8 && (
                      <span className="text-[10px] font-medium text-[#94A3B8]">+{langs.length - 8}</span>
                    )}
                  </div>
                </div>

                {/* Right: PDF count + arrow */}
                <div className="flex flex-col items-end gap-1 shrink-0">
                  {pdfCount > 0 && (
                    <span className="text-[10px] font-semibold text-[#64748B]">
                      {pdfCount} {tex.manualsStatPdfs || 'PDFs'}
                    </span>
                  )}
                  <span className="text-[#2563EB] text-sm font-bold opacity-0 group-hover:opacity-100 transition-opacity mt-1">→</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Bottom CTA */}
      <div className="bg-[#0B1C3D] rounded-2xl p-6 border border-[#1e3a5f] shadow-sm text-center mb-10">
        <p className="text-white font-bold text-base mb-1">{tex.manualsReady || 'Ready to practice?'}</p>
        <p className="text-[#94A3B8] text-sm mb-4">{tex.manualsReadySub || 'After studying, take a free practice test.'}</p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-6 py-3 bg-[#2563EB] text-white rounded-xl font-semibold hover:bg-[#1D4ED8] transition-colors text-sm"
        >
          {tex.manualsReadyCta || 'Take Free Practice Test →'}
        </Link>
      </div>

    </div>
  );
}
