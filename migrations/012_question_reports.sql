-- User-reported question issues (typo, wrong answer, weird translation, etc.)
-- Filed inline from /test page via a small bug icon.
-- Admin reviews these in /admin/reports and fixes the source question.

create table if not exists question_reports (
  id            bigserial primary key,
  question_id   uuid not null references questions(id) on delete cascade,
  user_id       uuid references auth.users(id) on delete set null,
  user_email    text,
  language      text not null,
  reason        text not null check (reason in ('wrong_answer', 'bad_translation', 'unclear', 'broken_image', 'other')),
  comment       text,
  status        text not null default 'open' check (status in ('open', 'fixed', 'wont_fix', 'duplicate')),
  resolved_at   timestamptz,
  resolved_by   text,
  created_at    timestamptz not null default now()
);

create index if not exists question_reports_question_idx on question_reports (question_id);
create index if not exists question_reports_status_idx on question_reports (status, created_at desc);

alter table question_reports enable row level security;

-- Allow anonymous inserts (anyone taking a free test can report).
-- Reads/updates restricted to service role.
create policy "anon_can_insert_reports" on question_reports
  for insert to anon
  with check (true);
create policy "auth_can_insert_reports" on question_reports
  for insert to authenticated
  with check (true);
