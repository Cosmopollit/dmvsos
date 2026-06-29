import { notFound } from 'next/navigation';
import { getServerLang } from '@/lib/lang-server';
import { STATE_DISPLAY, STATE_SLUGS, STATE_META } from '@/lib/manual-data';
import { stateManualMeta, localizedAlternates, APP_LANG_TO_OG_LOCALE, APP_LANG_TO_HTML_LANG } from '@/lib/i18n-meta';
import StateManualBody from './StateManualBody';

const SUPPORTED_LANGS = ['en', 'ru', 'es', 'zh', 'ua'];
function resolveLang(raw) {
  return SUPPORTED_LANGS.includes(raw) ? raw : 'en';
}

export function generateStaticParams() {
  return STATE_SLUGS.map(state => ({ state }));
}

export async function generateMetadata({ params, searchParams }) {
  const { state } = await params;
  const sp = (await searchParams) || {};
  const lang = resolveLang(Array.isArray(sp.lang) ? sp.lang[0] : sp.lang);
  const name = STATE_DISPLAY[state];
  if (!name) return {};
  const meta = STATE_META[state];
  const vars = { name, abbr: meta.abbr, agency: meta.dmvAbbr };
  const m = stateManualMeta(lang, vars);
  const alts = localizedAlternates(`/manuals/${state}`, lang, { hreflang: true });

  return {
    title: m.title,
    description: m.description,
    alternates: alts,
    openGraph: {
      title: m.title,
      description: m.description,
      url: alts.canonical,
      siteName: 'DMVSOS',
      type: 'article',
      locale: APP_LANG_TO_OG_LOCALE[lang],
      alternateLocale: Object.values(APP_LANG_TO_OG_LOCALE).filter(l => l !== APP_LANG_TO_OG_LOCALE[lang]),
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
// indexable variants live under /[locale]/manuals/[state].
export default async function StateManualPage({ params }) {
  const { state } = await params;
  if (!STATE_DISPLAY[state]) notFound();
  const lang = await getServerLang();
  return <StateManualBody lang={lang} state={state} />;
}
