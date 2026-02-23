'use client';

import { t } from '@/lib/translations';
import { getSavedLang } from '@/lib/lang';

export default function Error({ reset }) {
  const tex = t[getSavedLang()] || t.en;

  return (
    <main className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center p-6">
      <div className="text-center max-w-sm">
        <div className="text-6xl mb-4">😵</div>
        <h1 className="text-2xl font-bold text-[#0B1C3D] mb-2">{tex.somethingWentWrong}</h1>
        <p className="text-sm text-[#94A3B8] mb-6">{tex.unexpectedError}</p>
        <button
          onClick={() => reset()}
          className="bg-[#2563EB] text-white px-6 py-3 rounded-xl font-semibold text-sm hover:bg-[#1D4ED8] transition"
        >
          {tex.tryAgainAction}
        </button>
      </div>
    </main>
  );
}
