// Magic-link checkout for in-app browsers (Instagram/Facebook/TikTok webviews).
//
// Google OAuth is blocked inside those webviews and password signup is heavy
// friction, so a buyer tapping Buy there gets an email field instead. This
// endpoint stamps the buy intent on the (created-if-missing) auth user, and
// the client then sends a Supabase magic-link email. The link opens in the
// REAL browser (Mail taps open Safari/Chrome), the session lands on the bare
// origin (the only whitelisted Supabase redirect - do NOT add paths here),
// and <CheckoutIntentResume> reads user_metadata.checkout_intent to finish
// the journey at /upgrade?plan=X&intent=checkout, which auto-fires Stripe.
//
// The verified-email invariant from the Galina case holds: checkout still
// requires a real session; the magic link IS the email verification.

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function H() {
  return {
    apikey: SUPA_KEY,
    Authorization: 'Bearer ' + SUPA_KEY,
    'Content-Type': 'application/json',
  };
}

const VALID_PLANS = new Set(['onetime_moto', 'onetime_auto', 'onetime_cdl']);
const VALID_LANGS = new Set(['en', 'ru', 'es', 'zh', 'ua']);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Best-effort in-memory rate limit (per serverless instance). Enough to stop
// casual abuse of the create-user path; Supabase's own OTP send limits cover
// the email side.
const hits = new Map(); // key -> { n, resetAt }
function limited(key, max, windowMs) {
  const now = Date.now();
  const rec = hits.get(key);
  if (!rec || now > rec.resetAt) {
    hits.set(key, { n: 1, resetAt: now + windowMs });
    return false;
  }
  rec.n += 1;
  return rec.n > max;
}

async function findUserByEmail(email) {
  // Page through admin/users - there's no email-filter param.
  let page = 1;
  while (true) {
    const r = await fetch(`${SUPA_URL}/auth/v1/admin/users?per_page=1000&page=${page}`, { headers: H() }).then(r => r.json());
    const found = (r.users || []).find(u => (u.email || '').toLowerCase() === email);
    if (found) return found;
    if (!r.users || r.users.length < 1000) return null;
    page++;
  }
}

export async function POST(req) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    if (limited(`ip:${ip}`, 8, 10 * 60 * 1000)) {
      return Response.json({ error: 'rate_limited' }, { status: 429 });
    }

    const body = await req.json().catch(() => ({}));
    const email = (body.email || '').trim().toLowerCase();
    const plan = body.planType;
    const lang = VALID_LANGS.has(body.lang) ? body.lang : 'en';

    if (!EMAIL_RE.test(email)) {
      return Response.json({ error: 'invalid_email' }, { status: 400 });
    }
    if (!VALID_PLANS.has(plan)) {
      return Response.json({ error: 'invalid_plan' }, { status: 400 });
    }
    if (limited(`em:${email}`, 3, 10 * 60 * 1000)) {
      return Response.json({ error: 'rate_limited' }, { status: 429 });
    }

    let user = await findUserByEmail(email);
    if (!user) {
      const res = await fetch(`${SUPA_URL}/auth/v1/admin/users`, {
        method: 'POST',
        headers: H(),
        body: JSON.stringify({
          email,
          email_confirm: true,
          user_metadata: { source: 'magic_checkout' },
        }),
      });
      if (!res.ok) throw new Error(`create user: ${res.status}`);
      user = await res.json();
    }

    // Merge, don't replace: admin PUT with user_metadata overwrites the whole
    // object, so carry the existing keys forward.
    const res = await fetch(`${SUPA_URL}/auth/v1/admin/users/${user.id}`, {
      method: 'PUT',
      headers: H(),
      body: JSON.stringify({
        user_metadata: {
          ...(user.user_metadata || {}),
          checkout_intent: { plan, lang, ts: Date.now() },
        },
      }),
    });
    if (!res.ok) throw new Error(`stamp intent: ${res.status}`);

    // Same response whether the user existed or not - no account enumeration.
    return Response.json({ ok: true });
  } catch (err) {
    console.error('checkout-intent error:', err.message);
    return Response.json({ error: 'internal' }, { status: 500 });
  }
}
