// Internal collector for the proxy.js bot-detection log.
//
// Edge middleware (proxy.js) calls this with `fetch(..., {keepalive:true})`
// for any request that scores ≥ 5. We insert into `bot_events` via the
// service role and return 204 immediately. No-op if the table doesn't
// exist yet (migration 016 hasn't been applied).
//
// Auth: a shared secret (BOT_EVENT_SECRET) verified via the
// `x-bot-event-secret` header so random callers can't pollute the table.

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SECRET   = process.env.BOT_EVENT_SECRET || process.env.TELEGRAM_WEBHOOK_SECRET || '';

export const runtime = 'nodejs';

export async function POST(req) {
  if (SECRET) {
    if (req.headers.get('x-bot-event-secret') !== SECRET) {
      return new Response('Forbidden', { status: 403 });
    }
  }
  let body;
  try {
    body = await req.json();
  } catch {
    return new Response('Bad request', { status: 400 });
  }

  const row = {
    ip:      typeof body.ip      === 'string' ? body.ip.slice(0, 64)       : null,
    country: typeof body.country === 'string' ? body.country.slice(0, 4)   : null,
    path:    typeof body.path    === 'string' ? body.path.slice(0, 256)    : null,
    method:  typeof body.method  === 'string' ? body.method.slice(0, 8)    : null,
    ua:      typeof body.ua      === 'string' ? body.ua.slice(0, 512)      : null,
    score:   Number.isInteger(body.score) ? body.score : 0,
    reasons: Array.isArray(body.reasons) ? body.reasons.slice(0, 16).map(String) : [],
    bucket_key: 'ip',
  };

  // Fire-and-forget; never let collector failures impact the request path.
  try {
    await fetch(`${SUPA_URL}/rest/v1/bot_events`, {
      method: 'POST',
      headers: {
        apikey: SUPA_KEY,
        Authorization: `Bearer ${SUPA_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(row),
    });
  } catch (_) { /* swallow */ }

  return new Response(null, { status: 204 });
}

export async function GET() {
  return new Response('bot-event collector', { status: 200 });
}
