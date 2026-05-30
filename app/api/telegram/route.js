// Telegram bot webhook handler for @dmvsos_support_bot.
//
// DM-only — the bot used to also handle group messages (keyword auto-reply,
// throttle, /enable /disable, etc.) but the bot was never actually added to
// any group (bot_groups table has zero rows since launch), so all of that
// code was dead weight. Pruned 2026-05-26.
//
// Active flows:
//   /start /lang  — language picker (then main menu).
//   /menu         — main menu inline keyboard.
//   /pricing /states /languages /refund /human — info commands.
//   Free-form text — keyword auto-reply on DMV questions; otherwise forward
//                    to admin for manual reply. Media (voice / photo / etc.)
//                    is also forwarded so admin can play/view it.
//   Inline button taps — language switch, menu navigation, state picker.

import {
  matchTrigger, detectState, detectCdl, detectCategory,
  composeReply,
  mainMenuKeyboard, backToMenuKeyboard, statePickerKeyboard, categoryKeyboard,
  languagePickerKeyboard, LANG_PICKER_TEXT,
} from '@/lib/telegram-helper.js';
import { grantPass, getUserState, isValidEmail, isValidPassType } from '@/lib/grant-pass.js';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID;
const SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || '';
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Chat IDs allowed to use /grant and /check. Defaults to the admin chat
// if TELEGRAM_GRANT_CHAT_IDS isn't set, so the feature works for one admin
// out of the box. Add a comma-separated list to include co-admins
// (e.g. "472198072,380411112" for evgeniy + anastasiya).
const GRANT_ALLOWED_CHAT_IDS = new Set(
  (process.env.TELEGRAM_GRANT_CHAT_IDS || process.env.TELEGRAM_ADMIN_CHAT_ID || '')
    .split(',').map(s => s.trim()).filter(Boolean)
);

const API = TOKEN ? `https://api.telegram.org/bot${TOKEN}` : null;

const sbHeaders = {
  apikey: SUPA_KEY,
  Authorization: `Bearer ${SUPA_KEY}`,
  'Content-Type': 'application/json',
};

// ── Supabase helpers ─────────────────────────────────────────────────────
async function sbGetUserLang(chatId) {
  const r = await fetch(`${SUPA_URL}/rest/v1/bot_user_prefs?chat_id=eq.${chatId}&select=lang`, { headers: sbHeaders });
  if (!r.ok) return null;
  const rows = await r.json();
  return rows[0]?.lang || null;
}

async function sbSetUserLang(chatId, lang) {
  await fetch(`${SUPA_URL}/rest/v1/bot_user_prefs?on_conflict=chat_id`, {
    method: 'POST',
    headers: { ...sbHeaders, Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ chat_id: chatId, lang, updated_at: new Date().toISOString() }),
  }).catch(() => {});
}

async function sbLogHit(row) {
  await fetch(`${SUPA_URL}/rest/v1/bot_keyword_hits`, {
    method: 'POST',
    headers: sbHeaders,
    body: JSON.stringify(row),
  }).catch(() => {});
}

// ── Telegram helpers ─────────────────────────────────────────────────────
async function tg(method, payload) {
  if (!API) return null;
  const res = await fetch(`${API}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

async function sendMessage(chatId, text, opts = {}) {
  return tg('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...opts,
  });
}

function pickLang(code) {
  if (!code) return 'en';
  const c = code.toLowerCase().slice(0, 2);
  if (c === 'ru') return 'ru';
  if (c === 'es') return 'es';
  if (c === 'zh' || c === 'cn') return 'zh';
  if (c === 'uk' || c === 'ua') return 'ua';
  return 'en';
}

// ── DM messages ──────────────────────────────────────────────────────────
const DM_MESSAGES = {
  en: {
    welcome: `👋 Hi! I'm the DMVSOS support bot.

I can help with:
/pricing - How much it costs
/states - Which states we cover
/languages - Available languages
/refund - Refund policy
/human - Talk to Evgenii (founder) directly

Or just type your question - I'll forward it.`,
    pricing: `💰 <b>Flat-rate one-time payments - no subscriptions</b>

🏍️ Moto Pass - $19.99 / 30 days
🚗 Auto Pass - $29.99 / 30 days
🚛 CDL Pro - $49.99 / 30 days + Pass Guarantee

🔄 Need more time? Extend any pass for $9.99 / +30 days

24h full refund. No questions asked.`,
    states: `🗽 We cover <b>all 50 US states + DC</b>.

Just pick your state on dmvsos.com - every state has its own question bank built from the official driver's handbook.`,
    languages: `🌍 We support 5 languages:
🇺🇸 English  🇷🇺 Русский  🇪🇸 Español  🇨🇳 中文  🇺🇦 Українська`,
    refund: `💸 <b>Refund policy</b>

Within 24h of purchase: full refund, no questions asked.
CDL Pro Pass Guarantee: refund or 90d extension if you fail the actual DMV test with 85%+ practice score.`,
    human: `🧑‍💻 Sending your message to Evgenii (founder). Usually replies within 4 hours.`,
    forwardedAck: `✅ Got it. Evgenii will reply shortly.`,
    unknown: `Commands: /start /pricing /states /languages /refund /human /lang`,
    pickCategory: `🚦 Pick a license type for <b>{state}</b>:`,
    pickState: `🗽 Which state? Pick or open the site for all 50:`,
  },
  ru: {
    welcome: `👋 Привет! Я бот поддержки DMVSOS.\n\n/pricing /states /languages /refund /human /lang\n\nИли просто напиши вопрос - передам.`,
    pricing: `💰 <b>Одноразовая оплата - без подписок</b>\n\n🏍️ Moto Pass - $19.99 / 30 дней\n🚗 Auto Pass - $29.99 / 30 дней\n🚛 CDL Pro - $49.99 / 30 дней + Pass Guarantee\n\n🔄 Продление $9.99 / +30 дней\n24h полный refund.`,
    states: `🗽 Покрываем <b>все 50 штатов + DC</b>. Выбери штат на dmvsos.com.`,
    languages: `🌍 5 языков: 🇺🇸 EN · 🇷🇺 RU · 🇪🇸 ES · 🇨🇳 ZH · 🇺🇦 UA`,
    refund: `💸 24h полный refund без вопросов. CDL Pro Pass Guarantee: refund или продление 90 дней при провале с 85%+ score.`,
    human: `🧑‍💻 Передаю Евгению. Обычно отвечает в течение 4 часов.`,
    forwardedAck: `✅ Получил. Евгений ответит скоро.`,
    unknown: `Команды: /start /pricing /states /languages /refund /human /lang`,
    pickCategory: `🚦 Выбери категорию прав для штата <b>{state}</b>:`,
    pickState: `🗽 В каком штате? Выбери из топ-6 или открой все 50 на сайте:`,
  },
  es: {
    welcome: `👋 ¡Hola! Bot de soporte DMVSOS.\n/pricing /states /languages /refund /human /lang`,
    pricing: `💰 Pago único, sin suscripciones\n🏍️ Moto $19.99 · 🚗 Auto $29.99 · 🚛 CDL $49.99 / 30 días\nExtensión $9.99 / +30 días`,
    states: `🗽 Los 50 estados + DC en dmvsos.com.`,
    languages: `🌍 5 idiomas: EN · RU · ES · ZH · UA`,
    refund: `💸 Reembolso completo en 24h.`,
    human: `🧑‍💻 Enviando a Evgenii. Responde en ~4h.`,
    forwardedAck: `✅ Recibido.`,
    unknown: `Comandos: /start /pricing /states /languages /refund /human /lang`,
    pickCategory: `🚦 Elige tipo de licencia para <b>{state}</b>:`,
    pickState: `🗽 ¿Qué estado? Elige uno o abre el sitio para los 50:`,
  },
  zh: {
    welcome: `👋 你好！DMVSOS支持机器人。\n/pricing /states /languages /refund /human /lang`,
    pricing: `💰 一次性付款\n🏍️ $19.99 · 🚗 $29.99 · 🚛 $49.99 / 30天`,
    states: `🗽 全美50州 + DC，在 dmvsos.com 选择`,
    languages: `🌍 5种语言`,
    refund: `💸 24小时全额退款。`,
    human: `🧑‍💻 转发给Evgenii，约4小时回复。`,
    forwardedAck: `✅ 已收到。`,
    unknown: `命令: /start /pricing /states /languages /refund /human /lang`,
    pickCategory: `🚦 选择 <b>{state}</b> 的驾照类型:`,
    pickState: `🗽 哪个州？选择或在网站查看全部50个州:`,
  },
  ua: {
    welcome: `👋 Привіт! Бот підтримки DMVSOS.\n/pricing /states /languages /refund /human /lang`,
    pricing: `💰 Разова оплата, без підписок\n🏍️ $19.99 · 🚗 $29.99 · 🚛 $49.99 / 30 днів`,
    states: `🗽 Усі 50 штатів + DC на dmvsos.com.`,
    languages: `🌍 5 мов`,
    refund: `💸 Повне повернення протягом 24h.`,
    human: `🧑‍💻 Передаю Євгенію. Відповідає за ~4 години.`,
    forwardedAck: `✅ Прийнято.`,
    unknown: `Команди: /start /pricing /states /languages /refund /human /lang`,
    pickCategory: `🚦 Обери категорію прав для штату <b>{state}</b>:`,
    pickState: `🗽 У якому штаті? Обери або відкрий сайт для всіх 50:`,
  },
};
function dm(lang, key) {
  return (DM_MESSAGES[lang] || DM_MESSAGES.en)[key] || DM_MESSAGES.en[key] || '';
}

// ── Callback query (inline keyboard taps) ───────────────────────────────
async function handleCallback(cb) {
  const chatId = cb.message?.chat?.id;
  const messageId = cb.message?.message_id;
  const data = cb.data || '';

  // ACK so loading spinner clears
  await tg('answerCallbackQuery', { callback_query_id: cb.id }).catch(() => {});

  if (!chatId || !messageId) return;

  // lang:<code> - user picked a language. Save and show main menu.
  if (data.startsWith('lang:')) {
    const newLang = data.slice(5);
    if (!['en', 'ru', 'ua', 'es', 'zh'].includes(newLang)) return;
    await sbSetUserLang(chatId, newLang);
    await tg('editMessageText', {
      chat_id: chatId, message_id: messageId,
      text: dm(newLang, 'welcome'), parse_mode: 'HTML',
      reply_markup: mainMenuKeyboard(newLang), disable_web_page_preview: true,
    });
    return;
  }

  // Resolve language from saved pref; fall back to TG auto-detect
  const lang = (await sbGetUserLang(chatId)) || pickLang(cb.from?.language_code) || 'en';

  // menu:start | menu:pricing | menu:states | menu:languages | menu:refund | menu:human
  if (data === 'menu:start') {
    await tg('editMessageText', {
      chat_id: chatId, message_id: messageId,
      text: dm(lang, 'welcome'), parse_mode: 'HTML',
      reply_markup: mainMenuKeyboard(lang), disable_web_page_preview: true,
    });
    return;
  }
  if (data === 'menu:states') {
    await tg('editMessageText', {
      chat_id: chatId, message_id: messageId,
      text: dm(lang, 'pickState'), parse_mode: 'HTML',
      reply_markup: statePickerKeyboard(lang), disable_web_page_preview: true,
    });
    return;
  }
  if (data.startsWith('menu:')) {
    const key = data.slice(5);
    await tg('editMessageText', {
      chat_id: chatId, message_id: messageId,
      text: dm(lang, key), parse_mode: 'HTML',
      reply_markup: backToMenuKeyboard(lang), disable_web_page_preview: true,
    });
    return;
  }

  // state:<slug> → show category picker for that state
  if (data.startsWith('state:')) {
    const stateSlug = data.slice(6);
    await tg('editMessageText', {
      chat_id: chatId, message_id: messageId,
      text: dm(lang, 'pickCategory').replace('{state}', titleCase(stateSlug)),
      parse_mode: 'HTML',
      reply_markup: categoryKeyboard(lang, stateSlug),
      disable_web_page_preview: true,
    });
    return;
  }
}

// ── Admin grant / check command handlers ─────────────────────────────────
function formatDaysRemaining(expiresAt) {
  if (!expiresAt) return 'no expiry';
  const days = (new Date(expiresAt) - Date.now()) / 86400000;
  if (days <= 0) return 'EXPIRED';
  if (days < 1) return `${Math.round(days * 24)}h left`;
  return `${days.toFixed(1)}d left`;
}

async function notifyOtherAdmins(actingChatId, actorName, text) {
  for (const id of GRANT_ALLOWED_CHAT_IDS) {
    if (String(id) === String(actingChatId)) continue;
    await sendMessage(id, `🔔 <b>${escapeHtml(actorName)}</b>: ${text}`).catch(() => {});
  }
}

async function handleGrantCommand(chatId, actorName, textRaw) {
  // Syntax: /grant <email> <moto|auto|cdl|extension> [days] [--no-link]
  const parts = textRaw.trim().split(/\s+/).slice(1);
  if (parts.length < 2) {
    await sendMessage(chatId,
      `Usage: <code>/grant &lt;email&gt; &lt;moto|auto|cdl|extension&gt; [days] [--no-link]</code>\n\n` +
      `Examples:\n` +
      `  <code>/grant foo@bar.com auto</code>  (30 days, default)\n` +
      `  <code>/grant foo@bar.com auto 7</code>\n` +
      `  <code>/grant foo@bar.com cdl 30 --no-link</code>`);
    return;
  }
  const email = parts[0];
  const passType = parts[1].toLowerCase();
  const sendLink = !parts.includes('--no-link');
  let days = 30;
  for (const p of parts.slice(2)) {
    if (p === '--no-link') continue;
    const n = parseInt(p, 10);
    if (Number.isFinite(n) && n > 0 && n <= 365) days = n;
  }

  if (!isValidEmail(email)) {
    await sendMessage(chatId, `⚠️ Invalid email: <code>${escapeHtml(email)}</code>`);
    return;
  }
  if (!isValidPassType(passType)) {
    await sendMessage(chatId, `⚠️ Invalid pass type: <code>${escapeHtml(passType)}</code>. Use one of: moto, auto, cdl, extension.`);
    return;
  }

  try {
    const r = await grantPass({ email, passType, days, sendMagicLink: sendLink });
    const linkLine = sendLink
      ? (typeof r.magicLink === 'string' ? `🔗 Magic link sent` : `⚠️ Magic link FAILED: ${r.magicLink?.error || 'unknown'}`)
      : `🔗 No link sent (--no-link)`;
    const summary =
      `✅ <b>${escapeHtml(r.email)}</b> — <b>${r.passType}</b>, ${r.days}d\n` +
      `   ${r.userCreated ? 'New user' : 'Existing user'} <code>${r.userId}</code>\n` +
      `   Until ${r.expiresAt.slice(0, 10)} (${formatDaysRemaining(r.expiresAt)})\n` +
      `   ${linkLine}`;
    await sendMessage(chatId, summary);
    await notifyOtherAdmins(chatId, actorName,
      `granted <b>${r.passType}</b> ${r.days}d to <code>${escapeHtml(r.email)}</code>`);
  } catch (err) {
    await sendMessage(chatId, `❌ Grant failed: ${escapeHtml(err.message)}`);
  }
}

async function handleCheckCommand(chatId, textRaw) {
  // Syntax: /check <email>
  const parts = textRaw.trim().split(/\s+/).slice(1);
  if (parts.length < 1) {
    await sendMessage(chatId, `Usage: <code>/check &lt;email&gt;</code>`);
    return;
  }
  const email = parts[0];
  if (!isValidEmail(email)) {
    await sendMessage(chatId, `⚠️ Invalid email: <code>${escapeHtml(email)}</code>`);
    return;
  }
  try {
    const s = await getUserState(email);
    if (!s.exists) {
      await sendMessage(chatId, `📭 No account for <code>${escapeHtml(email)}</code>`);
      return;
    }
    const lines = [`📋 <b>${escapeHtml(s.email)}</b>`];
    if (s.profile) {
      lines.push(`   Profile: is_pro=<b>${s.profile.is_pro}</b>, plan=${s.profile.plan_type || '-'}, until ${(s.profile.plan_expires_at || '').slice(0, 10) || '-'}`);
    }
    lines.push(`   Accounts: ${s.accounts.length}`);
    for (const a of s.accounts) {
      const ident = a.identities.length ? a.identities.join(',') : '(none)';
      const lastLogin = a.lastSignInAt ? a.lastSignInAt.slice(0, 16).replace('T', ' ') : 'NEVER';
      lines.push(`   • <code>${a.userId.slice(0, 8)}</code> identities=${ident} last_signin=${lastLogin}`);
      for (const p of a.passes) {
        lines.push(`     - ${p.pass_type}: ${p.expires_at.slice(0, 10)} (${formatDaysRemaining(p.expires_at)})`);
      }
      if (a.passes.length === 0) lines.push(`     - no active passes`);
    }
    await sendMessage(chatId, lines.join('\n'));
  } catch (err) {
    await sendMessage(chatId, `❌ Check failed: ${escapeHtml(err.message)}`);
  }
}

// ── DM message handler ──────────────────────────────────────────────────
async function handleDmMessage(msg, autoLang) {
  const chatId = msg.chat.id;
  const userName = msg.from.first_name || msg.from.username || 'there';
  const userId = msg.from.id;
  // Read both text and caption so photos/videos with captions still match
  // keyword auto-replies and forward with the caption visible. Earlier this
  // was `msg.text || ''` which dropped all caption-bearing media to empty.
  const textRaw = (msg.text || msg.caption || '').trim();
  const text = textRaw.toLowerCase();

  // ── Admin reply threading ──────────────────────────────────────────────
  // When the admin replies (Telegram-native reply) to a forwarded user
  // message in the admin chat, route that reply back to the original user
  // through the bot. The forwarded message embeds "chat <code>123456</code>"
  // which renders as plain "chat 123456" in reply_to_message.text — that's
  // what we parse here. copyMessage handles text + media uniformly so admin
  // can voice-note back too.
  if (ADMIN_CHAT_ID && String(chatId) === String(ADMIN_CHAT_ID) && msg.reply_to_message) {
    const quoted = msg.reply_to_message.text || msg.reply_to_message.caption || '';
    const match = quoted.match(/chat (-?\d+)/);
    if (match) {
      const targetChatId = match[1];
      // Skip self-routing — admin's own test-message forwards include their
      // own chat_id in the header, replying to one of those would loop back.
      if (String(targetChatId) !== String(ADMIN_CHAT_ID)) {
        const sent = await tg('copyMessage', {
          chat_id: targetChatId,
          from_chat_id: chatId,
          message_id: msg.message_id,
        });
        const ok = sent && sent.ok !== false && !sent.error_code;
        await sendMessage(chatId,
          ok
            ? `↪️ Replied to user <code>${targetChatId}</code>`
            : `⚠️ Couldn't deliver to <code>${targetChatId}</code> (user may have blocked the bot or never DMed it).`,
          { reply_to_message_id: msg.message_id }
        );
        return;
      }
    }
  }

  // ── Admin grant / check commands ───────────────────────────────────────
  // /grant <email> <moto|auto|cdl|extension> [days]  → run a manual pass grant
  // /check <email>                                    → report current state
  // Gated to GRANT_ALLOWED_CHAT_IDS (your chat + co-admin chats). Falls
  // through if the chat isn't allowed, so unauthorized users get the normal
  // "unknown command" reply instead of a permission error that hints at the
  // feature's existence.
  if (GRANT_ALLOWED_CHAT_IDS.has(String(chatId))) {
    if (text.startsWith('/grant')) {
      await handleGrantCommand(chatId, userName, textRaw);
      return;
    }
    if (text.startsWith('/check')) {
      await handleCheckCommand(chatId, textRaw);
      return;
    }
  }

  // Resolve language: saved pref first, then Telegram-auto-detected, then EN.
  const savedLang = await sbGetUserLang(chatId);
  const lang = savedLang || autoLang || 'en';

  // /start or /lang - always show language picker. After /start was completed
  // before, the picker still appears (user can change at any time).
  if (text === '/start' || text === '/lang' || text === '/language') {
    await sendMessage(chatId, LANG_PICKER_TEXT, { reply_markup: languagePickerKeyboard() });
    return;
  }
  if (text === '/menu') {
    await sendMessage(chatId, dm(lang, 'welcome'), { reply_markup: mainMenuKeyboard(lang) });
    return;
  }
  if (text.startsWith('/pricing')) {
    await sendMessage(chatId, dm(lang, 'pricing'), { reply_markup: backToMenuKeyboard(lang) });
    return;
  }
  if (text.startsWith('/states')) {
    await sendMessage(chatId, dm(lang, 'states'), { reply_markup: statePickerKeyboard(lang) });
    return;
  }
  if (text.startsWith('/languages') || text.startsWith('/lang')) {
    await sendMessage(chatId, dm(lang, 'languages'), { reply_markup: backToMenuKeyboard(lang) });
    return;
  }
  if (text.startsWith('/refund')) {
    await sendMessage(chatId, dm(lang, 'refund'), { reply_markup: backToMenuKeyboard(lang) });
    return;
  }
  if (text.startsWith('/human') || text === 'human' || text === 'оператор' || text === 'человек') {
    await sendMessage(chatId, dm(lang, 'human'), { reply_markup: backToMenuKeyboard(lang) });
    return;
  }
  if (text.startsWith('/')) {
    await sendMessage(chatId, dm(lang, 'unknown'), { reply_markup: mainMenuKeyboard(lang) });
    return;
  }

  // Free-form: try smart shortcuts first
  // (1) State name alone (e.g. "Калифорния", "Texas") → ask category
  const stateOnly = detectState(textRaw);
  const categoryOnly = detectCategory(textRaw);
  const hasDmvWord = matchTrigger(textRaw); // returns null if not actually a DMV question

  if (stateOnly && !hasDmvWord && textRaw.length < 60) {
    await sendMessage(chatId, dm(lang, 'pickCategory').replace('{state}', titleCase(stateOnly)), {
      reply_markup: categoryKeyboard(lang, stateOnly),
    });
    return;
  }
  if (categoryOnly && !stateOnly && !hasDmvWord && textRaw.length < 40) {
    await sendMessage(chatId, dm(lang, 'pickState'), { reply_markup: statePickerKeyboard(lang) });
    return;
  }

  // Free-form: try keyword detection first - if it's a DMV question,
  // answer with a smart state-aware link directly (better than just "I'll forward").
  const kw = matchTrigger(textRaw);
  if (kw) {
    const stateSlug = detectState(textRaw);
    const isCdl = detectCdl(textRaw);
    const reply = composeReply(lang, stateSlug, userName);
    await sendMessage(chatId, reply);

    // Notify admin (info only - already auto-handled)
    if (ADMIN_CHAT_ID) {
      const meta = [`lang ${lang}`];
      if (stateSlug) meta.push(`state ${stateSlug}`);
      if (isCdl) meta.push('🚛 CDL');
      meta.push(`kw: ${kw}`);
      await sendMessage(ADMIN_CHAT_ID,
        `💡 Auto-answered DM from <b>${userName}</b> (chat <code>${chatId}</code>, ${meta.join(', ')}):\n\n<i>${escapeHtml(textRaw)}</i>`);
    }

    // Log to bot_keyword_hits for analytics (chat_id is the private chat id)
    await sbLogHit({
      chat_id: chatId, user_id: userId, user_name: userName,
      message_text: textRaw.slice(0, 500),
      matched_keyword: isCdl ? `${kw} [CDL]` : kw,
      matched_state: stateSlug,
      reply_sent: true, skipped_reason: null,
    });
    return;
  }

  // Anything else → forward to admin + ack to user.
  // Sends a context-header sendMessage AND, if the user attached media
  // (voice / photo / video / sticker / document / location / contact),
  // also forwards the original so admin can actually play/view it. This
  // replaces the old behavior where voice/photo DMs arrived as empty
  // "From X (chat ..., lang ru):" with no body.
  if (ADMIN_CHAT_ID) {
    const isSelfMessage = String(chatId) === String(ADMIN_CHAT_ID);
    const header = `💬 <b>${isSelfMessage ? 'You (test)' : 'From ' + userName}</b> (chat <code>${chatId}</code>, lang ${lang})`;
    const mediaLabel =
        msg.voice       ? '🎤 voice message'
      : msg.video_note  ? '🎥 video note'
      : msg.video       ? '🎬 video'
      : msg.photo       ? '🖼 photo'
      : msg.audio       ? '🎵 audio'
      : msg.document    ? '📎 document'
      : msg.sticker     ? '😀 sticker'
      : msg.animation   ? '🎞 animation'
      : msg.location    ? '📍 location'
      : msg.contact     ? '👤 contact'
      : null;
    const body = textRaw
      ? escapeHtml(textRaw)
      : `<i>${mediaLabel || 'no text'} — forwarded below</i>`;
    await sendMessage(ADMIN_CHAT_ID, `${header}:\n\n${body}`);
    if (mediaLabel) {
      // Forward the original message so admin sees / hears the actual content.
      await tg('forwardMessage', {
        chat_id: ADMIN_CHAT_ID,
        from_chat_id: chatId,
        message_id: msg.message_id,
      });
    }
  }
  await sendMessage(chatId, dm(lang, 'forwardedAck'));
}

function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

function titleCase(slug) {
  return slug.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
}

// ── Webhook entry ───────────────────────────────────────────────────────
export async function POST(request) {
  if (SECRET) {
    const h = request.headers.get('x-telegram-bot-api-secret-token');
    if (h !== SECRET) return new Response('Forbidden', { status: 403 });
  }

  let update;
  try {
    update = await request.json();
  } catch {
    return new Response('Bad request', { status: 400 });
  }

  try {
    // Inline keyboard taps
    if (update.callback_query) {
      await handleCallback(update.callback_query);
      return new Response('OK', { status: 200 });
    }

    const msg = update.message;
    if (!msg || !msg.from) return new Response('OK', { status: 200 });

    // Bot is DM-only. Group / supergroup / channel messages are silently
    // ignored. We used to have a full group flow with keyword auto-reply,
    // /enable /disable admin commands, and silent forwarding to admin DM,
    // but bot_groups was empty in production and the code was dead weight.
    if (msg.chat.type !== 'private') return new Response('OK', { status: 200 });

    const lang = pickLang(msg.from.language_code);
    await handleDmMessage(msg, lang);
  } catch (err) {
    console.error('Telegram handler error:', err.message);
  }

  return new Response('OK', { status: 200 });
}

export async function GET() {
  return new Response('DMVSOS Telegram webhook', { status: 200 });
}
