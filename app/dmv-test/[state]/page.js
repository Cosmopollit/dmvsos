import Link from 'next/link';
import { notFound } from 'next/navigation';
import { STATE_DISPLAY, STATE_SLUGS, STATE_META } from '@/lib/manual-data';

const STATE_EXAM_DATA = {
  alabama:          { questions: 40, passing: 32, passingPct: 80 },
  alaska:           { questions: 20, passing: 16, passingPct: 80 },
  arizona:          { questions: 30, passing: 24, passingPct: 80 },
  arkansas:         { questions: 25, passing: 20, passingPct: 80 },
  california:       { questions: 46, passing: 38, passingPct: 83 },
  colorado:         { questions: 25, passing: 20, passingPct: 80 },
  connecticut:      { questions: 25, passing: 20, passingPct: 80 },
  delaware:         { questions: 30, passing: 24, passingPct: 80 },
  florida:          { questions: 50, passing: 40, passingPct: 80 },
  georgia:          { questions: 40, passing: 30, passingPct: 75 },
  hawaii:           { questions: 30, passing: 24, passingPct: 80 },
  idaho:            { questions: 40, passing: 34, passingPct: 85 },
  illinois:         { questions: 35, passing: 28, passingPct: 80 },
  indiana:          { questions: 50, passing: 42, passingPct: 84 },
  iowa:             { questions: 35, passing: 28, passingPct: 80 },
  kansas:           { questions: 25, passing: 20, passingPct: 80 },
  kentucky:         { questions: 40, passing: 32, passingPct: 80 },
  louisiana:        { questions: 40, passing: 32, passingPct: 80 },
  maine:            { questions: 29, passing: 24, passingPct: 82 },
  maryland:         { questions: 25, passing: 22, passingPct: 88 },
  massachusetts:    { questions: 25, passing: 18, passingPct: 72 },
  michigan:         { questions: 50, passing: 40, passingPct: 80 },
  minnesota:        { questions: 40, passing: 32, passingPct: 80 },
  mississippi:      { questions: 30, passing: 24, passingPct: 80 },
  missouri:         { questions: 25, passing: 20, passingPct: 80 },
  montana:          { questions: 33, passing: 27, passingPct: 82 },
  nebraska:         { questions: 25, passing: 20, passingPct: 80 },
  nevada:           { questions: 50, passing: 40, passingPct: 80 },
  'new-hampshire':  { questions: 40, passing: 32, passingPct: 80 },
  'new-jersey':     { questions: 50, passing: 40, passingPct: 80 },
  'new-mexico':     { questions: 25, passing: 18, passingPct: 72 },
  'new-york':       { questions: 20, passing: 14, passingPct: 70 },
  'north-carolina': { questions: 25, passing: 20, passingPct: 80 },
  'north-dakota':   { questions: 25, passing: 20, passingPct: 80 },
  ohio:             { questions: 40, passing: 30, passingPct: 75 },
  oklahoma:         { questions: 50, passing: 40, passingPct: 80 },
  oregon:           { questions: 35, passing: 28, passingPct: 80 },
  pennsylvania:     { questions: 18, passing: 15, passingPct: 83 },
  'rhode-island':   { questions: 25, passing: 20, passingPct: 80 },
  'south-carolina': { questions: 30, passing: 24, passingPct: 80 },
  'south-dakota':   { questions: 25, passing: 20, passingPct: 80 },
  tennessee:        { questions: 30, passing: 24, passingPct: 80 },
  texas:            { questions: 30, passing: 21, passingPct: 70 },
  utah:             { questions: 50, passing: 40, passingPct: 80 },
  vermont:          { questions: 20, passing: 16, passingPct: 80 },
  virginia:         { questions: 35, passing: 30, passingPct: 86 },
  washington:       { questions: 40, passing: 32, passingPct: 80 },
  'west-virginia':  { questions: 25, passing: 19, passingPct: 76 },
  wisconsin:        { questions: 50, passing: 40, passingPct: 80 },
  wyoming:          { questions: 25, passing: 20, passingPct: 80 },
};

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

export async function generateMetadata({ params }) {
  const { state } = await params;
  const name = STATE_DISPLAY[state];
  if (!name) return {};
  const meta = STATE_META[state];
  const exam = STATE_EXAM_DATA[state] || { questions: 40 };
  const year = new Date().getFullYear();

  return {
    title: `${name} DMV Practice Test ${year}  ·  Free | DMVSOS`,
    description: `Free ${name} DMV practice test ${year}. Study ${exam.questions}+ real ${meta.abbr} knowledge test questions in 5 languages. Pass on your first try  ·  no signup required.`,
    alternates: { canonical: `https://www.dmvsos.com/dmv-test/${state}` },
    openGraph: {
      title: `${name} DMV Practice Test ${year}  ·  Free`,
      description: `Free ${name} DMV practice test. Real ${meta.abbr} knowledge test questions in English, Spanish, Russian, Chinese and Ukrainian.`,
      url: `https://www.dmvsos.com/dmv-test/${state}`,
      siteName: 'DMVSOS',
      type: 'website',
      images: [{ url: '/og-image.png', width: 1200, height: 630, alt: `${name} DMV Practice Test` }],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${name} DMV Practice Test ${year}  ·  Free`,
      description: `Free ${name} DMV practice test. Real questions, 5 languages.`,
    },
  };
}

export default async function StateDmvTestPage({ params }) {
  const { state } = await params;
  const name = STATE_DISPLAY[state];
  if (!name) notFound();

  const meta = STATE_META[state];
  const exam = STATE_EXAM_DATA[state] || { questions: 40, passing: 32, passingPct: 80 };
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
              text: `Yes. DMVSOS provides a free ${name} DMV practice test with real knowledge test questions. Paid plans from $7.99 (30-day access) unlock extended 40-question tests and detailed answer explanations.`,
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
          { '@type': 'ListItem', position: 1, name: 'Home',             item: 'https://www.dmvsos.com' },
          { '@type': 'ListItem', position: 2, name: 'DMV Tests',        item: 'https://www.dmvsos.com/dmv-test' },
          { '@type': 'ListItem', position: 3, name: `${name} DMV Test`, item: `https://www.dmvsos.com/dmv-test/${state}` },
        ],
      },
    ],
  });

  const stateIdx = STATE_SLUGS.indexOf(state);
  const otherStates = STATE_SLUGS.filter((_, i) => i !== stateIdx).slice(0, 8);

  const stats = [
    { value: '35,000+', label: 'Questions' },
    { value: '3',       label: 'Categories' },
    { value: '5',       label: 'Languages' },
    { value: '94%',     label: 'Pass Rate' },
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
      a: `Yes  ·  20 questions per test are completely free with no signup required. Paid plans from $7.99 (30-day access) unlock 40-question full tests and detailed explanations.`,
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

      {/* Header */}
      <header className="w-full max-w-lg mx-auto pt-5 pb-3 px-4">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 hover:opacity-90 transition">
            <img src="/logo.png" alt="DMVSOS" width={32} height={32} className="rounded-lg" />
            <span className="text-lg font-bold text-[#0B1C3D]" style={{ letterSpacing: '-0.02em' }}>DMVSOS</span>
          </Link>
          <Link href="/dmv-test" className="text-sm font-medium text-[#2563EB] hover:text-[#1D4ED8] transition">
            All States
          </Link>
        </div>
      </header>

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
                <span className="opacity-70 text-xs">Start Free →</span>
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
                <span className="text-xs font-semibold text-[#2563EB] shrink-0">Start →</span>
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
            View Manual →
          </Link>
        </div>

        {/* Pro upgrade */}
        <div className="bg-gradient-to-r from-[#0B1C3D] to-[#1E3A5F] rounded-2xl p-6 mb-8 text-center shadow-lg border border-[#1e3a5f]">
          <div className="text-[#F59E0B] font-black text-xs mb-2 uppercase tracking-widest">✨ Unlock Full Access</div>
          <p className="text-white font-bold text-base mb-1">Most people fail because they practice with outdated questions</p>
          <p className="text-[#94A3B8] text-sm mb-4">Full 40-question tests · Detailed explanations · All categories</p>
          <div className="flex items-center justify-center gap-2 mb-3">
            <span className="text-xs font-semibold text-[#10B981] bg-[#10B981]/10 px-3 py-1 rounded-full border border-[#10B981]/30">
              🛡️ Pass or your money back
            </span>
          </div>
          <Link
            href="/upgrade"
            className="inline-flex items-center gap-2 px-6 py-3 bg-[#F59E0B] text-[#0B1C3D] rounded-xl font-bold text-sm hover:bg-[#FBBF24] transition-colors"
          >
            Unlock Full Access  ·  from $7.99
          </Link>
          <p className="text-xs text-[#64748B] mt-2">One payment · No subscription · No auto-renewal</p>
        </div>

        {/* Other states */}
        <section>
          <h2 className="text-sm font-bold text-[#0B1C3D] mb-3">Practice tests for other states</h2>
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
              View all 50 states →
            </Link>
          </div>
        </section>

      </main>

      <footer className="border-t border-[#E2E8F0] py-8 text-center text-xs text-[#94A3B8]">
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
