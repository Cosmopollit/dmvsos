import Link from 'next/link';
import { STATE_DISPLAY, STATE_SLUGS, STATE_META } from '@/lib/manual-data';
import { hubMeta, localizedAlternates, APP_LANG_TO_OG_LOCALE, APP_LANG_TO_HTML_LANG } from '@/lib/i18n-meta';
import SiteHeader from '@/app/components/SiteHeader';
import SupportFooter from '@/app/components/SupportFooter';
import { getServerLang } from '@/lib/lang-server';
import { t } from '@/lib/translations';

const SUPPORTED_LANGS = ['en', 'ru', 'es', 'zh', 'ua'];
function resolveLang(raw) {
  return SUPPORTED_LANGS.includes(raw) ? raw : 'en';
}

export async function generateMetadata({ searchParams }) {
  const sp = (await searchParams) || {};
  const lang = resolveLang(Array.isArray(sp.lang) ? sp.lang[0] : sp.lang);
  const yearCurrent = new Date().getFullYear();
  const m = hubMeta(lang, { year: yearCurrent });
  const alts = localizedAlternates('/dmv-test', lang);
  return {
    title: m.title,
    description: m.description,
    alternates: alts,
    openGraph: {
      title: m.title,
      description: m.description,
      url: alts.canonical,
      siteName: 'DMVSOS',
      type: 'website',
      locale: APP_LANG_TO_OG_LOCALE[lang],
      alternateLocale: Object.values(APP_LANG_TO_OG_LOCALE).filter(l => l !== APP_LANG_TO_OG_LOCALE[lang]),
      images: [{ url: '/og-image.png', width: 1200, height: 630, alt: m.title }],
    },
    twitter: {
      card: 'summary_large_image',
      title: m.title,
      description: m.description,
    },
    other: {
      'content-language': APP_LANG_TO_HTML_LANG[lang],
    },
  };
}

const year = new Date().getFullYear();

const jsonLd = JSON.stringify({
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'CollectionPage',
      name: 'Free DMV Practice Tests  ·  All 50 States',
      description: 'State-specific DMV practice tests for all 50 US states in 5 languages.',
      url: 'https://dmvsos.com/dmv-test',
      publisher: { '@type': 'Organization', name: 'DMVSOS', url: 'https://dmvsos.com' },
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home',      item: 'https://dmvsos.com' },
        { '@type': 'ListItem', position: 2, name: 'DMV Tests', item: 'https://dmvsos.com/dmv-test' },
      ],
    },
  ],
});

// Body language comes from the saved-language cookie (same as the homepage),
// so a returning RU/ES/ZH/UA visitor sees a fully-localized page instead of
// the old English-only hero under the localized nav. The SEO <title> /
// description (generateMetadata) and the cookieless crawler stay English, so
// keyword targeting is unchanged. Strings are reused from lib/translations.js
// — no new copy.
export default async function DmvTestIndexPage() {
  const lang = await getServerLang();
  const tex = t[lang] || t.en;

  return (
    <div
      className="min-h-screen font-[family-name:var(--font-inter)]"
      style={{ background: 'linear-gradient(135deg, #EFF6FF 0%, #FFF7ED 100%)' }}
    >
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />

      <div className="fixed top-[-200px] right-[-200px] w-[600px] h-[600px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(26,86,219,0.08) 0%, transparent 70%)' }} />

      <SiteHeader />

      <main className="max-w-lg mx-auto px-4 pb-16">

        {/* Breadcrumb */}
        <nav className="text-xs text-[#94A3B8] mb-5 mt-2" aria-label="Breadcrumb">
          <ol className="flex items-center gap-1.5">
            <li><Link href="/" className="hover:text-[#2563EB]">{tex.home || 'Home'}</Link></li>
            <li>/</li>
            <li className="text-[#1A2B4A] font-medium">{tex.practiceTests || 'DMV Tests'}</li>
          </ol>
        </nav>

        {/* Hero */}
        <h1 className="text-3xl sm:text-4xl font-black text-[#0B1C3D] mb-3 leading-tight whitespace-pre-line" style={{ letterSpacing: '-0.02em' }}>
          {tex.heroTitle || `Free DMV Practice Tests  ·  All 50 States ${year}`}
        </h1>
        <p className="text-base text-[#64748B] mb-6 leading-relaxed">
          {tex.heroSub || 'Pick your state to start practicing. Real knowledge test questions in English, Spanish, Russian, Chinese, and Ukrainian. No signup required.'}
        </p>

        {/* Trust line */}
        {tex.heroTrustStats && (
          <div className="flex flex-wrap gap-2 mb-8">
            <span className="text-xs font-semibold text-[#2563EB] bg-[#EFF6FF] border border-[#BFDBFE] rounded-full px-3 py-1">
              {tex.heroTrustStats}
            </span>
          </div>
        )}

        {/* State grid */}
        <section>
          <h2 className="text-base font-bold text-[#0B1C3D] mb-4">{tex.selectStateLabel || 'Choose your state'}</h2>
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
                      {STATE_META[state].abbr} · {tex.freeTestLink || 'Free test'}
                    </div>
                  </div>
                  <span className="text-xs text-[#2563EB] opacity-0 group-hover:opacity-100 transition-opacity shrink-0"></span>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* Bottom CTA */}
        <div className="mt-10 bg-[#0B1C3D] rounded-2xl p-6 text-center shadow-lg">
          <p className="text-white font-bold text-base mb-1">{tex.selectStateLabel || 'Ready to pass on your first try?'}</p>
          <p className="text-[#94A3B8] text-sm mb-4">{tex.heroSub || 'Select your state above and start practicing for free.'}</p>
          <div className="flex items-center justify-center gap-2 mb-4">
            <span className="text-xs font-semibold text-[#10B981] bg-[#10B981]/10 px-3 py-1 rounded-full border border-[#10B981]/30">
              {tex.footerFree || 'Free to start · no signup'}
            </span>
          </div>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-6 py-3 bg-[#2563EB] text-white rounded-xl font-semibold hover:bg-[#1D4ED8] transition-colors text-sm"
          >
            {tex.startPracticing || 'Start Practicing'}
          </Link>
        </div>

      </main>

      <SupportFooter />

      <footer className="border-t border-[#E2E8F0] py-6 text-center text-xs text-[#94A3B8]">
        <div className="max-w-lg mx-auto px-4">
          <p>DMVSOS.com  ·  Free DMV Practice Tests for All 50 States</p>
          <p className="mt-1">
            <Link href="/terms" className="hover:text-[#2563EB]">{tex.terms || 'Terms'}</Link>
            {' · '}
            <Link href="/privacy" className="hover:text-[#2563EB]">{tex.privacy || 'Privacy'}</Link>
            {' · '}
            <Link href="/manuals" className="hover:text-[#2563EB]">{tex.navManuals || 'Driver Manuals'}</Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
