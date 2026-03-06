#!/usr/bin/env node
/**
 * Verify correct_answer for all EN car clustered questions using Sonnet.
 *
 * Batches of 5 questions per call with manual RAG context.
 * Propagates correct_answer fixes to ALL language rows via cluster_code.
 * Deletes ALL language rows for invalid questions.
 *
 * Usage:
 *   node scripts/verify-cluster-answers.js --state=washington [--dry-run]
 *   node scripts/verify-cluster-answers.js --all [--parallel=3]
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
const CATEGORY_ARG = process.argv.find(a => a.startsWith('--category='))?.split('=')[1] || 'car';
const PARALLEL_STATES = parseInt(process.argv.find(a => a.startsWith('--parallel='))?.split('=')[1] || '1', 10);
const CONCURRENCY = parseInt(process.argv.find(a => a.startsWith('--concurrency='))?.split('=')[1] || '3', 10);

const MANUALS_DIR = path.join(__dirname, '..', '.manuals-text');
const SONNET_MODEL = 'claude-sonnet-4-6';
const BATCH_SIZE = 5;

if (!SERVICE_KEY) { console.error('Set SUPABASE_SERVICE_ROLE_KEY env var'); process.exit(1); }
if (!ANTHROPIC_KEY) { console.error('Set ANTHROPIC_API_KEY env var'); process.exit(1); }
if (!ALL_STATES && !STATE_ARG) {
  console.error('Specify --state=washington or --all');
  process.exit(1);
}

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

async function supabaseDelete(table, filter) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
    method: 'DELETE',
    headers: {
      apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
      Prefer: 'return=minimal',
    },
  });
  if (!res.ok) throw new Error(`DELETE ${table}: ${res.status} ${await res.text()}`);
}

// ---------------------------------------------------------------------------
// Claude API helpers
// ---------------------------------------------------------------------------

async function callClaude(messages, model = SONNET_MODEL, maxTokens = 4096) {
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

function callClaudeText(prompt, model = SONNET_MODEL, maxTokens = 4096) {
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
// Manual text (RAG)
// ---------------------------------------------------------------------------

const manualCache = {};

function loadManualText(state) {
  if (manualCache[state] !== undefined) return manualCache[state];
  const filePath = path.join(MANUALS_DIR, `${state}-car-en.txt`);
  manualCache[state] = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
  return manualCache[state];
}

function slidingWindowChunks(text, windowWords = 300, overlapWords = 75) {
  const words = text.split(/\s+/);
  const chunks = [];
  let start = 0;
  while (start < words.length) {
    chunks.push(words.slice(start, start + windowWords).join(' '));
    start += windowWords - overlapWords;
  }
  return chunks;
}

function findTopChunks(manualText, question, options, topN = 5) {
  if (!manualText) return [];
  const text = `${question} ${options.join(' ')}`;
  const keywords = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3)
    .filter(w => !['what', 'when', 'which', 'that', 'this', 'your', 'with', 'from', 'have',
      'does', 'should', 'would', 'could', 'must', 'following', 'correct', 'answer',
      'true', 'false', 'none', 'above', 'below', 'both', 'all'].includes(w));

  const chunks = slidingWindowChunks(manualText);
  const scored = chunks.map((c, i) => {
    const lower = c.toLowerCase();
    let score = 0;
    for (const kw of keywords) if (lower.includes(kw)) score++;
    return { text: c, score, index: i };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.filter(s => s.score > 0).slice(0, topN);
}

function buildRagExcerpt(questions, manualText) {
  if (!manualText) return '';
  // Use first question's keywords to find a shared excerpt — good enough for batches
  const q = questions[0];
  const options = [q.option_a, q.option_b, q.option_c, q.option_d].filter(Boolean);
  const chunks = findTopChunks(manualText, q.question_text, options, 3);
  if (chunks.length === 0) return '';
  return '\nManual excerpts for context:\n' +
    chunks.map((c, i) => `[${i + 1}] "${c.text.substring(0, 400)}"`).join('\n\n');
}

// ---------------------------------------------------------------------------
// Progress / rollback helpers
// ---------------------------------------------------------------------------

function progressFilePath(state) {
  return path.join(__dirname, '..', `.verify-cluster-${state}-progress.json`);
}

function rollbackFilePath(state) {
  return path.join(__dirname, '..', `.verify-cluster-${state}-rollback.json`);
}

function loadProgress(state) {
  const f = progressFilePath(state);
  if (fs.existsSync(f)) {
    try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { /* ignore */ }
  }
  return { done: {} };
}

function saveProgress(state, prog) {
  if (DRY_RUN) return; // never write progress in dry-run — would poison real runs
  fs.writeFileSync(progressFilePath(state), JSON.stringify(prog, null, 2));
}

function appendRollback(state, entries) {
  const f = rollbackFilePath(state);
  let existing = [];
  if (fs.existsSync(f)) {
    try { existing = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { /* ignore */ }
  }
  fs.writeFileSync(f, JSON.stringify([...existing, ...entries], null, 2));
}

// ---------------------------------------------------------------------------
// Build verification prompt
// ---------------------------------------------------------------------------

function buildVerifyPrompt(stateName, questions, ragExcerpt) {
  const qList = questions.map(q => {
    const opts = ['A', 'B', 'C', 'D'].map((letter, i) => {
      const opt = [q.option_a, q.option_b, q.option_c, q.option_d][i];
      const marker = i === q.correct_answer ? ' ← MARKED CORRECT' : '';
      return `  ${letter}. ${opt || '(empty)'}${marker}`;
    }).join('\n');
    return `[${q.cluster_code}]\nQ: ${q.question_text}\n${opts}`;
  }).join('\n\n');

  return `You are an expert DMV licensing examiner reviewing questions for the ${stateName} driver knowledge test.
${ragExcerpt}

For each question below, verify whether the marked correct answer is accurate according to standard US traffic law and the ${stateName} driver manual.

Questions:
${qList}

Return a JSON array with one entry per question:
[
  {
    "cluster_code": "wa_car_001",
    "verdict": "correct",
    "correct_index": 2,
    "reason": "brief explanation"
  }
]

Verdict rules:
- "correct" — the marked answer (correct_index) is right as-is
- "wrong" — the marked answer is wrong; provide the actual correct_index (0=A, 1=B, 2=C, 3=D)
- "invalid" — question is ambiguous, nonsensical, has multiple valid answers, or cannot be verified

Return ONLY the JSON array, no markdown, no extra text.`;
}

// ---------------------------------------------------------------------------
// Process one state
// ---------------------------------------------------------------------------

async function processState(state) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`STATE: ${state.toUpperCase()} ${DRY_RUN ? '(DRY RUN)' : ''}`);
  console.log('='.repeat(60));

  const manualText = loadManualText(state);
  const stateName = state.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');

  // Fetch all EN car questions with cluster_code
  console.log('  Fetching EN car clustered questions...');
  const questions = await supabaseGetAll(
    'questions',
    `state=eq.${encodeURIComponent(state)}&category=eq.${CATEGORY_ARG}&language=eq.en&cluster_code=not.is.null&select=id,cluster_code,question_text,option_a,option_b,option_c,option_d,correct_answer`
  );
  console.log(`  Found: ${questions.length} questions`);

  if (questions.length === 0) {
    console.log('  Nothing to process.');
    return { state, processed: 0, correct: 0, fixed: 0, deleted: 0 };
  }

  const progress = loadProgress(state);

  let correct = 0, fixed = 0, deleted = 0, errors = 0;

  // Build batches
  const batches = [];
  for (let i = 0; i < questions.length; i += BATCH_SIZE) {
    batches.push(questions.slice(i, i + BATCH_SIZE));
  }

  const tasks = batches.map((batch, batchIdx) => async () => {
    const batchKey = `batch_${batchIdx}`;
    if (progress.done[batchKey]) {
      // Count cached results
      const cached = progress.done[batchKey];
      correct += cached.correct || 0;
      fixed += cached.fixed || 0;
      deleted += cached.deleted || 0;
      return;
    }

    const ragExcerpt = buildRagExcerpt(batch, manualText);
    const prompt = buildVerifyPrompt(stateName, batch, ragExcerpt);

    let verdicts = null;
    try {
      const text = await callClaudeText(prompt, SONNET_MODEL, 2048);
      verdicts = parseJSON(text);
    } catch (e) {
      console.error(`  ERROR batch ${batchIdx}: ${e.message}`);
      errors++;
      return;
    }

    if (!Array.isArray(verdicts)) {
      console.error(`  PARSE ERROR batch ${batchIdx}: not an array`);
      errors++;
      return;
    }

    let bCorrect = 0, bFixed = 0, bDeleted = 0;

    for (const v of verdicts) {
      const q = batch.find(q => q.cluster_code === v.cluster_code);
      if (!q) continue;

      if (v.verdict === 'correct') {
        bCorrect++;
      } else if (v.verdict === 'wrong' && typeof v.correct_index === 'number' && v.correct_index >= 0 && v.correct_index <= 3) {
        bFixed++;
        if (!DRY_RUN) {
          try {
            // Propagate fix to ALL language rows for this cluster+state+car
            await supabasePatch(
              'questions',
              `cluster_code=eq.${encodeURIComponent(v.cluster_code)}&state=eq.${encodeURIComponent(state)}&category=eq.${CATEGORY_ARG}`,
              { correct_answer: v.correct_index }
            );
          } catch (e) {
            console.error(`  PATCH ERROR (${v.cluster_code}): ${e.message}`);
            errors++;
          }
        }
      } else if (v.verdict === 'invalid') {
        bDeleted++;
        if (!DRY_RUN) {
          // Save rollback snapshot of all language rows before deleting
          try {
            const allLangRows = await supabaseGetAll(
              'questions',
              `cluster_code=eq.${encodeURIComponent(v.cluster_code)}&state=eq.${encodeURIComponent(state)}&category=eq.${CATEGORY_ARG}`
            );
            appendRollback(state, allLangRows.map(r => ({ ...r, _deleted_reason: v.reason })));
            await supabaseDelete(
              'questions',
              `cluster_code=eq.${encodeURIComponent(v.cluster_code)}&state=eq.${encodeURIComponent(state)}&category=eq.${CATEGORY_ARG}`
            );
          } catch (e) {
            console.error(`  DELETE ERROR (${v.cluster_code}): ${e.message}`);
            errors++;
          }
        }
      }
    }

    correct += bCorrect;
    fixed += bFixed;
    deleted += bDeleted;

    progress.done[batchKey] = { correct: bCorrect, fixed: bFixed, deleted: bDeleted };
  });

  let processed = 0;
  for (let i = 0; i < tasks.length; i += CONCURRENCY) {
    await pLimit(CONCURRENCY, tasks.slice(i, i + CONCURRENCY));
    processed = Math.min((i + CONCURRENCY) * BATCH_SIZE, questions.length);
    if ((i + CONCURRENCY) % 10 < CONCURRENCY || i + CONCURRENCY >= tasks.length) {
      process.stdout.write(`  Progress: ~${processed}/${questions.length} | correct: ${correct} | fixed: ${fixed} | deleted: ${deleted}\n`);
      saveProgress(state, progress);
    }
  }
  saveProgress(state, progress);

  const summary = {
    state,
    processed: questions.length,
    correct,
    fixed,
    deleted,
    errors,
    accuracy_before: questions.length > 0 ? ((correct / (correct + fixed + deleted)) * 100).toFixed(1) + '%' : 'n/a',
  };

  console.log(`\n  Done: ${correct} correct | ${fixed} fixed | ${deleted} deleted | ${errors} errors`);
  if (DRY_RUN) console.log('  (DRY RUN — no DB writes)');
  return summary;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function runWithPool(states, parallelN) {
  const results = [];
  let idx = 0;
  async function worker() {
    while (idx < states.length) {
      const state = states[idx++];
      try {
        const r = await processState(state);
        if (r) results.push(r);
      } catch (e) {
        console.error(`\nERROR processing ${state}: ${e.message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: parallelN }, worker));
  return results;
}

async function main() {
  const states = ALL_STATES ? ALL_STATE_SLUGS : [STATE_ARG];

  if (DRY_RUN) console.log('\n*** DRY RUN — no DB changes will be made ***\n');
  if (PARALLEL_STATES > 1) console.log(`Running ${PARALLEL_STATES} states in parallel\n`);
  console.log(`Model: ${SONNET_MODEL} | Batch size: ${BATCH_SIZE}`);

  const results = await runWithPool(states, PARALLEL_STATES);

  if (results.length > 1) {
    const totalQ = results.reduce((s, r) => s + (r.processed || 0), 0);
    const totalCorrect = results.reduce((s, r) => s + (r.correct || 0), 0);
    const totalFixed = results.reduce((s, r) => s + (r.fixed || 0), 0);
    const totalDeleted = results.reduce((s, r) => s + (r.deleted || 0), 0);
    console.log(`\n${'='.repeat(60)}`);
    console.log(`TOTAL: ${totalQ} questions | ${totalCorrect} correct | ${totalFixed} fixed | ${totalDeleted} deleted`);
    console.log(`Fix rate: ${totalQ > 0 ? ((totalFixed / totalQ) * 100).toFixed(1) : 0}%`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
