-- Per-state "what to bring to the DMV" document guide.
--
-- Powers three surfaces from one verified dataset:
--   - App (Pro): a document checklist in the profile + a "need translation /
--     notary?" button that routes into the concierge (lead-gen).
--   - Web: SEO landing pages /dmv-documents/<state> (high-volume queries like
--     "what documents do I need for california driver license").
--   - Admin: a calm per-state editor (/admin/documents) — the source of truth.
--
-- HIGH-STAKES DATA: these are the legal documents a person must physically
-- bring to get a license. Wrong info = a wasted trip and a turned-away
-- immigrant. So every row carries an `official_url` (the state agency page we
-- sourced it from) and only `status='published'` rows are ever shown; the
-- UI always pairs them with a "verify with your DMV" disclaimer.

create table if not exists state_documents (
  state             text primary key,                  -- state slug, e.g. 'california'
  agency            text,                              -- "California DMV"
  official_url      text,                              -- source-of-truth link (required to publish)
  real_id_note      text,                              -- REAL ID has extra requirements; short note
  -- [{ "group": "Proof of identity", "accepts": ["Passport", "Green card", ...], "note": "..." }]
  doc_groups        jsonb not null default '[]'::jsonb,
  needs_translation boolean not null default true,     -- show the translation/notary CTA
  status            text not null default 'draft' check (status in ('draft', 'published')),
  updated_at        timestamptz not null default now(),
  updated_by        text
);

alter table state_documents enable row level security;

-- Public (app + web) may read PUBLISHED rows only. Drafts stay invisible
-- until a human verifies and publishes them.
grant select on state_documents to anon, authenticated;
drop policy if exists "read_published_state_documents" on state_documents;
create policy "read_published_state_documents"
  on state_documents for select
  to anon, authenticated
  using (status = 'published');

-- All writes go through the admin API (service_role), which gates on the
-- admin password. service_role bypasses RLS.
grant all on state_documents to service_role;
