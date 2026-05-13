// Creates a LIVE Stripe webhook endpoint pointing to production.
// Reads STRIPE_SECRET_KEY_LIVE so the test key is untouched.
// Outputs the webhook secret — copy to Vercel Production env as STRIPE_WEBHOOK_SECRET.

import Stripe from 'stripe';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envFile = readFileSync(join(__dirname, '..', '.env.local'), 'utf8');
const env = (k) => envFile.split('\n').find(l => l.startsWith(k + '='))?.slice(k.length + 1)?.trim();

const secretKey = env('STRIPE_SECRET_KEY_LIVE') || '';
if (!secretKey.startsWith('sk_live_')) {
  console.error('STRIPE_SECRET_KEY_LIVE missing or not a live key.');
  process.exit(1);
}
const stripe = new Stripe(secretKey);

const url = 'https://dmvsos.com/api/webhook';

// If an endpoint with the same URL already exists, reuse it (we can't reveal
// its secret via API; would need to delete + recreate to rotate). For first
// migration we just create fresh.
const existing = await stripe.webhookEndpoints.list({ limit: 100 });
const dup = existing.data.find(w => w.url === url && w.status !== 'disabled');
if (dup) {
  console.log(`Endpoint already exists: ${dup.id} (${dup.url}). Secret was returned only at creation.`);
  console.log('If you need the secret, delete this endpoint and re-run this script.');
  process.exit(0);
}

const w = await stripe.webhookEndpoints.create({
  url,
  enabled_events: [
    'checkout.session.completed',
    'invoice.payment_succeeded',
    'invoice.payment_failed',
    'customer.subscription.updated',
    'customer.subscription.deleted',
    'charge.refunded',
  ],
});

console.log('LIVE webhook created:');
console.log('  id:    ', w.id);
console.log('  url:   ', w.url);
console.log('  status:', w.status);
console.log('  events:', w.enabled_events.length);
console.log('\n— Vercel Production env var to set —');
console.log(`STRIPE_WEBHOOK_SECRET=${w.secret}`);
console.log('\nAfter saving, remove STRIPE_SECRET_KEY_LIVE from .env.local.');
