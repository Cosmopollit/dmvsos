#!/usr/bin/env node
/**
 * Inspect cluster_code duplicates in EN: show the ACTUAL question text of
 * each row sharing a cluster_code, so we can tell whether they are
 *   - Variant A: different questions across subcategories (need rename)
 *   - Variant B: identical duplicates within same subcategory (need delete)
 *   - Variant C: different questions within same subcategory (cluster bug, need re-cluster)
 *
 * READ-ONLY.
 *
 * Usage:
 *   node scripts/inspect-duplicate-clusters.js                       # all problem datasets
 *   node scripts/inspect-duplicate-clusters.js --category=cdl
 *   node scripts/inspect-duplicate-clusters.js --category=cdl --subcategory=air_brakes --n=15
 */

'use strict';

try {
  const fs = require('fs');
  const txt = fs.readFileSync('.env.local', 'utf8');
  for (const line of txt.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch (_) {}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

const CATEGORY     = process.argv.find(a => a.startsWith('--category='))?.split('=')[1];
const SUBCATEGORY  = process.argv.find(a => a.startsWith('--subcategory='))?.split('=')[1];
const N            = parseInt(process.argv.find(a => a.startsWith('--n='))?.split('=')[1] || '10', 10);

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', cyan: '\x1b[36m', gray: '\x1b[90m',
};

async function sb(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

async function sbAll(query, fields, pageSize = 1000) {
  const all = [];
  let offset = 0;
  for (;;) {
    const url = `questions?select=${fields}&${query}&limit=${pageSize}&offset=${offset}`;
    const rows = await sb(url);
    all.push(...rows);
    if (rows.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}

function snippet(s, max = 90) {
  if (!s) return '(empty)';
  s = s.replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max) + '…' : s;
}

function classifyDuplicates(rows) {
  // rows = all EN rows sharing the same (state, cluster_code)
  const subs = new Set(rows.map(r => r.subcategory || '(none)'));
  const texts = new Set(rows.map(r => (r.question_text || '').trim().toLowerCase()));

  if (subs.size > 1) return 'A';             // different subcategories
  if (texts.size === 1) return 'B';          // identical duplicates within one subcategory
  return 'C';                                 // different questions same subcategory
}

async function inspectDataset(category, subcategory) {
  const subLabel = subcategory || '(none)';
  console.log(`\n${C.bold}${C.blue}════════ ${category} / ${subLabel} ════════${C.reset}`);

  let subQ;
  if (subcategory) subQ = `&subcategory=eq.${encodeURIComponent(subcategory)}`;
  else if (category === 'cdl') subQ = ''; // for cdl without subcategory filter we want all subs to see cross-sub dups
  else subQ = '';

  console.log(`  Fetching EN rows...`);
  const en = await sbAll(
    `category=eq.${category}&language=eq.en${subQ}`,
    'id,state,cluster_code,subcategory,question_text'
  );
  console.log(`    ${en.length} EN rows`);

  // Group by (state, cluster_code)
  const byKey = new Map();
  for (const r of en) {
    if (!r.cluster_code) continue;
    const key = `${r.state}|${r.cluster_code}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(r);
  }

  const dups = [...byKey.values()].filter(rows => rows.length > 1);
  console.log(`  Found ${dups.length} cluster_code groups with >1 row\n`);

  if (dups.length === 0) return { category, subcategory, total: 0, A: 0, B: 0, C: 0 };

  // Classify ALL duplicates
  const tally = { A: 0, B: 0, C: 0 };
  for (const rows of dups) {
    tally[classifyDuplicates(rows)]++;
  }

  console.log(`  ${C.bold}Classification of all ${dups.length} duplicate groups:${C.reset}`);
  console.log(`    ${C.green}Variant A (across subcategories — need rename): ${tally.A}${C.reset}`);
  console.log(`    ${C.yellow}Variant B (identical dupes in same subcat — delete): ${tally.B}${C.reset}`);
  console.log(`    ${C.red}Variant C (different questions same subcat — re-cluster): ${tally.C}${C.reset}`);
  console.log();

  // Show N random samples of each variant for human review
  for (const variant of ['A', 'B', 'C']) {
    const samples = dups.filter(rows => classifyDuplicates(rows) === variant);
    if (samples.length === 0) continue;
    // Shuffle and take N
    for (let i = samples.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [samples[i], samples[j]] = [samples[j], samples[i]];
    }
    const show = samples.slice(0, Math.min(N, samples.length));
    const variantLabel = variant === 'A' ? 'A — different subcategories'
                       : variant === 'B' ? 'B — identical text'
                       : 'C — different text, same subcategory';
    const color = variant === 'A' ? C.green : variant === 'B' ? C.yellow : C.red;
    console.log(`  ${C.bold}${color}── Sample of Variant ${variantLabel} (showing ${show.length}/${samples.length}) ──${C.reset}\n`);
    for (const rows of show) {
      const r0 = rows[0];
      console.log(`  ${C.bold}[${r0.state} ${r0.cluster_code}]${C.reset}`);
      for (const r of rows) {
        const sub = r.subcategory || '(no-subcat)';
        console.log(`    ${C.dim}sub=${sub.padEnd(22)} id=${r.id.slice(0, 8)}${C.reset}`);
        console.log(`    Q: ${snippet(r.question_text, 110)}`);
      }
      console.log();
    }
  }

  return { category, subcategory: subLabel, total: dups.length, ...tally };
}

(async () => {
  const datasets = CATEGORY
    ? (CATEGORY === 'cdl' && !SUBCATEGORY
        ? [{ cat: 'cdl', sub: null }] // when only --category=cdl, audit cross-subcat
        : [{ cat: CATEGORY, sub: SUBCATEGORY || null }])
    : [
        { cat: 'car', sub: null },
        { cat: 'cdl', sub: null },          // cross-subcat view
        { cat: 'cdl', sub: 'general_knowledge' },
        { cat: 'cdl', sub: 'air_brakes' },
        { cat: 'cdl', sub: 'combination_vehicles' },
        { cat: 'motorcycle', sub: null },
      ];

  const results = [];
  for (const { cat, sub } of datasets) {
    const r = await inspectDataset(cat, sub);
    results.push(r);
  }

  console.log(`\n${C.bold}${C.blue}════════ FINAL CLASSIFICATION SUMMARY ════════${C.reset}`);
  console.log(`${'Dataset'.padEnd(30)} ${'Total'.padStart(7)} ${'A(rename)'.padStart(10)} ${'B(delete)'.padStart(10)} ${'C(recluster)'.padStart(13)}`);
  for (const r of results) {
    const label = `${r.category}/${r.subcategory || '-'}`.padEnd(30);
    console.log(`${label} ${String(r.total).padStart(7)} ${String(r.A).padStart(10)} ${String(r.B).padStart(10)} ${String(r.C).padStart(13)}`);
  }
})();
