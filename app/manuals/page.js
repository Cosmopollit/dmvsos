import Link from 'next/link';
import { STATE_DISPLAY, STATE_SLUGS, STATE_META, CATEGORY_LABELS } from '@/lib/manual-data';
import { getStatesWithManuals } from '@/lib/manual-parser';

const SUPABASE_URL = 'https://yaogndpgnewqffbjrsgz.supabase.co';
const INDEX_URL = `${SUPABASE_URL}/storage/v1/object/public/manuals/manuals-index.json`;

export const metadata = {
  title: 'Free DMV Driver Manuals for All 50 States - Download PDF | DMVSOS',
  description: 'Download free official DMV driver handbooks and manuals for all 50 US states. Available in multiple languages including Spanish, Chinese, Russian, and more.',
  alternates: {
    canonical: 'https://dmvsos.com/manuals',
  },
  openGraph: {
    title: 'Free DMV Driver Manuals for All 50 States',
    description: 'Download free official DMV driver handbooks for all 50 US states in multiple languages.',
    url: 'https://dmvsos.com/manuals',
    siteName: 'DMVSOS',
    type: 'website',
  },
};

async function fetchManualIndex() {
  try {
    const res = await fetch(INDEX_URL, { next: { revalidate: 86400 } });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function ManualsPage() {
  const index = await fetchManualIndex();
  const statesWithManuals = getStatesWithManuals();
  const year = new Date().getFullYear();

  // Count total PDFs
  let totalPdfs = 0;
  if (index) {
    for (const cats of Object.values(index)) {
      for (const langs of Object.values(cats)) {
        totalPdfs += Object.keys(langs).length;
      }
    }
  }

  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `Free DMV Driver Manuals for All 50 States ${year}`,
    description: 'Official driver handbooks for all 50 US states. Download PDF manuals in multiple languages.',
    url: 'https://dmvsos.com/manuals',
    publisher: { '@type': 'Organization', name: 'DMVSOS', url: 'https://dmvsos.com' },
    numberOfItems: 50,
  });

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
            <Link href="/" className="text-sm text-[#64748B] hover:text-[#1A2B4A]">
              Back to Home
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {/* Hero */}
        <div className="text-center mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-[#1A2B4A] mb-3">
            Free DMV Driver Manuals {year}
          </h1>
          <p className="text-[#64748B] text-lg max-w-2xl mx-auto">
            Official driver handbooks for all 50 US states. Read online or download PDF manuals in multiple languages.
          </p>
          <p className="text-sm text-[#94A3B8] mt-2">
            50 states &middot; {totalPdfs > 0 ? `${totalPdfs} PDFs available` : 'PDF downloads available'}
          </p>
        </div>

        {/* All states grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {STATE_SLUGS.map(state => {
            const name = STATE_DISPLAY[state];
            const meta = STATE_META[state];
            const indexData = index?.[state];
            const hasOnlineManual = statesWithManuals.includes(state);

            // Count languages from index
            let langCount = 0;
            let catList = '';
            if (indexData) {
              const langs = new Set(
                Object.values(indexData).flatMap(c => Object.keys(c))
              );
              langCount = langs.size;
              catList = Object.keys(indexData).map(c => CATEGORY_LABELS[c] || c).join(', ');
            }

            return (
              <Link
                key={state}
                href={`/manuals/${state}`}
                className="text-left p-4 rounded-xl border border-[#E2E8F0] bg-white hover:border-[#2563EB] hover:bg-[#F0F4FF] transition-colors group"
              >
                <div className="font-medium text-[#1A2B4A] group-hover:text-[#2563EB]">
                  {name}
                </div>
                <div className="text-xs text-[#94A3B8] mt-0.5">
                  {meta.abbr} &middot; {meta.agency.split(' ').slice(-2).join(' ')}
                </div>
                {langCount > 0 && (
                  <div className="text-sm text-[#94A3B8] mt-1">
                    {catList} &middot; {langCount} {langCount === 1 ? 'language' : 'languages'}
                  </div>
                )}
                {hasOnlineManual && (
                  <span className="inline-block mt-2 text-xs font-medium text-[#2563EB] bg-[#EFF6FF] px-2 py-0.5 rounded-full">
                    Read online
                  </span>
                )}
              </Link>
            );
          })}
        </div>

        {/* Bottom CTA */}
        <div className="text-center mt-12">
          <h2 className="text-xl font-bold text-[#1A2B4A] mb-3">
            Ready to practice?
          </h2>
          <p className="text-sm text-[#64748B] mb-4">
            After studying your state&apos;s manual, take a free practice test to check your knowledge.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-6 py-3 bg-[#2563EB] text-white rounded-xl font-semibold hover:bg-[#1D4ED8] transition-colors"
          >
            Take a Free Practice Test →
          </Link>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#E2E8F0] mt-16 py-8 text-center text-sm text-[#94A3B8]">
        <div className="max-w-5xl mx-auto px-4">
          DMVSOS.com &mdash; Free DMV Practice Tests &amp; Driver Manuals
        </div>
      </footer>
    </div>
  );
}
