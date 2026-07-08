'use client';
import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { t } from '@/lib/translations';
import { getSavedLang, saveLang } from '@/lib/lang';
import BreakButton from '@/app/components/BreakButton';

const codeToName = { en: 'English', ru: 'Русский', es: 'Español', zh: '中文', ua: 'Українська' };
const langs = [
  { label: 'EN', code: 'en', name: 'English' },
  { label: 'RU', code: 'ru', name: 'Русский' },
  { label: 'ES', code: 'es', name: 'Español' },
  { label: 'ZH', code: 'zh', name: '中文' },
  { label: 'UA', code: 'ua', name: 'Українська' },
];

// Shared header used across landing/SEO pages. Mirrors the home page header
// so SEO landings (e.g. /dmv-test) get the same lang switcher, auth pill,
// and nav row without each page reimplementing them.
export default function SiteHeader({ initialLang = 'en' }) {
  const { user, isPro, planType } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  // Seed from the server-read cookie (initialLang) so SSR and the first client
  // render agree on the flag — initializing to a constant would re-render to the
  // saved lang after mount and trip a hydration mismatch on the flag SVG.
  const [lang, setLang] = useState(codeToName[initialLang] || 'English');
  const [showLangMenu, setShowLangMenu] = useState(false);

  useEffect(() => {
    // Reconcile against localStorage in the rare case it drifted from the cookie
    // used for SSR. The functional update bails out when they already match, so
    // the common path never re-renders or flickers.
    const savedName = codeToName[getSavedLang()] || 'English';
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot reconcile of cookie-seeded lang against localStorage; bails out when they match
    setLang(prev => (prev === savedName ? prev : savedName));
  }, []);

  const langToCode = { English: 'en', 'Русский': 'ru', 'Español': 'es', '中文': 'zh', 'Українська': 'ua' };
  const langCode = langToCode[lang] || 'en';
  const tex = t[langCode] || t.en;
  const currentLang = langs.find(l => l.name === lang) || langs[0];

  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  const onPracticeTests = pathname?.startsWith('/dmv-test');
  const onManuals = pathname?.startsWith('/manuals');

  return (
    <header className="w-full max-w-lg mx-auto pt-5 pb-0 px-4">
      <div className="flex items-center justify-between pb-3">
        <Link href="/" className="flex items-center gap-2 cursor-pointer hover:opacity-90 transition">
          <Image src="/logo.png" alt="DMVSOS" width={32} height={32} className="rounded-lg" />
          <span className="text-lg font-bold text-[#0B1C3D]" style={{ letterSpacing: '-0.02em' }}>DMVSOS</span>
        </Link>
        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowLangMenu(v => !v)}
              onBlur={() => setTimeout(() => setShowLangMenu(false), 150)}
              className="flex items-center gap-1 text-xs font-semibold text-[#64748B] bg-white border border-[#E2E8F0] rounded-full px-2.5 py-1.5 hover:border-[#2563EB] transition-colors"
            >
              <span>{currentLang.label}</span>
              <svg width="9" height="9" viewBox="0 0 12 12" className="ml-0.5 shrink-0" style={{ fill: '#94A3B8' }}><path d="M6 8L1 3h10z" /></svg>
            </button>
            {showLangMenu && (
              <div className="absolute right-0 top-full mt-1 bg-white border border-[#E2E8F0] rounded-xl shadow-lg z-50 py-1 min-w-[110px]">
                {langs.map(l => (
                  <button
                    key={l.code}
                    type="button"
                    onMouseDown={() => { setLang(l.name); saveLang(l.code); setShowLangMenu(false); }}
                    className={`w-full text-left px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 hover:bg-[#F8FAFC] transition-colors ${lang === l.name ? 'text-[#2563EB]' : 'text-[#64748B]'}`}
                  >
                    <span>{l.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {user ? (() => {
            const raw = user.user_metadata?.full_name || user.email || '';
            const firstName = raw.split(/\s+/)[0] || raw.split('@')[0] || '?';
            const initial = (raw || '?')[0].toUpperCase();
            return (
              <div className="flex items-center gap-1.5 bg-white border border-[#E2E8F0] rounded-full pl-1.5 pr-2.5 py-1 shadow-sm">
                <button
                  type="button"
                  onClick={() => router.push('/profile')}
                  className="flex items-center gap-1.5 min-w-0 hover:opacity-90 transition"
                >
                  <div className="w-6 h-6 rounded-full bg-[#0B1C3D] flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                    {initial}
                  </div>
                  <span className="hidden sm:block text-xs font-medium text-[#0B1C3D] max-w-[80px] truncate">{firstName}</span>
                  {isPro && ['cdl', 'cdl_pass', 'guaranteed_pass'].includes(planType) && (
                    <span className="hidden sm:inline text-[10px] font-semibold bg-[#FEF3C7] text-[#B45309] px-1.5 py-0.5 rounded-full whitespace-nowrap">CDL Pro</span>
                  )}
                  {isPro && ['auto', 'car_pass', 'full_prep'].includes(planType) && (
                    <span className="hidden sm:inline text-[10px] font-semibold bg-[#DBEAFE] text-[#1D4ED8] px-1.5 py-0.5 rounded-full whitespace-nowrap">Auto Pass</span>
                  )}
                  {isPro && ['moto', 'moto_pass', 'quick_pass'].includes(planType) && (
                    <span className="hidden sm:inline text-[10px] font-semibold bg-[#F1F5F9] text-[#64748B] px-1.5 py-0.5 rounded-full whitespace-nowrap">Moto Pass</span>
                  )}
                  {!isPro && (
                    <span className="hidden sm:inline text-[10px] font-semibold bg-[#F1F5F9] text-[#64748B] px-1.5 py-0.5 rounded-full whitespace-nowrap">{tex.freeBadge || 'Free'}</span>
                  )}
                </button>
                <button onClick={handleSignOut} type="button"
                  className="text-[11px] text-[#94A3B8] hover:text-[#64748B] hover:underline transition"
                  aria-label={tex.signOut || 'Sign out'}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
                </button>
              </div>
            );
          })() : (
            <button
              type="button"
              onClick={() => router.push(`/login?lang=${langCode}`)}
              className="text-sm font-medium text-[#2563EB] hover:text-[#1D4ED8] transition"
            >
              {tex.signInTitle}
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2 pb-3">
        <Link href="/#state-selector"
          className={`inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold rounded-full px-3 py-1 active:scale-95 transition ${onPracticeTests ? 'text-[#2563EB] bg-[#EFF6FF] border border-[#BFDBFE]' : 'text-[#64748B] bg-white border border-[#E2E8F0] hover:border-[#2563EB] hover:text-[#2563EB]'}`}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 7h6M9 11h6M9 15h4" /></svg>
          {tex.practiceTests}
        </Link>
        <Link href="/manuals"
          className={`inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold rounded-full px-3 py-1 active:scale-95 transition ${onManuals ? 'text-[#2563EB] bg-[#EFF6FF] border border-[#BFDBFE]' : 'text-[#64748B] bg-white border border-[#E2E8F0] hover:border-[#2563EB] hover:text-[#2563EB]'}`}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 5a2 2 0 0 1 2-2h7v16H6a2 2 0 0 0-2 2V5z" /><path d="M13 3h5a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2h-5" /></svg>
          {tex.navManuals}
        </Link>
        <BreakButton langCode={langCode} />
      </div>
    </header>
  );
}
