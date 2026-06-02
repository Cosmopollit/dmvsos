// Server-side question fetcher with rate limiting + opaque tokens.
//
// Phase 2 of the anti-scraping stack. Real UUIDs never leave the
// server — each question is tagged with a one-shot `q_token` that's
// an AES-GCM encrypted blob containing the real ID + 4-hour expiry.
// See lib/questionToken.js for token format.
//
// Replaces the previous client-side `supabase.from('questions').select(...)`
// pattern so anon API key can no longer be used to dump the question bank.
//
// Rate limit: 60 requests per IP per 10 minutes (default).
// Generous for legitimate users; painful for scrapers trying to pull all
// 150k. Combine with RLS that denies anon SELECT on the questions table
// for stronger defense.
//
// Request: GET /api/test/questions?state=X&category=Y&language=Z&limit=80
// Response: { ok: true, questions: [...] }   or   { ok: false, error: 'rate_limited' }

import { mintQuestionToken } from '@/lib/questionToken';

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
// DB stores the third one as 'combination_vehicles' (78 rows per language for
// WA CDL). The shorter form 'combination' here used to make this route reject
// the URL the frontend actually sends, falling back to the "questions in this
// language coming soon" empty state even when 78 translated questions existed.
const VALID_SUBCATEGORIES = new Set(['general_knowledge', 'air_brakes', 'combination_vehicles']);
// Cap covers the biggest legitimate need: CA CDL has 352 EN questions and
// Pro users on "marathon" mode expect to actually see all of them. Was 200,
// which silently truncated the marathon for every CDL state. Anti-scraping
// still leans on the per-IP rate limit (60 req/10min) below.
const MAX_LIMIT = 500;
const DEFAULT_LIMIT = 80;

// In-memory rate limiter. Per-instance state on Vercel; resets on cold start
// but catches hot scrapers from a single IP within a session.
//
// Counts REQUESTS not questions. One /questions call = 1 bucket increment
// regardless of how many questions it returns. A real user browsing a few
// states + taking a marathon test = ~5-10 requests. A scraper trying to
// hit every state x category x language combo = 750+ requests, blocked.
//
// Bucket key:
//   - X-Device-ID present (native app): "ip:deviceId" so multiple mobile
//     users behind one carrier NAT do not share a single bucket.
//   - Otherwise (web): "ip" (unchanged web behavior).
const buckets = new Map();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 60; // generous for users, blocks bulk scrape

function rateLimit(key) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { ok: true, remaining: MAX_REQUESTS_PER_WINDOW - 1, resetAt: now + WINDOW_MS };
  }
  if (b.count + 1 > MAX_REQUESTS_PER_WINDOW) {
    return { ok: false, remaining: 0, resetAt: b.resetAt };
  }
  b.count++;
  return { ok: true, remaining: MAX_REQUESTS_PER_WINDOW - b.count, resetAt: b.resetAt };
}

function clientKey(req) {
  const ip = (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
  const deviceId = req.headers.get('x-device-id');
  if (deviceId && /^[A-Za-z0-9_-]{8,128}$/.test(deviceId)) {
    return `${ip}:${deviceId}`;
  }
  return ip;
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

    // Rate limit per IP (or per IP+DeviceId for native clients).
    const rl = rateLimit(clientKey(req));
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
      select: 'id,cluster_code,question_text,option_a,option_b,option_c,option_d,image_url',
      state: 'eq.' + state,
      category: 'eq.' + category,
      language: 'eq.' + language,
      limit: String(limit),
    });
    if (subcategory) params.set('subcategory', 'eq.' + subcategory);

    // Optional cluster_codes filter — used by client when switching language
    // mid-test to fetch in-place translations for the currently active question
    // set. Sanitized: only alphanumeric + underscore allowed in codes; max 100.
    const clusterCsv = url.searchParams.get('cluster_codes');
    if (clusterCsv) {
      const codes = clusterCsv.split(',').slice(0, 100).filter(c => /^[a-z0-9_]{1,40}$/i.test(c));
      if (codes.length > 0) {
        const quoted = codes.map(c => `"${c}"`).join(',');
        params.set('cluster_code', `in.(${quoted})`);
      }
    }

    const r = await fetch(`${SUPA_URL}/rest/v1/questions?${params}`, {
      headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY },
    });
    if (!r.ok) {
      const text = await r.text();
      return Response.json({ ok: false, error: 'db', detail: text.slice(0, 200) }, { status: 500 });
    }
    const rawQuestions = await r.json();

    // Strip real UUIDs and mint opaque tokens. The token decrypts only
    // server-side via lib/questionToken; the client never sees real IDs.
    // This makes the question DB non-enumerable: scrapers can't iterate
    // ids, can't replay tokens beyond 4 hours, can't forge tokens
    // without QUESTION_TOKEN_SECRET.
    const questions = rawQuestions.map(({ id, ...rest }) => ({
      ...rest,
      q_token: mintQuestionToken(id),
    }));

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
