-- Enable RLS on profiles and test_sessions.
--
-- Context: a security audit found these two tables had RLS disabled, meaning
-- any client with the anon key (publicly available in the browser bundle)
-- could read every profile (email, stripe_customer_id, phone, is_pro, plan
-- expiry) and every test session in the database.
--
-- Service role bypasses RLS automatically, so the webhook and server-side
-- routes that use SUPABASE_SERVICE_ROLE_KEY keep working unchanged.

-- ── profiles ─────────────────────────────────────────────────────────────
alter table profiles enable row level security;

-- Authenticated user can read their own row, matched by email.
-- profile.id is not auth.uid() in this schema (profiles is keyed by email,
-- predates the auth.users link), so we match on email from the JWT.
drop policy if exists "select_own_profile" on profiles;
create policy "select_own_profile"
  on profiles for select
  to authenticated
  using (lower(email) = lower(auth.jwt() ->> 'email'));

-- No INSERT/UPDATE/DELETE policies → blocked for anon and authenticated.
-- Only service_role (Stripe webhook, admin scripts) can write profile rows.

-- ── test_sessions ────────────────────────────────────────────────────────
alter table test_sessions enable row level security;

-- Authenticated user can read their own test history.
drop policy if exists "select_own_test_sessions" on test_sessions;
create policy "select_own_test_sessions"
  on test_sessions for select
  to authenticated
  using (user_id = auth.uid());

-- Authenticated user can insert a test session for themselves only.
-- The WITH CHECK clause prevents writing a row with someone else's user_id.
drop policy if exists "insert_own_test_sessions" on test_sessions;
create policy "insert_own_test_sessions"
  on test_sessions for insert
  to authenticated
  with check (user_id = auth.uid());

-- No UPDATE/DELETE for clients — sessions are immutable history rows.
-- Service role can still backfill / clean up via scripts.
