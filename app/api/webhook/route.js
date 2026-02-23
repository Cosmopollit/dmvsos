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
      const email = session.customer_email || session.customer_details?.email;

      if (email) {
        const { error } = await supabase
          .from('profiles')
          .upsert(
            { email, is_pro: true, stripe_customer_id: session.customer },
            { onConflict: 'email' }
          );
        if (error) console.error('Webhook: failed to activate pro:', error.message);
      } else {
        console.error('Webhook: checkout.session.completed missing email', session.id);
      }
    }

    if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object;
      const customer = await stripe.customers.retrieve(subscription.customer);

      if (customer?.email) {
        const { error } = await supabase
          .from('profiles')
          .update({ is_pro: false })
          .eq('email', customer.email);
        if (error) console.error('Webhook: failed to deactivate pro:', error.message);
      } else {
        console.error('Webhook: subscription.deleted missing customer email', subscription.customer);
      }
    }
  } catch (err) {
    console.error('Webhook processing error:', err.message);
    return new Response('Webhook processing error', { status: 500 });
  }

  return new Response('OK', { status: 200 });
}
