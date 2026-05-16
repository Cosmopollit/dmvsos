#!/usr/bin/env node
/**
 * Bulk rewrite + fix_distractors for CDL clusters, driven by decisions stored
 * in .bulk-verify-quality-cdl-{sub}.json progress files.
 *
 * Pipeline:
 *   1. Load decisions from progress files
 *   2. For each cluster with decision = rewrite or fix_distractors:
 *      POST /api/admin/rewrite-cluster (Sonnet → new EN content, marks non-EN stale)
 *   3. Track per-cluster outcome in .bulk-rewrite-cdl.json (resumable)
 *
 * Retranslate is a SEPARATE step — run bulk-retranslate-stale.js afterwards.
 *
 * Usage:
 *   node scripts/bulk-rewrite-cdl.js --subcategory=combination_vehicles --dry-run
 *   node scripts/bulk-rewrite-cdl.js --subcategory=combination_vehicles
 *   node scripts/bulk-rewrite-cdl.js --all  # all 3 subcategories
 *   node scripts/bulk-rewrite-cdl.js --decision=rewrite --max-cost=20
 *   node scripts/bulk-rewrite-cdl.js --decision=fix_distractors --concurrency=2
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ─── env loader ────────────────────────────────────────────────────────────
try {
  const txt = fs.readFileSync('.env.local', 'utf8');
  for (const line of txt.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch (_) {}

const ADMIN_PWD = process.env.ADMIN_PASSWORD;
const SERVER    = process.env.BULK_FIX_SERVER || 'http://localhost:3000';

const SUB_ARG     = process.argv.find(a => a.startsWith('--subcategory='))?.split('=')[1] || null;
const DECISION    = process.argv.find(a => a.startsWith('--decision='))?.split('=')[1] || null; // 'rewrite' | 'fix_distractors' | null=both
const CONCURRENCY = parseInt(process.argv.find(a => a.startsWith('--concurrency='))?.split('=')[1] || '2', 10);
const MAX_COST    = parseFloat(process.argv.find(a => a.startsWith('--max-cost='))?.split('=')[1] || '200');
const ALL         = process.argv.includes('--all');
const DRY_RUN     = process.argv.includes('--dry-run');

if (!ADMIN_PWD) { console.error('Missing ADMIN_PASSWORD in .env.local'); process.exit(1); }

const SUBS = ALL
  ? ['air_brakes', 'combination_vehicles', 'general_knowledge']
  : SUB_ARG ? [SUB_ARG] : null;
if (!SUBS) { console.error('Specify --subcategory=X or --all'); process.exit(1); }

const PROGRESS_FILE = path.join(__dirname, '..', `.bulk-rewrite-cdl.json`);

// ─── progress ──────────────────────────────────────────────────────────────

function loadProgress() {
  if (!fs.existsSync(PROGRESS_FILE)) return { done: {}, stats: { processed: 0, ok: 0, err: 0, cost: 0, by_decision: {} } };
  try { return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8')); }
  catch { return { done: {}, stats: { processed: 0, ok: 0, err: 0, cost: 0, by_decision: {} } }; }
}
function saveProgress(p) { fs.writeFileSync(PROGRESS_FILE, JSON.stringify(p, null, 2)); }

// ─── Load work list from verify-quality progress files ─────────────────────

function loadDecisions(subcategory) {
  const file = path.join(__dirname, '..', `.bulk-verify-quality-cdl-${subcategory}.json`);
  if (!fs.existsSync(file)) {
    console.warn(`  WARN: ${file} not found, skipping ${subcategory}`);
    return [];
  }
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const work = [];
  for (const [key, val] of Object.entries(data.done || {})) {
    const decision = val.decision;
    // Filter: only well-formed rewrite/fix_distractors decisions
    if (decision !== 'rewrite' && decision !== 'fix_distractors') continue;
    if (DECISION && decision !== DECISION) continue;
    const [state, cluster_code] = key.split('|');
    if (!state || !cluster_code) continue;
    work.push({
      subcategory, state, cluster_code,
      decision, quality_score: val.quality_score,
    });
  }
  return work;
}

// ─── API call ──────────────────────────────────────────────────────────────

async function rewriteCluster(item) {
  const body = {
    password: ADMIN_PWD,
    cluster_code: item.cluster_code,
    state: item.state,
    category: 'cdl',
    subcategory: item.subcategory,
    mode: item.decision, // 'rewrite' or 'fix_distractors'
  };
  const res = await fetch(`${SERVER}/api/admin/rewrite-cluster`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// ─── Pool ──────────────────────────────────────────────────────────────────

async function runPool(items, fn, concurrency) {
  let idx = 0;
  const TRANSIENT = /fetch failed|ECONNRESET|ECONNREFUSED|ETIMEDOUT|socket hang up|other side closed|UND_ERR|rate_limited|overloaded|502|503/i;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      let lastErr = null;
      for (let attempt = 1; attempt <= 4; attempt++) {
        try { await fn(items[i], i); lastErr = null; break; }
        catch (e) {
          lastErr = e;
          if (attempt < 4 && TRANSIENT.test(e.message)) {
            await new Promise(r => setTimeout(r, 2000 * attempt));
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
  console.log('='.repeat(60));
  console.log(`Bulk rewrite CDL — subs: ${SUBS.join(', ')}${DECISION ? ' · decision='+DECISION : ''}${DRY_RUN ? ' [DRY RUN]' : ''}`);
  console.log(`Server: ${SERVER}, concurrency: ${CONCURRENCY}, max cost: $${MAX_COST}`);
  console.log('='.repeat(60));

  const progress = loadProgress();
  console.log(`Progress: ${Object.keys(progress.done).length} done · cost so far $${progress.stats.cost.toFixed(2)}`);

  // Build work list
  const allWork = [];
  for (const sub of SUBS) {
    const w = loadDecisions(sub);
    console.log(`  ${sub}: ${w.length} candidates`);
    allWork.push(...w);
  }

  // Filter already-done
  const work = allWork.filter(w => !progress.done[`${w.state}|${w.cluster_code}`]);
  console.log(`Total candidates: ${allWork.length} · remaining: ${work.length}`);

  const byDec = {};
  for (const w of work) byDec[w.decision] = (byDec[w.decision] || 0) + 1;
  console.log('By decision:', byDec);

  // Cost estimate: rewrite ~$0.015, fix_distractors ~$0.008
  const estCost = (byDec.rewrite || 0) * 0.015 + (byDec.fix_distractors || 0) * 0.008;
  console.log(`Estimated cost: ~$${estCost.toFixed(2)} (Sonnet)`);

  if (DRY_RUN) {
    console.log('\n[DRY RUN] First 10 items:');
    for (const w of work.slice(0, 10)) {
      console.log(`  ${w.state.padEnd(15)} ${w.subcategory.padEnd(22)} ${w.cluster_code.padEnd(20)} → ${w.decision} (score ${w.quality_score})`);
    }
    return;
  }

  if (work.length === 0) { console.log('Nothing to do.'); return; }

  // Run
  let done = 0;
  const t0 = Date.now();

  await runPool(work, async (w) => {
    if (progress.stats.cost >= MAX_COST) {
      console.log(`\n  COST CAP $${MAX_COST} reached. Stopping.`);
      process.exit(0);
    }

    let result;
    try { result = await rewriteCluster(w); }
    catch (e) {
      progress.stats.err++;
      progress.done[`${w.state}|${w.cluster_code}`] = { ok: false, error: e.message.slice(0, 200), ts: Date.now() };
      done++;
      throw e;
    }

    progress.done[`${w.state}|${w.cluster_code}`] = {
      ok: true,
      mode: result.mode,
      cost: result.cost,
      stale_set: result.stale_set,
      ts: Date.now(),
    };
    progress.stats.processed++;
    progress.stats.ok++;
    progress.stats.cost += result.cost || 0;
    progress.stats.by_decision[w.decision] = (progress.stats.by_decision[w.decision] || 0) + 1;
    done++;

    if (done % 5 === 0 || done === work.length) {
      saveProgress(progress);
      const elapsed = Math.round((Date.now() - t0) / 1000);
      const rate = (done / elapsed).toFixed(2);
      const eta = Math.round((work.length - done) / Math.max(parseFloat(rate), 0.01));
      console.log(`  ${done}/${work.length} · ${rate}/s · ETA ${Math.floor(eta/60)}m${eta%60}s · ok=${progress.stats.ok} err=${progress.stats.err} · ~$${progress.stats.cost.toFixed(2)}`);
    }
  }, CONCURRENCY);

  saveProgress(progress);
  console.log('\n' + '='.repeat(60));
  console.log(`DONE in ${Math.round((Date.now() - t0) / 1000)}s`);
  console.log(`Processed: ${progress.stats.ok} ok · ${progress.stats.err} err`);
  console.log('By decision:', progress.stats.by_decision);
  console.log(`Total cost: ~$${progress.stats.cost.toFixed(2)}`);
  console.log('\nNext step: bulk-retranslate-stale.js to refresh RU/ES/ZH/UA for rewritten clusters.');
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
