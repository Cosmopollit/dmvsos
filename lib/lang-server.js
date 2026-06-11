import { cookies } from 'next/headers';

const SUPPORTED = ['en', 'ru', 'es', 'zh', 'ua'];

// Server-side read of the saved language from the dmvsos_lang cookie.
// Used to seed client components' initial render so SSR and the first client
// render agree on the language (no hydration mismatch / flag flicker). Mirrors
// the cookie read in app/layout.js that sets <html lang>. saveLang() in
// lib/lang.js writes the cookie alongside localStorage, so this stays in sync
// with what the client would read after mount.
export async function getServerLang() {
  const store = await cookies();
  const value = store.get('dmvsos_lang')?.value;
  return SUPPORTED.includes(value) ? value : 'en';
}
