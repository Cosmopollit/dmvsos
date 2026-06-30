import Link from 'next/link';
import { STATE_DISPLAY, STATE_SLUGS, STATE_META } from '@/lib/manual-data';
import { MIN_PRICE } from '@/lib/plans';
import { examRulesFor, passPercentFor } from '@/lib/exam-rules';
import { neighborsOf } from '@/lib/state-neighbors';
import { citiesOf } from '@/lib/state-cities';
import SiteHeader from '@/app/components/SiteHeader';
import SupportFooter from '@/app/components/SupportFooter';
import GradientButton from '@/app/components/GradientButton';
import StateLangStart from '@/app/components/StateLangStart';
import { t } from '@/lib/translations';

// Brand line icons (kills the old emoji in the "what to expect" rows). Small,
// navy-stroked, sit inside a tinted rounded chip — matches the rest of the site.
const ICONS = {
  questions: <path d="M8 6h8M8 10h8M8 14h5" />,
  pass: <path d="M5 12l4 4 10-10" />,
  admin: <path d="M4 20h16M6 20V9l6-4 6 4v11M10 20v-5h4v5" />,
  langs: <path d="M12 3a9 9 0 100 18 9 9 0 000-18zM3 12h18M12 3c2.5 2.5 2.5 15.5 0 18M12 3c-2.5 2.5-2.5 15.5 0 18" />,
  retakes: <path d="M4 11a8 8 0 0114-5l2 2M20 13a8 8 0 01-14 5l-2-2M17 4v4h-4M7 20v-4h4" />,
};

// Exam facts come from the single source of truth (lib/exam-rules.js),
// not a local table, so counts + pass scores never drift or go stale.
export function examFor(state) {
  const rule = examRulesFor(state, 'car');
  if (!rule) return { questions: 40, passing: 32, passingPct: 80 };
  return { questions: rule.questions, passing: rule.pass, passingPct: passPercentFor(state, 'car') };
}

// Shared server-rendered body for the state DMV-test landing page.
// `lang` and `state` arrive as props: the root wrapper passes the cookie
// language, the /[locale]/ wrapper passes the path-segment locale. This
// component reads NO cookies, so a cookieless crawler hitting /ru/dmv-test/x
// gets a genuinely Russian body. The SEO <title>/description live in the
// wrappers' generateMetadata; the JSON-LD + FAQ stay derived from the same
// state values. Generic strings come from lib/translations.js; state values
// are interpolated in.
export default function StateBody({ lang, state }) {
  const tex = t[lang] || t.en;
  const name = STATE_DISPLAY[state];

  const meta = STATE_META[state];
  const exam = examFor(state);
  const year = new Date().getFullYear();

  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'FAQPage',
        mainEntity: [
          {
            '@type': 'Question',
            name: `How many questions are on the ${name} DMV knowledge test?`,
            acceptedAnswer: {
              '@type': 'Answer',
              text: `The ${name} DMV written knowledge test has ${exam.questions} questions. You need to answer at least ${exam.passing} correctly (${exam.passingPct}%) to pass.`,
            },
          },
          {
            '@type': 'Question',
            name: `What is the passing score for the ${meta.abbr} DMV written test?`,
            acceptedAnswer: {
              '@type': 'Answer',
              text: `The passing score for the ${name} (${meta.abbr}) DMV written test is ${exam.passingPct}%  ·  you must answer ${exam.passing} out of ${exam.questions} questions correctly.`,
            },
          },
          {
            '@type': 'Question',
            name: `Can I take the ${name} DMV practice test in Spanish or other languages?`,
            acceptedAnswer: {
              '@type': 'Answer',
              text: `Yes! DMVSOS offers the ${name} DMV practice test in English, Spanish, Russian, Chinese, and Ukrainian. Select your language and start practicing for free.`,
            },
          },
          {
            '@type': 'Question',
            name: `Is the ${name} DMV practice test free?`,
            acceptedAnswer: {
              '@type': 'Answer',
              text: `Yes. DMVSOS provides a free ${name} DMV practice test with real knowledge test questions. One-time passes from ${MIN_PRICE} (30 days) unlock extended 40-question tests and detailed answer explanations — no subscription.`,
            },
          },
          {
            '@type': 'Question',
            name: `What topics are covered on the ${meta.abbr} DMV test?`,
            acceptedAnswer: {
              '@type': 'Answer',
              text: `The ${name} DMV knowledge test covers traffic signs and signals, right-of-way rules, speed limits, safe following distance, DUI laws, and road markings. DMVSOS practice questions cover all ${name} DMV test topics.`,
            },
          },
        ],
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home',             item: 'https://dmvsos.com' },
          { '@type': 'ListItem', position: 2, name: 'DMV Tests',        item: 'https://dmvsos.com/dmv-test' },
          { '@type': 'ListItem', position: 3, name: `${name} DMV Test`, item: `https://dmvsos.com/dmv-test/${state}` },
        ],
      },
      {
        '@type': 'HowTo',
        name: `How to pass the ${name} DMV knowledge test in ${year}`,
        description: `Step-by-step guide to passing the ${name} (${meta.abbr}) DMV written knowledge test on your first try.`,
        totalTime: 'PT7D',
        supply: [
          { '@type': 'HowToSupply', name: `Official ${name} Driver Handbook (free PDF)` },
          { '@type': 'HowToSupply', name: 'Practice tests with real questions (free at DMVSOS)' },
          { '@type': 'HowToSupply', name: 'Valid ID and proof of residency' },
        ],
        step: [
          { '@type': 'HowToStep', position: 1, name: 'Read the official handbook', text: `Download the free ${name} Driver Handbook PDF from DMVSOS or your state DMV. Skim the table of contents, then read sections on traffic signs, right-of-way, and DUI laws first.` },
          { '@type': 'HowToStep', position: 2, name: 'Practice with DMV-format questions', text: `Take free practice tests on DMVSOS in your native language. The ${name} test has ${exam.questions} questions; practice that exact format until you consistently score above ${exam.passingPct}%.` },
          { '@type': 'HowToStep', position: 3, name: 'Review your mistakes', text: 'Wrong answers come with explanations citing the handbook section. Re-read those sections, retake practice on the same topic.' },
          { '@type': 'HowToStep', position: 4, name: 'Book your test appointment', text: `Schedule online through the ${meta.agency} website. Bring ID, proof of residency, and the application fee.` },
          { '@type': 'HowToStep', position: 5, name: 'Take the test', text: `Arrive 15 minutes early. The ${name} test is computer-based at most locations. You need ${exam.passing} correct out of ${exam.questions} to pass.` },
        ],
      },
      {
        '@type': 'Course',
        name: `${name} DMV Practice Test`,
        description: `Free practice tests for the ${name} (${meta.abbr}) DMV knowledge exam. Real question format, all topics covered, ${exam.questions}-question full tests, available in 5 languages.`,
        provider: { '@type': 'Organization', name: 'DMVSOS', url: 'https://dmvsos.com' },
        educationalLevel: 'beginner',
        inLanguage: ['en', 'es', 'ru', 'uk', 'zh'],
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'USD',
          availability: 'https://schema.org/InStock',
        },
      },
    ],
  // Match the visible copy: refer to this state's real agency, not generic
  // "DMV" (WA = DOL, TX = DPS, …). \b keeps the brand "DMVSOS" intact.
  }).replace(/\bDMV\b/g, meta.dmvAbbr);

  // Geographic neighbors first — real adjacency reads as a coherent regional
  // map to crawlers (Florida → Georgia, Alabama; not alphabetical Alaska).
  // Fall back to top-traffic states for the second row if the state has few
  // neighbors (e.g. Florida only borders 2 states; New England states < 4).
  const stateIdx = STATE_SLUGS.indexOf(state);
  const neighborStates = neighborsOf(state).filter(s => s !== state);
  const TOP_STATES = ['california', 'texas', 'florida', 'new-york', 'illinois', 'pennsylvania', 'ohio', 'georgia'];
  const fillerStates = TOP_STATES.filter(s => s !== state && !neighborStates.includes(s));
  const otherStates = [...neighborStates, ...fillerStates].slice(0, 8);
  const cities = citiesOf(state);

  // Fill {tokens} in the localized FAQ / language-section strings with this
  // state's real values. Keeps interpolation working across all 5 languages
  // without per-language word-order assumptions.
  const repl = (str) => (str || '')
    .replaceAll('{name}', name)
    .replaceAll('{abbr}', meta.abbr)
    .replaceAll('{agency}', meta.dmvAbbr)
    .replaceAll('{q}', String(exam.questions))
    .replaceAll('{pass}', String(exam.passing))
    .replaceAll('{pct}', String(exam.passingPct))
    .replaceAll('{price}', String(MIN_PRICE))
    // Many states are not "DMV" (WA = DOL, TX = DPS, IL = SOS, …). Swap the
    // generic word for this state's real agency so copy reads authentically.
    // \b keeps the brand "DMVSOS" intact; no-op for true DMV states.
    .replace(/\bDMV\b/g, meta.dmvAbbr);
  const cityList = cities.slice(0, 6).join(', ');
  const citiesText = cities.length > 6 ? `${cityList}, ${repl(tex.dtCitiesOther)}` : cityList;
  const fill = (str) => repl(str).replaceAll('{cities}', citiesText);

  const stats = [
    { value: '25,000+', label: tex.dtStatQuestions || 'Questions' },
    { value: '3',       label: tex.dtStatCategories || 'Categories' },
    { value: '5',       label: tex.dtStatLanguages || 'Languages' },
    { value: `${exam.passingPct}%`, label: tex.dtStatPass || 'Score to pass' },
  ];

  const whatToExpect = [
    { icon: 'questions', label: tex.dtRowQuestions || 'Questions',     value: `${exam.questions} ${tex.dtMcq || 'multiple-choice questions'}` },
    { icon: 'pass',      label: tex.dtRowPass || 'Passing score',      value: `${exam.passing} ${tex.dtCorrect || 'correct'} (${exam.passingPct}%)` },
    { icon: 'admin',     label: tex.dtRowAdmin || 'Administered by',   value: meta.agency },
    { icon: 'langs',     label: tex.dtRowLangs || 'Languages',         value: tex.dtValLangs || 'English, Spanish, Russian, Chinese, Ukrainian' },
    { icon: 'retakes',   label: tex.dtRowRetakes || 'Retakes',          value: tex.dtValRetakes || 'Allowed after a waiting period if you fail' },
  ];

  // Vehicle art (the same transparent PNGs the home + /category use) instead of
  // the old emoji, so the license tiles match the rest of the brand.
  const categories = [
    { cat: 'dmv',  img: '/vehicles/mustang.png',   title: tex.catCar || 'Car (DMV)',   desc: tex.carDesc   || "Regular driver's license for cars, SUVs and pickups", bg: 'linear-gradient(135deg, #EFF6FF, #DBEAFE)' },
    { cat: 'cdl',  img: '/vehicles/truck-hero.png', title: tex.catCdl || 'CDL',         desc: tex.truckDesc || "Commercial Driver's License for trucks and buses",   bg: 'linear-gradient(135deg, #F0F9FF, #E0F2FE)' },
    { cat: 'moto', img: '/vehicles/moto-hero.png',  title: tex.catMoto || 'Motorcycle', desc: tex.motoDesc  || 'Motorcycle and scooter permit test',                  bg: 'linear-gradient(135deg, #FFF7ED, #FFEDD5)' },
  ];

  const faqs = [
    { q: fill(tex.dtFaqQ1), a: fill(tex.dtFaqA1) },
    { q: fill(tex.dtFaqQ2), a: fill(tex.dtFaqA2) },
    { q: fill(tex.dtFaqQ3), a: fill(tex.dtFaqA3) },
    { q: fill(tex.dtFaqQ4), a: fill(tex.dtFaqA4) },
    { q: fill(tex.dtFaqQ5), a: fill(tex.dtFaqA5) },
  ];

  return (
    <div
      className="min-h-screen font-[family-name:var(--font-inter)]"
      style={{ background: 'linear-gradient(135deg, #EFF6FF 0%, #FFF7ED 100%)' }}
    >
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />

      <div className="fixed top-[-200px] right-[-200px] w-[600px] h-[600px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(26,86,219,0.08) 0%, transparent 70%)' }} />
      <div className="fixed bottom-[-150px] left-[-150px] w-[500px] h-[500px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(245,158,11,0.06) 0%, transparent 70%)' }} />

      <SiteHeader />

      <main className="max-w-lg mx-auto px-4 pb-16">

        {/* Breadcrumb */}
        <nav className="text-xs text-[#94A3B8] mb-5 mt-2" aria-label="Breadcrumb">
          <ol className="flex items-center gap-1.5 flex-wrap">
            <li><Link href="/" className="hover:text-[#2563EB]">{tex.home || 'Home'}</Link></li>
            <li>/</li>
            <li><Link href="/dmv-test" className="hover:text-[#2563EB]">{tex.practiceTests || 'DMV Tests'}</Link></li>
            <li>/</li>
            <li className="text-[#1A2B4A] font-medium">{name}</li>
          </ol>
        </nav>

        {/* H1 */}
        <h1 className="text-3xl sm:text-4xl font-black text-[#0B1C3D] mb-3 leading-tight" style={{ letterSpacing: '-0.02em' }}>
          {name} {String(tex.dtTitleSuffix || 'DMV Practice Test').replace(/\bDMV\b/, meta.dmvAbbr)} {year}  ·  {tex.dtFree || 'Free'}
        </h1>
        <p className="text-base text-[#64748B] mb-6 leading-relaxed">
          {tex.dtIntro || `Practice with real ${meta.abbr} knowledge test questions and pass on your first try. Study in your language: English, Spanish, Russian, Chinese, and Ukrainian.`}
        </p>

        {/* Language CTA card */}
        <div className="relative overflow-hidden bg-[#0B1C3D] rounded-2xl p-6 mb-6 shadow-xl">
          <div aria-hidden="true" className="absolute -top-20 -right-20 w-56 h-56 rounded-full pointer-events-none"
            style={{ background: 'radial-gradient(circle, rgba(37,99,235,0.28) 0%, transparent 70%)' }} />
          <p className="relative text-[#94A3B8] text-xs font-semibold mb-4 uppercase tracking-widest">
            {tex.dtChooseLang || 'Choose your language and start:'}
          </p>
          <div className="relative">
            <StateLangStart
              state={state}
              lang={lang}
              startFree={tex.startFree || 'Start Free'}
              startPro={tex.startPracticing || 'Start Practicing'}
              noteFree={tex.dtNoSignup || 'No signup required · 20 free questions per test'}
            />
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-2 mb-8">
          {stats.map(({ value, label }) => (
            <div key={label} className="bg-white rounded-2xl p-3 text-center shadow-sm border border-[#E2E8F0]/60">
              <div className="text-lg font-black text-[#0B1C3D]">{value}</div>
              <div className="text-[10px] text-[#94A3B8] font-medium mt-0.5 leading-tight">{label}</div>
            </div>
          ))}
        </div>

        {/* What to expect */}
        <section className="bg-white rounded-2xl border border-[#E2E8F0] p-6 mb-5 shadow-sm">
          <h2 className="text-base font-bold text-[#0B1C3D] mb-4">
            {tex.dtExpectTitle || `What to expect on the ${meta.abbr} DMV knowledge test`}
          </h2>
          <ul className="space-y-3">
            {whatToExpect.map(({ icon, label, value }) => (
              <li key={label} className="flex items-start gap-3">
                <span className="shrink-0 w-7 h-7 rounded-lg bg-[#EFF6FF] flex items-center justify-center mt-0.5">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    {ICONS[icon]}
                  </svg>
                </span>
                <div>
                  <span className="text-sm font-semibold text-[#0B1C3D]">{label}: </span>
                  <span className="text-sm text-[#64748B]">{value}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* License categories */}
        <section className="bg-white rounded-2xl border border-[#E2E8F0] p-6 mb-5 shadow-sm">
          <h2 className="text-base font-bold text-[#0B1C3D] mb-4">
            {tex.dtTypesTitle || `Available ${name} practice test types`}
          </h2>
          <div className="space-y-3">
            {categories.map(({ cat, img, title, desc, bg }) => (
              <Link
                key={cat}
                href={`/category?state=${state}&lang=en`}
                className="flex items-center gap-3 p-3.5 rounded-2xl border border-white/60 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all"
                style={{ background: bg }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img} alt="" aria-hidden="true" className="w-14 h-11 object-contain shrink-0 select-none pointer-events-none" />
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm text-[#0B1C3D]">{title}</div>
                  <div className="text-xs text-[#64748B] mt-0.5 leading-relaxed">{desc}</div>
                </div>
                <span className="text-xs font-semibold text-[#2563EB] shrink-0">{tex.dtStart || 'Start'}</span>
              </Link>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section className="mb-8">
          <h2 className="text-lg font-bold text-[#0B1C3D] mb-4">
            {name}  ·  {tex.dtFaqTitle || 'Frequently Asked Questions'}
          </h2>
          <div className="space-y-3">
            {faqs.map(({ q, a }) => (
              <details key={q} className="bg-white rounded-2xl border border-[#E2E8F0] p-5 shadow-sm group hover:border-[#BFDBFE] transition-colors">
                <summary className="font-semibold text-sm text-[#0B1C3D] cursor-pointer list-none flex justify-between items-center gap-3">
                  <span>{q}</span>
                  <span className="shrink-0 w-6 h-6 rounded-full bg-[#EFF6FF] flex items-center justify-center transition-transform group-open:rotate-180">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
                  </span>
                </summary>
                <p className="mt-3 text-sm text-[#64748B] leading-relaxed">{a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* Manual link — mirrors the home's driver-manual card */}
        <Link
          href={`/manuals/${state}`}
          className="group flex items-center gap-3 bg-blue-50 rounded-2xl px-4 py-4 mb-5 shadow-sm border border-blue-100 border-l-4 border-l-blue-500 hover:bg-blue-100 hover:shadow-md transition-all"
        >
          <div className="w-11 h-11 rounded-xl bg-blue-100 flex items-center justify-center shrink-0 group-hover:bg-blue-200 transition-colors">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/illustrations/manual.png" alt="" aria-hidden="true" className="w-9 h-9 object-contain" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-sm font-bold text-[#0B1C3D] group-hover:text-[#2563EB]">{tex.dtManualTitle || `Official ${name} Driver Handbook`}</span>
              <span className="text-[10px] font-bold bg-blue-500 text-white px-1.5 py-0.5 rounded-full leading-none">FREE</span>
            </div>
            <div className="text-[11px] text-[#64748B]">{tex.dtManualSub || 'Read or download the free PDF manual'}</div>
          </div>
        </Link>

        {/* Pro upgrade */}
        <div className="bg-gradient-to-r from-[#0B1C3D] to-[#1E3A5F] rounded-2xl p-6 mb-8 text-center shadow-lg border border-[#1e3a5f]">
          <div className="text-[#F59E0B] font-black text-xs mb-2 uppercase tracking-widest">{tex.dtProKicker || 'Unlock Full Access'}</div>
          <p className="text-white font-bold text-base mb-1">{tex.dtProTitle || 'Practice with current, verified questions and walk in ready'}</p>
          <p className="text-[#94A3B8] text-sm mb-4">{tex.dtProSub || 'Full 40-question tests · Detailed explanations · All categories'}</p>
          <div className="flex items-center justify-center gap-2 mb-4">
            <span className="text-xs font-semibold text-[#10B981] bg-[#10B981]/10 px-3 py-1 rounded-full border border-[#10B981]/30">
              {tex.footerFree || 'Free to start · no signup'}
            </span>
          </div>
          <GradientButton href="/upgrade" variant="gold" className="max-w-xs mx-auto">
            {tex.dtProBtn || 'Unlock Full Access'}  ·  {tex.dtFrom || 'from'} {MIN_PRICE}
          </GradientButton>
          <p className="text-xs text-[#64748B] mt-3">{tex.dtProNote || 'One-time payment · 30 days · No subscription'}</p>
        </div>

        {/* Geographically-relevant nearby states first, then top-traffic states
            as filler so the section is never thin. Internal linking signal. */}
        <section>
          <h2 className="text-sm font-bold text-[#0B1C3D] mb-3">
            {neighborStates.length > 0 ? `${tex.dtNearby || 'Practice tests near'} ${name}` : (tex.dtPopular || 'Popular state practice tests')}
          </h2>
          <div className="grid grid-cols-2 gap-2">
            {otherStates.map(s => (
              <Link
                key={s}
                href={`/dmv-test/${s}`}
                className="p-3 rounded-xl border border-[#E2E8F0] bg-white hover:border-[#2563EB] hover:shadow-sm transition-all text-sm font-medium text-[#1A2B4A] hover:text-[#2563EB]"
              >
                {STATE_DISPLAY[s]}{' '}
                <span className="text-[#94A3B8] text-xs">({STATE_META[s].abbr})</span>
              </Link>
            ))}
            <Link
              href="/dmv-test"
              className="p-3 rounded-xl border border-[#2563EB] bg-[#EFF6FF] text-sm font-semibold text-[#2563EB] text-center col-span-2 hover:bg-[#DBEAFE] transition-colors"
            >
              {tex.dtViewAll || 'View all 50 states'}
            </Link>
          </div>
        </section>

      </main>

      <SupportFooter />

      <footer className="border-t border-[#E2E8F0] py-6 text-center text-xs text-[#94A3B8]">
        <div className="max-w-lg mx-auto px-4">
          <p>DMVSOS.com  ·  Free DMV Practice Tests for All 50 States</p>
          <p className="mt-1">
            <Link href="/terms" className="hover:text-[#2563EB]">{tex.terms || 'Terms'}</Link>
            {' · '}
            <Link href="/privacy" className="hover:text-[#2563EB]">{tex.privacy || 'Privacy'}</Link>
            {' · '}
            <Link href="/manuals" className="hover:text-[#2563EB]">{tex.navManuals || 'Driver Manuals'}</Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
