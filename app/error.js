'use client';

import { useEffect } from 'react';
import { t } from '@/lib/translations';
import { getSavedLang } from '@/lib/lang';

export default function Error({ error, reset }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  // The boundary itself must never throw: if lang resolution fails for any
  // reason (blocked storage, bad state), fall back to English instead of
  // crashing into a white screen.
  let lang = 'en';
  try { lang = getSavedLang(); } catch { /* keep 'en' */ }
  const tex = t[lang] || t.en;

  return (
    <main className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center p-6">
      <div className="text-center max-w-sm">
        <div className="flex justify-center mb-4">
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <path d="M12 9v4" />
            <path d="M12 17h.01" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-[#0B1C3D] mb-2">{tex.somethingWentWrong}</h1>
        <p className="text-sm text-[#94A3B8] mb-6">{tex.unexpectedError}</p>
        <button
          type="button"
          onClick={() => reset()}
          className="bg-[#2563EB] text-white px-6 py-3 rounded-xl font-semibold text-sm hover:bg-[#1D4ED8] transition"
        >
          {tex.tryAgainAction}
        </button>
      </div>
    </main>
  );
}
