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
    // Map our 5-language codes to Stripe Checkout locale codes so the
    // hosted checkout page renders in the user's language instead of
    // defaulting to English based on browser headers. Stripe supports a
    // fixed enum (https://stripe.com/docs/payments/checkout/customization/translate);
    // we narrow to the four non-EN locales we actually translate the rest
    // of the funnel into. Unknown / EN falls through to 'auto'.
    const LANG_TO_STRIPE_LOCALE = { ru: 'ru', es: 'es', zh: 'zh', ua: 'uk' };
    const checkoutLocale = LANG_TO_STRIPE_LOCALE[body.lang] || 'auto';

    if (!ALL_PLANS.has(planType)) {
      return Response.json({ error: 'Unknown plan type' }, { status: 400 });
    }
    if (!PLAN_PRICE_IDS[planType]) {
      return Response.json({ error: `Missing price ID for ${planType}` }, { status: 500 });
    }
    if (planType === 'extension' && !['moto', 'auto', 'cdl'].includes(extensionTarget)) {
      return Response.json({ error: 'extension requires passType (moto|auto|cdl)' }, { status: 400 });
    }

    // ── Identify the user (REQUIRED) ─────────────────────────────────────
    // As of 2026-06-06 anonymous checkout is no longer accepted. Allowing it
    // produced a class of "I paid but no access" failures rooted in the
    // anonymous email entry on Stripe Checkout — Stripe accepted any string
    // containing @ as a valid email, including typos like .by added to the
    // user's real address (Galina case). The phantom auth.users created from
    // such typos couldn't be reached by the real owner without manual DB
    // recovery. Forcing a verified session before checkout makes the buyer's
    // email always come from a confirmed auth.users row, not a hand-typed
    // field on a hosted Stripe page.
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return Response.json(
        { error: 'login_required', message: 'Sign in before purchasing' },
        { status: 401 }
      );
    }
    const token = authHeader.slice(7);
    const { data: { user }, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !user?.id || !user?.email) {
      return Response.json(
        { error: 'invalid_session', message: 'Sign in again before purchasing' },
        { status: 401 }
      );
    }
    const userId = user.id;
    const customerEmail = user.email;

    // Look up existing Stripe customer to avoid creating duplicates.
    // Failure here just means we'll create a fresh Stripe customer; not fatal.
    let stripeCustomerId = null;
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

    // ── Duplicate-buy guard for one-time 'new' purchases ────────────────
    // If a user already has an active pass of the same type, the right action
    // is Extension ($9.99), not a fresh purchase ($19.99-$49.99). This guard
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

    // No payment_method_types restriction — Stripe Checkout auto-shows every
    // method enabled in the Stripe Dashboard (Apple Pay, Google Pay, Link,
    // Cash App Pay, Klarna, etc.) based on customer locale + device.
    // 60% of our visitors are mobile; 48% on iOS. Apple Pay is critical for
    // checkout conversion on iPhone (two taps vs typing a card number).
    // Pass type + kind ride along on success_url so /success can fire the GA4
    // `purchase` conversion immediately on mount (with the right value) without
    // a second round trip to Stripe. Stripe replaces {CHECKOUT_SESSION_ID} and
    // leaves our static params intact. Only added for one-time pass purchases.
    const purchaseTracking = metadata.pass_type
      ? `&pt=${metadata.pass_type}&k=${metadata.kind}`
      : '';
    const sessionParams = {
      mode: isSubscription ? 'subscription' : 'payment',
      line_items: [{ price: PLAN_PRICE_IDS[planType], quantity: 1 }],
      success_url: `${SITE_URL}/success?session_id={CHECKOUT_SESSION_ID}${purchaseTracking}`,
      cancel_url: `${SITE_URL}/upgrade`,
      metadata,
      // phone_number_collection removed 2026-07-01: a REQUIRED phone field on a
      // $19.99-$49.99 one-time digital purchase measurably kills mobile checkout
      // completion (privacy-wary audience, 60% mobile) and nothing in the
      // webhook/fulfillment path uses the phone.
      locale: checkoutLocale,
    };

    // Force Stripe to create a Customer object even for one-time payments.
    // Without this, payment-mode sessions leave session.customer null, so the
    // webhook never gets a stripe_customer_id to store on the profile (every
    // profile had stripe_customer_id = null). That meant the re-attach branch
    // below could never fire and a repeat buyer got a brand-new Stripe
    // customer each time, scattering their purchase history. Subscriptions
    // always create a customer, so only set this for one-time.
    if (isOneTime) {
      sessionParams.customer_creation = 'always';
      // Restate the payment-model facts at the moment of highest anxiety,
      // right under the Pay button. Checkout-forensics 2026-07-08: every
      // abandoned session closed the page without ever touching the card
      // form, so reassurance has to live on the Stripe page itself, not
      // only on /upgrade. Stripe doesn't translate custom_text, so we
      // localize it ourselves. payment mode only — the legacy subscription
      // plans would make "not a subscription" a lie.
      const SUBMIT_NOTE = {
        en: 'One-time payment. 30 days of access. Not a subscription, nothing to cancel.',
        ru: 'Разовый платёж. Доступ на 30 дней. Это не подписка, отменять ничего не нужно.',
        es: 'Pago único. 30 días de acceso. No es una suscripción, no hay nada que cancelar.',
        zh: '一次性付款，30天使用权。非订阅，无需取消。',
        ua: 'Разовий платіж. Доступ на 30 днів. Це не підписка, нічого скасовувати не потрібно.',
      };
      sessionParams.submit_type = 'pay';
      sessionParams.custom_text = {
        submit: { message: SUBMIT_NOTE[body.lang] || SUBMIT_NOTE.en },
      };
    }

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
    return Response.json({
      error: 'Failed to create checkout session',
      detail: err?.message || String(err),
    }, { status: 500 });
  }
}
