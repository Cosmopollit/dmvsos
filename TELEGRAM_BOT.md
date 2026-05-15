# Telegram bot - silent monitoring + manual reply + DM UI



`@dmvsos_support_bot` operates in two modes per group:

- **silent** (default) - bot stays invisible in the group, just forwards DMV questions to your DM with deep links. You reply manually from your **personal account** to keep the human touch.
- **autoreply** - bot posts a reply link in the group automatically (max 1/hour). Safer fallback if you can't monitor in real time.

## Why silent is the default

1. **Admins say yes more often.** Pitching "a bot that watches but never posts" is an easier ask than "a bot that auto-replies".
2. **Replies come from a real account.** People trust a person answering with context over a stock bot link.
3. **Zero spam risk.** Bot generates no group noise, so it doesn't get kicked.

The trade-off: it requires you (or assistant) to actually reply. That's the point - manual reply from a real account converts much better.

## DM experience (private chat with bot)

Users who DM the bot get a clickable interface:

- `/start` or `/menu` → inline keyboard:
  - 💰 Pricing · 🗽 States · 🌍 Languages · 💸 Refund · 🧑‍💻 Contact · 🌐 Open site
  - Tapping a button **edits the same message** in place (clean chat, no scroll)
- Free-form messages handled in priority order:
  1. State name alone ("California", "Калифорния") → category picker for that state
  2. Category alone ("CDL", "мото") → state picker
  3. DMV prep question ("где готовиться к DMV") → smart auto-reply with state-aware link
  4. Anything else → forwarded to admin DM

## BotFather one-time polish

Run these in @BotFather to make the bot feel professional in chat lists and menus:

```
/setname        → DMVSOS Помощник (or "DMVSOS Assistant" / "DMVSOS Ayuda" per audience)
/setdescription → Бесплатная подготовка к DMV для 50 штатов на 5 языках. Помогу с вопросами и подскажу где готовиться.
/setabouttext   → Free DMV practice tests · 50 states · 5 languages · dmvsos.com
/setuserpic     → upload public/logo.png from repo
/setcommands    → paste the block below
```

Command list (`/setcommands`):
```
start - Открыть меню / Open menu
pricing - Цены / Pricing
states - Список штатов / States
languages - Языки / Languages
refund - Возврат / Refund policy
human - Связаться с основателем / Talk to founder
```

After `/setcommands`, Telegram clients show a "/" hint button next to the chat input that lists these - major UX win in DM.

## One-time setup

### 1. BotFather

In @BotFather:
1. `/mybots` → `@dmvsos_support_bot`
2. **Bot Settings → Group Privacy → Turn off** (required - otherwise bot sees only `/commands` in groups)
3. **Bot Settings → Allow Groups → ON**

### 2. Vercel env vars

- `TELEGRAM_ADMIN_CHAT_ID` (already set) - your personal chat_id, gets forwards
- `TELEGRAM_ASSISTANT_CHAT_ID` *(optional)* - your assistant's chat_id, gets the same forwards

To find a chat_id: have the person DM `@dmvsos_support_bot` once. The forward to admin includes `chat <code>NNN</code>` - that's their id.

## Forwards (silent mode)

When the bot detects a DMV question in a group, you get a DM like:

> 🔔 **DMV question in Русские в Майами**
>
> 👤 From: @vasya · [open DM](tg://user?id=12345)
> 🌐 Lang: RU · State: **florida**
> 🔑 Matched: `сдав`
>
> _кто сдавал на права в Майами? с чего начать?_
>
> ↪️ [Reply in group](https://t.me/c/.../...)

Tap **Reply in group** to jump straight to the message → reply from your personal account in-context.

Throttle: 1 forward per group per **5 minutes** in silent mode (vs 1 hour for autoreply). Tighter so you don't miss multiple distinct questions.

## Admin commands in any group (group-admins only)

- `/silent` - silent mode (default)
- `/autoreply` - bot posts reply link itself
- `/disable` - bot inactive in this group
- `/enable` - re-activate
- `/status` - current mode + counters

## Dashboard

`https://dmvsos.com/admin/telegram-groups` (uses `ADMIN_PASSWORD`)

Shows: groups, current mode per group, hit count, top keywords, top states, recent matches.

## Pitch to group admins (silent angle)

```
Привет! Я Евгений, делаю dmvsos.com - бесплатная подготовка к DMV для
50 штатов на 5 языках.

Видел в этой группе люди регулярно спрашивают про права. У меня есть
бот @dmvsos_support_bot, который НИЧЕГО не пишет в группе - он просто
тихо мне в личку пересылает такие вопросы, чтобы я успел подсказать
ответ. Отвечаю я сам с личного аккаунта.

Если что-то не понравится - выключи командой /disable в группе,
или сразу кикни. Можно протестить неделю?
```

## Risks (silent mode)

| Risk | Mitigation |
|---|---|
| Admin still suspicious of any bot | Pitch as personal helper, not as automation; offer 1-week trial |
| Bot kicked anyway | Throttle, no group noise - but admin owns the call. Move on to next group |
| You don't reply fast enough | Set push notifications on your TG, or add assistant via `TELEGRAM_ASSISTANT_CHAT_ID` |
| Privacy mode left ON in BotFather | Zero hits in dashboard - symptom check first |

## Switching a group to autoreply

If a particular group says "you can post automated answers too" - send `/autoreply` in that group. Per-group toggle.
