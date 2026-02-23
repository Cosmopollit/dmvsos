'use client';

import Link from 'next/link';
import Image from 'next/image';
import { t } from '@/lib/translations';
import { getSavedLang } from '@/lib/lang';

export default function NotFound() {
  const tex = t[getSavedLang()] || t.en;

  return (
    <main className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center p-6">
      <div className="text-center max-w-sm">
        <Link href="/" className="inline-flex items-center gap-2 mb-8">
          <Image src="/logo.png" alt="DMVSOS" width={40} height={40} className="rounded-xl" />
          <span className="text-xl font-bold text-[#0B1C3D]">DMV<span className="text-[#2563EB]">SOS</span></span>
        </Link>
        <div className="text-6xl mb-4">🚧</div>
        <h1 className="text-2xl font-bold text-[#0B1C3D] mb-2">{tex.pageNotFound}</h1>
        <p className="text-sm text-[#94A3B8] mb-6">{tex.pageNotFoundDesc}</p>
        <Link href="/" className="inline-block bg-[#2563EB] text-white px-6 py-3 rounded-xl font-semibold text-sm hover:bg-[#1D4ED8] transition">
          {tex.goHome}
        </Link>
      </div>
    </main>
  );
}
