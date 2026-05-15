-- Per-user language preference for @dmvsos_support_bot DM chat.
-- Set when user picks language on first /start, used for all subsequent
-- messages (commands + keyword auto-replies + admin forwards).
create table if not exists bot_user_prefs (
  chat_id    bigint primary key,
  lang       text not null check (lang in ('en','ru','ua','es','zh')),
  updated_at timestamptz not null default now()
);

alter table bot_user_prefs enable row level security;
-- Service role only.
