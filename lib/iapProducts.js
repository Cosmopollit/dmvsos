// Source of truth for in-app purchase product identifiers (direct IAP,
// no RevenueCat). These IDs must match App Store Connect + Google Play
// exactly. The mobile app performs the purchase via StoreKit / Play
// Billing, then POSTs the signed receipt + product_id to
// /api/verify-iap, which validates it and maps the product here to
// (pass_type, kind) so the same fulfilment code as the Stripe webhook
// runs.
//
// pass_type values match active_passes.pass_type ('moto' | 'auto' | 'cdl').
// kind values match purchases.kind ('new' | 'extension').
//
// extension_30d is a SINGLE product that extends whichever category the
// user already owns; the app sends that category alongside the receipt,
// so its pass_type is resolved at request time (null here).
//
// IDs below are the ones created in App Store Connect on 2026-06-09
// (app 6737458998). Mirror the same IDs in Google Play Console.

export const IAP_PRODUCT_MAP = Object.freeze({
  moto_pass_30d: { pass_type: 'moto', kind: 'new' },
  auto_pass_30d: { pass_type: 'auto', kind: 'new' },
  cdl_pro_30d:   { pass_type: 'cdl',  kind: 'new' },
  extension_30d: { pass_type: null,   kind: 'extension' },
});

export function lookupIapProduct(productId) {
  return IAP_PRODUCT_MAP[productId] || null;
}

// Back-compat aliases: app/api/revenuecat-webhook/route.js still imports
// these. RevenueCat is retired in favour of direct IAP, so that webhook
// is deprecated and should not fire, but keep the exports so the import
// never throws.
export const RC_PRODUCT_MAP = IAP_PRODUCT_MAP;
export function lookupRcProduct(productId) {
  return lookupIapProduct(productId);
}
