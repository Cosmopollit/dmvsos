import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://dmvsos.com';

// New category plans are monthly subscriptions
// Legacy plans (quick_pass, full_prep, guaranteed_pass) were one-time payments — kept for backward compat
const SUBSCRIPTION_PLANS = new Set(['car_pass', 'moto_pass', 'cdl_pass']);

export async function POST(req) {
  try {
    const PLAN_PRICE_IDS = {
      quick_pass:      process.env.STRIPE_PRICE_ID_QUICK_PASS,
      full_prep:       process.env.STRIPE_PRICE_ID_FULL_PREP,
      guaranteed_pass: process.env.STRIPE_PRICE_ID_GUARANTEED_PASS,
      car_pass:        process.env.STRIPE_PRICE_ID_CAR_PASS,
      moto_pass:       process.env.STRIPE_PRICE_ID_MOTO_PASS,
      cdl_pass:        process.env.STRIPE_PRICE_ID_CDL_PASS,
    };

    const body = await req.json().catch(() => ({}));
    const planType = body.planType || 'car_pass';

    if (!['quick_pass', 'full_prep', 'guaranteed_pass', 'car_pass', 'moto_pass', 'cdl_pass'].includes(planType)) {
      return Response.json({ error: 'Unknown plan type' }, { status: 400 });
    }

    if (!PLAN_PRICE_IDS[planType]) {
      return Response.json({ error: `Missing price ID for ${planType}` }, { status: 500 });
    }

    // Get user email from auth header
    const authHeader = req.headers.get('authorization');
    let customerEmail = null;
    let stripeCustomerId = null;

    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const { data: { user } } = await supabase.auth.getUser(token);
      customerEmail = user?.email || null;

      // Look up existing Stripe customer to avoid duplicate customers
      if (customerEmail) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('stripe_customer_id')
          .eq('email', customerEmail)
          .single()
          .catch(() => ({ data: null }));
        stripeCustomerId = profile?.stripe_customer_id || null;
      }
    }

    const isSubscription = SUBSCRIPTION_PLANS.has(planType);

    const sessionParams = {
      mode: isSubscription ? 'subscription' : 'payment',
      payment_method_types: ['card'],
      line_items: [{
        price: PLAN_PRICE_IDS[planType],
        quantity: 1,
      }],
      success_url: `${SITE_URL}/success`,
      cancel_url: `${SITE_URL}/upgrade`,
      metadata: {
        plan_type: planType,
        ...(customerEmail ? { email: customerEmail } : {}),
      },
    };

    // For subscriptions: pass metadata to the subscription object too
    // so renewal invoices (invoice.payment_succeeded) know the plan_type
    if (isSubscription) {
      sessionParams.subscription_data = {
        metadata: { plan_type: planType, ...(customerEmail ? { email: customerEmail } : {}) },
      };
    }

    // Attach to existing Stripe customer to prevent duplicate accounts
    if (stripeCustomerId) {
      sessionParams.customer = stripeCustomerId;
    } else if (customerEmail) {
      sessionParams.customer_email = customerEmail;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);
    return Response.json({ url: session.url });
  } catch (err) {
    console.error('Stripe checkout error:', err.message);
    return Response.json({ error: 'Failed to create checkout session' }, { status: 500 });
  }
}
