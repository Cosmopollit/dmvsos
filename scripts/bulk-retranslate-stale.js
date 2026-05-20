#!/usr/bin/env node
/**
 * Refresh translations for clusters whose non-EN siblings are marked
 * translation_stale_at != NULL (typically because EN was rewritten).
 *
 * For each stale cluster, calls /api/admin/retranslate-cluster which:
 *   - regenerates RU/ES/ZH/UA via Haiku in parallel
 *   - clears translation_stale_at on success
 *
 * Resumable via .bulk-retranslate-stale.json
 *
 * Usage:
 *   node scripts/bulk-retranslate-stale.js --category=cdl --dry-run
 *   node scripts/bulk-retranslate-stale.js --category=cdl --subcategory=combination_vehicles
 *   node scripts/bulk-retranslate-stale.js --category=cdl --concurrency=3
 */

'use strict';

const fs = require('fs');
const path = require('path');

// env loader
try {
  const txt = fs.readFileSync('.env.local', 'utf8');
  for (const line of txt.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch (_) {}

const SB         = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY        = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_PWD  = process.env.ADMIN_PASSWORD;
const SERVER     = process.env.BULK_FIX_SERVER || 'http://localhost:3000';

const CATEGORY    = process.argv.find(a => a.startsWith('--category='))?.split('=')[1] || 'cdl';
const SUBCATEGORY = process.argv.find(a => a.startsWith('--subcategory='))?.split('=')[1] || null;
const CONCURRENCY = parseInt(process.argv.find(a => a.startsWith('--concurrency='))?.split('=')[1] || '3', 10);
const MAX_COST    = parseFloat(process.argv.find(a => a.startsWith('--max-cost='))?.split('=')[1] || '200');
const DRY_RUN     = process.argv.includes('--dry-run');

if (!SB || !KEY || !ADMIN_PWD) { console.error('Missing env'); process.exit(1); }

const PROGRESS = path.join(__dirname, '..', `.bulk-retranslate-stale.json`);

function loadProgress() {
  if (!fs.existsSync(PROGRESS)) return { done: {}, stats: { ok: 0, err: 0, cost: 0 } };
  try { return JSON.parse(fs.readFileSync(PROGRESS, 'utf8')); }
  catch { return { done: {}, stats: { ok: 0, err: 0, cost: 0 } }; }
}
function saveProgress(p) { fs.writeFileSync(PROGRESS, JSON.stringify(p, null, 2)); }

async function fetchStaleClusters() {
  // Fetch all non-EN rows with translation_stale_at set, group by cluster_code
  const seen = new Map(); // key = state|cluster_code → row
  let offset = 0;
  const PAGE = 1000;
  for (;;) {
    // ORDER BY id is required — without it, Postgres returns rows in
    // non-deterministic order across pages, producing duplicates on some
    // pages and silently dropping rows on others (snapshot looks the right
    // size but a subset is missing).
    let url = `${SB}/rest/v1/questions?select=state,category,subcategory,cluster_code&category=eq.${CATEGORY}&language=neq.en&translation_stale_at=not.is.null&cluster_code=not.is.null&order=id.asc&limit=${PAGE}&offset=${offset}`;
    if (SUBCATEGORY) url += `&subcategory=eq.${SUBCATEGORY}`;
    const r = await fetch(url, { headers: { apikey: KEY, Authorization: 'Bearer ' + KEY } });
    if (!r.ok) throw new Error(`SELECT ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const rows = await r.json();
    for (const row of rows) {
      const key = `${row.state}|${row.cluster_code}`;
      if (!seen.has(key)) seen.set(key, row);
    }
    if (rows.length < PAGE) break;
    offset += PAGE;
  }
  return [...seen.values()];
}

async function retranslate(c) {
  const r = await fetch(`${SERVER}/api/admin/retranslate-cluster`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      password: ADMIN_PWD,
      cluster_code: c.cluster_code,
      state: c.state,
      category: c.category,
      subcategory: c.subcategory || null,
    }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
  return data;
}

async function runPool(items, fn, concurrency) {
  let idx = 0;
  const TRANSIENT = /fetch failed|ECONNRESET|ECONNREFUSED|ETIMEDOUT|socket hang up|other side closed|UND_ERR|502|503|529|rate_limited|overloaded/i;
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

(async () => {
  console.log('='.repeat(60));
  console.log(`Bulk retranslate stale — ${CATEGORY}${SUBCATEGORY ? '/'+SUBCATEGORY : ''}${DRY_RUN ? ' [DRY RUN]' : ''}`);
  console.log(`Server: ${SERVER}, concurrency: ${CONCURRENCY}, max cost: $${MAX_COST}`);
  console.log('='.repeat(60));

  console.log('Fetching stale clusters...');
  const clusters = await fetchStaleClusters();
  console.log(`Found: ${clusters.length} stale clusters`);

  const progress = loadProgress();
  const work = clusters.filter(c => !progress.done[`${c.state}|${c.cluster_code}`]);
  console.log(`Remaining: ${work.length}`);

  const estCost = work.length * 0.008; // Haiku ~$0.008 per cluster (4 langs)
  console.log(`Estimated cost: ~$${estCost.toFixed(2)}`);

  if (DRY_RUN) {
    console.log('\n[DRY RUN] First 10:');
    for (const c of work.slice(0, 10)) console.log(`  ${c.state.padEnd(15)} ${c.subcategory || '-'} ${c.cluster_code}`);
    return;
  }

  if (work.length === 0) { console.log('Nothing to do.'); return; }

  let done = 0;
  const t0 = Date.now();

  await runPool(work, async (c) => {
    if (progress.stats.cost >= MAX_COST) {
      console.log(`\n  COST CAP $${MAX_COST} reached. Stopping.`);
      process.exit(0);
    }

    let result;
    try { result = await retranslate(c); }
    catch (e) {
      progress.stats.err++;
      progress.done[`${c.state}|${c.cluster_code}`] = { ok: false, error: e.message.slice(0, 200), ts: Date.now() };
      done++;
      throw e;
    }

    const errs = (result.results || []).filter(r => !r.ok);
    progress.done[`${c.state}|${c.cluster_code}`] = {
      ok: errs.length === 0,
      success: result.success,
      total: result.total,
      errors: errs.length > 0 ? errs : undefined,
      ts: Date.now(),
    };
    progress.stats.ok += result.success;
    progress.stats.err += errs.length;
    progress.stats.cost += 0.008; // approximate; endpoint doesn't return cost
    done++;

    if (done % 10 === 0 || done === work.length) {
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
  console.log(`Successful lang-translations: ${progress.stats.ok} · failed: ${progress.stats.err}`);
  console.log(`Total cost (approx): ~$${progress.stats.cost.toFixed(2)}`);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
