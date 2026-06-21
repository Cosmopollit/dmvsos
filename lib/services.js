// "Find help nearby" concierge — Pro-only services hub. Port of mobile
// src/lib/services.ts. Same honesty rule as driving-schools: we never invent
// providers. A category turns the user's state + app language into a
// language-matched map / web search.
//
// Lead-logging: every search inserts into service_leads (migration 019) as a
// fire-and-forget signal of demand — never blocks the UX.

import { supabase } from '@/lib/supabase';
import { STATE_DISPLAY } from '@/lib/manual-data';

// id, title/desc keys, icon (emoji here since web doesn't have RN icons),
// status ('live' → has its own page, 'soon' → uses generic /service-search),
// route for 'live', queryHead for 'soon' (the EN phrase Maps matches best).
export const SERVICE_CATEGORIES = [
  {
    id: 'instructor',
    titleKey: 'svcInstructorTitle',
    descKey: 'svcInstructorDesc',
    icon: '🚗',
    status: 'live',
    route: '/driving-schools',
  },
  {
    id: 'courses',
    titleKey: 'svcCoursesTitle',
    descKey: 'svcCoursesDesc',
    icon: '📚',
    status: 'soon',
    queryHead: 'traffic school online course',
  },
  {
    id: 'translator_notary',
    titleKey: 'svcTranslatorTitle',
    descKey: 'svcTranslatorDesc',
    icon: '📋',
    status: 'soon',
    queryHead: 'translator and notary public',
  },
  {
    id: 'car_insurance',
    titleKey: 'svcCarInsuranceTitle',
    descKey: 'svcCarInsuranceDesc',
    icon: '🛡️',
    status: 'soon',
    queryHead: 'auto insurance agency',
  },
];

export function serviceById(id) {
  return SERVICE_CATEGORIES.find(s => s.id === id);
}

const LANG_QUERY_ADJ = {
  en: '',
  ru: 'Russian',
  es: 'Spanish',
  zh: 'Chinese',
  ua: 'Ukrainian',
};

export function buildServiceQuery(queryHead, stateSlug, lang) {
  const stateName = STATE_DISPLAY[stateSlug] ?? '';
  const adj = LANG_QUERY_ADJ[lang] ?? '';
  const head = adj ? `${adj} speaking ${queryHead}` : queryHead;
  return [head, stateName].filter(Boolean).join(' ');
}

export function serviceMapsUrl(queryHead, stateSlug, lang) {
  const q = encodeURIComponent(buildServiceQuery(queryHead, stateSlug, lang));
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}

export function serviceWebUrl(queryHead, stateSlug, lang) {
  const q = encodeURIComponent(buildServiceQuery(queryHead, stateSlug, lang));
  return `https://www.google.com/search?q=${q}`;
}

// Demand-capture insert. Fire-and-forget — must never block or break the
// user's search. Silently no-ops if the table or network is unavailable.
export async function logServiceLead(serviceId, state, lang, source = 'hub_search') {
  try {
    const { data } = await supabase.auth.getSession();
    await supabase.from('service_leads').insert({
      user_id: data?.session?.user?.id ?? null,
      service_id: serviceId,
      state: state || null,
      lang,
      platform: 'web',
      source,
    });
  } catch {
    /* best-effort; never surface */
  }
}
