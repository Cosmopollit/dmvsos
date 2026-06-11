-- Service-lead demand inventory (the "Find nearby" concierge).
--
-- Strategy: before building any provider portal or booking system, prove the
-- demand exists. Every time a Pro user asks the concierge for a service
-- (instructor, translator + notary, car + insurance, courses), the mobile app
-- logs the *request* here — service + state + language, no PII beyond the
-- user_id we already have. This is the cheapest possible validation: it
-- answers "do students actually want these services, and which ones, where?"
-- without recruiting a single provider. Later these become routable/sellable
-- leads; for now they are a pure demand signal.
--
-- The user still gets an immediate map/web result in-app — this log is a
-- fire-and-forget side effect, never blocks the UX.

create table if not exists service_leads (
  id          bigserial primary key,
  created_at  timestamptz not null default now(),
  user_id     uuid,                       -- nullable: anon searches count too
  service_id  text not null,              -- 'instructor' | 'translator_notary' | 'car_insurance' | 'courses'
  state       text,                       -- state slug, e.g. 'california'
  lang        text,                       -- ui language: en|ru|es|zh|ua
  platform    text,                       -- 'ios' | 'android' | 'web'
  source      text                        -- where in the app, e.g. 'hub_search'
);

create index if not exists service_leads_created_at_idx on service_leads (created_at desc);
create index if not exists service_leads_service_idx     on service_leads (service_id, state, created_at desc);

alter table service_leads enable row level security;

-- Clients may INSERT a lead (this is demand capture) but never SELECT —
-- the inventory is read server-side only (service_role) for analysis and,
-- later, routing to providers.
grant insert on service_leads to anon, authenticated;
grant usage on sequence service_leads_id_seq to anon, authenticated;

drop policy if exists "insert_service_lead" on service_leads;
create policy "insert_service_lead"
  on service_leads for insert
  to anon, authenticated
  with check (user_id is null or user_id = auth.uid());

-- No SELECT/UPDATE/DELETE policies → blocked for anon + authenticated.
-- service_role (analytics, lead routing) bypasses RLS.
grant select, delete on service_leads to service_role;
