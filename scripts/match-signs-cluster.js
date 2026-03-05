#!/usr/bin/env node
/**
 * Match road sign images to clustered EN car questions.
 *
 * For each question with needs_image=true:
 *   1. Ask Haiku (text) to pick best sign from available filenames
 *   2. Verify match with Haiku vision
 *   3. Update image_url on ALL language rows with same cluster_code
 *
 * Usage:
 *   node scripts/match-signs-cluster.js --state=washington [--dry-run]
 *   node scripts/match-signs-cluster.js --all
 *
 * Requires: SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const SUPABASE_URL  = 'https://yaogndpgnewqffbjrsgz.supabase.co';
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

const DRY_RUN    = process.argv.includes('--dry-run');
const ALL_STATES = process.argv.includes('--all');
const STATE_ARG  = process.argv.find(a => a.startsWith('--state='))?.split('=')[1];
const CONCURRENCY = parseInt(process.argv.find(a => a.startsWith('--concurrency='))?.split('=')[1] || '3', 10);

const SIGNS_DIR    = path.join(__dirname, '..', 'public', 'signs');
const SITE_URL     = 'https://www.dmvsos.com';
const HAIKU_MODEL  = 'claude-haiku-4-5-20251001';

if (!SERVICE_KEY)   { console.error('Set SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
if (!ANTHROPIC_KEY) { console.error('Set ANTHROPIC_API_KEY');         process.exit(1); }
if (!ALL_STATES && !STATE_ARG) {
  console.error('Specify --state=<slug> or --all');
  process.exit(1);
}

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

// ---------------------------------------------------------------------------
// Available sign images
// ---------------------------------------------------------------------------

const SIGN_FILES = fs.readdirSync(SIGNS_DIR)
  .filter(f => /\.(png|jpg|jpeg|svg|webp)$/i.test(f))
  .sort();

// Human-readable description from filename: "no-left-turn.png" -> "no left turn"
function signLabel(filename) {
  return filename.replace(/\.[^.]+$/, '').replace(/-/g, ' ');
}

// Icons/illustrations that are NOT real road signs — exclude from matching
// (they look odd next to DMV questions expecting an actual sign image)
// Images that are icons/diagrams/illustrations — NOT real road signs.
// These look wrong next to DMV questions that expect an actual sign or signal image.
const ICON_BLACKLIST = new Set([
  // Vehicle icons (school-bus.png is OK — it's relevant for school bus questions)
  'ambulance.png', 'police-car.png', 'fire-truck.png', 'tow-truck.png',
  'motorcycle.png', 'semi-truck.png', 'car-crash.png',
  'electric-car.png', 'ev-charging.png',
  // Situation illustrations
  'hydroplaning.png', 'flat-tire.png', 'blind-spot.png',
  'following-distance.png', 'lane-keeping.png', 'low-beam.png', 'fog-light.png',
  // Diagrams
  'crosswalk-diagram.png', 'roundabout-diagram.png', 'intersection.png',
  // Generic symbols (too vague — prefer specific real sign images)
  'traffic-light.png',  // use signal-ahead.png instead
  'speedometer.png', 'parking-meter.png', 'highway-road.png',
  'seatbelt.png', 'no-alcohol.png', 'no-texting.png', 'motorcycle-helmet.png',
]);

const SIGN_FILES_FILTERED = SIGN_FILES.filter(f => !ICON_BLACKLIST.has(f));
const SIGNS_LIST = SIGN_FILES_FILTERED.map(f => `${f} (${signLabel(f)})`).join('\n');

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function parseJSON(text) {
  const cleaned = text.replace(/```(?:json)?\s*/g, '').replace(/```\s*/g, '').trim();
  try { return JSON.parse(cleaned); } catch { /* fall through */ }
  const match = cleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (match) { try { return JSON.parse(match[1]); } catch { /* fall through */ } }
  return null;
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
// Claude helpers
// ---------------------------------------------------------------------------

async function callClaude(messages, model = HAIKU_MODEL, maxTokens = 512) {
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
    const wait = parseInt(res.headers.get('retry-after') || '30', 10);
    console.log(`  Rate limited, waiting ${wait}s...`);
    await sleep(wait * 1000);
    return callClaude(messages, model, maxTokens);
  }
  if (res.status === 529) {
    console.log('  Overloaded, waiting 60s...');
    await sleep(60000);
    return callClaude(messages, model, maxTokens);
  }
  if (!res.ok) throw new Error(`Claude API ${res.status}: ${await res.text()}`);

  const data = await res.json();
  return data.content?.[0]?.text || '';
}

// ---------------------------------------------------------------------------
// Step 1: Text matching — pick best sign by filename
// ---------------------------------------------------------------------------

async function pickSignByText(question, options, correctAnswerIndex) {
  const correctAnswer = options[correctAnswerIndex] || '';
  const optionsStr = options.filter(Boolean).join(' | ');
  const prompt = `You are matching a road sign image to a DMV test question.

Question: ${question}
Answer options: ${optionsStr}
CORRECT answer: ${correctAnswer}

Available sign images:
${SIGNS_LIST}

Pick the ONE sign image that shows the sign described by the CORRECT answer.
Return JSON only:
{ "filename": "no-left-turn.png", "confidence": "high" }

confidence: "high" = clearly matches the correct answer, "medium" = probably right, "low" = uncertain
If NO sign matches the correct answer, return: { "filename": null }`;

  const raw = await callClaude([{ role: 'user', content: prompt }]);
  return parseJSON(raw);
}

// ---------------------------------------------------------------------------
// Step 2: Vision verification
// ---------------------------------------------------------------------------

async function verifyWithVision(question, signFile) {
  const imgPath = path.join(SIGNS_DIR, signFile);
  if (!fs.existsSync(imgPath)) return false;

  const buffer = fs.readFileSync(imgPath);
  const base64 = buffer.toString('base64');
  const ext = path.extname(signFile).toLowerCase().replace('.', '');
  const mediaType = ext === 'jpg' ? 'image/jpeg'
    : ext === 'svg' ? 'image/svg+xml'
    : `image/${ext}`;

  const messages = [{
    role: 'user',
    content: [
      { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
      { type: 'text', text: `Would this exact image appear in a driver's manual or textbook to DIRECTLY illustrate this question?\n\n"${question}"\n\nAnswer ONLY "yes" or "no". Be strict — generic symbols or loosely related images should be "no".` },
    ],
  }];

  const raw = await callClaude(messages, HAIKU_MODEL, 64);
  return raw.toLowerCase().includes('yes');
}

// ---------------------------------------------------------------------------
// Main: match signs for one state
// ---------------------------------------------------------------------------

async function processState(state) {
  console.log(`\n====== ${state.toUpperCase()} ======`);

  // Fetch EN questions with needs_image=true and cluster_code set
  const questions = await supabaseGetAll(
    'questions',
    `state=eq.${encodeURIComponent(state)}&category=eq.car&language=eq.en&needs_image=eq.true&cluster_code=not.is.null`
  );
  console.log(`  ${questions.length} questions need images`);

  if (questions.length === 0) {
    console.log('  Nothing to do.');
    return;
  }

  let matched = 0, skipped = 0, failed = 0;

  async function processOne(q) {
    try {
      const options = [q.option_a, q.option_b, q.option_c, q.option_d].filter(Boolean);

      // Step 1: text match — pass correct answer index so AI picks the RIGHT sign
      const pick = await pickSignByText(q.question_text, options, q.correct_answer);
      if (!pick?.filename) {
        process.stdout.write(`  [${q.cluster_code}] no match found\n`);
        skipped++;
        return;
      }

      // Skip low-confidence without vision verification
      const signPath = path.join(SIGNS_DIR, pick.filename);
      if (!fs.existsSync(signPath)) {
        process.stdout.write(`  [${q.cluster_code}] file not found: ${pick.filename}\n`);
        skipped++;
        return;
      }

      // Step 2: vision verify ALL matches — no shortcuts
      const verified = await verifyWithVision(q.question_text, pick.filename);
      if (!verified) {
        process.stdout.write(`  [${q.cluster_code}] vision rejected ${pick.filename}\n`);
        skipped++;
        return;
      }

      const imageUrl = `/signs/${pick.filename}`;
      process.stdout.write(`  [${q.cluster_code}] ✓ ${pick.filename} (${pick.confidence})\n`);

      if (!DRY_RUN) {
        // Update ALL language rows with same cluster_code
        await supabasePatch(
          'questions',
          `cluster_code=eq.${encodeURIComponent(q.cluster_code)}&state=eq.${encodeURIComponent(state)}&category=eq.car`,
          { image_url: imageUrl, needs_image: false }
        );
      }
      matched++;
    } catch (err) {
      console.error(`  [${q.cluster_code}] ERROR: ${err.message}`);
      failed++;
    }
  }

  // Run with concurrency limit
  for (let i = 0; i < questions.length; i += CONCURRENCY) {
    const chunk = questions.slice(i, i + CONCURRENCY);
    await Promise.all(chunk.map(processOne));
  }

  console.log(`\n  Results: ${matched} matched, ${skipped} no match, ${failed} errors`);
  if (DRY_RUN) console.log('  [dry-run] No DB changes made');
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main() {
  console.log(`match-signs-cluster.js${DRY_RUN ? ' [DRY RUN]' : ''}`);
  console.log(`${SIGN_FILES.length} signs available`);

  const states = ALL_STATES ? Object.keys(STATE_MAP) : [STATE_ARG];

  for (const state of states) {
    if (!STATE_MAP[state]) {
      console.error(`Unknown state: ${state}`);
      continue;
    }
    try {
      await processState(state);
    } catch (err) {
      console.error(`ERROR: ${err.message}`);
    }
  }

  console.log('\nDone.');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
