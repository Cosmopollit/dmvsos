'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import GradientButton from '@/app/components/GradientButton';

// Language picker for the state landing page. Mirrors the compact pill dropdown
// used by the home/header language switcher (no flags), but here picking a
// language + Start launches the practice test in that language.
const LANGS = [
  { code: 'en', label: 'English' },
  { code: 'ru', label: 'Русский' },
  { code: 'es', label: 'Español' },
  { code: 'zh', label: '中文' },
  { code: 'ua', label: 'Українська' },
];

export default function StateLangStart({ state, lang = 'en', startLabel = 'Start Free Practice' }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(LANGS.some((l) => l.code === lang) ? lang : 'en');
  const cur = LANGS.find((l) => l.code === sel) || LANGS[0];

  return (
    <div className="flex flex-col items-stretch gap-3">
      {/* Compact language dropdown — same pill pattern as the home switcher. */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          className="w-full flex items-center justify-between gap-3 text-sm font-semibold text-white bg-white/[0.08] border border-white/15 rounded-xl px-4 py-3 hover:border-white/40 transition-colors"
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          <span>{cur.label}</span>
          <svg width="10" height="10" viewBox="0 0 12 12" className="shrink-0 opacity-70" style={{ fill: '#fff' }} aria-hidden="true">
            <path d="M6 8L1 3h10z" />
          </svg>
        </button>
        {open && (
          <div className="absolute left-0 top-full mt-1.5 w-full sm:min-w-[170px] bg-[#13284d] border border-white/15 rounded-xl shadow-xl z-50 py-1" role="listbox">
            {LANGS.map((l) => (
              <button
                key={l.code}
                type="button"
                role="option"
                aria-selected={l.code === sel}
                onMouseDown={() => { setSel(l.code); setOpen(false); }}
                className={`w-full text-left px-4 py-2 text-sm font-medium hover:bg-white/[0.06] transition-colors ${l.code === sel ? 'text-[#60A5FA]' : 'text-white/80'}`}
              >
                {l.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Start — launches the test in the chosen language. */}
      <GradientButton onClick={() => router.push(`/category?state=${state}&lang=${sel}`)} className="flex-1">
        {startLabel}
      </GradientButton>
    </div>
  );
}
