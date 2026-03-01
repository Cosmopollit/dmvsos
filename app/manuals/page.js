import Link from 'next/link';
import { STATE_DISPLAY, STATE_SLUGS, STATE_META } from '@/lib/manual-data';
import { getStatesWithManuals } from '@/lib/manual-parser';
import ManualSelector from './ManualSelector';

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
    name: 'Free DMV Driver Manuals for All 50 States',
    description: 'Official driver handbooks for all 50 US states. Download PDF manuals in multiple languages.',
    url: 'https://dmvsos.com/manuals',
    publisher: { '@type': 'Organization', name: 'DMVSOS', url: 'https://dmvsos.com' },
    numberOfItems: 50,
  });

  return (
    <main style={{ background: 'linear-gradient(135deg, #EFF6FF 0%, #FFF7ED 100%)' }}
      className="min-h-screen flex flex-col items-center px-4 font-[family-name:var(--font-inter)]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />

      {/* Background blobs */}
      <div className="fixed top-[-200px] right-[-200px] w-[600px] h-[600px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(26,86,219,0.08) 0%, transparent 70%)' }} />
      <div className="fixed bottom-[-150px] left-[-150px] w-[500px] h-[500px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(245,158,11,0.06) 0%, transparent 70%)' }} />

      {/* Header */}
      <header className="w-full max-w-lg mx-auto pt-5 pb-3 px-4">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 cursor-pointer hover:opacity-90 transition">
            <img src="/logo.png" alt="DMVSOS" width={32} height={32} className="rounded-lg" />
            <span className="text-lg font-bold text-[#0B1C3D]" style={{ letterSpacing: '-0.02em' }}>DMVSOS</span>
          </Link>
          <Link href="/" className="text-sm font-medium text-[#2563EB] hover:text-[#1D4ED8] transition">
            Practice Tests
          </Link>
        </div>
      </header>

      {/* Interactive selector (client component with lang switcher + hero + card) */}
      <ManualSelector />

      {/* Stats bar */}
      <section className="w-full max-w-lg mx-auto px-4 mb-8">
        <div className="grid grid-cols-3 gap-2">
          {[
            { value: '50', label: 'States' },
            { value: String(totalPdfs || '190+'), label: 'PDFs' },
            { value: '20+', label: 'Languages' },
          ].map((stat) => (
            <div key={stat.label} className="bg-white rounded-2xl p-3 text-center shadow-sm border border-[#E2E8F0]/60">
              <div className="text-lg sm:text-xl font-black text-[#0B1C3D]">{stat.value}</div>
              <div className="text-[10px] text-[#94A3B8] font-medium mt-0.5">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Browse all states */}
      <section className="w-full max-w-lg mx-auto mb-8 px-4">
        <h2 className="text-center text-lg font-bold text-[#0B1C3D] mb-5">
          Browse All States
        </h2>

        <div className="grid grid-cols-2 gap-2">
          {STATE_SLUGS.map(state => {
            const name = STATE_DISPLAY[state];
            const meta = STATE_META[state];
            const indexData = index?.[state];
            const hasOnlineManual = statesWithManuals.includes(state);

            let langCount = 0;
            if (indexData) {
              langCount = new Set(
                Object.values(indexData).flatMap(c => Object.keys(c))
              ).size;
            }

            return (
              <Link
                key={state}
                href={`/manuals/${state}`}
                className="p-3 rounded-xl border border-[#E2E8F0] bg-white hover:border-[#2563EB] hover:shadow-md transition-all group"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-sm text-[#1A2B4A] group-hover:text-[#2563EB]">
                      {name}
                    </div>
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className="text-[10px] text-[#94A3B8]">{meta.abbr}</span>
                      {langCount > 0 && (
                        <span className="text-[10px] text-[#94A3B8]">&middot; {langCount} lang</span>
                      )}
                    </div>
                  </div>
                  {hasOnlineManual && (
                    <span className="text-[10px] font-medium text-[#2563EB] bg-[#EFF6FF] px-1.5 py-0.5 rounded-full shrink-0">
                      online
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="w-full max-w-lg mx-auto mb-8 px-4">
        <div className="bg-[#0B1C3D] rounded-2xl p-6 border border-[#1e3a5f] shadow-sm text-center">
          <h2 className="text-base font-bold text-white mb-2">
            Ready to practice?
          </h2>
          <p className="text-sm text-[#94A3B8] mb-4">
            After studying your state&apos;s manual, take a free practice test.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-6 py-3 bg-[#2563EB] text-white rounded-xl font-semibold hover:bg-[#1D4ED8] transition-colors"
          >
            Take a Free Practice Test →
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="w-full max-w-lg mx-auto px-4 mt-4 pb-8">
        <p className="text-xs text-[#94A3B8] text-center leading-relaxed">
          DMVSOS.com &mdash; Free DMV Practice Tests &amp; Driver Manuals
        </p>
      </footer>
    </main>
  );
}
