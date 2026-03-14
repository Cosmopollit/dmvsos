#!/usr/bin/env node
/**
 * Generate CDL questions for Air Brakes and Combination Vehicles subcategories.
 *
 * Uses Sonnet with RAG from official CDL manuals. Generates questions per topic,
 * validates quality, deduplicates against existing DB questions, uploads to Supabase.
 * Also classifies existing CDL questions as general_knowledge.
 *
 * Pipeline per state:
 *   Phase 1: Classify existing CDL questions → subcategory = general_knowledge
 *   Phase 2: Generate Air Brakes questions (8 topics × 15 q = 120)
 *   Phase 3: Generate Combination Vehicles questions (8 topics × 15 q = 120)
 *   Phase 4: Quality validation — Sonnet reviews each generated question
 *   Phase 5: Upload to Supabase with subcategory set
 *
 * Usage:
 *   node scripts/generate-cdl-subcategory.js --state=washington [--dry-run]
 *   node scripts/generate-cdl-subcategory.js --all [--parallel=3]
 *   node scripts/generate-cdl-subcategory.js --state=california --phase=2  (skip phase 1)
 *   node scripts/generate-cdl-subcategory.js --all --classify-only          (phase 1 only)
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
const CONCURRENCY = parseInt(process.argv.find(a => a.startsWith('--concurrency='))?.split('=')[1] || '3', 10);
const START_PHASE = parseInt(process.argv.find(a => a.startsWith('--phase='))?.split('=')[1] || '1', 10);
const CLASSIFY_ONLY = process.argv.includes('--classify-only');

const SONNET_MODEL = 'claude-sonnet-4-6';
const HAIKU_MODEL = 'claude-haiku-4-5-20251001';
const MANUALS_DIR = path.join(__dirname, '..', '.manuals-text');

if (!SERVICE_KEY) { console.error('Set SUPABASE_SERVICE_ROLE_KEY env var'); process.exit(1); }
if (!ANTHROPIC_KEY) { console.error('Set ANTHROPIC_API_KEY env var'); process.exit(1); }
if (!ALL_STATES && !STATE_ARG) {
  console.error('Specify --state=washington or --all');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Topics for generation — carefully designed for CDL exam coverage
// ---------------------------------------------------------------------------

const AIR_BRAKES_TOPICS = [
  {
    name: 'Air brake system components',
    details: 'air compressor, governor (cut-in/cut-out pressure ~100/125 psi), air storage tanks, drain valves (manual and automatic), safety valve',
  },
  {
    name: 'Foundation brake components',
    details: 'brake chambers, push rods, slack adjusters (manual and automatic), s-cam, brake drums, brake linings/shoes, wedge brakes, disc brakes',
  },
  {
    name: 'Dual air brake systems',
    details: 'primary and secondary systems, redundancy, what happens when one system fails, air pressure gauges for both systems',
  },
  {
    name: 'Air brake gauges and warnings',
    details: 'air pressure gauges, low air pressure warning (below 60 psi), spring brake activation (20-45 psi), wig-wag warning, buzzer',
  },
  {
    name: 'Using air brakes properly',
    details: 'brake lag (delay ~0.4 seconds), stopping distance with air brakes vs hydraulic, controlled braking, stab braking, brake fade, overheating',
  },
  {
    name: 'Parking brakes and spring brakes',
    details: 'spring brakes (parking brakes), modulator valve, how spring brakes work, when they activate automatically, never use parking brake if brakes are hot',
  },
  {
    name: 'Air brake inspection and testing',
    details: 'pre-trip inspection steps, air leakage rate test (3 psi/min single, 4 psi/min combination), governor cut-in/cut-out, low pressure warning test, spring brake test',
  },
  {
    name: 'Air brake emergencies and troubleshooting',
    details: 'loss of air pressure, brake failure, emergency stopping, fanning brakes (why bad), water/ice in air lines, alcohol evaporators, air dryers',
  },
];

const COMBINATION_VEHICLES_TOPICS = [
  {
    name: 'Combination vehicle characteristics',
    details: 'types of combination vehicles (tractor-semitrailer, doubles, triples, truck and trailer), higher center of gravity, rollover risk, longer stopping distance',
  },
  {
    name: 'Coupling tractor-semitrailer',
    details: 'step-by-step coupling procedure: inspect fifth wheel, back under trailer, lock jaws, connect air lines and electrical, raise landing gear, pull against pin, check connection',
  },
  {
    name: 'Uncoupling tractor-semitrailer',
    details: 'step-by-step uncoupling: secure trailer (chock wheels), lower landing gear, disconnect air and electrical, unlock fifth wheel, pull tractor clear, inspect',
  },
  {
    name: 'Combination vehicle air brakes',
    details: 'trailer air supply (blue/red lines), glad hands, trailer air tanks, tractor protection valve, trailer service brakes, trailer parking/emergency brakes, trailer hand valve (trolley valve)',
  },
  {
    name: 'Jackknifing and skids',
    details: 'tractor jackknife vs trailer jackknife, causes (braking too hard, speeding in curves), prevention, recovery, anti-jackknife devices, anti-lock brakes',
  },
  {
    name: 'Crack-the-whip and off-tracking',
    details: 'rearward amplification (crack-the-whip effect), off-tracking in turns, wider turns needed, last trailer of doubles/triples, low-speed vs high-speed off-tracking',
  },
  {
    name: 'Inspecting combination vehicles',
    details: 'fifth wheel inspection (mounting, locking jaws, platform), air line connections, electrical connections, landing gear, coupling devices, slider/tandem pins',
  },
  {
    name: 'Safe driving practices for combinations',
    details: 'following distance, speed management in curves, lane changes, backing (sight-side), railroad crossings, mountain driving, adverse conditions, weight distribution',
  },
];

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

function stateDisplay(state) {
  return state.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
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

async function supabaseInsert(rows) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/questions`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json', Prefer: 'return=minimal',
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`INSERT: ${res.status} ${await res.text()}`);
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
    const m = clean.match(/(\[[\s\S]*\])/);
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
  const filePath = path.join(MANUALS_DIR, `${state}-cdl-en.txt`);
  manualCache[state] = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
  return manualCache[state];
}

function slidingWindowChunks(text, windowWords = 400, overlapWords = 100) {
  const words = text.split(/\s+/);
  const chunks = [];
  let start = 0;
  while (start < words.length) {
    chunks.push(words.slice(start, start + windowWords).join(' '));
    start += windowWords - overlapWords;
  }
  return chunks;
}

function findTopChunks(manualText, keywords, topN = 6) {
  if (!manualText) return [];
  const kws = keywords
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3)
    .filter(w => !['with', 'from', 'that', 'this', 'what', 'when', 'their', 'have',
      'rules', 'state', 'must', 'should', 'which', 'about', 'these', 'those',
      'been', 'will', 'more', 'than', 'each', 'other'].includes(w));

  const chunks = slidingWindowChunks(manualText);
  const scored = chunks.map(c => {
    const lower = c.toLowerCase();
    let score = 0;
    for (const kw of kws) if (lower.includes(kw)) score++;
    return { text: c, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.filter(s => s.score > 0).slice(0, topN).map(c => c.text);
}

/**
 * Extract section-specific text from manual using section headers.
 * CDL manuals typically have sections like "AIR BRAKES", "COMBINATION VEHICLES"
 */
function extractSection(manualText, sectionKeywords) {
  if (!manualText) return null;

  const lines = manualText.split('\n');
  const patterns = sectionKeywords.map(k => new RegExp(k, 'i'));

  let inSection = false;
  let sectionLines = [];
  let sectionCount = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    // Check if this line is a section header matching our keywords
    if (patterns.some(p => p.test(trimmed)) && trimmed.length < 120) {
      inSection = true;
      sectionCount++;
      sectionLines.push(line);
      continue;
    }

    // Check if we've hit a new major section (stop collecting)
    if (inSection && sectionCount > 0 && /^(SECTION\s+\d|CHAPTER\s+\d)/i.test(trimmed) &&
        !patterns.some(p => p.test(trimmed))) {
      inSection = false;
    }

    if (inSection) {
      sectionLines.push(line);
    }
  }

  const text = sectionLines.join('\n').trim();
  return text.length > 500 ? text : null;  // Return null if too short (likely wrong match)
}

// ---------------------------------------------------------------------------
// Progress helpers
// ---------------------------------------------------------------------------

function progressFilePath(state) {
  return path.join(__dirname, '..', `.generate-cdl-${state}-progress.json`);
}

function loadProgress(state) {
  const f = progressFilePath(state);
  if (fs.existsSync(f)) {
    try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { /* ignore */ }
  }
  return {
    phase1_done: false,
    phase2_done: {},   // air_brakes topic keys
    phase3_done: {},   // combination topic keys
    phase4_done: false,
    phase5_done: false,
    generated_air: [],
    generated_combo: [],
    validated: [],
    stats: { classified: 0, air_generated: 0, combo_generated: 0, validated: 0, uploaded: 0 },
  };
}

function saveProgress(state, prog) {
  if (DRY_RUN) return;
  fs.writeFileSync(progressFilePath(state), JSON.stringify(prog, null, 2));
}

// ---------------------------------------------------------------------------
// Phase 1: Classify existing CDL questions as general_knowledge
// ---------------------------------------------------------------------------

async function phase1_classify(state, progress) {
  if (progress.phase1_done) {
    console.log('  Phase 1: Already done, skipping.');
    return;
  }

  console.log('  Phase 1: Classifying existing CDL questions as general_knowledge...');

  // Set subcategory=general_knowledge for ALL cdl questions in this state (all languages)
  if (!DRY_RUN) {
    await supabasePatch(
      'questions',
      `state=eq.${encodeURIComponent(state)}&category=eq.cdl&subcategory=is.null`,
      { subcategory: 'general_knowledge' }
    );
  }

  // Count how many were classified
  const count = await supabaseGetAll(
    'questions',
    `state=eq.${encodeURIComponent(state)}&category=eq.cdl&select=id&language=eq.en`
  );

  progress.stats.classified = count.length;
  progress.phase1_done = true;
  saveProgress(state, progress);
  console.log(`    Classified ${count.length} EN questions (+ translations) as general_knowledge`);
}

// ---------------------------------------------------------------------------
// Phase 2 & 3: Generate questions for a subcategory
// ---------------------------------------------------------------------------

function buildGenerationPrompt(state, topic, manualContext, subcategory, existingQuestions) {
  const stateName = stateDisplay(state);

  // Build a sample of existing questions to avoid duplicates
  const existingSample = existingQuestions
    .slice(0, 15)
    .map((q, i) => `  ${i + 1}. ${q.question_text}`)
    .join('\n');

  const existingNote = existingSample
    ? `\n\nIMPORTANT — These questions already exist in the database for this state. Do NOT create similar questions:\n${existingSample}\n`
    : '';

  const subLabel = subcategory === 'air_brakes' ? 'Air Brakes' : 'Combination Vehicles';

  return `You are a CDL (Commercial Driver's License) test question writer for ${stateName}.
You specialize in the **${subLabel}** section of the CDL written exam.

Topic: ${topic.name}
Key concepts to cover: ${topic.details}

Relevant ${stateName} CDL Manual excerpts:
---
${manualContext}
---
${existingNote}
Generate exactly 15 high-quality multiple-choice questions about this specific topic.

STRICT REQUIREMENTS:
1. Questions must be based on official CDL manual content and FMCSA regulations
2. Each question must have exactly 4 answer options
3. Only ONE correct answer per question (correct_answer = 0-based index: 0=A, 1=B, 2=C, 3=D)
4. Include a clear 1-2 sentence explanation citing the specific rule, number, or safety principle
5. Questions must be specifically about ${subLabel} — NOT general driving knowledge
6. Mix difficulty: 4 easy (recall facts), 6 medium (apply knowledge), 5 hard (analyze scenarios)
7. Include specific numbers where applicable (pressure readings, distances, times)
8. Each question must be distinct — no rephrasing of the same concept
9. Questions should be realistic CDL exam questions that test practical knowledge
10. Do NOT use "All of the above" or "None of the above" as options

QUALITY STANDARDS:
- Every wrong option must be plausible (a common misconception or close-but-wrong value)
- Questions should test understanding, not just memorization
- Explanations must reference specific facts (e.g., "The governor cuts out at 125 psi")
- Avoid vague questions like "What is important about X?" — be specific

Return ONLY a JSON array:
[
  {
    "question_text": "...",
    "option_a": "...",
    "option_b": "...",
    "option_c": "...",
    "option_d": "...",
    "correct_answer": 2,
    "explanation": "..."
  }
]`;
}

async function generateForTopic(state, topic, subcategory, manualText, existingQuestions, topicIdx) {
  // Get manual context — try section extraction first, fall back to RAG chunks
  const sectionKeywords = subcategory === 'air_brakes'
    ? ['air brake', 'air system', 'brake system', 'pneumatic']
    : ['combination vehicle', 'coupling', 'uncoupling', 'tractor.trailer', 'fifth wheel'];

  let manualContext = '';

  // Try to extract the relevant section
  const section = extractSection(manualText, sectionKeywords);
  if (section) {
    // Use RAG within the section for topic-specific chunks
    const topicChunks = findTopChunks(section, `${topic.name} ${topic.details}`, 6);
    manualContext = topicChunks.length > 0
      ? topicChunks.join('\n\n---\n\n').substring(0, 8000)
      : section.substring(0, 8000);
  } else {
    // Fall back to RAG across entire manual
    const chunks = findTopChunks(manualText, `${topic.name} ${topic.details}`, 8);
    manualContext = chunks.length > 0
      ? chunks.join('\n\n---\n\n').substring(0, 8000)
      : manualText.substring(0, 8000);
  }

  const prompt = buildGenerationPrompt(state, topic, manualContext, subcategory, existingQuestions);
  const text = await callClaudeText(prompt, SONNET_MODEL, 8192);
  const parsed = parseJSON(text);

  if (!Array.isArray(parsed)) {
    console.log(`    Topic ${topicIdx}: PARSE ERROR`);
    return [];
  }

  // Validate and clean
  return parsed
    .filter(q =>
      q.question_text && q.option_a && q.option_b && q.option_c && q.option_d &&
      typeof q.correct_answer === 'number' && q.correct_answer >= 0 && q.correct_answer <= 3 &&
      q.question_text.length > 20
    )
    .map(q => ({
      state,
      category: 'cdl',
      subcategory,
      language: 'en',
      question_text: q.question_text.trim(),
      option_a: q.option_a.trim(),
      option_b: q.option_b.trim(),
      option_c: q.option_c.trim(),
      option_d: q.option_d.trim(),
      correct_answer: q.correct_answer,
      explanation: (q.explanation || '').trim() || null,
    }));
}

async function phase_generate(state, progress, subcategory, topics, phaseNum, doneKey, generatedKey) {
  const label = subcategory === 'air_brakes' ? 'Air Brakes' : 'Combination Vehicles';
  console.log(`  Phase ${phaseNum}: Generating ${label} questions...`);

  const manualText = loadManualText(state);
  if (!manualText) {
    console.log(`    No CDL manual found for ${state}, using fallback prompts only.`);
  }

  // Get existing questions for dedup context
  const existing = await supabaseGetAll(
    'questions',
    `state=eq.${encodeURIComponent(state)}&category=eq.cdl&language=eq.en&select=question_text`
  );

  // Also include already-generated questions from this run
  const alreadyGenerated = progress[generatedKey] || [];
  const allExisting = [...existing, ...alreadyGenerated];

  for (let i = 0; i < topics.length; i++) {
    const topic = topics[i];
    const topicKey = `topic_${i}`;

    if (progress[doneKey][topicKey]) {
      process.stdout.write(`    [${i + 1}/${topics.length}] ${topic.name} — cached\n`);
      continue;
    }

    process.stdout.write(`    [${i + 1}/${topics.length}] ${topic.name}... `);

    let questions = [];
    try {
      questions = await generateForTopic(state, topic, subcategory, manualText || '', allExisting, i + 1);
    } catch (e) {
      console.log(`ERROR: ${e.message}`);
      await sleep(5000);
      continue;
    }

    progress[generatedKey].push(...questions);
    allExisting.push(...questions);
    progress.stats[subcategory === 'air_brakes' ? 'air_generated' : 'combo_generated'] += questions.length;
    progress[doneKey][topicKey] = true;
    saveProgress(state, progress);

    console.log(`${questions.length} questions (total ${label}: ${progress[generatedKey].length})`);
    await sleep(300);
  }
}

// ---------------------------------------------------------------------------
// Phase 4: Quality validation — Sonnet reviews generated questions
// ---------------------------------------------------------------------------

function buildValidationPrompt(questions, subcategory) {
  const label = subcategory === 'air_brakes' ? 'Air Brakes' : 'Combination Vehicles';

  const qText = questions.map((q, i) => {
    const opts = ['A', 'B', 'C', 'D'];
    const options = [q.option_a, q.option_b, q.option_c, q.option_d];
    return `[${i + 1}] Q: ${q.question_text}
${options.map((o, j) => `   ${opts[j]}. ${o}`).join('\n')}
   Correct: ${opts[q.correct_answer]}
   Explanation: ${q.explanation || 'none'}`;
  }).join('\n\n');

  return `You are a CDL exam quality reviewer. Review these ${label} questions for accuracy and quality.

For each question, provide a verdict:
- "keep" — question is accurate, well-written, and specifically about ${label}
- "fix" — question has wrong answer or needs correction (provide corrected fields)
- "reject" — question is duplicate, too vague, not about ${label}, or fundamentally broken

${qText}

Return a JSON array with one object per question:
[
  {"index": 1, "verdict": "keep"},
  {"index": 2, "verdict": "fix", "correct_answer": 1, "explanation": "corrected explanation"},
  {"index": 3, "verdict": "reject", "reason": "not specific to air brakes"}
]

Be strict: reject questions about general driving that aren't specific to ${label}.
Return ONLY the JSON array.`;
}

async function phase4_validate(state, progress) {
  if (progress.phase4_done) {
    console.log('  Phase 4: Already done, skipping.');
    return;
  }

  console.log('  Phase 4: Quality validation...');

  const allGenerated = [...(progress.generated_air || []), ...(progress.generated_combo || [])];
  if (allGenerated.length === 0) {
    console.log('    No questions to validate.');
    progress.phase4_done = true;
    saveProgress(state, progress);
    return;
  }

  const validated = [];
  const VALIDATE_BATCH = 10;

  for (let i = 0; i < allGenerated.length; i += VALIDATE_BATCH) {
    const batch = allGenerated.slice(i, i + VALIDATE_BATCH);
    const subcategory = batch[0].subcategory;

    process.stdout.write(`    Validating ${i + 1}-${Math.min(i + VALIDATE_BATCH, allGenerated.length)}/${allGenerated.length}... `);

    try {
      const text = await callClaudeText(buildValidationPrompt(batch, subcategory), SONNET_MODEL, 4096);
      const results = parseJSON(text);

      if (!results || !Array.isArray(results)) {
        console.log('PARSE ERROR — keeping all');
        validated.push(...batch);
        continue;
      }

      let kept = 0, fixed = 0, rejected = 0;
      for (const r of results) {
        const idx = (r.index || 0) - 1;
        if (idx < 0 || idx >= batch.length) continue;

        if (r.verdict === 'keep') {
          validated.push(batch[idx]);
          kept++;
        } else if (r.verdict === 'fix') {
          const q = { ...batch[idx] };
          if (typeof r.correct_answer === 'number') q.correct_answer = r.correct_answer;
          if (r.explanation) q.explanation = r.explanation;
          if (r.question_text) q.question_text = r.question_text;
          if (r.option_a) q.option_a = r.option_a;
          if (r.option_b) q.option_b = r.option_b;
          if (r.option_c) q.option_c = r.option_c;
          if (r.option_d) q.option_d = r.option_d;
          validated.push(q);
          fixed++;
        } else {
          rejected++;
        }
      }

      console.log(`kept=${kept} fixed=${fixed} rejected=${rejected}`);
    } catch (e) {
      console.log(`ERROR: ${e.message} — keeping all`);
      validated.push(...batch);
    }

    await sleep(300);
  }

  progress.validated = validated;
  progress.stats.validated = validated.length;
  progress.phase4_done = true;
  saveProgress(state, progress);

  const airCount = validated.filter(q => q.subcategory === 'air_brakes').length;
  const comboCount = validated.filter(q => q.subcategory === 'combination_vehicles').length;
  console.log(`    Validated: ${validated.length} (air=${airCount}, combo=${comboCount}) from ${allGenerated.length} generated`);
}

// ---------------------------------------------------------------------------
// Phase 5: Upload to Supabase
// ---------------------------------------------------------------------------

async function phase5_upload(state, progress) {
  if (progress.phase5_done) {
    console.log('  Phase 5: Already done, skipping.');
    return;
  }

  const questions = progress.validated || [];
  if (questions.length === 0) {
    console.log('  Phase 5: No questions to upload.');
    progress.phase5_done = true;
    saveProgress(state, progress);
    return;
  }

  console.log(`  Phase 5: Uploading ${questions.length} questions to Supabase...`);

  if (DRY_RUN) {
    console.log('    DRY RUN — skipping upload. Sample:');
    console.log('    ' + JSON.stringify(questions[0], null, 2).replace(/\n/g, '\n    '));
    return;
  }

  let uploaded = 0;
  for (let i = 0; i < questions.length; i += 50) {
    const batch = questions.slice(i, i + 50);
    try {
      await supabaseInsert(batch);
      uploaded += batch.length;
      process.stdout.write(`    Uploaded: ${uploaded}/${questions.length}\r`);
    } catch (e) {
      console.error(`\n    Upload error at batch ${i}: ${e.message}`);
    }
  }

  progress.stats.uploaded = uploaded;
  progress.phase5_done = true;
  saveProgress(state, progress);
  console.log(`\n    Uploaded ${uploaded} questions`);
}

// ---------------------------------------------------------------------------
// Process one state
// ---------------------------------------------------------------------------

async function processState(state) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`STATE: ${stateDisplay(state)} (${STATE_ABBR[state]}) ${DRY_RUN ? '*** DRY RUN ***' : ''}`);
  console.log('='.repeat(60));

  const progress = loadProgress(state);

  // Phase 1: Classify existing
  if (START_PHASE <= 1) {
    await phase1_classify(state, progress);
  }

  if (CLASSIFY_ONLY) return progress.stats;

  // Phase 2: Generate Air Brakes
  if (START_PHASE <= 2) {
    await phase_generate(state, progress, 'air_brakes', AIR_BRAKES_TOPICS, 2, 'phase2_done', 'generated_air');
  }

  // Phase 3: Generate Combination Vehicles
  if (START_PHASE <= 3) {
    await phase_generate(state, progress, 'combination_vehicles', COMBINATION_VEHICLES_TOPICS, 3, 'phase3_done', 'generated_combo');
  }

  // Phase 4: Validate
  if (START_PHASE <= 4) {
    await phase4_validate(state, progress);
  }

  // Phase 5: Upload
  if (START_PHASE <= 5) {
    await phase5_upload(state, progress);
  }

  console.log(`\n  Summary: classified=${progress.stats.classified} air=${progress.stats.air_generated} combo=${progress.stats.combo_generated} validated=${progress.stats.validated} uploaded=${progress.stats.uploaded}`);
  return progress.stats;
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
        const stats = await processState(state);
        if (stats) reports.push({ state, ...stats });
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

  console.log('CDL Subcategory Question Generator');
  console.log('==================================');
  if (DRY_RUN) console.log('*** DRY RUN — no DB changes ***');
  if (CLASSIFY_ONLY) console.log('*** CLASSIFY ONLY — phase 1 only ***');
  console.log(`States: ${states.length}, Parallel: ${PARALLEL_STATES}, Concurrency: ${CONCURRENCY}`);
  console.log(`Start phase: ${START_PHASE}`);
  console.log(`Topics: Air Brakes (${AIR_BRAKES_TOPICS.length}), Combination (${COMBINATION_VEHICLES_TOPICS.length})`);
  console.log(`Expected per state: ~${AIR_BRAKES_TOPICS.length * 15} air + ~${COMBINATION_VEHICLES_TOPICS.length * 15} combo = ~${(AIR_BRAKES_TOPICS.length + COMBINATION_VEHICLES_TOPICS.length) * 15} questions\n`);

  const reports = await runWithPool(states, PARALLEL_STATES);

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('FINAL SUMMARY');
  console.log('='.repeat(60));

  let totals = { classified: 0, air_generated: 0, combo_generated: 0, validated: 0, uploaded: 0 };
  for (const r of reports) {
    console.log(`  ${r.state}: classified=${r.classified} air=${r.air_generated} combo=${r.combo_generated} validated=${r.validated} uploaded=${r.uploaded}`);
    for (const k of Object.keys(totals)) totals[k] += (r[k] || 0);
  }
  console.log(`\nTOTAL across ${reports.length} states:`);
  console.log(`  Classified existing: ${totals.classified}`);
  console.log(`  Air Brakes generated: ${totals.air_generated}`);
  console.log(`  Combination generated: ${totals.combo_generated}`);
  console.log(`  Validated (kept): ${totals.validated}`);
  console.log(`  Uploaded: ${totals.uploaded}`);

  // Next steps
  console.log('\nNext steps:');
  console.log('  1. node scripts/cluster-questions.js --all --category=cdl');
  console.log('  2. node scripts/translate-cluster.js --all --category=cdl');
  console.log('  3. node scripts/verify-cluster-answers.js --all --category=cdl --parallel=3');
  console.log('  4. node scripts/fix-translations-sonnet.js --all --category=cdl --lang=ru,es,zh,ua --parallel=3');
}

main().catch(e => { console.error(e); process.exit(1); });
