-- Migration 001: One-time pricing model (per-type parallel passes)
-- Created: 2026-05-13
-- Reverts subscription model in favor of one-time payments with per-pass-type
-- expirations. Each user can have Moto, Auto, CDL active in parallel.

-- ─── active_passes ─────────────────────────────────────────────────────────
-- One row per (user, pass_type). UPSERT on purchase or extension.
CREATE TABLE IF NOT EXISTS active_passes (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pass_type TEXT NOT NULL CHECK (pass_type IN ('moto','auto','cdl')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, pass_type)
);

CREATE INDEX IF NOT EXISTS idx_active_passes_expires
  ON active_passes(expires_at);

-- Trigger to keep updated_at fresh
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS active_passes_updated_at ON active_passes;
CREATE TRIGGER active_passes_updated_at
  BEFORE UPDATE ON active_passes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── purchases ─────────────────────────────────────────────────────────────
-- Append-only history. Source of truth for refunds, CDL guarantee tracking.
CREATE TABLE IF NOT EXISTS purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  email TEXT,                                   -- snapshot at purchase time
  pass_type TEXT NOT NULL CHECK (pass_type IN ('moto','auto','cdl')),
  kind TEXT NOT NULL CHECK (kind IN ('new','extension')),
  amount_cents INT NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL DEFAULT 'usd',
  stripe_payment_intent TEXT NOT NULL UNIQUE,   -- idempotency anchor
  stripe_checkout_session TEXT,
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  prev_expires_at TIMESTAMPTZ,                  -- state before this purchase
  new_expires_at TIMESTAMPTZ NOT NULL,
  refunded_at TIMESTAMPTZ,
  refund_reason TEXT,
  -- CDL Pass Guarantee — per-purchase. Only applicable when pass_type='cdl' AND kind='new'.
  guarantee_used_at TIMESTAMPTZ,
  guarantee_resolution TEXT CHECK (guarantee_resolution IN ('refund','extension')
                                   OR guarantee_resolution IS NULL)
);

CREATE INDEX IF NOT EXISTS idx_purchases_user
  ON purchases(user_id, purchased_at DESC);
CREATE INDEX IF NOT EXISTS idx_purchases_type
  ON purchases(user_id, pass_type, purchased_at DESC);
CREATE INDEX IF NOT EXISTS idx_purchases_email
  ON purchases(email);

-- ─── user_sessions ─────────────────────────────────────────────────────────
-- Anti-sharing: max 2 devices per user. Cleanup older sessions on 3rd login.
CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_fingerprint TEXT NOT NULL,
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_user
  ON user_sessions(user_id, last_active_at DESC);

-- ─── RLS policies ──────────────────────────────────────────────────────────
ALTER TABLE active_passes ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases     ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;

-- Users can read their own state
CREATE POLICY "users read own passes"     ON active_passes
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "users read own purchases"  ON purchases
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "users read own sessions"   ON user_sessions
  FOR SELECT USING (user_id = auth.uid());

-- Users can delete their own sessions (logout)
CREATE POLICY "users delete own sessions" ON user_sessions
  FOR DELETE USING (user_id = auth.uid());

-- All writes to active_passes/purchases go through service role (webhooks).
-- No INSERT/UPDATE/DELETE policy → only service role can mutate.

-- ─── Backfill from profiles ────────────────────────────────────────────────
-- Convert legacy single-pass model to per-type rows.
-- profiles.plan_type values map: car_pass→auto, moto_pass→moto, cdl_pass→cdl.
-- Legacy plans (quick_pass/full_prep/guaranteed_pass) → auto (closest match).
-- Only backfill if user has an active (non-expired) plan_expires_at.
INSERT INTO active_passes (user_id, pass_type, expires_at)
SELECT
  u.id,
  CASE
    WHEN p.plan_type = 'moto_pass' THEN 'moto'
    WHEN p.plan_type = 'cdl_pass'  THEN 'cdl'
    ELSE 'auto'
  END AS pass_type,
  p.plan_expires_at
FROM profiles p
JOIN auth.users u ON LOWER(u.email) = LOWER(p.email)
WHERE p.is_pro = TRUE
  AND p.plan_expires_at IS NOT NULL
  AND p.plan_expires_at > NOW()
ON CONFLICT (user_id, pass_type) DO NOTHING;

-- ─── Verification queries (run manually after migration) ───────────────────
-- SELECT COUNT(*) FROM active_passes;
-- SELECT pass_type, COUNT(*), MIN(expires_at), MAX(expires_at)
--   FROM active_passes GROUP BY pass_type;
-- SELECT COUNT(*) FROM purchases;
