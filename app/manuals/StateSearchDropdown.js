'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { STATE_DISPLAY, STATE_META } from '@/lib/manual-data';

// State names in all 5 supported UI languages
const STATE_I18N = {
  alabama:          { ru: 'Алабама',             es: 'Alabama',              zh: '阿拉巴马州',    ua: 'Алабама' },
  alaska:           { ru: 'Аляска',              es: 'Alaska',               zh: '阿拉斯加州',    ua: 'Аляска' },
  arizona:          { ru: 'Аризона',             es: 'Arizona',              zh: '亚利桑那州',    ua: 'Аризона' },
  arkansas:         { ru: 'Арканзас',            es: 'Arkansas',             zh: '阿肯色州',      ua: 'Арканзас' },
  california:       { ru: 'Калифорния',          es: 'California',           zh: '加利福尼亚州',  ua: 'Каліфорнія' },
  colorado:         { ru: 'Колорадо',            es: 'Colorado',             zh: '科罗拉多州',    ua: 'Колорадо' },
  connecticut:      { ru: 'Коннектикут',         es: 'Connecticut',          zh: '康涅狄格州',    ua: 'Коннектикут' },
  delaware:         { ru: 'Делавэр',             es: 'Delaware',             zh: '特拉华州',      ua: 'Делавер' },
  florida:          { ru: 'Флорида',             es: 'Florida',              zh: '佛罗里达州',    ua: 'Флорида' },
  georgia:          { ru: 'Джорджия',            es: 'Georgia',              zh: '乔治亚州',      ua: 'Джорджія' },
  hawaii:           { ru: 'Гавайи',              es: 'Hawái',                zh: '夏威夷州',      ua: 'Гаваї' },
  idaho:            { ru: 'Айдахо',              es: 'Idaho',                zh: '爱达荷州',      ua: 'Айдахо' },
  illinois:         { ru: 'Иллинойс',            es: 'Illinois',             zh: '伊利诺伊州',    ua: 'Іллінойс' },
  indiana:          { ru: 'Индиана',             es: 'Indiana',              zh: '印第安纳州',    ua: 'Індіана' },
  iowa:             { ru: 'Айова',               es: 'Iowa',                 zh: '爱荷华州',      ua: 'Айова' },
  kansas:           { ru: 'Канзас',              es: 'Kansas',               zh: '堪萨斯州',      ua: 'Канзас' },
  kentucky:         { ru: 'Кентукки',            es: 'Kentucky',             zh: '肯塔基州',      ua: 'Кентуккі' },
  louisiana:        { ru: 'Луизиана',            es: 'Luisiana',             zh: '路易斯安那州',  ua: 'Луїзіана' },
  maine:            { ru: 'Мэн',                 es: 'Maine',                zh: '缅因州',        ua: 'Мен' },
  maryland:         { ru: 'Мэриленд',            es: 'Maryland',             zh: '马里兰州',      ua: 'Меріленд' },
  massachusetts:    { ru: 'Массачусетс',         es: 'Massachusetts',        zh: '马萨诸塞州',    ua: 'Массачусетс' },
  michigan:         { ru: 'Мичиган',             es: 'Míchigan',             zh: '密歇根州',      ua: 'Мічиган' },
  minnesota:        { ru: 'Миннесота',           es: 'Minnesota',            zh: '明尼苏达州',    ua: 'Міннесота' },
  mississippi:      { ru: 'Миссисипи',           es: 'Misisipi',             zh: '密西西比州',    ua: 'Міссісіпі' },
  missouri:         { ru: 'Миссури',             es: 'Misuri',               zh: '密苏里州',      ua: 'Міссурі' },
  montana:          { ru: 'Монтана',             es: 'Montana',              zh: '蒙大拿州',      ua: 'Монтана' },
  nebraska:         { ru: 'Небраска',            es: 'Nebraska',             zh: '内布拉斯加州',  ua: 'Небраска' },
  nevada:           { ru: 'Невада',              es: 'Nevada',               zh: '内华达州',      ua: 'Невада' },
  'new-hampshire':  { ru: 'Нью-Гэмпшир',        es: 'Nueva Hampshire',      zh: '新罕布什尔州',  ua: 'Нью-Гемпшир' },
  'new-jersey':     { ru: 'Нью-Джерси',         es: 'Nueva Jersey',         zh: '新泽西州',      ua: 'Нью-Джерсі' },
  'new-mexico':     { ru: 'Нью-Мексико',        es: 'Nuevo México',         zh: '新墨西哥州',    ua: 'Нью-Мексико' },
  'new-york':       { ru: 'Нью-Йорк',           es: 'Nueva York',           zh: '纽约州',        ua: 'Нью-Йорк' },
  'north-carolina': { ru: 'Северная Каролина',  es: 'Carolina del Norte',   zh: '北卡罗来纳州',  ua: 'Північна Кароліна' },
  'north-dakota':   { ru: 'Северная Дакота',    es: 'Dakota del Norte',     zh: '北达科他州',    ua: 'Північна Дакота' },
  ohio:             { ru: 'Огайо',               es: 'Ohio',                 zh: '俄亥俄州',      ua: 'Огайо' },
  oklahoma:         { ru: 'Оклахома',            es: 'Oklahoma',             zh: '俄克拉荷马州',  ua: 'Оклахома' },
  oregon:           { ru: 'Орегон',              es: 'Oregón',               zh: '俄勒冈州',      ua: 'Орегон' },
  pennsylvania:     { ru: 'Пенсильвания',        es: 'Pensilvania',          zh: '宾夕法尼亚州',  ua: 'Пенсильванія' },
  'rhode-island':   { ru: 'Род-Айленд',         es: 'Rhode Island',         zh: '罗得岛州',      ua: 'Род-Айленд' },
  'south-carolina': { ru: 'Южная Каролина',     es: 'Carolina del Sur',     zh: '南卡罗来纳州',  ua: 'Південна Кароліна' },
  'south-dakota':   { ru: 'Южная Дакота',       es: 'Dakota del Sur',       zh: '南达科他州',    ua: 'Південна Дакота' },
  tennessee:        { ru: 'Теннесси',            es: 'Tennessee',            zh: '田纳西州',      ua: 'Теннессі' },
  texas:            { ru: 'Техас',               es: 'Texas',                zh: '德克萨斯州',    ua: 'Техас' },
  utah:             { ru: 'Юта',                 es: 'Utah',                 zh: '犹他州',        ua: 'Юта' },
  vermont:          { ru: 'Вермонт',             es: 'Vermont',              zh: '佛蒙特州',      ua: 'Вермонт' },
  virginia:         { ru: 'Виргиния',            es: 'Virginia',             zh: '弗吉尼亚州',    ua: 'Вірджинія' },
  washington:       { ru: 'Вашингтон',           es: 'Washington',           zh: '华盛顿州',      ua: 'Вашингтон' },
  'west-virginia':  { ru: 'Западная Виргиния',  es: 'Virginia Occidental',  zh: '西弗吉尼亚州',  ua: 'Західна Вірджинія' },
  wisconsin:        { ru: 'Висконсин',           es: 'Wisconsin',            zh: '威斯康星州',    ua: 'Вісконсин' },
  wyoming:          { ru: 'Вайоминг',            es: 'Wyoming',              zh: '怀俄明州',      ua: 'Вайомінг' },
};

const SLUGS = Object.keys(STATE_DISPLAY);

function getLocalName(slug, lang) {
  if (lang === 'en') return STATE_DISPLAY[slug];
  return STATE_I18N[slug]?.[lang] || STATE_DISPLAY[slug];
}

export default function StateSearchDropdown({ lang = 'en', placeholder }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const router = useRouter();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SLUGS;
    return SLUGS.filter(slug => {
      const en = STATE_DISPLAY[slug].toLowerCase();
      const local = getLocalName(slug, lang).toLowerCase();
      const abbr = STATE_META[slug].abbr.toLowerCase();
      const allVariants = [en, local, abbr, ...Object.values(STATE_I18N[slug] || {}).map(n => n.toLowerCase())];
      return allVariants.some(n => n.includes(q));
    });
  }, [query, lang]);

  useEffect(() => { setHighlighted(0); }, [query]);

  // Close on click outside
  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Scroll highlighted item into view
  useEffect(() => {
    if (!open || !listRef.current) return;
    const items = listRef.current.querySelectorAll('[data-item]');
    items[highlighted]?.scrollIntoView({ block: 'nearest' });
  }, [highlighted, open]);

  const select = (slug) => {
    setQuery('');
    setOpen(false);
    router.push(`/manuals/${slug}`);
  };

  const handleKeyDown = (e) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') { setOpen(true); e.preventDefault(); }
      return;
    }
    if (e.key === 'Escape') { setOpen(false); inputRef.current?.blur(); return; }
    if (e.key === 'ArrowDown') { setHighlighted(h => Math.min(h + 1, filtered.length - 1)); e.preventDefault(); }
    if (e.key === 'ArrowUp')   { setHighlighted(h => Math.max(h - 1, 0)); e.preventDefault(); }
    if (e.key === 'Enter' && filtered[highlighted]) { select(filtered[highlighted]); e.preventDefault(); }
  };

  return (
    <div ref={containerRef} className="relative">
      {/* Input */}
      <div className={`flex items-center bg-white rounded-2xl border shadow-sm px-4 py-3.5 transition-all ${
        open ? 'border-[#2563EB] ring-2 ring-[#2563EB]/10' : 'border-[#E2E8F0]'
      }`}>
        <span className="text-[#94A3B8] mr-3 pointer-events-none text-base leading-none">🔍</span>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder || 'Search state...'}
          className="flex-1 bg-transparent text-sm text-[#0B1C3D] placeholder-[#94A3B8] outline-none"
          autoComplete="off"
          spellCheck={false}
        />
        {query ? (
          <button
            type="button"
            onClick={() => { setQuery(''); inputRef.current?.focus(); setOpen(true); }}
            className="ml-2 text-[#94A3B8] hover:text-[#64748B] text-xl leading-none"
          >×</button>
        ) : (
          <span className={`ml-2 text-[#94A3B8] text-xs pointer-events-none transition-transform duration-150 ${open ? 'rotate-180' : ''}`}>▾</span>
        )}
      </div>

      {/* Dropdown */}
      {open && (
        <div
          ref={listRef}
          className="absolute z-50 left-0 right-0 mt-1.5 bg-white rounded-2xl border border-[#E2E8F0] shadow-2xl max-h-72 overflow-y-auto"
        >
          {filtered.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-[#94A3B8]">No states found for &ldquo;{query}&rdquo;</div>
          ) : (
            <ul>
              {filtered.map((slug, i) => {
                const localName = getLocalName(slug, lang);
                const enName = STATE_DISPLAY[slug];
                const abbr = STATE_META[slug].abbr;
                const showEn = localName !== enName;
                const isActive = i === highlighted;
                return (
                  <li key={slug}>
                    <button
                      data-item="true"
                      type="button"
                      onClick={() => select(slug)}
                      onMouseEnter={() => setHighlighted(i)}
                      className={`w-full flex items-center justify-between px-4 py-2.5 text-sm text-left transition-colors
                        ${isActive ? 'bg-[#EFF6FF]' : 'hover:bg-[#F8FAFC]'}
                        ${i === 0 ? 'rounded-t-2xl' : ''}
                        ${i === filtered.length - 1 ? 'rounded-b-2xl' : 'border-b border-[#F1F5F9]'}
                      `}
                    >
                      <span className={`font-medium ${isActive ? 'text-[#2563EB]' : 'text-[#0B1C3D]'}`}>
                        {localName}
                      </span>
                      <span className="text-xs text-[#94A3B8] ml-3 shrink-0 text-right">
                        {showEn && <span className="mr-1">{enName} ·</span>}{abbr}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
