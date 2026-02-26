#!/usr/bin/env node
/**
 * Match road sign images to DMV test questions using Claude AI.
 * Runs AI matching independently for EACH language (no position-based propagation).
 *
 * Requires env vars: SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY
 * Idempotent: only processes questions where image_url IS NULL.
 */

const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://yaogndpgnewqffbjrsgz.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

if (!SERVICE_KEY) { console.error('Set SUPABASE_SERVICE_ROLE_KEY env var'); process.exit(1); }
if (!ANTHROPIC_KEY) { console.error('Set ANTHROPIC_API_KEY env var'); process.exit(1); }

const SIGNS_DIR = path.join(__dirname, '..', 'public', 'signs');
const BATCH_SIZE = 20;
const ALL_LANGS = ['en', 'ru', 'es', 'zh', 'ua'];

// Per-language keywords for filtering sign-related questions
const LANG_KEYWORDS = {
  en: ['sign', 'signal', 'yield', 'octagon', 'diamond-shaped', 'pennant',
       'triangle', 'crossbuck', 'railroad crossing', 'do not enter',
       'wrong way', 'flashing', 'pavement marking'],
  ru: ['знак', 'сигнал', 'уступ', 'светофор', 'восьмиугольн', 'ромб',
       'треугольн', 'железнодорож', 'не входить', 'встречн', 'мигающ',
       'разметк', 'стоп', 'перекрёст'],
  es: ['señal', 'signo', 'semáforo', 'ceda', 'octágono', 'diamante',
       'triángulo', 'ferrocarril', 'no entre', 'sentido contrario',
       'intermitente', 'marca', 'pare'],
  zh: ['标志', '信号', '让行', '八角', '菱形', '三角',
       '铁路', '禁止进入', '逆行', '闪烁', '标线', '停'],
  ua: ['знак', 'сигнал', 'поступ', 'світлофор', 'восьмикутн', 'ромб',
       'трикутн', 'залізнич', 'не входити', 'зустрічн', 'блимаюч',
       'розмітк', 'стоп', 'перехрест'],
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// --- Supabase helpers ---

async function supabaseGet(table, params = '', { offset = 0, limit = 1000 } = {}) {
  const sep = params ? '&' : '';
  const url = `${SUPABASE_URL}/rest/v1/${table}?${params}${sep}offset=${offset}&limit=${limit}`;
  const res = await fetch(url, {
    headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` },
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
      'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json', 'Prefer': 'return=minimal',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PATCH ${table}: ${res.status} ${await res.text()}`);
}

// --- Column check ---

async function ensureImageColumn() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/questions?limit=0&select=image_url`, {
    headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` },
  });
  if (res.ok) return true;
  console.log('  image_url column MISSING. Run in Supabase SQL Editor:');
  console.log('  ALTER TABLE questions ADD COLUMN IF NOT EXISTS image_url TEXT DEFAULT NULL;');
  return false;
}

// --- Available signs ---

function getAvailableSigns() {
  if (!fs.existsSync(SIGNS_DIR)) return [];
  return fs.readdirSync(SIGNS_DIR).filter(f => f.endsWith('.png')).map(f => f.replace('.png', ''));
}

// --- Claude AI matching ---

async function matchBatch(questions, signIds) {
  const signList = signIds.map(s => `- ${s}`).join('\n');
  const qList = questions.map(q => `ID ${q.id}: ${q.question_text}`).join('\n');

  const prompt = `You are matching DMV test questions to road sign images.

Available sign image IDs:
${signList}

For each question, respond with ONLY a JSON array. Each element: {"id": <number>, "sign": "<sign_id>" or null}.

STRICT RULES:
- Match ONLY if the question is SPECIFICALLY about that particular road sign — asking to identify it, describing its shape/color/meaning, or what a driver should do when they see that specific sign.
- Do NOT match general driving questions that merely mention a concept (e.g. "What is the speed limit in a school zone?" is NOT about the school-zone sign).
- Do NOT match questions about traffic laws, penalties, or procedures even if they mention a sign-related word.
- When in doubt, use null. It is much better to miss a match than to make a wrong one.

Questions:
${qList}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get('retry-after') || '30', 10);
    console.log(`\n  Rate limited, waiting ${retryAfter}s...`);
    await sleep(retryAfter * 1000);
    return matchBatch(questions, signIds);
  }
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API ${res.status}: ${err}`);
  }

  const data = await res.json();
  const text = data.content?.[0]?.text || '';
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];

  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    console.log('  Warning: failed to parse AI response');
    return [];
  }
}

// --- Process one language ---

async function processLanguage(lang, signIds) {
  const keywords = LANG_KEYWORDS[lang] || LANG_KEYWORDS.en;
  const orFilter = keywords.map(k => `question_text.ilike.*${k}*`).join(',');

  const questions = await supabaseGetAll(
    'questions',
    `language=eq.${lang}&image_url=is.null&or=(${encodeURIComponent(orFilter)})&select=id,question_text&order=id`
  );
  console.log(`  ${lang}: ${questions.length} unmatched sign-related questions`);
  if (!questions.length) return 0;

  let matched = 0;
  const matchedIds = [];

  for (let i = 0; i < questions.length; i += BATCH_SIZE) {
    const batch = questions.slice(i, i + BATCH_SIZE);
    try {
      const results = await matchBatch(batch, signIds);
      for (const r of results) {
        if (r.sign && signIds.includes(r.sign)) {
          matchedIds.push({ id: r.id, image_url: `/signs/${r.sign}.png` });
          matched++;
        }
      }
    } catch (e) {
      console.log(`\n  Batch error: ${e.message}`);
    }
    process.stdout.write(`\r  ${lang}: ${Math.min(i + BATCH_SIZE, questions.length)}/${questions.length} (${matched} matched)`);
    await sleep(4000);
  }
  console.log();

  // Update DB
  for (const { id, image_url } of matchedIds) {
    await supabasePatch('questions', `id=eq.${id}`, { image_url });
  }
  console.log(`  ${lang}: updated ${matchedIds.length} questions`);
  return matchedIds.length;
}

// --- Main ---

async function main() {
  console.log('Checking image_url column...');
  if (!(await ensureImageColumn())) return;

  const signIds = getAvailableSigns();
  if (!signIds.length) { console.log('No signs in /public/signs/. Run download-signs.js first.'); return; }
  console.log(`Found ${signIds.length} signs\n`);

  let totalMatched = 0;
  for (const lang of ALL_LANGS) {
    console.log(`--- Language: ${lang} ---`);
    const count = await processLanguage(lang, signIds);
    totalMatched += count;
    console.log();
  }

  console.log(`\nAll done! Total: ${totalMatched} questions matched across all languages.`);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
