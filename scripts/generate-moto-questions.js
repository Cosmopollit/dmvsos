#!/usr/bin/env node
/**
 * Generate EN motorcycle questions for a given state from the official manual.
 *
 * Generates ~230 questions across 15 topics (15 q/topic × 15 topics = 225),
 * then uploads directly to Supabase.
 * Run cluster-questions.js --category=motorcycle afterward to dedup + assign cluster_codes.
 *
 * Usage:
 *   node scripts/generate-moto-questions.js --state=oregon [--dry-run]
 *   node scripts/generate-moto-questions.js --state=pennsylvania [--dry-run]
 *
 * Requires: SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY
 */

'use strict';

const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://yaogndpgnewqffbjrsgz.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const DRY_RUN = process.argv.includes('--dry-run');
const HAIKU_MODEL = 'claude-haiku-4-5-20251001';

const stateArg = process.argv.find(a => a.startsWith('--state='));
const STATE = stateArg ? stateArg.split('=')[1].toLowerCase() : null;

if (!SERVICE_KEY) { console.error('Set SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
if (!ANTHROPIC_KEY) { console.error('Set ANTHROPIC_API_KEY'); process.exit(1); }
if (!STATE) { console.error('Usage: node generate-moto-questions.js --state=<state-slug>'); process.exit(1); }

// ---------------------------------------------------------------------------
// Topics — 15 areas × 15 questions = 225 total
// ---------------------------------------------------------------------------

const TOPICS = [
  'motorcycle licensing requirements: endorsements, permits, skills tests, written exam',
  'motorcycle controls and pre-ride inspection: clutch, throttle, brakes, mirrors, tires, fluids',
  'protective gear and clothing: helmets (DOT standards), eye protection, jackets, gloves, boots',
  'starting, stopping, and shifting: clutch control, smooth braking, downshifting, stalling',
  'lane positioning and straight-line riding: road crown, road hazards, tire tracks',
  'turning, cornering, and curves: countersteering, lean angle, speed management, wide turns',
  'braking techniques: front brake, rear brake, maximum braking, swerving, skids',
  'following distance and space management: two-second rule, tailgating, escape routes',
  'group riding: formation, staggered riding, passing within group, signals',
  'intersections and right-of-way: car blind spots, being seen, approach speed',
  'highway riding: merging, lane changes, wind effects, large vehicles, drafting',
  'alcohol and impaired riding: BAC limits, drugs, fatigue, reaction time',
  'road hazards and adverse conditions: wet roads, gravel, railroad tracks, night riding, wind',
  'sharing the road: cars, trucks, pedestrians, cyclists, emergency vehicles',
  'crashes and emergencies: what to do after a crash, laying down the bike, stopping quickly',
];

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

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

function findTopChunks(manualText, topic, topN = 4) {
  const stopWords = new Set(['with', 'from', 'that', 'this', 'what', 'when', 'their', 'have', 'rules', 'state']);
  const keywords = topic
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3)
    .filter(w => !stopWords.has(w));

  const chunks = slidingWindowChunks(manualText);
  const scored = chunks.map(c => {
    const lower = c.toLowerCase();
    let score = 0;
    for (const kw of keywords) if (lower.includes(kw)) score++;
    return { text: c, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.filter(s => s.score > 0).slice(0, topN).map(c => c.text);
}

// ---------------------------------------------------------------------------
// Claude API
// ---------------------------------------------------------------------------

async function callClaude(prompt, maxTokens = 4096) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: HAIKU_MODEL,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (res.status === 429) {
    const retry = parseInt(res.headers.get('retry-after') || '30', 10);
    console.log(`  Rate limited, waiting ${retry}s...`);
    await sleep(retry * 1000);
    return callClaude(prompt, maxTokens);
  }
  if (res.status === 529) {
    console.log('  API overloaded, waiting 60s...');
    await sleep(60000);
    return callClaude(prompt, maxTokens);
  }
  if (!res.ok) throw new Error(`Claude ${res.status}: ${await res.text()}`);

  const data = await res.json();
  return data.content?.[0]?.text || '';
}

function parseJSON(text) {
  const clean = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  try { return JSON.parse(clean); } catch {
    const m = clean.match(/\[[\s\S]*\]/);
    if (m) { try { return JSON.parse(m[0]); } catch { /* fall through */ } }
    return null;
  }
}

// ---------------------------------------------------------------------------
// Supabase
// ---------------------------------------------------------------------------

async function supabaseInsert(rows) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/questions`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`INSERT: ${res.status} ${await res.text()}`);
}

// ---------------------------------------------------------------------------
// Generate questions for one topic
// ---------------------------------------------------------------------------

const STATE_DISPLAY = STATE.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');

async function generateTopic(topicNum, topic, manualText) {
  const chunks = findTopChunks(manualText, topic, 4);
  const context = chunks.length
    ? chunks.join('\n\n---\n\n').substring(0, 5000)
    : manualText.substring(0, 5000);

  const prompt = `You are writing ${STATE_DISPLAY} motorcycle knowledge test questions for riders preparing for their motorcycle endorsement exam.

Topic: ${topic}

Relevant ${STATE_DISPLAY} Motorcycle Operator Manual excerpts:
---
${context}
---

Generate exactly 15 multiple-choice questions about this topic. Requirements:
- Questions must reflect ${STATE_DISPLAY}-specific laws and safe riding practices
- Each question has exactly 4 options
- Only ONE correct answer per question
- correct_answer is the 0-based index (0=A, 1=B, 2=C, 3=D)
- Include a 1-2 sentence explanation citing the rule or safety reason
- Mix difficulty: 5 easy, 6 medium, 4 hard
- Do NOT repeat similar questions
- Questions should be practical, clear, unambiguous, and exam-realistic
- Focus on safety-critical topics relevant to motorcyclists

Return ONLY a JSON array, no markdown:
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

  const text = await callClaude(prompt, 4096);
  const parsed = parseJSON(text);

  if (!Array.isArray(parsed)) {
    console.log(`  Topic ${topicNum}: PARSE ERROR`);
    return [];
  }

  return parsed
    .filter(q =>
      q.question_text && q.option_a && q.option_b && q.option_c && q.option_d &&
      typeof q.correct_answer === 'number' && q.correct_answer >= 0 && q.correct_answer <= 3
    )
    .map(q => ({
      state: STATE,
      category: 'motorcycle',
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

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (DRY_RUN) console.log('\n*** DRY RUN — no DB writes ***\n');

  const manualPath = path.join(__dirname, '..', '.manuals-text', `${STATE}-motorcycle-en.txt`);
  if (!fs.existsSync(manualPath)) {
    console.error(`Manual not found: ${manualPath}`);
    process.exit(1);
  }
  const manualText = fs.readFileSync(manualPath, 'utf8');
  console.log(`State: ${STATE_DISPLAY}`);
  console.log(`Manual: ${manualPath} (${manualText.split(/\s+/).length} words)\n`);

  const allQuestions = [];
  const backupFile = path.join(__dirname, '..', `.${STATE}-motorcycle-questions.json`);

  for (let i = 0; i < TOPICS.length; i++) {
    const topic = TOPICS[i];
    process.stdout.write(`[${i + 1}/${TOPICS.length}] ${topic.substring(0, 60)}... `);

    let questions = [];
    try {
      questions = await generateTopic(i + 1, topic, manualText);
    } catch (e) {
      console.log(`ERROR: ${e.message}`);
      await sleep(5000);
      continue;
    }

    allQuestions.push(...questions);
    console.log(`${questions.length} questions (total: ${allQuestions.length})`);

    // Save backup after each topic
    fs.writeFileSync(backupFile, JSON.stringify(allQuestions, null, 2));

    await sleep(500);
  }

  console.log(`\nGenerated: ${allQuestions.length} questions total`);
  console.log(`Backup saved: ${backupFile}`);

  if (DRY_RUN) {
    console.log('\nDRY RUN — skipping upload. Sample:');
    console.log(JSON.stringify(allQuestions[0], null, 2));
    return;
  }

  // Upload in batches of 50
  console.log('\nUploading to Supabase...');
  let uploaded = 0;
  for (let i = 0; i < allQuestions.length; i += 50) {
    const batch = allQuestions.slice(i, i + 50);
    try {
      await supabaseInsert(batch);
      uploaded += batch.length;
      process.stdout.write(`  Uploaded: ${uploaded}/${allQuestions.length}\r`);
    } catch (e) {
      console.error(`\n  Upload error at batch ${i}: ${e.message}`);
    }
  }

  console.log(`\nDone! ${uploaded} questions uploaded to Supabase.`);
  console.log(`\nNext step:`);
  console.log(`  node scripts/cluster-questions.js --state=${STATE} --category=motorcycle`);
}

main().catch(e => { console.error(e); process.exit(1); });
