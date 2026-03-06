import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// ─── Supabase helpers (direct REST, no SDK — required for Vercel serverless) ───

async function supabasePatch(filter, updates) {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?${filter}`,
    {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify(updates),
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(`Supabase PATCH failed: ${JSON.stringify(data)}`);
  return data;
}

async function supabaseInsert(row) {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles`,
    {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify(row),
    }
  );
  if (!res.ok) {
    const data = await res.json();
    throw new Error(`Supabase INSERT failed: ${JSON.stringify(data)}`);
  }
}

// Update by email — used when we have the email (checkout.session.completed)
async function updateByEmail(email, updates) {
  const updated = await supabasePatch(`email=eq.${encodeURIComponent(email)}`, updates);
  if (updated.length === 0) {
    await supabaseInsert({ email, ...updates });
  }
  return updated;
}

// Update by stripe_customer_id — used for invoice/subscription events
async function updateByCustomerId(customerId, updates) {
  return supabasePatch(`stripe_customer_id=eq.${encodeURIComponent(customerId)}`, updates);
}

// ─── Webhook handler ─────────────────────────────────────────────────────────

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
    // ── One-time payment completed (legacy plans + fallback) ────────────────
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const email = session.customer_email || session.customer_details?.email || session.metadata?.email;
      const planType = session.metadata?.plan_type || 'car_pass';
      const customerId = session.customer;

      console.log(`Webhook: checkout.session.completed | email=${email} | plan=${planType} | mode=${session.mode}`);

      if (session.mode === 'subscription') {
        // Subscription: get current_period_end from the subscription object
        const subscription = await stripe.subscriptions.retrieve(session.subscription);
        const expiresAt = new Date(subscription.current_period_end * 1000).toISOString();

        if (email) {
          await updateByEmail(email, {
            is_pro: true,
            plan_type: planType,
            plan_expires_at: expiresAt,
            stripe_customer_id: customerId,
            stripe_subscription_id: subscription.id,
          });
          console.log(`Webhook: subscription created for ${email} | expires=${expiresAt}`);
        }
      } else {
        // One-time payment (legacy plans)
        const PLAN_DAYS = { quick_pass: 7, full_prep: 30, guaranteed_pass: 90 };
        const days = PLAN_DAYS[planType] || 30;
        const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

        if (email) {
          await updateByEmail(email, {
            is_pro: true,
            plan_type: planType,
            plan_expires_at: expiresAt,
            ...(customerId ? { stripe_customer_id: customerId } : {}),
          });
          console.log(`Webhook: one-time payment for ${email} | plan=${planType} | expires=${expiresAt}`);
        }
      }
    }

    // ── Subscription renewed (monthly invoice paid) ─────────────────────────
    if (event.type === 'invoice.payment_succeeded') {
      const invoice = event.data.object;

      // Only process subscription renewals (not the initial invoice, which is handled above)
      if (invoice.billing_reason !== 'subscription_cycle') return new Response('OK', { status: 200 });

      const customerId = invoice.customer;
      const subscriptionId = invoice.subscription;

      // Get current_period_end from the subscription
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const expiresAt = new Date(subscription.current_period_end * 1000).toISOString();
      const planType = subscription.metadata?.plan_type;

      console.log(`Webhook: invoice.payment_succeeded (renewal) | customer=${customerId} | expires=${expiresAt}`);

      await updateByCustomerId(customerId, {
        is_pro: true,
        plan_expires_at: expiresAt,
        ...(planType ? { plan_type: planType } : {}),
      });
    }

    // ── Subscription cancelled ──────────────────────────────────────────────
    if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object;
      const customerId = subscription.customer;

      console.log(`Webhook: customer.subscription.deleted | customer=${customerId}`);

      // Revoke access immediately on cancellation
      await updateByCustomerId(customerId, {
        is_pro: false,
        plan_type: null,
        plan_expires_at: null,
        stripe_subscription_id: null,
      });
    }

    // ── Payment failed (subscription) ───────────────────────────────────────
    if (event.type === 'invoice.payment_failed') {
      const invoice = event.data.object;
      const customerId = invoice.customer;

      // Stripe retries automatically — we log but don't revoke yet
      // Access expires naturally when plan_expires_at passes
      console.log(`Webhook: invoice.payment_failed | customer=${customerId} | attempt=${invoice.attempt_count}`);

      // After 3 failed attempts Stripe sends customer.subscription.deleted — handled above
    }

  } catch (err) {
    console.error('Webhook processing error:', err.message);
    return new Response('Webhook processing error', { status: 500 });
  }

  return new Response('OK', { status: 200 });
}
