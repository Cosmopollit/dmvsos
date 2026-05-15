-- Bot's behavior per group:
--   'silent'    → forward matching messages to admin (+assistant) DM, do NOT reply in group (default — much easier to get into groups)
--   'autoreply' → reply directly in the group (old behavior)
alter table bot_groups
  add column if not exists mode text not null default 'silent'
  check (mode in ('silent', 'autoreply'));

-- For existing rows (if any from prior 007 deploys), keep them as silent.
update bot_groups set mode = 'silent' where mode is null;
