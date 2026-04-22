// Hreflang alternates for Next.js metadata.alternates.languages
//
// Google uses <link rel="alternate" hreflang> tags to understand that
// /?lang=ru and /?lang=en are language variants of the same page. Without
// these tags the non-EN versions get folded into the EN result and never
// rank for their own language queries.
//
// NOTE: internal app uses "ua" for Ukrainian, but the valid ISO-639 code
// is "uk". We emit "uk" for Google, pass "ua" in our URL.

const SITE_URL = 'https://www.dmvsos.com';

const LANG_MAP = {
  en: 'en',
  ru: 'ru',
  es: 'es',
  zh: 'zh-Hans',
  ua: 'uk',
};

/**
 * Build alternates object for a given path.
 * @param {string} pathname - e.g. '/', '/dmv-test', '/dmv-test/florida'
 * @returns {{canonical: string, languages: Record<string, string>}}
 */
export function getHreflangAlternates(pathname) {
  const canonical = `${SITE_URL}${pathname}`;
  const languages = {
    'x-default': canonical,
  };
  for (const [appCode, isoCode] of Object.entries(LANG_MAP)) {
    languages[isoCode] = appCode === 'en' ? canonical : `${canonical}?lang=${appCode}`;
  }
  return { canonical, languages };
}
