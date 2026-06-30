'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveLang } from '@/lib/lang';

const LANGS = [
  { label: 'EN', code: 'en' },
  { label: 'RU', code: 'ru' },
  { label: 'ES', code: 'es' },
  { label: 'ZH', code: 'zh' },
  { label: 'UA', code: 'ua' },
];

// Language switcher for the server-rendered /manuals tree. The hero + state
// labels are rendered server-side from the dmvsos_lang cookie, so switching
// saves the cookie (saveLang) and calls router.refresh() to re-run the
// server component with the new language. No full page reload.
export default function ManualsLangSwitcher({ currentLang = 'en' }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const current = LANGS.find(l => l.code === currentLang) || LANGS[0];

  function pick(code) {
    setOpen(false);
    if (code === currentLang) return;
    saveLang(code);
    router.refresh();
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="flex items-center gap-1 text-xs font-semibold text-[#64748B] bg-white border border-[#E2E8F0] rounded-full px-2.5 py-1.5 hover:border-[#2563EB] transition-colors"
        aria-label="Change language"
      >
        <span>{current.label}</span>
        <span className="text-[#94A3B8] text-[10px] ml-0.5">▾</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 bg-white border border-[#E2E8F0] rounded-xl shadow-lg z-50 py-1 min-w-[90px]">
          {LANGS.map(l => (
            <button
              key={l.code}
              type="button"
              onMouseDown={() => pick(l.code)}
              className={`w-full text-left px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 hover:bg-[#F8FAFC] transition-colors ${l.code === currentLang ? 'text-[#2563EB]' : 'text-[#64748B]'}`}
            >
              <span>{l.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
