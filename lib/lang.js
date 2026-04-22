const STORAGE_KEY = 'dmvsos_lang';
const COOKIE_KEY = 'dmvsos_lang';
const DISMISS_KEY = 'dmvsos_lang_banner_dismissed';

const SUPPORTED = ['en', 'ru', 'es', 'zh', 'ua'];

export function getSavedLang() {
  if (typeof window === 'undefined') return 'en';
  return localStorage.getItem(STORAGE_KEY) || 'en';
}

export function hasSavedLang() {
  if (typeof window === 'undefined') return false;
  return !!localStorage.getItem(STORAGE_KEY);
}

export function saveLang(lang) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, lang);
  document.cookie = `${COOKIE_KEY}=${lang};path=/;max-age=31536000;SameSite=Lax`;
}

// Best-match browser language to one of our supported codes.
// Returns null if none of navigator.languages is supported (stay on EN).
export function detectBrowserLang() {
  if (typeof navigator === 'undefined') return null;
  const preferred = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const tag of preferred) {
    if (!tag) continue;
    const lower = tag.toLowerCase();
    const primary = lower.split('-')[0];
    // Ukrainian uses ISO 'uk'; we internally use 'ua'
    if (primary === 'uk') return 'ua';
    // Chinese variants (zh-CN, zh-Hans, zh-TW, zh-Hant) all map to 'zh'
    if (primary === 'zh') return 'zh';
    if (SUPPORTED.includes(primary)) return primary;
  }
  return null;
}

export function isLangBannerDismissed() {
  if (typeof window === 'undefined') return true;
  return !!localStorage.getItem(DISMISS_KEY);
}

export function dismissLangBanner() {
  if (typeof window === 'undefined') return;
  localStorage.setItem(DISMISS_KEY, '1');
}
