#!/usr/bin/env node
/**
 * Bulk Sonnet quality verification for EN questions. Calls
 * /api/admin/verify-quality endpoint per cluster, writes quality_score /
 * quality_issues / quality_verified_at into the DB.
 *
 * Resumable via .bulk-verify-quality-{scope}.json
 *
 * Usage:
 *   node scripts/bulk-verify-quality.js --category=cdl --subcategory=air_brakes --state=texas
 *   node scripts/bulk-verify-quality.js --category=cdl --subcategory=air_brakes  # all states
 *   node scripts/bulk-verify-quality.js --category=car
 *   node scripts/bulk-verify-quality.js --dry-run
 *   node scripts/bulk-verify-quality.js --max-cost=10
 *
 * Requires: ADMIN_PASSWORD, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY
 *           dev or prod server must be reachable.
 */

'use strict';

const fs = require('fs');
const path = require('path');

// .env.local loader
try {
  const txt = fs.readFileSync('.env.local', 'utf8');
  for (const line of txt.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch (_) {}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_PWD    = process.env.ADMIN_PASSWORD;
const SERVER       = process.env.BULK_FIX_SERVER || 'http://localhost:3000';

const CATEGORY    = process.argv.find(a => a.startsWith('--category='))?.split('=')[1] || 'cdl';
const SUBCATEGORY = process.argv.find(a => a.startsWith('--subcategory='))?.split('=')[1] || null;
const ONE_STATE   = process.argv.find(a => a.startsWith('--state='))?.split('=')[1] || null;
const CONCURRENCY = parseInt(process.argv.find(a => a.startsWith('--concurrency='))?.split('=')[1] || '3', 10);
const MAX_COST    = parseFloat(process.argv.find(a => a.startsWith('--max-cost='))?.split('=')[1] || '100');
const FORCE       = process.argv.includes('--force'); // re-verify already verified
const DRY_RUN     = process.argv.includes('--dry-run');

if (!SERVICE_KEY || !ADMIN_PWD) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY or ADMIN_PASSWORD in .env.local');
  process.exit(1);
}

const scope = [CATEGORY, SUBCATEGORY, ONE_STATE].filter(Boolean).join('-');
const PROGRESS_FILE = path.join(__dirname, '..', `.bulk-verify-quality-${scope || 'all'}.json`);

// ─── Supabase helpers ──────────────────────────────────────────────────────

async function sbAll(query, fields, pageSize = 1000) {
  const all = [];
  let offset = 0;
  for (;;) {
    const url = `${SUPABASE_URL}/rest/v1/questions?select=${fields}&${query}&limit=${pageSize}&offset=${offset}`;
    const r = await fetch(url, { headers: { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY } });
    if (!r.ok) throw new Error(`${r.status}: ${(await r.text()).slice(0, 200)}`);
    const rows = await r.json();
    all.push(...rows);
    if (rows.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}

// ─── progress ──────────────────────────────────────────────────────────────

function loadProgress() {
  if (!fs.existsSync(PROGRESS_FILE)) {
    return {
      done: {},
      stats: { verified: 0, cost: 0, score_dist: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, decisions: {} },
    };
  }
  try { return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8')); }
  catch { return { done: {}, stats: { verified: 0, cost: 0, score_dist: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, decisions: {} } }; }
}
function saveProgress(p) { fs.writeFileSync(PROGRESS_FILE, JSON.stringify(p, null, 2)); }

// ─── Verify call ───────────────────────────────────────────────────────────

async function verifyCluster(en) {
  const res = await fetch(`${SERVER}/api/admin/verify-quality`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      password:     ADMIN_PWD,
      cluster_code: en.cluster_code,
      state:        en.state,
      category:     en.category,
      subcategory:  en.subcategory || null,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// ─── Pool ──────────────────────────────────────────────────────────────────

async function runPool(items, fn, concurrency) {
  let idx = 0;
  // Retry transient client-side network failures (undici keep-alive socket dies,
  // ECONNRESET, etc.). The dev server processes requests fine; the loss is on
  // the way over the wire from Node fetch.
  const TRANSIENT = /fetch failed|ECONNRESET|ECONNREFUSED|ETIMEDOUT|socket hang up|other side closed|UND_ERR/i;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      let lastErr = null;
      for (let attempt = 1; attempt <= 4; attempt++) {
        try { await fn(items[i], i); lastErr = null; break; }
        catch (e) {
          lastErr = e;
          if (attempt < 4 && TRANSIENT.test(e.message)) {
            await new Promise(r => setTimeout(r, 1000 * attempt));
            continue;
          }
          break;
        }
      }
      if (lastErr) console.error(`  ERR ${items[i].cluster_code}: ${lastErr.message.slice(0, 200)}`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
}

// ─── Main ──────────────────────────────────────────────────────────────────

(async () => {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Bulk verify-quality — ${CATEGORY}${SUBCATEGORY ? '/' + SUBCATEGORY : ''}${ONE_STATE ? ' [' + ONE_STATE + ']' : ''}${DRY_RUN ? ' [DRY RUN]' : ''}`);
  console.log(`Server: ${SERVER}, concurrency: ${CONCURRENCY}, max cost: $${MAX_COST}${FORCE ? ', FORCE re-verify' : ''}`);
  console.log(`${'='.repeat(60)}\n`);

  const progress = loadProgress();
  console.log(`Loaded progress: ${Object.keys(progress.done).length} clusters already verified · cost so far $${progress.stats.cost.toFixed(2)}`);

  // 1. Fetch EN clusters
  const subFilter = SUBCATEGORY
    ? `&subcategory=eq.${encodeURIComponent(SUBCATEGORY)}`
    : (CATEGORY === 'cdl' ? '&subcategory=is.null' : '');
  const stateFilter = ONE_STATE ? `&state=eq.${ONE_STATE}` : '';

  console.log('Fetching EN clusters...');
  const en = await sbAll(
    `category=eq.${CATEGORY}&language=eq.en&cluster_code=not.is.null${subFilter}${stateFilter}`,
    'id,state,category,subcategory,cluster_code,quality_score,quality_verified_at'
  );
  console.log(`  ${en.length} EN clusters total`);

  // 2. Build work list — skip already verified unless --force
  const work = [];
  for (const e of en) {
    const key = `${e.state}|${e.cluster_code}`;
    if (progress.done[key]) continue;
    if (!FORCE && e.quality_score != null) {
      // Already verified in a previous run (outside progress.json)
      continue;
    }
    work.push(e);
  }
  console.log(`\nWork to do: ${work.length} clusters`);
  const estimatedCost = work.length * 0.01;
  console.log(`Estimated cost: ~$${estimatedCost.toFixed(2)} (Sonnet @ ~$0.01/cluster)`);

  if (DRY_RUN) {
    console.log('\n[DRY RUN] First 10:');
    for (const w of work.slice(0, 10)) console.log(`  ${w.state} ${w.cluster_code}`);
    return;
  }

  if (work.length === 0) {
    console.log('All clusters already verified. Done.');
    return;
  }

  // 3. Process
  let done = 0;
  const t0 = Date.now();

  await runPool(work, async (w) => {
    if (progress.stats.cost >= MAX_COST) {
      console.log(`\n  COST CAP $${MAX_COST} reached. Stopping.`);
      process.exit(0);
    }

    const data = await verifyCluster(w);
    const v = data.verdict;
    done++;

    progress.done[`${w.state}|${w.cluster_code}`] = {
      ts: Date.now(),
      quality_score: v.quality_score,
      decision: v.decision,
    };
    progress.stats.verified++;
    progress.stats.cost += data.cost || 0.01;
    progress.stats.score_dist[v.quality_score] = (progress.stats.score_dist[v.quality_score] || 0) + 1;
    progress.stats.decisions[v.decision] = (progress.stats.decisions[v.decision] || 0) + 1;

    if (done % 10 === 0 || done === work.length) {
      saveProgress(progress);
      const elapsed = Math.round((Date.now() - t0) / 1000);
      const rate = (done / elapsed).toFixed(2);
      const eta = Math.round((work.length - done) / Math.max(parseFloat(rate), 0.01));
      const d = progress.stats.score_dist;
      console.log(`  ${done}/${work.length} · ${rate}/s · ETA ${Math.floor(eta/60)}m${eta%60}s · scores [5:${d[5]}|4:${d[4]}|3:${d[3]}|2:${d[2]}|1:${d[1]}] · ~$${progress.stats.cost.toFixed(2)}`);
    }
  }, CONCURRENCY);

  saveProgress(progress);
  console.log(`\n${'='.repeat(60)}`);
  console.log(`DONE in ${Math.round((Date.now() - t0) / 1000)}s`);
  console.log(`\nScore distribution:`);
  for (const score of [5, 4, 3, 2, 1]) {
    const n = progress.stats.score_dist[score] || 0;
    const pct = progress.stats.verified > 0 ? ((n / progress.stats.verified) * 100).toFixed(1) : '0';
    console.log(`  ${score}/5: ${n} (${pct}%)`);
  }
  console.log(`\nDecision breakdown:`);
  for (const [decision, count] of Object.entries(progress.stats.decisions).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${decision}: ${count}`);
  }
  console.log(`\nTotal cost: ~$${progress.stats.cost.toFixed(2)}`);
})().catch((err) => { console.error('FATAL:', err.message); process.exit(1); });
