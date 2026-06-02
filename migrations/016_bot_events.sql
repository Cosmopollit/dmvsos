-- Persistent bot-detection log.
--
-- The proxy.js middleware already runs scoreBot() on every request and
-- console.warn()s suspicious ones, but Vercel function logs roll off in
-- ~24h on Hobby and can't be aggregated for analysis. This table captures
-- only the requests that score ≥ 5 (the "probably not human" tier) so we
-- can answer "are the Singapore visitors in Vercel Analytics actually
-- scraper traffic" without blocking real users.
--
-- One row per suspicious request. Throttled at the middleware so a single
-- IP can't fill the table; rolled off after 14 days via a TTL cleanup
-- (handled by the daily cron, not here).

create table if not exists bot_events (
  id          bigserial primary key,
  scored_at   timestamptz not null default now(),
  ip          text,
  country     text,           -- 2-letter ISO from x-vercel-ip-country
  path        text,
  method      text,
  ua          text,
  score       int not null,
  reasons     text[],
  bucket_key  text            -- e.g. "ip" for analysis joins
);

create index if not exists bot_events_scored_at_idx on bot_events (scored_at desc);
create index if not exists bot_events_country_idx   on bot_events (country, scored_at desc);
create index if not exists bot_events_path_idx      on bot_events (path,   scored_at desc);

alter table bot_events enable row level security;
-- service_role only (server-side analytics + the dashboard). No public access.
revoke all on bot_events from anon, authenticated;
grant select, insert, delete on bot_events to service_role;
