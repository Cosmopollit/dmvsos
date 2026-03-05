#!/usr/bin/env node
/**
 * Cluster and deduplicate EN car questions for each state.
 *
 * Phases:
 *   1. Exact deduplication (no AI) — normalized text matching
 *   2. Fuzzy deduplication (Haiku, batches of 30)
 *   3. Cap at 200 (Sonnet, only if > 200 survive)
 *   4. Assign cluster codes: {state_abbr}_car_{N:03d}
 *   5. Manual binding (Haiku) — find exact quote + section per question
 *   6. Image audit (Haiku vision) — verify or null image_url
 *
 * Usage:
 *   node scripts/cluster-questions.js --state=washington [--dry-run] [--concurrency=5]
 *   node scripts/cluster-questions.js --all  # all 50 states sequentially
 *   node scripts/cluster-questions.js --state=washington --skip-phases=1,2  # resume from phase 3
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
const CONCURRENCY = parseInt(process.argv.find(a => a.startsWith('--concurrency='))?.split('=')[1] || '5', 10);
const SKIP_PHASES = (process.argv.find(a => a.startsWith('--skip-phases='))?.split('=')[1] || '')
  .split(',').map(Number).filter(Boolean);

const MANUALS_DIR = path.join(__dirname, '..', '.manuals-text');
const HAIKU_MODEL = 'claude-haiku-4-5-20251001';
const SONNET_MODEL = 'claude-sonnet-4-6';
const TARGET_COUNT = 200;
const FUZZY_BATCH = 30;

if (!SERVICE_KEY) { console.error('Set SUPABASE_SERVICE_ROLE_KEY env var'); process.exit(1); }
if (!ANTHROPIC_KEY) { console.error('Set ANTHROPIC_API_KEY env var'); process.exit(1); }
if (!ALL_STATES && !STATE_ARG) {
  console.error('Specify --state=washington or --all');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// State slug → abbreviation map
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

function normalizeText(text) {
  return (text || '').toLowerCase().trim().replace(/\s+/g, ' ').replace(/[^\w\s]/g, '');
}

function isSignQuestion(text) {
  const t = text.toLowerCase();
  return ['sign', 'signal', 'symbol', 'marking', 'light', 'arrow', 'pavement', 'lane marking', 'traffic control']
    .some(kw => t.includes(kw));
}

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

async function callClaude(messages, model = HAIKU_MODEL, maxTokens = 4096) {
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

function callClaudeText(prompt, model = HAIKU_MODEL, maxTokens = 4096) {
  return callClaude([{ role: 'user', content: prompt }], model, maxTokens);
}

function callClaudeVision(prompt, imageUrl, model = HAIKU_MODEL) {
  return callClaude([{
    role: 'user',
    content: [
      { type: 'image', source: { type: 'url', url: imageUrl } },
      { type: 'text', text: prompt },
    ],
  }], model, 256);
}

function parseJSON(text) {
  // Strip markdown fences if present
  const clean = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  try {
    return JSON.parse(clean);
  } catch {
    // Try extracting first JSON object/array
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

function slidingWindowChunks(text, windowWords = 200, overlapWords = 50) {
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

// ---------------------------------------------------------------------------
// Progress / rollback helpers
// ---------------------------------------------------------------------------

function progressFile(state) { return path.join(__dirname, '..', `.cluster-questions-${state}-progress.json`); }
function rollbackFile(state) { return path.join(__dirname, '..', `.cluster-questions-${state}-rollback.json`); }
function reportFile(state) { return path.join(__dirname, '..', `.cluster-questions-${state}-report.json`); }

function loadProgress(state) {
  const f = progressFile(state);
  if (fs.existsSync(f)) {
    try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { /* ignore */ }
  }
  return { phase: 0, fuzzyProcessed: {}, manualDone: {}, imageDone: {} };
}

function saveProgress(state, prog) {
  fs.writeFileSync(progressFile(state), JSON.stringify(prog, null, 2));
}

function appendRollback(state, entries) {
  const f = rollbackFile(state);
  let existing = [];
  if (fs.existsSync(f)) {
    try { existing = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { /* ignore */ }
  }
  fs.writeFileSync(f, JSON.stringify([...existing, ...entries], null, 2));
}

// ---------------------------------------------------------------------------
// Phase 1 — Exact deduplication
// ---------------------------------------------------------------------------

function scoreQuestion(q) {
  let score = 0;
  if (q.explanation) score += 2;
  if (q.image_url) score += 1;
  if (q.created_at) score += 1; // newer is better — will be used in sort
  return score;
}

function phase1ExactDedup(questions) {
  const groups = new Map();
  for (const q of questions) {
    const key = normalizeText(q.question_text);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(q);
  }

  const keep = [];
  const remove = [];

  for (const group of groups.values()) {
    if (group.length === 1) {
      keep.push(group[0]);
      continue;
    }
    // Sort: higher score first, then newer created_at
    group.sort((a, b) => {
      const sd = scoreQuestion(b) - scoreQuestion(a);
      if (sd !== 0) return sd;
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });
    keep.push(group[0]);
    remove.push(...group.slice(1));
  }

  return { keep, remove };
}

// ---------------------------------------------------------------------------
// Phase 2 — Fuzzy deduplication (Haiku)
// ---------------------------------------------------------------------------

function buildFuzzyPrompt(stateName, questions) {
  const qList = questions.map((q, i) =>
    `${i + 1}. [ID:${q.id}] ${q.question_text}`
  ).join('\n');

  return `You are reviewing DMV test questions for ${stateName}.

Below is a list of questions. Find any groups that test the EXACT SAME concept or fact (even if worded differently). For each duplicate group, keep the clearest/most accurate one and mark the rest for removal.

Questions:
${qList}

Return ONLY a JSON object in this exact format (no markdown, no explanation outside JSON):
{
  "keep": [list of IDs to keep],
  "remove": [list of IDs to remove — duplicates only],
  "groups": [
    { "keep_id": 123, "remove_ids": [456, 789], "reason": "same concept" }
  ]
}

If there are no duplicates, return: {"keep": [], "remove": [], "groups": []}
IMPORTANT: Only remove true duplicates. Keep questions that cover different aspects.`;
}

async function phase2FuzzyDedup(state, questions, progress) {
  const stateName = state.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
  const toRemove = new Set();

  const batches = [];
  for (let i = 0; i < questions.length; i += FUZZY_BATCH) {
    batches.push(questions.slice(i, i + FUZZY_BATCH));
  }

  console.log(`  Phase 2: ${batches.length} batches of up to ${FUZZY_BATCH}`);

  for (let b = 0; b < batches.length; b++) {
    const batchKey = `batch_${b}`;
    if (progress.fuzzyProcessed[batchKey]) {
      const cached = progress.fuzzyProcessed[batchKey];
      for (const id of cached.remove) toRemove.add(id);
      continue;
    }

    process.stdout.write(`  Batch ${b + 1}/${batches.length}...`);
    const prompt = buildFuzzyPrompt(stateName, batches[b]);

    let result = null;
    try {
      const text = await callClaudeText(prompt);
      result = parseJSON(text);
    } catch (e) {
      console.log(` ERROR: ${e.message}`);
    }

    const removeIds = result?.remove || [];
    for (const id of removeIds) toRemove.add(id);

    progress.fuzzyProcessed[batchKey] = { remove: removeIds };
    saveProgress(state, progress);
    process.stdout.write(` removed ${removeIds.length}\n`);
  }

  return [...toRemove];
}

// ---------------------------------------------------------------------------
// Phase 3 — Cap at 200 (Sonnet)
// ---------------------------------------------------------------------------

async function phase3Cap(state, questions, manualText) {
  if (questions.length <= TARGET_COUNT) {
    console.log(`  Phase 3: ${questions.length} ≤ ${TARGET_COUNT}, skipping cap`);
    return { keep: questions, deactivate: [] };
  }

  console.log(`  Phase 3: ${questions.length} > ${TARGET_COUNT}, asking Sonnet to select best ${TARGET_COUNT}...`);
  const stateName = state.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');

  const manualCtx = manualText
    ? `Manual excerpt (first 3000 chars):\n---\n${manualText.substring(0, 3000)}\n---\n\n`
    : '';

  const qList = questions.map(q => `[ID:${q.id}] ${q.question_text}`).join('\n');

  const prompt = `You are curating DMV knowledge test questions for ${stateName}.

${manualCtx}Select exactly ${TARGET_COUNT} questions from the list below. Prefer questions that:
- Cover diverse topics: signs, speed limits, right-of-way, parking, safety, alcohol/DUI, licensing requirements, intersections, lane changes, pedestrians
- Are clearly worded and unambiguous
- Have distinct correct answers (not opinion-based)

Questions (${questions.length} total):
${qList}

Return ONLY a JSON array of exactly ${TARGET_COUNT} IDs to KEEP (no markdown, no explanation):
[id1, id2, ...]`;

  let keepIds = null;
  try {
    const text = await callClaudeText(prompt, SONNET_MODEL, 8192);
    keepIds = parseJSON(text);
  } catch (e) {
    console.log(`  ERROR in phase 3: ${e.message}. Keeping top ${TARGET_COUNT} by score.`);
  }

  if (!Array.isArray(keepIds) || keepIds.length !== TARGET_COUNT) {
    console.log(`  Phase 3 fallback: using score-based top ${TARGET_COUNT}`);
    const sorted = [...questions].sort((a, b) => scoreQuestion(b) - scoreQuestion(a));
    keepIds = sorted.slice(0, TARGET_COUNT).map(q => q.id);
  }

  const keepSet = new Set(keepIds);
  const keep = questions.filter(q => keepSet.has(q.id));
  const deactivate = questions.filter(q => !keepSet.has(q.id));

  return { keep, deactivate };
}

// ---------------------------------------------------------------------------
// Phase 4 — Assign cluster codes
// ---------------------------------------------------------------------------

function phase4AssignCodes(state, questions) {
  const abbr = (STATE_ABBR[state] || state.substring(0, 2).toUpperCase()).toLowerCase();
  const sorted = [...questions].sort((a, b) =>
    normalizeText(a.question_text).localeCompare(normalizeText(b.question_text))
  );
  return sorted.map((q, i) => ({
    ...q,
    cluster_code: `${abbr}_car_${String(i + 1).padStart(3, '0')}`,
  }));
}

// ---------------------------------------------------------------------------
// Phase 5 — Manual binding (Haiku)
// ---------------------------------------------------------------------------

async function phase5ManualBinding(state, questions, manualText, progress) {
  if (!manualText) {
    console.log('  Phase 5: No manual text available, skipping');
    return questions;
  }

  const stateName = state.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
  console.log(`  Phase 5: Manual binding for ${questions.length} questions...`);

  const tasks = questions.map(q => async () => {
    if (progress.manualDone[q.id]) return { ...q, ...progress.manualDone[q.id] };

    const options = [q.option_a, q.option_b, q.option_c, q.option_d].filter(Boolean);
    const chunks = findTopChunks(manualText, q.question_text, options, 5);

    if (chunks.length === 0) {
      progress.manualDone[q.id] = { manual_reference: null, manual_section: null };
      return { ...q, manual_reference: null, manual_section: null };
    }

    const excerptList = chunks.map((c, i) =>
      `Excerpt ${i}: "${c.text.substring(0, 400)}"`
    ).join('\n\n');

    const prompt = `DMV question from ${stateName} Driver Manual:
Question: ${q.question_text}
Options: ${options.join(' | ')}
Correct answer index: ${q.correct_answer}

Manual excerpts:
${excerptList}

Which excerpt BEST supports the correct answer? Return JSON only:
{ "index": 0, "quote": "exact 1-3 sentence quote from the excerpt", "section": "chapter or section name if visible in text, else null" }
If no excerpt is relevant: { "index": null, "quote": null, "section": null }`;

    let result = null;
    try {
      const text = await callClaudeText(prompt);
      result = parseJSON(text);
    } catch { /* fall through */ }

    const binding = {
      manual_reference: result?.quote || null,
      manual_section: result?.section || null,
    };

    progress.manualDone[q.id] = binding;
    return { ...q, ...binding };
  });

  // Process with concurrency
  const batched = [];
  for (let i = 0; i < tasks.length; i += CONCURRENCY) {
    const chunk = await pLimit(CONCURRENCY, tasks.slice(i, i + CONCURRENCY));
    batched.push(...chunk);
    if ((i + CONCURRENCY) % 50 < CONCURRENCY) {
      process.stdout.write(`  Manual binding: ${Math.min(i + CONCURRENCY, tasks.length)}/${tasks.length}\n`);
      saveProgress(state, progress);
    }
  }
  saveProgress(state, progress);

  return batched;
}

// ---------------------------------------------------------------------------
// Phase 6 — Image audit (Haiku vision)
// ---------------------------------------------------------------------------

async function phase6ImageAudit(state, questions, progress) {
  console.log(`  Phase 6: Image audit...`);

  const tasks = questions.map(q => async () => {
    if (progress.imageDone[q.id]) return { ...q, ...progress.imageDone[q.id] };

    const needsImage = isSignQuestion(q.question_text);
    let imageUrl = q.image_url;

    if (imageUrl) {
      // Verify image matches question
      try {
        const verdict = await callClaudeVision(
          `Does this image directly illustrate or match this DMV question? Question: "${q.question_text}". Answer with ONLY "yes" or "no".`,
          imageUrl
        );
        if (verdict.toLowerCase().includes('no')) {
          imageUrl = null;
        }
      } catch {
        // If vision fails (e.g., image unavailable), null the image_url
        imageUrl = null;
      }
    }

    const result = {
      image_url: imageUrl,
      needs_image: needsImage && !imageUrl,
    };

    progress.imageDone[q.id] = result;
    return { ...q, ...result };
  });

  const batched = [];
  for (let i = 0; i < tasks.length; i += CONCURRENCY) {
    const chunk = await pLimit(CONCURRENCY, tasks.slice(i, i + CONCURRENCY));
    batched.push(...chunk);
    if ((i + CONCURRENCY) % 50 < CONCURRENCY) {
      process.stdout.write(`  Image audit: ${Math.min(i + CONCURRENCY, tasks.length)}/${tasks.length}\n`);
      saveProgress(state, progress);
    }
  }
  saveProgress(state, progress);

  return batched;
}

// ---------------------------------------------------------------------------
// Write results to DB
// ---------------------------------------------------------------------------

async function writeToDb(state, toDelete, toDeactivate, finalQuestions) {
  let deleted = 0, deactivated = 0, updated = 0, errors = 0;

  // Delete duplicates
  if (toDelete.length > 0) {
    console.log(`  Writing: deleting ${toDelete.length} duplicates...`);
    for (let i = 0; i < toDelete.length; i += 50) {
      const batch = toDelete.slice(i, i + 50);
      const ids = batch.map(q => q.id).join(',');
      try {
        await supabaseDelete('questions', `id=in.(${ids})`);
        deleted += batch.length;
      } catch (e) {
        console.error(`  DELETE error: ${e.message}`);
        errors++;
      }
    }
  }

  // Deactivate (is_active = false) overflow questions
  if (toDeactivate.length > 0) {
    console.log(`  Writing: deactivating ${toDeactivate.length} overflow questions...`);
    for (const q of toDeactivate) {
      try {
        await supabasePatch('questions', `id=eq.${q.id}`, { is_active: false });
        deactivated++;
      } catch (e) {
        console.error(`  DEACTIVATE error (${q.id}): ${e.message}`);
        errors++;
      }
    }
  }

  // Update surviving questions with cluster_code, manual_reference, manual_section, image_url, needs_image
  console.log(`  Writing: updating ${finalQuestions.length} final questions...`);
  const tasks = finalQuestions.map(q => async () => {
    const body = {
      cluster_code: q.cluster_code,
      manual_reference: q.manual_reference || null,
      manual_section: q.manual_section || null,
      image_url: q.image_url || null,
      needs_image: q.needs_image || false,
    };
    try {
      await supabasePatch('questions', `id=eq.${q.id}`, body);
      return true;
    } catch (e) {
      console.error(`  UPDATE error (${q.id}): ${e.message}`);
      return false;
    }
  });

  for (let i = 0; i < tasks.length; i += CONCURRENCY) {
    const results = await pLimit(CONCURRENCY, tasks.slice(i, i + CONCURRENCY));
    updated += results.filter(Boolean).length;
    errors += results.filter(r => !r).length;
  }

  return { deleted, deactivated, updated, errors };
}

// ---------------------------------------------------------------------------
// Main — process one state
// ---------------------------------------------------------------------------

async function processState(state) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`STATE: ${state.toUpperCase()} ${DRY_RUN ? '(DRY RUN)' : ''}`);
  console.log('='.repeat(60));

  const abbr = STATE_ABBR[state];
  if (!abbr) {
    console.error(`  Unknown state slug: ${state}`);
    return;
  }

  // Load progress
  const progress = loadProgress(state);

  // Fetch all EN car questions for state
  console.log(`  Fetching EN car questions for ${state}...`);
  const questions = await supabaseGetAll(
    'questions',
    `state=eq.${encodeURIComponent(state)}&category=eq.car&language=eq.en&select=id,question_text,option_a,option_b,option_c,option_d,correct_answer,explanation,image_url,created_at,cluster_code`
  );
  console.log(`  Found: ${questions.length} questions`);

  if (questions.length === 0) {
    console.log('  No questions found, skipping.');
    return;
  }

  // Save rollback snapshot
  if (!SKIP_PHASES.includes(1) && !DRY_RUN) {
    appendRollback(state, questions.map(q => ({ ...q, _snapshot: true })));
  }

  let toDelete = [];
  let toDeactivate = [];
  let surviving = questions;

  // ---- Phase 1: Exact dedup ----
  if (!SKIP_PHASES.includes(1)) {
    const { keep, remove } = phase1ExactDedup(surviving);
    console.log(`  Phase 1: ${surviving.length} → ${keep.length} (removed ${remove.length} exact duplicates)`);
    toDelete.push(...remove);
    surviving = keep;
    if (!DRY_RUN) appendRollback(state, remove.map(q => ({ ...q, _phase: 1, _reason: 'exact_duplicate' })));
  }

  // ---- Phase 2: Fuzzy dedup ----
  if (!SKIP_PHASES.includes(2)) {
    const fuzzyRemoveIds = await phase2FuzzyDedup(state, surviving, progress);
    const fuzzyRemoveSet = new Set(fuzzyRemoveIds);
    const fuzzyRemoved = surviving.filter(q => fuzzyRemoveSet.has(q.id));
    surviving = surviving.filter(q => !fuzzyRemoveSet.has(q.id));
    console.log(`  Phase 2: ${fuzzyRemoveIds.length} fuzzy duplicates removed → ${surviving.length} remain`);
    toDelete.push(...fuzzyRemoved);
    if (!DRY_RUN) appendRollback(state, fuzzyRemoved.map(q => ({ ...q, _phase: 2, _reason: 'fuzzy_duplicate' })));
  }

  // ---- Phase 3: Cap at 200 ----
  if (!SKIP_PHASES.includes(3)) {
    const manualText = loadManualText(state);
    const { keep, deactivate } = await phase3Cap(state, surviving, manualText);
    surviving = keep;
    toDeactivate = deactivate;
    console.log(`  Phase 3: ${surviving.length} active, ${deactivate.length} deactivated`);
  }

  // ---- Phase 4: Assign cluster codes ----
  if (!SKIP_PHASES.includes(4)) {
    surviving = phase4AssignCodes(state, surviving);
    console.log(`  Phase 4: Cluster codes assigned (${abbr.toLowerCase()}_car_001 → ${abbr.toLowerCase()}_car_${String(surviving.length).padStart(3, '0')})`);
  }

  // ---- Phase 5: Manual binding ----
  if (!SKIP_PHASES.includes(5)) {
    const manualText = loadManualText(state);
    surviving = await phase5ManualBinding(state, surviving, manualText, progress);
    const withRef = surviving.filter(q => q.manual_reference).length;
    console.log(`  Phase 5: ${withRef}/${surviving.length} questions have manual references`);
  }

  // ---- Phase 6: Image audit ----
  if (!SKIP_PHASES.includes(6)) {
    surviving = await phase6ImageAudit(state, surviving, progress);
    const withImg = surviving.filter(q => q.image_url).length;
    const needsImg = surviving.filter(q => q.needs_image).length;
    console.log(`  Phase 6: ${withImg} have valid images, ${needsImg} sign questions need images`);
  }

  // ---- Write to DB ----
  let dbStats = { deleted: 0, deactivated: 0, updated: 0, errors: 0 };

  if (DRY_RUN) {
    console.log(`\n  DRY RUN summary:`);
    console.log(`  - Would delete:     ${toDelete.length} duplicates`);
    console.log(`  - Would deactivate: ${toDeactivate.length} overflow`);
    console.log(`  - Would update:     ${surviving.length} final questions`);
    console.log(`  - Sample cluster codes: ${surviving.slice(0, 3).map(q => q.cluster_code).join(', ')}`);
  } else {
    dbStats = await writeToDb(state, toDelete, toDeactivate, surviving);
    console.log(`\n  DB written:`);
    console.log(`  - Deleted:     ${dbStats.deleted}`);
    console.log(`  - Deactivated: ${dbStats.deactivated}`);
    console.log(`  - Updated:     ${dbStats.updated}`);
    if (dbStats.errors > 0) console.log(`  - Errors:      ${dbStats.errors}`);
  }

  // ---- Write report ----
  const report = {
    state,
    abbr,
    timestamp: new Date().toISOString(),
    dry_run: DRY_RUN,
    original_count: questions.length,
    after_exact_dedup: questions.length - toDelete.filter(q => !progress.fuzzyProcessed[`_phase2_${q.id}`]).length,
    final_count: surviving.length,
    deleted: toDelete.length,
    deactivated: toDeactivate.length,
    manual_references: surviving.filter(q => q.manual_reference).length,
    valid_images: surviving.filter(q => q.image_url).length,
    needs_image: surviving.filter(q => q.needs_image).length,
    db: dbStats,
    sample_questions: surviving.slice(0, 5).map(q => ({
      id: q.id,
      cluster_code: q.cluster_code,
      question: q.question_text?.substring(0, 80),
      manual_section: q.manual_section,
      has_image: !!q.image_url,
      needs_image: q.needs_image,
    })),
  };

  fs.writeFileSync(reportFile(state), JSON.stringify(report, null, 2));
  console.log(`\n  Report saved: ${reportFile(state)}`);

  // Mark progress complete
  progress.phase = 6;
  saveProgress(state, progress);

  return report;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main() {
  const states = ALL_STATES ? ALL_STATE_SLUGS : [STATE_ARG];

  if (DRY_RUN) console.log('\n*** DRY RUN — no DB changes will be made ***\n');

  const reports = [];
  for (const state of states) {
    try {
      const report = await processState(state);
      if (report) reports.push(report);
    } catch (e) {
      console.error(`\nERROR processing ${state}: ${e.message}`);
      console.error(e.stack);
    }
  }

  if (ALL_STATES && reports.length > 0) {
    const summary = {
      timestamp: new Date().toISOString(),
      states_processed: reports.length,
      total_original: reports.reduce((s, r) => s + r.original_count, 0),
      total_final: reports.reduce((s, r) => s + r.final_count, 0),
      total_deleted: reports.reduce((s, r) => s + r.deleted, 0),
      total_deactivated: reports.reduce((s, r) => s + r.deactivated, 0),
      per_state: reports.map(r => ({ state: r.state, original: r.original_count, final: r.final_count })),
    };
    const summaryFile = path.join(__dirname, '..', '.cluster-questions-summary.json');
    fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2));
    console.log(`\nSummary saved: ${summaryFile}`);
    console.log(`Total: ${summary.total_original} → ${summary.total_final} questions across ${summary.states_processed} states`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
