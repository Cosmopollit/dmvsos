const STORAGE_KEY = 'dmvsos_lang';
const COOKIE_KEY = 'dmvsos_lang';

export function getSavedLang() {
  if (typeof window === 'undefined') return 'en';
  return localStorage.getItem(STORAGE_KEY) || 'en';
}

export function saveLang(lang) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, lang);
  document.cookie = `${COOKIE_KEY}=${lang};path=/;max-age=31536000;SameSite=Lax`;
}
