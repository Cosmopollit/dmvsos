// Server-side question fetcher with rate limiting.
//
// Replaces the previous client-side `supabase.from('questions').select(...)`
// pattern so anon API key can no longer be used to dump the question bank.
//
// Rate limit: 200 questions per IP per 10 minutes (default).
// Generous for legitimate users (max real test = 80 questions); painful
// for scrapers trying to pull all 150k. Combine with RLS that denies
// anon SELECT on the questions table for stronger defense.
//
// Request: GET /api/test/questions?state=X&category=Y&language=Z&limit=80
// Response: { ok: true, questions: [...] }   or   { ok: false, error: 'rate_limited' }

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const VALID_STATES = new Set([
  'alabama','alaska','arizona','arkansas','california','colorado','connecticut',
  'delaware','florida','georgia','hawaii','idaho','illinois','indiana','iowa',
  'kansas','kentucky','louisiana','maine','maryland','massachusetts','michigan',
  'minnesota','mississippi','missouri','montana','nebraska','nevada','new-hampshire',
  'new-jersey','new-mexico','new-york','north-carolina','north-dakota','ohio',
  'oklahoma','oregon','pennsylvania','rhode-island','south-carolina','south-dakota',
  'tennessee','texas','utah','vermont','virginia','washington','west-virginia',
  'wisconsin','wyoming',
]);
const VALID_CATEGORIES = new Set(['car', 'cdl', 'motorcycle']);
const VALID_LANGUAGES = new Set(['en', 'ru', 'ua', 'es', 'zh']);
const VALID_SUBCATEGORIES = new Set(['general_knowledge', 'air_brakes', 'combination']);
const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 80;

// In-memory rate limiter. Per-instance state on Vercel; resets on cold start
// but catches hot scrapers from a single IP within a session.
const buckets = new Map(); // key=ip -> { count, resetAt }
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 200; // ~10 full real tests worth

function rateLimit(ip, n) {
  const now = Date.now();
  const b = buckets.get(ip);
  if (!b || b.resetAt < now) {
    buckets.set(ip, { count: n, resetAt: now + WINDOW_MS });
    return { ok: true, remaining: MAX_PER_WINDOW - n, resetAt: now + WINDOW_MS };
  }
  if (b.count + n > MAX_PER_WINDOW) {
    return { ok: false, remaining: 0, resetAt: b.resetAt };
  }
  b.count += n;
  return { ok: true, remaining: MAX_PER_WINDOW - b.count, resetAt: b.resetAt };
}

function clientIp(req) {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

export async function GET(req) {
  try {
    const url = new URL(req.url);
    const state = url.searchParams.get('state');
    const category = url.searchParams.get('category');
    const language = url.searchParams.get('language');
    const subcategory = url.searchParams.get('subcategory') || null;
    let limit = parseInt(url.searchParams.get('limit') || String(DEFAULT_LIMIT), 10);

    if (!VALID_STATES.has(state)) return Response.json({ ok: false, error: 'bad_state' }, { status: 400 });
    if (!VALID_CATEGORIES.has(category)) return Response.json({ ok: false, error: 'bad_category' }, { status: 400 });
    if (!VALID_LANGUAGES.has(language)) return Response.json({ ok: false, error: 'bad_language' }, { status: 400 });
    if (subcategory && !VALID_SUBCATEGORIES.has(subcategory)) {
      return Response.json({ ok: false, error: 'bad_subcategory' }, { status: 400 });
    }
    if (!Number.isFinite(limit) || limit < 1) limit = DEFAULT_LIMIT;
    if (limit > MAX_LIMIT) limit = MAX_LIMIT;

    // Rate limit per IP
    const ip = clientIp(req);
    const rl = rateLimit(ip, limit);
    if (!rl.ok) {
      return Response.json(
        { ok: false, error: 'rate_limited', resetAt: rl.resetAt },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
      );
    }

    // Fetch from Supabase with service role (bypasses RLS).
    // NOTE: deliberately do NOT select correct_answer / explanation / manual_section / manual_reference.
    // Those are revealed per-question only via /api/test/check after the user picks an answer.
    // Protects against scrapers harvesting answer+explanation in one bulk fetch.
    const params = new URLSearchParams({
      select: 'id,question_text,option_a,option_b,option_c,option_d,image_url',
      state: 'eq.' + state,
      category: 'eq.' + category,
      language: 'eq.' + language,
      limit: String(limit),
    });
    if (subcategory) params.set('subcategory', 'eq.' + subcategory);

    const r = await fetch(`${SUPA_URL}/rest/v1/questions?${params}`, {
      headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY },
    });
    if (!r.ok) {
      const text = await r.text();
      return Response.json({ ok: false, error: 'db', detail: text.slice(0, 200) }, { status: 500 });
    }
    const questions = await r.json();

    return Response.json(
      { ok: true, questions },
      { headers: {
          'X-RateLimit-Remaining': String(rl.remaining),
          'X-RateLimit-Reset': String(rl.resetAt),
          'Cache-Control': 'private, no-cache, no-store, must-revalidate',
        } }
    );
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}
