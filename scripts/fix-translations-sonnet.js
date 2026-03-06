#!/usr/bin/env node
/**
 * Review and fix translation quality (grammar, terminology, naturalness) using Sonnet.
 *
 * Pairs EN questions with their translations by cluster_code.
 * Efficient diff approach: Sonnet returns ONLY records with issues and ONLY changed fields.
 *
 * Usage:
 *   node scripts/fix-translations-sonnet.js --state=washington --lang=ru [--dry-run]
 *   node scripts/fix-translations-sonnet.js --all --lang=ru,es,zh,ua [--parallel=3]
 *
 * Requires: SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SUPABASE_URL = 'https://yaogndpgnewqffbjrsgz.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

const DRY_RUN = process.argv.includes('--dry-run');
const ALL_STATES = process.argv.includes('--all');
const STATE_ARG = process.argv.find(a => a.startsWith('--state='))?.split('=')[1];
const LANG_ARG = process.argv.find(a => a.startsWith('--lang='))?.split('=')[1] || 'ru';
const PARALLEL_STATES = parseInt(process.argv.find(a => a.startsWith('--parallel='))?.split('=')[1] || '1', 10);
const CONCURRENCY = parseInt(process.argv.find(a => a.startsWith('--concurrency='))?.split('=')[1] || '3', 10);

const SONNET_MODEL = 'claude-sonnet-4-6';
const BATCH_SIZE = 10;

// Parse comma-separated languages
const TARGET_LANGS = LANG_ARG.split(',').map(l => l.trim()).filter(Boolean);

if (!SERVICE_KEY) { console.error('Set SUPABASE_SERVICE_ROLE_KEY env var'); process.exit(1); }
if (!ANTHROPIC_KEY) { console.error('Set ANTHROPIC_API_KEY env var'); process.exit(1); }
if (!ALL_STATES && !STATE_ARG) {
  console.error('Specify --state=washington or --all');
  process.exit(1);
}

const VALID_LANGS = ['ru', 'es', 'zh', 'ua'];
for (const lang of TARGET_LANGS) {
  if (!VALID_LANGS.includes(lang)) {
    console.error(`Invalid language: ${lang}. Valid: ${VALID_LANGS.join(', ')}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Language display names for prompt context
// ---------------------------------------------------------------------------

const LANG_NAMES = {
  ru: 'Russian',
  es: 'Spanish',
  zh: 'Chinese (Simplified)',
  ua: 'Ukrainian',
};

// ---------------------------------------------------------------------------
// State map
// ---------------------------------------------------------------------------

const STATE_ABBR = {
  'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR',
  'california': 'CA', 'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE',
  'florida': 'FL', 'georgia': 'GA', 'hawaii': 'HI', 'idaho': 'ID',
  'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA', 'kansas': 'KS',
  'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
  'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS',
  'missouri': 'MO', 'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV',
  'new-hampshire': 'NH', 'new-jersey': 'NJ', 'new-mexico': 'NM', 'new-york': 'NY',
  'north-carolina': 'NC', 'north-dakota': 'ND', 'ohio': 'OH', 'oklahoma': 'OK',
  'oregon': 'OR', 'pennsylvania': 'PA', 'rhode-island': 'RI', 'south-carolina': 'SC',
  'south-dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT',
  'vermont': 'VT', 'virginia': 'VA', 'washington': 'WA', 'west-virginia': 'WV',
  'wisconsin': 'WI', 'wyoming': 'WY',
};

const ALL_STATE_SLUGS = Object.keys(STATE_ABBR);

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function pLimit(concurrency, tasks) {
  const results = [];
  let i = 0;
  async function worker() {
    while (i < tasks.length) {
      const idx = i++;
      results[idx] = await tasks[idx]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));
  return results;
}

// ---------------------------------------------------------------------------
// Supabase helpers
// ---------------------------------------------------------------------------

async function supabaseGet(table, params = '', { offset = 0, limit = 1000 } = {}) {
  const sep = params ? '&' : '';
  const url = `${SUPABASE_URL}/rest/v1/${table}?${params}${sep}offset=${offset}&limit=${limit}`;
  const res = await fetch(url, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!res.ok) throw new Error(`GET ${table}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function supabaseGetAll(table, params = '') {
  const PAGE = 1000;
  let all = [], offset = 0;
  while (true) {
    const batch = await supabaseGet(table, params, { offset, limit: PAGE });
    all = all.concat(batch);
    if (batch.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

async function supabasePatch(table, filter, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
    method: 'PATCH',
    headers: {
      apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json', Prefer: 'return=minimal',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PATCH ${table}: ${res.status} ${await res.text()}`);
}

// ---------------------------------------------------------------------------
// Claude API helpers
// ---------------------------------------------------------------------------

async function callClaude(messages, model = SONNET_MODEL, maxTokens = 8192) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model, max_tokens: maxTokens, messages }),
  });

  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get('retry-after') || '30', 10);
    console.log(`\n  Rate limited, waiting ${retryAfter}s...`);
    await sleep(retryAfter * 1000);
    return callClaude(messages, model, maxTokens);
  }
  if (res.status === 529) {
    console.log('\n  API overloaded, waiting 60s...');
    await sleep(60000);
    return callClaude(messages, model, maxTokens);
  }
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data.content?.[0]?.text || '';
}

function callClaudeText(prompt, model = SONNET_MODEL, maxTokens = 8192) {
  return callClaude([{ role: 'user', content: prompt }], model, maxTokens);
}

function parseJSON(text) {
  const clean = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  try {
    return JSON.parse(clean);
  } catch {
    const m = clean.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (m) {
      try { return JSON.parse(m[1]); } catch { /* fall through */ }
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// Progress helpers
// ---------------------------------------------------------------------------

function progressFilePath(state, lang) {
  return path.join(__dirname, '..', `.fix-translations-${state}-${lang}-progress.json`);
}

function loadProgress(state, lang) {
  const f = progressFilePath(state, lang);
  if (fs.existsSync(f)) {
    try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { /* ignore */ }
  }
  return { done: {}, stats: { reviewed: 0, fixed: 0, ok: 0 } };
}

function saveProgress(state, lang, prog) {
  if (DRY_RUN) return; // never write progress in dry-run — would poison real runs
  fs.writeFileSync(progressFilePath(state, lang), JSON.stringify(prog, null, 2));
}

// ---------------------------------------------------------------------------
// Build translation review prompt
// ---------------------------------------------------------------------------

const FIELDS = ['question_text', 'option_a', 'option_b', 'option_c', 'option_d', 'explanation'];

function buildTranslationPrompt(langName, pairs) {
  const pairList = pairs.map(({ en, tr }) => {
    const lines = [
      `[${en.cluster_code}]`,
      `EN question: ${en.question_text}`,
      `EN options: A) ${en.option_a} | B) ${en.option_b} | C) ${en.option_c} | D) ${en.option_d}`,
    ];
    if (en.explanation) lines.push(`EN explanation: ${en.explanation}`);
    lines.push(
      `${langName} question: ${tr.question_text || '(missing)'}`,
      `${langName} options: A) ${tr.option_a || '(missing)'} | B) ${tr.option_b || '(missing)'} | C) ${tr.option_c || '(missing)'} | D) ${tr.option_d || '(missing)'}`,
    );
    if (tr.explanation) lines.push(`${langName} explanation: ${tr.explanation}`);
    return lines.join('\n');
  }).join('\n\n---\n\n');

  return `You are a professional translator reviewing ${langName} translations of US DMV driver knowledge test questions.

For each pair below, check the ${langName} translation for:
1. Accuracy — does it match the English meaning exactly?
2. Grammar — is it grammatically correct in ${langName}?
3. Terminology — are driving/traffic terms translated correctly for ${langName}-speaking countries?
4. Naturalness — does it read naturally (not like machine translation)?

${pairList}

IMPORTANT: Return a JSON array containing ONLY entries that need fixes.
If a translation is perfect, do NOT include it in the output.
For entries that need fixes, include ONLY the fields that need changing.

Format:
[
  {
    "cluster_code": "wa_car_001",
    "question_text": "fixed question in ${langName}",
    "option_b": "fixed option B in ${langName}"
  }
]

If all translations are acceptable, return an empty array: []
Return ONLY the JSON array, no markdown, no explanation.`;
}

// ---------------------------------------------------------------------------
// Process one state + language combination
// ---------------------------------------------------------------------------

async function processStateLang(state, lang) {
  const langName = LANG_NAMES[lang] || lang;
  console.log(`\n${'='.repeat(60)}`);
  console.log(`STATE: ${state.toUpperCase()} | LANG: ${lang.toUpperCase()} (${langName}) ${DRY_RUN ? '(DRY RUN)' : ''}`);
  console.log('='.repeat(60));

  // Fetch EN questions (source of truth)
  console.log('  Fetching EN source questions...');
  const enQuestions = await supabaseGetAll(
    'questions',
    `state=eq.${encodeURIComponent(state)}&category=eq.car&language=eq.en&cluster_code=not.is.null&select=id,cluster_code,question_text,option_a,option_b,option_c,option_d,explanation`
  );

  if (enQuestions.length === 0) {
    console.log('  No EN questions found, skipping.');
    return { state, lang, processed: 0, fixed: 0, ok: 0 };
  }

  // Build lookup by cluster_code
  const enByCode = new Map(enQuestions.map(q => [q.cluster_code, q]));
  const clusterCodes = [...enByCode.keys()];

  // Fetch target language questions
  console.log(`  Fetching ${langName} translations...`);
  const trQuestions = await supabaseGetAll(
    'questions',
    `state=eq.${encodeURIComponent(state)}&category=eq.car&language=eq.${lang}&cluster_code=not.is.null&select=id,cluster_code,question_text,option_a,option_b,option_c,option_d,explanation`
  );

  const trByCode = new Map(trQuestions.map(q => [q.cluster_code, q]));
  console.log(`  EN: ${enQuestions.length} | ${langName}: ${trQuestions.length}`);

  // Only process clusters that have both EN and translation
  const pairedCodes = clusterCodes.filter(c => trByCode.has(c));
  console.log(`  Paired clusters: ${pairedCodes.length}`);

  if (pairedCodes.length === 0) {
    console.log('  No paired clusters found.');
    return { state, lang, processed: 0, fixed: 0, ok: 0 };
  }

  const progress = loadProgress(state, lang);

  let fixed = 0, ok = 0, errors = 0;

  // Build batches from paired codes
  const batches = [];
  for (let i = 0; i < pairedCodes.length; i += BATCH_SIZE) {
    batches.push(pairedCodes.slice(i, i + BATCH_SIZE));
  }

  const tasks = batches.map((batchCodes, batchIdx) => async () => {
    const batchKey = `batch_${batchIdx}`;
    if (progress.done[batchKey]) {
      ok += progress.done[batchKey].ok || 0;
      fixed += progress.done[batchKey].fixed || 0;
      return;
    }

    const pairs = batchCodes.map(code => ({
      en: enByCode.get(code),
      tr: trByCode.get(code),
    }));

    const prompt = buildTranslationPrompt(langName, pairs);

    let fixes = null;
    try {
      const text = await callClaudeText(prompt, SONNET_MODEL, 8192);
      fixes = parseJSON(text);
    } catch (e) {
      console.error(`  ERROR batch ${batchIdx}: ${e.message}`);
      errors++;
      return;
    }

    if (!Array.isArray(fixes)) {
      console.error(`  PARSE ERROR batch ${batchIdx}: not an array`);
      errors++;
      return;
    }

    let bFixed = 0;

    for (const fix of fixes) {
      if (!fix.cluster_code) continue;
      const trRow = trByCode.get(fix.cluster_code);
      if (!trRow) continue;

      // Only patch valid FIELDS that changed
      const patchBody = {};
      for (const field of FIELDS) {
        if (fix[field] !== undefined && fix[field] !== trRow[field]) {
          patchBody[field] = fix[field];
        }
      }

      if (Object.keys(patchBody).length === 0) continue;

      bFixed++;
      if (!DRY_RUN) {
        try {
          await supabasePatch('questions', `id=eq.${trRow.id}`, patchBody);
        } catch (e) {
          console.error(`  PATCH ERROR (${fix.cluster_code}): ${e.message}`);
          errors++;
        }
      }
    }

    const bOk = batchCodes.length - bFixed;
    ok += bOk;
    fixed += bFixed;

    progress.done[batchKey] = { ok: bOk, fixed: bFixed };
    progress.stats.reviewed += batchCodes.length;
    progress.stats.fixed += bFixed;
    progress.stats.ok += bOk;
  });

  let processed = 0;
  for (let i = 0; i < tasks.length; i += CONCURRENCY) {
    await pLimit(CONCURRENCY, tasks.slice(i, i + CONCURRENCY));
    processed = Math.min((i + CONCURRENCY) * BATCH_SIZE, pairedCodes.length);
    if ((i + CONCURRENCY) % 10 < CONCURRENCY || i + CONCURRENCY >= tasks.length) {
      process.stdout.write(`  Progress: ~${processed}/${pairedCodes.length} | fixed: ${fixed} | ok: ${ok}\n`);
      saveProgress(state, lang, progress);
    }
  }
  saveProgress(state, lang, progress);

  const summary = { state, lang, processed: pairedCodes.length, fixed, ok, errors };
  console.log(`\n  Done: ${fixed} fixed | ${ok} ok | ${errors} errors`);
  if (DRY_RUN) console.log('  (DRY RUN — no DB writes)');
  return summary;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function runWithPool(stateLangPairs, parallelN) {
  const results = [];
  let idx = 0;
  async function worker() {
    while (idx < stateLangPairs.length) {
      const { state, lang } = stateLangPairs[idx++];
      try {
        const r = await processStateLang(state, lang);
        if (r) results.push(r);
      } catch (e) {
        console.error(`\nERROR processing ${state}/${lang}: ${e.message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: parallelN }, worker));
  return results;
}

async function main() {
  const states = ALL_STATES ? ALL_STATE_SLUGS : [STATE_ARG];

  if (DRY_RUN) console.log('\n*** DRY RUN — no DB changes will be made ***\n');
  if (PARALLEL_STATES > 1) console.log(`Running ${PARALLEL_STATES} state/lang pairs in parallel\n`);
  console.log(`Model: ${SONNET_MODEL} | Languages: ${TARGET_LANGS.join(', ')} | Batch size: ${BATCH_SIZE}`);

  // Expand state × lang pairs, langs iterate fastest so same-state calls are spaced out
  const pairs = [];
  for (const state of states) {
    for (const lang of TARGET_LANGS) {
      pairs.push({ state, lang });
    }
  }

  const results = await runWithPool(pairs, PARALLEL_STATES);

  if (results.length > 1) {
    // Summary per language
    for (const lang of TARGET_LANGS) {
      const langResults = results.filter(r => r.lang === lang);
      const totalProc = langResults.reduce((s, r) => s + (r.processed || 0), 0);
      const totalFixed = langResults.reduce((s, r) => s + (r.fixed || 0), 0);
      if (totalProc > 0) {
        console.log(`\n${LANG_NAMES[lang]}: ${totalProc} reviewed | ${totalFixed} fixed (${((totalFixed / totalProc) * 100).toFixed(1)}%)`);
      }
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
