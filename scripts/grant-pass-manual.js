#!/usr/bin/env node
/**
 * Manually grant an active_pass to a user by email.
 * Use when Stripe charge succeeded but our webhook didn't process
 * (e.g., user paid without being logged in).
 *
 * Creates Supabase auth.users entry if missing, inserts active_pass,
 * and sends a magic-link login email by default (so newly created users
 * can actually sign in — they have no password/OAuth identity yet).
 *
 * Usage:
 *   node scripts/grant-pass-manual.js --email=foo@bar.com --pass=auto
 *   node scripts/grant-pass-manual.js --email=foo@bar.com --pass=moto --days=30
 *   node scripts/grant-pass-manual.js --email=foo@bar.com --pass=cdl --no-magic-link
 *
 * --pass:           moto | auto | cdl | extension
 * --days:           defaults to 30
 * --no-magic-link:  skip the magic-link email (default is to send)
 *
 * Core logic lives in lib/grant-pass.js — this script is a thin CLI wrapper.
 */

'use strict';

const fs = require('fs');
const path = require('path');

try {
  const txt = fs.readFileSync('.env.local', 'utf8');
  for (const line of txt.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch (_) {}

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) { console.error('Missing SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }

const args = process.argv.slice(2);
const argVal = (k) => args.find(a => a.startsWith(`--${k}=`))?.split('=')[1];
const EMAIL = (argVal('email') || '').toLowerCase().trim();
const PASS = argVal('pass');
const DAYS = parseInt(argVal('days') || '30', 10);
const SEND_MAGIC = !args.includes('--no-magic-link');

if (!EMAIL || !['moto', 'auto', 'cdl', 'extension'].includes(PASS)) {
  console.error('Usage: --email=X --pass=moto|auto|cdl|extension [--days=30] [--no-magic-link]');
  process.exit(1);
}

(async () => {
  // lib/grant-pass.js is an ES module — load via dynamic import from a CJS script.
  const libPath = path.resolve(__dirname, '../lib/grant-pass.js');
  const { grantPass } = await import(libPath);

  console.log(`\n=== Manual pass grant ===`);
  console.log(`Email: ${EMAIL}  Pass: ${PASS}  Days: ${DAYS}`);

  const result = await grantPass({
    email: EMAIL,
    passType: PASS,
    days: DAYS,
    sendMagicLink: SEND_MAGIC,
  });

  console.log(`${result.userCreated ? 'Created' : 'Found'} user: ${result.userId}`);
  console.log(`Active pass set: ${result.passType} until ${result.expiresAt}`);
  console.log(`Purchase row logged`);
  console.log(`Profile upserted: ${result.email} (is_pro=true, plan_type=${result.passType})`);

  if (SEND_MAGIC) {
    if (result.magicLink && typeof result.magicLink === 'string') {
      console.log(`Magic link sent to ${result.email}`);
      console.log(`  Action URL (for testing): ${result.magicLink}`);
    } else if (result.magicLink?.error) {
      console.warn(`Magic link FAILED (non-fatal): ${result.magicLink.error}`);
    }
  } else {
    console.log(`\nSkipped magic-link email (--no-magic-link). User has no identity yet — they must use OAuth or "Forgot password" to sign in.`);
  }

  console.log(`\nDone. ${result.email} now has ${result.passType} pass until ${result.expiresAt.slice(0, 10)}.`);
})().catch(err => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
