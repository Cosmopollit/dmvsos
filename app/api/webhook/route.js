import Stripe from 'stripe';
import { createHash } from 'crypto';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Log-safe email hash: first 8 hex chars of sha256.
function emailTag(email) {
  if (!email) return 'none';
  return createHash('sha256').update(email.toLowerCase()).digest('hex').slice(0, 8);
}

// ─── Supabase REST helpers (no SDK — works in Vercel serverless) ─────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const sbHeaders = {
  'apikey': SUPABASE_SERVICE_KEY,
  'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

async function sbSelect(table, query) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, { headers: sbHeaders });
  if (!res.ok) throw new Error(`Supabase SELECT ${table} failed: ${await res.text()}`);
  return res.json();
}

async function sbInsert(table, row, { ignoreDuplicate = false } = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...sbHeaders, 'Prefer': 'return=representation' },
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
    headers: { ...sbHeaders, 'Prefer': 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`Supabase UPSERT ${table} failed: ${await res.text()}`);
  return res.json();
}

async function sbUpdate(table, filter, updates) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
    method: 'PATCH',
    headers: { ...sbHeaders, 'Prefer': 'return=representation' },
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

// ─── Legacy profiles helpers (kept for subscription customers) ───────────────

async function profilesUpdateByEmail(rawEmail, updates) {
  const email = rawEmail.toLowerCase();
  const updated = await sbUpdate('profiles', `email=ilike.${encodeURIComponent(email)}`, updates);
  if (updated.length === 0) {
    await sbInsert('profiles', { email, ...updates });
  }
  return updated;
}

async function profilesUpdateByCustomerId(customerId, updates) {
  return sbUpdate('profiles', `stripe_customer_id=eq.${encodeURIComponent(customerId)}`, updates);
}

// ─── One-time pricing handlers ───────────────────────────────────────────────

const DAYS_30_MS = 30 * 24 * 60 * 60 * 1000;

// Process a one-time payment (new pass or extension).
// Idempotent via the UNIQUE constraint on purchases.stripe_payment_intent.
async function handleOneTimePayment({ paymentIntentId, amountCents, metadata, checkoutSessionId, email }) {
  const { user_id, pass_type, kind } = metadata;
  if (!user_id || !pass_type || !['new', 'extension'].includes(kind)) {
    console.warn(`one-time payment missing metadata | pi=${paymentIntentId} | meta=${JSON.stringify(metadata)}`);
    return;
  }

  // [1] Idempotency: already processed?
  const existing = await sbSelect('purchases', `stripe_payment_intent=eq.${paymentIntentId}&select=id`);
  if (existing.length > 0) {
    console.log(`one-time payment already processed | pi=${paymentIntentId}`);
    return;
  }

  // [2] Current state for this (user, pass_type)
  const current = await sbSelect('active_passes',
    `user_id=eq.${user_id}&pass_type=eq.${pass_type}&select=expires_at`);
  const now = new Date();
  const currentExpiresAt = current[0]?.expires_at || null;
  const isActive = currentExpiresAt && new Date(currentExpiresAt) > now;

  // [3] BUG #1 GUARD: 'new' purchase when type is already active → auto-refund
  // Frontend should prevent this via the duplicate-buy check in create-checkout,
  // but we double-check here in case of bypass or race.
  if (kind === 'new' && isActive) {
    console.warn(`auto-refund duplicate 'new' purchase | user=${user_id} | type=${pass_type} | pi=${paymentIntentId}`);
    try {
      await stripe.refunds.create({
        payment_intent: paymentIntentId,
        reason: 'duplicate',
        metadata: { reason_detail: 'pass_type_already_active' },
      });
    } catch (e) {
      console.error(`auto-refund failed | pi=${paymentIntentId} | ${e.message}`);
    }
    return; // do not insert purchase row
  }

  // [4] Compute new expires_at
  const baseDate = isActive ? new Date(currentExpiresAt) : now;
  const newExpiresAt = new Date(baseDate.getTime() + DAYS_30_MS);

  // [5] Append purchase row (race-safe via UNIQUE on stripe_payment_intent)
  const inserted = await sbInsert('purchases', {
    user_id,
    email: email || null,
    pass_type,
    kind,
    amount_cents: amountCents,
    currency: 'usd',
    stripe_payment_intent: paymentIntentId,
    stripe_checkout_session: checkoutSessionId || null,
    prev_expires_at: currentExpiresAt,
    new_expires_at: newExpiresAt.toISOString(),
  }, { ignoreDuplicate: true });
  if (!inserted) {
    console.log(`concurrent webhook beat us | pi=${paymentIntentId}`);
    return;
  }

  // [6] Upsert active state
  await sbUpsert('active_passes', {
    user_id, pass_type,
    expires_at: newExpiresAt.toISOString(),
  }, 'user_id,pass_type');

  // [7] Keep legacy profile in sync: is_pro + plan_expires_at = max across all
  // active passes for this user. Lets the existing AuthContext check continue
  // to work without rewriting it for one-time users.
  if (email) {
    const allActive = await sbSelect('active_passes',
      `user_id=eq.${user_id}&select=expires_at&order=expires_at.desc`);
    const maxExpires = allActive[0]?.expires_at || null;
    await profilesUpdateByEmail(email, {
      is_pro: true,
      plan_type: pass_type, // most-recent pass type
      plan_expires_at: maxExpires,
    }).catch(e => console.warn(`profile sync failed: ${e.message}`));
  }

  console.log(`one-time payment applied | user=${emailTag(email)} | type=${pass_type} | kind=${kind} | expires=${newExpiresAt.toISOString()}`);
}

// Handle a Stripe refund event for a one-time purchase.
// Rules:
//   - 'new'       → delete active_passes row (full revoke)
//   - 'extension' → expires_at -= 30d (NOT a rollback to prev_expires_at — that
//                   would eat days from later serial extensions)
async function handleOneTimeRefund(charge) {
  const paymentIntentId = typeof charge.payment_intent === 'string'
    ? charge.payment_intent : charge.payment_intent?.id;
  if (!paymentIntentId) return;

  const rows = await sbSelect('purchases',
    `stripe_payment_intent=eq.${paymentIntentId}&select=*`);
  const purchase = rows[0];
  if (!purchase) {
    // Not a one-time purchase we tracked (probably a subscription refund). Skip.
    return;
  }
  if (purchase.refunded_at) {
    console.log(`refund already processed | pi=${paymentIntentId}`);
    return;
  }

  // Mark refunded
  await sbUpdate('purchases', `id=eq.${purchase.id}`, {
    refunded_at: new Date().toISOString(),
    refund_reason: charge.refunds?.data[0]?.reason || 'manual',
  });

  if (purchase.kind === 'new') {
    // Full revoke for the type
    await sbDelete('active_passes',
      `user_id=eq.${purchase.user_id}&pass_type=eq.${purchase.pass_type}`);
    console.log(`refund applied (new=delete) | user=${purchase.user_id} | type=${purchase.pass_type}`);
  } else {
    // Extension refund — subtract 30d from current expires_at
    const active = await sbSelect('active_passes',
      `user_id=eq.${purchase.user_id}&pass_type=eq.${purchase.pass_type}&select=expires_at`);
    if (active[0]) {
      const newExpires = new Date(new Date(active[0].expires_at).getTime() - DAYS_30_MS);
      if (newExpires > new Date()) {
        await sbUpdate('active_passes',
          `user_id=eq.${purchase.user_id}&pass_type=eq.${purchase.pass_type}`,
          { expires_at: newExpires.toISOString() });
        console.log(`refund applied (ext -30d) | new_expires=${newExpires.toISOString()}`);
      } else {
        await sbDelete('active_passes',
          `user_id=eq.${purchase.user_id}&pass_type=eq.${purchase.pass_type}`);
        console.log(`refund applied (ext expired in past, deleted)`);
      }
    }
  }

  // Sync legacy profile: recompute max(expires_at) across remaining passes.
  // If none left, downgrade is_pro and clear plan_expires_at.
  if (purchase.email) {
    const remaining = await sbSelect('active_passes',
      `user_id=eq.${purchase.user_id}&select=pass_type,expires_at&order=expires_at.desc`);
    const top = remaining[0];
    await profilesUpdateByEmail(purchase.email, top
      ? { is_pro: true, plan_type: top.pass_type, plan_expires_at: top.expires_at }
      : { is_pro: false, plan_type: null, plan_expires_at: null }
    ).catch(e => console.warn(`profile sync (refund) failed: ${e.message}`));
  }
}

// ─── Webhook entry ───────────────────────────────────────────────────────────

export async function POST(request) {
  const body = await request.text();
  const sig = request.headers.get('stripe-signature');

  let event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    return new Response('Webhook error', { status: 400 });
  }

  try {
    // ── checkout.session.completed: routes by mode + metadata ──────────────
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const email = session.customer_email || session.customer_details?.email || session.metadata?.email;
      const planType = session.metadata?.plan_type || 'car_pass';
      const customerId = session.customer;
      const meta = session.metadata || {};

      console.log(`Webhook: checkout.session.completed | user=${emailTag(email)} | plan=${planType} | mode=${session.mode}`);

      // New one-time pricing model (metadata.kind = 'new' | 'extension').
      // handleOneTimePayment already syncs profiles.is_pro / plan_expires_at.
      // We only stamp stripe_customer_id here (the helper doesn't know it).
      if (session.mode === 'payment' && (meta.kind === 'new' || meta.kind === 'extension')) {
        await handleOneTimePayment({
          paymentIntentId: session.payment_intent,
          amountCents: session.amount_total,
          metadata: meta,
          checkoutSessionId: session.id,
          email,
        });
        if (email && customerId) {
          await profilesUpdateByEmail(email, { stripe_customer_id: customerId })
            .catch(e => console.warn(`customer_id sync failed: ${e.message}`));
        }
        return new Response('OK', { status: 200 });
      }

      // Subscription (legacy active subscribers — kept until they migrate off)
      if (session.mode === 'subscription' && email) {
        const subscription = await stripe.subscriptions.retrieve(session.subscription);
        const expiresAt = new Date(subscription.current_period_end * 1000).toISOString();
        await profilesUpdateByEmail(email, {
          is_pro: true,
          plan_type: planType,
          plan_expires_at: expiresAt,
          stripe_customer_id: customerId,
          stripe_subscription_id: subscription.id,
        });
        console.log(`subscription created | sub=${subscription.id} | expires=${expiresAt}`);
        return new Response('OK', { status: 200 });
      }

      // Legacy one-time (quick_pass / full_prep / guaranteed_pass) — pre-onetime model
      if (session.mode === 'payment' && email) {
        const PLAN_DAYS = { quick_pass: 7, full_prep: 30, guaranteed_pass: 90 };
        const days = PLAN_DAYS[planType] || 30;
        const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
        await profilesUpdateByEmail(email, {
          is_pro: true,
          plan_type: planType,
          plan_expires_at: expiresAt,
          ...(customerId ? { stripe_customer_id: customerId } : {}),
        });
        console.log(`legacy one-time | plan=${planType} | expires=${expiresAt}`);
      }
    }

    // ── Subscription renewed (legacy) ──────────────────────────────────────
    if (event.type === 'invoice.payment_succeeded') {
      const invoice = event.data.object;
      if (invoice.billing_reason !== 'subscription_cycle') return new Response('OK', { status: 200 });

      const customerId = invoice.customer;
      const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
      const expiresAt = new Date(subscription.current_period_end * 1000).toISOString();
      const planType = subscription.metadata?.plan_type;

      console.log(`Webhook: invoice.payment_succeeded (renewal) | customer=${customerId} | expires=${expiresAt}`);
      await profilesUpdateByCustomerId(customerId, {
        is_pro: true,
        plan_expires_at: expiresAt,
        ...(planType ? { plan_type: planType } : {}),
      });
    }

    // ── Subscription updated (legacy) ──────────────────────────────────────
    if (event.type === 'customer.subscription.updated') {
      const subscription = event.data.object;
      const customerId = subscription.customer;
      const expiresAt = new Date(subscription.current_period_end * 1000).toISOString();
      const planType = subscription.metadata?.plan_type;
      const isActive = subscription.status === 'active' || subscription.status === 'trialing';

      console.log(`Webhook: subscription.updated | customer=${customerId} | status=${subscription.status} | expires=${expiresAt}`);
      await profilesUpdateByCustomerId(customerId, {
        is_pro: isActive,
        plan_expires_at: expiresAt,
        ...(planType ? { plan_type: planType } : {}),
      });
    }

    // ── Subscription cancelled (legacy) ────────────────────────────────────
    if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object;
      const customerId = subscription.customer;
      console.log(`Webhook: subscription.deleted | customer=${customerId}`);
      await profilesUpdateByCustomerId(customerId, {
        is_pro: false, plan_type: null, plan_expires_at: null, stripe_subscription_id: null,
      });
    }

    // ── Payment failed (legacy subscription) ───────────────────────────────
    if (event.type === 'invoice.payment_failed') {
      const invoice = event.data.object;
      console.log(`Webhook: invoice.payment_failed | customer=${invoice.customer} | attempt=${invoice.attempt_count}`);
    }

    // ── Refund (one-time and legacy) ───────────────────────────────────────
    if (event.type === 'charge.refunded') {
      const charge = event.data.object;
      console.log(`Webhook: charge.refunded | charge=${charge.id} | amount=${charge.amount_refunded}`);
      await handleOneTimeRefund(charge);
    }

  } catch (err) {
    console.error('Webhook processing error:', err.message);
    return new Response('Webhook processing error', { status: 500 });
  }

  return new Response('OK', { status: 200 });
}
