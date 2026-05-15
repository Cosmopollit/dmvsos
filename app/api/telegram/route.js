// Telegram bot webhook handler for @dmvsos_support_bot.
//
// Two modes:
//   1. Private chat (DM) — answers commands /start /pricing /states /languages
//      /refund /human, forwards free-form text to admin.
//   2. Group chat — listens for DMV-related questions and auto-replies once
//      per hour per group (throttle). Admins can toggle with /enable /disable.
//
// Privacy-mode must be OFF in BotFather for group message visibility.
// See TELEGRAM_BOT.md for setup.

import { matchTrigger, detectState, composeReply, isThrottled } from '@/lib/telegram-helper.js';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID;
const SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || '';
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const API = TOKEN ? `https://api.telegram.org/bot${TOKEN}` : null;

const sbHeaders = {
  apikey: SUPA_KEY,
  Authorization: `Bearer ${SUPA_KEY}`,
  'Content-Type': 'application/json',
};

// ── Supabase helpers ─────────────────────────────────────────────────────
async function sbGetGroup(chatId) {
  const r = await fetch(`${SUPA_URL}/rest/v1/bot_groups?chat_id=eq.${chatId}&select=*`, { headers: sbHeaders });
  if (!r.ok) return null;
  const rows = await r.json();
  return rows[0] || null;
}

async function sbUpsertGroup(row) {
  await fetch(`${SUPA_URL}/rest/v1/bot_groups`, {
    method: 'POST',
    headers: { ...sbHeaders, Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify(row),
  });
}

async function sbUpdateGroup(chatId, patch) {
  await fetch(`${SUPA_URL}/rest/v1/bot_groups?chat_id=eq.${chatId}`, {
    method: 'PATCH',
    headers: sbHeaders,
    body: JSON.stringify(patch),
  });
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

async function isGroupAdmin(chatId, userId) {
  const r = await tg('getChatMember', { chat_id: chatId, user_id: userId });
  const status = r?.result?.status;
  return status === 'creator' || status === 'administrator';
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

// ── DM messages (existing behavior) ──────────────────────────────────────
const DM_MESSAGES = {
  en: {
    welcome: `👋 Hi! I'm the DMVSOS support bot.

I can help with:
/pricing — How much it costs
/states — Which states we cover
/languages — Available languages
/refund — Refund policy
/human — Talk to Evgenii (founder) directly

Or just type your question — I'll forward it.`,
    pricing: `💰 <b>Flat-rate one-time payments — no subscriptions</b>

🏍️ Moto Pass — $19.99 / 30 days
🚗 Auto Pass — $29.99 / 30 days
🚛 CDL Pro — $49.99 / 30 days + Pass Guarantee

🔄 Need more time? Extend any pass for $9.99 / +30 days

24h full refund. No questions asked.`,
    states: `🗽 We cover <b>all 50 US states + DC</b>.

Just pick your state on dmvsos.com — every state has its own question bank built from the official driver's handbook.`,
    languages: `🌍 We support 5 languages:
🇺🇸 English  🇷🇺 Русский  🇪🇸 Español  🇨🇳 中文  🇺🇦 Українська`,
    refund: `💸 <b>Refund policy</b>

Within 24h of purchase: full refund, no questions asked.
CDL Pro Pass Guarantee: refund or 90d extension if you fail the actual DMV test with 85%+ practice score.`,
    human: `🧑‍💻 Sending your message to Evgenii (founder). Usually replies within 4 hours.`,
    forwardedAck: `✅ Got it. Evgenii will reply shortly.`,
    unknown: `Commands: /start /pricing /states /languages /refund /human`,
  },
  ru: {
    welcome: `👋 Привет! Я бот поддержки DMVSOS.\n\n/pricing /states /languages /refund /human\n\nИли просто напиши вопрос — передам.`,
    pricing: `💰 <b>Одноразовая оплата — без подписок</b>\n\n🏍️ Moto Pass — $19.99 / 30 дней\n🚗 Auto Pass — $29.99 / 30 дней\n🚛 CDL Pro — $49.99 / 30 дней + Pass Guarantee\n\n🔄 Продление $9.99 / +30 дней\n24h полный refund.`,
    states: `🗽 Покрываем <b>все 50 штатов + DC</b>. Выбери штат на dmvsos.com.`,
    languages: `🌍 5 языков: 🇺🇸 EN · 🇷🇺 RU · 🇪🇸 ES · 🇨🇳 ZH · 🇺🇦 UA`,
    refund: `💸 24h полный refund без вопросов. CDL Pro Pass Guarantee: refund или продление 90 дней при провале с 85%+ score.`,
    human: `🧑‍💻 Передаю Евгению. Обычно отвечает в течение 4 часов.`,
    forwardedAck: `✅ Получил. Евгений ответит скоро.`,
    unknown: `Команды: /start /pricing /states /languages /refund /human`,
  },
  es: {
    welcome: `👋 ¡Hola! Bot de soporte DMVSOS.\n/pricing /states /languages /refund /human`,
    pricing: `💰 Pago único, sin suscripciones\n🏍️ Moto $19.99 · 🚗 Auto $29.99 · 🚛 CDL $49.99 / 30 días\nExtensión $9.99 / +30 días`,
    states: `🗽 Los 50 estados + DC en dmvsos.com.`,
    languages: `🌍 5 idiomas: EN · RU · ES · ZH · UA`,
    refund: `💸 Reembolso completo en 24h.`,
    human: `🧑‍💻 Enviando a Evgenii. Responde en ~4h.`,
    forwardedAck: `✅ Recibido.`,
    unknown: `Comandos: /start /pricing /states /languages /refund /human`,
  },
  zh: {
    welcome: `👋 你好！DMVSOS支持机器人。\n/pricing /states /languages /refund /human`,
    pricing: `💰 一次性付款\n🏍️ $19.99 · 🚗 $29.99 · 🚛 $49.99 / 30天`,
    states: `🗽 全美50州 + DC，在 dmvsos.com 选择`,
    languages: `🌍 5种语言`,
    refund: `💸 24小时全额退款。`,
    human: `🧑‍💻 转发给Evgenii，约4小时回复。`,
    forwardedAck: `✅ 已收到。`,
    unknown: `命令: /start /pricing /states /languages /refund /human`,
  },
  ua: {
    welcome: `👋 Привіт! Бот підтримки DMVSOS.\n/pricing /states /languages /refund /human`,
    pricing: `💰 Разова оплата, без підписок\n🏍️ $19.99 · 🚗 $29.99 · 🚛 $49.99 / 30 днів`,
    states: `🗽 Усі 50 штатів + DC на dmvsos.com.`,
    languages: `🌍 5 мов`,
    refund: `💸 Повне повернення протягом 24h.`,
    human: `🧑‍💻 Передаю Євгенію. Відповідає за ~4 години.`,
    forwardedAck: `✅ Прийнято.`,
    unknown: `Команди: /start /pricing /states /languages /refund /human`,
  },
};
function dm(lang, key) {
  return (DM_MESSAGES[lang] || DM_MESSAGES.en)[key] || DM_MESSAGES.en[key] || '';
}

// ── Group lifecycle (bot added/removed) ──────────────────────────────────
async function handleMyChatMember(update) {
  const cm = update.my_chat_member;
  const chat = cm.chat;
  const newStatus = cm.new_chat_member?.status;
  const oldStatus = cm.old_chat_member?.status;

  // Bot was added (or upgraded from kicked/left)
  if ((newStatus === 'member' || newStatus === 'administrator') &&
      (oldStatus === 'left' || oldStatus === 'kicked' || !oldStatus)) {
    await sbUpsertGroup({
      chat_id: chat.id,
      title: chat.title || null,
      username: chat.username || null,
      type: chat.type,
      enabled: true,
      added_by: cm.from?.id || null,
      removed_at: null,
    });

    // Intro message — disclose what bot does
    const introByLang = {
      en: `👋 Hi! I'm <b>@dmvsos_support_bot</b> — I help with DMV/driver-license questions. I'll only reply when someone asks something DMV-related (max once per hour). Admins can use /disable to mute me.`,
      ru: `👋 Привет! Я <b>@dmvsos_support_bot</b> — помогаю с вопросами про DMV/права. Отвечаю только когда кто-то спрашивает про DMV (не чаще раза в час). Админы могут заглушить меня командой /disable.`,
    };
    await sendMessage(chat.id, introByLang.ru); // default RU; safe for our target groups

    if (ADMIN_CHAT_ID) {
      await sendMessage(ADMIN_CHAT_ID,
        `🆕 Bot added to group: <b>${chat.title}</b> (id <code>${chat.id}</code>, type ${chat.type})`);
    }
  }

  // Bot was removed
  if (newStatus === 'left' || newStatus === 'kicked') {
    await sbUpdateGroup(chat.id, { enabled: false, removed_at: new Date().toISOString() });
    if (ADMIN_CHAT_ID) {
      await sendMessage(ADMIN_CHAT_ID,
        `❌ Bot removed from: <b>${chat.title || chat.id}</b> (status: ${newStatus})`);
    }
  }
}

// ── Group message handler ───────────────────────────────────────────────
async function handleGroupMessage(msg, lang) {
  const chatId = msg.chat.id;
  const textRaw = (msg.text || '').trim();
  if (!textRaw) return;

  const userName = msg.from.first_name || msg.from.username || 'there';
  const userId = msg.from.id;

  // Admin commands first (only group admins can toggle)
  if (textRaw.startsWith('/disable') || textRaw.startsWith('/enable') || textRaw.startsWith('/status')) {
    const isAdmin = await isGroupAdmin(chatId, userId);
    if (!isAdmin) return;
    if (textRaw.startsWith('/disable')) {
      await sbUpdateGroup(chatId, { enabled: false });
      await sendMessage(chatId, `🔕 Muted in this group. Use /enable to re-enable.`);
    } else if (textRaw.startsWith('/enable')) {
      await sbUpdateGroup(chatId, { enabled: true });
      await sendMessage(chatId, `🔔 Re-enabled. I'll reply to DMV questions (max once per hour).`);
    } else {
      const g = await sbGetGroup(chatId);
      const state = g?.enabled ? 'enabled ✅' : 'disabled 🔕';
      await sendMessage(chatId, `Status: ${state}\nReplies sent: ${g?.reply_count || 0}\nLast reply: ${g?.last_reply_at || 'never'}`);
    }
    return;
  }

  // Keyword match
  const kw = matchTrigger(textRaw);
  if (!kw) return;

  const stateSlug = detectState(textRaw);

  // Group enabled?
  const group = await sbGetGroup(chatId);
  if (group && !group.enabled) {
    await sbLogHit({
      chat_id: chatId, user_id: userId, user_name: userName,
      message_text: textRaw.slice(0, 500), matched_keyword: kw,
      matched_state: stateSlug, reply_sent: false, skipped_reason: 'disabled',
    });
    return;
  }

  // Throttle
  if (group && isThrottled(group.last_reply_at)) {
    await sbLogHit({
      chat_id: chatId, user_id: userId, user_name: userName,
      message_text: textRaw.slice(0, 500), matched_keyword: kw,
      matched_state: stateSlug, reply_sent: false, skipped_reason: 'throttled',
    });
    return;
  }

  // Send reply
  const reply = composeReply(lang, stateSlug, userName);
  await sendMessage(chatId, reply, { reply_to_message_id: msg.message_id });

  // Update group state — upsert in case we somehow missed the my_chat_member event
  await sbUpsertGroup({
    chat_id: chatId,
    title: msg.chat.title || null,
    type: msg.chat.type,
    enabled: true,
    last_reply_at: new Date().toISOString(),
    reply_count: (group?.reply_count || 0) + 1,
  });

  await sbLogHit({
    chat_id: chatId, user_id: userId, user_name: userName,
    message_text: textRaw.slice(0, 500), matched_keyword: kw,
    matched_state: stateSlug, reply_sent: true, skipped_reason: null,
  });
}

// ── DM message handler (existing flow) ──────────────────────────────────
async function handleDmMessage(msg, lang) {
  const chatId = msg.chat.id;
  const userName = msg.from.first_name || msg.from.username || 'there';
  const textRaw = (msg.text || '').trim();
  const text = textRaw.toLowerCase();

  if (text.startsWith('/start')) {
    await sendMessage(chatId, dm(lang, 'welcome'));
  } else if (text.startsWith('/pricing')) {
    await sendMessage(chatId, dm(lang, 'pricing'));
  } else if (text.startsWith('/states')) {
    await sendMessage(chatId, dm(lang, 'states'));
  } else if (text.startsWith('/languages') || text.startsWith('/lang')) {
    await sendMessage(chatId, dm(lang, 'languages'));
  } else if (text.startsWith('/refund')) {
    await sendMessage(chatId, dm(lang, 'refund'));
  } else if (text.startsWith('/human') || text === 'human' || text === 'оператор' || text === 'человек') {
    await sendMessage(chatId, dm(lang, 'human'));
  } else if (text.startsWith('/')) {
    await sendMessage(chatId, dm(lang, 'unknown'));
  } else {
    if (ADMIN_CHAT_ID) {
      const isSelfMessage = String(chatId) === String(ADMIN_CHAT_ID);
      await sendMessage(ADMIN_CHAT_ID,
        `💬 <b>${isSelfMessage ? 'You (test)' : 'From ' + userName}</b> (chat <code>${chatId}</code>, lang ${lang}):\n\n${textRaw}`);
    }
    await sendMessage(chatId, dm(lang, 'forwardedAck'));
  }
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
    // Bot added/removed from a group
    if (update.my_chat_member) {
      await handleMyChatMember(update);
      return new Response('OK', { status: 200 });
    }

    const msg = update.message;
    if (!msg || !msg.from) return new Response('OK', { status: 200 });

    const lang = pickLang(msg.from.language_code);
    const chatType = msg.chat.type;

    if (chatType === 'private') {
      await handleDmMessage(msg, lang);
    } else if (chatType === 'group' || chatType === 'supergroup') {
      await handleGroupMessage(msg, lang);
    }
  } catch (err) {
    console.error('Telegram handler error:', err.message);
  }

  return new Response('OK', { status: 200 });
}

export async function GET() {
  return new Response('DMVSOS Telegram webhook', { status: 200 });
}
