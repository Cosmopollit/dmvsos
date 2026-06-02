// RevenueCat webhook handler. Native IAP from the mobile app rides
// through RC, which fires this endpoint on every billing event. The
// handler mirrors the Stripe webhook (app/api/webhook/route.js) so a
// successful IAP results in identical purchases + active_passes rows,
// and AuthContext does not need to know which rail was used.
//
// Auth: RC dashboard lets us set a static "Authorization" header value
// (see Project settings → Integrations → Webhooks). We compare with
// timing-safe equality against REVENUECAT_WEBHOOK_AUTH from env. This
// is RC's own model — they don't sign the body, the secret is the
// guard. Keep the secret long and unique.
//
// Event types handled:
//   INITIAL_PURCHASE       — first purchase of a product (kind=new)
//   NON_RENEWING_PURCHASE  — consumable IAP purchase (our 30d passes)
//   RENEWAL                — auto-renewing sub renewed (we don't sell
//                            those, but kept defensive in case Apple
//                            sandbox sends one for a tester)
//   CANCELLATION           — user cancels (no money back yet)
//   EXPIRATION             — sub/grace ended (no money back yet)
//   REFUND                 — money came back (full revoke / -30d)
//   BILLING_ISSUE          — payment failed, log only
//   TRANSFER               — Apple ID change, log + admin ping
//
// Idempotency: purchases.revenuecat_transaction_id UNIQUE handles
// re-deliveries. Migration 016 added the column + the one-rail CHECK.

import { createHash, timingSafeEqual } from 'crypto';

import { lookupRcProduct } from '@/lib/iapProducts';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RC_AUTH = process.env.REVENUECAT_WEBHOOK_AUTH || '';

const sbHeaders = {
  apikey: SUPABASE_SERVICE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

const DAYS_30_MS = 30 * 24 * 60 * 60 * 1000;

function emailTag(email) {
  if (!email) return 'none';
  return createHash('sha256').update(email.toLowerCase()).digest('hex').slice(0, 8);
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

async function sbSelect(table, query) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, { headers: sbHeaders });
  if (!res.ok) throw new Error(`Supabase SELECT ${table} failed: ${await res.text()}`);
  return res.json();
}

async function sbInsert(table, row, { ignoreDuplicate = false } = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...sbHeaders, Prefer: 'return=representation' },
    body: JSON.stringify(row),
  });
  if (!res.ok) {
    const text = await res.text();
    if (ignoreDuplicate && /duplicate key|unique/i.test(text)) return null;
    throw new Error(`Supabase INSERT ${table} failed: ${text}`);
  }
  return res.json();
}

async function sbUpsert(table, row, onConflict) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=${onConflict}`, {
    method: 'POST',
    headers: { ...sbHeaders, Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`Supabase UPSERT ${table} failed: ${await res.text()}`);
  return res.json();
}

async function sbUpdate(table, filter, updates) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
    method: 'PATCH',
    headers: { ...sbHeaders, Prefer: 'return=representation' },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error(`Supabase PATCH ${table} failed: ${await res.text()}`);
  return res.json();
}

async function sbDelete(table, filter) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
    method: 'DELETE',
    headers: sbHeaders,
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Supabase DELETE ${table} failed: ${await res.text()}`);
  }
}

async function profilesUpdateByEmail(rawEmail, updates) {
  if (!rawEmail) return [];
  const email = rawEmail.toLowerCase();
  const updated = await sbUpdate('profiles', `email=ilike.${encodeURIComponent(email)}`, updates);
  if (updated.length === 0) {
    await sbInsert('profiles', { email, ...updates });
  }
  return updated;
}

async function authUserEmail(userId) {
  if (!userId) return null;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
    headers: sbHeaders,
  });
  if (!res.ok) return null;
  const u = await res.json();
  return u?.email || null;
}

async function notifyAdmin(text) {
  const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (!TG_TOKEN || !ADMIN_CHAT_ID) return;
  await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: ADMIN_CHAT_ID, text, parse_mode: 'HTML' }),
  }).catch(() => {});
}

// Resolve user_id and email for the event. RC's app_user_id is set by
// the mobile SDK to the Supabase auth.users.id when the user is signed
// in, otherwise to RC's anonymous "$RCAnonymousID:..." form. We only
// fulfil rows that resolve to a real Supabase user.
async function resolveUser(ev) {
  const appUserId = ev.app_user_id || ev.original_app_user_id;
  if (!appUserId || appUserId.startsWith('$RCAnonymousID')) {
    return { user_id: null, email: null };
  }
  const looksLikeUuid = /^[0-9a-f-]{32,40}$/i.test(appUserId);
  if (!looksLikeUuid) return { user_id: null, email: null };
  const email = await authUserEmail(appUserId);
  return { user_id: appUserId, email };
}

async function handleRcPurchase(ev) {
  const product = lookupRcProduct(ev.product_id);
  if (!product) {
    console.warn(`RC unknown product: ${ev.product_id} | tx=${ev.transaction_id}`);
    await notifyAdmin(`🚨 <b>RevenueCat unknown product</b>: <code>${ev.product_id}</code>\nTx: <code>${ev.transaction_id}</code>\nAdd it to lib/iapProducts.js and redeploy.`);
    return;
  }
  const { pass_type, kind } = product;

  const { user_id, email } = await resolveUser(ev);
  if (!user_id) {
    console.warn(`RC purchase with anonymous app_user_id | tx=${ev.transaction_id} | product=${ev.product_id}`);
    await notifyAdmin(`🚨 <b>RevenueCat purchase from anonymous app_user_id.</b>\nTx: <code>${ev.transaction_id}</code> · Product: <code>${ev.product_id}</code>\nThe mobile SDK should call Purchases.logIn(supabase_user_id) before purchases. Likely a flow bug.`);
    return;
  }

  // Idempotency: have we already processed this transaction?
  const existing = await sbSelect(
    'purchases',
    `revenuecat_transaction_id=eq.${encodeURIComponent(ev.transaction_id)}&select=id`,
  );
  if (existing.length > 0) {
    console.log(`RC purchase already processed | tx=${ev.transaction_id}`);
    return;
  }

  const current = await sbSelect(
    'active_passes',
    `user_id=eq.${user_id}&pass_type=eq.${pass_type}&select=expires_at`,
  );
  const now = new Date();
  const currentExpiresAt = current[0]?.expires_at || null;
  const isActive = currentExpiresAt && new Date(currentExpiresAt) > now;

  if (kind === 'new' && isActive) {
    // Duplicate "new" purchase while pass is still active. Apple/Google
    // don't offer auto-refund the way Stripe does — log and ping admin
    // to refund manually if needed. The user did pay, so we still
    // extend the pass to honour their money (not lose it).
    console.warn(`RC duplicate 'new' purchase, treating as extension | user=${user_id} | type=${pass_type} | tx=${ev.transaction_id}`);
    await notifyAdmin(`⚠️ <b>RevenueCat duplicate 'new' purchase</b>: user already had active ${pass_type}. Treating as extension. Refund manually if needed.\nUser: ${email || user_id}\nTx: <code>${ev.transaction_id}</code>`);
  }

  // Compute new expiry. 30-day pass; extensions stack.
  const baseDate = isActive ? new Date(currentExpiresAt) : now;
  const newExpiresAt = new Date(baseDate.getTime() + DAYS_30_MS);

  // Some events do not include a price (free promotional codes, family
  // sharing fallbacks). Treat as 0 for accounting; revenue reports come
  // from RC anyway.
  const amountCents = Math.round(
    (typeof ev.price === 'number' ? ev.price : 0) * 100,
  );

  const inserted = await sbInsert(
    'purchases',
    {
      user_id,
      email: email || null,
      pass_type,
      kind,
      amount_cents: amountCents,
      currency: (ev.currency || 'USD').toLowerCase(),
      stripe_payment_intent: null,
      stripe_checkout_session: null,
      revenuecat_transaction_id: ev.transaction_id,
      source: 'revenuecat',
      prev_expires_at: currentExpiresAt,
      new_expires_at: newExpiresAt.toISOString(),
    },
    { ignoreDuplicate: true },
  );
  if (!inserted) {
    console.log(`RC concurrent webhook beat us | tx=${ev.transaction_id}`);
    return;
  }

  await sbUpsert(
    'active_passes',
    {
      user_id,
      pass_type,
      expires_at: newExpiresAt.toISOString(),
    },
    'user_id,pass_type',
  );

  // Keep legacy profiles in sync. AuthContext reads is_pro via this
  // table; the rest of the app feature-detects via active_passes.
  if (email) {
    const allActive = await sbSelect(
      'active_passes',
      `user_id=eq.${user_id}&select=expires_at&order=expires_at.desc`,
    );
    const maxExpires = allActive[0]?.expires_at || null;
    await profilesUpdateByEmail(email, {
      is_pro: true,
      plan_type: pass_type,
      plan_expires_at: maxExpires,
    }).catch((e) => console.warn(`RC profile sync failed: ${e.message}`));
  }

  console.log(`RC purchase applied | user=${emailTag(email)} | type=${pass_type} | kind=${kind} | tx=${ev.transaction_id} | expires=${newExpiresAt.toISOString()}`);
}

async function handleRcRefund(ev) {
  const rows = await sbSelect(
    'purchases',
    `revenuecat_transaction_id=eq.${encodeURIComponent(ev.transaction_id)}&select=*`,
  );
  const purchase = rows[0];
  if (!purchase) {
    console.log(`RC refund for unknown tx | tx=${ev.transaction_id}`);
    return;
  }
  if (purchase.refunded_at) {
    console.log(`RC refund already processed | tx=${ev.transaction_id}`);
    return;
  }

  await sbUpdate('purchases', `id=eq.${purchase.id}`, {
    refunded_at: new Date().toISOString(),
    refund_reason: ev.cancel_reason || 'rc_refund',
  });

  if (purchase.kind === 'new') {
    await sbDelete(
      'active_passes',
      `user_id=eq.${purchase.user_id}&pass_type=eq.${purchase.pass_type}`,
    );
    console.log(`RC refund (new=delete) | user=${purchase.user_id} | type=${purchase.pass_type}`);
  } else {
    const active = await sbSelect(
      'active_passes',
      `user_id=eq.${purchase.user_id}&pass_type=eq.${purchase.pass_type}&select=expires_at`,
    );
    if (active[0]) {
      const newExpires = new Date(new Date(active[0].expires_at).getTime() - DAYS_30_MS);
      if (newExpires > new Date()) {
        await sbUpdate(
          'active_passes',
          `user_id=eq.${purchase.user_id}&pass_type=eq.${purchase.pass_type}`,
          { expires_at: newExpires.toISOString() },
        );
      } else {
        await sbDelete(
          'active_passes',
          `user_id=eq.${purchase.user_id}&pass_type=eq.${purchase.pass_type}`,
        );
      }
    }
    console.log(`RC refund (ext -30d) | user=${purchase.user_id} | type=${purchase.pass_type}`);
  }

  if (purchase.email) {
    const remaining = await sbSelect(
      'active_passes',
      `user_id=eq.${purchase.user_id}&select=pass_type,expires_at&order=expires_at.desc`,
    );
    const top = remaining[0];
    await profilesUpdateByEmail(
      purchase.email,
      top
        ? { is_pro: true, plan_type: top.pass_type, plan_expires_at: top.expires_at }
        : { is_pro: false, plan_type: null, plan_expires_at: null },
    ).catch((e) => console.warn(`RC profile sync (refund) failed: ${e.message}`));
  }
}

export async function POST(request) {
  // Auth: shared secret in the Authorization header. RC sends whatever
  // value we set in the dashboard. Use timing-safe compare to avoid
  // leaking the secret through response time.
  if (!RC_AUTH) {
    console.error('REVENUECAT_WEBHOOK_AUTH env var not set; refusing webhook');
    return new Response('Webhook not configured', { status: 500 });
  }
  const auth = request.headers.get('authorization') || '';
  if (!safeEqual(auth, RC_AUTH)) {
    console.warn('RC webhook auth mismatch');
    return new Response('Unauthorized', { status: 401 });
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return new Response('Bad JSON', { status: 400 });
  }
  const ev = payload?.event;
  if (!ev || !ev.type) {
    return new Response('Bad event shape', { status: 400 });
  }

  try {
    switch (ev.type) {
      case 'INITIAL_PURCHASE':
      case 'NON_RENEWING_PURCHASE':
      case 'RENEWAL':
        await handleRcPurchase(ev);
        break;
      case 'CANCELLATION':
      case 'EXPIRATION':
        // No money back, no entitlement change beyond the natural
        // expiry already in active_passes.expires_at. Log only.
        console.log(`RC ${ev.type} | tx=${ev.transaction_id} | product=${ev.product_id}`);
        break;
      case 'REFUND':
        await handleRcRefund(ev);
        break;
      case 'BILLING_ISSUE':
        console.warn(`RC billing issue | user=${ev.app_user_id} | product=${ev.product_id}`);
        break;
      case 'TRANSFER':
        // Apple ID change moved a purchase to a new app_user_id. Worth
        // a manual look — entitlement logic is fine but we want to know.
        await notifyAdmin(`ℹ️ <b>RevenueCat TRANSFER event</b>: <code>${ev.product_id}</code> moved between users.\nFrom: <code>${ev.transferred_from?.join(',') || '?'}</code>\nTo: <code>${ev.transferred_to?.join(',') || '?'}</code>`);
        break;
      case 'TEST':
        // RC's "Send Test Event" button. Acknowledge so the dashboard
        // shows green.
        console.log('RC test event received');
        break;
      default:
        console.log(`RC unhandled event: ${ev.type}`);
    }
  } catch (err) {
    console.error('RC webhook processing error:', err.message, err.stack);
    await notifyAdmin(`🚨 <b>RevenueCat webhook error.</b>\nEvent: <code>${ev.type}</code>\nTx: <code>${ev.transaction_id}</code>\nError: <code>${err.message}</code>`).catch(() => {});
    return new Response('Webhook processing error', { status: 500 });
  }

  return new Response('OK', { status: 200 });
}
