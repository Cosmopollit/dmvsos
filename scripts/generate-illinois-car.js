#!/usr/bin/env node
/**
 * Generate EN car questions for Illinois from the official driver manual.
 *
 * Generates ~300 questions across 20 topics, uploads directly to Supabase.
 * Run cluster-questions.js afterward to dedup and assign cluster_codes.
 *
 * Usage:
 *   node scripts/generate-illinois-car.js [--dry-run]
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

if (!SERVICE_KEY) { console.error('Set SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
if (!ANTHROPIC_KEY) { console.error('Set ANTHROPIC_API_KEY'); process.exit(1); }

// ---------------------------------------------------------------------------
// Topics — 20 areas × 15 questions = 300 total
// ---------------------------------------------------------------------------

const TOPICS = [
  'traffic signs: warning signs, regulatory signs, guide signs, and their meanings',
  'traffic signals and pavement markings: traffic lights, turn arrows, lane markings',
  'speed limits: school zones, residential areas, highways, construction zones, and adjusting speed to conditions',
  'right-of-way rules at intersections, crosswalks, and when merging',
  'turning rules: left turns, right turns, U-turns, turn signals, and proper lane use',
  'lane changes, passing other vehicles, and no-passing zones',
  'following distance and space management: the two-second rule and tailgating',
  'parking rules: parallel parking, prohibited areas, fire hydrants, handicapped spaces',
  'alcohol and drugs: Illinois DUI laws, BAC limits, consequences, implied consent',
  'distracted driving: cell phones, texting, Illinois hands-free laws',
  'pedestrians and cyclists: crosswalk laws, sharing the road, school buses',
  'highway and expressway driving: merging, exiting, highway speed, minimum speeds',
  'intersections: uncontrolled intersections, four-way stops, roundabouts',
  'railroad crossings and emergency vehicles: when to stop, what to do',
  'adverse weather and night driving: rain, snow, ice, fog, reduced visibility',
  'vehicle equipment: headlights, taillights, brakes, tires, mirrors',
  'Illinois license requirements: classes, permits, graduated licensing, renewals',
  'insurance and financial responsibility laws in Illinois',
  'crashes and emergencies: what to do after an accident, reporting requirements',
  'special driving situations: construction zones, school zones, funeral processions',
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
  const keywords = topic
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3)
    .filter(w => !['with', 'from', 'that', 'this', 'what', 'when', 'their', 'have', 'rules', 'illinois'].includes(w));

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

async function generateTopic(topicNum, topic, manualText) {
  const chunks = findTopChunks(manualText, topic, 4);
  const context = chunks.join('\n\n---\n\n').substring(0, 5000);

  const prompt = `You are writing Illinois DMV knowledge test questions for immigrant drivers preparing for their Illinois driver's license exam.

Topic: ${topic}

Relevant Illinois Driver Manual excerpts:
---
${context}
---

Generate exactly 15 multiple-choice questions about this topic. Requirements:
- Questions must reflect Illinois-specific laws and rules (not generic)
- Each question has exactly 4 options
- Only ONE correct answer per question
- correct_answer is the 0-based index (0=A, 1=B, 2=C, 3=D)
- Include a 1-2 sentence explanation citing the rule
- Mix difficulty: 5 easy, 6 medium, 4 hard
- Do NOT repeat similar questions
- Questions should be clear, unambiguous, and exam-realistic

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

  // Validate and clean
  return parsed
    .filter(q =>
      q.question_text && q.option_a && q.option_b && q.option_c && q.option_d &&
      typeof q.correct_answer === 'number' && q.correct_answer >= 0 && q.correct_answer <= 3
    )
    .map(q => ({
      state: 'illinois',
      category: 'car',
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

  const manualPath = path.join(__dirname, '..', '.manuals-text', 'illinois-car-en.txt');
  const manualText = fs.readFileSync(manualPath, 'utf8');
  console.log(`Manual loaded: ${manualText.split(/\s+/).length} words\n`);

  const allQuestions = [];
  const backupFile = path.join(__dirname, '..', '.illinois-car-questions.json');

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
  console.log('\nNext steps:');
  console.log('  node scripts/cluster-questions.js --state=illinois');
}

main().catch(e => { console.error(e); process.exit(1); });
