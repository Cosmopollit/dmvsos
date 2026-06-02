// Source of truth for in-app purchase product identifiers.
//
// These IDs must match exactly what's configured in App Store Connect
// + Google Play Console + RevenueCat dashboard. RC delivers the raw
// product_id in its webhook payload, the mobile SDK uses them to
// trigger purchase sheets, and this map turns them into (pass_type,
// kind) so the same fulfilment code as Stripe runs.
//
// Naming convention:
//   dmvsos_<pass_type>_30d           — new pass, 30 days
//   dmvsos_<pass_type>_extension_30d — extends an existing pass by 30 days
//
// pass_type values match active_passes.pass_type ('moto' | 'auto' | 'cdl').
// kind values match purchases.kind ('new' | 'extension').

export const RC_PRODUCT_MAP = Object.freeze({
  dmvsos_moto_30d:           { pass_type: 'moto', kind: 'new' },
  dmvsos_auto_30d:           { pass_type: 'auto', kind: 'new' },
  dmvsos_cdl_30d:            { pass_type: 'cdl',  kind: 'new' },
  dmvsos_moto_extension_30d: { pass_type: 'moto', kind: 'extension' },
  dmvsos_auto_extension_30d: { pass_type: 'auto', kind: 'extension' },
  dmvsos_cdl_extension_30d:  { pass_type: 'cdl',  kind: 'extension' },
});

export function lookupRcProduct(productId) {
  return RC_PRODUCT_MAP[productId] || null;
}
