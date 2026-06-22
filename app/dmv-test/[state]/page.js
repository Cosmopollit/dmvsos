import Link from 'next/link';
import { notFound } from 'next/navigation';
import { STATE_DISPLAY, STATE_SLUGS, STATE_META } from '@/lib/manual-data';
import { MIN_PRICE } from '@/lib/plans';
import { examRulesFor, passPercentFor } from '@/lib/exam-rules';
import { neighborsOf } from '@/lib/state-neighbors';
import { citiesOf } from '@/lib/state-cities';
import { stateMeta, localizedAlternates, APP_LANG_TO_OG_LOCALE, APP_LANG_TO_HTML_LANG } from '@/lib/i18n-meta';
import SiteHeader from '@/app/components/SiteHeader';
import SupportFooter from '@/app/components/SupportFooter';

const SUPPORTED_LANGS = ['en', 'ru', 'es', 'zh', 'ua'];
function resolveLang(raw) {
  return SUPPORTED_LANGS.includes(raw) ? raw : 'en';
}

// Exam facts come from the single source of truth (lib/exam-rules.js),
// not a local table, so counts + pass scores never drift or go stale.
function examFor(state) {
  const rule = examRulesFor(state, 'car');
  if (!rule) return { questions: 40, passing: 32, passingPct: 80 };
  return { questions: rule.questions, passing: rule.pass, passingPct: passPercentFor(state, 'car') };
}

const LANG_OPTIONS = [
  { code: 'en', label: 'English',    emoji: '🇺🇸' },
  { code: 'ru', label: 'Русский',    emoji: '🇷🇺' },
  { code: 'es', label: 'Español',    emoji: '🇪🇸' },
  { code: 'zh', label: '中文',        emoji: '🇨🇳' },
  { code: 'ua', label: 'Українська', emoji: '🇺🇦' },
];

export function generateStaticParams() {
  return STATE_SLUGS.map(state => ({ state }));
}

export async function generateMetadata({ params, searchParams }) {
  const { state } = await params;
  const sp = (await searchParams) || {};
  const lang = resolveLang(Array.isArray(sp.lang) ? sp.lang[0] : sp.lang);
  const name = STATE_DISPLAY[state];
  if (!name) return {};
  const meta = STATE_META[state];
  const exam = examFor(state);
  const year = new Date().getFullYear();
  const vars = { name, abbr: meta.abbr, agency: meta.dmvAbbr, questions: exam.questions, year };
  const m = stateMeta(lang, vars);
  const alts = localizedAlternates(`/dmv-test/${state}`, lang);

  return {
    title: m.title,
    description: m.description,
    alternates: alts,
    openGraph: {
      title: m.title,
      description: m.description,
      url: alts.canonical,
      siteName: 'DMVSOS',
      type: 'website',
      locale: APP_LANG_TO_OG_LOCALE[lang],
      alternateLocale: Object.values(APP_LANG_TO_OG_LOCALE).filter(l => l !== APP_LANG_TO_OG_LOCALE[lang]),
      images: [{ url: '/og-image.png', width: 1200, height: 630, alt: m.title }],
    },
    twitter: {
      card: 'summary_large_image',
      title: m.title,
      description: m.description,
    },
    other: {
      'content-language': APP_LANG_TO_HTML_LANG[lang],
    },
  };
}

export default async function StateDmvTestPage({ params }) {
  const { state } = await params;
  const name = STATE_DISPLAY[state];
  if (!name) notFound();

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
  });

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

  const stats = [
    { value: '25,000+', label: 'Questions' },
    { value: '3',       label: 'Categories' },
    { value: '5',       label: 'Languages' },
    { value: `${exam.passingPct}%`, label: 'Score to pass' },
  ];

  const whatToExpect = [
    { icon: '📋', label: 'Questions',      value: `${exam.questions} multiple-choice questions` },
    { icon: '✅', label: 'Passing score',  value: `${exam.passing} correct (${exam.passingPct}%)` },
    { icon: '🏛️', label: 'Administered by', value: meta.agency },
    { icon: '🌐', label: 'Languages',      value: 'English, Spanish, Russian, Chinese, Ukrainian' },
    { icon: '🔄', label: 'Retakes',         value: 'Allowed after a waiting period if you fail' },
  ];

  const categories = [
    { cat: 'dmv',  emoji: '🚗', title: 'Car (DMV)',  desc: "Regular driver's license for cars, SUVs and pickups", bg: '#EFF6FF' },
    { cat: 'cdl',  emoji: '🚛', title: 'CDL',        desc: "Commercial Driver's License for trucks and buses",   bg: '#F0F9FF' },
    { cat: 'moto', emoji: '🏍️', title: 'Motorcycle', desc: 'Motorcycle and scooter permit test',                  bg: '#FFF7ED' },
  ];

  const faqs = [
    {
      q: `How many questions are on the ${name} DMV knowledge test?`,
      a: `The ${name} DMV written test has ${exam.questions} questions. You need ${exam.passing} correct answers (${exam.passingPct}%) to pass.`,
    },
    {
      q: `What is the passing score for the ${meta.abbr} DMV test?`,
      a: `You must score ${exam.passingPct}% or higher  ·  that means getting ${exam.passing} out of ${exam.questions} questions right.`,
    },
    {
      q: `Can I take the ${name} DMV practice test in Spanish?`,
      a: `Yes. DMVSOS offers free ${name} DMV practice tests in English, Spanish, Russian, Chinese (Mandarin), and Ukrainian. Just choose your language when you start.`,
    },
    {
      q: `Is this ${name} DMV practice test free?`,
      a: `Yes  ·  20 questions per test are completely free with no signup required. One-time passes from ${MIN_PRICE} unlock 40-question full tests and detailed explanations · 30 days, no subscription.`,
    },
    {
      q: `What topics does the ${name} DMV test cover?`,
      a: `The ${meta.abbr} DMV written test covers traffic laws, road signs, right-of-way rules, speed limits, DUI/DWI penalties, safe driving practices, and road markings. DMVSOS questions are aligned with the official ${name} driver's handbook.`,
    },
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
            <li><Link href="/" className="hover:text-[#2563EB]">Home</Link></li>
            <li>/</li>
            <li><Link href="/dmv-test" className="hover:text-[#2563EB]">DMV Tests</Link></li>
            <li>/</li>
            <li className="text-[#1A2B4A] font-medium">{name}</li>
          </ol>
        </nav>

        {/* H1 */}
        <h1 className="text-3xl sm:text-4xl font-black text-[#0B1C3D] mb-3 leading-tight" style={{ letterSpacing: '-0.02em' }}>
          {name} DMV Practice Test {year}  ·  Free
        </h1>
        <p className="text-base text-[#64748B] mb-6 leading-relaxed">
          Practice with real {meta.abbr} knowledge test questions and pass on your first try.
          Study in your language  ·  available in English, Spanish, Russian, Chinese, and Ukrainian.
        </p>

        {/* Language CTA card */}
        <div className="bg-[#0B1C3D] rounded-2xl p-6 mb-6 shadow-lg">
          <p className="text-[#94A3B8] text-xs font-semibold mb-4 uppercase tracking-widest">
            Choose your language and start:
          </p>
          <div className="grid grid-cols-1 gap-2.5">
            {LANG_OPTIONS.map(({ code, label, emoji }) => (
              <Link
                key={code}
                href={`/category?state=${state}&lang=${code}`}
                className="flex items-center justify-between px-5 py-3 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-xl font-semibold text-sm transition-colors"
              >
                <span>{emoji} {label}</span>
                <span className="opacity-70 text-xs">Start Free</span>
              </Link>
            ))}
          </div>
          <p className="text-xs text-[#64748B] mt-4 text-center">
            No signup required · 20 free questions per test
          </p>
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
            What to expect on the {meta.abbr} DMV knowledge test
          </h2>
          <ul className="space-y-3">
            {whatToExpect.map(({ icon, label, value }) => (
              <li key={label} className="flex items-start gap-3">
                <span className="text-base mt-0.5 shrink-0">{icon}</span>
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
            Available {name} practice test types
          </h2>
          <div className="space-y-3">
            {categories.map(({ cat, emoji, title, desc, bg }) => (
              <Link
                key={cat}
                href={`/category?state=${state}&lang=en`}
                className="flex items-center gap-4 p-4 rounded-xl border border-[#E2E8F0] hover:border-[#2563EB] hover:shadow-sm transition-all"
                style={{ background: bg }}
              >
                <span className="text-3xl shrink-0">{emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm text-[#0B1C3D]">{title}</div>
                  <div className="text-xs text-[#64748B] mt-0.5 leading-relaxed">{desc}</div>
                </div>
                <span className="text-xs font-semibold text-[#2563EB] shrink-0">Start</span>
              </Link>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section className="mb-8">
          <h2 className="text-lg font-bold text-[#0B1C3D] mb-4">
            {name} DMV Test  ·  Frequently Asked Questions
          </h2>
          <div className="space-y-3">
            {faqs.map(({ q, a }) => (
              <details key={q} className="bg-white rounded-2xl border border-[#E2E8F0] p-5 shadow-sm group">
                <summary className="font-semibold text-sm text-[#0B1C3D] cursor-pointer list-none flex justify-between items-center gap-3">
                  <span>{q}</span>
                  <span className="text-[#2563EB] shrink-0 transition-transform group-open:rotate-180">▾</span>
                </summary>
                <p className="mt-3 text-sm text-[#64748B] leading-relaxed">{a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* Manual link */}
        <div className="bg-white rounded-2xl border border-[#E2E8F0] p-5 mb-5 shadow-sm flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-[#0B1C3D]">Official {name} Driver Handbook</p>
            <p className="text-xs text-[#94A3B8] mt-0.5">Read or download the free PDF manual</p>
          </div>
          <Link
            href={`/manuals/${state}`}
            className="shrink-0 px-4 py-2 bg-[#EFF6FF] text-[#2563EB] rounded-xl text-sm font-semibold hover:bg-[#DBEAFE] transition-colors"
          >
            View Manual
          </Link>
        </div>

        {/* Pro upgrade */}
        <div className="bg-gradient-to-r from-[#0B1C3D] to-[#1E3A5F] rounded-2xl p-6 mb-8 text-center shadow-lg border border-[#1e3a5f]">
          <div className="text-[#F59E0B] font-black text-xs mb-2 uppercase tracking-widest">✨ Unlock Full Access</div>
          <p className="text-white font-bold text-base mb-1">Practice with current, verified questions and walk in ready</p>
          <p className="text-[#94A3B8] text-sm mb-4">Full 40-question tests · Detailed explanations · All categories</p>
          <div className="flex items-center justify-center gap-2 mb-3">
            <span className="text-xs font-semibold text-[#10B981] bg-[#10B981]/10 px-3 py-1 rounded-full border border-[#10B981]/30">
              Free to start · no signup
            </span>
          </div>
          <Link
            href="/upgrade"
            className="inline-flex items-center gap-2 px-6 py-3 bg-[#F59E0B] text-[#0B1C3D] rounded-xl font-bold text-sm hover:bg-[#FBBF24] transition-colors"
          >
            Unlock Full Access  ·  from {MIN_PRICE}
          </Link>
          <p className="text-xs text-[#64748B] mt-2">One-time payment · 30 days · No subscription</p>
        </div>

        {/* Languages section — mirrors real search intent. The product's
            unique edge: native-language practice for the {state} {agency}
            test. Spelled out so Google indexes "free Florida DMV test in
            Russian / Spanish / Chinese / Ukrainian" long-tail combos. */}
        <section className="bg-white rounded-2xl border border-[#E2E8F0] p-6 mb-5 shadow-sm">
          <h2 className="text-base font-bold text-[#0B1C3D] mb-3">
            Free {name} {meta.dmvAbbr} practice test in your language
          </h2>
          <p className="text-sm text-[#64748B] mb-4 leading-relaxed">
            DMVSOS is the only free {name} {meta.dmvAbbr} practice test pulled directly from the official driver
            handbook and translated into five languages. Same {exam.questions}-question format you will see at the
            {' '}{meta.dmvAbbr} window — practice and walk in ready.
          </p>
          <ul className="space-y-2 mb-4">
            <li className="text-sm text-[#1A2B4A]"><strong>🇺🇸 English</strong> — official source text, all {exam.questions} {name} knowledge-test topics covered</li>
            <li className="text-sm text-[#1A2B4A]"><strong>🇪🇸 Español</strong> — examen de manejo de {name} gratis, traducido por hablantes nativos</li>
            <li className="text-sm text-[#1A2B4A]"><strong>🇷🇺 Русский</strong> — бесплатный тест {meta.dmvAbbr} {name} на русском, реальные вопросы</li>
            <li className="text-sm text-[#1A2B4A]"><strong>🇨🇳 中文</strong> — {name} {meta.dmvAbbr} 笔试免费练习，中英对照</li>
            <li className="text-sm text-[#1A2B4A]"><strong>🇺🇦 Українська</strong> — безкоштовний тест {meta.dmvAbbr} {name} українською</li>
          </ul>
          {cities.length > 0 && (
            <p className="text-xs text-[#64748B] leading-relaxed border-t border-[#F1F5F9] pt-4">
              Questions are statewide — the same exam runs whether you test in {cities.slice(0, 6).join(', ')}
              {cities.length > 6 ? `, or any other ${name} ${meta.dmvAbbr} location` : ''}.
            </p>
          )}
        </section>

        {/* Geographically-relevant nearby states first, then top-traffic states
            as filler so the section is never thin. Internal linking signal. */}
        <section>
          <h2 className="text-sm font-bold text-[#0B1C3D] mb-3">
            {neighborStates.length > 0 ? `Practice tests near ${name}` : 'Popular state practice tests'}
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
              View all 50 states
            </Link>
          </div>
        </section>

      </main>

      <SupportFooter />

      <footer className="border-t border-[#E2E8F0] py-6 text-center text-xs text-[#94A3B8]">
        <div className="max-w-lg mx-auto px-4">
          <p>DMVSOS.com  ·  Free DMV Practice Tests for All 50 States</p>
          <p className="mt-1">
            <Link href="/terms" className="hover:text-[#2563EB]">Terms</Link>
            {' · '}
            <Link href="/privacy" className="hover:text-[#2563EB]">Privacy</Link>
            {' · '}
            <Link href="/manuals" className="hover:text-[#2563EB]">Driver Manuals</Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
