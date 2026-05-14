// Export questions from Supabase to static JSON files served from /public/data.
// Splits per state × category × language so a single URL exposes ~50 questions max.
//
// Output layout:
//   public/data/{lang}/{state}/{category}.json
//
// Each file contains a flat array of questions matching the runtime shape used by app/test/page.js.
//
// Usage:
//   node scripts/export-questions-to-json.js                 # all states + langs + categories
//   node scripts/export-questions-to-json.js --lang=en       # one language
//   node scripts/export-questions-to-json.js --state=florida # one state
//   node scripts/export-questions-to-json.js --dry-run       # count only

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const envFile = readFileSync(join(root, '.env.local'), 'utf8');
const env = (k) => envFile.split('\n').find(l => l.startsWith(k + '='))?.slice(k.length + 1)?.trim();

const SUPA_URL = env('NEXT_PUBLIC_SUPABASE_URL');
const SUPA_KEY = env('SUPABASE_SERVICE_ROLE_KEY');
if (!SUPA_URL || !SUPA_KEY) { console.error('Missing Supabase env'); process.exit(1); }

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const langFilter = args.find(a => a.startsWith('--lang='))?.split('=')[1] || null;
const stateFilter = args.find(a => a.startsWith('--state='))?.split('=')[1] || null;

const OUT_DIR = join(root, 'public', 'data');
const LANGS = langFilter ? [langFilter] : ['en', 'ru', 'es', 'zh', 'ua'];
const CATEGORIES = ['car', 'cdl', 'motorcycle'];

// Strip "A. ", "Б. " etc prefixes from option text — UI does same.
function strip(s) {
  return (s || '').replace(/^[A-DА-Га-гa-d]\.\s*/, '').trim();
}

async function sbSelect(table, query, range) {
  const headers = {
    apikey: SUPA_KEY,
    Authorization: `Bearer ${SUPA_KEY}`,
  };
  if (range) headers.Range = range;
  const res = await fetch(`${SUPA_URL}/rest/v1/${table}?${query}`, { headers });
  if (!res.ok) throw new Error(`Supabase ${table} ${res.status}: ${await res.text()}`);
  return res.json();
}

// Fetch all questions for one state+category+language with pagination.
async function fetchQuestions(lang, state, category) {
  const all = [];
  const pageSize = 1000;
  let from = 0;
  for (;;) {
    const range = `${from}-${from + pageSize - 1}`;
    const rows = await sbSelect('questions',
      `state=eq.${state}&category=eq.${category}&language=eq.${lang}&select=*&order=id`,
      range);
    all.push(...rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

// Get distinct states from DB.
async function listStates() {
  // Use rpc-like approach via select with distinct (PostgREST has no real distinct,
  // so we just query all states and dedupe).
  const rows = await sbSelect('questions', 'select=state&limit=200000');
  return [...new Set(rows.map(r => r.state))].sort();
}

function mapRow(row) {
  const answers = [row.option_a, row.option_b, row.option_c, row.option_d].filter(Boolean).map(strip);
  return {
    question: row.question_text || '',
    answers,
    correctAnswerIndex: row.correct_answer ?? 0,
    imageUrl: row.image_url || null,
    explanation: row.explanation || null,
    manualSection: row.manual_section || null,
    manualReference: row.manual_reference || null,
  };
}

console.log(`Export: ${LANGS.length} langs × ${CATEGORIES.length} categories × ? states\n`);

const statesAll = await listStates();
const states = stateFilter ? [stateFilter] : statesAll;
console.log(`Found ${statesAll.length} states. Will export ${states.length}.\n`);

let totalQ = 0;
let totalFiles = 0;

for (const lang of LANGS) {
  for (const state of states) {
    for (const category of CATEGORIES) {
      const rows = await fetchQuestions(lang, state, category);
      const mapped = rows.map(mapRow).filter(q => q.answers.length >= 2);
      if (mapped.length === 0) continue;

      const dir = join(OUT_DIR, lang, state);
      const file = join(dir, `${category}.json`);
      if (!dryRun) {
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        writeFileSync(file, JSON.stringify(mapped));
      }
      totalQ += mapped.length;
      totalFiles += 1;
      console.log(`  ${dryRun ? '[dry]' : '✓'} ${lang}/${state}/${category}.json — ${mapped.length} questions`);
    }
  }
}

console.log(`\nDone. ${totalFiles} files, ${totalQ.toLocaleString()} questions total.`);
console.log(`Output: ${OUT_DIR}/{lang}/{state}/{category}.json`);
