'use client';
// Washington driving-schools map — the flagship asset of the schools
// partnership program. Every licensed school from the official DOL registry
// as a glowing dot on a brand-navy state map: filter by category and
// language, tap a dot for the school card. Partner machinery is built in:
// partner schools render with a gold ring and sort first (more QR codes in
// the school = higher tier = higher placement).
import { useState } from 'react';
import { WA_MAP, WA_SCHOOLS } from '@/lib/wa-school-map-data';

const CAT_COLORS = { car: '#60A5FA', moto: '#FBBF24', cdl: '#A78BFA' };
const LANG_LABELS = { ru: 'RU', es: 'ES', zh: '中文', ua: 'UA' };

// Partners paint last (on top) — and later: on top of search results too.
const ORDERED = [...WA_SCHOOLS].sort(
  (a, b) => (a.partner === b.partner ? a.qrTier - b.qrTier : a.partner ? 1 : -1),
);

export default function WaSchoolsMap({ tex, lang = 'en' }) {
  const [cat, setCat] = useState('all');
  const [langFilter, setLangFilter] = useState(null);
  const [active, setActive] = useState(null);

  const matches = (s) =>
    (cat === 'all' || s.cat === cat) &&
    (!langFilter || s.langs.includes(langFilter));

  const shown = WA_SCHOOLS.filter(matches).length;

  const catTabs = [
    { id: 'all', label: tex.wsAll || 'All' },
    { id: 'car', label: tex.catCar || 'Car' },
    { id: 'moto', label: tex.catMoto || 'Motorcycle' },
    { id: 'cdl', label: tex.catCdl || 'Truck (CDL)' },
  ];

  return (
    <div className="relative w-full rounded-2xl border border-white/10 overflow-hidden"
      style={{ background: 'linear-gradient(180deg, #0A1A38 0%, #0B1C3D 60%, #071021 100%)' }}>
      {/* Depth glow behind the sound */}
      <div aria-hidden="true" className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-24 left-1/4 w-[420px] h-[420px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(37,99,235,0.18) 0%, transparent 65%)' }} />
      </div>

      <div className="relative p-4 sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
          <h3 className="text-white font-bold text-[16px]">{tex.wsMapTitle || 'Washington: every licensed school on one map'}</h3>
        </div>
        <p className="text-[#94A3B8] text-xs mb-3">
          {(tex.wsMapSub || '{n} schools from the official DOL registry').replace('{n}', String(shown))}
          {' · '}
          <span className="text-[#CBD5E1]">{tex.wsHint || 'Tap a dot to see the school'}</span>
        </p>

        {/* Filters: category tabs + language chips */}
        <div className="flex flex-wrap gap-1.5 mb-1.5">
          {catTabs.map(({ id, label }) => (
            <button key={id} type="button" onClick={() => { setCat(id); setActive(null); }}
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition ${
                cat === id ? 'bg-white text-[#0B1C3D] border-white' : 'text-[#94A3B8] border-white/20 hover:border-white/50'
              }`}>
              {id !== 'all' && <span className="inline-block w-1.5 h-1.5 rounded-full mr-1 align-middle" style={{ background: CAT_COLORS[id] }} />}
              {label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {Object.entries(LANG_LABELS).map(([code, label]) => (
            <button key={code} type="button" onClick={() => { setLangFilter(langFilter === code ? null : code); setActive(null); }}
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition ${
                langFilter === code ? 'bg-[#F59E0B] text-[#0B1C3D] border-[#F59E0B]' : 'text-[#94A3B8] border-white/20 hover:border-white/50'
              }`}>
              {label}
            </button>
          ))}
        </div>

        {/* The map */}
        <div className="relative" onClick={(e) => { if (e.target.tagName !== 'circle') setActive(null); }}>
          <svg viewBox={`0 0 ${WA_MAP.width} ${WA_MAP.height}`} className="w-full h-auto block select-none" role="img"
            aria-label={tex.wsMapTitle || 'Washington driving schools map'}>
            <path d={WA_MAP.outline} fill="#0E2148" stroke="#3B6BB0" strokeWidth="1.5" strokeLinejoin="round" />
            <path d={WA_MAP.outline} fill="none" stroke="rgba(96,165,250,0.25)" strokeWidth="5" strokeLinejoin="round" style={{ filter: 'blur(4px)' }} />
            {ORDERED.map((s) => {
              const on = matches(s);
              const isActive = active?.id === s.id;
              const c = CAT_COLORS[s.cat];
              return (
                <g key={s.id} opacity={on ? 1 : 0.10} style={{ transition: 'opacity .25s' }}>
                  {s.partner && <circle cx={s.x} cy={s.y} r="7" fill="none" stroke="#F59E0B" strokeWidth="1.4" />}
                  <circle cx={s.x} cy={s.y} r={isActive ? 9 : 5.5} fill={c} opacity="0.16" />
                  <circle
                    cx={s.x} cy={s.y} r={isActive ? 3.4 : 2.1} fill={c}
                    stroke={isActive ? '#FFFFFF' : 'none'} strokeWidth="1"
                    style={{ cursor: on ? 'pointer' : 'default', transition: 'r .15s' }}
                    onClick={(e) => { e.stopPropagation(); if (on) setActive(isActive ? null : s); }}
                    onMouseEnter={() => { if (on) setActive(s); }}
                  />
                </g>
              );
            })}
          </svg>

          {/* School card near the active dot */}
          {active && (
            <div className="absolute z-10 pointer-events-none"
              style={{
                left: `${Math.min(78, Math.max(4, (active.x / WA_MAP.width) * 100))}%`,
                top: `${Math.min(86, Math.max(4, (active.y / WA_MAP.height) * 100))}%`,
                transform: 'translate(-50%, -118%)',
              }}>
              <div className="pointer-events-auto w-[230px] rounded-xl bg-white shadow-2xl border border-[#E2E8F0] p-3 text-left">
                <div className="flex items-start gap-2">
                  <span className="mt-1 w-2 h-2 rounded-full shrink-0" style={{ background: CAT_COLORS[active.cat] }} />
                  <div className="min-w-0">
                    <div className="text-[12.5px] font-bold text-[#0B1C3D] leading-snug">{active.name}</div>
                    <div className="text-[11px] text-[#64748B] mt-0.5">{active.city}</div>
                  </div>
                </div>
                {active.partner && (
                  <div className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-bold text-[#B45309] bg-[#FFFBEB] border border-[#FDE68A] rounded-full px-2 py-0.5">
                    {tex.wsPartner || 'DMVSOS partner'}
                  </div>
                )}
                {(active.langs.length > 1 || active.extraLangs.length > 0) && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {active.langs.filter(l => l !== 'en').map(l => (
                      <span key={l} className="text-[9.5px] font-bold px-1.5 py-0.5 rounded bg-[#EFF6FF] text-[#2563EB]">{LANG_LABELS[l] || l.toUpperCase()}</span>
                    ))}
                    {active.extraLangs.slice(0, 3).map(l => (
                      <span key={l} className="text-[9.5px] font-semibold px-1.5 py-0.5 rounded bg-[#F8FAFC] text-[#64748B]">{l}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Legend + partnership hook */}
        <div className="flex flex-wrap items-center justify-between gap-2 mt-3">
          <div className="flex items-center gap-3 text-[10.5px] text-[#94A3B8]">
            {['car', 'moto', 'cdl'].map(c => (
              <span key={c} className="inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ background: CAT_COLORS[c] }} />
                {c === 'car' ? (tex.catCar || 'Car') : c === 'moto' ? (tex.catMoto || 'Motorcycle') : (tex.catCdl || 'CDL')}
              </span>
            ))}
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full border border-[#F59E0B]" />
              {tex.wsPartner || 'DMVSOS partner'}
            </span>
          </div>
          <a href={`mailto:maindmvsos@gmail.com?subject=${encodeURIComponent('DMVSOS map · driving school partnership')}`}
            className="text-[11px] font-semibold text-[#F59E0B] hover:text-[#FBBF24] underline underline-offset-2 transition">
            {tex.wsForSchools || 'Own a driving school? Get on the map'}
          </a>
        </div>
      </div>
    </div>
  );
}
