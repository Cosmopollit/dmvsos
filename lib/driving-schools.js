// Driving-school finder helpers — port of mobile src/lib/driving-schools.ts.
//
// We do NOT ship fabricated listings. The primary path is a language-matched
// Google Maps / web search the user runs themselves; CURATED is hand-verified
// rows and starts empty until we have real entries to add.

import { STATE_DISPLAY } from '@/lib/manual-data';

const LANG_QUERY_ADJ = {
  en: '',
  ru: 'Russian',
  es: 'Spanish',
  zh: 'Chinese',
  ua: 'Ukrainian',
};

// Hand-verified entries only. Empty until we have real data.
// Shape: { name, stateSlug, langs: string[], phone?, address?, url?, note? }
export const CURATED_SCHOOLS = [];

export function curatedFor(stateSlug, lang) {
  if (!stateSlug) return [];
  return CURATED_SCHOOLS.filter(
    s => s.stateSlug === stateSlug && (lang === 'en' || s.langs.includes(lang)),
  );
}

export function buildSearchQuery(stateSlug, lang) {
  const stateName = STATE_DISPLAY[stateSlug] ?? '';
  const adj = LANG_QUERY_ADJ[lang] ?? '';
  const head = adj ? `${adj} speaking driving school` : 'driving school';
  return [head, stateName].filter(Boolean).join(' ');
}

export function mapsSearchUrl(stateSlug, lang) {
  const q = encodeURIComponent(buildSearchQuery(stateSlug, lang));
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}

export function webSearchUrl(stateSlug, lang) {
  const q = encodeURIComponent(buildSearchQuery(stateSlug, lang));
  return `https://www.google.com/search?q=${q}`;
}
