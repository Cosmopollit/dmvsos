// Server-side answer check. Reveals correct_answer + explanation + manual_*
// only for ONE question the user is actively answering.
//
// Phase 2: accepts opaque `q_token` (AES-GCM blob) instead of raw UUID.
// The token is minted by /api/test/questions and contains the real DB
// UUID + a 4-hour expiry. We decrypt server-side to recover the UUID,
// then look up the question. Scrapers can't forge tokens (need server
// secret) and can't replay beyond expiry.
//
// Scraper bypass cost: to harvest answers they must (a) get a fresh
// token by calling /api/test/questions (rate-limited 60/10min per IP)
// and (b) send /check within 4h for each possible choice (typically 4)
// per question. At ~150k questions, that's 600k+ requests, each rate-
// limited per IP. Each request is logged.
//
// Request:
//   POST /api/test/check
//   Body: { q_token: 'q_...', choice: 0..3 }
// Response (success):
//   { ok: true, correct: boolean, correct_answer: 0..3, explanation: string,
//     manual_section: string, manual_reference: string }

import { verifyQuestionToken } from '@/lib/questionToken';

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

// In-memory rate limiter per bucket. Reuses the same window math as
// /questions but tracks check-calls separately to prevent abuse via
// /check brute-force.
//
// Bucket key matches /questions semantics: ip+deviceId for native
// clients, ip alone for web (see /api/test/questions for rationale).
const checkBuckets = new Map();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_CHECKS_PER_WINDOW = 600; // generous: 200q × 3 attempts of going back

function rateLimit(key) {
  const now = Date.now();
  const b = checkBuckets.get(key);
  if (!b || b.resetAt < now) {
    checkBuckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { ok: true, remaining: MAX_CHECKS_PER_WINDOW - 1, resetAt: now + WINDOW_MS };
  }
  if (b.count + 1 > MAX_CHECKS_PER_WINDOW) {
    return { ok: false, remaining: 0, resetAt: b.resetAt };
  }
  b.count++;
  return { ok: true, remaining: MAX_CHECKS_PER_WINDOW - b.count, resetAt: b.resetAt };
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

export async function POST(req) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) return corsJson({ ok: false, error: 'bad_body' }, { status: 400 });

    const { q_token, choice } = body;
    if (typeof q_token !== 'string') {
      return corsJson({ ok: false, error: 'bad_token' }, { status: 400 });
    }
    if (!Number.isInteger(choice) || choice < 0 || choice > 3) {
      return corsJson({ ok: false, error: 'bad_choice' }, { status: 400 });
    }

    // Verify and decrypt the opaque token. Rejects:
    //   bad_format   — not a q_ prefixed base64url string
    //   bad_length   — wrong byte count
    //   auth_failed  — tampered or signed with wrong secret
    //   expired      — older than 4 hours
    const tokenResult = verifyQuestionToken(q_token);
    if (!tokenResult.ok) {
      return corsJson({ ok: false, error: 'token_' + tokenResult.error }, { status: 400 });
    }
    const question_id = tokenResult.questionId;

    // Rate limit (per IP, or per IP+DeviceId for native clients).
    const rl = rateLimit(clientKey(req));
    if (!rl.ok) {
      return corsJson(
        { ok: false, error: 'rate_limited', resetAt: rl.resetAt },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
      );
    }

    // Fetch the question's reveal fields with service role.
    const params = new URLSearchParams({
      select: 'correct_answer,explanation,manual_section,manual_reference',
      id: 'eq.' + question_id,
      limit: '1',
    });
    const r = await fetch(`${SUPA_URL}/rest/v1/questions?${params}`, {
      headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY },
    });
    if (!r.ok) {
      return corsJson({ ok: false, error: 'db' }, { status: 500 });
    }
    const rows = await r.json();
    if (rows.length === 0) {
      return corsJson({ ok: false, error: 'not_found' }, { status: 404 });
    }
    const q = rows[0];

    return corsJson(
      {
        ok: true,
        correct: choice === q.correct_answer,
        correct_answer: q.correct_answer,
        explanation: q.explanation || null,
        manual_section: q.manual_section || null,
        manual_reference: q.manual_reference || null,
      },
      { headers: {
          'X-RateLimit-Remaining': String(rl.remaining),
          'Cache-Control': 'private, no-cache, no-store, must-revalidate',
        } }
    );
  } catch (err) {
    return corsJson({ ok: false, error: err.message }, { status: 500 });
  }
}
