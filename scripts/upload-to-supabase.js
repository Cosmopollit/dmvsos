const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://yaogndpgnewqffbjrsgz.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const START_FROM = parseInt(process.env.START_FROM || '0', 10);

if (!SERVICE_KEY) {
  console.error('Set SUPABASE_SERVICE_ROLE_KEY env variable');
  process.exit(1);
}

const BASE = path.join(__dirname, '..', 'public', 'data');
const LANG_MAP = { en: 'en', ru: 'ru', es: 'es', cn: 'zh' };
const BATCH_SIZE = 200;
const DELAY_MS = 300;

function str(val) { return typeof val === 'string' ? val : ''; }
function strOrNull(val) { return typeof val === 'string' ? val : null; }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function insertBatch(rows, attempt = 1) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/questions`, {
      method: 'POST',
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify(rows),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`HTTP ${res.status}: ${err}`);
    }
    return rows.length;
  } catch (e) {
    if (attempt < 3) {
      console.log(`\n  Retry ${attempt}/3 after error: ${e.message}`);
      await sleep(2000 * attempt);
      return insertBatch(rows, attempt + 1);
    }
    throw e;
  }
}

async function main() {
  const allRows = [];
  let skipped = 0;

  for (const [dir, lang] of Object.entries(LANG_MAP)) {
    const folder = path.join(BASE, dir);
    if (!fs.existsSync(folder)) continue;

    const files = fs.readdirSync(folder).filter(f => f.endsWith('.json'));
    for (const file of files) {
      const state = file.replace('.json', '');
      const data = JSON.parse(fs.readFileSync(path.join(folder, file), 'utf8'));

      for (const category of ['car', 'cdl', 'motorcycle']) {
        if (!data[category]) continue;
        for (const test of data[category]) {
          if (!test.questions) continue;
          for (const q of test.questions) {
            const answers = Array.isArray(q.answers) ? q.answers : [];
            const questionText = str(q.question);
            const optA = str(answers[0]);
            const correct = typeof q.correctAnswerIndex === 'number' ? q.correctAnswerIndex : 0;
            if (!questionText || !optA || correct < 0 || correct > 3) { skipped++; continue; }

            allRows.push({
              state,
              category,
              language: lang,
              question_text: questionText,
              option_a: optA,
              option_b: str(answers[1]),
              option_c: strOrNull(answers[2]),
              option_d: strOrNull(answers[3]),
              correct_answer: correct,
            });
          }
        }
      }
    }
  }

  const toUpload = allRows.slice(START_FROM);
  console.log(`Total: ${allRows.length} (skipped ${skipped} invalid). Uploading from ${START_FROM}...`);

  let uploaded = START_FROM;
  for (let i = 0; i < toUpload.length; i += BATCH_SIZE) {
    const batch = toUpload.slice(i, i + BATCH_SIZE);
    const count = await insertBatch(batch);
    uploaded += count;
    process.stdout.write(`\r  Uploaded ${uploaded}/${allRows.length}`);
    await sleep(DELAY_MS);
  }

  console.log(`\nDone! ${uploaded} questions in database.`);
}

main().catch(e => { console.error('\nFATAL:', e.message); process.exit(1); });
