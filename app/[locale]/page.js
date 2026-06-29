import { notFound } from 'next/navigation';
import HomeClient from '@/app/HomeClient';
import { homeMeta, localizedAlternates, APP_LANG_TO_OG_LOCALE, APP_LANG_TO_HTML_LANG } from '@/lib/i18n-meta';

// Path-segment locale routes for the homepage.
// EN stays at the root (/); these handle ru/es/zh/ua ONLY. HomeClient renders
// the body server-side from initialLang, so passing the URL-segment locale (NOT
// a cookie) gives a cookieless crawler a genuinely localized homepage and the
// per-locale URL is independently indexable.
const LOCALES = ['ru', 'es', 'zh', 'ua'];

export function generateStaticParams() {
  return LOCALES.map(locale => ({ locale }));
}

export async function generateMetadata({ params }) {
  const { locale } = await params;
  if (!LOCALES.includes(locale)) return {};
  const m = homeMeta(locale);
  const alts = localizedAlternates('/', locale, { hreflang: true });
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
      images: ['/og-image.png'],
    },
    other: {
      'content-language': APP_LANG_TO_HTML_LANG[locale],
    },
  };
}

export default async function LocaleHome({ params }) {
  const { locale } = await params;
  if (!LOCALES.includes(locale)) notFound();
  return <HomeClient initialLang={locale} />;
}
