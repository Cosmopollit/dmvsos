// Simple in-memory rate limiter (best-effort in serverless)
const attempts = new Map();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 min

function isRateLimited(ip) {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || now > entry.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > MAX_ATTEMPTS;
}

export async function POST(req) {
  const ip = req.headers.get('x-forwarded-for') || 'unknown';
  if (isRateLimited(ip)) {
    return Response.json({ error: 'Too many attempts. Try again later.' }, { status: 429 });
  }
  try {
    const { password } = await req.json();
    if (password === process.env.ADMIN_PASSWORD) {
      return Response.json({ ok: true });
    }
    // Slow down brute force
    await new Promise(r => setTimeout(r, 1000));
    return Response.json({ ok: false }, { status: 401 });
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }
}
