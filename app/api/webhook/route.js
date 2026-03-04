import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(request) {
  const body = await request.text();
  const sig = request.headers.get('stripe-signature');

  let event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return new Response('Webhook error', { status: 400 });
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const email = session.customer_email || session.customer_details?.email || session.metadata?.email;
      const planType = session.metadata?.plan_type || 'full_prep';

      if (email) {
        const PLAN_DAYS = { quick_pass: 7, full_prep: 30, guaranteed_pass: 90 };
        const days = PLAN_DAYS[planType] || 30;
        const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
        const updates = {
          is_pro: true,
          plan_type: planType,
          plan_expires_at: expiresAt,
          stripe_customer_id: session.customer,
        };
        // Update existing profile first; insert if none exists
        const { data: updated, error: updateError } = await supabase
          .from('profiles')
          .update(updates)
          .eq('email', email)
          .select();
        if (updateError) {
          console.error('Webhook: update failed:', updateError.message);
        } else if (!updated || updated.length === 0) {
          const { error: insertError } = await supabase
            .from('profiles')
            .insert({ email, ...updates });
          if (insertError) console.error('Webhook: insert failed:', insertError.message);
        }
      } else {
        console.error('Webhook: checkout.session.completed missing email', session.id);
      }
    }
  } catch (err) {
    console.error('Webhook processing error:', err.message);
    return new Response('Webhook processing error', { status: 500 });
  }

  return new Response('OK', { status: 200 });
}
