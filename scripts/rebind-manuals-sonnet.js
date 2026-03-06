#!/usr/bin/env node
/**
 * Re-run manual binding with Sonnet (Phase 5 of cluster-questions used Haiku — ~28% miss rate).
 *
 * Larger sliding window (300 words / 75 overlap), top 7 chunks, confidence filter.
 * Only patches manual_reference + manual_section on the EN row.
 *
 * Usage:
 *   node scripts/rebind-manuals-sonnet.js --state=washington [--dry-run] [--missing-only]
 *   node scripts/rebind-manuals-sonnet.js --all [--missing-only] [--parallel=3]
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
const MISSING_ONLY = process.argv.includes('--missing-only');
const STATE_ARG = process.argv.find(a => a.startsWith('--state='))?.split('=')[1];
const CONCURRENCY = parseInt(process.argv.find(a => a.startsWith('--concurrency='))?.split('=')[1] || '3', 10);
const PARALLEL_STATES = parseInt(process.argv.find(a => a.startsWith('--parallel='))?.split('=')[1] || '1', 10);
const CATEGORY_ARG = process.argv.find(a => a.startsWith('--category='))?.split('=')[1] || 'car';

const MANUALS_DIR = path.join(__dirname, '..', '.manuals-text');
const SONNET_MODEL = 'claude-sonnet-4-6';

// Larger window than Haiku's 200/50 for better context
const WINDOW_WORDS = 300;
const OVERLAP_WORDS = 75;
const TOP_CHUNKS = 7;

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
  const filePath = path.join(MANUALS_DIR, `${state}-${CATEGORY_ARG}-en.txt`);
  manualCache[state] = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
  return manualCache[state];
}

function slidingWindowChunks(text, windowWords = WINDOW_WORDS, overlapWords = OVERLAP_WORDS) {
  const words = text.split(/\s+/);
  const chunks = [];
  let start = 0;
  while (start < words.length) {
    chunks.push(words.slice(start, start + windowWords).join(' '));
    start += windowWords - overlapWords;
  }
  return chunks;
}

function findTopChunks(manualText, question, options, topN = TOP_CHUNKS) {
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

// ---------------------------------------------------------------------------
// Progress helpers
// ---------------------------------------------------------------------------

function progressFilePath(state) {
  return path.join(__dirname, '..', `.rebind-manuals-${state}-progress.json`);
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

// ---------------------------------------------------------------------------
// Process one question
// ---------------------------------------------------------------------------

async function bindManual(q, manualText, stateName) {
  const options = [q.option_a, q.option_b, q.option_c, q.option_d].filter(Boolean);
  const chunks = findTopChunks(manualText, q.question_text, options, TOP_CHUNKS);

  if (chunks.length === 0) {
    return { manual_reference: null, manual_section: null };
  }

  const excerptList = chunks.map((c, i) =>
    `Excerpt ${i}: "${c.text.substring(0, 500)}"`
  ).join('\n\n');

  const prompt = `You are verifying a DMV knowledge question against the ${stateName} Driver Manual.

Question: ${q.question_text}
Options: ${options.join(' | ')}
Correct answer index: ${q.correct_answer}

Manual excerpts:
${excerptList}

Find the excerpt that BEST supports the correct answer for this question.
Return JSON only (no markdown):
{ "index": 0, "quote": "exact 1-3 sentence verbatim quote from the excerpt", "section": "chapter or section name if visible in text, else null", "confidence": "high" }

Confidence levels:
- "high": excerpt directly states the rule/fact that makes the answer correct
- "medium": excerpt is related but indirect
- "low": no excerpt is clearly relevant

If confidence is "low", still return valid JSON with index/quote/section set to null:
{ "index": null, "quote": null, "section": null, "confidence": "low" }`;

  let result = null;
  try {
    const text = await callClaudeText(prompt);
    result = parseJSON(text);
  } catch { /* fall through */ }

  // Skip low-confidence bindings
  if (!result || result.confidence === 'low' || !result.quote) {
    return { manual_reference: null, manual_section: null };
  }

  return {
    manual_reference: result.quote,
    manual_section: result.section || null,
  };
}

// ---------------------------------------------------------------------------
// Process one state
// ---------------------------------------------------------------------------

async function processState(state) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`STATE: ${state.toUpperCase()} ${DRY_RUN ? '(DRY RUN)' : ''}${MISSING_ONLY ? ' [missing-only]' : ''}`);
  console.log('='.repeat(60));

  const manualText = loadManualText(state);
  if (!manualText) {
    console.log('  No manual text found, skipping.');
    return { state, skipped: true };
  }

  // Fetch EN car questions with cluster_code
  let params = `state=eq.${encodeURIComponent(state)}&category=eq.${CATEGORY_ARG}&language=eq.en&cluster_code=not.is.null&select=id,cluster_code,question_text,option_a,option_b,option_c,option_d,correct_answer,manual_reference,manual_section`;
  if (MISSING_ONLY) {
    params += '&manual_reference=is.null';
  }

  console.log(`  Fetching questions${MISSING_ONLY ? ' (missing manual_reference only)' : ''}...`);
  const questions = await supabaseGetAll('questions', params);
  console.log(`  Found: ${questions.length} questions`);

  if (questions.length === 0) {
    console.log('  Nothing to process.');
    return { state, processed: 0, bound: 0, skipped_low_confidence: 0 };
  }

  const progress = loadProgress(state);
  const stateName = state.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');

  let bound = 0;
  let skippedLow = 0;
  let errors = 0;

  const tasks = questions.map(q => async () => {
    // Already done in this run's progress
    if (progress.done[q.cluster_code]) return;

    let binding;
    try {
      binding = await bindManual(q, manualText, stateName);
    } catch (e) {
      console.error(`  ERROR (${q.cluster_code}): ${e.message}`);
      errors++;
      return;
    }

    if (!binding.manual_reference) {
      skippedLow++;
    } else {
      bound++;
    }

    if (!DRY_RUN) {
      try {
        await supabasePatch('questions', `id=eq.${q.id}`, binding);
      } catch (e) {
        console.error(`  PATCH ERROR (${q.id}): ${e.message}`);
        errors++;
      }
    }

    progress.done[q.cluster_code] = { bound: !!binding.manual_reference };
  });

  let processed = 0;
  for (let i = 0; i < tasks.length; i += CONCURRENCY) {
    await pLimit(CONCURRENCY, tasks.slice(i, i + CONCURRENCY));
    processed = Math.min(i + CONCURRENCY, tasks.length);
    if (processed % 50 < CONCURRENCY || processed === tasks.length) {
      process.stdout.write(`  Progress: ${processed}/${tasks.length} | bound: ${bound} | low-conf: ${skippedLow}\n`);
      saveProgress(state, progress);
    }
  }
  saveProgress(state, progress);

  const summary = { state, processed: questions.length, bound, skipped_low_confidence: skippedLow, errors };
  console.log(`\n  Done: ${bound} bound, ${skippedLow} low-confidence, ${errors} errors`);
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
  console.log(`Model: ${SONNET_MODEL} | Window: ${WINDOW_WORDS}w/${OVERLAP_WORDS}w overlap | Top chunks: ${TOP_CHUNKS}`);

  const results = await runWithPool(states, PARALLEL_STATES);

  if (results.length > 1) {
    const total = results.reduce((s, r) => s + (r.processed || 0), 0);
    const totalBound = results.reduce((s, r) => s + (r.bound || 0), 0);
    const totalLow = results.reduce((s, r) => s + (r.skipped_low_confidence || 0), 0);
    console.log(`\n${'='.repeat(60)}`);
    console.log(`TOTAL: ${total} processed | ${totalBound} bound | ${totalLow} low-confidence`);
    console.log(`Bind rate: ${total > 0 ? ((totalBound / total) * 100).toFixed(1) : 0}%`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
