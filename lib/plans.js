/**
 * Single source of truth for pricing, plan icons, and per-type metadata.
 *
 * Import this anywhere prices, plan names, or per-category styling are shown.
 * To change a price → edit ONLY this file. Every page picks it up automatically.
 *
 * Translations for labels around the price (e.g. "Get it", "30-day access")
 * live in lib/translations.js; this file is language-agnostic.
 */

// pass_type values stored in active_passes.pass_type / purchases.pass_type.
export const PASS_TYPES = ['moto', 'auto', 'cdl'];

// Category strings used in URLs and test config.
// URL uses "dmv"/"cdl"/"moto"; DB uses "car"/"cdl"/"motorcycle".
// This map normalizes any of those to the canonical pass_type.
export function categoryToPassType(category) {
  if (!category) return 'auto';
  const c = String(category).toLowerCase();
  if (c === 'moto' || c === 'motorcycle') return 'moto';
  if (c === 'cdl') return 'cdl';
  return 'auto'; // car, dmv → auto
}

// Per-pass-type display + Stripe identifiers.
export const PASS_META = {
  moto: {
    id: 'onetime_moto',
    pass_type: 'moto',
    name: 'Moto Pass',
    icon: '🏍️',
    price: '$19.99',
    priceCents: 1999,
    style: 'outline',     // outline | blue | gold
    badge: null,
    features: [
      'Full Motorcycle question bank',
      'All 50 states · 5 languages',
      'All exam modes unlocked',
      'Real exam simulation',
      'Detailed explanations',
    ],
  },
  auto: {
    id: 'onetime_auto',
    pass_type: 'auto',
    name: 'Auto Pass',
    icon: '🚗',
    price: '$29.99',
    priceCents: 2999,
    style: 'blue',
    badge: 'MOST POPULAR',
    features: [
      'Full Car question bank',
      'All 50 states · 5 languages',
      'All exam modes unlocked',
      'Real exam simulation (60 min)',
      'Detailed explanations',
    ],
  },
  cdl: {
    id: 'onetime_cdl',
    pass_type: 'cdl',
    name: 'CDL Pro',
    icon: '🚛',
    price: '$49.99',
    priceCents: 4999,
    style: 'gold',
    badge: '🛡️ GUARANTEED',
    features: [
      'Full CDL question bank',
      'Car tests included',
      'All 50 states · 5 languages',
      'All exam modes unlocked',
      'Pass or 100% refund',
    ],
  },
};

// Plans array preserved for old code that iterated PLANS.
// Order matters for UI: Moto · Auto (flagship) · CDL.
export const PLANS = [PASS_META.moto, PASS_META.auto, PASS_META.cdl];

// Lookup by category — used by /test, /result, and any "current test" context.
export function planForCategory(category) {
  return PASS_META[categoryToPassType(category)];
}

// Lookup by pass_type — used by /profile and webhook.
export function planForPassType(passType) {
  return PASS_META[passType] || null;
}

// Extension constants.
export const EXTENSION = {
  id: 'extension',
  price: '$9.99',
  priceCents: 999,
  durationDays: 30,
};

// Free price label shown in CTAs like "Unlock from $X".
export const MIN_PRICE = PASS_META.moto.price; // $19.99
