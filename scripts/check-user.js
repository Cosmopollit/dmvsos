#!/usr/bin/env node
/**
 * Diagnose a user's Pro/access state by email — read-only, no writes.
 *
 * Shows every auth.users row sharing the email (id, confirmed, providers),
 * their active_passes (type + expiry), the legacy profiles row, and a
 * verdict that mirrors AuthContext: whether the user is Pro now, and
 * whether they'd be Pro via the legacy fallback.
 *
 * Usage:
 *   node scripts/check-user.js --email=foo@bar.com
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
if (!SUPA_URL || !SUPA_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (set in .env.local).');
  process.exit(1);
}

const args = process.argv.slice(2);
const argVal = (k) => args.find(a => a.startsWith(`--${k}=`))?.split('=')[1];
const EMAIL = (argVal('email') || '').toLowerCase().trim();

if (!EMAIL) {
  console.error('Usage: node scripts/check-user.js --email=foo@bar.com');
  process.exit(1);
}

const H = { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY, 'Content-Type': 'application/json' };

// Mirrors lib/AuthContext.js LEGACY_PLAN_GRANTS (post-fix). Used to report
// whether the legacy fallback would grant access for this profile.
const LEGACY_PLAN_GRANTS = {
  auto: { car: true }, moto: { moto: true }, cdl: { cdl: true },
  car_pass: { car: true }, moto_pass: { moto: true }, cdl_pass: { cdl: true },
  quick_pass: { car: true, moto: true, cdl: true },
  full_prep: { car: true, moto: true, cdl: true },
  guaranteed_pass: { car: true, moto: true, cdl: true },
};
// The OLD (pre-fix) map — to show whether the bug is what's biting this user.
const LEGACY_PLAN_GRANTS_OLD = {
  car_pass: { car: true }, moto_pass: { moto: true }, cdl_pass: { cdl: true },
  quick_pass: { car: true, moto: true, cdl: true },
  full_prep: { car: true, moto: true, cdl: true },
  guaranteed_pass: { car: true, moto: true, cdl: true },
};

async function listAllUsersWithEmail(email) {
  const matches = [];
  for (let page = 1; page <= 50; page++) {
    const res = await fetch(`${SUPA_URL}/auth/v1/admin/users?page=${page}&per_page=200`, { headers: H });
    if (!res.ok) { console.warn(`listUsers page ${page}: ${res.status}`); break; }
    const data = await res.json();
    const users = data.users || [];
    for (const u of users) {
      if ((u.email || '').toLowerCase() === email) matches.push(u);
    }
    if (users.length < 200) break;
  }
  return matches;
}

async function activePassesFor(userIds) {
  if (userIds.length === 0) return [];
  const res = await fetch(
    `${SUPA_URL}/rest/v1/active_passes?select=user_id,pass_type,expires_at&user_id=in.(${userIds.join(',')})`,
    { headers: H }
  );
  return res.ok ? res.json() : [];
}

async function testSessionsFor(userIds) {
  if (userIds.length === 0) return [];
  const res = await fetch(
    `${SUPA_URL}/rest/v1/test_sessions?select=state,category,score,total,lang,created_at,user_id&user_id=in.(${userIds.join(',')})&order=created_at.desc&limit=25`,
    { headers: H }
  );
  return res.ok ? res.json() : [];
}

async function legacyProfile(email) {
  const res = await fetch(
    `${SUPA_URL}/rest/v1/profiles?select=email,is_pro,plan_type,plan_expires_at,stripe_customer_id&email=ilike.${encodeURIComponent(email)}&limit=1`,
    { headers: H }
  );
  if (!res.ok) return null;
  const rows = await res.json();
  return rows?.[0] || null;
}

function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d);
  return isNaN(dt) ? String(d) : dt.toISOString().slice(0, 16).replace('T', ' ');
}

(async () => {
  console.log(`\n=== check-user: ${EMAIL} ===\n`);
  const now = new Date();

  // 1) auth.users rows
  const users = await listAllUsersWithEmail(EMAIL);
  if (users.length === 0) {
    console.log('AUTH USERS: none found with this email.');
    console.log('→ He has never signed up / no account exists for this exact address.');
    console.log('  (Check the exact spelling, or he may use a different email to sign in.)\n');
  } else {
    console.log(`AUTH USERS (${users.length}):`);
    for (const u of users) {
      const providers = (u.identities || []).map(i => i.provider).join(', ') || (u.app_metadata?.provider) || 'email';
      console.log(`  • id=${u.id}`);
      console.log(`    created=${fmtDate(u.created_at)}  confirmed=${u.email_confirmed_at ? fmtDate(u.email_confirmed_at) : 'NO ❗'}  last_login=${fmtDate(u.last_sign_in_at)}`);
      console.log(`    providers=[${providers}]  source=${u.user_metadata?.source || '—'}`);
    }
    console.log('');
  }

  const ids = users.map(u => u.id);

  // 2) active_passes
  const passes = await activePassesFor(ids);
  console.log(`ACTIVE_PASSES (${passes.length}):`);
  let anyLivePass = false;
  if (passes.length === 0) {
    console.log('  (none) — no pass rows for any of these user_ids ❗');
  } else {
    for (const p of passes) {
      const exp = new Date(p.expires_at);
      const live = exp > now;
      if (live) anyLivePass = true;
      console.log(`  • ${p.pass_type.padEnd(5)} expires=${fmtDate(p.expires_at)}  ${live ? 'ACTIVE ✅' : 'EXPIRED ❌'}  user_id=${p.user_id}`);
    }
  }
  console.log('');

  // 2b) test_sessions (his results)
  const sessions = await testSessionsFor(ids);
  console.log(`TEST RESULTS (${sessions.length}, latest first):`);
  if (sessions.length === 0) {
    console.log('  (none) — he has not completed any test that got saved.');
  } else {
    for (const s of sessions) {
      const pct = s.total ? Math.round((s.score / s.total) * 100) : 0;
      const pass = pct >= 80; // typical DMV passing bar
      console.log(`  • ${fmtDate(s.created_at)}  ${String(s.state || '?').padEnd(14)} ${String(s.category || '?').padEnd(10)} ${s.lang || '?'}  ${s.score}/${s.total} (${pct}%) ${pass ? '✅' : '❌'}`);
    }
  }
  console.log('');

  // 3) legacy profile
  const prof = await legacyProfile(EMAIL);
  console.log('LEGACY PROFILE:');
  if (!prof) {
    console.log('  (none)');
  } else {
    const exp = prof.plan_expires_at ? new Date(prof.plan_expires_at) : null;
    const live = exp && exp > now;
    console.log(`  is_pro=${prof.is_pro}  plan_type=${prof.plan_type || '—'}  plan_expires_at=${fmtDate(prof.plan_expires_at)}  ${exp ? (live ? 'ACTIVE ✅' : 'EXPIRED ❌') : ''}`);
    console.log(`  stripe_customer_id=${prof.stripe_customer_id || '—'}`);
  }
  console.log('');

  // 4) Verdict mirroring AuthContext
  console.log('=== VERDICT (mirrors AuthContext) ===');
  const livePassTypes = passes.filter(p => new Date(p.expires_at) > now).map(p => p.pass_type);
  const proFromPasses = livePassTypes.some(t => ['auto', 'moto', 'cdl'].includes(t));

  if (proFromPasses) {
    console.log(`✅ PRO via active_passes (${[...new Set(livePassTypes)].join(', ')}).`);
    console.log('   This path works on the CURRENT production code — no deploy needed.');
    console.log('   If he still sees a lock, he is signed in under a DIFFERENT email/user_id');
    console.log('   than the ones above. Have him log in via Google with EXACTLY ' + EMAIL + '.');
  } else if (prof && prof.plan_expires_at && new Date(prof.plan_expires_at) > now) {
    const pt = prof.plan_type;
    const newGrant = LEGACY_PLAN_GRANTS[pt];
    const oldGrant = LEGACY_PLAN_GRANTS_OLD[pt];
    if (newGrant && !oldGrant) {
      console.log(`⚠️  PRO only via legacy fallback, plan_type="${pt}".`);
      console.log('   ❌ OLD production code does NOT recognize this value → lock shows (THIS IS THE BUG).');
      console.log('   ✅ After deploying the LEGACY_PLAN_GRANTS fix, he will be Pro.');
      console.log('   → Merge the PR / deploy, then have him reload (logged in with ' + EMAIL + ').');
    } else if (newGrant) {
      console.log(`✅ PRO via legacy fallback, plan_type="${pt}" (recognized by old & new code).`);
      console.log('   If he still sees a lock, he is signed in under a different email.');
    } else {
      console.log(`❓ legacy profile alive but plan_type="${pt}" is unknown to BOTH maps.`);
      console.log('   Needs a re-grant with a valid pass type (auto/moto/cdl).');
    }
  } else {
    console.log('❌ NOT PRO by any path: no live pass and no live legacy profile.');
    console.log('   → The pass was never granted, or it expired. Re-grant with:');
    console.log(`      node scripts/grant-pass-manual.js --email=${EMAIL} --pass=auto --days=30`);
  }
  console.log('');
})();
