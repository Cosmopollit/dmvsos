// Real data analysis for DMVSOS business model evaluation.
// Pulls actual Supabase data + computes patterns. Outputs JSON.
//
// Usage: node scripts/analyze-business.js

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const envFile = readFileSync(join(root, '.env.local'), 'utf8');
const env = (k) => envFile.split('\n').find(l => l.startsWith(k + '='))?.slice(k.length + 1)?.trim();

const SUPA_URL = env('NEXT_PUBLIC_SUPABASE_URL');
const SUPA_KEY = env('SUPABASE_SERVICE_ROLE_KEY');

const H = {
  apikey: SUPA_KEY,
  Authorization: `Bearer ${SUPA_KEY}`,
};

async function sb(path) {
  const res = await fetch(`${SUPA_URL}/rest/v1/${path}`, { headers: H });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
}

async function count(table, filter = '') {
  const res = await fetch(`${SUPA_URL}/rest/v1/${table}?select=${filter.includes('select=') ? '' : 'count'}${filter}`, {
    headers: { ...H, Prefer: 'count=exact', Range: '0-0' },
  });
  const range = res.headers.get('content-range');
  return parseInt(range?.split('/')[1] || '0', 10);
}

const out = {};

console.log('=== 1. Content inventory ===');
out.questions = {};
out.questions.total = await count('questions');
const byLang = await sb('questions?select=language&limit=200000');
out.questions.byLang = byLang.reduce((acc, r) => { acc[r.language] = (acc[r.language] || 0) + 1; return acc; }, {});
const byCat = await sb('questions?select=category&limit=200000');
out.questions.byCategory = byCat.reduce((acc, r) => { acc[r.category] = (acc[r.category] || 0) + 1; return acc; }, {});
const byState = await sb('questions?select=state&limit=200000');
out.questions.byState = byState.reduce((acc, r) => { acc[r.state] = (acc[r.state] || 0) + 1; return acc; }, {});
out.questions.statesCount = Object.keys(out.questions.byState).length;
console.log(`  Total questions: ${out.questions.total.toLocaleString()}`);
console.log(`  Languages: ${Object.entries(out.questions.byLang).map(([k,v]) => `${k}:${v}`).join(', ')}`);
console.log(`  States: ${out.questions.statesCount}`);

console.log('\n=== 2. User cohort ===');
const usersResp = await fetch(`${SUPA_URL}/auth/v1/admin/users?per_page=1000`, { headers: H });
const users = (await usersResp.json()).users || [];
out.users = {
  total: users.length,
  withLastSignIn: users.filter(u => u.last_sign_in_at).length,
  byMonth: {},
  activeLast30d: 0,
  activeLast7d: 0,
};
const now = Date.now();
const dayMs = 86400000;
users.forEach(u => {
  const created = u.created_at?.slice(0, 7);
  if (created) out.users.byMonth[created] = (out.users.byMonth[created] || 0) + 1;
  const lastSeen = u.last_sign_in_at ? new Date(u.last_sign_in_at).getTime() : 0;
  if (lastSeen > now - 30 * dayMs) out.users.activeLast30d++;
  if (lastSeen > now - 7 * dayMs) out.users.activeLast7d++;
});
console.log(`  Total users: ${out.users.total}`);
console.log(`  Active last 7d: ${out.users.activeLast7d}, last 30d: ${out.users.activeLast30d}`);
console.log(`  By signup month:`, out.users.byMonth);

console.log('\n=== 3. Test sessions ===');
const sessions = await sb('test_sessions?select=*&limit=10000');
out.sessions = { total: sessions.length };
if (sessions.length) {
  // Score distribution
  const buckets = { '0-30%': 0, '30-50%': 0, '50-70%': 0, '70-85%': 0, '85-100%': 0 };
  sessions.forEach(s => {
    const pct = s.total > 0 ? (s.score / s.total) * 100 : 0;
    if (pct < 30) buckets['0-30%']++;
    else if (pct < 50) buckets['30-50%']++;
    else if (pct < 70) buckets['50-70%']++;
    else if (pct < 85) buckets['70-85%']++;
    else buckets['85-100%']++;
  });
  out.sessions.scoreDistribution = buckets;

  // Top states/categories/langs from test usage
  const sessByState = sessions.reduce((a, s) => { a[s.state] = (a[s.state] || 0) + 1; return a; }, {});
  const sessByCat = sessions.reduce((a, s) => { a[s.category] = (a[s.category] || 0) + 1; return a; }, {});
  const sessByLang = sessions.reduce((a, s) => { a[s.lang || 'unknown'] = (a[s.lang || 'unknown'] || 0) + 1; return a; }, {});

  out.sessions.byState = Object.entries(sessByState).sort((a,b)=>b[1]-a[1]).slice(0, 10);
  out.sessions.byCategory = sessByCat;
  out.sessions.byLang = sessByLang;

  // Average score
  const totalScore = sessions.reduce((s, x) => s + (x.score / Math.max(x.total, 1)), 0);
  out.sessions.avgScore = (totalScore / sessions.length * 100).toFixed(1) + '%';

  // Sessions per unique user
  const userIdCounts = sessions.reduce((a, s) => { a[s.user_id] = (a[s.user_id] || 0) + 1; return a; }, {});
  const sessPerUser = Object.values(userIdCounts);
  out.sessions.uniqueTesters = sessPerUser.length;
  out.sessions.avgSessionsPerUser = (sessions.length / sessPerUser.length).toFixed(1);
  out.sessions.maxSessionsByUser = Math.max(...sessPerUser);

  console.log(`  Total sessions: ${sessions.length}`);
  console.log(`  Unique testers: ${out.sessions.uniqueTesters}`);
  console.log(`  Avg sessions/user: ${out.sessions.avgSessionsPerUser}`);
  console.log(`  Avg score: ${out.sessions.avgScore}`);
  console.log(`  Score distribution:`, buckets);
  console.log(`  Top states:`, out.sessions.byState.slice(0, 5));
}

console.log('\n=== 4. Purchases ===');
const purchases = await sb('purchases?select=*');
out.purchases = {
  total: purchases.length,
  totalRevenueCents: purchases.reduce((s, p) => s + p.amount_cents - (p.refunded_at ? p.amount_cents : 0), 0),
  byKind: purchases.reduce((a, p) => { a[p.kind] = (a[p.kind] || 0) + 1; return a; }, {}),
  byPassType: purchases.reduce((a, p) => { a[p.pass_type] = (a[p.pass_type] || 0) + 1; return a; }, {}),
};
out.purchases.totalRevenueUsd = (out.purchases.totalRevenueCents / 100).toFixed(2);
console.log(`  Total purchases: ${out.purchases.total}`);
console.log(`  Total revenue: $${out.purchases.totalRevenueUsd}`);

console.log('\n=== 5. Active passes ===');
out.activePasses = {
  total: await count('active_passes'),
};
const activeRows = await sb('active_passes?select=pass_type,expires_at');
const nowDate = new Date();
out.activePasses.currentlyActive = activeRows.filter(a => new Date(a.expires_at) > nowDate).length;
out.activePasses.byType = activeRows.reduce((a, r) => { a[r.pass_type] = (a[r.pass_type] || 0) + 1; return a; }, {});
console.log(`  Total active_passes rows: ${out.activePasses.total}, currently valid: ${out.activePasses.currentlyActive}`);

console.log('\n=== 6. Conversion funnel (cohort-based) ===');
out.funnel = {
  visitorsWeek: 485, // From Vercel Analytics 2026-05-13
  signupsLast7d: out.users.activeLast7d,
  testSessionsLast7d: sessions.filter(s => new Date(s.created_at) > new Date(now - 7 * dayMs)).length,
  purchasesLast7d: purchases.filter(p => new Date(p.purchased_at) > new Date(now - 7 * dayMs)).length,
};
out.funnel.visitorToSignupPct = ((out.funnel.signupsLast7d / out.funnel.visitorsWeek) * 100).toFixed(2) + '%';
out.funnel.visitorToPurchasePct = ((out.funnel.purchasesLast7d / out.funnel.visitorsWeek) * 100).toFixed(2) + '%';

console.log(`  Visitors / 7d: ${out.funnel.visitorsWeek}`);
console.log(`  Test sessions / 7d: ${out.funnel.testSessionsLast7d}`);
console.log(`  Signups / 7d: ${out.funnel.signupsLast7d}`);
console.log(`  Purchases / 7d: ${out.funnel.purchasesLast7d}`);
console.log(`  Visitor→Signup: ${out.funnel.visitorToSignupPct}`);
console.log(`  Visitor→Purchase: ${out.funnel.visitorToPurchasePct}`);

const outPath = join(root, 'analysis-data.json');
writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(`\nSaved to ${outPath}`);
