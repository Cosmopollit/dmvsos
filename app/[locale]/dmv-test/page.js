import { notFound } from 'next/navigation';
import { hubMeta, localizedAlternates, APP_LANG_TO_OG_LOCALE, APP_LANG_TO_HTML_LANG } from '@/lib/i18n-meta';
import DmvTestHubBody from '@/app/dmv-test/DmvTestHubBody';

// Path-segment locale routes for the /dmv-test hub.
// EN stays at the root (/dmv-test); these handle ru/es/zh/ua ONLY, with a
// genuinely localized server-rendered body keyed off the URL segment (NOT a
// cookie), so a cookieless crawler sees real localized content and the
// per-locale URL is independently indexable.
const LOCALES = ['ru', 'es', 'zh', 'ua'];

export function generateStaticParams() {
  return LOCALES.map(locale => ({ locale }));
}

export async function generateMetadata({ params }) {
  const { locale } = await params;
  if (!LOCALES.includes(locale)) return {};
  const yearCurrent = new Date().getFullYear();
  const m = hubMeta(locale, { year: yearCurrent });
  const alts = localizedAlternates('/dmv-test', locale, { hreflang: true });
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

export default async function LocaleDmvTestIndexPage({ params }) {
  const { locale } = await params;
  if (!LOCALES.includes(locale)) notFound();
  return <DmvTestHubBody lang={locale} />;
}
