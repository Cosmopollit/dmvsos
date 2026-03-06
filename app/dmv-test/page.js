import Link from 'next/link';
import { STATE_DISPLAY, STATE_SLUGS, STATE_META } from '@/lib/manual-data';

export const metadata = {
  title: 'Free DMV Practice Tests — All 50 States 2026 | DMVSOS',
  description: 'Free DMV practice tests for all 50 US states in 5 languages. Pick your state and start practicing for your knowledge test today. No signup required.',
  alternates: { canonical: 'https://www.dmvsos.com/dmv-test' },
  openGraph: {
    title: 'Free DMV Practice Tests — All 50 States 2026',
    description: 'Free DMV practice tests for all 50 US states in English, Spanish, Russian, Chinese and Ukrainian.',
    url: 'https://www.dmvsos.com/dmv-test',
    siteName: 'DMVSOS',
    type: 'website',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'DMVSOS — Free DMV Practice Tests' }],
  },
};

const year = new Date().getFullYear();

const jsonLd = JSON.stringify({
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'CollectionPage',
      name: 'Free DMV Practice Tests — All 50 States',
      description: 'State-specific DMV practice tests for all 50 US states in 5 languages.',
      url: 'https://www.dmvsos.com/dmv-test',
      publisher: { '@type': 'Organization', name: 'DMVSOS', url: 'https://www.dmvsos.com' },
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home',      item: 'https://www.dmvsos.com' },
        { '@type': 'ListItem', position: 2, name: 'DMV Tests', item: 'https://www.dmvsos.com/dmv-test' },
      ],
    },
  ],
});

export default function DmvTestIndexPage() {
  return (
    <div
      className="min-h-screen font-[family-name:var(--font-inter)]"
      style={{ background: 'linear-gradient(135deg, #EFF6FF 0%, #FFF7ED 100%)' }}
    >
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />

      <div className="fixed top-[-200px] right-[-200px] w-[600px] h-[600px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(26,86,219,0.08) 0%, transparent 70%)' }} />

      {/* Header */}
      <header className="w-full max-w-lg mx-auto pt-5 pb-3 px-4">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 hover:opacity-90 transition">
            <img src="/logo.png" alt="DMVSOS" width={32} height={32} className="rounded-lg" />
            <span className="text-lg font-bold text-[#0B1C3D]" style={{ letterSpacing: '-0.02em' }}>DMVSOS</span>
          </Link>
          <Link href="/" className="text-sm font-medium text-[#2563EB] hover:text-[#1D4ED8] transition">
            ← Home
          </Link>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 pb-16">

        {/* Breadcrumb */}
        <nav className="text-xs text-[#94A3B8] mb-5 mt-2" aria-label="Breadcrumb">
          <ol className="flex items-center gap-1.5">
            <li><Link href="/" className="hover:text-[#2563EB]">Home</Link></li>
            <li>/</li>
            <li className="text-[#1A2B4A] font-medium">DMV Tests</li>
          </ol>
        </nav>

        {/* Hero */}
        <h1 className="text-3xl sm:text-4xl font-black text-[#0B1C3D] mb-3 leading-tight" style={{ letterSpacing: '-0.02em' }}>
          Free DMV Practice Tests — All 50 States {year}
        </h1>
        <p className="text-base text-[#64748B] mb-6 leading-relaxed">
          Pick your state to start practicing. Real knowledge test questions in
          English, Spanish, Russian, Chinese, and Ukrainian. No signup required.
        </p>

        {/* Trust tags */}
        <div className="flex flex-wrap gap-2 mb-8">
          {['35,000+ Questions', '5 Languages', 'Car · CDL · Motorcycle', '94% Pass Rate', 'Free to Start'].map(tag => (
            <span key={tag} className="text-xs font-semibold text-[#2563EB] bg-[#EFF6FF] border border-[#BFDBFE] rounded-full px-3 py-1">
              {tag}
            </span>
          ))}
        </div>

        {/* State grid */}
        <section>
          <h2 className="text-base font-bold text-[#0B1C3D] mb-4">Choose your state</h2>
          <div className="grid grid-cols-2 gap-2">
            {STATE_SLUGS.map(state => (
              <Link
                key={state}
                href={`/dmv-test/${state}`}
                className="p-3 rounded-xl border border-[#E2E8F0] bg-white hover:border-[#2563EB] hover:shadow-md transition-all group"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-sm text-[#1A2B4A] group-hover:text-[#2563EB] transition-colors">
                      {STATE_DISPLAY[state]}
                    </div>
                    <div className="text-[10px] text-[#94A3B8] mt-0.5">
                      {STATE_META[state].abbr} · Free test
                    </div>
                  </div>
                  <span className="text-xs text-[#2563EB] opacity-0 group-hover:opacity-100 transition-opacity shrink-0">→</span>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* Bottom CTA */}
        <div className="mt-10 bg-[#0B1C3D] rounded-2xl p-6 text-center shadow-lg">
          <p className="text-white font-bold text-base mb-1">Ready to pass on your first try?</p>
          <p className="text-[#94A3B8] text-sm mb-4">Select your state above and start practicing for free.</p>
          <div className="flex items-center justify-center gap-2 mb-4">
            <span className="text-xs font-semibold text-[#10B981] bg-[#10B981]/10 px-3 py-1 rounded-full border border-[#10B981]/30">
              🛡️ Pass or your money back
            </span>
          </div>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-6 py-3 bg-[#2563EB] text-white rounded-xl font-semibold hover:bg-[#1D4ED8] transition-colors text-sm"
          >
            Start Practicing →
          </Link>
        </div>

      </main>

      <footer className="border-t border-[#E2E8F0] py-8 text-center text-xs text-[#94A3B8]">
        <div className="max-w-lg mx-auto px-4">
          <p>DMVSOS.com — Free DMV Practice Tests for All 50 States</p>
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
