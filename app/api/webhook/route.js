import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

async function supabaseUpdate(email, updates) {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?email=eq.${encodeURIComponent(email)}`,
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
  return data; // array of updated rows
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
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const email = session.customer_email || session.customer_details?.email || session.metadata?.email;
      const planType = session.metadata?.plan_type || 'full_prep';

      console.log(`Webhook: checkout.session.completed | email=${email} | plan=${planType}`);

      if (email) {
        const PLAN_DAYS = { quick_pass: 7, full_prep: 30, guaranteed_pass: 90, car_pass: 30, moto_pass: 30, cdl_pass: 30 };
        const days = PLAN_DAYS[planType] || 30;
        const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
        const updates = {
          is_pro: true,
          plan_type: planType,
          plan_expires_at: expiresAt,
          ...(session.customer ? { stripe_customer_id: session.customer } : {}),
        };

        const updated = await supabaseUpdate(email, updates);
        if (updated.length === 0) {
          await supabaseInsert({ email, ...updates });
          console.log(`Webhook: inserted new profile for ${email}`);
        } else {
          console.log(`Webhook: updated profile for ${email} | expires=${expiresAt}`);
        }
      } else {
        console.error('Webhook: missing email for session', session.id);
      }
    }
  } catch (err) {
    console.error('Webhook processing error:', err.message);
    return new Response('Webhook processing error', { status: 500 });
  }

  return new Response('OK', { status: 200 });
}
