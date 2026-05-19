#!/usr/bin/env node
/**
 * Manually grant an active_pass to a user by email.
 * Use when Stripe charge succeeded but our webhook didn't process
 * (e.g., user paid without being logged in).
 *
 * Creates Supabase auth.users entry if missing, inserts active_pass,
 * and optionally sends a magic-link login email.
 *
 * Usage:
 *   node scripts/grant-pass-manual.js --email=foo@bar.com --pass=auto
 *   node scripts/grant-pass-manual.js --email=foo@bar.com --pass=moto --days=30
 *   node scripts/grant-pass-manual.js --email=foo@bar.com --pass=cdl --send-magic-link
 *
 * --pass:  moto | auto | cdl | extension
 * --days:  defaults to 30
 */

'use strict';

const fs = require('fs');

try {
  const txt = fs.readFileSync('.env.local', 'utf8');
  for (const line of txt.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch (_) {}

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPA_KEY) { console.error('Missing SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }

const args = process.argv.slice(2);
const argVal = (k) => args.find(a => a.startsWith(`--${k}=`))?.split('=')[1];
const EMAIL = (argVal('email') || '').toLowerCase().trim();
const PASS = argVal('pass');
const DAYS = parseInt(argVal('days') || '30', 10);
const SEND_MAGIC = args.includes('--send-magic-link');

if (!EMAIL || !['moto', 'auto', 'cdl', 'extension'].includes(PASS)) {
  console.error('Usage: --email=X --pass=moto|auto|cdl|extension [--days=30] [--send-magic-link]');
  process.exit(1);
}

const H = { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY, 'Content-Type': 'application/json' };

async function getOrCreateUser(email) {
  // Look up by email — admin API supports filter
  const search = await fetch(`${SUPA_URL}/auth/v1/admin/users?per_page=1000`, { headers: H }).then(r => r.json());
  const found = (search.users || []).find(u => (u.email || '').toLowerCase() === email);
  if (found) {
    console.log(`Found existing user: ${found.id} (created ${found.created_at})`);
    return found;
  }
  // Create
  const res = await fetch(`${SUPA_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({
      email,
      email_confirm: true, // auto-confirm so they can magic-link in immediately
      user_metadata: { source: 'manual_grant', granted_at: new Date().toISOString() },
    }),
  });
  if (!res.ok) throw new Error(`create user: ${res.status} ${await res.text()}`);
  const user = await res.json();
  console.log(`Created new user: ${user.id}`);
  return user;
}

async function insertActivePass(userId, passType, expiresAt) {
  const res = await fetch(`${SUPA_URL}/rest/v1/active_passes`, {
    method: 'POST',
    headers: { ...H, Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ user_id: userId, pass_type: passType, expires_at: expiresAt }),
  });
  if (!res.ok) throw new Error(`active_pass: ${res.status} ${await res.text()}`);
  console.log(`Active pass set: ${passType} until ${expiresAt}`);
}

async function insertPurchase({ userId, email, passType, kind, amountCents, newExpiresAt }) {
  const res = await fetch(`${SUPA_URL}/rest/v1/purchases`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({
      user_id: userId,
      email,
      pass_type: passType,
      kind,
      amount_cents: amountCents,
      currency: 'usd',
      stripe_payment_intent: 'manual_grant_' + Date.now(),
      new_expires_at: newExpiresAt, // required by schema
    }),
  });
  if (!res.ok) {
    console.warn(`purchase row failed (non-fatal): ${res.status} ${await res.text()}`);
  } else {
    console.log(`Purchase row logged`);
  }
}

async function syncProfile(email, passType, expiresAt) {
  // UPSERT via Prefer: resolution=merge-duplicates (email has unique constraint).
  // The old PATCH-then-fallback-POST pattern was buggy: PostgREST returns 200
  // for PATCH even when 0 rows match, so the fallback INSERT never fired.
  const res = await fetch(`${SUPA_URL}/rest/v1/profiles`, {
    method: 'POST',
    headers: { ...H, Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({ email, is_pro: true, plan_type: passType, plan_expires_at: expiresAt }),
  });
  if (!res.ok) throw new Error(`profile upsert: ${res.status} ${await res.text()}`);
  const rows = await res.json();
  console.log(`Profile upserted: ${rows[0]?.email || email} (is_pro=true, plan_type=${passType})`);
}

async function sendMagicLink(email) {
  // Supabase Auth generate magic link via admin API
  const res = await fetch(`${SUPA_URL}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ type: 'magiclink', email }),
  });
  if (!res.ok) throw new Error(`magic-link: ${res.status} ${await res.text()}`);
  const data = await res.json();
  // Supabase's `generate_link` returns the URL but ALSO sends the email automatically
  console.log(`Magic link generated. Email sent to ${email}`);
  console.log(`  Action URL (for testing): ${data.action_link || data.properties?.action_link || '?'}`);
}

(async () => {
  console.log(`\n=== Manual pass grant ===`);
  console.log(`Email: ${EMAIL}  Pass: ${PASS}  Days: ${DAYS}`);

  const user = await getOrCreateUser(EMAIL);
  const expiresAt = new Date(Date.now() + DAYS * 86400000).toISOString();

  // For 'extension', map to actual pass type if user has one. Otherwise treat as 'auto' default.
  let passType = PASS;
  if (PASS === 'extension') {
    const existing = await fetch(`${SUPA_URL}/rest/v1/active_passes?user_id=eq.${user.id}&select=*`, { headers: H }).then(r => r.json());
    if (existing.length > 0) {
      passType = existing[0].pass_type;
      console.log(`Extension: matched existing pass_type=${passType}`);
    } else {
      passType = 'auto';
      console.log(`Extension: no existing pass, defaulting to auto`);
    }
  }

  await insertActivePass(user.id, passType, expiresAt);
  const amountMap = { moto: 1999, auto: 2999, cdl: 4999, extension: 999 };
  await insertPurchase({
    userId: user.id, email: EMAIL, passType,
    kind: PASS === 'extension' ? 'extension' : 'new',
    amountCents: amountMap[PASS] || 0,
    newExpiresAt: expiresAt,
  });
  await syncProfile(EMAIL, passType, expiresAt);

  if (SEND_MAGIC) {
    await sendMagicLink(EMAIL);
  } else {
    console.log(`\nSkipped magic-link email. Add --send-magic-link to send the login email.`);
  }

  console.log(`\nDone. ${EMAIL} now has ${passType} pass until ${expiresAt.slice(0, 10)}.`);
})();
