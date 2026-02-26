#!/usr/bin/env node
/**
 * Match road sign images to DMV test questions — v2 (4-phase pipeline).
 *
 * Phase 1: Clear all image_url across all languages
 * Phase 2: Deterministic regex matching (~65% coverage, 0% error)
 * Phase 3: AI matching (strict, batch of 5, high-confidence only)
 * Phase 4: AI adversarial verification (batch of 10)
 * Phase 5: Write verified matches to EN, then propagate to other languages
 *
 * Usage:
 *   node scripts/match-signs-v2.js             # full run
 *   node scripts/match-signs-v2.js --dry-run   # report only, no DB writes
 *
 * Requires: SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY
 */

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SUPABASE_URL = 'https://yaogndpgnewqffbjrsgz.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const DRY_RUN = process.argv.includes('--dry-run');
const NON_EN_ONLY = process.argv.includes('--non-en-only');
const PROGRESS_FILE = path.join(__dirname, '..', '.match-signs-v2-progress.json');
const ALL_LANGS = ['en', 'ru', 'es', 'zh', 'ua'];
const NON_EN_LANGS = ['ru', 'es', 'zh', 'ua'];
const AI_BATCH_SIZE = 5;
const VERIFY_BATCH_SIZE = 10;

// Per-language keywords for filtering sign-related questions in non-EN languages.
// CRITICAL: Keep these narrow! Only words meaning "sign" or specific sign shapes.
// Broad words like "speed", "turn" will match 10k+ irrelevant questions.
const LANG_KEYWORDS = {
  ru: ['знак', 'знаки', 'знака', 'знаком', 'знаку',
       'восьмиугольн', 'пятиугольн', 'ромбовидн',
       'стоп-знак', 'дорожный знак', 'дорожного знака'],
  es: ['señal', 'señales', 'letrero', 'letreros',
       'señal de tránsito', 'señal de tráfico', 'señal vial',
       'octágono', 'pentágono'],
  zh: ['标志', '标牌', '路标', '路牌', '指示牌', '警告标志', '禁令标志'],
  ua: ['знак', 'знаки', 'знака', 'знаком', 'знаку',
       'восьмикутн', 'п\'ятикутн', 'ромбоподібн',
       'стоп-знак', 'дорожній знак', 'дорожнього знака'],
};

if (!SERVICE_KEY) { console.error('Set SUPABASE_SERVICE_ROLE_KEY env var'); process.exit(1); }
if (!ANTHROPIC_KEY) { console.error('Set ANTHROPIC_API_KEY env var'); process.exit(1); }

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

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
// Available signs
// ---------------------------------------------------------------------------

function getAvailableSigns() {
  const dir = path.join(__dirname, '..', 'public', 'signs');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith('.png')).map(f => f.replace('.png', ''));
}

// ---------------------------------------------------------------------------
// Progress file (resume support)
// ---------------------------------------------------------------------------

function loadProgress() {
  if (fs.existsSync(PROGRESS_FILE)) {
    try { return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8')); } catch { /* ignore */ }
  }
  return { phase: 0, regexMatches: {}, aiMatches: {}, verifiedMatches: {} };
}

function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

// ---------------------------------------------------------------------------
// Phase 1: Clear all image_url
// ---------------------------------------------------------------------------

async function phase1_reset() {
  console.log('\n=== PHASE 1: Reset all image_url ===\n');
  if (DRY_RUN) {
    console.log('  [dry-run] Would clear image_url for all languages');
    return;
  }

  for (const lang of ALL_LANGS) {
    await supabasePatch('questions', `language=eq.${lang}&image_url=not.is.null`, { image_url: null });
    console.log(`  Cleared image_url for ${lang}`);
  }
  console.log('  Done: all image_url cleared');
}

// ---------------------------------------------------------------------------
// Phase 2: Deterministic regex matching
// ---------------------------------------------------------------------------

// Negative patterns — if any matches, skip this question entirely
const NEGATIVE_PATTERNS = [
  /traffic signal/i,
  /traffic light/i,
  /\bgreen (arrow|light)\b/i,
  /\bred (light|ball)\b/i,
  /\byellow (light|arrow)\b/i,
  /\bpenalty\b/i,
  /\bfine\b/i,
  /\bpoints on.*license\b/i,
  /\bhow many questions\b/i,
  /\bdriver.s license\b/i,
  /\bturn signal\b/i,
  /\bhand signal\b/i,
  /\bsignal(ing|ed)?\s+(a|for|your)\s+turn/i,
  /\bsignal.*lane change/i,
];

// Deterministic regex rules — order matters (first match wins)
const REGEX_RULES = [
  // --- STOP ---
  { pattern: /\bstop sign\b/i, sign: 'stop' },
  { pattern: /\bred octagon\b/i, sign: 'stop' },
  { pattern: /\boctagon[- ]shaped.*sign\b/i, sign: 'stop' },
  { pattern: /\beight[- ]sided.*sign\b/i, sign: 'stop' },

  // --- YIELD ---
  { pattern: /\byield sign\b/i, sign: 'yield' },
  { pattern: /\bred and white triangular sign\b/i, sign: 'yield' },
  { pattern: /\bupside[- ]down triangle\b.*sign/i, sign: 'yield' },
  { pattern: /\binverted triangle\b.*sign/i, sign: 'yield' },

  // --- DO NOT ENTER ---
  { pattern: /\bdo not enter\b.*\bsign\b/i, sign: 'do-not-enter' },
  { pattern: /\bsign\b.*\bdo not enter\b/i, sign: 'do-not-enter' },
  { pattern: /\bno entry sign\b/i, sign: 'do-not-enter' },

  // --- WRONG WAY ---
  { pattern: /\bwrong way\b.*\bsign\b/i, sign: 'wrong-way' },
  { pattern: /\bsign\b.*\bwrong way\b/i, sign: 'wrong-way' },

  // --- NO PASSING ---
  { pattern: /\bno passing\b.*\bsign\b/i, sign: 'no-passing' },
  { pattern: /\bsign\b.*\bno passing\b/i, sign: 'no-passing' },
  { pattern: /\bdo not pass\b.*\bsign\b/i, sign: 'no-passing' },
  { pattern: /\byellow pennant\b/i, sign: 'no-passing' },
  { pattern: /\bpennant[- ]shaped\b/i, sign: 'no-passing' },
  { pattern: /\bno passing zone sign\b/i, sign: 'no-passing' },

  // --- ONE WAY ---
  { pattern: /\bone[- ]way\b.*\bsign\b/i, sign: 'one-way' },
  { pattern: /\bsign\b.*\bone[- ]way\b/i, sign: 'one-way' },

  // --- KEEP RIGHT ---
  { pattern: /\bkeep right\b.*\bsign\b/i, sign: 'keep-right' },
  { pattern: /\bsign\b.*\bkeep right\b/i, sign: 'keep-right' },

  // --- NO LEFT TURN ---
  { pattern: /\bno left turn\b.*\bsign\b/i, sign: 'no-left-turn' },
  { pattern: /\bsign\b.*\bno left turn\b/i, sign: 'no-left-turn' },

  // --- NO RIGHT TURN ---
  { pattern: /\bno right turn\b.*\bsign\b/i, sign: 'no-right-turn' },
  { pattern: /\bsign\b.*\bno right turn\b/i, sign: 'no-right-turn' },

  // --- NO U-TURN ---
  { pattern: /\bno u[- ]?turn\b.*\bsign\b/i, sign: 'no-u-turn' },
  { pattern: /\bsign\b.*\bno u[- ]?turn\b/i, sign: 'no-u-turn' },

  // --- SPEED LIMIT ---
  { pattern: /\bspeed limit\b.*\bsign\b/i, sign: 'speed-limit' },
  { pattern: /\bsign\b.*\bspeed limit\b/i, sign: 'speed-limit' },

  // --- SCHOOL ZONE ---
  { pattern: /\bschool zone\b.*\bsign\b/i, sign: 'school-zone' },
  { pattern: /\bschool crossing\b.*\bsign\b/i, sign: 'school-zone' },
  { pattern: /\bschool sign\b/i, sign: 'school-zone' },
  { pattern: /\byellow pentagon\b.*\bsign\b/i, sign: 'school-zone' },
  { pattern: /\bpentagon[- ]shaped\b.*\bsign\b/i, sign: 'school-zone' },

  // --- PEDESTRIAN CROSSING ---
  { pattern: /\bpedestrian crossing\b.*\bsign\b/i, sign: 'pedestrian-crossing' },
  { pattern: /\bpedestrian\b.*\bsign\b/i, sign: 'pedestrian-crossing' },
  { pattern: /\bsign\b.*\bpedestrian\b/i, sign: 'pedestrian-crossing' },

  // --- RAILROAD ---
  { pattern: /\bcross-?buck\b/i, sign: 'railroad-crossbuck' },
  { pattern: /\brailroad crossing sign\b/i, sign: 'railroad-crossbuck' },
  { pattern: /\brailroad advance warning\b/i, sign: 'railroad-warning' },
  { pattern: /\bround yellow\b.*\bsign\b.*\brailroad\b/i, sign: 'railroad-warning' },
  { pattern: /\brailroad\b.*\bround yellow\b.*\bsign\b/i, sign: 'railroad-warning' },
  { pattern: /\brailroad warning sign\b/i, sign: 'railroad-warning' },

  // --- DEER CROSSING ---
  { pattern: /\bdeer crossing\b.*\bsign\b/i, sign: 'deer-crossing' },
  { pattern: /\bsign\b.*\bdeer crossing\b/i, sign: 'deer-crossing' },

  // --- ROAD WORK ---
  { pattern: /\broad work\b.*\bsign\b/i, sign: 'road-work' },
  { pattern: /\bwork zone\b.*\bsign\b/i, sign: 'road-work' },
  { pattern: /\bconstruction\b.*\bsign\b/i, sign: 'road-work' },
  { pattern: /\bsign\b.*\bconstruction\b/i, sign: 'road-work' },
  { pattern: /\borange diamond\b.*\bsign\b/i, sign: 'road-work' },

  // --- MERGE ---
  { pattern: /\bmerge sign\b/i, sign: 'merge' },
  { pattern: /\bmerge\b.*\bsign\b/i, sign: 'merge' },
  { pattern: /\bsign\b.*\bmerge\b/i, sign: 'merge' },

  // --- LANE ENDS ---
  { pattern: /\blane ends\b.*\bsign\b/i, sign: 'lane-ends' },
  { pattern: /\bsign\b.*\blane ends\b/i, sign: 'lane-ends' },

  // --- DIVIDED HIGHWAY ---
  { pattern: /\bdivided highway\b.*\bsign\b/i, sign: 'divided-highway' },
  { pattern: /\bsign\b.*\bdivided highway\b/i, sign: 'divided-highway' },

  // --- TWO-WAY TRAFFIC ---
  { pattern: /\btwo[- ]way traffic\b.*\bsign\b/i, sign: 'two-way-traffic' },
  { pattern: /\bsign\b.*\btwo[- ]way traffic\b/i, sign: 'two-way-traffic' },

  // --- NARROW BRIDGE ---
  { pattern: /\bnarrow bridge\b.*\bsign\b/i, sign: 'narrow-bridge' },
  { pattern: /\bsign\b.*\bnarrow bridge\b/i, sign: 'narrow-bridge' },

  // --- SIGNAL AHEAD ---
  { pattern: /\bsignal ahead\b.*\bsign\b/i, sign: 'signal-ahead' },
  { pattern: /\bsign\b.*\bsignal ahead\b/i, sign: 'signal-ahead' },

  // --- STOP AHEAD ---
  { pattern: /\bstop ahead\b.*\bsign\b/i, sign: 'stop-ahead' },
  { pattern: /\bsign\b.*\bstop ahead\b/i, sign: 'stop-ahead' },

  // --- CURVE ---
  { pattern: /\bcurve\b.*\bsign\b/i, sign: 'curve-right' },
  { pattern: /\bsign\b.*\bcurve\b/i, sign: 'curve-right' },

  // --- SHARP TURN ---
  { pattern: /\bsharp turn\b.*\bsign\b/i, sign: 'sharp-turn' },
  { pattern: /\bsign\b.*\bsharp turn\b/i, sign: 'sharp-turn' },

  // --- SLIPPERY ---
  { pattern: /\bslippery\b.*\bsign\b/i, sign: 'slippery' },
  { pattern: /\bsign\b.*\bslippery\b/i, sign: 'slippery' },

  // --- HILL ---
  { pattern: /\bhill\b.*\bsign\b/i, sign: 'hill' },
  { pattern: /\bsteep (grade|hill)\b.*\bsign\b/i, sign: 'hill' },
  { pattern: /\bsign\b.*\bsteep (grade|hill)\b/i, sign: 'hill' },

  // --- WINDING ROAD ---
  { pattern: /\bwinding road\b.*\bsign\b/i, sign: 'winding-road' },
  { pattern: /\bsign\b.*\bwinding road\b/i, sign: 'winding-road' },

  // --- ADVISORY SPEED ---
  { pattern: /\badvisory speed\b.*\bsign\b/i, sign: 'advisory-speed' },
  { pattern: /\bsign\b.*\badvisory speed\b/i, sign: 'advisory-speed' },
  { pattern: /\breduced speed ahead\b.*\bsign\b/i, sign: 'advisory-speed' },
];

function isNegative(text) {
  return NEGATIVE_PATTERNS.some(p => p.test(text));
}

function regexMatch(text) {
  if (isNegative(text)) return null;
  for (const rule of REGEX_RULES) {
    if (rule.pattern.test(text)) return rule.sign;
  }
  return null;
}

async function phase2_regex(questions, signIds) {
  console.log('\n=== PHASE 2: Deterministic regex matching ===\n');

  const matches = {}; // id -> sign
  let negativeSkipped = 0;

  for (const q of questions) {
    const sign = regexMatch(q.question_text);
    if (sign && signIds.includes(sign)) {
      matches[q.id] = sign;
    }
    if (isNegative(q.question_text) && q.question_text.match(/\bsign\b/i)) {
      negativeSkipped++;
    }
  }

  // Report per-sign counts
  const signCounts = {};
  for (const sign of Object.values(matches)) {
    signCounts[sign] = (signCounts[sign] || 0) + 1;
  }
  const sorted = Object.entries(signCounts).sort((a, b) => b[1] - a[1]);
  console.log(`  Matched: ${Object.keys(matches).length} questions`);
  console.log(`  Negative-filtered: ${negativeSkipped} questions with "sign" skipped`);
  console.log('  Per sign:');
  for (const [sign, count] of sorted) {
    console.log(`    ${sign}: ${count}`);
  }

  return matches;
}

// ---------------------------------------------------------------------------
// Phase 3: AI matching (strict, batch of 5)
// ---------------------------------------------------------------------------

// Pre-filters: must match at least one to be an AI candidate
const AI_CANDIDATE_PATTERNS = [
  /\bsign\b/i,
  /\bsigns\b/i,
  /\bdiamond[- ]shaped\b/i,
  /\brectangular.*traffic\b/i,
  /\bcircular.*traffic\b/i,
  /\byellow diamond\b/i,
  /\borange diamond\b/i,
  /\bwarning sign\b/i,
  /\bregulatory sign\b/i,
  /\bguide sign\b/i,
  /\binformation sign\b/i,
];

// Disqualifiers: reject even if above matches
const AI_DISQUALIFY_PATTERNS = [
  /traffic signal light/i,
  /traffic light/i,
  /\bturn signal\b/i,
  /\bhand signal\b/i,
  /\bsignal(ing|ed)?\s+(a|for|your)/i,
  /\bdesignated area/i,
  /\bsign(ed|ing) (a|the|your)/i,
  /\bsign of\b/i,
  /\bpossible sign of\b/i,
  /\bsigns of\b/i,
];

function isAiCandidate(text) {
  const hasCandidate = AI_CANDIDATE_PATTERNS.some(p => p.test(text));
  if (!hasCandidate) return false;
  const disqualified = AI_DISQUALIFY_PATTERNS.some(p => p.test(text));
  return !disqualified;
}

async function callClaude(prompt) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get('retry-after') || '30', 10);
    console.log(`\n  Rate limited, waiting ${retryAfter}s...`);
    await sleep(retryAfter * 1000);
    return callClaude(prompt);
  }
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data.content?.[0]?.text || '';
}

function buildAiPrompt(questionText, signIds) {
  const signList = signIds.join(', ');
  return `You are classifying whether a DMV test question is specifically asking about a physical road sign that should be illustrated with an image.

Available sign images (ONLY these ${signIds.length} exist):
${signList}

=== EXAMPLES OF CORRECT MATCHES ===
Q: "Which sign tells you to slow down because you are approaching a double curve?"
Reasoning: This asks to identify a specific sign. A double curve = winding-road sign.
Answer: winding-road

Q: "What does a yellow diamond-shaped sign with two cars on it indicate?"
Reasoning: Yellow diamond = warning sign. Two cars facing each other = two-way-traffic.
Answer: two-way-traffic

Q: "What does a 'Reduced Speed Ahead' sign indicate?"
Reasoning: This is about advisory-speed sign (reduced speed ahead is advisory).
Answer: advisory-speed

=== EXAMPLES OF CORRECT REJECTIONS (null) ===
Q: "What is the speed limit in a school zone?"
Reasoning: This asks about the legal speed limit rule, not about identifying a sign.
Answer: null

Q: "What should you do when approaching a railroad crossing?"
Reasoning: About driving procedure at railroad crossing, not about the sign itself.
Answer: null

Q: "What does a green arrow signal mean?"
Reasoning: About a traffic signal light, not a road sign.
Answer: null

Q: "When should you signal for a turn?"
Reasoning: About signaling while driving, not about a road sign.
Answer: null

Q: "What is a possible sign of unsafe driving?"
Reasoning: "sign" used in the general English sense, not a road sign.
Answer: null

=== YOUR TASK ===
Respond with JSON only. Think step by step.
{
  "reasoning": "brief explanation (1-2 sentences)",
  "sign": "<sign-id>" or null,
  "confidence": "high" | "medium" | "low"
}

CRITICAL RULE: If you have ANY doubt, return null. A false positive (wrong image on a question) is far worse than a false negative (missing an image).

Question: "${questionText.replace(/"/g, '\\"')}"`;
}

async function phase3_ai(questions, regexMatches, signIds, progress) {
  console.log('\n=== PHASE 3: AI matching (strict) ===\n');

  // Find candidates: have "sign" keyword, not already matched by regex, pass filters
  const alreadyMatched = new Set(Object.keys(regexMatches));
  const candidates = questions.filter(q =>
    !alreadyMatched.has(q.id) && isAiCandidate(q.question_text)
  );

  console.log(`  Candidates for AI: ${candidates.length} (excluded ${alreadyMatched.size} regex matches)`);
  if (!candidates.length) return {};

  const aiMatches = { ...progress.aiMatches };
  const alreadyProcessed = new Set(Object.keys(aiMatches));
  const toProcess = candidates.filter(q => !alreadyProcessed.has(q.id));
  console.log(`  Already processed (from progress): ${alreadyProcessed.size}`);
  console.log(`  Remaining: ${toProcess.length}\n`);

  let processed = 0;
  let matched = 0;
  let skippedLowConf = 0;

  for (let i = 0; i < toProcess.length; i += AI_BATCH_SIZE) {
    const batch = toProcess.slice(i, i + AI_BATCH_SIZE);

    for (const q of batch) {
      try {
        const prompt = buildAiPrompt(q.question_text, signIds);
        const response = await callClaude(prompt);

        // Parse JSON from response
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.sign && parsed.confidence === 'high' && signIds.includes(parsed.sign)) {
            aiMatches[q.id] = { sign: parsed.sign, reasoning: parsed.reasoning || '' };
            matched++;
          } else if (parsed.sign && parsed.confidence !== 'high') {
            skippedLowConf++;
          }
          // null sign = correct rejection, no action needed
        }
      } catch (e) {
        console.log(`\n  Error on q${q.id}: ${e.message}`);
      }
      processed++;
    }

    process.stdout.write(`\r  AI: ${processed}/${toProcess.length} processed, ${matched} matched, ${skippedLowConf} low-conf skipped`);

    // Save progress after each batch
    progress.aiMatches = aiMatches;
    saveProgress(progress);

    await sleep(1000);
  }
  console.log();

  console.log(`\n  AI matched: ${matched} questions`);
  console.log(`  Low-confidence skipped: ${skippedLowConf}`);

  return aiMatches;
}

// ---------------------------------------------------------------------------
// Phase 4: AI adversarial verification
// ---------------------------------------------------------------------------

function buildVerifyPrompt(items) {
  const list = items.map(it =>
    `ID ${it.id}: "${it.question_text}" -> proposed sign: "${it.sign}"`
  ).join('\n');

  return `You are reviewing whether road sign images were correctly matched to DMV test questions.

For each question below, a sign image has been proposed. Your job is to REJECT only clearly WRONG matches.

KEEP a match if:
- The question mentions a specific road sign by name ("stop sign", "yield sign", "no passing sign", etc.)
- The question describes a sign's shape/color that matches the proposed sign
- The question asks what to do when you SEE a specific sign (the image helps the student recognize it)
- The question asks about the meaning of a specific sign

REJECT a match ONLY if:
1. The WRONG sign was assigned (e.g., "school-zone" matched to a question about speed limits in general)
2. The question is about traffic signals/lights, NOT road signs
3. The question uses "sign" in a non-road-sign sense ("sign of fatigue", "signing a document")
4. The question doesn't reference any specific sign (generic driving rule with no sign mentioned)

IMPORTANT: If a question mentions a specific sign by name (e.g., "stop sign", "yield sign"), KEEP it even if the question asks about rules or behavior. Showing the sign image helps students learn to recognize it.

Respond with ONLY a JSON array. Each element:
{"id": "<question_id>", "verdict": "keep" | "reject", "reason": "brief reason"}

Questions with proposed matches:
${list}`;
}

async function phase4_verify(questions, regexMatches, aiMatches, signIds, progress) {
  console.log('\n=== PHASE 4: AI adversarial verification ===\n');

  // Build list of all matches to verify
  const questionMap = {};
  for (const q of questions) questionMap[q.id] = q.question_text;

  const allItems = [];

  for (const [id, sign] of Object.entries(regexMatches)) {
    if (questionMap[id]) {
      allItems.push({ id, question_text: questionMap[id], sign, source: 'regex' });
    }
  }
  for (const [id, data] of Object.entries(aiMatches)) {
    if (questionMap[id]) {
      allItems.push({ id, question_text: questionMap[id], sign: data.sign, source: 'ai' });
    }
  }

  console.log(`  Total matches to verify: ${allItems.length} (${Object.keys(regexMatches).length} regex + ${Object.keys(aiMatches).length} AI)`);

  const verified = { ...progress.verifiedMatches };
  const alreadyVerified = new Set(Object.keys(verified));
  const toVerify = allItems.filter(it => !alreadyVerified.has(it.id));
  console.log(`  Already verified (from progress): ${alreadyVerified.size}`);
  console.log(`  Remaining: ${toVerify.length}\n`);

  let kept = Object.values(verified).filter(v => v.verdict === 'keep').length;
  let rejected = Object.values(verified).filter(v => v.verdict === 'reject').length;
  let processed = 0;

  for (let i = 0; i < toVerify.length; i += VERIFY_BATCH_SIZE) {
    const batch = toVerify.slice(i, i + VERIFY_BATCH_SIZE);

    try {
      const prompt = buildVerifyPrompt(batch);
      const response = await callClaude(prompt);
      const jsonMatch = response.match(/\[[\s\S]*\]/);

      if (jsonMatch) {
        const results = JSON.parse(jsonMatch[0]);
        for (const r of results) {
          const item = batch.find(b => b.id === r.id);
          if (!item) continue;
          verified[r.id] = {
            verdict: r.verdict,
            reason: r.reason || '',
            sign: item.sign,
            source: item.source,
          };
          if (r.verdict === 'keep') kept++;
          else rejected++;
        }
      }
    } catch (e) {
      console.log(`\n  Verify batch error: ${e.message}`);
    }

    processed += batch.length;
    process.stdout.write(`\r  Verify: ${processed}/${toVerify.length}, kept: ${kept}, rejected: ${rejected}`);

    progress.verifiedMatches = verified;
    saveProgress(progress);

    await sleep(1000);
  }
  console.log();

  // Report rejected matches
  const rejectedItems = Object.entries(verified)
    .filter(([, v]) => v.verdict === 'reject')
    .map(([id, v]) => ({ id, ...v }));

  if (rejectedItems.length > 0) {
    console.log(`\n  Rejected matches (${rejectedItems.length}):`);
    for (const r of rejectedItems.slice(0, 20)) {
      const text = (questionMap[r.id] || '').substring(0, 80);
      console.log(`    q${r.id}: ${r.sign} (${r.source}) - ${r.reason}`);
      console.log(`      "${text}..."`);
    }
    if (rejectedItems.length > 20) {
      console.log(`    ... and ${rejectedItems.length - 20} more`);
    }
  }

  return verified;
}

// ---------------------------------------------------------------------------
// Phase 5: Write to DB + summary
// ---------------------------------------------------------------------------

async function phase5_write(verified, questions) {
  console.log('\n=== PHASE 5: Write verified matches to EN ===\n');

  const toWrite = Object.entries(verified)
    .filter(([, v]) => v.verdict === 'keep')
    .map(([id, v]) => ({ id, sign: v.sign }));

  console.log(`  Verified matches to write: ${toWrite.length}`);

  // Per-sign summary
  const signCounts = {};
  for (const { sign } of toWrite) {
    signCounts[sign] = (signCounts[sign] || 0) + 1;
  }
  const sorted = Object.entries(signCounts).sort((a, b) => b[1] - a[1]);
  console.log('\n  Per sign:');
  for (const [sign, count] of sorted) {
    console.log(`    ${sign}: ${count}`);
  }

  // Sample matches for manual review
  console.log('\n  Sample matches for review:');
  const questionMap = {};
  for (const q of questions) questionMap[q.id] = q.question_text;

  const samples = toWrite.slice(0, 15);
  for (const { id, sign } of samples) {
    const text = (questionMap[id] || '').substring(0, 100);
    console.log(`    q${id}: ${sign} <- "${text}"`);
  }

  if (DRY_RUN) {
    console.log('\n  [dry-run] Would write these matches to DB. Skipping.');
    return toWrite.length;
  }

  // Write to DB
  let written = 0;
  for (const { id, sign } of toWrite) {
    try {
      await supabasePatch('questions', `id=eq.${id}`, { image_url: `/signs/${sign}.png` });
      written++;
      if (written % 50 === 0) {
        process.stdout.write(`\r  Written: ${written}/${toWrite.length}`);
      }
    } catch (e) {
      console.log(`\n  Error writing q${id}: ${e.message}`);
    }
  }
  console.log(`\n  Written: ${written} matches to EN questions`);

  return written;
}

// ---------------------------------------------------------------------------
// Non-EN language processing (AI-only pipeline)
// ---------------------------------------------------------------------------

const NON_EN_BATCH_SIZE = 10;

function buildBatchAiPrompt(questions, signIds) {
  const signList = signIds.join(', ');
  const qList = questions.map(q => `ID ${q.id}: "${q.question_text}"`).join('\n');

  return `You are matching DMV test questions to road sign images. Questions may be in any language (Russian, Spanish, Chinese, Ukrainian).

Available sign image IDs (ONLY these ${signIds.length} exist):
${signList}

STRICT RULES:
- Match ONLY if the question is SPECIFICALLY about a particular road sign — asking to identify it, describing its shape/color/meaning, or what a driver should do when they SEE that specific sign.
- Do NOT match general driving questions that merely mention a concept (e.g. "What is the speed limit in a school zone?" is NOT about the sign).
- Do NOT match questions about traffic signals/lights, hand signals, or turn signals.
- Do NOT match questions about traffic laws, penalties, or procedures even if they mention a sign-related word.
- The word "sign" (знак/señal/标志/знак) in the question does NOT automatically mean it's about a road sign. Many questions use "sign" to mean "indicator" or "symptom".
- When in doubt, use null. It is much better to miss a match than to make a wrong one.
- Only return matches with HIGH confidence.

Respond with ONLY a JSON array. Each element: {"id": "<question_id>", "sign": "<sign_id>" or null}

Questions:
${qList}`;
}

async function processNonEnLang(lang, signIds, progressFile) {
  console.log(`\n========== ${lang.toUpperCase()} ==========\n`);

  // Load per-language progress
  let langProgress = { aiMatches: {}, verified: {}, written: false };
  if (fs.existsSync(progressFile)) {
    try { langProgress = JSON.parse(fs.readFileSync(progressFile, 'utf8')); } catch { /* ignore */ }
  }
  function saveLangProgress() {
    fs.writeFileSync(progressFile, JSON.stringify(langProgress, null, 2));
  }

  // 1. Reset this language
  if (!DRY_RUN && !langProgress.reset) {
    await supabasePatch('questions', `language=eq.${lang}&image_url=not.is.null`, { image_url: null });
    console.log(`  Reset image_url for ${lang}`);
    langProgress.reset = true;
    saveLangProgress();
  }

  // 2. Fetch candidates using keyword filtering
  const keywords = LANG_KEYWORDS[lang];
  const orFilter = keywords.map(k => `question_text.ilike.*${k}*`).join(',');
  const candidates = await supabaseGetAll(
    'questions',
    `language=eq.${lang}&image_url=is.null&or=(${encodeURIComponent(orFilter)})&select=id,question_text&order=id`
  );
  console.log(`  ${lang}: ${candidates.length} candidates with sign-related keywords`);
  if (!candidates.length) return 0;

  // 3. Batch AI matching
  const aiMatches = { ...langProgress.aiMatches };
  const alreadyProcessed = new Set(Object.keys(aiMatches));
  const toProcess = candidates.filter(q => !alreadyProcessed.has(q.id));
  console.log(`  Already matched (from progress): ${alreadyProcessed.size}`);
  console.log(`  Remaining for AI: ${toProcess.length}\n`);

  let processed = 0, matched = Object.values(aiMatches).filter(v => v && v.sign).length;

  for (let i = 0; i < toProcess.length; i += NON_EN_BATCH_SIZE) {
    const batch = toProcess.slice(i, i + NON_EN_BATCH_SIZE);
    try {
      const prompt = buildBatchAiPrompt(batch, signIds);
      const response = await callClaude(prompt);
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const results = JSON.parse(jsonMatch[0]);
        for (const r of results) {
          const q = batch.find(b => b.id === r.id);
          if (!q) continue;
          if (r.sign && signIds.includes(r.sign)) {
            aiMatches[q.id] = { sign: r.sign };
            matched++;
          } else {
            aiMatches[q.id] = { sign: null };
          }
        }
      }
      // Mark all batch items as processed even if not in results
      for (const q of batch) {
        if (!aiMatches[q.id]) aiMatches[q.id] = { sign: null };
      }
    } catch (e) {
      console.log(`\n  Batch error: ${e.message}`);
    }
    processed += batch.length;
    process.stdout.write(`\r  ${lang} AI: ${processed}/${toProcess.length} (${matched} matched)`);
    langProgress.aiMatches = aiMatches;
    if (processed % 100 === 0) saveLangProgress(); // save every 100 to reduce I/O
    await sleep(500);
  }
  saveLangProgress();
  console.log(`\n\n  ${lang} AI matched: ${matched} questions`);

  // 4. Verification
  const questionMap = {};
  for (const q of candidates) questionMap[q.id] = q.question_text;

  const matchedItems = Object.entries(aiMatches)
    .filter(([, v]) => v.sign)
    .map(([id, v]) => ({ id, question_text: questionMap[id] || '', sign: v.sign, source: 'ai' }))
    .filter(it => it.question_text); // skip if question not found

  console.log(`\n  Matches to verify: ${matchedItems.length}`);

  const verified = { ...langProgress.verified };
  const alreadyVerified = new Set(Object.keys(verified));
  const toVerify = matchedItems.filter(it => !alreadyVerified.has(it.id));
  console.log(`  Already verified (from progress): ${alreadyVerified.size}`);
  console.log(`  Remaining: ${toVerify.length}\n`);

  let kept = Object.values(verified).filter(v => v.verdict === 'keep').length;
  let rejected = Object.values(verified).filter(v => v.verdict === 'reject').length;
  let verProcessed = 0;

  for (let i = 0; i < toVerify.length; i += VERIFY_BATCH_SIZE) {
    const batch = toVerify.slice(i, i + VERIFY_BATCH_SIZE);
    try {
      const prompt = buildVerifyPrompt(batch);
      const response = await callClaude(prompt);
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const results = JSON.parse(jsonMatch[0]);
        for (const r of results) {
          const item = batch.find(b => b.id === r.id);
          if (!item) continue;
          verified[r.id] = { verdict: r.verdict, reason: r.reason || '', sign: item.sign };
          if (r.verdict === 'keep') kept++;
          else rejected++;
        }
      }
    } catch (e) {
      console.log(`\n  Verify batch error: ${e.message}`);
    }
    verProcessed += batch.length;
    process.stdout.write(`\r  ${lang} verify: ${verProcessed}/${toVerify.length}, kept: ${kept}, rejected: ${rejected}`);
    langProgress.verified = verified;
    saveLangProgress();
    await sleep(1000);
  }
  console.log();

  // 5. Write
  const toWrite = Object.entries(verified)
    .filter(([, v]) => v.verdict === 'keep')
    .map(([id, v]) => ({ id, sign: v.sign }));

  console.log(`\n  ${lang}: ${toWrite.length} verified matches to write`);

  if (DRY_RUN) {
    console.log(`  [dry-run] Skipping writes for ${lang}`);
    return toWrite.length;
  }

  let written = 0;
  for (const { id, sign } of toWrite) {
    try {
      await supabasePatch('questions', `id=eq.${id}`, { image_url: `/signs/${sign}.png` });
      written++;
      if (written % 50 === 0) process.stdout.write(`\r  ${lang} written: ${written}/${toWrite.length}`);
    } catch (e) {
      console.log(`\n  Error writing q${id}: ${e.message}`);
    }
  }
  console.log(`\n  ${lang}: ${written} matches written to DB`);

  // Clean up progress file
  if (fs.existsSync(progressFile)) fs.unlinkSync(progressFile);

  return written;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('==============================================');
  console.log('  match-signs-v2: 4-phase pipeline');
  console.log(`  Mode: ${DRY_RUN ? 'DRY RUN (no DB writes)' : 'LIVE'}`);
  console.log('==============================================');

  const signIds = getAvailableSigns();
  if (!signIds.length) {
    console.log('No signs in /public/signs/. Run download-signs.js first.');
    return;
  }
  console.log(`\nFound ${signIds.length} sign images: ${signIds.join(', ')}`);

  let written = 0, keptCount = 0;

  if (!NON_EN_ONLY) {
    // Load progress
    let progress = loadProgress();

    // Phase 1: Reset
    if (progress.phase < 1) {
      await phase1_reset();
      progress.phase = 1;
      saveProgress(progress);
    } else {
      console.log('\n=== PHASE 1: Reset === (skipped, already done)');
    }

    // Fetch all EN questions
    console.log('\nFetching all EN questions...');
    const questions = await supabaseGetAll(
      'questions',
      'language=eq.en&select=id,question_text&order=id'
    );
    console.log(`  Total EN questions: ${questions.length}`);

    // Phase 2: Regex
    let regexMatches;
    if (progress.phase < 2) {
      regexMatches = await phase2_regex(questions, signIds);
      progress.regexMatches = regexMatches;
      progress.phase = 2;
      saveProgress(progress);
    } else {
      regexMatches = progress.regexMatches || {};
      console.log(`\n=== PHASE 2: Regex === (skipped, ${Object.keys(regexMatches).length} matches from progress)`);
    }

    // Phase 3: AI matching
    let aiMatches;
    if (progress.phase < 3) {
      aiMatches = await phase3_ai(questions, regexMatches, signIds, progress);
      progress.aiMatches = aiMatches;
      progress.phase = 3;
      saveProgress(progress);
    } else {
      aiMatches = progress.aiMatches || {};
      console.log(`\n=== PHASE 3: AI matching === (skipped, ${Object.keys(aiMatches).length} matches from progress)`);
    }

    // Phase 4: Verification
    let verified;
    if (progress.phase < 4) {
      verified = await phase4_verify(questions, regexMatches, aiMatches, signIds, progress);
      progress.verifiedMatches = verified;
      progress.phase = 4;
      saveProgress(progress);
    } else {
      verified = progress.verifiedMatches || {};
      console.log(`\n=== PHASE 4: Verification === (skipped, from progress)`);
    }

    // Phase 5: Write
    written = await phase5_write(verified, questions);

    // EN summary
    keptCount = Object.values(verified).filter(v => v.verdict === 'keep').length;
    const rejectedCount = Object.values(verified).filter(v => v.verdict === 'reject').length;

    console.log('\n==============================================');
    console.log('  EN SUMMARY');
    console.log('==============================================');
    console.log(`  Total EN questions:     ${questions.length}`);
    console.log(`  Regex matches:          ${Object.keys(regexMatches).length}`);
    console.log(`  AI matches:             ${Object.keys(aiMatches).length}`);
    console.log(`  Verified (kept):        ${keptCount}`);
    console.log(`  Rejected:               ${rejectedCount}`);
    console.log(`  Written to DB:          ${DRY_RUN ? '0 (dry run)' : written}`);
    console.log('==============================================');
  } else {
    console.log('\n  --non-en-only: skipping EN pipeline');
  }

  if (!DRY_RUN) {
    // Clean up progress file on successful completion
    if (fs.existsSync(PROGRESS_FILE)) fs.unlinkSync(PROGRESS_FILE);
  }

  // Process non-EN languages (always when running full, or when --non-en-only)
  if (!NON_EN_ONLY) {
    console.log('\n\n====== NON-EN LANGUAGES (AI-only pipeline) ======');
  }

  let totalNonEn = 0;
  for (const lang of NON_EN_LANGS) {
    const progressFile = path.join(__dirname, '..', `.match-signs-v2-${lang}-progress.json`);
    const count = await processNonEnLang(lang, signIds, progressFile);
    totalNonEn += count;
  }

  console.log('\n==============================================');
  console.log('  FINAL SUMMARY (ALL LANGUAGES)');
  console.log('==============================================');
  if (!NON_EN_ONLY) {
    console.log(`  EN: ${DRY_RUN ? keptCount + ' (dry run)' : written} matches`);
  }
  for (const lang of NON_EN_LANGS) {
    console.log(`  ${lang.toUpperCase()}: included in total below`);
  }
  console.log(`  Non-EN total: ${totalNonEn} matches`);
  console.log('==============================================');

  if (DRY_RUN) {
    console.log('\nRe-run without --dry-run to write matches to DB.');
  }
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
