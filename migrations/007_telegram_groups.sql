-- Telegram groups where @dmvsos_support_bot is a member.
-- Tracks which groups bot is in, allows per-group enable/disable,
-- and throttles auto-replies.

create table if not exists bot_groups (
  chat_id        bigint primary key,
  title          text,
  username       text,              -- public group @username if any
  type           text,              -- 'group' | 'supergroup' | 'channel'
  enabled        boolean not null default true,
  added_at       timestamptz not null default now(),
  added_by       bigint,            -- telegram user_id who added bot
  last_reply_at  timestamptz,       -- for throttle
  reply_count    int  not null default 0,
  removed_at     timestamptz        -- set when bot leaves; null = active
);

create index if not exists bot_groups_enabled_idx on bot_groups (enabled, removed_at);

-- Each time the bot auto-replies in a group, log it. Lets us see which
-- keywords convert and tune the trigger list.
create table if not exists bot_keyword_hits (
  id             bigserial primary key,
  chat_id        bigint not null,
  user_id        bigint,            -- telegram user_id who asked
  user_name      text,
  message_text   text,
  matched_keyword text,
  matched_state  text,              -- detected state slug, if any
  reply_sent     boolean not null default false,
  skipped_reason text,              -- 'throttled' | 'disabled' | null
  created_at     timestamptz not null default now()
);

create index if not exists bot_keyword_hits_chat_idx on bot_keyword_hits (chat_id, created_at desc);
create index if not exists bot_keyword_hits_kw_idx on bot_keyword_hits (matched_keyword);

alter table bot_groups       enable row level security;
alter table bot_keyword_hits enable row level security;
-- Service role only. Admin UI hits these via Next.js API routes.
