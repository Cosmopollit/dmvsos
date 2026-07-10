'use client';
// Washington driving-schools map v2 — the flagship asset of the schools
// partnership program. Every licensed school from the official DOL registry
// on a brand-navy state map, now as a real instrument:
//   - zoom & pan (buttons, wheel-to-cursor, drag, pinch, double-click) so the
//     300-dot Seattle cluster resolves into individual schools
//   - search by school name or city
//   - a synced results list under the map — the surface where partner
//     ranking actually shows (partner + qrTier sort first)
//   - major-city anchors so the map reads as geography
// Partner machinery: partner dots get a gold ring, paint on top, rank first.
import { useRef, useState } from 'react';
import { WA_MAP, WA_CITIES, WA_SCHOOLS } from '@/lib/wa-school-map-data';

const CAT_COLORS = { car: '#60A5FA', moto: '#FBBF24', cdl: '#A78BFA' };
const LANG_LABELS = { ru: 'RU', es: 'ES', zh: '中文', ua: 'UA' };
const BASE = { x: 0, y: 0, w: WA_MAP.width, h: WA_MAP.height };
const MIN_W = 70; // ~14x zoom

// Partners paint last (on top) and list first.
const PAINT_ORDER = [...WA_SCHOOLS].sort(
  (a, b) => (a.partner === b.partner ? a.qrTier - b.qrTier : a.partner ? 1 : -1),
);
const LIST_ORDER = [...WA_SCHOOLS].sort((a, b) => {
  if (a.partner !== b.partner) return a.partner ? -1 : 1;
  if (a.qrTier !== b.qrTier) return b.qrTier - a.qrTier;
  return a.name.localeCompare(b.name);
});

function mapsUrl(s) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${s.name} ${s.address}`)}`;
}

export default function WaSchoolsMap({ tex, lang = 'en' }) {
  const [cat, setCat] = useState('all');
  const [langFilter, setLangFilter] = useState(null);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(null);
  const [view, setView] = useState(BASE);
  const [listOpen, setListOpen] = useState(false);
  const svgRef = useRef(null);
  const pointers = useRef(new Map());
  const dragState = useRef(null);

  const q = query.trim().toLowerCase();
  const matches = (s) =>
    (cat === 'all' || s.cat === cat) &&
    (!langFilter || s.langs.includes(langFilter)) &&
    (!q || s.name.toLowerCase().includes(q) || s.city.toLowerCase().includes(q));

  const filtered = LIST_ORDER.filter(matches);
  const scale = view.w / WA_MAP.width; // 1 at base, smaller when zoomed in
  const zoomedIn = scale < 0.55;

  // ── viewBox helpers ──────────────────────────────────────────────────────
  const clampView = (v) => {
    const w = Math.min(WA_MAP.width, Math.max(MIN_W, v.w));
    const h = w * (WA_MAP.height / WA_MAP.width);
    const pad = w * 0.15;
    const x = Math.min(WA_MAP.width - w + pad, Math.max(-pad, v.x));
    const y = Math.min(WA_MAP.height - h + pad, Math.max(-pad, v.y));
    return { x, y, w, h };
  };

  const zoomAt = (fx, fy, factor) =>
    setView((v) => clampView({
      w: v.w * factor,
      h: v.h * factor,
      x: fx - (fx - v.x) * factor,
      y: fy - (fy - v.y) * factor,
    }));

  // Client px → viewBox coords.
  const toMap = (clientX, clientY) => {
    const r = svgRef.current.getBoundingClientRect();
    return {
      x: view.x + ((clientX - r.left) / r.width) * view.w,
      y: view.y + ((clientY - r.top) / r.height) * view.h,
    };
  };

  const zoomTo = (s) => {
    const w = 170;
    setView(clampView({ x: s.x - w / 2, y: s.y - (w * (WA_MAP.height / WA_MAP.width)) / 2, w, h: w * (WA_MAP.height / WA_MAP.width) }));
    setActive(s);
  };

  // ── pointer events: drag + pinch ─────────────────────────────────────────
  const onPointerDown = (e) => {
    svgRef.current.setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) {
      dragState.current = { sx: e.clientX, sy: e.clientY, view: { ...view }, moved: false };
    }
  };
  const onPointerMove = (e) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    const r = svgRef.current.getBoundingClientRect();
    if (pts.length === 2) {
      // pinch: zoom around the midpoint
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const prev = dragState.current?.pinchD || d;
      if (Math.abs(d - prev) > 2) {
        const mid = toMap((pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2);
        zoomAt(mid.x, mid.y, prev / d);
      }
      dragState.current = { ...(dragState.current || {}), pinchD: d, moved: true };
    } else if (pts.length === 1 && dragState.current) {
      const dx = ((e.clientX - dragState.current.sx) / r.width) * view.w;
      const dy = ((e.clientY - dragState.current.sy) / r.height) * view.h;
      if (Math.abs(e.clientX - dragState.current.sx) + Math.abs(e.clientY - dragState.current.sy) > 4) {
        dragState.current.moved = true;
        setView(clampView({ ...dragState.current.view, x: dragState.current.view.x - dx, y: dragState.current.view.y - dy }));
      }
    }
  };
  const onPointerUp = (e) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) {
      const moved = dragState.current?.moved;
      dragState.current = null;
      if (!moved) return; // click passes through to dots
    }
  };
  const onWheel = (e) => {
    e.preventDefault();
    const p = toMap(e.clientX, e.clientY);
    zoomAt(p.x, p.y, e.deltaY > 0 ? 1.18 : 1 / 1.18);
  };
  const onDblClick = (e) => {
    const p = toMap(e.clientX, e.clientY);
    zoomAt(p.x, p.y, 1 / 1.8);
  };

  const catTabs = [
    { id: 'all', label: tex.wsAll || 'All' },
    { id: 'car', label: tex.catCar || 'Car' },
    { id: 'moto', label: tex.catMoto || 'Motorcycle' },
    { id: 'cdl', label: tex.catCdl || 'Truck (CDL)' },
  ];

  const listLimit = listOpen ? 60 : 8;

  return (
    <div className="relative w-full rounded-2xl border border-white/10 overflow-hidden"
      style={{ background: 'linear-gradient(180deg, #0A1A38 0%, #0B1C3D 60%, #071021 100%)' }}>
      <div aria-hidden="true" className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-24 left-1/4 w-[420px] h-[420px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(37,99,235,0.18) 0%, transparent 65%)' }} />
      </div>

      <div className="relative p-4 sm:p-5">
        <h3 className="text-white font-bold text-[16px] mb-1">{tex.wsMapTitle || 'Washington: every licensed school on one map'}</h3>
        <p className="text-[#94A3B8] text-xs mb-3">
          {(tex.wsMapSub || '{n} schools from the official DOL registry').replace('{n}', String(filtered.length))}
          {' · '}
          <span className="text-[#CBD5E1]">{tex.wsHint || 'Tap a dot to see the school'}</span>
        </p>

        {/* Search */}
        <div className="relative mb-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2" strokeLinecap="round"
            className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true">
            <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActive(null); }}
            placeholder={tex.wsSearchPlaceholder || 'Search by school or city'}
            className="w-full rounded-lg bg-white/[0.06] border border-white/15 pl-9 pr-8 py-2 text-[13px] text-white placeholder-[#64748B] focus:outline-none focus:border-[#60A5FA]"
          />
          {query && (
            <button type="button" onClick={() => setQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-white" aria-label="Clear">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          )}
        </div>

        {/* Filters */}
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
          <span className="w-px bg-white/15 mx-0.5 self-stretch" aria-hidden="true" />
          {Object.entries(LANG_LABELS).map(([code, label]) => (
            <button key={code} type="button" onClick={() => { setLangFilter(langFilter === code ? null : code); setActive(null); }}
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition ${
                langFilter === code ? 'bg-[#F59E0B] text-[#0B1C3D] border-[#F59E0B]' : 'text-[#94A3B8] border-white/20 hover:border-white/50'
              }`}>
              {label}
            </button>
          ))}
        </div>

        {/* Map */}
        <div className="relative mt-2">
          <svg
            ref={svgRef}
            viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
            className="w-full h-auto block select-none rounded-lg"
            style={{ touchAction: 'none', cursor: 'grab' }}
            role="img"
            aria-label={tex.wsMapTitle || 'Washington driving schools map'}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onWheel={onWheel}
            onDoubleClick={onDblClick}
          >
            <path d={WA_MAP.outline} fill="#0E2148" stroke="#3B6BB0" strokeWidth={1.5 * scale} strokeLinejoin="round" />
            <path d={WA_MAP.outline} fill="none" stroke="rgba(96,165,250,0.25)" strokeWidth={5 * scale} strokeLinejoin="round" style={{ filter: 'blur(4px)' }} />

            {/* City anchors */}
            {WA_CITIES.filter(c => c.rank === 1 || zoomedIn).map(c => (
              <g key={c.name} opacity="0.75" pointerEvents="none">
                <circle cx={c.x} cy={c.y} r={1.6 * scale} fill="#7DA0CF" />
                <text x={c.x + 5 * scale} y={c.y - 4 * scale} fontSize={11 * scale} fill="#7DA0CF"
                  style={{ fontWeight: 600, letterSpacing: '0.04em' }}>{c.name}</text>
              </g>
            ))}

            {PAINT_ORDER.map((s) => {
              const on = matches(s);
              const isActive = active?.id === s.id;
              const c = CAT_COLORS[s.cat];
              return (
                <g key={s.id} opacity={on ? 1 : 0.08} style={{ transition: 'opacity .25s' }}>
                  {s.partner && <circle cx={s.x} cy={s.y} r={7 * scale} fill="none" stroke="#F59E0B" strokeWidth={1.4 * scale} />}
                  <circle cx={s.x} cy={s.y} r={(isActive ? 9 : 5.5) * scale} fill={c} opacity="0.16" />
                  <circle
                    cx={s.x} cy={s.y} r={(isActive ? 3.4 : 2.1) * scale} fill={c}
                    stroke={isActive ? '#FFFFFF' : 'none'} strokeWidth={1 * scale}
                    style={{ cursor: on ? 'pointer' : 'default' }}
                    onClick={(e) => { e.stopPropagation(); if (dragState.current?.moved) return; if (on) setActive(isActive ? null : s); }}
                  />
                </g>
              );
            })}
          </svg>

          {/* Zoom controls */}
          <div className="absolute right-2 top-2 flex flex-col gap-1">
            {[{ k: '+', f: () => zoomAt(view.x + view.w / 2, view.y + view.h / 2, 1 / 1.5), l: 'Zoom in' },
              { k: '−', f: () => zoomAt(view.x + view.w / 2, view.y + view.h / 2, 1.5), l: 'Zoom out' },
              { k: '⌂', f: () => { setView(BASE); setActive(null); }, l: 'Reset' }].map(b => (
              <button key={b.l} type="button" onClick={b.f} aria-label={b.l}
                className="w-7 h-7 rounded-md bg-[#0B1C3D]/90 border border-white/20 text-white text-[15px] leading-none font-bold hover:border-white/50 transition flex items-center justify-center">
                {b.k}
              </button>
            ))}
          </div>

          {/* School card */}
          {active && (
            <div className="absolute z-10 pointer-events-none"
              style={{
                left: `${Math.min(70, Math.max(8, ((active.x - view.x) / view.w) * 100))}%`,
                top: `${Math.min(84, Math.max(30, ((active.y - view.y) / view.h) * 100))}%`,
                transform: 'translate(-50%, -116%)',
              }}>
              <div className="pointer-events-auto w-[240px] rounded-xl bg-white shadow-2xl border border-[#E2E8F0] p-3 text-left">
                <div className="flex items-start gap-2">
                  <span className="mt-1 w-2 h-2 rounded-full shrink-0" style={{ background: CAT_COLORS[active.cat] }} />
                  <div className="min-w-0">
                    <div className="text-[12.5px] font-bold text-[#0B1C3D] leading-snug">{active.name}</div>
                    <div className="text-[11px] text-[#64748B] mt-0.5">{active.city}</div>
                  </div>
                  <button type="button" onClick={() => setActive(null)} aria-label="Close"
                    className="ml-auto -mt-0.5 text-[#94A3B8] hover:text-[#0B1C3D] pointer-events-auto">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
                  </button>
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
                <a href={mapsUrl(active)} target="_blank" rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#2563EB] hover:underline">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 10c0 7-9 12-9 12S3 17 3 10a9 9 0 1118 0z" /><circle cx="12" cy="10" r="3" /></svg>
                  {tex.wsOpenMaps || 'Open in Google Maps'}
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Legend + partner hook */}
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

        {/* Results list — where partner placement actually shows */}
        <div className="mt-3 border-t border-white/10 pt-2">
          {filtered.length === 0 && (
            <p className="text-[12px] text-[#94A3B8] py-2">{tex.wsNoMatches || 'Nothing found. Try another name or city.'}</p>
          )}
          {filtered.slice(0, listLimit).map(s => (
            <button key={s.id} type="button" onClick={() => zoomTo(s)}
              className="w-full flex items-center gap-2.5 py-2 px-1 rounded-lg text-left hover:bg-white/[0.05] transition border-b border-white/[0.06] last:border-0">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: CAT_COLORS[s.cat], boxShadow: s.partner ? '0 0 0 2px rgba(245,158,11,0.6)' : 'none' }} />
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] font-semibold text-white truncate">{s.name}</span>
                <span className="block text-[10.5px] text-[#94A3B8]">{s.city}</span>
              </span>
              {s.partner && (
                <span className="shrink-0 text-[9px] font-bold text-[#F59E0B] border border-[#F59E0B]/50 rounded-full px-1.5 py-0.5">
                  {tex.wsPartner || 'DMVSOS partner'}
                </span>
              )}
              <span className="shrink-0 flex gap-1">
                {s.langs.filter(l => l !== 'en').slice(0, 3).map(l => (
                  <span key={l} className="text-[9px] font-bold text-[#7DA0CF]">{LANG_LABELS[l] || l}</span>
                ))}
              </span>
            </button>
          ))}
          {filtered.length > 8 && (
            <button type="button" onClick={() => setListOpen(v => !v)}
              className="mt-2 text-[11.5px] font-semibold text-[#60A5FA] hover:text-white transition">
              {listOpen ? (tex.wsShowLess || 'Show less')
                : (tex.wsShowAll || 'Show all {n}').replace('{n}', String(Math.min(filtered.length, 60)))}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
