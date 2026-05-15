// Inline question report from /test page.
// Body: { question_id, language, reason, comment?, user_email? }
// Returns: { ok: true } or { ok: false, error }
//
// Pings Telegram admin on each new report so we can fix fast.

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID;

const VALID_REASONS = ['wrong_answer', 'bad_translation', 'unclear', 'broken_image', 'other'];

const sbHeaders = {
  apikey: SUPA_KEY,
  Authorization: `Bearer ${SUPA_KEY}`,
  'Content-Type': 'application/json',
};

async function notifyAdmin(text) {
  if (!TG_TOKEN || !ADMIN_CHAT_ID) return;
  await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: ADMIN_CHAT_ID, text, parse_mode: 'HTML', disable_web_page_preview: true }),
  }).catch(() => {});
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { question_id, language, reason, comment, user_email } = body || {};

    if (!question_id || typeof question_id !== 'string') {
      return Response.json({ ok: false, error: 'question_id required' }, { status: 400 });
    }
    if (!VALID_REASONS.includes(reason)) {
      return Response.json({ ok: false, error: 'invalid reason' }, { status: 400 });
    }

    // Try to extract user_id from Authorization Bearer (if logged in)
    let user_id = null;
    const auth = request.headers.get('authorization');
    if (auth?.startsWith('Bearer ')) {
      try {
        const token = auth.slice(7);
        const r = await fetch(`${SUPA_URL}/auth/v1/user`, {
          headers: { apikey: SUPA_KEY, Authorization: `Bearer ${token}` },
        });
        if (r.ok) {
          const u = await r.json();
          user_id = u?.id || null;
        }
      } catch { /* anon ok */ }
    }

    // Look up question for context in the admin alert (state, category, text snippet)
    const qRes = await fetch(`${SUPA_URL}/rest/v1/questions?id=eq.${question_id}&select=state,category,subcategory,question_text,correct_answer,explanation`, { headers: sbHeaders });
    const [q] = (qRes.ok ? await qRes.json() : []);

    // Insert report
    const insertRes = await fetch(`${SUPA_URL}/rest/v1/question_reports`, {
      method: 'POST',
      headers: sbHeaders,
      body: JSON.stringify({
        question_id,
        user_id,
        user_email: user_email || null,
        language: language || 'en',
        reason,
        comment: comment ? String(comment).slice(0, 1000) : null,
      }),
    });
    if (!insertRes.ok) {
      const text = await insertRes.text();
      return Response.json({ ok: false, error: 'db', detail: text }, { status: 500 });
    }

    // Fire admin alert (non-blocking)
    const reasonEmoji = {
      wrong_answer: '❌',
      bad_translation: '🌍',
      unclear: '❓',
      broken_image: '🖼️',
      other: '🔧',
    }[reason] || '⚠️';

    const alert = [
      `🐛 <b>Question reported</b>`,
      ``,
      `${reasonEmoji} Reason: <b>${reason}</b>`,
      `🌐 Lang: <b>${language || 'en'}</b>`,
      q ? `📍 ${q.state}/${q.category}${q.subcategory ? '/' + q.subcategory : ''}` : `📍 (question not found)`,
      `🆔 <code>${question_id}</code>`,
      user_email ? `📧 ${user_email}` : '',
      ``,
      q ? `<i>${(q.question_text || '').slice(0, 250)}</i>` : '',
      comment ? `\n💬 User comment: <i>${String(comment).slice(0, 300)}</i>` : '',
    ].filter(Boolean).join('\n');

    await notifyAdmin(alert);

    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}
