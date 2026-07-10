'use client';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { t } from '@/lib/translations';
import { getSavedLang, saveLang } from '@/lib/lang';
import { useAuth } from '@/lib/AuthContext';
import { STATE_OPTIONS } from '@/lib/states';
import { agencyAbbrForState } from '@/lib/agencies';
import { examRulesFor, passPercentFor } from '@/lib/exam-rules';
import { questionCountForStateCategory } from '@/lib/state-question-counts';

// Category illustrations live in /public/vehicles (transparent PNGs, the same
// art the mobile app and home page use) — keeps the look consistent across
// web + native. Maps mirror HomeClient's vehicle → category pairing.
const categories = [
  { id: 'dmv',  img: '/vehicles/mustang.png',   titleKey: 'catCar',  descKey: 'carDesc',   dbCat: 'car',        gradient: 'linear-gradient(135deg, #EFF6FF, #DBEAFE)' },
  { id: 'cdl',  img: '/vehicles/truck-hero.png', titleKey: 'catCdl',  descKey: 'truckDesc', dbCat: 'cdl',        gradient: 'linear-gradient(135deg, #F0F9FF, #E0F2FE)' },
  { id: 'moto', img: '/vehicles/moto-hero.png',  titleKey: 'catMoto', descKey: 'motoDesc',  dbCat: 'motorcycle', gradient: 'linear-gradient(135deg, #FFF7ED, #FFEDD5)' },
];

// RU/UA need the count noun declined by number (33 вопроса vs 40 вопросов);
// the other languages carry the noun inside the translation key itself.
function questionsWord(lang, n) {
  const mod10 = n % 10, mod100 = n % 100;
  const few = mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14);
  const one = mod10 === 1 && mod100 !== 11;
  if (lang === 'ru') return one ? 'вопрос' : few ? 'вопроса' : 'вопросов';
  if (lang === 'ua') return one ? 'питання' : few ? 'питання' : 'питань';
  return '';
}

// The competence line under each category: real agency, real exam size and
// pass mark, real bank count. Free-tier only (base-access scope rule: all
// bank framing drops the moment the user buys). Returns null when any fact
// is missing so a bad slug never renders a half-empty spec row.
function specLine(tex, lang, state, dbCat) {
  const agency = agencyAbbrForState(state);
  const rules = examRulesFor(state, dbCat);
  const passPct = passPercentFor(state, dbCat);
  const bank = questionCountForStateCategory(state, dbCat);
  if (!agency || !rules || !passPct || !bank) return null;
  return (tex.catSpecLine || '{agency} exam: {q} questions · pass mark {p}% · {n} in the bank')
    .replace('{agency}', agency)
    .replace('{q}', String(rules.questions))
    .replace('{qWord}', questionsWord(lang, rules.questions))
    .replace('{p}', String(passPct))
    .replace('{n}', bank.toLocaleString())
    .replace(/\s{2,}/g, ' ');
}

const langs = [
  { label: 'EN', code: 'en' },
  { label: 'RU', code: 'ru' },
  { label: 'ES', code: 'es' },
  { label: 'ZH', code: 'zh' },
  { label: 'UA', code: 'ua' },
];

// slug → "Washington" display name
function slugToStateName(slug) {
  if (!slug) return '';
  const match = STATE_OPTIONS.find(s =>
    s.replace(/\s*\([A-Z]{2}\)\s*$/, '').trim().toLowerCase().replace(/\s+/g, '-') === slug
  );
  return match ? match.replace(/\s*\([A-Z]{2}\)\s*$/, '').trim() : slug;
}

function CategoryContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const state = searchParams.get('state') ?? '';
  const { isPro } = useAuth();
  const [lang, setLangState] = useState(searchParams.get('lang') || getSavedLang());
  const [showLangMenu, setShowLangMenu] = useState(false);
  const tex = t[lang] || t.en;
  const currentLang = langs.find(l => l.code === lang) || langs[0];
  const stateName = slugToStateName(state);

  function switchLang(code) {
    setLangState(code);
    saveLang(code);
    setShowLangMenu(false);
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 relative" style={{ background: 'linear-gradient(135deg, #EFF6FF 0%, #FFF7ED 100%)' }}>
      {/* Header */}
      <div className="absolute top-4 left-4 right-4 flex items-center justify-between">
        <button type="button" onClick={() => router.push(`/?lang=${lang}`)} className="text-sm text-[#94A3B8] hover:text-[#2563EB] transition font-medium">
          {tex.back}
        </button>
        <Link href="/" className="flex items-center gap-2 cursor-pointer hover:opacity-90 transition">
          <Image src="/logo.png" alt="DMVSOS" width={28} height={28} className="rounded-lg" />
          <span className="text-lg font-bold text-[#0B1C3D]" style={{ letterSpacing: '-0.02em' }}>DMVSOS</span>
        </Link>
        {/* Language switcher */}
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
            <div className="absolute right-0 top-full mt-1 bg-white border border-[#E2E8F0] rounded-xl shadow-lg z-50 py-1 min-w-[90px]">
              {langs.map(l => (
                <button
                  key={l.code}
                  type="button"
                  onMouseDown={() => switchLang(l.code)}
                  className={`w-full text-left px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 hover:bg-[#F8FAFC] transition-colors ${lang === l.code ? 'text-[#2563EB]' : 'text-[#64748B]'}`}
                >
                  <span>{l.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="text-center mb-8 mt-12">
        {stateName && (
          <p className="text-sm font-semibold text-[#2563EB] mb-1 uppercase tracking-wide">{stateName}</p>
        )}
        <h2 className="text-xl font-bold text-[#0B1C3D] mb-1">{tex.chooseTest}</h2>
        <p className="text-sm text-[#94A3B8]">{tex.selectLicense}</p>
      </div>

      <div className="w-full max-w-md flex flex-col gap-4">
        {categories.map((cat) => (
          <div key={cat.id}>
            <button
              type="button"
              onClick={() => {
                if (cat.id === 'cdl') {
                  router.push(`/cdl-category?state=${state}&lang=${lang}`);
                } else {
                  router.push(`/test?state=${state}&category=${cat.id}&lang=${lang}`);
                }
              }}
              className="w-full rounded-2xl p-5 flex items-center gap-5 hover:shadow-lg transition-all text-left border-2 border-white/60 shadow-md"
              style={{ background: cat.gradient }}
            >
              <div className="flex-shrink-0 w-16 h-16 flex items-center justify-center">
                <Image src={cat.img} alt="" aria-hidden="true" width={64} height={64} className="rounded-xl object-contain select-none pointer-events-none" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="font-bold text-[#0B1C3D] text-lg">{tex[cat.titleKey]}</span>
                <div className="text-sm text-[#64748B] mt-0.5">{tex[cat.descKey]}</div>
                {state && !isPro && specLine(tex, lang, state, cat.dbCat) && (
                  <div className="text-[11px] font-medium text-[#64748B]/90 mt-1.5 pt-1.5 border-t border-[#0B1C3D]/[0.07]">
                    {specLine(tex, lang, state, cat.dbCat)}
                  </div>
                )}
              </div>
              <div className="text-[#94A3B8] text-lg shrink-0"></div>
            </button>
          </div>
        ))}
      </div>

      {/* Manual link */}
      {state && (
        <div className="w-full max-w-md mt-6 text-center">
          <a href={`/manuals/${state}`} className="text-sm text-[#2563EB] hover:underline font-medium">
            {tex.readManual}
          </a>
        </div>
      )}
    </main>
  );
}

export default function Category() {
  return (
    <Suspense fallback={<main className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #EFF6FF 0%, #FFF7ED 100%)' }}><div className="w-6 h-6 border-2 border-[#94A3B8] border-t-transparent rounded-full animate-spin" /></main>}>
      <CategoryContent />
    </Suspense>
  );
}
