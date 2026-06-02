-- Migration 016: RevenueCat as a second purchase source
-- Created: 2026-06-02
--
-- The mobile app uses native IAP (Apple StoreKit + Google Play Billing)
-- through RevenueCat. RC fires a webhook to /api/revenuecat-webhook that
-- writes the same shape as the existing Stripe webhook — same purchases
-- + active_passes rows — so AuthContext, profile views, and the rest of
-- the app do not need to know which payment rail the customer used.
--
-- Schema change:
--   1. purchases.stripe_payment_intent is no longer NOT NULL; an IAP
--      row has no Stripe PI.
--   2. New column revenuecat_transaction_id TEXT UNIQUE for IAP rows.
--   3. New column source TEXT NOT NULL DEFAULT 'stripe' with a CHECK so
--      reports can split by rail. Existing Stripe rows stay 'stripe'.
--   4. CHECK: exactly one of (stripe_payment_intent, revenuecat_transaction_id)
--      must be present.
--
-- Idempotency on the webhook side uses revenuecat_transaction_id the
-- same way the Stripe path uses stripe_payment_intent.

BEGIN;

-- Drop the NOT NULL on stripe_payment_intent so IAP rows can omit it.
ALTER TABLE purchases
  ALTER COLUMN stripe_payment_intent DROP NOT NULL;

ALTER TABLE purchases
  ADD COLUMN IF NOT EXISTS revenuecat_transaction_id TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'stripe';

-- Unique on the RC id (only constrains rows that actually set it).
CREATE UNIQUE INDEX IF NOT EXISTS purchases_revenuecat_transaction_id_uniq
  ON purchases (revenuecat_transaction_id)
  WHERE revenuecat_transaction_id IS NOT NULL;

-- Enforce that every row has exactly one payment-rail id.
ALTER TABLE purchases
  ADD CONSTRAINT purchases_one_rail
    CHECK (
      (stripe_payment_intent     IS NOT NULL AND revenuecat_transaction_id IS NULL)
      OR
      (stripe_payment_intent     IS NULL     AND revenuecat_transaction_id IS NOT NULL)
    ) NOT VALID;

-- Restrict source values. NOT VALID first so existing rows do not block
-- the migration, then validate explicitly (every existing row is 'stripe'
-- via the default).
ALTER TABLE purchases
  ADD CONSTRAINT purchases_source_known
    CHECK (source IN ('stripe', 'revenuecat')) NOT VALID;

ALTER TABLE purchases VALIDATE CONSTRAINT purchases_one_rail;
ALTER TABLE purchases VALIDATE CONSTRAINT purchases_source_known;

COMMIT;

-- Verification queries (run manually after migration):
-- SELECT source, COUNT(*) FROM purchases GROUP BY source;
-- SELECT COUNT(*) FROM purchases WHERE stripe_payment_intent IS NULL AND revenuecat_transaction_id IS NULL;  -- expect 0
