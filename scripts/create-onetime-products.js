// Creates one-time Stripe Products + Prices for the new pricing model.
// Idempotent: if a Price with the same lookup_key already exists, reuse it.
//
// Usage: node scripts/create-onetime-products.js
// Refuses to run against live keys.

import Stripe from 'stripe';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envFile = readFileSync(join(__dirname, '..', '.env.local'), 'utf8');
const env = (k) => envFile.split('\n').find(l => l.startsWith(k + '='))?.slice(k.length + 1)?.trim();

const stripe = new Stripe(env('STRIPE_SECRET_KEY'));

const PRODUCTS = [
  {
    key: 'onetime_moto_pass',
    name: 'Moto Pass — 30 days',
    description: 'Motorcycle DMV practice tests. 30-day access. No subscription.',
    amount_cents: 1999,
    metadata: { pass_type: 'moto', kind: 'new', duration_days: '30' },
  },
  {
    key: 'onetime_auto_pass',
    name: 'Auto Pass — 30 days',
    description: 'Car/Permit DMV practice tests. 30-day access. No subscription.',
    amount_cents: 2999,
    metadata: { pass_type: 'auto', kind: 'new', duration_days: '30' },
  },
  {
    key: 'onetime_cdl_pro',
    name: 'CDL Pro — 30 days + Pass Guarantee',
    description: 'Commercial Driver License practice tests with pass guarantee. 30-day access.',
    amount_cents: 4999,
    metadata: { pass_type: 'cdl', kind: 'new', duration_days: '30', pass_guarantee: 'true' },
  },
  {
    key: 'onetime_extension',
    name: 'Extension — +30 days',
    description: 'Extends any active pass by 30 days.',
    amount_cents: 999,
    metadata: { kind: 'extension', duration_days: '30' },
  },
];

async function findByLookupKey(lookupKey) {
  const prices = await stripe.prices.list({ lookup_keys: [lookupKey], limit: 1, expand: ['data.product'] });
  return prices.data[0] || null;
}

async function ensureProduct(spec) {
  const existing = await findByLookupKey(spec.key);
  if (existing) {
    console.log(`  ✓ exists  ${spec.key.padEnd(22)} price=${existing.id}`);
    return { price_id: existing.id, product_id: existing.product.id, reused: true };
  }

  const product = await stripe.products.create({
    name: spec.name,
    description: spec.description,
    metadata: spec.metadata,
  });
  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: spec.amount_cents,
    currency: 'usd',
    lookup_key: spec.key,
    metadata: spec.metadata,
  });
  console.log(`  + created ${spec.key.padEnd(22)} price=${price.id}`);
  return { price_id: price.id, product_id: product.id, reused: false };
}

const secretKey = env('STRIPE_SECRET_KEY') || '';
const stripeMode = secretKey.startsWith('sk_test_') ? 'TEST' : 'LIVE';
console.log(`Stripe mode: ${stripeMode}`);
if (stripeMode === 'LIVE') {
  console.error('Refusing to run against LIVE keys. Aborting.');
  process.exit(1);
}

const results = {};
for (const spec of PRODUCTS) {
  results[spec.key] = await ensureProduct(spec);
}

console.log('\n— Env vars to add to .env.local —');
console.log(`STRIPE_PRICE_ID_ONETIME_MOTO=${results.onetime_moto_pass.price_id}`);
console.log(`STRIPE_PRICE_ID_ONETIME_AUTO=${results.onetime_auto_pass.price_id}`);
console.log(`STRIPE_PRICE_ID_ONETIME_CDL=${results.onetime_cdl_pro.price_id}`);
console.log(`STRIPE_PRICE_ID_ONETIME_EXTENSION=${results.onetime_extension.price_id}`);
