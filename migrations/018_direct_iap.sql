-- Migration 018: direct IAP (no RevenueCat) as a purchase source
-- Created: 2026-06-09
--
-- The mobile app moved off RevenueCat to direct StoreKit / Play Billing
-- (lean stack, no third-party cut). /api/verify-iap validates Apple/Google
-- receipts itself and grants the same purchases + active_passes rows as
-- the Stripe and (now retired) RevenueCat webhooks.
--
-- No new id column is needed: the native Apple/Google transaction id is
-- stored in the existing purchases.revenuecat_transaction_id column (it
-- always held the native id; RC merely relayed it). That keeps the
-- purchases_one_rail CHECK happy (exactly one of stripe_payment_intent /
-- revenuecat_transaction_id) and reuses its UNIQUE index for idempotency.
--
-- The only change: teach the source CHECK the two new rails so reports
-- can split Apple vs Google vs Stripe.

BEGIN;

ALTER TABLE purchases DROP CONSTRAINT IF EXISTS purchases_source_known;

ALTER TABLE purchases
  ADD CONSTRAINT purchases_source_known
    CHECK (source IN ('stripe', 'revenuecat', 'apple', 'google')) NOT VALID;

ALTER TABLE purchases VALIDATE CONSTRAINT purchases_source_known;

COMMIT;

-- Verification (run manually after migration):
-- SELECT source, COUNT(*) FROM purchases GROUP BY source;
