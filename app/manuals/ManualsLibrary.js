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
// Order categories show in on a card. Icons only (no text) — compact, and
// avoids the old per-card label translation (the previous code looked up
// `catMotorcycle`, which doesn't exist, so it rendered the English word
// "motorcycle" among localized labels).
const CAT_ORDER = ['car', 'cdl', 'motorcycle'];
const CAT_ICONS = { car: '🚗', cdl: '🚛', motorcycle: '🏍️' };

export default function ManualsLibrary({ statesData, serverLang }) {
  const [activeCategory, setActiveCategory] = useState('all');

  const tex = t[serverLang] || t.en;

  const filtered = useMemo(() => {
    if (activeCategory === 'all') return statesData;
    return statesData.filter(s => s.categories.includes(activeCategory));
  }, [statesData, activeCategory]);

  return (
    <div className="w-full max-w-xl mx-auto px-4">

      {/* Search + category control */}
      <div className="flex flex-col gap-2.5 mb-5">
        <StateSearchDropdown
          lang={serverLang}
          placeholder={tex.manualsSelectPlaceholder || 'Search state...'}
        />

        {/* Category segmented control (iOS-style) */}
        <div className="flex bg-[#EFF1F5] rounded-2xl p-1 gap-1">
          {CAT_TABS_KEYS.map(({ id, labelKey }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveCategory(id)}
              className={`flex-1 py-2 rounded-xl text-[13px] font-semibold transition-all ${
                activeCategory === id
                  ? 'bg-white text-[#0B1C3D] shadow-sm'
                  : 'text-[#64748B] hover:text-[#0B1C3D]'
              }`}
            >
              {id !== 'all' && `${CAT_ICONS[id]} `}{tex[labelKey] || id}
            </button>
          ))}
        </div>
      </div>

      {/* Results count — quiet */}
      <p className="text-xs text-[#94A3B8] mb-3 px-0.5">
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-10">
          {filtered.map(({ slug, name, abbr, categories, langs, pdfCount }) => {
            const cats = CAT_ORDER.filter(c => categories.includes(c));
            return (
              <Link
                key={slug}
                href={`/manuals/${slug}`}
                className="group bg-white rounded-2xl border border-[#EAEDF1] p-4 flex items-center gap-3 hover:border-[#2563EB] hover:shadow-[0_4px_16px_rgba(37,99,235,0.08)] active:scale-[0.99] transition-all"
              >
                <div className="flex-1 min-w-0">
                  {/* Name row */}
                  <div className="flex items-baseline gap-2 mb-1.5">
                    <span className="font-semibold text-[15px] text-[#0B1C3D] group-hover:text-[#2563EB] transition-colors truncate">
                      {name}
                    </span>
                    <span className="text-[11px] font-medium text-[#94A3B8]">{abbr}</span>
                  </div>
                  {/* Meta row: category icons + language flags */}
                  <div className="flex items-center gap-2 text-sm leading-none">
                    {cats.length > 0 && (
                      <span className="shrink-0" aria-hidden>
                        {cats.map(c => CAT_ICONS[c]).join(' ')}
                      </span>
                    )}
                    {cats.length > 0 && langs.length > 0 && (
                      <span className="text-[#E2E8F0]">|</span>
                    )}
                    <span className="flex items-center gap-0.5 min-w-0 overflow-hidden">
                      {langs.slice(0, 5).map(code => (
                        <span key={code} title={LANG_NAMES[code] || code.toUpperCase()} className="leading-none">
                          {LANG_FLAGS[code] || (
                            <span className="text-[10px] font-semibold text-[#64748B]">{code.toUpperCase()}</span>
                          )}
                        </span>
                      ))}
                      {langs.length > 5 && (
                        <span className="text-[11px] font-medium text-[#94A3B8] ml-0.5">+{langs.length - 5}</span>
                      )}
                    </span>
                  </div>
                </div>

                {/* Right: count + chevron */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {pdfCount > 0 && (
                    <span className="text-[11px] font-medium text-[#94A3B8]">
                      {pdfCount} {tex.manualsStatPdfs || 'PDF'}
                    </span>
                  )}
                  <span className="text-[#CBD5E1] group-hover:text-[#2563EB] transition-colors text-lg leading-none">›</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Bottom CTA — warm, personal */}
      <div className="bg-[#0B1C3D] rounded-2xl p-6 text-center mb-10">
        <p className="text-white font-bold text-base mb-1.5">{tex.manualsReady || 'Ready to practice?'}</p>
        <p className="text-[#AAB7CC] text-sm mb-5 leading-relaxed max-w-xs mx-auto">{tex.manualsReadySub || 'After studying, take a free practice test.'}</p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-6 py-3 bg-[#2563EB] text-white rounded-xl font-semibold hover:bg-[#1D4ED8] active:scale-[0.98] transition-all text-sm"
        >
          {tex.manualsReadyCta || 'Take a free practice test →'}
        </Link>
      </div>

    </div>
  );
}
