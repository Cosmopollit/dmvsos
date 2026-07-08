const STORAGE_KEY = 'dmvsos_lang';
const COOKIE_KEY = 'dmvsos_lang';
const DISMISS_KEY = 'dmvsos_lang_banner_dismissed';

const SUPPORTED = ['en', 'ru', 'es', 'zh', 'ua'];

// Browsers with "Block all cookies" (Safari, Chrome incognito with the strict
// setting) THROW on any window.localStorage property access, not just on
// setItem. These helpers make every read/write in this file safe: reads fall
// back, writes silently no-op. This file runs during render of ~12 pages, so
// an unguarded access here takes the whole site down for those users.
function safeStorageGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function safeStorageSet(key, value) {
  try { localStorage.setItem(key, value); } catch { /* blocked storage */ }
}

function safeCookieSet(value) {
  try { document.cookie = value; } catch { /* blocked cookies */ }
}

export function getSavedLang() {
  if (typeof window === 'undefined') return 'en';
  return safeStorageGet(STORAGE_KEY) || 'en';
}

export function hasSavedLang() {
  if (typeof window === 'undefined') return false;
  return !!safeStorageGet(STORAGE_KEY);
}

export function saveLang(lang) {
  if (typeof window === 'undefined') return;
  safeStorageSet(STORAGE_KEY, lang);
  safeCookieSet(`${COOKIE_KEY}=${lang};path=/;max-age=31536000;SameSite=Lax`);
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
  return !!safeStorageGet(DISMISS_KEY);
}

export function dismissLangBanner() {
  if (typeof window === 'undefined') return;
  safeStorageSet(DISMISS_KEY, '1');
}
