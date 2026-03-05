import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { t } from '@/lib/translations';
import { STATE_DISPLAY, STATE_SLUGS, STATE_META, LANG_NAMES } from '@/lib/manual-data';
import { parseManual } from '@/lib/manual-parser';
import ManualContent from '../ManualContent';

const SUPABASE_URL = 'https://yaogndpgnewqffbjrsgz.supabase.co';
const INDEX_URL = `${SUPABASE_URL}/storage/v1/object/public/manuals/manuals-index.json`;

const VALID_CATS = ['car', 'cdl', 'motorcycle'];

const CAT_META = {
  car: {
    label: "Driver's Handbook",
    labelFull: "Driver's Handbook / DMV Manual",
    icon: '🚗',
    testLabel: 'DMV Written Test',
    testCat: 'dmv',
    descSuffix: 'car license written knowledge test',
    faqQuestions: (name, abbr) => [
      {
        q: `How many questions are on the ${name} DMV written test?`,
        a: `The ${name} (${abbr}) DMV written knowledge test typically consists of 20–50 multiple-choice questions. The exact number varies — check the official ${STATE_META[name]?.agency || `${name} DMV`} website for the current format.`,
      },
      {
        q: `What topics are covered in the ${name} driver's handbook?`,
        a: `The ${name} driver's handbook covers traffic laws and regulations, road signs and signals, safe driving practices, right-of-way rules, speed limits, DUI/DWI laws, and vehicle operation requirements specific to ${name}.`,
      },
      {
        q: `Is the ${name} driver's handbook available in Spanish?`,
        a: `Many states provide their driver's handbook in multiple languages. Download links for all available languages — including Spanish, Russian, Chinese, and more — are listed above on this page.`,
      },
      {
        q: `How do I pass the ${name} DMV written test?`,
        a: `Study the official ${name} driver's handbook thoroughly, then take free practice tests at DMVSOS.com to reinforce what you've learned. Most test-takers who study the full handbook and complete several practice tests pass on their first attempt.`,
      },
    ],
  },
  cdl: {
    label: 'CDL Manual',
    labelFull: 'Commercial Driver License Manual',
    icon: '🚛',
    testLabel: 'CDL Knowledge Test',
    testCat: 'cdl',
    descSuffix: 'commercial driver license (CDL) knowledge test',
    faqQuestions: (name, abbr) => [
      {
        q: `What is covered in the ${name} CDL manual?`,
        a: `The ${name} CDL manual covers general knowledge (traffic laws, safe driving), vehicle inspection, basic vehicle control, shifting/backing, pre-trip inspections, hazardous materials, passenger transport, air brakes, and combination vehicles — following FMCSA federal guidelines.`,
      },
      {
        q: `How many questions are on the ${name} CDL general knowledge test?`,
        a: `The CDL general knowledge test in ${name} (${abbr}) typically has 50 questions. You must score at least 80% to pass. Endorsement tests (HazMat, Tanker, Passenger, etc.) are separate and have 20–30 questions each.`,
      },
      {
        q: `Do I need a CDL to drive a commercial vehicle in ${name}?`,
        a: `Yes. A Commercial Driver License (CDL) is required in ${name} to operate vehicles with a GVWR over 26,000 lbs, vehicles carrying 16+ passengers, or any vehicle transporting hazardous materials requiring placards.`,
      },
      {
        q: `Is the ${name} CDL manual the same as the federal CDL manual?`,
        a: `The ${name} CDL manual is based on the federal FMCSA Commercial Driver's License Standards but may include state-specific regulations. Always study the ${name}-specific version for your test.`,
      },
    ],
  },
  motorcycle: {
    label: 'Motorcycle Handbook',
    labelFull: 'Motorcycle Rider Handbook',
    icon: '🏍️',
    testLabel: 'Motorcycle Knowledge Test',
    testCat: 'moto',
    descSuffix: 'motorcycle license written knowledge test',
    faqQuestions: (name, abbr) => [
      {
        q: `What is covered in the ${name} motorcycle handbook?`,
        a: `The ${name} motorcycle handbook covers motorcycle controls and equipment, riding techniques, defensive riding strategies, intersections and turning, carrying passengers and cargo, special riding conditions (rain, night, highways), and ${name}-specific traffic laws for motorcyclists.`,
      },
      {
        q: `Do I need a separate license to ride a motorcycle in ${name}?`,
        a: `Yes. ${name} requires a motorcycle endorsement (M) or separate motorcycle license to legally ride on public roads. You must pass both a written knowledge test and a skills test (or complete an approved safety course).`,
      },
      {
        q: `How many questions are on the ${name} motorcycle written test?`,
        a: `The ${name} (${abbr}) motorcycle knowledge test typically has 25–30 multiple-choice questions covering motorcycle laws and safe riding practices. A passing score is usually 80% or higher.`,
      },
      {
        q: `Can I take a motorcycle safety course instead of the written test in ${name}?`,
        a: `Many states allow you to waive the written and/or skills test by completing an approved MSF (Motorcycle Safety Foundation) Basic RiderCourse. Check with the ${name} DMV for current requirements.`,
      },
    ],
  },
};

const LANG_FLAGS = {
  en: '🇺🇸', es: '🇪🇸', ru: '🇷🇺', zh: '🇨🇳', ua: '🇺🇦',
  vi: '🇻🇳', ko: '🇰🇷', ar: '🇸🇦', fr: '🇫🇷', de: '🇩🇪',
  hy: '🇦🇲', hi: '🇮🇳', pa: '🇮🇳', ht: '🇭🇹', so: '🇸🇴',
  sw: '🇰🇪', my: '🇲🇲', ne: '🇳🇵', pt: '🇧🇷', ja: '🇯🇵', hmn: '🌿',
  tl: '🇵🇭', sm: '🇼🇸', to: '🇹🇴', haw: '🌺', mh: '🇲🇭', ilo: '🇵🇭', chk: '🇫🇲',
};

const LANG_LABELS = {
  en: 'English', es: 'Español', zh: '中文', ru: 'Русский', ua: 'Українська',
  vi: 'Tiếng Việt', hy: 'Հայերեն', hi: 'हिन्दी', pa: 'ਪੰਜਾਬੀ', ht: 'Kreyòl',
  ko: '한국어', ar: 'العربية', fr: 'Français', de: 'Deutsch', so: 'Soomaali',
  sw: 'Kiswahili', my: 'မြန်မာ', ne: 'नेपाली', pt: 'Português', ja: '日本語', hmn: 'Hmong',
  tl: 'Filipino', sm: 'Samoa', to: 'Faka-Tonga', haw: 'ʻŌlelo Hawaiʻi', mh: 'Kajin M̧ajeļ', ilo: 'Ilocano', chk: 'Chuukese',
};

// Geographic neighbors for "other states" section
const STATE_NEIGHBORS = {
  alabama: ['georgia', 'florida', 'mississippi', 'tennessee'],
  alaska: ['washington', 'oregon', 'idaho', 'montana'],
  arizona: ['california', 'nevada', 'utah', 'new-mexico'],
  arkansas: ['texas', 'louisiana', 'mississippi', 'tennessee'],
  california: ['oregon', 'nevada', 'arizona', 'washington'],
  colorado: ['utah', 'wyoming', 'nebraska', 'kansas'],
  connecticut: ['new-york', 'massachusetts', 'rhode-island', 'new-jersey'],
  delaware: ['maryland', 'new-jersey', 'pennsylvania', 'virginia'],
  florida: ['georgia', 'alabama', 'south-carolina', 'tennessee'],
  georgia: ['florida', 'south-carolina', 'north-carolina', 'tennessee'],
  hawaii: ['california', 'alaska', 'washington', 'oregon'],
  idaho: ['washington', 'oregon', 'montana', 'wyoming'],
  illinois: ['indiana', 'wisconsin', 'iowa', 'missouri'],
  indiana: ['illinois', 'ohio', 'michigan', 'kentucky'],
  iowa: ['illinois', 'wisconsin', 'minnesota', 'missouri'],
  kansas: ['colorado', 'nebraska', 'oklahoma', 'missouri'],
  kentucky: ['tennessee', 'indiana', 'ohio', 'virginia'],
  louisiana: ['texas', 'arkansas', 'mississippi', 'alabama'],
  maine: ['new-hampshire', 'vermont', 'massachusetts', 'new-york'],
  maryland: ['virginia', 'delaware', 'pennsylvania', 'west-virginia'],
  massachusetts: ['connecticut', 'rhode-island', 'new-york', 'new-hampshire'],
  michigan: ['indiana', 'ohio', 'illinois', 'wisconsin'],
  minnesota: ['wisconsin', 'iowa', 'north-dakota', 'south-dakota'],
  mississippi: ['alabama', 'louisiana', 'tennessee', 'arkansas'],
  missouri: ['illinois', 'iowa', 'kansas', 'tennessee'],
  montana: ['idaho', 'wyoming', 'north-dakota', 'south-dakota'],
  nebraska: ['kansas', 'colorado', 'iowa', 'south-dakota'],
  nevada: ['california', 'arizona', 'utah', 'oregon'],
  'new-hampshire': ['maine', 'vermont', 'massachusetts', 'connecticut'],
  'new-jersey': ['new-york', 'pennsylvania', 'delaware', 'connecticut'],
  'new-mexico': ['arizona', 'colorado', 'utah', 'texas'],
  'new-york': ['new-jersey', 'connecticut', 'pennsylvania', 'massachusetts'],
  'north-carolina': ['south-carolina', 'virginia', 'georgia', 'tennessee'],
  'north-dakota': ['minnesota', 'south-dakota', 'montana', 'wyoming'],
  ohio: ['indiana', 'michigan', 'pennsylvania', 'kentucky'],
  oklahoma: ['texas', 'kansas', 'colorado', 'arkansas'],
  oregon: ['california', 'washington', 'idaho', 'nevada'],
  pennsylvania: ['new-york', 'new-jersey', 'ohio', 'maryland'],
  'rhode-island': ['connecticut', 'massachusetts', 'new-york', 'new-jersey'],
  'south-carolina': ['georgia', 'north-carolina', 'florida', 'virginia'],
  'south-dakota': ['north-dakota', 'minnesota', 'nebraska', 'wyoming'],
  tennessee: ['kentucky', 'virginia', 'north-carolina', 'georgia'],
  texas: ['oklahoma', 'new-mexico', 'louisiana', 'arkansas'],
  utah: ['nevada', 'arizona', 'colorado', 'idaho'],
  vermont: ['new-hampshire', 'new-york', 'massachusetts', 'maine'],
  virginia: ['maryland', 'north-carolina', 'west-virginia', 'tennessee'],
  washington: ['oregon', 'idaho', 'california', 'nevada'],
  'west-virginia': ['virginia', 'maryland', 'pennsylvania', 'ohio'],
  wisconsin: ['minnesota', 'iowa', 'illinois', 'michigan'],
  wyoming: ['montana', 'idaho', 'utah', 'colorado'],
};

export function generateStaticParams() {
  const params = [];
  for (const state of STATE_SLUGS) {
    for (const cat of VALID_CATS) {
      params.push({ state, cat });
    }
  }
  return params;
}

export async function generateMetadata({ params }) {
  const { state, cat } = await params;
  const name = STATE_DISPLAY[state];
  if (!name || !VALID_CATS.includes(cat)) return {};
  const meta = STATE_META[state];
  const year = new Date().getFullYear();
  const catInfo = CAT_META[cat];

  const title = `${name} ${catInfo.label} ${year} — Free PDF | DMVSOS`;
  const description = `Download the official ${name} ${catInfo.labelFull} (${year}) as a free PDF or read online. Study for the ${meta.abbr} ${catInfo.testLabel} — available in multiple languages.`;

  return {
    title,
    description,
    alternates: { canonical: `https://www.dmvsos.com/manuals/${state}/${cat}` },
    openGraph: {
      title: `${name} ${catInfo.label} ${year} — Free PDF`,
      description,
      url: `https://www.dmvsos.com/manuals/${state}/${cat}`,
      siteName: 'DMVSOS',
      type: 'article',
    },
  };
}

async function fetchManualIndex() {
  try {
    const res = await fetch(INDEX_URL, { next: { revalidate: 86400 } });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function StateManualCategoryPage({ params }) {
  const { state, cat } = await params;

  const name = STATE_DISPLAY[state];
  if (!name || !VALID_CATS.includes(cat)) notFound();

  const meta = STATE_META[state];
  const year = new Date().getFullYear();
  const catInfo = CAT_META[cat];

  const cookieStore = await cookies();
  const lang = cookieStore.get('dmvsos_lang')?.value || 'en';
  const tex = t[lang] || t.en;

  // Fetch PDFs for this specific category
  const index = await fetchManualIndex();
  const catLangs = index?.[state]?.[cat];
  const pdfs = catLangs
    ? Object.entries(catLangs).map(([langCode, url]) => ({ langCode, url }))
    : [];

  // Online manual content (currently only car is parsed from text)
  const manual = cat === 'car' ? parseManual(state, 'car') : parseManual(state, cat);

  // If no PDFs and no manual content — redirect to state page rather than show empty page
  // (still render page, just with limited content for SEO)

  // Other categories for this state
  const otherCats = VALID_CATS.filter(c => c !== cat);

  // Neighbor states (geographic)
  const neighbors = STATE_NEIGHBORS[state] || STATE_SLUGS.filter(s => s !== state).slice(0, 4);

  // FAQ for structured data
  const faqs = catInfo.faqQuestions(name, meta.abbr);

  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article',
        headline: `${name} ${catInfo.label} ${year}`,
        description: `Official ${name} ${catInfo.labelFull} for the ${meta.abbr} ${catInfo.testLabel}.`,
        author: { '@type': 'Organization', name: meta.agency },
        publisher: { '@type': 'Organization', name: 'DMVSOS', url: 'https://www.dmvsos.com' },
        url: `https://www.dmvsos.com/manuals/${state}/${cat}`,
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home',    item: 'https://www.dmvsos.com' },
          { '@type': 'ListItem', position: 2, name: 'Manuals', item: 'https://www.dmvsos.com/manuals' },
          { '@type': 'ListItem', position: 3, name,            item: `https://www.dmvsos.com/manuals/${state}` },
          { '@type': 'ListItem', position: 4, name: catInfo.label, item: `https://www.dmvsos.com/manuals/${state}/${cat}` },
        ],
      },
      {
        '@type': 'FAQPage',
        mainEntity: faqs.map(({ q, a }) => ({
          '@type': 'Question',
          name: q,
          acceptedAnswer: { '@type': 'Answer', text: a },
        })),
      },
      ...(pdfs.length > 0 ? [{
        '@type': 'GovernmentService',
        name: `${name} ${catInfo.labelFull}`,
        serviceType: 'Driver Education',
        provider: { '@type': 'GovernmentOrganization', name: meta.agency },
        areaServed: { '@type': 'State', name },
      }] : []),
    ],
  });

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
      <header className="w-full max-w-lg mx-auto pt-5 pb-4 px-4">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 hover:opacity-90 transition">
            <img src="/logo.png" alt="DMVSOS" width={32} height={32} className="rounded-lg" />
            <span className="text-lg font-bold text-[#0B1C3D]" style={{ letterSpacing: '-0.02em' }}>DMVSOS</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/manuals" className="text-xs font-medium text-[#64748B] hover:text-[#2563EB] transition">
              All Manuals
            </Link>
            <Link
              href={`/category?state=${state}&lang=${lang}`}
              className="text-xs font-semibold text-[#2563EB] hover:text-[#1D4ED8] transition"
            >
              Free Test →
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 pb-16">

        {/* Breadcrumb */}
        <nav className="text-xs text-[#94A3B8] mb-5 mt-1" aria-label="Breadcrumb">
          <ol className="flex items-center gap-1.5 flex-wrap">
            <li><Link href="/" className="hover:text-[#2563EB]">Home</Link></li>
            <li>/</li>
            <li><Link href="/manuals" className="hover:text-[#2563EB]">Manuals</Link></li>
            <li>/</li>
            <li><Link href={`/manuals/${state}`} className="hover:text-[#2563EB]">{name}</Link></li>
            <li>/</li>
            <li className="text-[#1A2B4A] font-medium">{catInfo.icon} {catInfo.label}</li>
          </ol>
        </nav>

        {/* H1 */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-2xl">{catInfo.icon}</span>
            <span className="text-xs font-bold text-[#2563EB] bg-[#EFF6FF] border border-[#BFDBFE] rounded-full px-3 py-1 uppercase tracking-widest">
              Official {year} Handbook
            </span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-[#0B1C3D] mb-2 leading-tight" style={{ letterSpacing: '-0.02em' }}>
            {name} {catInfo.label} {year}
          </h1>
          <p className="text-sm text-[#64748B]">
            Official {catInfo.labelFull} published by {meta.agency}.{' '}
            {pdfs.length > 0
              ? `Available in ${pdfs.length} language${pdfs.length > 1 ? 's' : ''}.`
              : 'Download links below or read online.'}
          </p>
        </div>

        {/* PDF Downloads */}
        {pdfs.length > 0 ? (
          <div className="bg-white rounded-2xl border border-[#E2E8F0] p-5 mb-5 shadow-sm">
            <h2 className="text-base font-bold text-[#0B1C3D] mb-1">
              📥 Download {name} {catInfo.label} PDF
            </h2>
            <p className="text-xs text-[#94A3B8] mb-4">Free official PDF — select your language</p>
            <div className="flex flex-wrap gap-2">
              {pdfs.map(({ langCode, url }) => (
                <a
                  key={langCode}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] hover:border-[#2563EB] hover:bg-[#EFF6FF] hover:text-[#2563EB] transition-all text-xs font-medium text-[#475569]"
                >
                  <span className="text-base leading-none">{LANG_FLAGS[langCode] || '📄'}</span>
                  <span>{LANG_LABELS[langCode] || langCode.toUpperCase()}</span>
                  <span className="text-[#94A3B8]">↓</span>
                </a>
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-[#FFFBEB] border border-[#FDE68A] rounded-2xl p-5 mb-5">
            <p className="text-sm font-medium text-[#92400E] mb-1">PDF not yet in our library</p>
            <p className="text-xs text-[#B45309]">
              Visit the{' '}
              <a
                href={`https://www.google.com/search?q=${encodeURIComponent(`${name} ${catInfo.labelFull} PDF official`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                official {name} DMV website
              </a>{' '}
              to download the latest {catInfo.label} directly.
            </p>
          </div>
        )}

        {/* Practice Test CTA */}
        <div className="bg-[#0B1C3D] rounded-2xl p-6 mb-5 text-center shadow-lg border border-[#1e3a5f]">
          <p className="text-xs font-semibold text-[#60A5FA] uppercase tracking-widest mb-2">
            Ready to test your knowledge?
          </p>
          <h2 className="text-base font-bold text-white mb-1">
            {name} {catInfo.testLabel} Practice
          </h2>
          <p className="text-sm text-[#94A3B8] mb-4">
            Real questions based on the official {name} {catInfo.label}. Free — no signup needed.
          </p>
          <Link
            href={`/test?state=${state}&category=${catInfo.testCat}&lang=${lang}`}
            className="inline-flex items-center gap-2 px-6 py-3 bg-[#2563EB] text-white rounded-xl font-semibold hover:bg-[#1D4ED8] transition-colors text-sm"
          >
            Take Free {catInfo.testLabel} →
          </Link>
        </div>

        {/* Online manual content (car only for now) */}
        {manual && (
          <div className="mb-6">
            <h2 className="text-lg font-bold text-[#0B1C3D] mb-4">
              📖 Read {name} {catInfo.label} Online
            </h2>
            <ManualContent sections={manual.sections} lang={lang} />
          </div>
        )}

        {/* FAQ */}
        <div className="mb-8">
          <h2 className="text-lg font-bold text-[#0B1C3D] mb-4">
            Frequently Asked Questions
          </h2>
          <div className="space-y-3">
            {faqs.map(({ q, a }) => (
              <div key={q} className="bg-white rounded-2xl border border-[#E2E8F0] p-5 shadow-sm">
                <p className="text-sm font-bold text-[#0B1C3D] mb-2">{q}</p>
                <p className="text-sm text-[#475569] leading-relaxed">{a}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Other categories for this state */}
        <div className="mb-8">
          <h2 className="text-sm font-bold text-[#0B1C3D] mb-3">
            Other {name} Manuals
          </h2>
          <div className="grid grid-cols-2 gap-2">
            {otherCats.map(c => (
              <Link
                key={c}
                href={`/manuals/${state}/${c}`}
                className="p-3 rounded-xl border border-[#E2E8F0] bg-white hover:border-[#2563EB] hover:shadow-sm transition-all text-sm font-medium text-[#1A2B4A] hover:text-[#2563EB] flex items-center gap-2"
              >
                <span>{CAT_META[c].icon}</span>
                <span>{CAT_META[c].label}</span>
              </Link>
            ))}
            <Link
              href={`/manuals/${state}`}
              className="p-3 rounded-xl border border-[#E2E8F0] bg-white hover:border-[#2563EB] hover:shadow-sm transition-all text-sm font-medium text-[#1A2B4A] hover:text-[#2563EB] text-center"
            >
              All {name} Manuals
            </Link>
          </div>
        </div>

        {/* Nearby states — same category */}
        <div className="mb-8">
          <h2 className="text-sm font-bold text-[#0B1C3D] mb-3">
            {catInfo.icon} {catInfo.label} in Nearby States
          </h2>
          <div className="grid grid-cols-2 gap-2">
            {neighbors.slice(0, 4).map(s => (
              <Link
                key={s}
                href={`/manuals/${s}/${cat}`}
                className="p-3 rounded-xl border border-[#E2E8F0] bg-white hover:border-[#2563EB] hover:shadow-sm transition-all text-sm font-medium text-[#1A2B4A] hover:text-[#2563EB]"
              >
                {STATE_DISPLAY[s]}{' '}
                <span className="text-[#94A3B8] text-xs">({STATE_META[s].abbr})</span>
              </Link>
            ))}
            <Link
              href="/manuals"
              className="p-3 rounded-xl border border-[#2563EB] bg-[#EFF6FF] text-sm font-semibold text-[#2563EB] text-center col-span-2 hover:bg-[#DBEAFE] transition-colors"
            >
              All 50 States →
            </Link>
          </div>
        </div>

      </main>

      <footer className="border-t border-[#E2E8F0] py-8 text-center text-xs text-[#94A3B8]">
        <div className="max-w-lg mx-auto px-4">
          DMVSOS.com — Free DMV Practice Tests &amp; Driver Manuals for All 50 States
        </div>
      </footer>
    </div>
  );
}
