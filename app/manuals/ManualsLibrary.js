'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';

const LANG_FLAGS = {
  en: '🇺🇸', es: '🇪🇸', ru: '🇷🇺', zh: '🇨🇳', ua: '🇺🇦',
  vi: '🇻🇳', ko: '🇰🇷', ar: '🇸🇦', fr: '🇫🇷', de: '🇩🇪',
  hy: '🇦🇲', hi: '🇮🇳', pa: '🇮🇳', ht: '🇭🇹', so: '🇸🇴',
  sw: '🇰🇪', my: '🇲🇲', ne: '🇳🇵', pt: '🇧🇷', ja: '🇯🇵', hmn: '🌿',
};

const LANG_NAMES = {
  en: 'English', es: 'Español', ru: 'Русский', zh: '中文', ua: 'Українська',
  vi: 'Tiếng Việt', ko: '한국어', ar: 'العربية', fr: 'Français', de: 'Deutsch',
  hy: 'Հայերեն', hi: 'हिन्दी', pa: 'ਪੰਜਾਬੀ', ht: 'Kreyòl', so: 'Soomaali',
  sw: 'Kiswahili', my: 'မြန်မာ', ne: 'नेपाली', pt: 'Português', ja: '日本語', hmn: 'Hmong',
};

const CAT_LABELS = { car: '🚗 Car', cdl: '🚛 CDL', motorcycle: '🏍️ Moto' };
const CAT_TABS = [
  { id: 'all', label: 'All States' },
  { id: 'car', label: '🚗 Car' },
  { id: 'cdl', label: '🚛 CDL' },
  { id: 'motorcycle', label: '🏍️ Motorcycle' },
];

export default function ManualsLibrary({ statesData, totalPdfs, langCount }) {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');

  const filtered = useMemo(() => {
    let list = statesData;
    if (activeCategory !== 'all') {
      list = list.filter(s => s.categories.includes(activeCategory));
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(s =>
        s.name.toLowerCase().includes(q) ||
        s.abbr.toLowerCase().includes(q)
      );
    }
    return list;
  }, [statesData, search, activeCategory]);

  return (
    <div className="w-full max-w-lg mx-auto px-4">

      {/* Hero */}
      <div className="text-center mb-8 pt-2">
        <span className="inline-block text-xs font-bold text-[#2563EB] bg-[#EFF6FF] border border-[#BFDBFE] rounded-full px-3 py-1 mb-4 uppercase tracking-widest">
          📚 Free Driver Manual Library
        </span>
        <h1 className="text-3xl sm:text-4xl font-black text-[#0B1C3D] mb-3 leading-tight" style={{ letterSpacing: '-0.02em' }}>
          Official DMV Handbooks<br />for All 50 States
        </h1>
        <p className="text-sm text-[#64748B] leading-relaxed max-w-sm mx-auto mb-6">
          The largest free driver manual collection online. Download PDF or read online — in your language.
        </p>

        {/* Stats */}
        <div className="flex items-center justify-center gap-4 flex-wrap">
          {[
            { value: '50', label: 'States' },
            { value: String(totalPdfs || '190+'), label: 'PDFs' },
            { value: String(langCount || '21'), label: 'Languages' },
            { value: '100%', label: 'Free' },
          ].map(({ value, label }) => (
            <div key={label} className="text-center">
              <div className="text-xl font-black text-[#0B1C3D]">{value}</div>
              <div className="text-[10px] text-[#94A3B8] font-medium uppercase tracking-wide">{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#94A3B8] text-base pointer-events-none">🔍</span>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search state... (e.g. California, NY)"
          className="w-full pl-11 pr-10 py-3.5 rounded-2xl border border-[#E2E8F0] bg-white text-sm text-[#0B1C3D] placeholder-[#94A3B8] shadow-sm focus:outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/10 transition"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch('')}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#64748B] text-lg leading-none"
          >
            ×
          </button>
        )}
      </div>

      {/* Category filter */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1 scrollbar-hide">
        {CAT_TABS.map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveCategory(tab.id)}
            className={`shrink-0 px-4 py-2 rounded-full text-xs font-semibold transition-all ${
              activeCategory === tab.id
                ? 'bg-[#0B1C3D] text-white shadow-sm'
                : 'bg-white border border-[#E2E8F0] text-[#64748B] hover:border-[#2563EB] hover:text-[#2563EB]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Results count */}
      <p className="text-xs text-[#94A3B8] mb-3 font-medium">
        {filtered.length === statesData.length
          ? `${filtered.length} states`
          : `${filtered.length} of ${statesData.length} states`}
        {search && ` for "${search}"`}
      </p>

      {/* State grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-4xl mb-3">🔍</div>
          <p className="text-[#64748B] font-medium">No states found for &ldquo;{search}&rdquo;</p>
          <button type="button" onClick={() => setSearch('')}
            className="mt-3 text-sm text-[#2563EB] hover:underline">
            Clear search
          </button>
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
                {/* Left: name + badges */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-bold text-sm text-[#0B1C3D] group-hover:text-[#2563EB] transition-colors">
                      {name}
                    </span>
                    <span className="text-[10px] font-semibold text-[#94A3B8] bg-[#F8FAFC] border border-[#E2E8F0] rounded px-1.5 py-0.5">
                      {abbr}
                    </span>
                    {hasOnlineManual && (
                      <span className="text-[10px] font-semibold text-[#2563EB] bg-[#EFF6FF] border border-[#BFDBFE] rounded-full px-2 py-0.5">
                        online
                      </span>
                    )}
                  </div>

                  {/* Category pills */}
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {categories.map(cat => (
                      <span key={cat} className="text-[10px] font-medium text-[#475569] bg-[#F8FAFC] border border-[#E2E8F0] rounded-full px-2 py-0.5">
                        {CAT_LABELS[cat] || cat}
                      </span>
                    ))}
                  </div>

                  {/* Language flags */}
                  <div className="flex items-center gap-1 flex-wrap">
                    {langs.slice(0, 8).map(code => (
                      <span
                        key={code}
                        title={LANG_NAMES[code] || code.toUpperCase()}
                        className="text-base leading-none cursor-default"
                      >
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
                      {pdfCount} PDF{pdfCount !== 1 ? 's' : ''}
                    </span>
                  )}
                  <span className="text-[#2563EB] text-sm font-bold opacity-0 group-hover:opacity-100 transition-opacity mt-1">
                    →
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Bottom CTA */}
      <div className="bg-[#0B1C3D] rounded-2xl p-6 border border-[#1e3a5f] shadow-sm text-center mb-10">
        <p className="text-white font-bold text-base mb-1">Ready to practice?</p>
        <p className="text-[#94A3B8] text-sm mb-4">
          After studying the manual, take a free practice test.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-6 py-3 bg-[#2563EB] text-white rounded-xl font-semibold hover:bg-[#1D4ED8] transition-colors text-sm"
        >
          Take Free Practice Test →
        </Link>
      </div>

    </div>
  );
}
