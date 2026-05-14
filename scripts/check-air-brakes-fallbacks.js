#!/usr/bin/env node
/**
 * Diagnostic-only: count air_brakes questions in non-EN languages that still
 * contain English text (EN-fallback from a failed translation run).
 *
 * Read-only. Does NOT modify the database.
 *
 * Usage:
 *   node scripts/check-air-brakes-fallbacks.js
 *   node scripts/check-air-brakes-fallbacks.js --state=wyoming
 *   node scripts/check-air-brakes-fallbacks.js --details   # print sample IDs per state
 */

'use strict';

// Lightweight .env.local loader (no dotenv dep)
try {
  const fs = require('fs');
  const txt = fs.readFileSync('.env.local', 'utf8');
  for (const line of txt.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch (_) {}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://yaogndpgnewqffbjrsgz.supabase.co';
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SERVICE_KEY) { console.error('Missing SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }

const STATE_ARG = process.argv.find(a => a.startsWith('--state='))?.split('=')[1];
const DETAILS   = process.argv.includes('--details');

async function sbGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  return res.json();
}

async function sbGetAll(table, query) {
  const PAGE = 1000;
  let offset = 0;
  const all = [];
  while (true) {
    const rows = await sbGet(`${table}?${query}&limit=${PAGE}&offset=${offset}`);
    all.push(...rows);
    if (rows.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

const hasCyrillic = (s) => /[Ѐ-ӿ]/.test(s || '');
const hasCJK      = (s) => /[　-鿿]/.test(s || '');

function isLikelyEnglishFallback(row, lang, enByCluster) {
  const text = `${row.question_text} ${row.option_a} ${row.option_b} ${row.option_c} ${row.option_d}`;
  if (lang === 'ru' || lang === 'ua') return !hasCyrillic(text);
  if (lang === 'zh') return !hasCJK(text);
  if (lang === 'es') {
    // ES is Latin-1 like EN — compare against EN twin by cluster_code
    if (!row.cluster_code) return false;
    const en = enByCluster.get(row.cluster_code);
    if (!en) return false;
    return row.question_text === en.question_text;
  }
  return false;
}

(async () => {
  const stateFilter = STATE_ARG ? `&state=eq.${encodeURIComponent(STATE_ARG)}` : '';

  // 1. Pull EN twins (only need cluster_code + question_text) for ES comparison
  console.log('Fetching EN air_brakes (for ES comparison)...');
  const enRows = await sbGetAll(
    'questions',
    `select=id,cluster_code,question_text,state&category=eq.cdl&subcategory=eq.air_brakes&language=eq.en${stateFilter}`
  );
  const enByCluster = new Map();
  for (const r of enRows) if (r.cluster_code) enByCluster.set(r.cluster_code, r);
  console.log(`  ${enRows.length} EN rows, ${enByCluster.size} with cluster_code\n`);

  const summary = {}; // state -> { lang: { total, fallback } }

  for (const lang of ['ru', 'es', 'zh', 'ua']) {
    console.log(`Scanning language=${lang}...`);
    const rows = await sbGetAll(
      'questions',
      `select=id,state,cluster_code,question_text,option_a,option_b,option_c,option_d&category=eq.cdl&subcategory=eq.air_brakes&language=eq.${lang}${stateFilter}`
    );
    console.log(`  ${rows.length} rows in ${lang}`);

    for (const r of rows) {
      const s = r.state;
      summary[s] = summary[s] || {};
      summary[s][lang] = summary[s][lang] || { total: 0, fallback: 0, sampleIds: [] };
      summary[s][lang].total++;
      if (isLikelyEnglishFallback(r, lang, enByCluster)) {
        summary[s][lang].fallback++;
        if (summary[s][lang].sampleIds.length < 3) summary[s][lang].sampleIds.push(r.id);
      }
    }
  }

  // Print report
  console.log('\n=== EN-FALLBACK REPORT (air_brakes) ===\n');
  console.log('State                  RU            ES            ZH            UA');
  console.log('-----                  --            --            --            --');
  const states = Object.keys(summary).sort();
  const totals = { ru: { f: 0, t: 0 }, es: { f: 0, t: 0 }, zh: { f: 0, t: 0 }, ua: { f: 0, t: 0 } };
  let affectedStates = 0;

  for (const s of states) {
    const cells = ['ru', 'es', 'zh', 'ua'].map((l) => {
      const x = summary[s][l] || { total: 0, fallback: 0 };
      totals[l].f += x.fallback;
      totals[l].t += x.total;
      return `${x.fallback}/${x.total}`.padEnd(13);
    });
    const anyFb = ['ru', 'es', 'zh', 'ua'].some((l) => (summary[s][l]?.fallback || 0) > 0);
    if (anyFb) affectedStates++;
    const marker = anyFb ? '! ' : '  ';
    console.log(`${marker}${s.padEnd(20)} ${cells.join(' ')}`);
  }

  console.log('-----                  --            --            --            --');
  const totalLine = ['ru', 'es', 'zh', 'ua'].map(l => `${totals[l].f}/${totals[l].t}`.padEnd(13));
  console.log(`  TOTAL                ${totalLine.join(' ')}`);
  console.log(`\n${affectedStates} state(s) have at least one EN-fallback row.\n`);

  if (DETAILS) {
    console.log('\n=== SAMPLE IDs (per state/lang with fallbacks) ===\n');
    for (const s of states) {
      for (const l of ['ru', 'es', 'zh', 'ua']) {
        const x = summary[s][l];
        if (x && x.fallback > 0) {
          console.log(`  ${s} ${l}: ${x.sampleIds.join(', ')}`);
        }
      }
    }
  }
})();
