-- DRY-RUN version of migration 001 — wrapped in transaction with ROLLBACK.
-- Use this in Supabase SQL Editor to verify migration applies cleanly without
-- committing. When verification looks good, change ROLLBACK → COMMIT and re-run.

BEGIN;

-- ─── active_passes ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS active_passes (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pass_type TEXT NOT NULL CHECK (pass_type IN ('moto','auto','cdl')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, pass_type)
);

CREATE INDEX IF NOT EXISTS idx_active_passes_expires ON active_passes(expires_at);

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS active_passes_updated_at ON active_passes;
CREATE TRIGGER active_passes_updated_at
  BEFORE UPDATE ON active_passes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── purchases ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  email TEXT,
  pass_type TEXT NOT NULL CHECK (pass_type IN ('moto','auto','cdl')),
  kind TEXT NOT NULL CHECK (kind IN ('new','extension')),
  amount_cents INT NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL DEFAULT 'usd',
  stripe_payment_intent TEXT NOT NULL UNIQUE,
  stripe_checkout_session TEXT,
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  prev_expires_at TIMESTAMPTZ,
  new_expires_at TIMESTAMPTZ NOT NULL,
  refunded_at TIMESTAMPTZ,
  refund_reason TEXT,
  guarantee_used_at TIMESTAMPTZ,
  guarantee_resolution TEXT CHECK (guarantee_resolution IN ('refund','extension')
                                   OR guarantee_resolution IS NULL)
);

CREATE INDEX IF NOT EXISTS idx_purchases_user  ON purchases(user_id, purchased_at DESC);
CREATE INDEX IF NOT EXISTS idx_purchases_type  ON purchases(user_id, pass_type, purchased_at DESC);
CREATE INDEX IF NOT EXISTS idx_purchases_email ON purchases(email);

-- ─── user_sessions ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_fingerprint TEXT NOT NULL,
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON user_sessions(user_id, last_active_at DESC);

-- ─── RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE active_passes ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases     ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users read own passes"     ON active_passes;
DROP POLICY IF EXISTS "users read own purchases"  ON purchases;
DROP POLICY IF EXISTS "users read own sessions"   ON user_sessions;
DROP POLICY IF EXISTS "users delete own sessions" ON user_sessions;

CREATE POLICY "users read own passes"     ON active_passes
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "users read own purchases"  ON purchases
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "users read own sessions"   ON user_sessions
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "users delete own sessions" ON user_sessions
  FOR DELETE USING (user_id = auth.uid());

-- ─── Backfill from profiles ────────────────────────────────────────────────
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

-- ─── Verification (results show during dry-run) ────────────────────────────
SELECT '=== TABLES CREATED ===' AS check;
SELECT table_name FROM information_schema.tables
 WHERE table_schema = 'public'
   AND table_name IN ('active_passes','purchases','user_sessions')
 ORDER BY table_name;

SELECT '=== ACTIVE PRO USERS IN PROFILES ===' AS check;
SELECT COUNT(*) AS pro_users_with_active_plan
  FROM profiles
 WHERE is_pro = TRUE AND plan_expires_at > NOW();

SELECT '=== BACKFILL RESULT — active_passes ===' AS check;
SELECT pass_type, COUNT(*) AS n,
       MIN(expires_at) AS earliest_exp,
       MAX(expires_at) AS latest_exp
  FROM active_passes
 GROUP BY pass_type
 ORDER BY pass_type;

SELECT '=== RLS POLICIES ===' AS check;
SELECT tablename, policyname, cmd
  FROM pg_policies
 WHERE schemaname = 'public'
   AND tablename IN ('active_passes','purchases','user_sessions')
 ORDER BY tablename, policyname;

-- ─── ROLLBACK для dry-run; замени на COMMIT когда уверен ──────────────────
ROLLBACK;
-- COMMIT;
