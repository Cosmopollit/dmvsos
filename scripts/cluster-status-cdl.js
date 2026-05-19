#!/usr/bin/env node
/**
 * READ-ONLY health map of CDL clusters.
 * Per (state, subcategory, cluster_code), reports which languages are
 * present and which signals are missing. Used as the planning input for
 * fix-cdl-clusters.js (orchestrator) — never mutates DB.
 *
 * Status classification per cluster:
 *   RED    — EN row missing OR EN question_text empty (broken baseline)
 *   YELLOW — EN ok but at least one of:
 *              * EN manual_reference empty
 *              * any of RU/ES/ZH/UA missing
 *              * any lang has translation_stale_at set
 *              * EN not quality_verified
 *   GREEN  — EN has manual_ref + verified, all 5 langs present, no stale
 *
 * Output:
 *   - Human-readable summary to stdout
 *   - JSON file (.cluster-status-cdl-{ts}.json) with full per-cluster detail
 *
 * Usage:
 *   node scripts/cluster-status-cdl.js
 *   node scripts/cluster-status-cdl.js --state=texas
 *   node scripts/cluster-status-cdl.js --subcategory=combination_vehicles
 *   node scripts/cluster-status-cdl.js --status=red --verbose
 *   node scripts/cluster-status-cdl.js --out=cdl-status.json
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

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPA_URL || !SUPA_KEY) { console.error('Missing Supabase env'); process.exit(1); }

const H = { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY };

const args = process.argv.slice(2);
const argVal = (k) => args.find(a => a.startsWith(`--${k}=`))?.split('=')[1];
const STATE       = argVal('state') || null;
const SUBCATEGORY = argVal('subcategory') || null;
const STATUS_FILT = argVal('status') || null; // red | yellow | green
const VERBOSE     = args.includes('--verbose');
const OUT_FILE    = argVal('out') || `.cluster-status-cdl-${Date.now()}.json`;

const REQUIRED_LANGS = ['en', 'ru', 'es', 'zh', 'ua'];

async function fetchAll() {
  const rows = [];
  let lastId = '';
  while (true) {
    const params = new URLSearchParams({
      select: 'id,state,subcategory,language,cluster_code,question_text,manual_reference,quality_verified_at,quality_issues,translation_stale_at',
      category: 'eq.cdl',
      cluster_code: 'not.is.null',
      order: 'id.asc',
      limit: '1000',
    });
    if (STATE)       params.set('state', 'eq.' + STATE);
    if (SUBCATEGORY) params.set('subcategory', 'eq.' + SUBCATEGORY);
    if (lastId)      params.set('id', 'gt.' + lastId);
    const r = await fetch(SUPA_URL + '/rest/v1/questions?' + params, { headers: H });
    if (!r.ok) throw new Error(`SELECT ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const batch = await r.json();
    if (batch.length === 0) break;
    rows.push(...batch);
    lastId = batch[batch.length - 1].id;
    process.stderr.write(`  loaded ${rows.length}\r`);
    if (batch.length < 1000) break;
  }
  process.stderr.write('\n');
  return rows;
}

function classify(cluster) {
  const en = cluster.langs.en;
  if (!en || !en.question_text || en.question_text.trim().length === 0) {
    cluster.status = 'RED';
    cluster.reasons.push('en_missing_or_empty');
    return;
  }

  const reasons = [];
  if (!en.manual_reference) reasons.push('en_no_manual_ref');
  if (!en.quality_verified_at) reasons.push('en_not_verified');

  for (const lg of ['ru', 'es', 'zh', 'ua']) {
    if (!cluster.langs[lg]) reasons.push(`missing_${lg}`);
    else if (cluster.langs[lg].translation_stale_at) reasons.push(`stale_${lg}`);
  }

  cluster.reasons = reasons;
  cluster.status = reasons.length === 0 ? 'GREEN' : 'YELLOW';
}

(async () => {
  console.log(`Loading CDL rows from Supabase (filters: state=${STATE || 'all'}, sub=${SUBCATEGORY || 'all'})...`);
  const rows = await fetchAll();
  console.log(`Loaded ${rows.length} rows.`);

  // Group: key=state|subcategory|cluster_code
  const clusters = new Map();
  for (const row of rows) {
    const key = `${row.state}|${row.subcategory || 'NONE'}|${row.cluster_code}`;
    if (!clusters.has(key)) {
      clusters.set(key, {
        state: row.state,
        subcategory: row.subcategory,
        cluster_code: row.cluster_code,
        langs: {},
        status: null,
        reasons: [],
      });
    }
    const c = clusters.get(key);
    if (c.langs[row.language]) {
      c.reasons.push(`duplicate_${row.language}`); // shouldn't happen post-dedupe
    }
    c.langs[row.language] = {
      id: row.id,
      question_text: row.question_text,
      manual_reference: row.manual_reference,
      quality_verified_at: row.quality_verified_at,
      quality_issues: row.quality_issues,
      translation_stale_at: row.translation_stale_at,
    };
  }

  for (const c of clusters.values()) classify(c);

  // Apply --status filter for display only (JSON keeps everything)
  const all = [...clusters.values()];
  const display = STATUS_FILT
    ? all.filter(c => c.status === STATUS_FILT.toUpperCase())
    : all;

  // ── Summary aggregation ──────────────────────────────────────────────────
  const total = all.length;
  const byStatus = { GREEN: 0, YELLOW: 0, RED: 0 };
  for (const c of all) byStatus[c.status]++;

  const byStateStatus = {}; // state → { GREEN, YELLOW, RED }
  for (const c of all) {
    if (!byStateStatus[c.state]) byStateStatus[c.state] = { GREEN: 0, YELLOW: 0, RED: 0 };
    byStateStatus[c.state][c.status]++;
  }

  const bySubStatus = {}; // subcategory → { GREEN, YELLOW, RED }
  for (const c of all) {
    const sub = c.subcategory || 'NONE';
    if (!bySubStatus[sub]) bySubStatus[sub] = { GREEN: 0, YELLOW: 0, RED: 0 };
    bySubStatus[sub][c.status]++;
  }

  const reasonCount = {};
  for (const c of all) {
    for (const r of c.reasons) reasonCount[r] = (reasonCount[r] || 0) + 1;
  }

  // ── Output ───────────────────────────────────────────────────────────────
  console.log('\n=== CDL CLUSTER STATUS ===');
  console.log(`Total clusters: ${total}`);
  console.log(`  GREEN  : ${byStatus.GREEN.toString().padStart(5)}  (${Math.round(byStatus.GREEN/total*100)}%)`);
  console.log(`  YELLOW : ${byStatus.YELLOW.toString().padStart(5)}  (${Math.round(byStatus.YELLOW/total*100)}%)`);
  console.log(`  RED    : ${byStatus.RED.toString().padStart(5)}  (${Math.round(byStatus.RED/total*100)}%)`);

  console.log('\n=== TOP REASONS (across all non-GREEN clusters) ===');
  for (const [r, n] of Object.entries(reasonCount).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${n.toString().padStart(5)}  ${r}`);
  }

  console.log('\n=== BY SUBCATEGORY ===');
  console.log('subcategory'.padEnd(24), 'GREEN'.padStart(7), 'YELLOW'.padStart(7), 'RED'.padStart(7));
  for (const [sub, st] of Object.entries(bySubStatus).sort()) {
    console.log(sub.padEnd(24), st.GREEN.toString().padStart(7), st.YELLOW.toString().padStart(7), st.RED.toString().padStart(7));
  }

  console.log('\n=== TOP 20 WORST STATES (by YELLOW+RED count) ===');
  const stateList = Object.entries(byStateStatus)
    .sort((a, b) => (b[1].YELLOW + b[1].RED) - (a[1].YELLOW + a[1].RED))
    .slice(0, 20);
  console.log('state'.padEnd(20), 'GREEN'.padStart(7), 'YELLOW'.padStart(7), 'RED'.padStart(7));
  for (const [st, s] of stateList) {
    console.log(st.padEnd(20), s.GREEN.toString().padStart(7), s.YELLOW.toString().padStart(7), s.RED.toString().padStart(7));
  }

  if (VERBOSE) {
    console.log(`\n=== PER-CLUSTER DETAIL (status=${STATUS_FILT || 'all'}) ===`);
    for (const c of display.slice(0, 200)) {
      console.log(`${c.status.padEnd(7)} ${c.state.padEnd(15)} ${(c.subcategory || '-').padEnd(22)} ${c.cluster_code.padEnd(20)} ${c.reasons.join(',')}`);
    }
    if (display.length > 200) console.log(`... and ${display.length - 200} more (use --out to save full list)`);
  }

  // ── Write JSON ───────────────────────────────────────────────────────────
  const out = {
    generated_at: new Date().toISOString(),
    filters: { state: STATE, subcategory: SUBCATEGORY, status: STATUS_FILT },
    summary: { total, byStatus, byStateStatus, bySubStatus, reasonCount },
    clusters: all, // always full set in JSON
  };
  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2));
  console.log(`\nFull report saved to ${OUT_FILE}`);
  console.log(`Use --status=red, --status=yellow, --verbose, or --state=X to drill down.`);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
