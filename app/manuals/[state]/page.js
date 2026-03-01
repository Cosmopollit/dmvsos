import Link from 'next/link';
import { notFound } from 'next/navigation';
import { STATE_DISPLAY, STATE_SLUGS, STATE_META } from '@/lib/manual-data';
import { parseManual, getAvailableCategories } from '@/lib/manual-parser';
import ManualContent from './ManualContent';

const SUPABASE_URL = 'https://yaogndpgnewqffbjrsgz.supabase.co';
const INDEX_URL = `${SUPABASE_URL}/storage/v1/object/public/manuals/manuals-index.json`;

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
    title: `${name} DMV Driver Manual ${year} - Free PDF Download | DMVSOS`,
    description: `Read the official ${name} driver's handbook online or download the free PDF. Study for your ${meta.abbr} DMV written test with the complete ${name} driver manual.`,
    alternates: {
      canonical: `https://dmvsos.com/manuals/${state}`,
    },
    openGraph: {
      title: `${name} DMV Driver Manual ${year} - Free PDF Download`,
      description: `Read the official ${name} driver's handbook online or download the free PDF. Study for your ${meta.abbr} DMV written test.`,
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
  const manual = parseManual(state, 'car');
  const categories = getAvailableCategories(state);
  const index = await fetchManualIndex();
  const stateIndex = index?.[state];

  // Get PDF links for this state
  const pdfLinks = [];
  if (stateIndex) {
    for (const [cat, langs] of Object.entries(stateIndex)) {
      for (const [lang, url] of Object.entries(langs)) {
        pdfLinks.push({ category: cat, lang, url });
      }
    }
  }

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
          { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://dmvsos.com' },
          { '@type': 'ListItem', position: 2, name: 'Driver Manuals', item: 'https://dmvsos.com/manuals' },
          { '@type': 'ListItem', position: 3, name: `${name} Manual`, item: `https://dmvsos.com/manuals/${state}` },
        ],
      },
      {
        '@type': 'GovernmentService',
        name: `${name} Driver Manual`,
        serviceType: 'Driver Education',
        provider: { '@type': 'GovernmentOrganization', name: meta.agency },
        areaServed: { '@type': 'State', name: name },
      },
    ],
  });

  const LANG_LABELS = {
    en: 'English', es: 'Spanish', zh: 'Chinese', ru: 'Russian', vi: 'Vietnamese',
    hy: 'Armenian', hi: 'Hindi', pa: 'Punjabi', ht: 'Haitian Creole', ko: 'Korean',
    ar: 'Arabic', fr: 'French', de: 'German', ua: 'Ukrainian', so: 'Somali',
    sw: 'Swahili', my: 'Burmese', ne: 'Nepali', pt: 'Portuguese', ja: 'Japanese', hmn: 'Hmong',
  };

  const CAT_LABELS = { car: 'Car (DMV)', cdl: 'CDL', motorcycle: 'Motorcycle' };

  // Neighboring states for linking
  const stateIdx = STATE_SLUGS.indexOf(state);
  const nearbyStates = STATE_SLUGS.filter((_, i) => i !== stateIdx).slice(0, 6);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#F0F4FF] to-white font-[family-name:var(--font-inter)]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />

      {/* Header */}
      <header className="bg-white border-b border-[#E2E8F0] sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-bold text-lg text-[#1A2B4A]">
            DMVSOS
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/manuals" className="text-sm text-[#64748B] hover:text-[#1A2B4A]">
              All Manuals
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <nav className="text-sm text-[#94A3B8] mb-6" aria-label="Breadcrumb">
          <ol className="flex items-center gap-1.5">
            <li><Link href="/" className="hover:text-[#2563EB]">Home</Link></li>
            <li>/</li>
            <li><Link href="/manuals" className="hover:text-[#2563EB]">Manuals</Link></li>
            <li>/</li>
            <li className="text-[#1A2B4A] font-medium">{name}</li>
          </ol>
        </nav>

        {/* H1 */}
        <h1 className="text-3xl sm:text-4xl font-bold text-[#1A2B4A] mb-2">
          {name} Driver Manual {year}
        </h1>
        <p className="text-[#64748B] text-lg mb-2">
          Official driver&apos;s handbook from the {meta.agency}.
        </p>
        {manual && (
          <p className="text-sm text-[#94A3B8] mb-6">
            {manual.totalPages} pages &middot; {manual.sections.length} sections
          </p>
        )}

        {/* PDF Downloads */}
        {pdfLinks.length > 0 && (
          <div className="bg-white rounded-2xl border border-[#E2E8F0] p-6 mb-6">
            <h2 className="text-lg font-bold text-[#1A2B4A] mb-4">Download PDF</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {pdfLinks.map(({ category, lang, url }) => (
                <a
                  key={`${category}-${lang}`}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between p-3 rounded-xl border border-[#E2E8F0] hover:border-[#2563EB] hover:bg-[#F0F4FF] transition-colors group"
                >
                  <span className="text-[#1A2B4A] text-sm font-medium">
                    {CAT_LABELS[category] || category} &middot; {LANG_LABELS[lang] || lang}
                  </span>
                  <span className="text-xs text-[#2563EB] group-hover:underline">
                    Download ↓
                  </span>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Practice Test CTA */}
        <div className="bg-[#0B1C3D] rounded-2xl p-6 mb-6 text-center">
          <h2 className="text-lg font-bold text-white mb-2">
            Ready to test your knowledge?
          </h2>
          <p className="text-sm text-[#94A3B8] mb-4">
            Take a free {name} DMV practice test with real exam-style questions.
          </p>
          <Link
            href={`/category?state=${state}&lang=en`}
            className="inline-flex items-center gap-2 px-6 py-3 bg-[#2563EB] text-white rounded-xl font-semibold hover:bg-[#1D4ED8] transition-colors"
          >
            Take {name} Practice Test →
          </Link>
        </div>

        {/* Manual Content */}
        {manual ? (
          <div className="mb-8">
            <h2 className="text-xl font-bold text-[#1A2B4A] mb-4">
              Read the {name} Driver&apos;s Handbook Online
            </h2>
            <ManualContent sections={manual.sections} />
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-[#E2E8F0] p-8 mb-8 text-center">
            <p className="text-[#94A3B8]">
              The online version of this manual is being prepared. Download the PDF above.
            </p>
          </div>
        )}

        {/* Other States */}
        <div className="border-t border-[#E2E8F0] pt-8 mb-8">
          <h2 className="text-lg font-bold text-[#1A2B4A] mb-4">
            Driver Manuals for Other States
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {nearbyStates.map(s => (
              <Link
                key={s}
                href={`/manuals/${s}`}
                className="p-3 rounded-xl border border-[#E2E8F0] bg-white hover:border-[#2563EB] hover:bg-[#F0F4FF] transition-colors text-sm font-medium text-[#1A2B4A]"
              >
                {STATE_DISPLAY[s]}
              </Link>
            ))}
            <Link
              href="/manuals"
              className="p-3 rounded-xl border border-[#2563EB] bg-[#F0F4FF] text-sm font-medium text-[#2563EB] text-center"
            >
              View all 50 states →
            </Link>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#E2E8F0] mt-8 py-8 text-center text-sm text-[#94A3B8]">
        <div className="max-w-5xl mx-auto px-4">
          DMVSOS.com &mdash; Free DMV Practice Tests &amp; Driver Manuals
        </div>
      </footer>
    </div>
  );
}
