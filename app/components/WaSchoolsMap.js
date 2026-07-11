'use client';
// Washington driving-schools map v3 — the flagship asset of the schools
// partnership program, dressed as an OFFICIAL REGISTRY instrument (the same
// department-document direction as the /upgrade access card; owner killed the
// dark navy v2: "тёмная, неинформативная, не продающая").
//   - white paper card with a navy registry header strip
//   - light road-atlas map: paper state on a water-blue field, navy clusters
//   - city chips with live counts — one tap flies to the city
//   - zoom & pan (buttons, wheel-to-cursor, drag, pinch, double-click)
//   - search by school name, city or ZIP
//   - a synced directory list under the map with addresses
// Partner machinery: partners escape clustering (individual pulsing gold pins
// at every zoom, painted above everything) and pin to a gold "Partners"
// section atop the results list. Gold is reserved for partners only.
import { useEffect, useRef, useState } from 'react';
import { WA_MAP, WA_CITIES, WA_SCHOOLS } from '@/lib/wa-school-map-data';

// Saturated variants that hold contrast on the light map field.
const CAT_COLORS = { car: '#2563EB', moto: '#D97706', cdl: '#7C3AED' };
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

// City quick-nav chips: anchor cities that actually have schools, biggest
// counts first. Counts are real (the anti-fake rule: one number, verifiable).
const CITY_CHIPS = WA_CITIES
  .map(c => ({
    ...c,
    count: WA_SCHOOLS.filter(s => s.city.toLowerCase() === c.name.toLowerCase()).length,
  }))
  .filter(c => c.count > 0)
  .sort((a, b) => b.count - a.count)
  .slice(0, 7);

function mapsUrl(s) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${s.name} ${s.address}`)}`;
}

// DOL feed addresses arrive ALL CAPS ("1000 TURK DR, SULTAN WA 98294");
// title-case them for the card so the registry reads typeset, not shouted.
function displayAddress(addr) {
  if (!addr) return '';
  return addr.toLowerCase().replace(/\b([a-z])/g, (m, ch) => ch.toUpperCase()).replace(/\bWa\b/g, 'WA');
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
  const animRef = useRef(null);
  const viewRef = useRef(view);
  useEffect(() => { viewRef.current = view; }, [view]);

  // Animate the viewBox from its current value to `target` (ease-out cubic) so
  // discrete zooms glide like a real map. Drag/pinch bypass this (instant).
  const animateTo = (target) => {
    if (animRef.current) cancelAnimationFrame(animRef.current);
    const from = viewRef.current;
    const DUR = 380;
    let t0 = null;
    const step = (now) => {
      if (t0 === null) t0 = now;
      const p = Math.min(1, (now - t0) / DUR);
      const e = 1 - Math.pow(1 - p, 3);
      setView({
        x: from.x + (target.x - from.x) * e,
        y: from.y + (target.y - from.y) * e,
        w: from.w + (target.w - from.w) * e,
        h: from.h + (target.h - from.h) * e,
      });
      if (p < 1) animRef.current = requestAnimationFrame(step);
    };
    animRef.current = requestAnimationFrame(step);
  };

  const q = query.trim().toLowerCase();
  const matches = (s) =>
    (cat === 'all' || s.cat === cat) &&
    (!langFilter || s.langs.includes(langFilter)) &&
    (!q || s.name.toLowerCase().includes(q) || s.city.toLowerCase().includes(q) || s.zip.startsWith(q));

  const filtered = LIST_ORDER.filter(matches);
  const scale = view.w / WA_MAP.width; // 1 at base, smaller when zoomed in
  const zoomedIn = scale < 0.55;

  // ── clustering ────────────────────────────────────────────────────────────
  // At low zoom the Seattle metro is 200 dots on top of each other. Grid the
  // visible-matching schools into cells sized to ~28 screen px; a cell with >1
  // school renders as a numbered bubble that flies you in on click; singles
  // stay as dots. Grid dissolves as you zoom (cell → map px).
  // Partners never enter the grid: a paying school must stay an individual
  // gold marker at every zoom level, not get swallowed into a numbered bubble.
  // They render in their own layer after the clusters, so nothing paints over
  // them either.
  const painted = PAINT_ORDER.filter(matches);
  const partners = painted.filter(s => s.partner);
  const clusterable = painted.filter(s => !s.partner);
  const clusters = [];
  const singles = [];
  if (scale > 0.14) {
    const cell = 52 * scale; // map units per cell; bigger = fewer, cleaner bubbles
    const grid = new Map();
    for (const s of clusterable) {
      const key = `${Math.floor(s.x / cell)}:${Math.floor(s.y / cell)}`;
      (grid.get(key) || grid.set(key, []).get(key)).push(s);
    }
    for (const group of grid.values()) {
      if (group.length === 1) { singles.push(group[0]); continue; }
      const cx = group.reduce((a, s) => a + s.x, 0) / group.length;
      const cy = group.reduce((a, s) => a + s.y, 0) / group.length;
      clusters.push({ x: cx, y: cy, count: group.length, items: group });
    }
  } else {
    singles.push(...clusterable);
  }

  // ── viewBox helpers ──────────────────────────────────────────────────────
  const clampView = (v) => {
    const w = Math.min(WA_MAP.width, Math.max(MIN_W, v.w));
    const h = w * (WA_MAP.height / WA_MAP.width);
    const pad = w * 0.15;
    const x = Math.min(WA_MAP.width - w + pad, Math.max(-pad, v.x));
    const y = Math.min(WA_MAP.height - h + pad, Math.max(-pad, v.y));
    return { x, y, w, h };
  };

  // animated=true glides (buttons, cluster, list); wheel/pinch pass false.
  const zoomAt = (fx, fy, factor, animated = false) => {
    const v = viewRef.current;
    const target = clampView({
      w: v.w * factor,
      h: v.h * factor,
      x: fx - (fx - v.x) * factor,
      y: fy - (fy - v.y) * factor,
    });
    animated ? animateTo(target) : setView(target);
  };

  // Client px → viewBox coords.
  const toMap = (clientX, clientY) => {
    const r = svgRef.current.getBoundingClientRect();
    const v = viewRef.current;
    return {
      x: v.x + ((clientX - r.left) / r.width) * v.w,
      y: v.y + ((clientY - r.top) / r.height) * v.h,
    };
  };

  const zoomTo = (s) => {
    const w = 170;
    animateTo(clampView({ x: s.x - w / 2, y: s.y - (w * (WA_MAP.height / WA_MAP.width)) / 2, w, h: w * (WA_MAP.height / WA_MAP.width) }));
    setActive(s);
  };

  const zoomToCity = (c) => {
    const w = 150;
    animateTo(clampView({ x: c.x - w / 2, y: c.y - (w * (WA_MAP.height / WA_MAP.width)) / 2, w, h: w * (WA_MAP.height / WA_MAP.width) }));
    setActive(null);
  };

  // Named control handlers (compiler-safe: like onWheel, they're memoizable
  // component functions rather than ref-touching arrows created inside JSX).
  const zoomInBtn = () => { const v = viewRef.current; zoomAt(v.x + v.w / 2, v.y + v.h / 2, 1 / 1.5, true); };
  const zoomOutBtn = () => { const v = viewRef.current; zoomAt(v.x + v.w / 2, v.y + v.h / 2, 1.5, true); };
  const resetBtn = () => { animateTo(BASE); setActive(null); };

  // ── pointer events: drag + pinch ─────────────────────────────────────────
  const onPointerDown = (e) => {
    if (animRef.current) cancelAnimationFrame(animRef.current); // grab interrupts a glide
    svgRef.current.setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) {
      dragState.current = { sx: e.clientX, sy: e.clientY, view: { ...viewRef.current }, moved: false };
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
    zoomAt(p.x, p.y, 1 / 1.8, true);
  };

  const catTabs = [
    { id: 'all', label: tex.wsAll || 'All' },
    { id: 'car', label: tex.catCar || 'Car' },
    { id: 'moto', label: tex.catMoto || 'Motorcycle' },
    { id: 'cdl', label: tex.catCdl || 'Truck (CDL)' },
  ];

  const listLimit = listOpen ? 60 : 8;

  // Partners are pinned above the regular list under their own header — the
  // list placement a school is actually paying for. They don't consume the
  // regular rows' limit.
  const partnerRows = filtered.filter(s => s.partner);
  const regularRows = filtered.filter(s => !s.partner);

  const schoolRow = (s) => (
    <button key={s.id} type="button" onClick={() => zoomTo(s)}
      className="w-full flex items-center gap-2.5 py-2 px-1.5 rounded-lg text-left hover:bg-[#F1F5F9] transition border-b border-[#E2E8F0] last:border-0">
      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: s.partner ? '#F59E0B' : CAT_COLORS[s.cat], boxShadow: s.partner ? '0 0 6px rgba(245,158,11,0.8)' : 'none' }} />
      <span className="min-w-0 flex-1">
        <span className="block text-[12.5px] font-semibold text-[#0B1C3D] truncate">{s.name}</span>
        <span className="block text-[10.5px] text-[#64748B]">{s.city}{s.zip ? ` · ${s.zip}` : ''}</span>
      </span>
      <span className="shrink-0 flex gap-1">
        {s.langs.filter(l => l !== 'en').slice(0, 3).map(l => (
          <span key={l} className="text-[9px] font-bold px-1 py-0.5 rounded bg-[#EFF6FF] text-[#2563EB]">{LANG_LABELS[l] || l}</span>
        ))}
      </span>
    </button>
  );

  return (
    <div className="relative w-full rounded-2xl border border-[#E2E8F0] bg-white shadow-md overflow-hidden">
      {/* Registry header strip — the department-document motif */}
      <div className="flex items-center gap-3 px-4 py-3" style={{ background: '#0B1C3D' }}>
        <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true" className="shrink-0">
          <circle cx="13" cy="13" r="12" fill="none" stroke="#F59E0B" strokeWidth="1.4" />
          <circle cx="13" cy="13" r="9.2" fill="none" stroke="#F59E0B" strokeWidth="0.7" strokeDasharray="1.6 1.8" />
          <path d="M13 7.6l1.45 2.94 3.25.47-2.35 2.29.55 3.24L13 15.01l-2.9 1.53.55-3.24-2.35-2.29 3.25-.47z" fill="#F59E0B" />
        </svg>
        <div className="min-w-0">
          <h3 className="text-white font-bold text-[14px] leading-snug">{tex.wsMapTitle || 'Washington: every licensed school on one map'}</h3>
          <p className="text-[#9DB2D6] text-[11px] mt-0.5">
            {(tex.wsMapSub || '{n} schools from the official DOL registry').replace('{n}', String(filtered.length))}
          </p>
        </div>
      </div>

      <div className="relative p-4 sm:p-5" style={{ background: 'linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%)' }}>
        {/* Search */}
        <div className="relative mb-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round"
            className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true">
            <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActive(null); }}
            placeholder={tex.wsSearchPlaceholder || 'Search by school or city'}
            className="w-full rounded-lg bg-white border border-[#CBD5E1] pl-9 pr-8 py-2 text-[13px] text-[#0B1C3D] placeholder-[#94A3B8] focus:outline-none focus:border-[#2563EB]"
          />
          {query && (
            <button type="button" onClick={() => setQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#0B1C3D]" aria-label="Clear">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-1.5 mb-1.5">
          {catTabs.map(({ id, label }) => (
            <button key={id} type="button" onClick={() => { setCat(id); setActive(null); }}
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition ${
                cat === id ? 'bg-[#0B1C3D] text-white border-[#0B1C3D]' : 'bg-white text-[#475569] border-[#CBD5E1] hover:border-[#64748B]'
              }`}>
              {id !== 'all' && <span className="inline-block w-1.5 h-1.5 rounded-full mr-1 align-middle" style={{ background: CAT_COLORS[id] }} />}
              {label}
            </button>
          ))}
          <span className="w-px bg-[#E2E8F0] mx-0.5 self-stretch" aria-hidden="true" />
          {Object.entries(LANG_LABELS).map(([code, label]) => (
            <button key={code} type="button" onClick={() => { setLangFilter(langFilter === code ? null : code); setActive(null); }}
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition ${
                langFilter === code ? 'bg-[#0B1C3D] text-white border-[#0B1C3D]' : 'bg-white text-[#475569] border-[#CBD5E1] hover:border-[#64748B]'
              }`}>
              {label}
            </button>
          ))}
        </div>

        {/* City quick-nav — real counts, one tap flies in */}
        <div className="flex flex-wrap gap-1.5 mb-2">
          {CITY_CHIPS.map(c => (
            <button key={c.name} type="button" onClick={() => zoomToCity(c)}
              className="px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-[#EFF6FF] text-[#1D4ED8] border border-[#BFDBFE] hover:border-[#2563EB] transition">
              {c.name} <span className="font-bold">{c.count}</span>
            </button>
          ))}
        </div>

        {/* Map — light road-atlas field */}
        <div className="relative">
          <svg
            ref={svgRef}
            viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
            className="w-full h-auto block select-none rounded-xl border border-[#DBEAFE]"
            style={{ touchAction: 'none', cursor: 'grab', background: 'linear-gradient(180deg, #EAF2FB 0%, #E3EDF9 100%)' }}
            role="img"
            aria-label={tex.wsMapTitle || 'Washington driving schools map'}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onWheel={onWheel}
            onDoubleClick={onDblClick}
          >
            <path d={WA_MAP.outline} fill="#FBFDFF" stroke="#7E9CC4" strokeWidth={1.4 * scale} strokeLinejoin="round" />

            {/* City anchors */}
            {WA_CITIES.filter(c => c.rank === 1 || zoomedIn).map(c => (
              <g key={c.name} pointerEvents="none">
                <circle cx={c.x} cy={c.y} r={1.7 * scale} fill="#64748B" />
                <text x={c.x + 5 * scale} y={c.y - 4 * scale} fontSize={11 * scale} fill="#475569"
                  style={{ fontWeight: 600, letterSpacing: '0.04em' }}>{c.name}</text>
              </g>
            ))}

            {/* Dimmed layer: everything NOT matching the filters, so the map
                never looks empty when a filter is on. */}
            {PAINT_ORDER.filter(s => !matches(s)).map((s) => (
              <circle key={`d-${s.id}`} cx={s.x} cy={s.y} r={2.1 * scale} fill={CAT_COLORS[s.cat]} opacity="0.08" />
            ))}

            {/* Single schools */}
            {singles.map((s) => {
              const isActive = active?.id === s.id;
              const c = CAT_COLORS[s.cat];
              return (
                <g key={s.id}>
                  <circle cx={s.x} cy={s.y} r={(isActive ? 9 : 5.5) * scale} fill={c} opacity="0.15" />
                  <circle
                    cx={s.x} cy={s.y} r={(isActive ? 3.4 : 2.5) * scale} fill={c}
                    stroke="#FFFFFF" strokeWidth={(isActive ? 1.2 : 0.8) * scale}
                    style={{ cursor: 'pointer' }}
                    onClick={(e) => { e.stopPropagation(); if (dragState.current?.moved) return; setActive(isActive ? null : s); }}
                  />
                </g>
              );
            })}

            {/* Cluster bubbles — count-labeled, click flies in */}
            {clusters.map((cl, i) => {
              const r = Math.min(20, 8 + Math.log2(cl.count) * 3) * scale;
              return (
                <g key={`c-${i}`} style={{ cursor: 'pointer' }}
                  onClick={(e) => { e.stopPropagation(); if (dragState.current?.moved) return; zoomAt(cl.x, cl.y, 0.42, true); }}>
                  <circle cx={cl.x} cy={cl.y} r={r * 1.5} fill="#2563EB" opacity="0.10" />
                  <circle cx={cl.x} cy={cl.y} r={r} fill="#0B1C3D" stroke="#FFFFFF" strokeWidth={1.3 * scale} />
                  <text x={cl.x} y={cl.y} dy={r * 0.34} textAnchor="middle" fontSize={r * 0.95} fill="#FFFFFF"
                    style={{ fontWeight: 800, pointerEvents: 'none' }}>{cl.count}</text>
                </g>
              );
            })}

            {/* Partner pins — always individual, always on top, always moving.
                A gold core with a white rim plus an expanding pulse ring (SMIL,
                zero JS) makes the paying schools findable at a glance even over
                the Seattle dot field. */}
            {partners.map((s) => {
              const isActive = active?.id === s.id;
              return (
                <g key={`p-${s.id}`}>
                  <circle cx={s.x} cy={s.y} fill="none" stroke="#F59E0B" strokeWidth={1.3 * scale}>
                    <animate attributeName="r" values={`${4 * scale};${12 * scale}`} dur="2s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.8;0" dur="2s" repeatCount="indefinite" />
                  </circle>
                  <circle cx={s.x} cy={s.y} r={(isActive ? 10 : 7) * scale} fill="#F59E0B" opacity="0.22" />
                  <circle
                    cx={s.x} cy={s.y} r={(isActive ? 4.2 : 3.4) * scale} fill="#F59E0B"
                    stroke="#FFFFFF" strokeWidth={1.1 * scale}
                    style={{ cursor: 'pointer' }}
                    onClick={(e) => { e.stopPropagation(); if (dragState.current?.moved) return; setActive(isActive ? null : s); }}
                  />
                </g>
              );
            })}
          </svg>

          {/* Zoom controls — explicit buttons (handlers assigned directly to
              onClick; the React Compiler bars ref-touching fns passed through a
              render-time array). */}
          <div className="absolute right-2 top-2 flex flex-col gap-1">
            <button type="button" onClick={zoomInBtn} aria-label="Zoom in"
              className="w-7 h-7 rounded-md bg-white/95 border border-[#CBD5E1] text-[#0B1C3D] text-[15px] leading-none font-bold shadow-sm hover:border-[#64748B] transition flex items-center justify-center">+</button>
            <button type="button" onClick={zoomOutBtn} aria-label="Zoom out"
              className="w-7 h-7 rounded-md bg-white/95 border border-[#CBD5E1] text-[#0B1C3D] text-[15px] leading-none font-bold shadow-sm hover:border-[#64748B] transition flex items-center justify-center">−</button>
            <button type="button" onClick={resetBtn} aria-label="Reset"
              className="w-7 h-7 rounded-md bg-white/95 border border-[#CBD5E1] text-[#0B1C3D] text-[15px] leading-none font-bold shadow-sm hover:border-[#64748B] transition flex items-center justify-center">⌂</button>
          </div>

          {/* School card */}
          {active && (
            <div className="absolute z-10 pointer-events-none"
              style={{
                left: `${Math.min(70, Math.max(8, ((active.x - view.x) / view.w) * 100))}%`,
                top: `${Math.min(84, Math.max(30, ((active.y - view.y) / view.h) * 100))}%`,
                transform: 'translate(-50%, -116%)',
              }}>
              <div className="pointer-events-auto w-[250px] rounded-xl bg-white shadow-2xl border border-[#E2E8F0] p-3 text-left">
                <div className="flex items-start gap-2">
                  <span className="mt-1 w-2 h-2 rounded-full shrink-0" style={{ background: active.partner ? '#F59E0B' : CAT_COLORS[active.cat] }} />
                  <div className="min-w-0">
                    <div className="text-[12.5px] font-bold text-[#0B1C3D] leading-snug">{active.name}</div>
                    <div className="text-[10.5px] text-[#64748B] mt-0.5 leading-snug">{displayAddress(active.address) || `${active.city}${active.zip ? ` · ${active.zip}` : ''}`}</div>
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
          <div className="flex items-center gap-3 text-[10.5px] text-[#64748B]">
            {['car', 'moto', 'cdl'].map(c => (
              <span key={c} className="inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ background: CAT_COLORS[c] }} />
                {c === 'car' ? (tex.catCar || 'Car') : c === 'moto' ? (tex.catMoto || 'Motorcycle') : (tex.catCdl || 'CDL')}
              </span>
            ))}
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#F59E0B]" style={{ boxShadow: '0 0 6px rgba(245,158,11,0.8)' }} />
              {tex.wsPartner || 'DMVSOS partner'}
            </span>
          </div>
          <a href={`mailto:maindmvsos@gmail.com?subject=${encodeURIComponent('DMVSOS map · driving school partnership')}`}
            className="text-[11px] font-semibold text-[#B45309] hover:text-[#92400E] underline underline-offset-2 transition">
            {tex.wsForSchools || 'Own a driving school? Get on the map'}
          </a>
        </div>

        {/* Results list — where partner placement actually shows */}
        <div className="mt-3 border-t border-[#E2E8F0] pt-2">
          {filtered.length === 0 && (
            <p className="text-[12px] text-[#64748B] py-2">{tex.wsNoMatches || 'Nothing found. Try another name or city.'}</p>
          )}
          {partnerRows.length > 0 && (
            <div className="mb-1 rounded-xl border border-[#F59E0B]/40 bg-[#FFFBEB] px-2 pt-1.5 pb-0.5">
              <p className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-[#B45309] px-1 mb-0.5">
                {tex.wsPartners || 'Partners'}
              </p>
              {partnerRows.map(schoolRow)}
            </div>
          )}
          {regularRows.slice(0, listLimit).map(schoolRow)}
          {regularRows.length > 8 && (
            <button type="button" onClick={() => setListOpen(v => !v)}
              className="mt-2 text-[11.5px] font-semibold text-[#2563EB] hover:text-[#0B1C3D] transition">
              {listOpen ? (tex.wsShowLess || 'Show less')
                : (tex.wsShowAll || 'Show all {n}').replace('{n}', String(Math.min(regularRows.length, 60)))}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
