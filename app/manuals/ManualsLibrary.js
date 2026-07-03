'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { t } from '@/lib/translations';
import StateSearchDropdown from './StateSearchDropdown';
import GradientButton from '@/app/components/GradientButton';

// Category cards shown once a state is picked — same flow as the home page:
// choose state, choose category, go. Each routes to the manual page for that
// state + category.
const CATS = [
  { id: 'car',        img: '/illustrations/manual-car.png',  labelKey: 'catCar',  readKey: 'readManualCar',  accent: '#2563EB' },
  { id: 'cdl',        img: '/illustrations/manual-cdl.png',  labelKey: 'catCdl',  readKey: 'readManualCdl',  accent: '#0EA5E9' },
  { id: 'motorcycle', img: '/illustrations/manual-moto.png', labelKey: 'catMoto', readKey: 'readManualMoto', accent: '#D97706' },
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

      {selected ? (
        /* State chosen: show it (with a Change link) + category cards. The
           search box is hidden — the chosen state + Change covers it. */
        <div>
          <div className="flex items-center justify-between mb-3 px-0.5">
            <p className="text-base font-semibold text-[#0B1C3D]">{stateName}</p>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="text-xs font-medium text-[#2563EB] hover:underline transition"
            >
              {tex.changeState || 'Change'}
            </button>
          </div>
          <div className="flex flex-col gap-3">
            {CATS.map(cat => {
              // Same navigation target for both the top card and the secondary
              // "Read handbook" link — both go to /manuals/[state]/[cat] where
              // the user picks language and reads the PDF. The duplicated CTA
              // mirrors the mobile layout (book row + explicit "Read manual"
              // link) so the action is unmissable.
              const go = () => {
                if (!selected || !statesData.some(s => s.slug === selected)) {
                  setSelected(null);
                  return;
                }
                router.push(`/manuals/${selected}/${cat.id}`);
              };
              return (
                <div
                  key={cat.id}
                  className="w-full rounded-2xl bg-white shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all overflow-hidden border border-[#E2E8F0]"
                  style={{ borderTopWidth: 3, borderTopColor: cat.accent }}
                >
                  <button
                    type="button"
                    onClick={go}
                    className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-[#F8FAFC] transition"
                  >
                    <img src={cat.img} alt="" width={56} height={56} className="shrink-0 select-none object-contain" />
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-[#1E293B] text-[15px]">{tex[cat.labelKey] || cat.id}</div>
                      <div className="text-xs text-[#94A3B8] mt-0.5">English · PDF</div>
                    </div>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={cat.accent} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden="true">
                      <path d="M7 17L17 7M9 7h8v8" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={go}
                    className="w-full border-t border-[#F1F5F9] px-4 py-2.5 flex items-center justify-between text-left hover:bg-[#F8FAFC] transition"
                    style={{ color: cat.accent }}
                  >
                    <span className="font-semibold text-sm">{tex[cat.readKey] || 'Read the handbook'}</span>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden="true">
                      <path d="M7 17L17 7M9 7h8v8" />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>

          {/* Find a driving school — language-matched maps search. Bridge to
              the /services concierge for users already in the manuals flow. */}
          <Link
            href={`/driving-schools?state=${selected}&lang=${serverLang}`}
            className="block w-full mt-4 rounded-2xl bg-white border border-[#E2E8F0] shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all p-4 flex items-center gap-4"
          >
            <img src="/illustrations/map.png" alt="" width={56} height={46} className="shrink-0 select-none object-contain" />
            <div className="flex-1 min-w-0">
              <div className="font-bold text-[#0B1C3D] text-[15px]">{tex.drivingSchoolsEntryTitle || 'Find a driving school'}</div>
              <div className="text-xs text-[#64748B] mt-0.5">{tex.drivingSchoolsEntrySub || 'In your language, near you'}</div>
            </div>
            <svg width="12" height="12" viewBox="0 0 12 12" className="shrink-0 text-[#94A3B8]" aria-hidden="true"><path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </Link>
        </div>
      ) : (
        /* No state yet: just the search box. Its placeholder is the prompt. */
        <StateSearchDropdown
          lang={serverLang}
          placeholder={tex.manualsSelectPlaceholder || 'Choose a state...'}
          onSelect={(slug) => setSelected(slug)}
        />
      )}

      {/* Bottom CTA — warm, personal */}
      <div className="bg-[#0B1C3D] rounded-2xl p-6 text-center mt-8 mb-10">
        <p className="text-white font-bold text-base mb-1.5">{tex.manualsReady || 'Ready to practice?'}</p>
        <p className="text-[#AAB7CC] text-sm mb-5 leading-relaxed max-w-xs mx-auto">{tex.manualsReadySub || 'After studying, take a free practice test.'}</p>
        <GradientButton href="/" variant="blue" className="max-w-xs mx-auto">
          {tex.manualsReadyCta || 'Take a free practice test'}
        </GradientButton>
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
