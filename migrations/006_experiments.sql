-- A/B experiment exposure log. One row per (experiment, variant, subject, day).
-- The unique index makes the API endpoint naturally idempotent.

create table if not exists experiment_exposures (
  id           bigserial primary key,
  experiment   text not null,
  variant      text not null,
  subject_key  text not null,
  day          date not null default current_date,
  created_at   timestamptz not null default now()
);

create unique index if not exists experiment_exposures_unique
  on experiment_exposures (experiment, variant, subject_key, day);

create index if not exists experiment_exposures_experiment_idx
  on experiment_exposures (experiment, variant, day);

alter table experiment_exposures enable row level security;

-- Service role only; clients hit /api/experiment/expose.
-- (No public policies — anon role has no access.)

-- View: per-experiment funnel (exposures + downstream events).
-- Adjust to your event tables as they're added.
create or replace view experiment_results as
select
  e.experiment,
  e.variant,
  count(distinct e.subject_key)                                         as exposed,
  count(distinct case when s.id      is not null then e.subject_key end) as signups,
  count(distinct case when p.user_id is not null then e.subject_key end) as buyers,
  round(100.0 * count(distinct case when p.user_id is not null then e.subject_key end)
        / nullif(count(distinct e.subject_key), 0), 2)                  as conv_pct
from experiment_exposures e
left join auth.users s on s.id::text = e.subject_key
left join purchases  p on p.user_id::text = e.subject_key
                       and p.purchased_at >= e.created_at
group by e.experiment, e.variant
order by e.experiment, e.variant;
