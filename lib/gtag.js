/**
 * Thin GA4 (gtag) helpers for ecommerce / conversion events.
 *
 * Safe to call from anywhere: every helper no-ops when gtag is not on the page
 * (dev builds, SSR, ad-blockers) and swallows any throw. Analytics must never
 * break the checkout UX, so a failure here can't bubble into the purchase flow.
 *
 * Conversion values come from lib/plans.js (the single source of truth for
 * prices), so a price change there flows straight into what GA4 reports.
 */
import { PASS_META, EXTENSION } from '@/lib/plans';

function fire(name, params) {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return;
  try {
    window.gtag('event', name, params);
  } catch {
    /* best-effort analytics — never surface to the user */
  }
}

// Resolve { value, item } for a pass purchase/checkout. `kind` is 'new' for a
// fresh pass, or 'extension' for a 30-day renewal ($9.99 regardless of type).
function ecommerce(passType, kind) {
  if (kind === 'extension') {
    const name = PASS_META[passType]?.name || passType;
    const value = EXTENSION.priceCents / 100;
    return {
      value,
      item: { item_id: `extension_${passType}`, item_name: `${name} extension`, price: value, quantity: 1 },
    };
  }
  const meta = PASS_META[passType];
  if (!meta) return null;
  const value = meta.priceCents / 100;
  return {
    value,
    item: { item_id: meta.id, item_name: meta.name, price: value, quantity: 1 },
  };
}

/** Funnel step: user clicked a buy/extend CTA and is heading to Stripe. */
export function trackBeginCheckout(passType, kind = 'new') {
  const e = ecommerce(passType, kind);
  if (!e) return;
  fire('begin_checkout', { currency: 'USD', value: e.value, items: [e.item] });
}

/** Conversion: Stripe redirected back to /success. GA4 dedupes by transaction_id. */
export function trackPurchase({ transactionId, passType, kind = 'new' }) {
  if (!transactionId) return;
  const e = ecommerce(passType, kind);
  if (!e) return;
  fire('purchase', { transaction_id: transactionId, currency: 'USD', value: e.value, items: [e.item] });
}
