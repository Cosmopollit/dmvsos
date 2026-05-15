// Registers the bot's webhook URL with Telegram Bot API.
// Run once after deploy, and again whenever you rotate the webhook secret.
//
// Usage:
//   node scripts/setup-telegram-webhook.js          # production (dmvsos.com)
//   node scripts/setup-telegram-webhook.js info     # show current webhook
//   node scripts/setup-telegram-webhook.js delete   # remove webhook

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import dns from 'dns';

// Force IPv4 — local network here doesn't route IPv6 to api.telegram.org.
dns.setDefaultResultOrder('ipv4first');

const __dirname = dirname(fileURLToPath(import.meta.url));
const envFile = readFileSync(join(__dirname, '..', '.env.local'), 'utf8');
const env = (k) => envFile.split('\n').find(l => l.startsWith(k + '='))?.slice(k.length + 1)?.trim();

const TOKEN = env('TELEGRAM_BOT_TOKEN');
const SECRET = env('TELEGRAM_WEBHOOK_SECRET') || '';
if (!TOKEN) { console.error('Missing TELEGRAM_BOT_TOKEN in .env.local'); process.exit(1); }

const API = `https://api.telegram.org/bot${TOKEN}`;
const WEBHOOK_URL = 'https://dmvsos.com/api/telegram';

const cmd = process.argv[2] || 'set';

if (cmd === 'info') {
  const r = await fetch(`${API}/getWebhookInfo`).then(r => r.json());
  console.log(JSON.stringify(r, null, 2));
  process.exit(0);
}

if (cmd === 'delete') {
  const r = await fetch(`${API}/deleteWebhook?drop_pending_updates=true`).then(r => r.json());
  console.log(JSON.stringify(r, null, 2));
  process.exit(0);
}

// Default: set webhook
// allowed_updates must include callback_query (inline button taps) and
// my_chat_member (bot added/removed from groups). Without these, the bot
// silently ignores those events.
const params = new URLSearchParams({
  url: WEBHOOK_URL,
  drop_pending_updates: 'true',
  allowed_updates: JSON.stringify(['message', 'callback_query', 'my_chat_member']),
});
if (SECRET) params.set('secret_token', SECRET);

const r = await fetch(`${API}/setWebhook?${params}`).then(r => r.json());
console.log('Webhook URL:', WEBHOOK_URL);
console.log('Secret set:', !!SECRET);
console.log('Allowed updates: message, callback_query, my_chat_member');
console.log('Response:', JSON.stringify(r, null, 2));

// Also set bot commands so they appear in Telegram UI
const cmds = await fetch(`${API}/setMyCommands`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    commands: [
      { command: 'start',   description: 'Старт / Start' },
      { command: 'menu',    description: 'Главное меню / Main menu' },
      { command: 'pricing', description: 'Цены / Pricing' },
      { command: 'lang',    description: 'Сменить язык / Change language' },
      { command: 'help',    description: 'Помощь / Help' },
    ],
  }),
}).then(r => r.json());
console.log('Commands set:', cmds.ok);
