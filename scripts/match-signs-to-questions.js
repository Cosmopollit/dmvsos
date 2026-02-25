#!/usr/bin/env node
/**
 * Match road sign images to DMV test questions using Claude AI.
 * 1. Ensures image_url column exists
 * 2. Fetches English sign-related questions
 * 3. Uses Claude Haiku to match each to a sign file (or null)
 * 4. Updates image_url in database
 * 5. Propagates to other languages by position (same state/category, ordered by id)
 *
 * Requires env vars: SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY
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
const OTHER_LANGS = ['ru', 'es', 'zh', 'ua'];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// --- Supabase helpers ---

async function supabaseGet(table, params = '', { offset = 0, limit = 1000 } = {}) {
  const sep = params ? '&' : '';
  const url = `${SUPABASE_URL}/rest/v1/${table}?${params}${sep}offset=${offset}&limit=${limit}`;
  const res = await fetch(url, {
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
    },
  });
  if (!res.ok) throw new Error(`GET ${table}: ${res.status} ${await res.text()}`);
  return res.json();
}

// Paginated fetch — gets all rows matching the query
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
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PATCH ${table}: ${res.status} ${await res.text()}`);
}

// --- Column check ---

async function ensureImageColumn() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/questions?limit=0&select=image_url`, {
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
    },
  });
  if (res.ok) {
    console.log('  image_url column exists');
    return true;
  }
  console.log('  image_url column MISSING. Run this SQL in Supabase dashboard:');
  console.log('  ALTER TABLE questions ADD COLUMN IF NOT EXISTS image_url TEXT DEFAULT NULL;');
  return false;
}

// --- Available signs ---

function getAvailableSigns() {
  if (!fs.existsSync(SIGNS_DIR)) return [];
  return fs.readdirSync(SIGNS_DIR)
    .filter(f => f.endsWith('.png'))
    .map(f => f.replace('.png', ''));
}

// --- Claude AI matching ---

async function matchBatch(questions, signIds) {
  const signList = signIds.map(s => `- ${s}`).join('\n');
  const qList = questions.map(q => `ID ${q.id}: ${q.question_text}`).join('\n');

  const prompt = `You are matching DMV test questions to road sign images.

Available sign image IDs:
${signList}

For each question below, respond with ONLY a JSON array. Each element: {"id": <number>, "sign": "<sign_id>" or null}.
Match a question to a sign ONLY if the question is specifically about that sign (asks to identify it, describes its shape/color, or tests knowledge of what it means). If unsure or no sign matches, use null.

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
    // Rate limited — wait and retry once
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

// --- Main ---

async function main() {
  console.log('Step 1: Checking image_url column...');
  if (!(await ensureImageColumn())) return;

  console.log('Step 2: Reading available signs...');
  const signIds = getAvailableSigns();
  if (!signIds.length) {
    console.log('  No signs in /public/signs/. Run download-signs.js first.');
    return;
  }
  console.log(`  Found ${signIds.length} signs: ${signIds.join(', ')}`);

  console.log('Step 3: Fetching English sign-related questions...');
  // Keywords that indicate a sign-related question
  const keywords = [
    'sign', 'signal', 'yield', 'octagon', 'diamond-shaped', 'pennant',
    'triangle', 'crossbuck', 'railroad crossing', 'do not enter',
    'wrong way', 'flashing', 'pavement marking',
  ];
  const orFilter = keywords.map(k => `question_text.ilike.*${k}*`).join(',');
  const questions = await supabaseGetAll(
    'questions',
    `language=eq.en&image_url=is.null&or=(${encodeURIComponent(orFilter)})&select=id,question_text,state,category&order=id`
  );
  console.log(`  Found ${questions.length} unmatched sign-related questions`);
  if (!questions.length) { console.log('  Nothing to match!'); return; }

  console.log('Step 4: Matching with Claude AI...');
  let matched = 0;
  const matchedIds = []; // { id, image_url }

  for (let i = 0; i < questions.length; i += BATCH_SIZE) {
    const batch = questions.slice(i, i + BATCH_SIZE);
    try {
      const results = await matchBatch(batch, signIds);
      for (const r of results) {
        if (r.sign && signIds.includes(r.sign)) {
          const imageUrl = `/signs/${r.sign}.png`;
          matchedIds.push({ id: r.id, image_url: imageUrl });
          matched++;
        }
      }
    } catch (e) {
      console.log(`\n  Batch error: ${e.message}`);
    }
    process.stdout.write(`\r  Processed ${Math.min(i + BATCH_SIZE, questions.length)}/${questions.length} (${matched} matched)`);
    await sleep(4000);
  }
  console.log();

  console.log('Step 5: Updating matched English questions...');
  for (const { id, image_url } of matchedIds) {
    await supabasePatch('questions', `id=eq.${id}`, { image_url });
  }
  console.log(`  Updated ${matchedIds.length} English questions`);

  console.log('Step 6: Propagating to other languages...');
  // Get all English questions that now have images
  const withImages = await supabaseGetAll(
    'questions',
    'language=eq.en&image_url=not.is.null&select=id,state,category,image_url&order=id'
  );
  console.log(`  ${withImages.length} English questions have images`);

  // Group by state+category
  const groups = {};
  for (const q of withImages) {
    const key = `${q.state}|${q.category}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(q);
  }

  let propagated = 0;
  const groupKeys = Object.keys(groups);
  for (let gi = 0; gi < groupKeys.length; gi++) {
    const [state, category] = groupKeys[gi].split('|');

    // Get all English questions for this group (ordered by id) to establish position
    const allEn = await supabaseGetAll(
      'questions',
      `state=eq.${encodeURIComponent(state)}&category=eq.${encodeURIComponent(category)}&language=eq.en&select=id,image_url&order=id`
    );

    // Build position -> image_url map
    const posMap = {};
    allEn.forEach((q, idx) => {
      if (q.image_url) posMap[idx] = q.image_url;
    });
    if (!Object.keys(posMap).length) continue;

    // Apply to each other language
    for (const lang of OTHER_LANGS) {
      const langQs = await supabaseGetAll(
        'questions',
        `state=eq.${encodeURIComponent(state)}&category=eq.${encodeURIComponent(category)}&language=eq.${lang}&select=id,image_url&order=id`
      );

      for (const [pos, imageUrl] of Object.entries(posMap)) {
        const idx = parseInt(pos);
        if (langQs[idx] && langQs[idx].image_url !== imageUrl) {
          await supabasePatch('questions', `id=eq.${langQs[idx].id}`, { image_url: imageUrl });
          propagated++;
        }
      }
      await sleep(100);
    }

    process.stdout.write(`\r  Groups: ${gi + 1}/${groupKeys.length} (${propagated} propagated)`);
  }
  console.log(`\n  Propagated to ${propagated} translated questions`);

  console.log('\nAll done!');
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
