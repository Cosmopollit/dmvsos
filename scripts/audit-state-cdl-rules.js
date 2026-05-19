#!/usr/bin/env node
/**
 * Extract per-state CDL exam structure (questions/options/pass threshold) from
 * local manual texts using Claude Opus 4.7. Read-only on Supabase; only writes
 * to local JSON files.
 *
 * Why: source of truth for test/page.js so we can configure each state's exam
 * format correctly (e.g. Florida uses 3 options + 50 questions + 42 pass —
 * different from federal default).
 *
 * Pipeline:
 *   1. For each state, load .manuals-text/{state}-cdl-en.txt (truncate to 60K chars)
 *   2. Ask Opus 4.7 to extract: GK/AB/CV questions_count, options_count, pass_threshold
 *      + time_limit, retake_wait, source quotes
 *   3. Write per-state result to .state-cdl-rules-progress.json (resumable)
 *   4. After all states done: aggregate to .state-cdl-rules-extracted.json
 *   5. Generate comparison report against federal CDL defaults (50 GK / 25 AB / 20 CV, 80% pass)
 *
 * Usage:
 *   node scripts/audit-state-cdl-rules.js --dry-run                # show what would run, no API
 *   node scripts/audit-state-cdl-rules.js --state=florida          # one state only
 *   node scripts/audit-state-cdl-rules.js --max-cost=5             # cap spend at $5
 *   node scripts/audit-state-cdl-rules.js                          # all 50 states
 *
 * Requires: ANTHROPIC_API_KEY in .env.local
 */

'use strict';

const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');

try {
  const txt = fs.readFileSync('.env.local', 'utf8');
  for (const line of txt.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch (_) {}

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_KEY) { console.error('Missing ANTHROPIC_API_KEY'); process.exit(1); }

const args = process.argv.slice(2);
const argVal = (k) => args.find(a => a.startsWith(`--${k}=`))?.split('=')[1];
const DRY_RUN     = args.includes('--dry-run');
const STATE       = argVal('state') || null;
const MAX_COST    = parseFloat(argVal('max-cost') || '10');

const MANUALS_DIR = path.join(__dirname, '..', '.manuals-text');
const PROGRESS_FILE = path.join(__dirname, '..', '.state-cdl-rules-progress.json');
const OUTPUT_FILE   = path.join(__dirname, '..', '.state-cdl-rules-extracted.json');
const MAX_MANUAL_CHARS = 60_000;
const MODEL = 'claude-opus-4-7';

// Federal CDL defaults from FMCSA — used for comparison report
const FEDERAL_DEFAULTS = {
  general_knowledge:    { questions: 50, options: 4, pass: 40 }, // 80%
  air_brakes:           { questions: 25, options: 4, pass: 20 }, // 80%
  combination_vehicles: { questions: 20, options: 4, pass: 16 }, // 80%
};

const client = new Anthropic({ apiKey: ANTHROPIC_KEY });

function loadProgress() {
  if (!fs.existsSync(PROGRESS_FILE)) return { done: {}, stats: { cost: 0, processed: 0, errors: 0 } };
  try { return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8')); }
  catch { return { done: {}, stats: { cost: 0, processed: 0, errors: 0 } }; }
}
function saveProgress(p) { fs.writeFileSync(PROGRESS_FILE, JSON.stringify(p, null, 2)); }

function listStates() {
  if (!fs.existsSync(MANUALS_DIR)) return [];
  return fs.readdirSync(MANUALS_DIR)
    .filter(f => f.endsWith('-cdl-en.txt'))
    .map(f => f.replace('-cdl-en.txt', ''))
    .sort();
}

function loadManualText(state) {
  const p = path.join(MANUALS_DIR, `${state}-cdl-en.txt`);
  if (!fs.existsSync(p)) return null;
  const txt = fs.readFileSync(p, 'utf8');
  return txt.length > MAX_MANUAL_CHARS ? txt.slice(0, MAX_MANUAL_CHARS) : txt;
}

const SYSTEM_PROMPT = `You are a precise information extractor. Given a US state's CDL manual text, extract the structure of the written knowledge tests required for a Class A or Class B CDL.

Focus on three sub-tests:
- general_knowledge — required for ALL CDL classes
- air_brakes — required if the vehicle has air brakes
- combination_vehicles — required for Class A combination (truck + trailer)

For each, extract:
- questions_count (integer) — how many questions on the actual exam
- options_count (integer) — how many answer choices per question (almost always 4, but Florida famously uses 3 for some tests)
- pass_threshold (integer) — minimum correct answers to pass (e.g. 40 of 50, or 80% of N)

Also extract overall fields:
- time_limit_minutes (integer or null) — time allowed for the test
- retake_wait_days (integer or null) — how long until you can retake after failing

For EACH numeric field, ALSO include a short verbatim "source" quote from the manual showing where you found it (≤200 chars). If the manual is silent on a field, set its value to null AND set source to "not_found".

Notes:
- Many state manuals don't restate the exam format; they say "see DMV website" or reference federal rules. In that case set fields to null with source "not_found".
- Federal minimum: GK=50q/4opt/40pass, AB=25q/4opt/20pass, CV=20q/4opt/16pass. Don't invent these — only extract what the manual literally says.
- If the manual mentions percentages (e.g. "80% to pass"), compute pass_threshold from questions_count.

Output ONLY a JSON object, no markdown, no preamble. Schema:
{
  "general_knowledge":    { "questions_count": N|null, "questions_source": "...", "options_count": N|null, "options_source": "...", "pass_threshold": N|null, "pass_source": "..." },
  "air_brakes":           { ... same shape ... },
  "combination_vehicles": { ... same shape ... },
  "time_limit_minutes":   N|null,
  "time_limit_source":    "...",
  "retake_wait_days":     N|null,
  "retake_wait_source":   "...",
  "notes":                "any other relevant test-format rules (≤300 chars)"
}`;

async function extractForState(state) {
  const manualText = loadManualText(state);
  if (!manualText) throw new Error('no manual file');

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    thinking: { type: 'adaptive' },
    system: SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: `State: ${state}\n\nMANUAL TEXT (first ${MAX_MANUAL_CHARS.toLocaleString()} chars):\n---\n${manualText}\n---\n\nExtract the JSON object now.`,
    }],
  });

  // Pull text block
  const textBlock = response.content.find(b => b.type === 'text');
  if (!textBlock) throw new Error('no text in response');

  let jsonText = textBlock.text.trim();
  // Strip code fence if present
  jsonText = jsonText.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');

  let parsed;
  try { parsed = JSON.parse(jsonText); }
  catch (e) {
    throw new Error(`bad JSON: ${e.message} | first 200: ${jsonText.slice(0, 200)}`);
  }

  // Approx cost: Opus 4.7 = $5/M input + $25/M output
  const cost = (response.usage.input_tokens / 1e6) * 5
             + (response.usage.cache_read_input_tokens / 1e6) * 0.5
             + (response.usage.output_tokens / 1e6) * 25;

  return { result: parsed, cost, usage: response.usage };
}

function compareToFederal(state, r) {
  const diffs = [];
  for (const sub of ['general_knowledge', 'air_brakes', 'combination_vehicles']) {
    const fed = FEDERAL_DEFAULTS[sub];
    const our = r[sub] || {};
    for (const key of ['questions_count', 'options_count', 'pass_threshold']) {
      const myKey = key === 'questions_count' ? 'questions' : key === 'options_count' ? 'options' : 'pass';
      if (our[key] != null && our[key] !== fed[myKey]) {
        diffs.push(`${sub}.${key}: ${our[key]} (federal: ${fed[myKey]})`);
      }
    }
  }
  return diffs;
}

(async () => {
  const allStates = listStates();
  console.log(`Found ${allStates.length} CDL manuals in ${MANUALS_DIR}`);

  const targets = STATE ? [STATE] : allStates;
  if (STATE && !allStates.includes(STATE)) {
    console.error(`State '${STATE}' has no manual at .manuals-text/${STATE}-cdl-en.txt`);
    process.exit(1);
  }

  const progress = loadProgress();
  const work = targets.filter(s => !progress.done[s]);
  console.log(`Done so far: ${Object.keys(progress.done).length} · cost so far: $${progress.stats.cost.toFixed(2)}`);
  console.log(`Work: ${work.length} states · estimated cost: ~$${(work.length * 0.10).toFixed(2)} (assuming ~$0.10/state Opus 4.7)`);

  if (DRY_RUN) {
    console.log('\n[DRY RUN] States to process:');
    for (const s of work.slice(0, 10)) console.log(`  ${s}`);
    if (work.length > 10) console.log(`  ... and ${work.length - 10} more`);
    return;
  }
  if (work.length === 0) { console.log('Nothing to do.'); }

  for (const state of work) {
    if (progress.stats.cost >= MAX_COST) {
      console.log(`\nCOST CAP $${MAX_COST} reached at ${progress.stats.cost.toFixed(2)}. Stopping.`);
      break;
    }
    process.stdout.write(`  ${state.padEnd(18)} ... `);
    try {
      const { result, cost } = await extractForState(state);
      progress.done[state] = { ts: Date.now(), result };
      progress.stats.cost += cost;
      progress.stats.processed++;
      saveProgress(progress);
      const diffs = compareToFederal(state, result);
      console.log(`ok · $${cost.toFixed(3)} ${diffs.length ? '· DEVIATIONS: ' + diffs.join(' | ') : ''}`);
    } catch (e) {
      progress.stats.errors++;
      progress.done[state] = { ts: Date.now(), error: e.message.slice(0, 200) };
      saveProgress(progress);
      console.log(`ERR: ${e.message.slice(0, 100)}`);
    }
  }

  // ── Aggregate ─────────────────────────────────────────────────────────────
  const aggregated = {};
  for (const [state, entry] of Object.entries(progress.done)) {
    if (entry.result) aggregated[state] = entry.result;
  }
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(aggregated, null, 2));
  console.log(`\nWrote ${OUTPUT_FILE} (${Object.keys(aggregated).length} states)`);

  // ── Comparison report ─────────────────────────────────────────────────────
  console.log(`\n=== DEVIATIONS FROM FEDERAL DEFAULTS ===`);
  let anyDeviation = false;
  for (const [state, r] of Object.entries(aggregated).sort()) {
    const diffs = compareToFederal(state, r);
    if (diffs.length) {
      anyDeviation = true;
      console.log(`  ${state}: ${diffs.join(' | ')}`);
    }
  }
  if (!anyDeviation) console.log('  (none — all match federal CDL standards where extracted)');

  console.log(`\nTotal cost: $${progress.stats.cost.toFixed(2)} · processed: ${progress.stats.processed} · errors: ${progress.stats.errors}`);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
