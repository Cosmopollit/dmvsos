#!/usr/bin/env node
/**
 * Bulk fix EN-fallback translations across all states for a given
 * category/subcategory. Re-uses the admin /api/admin/retranslate-cluster
 * endpoint (same logic as the UI bulk operation, just orchestrated
 * server-to-server).
 *
 * Workflow:
 *   1. Scan all EN clusters for the given category/subcategory
 *   2. For each, detect which of ru/es/zh/ua are fallback or missing
 *   3. Call the retranslate endpoint with ONLY the failing langs
 *   4. Resumable via progress file (.bulk-fix-fallbacks-{cat}-{sub}.json)
 *
 * Requires: ADMIN_PASSWORD, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY
 *           dev or prod server must be reachable.
 *
 * Usage:
 *   node scripts/bulk-fix-fallbacks.js --category=cdl --subcategory=air_brakes
 *   node scripts/bulk-fix-fallbacks.js --category=cdl --subcategory=air_brakes --state=texas
 *   node scripts/bulk-fix-fallbacks.js --category=car
 *   node scripts/bulk-fix-fallbacks.js --category=cdl --subcategory=air_brakes --dry-run
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
const DRY_RUN     = process.argv.includes('--dry-run');

if (!SERVICE_KEY || !ADMIN_PWD) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY or ADMIN_PASSWORD in .env.local');
  process.exit(1);
}

const PROGRESS_FILE = path.join(
  __dirname, '..',
  `.bulk-fix-fallbacks-${CATEGORY}${SUBCATEGORY ? '-' + SUBCATEGORY : ''}.json`
);

const LANGS = ['ru', 'es', 'zh', 'ua'];
const hasCyrillic = (s) => /[Ѐ-ӿ]/.test(s || '');
const hasCJK      = (s) => /[一-鿿]/.test(s || '');

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
  if (!fs.existsSync(PROGRESS_FILE)) return { done: {}, stats: { ok: 0, err: 0, cost_est: 0 } };
  try { return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8')); }
  catch { return { done: {}, stats: { ok: 0, err: 0, cost_est: 0 } }; }
}

function saveProgress(p) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(p, null, 2));
}

// ─── detect fallback languages per cluster ─────────────────────────────────

function detectFailingLangs(en, translations) {
  const failing = [];
  const trByLang = new Map();
  for (const t of translations) trByLang.set(t.language, t);

  for (const lang of LANGS) {
    const t = trByLang.get(lang);
    if (!t) { failing.push(lang); continue; } // missing
    if (t.translation_stale_at) { failing.push(lang); continue; }
    const blob = `${t.question_text || ''} ${t.option_a || ''} ${t.option_b || ''} ${t.option_c || ''} ${t.option_d || ''}`;
    if (lang === 'ru' || lang === 'ua') { if (!hasCyrillic(blob)) failing.push(lang); }
    else if (lang === 'zh')              { if (!hasCJK(blob))      failing.push(lang); }
    else if (lang === 'es')              { if (t.question_text === en.question_text) failing.push(lang); }
  }
  return failing;
}

// ─── retranslate via admin endpoint ────────────────────────────────────────

async function retranslateCluster(en, langs) {
  const res = await fetch(`${SERVER}/api/admin/retranslate-cluster`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      password:     ADMIN_PWD,
      cluster_code: en.cluster_code,
      state:        en.state,
      category:     en.category,
      subcategory:  en.subcategory || null,
      langs,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// ─── pool ──────────────────────────────────────────────────────────────────

async function runPool(items, fn, concurrency) {
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      try { await fn(items[i], i); }
      catch (e) { console.error(`  ERR ${items[i].cluster_code}: ${e.message.slice(0, 200)}`); }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
}

// ─── main ──────────────────────────────────────────────────────────────────

(async () => {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Bulk fix fallbacks — ${CATEGORY}${SUBCATEGORY ? '/' + SUBCATEGORY : ''}${ONE_STATE ? ' [' + ONE_STATE + ']' : ''}${DRY_RUN ? ' [DRY RUN]' : ''}`);
  console.log(`Server: ${SERVER}`);
  console.log(`Concurrency: ${CONCURRENCY}`);
  console.log(`${'='.repeat(60)}\n`);

  const progress = loadProgress();
  console.log(`Loaded progress: ${Object.keys(progress.done).length} clusters already processed`);

  // 1. Fetch EN
  const subFilter = SUBCATEGORY
    ? `&subcategory=eq.${encodeURIComponent(SUBCATEGORY)}`
    : (CATEGORY === 'cdl' ? '&subcategory=is.null' : '');
  const stateFilter = ONE_STATE ? `&state=eq.${ONE_STATE}` : '';

  console.log('Fetching EN clusters...');
  const en = await sbAll(
    `category=eq.${CATEGORY}&language=eq.en${subFilter}${stateFilter}&cluster_code=not.is.null`,
    'id,state,category,subcategory,cluster_code,question_text'
  );
  console.log(`  ${en.length} EN clusters\n`);

  if (en.length === 0) {
    console.log('Nothing to do.');
    return;
  }

  // 2. Fetch all translations in chunks (cluster_code IN list)
  console.log('Fetching translations...');
  const trByCluster = new Map();
  const CHUNK = 200;
  for (let i = 0; i < en.length; i += CHUNK) {
    const codes = en.slice(i, i + CHUNK).map(r => r.cluster_code);
    const inList = codes.map(c => `"${c}"`).join(',');
    const t = await sbAll(
      `category=eq.${CATEGORY}&language=in.(${LANGS.join(',')})&cluster_code=in.(${inList})${subFilter}`,
      'cluster_code,state,language,question_text,option_a,option_b,option_c,option_d,translation_stale_at'
    );
    for (const x of t) {
      const key = `${x.state}|${x.cluster_code}`;
      if (!trByCluster.has(key)) trByCluster.set(key, []);
      trByCluster.get(key).push(x);
    }
    process.stdout.write(`  ${Math.min(i + CHUNK, en.length)}/${en.length}\r`);
  }
  console.log('');

  // 3. Build work list — only clusters with at least one failing lang
  const work = [];
  for (const e of en) {
    const key = `${e.state}|${e.cluster_code}`;
    if (progress.done[key]) continue;
    const trs = trByCluster.get(key) || [];
    const failing = detectFailingLangs(e, trs);
    if (failing.length > 0) work.push({ ...e, _failing: failing });
  }
  console.log(`\nWork to do: ${work.length} clusters (${work.reduce((a, x) => a + x._failing.length, 0)} translations)`);
  const estimate = work.reduce((a, x) => a + x._failing.length * 0.0024, 0);
  console.log(`Estimated cost: ~$${estimate.toFixed(2)} (Haiku)`);

  if (DRY_RUN) {
    console.log('\n[DRY RUN] Showing first 10:');
    for (const w of work.slice(0, 10)) {
      console.log(`  ${w.state} ${w.cluster_code} — fix: ${w._failing.join(', ')}`);
    }
    return;
  }

  if (work.length === 0) {
    console.log('All clusters are clean. Nothing to do.');
    return;
  }

  // 4. Process
  let done = 0;
  const t0 = Date.now();

  await runPool(work, async (w) => {
    const data = await retranslateCluster(w, w._failing);
    done++;
    const okCount = data.results.filter(r => r.ok).length;
    const errCount = data.results.length - okCount;

    progress.done[`${w.state}|${w.cluster_code}`] = { ts: Date.now(), ok: okCount, err: errCount };
    progress.stats.ok += okCount;
    progress.stats.err += errCount;
    progress.stats.cost_est += okCount * 0.0024;

    if (done % 10 === 0 || done === work.length) {
      saveProgress(progress);
      const elapsed = Math.round((Date.now() - t0) / 1000);
      const rate = (done / elapsed).toFixed(1);
      const eta = Math.round((work.length - done) / Math.max(parseFloat(rate), 0.01));
      console.log(`  ${done}/${work.length} · ${rate} clusters/s · ETA ${Math.floor(eta/60)}m${eta%60}s · success=${progress.stats.ok} err=${progress.stats.err} · ~$${progress.stats.cost_est.toFixed(2)}`);
    }
  }, CONCURRENCY);

  saveProgress(progress);
  console.log(`\n${'='.repeat(60)}`);
  console.log(`DONE in ${Math.round((Date.now() - t0) / 1000)}s`);
  console.log(`Successful translations: ${progress.stats.ok}`);
  console.log(`Errors: ${progress.stats.err}`);
  console.log(`Estimated total cost: ~$${progress.stats.cost_est.toFixed(2)}`);
  console.log(`Progress saved to ${path.basename(PROGRESS_FILE)} (delete to start fresh)`);
})().catch((err) => { console.error('FATAL:', err.message); process.exit(1); });
