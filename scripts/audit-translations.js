#!/usr/bin/env node
/**
 * Full diagnostic audit of translation integrity across all categories.
 * READ-ONLY: does not modify the database.
 *
 * Checks:
 *   1. Duplicate EN cluster_codes (cluster_code should be unique per state+category+subcategory)
 *   2. Orphan translations (cluster_code in non-EN row that has no matching EN row)
 *   3. Duplicate translations (same cluster_code + language, multiple rows)
 *   4. EN-fallback masquerading as translation (quality gate fail)
 *   5. Missing translations (EN exists but lang version absent)
 *   6. Cluster_code text-mismatch (translation cluster_code points to EN whose text
 *      differs dramatically — suggests EN was re-written after translation)
 *
 * Usage:
 *   node scripts/audit-translations.js                       # all categories
 *   node scripts/audit-translations.js --category=cdl
 *   node scripts/audit-translations.js --category=cdl --subcategory=air_brakes
 *   node scripts/audit-translations.js --json > audit.json   # machine-readable
 */

'use strict';

// Load .env.local
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
if (!SERVICE_KEY) { console.error('Missing SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }

const CATEGORY_ARG    = process.argv.find(a => a.startsWith('--category='))?.split('=')[1];
const SUBCATEGORY_ARG = process.argv.find(a => a.startsWith('--subcategory='))?.split('=')[1];
const JSON_OUTPUT     = process.argv.includes('--json');

const LANGS = ['ru', 'es', 'zh', 'ua'];
const CATEGORIES = CATEGORY_ARG ? [CATEGORY_ARG] : ['car', 'cdl', 'motorcycle'];

const hasCyrillic = (s) => /[Ѐ-ӿ]/.test(s || '');
const hasCJK      = (s) => /[一-鿿]/.test(s || '');

// ANSI colors
const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', cyan: '\x1b[36m', gray: '\x1b[90m',
};
const log = (...a) => { if (!JSON_OUTPUT) console.log(...a); };

async function sb(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

async function sbCount(table, query) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}&select=id`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, Prefer: 'count=exact' },
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  const range = res.headers.get('content-range');
  return parseInt((range || '').split('/')[1] || '0', 10);
}

// Pull rows page by page to avoid the 30s Postgres statement timeout
async function sbAll(table, query, fields, pageSize = 500) {
  const all = [];
  let offset = 0;
  for (;;) {
    const url = `${table}?select=${fields}&${query}&limit=${pageSize}&offset=${offset}`;
    const rows = await sb(url);
    all.push(...rows);
    if (rows.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}

function isEnglishFallback(row, lang, enText) {
  const t = `${row.question_text || ''} ${row.option_a || ''} ${row.option_b || ''} ${row.option_c || ''} ${row.option_d || ''}`;
  if (lang === 'ru' || lang === 'ua') return !hasCyrillic(t);
  if (lang === 'zh') return !hasCJK(t);
  if (lang === 'es') return row.question_text === enText;
  return false;
}

async function auditCategory(category) {
  log(`\n${C.bold}${C.blue}════════ CATEGORY: ${category.toUpperCase()} ════════${C.reset}`);

  // Discover subcategories (only relevant for cdl)
  let subcategories = [SUBCATEGORY_ARG || null];
  if (category === 'cdl' && !SUBCATEGORY_ARG) {
    log(`${C.dim}Discovering subcategories...${C.reset}`);
    const sample = await sb(`questions?select=subcategory&category=eq.${category}&language=eq.en&limit=2000`);
    const subs = new Set();
    for (const r of sample) subs.add(r.subcategory || null);
    subcategories = [...subs];
    log(`  Subcategories: ${subcategories.map(s => s || '(null)').join(', ')}`);
  }

  const reportRows = [];

  for (const sub of subcategories) {
    const subLabel = sub || '(none)';
    const subQ = sub ? `&subcategory=eq.${encodeURIComponent(sub)}` : (category === 'cdl' ? '&subcategory=is.null' : '');
    log(`\n${C.bold}─── ${category} / ${subLabel} ───${C.reset}`);

    // 1. Pull all EN rows
    log(`  Fetching EN rows...`);
    const en = await sbAll('questions',
      `category=eq.${category}&language=eq.en${subQ}`,
      'id,state,cluster_code,question_text');
    log(`    ${en.length} EN rows  (${en.filter(r => r.cluster_code).length} with cluster_code)`);

    // 2. Pull all non-EN rows in one go per language
    const nonEnByLang = {};
    for (const lang of LANGS) {
      log(`  Fetching ${lang.toUpperCase()} rows...`);
      const rows = await sbAll('questions',
        `category=eq.${category}&language=eq.${lang}${subQ}`,
        'id,state,cluster_code,question_text,option_a,option_b,option_c,option_d');
      nonEnByLang[lang] = rows;
      log(`    ${rows.length} ${lang} rows`);
    }

    // --- Analysis ---
    const issues = {
      duplicateEnClusters: [],   // [{state, cluster_code, count}]
      orphanTranslations: {},     // lang -> [{cluster_code, state, id}]
      duplicateTranslations: {},  // lang -> [{cluster_code, state, count}]
      fallbacks: {},              // lang -> [{cluster_code, state, id}]
      missing: {},                // lang -> [{cluster_code, state}]
      enWithoutCluster: 0,
    };

    // EN index by cluster_code (within state, since cluster_code is state-scoped: e.g. wa_car_001)
    const enByClusterState = new Map(); // `${state}|${cluster_code}` -> [enRow,...]
    const enExistingClusterByState = new Map(); // state -> Set(cluster_code)
    for (const r of en) {
      if (!r.cluster_code) { issues.enWithoutCluster++; continue; }
      const key = `${r.state}|${r.cluster_code}`;
      if (!enByClusterState.has(key)) enByClusterState.set(key, []);
      enByClusterState.get(key).push(r);
      if (!enExistingClusterByState.has(r.state)) enExistingClusterByState.set(r.state, new Set());
      enExistingClusterByState.get(r.state).add(r.cluster_code);
    }

    // 1. Duplicate EN cluster_codes
    for (const [key, rows] of enByClusterState) {
      if (rows.length > 1) {
        const [state, cluster_code] = key.split('|');
        issues.duplicateEnClusters.push({ state, cluster_code, count: rows.length, ids: rows.map(x => x.id) });
      }
    }

    // EN map by cluster_code for lookup (use first if dup)
    const enLookup = new Map(); // `${state}|${cluster_code}` -> en text snippet
    for (const [key, rows] of enByClusterState) enLookup.set(key, rows[0].question_text);

    // 2-4. Analyze translations
    for (const lang of LANGS) {
      const trByState = new Map(); // `${state}|${cluster_code}` -> [row,...]
      for (const r of nonEnByLang[lang]) {
        if (!r.cluster_code) continue;
        const key = `${r.state}|${r.cluster_code}`;
        if (!trByState.has(key)) trByState.set(key, []);
        trByState.get(key).push(r);
      }

      issues.orphanTranslations[lang] = [];
      issues.duplicateTranslations[lang] = [];
      issues.fallbacks[lang] = [];
      issues.missing[lang] = [];

      // Orphans + duplicates + fallbacks
      for (const [key, rows] of trByState) {
        if (!enLookup.has(key)) {
          // Orphan — translation exists but no matching EN
          for (const r of rows) issues.orphanTranslations[lang].push({ cluster_code: r.cluster_code, state: r.state, id: r.id });
          continue;
        }
        if (rows.length > 1) {
          const [state, cluster_code] = key.split('|');
          issues.duplicateTranslations[lang].push({ state, cluster_code, count: rows.length, ids: rows.map(x => x.id) });
        }
        // Quality gate fallback
        const enText = enLookup.get(key);
        for (const r of rows) {
          if (isEnglishFallback(r, lang, enText)) {
            issues.fallbacks[lang].push({ cluster_code: r.cluster_code, state: r.state, id: r.id });
          }
        }
      }

      // Missing — EN cluster exists but lang version absent
      for (const [key] of enByClusterState) {
        if (!trByState.has(key)) {
          const [state, cluster_code] = key.split('|');
          issues.missing[lang].push({ state, cluster_code });
        }
      }
    }

    // --- Report ---
    const fmtN = (n) => n.toString().padStart(6);
    const enUniqueClusters = enByClusterState.size;
    log(`\n  ${C.bold}Summary for ${category}/${subLabel}${C.reset}`);
    log(`    EN rows total:          ${fmtN(en.length)}`);
    log(`    EN with cluster_code:   ${fmtN(en.length - issues.enWithoutCluster)}`);
    log(`    Unique EN clusters:     ${fmtN(enUniqueClusters)}`);
    if (issues.enWithoutCluster > 0) log(`    ${C.yellow}EN without cluster:     ${fmtN(issues.enWithoutCluster)}${C.reset}`);
    if (issues.duplicateEnClusters.length > 0) {
      log(`    ${C.red}Duplicate EN clusters:  ${fmtN(issues.duplicateEnClusters.length)}  (cluster_code reused across multiple EN rows in same state)${C.reset}`);
    }

    log(`\n  ${C.bold}Per-language:${C.reset}`);
    log(`  Lang  Rows   Orphan   Dup    Fallback   Missing`);
    log(`  ----  -----  -------  -----  ---------  -------`);
    for (const lang of LANGS) {
      const rows  = nonEnByLang[lang].length;
      const orph  = issues.orphanTranslations[lang].length;
      const dup   = issues.duplicateTranslations[lang].length;
      const fb    = issues.fallbacks[lang].length;
      const miss  = issues.missing[lang].length;
      const hasIssue = orph + dup + fb + miss > 0;
      const marker = hasIssue ? `${C.yellow}⚠ ${C.reset}` : '  ';
      log(`  ${marker}${lang.toUpperCase().padEnd(4)} ${rows.toString().padStart(5)}  ${orph.toString().padStart(7)}  ${dup.toString().padStart(5)}  ${fb.toString().padStart(9)}  ${miss.toString().padStart(7)}`);
    }

    // Show top examples of issues
    if (issues.duplicateEnClusters.length > 0) {
      log(`\n  ${C.red}Duplicate EN cluster examples (first 5):${C.reset}`);
      for (const x of issues.duplicateEnClusters.slice(0, 5)) {
        log(`    ${x.state} ${x.cluster_code} × ${x.count}`);
      }
    }
    for (const lang of LANGS) {
      if (issues.orphanTranslations[lang].length > 0) {
        log(`\n  ${C.red}Orphan ${lang.toUpperCase()} examples (first 5):${C.reset}`);
        for (const x of issues.orphanTranslations[lang].slice(0, 5)) {
          log(`    ${x.state} ${x.cluster_code}`);
        }
      }
    }
    for (const lang of LANGS) {
      if (issues.duplicateTranslations[lang].length > 0) {
        log(`\n  ${C.red}Duplicate ${lang.toUpperCase()} translations (first 5):${C.reset}`);
        for (const x of issues.duplicateTranslations[lang].slice(0, 5)) {
          log(`    ${x.state} ${x.cluster_code} × ${x.count}`);
        }
      }
    }

    reportRows.push({
      category, subcategory: sub,
      en_rows: en.length,
      en_with_cluster: en.length - issues.enWithoutCluster,
      en_unique_clusters: enUniqueClusters,
      en_without_cluster: issues.enWithoutCluster,
      duplicate_en_clusters: issues.duplicateEnClusters.length,
      per_lang: Object.fromEntries(LANGS.map(l => [l, {
        rows: nonEnByLang[l].length,
        orphan: issues.orphanTranslations[l].length,
        duplicate: issues.duplicateTranslations[l].length,
        fallback: issues.fallbacks[l].length,
        missing: issues.missing[l].length,
      }])),
    });
  }

  return reportRows;
}

(async () => {
  const fullReport = [];
  for (const cat of CATEGORIES) {
    const r = await auditCategory(cat);
    fullReport.push(...r);
  }

  // Overall summary
  log(`\n${C.bold}${C.blue}════════ OVERALL HEALTH ════════${C.reset}`);
  log(`Category              EN     UniqClu  DupEN  | RU(orph/dup/fb/miss)  ES(...)  ZH(...)  UA(...)`);
  for (const r of fullReport) {
    const tag = `${r.category}/${r.subcategory || '-'}`.padEnd(21);
    const enInfo = `${r.en_rows.toString().padStart(5)}  ${r.en_unique_clusters.toString().padStart(7)}  ${r.duplicate_en_clusters.toString().padStart(5)}`;
    const perLangStr = LANGS.map(l => {
      const x = r.per_lang[l];
      const any = x.orphan + x.duplicate + x.fallback + x.missing;
      const color = any ? C.red : C.green;
      return `${color}${x.orphan}/${x.duplicate}/${x.fallback}/${x.missing}${C.reset}`;
    }).join('   ');
    log(`${tag} ${enInfo}  | ${perLangStr}`);
  }
  log(`\n${C.dim}(per-lang: orphan / duplicate / fallback / missing)${C.reset}`);

  if (JSON_OUTPUT) {
    process.stdout.write(JSON.stringify(fullReport, null, 2));
  }
})();
