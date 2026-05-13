import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://dmvsos.com';

// Plan taxonomy:
// - One-time passes (new pricing): onetime_moto / onetime_auto / onetime_cdl / extension
// - Legacy subscriptions (still honored until users migrate off): car_pass / moto_pass / cdl_pass
// - Legacy one-time (deprecated, not exposed in UI): quick_pass / full_prep / guaranteed_pass
const SUBSCRIPTION_PLANS = new Set(['car_pass', 'moto_pass', 'cdl_pass']);
const ONETIME_PLANS = new Set(['onetime_moto', 'onetime_auto', 'onetime_cdl', 'extension']);
const LEGACY_ONETIME = new Set(['quick_pass', 'full_prep', 'guaranteed_pass']);
const ALL_PLANS = new Set([...SUBSCRIPTION_PLANS, ...ONETIME_PLANS, ...LEGACY_ONETIME]);

// Maps onetime plan key → pass_type stored in active_passes/purchases.
const ONETIME_TO_PASS_TYPE = {
  onetime_moto: 'moto',
  onetime_auto: 'auto',
  onetime_cdl:  'cdl',
  // extension is special — pass_type comes from request body
};

export async function POST(req) {
  try {
    const PLAN_PRICE_IDS = {
      quick_pass:      process.env.STRIPE_PRICE_ID_QUICK_PASS,
      full_prep:       process.env.STRIPE_PRICE_ID_FULL_PREP,
      guaranteed_pass: process.env.STRIPE_PRICE_ID_GUARANTEED_PASS,
      car_pass:        process.env.STRIPE_PRICE_ID_CAR_PASS,
      moto_pass:       process.env.STRIPE_PRICE_ID_MOTO_PASS,
      cdl_pass:        process.env.STRIPE_PRICE_ID_CDL_PASS,
      onetime_moto:    process.env.STRIPE_PRICE_ID_ONETIME_MOTO,
      onetime_auto:    process.env.STRIPE_PRICE_ID_ONETIME_AUTO,
      onetime_cdl:     process.env.STRIPE_PRICE_ID_ONETIME_CDL,
      extension:       process.env.STRIPE_PRICE_ID_ONETIME_EXTENSION,
    };

    const body = await req.json().catch(() => ({}));
    const planType = body.planType || 'onetime_auto';
    const extensionTarget = body.passType; // only used for kind='extension': 'moto' | 'auto' | 'cdl'

    if (!ALL_PLANS.has(planType)) {
      return Response.json({ error: 'Unknown plan type' }, { status: 400 });
    }
    if (!PLAN_PRICE_IDS[planType]) {
      return Response.json({ error: `Missing price ID for ${planType}` }, { status: 500 });
    }
    if (planType === 'extension' && !['moto', 'auto', 'cdl'].includes(extensionTarget)) {
      return Response.json({ error: 'extension requires passType (moto|auto|cdl)' }, { status: 400 });
    }

    // ── Identify the user ────────────────────────────────────────────────
    const authHeader = req.headers.get('authorization');
    let userId = null;
    let customerEmail = null;
    let stripeCustomerId = null;

    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const { data: { user } } = await supabase.auth.getUser(token);
      userId = user?.id || null;
      customerEmail = user?.email || null;

      if (customerEmail) {
        // Wrap in try/catch — @supabase/postgrest-js builder isn't a Promise,
        // so chaining .catch on the query was throwing TypeError. Failure here
        // just means we'll create a fresh Stripe customer; not fatal.
        try {
          const { data: profile } = await supabase
            .from('profiles')
            .select('stripe_customer_id')
            .ilike('email', customerEmail)
            .maybeSingle();
          stripeCustomerId = profile?.stripe_customer_id || null;
        } catch {
          stripeCustomerId = null;
        }
      }
    }

    // ── Duplicate-buy guard for one-time 'new' purchases ────────────────
    // If a user already has an active pass of the same type, the right action
    // is Extension ($9.99), not a fresh purchase ($14.99-$49.99). This guard
    // prevents accidental double-purchase and saves the user money.
    if (userId && ONETIME_TO_PASS_TYPE[planType]) {
      const targetType = ONETIME_TO_PASS_TYPE[planType];
      const { data: active } = await supabase
        .from('active_passes')
        .select('expires_at')
        .eq('user_id', userId)
        .eq('pass_type', targetType)
        .maybeSingle();
      if (active && new Date(active.expires_at) > new Date()) {
        return Response.json({
          error: 'pass_already_active',
          message: `You already have an active ${targetType} pass. Use Extension instead.`,
          pass_type: targetType,
          expires_at: active.expires_at,
        }, { status: 409 });
      }
    }

    // ── Build Stripe Checkout session ────────────────────────────────────
    const isSubscription = SUBSCRIPTION_PLANS.has(planType);
    const isOneTime = ONETIME_PLANS.has(planType) || LEGACY_ONETIME.has(planType);

    // Metadata used by webhook to route the payment correctly.
    const metadata = {
      plan_type: planType,
      ...(customerEmail ? { email: customerEmail } : {}),
      ...(userId ? { user_id: userId } : {}),
    };
    if (ONETIME_PLANS.has(planType)) {
      metadata.kind = planType === 'extension' ? 'extension' : 'new';
      metadata.pass_type = planType === 'extension'
        ? extensionTarget
        : ONETIME_TO_PASS_TYPE[planType];
    }

    const sessionParams = {
      mode: isSubscription ? 'subscription' : 'payment',
      payment_method_types: ['card'],
      line_items: [{ price: PLAN_PRICE_IDS[planType], quantity: 1 }],
      success_url: `${SITE_URL}/success`,
      cancel_url: `${SITE_URL}/upgrade`,
      metadata,
    };

    // Pass metadata to subscription object too (so renewal invoices see it)
    if (isSubscription) {
      sessionParams.subscription_data = { metadata };
    }
    // For one-time, also stamp the PaymentIntent so charge.refunded webhooks
    // can find the original purchase by metadata if checkout_session isn't around.
    if (isOneTime) {
      sessionParams.payment_intent_data = { metadata };
    }

    // Re-attach to existing Stripe customer to prevent duplicate accounts
    if (stripeCustomerId) {
      sessionParams.customer = stripeCustomerId;
    } else if (customerEmail) {
      sessionParams.customer_email = customerEmail;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);
    return Response.json({ url: session.url });
  } catch (err) {
    console.error('Stripe checkout error:', err.message, err);
    // TEMP: expose error detail until extension flow is stable in preview.
    return Response.json({
      error: 'Failed to create checkout session',
      detail: err?.message || String(err),
      stack: err?.stack?.split('\n').slice(0, 5).join('\n'),
    }, { status: 500 });
  }
}
