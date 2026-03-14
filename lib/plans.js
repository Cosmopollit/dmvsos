/**
 * Single source of truth for all plan pricing and configuration.
 * Import this in any page that shows pricing, plan names, or features.
 *
 * When you change a price or plan — update ONLY this file.
 */

export const PLANS = [
  {
    id: 'moto_pass',
    name: 'Moto Pass',
    icon: '🏍️',
    price: '$9.99',
    priceNum: 9.99,
    period: '/mo',
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
    id: 'car_pass',
    name: 'Auto Pass',
    icon: '🚗',
    price: '$29.99',
    priceNum: 29.99,
    period: '/mo',
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
    id: 'cdl_pass',
    name: 'CDL Pro',
    icon: '🚛',
    price: '$59.99',
    priceNum: 59.99,
    period: '/mo',
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

// Cheapest plan price for CTAs like "Unlock from $X/mo"
export const MIN_PRICE = '$9.99';
export const MIN_PRICE_LABEL = '$9.99/mo';
