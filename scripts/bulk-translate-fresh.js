#!/usr/bin/env node
/**
 * Generate missing non-EN translations for clusters that have an EN row
 * but are missing one or more of RU / ES / ZH / UA.
 *
 * For each cluster, calls /api/admin/retranslate-cluster with `langs`
 * limited to the ones actually missing in DB, so cost scales with real
 * gaps, not 4x per cluster.
 *
 * Resumable via .cdl-translate-fresh.json (compatible with prior runs).
 *
 * Usage:
 *   node scripts/bulk-translate-fresh.js --category=cdl --dry-run
 *   node scripts/bulk-translate-fresh.js --category=cdl --model=haiku
 *   node scripts/bulk-translate-fresh.js --category=cdl --model=sonnet --concurrency=3
 *   node scripts/bulk-translate-fresh.js --category=cdl --subcategory=combination_vehicles
 *   node scripts/bulk-translate-fresh.js --category=cdl --state=wisconsin
 *   node scripts/bulk-translate-fresh.js --category=cdl --langs=ru,ua
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

const SB        = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY       = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_PWD = process.env.ADMIN_PASSWORD;
const SERVER    = process.env.BULK_FIX_SERVER || 'http://localhost:3000';

const ARG = (name, fallback = null) =>
  process.argv.find(a => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;

const CATEGORY    = ARG('category', 'cdl');
const SUBCATEGORY = ARG('subcategory');
const STATE       = ARG('state');
const CONCURRENCY = parseInt(ARG('concurrency', '3'), 10);
const MAX_COST    = parseFloat(ARG('max-cost', '200'));
const MODEL       = (ARG('model', 'haiku') || 'haiku').toLowerCase();
const LANGS_OPT   = ARG('langs');
const DRY_RUN     = process.argv.includes('--dry-run');

const ALL_NON_EN = ['ru', 'es', 'zh', 'ua'];
const LANG_FILTER = LANGS_OPT
  ? LANGS_OPT.split(',').map(s => s.trim().toLowerCase()).filter(l => ALL_NON_EN.includes(l))
  : ALL_NON_EN;

const COST_PER_LANG = { haiku: 0.002, sonnet: 0.024 };
if (!COST_PER_LANG[MODEL]) {
  console.error(`Unknown --model=${MODEL}. Use haiku or sonnet.`);
  process.exit(1);
}

if (!SB || !KEY || !ADMIN_PWD) {
  console.error('Missing env (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / ADMIN_PASSWORD)');
  process.exit(1);
}

const PROGRESS = path.join(__dirname, '..', `.cdl-translate-fresh.json`);

function loadProgress() {
  if (!fs.existsSync(PROGRESS)) return { done: {}, stats: { ok: 0, err: 0, cost: 0 } };
  try {
    const p = JSON.parse(fs.readFileSync(PROGRESS, 'utf8'));
    if (!p.done) p.done = {};
    if (!p.stats) p.stats = { ok: 0, err: 0, cost: 0 };
    return p;
  } catch { return { done: {}, stats: { ok: 0, err: 0, cost: 0 } }; }
}
function saveProgress(p) { fs.writeFileSync(PROGRESS, JSON.stringify(p, null, 2)); }

async function fetchClusterLangs() {
  // Keyset pagination by id (avoids deep-offset statement timeouts on 70k+
  // row scans). ORDER BY id.asc keeps pages deterministic.
  const byCluster = new Map(); // key=state|cluster_code → { state, subcategory, cluster_code, langs:Set }
  const PAGE = 1000;
  let lastId = null;
  let scanned = 0;
  for (;;) {
    let url = `${SB}/rest/v1/questions?select=id,state,subcategory,cluster_code,language` +
              `&category=eq.${CATEGORY}` +
              `&cluster_code=not.is.null` +
              `&order=id.asc&limit=${PAGE}`;
    if (lastId !== null) url += `&id=gt.${encodeURIComponent(lastId)}`;
    if (SUBCATEGORY)     url += `&subcategory=eq.${SUBCATEGORY}`;
    if (STATE)           url += `&state=eq.${STATE}`;
    const r = await fetch(url, { headers: { apikey: KEY, Authorization: 'Bearer ' + KEY } });
    if (!r.ok) throw new Error(`SELECT ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const rows = await r.json();
    if (rows.length === 0) break;
    for (const row of rows) {
      const key = `${row.state}|${row.cluster_code}`;
      if (!byCluster.has(key)) {
        byCluster.set(key, {
          state:        row.state,
          subcategory:  row.subcategory,
          cluster_code: row.cluster_code,
          langs:        new Set(),
        });
      }
      byCluster.get(key).langs.add(row.language);
    }
    scanned += rows.length;
    lastId = rows[rows.length - 1].id;
    if (rows.length < PAGE) break;
  }
  console.log(`  scanned ${scanned} rows`);
  return byCluster;
}

function computeMissing(langs) {
  return LANG_FILTER.filter(l => !langs.has(l));
}

async function translateCluster(c, missing) {
  const r = await fetch(`${SERVER}/api/admin/retranslate-cluster`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      password:     ADMIN_PWD,
      cluster_code: c.cluster_code,
      state:        c.state,
      category:     CATEGORY,
      subcategory:  c.subcategory || null,
      langs:        missing,
      model:        MODEL,
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
      if (lastErr) console.error(`  ERR ${items[i].cluster.cluster_code}: ${lastErr.message.slice(0, 200)}`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
}

(async () => {
  console.log('='.repeat(60));
  console.log(`Bulk translate fresh — ${CATEGORY}${SUBCATEGORY ? '/' + SUBCATEGORY : ''}${STATE ? ' state=' + STATE : ''}${DRY_RUN ? ' [DRY RUN]' : ''}`);
  console.log(`Model: ${MODEL} · Langs: ${LANG_FILTER.join(',')} · Server: ${SERVER} · Concurrency: ${CONCURRENCY} · Max cost: $${MAX_COST}`);
  console.log('='.repeat(60));

  console.log('Snapshotting cluster→languages from DB...');
  const byCluster = await fetchClusterLangs();
  console.log(`Snapshot: ${byCluster.size} clusters`);

  const all = [];
  let noEn = 0, complete = 0;
  for (const [key, c] of byCluster) {
    if (!c.langs.has('en')) { noEn++; continue; }
    const missing = computeMissing(c.langs);
    if (missing.length === 0) { complete++; continue; }
    all.push({ key, cluster: c, missing });
  }
  console.log(`  no-EN: ${noEn} · complete: ${complete} · need work: ${all.length}`);

  const progress = loadProgress();
  // Skip clusters already fully done according to progress file AND not partial.
  const work = all.filter(w => {
    const d = progress.done[w.key];
    if (!d) return true;
    if (d.ok === false) return true;
    if (typeof d.success === 'number' && typeof d.total === 'number' && d.success < d.total) return true;
    return false;
  });
  console.log(`Remaining after progress filter: ${work.length}`);

  const totalLangs = work.reduce((s, w) => s + w.missing.length, 0);
  const estCost = totalLangs * COST_PER_LANG[MODEL];
  console.log(`Total language-translations to produce: ${totalLangs}`);
  console.log(`Estimated cost (${MODEL}): ~$${estCost.toFixed(2)}`);

  if (DRY_RUN) {
    console.log('\n[DRY RUN] First 10:');
    for (const w of work.slice(0, 10)) {
      console.log(`  ${w.cluster.state.padEnd(15)} ${(w.cluster.subcategory || '-').padEnd(22)} ${w.cluster.cluster_code}  missing=${w.missing.join(',')}`);
    }
    return;
  }
  if (work.length === 0) { console.log('Nothing to do.'); return; }

  let done = 0;
  const t0 = Date.now();

  await runPool(work, async (w) => {
    if (progress.stats.cost >= MAX_COST) {
      console.log(`\n  COST CAP $${MAX_COST} reached. Stopping.`);
      saveProgress(progress);
      process.exit(0);
    }

    let result;
    try { result = await translateCluster(w.cluster, w.missing); }
    catch (e) {
      progress.stats.err++;
      progress.done[w.key] = { ok: false, error: e.message.slice(0, 200), missing: w.missing, ts: Date.now() };
      done++;
      throw e;
    }

    const errs = (result.results || []).filter(r => !r.ok);
    progress.done[w.key] = {
      ok:      errs.length === 0,
      success: result.success,
      total:   result.total,
      langs:   w.missing,
      errors:  errs.length > 0 ? errs : undefined,
      model:   MODEL,
      ts:      Date.now(),
    };
    progress.stats.ok  += result.success;
    progress.stats.err += errs.length;
    progress.stats.cost += w.missing.length * COST_PER_LANG[MODEL];
    done++;

    if (done % 10 === 0 || done === work.length) {
      saveProgress(progress);
      const elapsed = Math.round((Date.now() - t0) / 1000);
      const rate = (done / Math.max(elapsed, 1)).toFixed(2);
      const eta  = Math.round((work.length - done) / Math.max(parseFloat(rate), 0.01));
      console.log(`  ${done}/${work.length} · ${rate}/s · ETA ${Math.floor(eta / 60)}m${eta % 60}s · ok=${progress.stats.ok} err=${progress.stats.err} · ~$${progress.stats.cost.toFixed(2)}`);
    }
  }, CONCURRENCY);

  saveProgress(progress);
  console.log('\n' + '='.repeat(60));
  console.log(`DONE in ${Math.round((Date.now() - t0) / 1000)}s`);
  console.log(`Successful lang-translations: ${progress.stats.ok} · failed: ${progress.stats.err}`);
  console.log(`Total cost (approx, ${MODEL}): ~$${progress.stats.cost.toFixed(2)}`);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
