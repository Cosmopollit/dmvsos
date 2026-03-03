import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { t } from '@/lib/translations';
import { STATE_DISPLAY, STATE_SLUGS, STATE_META } from '@/lib/manual-data';
import { parseManual } from '@/lib/manual-parser';
import ManualContent from './ManualContent';
import ManualLangSwitch from './ManualLangSwitch';

const SUPABASE_URL = 'https://yaogndpgnewqffbjrsgz.supabase.co';
const INDEX_URL = `${SUPABASE_URL}/storage/v1/object/public/manuals/manuals-index.json`;

const LANG_FLAGS = {
  en: '🇺🇸', es: '🇪🇸', ru: '🇷🇺', zh: '🇨🇳', ua: '🇺🇦',
  vi: '🇻🇳', ko: '🇰🇷', ar: '🇸🇦', fr: '🇫🇷', de: '🇩🇪',
  hy: '🇦🇲', hi: '🇮🇳', pa: '🇮🇳', ht: '🇭🇹', so: '🇸🇴',
  sw: '🇰🇪', my: '🇲🇲', ne: '🇳🇵', pt: '🇧🇷', ja: '🇯🇵', hmn: '🌿',
};

const LANG_LABELS = {
  en: 'English', es: 'Español', zh: '中文', ru: 'Русский', ua: 'Українська',
  vi: 'Tiếng Việt', hy: 'Հայերեն', hi: 'हिन्दी', pa: 'ਪੰਜਾਬੀ', ht: 'Kreyòl',
  ko: '한국어', ar: 'العربية', fr: 'Français', de: 'Deutsch', so: 'Soomaali',
  sw: 'Kiswahili', my: 'မြန်မာ', ne: 'नेपाली', pt: 'Português', ja: '日本語', hmn: 'Hmong',
};

const CAT_ICONS = { car: '🚗', cdl: '🚛', motorcycle: '🏍️' };
const CAT_LABELS_KEY = { car: 'catCar', cdl: 'catCdl', motorcycle: 'catMoto' };

export function generateStaticParams() {
  return STATE_SLUGS.map(state => ({ state }));
}

export async function generateMetadata({ params }) {
  const { state } = await params;
  const name = STATE_DISPLAY[state];
  if (!name) return {};
  const meta = STATE_META[state];
  const year = new Date().getFullYear();

  return {
    title: `${name} DMV Driver Manual ${year} — Free PDF | DMVSOS`,
    description: `Read the official ${name} driver's handbook online or download the free PDF. Study for your ${meta.abbr} DMV written test with real questions.`,
    alternates: { canonical: `https://dmvsos.com/manuals/${state}` },
    openGraph: {
      title: `${name} DMV Driver Manual ${year} — Free PDF`,
      description: `Official ${name} driver's handbook. Download PDF or read online. Available in multiple languages.`,
      url: `https://dmvsos.com/manuals/${state}`,
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

export default async function StateManualPage({ params }) {
  const { state } = await params;
  const name = STATE_DISPLAY[state];
  if (!name) notFound();

  const meta = STATE_META[state];
  const year = new Date().getFullYear();

  const cookieStore = await cookies();
  const lang = cookieStore.get('dmvsos_lang')?.value || 'en';
  const tex = t[lang] || t.en;

  const manual = parseManual(state, 'car');
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
              {tex.manualsAllManuals}
            </Link>
            <Link href={`/category?state=${state}&lang=${lang}`}
              className="text-xs font-semibold text-[#2563EB] hover:text-[#1D4ED8] transition">
              {tex.startFree || 'Free Test →'}
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
          {manual && (
            <p className="text-xs text-[#94A3B8] mb-4">
              {tex.manualsPageCount
                .replace('{pages}', String(manual.totalPages))
                .replace('{sections}', String(manual.sections.length))}
            </p>
          )}

          {/* Language switcher */}
          <ManualLangSwitch currentLang={lang} />
        </div>

        {/* PDF Downloads — grouped by category */}
        {pdfCats.length > 0 && (
          <div className="bg-white rounded-2xl border border-[#E2E8F0] p-5 mb-5 shadow-sm">
            <h2 className="text-base font-bold text-[#0B1C3D] mb-4">
              📥 {tex.manualsDownloadPdf}
            </h2>
            <div className="space-y-4">
              {pdfCats.map(cat => (
                <div key={cat}>
                  <p className="text-xs font-semibold text-[#64748B] uppercase tracking-wide mb-2">
                    {CAT_ICONS[cat]} {tex[CAT_LABELS_KEY[cat]] || cat}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {pdfByCategory[cat].map(({ langCode, url }) => (
                      <a
                        key={langCode}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] hover:border-[#2563EB] hover:bg-[#EFF6FF] hover:text-[#2563EB] transition-all text-xs font-medium text-[#475569]"
                      >
                        <span>{LANG_FLAGS[langCode] || '📄'}</span>
                        <span>{LANG_LABELS[langCode] || langCode.toUpperCase()}</span>
                        <span className="text-[#94A3B8]">↓</span>
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
            {tex.manualsTestDesc.replace('{state}', name)}
          </p>
          <div className="flex items-center justify-center gap-2 mb-4">
            <span className="text-xs font-semibold text-[#10B981] bg-[#10B981]/10 px-3 py-1 rounded-full border border-[#10B981]/30">
              🛡️ {tex.moneyBack}
            </span>
          </div>
          <Link
            href={`/category?state=${state}&lang=${lang}`}
            className="inline-flex items-center gap-2 px-6 py-3 bg-[#2563EB] text-white rounded-xl font-semibold hover:bg-[#1D4ED8] transition-colors text-sm"
          >
            {tex.manualsTakeTest.replace('{state}', name)}
          </Link>
        </div>

        {/* Online manual content */}
        {manual ? (
          <div className="mb-8">
            <h2 className="text-lg font-bold text-[#0B1C3D] mb-4">
              {tex.manualsReadOnline.replace('{state}', name)}
            </h2>
            <ManualContent sections={manual.sections} lang={lang} />
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-[#E2E8F0] p-8 mb-8 text-center shadow-sm">
            <p className="text-sm text-[#94A3B8]">{tex.manualsOnlinePrep}</p>
          </div>
        )}

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
          DMVSOS.com — Free DMV Practice Tests &amp; Driver Manuals for All 50 States
        </div>
      </footer>
    </div>
  );
}
