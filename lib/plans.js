/**
 * Single source of truth for all plan pricing and configuration.
 * Import this in any page that shows pricing, plan names, or features.
 *
 * One-time pricing model (no subscriptions):
 * - Each pass unlocks 30 days of access
 * - $9.99 extension adds another 30 days
 */

export const PLANS = [
  {
    id: 'onetime_moto',
    name: 'Moto Pass',
    icon: '🏍️',
    price: '$19.99',
    priceNum: 19.99,
    period: ' · 30 days',
    style: 'outline',   // outline | blue | gold
    badge: null,
    features: [
      '✓ Full Motorcycle question bank',
      '✓ All 50 states · 5 languages',
      '✓ All exam modes unlocked',
      '✓ Real exam simulation',
      '✓ Detailed explanations',
    ],
  },
  {
    id: 'onetime_auto',
    name: 'Auto Pass',
    icon: '🚗',
    price: '$29.99',
    priceNum: 29.99,
    period: ' · 30 days',
    style: 'blue',
    badge: 'MOST POPULAR',
    features: [
      '✓ Full Car question bank',
      '✓ All 50 states · 5 languages',
      '✓ All exam modes unlocked',
      '✓ Real exam simulation (60 min)',
      '✓ Detailed explanations',
    ],
  },
  {
    id: 'onetime_cdl',
    name: 'CDL Pro',
    icon: '🚛',
    price: '$49.99',
    priceNum: 49.99,
    period: ' · 30 days',
    style: 'gold',
    badge: '🛡️ GUARANTEED',
    features: [
      '✓ Full CDL question bank',
      '✓ Car tests included',
      '✓ All 50 states · 5 languages',
      '✓ All exam modes unlocked',
      '🛡️ Pass or 100% refund',
    ],
  },
];

// Cheapest plan price for CTAs like "Unlock from $X"
export const MIN_PRICE = '$19.99';
export const MIN_PRICE_LABEL = 'from $19.99 · 30 days';
