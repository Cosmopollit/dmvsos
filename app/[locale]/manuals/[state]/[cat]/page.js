import { notFound } from 'next/navigation';
import { STATE_DISPLAY, STATE_SLUGS, STATE_META } from '@/lib/manual-data';
import { stateCatManualMeta, categoryLabel, localizedAlternates, APP_LANG_TO_OG_LOCALE, APP_LANG_TO_HTML_LANG } from '@/lib/i18n-meta';
import StateCatManualBody from '@/app/manuals/[state]/[cat]/StateCatManualBody';

// Path-segment locale routes for the per-state, per-category manual page.
// EN stays at the root (/manuals/[state]/[cat]); these handle ru/es/zh/ua ONLY,
// with a genuinely localized server-rendered body keyed off the URL segment
// (NOT a cookie), so a cookieless crawler sees real localized content and the
// per-locale URL is independently indexable.
const LOCALES = ['ru', 'es', 'zh', 'ua'];
const VALID_CATS = ['car', 'cdl', 'motorcycle'];

export function generateStaticParams() {
  const params = [];
  for (const locale of LOCALES) {
    for (const state of STATE_SLUGS) {
      for (const cat of VALID_CATS) {
        params.push({ locale, state, cat });
      }
    }
  }
  return params;
}

export async function generateMetadata({ params }) {
  const { locale, state, cat } = await params;
  if (!LOCALES.includes(locale) || !STATE_DISPLAY[state] || !VALID_CATS.includes(cat)) return {};
  const name = STATE_DISPLAY[state];
  const meta = STATE_META[state];
  const vars = { name, abbr: meta.abbr, agency: meta.dmvAbbr, catLabel: categoryLabel(locale, cat) };
  const m = stateCatManualMeta(locale, vars);
  const alts = localizedAlternates(`/manuals/${state}/${cat}`, locale, { hreflang: true });

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
      locale: APP_LANG_TO_OG_LOCALE[locale],
      alternateLocale: Object.values(APP_LANG_TO_OG_LOCALE).filter(l => l !== APP_LANG_TO_OG_LOCALE[locale]),
    },
    twitter: {
      card: 'summary_large_image',
      title: m.title,
      description: m.description,
    },
    other: {
      'content-language': APP_LANG_TO_HTML_LANG[locale],
    },
  };
}

export default async function LocaleStateManualCategoryPage({ params }) {
  const { locale, state, cat } = await params;
  if (!LOCALES.includes(locale)) notFound();
  if (!STATE_DISPLAY[state] || !VALID_CATS.includes(cat)) notFound();
  return <StateCatManualBody lang={locale} state={state} cat={cat} />;
}
