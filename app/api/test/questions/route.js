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
// Rate limit:
//   - anon:   60 req per IP per 10 min   (default)
//   - authed: 200 req per user per 10 min (signed-in users get headroom)
// Generous for legitimate users; painful for scrapers trying to pull all
// 150k. Combine with RLS that denies anon SELECT on the questions table
// for stronger defense.
//
// Request: GET /api/test/questions?state=X&category=Y&language=Z&limit=80
// Response: { ok: true, questions: [...] }   or   { ok: false, error: 'rate_limited' }

import { mintQuestionToken } from '@/lib/questionToken';

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// CORS: this endpoint is intentionally anonymous and read-only, and the
// Expo Web build runs from a different origin (localhost during dev, the
// store-listing domain in production). Wildcard origin is safe here
// because there is no cookie-bound state to steal; rate-limit is the
// only gate and lives below.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Device-ID',
  'Access-Control-Max-Age': '86400',
};

function corsJson(body, init = {}) {
  const headers = { ...(init.headers || {}), ...CORS_HEADERS };
  return Response.json(body, { ...init, headers });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

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
// states + taking a marathon test = ~5-10 requests.
//
// Tier-based limits (the rationale for the spread):
//   - anon  60/10min  blocks bulk scrape from a single IP
//   - authed 200/10min  signed-in users get headroom — they bothered to
//     register and they almost never trip the limit during normal use
//     (typical 5-15 requests per session). A scraper would need to mint
//     a fresh signed-in user per N requests, which costs OAuth round
//     trips and creates a public auth.users trail we can audit.
//
// Bucket key:
//   - authed: "user:<uuid>" — one bucket per signed-in user, immune to
//     NAT sharing across mobile carriers / school networks.
//   - X-Device-ID present (native, anon): "ip:deviceId".
//   - Otherwise (web, anon): "ip".
const buckets = new Map();
const WINDOW_MS = 10 * 60 * 1000;
const LIMIT_ANON   = 60;
const LIMIT_AUTHED = 200;

function rateLimit(key, max) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { ok: true, remaining: max - 1, resetAt: now + WINDOW_MS };
  }
  if (b.count + 1 > max) {
    return { ok: false, remaining: 0, resetAt: b.resetAt };
  }
  b.count++;
  return { ok: true, remaining: max - b.count, resetAt: b.resetAt };
}

// Resolve the caller's auth tier by validating the Bearer JWT against
// Supabase. One extra REST hop (~50ms) only on authed requests. Anonymous
// hits stay on the existing IP-only fast path.
async function resolveAuthTier(req) {
  const auth = req.headers.get('authorization') || '';
  if (!auth.startsWith('Bearer ')) return { tier: 'anon', userId: null };
  const token = auth.slice(7);
  try {
    const r = await fetch(`${SUPA_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: SUPA_KEY },
    });
    if (!r.ok) return { tier: 'anon', userId: null };
    const data = await r.json();
    if (!data?.id) return { tier: 'anon', userId: null };
    return { tier: 'authed', userId: data.id };
  } catch {
    return { tier: 'anon', userId: null };
  }
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
  // Hoisted out of the try so the catch block can log which request blew up.
  let state = null, category = null, language = null;
  try {
    const url = new URL(req.url);
    state = url.searchParams.get('state');
    category = url.searchParams.get('category');
    language = url.searchParams.get('language');
    const subcategory = url.searchParams.get('subcategory') || null;
    let limit = parseInt(url.searchParams.get('limit') || String(DEFAULT_LIMIT), 10);

    if (!VALID_STATES.has(state)) {
      console.error('[test/questions] bad_state', { state, category, language });
      return corsJson({ ok: false, error: 'bad_state' }, { status: 400 });
    }
    if (!VALID_CATEGORIES.has(category)) {
      console.error('[test/questions] bad_category', { state, category, language });
      return corsJson({ ok: false, error: 'bad_category' }, { status: 400 });
    }
    if (!VALID_LANGUAGES.has(language)) {
      console.error('[test/questions] bad_language', { state, category, language });
      return corsJson({ ok: false, error: 'bad_language' }, { status: 400 });
    }
    if (subcategory && !VALID_SUBCATEGORIES.has(subcategory)) {
      console.error('[test/questions] bad_subcategory', { state, category, language, subcategory });
      return corsJson({ ok: false, error: 'bad_subcategory' }, { status: 400 });
    }
    if (!Number.isFinite(limit) || limit < 1) limit = DEFAULT_LIMIT;
    if (limit > MAX_LIMIT) limit = MAX_LIMIT;

    // Tier-aware rate limit. Authed users get their own user-keyed bucket
    // (immune to NAT sharing) and a higher cap; anon stays on the IP / IP+
    // DeviceID bucket and the conservative cap that's been blocking bulk
    // scrape. Authed verification adds ~50ms via /auth/v1/user but only on
    // signed-in requests, which are the minority.
    const { tier, userId } = await resolveAuthTier(req);
    const max = tier === 'authed' ? LIMIT_AUTHED : LIMIT_ANON;
    const bucketKey = tier === 'authed' ? `user:${userId}` : clientKey(req);
    const rl = rateLimit(bucketKey, max);
    if (!rl.ok) {
      // Deliberate protective 429, not an app error. Warn keeps it visible
      // without flooding the error stream during a scrape burst.
      console.warn('[test/questions] rate_limited', { tier, key: bucketKey, state, category, language });
      return corsJson(
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
    });
    if (subcategory) params.set('subcategory', 'eq.' + subcategory);

    // Optional cluster_codes filter — used by client when switching language
    // mid-test to fetch in-place translations for the currently active question
    // set. Sanitized: only alphanumeric + underscore allowed in codes; max 100.
    const clusterCsv = url.searchParams.get('cluster_codes');
    let isClusterRefetch = false;
    if (clusterCsv) {
      const codes = clusterCsv.split(',').slice(0, 100).filter(c => /^[a-z0-9_]{1,40}$/i.test(c));
      if (codes.length > 0) {
        const quoted = codes.map(c => `"${c}"`).join(',');
        params.set('cluster_code', `in.(${quoted})`);
        params.set('limit', String(Math.min(codes.length, MAX_LIMIT)));
        isClusterRefetch = true;
      }
    }
    if (!isClusterRefetch) {
      // Pull a larger pool than `limit` so the test can be shuffled (a fresh
      // mix each attempt instead of always the same first N) and so we can cap
      // how many questions share the EXACT same wording. Many sign questions
      // legitimately share a generic stem ("What does this sign mean?") for
      // different images — without a cap a single test could show that wording
      // 6+ times and read as duplicates (tester feedback, Diana 2026-06-08).
      params.set('limit', String(Math.min(Math.max(limit * 8, 200), 1000)));
    }

    const r = await fetch(`${SUPA_URL}/rest/v1/questions?${params}`, {
      headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY },
    });
    if (!r.ok) {
      const text = await r.text();
      console.error('[test/questions] db error', { status: r.status, state, category, language, detail: text.slice(0, 200) });
      return corsJson({ ok: false, error: 'db', detail: text.slice(0, 200) }, { status: 500 });
    }
    let rawQuestions = await r.json();

    // Main fetch only: shuffle for variety + cap identical question_text.
    if (!isClusterRefetch && Array.isArray(rawQuestions) && rawQuestions.length > limit) {
      for (let i = rawQuestions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [rawQuestions[i], rawQuestions[j]] = [rawQuestions[j], rawQuestions[i]];
      }
      const MAX_PER_TEXT = 2;
      const textCount = new Map();
      const picked = [];
      const overflow = [];
      for (const q of rawQuestions) {
        if (picked.length >= limit) break;
        const n = textCount.get(q.question_text) || 0;
        if (n < MAX_PER_TEXT) { picked.push(q); textCount.set(q.question_text, n + 1); }
        else overflow.push(q);
      }
      // Backfill if the cap left us short of `limit`.
      for (const q of overflow) {
        if (picked.length >= limit) break;
        picked.push(q);
      }
      rawQuestions = picked;
    }

    // Strip real UUIDs and mint opaque tokens. The token decrypts only
    // server-side via lib/questionToken; the client never sees real IDs.
    // This makes the question DB non-enumerable: scrapers can't iterate
    // ids, can't replay tokens beyond 4 hours, can't forge tokens
    // without QUESTION_TOKEN_SECRET.
    const questions = rawQuestions.map(({ id, ...rest }) => ({
      ...rest,
      q_token: mintQuestionToken(id),
    }));

    return corsJson(
      { ok: true, questions },
      { headers: {
          'X-RateLimit-Remaining': String(rl.remaining),
          'X-RateLimit-Reset': String(rl.resetAt),
          'Cache-Control': 'private, no-cache, no-store, must-revalidate',
        } }
    );
  } catch (err) {
    console.error('[test/questions] unhandled error', { state, category, language, message: err.message });
    return corsJson({ ok: false, error: err.message }, { status: 500 });
  }
}
