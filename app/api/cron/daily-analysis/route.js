// Daily analysis cron — runs from Vercel Cron at 09:00 EST.
// Pulls fresh data from Supabase + Stripe, computes deltas vs prior day,
// posts a digest to the admin via Telegram bot.
//
// Trigger: vercel.json defines schedule for /api/cron/daily-analysis

import Stripe from 'stripe';

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID;

const sbHeaders = {
  apikey: SUPA_KEY,
  Authorization: `Bearer ${SUPA_KEY}`,
};

async function sbCount(table, filter = '') {
  const url = `${SUPA_URL}/rest/v1/${table}?select=id${filter}`;
  const res = await fetch(url, {
    headers: { ...sbHeaders, Prefer: 'count=exact', Range: '0-0' },
  });
  const r = res.headers.get('content-range');
  return parseInt(r?.split('/')[1] || '0', 10);
}

async function sbSelect(path) {
  const res = await fetch(`${SUPA_URL}/rest/v1/${path}`, { headers: sbHeaders });
  return res.ok ? res.json() : [];
}

async function tgSend(chatId, text) {
  if (!TG_TOKEN) return;
  await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  }).catch(() => {});
}

function fmt(n) {
  if (n == null) return '–';
  if (typeof n === 'number') return n.toLocaleString('en-US');
  return String(n);
}

function delta(curr, prev) {
  if (!prev) return '';
  const d = curr - prev;
  const pct = ((d / prev) * 100).toFixed(0);
  if (d === 0) return ' (=)';
  return d > 0 ? ` (+${d}, +${pct}%)` : ` (${d}, ${pct}%)`;
}

export async function GET(request) {
  // Vercel Cron sends "Authorization: Bearer <CRON_SECRET>" if you set one,
  // or rely on Vercel's internal IP allowlist. We also accept manual calls
  // for testing via ?key=<TELEGRAM_WEBHOOK_SECRET>.
  const url = new URL(request.url);
  const key = url.searchParams.get('key');
  const cronAuth = request.headers.get('authorization');
  const isVercelCron = cronAuth?.startsWith('Bearer ') || request.headers.get('x-vercel-cron') === '1';
  const isManualWithKey = key === process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!isVercelCron && !isManualWithKey) {
    return new Response('Forbidden', { status: 403 });
  }

  try {
    const stripe = STRIPE_KEY ? new Stripe(STRIPE_KEY) : null;

    const now = new Date();
    const dayMs = 86400000;
    const since1d = new Date(now - dayMs).toISOString();
    const since7d = new Date(now - 7 * dayMs).toISOString();
    const since14d = new Date(now - 14 * dayMs).toISOString();

    // ─── Users ───────────────────────────────────────────────────────
    const usersResp = await fetch(`${SUPA_URL}/auth/v1/admin/users?per_page=1000`, { headers: sbHeaders });
    const users = (await usersResp.json()).users || [];
    const usersDay = users.filter(u => u.created_at > since1d).length;
    const users7d = users.filter(u => u.created_at > since7d).length;
    const users14d = users.filter(u => u.created_at > since14d).length - users7d;
    const usersActive1d = users.filter(u => u.last_sign_in_at && u.last_sign_in_at > since1d).length;
    const usersActive7d = users.filter(u => u.last_sign_in_at && u.last_sign_in_at > since7d).length;

    // ─── Test sessions ───────────────────────────────────────────────
    const sessions7d = await sbSelect(`test_sessions?created_at=gte.${since7d}&select=score,total,state,category,lang`);
    const sessions14_8d = await sbSelect(`test_sessions?created_at=gte.${since14d}&created_at=lt.${since7d}&select=id`);
    let avgScore = '–';
    if (sessions7d.length > 0) {
      const sum = sessions7d.reduce((s, x) => s + (x.score / Math.max(x.total, 1)), 0);
      avgScore = (sum / sessions7d.length * 100).toFixed(0) + '%';
    }

    // ─── Purchases (Supabase) ────────────────────────────────────────
    const purchases7d = await sbSelect(`purchases?purchased_at=gte.${since7d}&select=amount_cents,kind,pass_type,refunded_at`);
    const purchases14_8d = await sbSelect(`purchases?purchased_at=gte.${since14d}&purchased_at=lt.${since7d}&select=id`);
    const revenue7dCents = purchases7d.filter(p => !p.refunded_at).reduce((s, p) => s + p.amount_cents, 0);
    const refunded7d = purchases7d.filter(p => p.refunded_at).length;

    // ─── Stripe — last 24h charges (live mode) ───────────────────────
    let stripe24h = { count: 0, totalCents: 0, refunded: 0 };
    if (stripe) {
      try {
        const charges = await stripe.charges.list({
          created: { gte: Math.floor((now - dayMs) / 1000) },
          limit: 100,
        });
        for (const c of charges.data) {
          if (c.paid && !c.refunded) {
            stripe24h.count++;
            stripe24h.totalCents += c.amount;
          } else if (c.refunded) {
            stripe24h.refunded++;
          }
        }
      } catch (e) { /* ignore */ }
    }

    // ─── Top states from sessions ────────────────────────────────────
    const byState = sessions7d.reduce((a, s) => { a[s.state] = (a[s.state] || 0) + 1; return a; }, {});
    const topStates = Object.entries(byState).sort((a, b) => b[1] - a[1]).slice(0, 3);

    // ─── Active passes currently valid ───────────────────────────────
    const activeNow = await sbCount('active_passes', `&expires_at=gt.${now.toISOString()}`);

    // ─── Build digest ────────────────────────────────────────────────
    const dateStr = now.toISOString().slice(0, 10);
    const lines = [
      `📊 <b>DMVSOS daily report — ${dateStr}</b>`,
      ``,
      `<b>Users</b>`,
      `  Total: ${fmt(users.length)}`,
      `  Last 24h: ${fmt(usersDay)} new${usersDay > 0 ? ' 🎉' : ''}`,
      `  Last 7d:  ${fmt(users7d)} new${delta(users7d, users14d)}`,
      `  Active 7d: ${fmt(usersActive7d)} (24h: ${usersActive1d})`,
      ``,
      `<b>Tests (last 7d)</b>`,
      `  Sessions:  ${fmt(sessions7d.length)}${delta(sessions7d.length, sessions14_8d.length)}`,
      `  Avg score: ${avgScore}`,
      `  Active passes:  ${fmt(activeNow)}`,
      ``,
      `<b>Revenue</b>`,
      `  Last 24h (Stripe live): $${(stripe24h.totalCents / 100).toFixed(2)} from ${stripe24h.count} charge${stripe24h.count !== 1 ? 's' : ''}` + (stripe24h.refunded ? ` (${stripe24h.refunded} refunded)` : ''),
      `  Last 7d (purchases table): $${(revenue7dCents / 100).toFixed(2)} from ${purchases7d.length - refunded7d} purchase${purchases7d.length - refunded7d !== 1 ? 's' : ''}` + (refunded7d ? ` (${refunded7d} refunded)` : ''),
      `  Last 7d count delta: ${delta(purchases7d.length, purchases14_8d.length).trim()}`,
      ``,
    ];

    if (topStates.length) {
      lines.push('<b>Top states (7d sessions)</b>');
      for (const [s, c] of topStates) lines.push(`  ${s}: ${c}`);
      lines.push('');
    }

    // Alerts
    const alerts = [];
    if (usersDay > 0) alerts.push(`🎉 ${usersDay} new signup${usersDay > 1 ? 's' : ''} today`);
    if (stripe24h.count > 0) alerts.push(`💰 $${(stripe24h.totalCents / 100).toFixed(2)} revenue today`);
    if (users7d > users14d * 1.5 && users14d > 0) alerts.push(`📈 Signups up >50% week-over-week`);
    if (sessions7d.length > sessions14_8d.length * 1.5 && sessions14_8d.length > 0) alerts.push(`📈 Test activity up >50%`);

    if (alerts.length) {
      lines.push('<b>Alerts</b>');
      alerts.forEach(a => lines.push(`  ${a}`));
    }

    const message = lines.join('\n');

    // Send to admin
    if (ADMIN_CHAT_ID) {
      await tgSend(ADMIN_CHAT_ID, message);
    }

    return Response.json({
      ok: true,
      sent: !!ADMIN_CHAT_ID,
      summary: {
        users_total: users.length,
        users_24h: usersDay,
        sessions_7d: sessions7d.length,
        revenue_7d_cents: revenue7dCents,
        stripe_24h: stripe24h,
      },
    });
  } catch (err) {
    if (ADMIN_CHAT_ID) {
      await tgSend(ADMIN_CHAT_ID, `⚠️ Daily analysis failed: ${err.message}`);
    }
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}
