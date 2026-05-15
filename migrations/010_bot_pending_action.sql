-- When a user taps a "service" button (notary, translations, contact, bugs,
-- partnership) the bot stores the action and waits for their next free-form
-- message, then forwards it to the appropriate destination with a tag.

alter table bot_user_prefs add column if not exists pending_action  text;
alter table bot_user_prefs add column if not exists pending_set_at  timestamptz;
