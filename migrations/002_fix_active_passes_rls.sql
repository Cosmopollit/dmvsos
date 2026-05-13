-- Migration 002: Fix RLS so user's own active_passes are readable via JS SDK.
-- The original policy `USING (user_id = auth.uid())` seems to block in some
-- session edge cases. Tighten via TO authenticated + explicit cast.
-- The client filters by user_id anyway, so the policy is defense-in-depth.

DROP POLICY IF EXISTS "users read own passes"     ON active_passes;
DROP POLICY IF EXISTS "users read own purchases"  ON purchases;
DROP POLICY IF EXISTS "users read own sessions"   ON user_sessions;
DROP POLICY IF EXISTS "users delete own sessions" ON user_sessions;

CREATE POLICY "users read own passes" ON active_passes
  FOR SELECT TO authenticated
  USING (auth.uid()::uuid = user_id);

CREATE POLICY "users read own purchases" ON purchases
  FOR SELECT TO authenticated
  USING (auth.uid()::uuid = user_id);

CREATE POLICY "users read own sessions" ON user_sessions
  FOR SELECT TO authenticated
  USING (auth.uid()::uuid = user_id);

CREATE POLICY "users delete own sessions" ON user_sessions
  FOR DELETE TO authenticated
  USING (auth.uid()::uuid = user_id);

-- Verify
SELECT tablename, policyname, roles, cmd, qual
  FROM pg_policies
 WHERE schemaname = 'public'
   AND tablename IN ('active_passes', 'purchases', 'user_sessions')
 ORDER BY tablename, policyname;
