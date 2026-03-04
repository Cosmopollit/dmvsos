import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://dmvsos.com';

const PLAN_PRICE_IDS = {
  quick_pass: process.env.STRIPE_PRICE_ID_QUICK_PASS,
  full_prep: process.env.STRIPE_PRICE_ID_FULL_PREP,
  guaranteed_pass: process.env.STRIPE_PRICE_ID_GUARANTEED_PASS,
};

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const planType = body.planType || 'full_prep';

    if (!PLAN_PRICE_IDS[planType]) {
      return Response.json({ error: 'Invalid plan type' }, { status: 400 });
    }

    // Get user email from auth header
    const authHeader = req.headers.get('authorization');
    let customerEmail = null;

    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const { data: { user } } = await supabase.auth.getUser(token);
      customerEmail = user?.email || null;
    }

    const sessionParams = {
      mode: 'payment',
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

    if (customerEmail) {
      sessionParams.customer_email = customerEmail;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);
    return Response.json({ url: session.url });
  } catch (err) {
    console.error('Stripe checkout error:', err.message);
    return Response.json({ error: 'Failed to create checkout session' }, { status: 500 });
  }
}
