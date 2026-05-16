import Link from 'next/link';
import Image from 'next/image';

export const metadata = {
  title: 'DMVSOS vs DriversEd, Aceable, Driving-Tests — 2026 Comparison',
  description:
    'Honest comparison of DMV practice test platforms. Pricing, languages, states covered, free tier, refund policy. DMVSOS vs DriversEd vs Aceable vs Driving-Tests.org.',
  alternates: { canonical: 'https://dmvsos.com/vs' },
  openGraph: {
    title: 'DMVSOS vs DriversEd, Aceable, Driving-Tests',
    description: 'How DMVSOS compares to other DMV practice test sites. Pricing, free tier, language support, refund policy.',
    url: 'https://dmvsos.com/vs',
    siteName: 'DMVSOS',
    type: 'website',
  },
};

const COMPARISON = [
  {
    feature: 'Free tier',
    dmvsos: '20 questions per state, no signup',
    driversed: 'Limited preview only',
    aceable: '5 sample questions',
    drivingtests: 'Yes (ads, full free)',
  },
  {
    feature: 'Pricing model',
    dmvsos: 'One-time $19.99–$49.99 / 30 days',
    driversed: 'Subscription $20–$30 / month',
    aceable: 'One-time $30–$100',
    drivingtests: 'Free (ad-supported)',
  },
  {
    feature: 'Subscription auto-renew',
    dmvsos: 'No — never',
    driversed: 'Yes',
    aceable: 'No',
    drivingtests: 'N/A',
  },
  {
    feature: 'States covered',
    dmvsos: 'All 50 + DC',
    driversed: 'All 50',
    aceable: 'Only states with regulatory approval (~10)',
    drivingtests: 'All 50',
  },
  {
    feature: 'Languages',
    dmvsos: 'English, Spanish, Russian, Ukrainian, Chinese',
    driversed: 'English, Spanish',
    aceable: 'English only',
    drivingtests: 'English, Spanish',
  },
  {
    feature: 'Official driver handbook PDF',
    dmvsos: 'All 50 states, up to 27 languages, free download',
    driversed: 'Links to state DMV websites',
    aceable: 'No',
    drivingtests: 'Links to state DMV websites',
  },
  {
    feature: 'CDL practice',
    dmvsos: 'Yes — General Knowledge, Air Brakes, Combination',
    driversed: 'Yes',
    aceable: 'No',
    drivingtests: 'Yes',
  },
  {
    feature: 'Motorcycle practice',
    dmvsos: 'Yes',
    driversed: 'Yes',
    aceable: 'No',
    drivingtests: 'Yes',
  },
  {
    feature: 'Refund policy',
    dmvsos: '24h full refund, no questions',
    driversed: '72h with conditions',
    aceable: 'Varies by state',
    drivingtests: 'N/A',
  },
  {
    feature: 'Question source citation',
    dmvsos: 'Yes — official handbook section under each question',
    driversed: 'No',
    aceable: 'No',
    drivingtests: 'No',
  },
  {
    feature: 'Support',
    dmvsos: 'Direct Telegram + email (founder replies in <4h)',
    driversed: 'Email + call center',
    aceable: 'Email + phone',
    drivingtests: 'Email',
  },
  {
    feature: 'CDL Pass Guarantee',
    dmvsos: 'Refund or 90-day extension if you fail real test',
    driversed: 'Pass Guarantee on some courses',
    aceable: 'No',
    drivingtests: 'No',
  },
];

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'DMVSOS vs DriversEd, Aceable, Driving-Tests.org — Comparison',
  description: 'Feature-by-feature comparison of leading DMV practice test platforms.',
  url: 'https://dmvsos.com/vs',
  publisher: { '@type': 'Organization', name: 'DMVSOS', url: 'https://www.dmvsos.com' },
  mainEntity: {
    '@type': 'Table',
    about: 'DMV practice test platform comparison',
  },
};

export default function VsPage() {
  return (
    <main className="min-h-screen bg-[#F8FAFC] py-10 px-4">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <div className="max-w-4xl mx-auto">
        <Link href="/" className="inline-flex items-center gap-2 mb-8 hover:opacity-90 transition">
          <Image src="/logo.png" alt="DMVSOS" width={36} height={36} className="rounded-xl" />
          <span className="text-[22px] font-bold text-[#0B1C3D] tracking-tight">DMVSOS</span>
        </Link>

        <header className="mb-8">
          <h1 className="text-3xl font-bold text-[#0B1C3D] mb-2">
            DMVSOS vs DriversEd, Aceable, Driving-Tests
          </h1>
          <p className="text-[#64748B] text-sm">
            Honest feature comparison of the four most popular DMV practice test platforms in 2026.
            We left some boxes blank for competitors when we genuinely don&apos;t know — and called out where they win.
          </p>
        </header>

        <div className="bg-white rounded-2xl shadow-sm border border-[#E2E8F0] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#F8FAFC]">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-[#0B1C3D] sticky left-0 bg-[#F8FAFC]">Feature</th>
                  <th className="text-left px-4 py-3 font-semibold text-[#2563EB]">DMVSOS</th>
                  <th className="text-left px-4 py-3 font-semibold text-[#64748B]">DriversEd.com</th>
                  <th className="text-left px-4 py-3 font-semibold text-[#64748B]">Aceable</th>
                  <th className="text-left px-4 py-3 font-semibold text-[#64748B]">Driving-Tests.org</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map((row, i) => (
                  <tr key={row.feature} className={i % 2 === 0 ? 'bg-white' : 'bg-[#FAFBFC]'}>
                    <td className="px-4 py-3 font-medium text-[#0B1C3D] sticky left-0 bg-inherit">{row.feature}</td>
                    <td className="px-4 py-3 text-[#1E40AF] font-medium">{row.dmvsos}</td>
                    <td className="px-4 py-3 text-[#475569]">{row.driversed}</td>
                    <td className="px-4 py-3 text-[#475569]">{row.aceable}</td>
                    <td className="px-4 py-3 text-[#475569]">{row.drivingtests}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <section className="mt-8 bg-white rounded-2xl shadow-sm border border-[#E2E8F0] p-6">
          <h2 className="text-xl font-bold text-[#0B1C3D] mb-3">Which one should you pick?</h2>
          <ul className="space-y-3 text-sm text-[#1E293B] leading-relaxed">
            <li>
              <strong className="text-[#2563EB]">DMVSOS</strong> if you want practice in a non-English
              language, hate subscriptions, or need official handbook downloads in one place.
            </li>
            <li>
              <strong>Driving-Tests.org</strong> if budget is zero and you don&apos;t mind ads.
              Solid free tier in English &amp; Spanish.
            </li>
            <li>
              <strong>Aceable</strong> if you need a state-approved teen driver ed course
              (different product — they&apos;re mainly drivers ed, not just DMV prep).
            </li>
            <li>
              <strong>DriversEd.com</strong> if you want a polished subscription with call-center support
              and don&apos;t mind paying monthly.
            </li>
          </ul>
        </section>

        <section className="mt-6 bg-white rounded-2xl shadow-sm border border-[#E2E8F0] p-6">
          <h2 className="text-xl font-bold text-[#0B1C3D] mb-3">Try DMVSOS free, no signup</h2>
          <p className="text-sm text-[#475569] mb-4">
            Pick your state, start practicing in your language, see if the questions match the actual DMV format.
            Decide later if you want a pass.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/" className="inline-flex items-center gap-2 bg-[#2563EB] text-white px-5 py-3 rounded-xl font-semibold text-sm hover:bg-[#1D4ED8] transition">
              Start free practice test →
            </Link>
            <Link href="/manuals" className="inline-flex items-center gap-2 bg-white border border-[#E2E8F0] text-[#1E293B] px-5 py-3 rounded-xl font-semibold text-sm hover:border-[#2563EB] hover:text-[#2563EB] transition">
              Browse manuals
            </Link>
            <Link href="/faq" className="inline-flex items-center gap-2 bg-white border border-[#E2E8F0] text-[#1E293B] px-5 py-3 rounded-xl font-semibold text-sm hover:border-[#2563EB] hover:text-[#2563EB] transition">
              FAQ
            </Link>
          </div>
        </section>

        <p className="mt-8 text-xs text-[#94A3B8] text-center leading-relaxed">
          Comparison data current as of 2026. Pricing and features change — verify on each provider&apos;s site before purchasing.
          We claim no affiliation with DriversEd.com, Aceable, or Driving-Tests.org.
        </p>
      </div>
    </main>
  );
}
