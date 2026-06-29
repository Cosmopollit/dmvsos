import { notFound } from 'next/navigation';
import { STATE_DISPLAY, STATE_SLUGS, STATE_META } from '@/lib/manual-data';
import { stateMeta, localizedAlternates, APP_LANG_TO_OG_LOCALE, APP_LANG_TO_HTML_LANG } from '@/lib/i18n-meta';
import StateBody, { examFor } from '@/app/dmv-test/[state]/StateBody';

// Path-segment locale routes for the state DMV-test landing page.
// EN stays at the root (/dmv-test/[state]); these handle ru/es/zh/ua ONLY,
// with a genuinely localized server-rendered body keyed off the URL segment
// (NOT a cookie), so a cookieless crawler sees real Russian/Spanish/etc.
// content and the per-locale URL is independently indexable.
const LOCALES = ['ru', 'es', 'zh', 'ua'];

export function generateStaticParams() {
  const params = [];
  for (const locale of LOCALES) {
    for (const state of STATE_SLUGS) {
      params.push({ locale, state });
    }
  }
  return params;
}

export async function generateMetadata({ params }) {
  const { locale, state } = await params;
  if (!LOCALES.includes(locale) || !STATE_DISPLAY[state]) return {};
  const name = STATE_DISPLAY[state];
  const meta = STATE_META[state];
  const exam = examFor(state);
  const year = new Date().getFullYear();
  const vars = { name, abbr: meta.abbr, agency: meta.dmvAbbr, questions: exam.questions, year };
  const m = stateMeta(locale, vars);
  const alts = localizedAlternates(`/dmv-test/${state}`, locale, { hreflang: true });

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
      locale: APP_LANG_TO_OG_LOCALE[locale],
      alternateLocale: Object.values(APP_LANG_TO_OG_LOCALE).filter(l => l !== APP_LANG_TO_OG_LOCALE[locale]),
      images: [{ url: '/og-image.png', width: 1200, height: 630, alt: m.title }],
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

export default async function LocaleStateDmvTestPage({ params }) {
  const { locale, state } = await params;
  if (!LOCALES.includes(locale)) notFound();
  if (!STATE_DISPLAY[state]) notFound();
  return <StateBody lang={locale} state={state} />;
}
