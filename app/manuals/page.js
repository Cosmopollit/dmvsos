import Link from 'next/link';
import Image from 'next/image';
import { cookies } from 'next/headers';
import { STATE_DISPLAY, STATE_SLUGS, STATE_META } from '@/lib/manual-data';
import { getStatesWithManuals } from '@/lib/manual-parser';
import { manualsHubMeta, localizedAlternates, APP_LANG_TO_OG_LOCALE, APP_LANG_TO_HTML_LANG } from '@/lib/i18n-meta';
import { t } from '@/lib/translations';
import ManualsLibrary from './ManualsLibrary';
import ManualsLangSwitcher from './ManualsLangSwitcher';

const SUPABASE_URL = 'https://yaogndpgnewqffbjrsgz.supabase.co';
const INDEX_URL = `${SUPABASE_URL}/storage/v1/object/public/manuals/manuals-index.json`;

const SUPPORTED_LANGS = ['en', 'ru', 'es', 'zh', 'ua'];
function resolveLang(raw) {
  return SUPPORTED_LANGS.includes(raw) ? raw : 'en';
}

export async function generateMetadata({ searchParams }) {
  const sp = (await searchParams) || {};
  const lang = resolveLang(Array.isArray(sp.lang) ? sp.lang[0] : sp.lang);
  const m = manualsHubMeta(lang);
  const alts = localizedAlternates('/manuals', lang);
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
  const tex = t[serverLang] || t.en;

  const index = await fetchManualIndex();
  const statesWithManuals = getStatesWithManuals();

  // Compute per-state data
  const statesData = STATE_SLUGS.map(slug => {
    const indexData = index?.[slug] || {};
    const categories = Object.keys(indexData);
    const langs = Array.from(new Set(
      Object.values(indexData).flatMap(c => Object.keys(c))
    ));
    const pdfCount = Object.values(indexData).reduce((sum, c) => sum + Object.keys(c).length, 0);
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

  const totalPdfs = statesData.reduce((sum, s) => sum + s.pdfCount, 0);
  const allLangs = new Set(statesData.flatMap(s => s.langs));

  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        name: 'Free DMV Driver Manuals | All 50 States',
        description: 'Official driver handbooks for all 50 US states in up to 27 languages. Free PDF download, no signup.',
        url: 'https://dmvsos.com/manuals',
        publisher: { '@type': 'Organization', name: 'DMVSOS', url: 'https://dmvsos.com' },
        numberOfItems: totalPdfs,
        inLanguage: Array.from(allLangs),
      },
      {
        '@type': 'Dataset',
        name: 'DMVSOS DMV Driver Manual Collection',
        description: 'Aggregated collection of official US state DMV/DOL driver manuals. Includes Car, CDL, and Motorcycle handbooks across all 50 states. Multilingual versions sourced from official state websites and mirrored for direct download.',
        url: 'https://dmvsos.com/manuals',
        license: 'https://dmvsos.com/terms',
        keywords: [
          'DMV manual', 'driver handbook', 'CDL manual', 'motorcycle manual',
          'driver license PDF', 'state DMV PDF', 'free DMV book',
          'spanish DMV', 'russian DMV', 'chinese DMV',
        ],
        creator: { '@type': 'Organization', name: 'DMVSOS', url: 'https://dmvsos.com' },
        distribution: {
          '@type': 'DataDownload',
          encodingFormat: 'application/pdf',
          contentUrl: 'https://dmvsos.com/manuals',
        },
      },
      {
        '@type': 'HowTo',
        name: 'How to find your state DMV driver manual',
        description: 'Find the official DMV driver handbook for your US state in your preferred language.',
        totalTime: 'PT1M',
        step: [
          { '@type': 'HowToStep', position: 1, name: 'Pick your state', text: 'Select your US state from the list below. We have manuals for all 50 states + DC.' },
          { '@type': 'HowToStep', position: 2, name: 'Pick category',   text: 'Choose Car, CDL (Commercial), or Motorcycle handbook.' },
          { '@type': 'HowToStep', position: 3, name: 'Pick language',   text: 'Available in English plus translated versions in Spanish, Russian, Chinese, Ukrainian, and 22 more languages (varies by state).' },
          { '@type': 'HowToStep', position: 4, name: 'Read or download', text: 'View the PDF online or download for offline study. 100% free, no signup.' },
        ],
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home',    item: 'https://dmvsos.com' },
          { '@type': 'ListItem', position: 2, name: 'Manuals', item: 'https://dmvsos.com/manuals' },
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
            <Image src="/logo.png" alt="DMVSOS" width={32} height={32} className="rounded-lg" />
            <span className="text-lg font-bold text-[#0B1C3D]" style={{ letterSpacing: '-0.02em' }}>DMVSOS</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/dmv-test" className="text-xs font-medium text-[#64748B] hover:text-[#2563EB] transition">
              {tex.manualsPracticeTests || 'Practice Tests'}
            </Link>
            <ManualsLangSwitcher currentLang={serverLang} />
          </div>
        </div>
      </header>

      {/* Breadcrumb */}
      <nav className="w-full max-w-xl mx-auto px-4 mb-1" aria-label="Breadcrumb">
        <ol className="flex items-center gap-1.5 text-xs text-[#94A3B8] flex-wrap">
          <li><Link href="/" className="hover:text-[#2563EB]">{tex.home || 'Home'}</Link></li>
          <li>/</li>
          <li className="text-[#1A2B4A] font-medium">{tex.manualsAllManuals || 'Manuals'}</li>
        </ol>
      </nav>

      {/* SEO keyword block: always English, always in the DOM for crawlers
          and AI, visually hidden so the actual user sees only the clean,
          localized warm hero below. */}
      <p className="sr-only">
        Free DMV driver manuals: the most complete free library of official US state
        DMV / DOL driver handbooks online. All 50 states plus Washington DC, up to
        {' '}{allLangs.size} languages, covering Car, CDL, and Motorcycle. {totalPdfs} PDF
        files total, sourced from official state DMV websites. No signup, no paywall,
        direct PDF download, read online or download free.
      </p>

      {/* Warm, localized hero: single visible h1 */}
      <section className="w-full max-w-xl mx-auto px-4 pt-3 pb-6 text-center">
        <h1
          className="text-[26px] sm:text-3xl font-bold text-[#0B1C3D] mb-3 leading-tight whitespace-pre-line"
          style={{ letterSpacing: '-0.02em' }}
        >
          {tex.manualsHeroTitle || 'Free DMV Driver Manuals'}
        </h1>
        <p className="text-[15px] text-[#475569] leading-relaxed max-w-md mx-auto mb-4">
          {tex.manualsWarmSub}
        </p>
        <p className="text-xs text-[#94A3B8] font-medium">
          {(tex.manualsWarmStats || '{pdfs} manuals · 50 states · {langs} languages · always free')
            .replace('{pdfs}', String(totalPdfs))
            .replace('{langs}', String(allLangs.size))}
        </p>
      </section>

      {/* Library UI | client component with search + filter */}
      <ManualsLibrary
        statesData={statesData}
        serverLang={serverLang}
      />

      {/* Footer */}
      <footer className="w-full max-w-lg mx-auto px-4 pb-8">
        <p className="text-xs text-[#94A3B8] text-center leading-relaxed">
          DMVSOS.com · Free DMV Practice Tests &amp; Driver Manuals for All 50 States
        </p>
      </footer>
    </main>
  );
}
