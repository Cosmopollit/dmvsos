import Link from 'next/link';
import Image from 'next/image';
import { t } from '@/lib/translations';
import { STATE_DISPLAY, STATE_SLUGS, STATE_META } from '@/lib/manual-data';
import { agencyAbbrForState } from '@/lib/agencies';
import ManualLangSwitch from './ManualLangSwitch';
import GradientButton from '@/app/components/GradientButton';

const SUPABASE_URL = 'https://yaogndpgnewqffbjrsgz.supabase.co';
const INDEX_URL = `${SUPABASE_URL}/storage/v1/object/public/manuals/manuals-index.json`;

const LANG_LABELS = {
  en: 'English', es: 'Español', zh: '中文', ru: 'Русский', ua: 'Українська',
  vi: 'Tiếng Việt', hy: 'Հայերեն', hi: 'हिन्दी', pa: 'ਪੰਜਾਬੀ', ht: 'Kreyòl',
  ko: '한국어', ar: 'العربية', fr: 'Français', de: 'Deutsch', so: 'Soomaali',
  sw: 'Kiswahili', my: 'မြန်မာ', ne: 'नेपाली', pt: 'Português', ja: '日本語', hmn: 'Hmong',
  tl: 'Filipino', sm: 'Samoa', to: 'Faka-Tonga', haw: 'ʻŌlelo Hawaiʻi', mh: 'Kajin M̧ajeļ', ilo: 'Ilocano', chk: 'Chuukese',
};

// Brand illustration per manual category (shared by the quick-link chips and
// the PDF section headers below).
const CAT_ART = {
  car: '/illustrations/manual-car.png',
  cdl: '/illustrations/manual-cdl.png',
  motorcycle: '/illustrations/manual-moto.png',
};
const CAT_LABELS_KEY = { car: 'catCar', cdl: 'catCdl', motorcycle: 'catMoto' };

async function fetchManualIndex() {
  try {
    const res = await fetch(INDEX_URL, { next: { revalidate: 86400 } });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

// Shared server-rendered body for the per-state manuals hub. `lang` and `state`
// arrive as props: the root wrapper passes the cookie language, the /[locale]/
// wrapper passes the path-segment locale. This component reads NO cookies, so a
// cookieless crawler hitting /ru/manuals/[state] gets a genuinely Russian body.
// The manuals index is fetched here and runs identically for any language.
export default async function StateManualBody({ lang, state }) {
  const name = STATE_DISPLAY[state];
  const meta = STATE_META[state];
  const year = new Date().getFullYear();

  const tex = t[lang] || t.en;

  // Per-state agency naming: swap the standalone word "DMV" in rendered
  // state-specific copy for the real agency (WA→DOL, TX→DPS, IL→SOS, ...).
  // The \b word-boundary keeps "DMVSOS" intact; no-op for true-DMV states.
  const ag = agencyAbbrForState(state);
  const dmv = (s) => String(s || '').replace(/\bDMV\b/g, ag);

  const index = await fetchManualIndex();
  const stateIndex = index?.[state];

  // Group PDFs by category
  const pdfByCategory = {};
  if (stateIndex) {
    for (const [cat, langs] of Object.entries(stateIndex)) {
      pdfByCategory[cat] = Object.entries(langs).map(([langCode, url]) => ({ langCode, url }));
    }
  }
  const pdfCats = Object.keys(pdfByCategory);

  const stateIdx = STATE_SLUGS.indexOf(state);
  const nearbyStates = STATE_SLUGS.filter((_, i) => i !== stateIdx).slice(0, 6);

  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article',
        headline: `${name} DMV Driver Manual ${year}`,
        description: `Official ${name} driver's handbook for the ${meta.abbr} DMV written knowledge test.`,
        author: { '@type': 'Organization', name: meta.agency },
        publisher: { '@type': 'Organization', name: 'DMVSOS', url: 'https://dmvsos.com' },
        url: `https://dmvsos.com/manuals/${state}`,
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: tex.home,           item: 'https://dmvsos.com' },
          { '@type': 'ListItem', position: 2, name: tex.manualsAllManuals, item: 'https://dmvsos.com/manuals' },
          { '@type': 'ListItem', position: 3, name: name,               item: `https://dmvsos.com/manuals/${state}` },
        ],
      },
      {
        '@type': 'GovernmentService',
        name: `${name} Driver Manual`,
        serviceType: 'Driver Education',
        provider: { '@type': 'GovernmentOrganization', name: meta.agency },
        areaServed: { '@type': 'State', name },
      },
    ],
  // Match the visible copy: refer to this state's real agency, not generic
  // "DMV" (WA = DOL, TX = DPS, ...). \b keeps the brand "DMVSOS" intact.
  }).replace(/\bDMV\b/g, ag);

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
            <Image src="/logo.png" alt="DMVSOS" width={32} height={32} className="rounded-lg" />
            <span className="text-lg font-bold text-[#0B1C3D]" style={{ letterSpacing: '-0.02em' }}>DMVSOS</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/manuals" className="text-xs font-medium text-[#64748B] hover:text-[#2563EB] transition">
              {tex.manualsAllManuals}
            </Link>
            <Link href={`/category?state=${state}&lang=${lang}`}
              className="text-xs font-semibold text-[#2563EB] hover:text-[#1D4ED8] transition">
              {tex.startFree || 'Free Test'}
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 pb-16">

        {/* Breadcrumb */}
        <nav className="text-xs text-[#94A3B8] mb-5 mt-1" aria-label="Breadcrumb">
          <ol className="flex items-center gap-1.5 flex-wrap">
            <li><Link href="/" className="hover:text-[#2563EB]">{tex.home}</Link></li>
            <li>/</li>
            <li><Link href="/manuals" className="hover:text-[#2563EB]">{tex.manualsAllManuals}</Link></li>
            <li>/</li>
            <li className="text-[#1A2B4A] font-medium">{name}</li>
          </ol>
        </nav>

        {/* H1 + language switcher */}
        <div className="mb-6">
          <h1 className="text-3xl sm:text-4xl font-black text-[#0B1C3D] mb-2 leading-tight" style={{ letterSpacing: '-0.02em' }}>
            {tex.manualsStateTitlePattern.replace('{state}', name).replace('{year}', String(year))}
          </h1>
          <p className="text-sm text-[#64748B] mb-1">
            {tex.manualsStateSubtitle.replace('{agency}', meta.agency)}
          </p>
          {/* Language switcher */}
          <ManualLangSwitch currentLang={lang} />
        </div>

        {/* Category quick-links */}
        {pdfCats.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-5">
            {pdfCats.map(cat => {
              const labels = { car: "Driver's Handbook", cdl: 'CDL Manual', motorcycle: 'Motorcycle Handbook' };
              return (
                <Link
                  key={cat}
                  href={`/manuals/${state}/${cat}`}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#E2E8F0] bg-white hover:border-[#2563EB] hover:bg-[#EFF6FF] hover:text-[#2563EB] transition-all text-xs font-semibold text-[#475569]"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={CAT_ART[cat]} alt="" className="w-6 h-6 object-contain shrink-0 select-none" />
                  {labels[cat]}
                </Link>
              );
            })}
          </div>
        )}

        {/* PDF Downloads | grouped by category */}
        {pdfCats.length > 0 && (
          <div className="bg-white rounded-2xl border border-[#E2E8F0] p-5 mb-5 shadow-sm">
            <h2 className="flex items-center gap-2 text-base font-bold text-[#0B1C3D] mb-4">
              <span className="inline-flex items-center justify-center w-7 h-7 bg-[#EFF6FF] rounded-lg shrink-0">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 3v12" /><path d="m7 11 5 5 5-5" /><path d="M5 21h14" />
                </svg>
              </span>
              {tex.manualsDownloadPdf}
            </h2>
            <div className="space-y-4">
              {pdfCats.map(cat => (
                <div key={cat}>
                  <p className="flex items-center gap-2 text-sm font-semibold text-[#0B1C3D] mb-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={CAT_ART[cat]} alt="" className="w-10 h-10 object-contain shrink-0 select-none" />
                    {tex[CAT_LABELS_KEY[cat]] || cat}
                  </p>
                  <div className="flex flex-col gap-2">
                    {pdfByCategory[cat].map(({ langCode, url }) => (
                      <a
                        key={langCode}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-[#E2E8F0] bg-white hover:border-[#2563EB] hover:bg-[#EFF6FF] transition-all"
                      >
                        <span className="flex items-center gap-2.5 text-sm font-medium text-[#1A2B4A]">
                          {LANG_LABELS[langCode] || langCode.toUpperCase()}
                        </span>
                        <span className="flex items-center gap-1.5 text-xs font-semibold text-[#2563EB] shrink-0">
                          PDF
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M12 3v12" /><path d="m7 11 5 5 5-5" /><path d="M5 21h14" />
                          </svg>
                        </span>
                      </a>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Practice Test CTA */}
        <div className="bg-[#0B1C3D] rounded-2xl p-6 mb-5 text-center shadow-lg border border-[#1e3a5f]">
          <h2 className="text-base font-bold text-white mb-1">
            {tex.manualsTestKnowledge}
          </h2>
          <p className="text-sm text-[#94A3B8] mb-4">
            {dmv(tex.manualsTestDesc.replace('{state}', name))}
          </p>
          <GradientButton
            href={`/category?state=${state}&lang=${lang}`}
            variant="blue"
            className="max-w-xs mx-auto"
          >
            {tex.manualsTakeTest.replace('{state}', name)}
          </GradientButton>
        </div>

        {/* Done reading? CTA */}
        <div className="bg-[#EFF6FF] border border-[#BFDBFE] rounded-2xl p-6 text-center mb-8">
          <p className="text-base font-semibold text-[#0B1C3D] mb-1">
            {tex.manualsDoneReading || 'Done reading?'}
          </p>
          <p className="text-sm text-[#64748B] mb-4">
            {tex.manualsDoneReadingDesc || 'Test your knowledge with real DMV questions'}
          </p>
          <GradientButton
            href={`/category?state=${state}&lang=${lang}`}
            variant="blue"
            className="max-w-xs mx-auto"
          >
            {tex.manualsTakeTest.replace('{state}', name)}
          </GradientButton>
        </div>

        {/* Other states */}
        <div className="mb-8">
          <h2 className="text-sm font-bold text-[#0B1C3D] mb-3">
            {tex.manualsOtherStates}
          </h2>
          <div className="grid grid-cols-2 gap-2">
            {nearbyStates.map(s => (
              <Link
                key={s}
                href={`/manuals/${s}`}
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
              {tex.manualsViewAll}
            </Link>
          </div>
        </div>

      </main>

      <footer className="border-t border-[#E2E8F0] py-8 text-center text-xs text-[#94A3B8]">
        <div className="max-w-lg mx-auto px-4">
          DMVSOS.com · Free DMV Practice Tests &amp; Driver Manuals for All 50 States
        </div>
      </footer>
    </div>
  );
}
