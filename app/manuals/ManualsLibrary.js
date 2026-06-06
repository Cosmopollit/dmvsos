'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { t } from '@/lib/translations';
import StateSearchDropdown from './StateSearchDropdown';

const CAT_TABS_KEYS = [
  { id: 'all',        labelKey: 'manualsAllManuals' },
  { id: 'car',        labelKey: 'catCar' },
  { id: 'cdl',        labelKey: 'catCdl' },
  { id: 'motorcycle', labelKey: 'catMoto' },
];
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

      {/* Results count (quiet) */}
      <p className="text-xs text-[#94A3B8] mb-3 px-0.5">
        {filtered.length === statesData.length
          ? `${filtered.length} ${tex.manualsTitle || 'states'}`
          : `${filtered.length} / ${statesData.length} ${tex.manualsTitle || 'states'}`}
      </p>

      {/* State grid — just pick a state. Categories/languages/PDFs live on
          the state page; the cards stay clean and scannable. */}
      {filtered.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-4xl mb-3">🔍</div>
          <p className="text-[#64748B] font-medium">{tex.noQuestionsFound || 'No states found'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-10">
          {filtered.map(({ slug, name, abbr }) => (
            <Link
              key={slug}
              href={`/manuals/${slug}`}
              className="group bg-white rounded-xl border border-[#EAEDF1] px-4 py-3.5 flex items-center justify-between gap-2 hover:border-[#2563EB] hover:shadow-[0_4px_16px_rgba(37,99,235,0.08)] active:scale-[0.99] transition-all"
            >
              <span className="flex items-baseline gap-2 min-w-0">
                <span className="font-semibold text-[15px] text-[#0B1C3D] group-hover:text-[#2563EB] transition-colors truncate">
                  {name}
                </span>
                <span className="text-[11px] font-medium text-[#94A3B8]">{abbr}</span>
              </span>
              <span className="text-[#CBD5E1] group-hover:text-[#2563EB] transition-colors text-lg leading-none shrink-0">›</span>
            </Link>
          ))}
        </div>
      )}

      {/* Bottom CTA: warm, personal */}
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
