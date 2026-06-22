// Safety net for the anonymous-checkout flow.
//
// The webhook already (a) creates the auth.users row and (b) writes
// active_passes; most paying customers then land on /success and get
// auto-logged-in via the in-page magic-link redirect. NOTE: that magic
// link is delivered by the redirect, NOT by email. admin/generate_link
// returns the link but never sends mail, so there is no customer email in
// this flow. This route handles the stragglers who never completed the
// redirect:
//
//   - User closed the Stripe tab before /success could load, so the in-page
//     redirect to the magic-link never ran.
//   - Cold-start race meant /success raced ahead of the webhook and the
//     first magic-link never had a paid pass attached.
//
// Without this cron, those customers sit silently stuck until they email
// us. yrynlnqry / galyna / 461259674@qq.com all needed manual recovery
// via grant-pass-manual.js in May 2026.
//
// Strategy:
//   1. Find purchases made between 1h and 24h ago (give the webhook +
//      success-page flow a chance first; don't ping infinitely after that).
//   2. For each, pull the auth.user. If last_sign_in_at is still NULL the
//      customer never made it in.
//   3. Issue a fresh magic-link and ping admin so the operator knows.
//
// This route is also callable manually with ?key=<CRON_SECRET> when an
// operator notices a stuck customer outside of the normal cadence.

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID;

const sbHeaders = {
  apikey: SUPA_KEY,
  Authorization: `Bearer ${SUPA_KEY}`,
  'Content-Type': 'application/json',
};

async function tgSend(text) {
  if (!TG_TOKEN || !ADMIN_CHAT_ID) return;
  await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: ADMIN_CHAT_ID, text, parse_mode: 'HTML' }),
  }).catch(() => {});
}

async function sendMagicLink(email) {
  const res = await fetch(`${SUPA_URL}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: sbHeaders,
    body: JSON.stringify({ type: 'magiclink', email }),
  });
  return res.ok;
}

export async function GET(request) {
  // Same auth pattern as daily-analysis: Vercel Cron header OR ?key=secret.
  const url = new URL(request.url);
  const key = url.searchParams.get('key');
  const cronAuth = request.headers.get('authorization');
  const isVercelCron = cronAuth?.startsWith('Bearer ') || request.headers.get('x-vercel-cron') === '1';
  const validKeys = [process.env.CRON_SECRET, process.env.TELEGRAM_WEBHOOK_SECRET].filter(Boolean);
  const isManualWithKey = key && validKeys.includes(key);
  if (!isVercelCron && !isManualWithKey) {
    return new Response('Forbidden', { status: 403 });
  }

  try {
    const now = new Date();
    const oneHourAgo = new Date(now - 60 * 60 * 1000).toISOString();
    const twentyFourHoursAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();

    // Window: 1h-24h since purchase. Earlier than 1h = let the webhook +
    // /success flow finish first; later than 24h = past the point where
    // a yet-another magic-link is helpful, escalate to manual instead.
    const purchasesRes = await fetch(
      `${SUPA_URL}/rest/v1/purchases?` +
      `purchased_at=gte.${twentyFourHoursAgo}&` +
      `purchased_at=lte.${oneHourAgo}&` +
      `select=id,email,user_id,pass_type,kind,amount_cents,purchased_at&` +
      `order=purchased_at.desc`,
      { headers: sbHeaders }
    );
    if (!purchasesRes.ok) {
      throw new Error(`purchases query failed: ${await purchasesRes.text()}`);
    }
    const purchases = await purchasesRes.json();

    if (purchases.length === 0) {
      return Response.json({ ok: true, checked: 0, recovered: 0, message: 'no purchases in window' });
    }

    // Pull all auth users once so we don't N+1 the admin API. Paginate so a
    // user past page 1 (project crossed 1000 users) still gets looked up;
    // otherwise their purchase would be silently treated as "not stuck"
    // because byId.get(user_id) returns undefined and we skip the row.
    const MAX_USER_PAGES = 20;
    const byId = new Map();
    for (let page = 1; page <= MAX_USER_PAGES; page++) {
      const usersRes = await fetch(
        `${SUPA_URL}/auth/v1/admin/users?page=${page}&per_page=200`,
        { headers: sbHeaders }
      );
      const list = (await usersRes.json()).users || [];
      for (const u of list) byId.set(u.id, u);
      if (list.length < 200) break;
    }

    const stuck = [];
    for (const p of purchases) {
      if (!p.email) continue;                       // can't ping without email
      const user = p.user_id ? byId.get(p.user_id) : null;
      // If user logged in at any point — fine, recovery not needed.
      if (user?.last_sign_in_at) continue;
      stuck.push(p);
    }

    // Send magic-link + admin ping for each stuck purchase.
    let recovered = 0;
    for (const p of stuck) {
      const ok = await sendMagicLink(p.email);
      if (ok) recovered++;
      const hoursAgo = Math.round((now - new Date(p.purchased_at)) / (60 * 60 * 1000));
      await tgSend(
        `🆘 <b>Stuck-customer recovery ping</b>\n` +
        `Email: <code>${p.email}</code>\n` +
        `Paid: ${hoursAgo}h ago · ${p.pass_type} ${p.kind} · $${(p.amount_cents / 100).toFixed(2)}\n` +
        `Status: never signed in. Resent magic-link${ok ? '' : ' (FAILED)'}.\n` +
        `Manual fallback: <code>node scripts/grant-pass-manual.js --email=${p.email} --pass=${p.pass_type} --send-magic-link</code>`
      );
    }

    return Response.json({
      ok: true,
      checked: purchases.length,
      stuck: stuck.length,
      recovered,
      window: { from: twentyFourHoursAgo, to: oneHourAgo },
    });
  } catch (err) {
    await tgSend(`⚠️ <b>checkout-recovery cron crashed</b>\n<code>${err.message}</code>`);
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}
