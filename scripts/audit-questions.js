// Audit question coverage across states × categories × languages.
// Read-only. Uses service role key to bypass RLS for accurate counts.
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = readFileSync(join(__dirname, '..', '.env.local'), 'utf8');
const get = (k) => env.split('\n').find(l => l.startsWith(k + '='))?.slice(k.length + 1)?.trim();
const URL = get('NEXT_PUBLIC_SUPABASE_URL');
const KEY = get('SUPABASE_SERVICE_ROLE_KEY');

if (!URL || !KEY) {
  console.error('Missing env vars');
  process.exit(1);
}

const HEADERS = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const LANGS = ['en', 'ru', 'es', 'zh', 'ua'];
const CATEGORIES = ['car', 'motorcycle', 'cdl'];
const STATES = [
  'alabama','alaska','arizona','arkansas','california','colorado','connecticut','delaware','florida','georgia',
  'hawaii','idaho','illinois','indiana','iowa','kansas','kentucky','louisiana','maine','maryland',
  'massachusetts','michigan','minnesota','mississippi','missouri','montana','nebraska','nevada','new-hampshire','new-jersey',
  'new-mexico','new-york','north-carolina','north-dakota','ohio','oklahoma','oregon','pennsylvania','rhode-island','south-carolina',
  'south-dakota','tennessee','texas','utah','vermont','virginia','washington','west-virginia','wisconsin','wyoming',
];

async function count(filter = '', retries = 5) {
  const url = `${URL}/rest/v1/questions?select=*${filter ? '&' + filter : ''}`;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'HEAD',
        headers: { ...HEADERS, Prefer: 'count=exact' },
      });
      const range = res.headers.get('content-range');
      if (range && range.includes('/')) {
        const total = range.split('/')[1];
        if (total !== '*' && total !== undefined) return parseInt(total, 10);
      }
    } catch (e) {
      // ECONNRESET / network blip — back off and retry
    }
    await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
  }
  throw new Error(`count failed for filter: ${filter}`);
}

// Distinct values for a column
async function distinct(column) {
  // Pull all values via pagination (small columns: state/category/language)
  const set = new Set();
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const res = await fetch(`${URL}/rest/v1/questions?select=${column}&limit=${pageSize}&offset=${offset}`, {
      headers: HEADERS,
    });
    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) break;
    for (const r of rows) set.add(r[column]);
    if (rows.length < pageSize) break;
  }
  return [...set].sort();
}

console.log('=== TOTAL ===');
const total = await count();
console.log(`Questions in DB: ${total.toLocaleString()}`);

console.log('\n=== DISTINCT VALUES ===');
// Distinct via aggregation endpoint would be faster, but we don't have rpc; use sample
const [states, cats, langs] = await Promise.all([
  // states/cats/langs are small — pull them via group-by would need RPC. Use enumeration.
  Promise.resolve(STATES),
  Promise.resolve(CATEGORIES),
  Promise.resolve(LANGS),
]);

console.log('\n=== BY LANGUAGE ===');
const byLang = {};
for (const lang of LANGS) {
  byLang[lang] = await count(`language=eq.${lang}`);
}
for (const [lang, n] of Object.entries(byLang)) {
  console.log(`${lang}: ${n.toLocaleString()}`);
}

console.log('\n=== BY CATEGORY ===');
const byCat = {};
for (const cat of CATEGORIES) {
  byCat[cat] = await count(`category=eq.${cat}`);
}
for (const [cat, n] of Object.entries(byCat)) {
  console.log(`${cat}: ${n.toLocaleString()}`);
}

console.log('\n=== COVERAGE MATRIX (state × category × language) ===');
console.log('Counting per cell — this is the slow part...');

const matrix = {}; // matrix[state][category][lang] = count
const gaps = []; // (state, category, lang) tuples with 0 questions

let cellsDone = 0;
const totalCells = STATES.length * CATEGORIES.length * LANGS.length;

// Run in parallel batches to speed up (750 requests total)
async function fetchCell(state, cat, lang) {
  const n = await count(`state=eq.${state}&category=eq.${cat}&language=eq.${lang}`);
  return { state, cat, lang, n };
}

const tasks = [];
for (const state of STATES) {
  matrix[state] = {};
  for (const cat of CATEGORIES) {
    matrix[state][cat] = {};
    for (const lang of LANGS) {
      tasks.push(fetchCell(state, cat, lang));
    }
  }
}

// Run concurrently with limit
const CONCURRENCY = 4;
for (let i = 0; i < tasks.length; i += CONCURRENCY) {
  const batch = tasks.slice(i, i + CONCURRENCY);
  const results = await Promise.all(batch);
  for (const r of results) {
    matrix[r.state][r.cat][r.lang] = r.n;
    if (r.n === 0) gaps.push(r);
  }
  cellsDone += batch.length;
  process.stdout.write(`\r${cellsDone}/${totalCells} cells...`);
}
console.log('\n');

// Summary per state — does it have content in all categories × langs?
console.log('=== STATES WITH GAPS ===');
const stateGaps = {};
for (const g of gaps) {
  if (!stateGaps[g.state]) stateGaps[g.state] = [];
  stateGaps[g.state].push(`${g.cat}/${g.lang}`);
}
const statesMissing = Object.keys(stateGaps).sort();
if (statesMissing.length === 0) {
  console.log('All states have content in all categories and languages.');
} else {
  for (const state of statesMissing) {
    const missing = stateGaps[state];
    console.log(`${state} (${missing.length} gaps): ${missing.join(', ')}`);
  }
}

console.log('\n=== ENGLISH BASELINE (any state missing EN questions?) ===');
const enGaps = [];
for (const state of STATES) {
  for (const cat of CATEGORIES) {
    if (matrix[state][cat]['en'] === 0) {
      enGaps.push(`${state}/${cat}`);
    }
  }
}
if (enGaps.length === 0) console.log('Every state has English questions in every category. ✅');
else console.log(`Missing English: ${enGaps.join(', ')}`);

console.log('\n=== TRANSLATION GAPS (EN exists but other lang missing) ===');
const translationGaps = {};
for (const state of STATES) {
  for (const cat of CATEGORIES) {
    if (matrix[state][cat]['en'] === 0) continue;
    for (const lang of LANGS) {
      if (lang === 'en') continue;
      if (matrix[state][cat][lang] === 0) {
        if (!translationGaps[lang]) translationGaps[lang] = [];
        translationGaps[lang].push(`${state}/${cat}`);
      }
    }
  }
}
for (const lang of LANGS) {
  if (lang === 'en') continue;
  const g = translationGaps[lang] || [];
  if (g.length === 0) console.log(`${lang}: complete ✅`);
  else console.log(`${lang}: ${g.length} missing — ${g.slice(0, 5).join(', ')}${g.length > 5 ? `, ... (+${g.length - 5} more)` : ''}`);
}

console.log('\n=== ROW-COUNT IMBALANCE (EN vs other lang per state/category) ===');
console.log('Cases where translated count differs from EN by >10% — likely incomplete translation:\n');
const imbalances = [];
for (const state of STATES) {
  for (const cat of CATEGORIES) {
    const enN = matrix[state][cat]['en'];
    if (enN === 0) continue;
    for (const lang of LANGS) {
      if (lang === 'en') continue;
      const n = matrix[state][cat][lang];
      if (n === 0) continue; // already reported above
      const ratio = n / enN;
      if (ratio < 0.9 || ratio > 1.1) {
        imbalances.push({ state, cat, lang, en: enN, n, ratio });
      }
    }
  }
}
imbalances.sort((a, b) => a.ratio - b.ratio);
if (imbalances.length === 0) console.log('All translation counts within 10% of EN. ✅');
else {
  for (const i of imbalances.slice(0, 30)) {
    const pct = (i.ratio * 100).toFixed(0);
    console.log(`${i.state}/${i.cat}/${i.lang}: ${i.n}/${i.en} (${pct}%)`);
  }
  if (imbalances.length > 30) console.log(`... and ${imbalances.length - 30} more`);
}
