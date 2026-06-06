'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { t } from '@/lib/translations';
import StateSearchDropdown from './StateSearchDropdown';

// Category cards shown once a state is picked — same flow as the home page:
// choose state, choose category, go. Each routes to the manual page for that
// state + category.
const CATS = [
  { id: 'car',        icon: '🚗', labelKey: 'catCar',  gradient: 'linear-gradient(135deg, #EFF6FF, #DBEAFE)', accent: '#2563EB' },
  { id: 'cdl',        icon: '🚛', labelKey: 'catCdl',  gradient: 'linear-gradient(135deg, #F0F9FF, #E0F2FE)', accent: '#0EA5E9' },
  { id: 'motorcycle', icon: '🏍️', labelKey: 'catMoto', gradient: 'linear-gradient(135deg, #FFF7ED, #FFEDD5)', accent: '#D97706' },
];

export default function ManualsLibrary({ statesData, serverLang }) {
  const router = useRouter();
  const tex = t[serverLang] || t.en;
  const [selected, setSelected] = useState(null); // { slug, name }

  const stateName = selected
    ? (statesData.find(s => s.slug === selected)?.name || selected)
    : null;

  return (
    <div className="w-full max-w-md mx-auto px-4">

      {/* Step 1: pick a state */}
      <StateSearchDropdown
        lang={serverLang}
        placeholder={tex.manualsSelectPlaceholder || 'Choose a state...'}
        onSelect={(slug) => setSelected(slug)}
      />

      {/* Step 2: pick a category (appears once a state is chosen) */}
      {selected ? (
        <div className="mt-5">
          <div className="flex items-center justify-between mb-3 px-0.5">
            <p className="text-sm font-semibold text-[#0B1C3D]">{stateName}</p>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="text-xs font-medium text-[#94A3B8] hover:text-[#2563EB] transition"
            >
              {tex.changeState || 'Change'}
            </button>
          </div>
          <div className="flex flex-col gap-3">
            {CATS.map(cat => (
              <button
                key={cat.id}
                type="button"
                onClick={() => router.push(`/manuals/${selected}/${cat.id}`)}
                className="w-full rounded-2xl p-4 flex items-center gap-4 text-left border-2 border-white/60 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all"
                style={{ background: cat.gradient }}
              >
                <span className="text-3xl shrink-0">{cat.icon}</span>
                <span className="flex-1 font-bold text-[#1E293B] text-[15px]">{tex[cat.labelKey] || cat.id}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-sm text-center text-[#94A3B8] py-5 mt-1">
          {tex.pickStateFirst || 'Choose your state to continue'}
        </p>
      )}

      {/* Bottom CTA — warm, personal */}
      <div className="bg-[#0B1C3D] rounded-2xl p-6 text-center mt-8 mb-10">
        <p className="text-white font-bold text-base mb-1.5">{tex.manualsReady || 'Ready to practice?'}</p>
        <p className="text-[#AAB7CC] text-sm mb-5 leading-relaxed max-w-xs mx-auto">{tex.manualsReadySub || 'After studying, take a free practice test.'}</p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-6 py-3 bg-[#2563EB] text-white rounded-xl font-semibold hover:bg-[#1D4ED8] active:scale-[0.98] transition-all text-sm"
        >
          {tex.manualsReadyCta || 'Take a free practice test'}
        </Link>
      </div>

      {/* SEO: crawler-discoverable links to every state manual page. Hidden
          from the visual UI (the dropdown is the human path) but kept in the
          DOM so search engines and AI crawl all 50 state pages. sitemap.xml
          also lists them; this preserves internal linking too. */}
      <nav className="sr-only" aria-label="All state driver manuals">
        <ul>
          {statesData.map(s => (
            <li key={s.slug}>
              <Link href={`/manuals/${s.slug}`}>{s.name} driver manual</Link>
            </li>
          ))}
        </ul>
      </nav>

    </div>
  );
}
