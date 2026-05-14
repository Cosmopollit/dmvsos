// Telegram bot webhook handler for @dmvsos_support_bot.
//
// Receives updates from Telegram → routes to command handlers → replies.
// No external Telegram SDK — direct HTTPS calls to Bot API.

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID; // optional, for /human forwarding
const SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || ''; // verifies webhook is from Telegram

const API = TOKEN ? `https://api.telegram.org/bot${TOKEN}` : null;

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

// Replies localized by Telegram user's language_code when available.
// Fall back to EN.
function reply(lang, key) {
  const L = MESSAGES[lang] || MESSAGES.en;
  return L[key] || MESSAGES.en[key] || '';
}

const MESSAGES = {
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
🇺🇸 English
🇷🇺 Русский
🇪🇸 Español
🇨🇳 中文
🇺🇦 Українська

Switch language any time on dmvsos.com (top-right).`,
    refund: `💸 <b>Our refund policy</b>

Within 24 hours of purchase: full refund, no questions asked. Just reply here.

CDL Pro Pass Guarantee: if you fail the actual DMV test and you scored 85%+ on our practice, we refund or extend 90 days (your choice).

Email: maindmvsos@gmail.com`,
    human: `🧑‍💻 Sending your message to Evgenii (founder). He usually responds within 4 hours.

What's your question? Just type it here.`,
    forwardedAck: `✅ Got it. Evgenii will reply here shortly.`,
    unknown: `I'm a simple bot — I know these commands:
/start /pricing /states /languages /refund /human

Or type "human" and I'll forward to Evgenii.`,
  },
  ru: {
    welcome: `👋 Привет! Я бот поддержки DMVSOS.

Могу помочь:
/pricing — Сколько стоит
/states — Какие штаты
/languages — Доступные языки
/refund — Возврат денег
/human — Написать Евгению (founder) напрямую

Или просто напиши свой вопрос — я передам.`,
    pricing: `💰 <b>Одноразовая оплата — без подписок</b>

🏍️ Moto Pass — $19.99 / 30 дней
🚗 Auto Pass — $29.99 / 30 дней
🚛 CDL Pro — $49.99 / 30 дней + Pass Guarantee

🔄 Нужно больше времени? Продли любой Pass за $9.99 / +30 дней

24h полный refund. Без вопросов.`,
    states: `🗽 Покрываем <b>все 50 штатов США + DC</b>.

Просто выбери штат на dmvsos.com — для каждого свой набор вопросов из официального driver's handbook.`,
    languages: `🌍 Поддерживаем 5 языков:
🇺🇸 English
🇷🇺 Русский
🇪🇸 Español
🇨🇳 中文
🇺🇦 Українська

Переключиться можно в любой момент на dmvsos.com (правый верх).`,
    refund: `💸 <b>Возврат денег</b>

В течение 24 часов после покупки — полный refund, без вопросов. Просто напиши сюда.

CDL Pro Pass Guarantee: если провалил настоящий DMV тест при условии 85%+ score на наших тестах — refund или продление на 90 дней (на выбор).

Email: maindmvsos@gmail.com`,
    human: `🧑‍💻 Передаю твой вопрос Евгению (founder). Обычно отвечает в течение 4 часов.

Что хочешь спросить? Просто напиши здесь.`,
    forwardedAck: `✅ Получил. Евгений ответит здесь скоро.`,
    unknown: `Я простой бот — знаю эти команды:
/start /pricing /states /languages /refund /human

Или напиши "human" и я передам Евгению.`,
  },
  es: {
    welcome: `👋 ¡Hola! Soy el bot de soporte DMVSOS.

Puedo ayudar con:
/pricing — Cuánto cuesta
/states — Qué estados cubrimos
/languages — Idiomas disponibles
/refund — Política de reembolso
/human — Hablar con Evgenii (fundador) directamente

O escribe tu pregunta — la reenvío.`,
    pricing: `💰 <b>Pago único — sin suscripciones</b>

🏍️ Moto Pass — $19.99 / 30 días
🚗 Auto Pass — $29.99 / 30 días
🚛 CDL Pro — $49.99 / 30 días + Pass Guarantee

🔄 ¿Más tiempo? Extiende por $9.99 / +30 días`,
    states: `🗽 Cubrimos <b>los 50 estados + DC</b>.

Elige tu estado en dmvsos.com.`,
    languages: `🌍 5 idiomas: 🇺🇸 EN · 🇷🇺 RU · 🇪🇸 ES · 🇨🇳 ZH · 🇺🇦 UA`,
    refund: `💸 Reembolso completo en las primeras 24h, sin preguntas. CDL Pro tiene Pass Guarantee adicional.`,
    human: `🧑‍💻 Enviando tu mensaje a Evgenii. Suele responder en 4 horas. ¿Cuál es tu pregunta?`,
    forwardedAck: `✅ Recibido. Evgenii responderá pronto.`,
    unknown: `Comandos: /start /pricing /states /languages /refund /human`,
  },
  zh: {
    welcome: `👋 你好！我是DMVSOS支持机器人。

可以帮你：
/pricing — 价格
/states — 哪些州
/languages — 语言
/refund — 退款政策
/human — 直接联系Evgenii（创始人）

或者直接输入问题 — 我会转发。`,
    pricing: `💰 一次性付款 — 无订阅

🏍️ Moto Pass — $19.99 / 30天
🚗 Auto Pass — $29.99 / 30天
🚛 CDL Pro — $49.99 / 30天 + 通过保证`,
    states: `🗽 覆盖<b>所有50个州 + DC</b>。在 dmvsos.com 选择您的州。`,
    languages: `🌍 5种语言: 🇺🇸 EN · 🇷🇺 RU · 🇪🇸 ES · 🇨🇳 ZH · 🇺🇦 UA`,
    refund: `💸 购买后24小时内全额退款，无需理由。`,
    human: `🧑‍💻 正在将您的消息转发给Evgenii。通常4小时内回复。`,
    forwardedAck: `✅ 已收到。`,
    unknown: `命令: /start /pricing /states /languages /refund /human`,
  },
  ua: {
    welcome: `👋 Привіт! Я бот підтримки DMVSOS.

Можу допомогти:
/pricing — Скільки коштує
/states — Які штати
/languages — Мови
/refund — Повернення коштів
/human — Написати Євгенію (founder) напряму`,
    pricing: `💰 Разова оплата — без підписок

🏍️ Moto Pass — $19.99 / 30 днів
🚗 Auto Pass — $29.99 / 30 днів
🚛 CDL Pro — $49.99 / 30 днів + Pass Guarantee`,
    states: `🗽 Покриваємо <b>усі 50 штатів + DC</b>.`,
    languages: `🌍 5 мов: 🇺🇸 EN · 🇷🇺 RU · 🇪🇸 ES · 🇨🇳 ZH · 🇺🇦 UA`,
    refund: `💸 Повне повернення протягом 24h, без питань.`,
    human: `🧑‍💻 Передаю твоє повідомлення Євгенію. Зазвичай відповідає за 4 години.`,
    forwardedAck: `✅ Прийнято. Євгеній відповість тут.`,
    unknown: `Команди: /start /pricing /states /languages /refund /human`,
  },
};

// Normalize Telegram language_code to one of our supported langs.
function pickLang(code) {
  if (!code) return 'en';
  const c = code.toLowerCase().slice(0, 2);
  if (['ru'].includes(c)) return 'ru';
  if (['es'].includes(c)) return 'es';
  if (['zh', 'cn'].includes(c)) return 'zh';
  if (['uk', 'ua'].includes(c)) return 'ua';
  return 'en';
}

export async function POST(request) {
  // Verify webhook secret (set when registering webhook)
  if (SECRET) {
    const h = request.headers.get('x-telegram-bot-api-secret-token');
    if (h !== SECRET) {
      return new Response('Forbidden', { status: 403 });
    }
  }

  let update;
  try {
    update = await request.json();
  } catch {
    return new Response('Bad request', { status: 400 });
  }

  const msg = update?.message;
  if (!msg || !msg.from) return new Response('OK', { status: 200 });

  const chatId = msg.chat.id;
  const userName = msg.from.first_name || msg.from.username || 'there';
  const lang = pickLang(msg.from.language_code);
  const textRaw = (msg.text || '').trim();
  const text = textRaw.toLowerCase();

  // Command routing
  try {
    if (text.startsWith('/start')) {
      await sendMessage(chatId, reply(lang, 'welcome'));
    } else if (text.startsWith('/pricing')) {
      await sendMessage(chatId, reply(lang, 'pricing'));
    } else if (text.startsWith('/states')) {
      await sendMessage(chatId, reply(lang, 'states'));
    } else if (text.startsWith('/languages') || text.startsWith('/lang')) {
      await sendMessage(chatId, reply(lang, 'languages'));
    } else if (text.startsWith('/refund')) {
      await sendMessage(chatId, reply(lang, 'refund'));
    } else if (text.startsWith('/human') || text === 'human' || text === 'оператор' || text === 'человек') {
      await sendMessage(chatId, reply(lang, 'human'));
    } else if (text.startsWith('/')) {
      await sendMessage(chatId, reply(lang, 'unknown'));
    } else {
      // Free-form text → forward to admin (always), ack to user
      if (ADMIN_CHAT_ID) {
        const isSelfMessage = String(chatId) === String(ADMIN_CHAT_ID);
        await sendMessage(ADMIN_CHAT_ID,
          `💬 <b>${isSelfMessage ? 'You wrote (test)' : 'From ' + userName}</b> (chat_id <code>${chatId}</code>, lang ${lang}):\n\n${textRaw}`);
      }
      await sendMessage(chatId, reply(lang, 'forwardedAck'));
    }
  } catch (err) {
    console.error('Telegram handler error:', err.message);
  }

  return new Response('OK', { status: 200 });
}

export async function GET() {
  return new Response('DMVSOS Telegram webhook', { status: 200 });
}
