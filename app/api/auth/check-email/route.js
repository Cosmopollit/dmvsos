import { createClient } from '@supabase/supabase-js';

// Lookup whether an email is already registered, used by /login to
// steer sign-up away from creating duplicate auth.users rows and to
// explain "Invalid credentials" failures for OAuth-only accounts.
//
// SECURITY:
//   - Response intentionally exposes only { exists, hasPassword }. We
//     used to return the provider list (google/facebook/etc) for a
//     nicer UI, but that lets anyone enumerate which providers any
//     email is on, which is useful information for phishers planning
//     a "you've been signed out of Google" attack. The UI just tells
//     the user to use one of the OAuth buttons above instead.
//   - Best-effort per-IP rate limit (20 req/min) caps mass scraping.
//     In-memory Map only — Vercel serverless instances share nothing,
//     so this is a speed bump, not a wall. Pair with Supabase's own
//     rate limits (and ideally an Upstash Redis store later).

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const MAX_PAGES = 20;          // hard cap so a runaway loop can't enumerate the whole user table
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 20;     // per IP per window

// Map<ip, number[]> — timestamps of recent requests
const rateLog = new Map();

function getClientIp(req) {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  const real = req.headers.get('x-real-ip');
  return real || 'unknown';
}

function checkRate(ip) {
  const now = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  const arr = (rateLog.get(ip) || []).filter(t => t > cutoff);
  if (arr.length >= RATE_LIMIT_MAX) return false;
  arr.push(now);
  rateLog.set(ip, arr);
  // Periodic cleanup so the map doesn't grow forever in long-lived workers
  if (rateLog.size > 5000) {
    for (const [k, v] of rateLog) {
      const fresh = v.filter(t => t > cutoff);
      if (fresh.length === 0) rateLog.delete(k); else rateLog.set(k, fresh);
    }
  }
  return true;
}

export async function POST(req) {
  try {
    const ip = getClientIp(req);
    if (!checkRate(ip)) {
      return Response.json({ error: 'rate_limited' }, { status: 429 });
    }

    let body;
    try { body = await req.json(); } catch { return Response.json({ error: 'Bad JSON' }, { status: 400 }); }
    const email = String(body?.email || '').trim().toLowerCase();
    if (!email || !email.includes('@')) {
      return Response.json({ error: 'Email required' }, { status: 400 });
    }

    for (let page = 1; page <= MAX_PAGES; page++) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) return Response.json({ error: error.message }, { status: 500 });
      const users = data?.users || [];
      const hit = users.find(u => (u.email || '').toLowerCase() === email);
      if (hit) {
        const providers = (hit.identities || []).map(i => i.provider);
        // Tell the UI only whether this account has a password identity
        // or not. UI handles the "use OAuth above" message generically.
        const hasPassword = providers.includes('email')
          || (hit.app_metadata?.provider === 'email');
        return Response.json({ exists: true, hasPassword });
      }
      if (users.length < 200) break;
    }
    return Response.json({ exists: false, hasPassword: false });
  } catch (err) {
    return Response.json({ error: err?.message || 'Internal error' }, { status: 500 });
  }
}
