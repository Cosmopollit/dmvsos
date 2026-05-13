// Creates the same one-time Stripe Products + Prices in LIVE mode.
// Reads a separate env var STRIPE_SECRET_KEY_LIVE so the test key is untouched.
// Idempotent: existing Price by lookup_key is reused.
//
// Usage:
//   1. Add `STRIPE_SECRET_KEY_LIVE=sk_live_...` to .env.local
//   2. node scripts/create-onetime-products-live.js
//   3. Remove the line from .env.local afterwards.

import Stripe from 'stripe';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envFile = readFileSync(join(__dirname, '..', '.env.local'), 'utf8');
const env = (k) => envFile.split('\n').find(l => l.startsWith(k + '='))?.slice(k.length + 1)?.trim();

const secretKey = env('STRIPE_SECRET_KEY_LIVE') || '';
if (!secretKey.startsWith('sk_live_')) {
  console.error('STRIPE_SECRET_KEY_LIVE missing or not a live key (must start with sk_live_).');
  process.exit(1);
}
const stripe = new Stripe(secretKey);

const PRODUCTS = [
  {
    key: 'onetime_moto_pass_live',
    name: 'Moto Pass — 30 days',
    description: 'Motorcycle DMV practice tests. 30-day access. No subscription.',
    amount_cents: 1999,
    metadata: { pass_type: 'moto', kind: 'new', duration_days: '30' },
  },
  {
    key: 'onetime_auto_pass_live',
    name: 'Auto Pass — 30 days',
    description: 'Car/Permit DMV practice tests. 30-day access. No subscription.',
    amount_cents: 2999,
    metadata: { pass_type: 'auto', kind: 'new', duration_days: '30' },
  },
  {
    key: 'onetime_cdl_pro_live',
    name: 'CDL Pro — 30 days + Pass Guarantee',
    description: 'Commercial Driver License practice tests with pass guarantee. 30-day access.',
    amount_cents: 4999,
    metadata: { pass_type: 'cdl', kind: 'new', duration_days: '30', pass_guarantee: 'true' },
  },
  {
    key: 'onetime_extension_live',
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
    console.log(`  ✓ exists  ${spec.key.padEnd(28)} price=${existing.id}`);
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
  console.log(`  + created ${spec.key.padEnd(28)} price=${price.id}`);
  return { price_id: price.id, product_id: product.id, reused: false };
}

console.log('Stripe mode: LIVE');
const results = {};
for (const spec of PRODUCTS) {
  results[spec.key] = await ensureProduct(spec);
}

console.log('\n— Vercel Production env vars to set —');
console.log(`STRIPE_PRICE_ID_ONETIME_MOTO=${results.onetime_moto_pass_live.price_id}`);
console.log(`STRIPE_PRICE_ID_ONETIME_AUTO=${results.onetime_auto_pass_live.price_id}`);
console.log(`STRIPE_PRICE_ID_ONETIME_CDL=${results.onetime_cdl_pro_live.price_id}`);
console.log(`STRIPE_PRICE_ID_ONETIME_EXTENSION=${results.onetime_extension_live.price_id}`);
console.log('\nRemove STRIPE_SECRET_KEY_LIVE from .env.local now.');
