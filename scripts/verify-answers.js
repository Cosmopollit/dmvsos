#!/usr/bin/env node
/**
 * AI-verify correct_answer for DMV test questions + generate explanations.
 *
 * Uses Claude Haiku for initial check (batch of 10), Sonnet for escalation.
 * Manual text from .manuals-text/ used as RAG context for state-specific questions.
 *
 * Verdicts:
 *   - correct: answer is right
 *   - wrong: answer is wrong, correct option exists -> fix correct_answer
 *   - invalid: question is broken (no correct option, gibberish, etc.) -> DELETE
 *   - uncertain: escalate to Sonnet
 *
 * Also generates explanation for each question (stored in DB).
 *
 * Phases:
 *   1. Load all questions for language, group by state/category
 *   2. Haiku check (batches of 10) with relevant manual excerpt
 *   3. Sonnet escalation for "uncertain" verdicts
 *   4. Write corrections, deletions, and explanations to DB
 *
 * Usage:
 *   node scripts/verify-answers.js --lang=en              # verify English
 *   node scripts/verify-answers.js --all-langs             # verify all languages
 *   node scripts/verify-answers.js --lang=en --dry-run     # report only
 *   node scripts/verify-answers.js --lang=en --state=texas # one state only
 *
 * Requires: SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY
 */

const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://yaogndpgnewqffbjrsgz.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const DRY_RUN = process.argv.includes('--dry-run');
const ALL_LANGS = process.argv.includes('--all-langs');
const LANG_ARG = process.argv.find(a => a.startsWith('--lang='))?.split('=')[1];
const STATE_ARG = process.argv.find(a => a.startsWith('--state='))?.split('=')[1];
const MANUALS_DIR = path.join(__dirname, '..', '.manuals-text');
const BATCH_SIZE = 10;
const CONCURRENCY = parseInt(process.argv.find(a => a.startsWith('--concurrency='))?.split('=')[1] || '5', 10);
const HAIKU_MODEL = 'claude-haiku-4-5-20251001';
const SONNET_MODEL = 'claude-sonnet-4-5-20250929';

if (!SERVICE_KEY) { console.error('Set SUPABASE_SERVICE_ROLE_KEY env var'); process.exit(1); }
if (!ANTHROPIC_KEY) { console.error('Set ANTHROPIC_API_KEY env var'); process.exit(1); }
if (!ALL_LANGS && !LANG_ARG) {
  console.error('Specify --lang=en or --all-langs');
  process.exit(1);
}

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

async function callClaude(prompt, model = HAIKU_MODEL, maxTokens = 4096) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get('retry-after') || '30', 10);
    console.log(`\n  Rate limited, waiting ${retryAfter}s...`);
    await sleep(retryAfter * 1000);
    return callClaude(prompt, model, maxTokens);
  }
  if (res.status === 529) {
    console.log('\n  API overloaded, waiting 60s...');
    await sleep(60000);
    return callClaude(prompt, model, maxTokens);
  }
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data.content?.[0]?.text || '';
}

// ---------------------------------------------------------------------------
// Manual text (RAG context)
// ---------------------------------------------------------------------------

const manualCache = {};

function loadManualText(state, category, lang) {
  const key = `${state}-${category}-${lang}`;
  if (manualCache[key] !== undefined) return manualCache[key];

  const filePath = path.join(MANUALS_DIR, `${key}.txt`);
  if (fs.existsSync(filePath)) {
    manualCache[key] = fs.readFileSync(filePath, 'utf8');
  } else {
    // Fallback to English manual if non-EN not available
    const enPath = path.join(MANUALS_DIR, `${state}-${category}-en.txt`);
    if (lang !== 'en' && fs.existsSync(enPath)) {
      manualCache[key] = fs.readFileSync(enPath, 'utf8');
    } else {
      manualCache[key] = null;
    }
  }
  return manualCache[key];
}

function findRelevantExcerpt(manualText, question, options) {
  if (!manualText) return '';

  const text = `${question} ${options.join(' ')}`;
  const keywords = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3)
    .filter(w => !['what', 'when', 'which', 'that', 'this', 'your', 'with', 'from', 'have',
      'does', 'should', 'would', 'could', 'must', 'following', 'correct', 'answer',
      'true', 'false', 'none', 'above', 'below', 'both', 'all'].includes(w));

  const paragraphs = manualText.split(/\n\n+/).filter(p => p.trim().length > 50);

  const scored = paragraphs.map(p => {
    const pLower = p.toLowerCase();
    let score = 0;
    for (const kw of keywords) {
      if (pLower.includes(kw)) score++;
    }
    return { text: p, score };
  });

  scored.sort((a, b) => b.score - a.score);

  const top = scored.filter(s => s.score > 0).slice(0, 3);
  if (top.length === 0) return '';

  let excerpt = top.map(t => t.text).join('\n\n');
  if (excerpt.length > 2000) excerpt = excerpt.substring(0, 2000) + '...';
  return excerpt;
}

// ---------------------------------------------------------------------------
// Progress & rollback helpers
// ---------------------------------------------------------------------------

function getProgressFile(lang) {
  return path.join(__dirname, '..', `.verify-answers-${lang}-progress.json`);
}

function getReportFile(lang) {
  return path.join(__dirname, '..', `.verify-answers-${lang}-report.json`);
}

function getRollbackFile(lang) {
  return path.join(__dirname, '..', `.verify-answers-${lang}-rollback.json`);
}

function loadProgress(lang) {
  const file = getProgressFile(lang);
  if (fs.existsSync(file)) {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* ignore */ }
  }
  return { phase2: {}, phase3: {} };
}

function saveProgress(lang, progress) {
  fs.writeFileSync(getProgressFile(lang), JSON.stringify(progress, null, 2));
}

// ---------------------------------------------------------------------------
// Phase 2: Haiku verification + explanation (batches of 10)
// ---------------------------------------------------------------------------

const OPTION_LABELS = ['A', 'B', 'C', 'D'];

function buildVerifyPrompt(questions, manualExcerpt, state, lang) {
  const qList = questions.map(q => {
    const options = [q.option_a, q.option_b, q.option_c, q.option_d]
      .filter(Boolean)
      .map((o, i) => `  ${OPTION_LABELS[i]}. ${o}`)
      .join('\n');
    return `ID: ${q.id}
Question: ${q.question_text}
${options}
Marked correct: ${OPTION_LABELS[q.correct_answer]} (index ${q.correct_answer})`;
  }).join('\n\n');

  const manualSection = manualExcerpt
    ? `Reference material from the ${state} driver manual:\n---\n${manualExcerpt}\n---\n\n`
    : '';

  const langNote = lang !== 'en'
    ? `\nIMPORTANT: Questions are in ${lang.toUpperCase()} language. Write the "explanation" field in the SAME language as the question. Use the English manual as reference but explain in the question's language.\n`
    : '';

  return `You are a US DMV test answer verification expert. Your job is to verify the marked correct answer AND write a brief explanation for each question.

${manualSection}${langNote}For each question below, verify the marked correct answer and generate an explanation.

VERDICTS:
- "correct": the marked answer is right
- "wrong": the marked answer is factually incorrect, but a correct option exists among A-D (you MUST suggest it)
- "invalid": the question is BROKEN and should be DELETED. Use this ONLY when:
  * None of the options A-D is correct AND you are sure of this based on your own knowledge (not just the excerpt)
  * The question is gibberish, garbled, or untranslatable
  * Options are duplicated or nonsensical
  * The question text makes no sense at all
  DO NOT mark as invalid just because the manual excerpt doesn't cover the topic! You have general US traffic law knowledge — use it. Only mark invalid if the question is truly broken regardless of any reference material.
- "uncertain": debatable or you're genuinely unsure

RULES:
- correct_answer is an index: 0=A, 1=B, 2=C, 3=D
- Be conservative: only "wrong" if confident the answer is incorrect
- Only "invalid" if the question is truly broken (not just tricky)
- Consider state-specific rules that may differ from general US rules
- The "explanation" should be 1-2 sentences explaining WHY the correct answer is right, referencing the manual if possible. This will be shown to students.

Output ONLY a JSON array (use the EXACT question ID string as shown above):
[{"id": "<exact question ID>", "verdict": "correct"|"wrong"|"invalid"|"uncertain", "current_answer": <0-3>, "suggested_answer": <0-3 or null>, "confidence": "high"|"medium"|"low", "reason": "brief internal note", "explanation": "1-2 sentence explanation for the student about why the correct answer is right"}]

Questions:
${qList}`;
}

async function phase2_haiku(questions, lang, progress) {
  console.log(`\n=== Phase 2: Haiku verification (${lang}) ===\n`);

  const results = { ...progress.phase2 };
  const processedIds = new Set(Object.keys(results));
  const toProcess = questions.filter(q => !processedIds.has(String(q.id)));
  console.log(`  Total: ${questions.length}, already processed: ${processedIds.size}, remaining: ${toProcess.length}`);

  if (toProcess.length === 0) return results;

  // Group by state+category for manual context
  const groups = {};
  for (const q of toProcess) {
    const key = `${q.state}|${q.category}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(q);
  }

  let processed = 0;
  let correct = Object.values(results).filter(r => r.verdict === 'correct').length;
  let wrong = Object.values(results).filter(r => r.verdict === 'wrong').length;
  let invalid = Object.values(results).filter(r => r.verdict === 'invalid').length;
  let uncertain = Object.values(results).filter(r => r.verdict === 'uncertain').length;

  // Flatten all batches
  const allBatches = [];
  for (const [, groupQuestions] of Object.entries(groups)) {
    const state = groupQuestions[0].state;
    const category = groupQuestions[0].category;
    const manualText = loadManualText(state, category, lang);
    for (let i = 0; i < groupQuestions.length; i += BATCH_SIZE) {
      allBatches.push({ batch: groupQuestions.slice(i, i + BATCH_SIZE), state, category, manualText });
    }
  }

  console.log(`  Concurrency: ${CONCURRENCY}, batches: ${allBatches.length}`);

  async function processHaikuBatch({ batch, state, manualText }) {
    const batchText = batch.map(q =>
      `${q.question_text} ${q.option_a} ${q.option_b} ${q.option_c || ''} ${q.option_d || ''}`
    ).join(' ');
    const excerpt = findRelevantExcerpt(manualText, batchText, []);
    const batchResults = {};

    try {
      const prompt = buildVerifyPrompt(batch, excerpt, state, lang);
      const response = await callClaude(prompt, HAIKU_MODEL);
      const jsonMatch = response.match(/\[[\s\S]*\]/);

      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        for (const r of parsed) {
          batchResults[String(r.id)] = r;
        }
      }

      for (const q of batch) {
        if (!batchResults[String(q.id)]) {
          batchResults[String(q.id)] = {
            id: q.id, verdict: 'uncertain', current_answer: q.correct_answer,
            suggested_answer: null, confidence: 'low', reason: 'No AI response',
            explanation: '',
          };
        }
      }
    } catch (e) {
      for (const q of batch) {
        if (!batchResults[String(q.id)]) {
          batchResults[String(q.id)] = {
            id: q.id, verdict: 'uncertain', current_answer: q.correct_answer,
            suggested_answer: null, confidence: 'low', reason: `Error: ${e.message}`,
            explanation: '',
          };
        }
      }
    }
    return { count: batch.length, results: batchResults };
  }

  let idx = 0;
  async function haikuWorker() {
    while (idx < allBatches.length) {
      const batchIdx = idx++;
      const { count, results: batchResults } = await processHaikuBatch(allBatches[batchIdx]);
      for (const [id, r] of Object.entries(batchResults)) {
        results[id] = r;
        if (r.verdict === 'correct') correct++;
        else if (r.verdict === 'wrong') wrong++;
        else if (r.verdict === 'invalid') invalid++;
        else uncertain++;
      }
      processed += count;
      process.stdout.write(
        `\r  Haiku [${lang}]: ${processed}/${toProcess.length} | ok:${correct} wrong:${wrong} invalid:${invalid} unc:${uncertain}`
      );
      if (processed % (BATCH_SIZE * 10) < BATCH_SIZE * CONCURRENCY) {
        progress.phase2 = results;
        saveProgress(lang, progress);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => haikuWorker()));

  console.log();
  progress.phase2 = results;
  saveProgress(lang, progress);

  return results;
}

// ---------------------------------------------------------------------------
// Phase 3: Sonnet escalation for uncertain
// ---------------------------------------------------------------------------

function buildEscalationPrompt(questions, manualExcerpt, state, lang) {
  const qList = questions.map(q => {
    const options = [q.option_a, q.option_b, q.option_c, q.option_d]
      .filter(Boolean)
      .map((o, i) => `  ${OPTION_LABELS[i]}. ${o}`)
      .join('\n');
    return `ID: ${q.id}
Question: ${q.question_text}
${options}
Marked correct: ${OPTION_LABELS[q.correct_answer]} (index ${q.correct_answer})
Previous AI note: "${q._reason || 'no reason given'}"`;
  }).join('\n\n');

  const manualSection = manualExcerpt
    ? `Reference material from the ${state} driver manual:\n---\n${manualExcerpt}\n---\n\n`
    : '';

  const langNote = lang !== 'en'
    ? `\nIMPORTANT: Questions are in ${lang.toUpperCase()} language. Write the "explanation" in the SAME language as the question.\n`
    : '';

  return `You are a senior US DMV test answer verification expert. A junior AI flagged these questions as "uncertain". Make a definitive judgment.

${manualSection}${langNote}IMPORTANT: You MUST pick one of: "correct", "wrong", or "invalid". Do NOT return "uncertain".
- "correct": the marked answer is right (lean this way for state-specific edge cases)
- "wrong": the marked answer is wrong, correct option exists (suggest it)
- "invalid": question is truly broken — gibberish, nonsensical, no correct option exists based on your knowledge (NOT just the excerpt) → DELETE. Do NOT mark invalid just because the manual excerpt is limited.
- correct_answer is an index: 0=A, 1=B, 2=C, 3=D
- Include a 1-2 sentence explanation for students

Output ONLY a JSON array (use the EXACT question ID string as shown above):
[{"id": "<exact question ID>", "verdict": "correct"|"wrong"|"invalid", "current_answer": <0-3>, "suggested_answer": <0-3 or null>, "confidence": "high"|"medium", "reason": "internal note", "explanation": "1-2 sentence explanation for the student"}]

Questions:
${qList}`;
}

async function phase3_sonnet(questions, phase2Results, lang, progress) {
  console.log(`\n=== Phase 3: Sonnet escalation (${lang}) ===\n`);

  const uncertainIds = Object.entries(phase2Results)
    .filter(([, r]) => r.verdict === 'uncertain')
    .map(([id]) => id);

  console.log(`  Uncertain questions to escalate: ${uncertainIds.length}`);
  if (uncertainIds.length === 0) return phase2Results;

  const results = { ...progress.phase3 };
  const processedIds = new Set(Object.keys(results));
  const uncertainQuestions = questions.filter(q =>
    uncertainIds.includes(String(q.id)) && !processedIds.has(String(q.id))
  );

  for (const q of uncertainQuestions) {
    q._reason = phase2Results[String(q.id)]?.reason;
  }

  console.log(`  Already escalated: ${processedIds.size}, remaining: ${uncertainQuestions.length}`);

  const groups = {};
  for (const q of uncertainQuestions) {
    const key = `${q.state}|${q.category}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(q);
  }

  let processed = 0;
  let wrongFound = Object.values(results).filter(r => r.verdict === 'wrong').length;
  let invalidFound = Object.values(results).filter(r => r.verdict === 'invalid').length;

  // Flatten all batches
  const sonnetBatches = [];
  for (const [, groupQuestions] of Object.entries(groups)) {
    const state = groupQuestions[0].state;
    const manualText = loadManualText(state, groupQuestions[0].category, lang);
    for (let i = 0; i < groupQuestions.length; i += BATCH_SIZE) {
      sonnetBatches.push({ batch: groupQuestions.slice(i, i + BATCH_SIZE), state, manualText });
    }
  }

  const sonnetConcurrency = Math.max(1, Math.floor(CONCURRENCY / 2)); // Sonnet is heavier, use fewer
  console.log(`  Concurrency: ${sonnetConcurrency}, batches: ${sonnetBatches.length}`);

  async function processSonnetBatch({ batch, state, manualText }) {
    const batchText = batch.map(q =>
      `${q.question_text} ${q.option_a} ${q.option_b} ${q.option_c || ''} ${q.option_d || ''}`
    ).join(' ');
    const excerpt = findRelevantExcerpt(manualText, batchText, []);
    const batchResults = {};

    try {
      const prompt = buildEscalationPrompt(batch, excerpt, state, lang);
      const response = await callClaude(prompt, SONNET_MODEL, 4096);
      const jsonMatch = response.match(/\[[\s\S]*\]/);

      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        for (const r of parsed) {
          batchResults[String(r.id)] = r;
        }
      }
    } catch (e) {
      for (const q of batch) {
        if (!batchResults[String(q.id)]) {
          batchResults[String(q.id)] = {
            id: q.id, verdict: 'correct', current_answer: q.correct_answer,
            suggested_answer: null, confidence: 'low', reason: `Sonnet error, defaulting to correct: ${e.message}`,
            explanation: '',
          };
        }
      }
    }
    return { count: batch.length, results: batchResults };
  }

  let sIdx = 0;
  async function sonnetWorker() {
    while (sIdx < sonnetBatches.length) {
      const batchIdx = sIdx++;
      const { count, results: batchResults } = await processSonnetBatch(sonnetBatches[batchIdx]);
      for (const [id, r] of Object.entries(batchResults)) {
        results[id] = r;
        if (r.verdict === 'wrong') wrongFound++;
        if (r.verdict === 'invalid') invalidFound++;
      }
      processed += count;
      process.stdout.write(`\r  Sonnet [${lang}]: ${processed}/${uncertainQuestions.length} | wrong:${wrongFound} invalid:${invalidFound}`);
      if (processed % (BATCH_SIZE * 6) < BATCH_SIZE * sonnetConcurrency) {
        progress.phase3 = results;
        saveProgress(lang, progress);
      }
    }
  }

  await Promise.all(Array.from({ length: sonnetConcurrency }, () => sonnetWorker()));

  console.log();
  progress.phase3 = results;
  saveProgress(lang, progress);

  // Merge phase 3 results into phase 2
  const merged = { ...phase2Results };
  for (const [id, r] of Object.entries(results)) {
    merged[id] = r;
  }

  return merged;
}

// ---------------------------------------------------------------------------
// Phase 4: Write corrections, deletions, and explanations
// ---------------------------------------------------------------------------

async function phase4_write(allResults, lang) {
  console.log(`\n=== Phase 4: Write results (${lang}) ===\n`);

  const corrections = Object.values(allResults)
    .filter(r => r.verdict === 'wrong' && r.suggested_answer !== null && r.suggested_answer !== undefined)
    .filter(r => r.confidence === 'high' || r.confidence === 'medium')
    .map(r => ({
      id: r.id,
      old_answer: r.current_answer,
      new_answer: r.suggested_answer,
      confidence: r.confidence,
      reason: r.reason,
    }));

  const deletions = Object.values(allResults)
    .filter(r => r.verdict === 'invalid')
    .map(r => ({ id: r.id, reason: r.reason }));

  const explanations = Object.values(allResults)
    .filter(r => r.explanation && r.explanation.length > 10 && r.verdict !== 'invalid')
    .map(r => ({ id: r.id, explanation: r.explanation }));

  // Stats
  const total = Object.keys(allResults).length;
  const correctCount = Object.values(allResults).filter(r => r.verdict === 'correct').length;
  const wrongCount = Object.values(allResults).filter(r => r.verdict === 'wrong').length;
  const invalidCount = Object.values(allResults).filter(r => r.verdict === 'invalid').length;
  const uncertainCount = Object.values(allResults).filter(r => r.verdict === 'uncertain').length;

  console.log(`  Total verified: ${total}`);
  console.log(`  Correct: ${correctCount} (${(correctCount / total * 100).toFixed(1)}%)`);
  console.log(`  Wrong: ${wrongCount} (${(wrongCount / total * 100).toFixed(1)}%)`);
  console.log(`  Invalid (to delete): ${invalidCount} (${(invalidCount / total * 100).toFixed(1)}%)`);
  console.log(`  Still uncertain: ${uncertainCount}`);
  console.log(`  Corrections to apply: ${corrections.length}`);
  console.log(`  Deletions to apply: ${deletions.length}`);
  console.log(`  Explanations to write: ${explanations.length}`);

  if (corrections.length > 0) {
    console.log('\n  Sample corrections:');
    for (const c of corrections.slice(0, 10)) {
      console.log(`    q${c.id}: ${OPTION_LABELS[c.old_answer]} -> ${OPTION_LABELS[c.new_answer]} (${c.confidence}) - ${c.reason}`);
    }
    if (corrections.length > 10) console.log(`    ... and ${corrections.length - 10} more`);
  }

  if (deletions.length > 0) {
    console.log('\n  Sample deletions:');
    for (const d of deletions.slice(0, 10)) {
      console.log(`    q${d.id}: ${d.reason}`);
    }
    if (deletions.length > 10) console.log(`    ... and ${deletions.length - 10} more`);
  }

  // Save report
  const report = {
    lang,
    timestamp: new Date().toISOString(),
    stats: { total, correct: correctCount, wrong: wrongCount, invalid: invalidCount, uncertain: uncertainCount },
    corrections,
    deletions,
    explanationCount: explanations.length,
    wrongDetails: Object.values(allResults).filter(r => r.verdict === 'wrong'),
    invalidDetails: Object.values(allResults).filter(r => r.verdict === 'invalid'),
  };
  fs.writeFileSync(getReportFile(lang), JSON.stringify(report, null, 2));
  console.log(`\n  Report saved: ${getReportFile(lang)}`);

  if (DRY_RUN) {
    console.log('  [dry-run] Skipping DB writes');
    return { corrections: corrections.length, deletions: deletions.length, explanations: explanations.length };
  }

  // Save rollback
  const rollback = {
    corrections: corrections.map(c => ({ id: c.id, correct_answer: c.old_answer })),
    deletedIds: deletions.map(d => d.id),
  };
  fs.writeFileSync(getRollbackFile(lang), JSON.stringify(rollback, null, 2));
  console.log(`  Rollback saved: ${getRollbackFile(lang)}`);

  // Apply corrections
  let written = 0;
  for (const c of corrections) {
    try {
      await supabasePatch('questions', `id=eq.${c.id}`, { correct_answer: c.new_answer });
      written++;
    } catch (e) {
      console.log(`\n  Error correcting q${c.id}: ${e.message}`);
    }
    if (written % 50 === 0) process.stdout.write(`\r  Corrections: ${written}/${corrections.length}`);
  }
  if (corrections.length > 0) console.log(`\r  Corrections written: ${written}/${corrections.length}`);

  // Apply deletions
  let deleted = 0;
  for (const d of deletions) {
    try {
      await supabaseDelete('questions', `id=eq.${d.id}`);
      deleted++;
    } catch (e) {
      console.log(`\n  Error deleting q${d.id}: ${e.message}`);
    }
    if (deleted % 50 === 0) process.stdout.write(`\r  Deletions: ${deleted}/${deletions.length}`);
  }
  if (deletions.length > 0) console.log(`\r  Deletions applied: ${deleted}/${deletions.length}`);

  // Write explanations
  let explWritten = 0, explErrors = 0;
  for (const e of explanations) {
    try {
      await supabasePatch('questions', `id=eq.${e.id}`, { explanation: e.explanation });
      explWritten++;
    } catch (err) {
      explErrors++;
      if (explErrors <= 3) console.log(`\n  Explanation error q${e.id}: ${err.message}`);
    }
    if ((explWritten + explErrors) % 200 === 0) process.stdout.write(`\r  Explanations: ${explWritten}/${explanations.length} (${explErrors} errors)`);
  }
  if (explanations.length > 0) console.log(`\r  Explanations written: ${explWritten}/${explanations.length}`);

  return { corrections: written, deletions: deleted, explanations: explWritten };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function processLanguage(lang) {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`  Verifying ${lang.toUpperCase()} answers`);
  console.log(`  Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log(`${'='.repeat(50)}`);

  let progress = loadProgress(lang);

  // Phase 1: Load questions
  console.log('\n=== Phase 1: Load questions ===\n');
  let filter = `language=eq.${lang}&select=id,state,category,question_text,option_a,option_b,option_c,option_d,correct_answer&order=id`;
  if (STATE_ARG) filter += `&state=eq.${STATE_ARG}`;

  const questions = await supabaseGetAll('questions', filter);
  console.log(`  Loaded: ${questions.length} questions`);
  if (questions.length === 0) return { corrections: 0, deletions: 0, explanations: 0 };

  const states = [...new Set(questions.map(q => q.state))];
  const categories = [...new Set(questions.map(q => q.category))];
  console.log(`  States: ${states.length}, Categories: ${categories.join(', ')}`);

  let manualsAvailable = 0;
  const combos = new Set(questions.map(q => `${q.state}-${q.category}`));
  for (const combo of combos) {
    const [cat] = combo.split('-').slice(-1);
    const st = combo.substring(0, combo.length - cat.length - 1);
    if (loadManualText(st, cat, lang)) manualsAvailable++;
  }
  console.log(`  Manual texts available: ${manualsAvailable}/${combos.size}`);

  // Phase 2: Haiku verification
  const phase2Results = await phase2_haiku(questions, lang, progress);

  // Phase 3: Sonnet escalation
  const mergedResults = await phase3_sonnet(questions, phase2Results, lang, progress);

  // Phase 4: Write
  const result = await phase4_write(mergedResults, lang);

  // Cleanup progress on success (not dry-run), only if explanations were written
  if (!DRY_RUN && result.explanations > 0) {
    const progressFile = getProgressFile(lang);
    if (fs.existsSync(progressFile)) fs.unlinkSync(progressFile);
  }

  return result;
}

async function main() {
  const langs = ALL_LANGS ? ['en', 'ru', 'es', 'zh', 'ua'] : [LANG_ARG];

  const totals = { corrections: 0, deletions: 0, explanations: 0 };
  for (const lang of langs) {
    const r = await processLanguage(lang);
    totals.corrections += (r?.corrections || 0);
    totals.deletions += (r?.deletions || 0);
    totals.explanations += (r?.explanations || 0);
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log('  FINAL SUMMARY');
  console.log(`${'='.repeat(50)}`);
  console.log(`  Languages: ${langs.join(', ')}`);
  console.log(`  Corrections: ${totals.corrections}${DRY_RUN ? ' (dry run)' : ''}`);
  console.log(`  Deletions: ${totals.deletions}${DRY_RUN ? ' (dry run)' : ''}`);
  console.log(`  Explanations: ${totals.explanations}${DRY_RUN ? ' (dry run)' : ''}`);
  console.log(`${'='.repeat(50)}`);

  if (DRY_RUN) {
    console.log('\nRe-run without --dry-run to apply corrections.');
  }
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
