import Link from 'next/link';
import { cookies } from 'next/headers';
import { STATE_DISPLAY, STATE_SLUGS, STATE_META } from '@/lib/manual-data';
import { getStatesWithManuals } from '@/lib/manual-parser';
import ManualsLibrary from './ManualsLibrary';

const SUPABASE_URL = 'https://yaogndpgnewqffbjrsgz.supabase.co';
const INDEX_URL = `${SUPABASE_URL}/storage/v1/object/public/manuals/manuals-index.json`;

export const metadata = {
  title: 'Free DMV Driver Manuals — All 50 States | DMVSOS',
  description: 'The largest free driver manual library online. Official DMV handbooks for all 50 US states in 21 languages. Download PDF or read online.',
  alternates: { canonical: 'https://www.dmvsos.com/manuals' },
  openGraph: {
    title: 'Free DMV Driver Manuals — All 50 States',
    description: 'Official DMV driver handbooks for all 50 US states. Download free PDF in 21 languages including Spanish, Russian, Chinese, and more.',
    url: 'https://www.dmvsos.com/manuals',
    siteName: 'DMVSOS',
    type: 'website',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'Free DMV Driver Manuals — All 50 States' }],
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
  const cookieStore = await cookies();
  const serverLang = cookieStore.get('dmvsos_lang')?.value || 'en';

  const index = await fetchManualIndex();
  const statesWithManuals = getStatesWithManuals();

  // Compute per-state data
  let totalPdfs = 0;
  const allLangs = new Set();

  const statesData = STATE_SLUGS.map(slug => {
    const indexData = index?.[slug] || {};
    const categories = Object.keys(indexData);
    const langsSet = new Set(
      Object.values(indexData).flatMap(c => Object.keys(c))
    );
    const langs = Array.from(langsSet);
    const pdfCount = Object.values(indexData).reduce((sum, c) => sum + Object.keys(c).length, 0);

    totalPdfs += pdfCount;
    langs.forEach(l => allLangs.add(l));

    return {
      slug,
      name: STATE_DISPLAY[slug],
      abbr: STATE_META[slug].abbr,
      hasOnlineManual: statesWithManuals.includes(slug),
      categories,
      langs,
      pdfCount,
    };
  });

  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        name: 'Free DMV Driver Manuals — All 50 States',
        description: 'Official driver handbooks for all 50 US states in 21 languages. Download PDF or read online.',
        url: 'https://www.dmvsos.com/manuals',
        publisher: { '@type': 'Organization', name: 'DMVSOS', url: 'https://www.dmvsos.com' },
        numberOfItems: totalPdfs,
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home',    item: 'https://www.dmvsos.com' },
          { '@type': 'ListItem', position: 2, name: 'Manuals', item: 'https://www.dmvsos.com/manuals' },
        ],
      },
    ],
  });

  return (
    <main
      style={{ background: 'linear-gradient(135deg, #EFF6FF 0%, #FFF7ED 100%)' }}
      className="min-h-screen font-[family-name:var(--font-inter)]"
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
            <Link href="/dmv-test" className="text-xs font-medium text-[#64748B] hover:text-[#2563EB] transition">
              Practice Tests
            </Link>
            <Link href="/" className="text-xs font-semibold text-[#2563EB] hover:text-[#1D4ED8] transition">
              Free Test →
            </Link>
          </div>
        </div>
      </header>

      {/* Breadcrumb */}
      <nav className="w-full max-w-lg mx-auto px-4 mb-1" aria-label="Breadcrumb">
        <ol className="flex items-center gap-1.5 text-xs text-[#94A3B8] flex-wrap">
          <li><Link href="/" className="hover:text-[#2563EB]">Home</Link></li>
          <li>/</li>
          <li className="text-[#1A2B4A] font-medium">Manuals</li>
        </ol>
      </nav>

      {/* Library UI — client component with search + filter */}
      <ManualsLibrary
        statesData={statesData}
        totalPdfs={totalPdfs}
        langCount={allLangs.size}
        serverLang={serverLang}
      />

      {/* Footer */}
      <footer className="w-full max-w-lg mx-auto px-4 pb-8">
        <p className="text-xs text-[#94A3B8] text-center leading-relaxed">
          DMVSOS.com &mdash; Free DMV Practice Tests &amp; Driver Manuals for All 50 States
        </p>
      </footer>
    </main>
  );
}
