#!/usr/bin/env node
/**
 * Generate and write explanations for questions that don't have one yet.
 * Uses Claude Haiku in batches of 10, with manual text as RAG context.
 *
 * Usage:
 *   node scripts/write-explanations.js --lang=en
 *   node scripts/write-explanations.js --all-langs
 *   node scripts/write-explanations.js --lang=en --dry-run
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
const MANUALS_DIR = path.join(__dirname, '..', '.manuals-text');
const BATCH_SIZE = parseInt(process.argv.find(a => a.startsWith('--batch='))?.split('=')[1] || '10', 10);
const CONCURRENCY = parseInt(process.argv.find(a => a.startsWith('--concurrency='))?.split('=')[1] || '5', 10);
const USE_SONNET = process.argv.includes('--sonnet');
const HAIKU_MODEL = USE_SONNET ? 'claude-sonnet-4-5-20250929' : 'claude-haiku-4-5-20251001';
const OPTION_LABELS = ['A', 'B', 'C', 'D'];

if (!SERVICE_KEY) { console.error('Set SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
if (!ANTHROPIC_KEY) { console.error('Set ANTHROPIC_API_KEY'); process.exit(1); }
if (!ALL_LANGS && !LANG_ARG) { console.error('Specify --lang=en or --all-langs'); process.exit(1); }

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

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
// Claude API
// ---------------------------------------------------------------------------

async function callClaude(prompt) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: HAIKU_MODEL,
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (res.status === 429) {
    const retry = parseInt(res.headers.get('retry-after') || '30', 10);
    console.log(`\n  Rate limited, waiting ${retry}s...`);
    await sleep(retry * 1000);
    return callClaude(prompt);
  }
  if (res.status === 529) {
    console.log('\n  API overloaded, waiting 60s...');
    await sleep(60000);
    return callClaude(prompt);
  }
  if (!res.ok) throw new Error(`Claude API ${res.status}: ${await res.text()}`);

  const data = await res.json();
  return data.content?.[0]?.text || '';
}

// ---------------------------------------------------------------------------
// Manual text (RAG)
// ---------------------------------------------------------------------------

const manualCache = {};

function loadManualText(state, category, lang) {
  const key = `${state}-${category}-${lang}`;
  if (manualCache[key] !== undefined) return manualCache[key];
  const filePath = path.join(MANUALS_DIR, `${key}.txt`);
  if (fs.existsSync(filePath)) {
    manualCache[key] = fs.readFileSync(filePath, 'utf8');
  } else {
    const enPath = path.join(MANUALS_DIR, `${state}-${category}-en.txt`);
    if (lang !== 'en' && fs.existsSync(enPath)) {
      manualCache[key] = fs.readFileSync(enPath, 'utf8');
    } else {
      manualCache[key] = null;
    }
  }
  return manualCache[key];
}

function findRelevantExcerpt(manualText, text) {
  if (!manualText) return '';
  const keywords = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
    .filter(w => w.length > 3)
    .filter(w => !['what','when','which','that','this','your','with','from','have',
      'does','should','would','could','must','following','correct','answer',
      'true','false','none','above','below','both'].includes(w));
  const paragraphs = manualText.split(/\n\n+/).filter(p => p.trim().length > 50);
  const scored = paragraphs.map(p => {
    const pLower = p.toLowerCase();
    let score = 0;
    for (const kw of keywords) if (pLower.includes(kw)) score++;
    return { text: p, score };
  });
  scored.sort((a, b) => b.score - a.score);
  const top = scored.filter(s => s.score > 0).slice(0, 3);
  if (!top.length) return '';
  let excerpt = top.map(t => t.text).join('\n\n');
  if (excerpt.length > 2000) excerpt = excerpt.substring(0, 2000) + '...';
  return excerpt;
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

function getProgressFile(lang) {
  return path.join(__dirname, '..', `.write-explanations-${lang}-progress.json`);
}

function loadProgress(lang) {
  const f = getProgressFile(lang);
  if (fs.existsSync(f)) try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch {}
  return { written: {} };
}

function saveProgress(lang, progress) {
  fs.writeFileSync(getProgressFile(lang), JSON.stringify(progress));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function processLanguage(lang) {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`  Generating explanations for ${lang.toUpperCase()}`);
  console.log(`${'='.repeat(50)}\n`);

  // Load questions without explanation
  console.log('  Loading questions without explanation...');
  const questions = await supabaseGetAll('questions',
    `language=eq.${lang}&explanation=is.null&select=id,state,category,question_text,option_a,option_b,option_c,option_d,correct_answer&order=id`
  );
  console.log(`  Found: ${questions.length} questions without explanation`);
  if (questions.length === 0) return 0;

  const progress = loadProgress(lang);
  const alreadyDone = new Set(Object.keys(progress.written));
  const toProcess = questions.filter(q => !alreadyDone.has(q.id));
  console.log(`  Already done: ${alreadyDone.size}, remaining: ${toProcess.length}`);

  // Group by state+category
  const groups = {};
  for (const q of toProcess) {
    const key = `${q.state}|${q.category}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(q);
  }

  let processed = 0, written = 0, errors = 0;

  // Flatten all batches
  const allBatches = [];
  for (const [, groupQuestions] of Object.entries(groups)) {
    const { state, category } = groupQuestions[0];
    const manualText = loadManualText(state, category, lang);
    for (let i = 0; i < groupQuestions.length; i += BATCH_SIZE) {
      allBatches.push({ batch: groupQuestions.slice(i, i + BATCH_SIZE), state, manualText });
    }
  }

  console.log(`  Concurrency: ${CONCURRENCY}, batches: ${allBatches.length}`);

  async function processBatch({ batch, state, manualText }) {
    const batchText = batch.map(q =>
      `${q.question_text} ${q.option_a} ${q.option_b} ${q.option_c || ''} ${q.option_d || ''}`
    ).join(' ');
    const excerpt = findRelevantExcerpt(manualText, batchText);

    const qList = batch.map(q => {
      const options = [q.option_a, q.option_b, q.option_c, q.option_d]
        .filter(Boolean).map((o, i) => `  ${OPTION_LABELS[i]}. ${o}`).join('\n');
      return `ID: ${q.id}\nQuestion: ${q.question_text}\n${options}\nCorrect: ${OPTION_LABELS[q.correct_answer]}`;
    }).join('\n\n');

    const manualSection = excerpt
      ? `Reference from the ${state} driver manual:\n---\n${excerpt}\n---\n\n`
      : '';

    const langNote = lang !== 'en'
      ? `\nIMPORTANT: Write explanations in the SAME language as the questions (${lang.toUpperCase()}). Use English manual as reference but explain in the question's language.\n`
      : '';

    const prompt = `You are a US DMV test explanation writer. For each question, write a brief 1-2 sentence explanation of WHY the correct answer is right. Reference the manual when possible. This will be shown to students studying for their DMV test.

${manualSection}${langNote}Output ONLY a JSON array:
[{"id": "<uuid>", "explanation": "1-2 sentence explanation"}]

Questions:
${qList}`;

    let batchWritten = 0, batchErrors = 0;
    try {
      const response = await callClaude(prompt);
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      let parsed = null;
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[0]);
        } catch {
          // Fallback: extract id/explanation for broken JSON (unescaped quotes in CJK text)
          const idExplPairs = [];
          // Match each {id, explanation} object greedily
          const objRe = /\{\s*"id"\s*:\s*"([0-9a-f-]{36})"[\s,]*"explanation"\s*:\s*"([\s\S]*?)"\s*\}/g;
          let m;
          while ((m = objRe.exec(response)) !== null) {
            // The greedy match might include too much; trim explanation at last " before }
            let expl = m[2];
            // Remove trailing incomplete parts if any
            expl = expl.replace(/\\"/g, '"').replace(/\\n/g, ' ').trim();
            if (expl.length >= 10) idExplPairs.push({ id: m[1], explanation: expl });
          }
          // If regex still fails, try extracting between known markers
          if (idExplPairs.length === 0) {
            const idMatch = response.match(/"id"\s*:\s*"([0-9a-f-]{36})"/);
            const explStart = response.indexOf('"explanation"');
            if (idMatch && explStart > -1) {
              let rest = response.substring(explStart);
              const colonQuote = rest.indexOf(': "');
              if (colonQuote > -1) {
                rest = rest.substring(colonQuote + 3);
                // Find the closing pattern: "}] or "} at end
                const endPatterns = ['"}]', '"\n}', '"\r\n}'];
                let endIdx = -1;
                for (const ep of endPatterns) {
                  const idx = rest.lastIndexOf(ep);
                  if (idx > endIdx) endIdx = idx;
                }
                if (endIdx > 0) {
                  const expl = rest.substring(0, endIdx).replace(/\\n/g, ' ').trim();
                  if (expl.length >= 10) idExplPairs.push({ id: idMatch[1], explanation: expl });
                }
              }
            }
          }
          if (idExplPairs.length > 0) parsed = idExplPairs;
        }
      }
      if (parsed) {
        for (const r of parsed) {
          if (!r.id || !r.explanation || r.explanation.length < 10) continue;
          if (!DRY_RUN) {
            try {
              await supabasePatch('questions', `id=eq.${r.id}`, { explanation: r.explanation });
              batchWritten++;
              progress.written[r.id] = true;
            } catch (e) {
              batchErrors++;
            }
          } else {
            batchWritten++;
            progress.written[r.id] = true;
          }
        }
      }
      if (batchWritten === 0 && batch.length > 0) {
        if (toProcess.length <= 5) console.error(`\n  DEBUG response: ${response.substring(0, 300)}`);
        batchErrors++;
      }
    } catch (e) {
      if (batchErrors < 3) console.error(`\n  ERR: ${e.message}`);
      batchErrors++;
    }
    return { count: batch.length, written: batchWritten, errors: batchErrors };
  }

  // Process with concurrency
  let idx = 0;
  async function worker() {
    while (idx < allBatches.length) {
      const batchIdx = idx++;
      const result = await processBatch(allBatches[batchIdx]);
      processed += result.count;
      written += result.written;
      errors += result.errors;
      process.stdout.write(`\r  [${lang}]: ${processed}/${toProcess.length} | written:${written} err:${errors}`);
      if (processed % (BATCH_SIZE * 10) < BATCH_SIZE * CONCURRENCY) {
        saveProgress(lang, progress);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  console.log();
  saveProgress(lang, progress);
  console.log(`  Done: ${written} explanations written, ${errors} errors`);

  // Cleanup progress on full success
  if (!DRY_RUN && errors === 0) {
    const f = getProgressFile(lang);
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }

  return written;
}

async function main() {
  const langs = ALL_LANGS ? ['en', 'ru', 'es', 'zh', 'ua'] : [LANG_ARG];
  let total = 0;
  for (const lang of langs) {
    total += await processLanguage(lang);
  }
  console.log(`\n${'='.repeat(50)}`);
  console.log(`  DONE: ${total} explanations written${DRY_RUN ? ' (dry run)' : ''}`);
  console.log(`${'='.repeat(50)}`);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
