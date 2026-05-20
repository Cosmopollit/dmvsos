#!/usr/bin/env node
/**
 * Pull user-behavior data from Supabase and compute the funnel.
 *
 * Funnel stages we can measure from DB:
 *   1. Signup     — row in auth.users
 *   2. Activity   — last_sign_in_at within 30d  (proxy for active)
 *   3. Engagement — any row in test_sessions   (took at least one quiz)
 *   4. Repeat     — >= 3 rows in test_sessions
 *   5. Conversion — row in purchases OR active_passes
 *
 * Things we can NOT measure from DB (need GA/Vercel):
 *   • Anonymous visitors (no row created until signup)
 *   • Time on page / scroll depth
 *   • Where they drop off inside a single test
 *
 * Usage:
 *   node scripts/analytics-deep-dive.js
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
const H = { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY };

const now = Date.now();
const D7 = new Date(now - 7 * 86400 * 1000).toISOString();
const D30 = new Date(now - 30 * 86400 * 1000).toISOString();
const D90 = new Date(now - 90 * 86400 * 1000).toISOString();

function pct(num, den) {
  if (!den) return '0%';
  return ((num / den) * 100).toFixed(1) + '%';
}

async function count(path) {
  const r = await fetch(SUPA_URL + path, {
    headers: { ...H, Prefer: 'count=exact', Range: '0-0' },
  });
  const cr = r.headers.get('content-range') || '0';
  return parseInt(cr.split('/')[1] || '0', 10);
}

async function rows(path, limit = 1000) {
  const r = await fetch(SUPA_URL + path + (path.includes('?') ? '&' : '?') + `limit=${limit}`, {
    headers: H,
  });
  return r.ok ? r.json() : [];
}

async function authUsers() {
  // auth.users is queried via the admin endpoint
  const r = await fetch(SUPA_URL + '/auth/v1/admin/users?per_page=1000', { headers: H });
  return r.ok ? (await r.json()).users || [] : [];
}

(async () => {
  console.log('=== DMVSOS ANALYTICS DEEP DIVE ===');
  console.log('Generated:', new Date().toISOString());
  console.log('');

  // ── 1. Auth users ───────────────────────────────────────────────────────
  const users = await authUsers();
  const usersTotal = users.length;
  const users7d = users.filter(u => u.created_at && u.created_at > D7).length;
  const users30d = users.filter(u => u.created_at && u.created_at > D30).length;
  const usersActive7d = users.filter(u => u.last_sign_in_at && u.last_sign_in_at > D7).length;
  const usersActive30d = users.filter(u => u.last_sign_in_at && u.last_sign_in_at > D30).length;
  const usersNeverLoggedIn = users.filter(u => !u.last_sign_in_at).length;

  console.log('## 1. SIGNUPS / AUTH');
  console.log(`Total signups all time      : ${usersTotal}`);
  console.log(`Signups in last 7 days      : ${users7d}`);
  console.log(`Signups in last 30 days     : ${users30d}`);
  console.log(`Active in last 7 days       : ${usersActive7d}  (${pct(usersActive7d, usersTotal)} of total)`);
  console.log(`Active in last 30 days      : ${usersActive30d}  (${pct(usersActive30d, usersTotal)} of total)`);
  console.log(`Never logged in after signup: ${usersNeverLoggedIn}  (${pct(usersNeverLoggedIn, usersTotal)})`);
  console.log('');

  // Login providers (Google/Apple/etc.)
  const providerCount = {};
  for (const u of users) {
    const p = u.app_metadata?.provider || 'email';
    providerCount[p] = (providerCount[p] || 0) + 1;
  }
  console.log('Signup providers:');
  for (const [p, n] of Object.entries(providerCount).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${p.padEnd(15)} ${n}  (${pct(n, usersTotal)})`);
  }
  console.log('');

  // ── 2. Engagement (test_sessions) ───────────────────────────────────────
  const sessionsTotal = await count('/rest/v1/test_sessions?select=id');
  const sessions7d = await count('/rest/v1/test_sessions?select=id&created_at=gt.' + D7);
  const sessions30d = await count('/rest/v1/test_sessions?select=id&created_at=gt.' + D30);

  // Distinct users who took at least one test
  const sessionRows = await rows('/rest/v1/test_sessions?select=user_id,state,category,score,total,lang,created_at&order=created_at.desc', 5000);
  const userTestCount = {};
  for (const s of sessionRows) {
    userTestCount[s.user_id] = (userTestCount[s.user_id] || 0) + 1;
  }
  const distinctTestTakers = Object.keys(userTestCount).length;
  const repeatTestTakers = Object.values(userTestCount).filter(n => n >= 3).length;
  const heavyTestTakers = Object.values(userTestCount).filter(n => n >= 10).length;

  console.log('## 2. ENGAGEMENT (test_sessions)');
  console.log(`Total tests taken                : ${sessionsTotal}`);
  console.log(`Tests in last 7 days             : ${sessions7d}`);
  console.log(`Tests in last 30 days            : ${sessions30d}`);
  console.log(`Distinct users who took >=1 test : ${distinctTestTakers}  (${pct(distinctTestTakers, usersTotal)} of signups)`);
  console.log(`Distinct users who took >=3 tests: ${repeatTestTakers}  (${pct(repeatTestTakers, distinctTestTakers)} of testers)`);
  console.log(`Heavy users (10+ tests)          : ${heavyTestTakers}  (${pct(heavyTestTakers, distinctTestTakers)})`);
  console.log('');

  // Distribution by category
  const byCat = {};
  const byState = {};
  const byLang = {};
  let scoreSum = 0;
  let scoreCount = 0;
  for (const s of sessionRows) {
    byCat[s.category || 'unknown'] = (byCat[s.category || 'unknown'] || 0) + 1;
    byState[s.state || 'unknown'] = (byState[s.state || 'unknown'] || 0) + 1;
    byLang[s.lang || 'unknown'] = (byLang[s.lang || 'unknown'] || 0) + 1;
    if (s.score != null && s.total) {
      scoreSum += (s.score / s.total) * 100;
      scoreCount++;
    }
  }
  console.log('Tests by category:');
  for (const [k, v] of Object.entries(byCat).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(12)} ${v}  (${pct(v, sessionRows.length)})`);
  }
  console.log('');
  console.log('Tests by language:');
  for (const [k, v] of Object.entries(byLang).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(8)} ${v}  (${pct(v, sessionRows.length)})`);
  }
  console.log('');
  console.log('Top 10 states by test volume:');
  const topStates = Object.entries(byState).sort((a, b) => b[1] - a[1]).slice(0, 10);
  for (const [k, v] of topStates) {
    console.log(`  ${k.padEnd(20)} ${v}  (${pct(v, sessionRows.length)})`);
  }
  console.log('');
  console.log(`Average test score (across all sessions): ${(scoreSum / scoreCount).toFixed(1)}%`);
  console.log('');

  // ── 3. Pro / paying users ──────────────────────────────────────────────
  const profiles = await rows('/rest/v1/profiles?select=email,is_pro,plan_type,plan_expires_at,stripe_customer_id&order=plan_expires_at.desc.nullslast', 5000);
  const proUsers = profiles.filter(p => p.is_pro === true);
  const activePassRows = await rows('/rest/v1/active_passes?select=user_id,pass_type,expires_at', 5000);
  const activePassNow = activePassRows.filter(p => new Date(p.expires_at) > new Date());

  const purchasesTotal = await count('/rest/v1/purchases?select=id');
  const purchases7d = await count('/rest/v1/purchases?select=id&created_at=gt.' + D7);
  const purchases30d = await count('/rest/v1/purchases?select=id&created_at=gt.' + D30);
  const purchaseRows = await rows('/rest/v1/purchases?select=amount_cents,plan_type,kind,created_at,refunded_at&order=created_at.desc', 5000);
  const purchasesNotRefunded = purchaseRows.filter(p => !p.refunded_at);
  const revenue = purchasesNotRefunded.reduce((acc, p) => acc + (p.amount_cents || 0), 0) / 100;

  console.log('## 3. PRO / PAYING');
  console.log(`Profiles with is_pro=true       : ${proUsers.length}`);
  console.log(`Currently active passes         : ${activePassNow.length}`);
  console.log(`Total purchase events all time  : ${purchasesTotal}`);
  console.log(`Purchases last 7 days           : ${purchases7d}`);
  console.log(`Purchases last 30 days          : ${purchases30d}`);
  console.log(`Total revenue (net of refunds)  : $${revenue.toFixed(2)}`);
  console.log('');

  // Plan breakdown
  const byPlan = {};
  for (const p of purchasesNotRefunded) {
    byPlan[p.plan_type || 'unknown'] = (byPlan[p.plan_type || 'unknown'] || 0) + 1;
  }
  console.log('Purchases by plan:');
  for (const [k, v] of Object.entries(byPlan).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(20)} ${v}`);
  }
  console.log('');

  // ── 4. Funnel ──────────────────────────────────────────────────────────
  const tookTestRate = distinctTestTakers / usersTotal;
  const repeatRate = repeatTestTakers / distinctTestTakers;
  const paidFromActive = activePassNow.length / usersActive30d;
  const paidFromTesters = activePassNow.length / distinctTestTakers;
  const paidFromTotal = activePassNow.length / usersTotal;

  console.log('## 4. FUNNEL');
  console.log(`Signup → took >=1 test  : ${pct(distinctTestTakers, usersTotal)}  (${distinctTestTakers}/${usersTotal})`);
  console.log(`Tester → repeat tester  : ${pct(repeatTestTakers, distinctTestTakers)}  (${repeatTestTakers}/${distinctTestTakers})`);
  console.log(`Active30d → currently paid: ${pct(activePassNow.length, usersActive30d)}`);
  console.log(`Any tester → paid       : ${pct(activePassNow.length, distinctTestTakers)}`);
  console.log(`Any signup → paid       : ${pct(activePassNow.length, usersTotal)}`);
  console.log('');

  // ── 5. Insights ────────────────────────────────────────────────────────
  console.log('## 5. WHAT THE NUMBERS SUGGEST');
  console.log('');
  const insights = [];

  if (usersNeverLoggedIn / usersTotal > 0.3) {
    insights.push(`⚠️  ${pct(usersNeverLoggedIn, usersTotal)} of signups never logged in again — onboarding/activation problem.`);
  }
  if (distinctTestTakers / usersTotal < 0.5) {
    insights.push(`⚠️  Only ${pct(distinctTestTakers, usersTotal)} of signups ever took a test — friction between signup and /test landing.`);
  }
  if (repeatTestTakers / distinctTestTakers < 0.3) {
    insights.push(`⚠️  Only ${pct(repeatTestTakers, distinctTestTakers)} of testers came back for a 3rd test — re-engagement problem.`);
  }
  if (paidFromTesters < 0.1) {
    insights.push(`⚠️  Conversion tester→paid is ${pct(activePassNow.length, distinctTestTakers)} — paywall placement or pricing.`);
  }
  if (activePassNow.length === 0) {
    insights.push(`🔴 ZERO currently active paid passes. Check Stripe webhook + active_passes write path.`);
  }

  for (const ins of insights) console.log(ins);
  if (insights.length === 0) {
    console.log('Numbers look healthy across the board.');
  }
  console.log('');

  console.log('=== END ===');
})();
