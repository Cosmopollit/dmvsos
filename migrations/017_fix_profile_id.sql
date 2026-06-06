-- 017_fix_profile_id.sql
--
-- Repair profiles whose id does not match the auth.users id for the same
-- email. Root cause: the Stripe webhook's profilesUpdateByEmail helper used
-- to INSERT new profile rows without an id, so Postgres generated a random
-- uuid. That left profiles.id permanently out of sync with auth.users.id.
--
-- It was harmless until now only because /api/account/passes matches passes
-- by email, not by profiles.id. But it is a landmine for any future code or
-- RLS policy that assumes profiles.id = auth.uid(). The webhook now stamps
-- the correct id on insert (see app/api/webhook/route.js); this migration
-- backfills the rows created before that fix.
--
-- SAFETY NOTES — READ BEFORE RUNNING:
--   1. This rewrites the primary key of affected profiles rows. If any other
--      table has a FOREIGN KEY referencing profiles.id, those references must
--      be ON UPDATE CASCADE or this will fail / orphan them. As of this
--      migration, passes are keyed off auth.users.id (active_passes.user_id),
--      NOT profiles.id, so there should be no dependents. Verify with the
--      first query below before running the UPDATE.
--   2. If two profiles share the same email (should not happen — email is
--      unique on profiles), the join would be ambiguous. The WHERE clause
--      guards by matching exactly one auth.users row per email.
--
-- Run the SELECTs first to preview, then the UPDATE.

-- [PREVIEW 1] Anything referencing profiles.id via FK? Expect zero rows.
SELECT
  tc.table_name, kcu.column_name, ccu.table_name AS references_table, ccu.column_name AS references_column
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu
  ON tc.constraint_name = ccu.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND ccu.table_name = 'profiles'
  AND ccu.column_name = 'id';

-- [PREVIEW 2] Which profiles are mismatched? Each row will be repaired.
SELECT p.id AS current_profile_id, u.id AS correct_auth_id, p.email
FROM public.profiles p
JOIN auth.users u ON lower(u.email) = lower(p.email)
WHERE p.id <> u.id;

-- [REPAIR] Set profiles.id = the matching auth.users.id.
-- Only touches rows where exactly one auth.users matches the email.
UPDATE public.profiles p
SET id = u.id
FROM auth.users u
WHERE lower(u.email) = lower(p.email)
  AND p.id <> u.id
  AND (
    SELECT count(*) FROM auth.users u2 WHERE lower(u2.email) = lower(p.email)
  ) = 1;

-- [VERIFY] Expect zero mismatched rows after the repair.
SELECT count(*) AS still_mismatched
FROM public.profiles p
JOIN auth.users u ON lower(u.email) = lower(p.email)
WHERE p.id <> u.id;
