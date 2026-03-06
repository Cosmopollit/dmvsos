#!/usr/bin/env node
/**
 * Translate clustered EN car questions to RU, ES, ZH, UA.
 *
 * Workflow:
 *   1. Fetch all EN car questions for state that have cluster_code
 *   2. Translate each to RU, ES, ZH, UA in batches (Haiku)
 *   3. Delete old non-EN car questions for that state
 *   4. Insert new translations with matching cluster_code
 *
 * Usage:
 *   node scripts/translate-cluster.js --state=washington [--dry-run] [--lang=ru]
 *   node scripts/translate-cluster.js --all
 *
 * Requires: SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY
 */

'use strict';

const fs = require('fs');
const path = require('path');

const SUPABASE_URL  = 'https://yaogndpgnewqffbjrsgz.supabase.co';
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

const DRY_RUN    = process.argv.includes('--dry-run');
const ALL_STATES = process.argv.includes('--all');
const STATE_ARG  = process.argv.find(a => a.startsWith('--state='))?.split('=')[1];
const LANG_ARG   = process.argv.find(a => a.startsWith('--lang='))?.split('=')[1];
const CONCURRENCY = parseInt(process.argv.find(a => a.startsWith('--concurrency='))?.split('=')[1] || '5', 10);
const PARALLEL_STATES = parseInt(process.argv.find(a => a.startsWith('--parallel='))?.split('=')[1] || '1', 10);

const HAIKU_MODEL = 'claude-haiku-4-5-20251001';
const BATCH_SIZE     = 20; // questions per translation batch
const BATCH_SIZE_ZH  = 10; // smaller batch for Chinese (more tokens per char)
const LANGS       = LANG_ARG ? [LANG_ARG] : ['ru', 'es', 'zh', 'ua'];

const LANG_NAMES = {
  ru: 'Russian',
  es: 'Spanish',
  zh: 'Chinese (Simplified)',
  ua: 'Ukrainian',
};

const STATE_MAP = {
  'alabama': 'al', 'alaska': 'ak', 'arizona': 'az', 'arkansas': 'ar',
  'california': 'ca', 'colorado': 'co', 'connecticut': 'ct', 'delaware': 'de',
  'florida': 'fl', 'georgia': 'ga', 'hawaii': 'hi', 'idaho': 'id',
  'illinois': 'il', 'indiana': 'in', 'iowa': 'ia', 'kansas': 'ks',
  'kentucky': 'ky', 'louisiana': 'la', 'maine': 'me', 'maryland': 'md',
  'massachusetts': 'ma', 'michigan': 'mi', 'minnesota': 'mn', 'mississippi': 'ms',
  'missouri': 'mo', 'montana': 'mt', 'nebraska': 'ne', 'nevada': 'nv',
  'new-hampshire': 'nh', 'new-jersey': 'nj', 'new-mexico': 'nm', 'new-york': 'ny',
  'north-carolina': 'nc', 'north-dakota': 'nd', 'ohio': 'oh', 'oklahoma': 'ok',
  'oregon': 'or', 'pennsylvania': 'pa', 'rhode-island': 'ri', 'south-carolina': 'sc',
  'south-dakota': 'sd', 'tennessee': 'tn', 'texas': 'tx', 'utah': 'ut',
  'vermont': 'vt', 'virginia': 'va', 'washington': 'wa', 'west-virginia': 'wv',
  'wisconsin': 'wi', 'wyoming': 'wy',
};

const ALL_STATE_SLUGS = Object.keys(STATE_MAP);

if (!SERVICE_KEY)   { console.error('Set SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
if (!ANTHROPIC_KEY) { console.error('Set ANTHROPIC_API_KEY');         process.exit(1); }
if (!ALL_STATES && !STATE_ARG) {
  console.error('Specify --state=<slug> or --all');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function progressFile(state) { return path.join(__dirname, '..', `.translate-cluster-${state}-progress.json`); }

function loadProgress(state) {
  const f = progressFile(state);
  if (fs.existsSync(f)) {
    try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { /* ignore */ }
  }
  return { done: {} }; // done[lang] = true when lang is fully inserted
}

function saveProgress(state, prog) {
  fs.writeFileSync(progressFile(state), JSON.stringify(prog, null, 2));
}

// ---------------------------------------------------------------------------
// Supabase helpers
// ---------------------------------------------------------------------------

async function supabaseGetAll(table, params = '') {
  const PAGE = 1000;
  let all = [], offset = 0;
  while (true) {
    const sep = params ? '&' : '';
    const url = `${SUPABASE_URL}/rest/v1/${table}?${params}${sep}offset=${offset}&limit=${PAGE}`;
    const res = await fetch(url, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    });
    if (!res.ok) throw new Error(`GET ${table}: ${res.status} ${await res.text()}`);
    const batch = await res.json();
    all = all.concat(batch);
    if (batch.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

async function supabaseDelete(table, filter) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
    method: 'DELETE',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, Prefer: 'return=minimal' },
  });
  if (!res.ok) throw new Error(`DELETE ${table}: ${res.status} ${await res.text()}`);
}

async function supabaseInsertBatch(table, rows) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json', Prefer: 'return=minimal',
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`INSERT ${table}: ${res.status} ${await res.text()}`);
}

// ---------------------------------------------------------------------------
// Claude helpers
// ---------------------------------------------------------------------------

async function callClaude(messages, maxTokens = 8192) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: HAIKU_MODEL, max_tokens: maxTokens, messages }),
  });

  if (res.status === 429) {
    const wait = parseInt(res.headers.get('retry-after') || '30', 10);
    console.log(`\n  Rate limited, waiting ${wait}s...`);
    await sleep(wait * 1000);
    return callClaude(messages, maxTokens);
  }
  if (res.status === 529) {
    console.log('\n  Overloaded, waiting 60s...');
    await sleep(60000);
    return callClaude(messages, maxTokens);
  }
  if (!res.ok) throw new Error(`Claude API ${res.status}: ${await res.text()}`);

  const data = await res.json();
  return data.content?.[0]?.text || '';
}

function parseJSON(text) {
  const cleaned = text.replace(/```(?:json)?\s*/g, '').replace(/```\s*/g, '').trim();
  try { return JSON.parse(cleaned); } catch { /* fall through */ }
  const match = cleaned.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
  if (match) { try { return JSON.parse(match[1]); } catch { /* fall through */ } }
  return null;
}

// ---------------------------------------------------------------------------
// Translation
// ---------------------------------------------------------------------------

function buildTranslatePrompt(questions, langName) {
  const input = questions.map(q => ({
    id: q.id,
    question_text: q.question_text,
    option_a: q.option_a,
    option_b: q.option_b,
    option_c: q.option_c,
    option_d: q.option_d,
    explanation: q.explanation || null,
  }));

  return `Translate the following US DMV car driving test questions from English to ${langName}.

Rules:
- Translate ONLY: question_text, option_a, option_b, option_c, option_d, explanation
- Keep the same JSON structure and all field names in English
- Keep the "id" field exactly as-is (do not translate)
- Do NOT translate: abbreviations (DMV, CDL, BAC, mph, ft), proper nouns, URLs
- If explanation is null, keep it null
- Use natural, fluent ${langName} — not word-for-word translation
- For road signs and traffic terms, use standard ${langName} traffic vocabulary
- Return ONLY a valid JSON array, no markdown, no explanation

Input:
${JSON.stringify(input, null, 2)}`;
}

async function translateOne(q, langName) {
  const prompt = `Translate this US DMV test question from English to ${langName}.

Return a single JSON object (not an array) with these fields:
question_text, option_a, option_b, option_c, option_d, explanation

Do NOT translate: DMV, CDL, BAC, mph, ft, abbreviations, URLs.
If explanation is null keep it null.
Return ONLY valid JSON, no markdown.

Input:
Question: ${q.question_text}
A: ${q.option_a}
B: ${q.option_b}
C: ${q.option_c}
D: ${q.option_d}
Explanation: ${q.explanation || 'null'}`;

  const raw = await callClaude([{ role: 'user', content: prompt }], 2048);
  const result = parseJSON(raw);
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('Expected JSON object');
  if (!result.question_text) throw new Error('Missing question_text');
  return { id: q.id, ...result };
}

async function translateBatch(questions, targetLang) {
  const langName = LANG_NAMES[targetLang];
  // Chinese uses more tokens per character — use higher limit
  const maxTokens = targetLang === 'zh' ? 32000 : 16000;
  const prompt = buildTranslatePrompt(questions, langName);

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const raw = await callClaude([{ role: 'user', content: prompt }], maxTokens);
      const result = parseJSON(raw);
      if (!Array.isArray(result)) throw new Error('Expected JSON array');
      if (result.length !== questions.length) throw new Error(`Got ${result.length}, expected ${questions.length}`);
      return result;
    } catch (e) {
      if (attempt === 3) {
        // Final fallback: translate one by one
        console.log(`\n    Batch failed, falling back to one-by-one translation...`);
        const results = [];
        for (const q of questions) {
          try {
            results.push(await translateOne(q, langName));
          } catch (err) {
            console.log(`\n    WARNING: Failed to translate q.${q.id}: ${err.message}, using EN`);
            results.push({
              id: q.id,
              question_text: q.question_text,
              option_a: q.option_a,
              option_b: q.option_b,
              option_c: q.option_c,
              option_d: q.option_d,
              explanation: q.explanation || null,
            });
          }
        }
        return results;
      }
      console.log(`\n    Retry ${attempt}/3 for ${langName} batch: ${e.message}`);
      await sleep(3000 * attempt);
    }
  }
}

// ---------------------------------------------------------------------------
// Main: process one state
// ---------------------------------------------------------------------------

async function processState(state) {
  console.log(`\n====== ${state.toUpperCase()} ======`);
  const prog = loadProgress(state);

  // Fetch EN questions with cluster_code
  console.log('  Fetching EN clustered questions...');
  const enQuestions = await supabaseGetAll(
    'questions',
    `state=eq.${encodeURIComponent(state)}&category=eq.car&language=eq.en&cluster_code=not.is.null`
  );
  console.log(`  Found ${enQuestions.length} EN questions with cluster_code`);

  if (enQuestions.length === 0) {
    console.log('  No clustered EN questions found — run cluster-questions.js first');
    return;
  }

  for (const lang of LANGS) {
    if (prog.done[lang]) {
      console.log(`  ${lang.toUpperCase()}: already done, skipping`);
      continue;
    }

    console.log(`\n  Translating to ${LANG_NAMES[lang]} (${lang})...`);

    // Translate in batches (smaller batch for Chinese)
    const batchSize = lang === 'zh' ? BATCH_SIZE_ZH : BATCH_SIZE;
    const translated = [];
    for (let i = 0; i < enQuestions.length; i += batchSize) {
      const batch = enQuestions.slice(i, i + batchSize);
      process.stdout.write(`    Batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(enQuestions.length / batchSize)}...`);
      const result = await translateBatch(batch, lang);
      translated.push(...result);
      process.stdout.write(` ok\n`);
    }

    // Build rows to insert — inherit non-translatable fields from EN
    const rows = enQuestions.map((en, idx) => {
      const t = translated[idx] || {};
      return {
        state:          en.state,
        category:       en.category,
        language:       lang,
        cluster_code:   en.cluster_code,
        question_text:  t.question_text  || en.question_text,
        option_a:       t.option_a       || en.option_a,
        option_b:       t.option_b       || en.option_b,
        option_c:       t.option_c       || en.option_c,
        option_d:       t.option_d       || en.option_d,
        correct_answer: en.correct_answer,  // never translate answer index
        explanation:    t.explanation    || null,
        image_url:      en.image_url     || null,
        manual_reference: en.manual_reference || null,
        manual_section: en.manual_section || null,
        needs_image:    en.needs_image   || false,
        manual_version: en.manual_version || null,
      };
    });

    if (DRY_RUN) {
      console.log(`    [dry-run] Would delete old ${lang} questions and insert ${rows.length} new ones`);
      console.log(`    Sample: "${rows[0]?.question_text?.substring(0, 80)}..."`);
      continue;
    }

    // Delete old translations for this state/category/lang
    console.log(`    Deleting old ${lang} questions...`);
    await supabaseDelete(
      'questions',
      `state=eq.${encodeURIComponent(state)}&category=eq.car&language=eq.${lang}`
    );

    // Insert new translations in batches of 100
    console.log(`    Inserting ${rows.length} translated questions...`);
    for (let i = 0; i < rows.length; i += 100) {
      await supabaseInsertBatch('questions', rows.slice(i, i + 100));
    }
    console.log(`    ${lang.toUpperCase()} done: ${rows.length} questions inserted`);

    prog.done[lang] = true;
    saveProgress(state, prog);
  }

  console.log(`\n  ${state} translations complete!`);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main() {
  console.log(`translate-cluster.js${DRY_RUN ? ' [DRY RUN]' : ''}`);
  console.log(`Languages: ${LANGS.join(', ')}`);

  const states = (ALL_STATES ? ALL_STATE_SLUGS : [STATE_ARG]).filter(s => STATE_MAP[s]);
  if (PARALLEL_STATES > 1) console.log(`Running ${PARALLEL_STATES} states in parallel\n`);

  let idx = 0;
  async function worker() {
    while (idx < states.length) {
      const state = states[idx++];
      try { await processState(state); }
      catch (err) { console.error(`ERROR ${state}: ${err.message}`); }
    }
  }
  await Promise.all(Array.from({ length: PARALLEL_STATES }, worker));

  console.log('\nAll done.');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
