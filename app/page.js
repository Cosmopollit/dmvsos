import { getServerLang } from '@/lib/lang-server';
import HomeClient from './HomeClient';
import { homeMeta, localizedAlternates, APP_LANG_TO_OG_LOCALE, APP_LANG_TO_HTML_LANG } from '@/lib/i18n-meta';

const SUPPORTED_LANGS = ['en', 'ru', 'es', 'zh', 'ua'];
function resolveLang(raw) {
  return SUPPORTED_LANGS.includes(raw) ? raw : 'en';
}

// Per-language meta for the homepage. When a user hits /?lang=ru the page
// returns Russian title/description/og:locale + a self-canonical pointing to
// the ?lang=ru variant, so Google indexes it as its own page (not a folded
// duplicate of the EN default).
export async function generateMetadata({ searchParams }) {
  const sp = (await searchParams) || {};
  const lang = resolveLang(Array.isArray(sp.lang) ? sp.lang[0] : sp.lang);
  const m = homeMeta(lang);
  const alts = localizedAlternates('/', lang, { hreflang: true });
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
      images: ['/og-image.png'],
    },
    other: {
      'content-language': APP_LANG_TO_HTML_LANG[lang],
    },
  };
}

// Server wrapper: read the saved language from the cookie and hand it to the
// client home component as initialLang. This makes the server-rendered flag
// match the client's first render (no hydration mismatch, no flag flicker on
// non-EN loads). All interactive UI lives in HomeClient ('use client').
export default async function Home() {
  const initialLang = await getServerLang();
  return <HomeClient initialLang={initialLang} />;
}
