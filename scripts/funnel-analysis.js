// Funnel drop-off analysis for DMVSOS.
// Pulls real Supabase data and reconstructs the funnel:
//   Visitors → Signups → Test starts → Test completes → Upgrade click → Purchase
//
// Outputs per-step drop-off, time-to-action, and top abandonment patterns.
//
// Usage: node scripts/funnel-analysis.js [--days=7] [--json]

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const envFile = readFileSync(join(root, '.env.local'), 'utf8');
const env = (k) => envFile.split('\n').find(l => l.startsWith(k + '='))?.slice(k.length + 1)?.trim();

const SUPA_URL = env('NEXT_PUBLIC_SUPABASE_URL');
const SUPA_KEY = env('SUPABASE_SERVICE_ROLE_KEY');

const args = process.argv.slice(2);
const daysArg = parseInt(args.find(a => a.startsWith('--days='))?.split('=')[1] || '7', 10);
const asJson = args.includes('--json');

const H = { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` };

const dayMs = 86400000;
const sinceMs = Date.now() - daysArg * dayMs;
const sinceISO = new Date(sinceMs).toISOString();

async function sb(path) {
  const res = await fetch(`${SUPA_URL}/rest/v1/${path}`, { headers: H });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

function pct(a, b) {
  if (!b) return '–';
  return ((a / b) * 100).toFixed(2) + '%';
}

function log(...x) { if (!asJson) console.log(...x); }

// ── 1. Visitors (manual entry from Vercel Analytics — auto if Plausible) ──
// TODO: hook Vercel Analytics API once token is available.
// For now we estimate from the most recent value or accept --visitors override.
const visitorsArg = parseInt(args.find(a => a.startsWith('--visitors='))?.split('=')[1] || '0', 10);
const VISITORS_FALLBACK = 485; // From 2026-05-13 Vercel Analytics
const visitors = visitorsArg || VISITORS_FALLBACK;

// ── 2. Signups in window ──
log(`\nAnalyzing last ${daysArg} days (since ${sinceISO.slice(0, 10)})\n`);

const usersResp = await fetch(`${SUPA_URL}/auth/v1/admin/users?per_page=1000`, { headers: H });
const allUsers = (await usersResp.json()).users || [];
const newUsers = allUsers.filter(u => u.created_at > sinceISO);
const confirmedUsers = newUsers.filter(u => u.email_confirmed_at);

// ── 3. Test sessions in window ──
const sessions = await sb(`test_sessions?created_at=gte.${sinceISO}&select=user_id,score,total,state,category,lang,created_at`);
const uniqueTesters = new Set(sessions.map(s => s.user_id)).size;
const completedSessions = sessions.filter(s => s.total > 0 && s.score != null);
const passingScore = completedSessions.filter(s => (s.score / s.total) >= 0.8).length;

// Sessions that hit/exceeded the 20-Q free wall
const hitFreeWall = completedSessions.filter(s => s.total >= 20).length;

// ── 4. Purchases in window ──
const purchases = await sb(`purchases?purchased_at=gte.${sinceISO}&select=user_id,amount_cents,kind,pass_type,refunded_at,purchased_at`);
const paid = purchases.filter(p => !p.refunded_at);
const uniqueBuyers = new Set(paid.map(p => p.user_id)).size;
const revenueCents = paid.reduce((s, p) => s + p.amount_cents, 0);

// ── 5. Build funnel ──
const steps = [
  { name: 'Visitor',         count: visitors,                   note: '(from Vercel Analytics)' },
  { name: 'Signup',          count: newUsers.length },
  { name: 'Email confirmed', count: confirmedUsers.length },
  { name: 'Test started',    count: uniqueTesters },
  { name: 'Test completed',  count: completedSessions.length, distinct: 'sessions' },
  { name: 'Hit 20-Q wall',   count: hitFreeWall, distinct: 'sessions' },
  { name: 'Purchase',        count: uniqueBuyers },
];

// ── 6. Time-to-purchase ──
const userCreatedMap = Object.fromEntries(allUsers.map(u => [u.id, u.created_at]));
const timeToBuyHrs = paid
  .map(p => {
    const created = userCreatedMap[p.user_id];
    if (!created) return null;
    return (new Date(p.purchased_at) - new Date(created)) / 3600000;
  })
  .filter(x => x != null && x >= 0)
  .sort((a, b) => a - b);

const median = timeToBuyHrs.length ? timeToBuyHrs[Math.floor(timeToBuyHrs.length / 2)].toFixed(1) : '–';
const p25 = timeToBuyHrs.length ? timeToBuyHrs[Math.floor(timeToBuyHrs.length * 0.25)].toFixed(1) : '–';
const p75 = timeToBuyHrs.length ? timeToBuyHrs[Math.floor(timeToBuyHrs.length * 0.75)].toFixed(1) : '–';

// ── 7. Drop-off & abandonment patterns ──
const dropoffs = [];
for (let i = 1; i < steps.length; i++) {
  const prev = steps[i - 1].count;
  const curr = steps[i].count;
  if (prev === 0) continue;
  const lost = prev - curr;
  const lostPct = (lost / prev) * 100;
  dropoffs.push({
    from: steps[i - 1].name,
    to: steps[i].name,
    lost,
    lostPct: lostPct.toFixed(1) + '%',
    severity: lostPct > 80 ? 'CRITICAL' : lostPct > 50 ? 'HIGH' : lostPct > 25 ? 'MEDIUM' : 'OK',
  });
}

// Top abandonment buckets — by state/category/lang on incomplete sessions
const incomplete = completedSessions.filter(s => (s.score / s.total) < 0.5);
const incByState = {};
const incByCategory = {};
const incByLang = {};
for (const s of incomplete) {
  incByState[s.state] = (incByState[s.state] || 0) + 1;
  incByCategory[s.category] = (incByCategory[s.category] || 0) + 1;
  incByLang[s.lang || 'en'] = (incByLang[s.lang || 'en'] || 0) + 1;
}
const top = (obj, n = 5) => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n);

// ── 8. Output ──
if (asJson) {
  console.log(JSON.stringify({
    window_days: daysArg,
    visitors,
    steps,
    dropoffs,
    time_to_purchase_hrs: { p25, median, p75, n: timeToBuyHrs.length },
    revenue_usd: (revenueCents / 100).toFixed(2),
    abandonment: {
      by_state: top(incByState),
      by_category: top(incByCategory),
      by_lang: top(incByLang),
    },
  }, null, 2));
} else {
  log('═══ FUNNEL ═══');
  for (const s of steps) {
    log(`  ${s.name.padEnd(20)} ${String(s.count).padStart(6)}  ${s.note || ''}`);
  }

  log('\n═══ DROP-OFF ═══');
  for (const d of dropoffs) {
    const flag = d.severity === 'CRITICAL' ? '🚨' : d.severity === 'HIGH' ? '⚠️ ' : '  ';
    log(`  ${flag} ${d.from.padEnd(20)} → ${d.to.padEnd(20)} lost ${d.lost} (${d.lostPct})`);
  }

  log('\n═══ TIME TO PURCHASE ═══');
  log(`  P25: ${p25}h | Median: ${median}h | P75: ${p75}h  (n=${timeToBuyHrs.length})`);

  log('\n═══ REVENUE (window) ═══');
  log(`  $${(revenueCents / 100).toFixed(2)} from ${paid.length} purchases`);
  log(`  Avg order: $${paid.length ? (revenueCents / paid.length / 100).toFixed(2) : '–'}`);

  log('\n═══ ABANDONMENT PATTERNS (sessions scoring <50%) ═══');
  log(`  Top states:    ${top(incByState).map(([k, v]) => `${k}=${v}`).join(', ')}`);
  log(`  Top categories: ${top(incByCategory).map(([k, v]) => `${k}=${v}`).join(', ')}`);
  log(`  Top langs:     ${top(incByLang).map(([k, v]) => `${k}=${v}`).join(', ')}`);

  log('\n═══ RECOMMENDATIONS ═══');
  for (const d of dropoffs) {
    if (d.severity === 'CRITICAL' || d.severity === 'HIGH') {
      log(`  • Fix the ${d.from} → ${d.to} step (losing ${d.lostPct})`);
    }
  }
  if (timeToBuyHrs.length && parseFloat(median) > 24) {
    log(`  • Median time-to-purchase is ${median}h — consider day-2 email nudge`);
  }
  if (incomplete.length > completedSessions.length * 0.3) {
    log(`  • ${pct(incomplete.length, completedSessions.length)} of sessions fail <50% — review question difficulty / hints`);
  }
}

// Write JSON snapshot for downstream use
const outPath = join(root, `funnel-${daysArg}d.json`);
writeFileSync(outPath, JSON.stringify({
  generated_at: new Date().toISOString(),
  window_days: daysArg,
  steps,
  dropoffs,
  time_to_purchase_hrs: { p25, median, p75, n: timeToBuyHrs.length },
  revenue_cents: revenueCents,
  abandonment: { byState: incByState, byCategory: incByCategory, byLang: incByLang },
}, null, 2));
log(`\nSaved snapshot → ${outPath}`);
