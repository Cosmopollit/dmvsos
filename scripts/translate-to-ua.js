const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  timeout: 5 * 60 * 1000, // 5 minutes per request
});

const EN_DIR = path.join(__dirname, '..', 'public', 'data', 'en');
const UA_DIR = path.join(__dirname, '..', 'public', 'data', 'ua');
const CATEGORIES = ['car', 'cdl', 'motorcycle'];
const BATCH_SIZE = 40;
const DELAY_MS = 300;
const MAX_RETRIES = 3;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Translate test name (e.g. "California Car Practice Test #1" → Ukrainian)
async function translateTestName(name) {
  const res = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 200,
    messages: [{
      role: 'user',
      content: `Translate this DMV practice test name to Ukrainian. Return ONLY the translated text, nothing else.\n\n"${name}"`
    }]
  });
  return res.content[0].text.replace(/^["']|["']$/g, '').trim();
}

// Translate a batch of questions to Ukrainian
async function translateBatch(questions) {
  const input = questions.map(q => ({
    question: q.question,
    answers: q.answers,
  }));

  const res = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 16000,
    messages: [{
      role: 'user',
      content: `Translate the following DMV test questions and answers from English to Ukrainian.

Rules:
- Translate ONLY the "question" and "answers" text fields
- Keep the JSON structure exactly the same
- Keep answer letter prefixes (A., B., C., D.) if present
- Keep question number prefixes (1., 2., etc.) if present
- Do NOT translate URLs, proper nouns like "DMV", or abbreviations like "CDL", "BAC"
- Use natural, fluent Ukrainian — not word-for-word translation
- Return ONLY a valid JSON array, no markdown, no explanation

Input:
${JSON.stringify(input, null, 2)}`
    }]
  });

  const text = res.content[0].text.replace(/```json|```/g, '').trim();
  return JSON.parse(text);
}

// Translate with retry logic
async function translateBatchWithRetry(questions, label) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const translated = await translateBatch(questions);
      if (translated.length !== questions.length) {
        throw new Error(`Expected ${questions.length} questions, got ${translated.length}`);
      }
      return translated;
    } catch (e) {
      console.error(`\n  [${label}] Attempt ${attempt}/${MAX_RETRIES} failed: ${e.message}`);
      if (attempt < MAX_RETRIES) {
        await sleep(5000 * attempt);
      } else {
        throw e;
      }
    }
  }
}

async function translateFile(file) {
  const state = file.replace('.json', '');
  const enPath = path.join(EN_DIR, file);
  const uaPath = path.join(UA_DIR, file);

  // Skip if already translated (resume support)
  if (fs.existsSync(uaPath)) {
    console.log(`  SKIP ${state} (already exists)`);
    return { state, questions: 0, skipped: true };
  }

  const enData = JSON.parse(fs.readFileSync(enPath, 'utf8'));
  const uaData = {};
  let totalQuestions = 0;

  for (const category of CATEGORIES) {
    if (!enData[category]) continue;
    uaData[category] = [];

    for (let ti = 0; ti < enData[category].length; ti++) {
      const test = enData[category][ti];
      const questions = test.questions || [];

      // Translate test name
      const uaName = await translateTestName(test.name);
      await sleep(DELAY_MS);

      const uaQuestions = [];

      // Translate in batches of BATCH_SIZE
      for (let i = 0; i < questions.length; i += BATCH_SIZE) {
        const batch = questions.slice(i, i + BATCH_SIZE);
        const label = `${state}/${category}/test${ti + 1}/batch${Math.floor(i / BATCH_SIZE) + 1}`;

        const translated = await translateBatchWithRetry(batch, label);

        // Merge translations with original metadata (correctAnswerIndex, imageUrl)
        for (let j = 0; j < batch.length; j++) {
          uaQuestions.push({
            question: translated[j].question,
            answers: translated[j].answers,
            correctAnswerIndex: batch[j].correctAnswerIndex,
            imageUrl: batch[j].imageUrl,
          });
        }

        totalQuestions += batch.length;
        process.stdout.write(`\r  ${state}: ${totalQuestions} questions translated...`);
        await sleep(DELAY_MS);
      }

      uaData[category].push({
        name: uaName,
        questions: uaQuestions,
      });
    }
  }

  // Save after each state file
  fs.writeFileSync(uaPath, JSON.stringify(uaData, null, 2), 'utf8');
  console.log(`\r  ${state}: ${totalQuestions} questions — DONE`);
  return { state, questions: totalQuestions, skipped: false };
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Set ANTHROPIC_API_KEY env variable');
    process.exit(1);
  }

  // Create ua directory if it doesn't exist
  if (!fs.existsSync(UA_DIR)) {
    fs.mkdirSync(UA_DIR, { recursive: true });
  }

  // Get all English state files (exclude stray files)
  const files = fs.readdirSync(EN_DIR)
    .filter(f => f.endsWith('.json') && !f.includes('-translate-'));

  console.log(`\nTranslating ${files.length} state files to Ukrainian\n`);

  let totalQuestions = 0;
  let translated = 0;
  let skipped = 0;
  const startTime = Date.now();

  for (let i = 0; i < files.length; i++) {
    console.log(`[${i + 1}/${files.length}] ${files[i]}`);
    try {
      const result = await translateFile(files[i]);
      totalQuestions += result.questions;
      if (result.skipped) skipped++;
      else translated++;
    } catch (e) {
      console.error(`\n  FAILED ${files[i]}: ${e.message}`);
      console.error('  Continuing with next state...\n');
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  console.log(`\n--- Summary ---`);
  console.log(`Translated: ${translated} files (${totalQuestions} questions)`);
  console.log(`Skipped: ${skipped} files (already existed)`);
  console.log(`Time: ${elapsed} minutes`);
  console.log(`Output: ${UA_DIR}`);
}

main().catch(e => { console.error('\nFATAL:', e.message); process.exit(1); });
