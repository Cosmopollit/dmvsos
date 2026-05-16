-- Enable Row-Level Security on questions table so anon role cannot
-- dump the question bank via the public Supabase REST API.
--
-- After this migration:
--   - anon  (NEXT_PUBLIC_SUPABASE_ANON_KEY) -> blocked from SELECT
--   - authenticated user                    -> blocked from SELECT
--   - service_role (server-side)            -> bypasses RLS as usual
--
-- Pre-requisites (all DONE in code before applying):
--   - app/test/page.js reads via /api/test/questions (service_role).
--   - app/admin/page.js reads via /api/admin/questions/list and
--     /api/admin/questions/cluster (password-gated, service_role).
--   - No remaining client-side supabase.from('questions') calls.
--
-- No SELECT policies are created intentionally — default-deny is the goal.
-- Service role bypasses RLS automatically.

alter table questions enable row level security;

-- Explicit no-op policies just so the table remains documented.
-- (With RLS on and no permissive SELECT policy, anon/auth get 0 rows.)
-- If you ever need to allow client-side reads again, add a SELECT policy here.
