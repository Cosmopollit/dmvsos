const SUPABASE_URL = 'https://yaogndpgnewqffbjrsgz.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_KEY) {
  console.error('Set SUPABASE_SERVICE_ROLE_KEY env variable');
  process.exit(1);
}

const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
};

async function sbCount(table, query = '') {
  const url = `${SUPABASE_URL}/rest/v1/${table}?select=id${query ? '&' + query : ''}`;
  const res = await fetch(url, {
    headers: { ...headers, Prefer: 'count=exact', Range: '0-0' },
  });
  const range = res.headers.get('content-range') || '';
  const total = parseInt(range.split('/')[1] || '0', 10);
  return total;
}

async function sbSelect(table, query) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?${query}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

async function sbAll(table, query) {
  const pageSize = 1000;
  let offset = 0;
  const out = [];
  while (true) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
      headers: { ...headers, Range: `${offset}-${offset + pageSize - 1}` },
    });
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
    const rows = await res.json();
    out.push(...rows);
    if (rows.length < pageSize) break;
    offset += pageSize;
  }
  return out;
}

function pct(n, d) { return d === 0 ? '0%' : `${((n / d) * 100).toFixed(1)}%`; }
function pad(s, n) { return String(s).padEnd(n); }

function topN(rows, key, n = 10) {
  const counts = {};
  for (const r of rows) {
    const k = r[key] || '(null)';
    counts[k] = (counts[k] || 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

function daysAgoIso(d) {
  const t = new Date();
  t.setUTCDate(t.getUTCDate() - d);
  return t.toISOString();
}

function groupByDay(rows, key = 'created_at') {
  const byDay = {};
  for (const r of rows) {
    const d = (r[key] || '').slice(0, 10);
    if (!d) continue;
    byDay[d] = (byDay[d] || 0) + 1;
  }
  return Object.entries(byDay).sort((a, b) => a[0].localeCompare(b[0]));
}

function sparkline(values) {
  if (!values.length) return '';
  const max = Math.max(...values);
  const bars = '▁▂▃▄▅▆▇█';
  return values.map(v => bars[Math.min(bars.length - 1, Math.floor((v / max) * (bars.length - 1)))]).join('');
}

async function main() {
  console.log('\n════════════════════════════════════════════════════════');
  console.log('  DMVSOS — Usage Stats (Supabase)');
  console.log('════════════════════════════════════════════════════════\n');

  const [totalQ, totalProfiles, totalSessions] = await Promise.all([
    sbCount('questions'),
    sbCount('profiles'),
    sbCount('test_sessions'),
  ]);

  console.log('── Totals ────────────────────────────────');
  console.log(`Questions:     ${totalQ.toLocaleString()}`);
  console.log(`Profiles:      ${totalProfiles.toLocaleString()}`);
  console.log(`Test sessions: ${totalSessions.toLocaleString()}`);

  // Pro users (new plan system + legacy)
  const proActive = await sbCount('profiles', `plan_type=not.is.null&plan_expires_at=gt.${new Date().toISOString()}`);
  const proLegacy = await sbCount('profiles', 'is_pro=eq.true');
  console.log(`Pro (active):  ${proActive.toLocaleString()}  (legacy is_pro=true: ${proLegacy})`);
  console.log(`Conversion:    ${pct(proActive, totalProfiles)} of profiles have active plan\n`);

  // Recent activity
  const since30 = daysAgoIso(30);
  const since7 = daysAgoIso(7);
  const since1 = daysAgoIso(1);

  const [sess30, sess7, sess1, newProf30, newProf7] = await Promise.all([
    sbCount('test_sessions', `created_at=gte.${since30}`),
    sbCount('test_sessions', `created_at=gte.${since7}`),
    sbCount('test_sessions', `created_at=gte.${since1}`),
    sbCount('profiles', `created_at=gte.${since30}`),
    sbCount('profiles', `created_at=gte.${since7}`),
  ]);

  console.log('── Activity ──────────────────────────────');
  console.log(`Sessions 24h: ${sess1.toLocaleString()}`);
  console.log(`Sessions 7d:  ${sess7.toLocaleString()}  (avg ${(sess7 / 7).toFixed(1)}/day)`);
  console.log(`Sessions 30d: ${sess30.toLocaleString()}  (avg ${(sess30 / 30).toFixed(1)}/day)`);
  console.log(`New profiles 7d:  ${newProf7}`);
  console.log(`New profiles 30d: ${newProf30}\n`);

  // All sessions (site is new — no window cutoff)
  const recent = await sbAll('test_sessions', `select=state,category,lang,score,total,created_at,user_id&order=created_at.asc`);
  const first = recent[0]?.created_at?.slice(0, 10) || '—';
  const last = recent[recent.length - 1]?.created_at?.slice(0, 10) || '—';
  console.log(`── Session window: ${first} → ${last}  (${recent.length} sessions total)\n`);

  // Daily timeline
  console.log('── Daily sessions (all time) ─────────────');
  const daily = groupByDay(recent);
  const values = daily.map(d => d[1]);
  console.log(`${sparkline(values)}  min=${values.length ? Math.min(...values) : 0} max=${values.length ? Math.max(...values) : 0}`);
  const last14 = daily.slice(-14);
  for (const [d, c] of last14) console.log(`  ${d}  ${String(c).padStart(4)}  ${'█'.repeat(Math.round(c / (Math.max(...values) || 1) * 30))}`);
  console.log('');

  // Unique users
  const uniqUsers30 = new Set(recent.filter(r => r.user_id).map(r => r.user_id)).size;
  const last7 = recent.filter(r => r.created_at >= since7);
  const uniqUsers7 = new Set(last7.filter(r => r.user_id).map(r => r.user_id)).size;
  console.log('── Unique users (with account) ───────────');
  console.log(`MAU (all time): ${uniqUsers30}`);
  console.log(`WAU (7d):  ${uniqUsers7}\n`);

  // Top states
  console.log('── Top states (all time) ──────────────────────');
  for (const [k, v] of topN(recent, 'state', 10)) console.log(`  ${pad(k, 22)} ${String(v).padStart(5)}  ${pct(v, recent.length)}`);
  console.log('');

  // Category split
  console.log('── Category split (all time) ──────────────────');
  for (const [k, v] of topN(recent, 'category', 5)) console.log(`  ${pad(k, 12)} ${String(v).padStart(5)}  ${pct(v, recent.length)}`);
  console.log('');

  // Language split
  console.log('── Language split (all time) ──────────────────');
  for (const [k, v] of topN(recent, 'lang', 10)) console.log(`  ${pad(k, 6)} ${String(v).padStart(5)}  ${pct(v, recent.length)}`);
  console.log('');

  // Scores
  const completed = recent.filter(r => typeof r.score === 'number' && typeof r.total === 'number' && r.total > 0);
  if (completed.length) {
    const avgPct = completed.reduce((s, r) => s + (r.score / r.total), 0) / completed.length * 100;
    const passed = completed.filter(r => r.score / r.total >= 0.8).length;
    console.log('── Scores (30d, completed sessions) ──────');
    console.log(`Completed:    ${completed.length}`);
    console.log(`Avg score:    ${avgPct.toFixed(1)}%`);
    console.log(`Passed (≥80%): ${passed}  (${pct(passed, completed.length)})\n`);
  }

  console.log('════════════════════════════════════════════════════════\n');
}

main().catch(e => { console.error(e); process.exit(1); });
