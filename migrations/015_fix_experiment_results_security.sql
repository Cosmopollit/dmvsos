-- Fix Supabase Security Advisor CRITICAL findings on public.experiment_results
-- (introduced by migrations/006_experiments.sql).
--
--   1. "Security Definer View" — a Postgres view created the normal way runs
--      with the *creator's* privileges (postgres / superuser) for everyone
--      who can call it, silently bypassing RLS.
--   2. "Exposed Auth Users" — the view joins auth.users and lives in the
--      `public` schema, which PostgREST exposes to the anon + authenticated
--      API roles. Anyone holding the public anon key (it ships in client JS)
--      could GET /rest/v1/experiment_results and read our funnel numbers,
--      and the definer context gave that query a path into auth.users.
--
-- Fix:
--   * Recreate the view WITH (security_invoker = true) so it respects the
--     RLS of the *caller* instead of the creator. (Postgres 15+, which
--     Supabase runs.)
--   * Revoke all access from anon + authenticated. We only ever read
--     experiment results server-side / from the dashboard, both of which
--     use service_role — so locking the API roles out costs us nothing.

drop view if exists public.experiment_results;

create view public.experiment_results
  with (security_invoker = true)
as
select
  e.experiment,
  e.variant,
  count(distinct e.subject_key)                                          as exposed,
  count(distinct case when s.id      is not null then e.subject_key end)  as signups,
  count(distinct case when p.user_id is not null then e.subject_key end)  as buyers,
  round(100.0 * count(distinct case when p.user_id is not null then e.subject_key end)
        / nullif(count(distinct e.subject_key), 0), 2)                    as conv_pct
from experiment_exposures e
left join auth.users s on s.id::text = e.subject_key
left join purchases  p on p.user_id::text = e.subject_key
                       and p.purchased_at >= e.created_at
group by e.experiment, e.variant
order by e.experiment, e.variant;

-- API roles must not touch it; service_role (server + dashboard) keeps access.
revoke all on public.experiment_results from anon, authenticated;
grant select on public.experiment_results to service_role;
