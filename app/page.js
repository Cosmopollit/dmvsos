import { getServerLang } from '@/lib/lang-server';
import HomeClient from './HomeClient';

// Server wrapper: read the saved language from the cookie and hand it to the
// client home component as initialLang. This makes the server-rendered flag
// match the client's first render (no hydration mismatch, no flag flicker on
// non-EN loads). All interactive UI lives in HomeClient ('use client').
export default async function Home() {
  const initialLang = await getServerLang();
  return <HomeClient initialLang={initialLang} />;
}
