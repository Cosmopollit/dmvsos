# Telegram bot — group helper mode

`@dmvsos_support_bot` works in two modes:

1. **Private chat (DM)** — `/start`, `/pricing`, `/states`, `/languages`, `/refund`, `/human`. Free-form messages forward to admin.
2. **Group chat** — passively listens for DMV-related questions and auto-replies **at most once per hour per group**. Admins toggle with `/enable` `/disable` `/status`.

## One-time setup (REQUIRED for group mode)

By default Telegram bots in groups only see commands (`/start`, etc.). To see normal messages and detect keywords, **privacy mode must be OFF**.

1. Open Telegram → @BotFather
2. `/mybots` → select `@dmvsos_support_bot`
3. **Bot Settings → Group Privacy → Turn off**
4. Confirm

You also want:
- **Allow Groups** → ON (Bot Settings → Allow Groups)
- (Optional) **Group admin only commands** — keep default

Verify: send the bot a `/start` in a group it's in — if it answers, privacy is off and webhook is live.

## How auto-reply works

For every group message, the bot:
1. Checks message against keyword list (`lib/telegram-helper.js → TRIGGER_PATTERNS`)
   - Triggers: `dmv`, `driver license`, `road test`, `cdl`, `права`, `сдавать`, `водительск`, `licencia de conducir`, `驾照`, etc. (5 languages)
2. Detects mentioned state (e.g. "California", "Техас", "TX") and links straight to that state page
3. Throttle: if bot already replied in this group within last 60 minutes → skip
4. Logs every match to `bot_keyword_hits` (whether replied or skipped, with reason) — visible in `/admin/telegram-groups`

## Admin controls (in any group)

- `/enable` — turn on auto-reply (default after add)
- `/disable` — mute bot in this group
- `/status` — show current state + reply count + last reply time

Only group admins can use these; non-admins are silently ignored.

## Bot intro on join

When added to a group, bot posts once:

> 👋 Привет! Я **@dmvsos_support_bot** — помогаю с вопросами про DMV/права. Отвечаю только когда кто-то спрашивает про DMV (не чаще раза в час). Админы могут заглушить меня командой /disable.

This is disclosure, not stealth. Group admins know what bot does.

## Dashboard

`https://dmvsos.com/admin/telegram-groups` (uses `ADMIN_PASSWORD`)

Shows:
- All groups bot is in, status, reply count, last reply
- Top keywords triggering replies → tune `TRIGGER_PATTERNS` based on what actually matches
- Top states asked about → know where users come from
- Last 100 matches with full message text

## Outreach template — getting bot into groups

The bot only works in groups admins **invite it to**. Reach out to admins of immigrant/community groups:

```
Привет! Я Евгений, делаю dmvsos.com — бесплатная подготовка к DMV
для 50 штатов на 5 языках (RU/EN/UA/ES/ZH).

У нас есть Telegram-бот @dmvsos_support_bot, который помогает с вопросами
про права. Он отвечает только когда кто-то напрямую спрашивает про DMV
(не чаще раза в час, чтобы не спамить), и админ группы может в любой
момент его выключить командой /disable.

Можно добавить его в [название группы]? Думаю будет полезно для ваших
участников — много вопросов про DMV в иммигрантских чатах.

Если что — можем сначала тестово на неделю.
```

## Target groups (research)

Public/findable Telegram-чаты иммигрантов в США:
- "Русские в США" (~50k)
- "Українці в Америці" (~30k)
- "Latinos en Estados Unidos"
- City-specific: "Русский Хьюстон", "Русская Калифорния", "Українці Чикаго"
- Use [tlgrm.eu/channels](https://tlgrm.eu/channels) or @SearchInChats to find

**Start with 5-10 groups.** Don't blast 50 admin DMs at once — looks like spam.

## Adjusting triggers

If dashboard shows `topKeywords` skewed toward false positives (e.g. someone says "DMV is closed today" and we reply unhelpfully), tighten patterns in `lib/telegram-helper.js`. Possible improvements:

- Require question mark or `?`-equivalent (Russian "как", "где", "сколько")
- Negative patterns (don't trigger on "I already passed DMV")
- Add per-state landmark keywords (e.g. "Brooklyn DMV" → New York)

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Admin kicks bot for noise | Throttle 1 reply/h, disclose intro, `/disable` available |
| Bot replies to false-positive question | Log everything, tune patterns weekly |
| Mass spam reports | Only operate in groups where invited by admin |
| Telegram rate limits | Bot API has ~30 msg/sec global cap; we're nowhere near |
| Privacy mode left ON | Bot silently doesn't see group messages — symptom: zero hits in dashboard |
