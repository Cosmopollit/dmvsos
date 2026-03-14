#!/usr/bin/env node
/**
 * Classify CDL questions into subcategories:
 *   - general_knowledge
 *   - combination_vehicles
 *   - air_brakes
 *
 * Uses Haiku to classify batches of 10 EN questions, then propagates
 * subcategory to all language rows via cluster_code.
 *
 * Usage:
 *   node scripts/classify-cdl-subcategory.js --state=washington [--dry-run]
 *   node scripts/classify-cdl-subcategory.js --all [--parallel=3]
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
const PARALLEL_STATES = parseInt(process.argv.find(a => a.startsWith('--parallel='))?.split('=')[1] || '1', 10);
const CONCURRENCY = parseInt(process.argv.find(a => a.startsWith('--concurrency='))?.split('=')[1] || '5', 10);

const HAIKU_MODEL = 'claude-haiku-4-5-20251001';
const BATCH_SIZE = 10;

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

function progressFilePath(state) {
  return path.join(__dirname, '..', `.classify-cdl-${state}-progress.json`);
}

function loadProgress(state) {
  const f = progressFilePath(state);
  if (fs.existsSync(f)) {
    try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { /* ignore */ }
  }
  return { done: {}, stats: { general_knowledge: 0, combination_vehicles: 0, air_brakes: 0, errors: 0 } };
}

function saveProgress(state, prog) {
  if (DRY_RUN) return;
  fs.writeFileSync(progressFilePath(state), JSON.stringify(prog, null, 2));
}

// ---------------------------------------------------------------------------
// Classification prompt
// ---------------------------------------------------------------------------

const VALID_SUBCATEGORIES = ['general_knowledge', 'combination_vehicles', 'air_brakes'];

function buildPrompt(batch) {
  const questionsText = batch.map((q, i) => {
    const opts = [q.option_a, q.option_b, q.option_c, q.option_d].filter(Boolean);
    return `[${i + 1}] ID: ${q.id}\nQ: ${q.question_text}\nOptions: ${opts.join(' | ')}`;
  }).join('\n\n');

  return `You are a CDL (Commercial Driver's License) exam expert.

Classify each question into exactly ONE subcategory:

1. **general_knowledge** — General driving knowledge, traffic laws, vehicle inspection, cargo handling,
   hazardous materials placarding basics, driving safety, hours of service, emergency procedures,
   vehicle systems (engine, transmission, electrical), loading/securing cargo, night driving,
   mountain driving, winter driving, railroad crossings, road signs, speed management,
   space management, seeing hazards, distracted/drowsy driving, alcohol/drugs rules,
   pre-trip inspection procedures, basic vehicle control. This is the DEFAULT — if unsure, pick this.

2. **combination_vehicles** — Questions specifically about combination vehicles (tractor-trailers,
   doubles, triples): coupling/uncoupling procedures, rollover risks specific to combinations,
   trailer jackknifing, crack-the-whip effect, off-tracking, trailer air supply,
   trailer emergency brakes, trailer height/weight distribution specific to combinations,
   fifth wheel, landing gear, glad hands, converter dollies, trailer skids.

3. **air_brakes** — Questions specifically about air brake systems: air compressor, governor,
   air tanks/reservoirs, drain valves, brake chambers, s-cams, slack adjusters,
   brake drums/linings, spring brakes, parking brakes (air system), air pressure gauges,
   low air pressure warning, air brake cut-in/cut-out pressure, air brake lag,
   stopping distance with air brakes, air brake inspection/testing, air leakage rate,
   dual air brake systems, air brake failure. Must be specifically about the air brake SYSTEM,
   not just "braking" in general.

IMPORTANT: General braking questions (like "what is the best way to brake on a curve") are general_knowledge.
Only classify as air_brakes if the question is specifically about air brake components or the air brake system.

Similarly, general trailer questions are general_knowledge. Only classify as combination_vehicles if
the question is specifically about coupling, jackknifing, or other combination-specific topics.

Return a JSON array with one object per question:
[{"id": <question_id>, "subcategory": "<one of the three values>"}]

Questions:

${questionsText}

Return ONLY the JSON array, no other text.`;
}

// ---------------------------------------------------------------------------
// Process one state
// ---------------------------------------------------------------------------

async function processState(state) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`STATE: ${state.toUpperCase()} (${STATE_ABBR[state]}) ${DRY_RUN ? '*** DRY RUN ***' : ''}`);
  console.log('='.repeat(60));

  // 1. Fetch EN CDL questions
  const questions = await supabaseGetAll(
    'questions',
    `state=eq.${encodeURIComponent(state)}&category=eq.cdl&language=eq.en&select=id,question_text,option_a,option_b,option_c,option_d,cluster_code`
  );

  if (questions.length === 0) {
    console.log('  No CDL questions found, skipping.');
    return null;
  }

  console.log(`  Found ${questions.length} EN CDL questions`);

  // 2. Load progress
  const progress = loadProgress(state);

  // 3. Create batches
  const batches = [];
  for (let i = 0; i < questions.length; i += BATCH_SIZE) {
    batches.push(questions.slice(i, i + BATCH_SIZE));
  }
  console.log(`  ${batches.length} batches of ${BATCH_SIZE}`);

  // 4. Build tasks
  let processed = 0;
  const tasks = batches.map((batch, batchIdx) => async () => {
    const batchKey = `batch_${batchIdx}`;

    // Skip already done
    if (progress.done[batchKey]) {
      processed += batch.length;
      return;
    }

    // Call Claude
    const prompt = buildPrompt(batch);
    const text = await callClaudeText(prompt);
    const results = parseJSON(text);

    if (!results || !Array.isArray(results)) {
      console.error(`  Batch ${batchIdx}: failed to parse response`);
      progress.stats.errors += batch.length;
      progress.done[batchKey] = { error: true };
      return;
    }

    // Map results by id
    const byId = {};
    for (const r of results) {
      if (r.id && VALID_SUBCATEGORIES.includes(r.subcategory)) {
        byId[r.id] = r.subcategory;
      }
    }

    // Write to DB
    for (const q of batch) {
      const sub = byId[q.id];
      if (!sub) {
        progress.stats.errors++;
        continue;
      }

      progress.stats[sub] = (progress.stats[sub] || 0) + 1;

      if (!DRY_RUN) {
        // Update EN question
        await supabasePatch('questions', `id=eq.${q.id}`, { subcategory: sub });

        // Propagate to all language rows via cluster_code
        if (q.cluster_code) {
          await supabasePatch(
            'questions',
            `cluster_code=eq.${encodeURIComponent(q.cluster_code)}&category=eq.cdl&language=neq.en`,
            { subcategory: sub }
          );
        }
      }
    }

    processed += batch.length;
    progress.done[batchKey] = { ok: true };
    process.stdout.write(`\r  Progress: ${processed}/${questions.length}`);
  });

  // 5. Run with concurrency
  for (let i = 0; i < tasks.length; i += CONCURRENCY) {
    await pLimit(CONCURRENCY, tasks.slice(i, i + CONCURRENCY));
    saveProgress(state, progress);
  }

  console.log(`\n  Done: GK=${progress.stats.general_knowledge} COMBO=${progress.stats.combination_vehicles} AIR=${progress.stats.air_brakes} ERR=${progress.stats.errors}`);
  return { state, ...progress.stats, total: questions.length };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function runWithPool(states, parallelN) {
  const reports = [];
  let idx = 0;
  async function worker() {
    while (idx < states.length) {
      const state = states[idx++];
      try {
        const report = await processState(state);
        if (report) reports.push(report);
      } catch (e) {
        console.error(`\nERROR processing ${state}: ${e.message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: parallelN }, worker));
  return reports;
}

async function main() {
  const states = ALL_STATES ? ALL_STATE_SLUGS : [STATE_ARG];

  if (DRY_RUN) console.log('\n*** DRY RUN — no DB changes ***\n');
  console.log(`States: ${states.length}, Parallel: ${PARALLEL_STATES}, Concurrency: ${CONCURRENCY}`);

  const reports = await runWithPool(states, PARALLEL_STATES);

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));

  let totalGK = 0, totalCombo = 0, totalAir = 0, totalErr = 0, totalQ = 0;
  for (const r of reports) {
    console.log(`  ${r.state}: GK=${r.general_knowledge} COMBO=${r.combination_vehicles} AIR=${r.air_brakes} ERR=${r.errors}`);
    totalGK += r.general_knowledge;
    totalCombo += r.combination_vehicles;
    totalAir += r.air_brakes;
    totalErr += r.errors;
    totalQ += r.total;
  }
  console.log(`\nTOTAL: ${totalQ} questions`);
  console.log(`  General Knowledge: ${totalGK} (${(totalGK / totalQ * 100).toFixed(1)}%)`);
  console.log(`  Combination Vehicles: ${totalCombo} (${(totalCombo / totalQ * 100).toFixed(1)}%)`);
  console.log(`  Air Brakes: ${totalAir} (${(totalAir / totalQ * 100).toFixed(1)}%)`);
  if (totalErr) console.log(`  Errors: ${totalErr}`);
}

main().catch(e => { console.error(e); process.exit(1); });
