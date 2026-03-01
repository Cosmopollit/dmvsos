'use client';
import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { t } from '@/lib/translations';
import { getSavedLang, saveLang } from '@/lib/lang';
import { STATE_OPTIONS, stateToSlug } from '@/lib/states';
import { flags } from '@/lib/flags';

const CATEGORIES = [
  { id: 'car', icon: '🚗', label: 'Car (DMV)' },
  { id: 'cdl', icon: '🚛', label: 'CDL' },
  { id: 'moto', icon: '🏍️', label: 'Motorcycle' },
];

const codeToName = { en: 'English', ru: 'Русский', es: 'Español', zh: '中文', ua: 'Українська' };

export default function ManualSelector() {
  const [state, setState] = useState('');
  const [category, setCategory] = useState('car');
  const [lang, setLang] = useState(() => codeToName[getSavedLang()] || 'English');
  const stateSelectRef = useRef(null);
  const router = useRouter();

  const langToCode = { English: 'en', 'Русский': 'ru', 'Español': 'es', '中文': 'zh', 'Українська': 'ua' };
  const langCode = langToCode[lang] || 'en';
  const tex = t[langCode] || t.en;

  const stateOptions = STATE_OPTIONS.map((display) => ({ name: display, code: stateToSlug(display) }));

  const langs = [
    { label: 'EN', flag: flags.us, code: 'en', name: 'English' },
    { label: 'RU', flag: flags.ru, code: 'ru', name: 'Русский' },
    { label: 'ES', flag: flags.es, code: 'es', name: 'Español' },
    { label: 'ZH', flag: flags.cn, code: 'zh', name: '中文' },
    { label: 'UA', flag: flags.ua, code: 'ua', name: 'Українська' },
  ];

  function handleGo() {
    if (state) {
      router.push(`/manuals/${state}`);
    } else {
      stateSelectRef.current?.focus();
    }
  }

  const stateName = state
    ? stateOptions.find(s => s.code === state)?.name?.replace(/\s*\([A-Z]{2}\)\s*$/, '') || ''
    : '';

  return (
    <>
      {/* Language switcher */}
      <div className="w-full max-w-lg mx-auto px-4 pb-3">
        <div className="flex items-center justify-center gap-1.5">
          {langs.map((l) => (
            <button
              key={l.code}
              onClick={() => { setLang(l.name); saveLang(l.code); }}
              type="button"
              aria-label={`Switch language to ${l.name}`}
              className={`px-3 py-1.5 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                lang === l.name
                  ? 'bg-[#0B1C3D] text-white ring-2 ring-[#2563EB]'
                  : 'bg-white text-[#64748B] hover:bg-gray-50 border border-gray-200'
              }`}
            >
              <span className="shrink-0">{l.flag}</span> {l.label}
            </button>
          ))}
        </div>
      </div>

      {/* Hero */}
      <section className="w-full max-w-lg mx-auto px-4 pt-1 pb-5 text-center">
        <span className="inline-block bg-[#2563EB]/10 text-[#2563EB] text-xs font-semibold px-3 py-1 rounded-full mb-4 tracking-widest uppercase border border-[#2563EB]/20">
          {tex.manualsBadge}
        </span>

        <h1 className="text-[32px] sm:text-[42px] font-semibold text-[#0B1C3D] leading-[1.13] mb-3 whitespace-pre-line"
          style={{ fontFamily: "'DM Sans', var(--font-dm-sans), sans-serif", letterSpacing: '-0.025em' }}>
          {tex.manualsHeroTitle}
        </h1>

        <p className="text-[15px] font-normal leading-relaxed"
          style={{ color: '#64748B', letterSpacing: '-0.01em' }}>
          {tex.manualsHeroSub}
        </p>
      </section>

      {/* Selector card */}
      <div className="w-full max-w-lg mx-auto px-4 mb-8">
        <div className="bg-white rounded-3xl shadow-2xl p-6 sm:p-8 border border-[#E2E8F0]/40" style={{ borderTop: '4px solid #2563EB' }}>

          <p className="text-sm text-[#94A3B8] mb-5">{tex.manualsSelectLabel}</p>

          {/* State select */}
          <select
            ref={stateSelectRef}
            value={state}
            onChange={e => setState(e.target.value)}
            className="w-full py-4 px-4 rounded-xl border-2 border-gray-100 focus:border-blue-500 outline-none text-base bg-white text-gray-700 cursor-pointer appearance-none mb-4"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%236B7280' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 16px center',
            }}
          >
            <option value="">{tex.manualsSelectPlaceholder}</option>
            {stateOptions.map(s => (
              <option key={s.code} value={s.code}>{s.name}</option>
            ))}
          </select>

          {/* Category tabs */}
          <p className="text-xs text-[#94A3B8] mb-2 font-medium">{tex.manualsCategory}</p>
          <div className="flex gap-2 mb-5">
            {CATEGORIES.map(cat => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategory(cat.id)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-1.5
                  ${category === cat.id
                    ? 'bg-[#2563EB] text-white shadow-md'
                    : 'bg-[#F1F5F9] text-[#64748B] hover:bg-[#E2E8F0]'
                  }`}
              >
                <span>{cat.icon}</span>
                <span className="hidden sm:inline">{cat.label}</span>
                <span className="sm:hidden">{cat.label.split(' ')[0]}</span>
              </button>
            ))}
          </div>

          {/* CTA button */}
          <button
            type="button"
            onClick={handleGo}
            className={`w-full py-4 rounded-xl font-semibold text-[15px] flex items-center justify-center gap-2 transition-all text-white cursor-pointer
              ${state ? 'bg-[#2563EB] hover:bg-[#1D4ED8]' : 'bg-[#CBD5E1]'}`}
          >
            {state ? tex.manualsCta.replace('{state}', stateName) : tex.manualsCtaEmpty}
          </button>

          {/* Trust badges */}
          <div className="flex flex-wrap gap-2 justify-center mt-3">
            <span className="inline-flex items-center gap-1 text-xs text-[#64748B] bg-[#F1F5F9] px-2.5 py-1 rounded-full">✓ {tex.manualsTrust1}</span>
            <span className="inline-flex items-center gap-1 text-xs text-[#64748B] bg-[#F1F5F9] px-2.5 py-1 rounded-full">✓ {tex.manualsTrust2}</span>
            <span className="inline-flex items-center gap-1 text-xs text-[#64748B] bg-[#F1F5F9] px-2.5 py-1 rounded-full">✓ {tex.manualsTrust3}</span>
          </div>
        </div>
      </div>
    </>
  );
}
