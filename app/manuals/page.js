import { getServerLang } from '@/lib/lang-server';
import { manualsHubMeta, localizedAlternates, APP_LANG_TO_OG_LOCALE, APP_LANG_TO_HTML_LANG } from '@/lib/i18n-meta';
import ManualsHubBody from './ManualsHubBody';

const SUPPORTED_LANGS = ['en', 'ru', 'es', 'zh', 'ua'];
function resolveLang(raw) {
  return SUPPORTED_LANGS.includes(raw) ? raw : 'en';
}

export async function generateMetadata({ searchParams }) {
  const sp = (await searchParams) || {};
  const lang = resolveLang(Array.isArray(sp.lang) ? sp.lang[0] : sp.lang);
  const m = manualsHubMeta(lang);
  const alts = localizedAlternates('/manuals', lang, { hreflang: true });
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

// English at the root: body language comes from the saved-language cookie
// (same as the homepage), so a returning RU/ES/ZH/UA visitor sees a localized
// page; a cookieless crawler resolves to 'en'. The genuinely localized,
// indexable variants live under /[locale]/manuals.
export default async function ManualsPage() {
  const lang = await getServerLang();
  return <ManualsHubBody lang={lang} />;
}
