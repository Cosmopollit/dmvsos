// Drill into CDL: subcategory coverage by state × language.
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = readFileSync(join(__dirname, '..', '.env.local'), 'utf8');
const get = (k) => env.split('\n').find(l => l.startsWith(k + '='))?.slice(k.length + 1)?.trim();
const URL = get('NEXT_PUBLIC_SUPABASE_URL');
const KEY = get('SUPABASE_SERVICE_ROLE_KEY');
const HEADERS = { apikey: KEY, Authorization: `Bearer ${KEY}` };

async function count(filter) {
  const res = await fetch(`${URL}/rest/v1/questions?select=*&${filter}`, {
    method: 'HEAD',
    headers: { ...HEADERS, Prefer: 'count=exact' },
  });
  const range = res.headers.get('content-range');
  return parseInt(range?.split('/')?.[1] ?? '0', 10);
}

// What subcategories exist in CDL?
console.log('=== CDL subcategories — distinct ===');
const res = await fetch(`${URL}/rest/v1/questions?select=subcategory&category=eq.cdl&limit=20000`, { headers: HEADERS });
const rows = await res.json();
const subSet = new Set();
for (const r of rows) subSet.add(r.subcategory ?? '<null>');
console.log('subcategories present in CDL sample:', [...subSet].sort().join(', '));

// CDL totals by subcategory × language
console.log('\n=== CDL: subcategory × language totals ===');
const subs = [...subSet].filter(s => s !== '<null>');
for (const sub of subs) {
  console.log(`\n--- ${sub} ---`);
  for (const lang of ['en', 'ru', 'es', 'zh', 'ua']) {
    const n = await count(`category=eq.cdl&subcategory=eq.${sub}&language=eq.${lang}`);
    console.log(`  ${lang}: ${n.toLocaleString()}`);
  }
}
// Also count nulls
const nullEn = await count(`category=eq.cdl&subcategory=is.null&language=eq.en`);
const nullAll = await count(`category=eq.cdl&subcategory=is.null`);
console.log(`\nCDL rows with subcategory=null: ${nullAll.toLocaleString()} total | EN-only: ${nullEn.toLocaleString()}`);

// Specific problem: minnesota/car/en and ohio/cdl/en
console.log('\n=== GAP PROBE ===');
const minCarEn = await count('state=eq.minnesota&category=eq.car&language=eq.en');
const minCarAny = await count('state=eq.minnesota&category=eq.car');
console.log(`minnesota/car: EN=${minCarEn}, any-lang=${minCarAny}`);

const ohCdlEn = await count('state=eq.ohio&category=eq.cdl&language=eq.en');
const ohCdlAny = await count('state=eq.ohio&category=eq.cdl');
console.log(`ohio/cdl: EN=${ohCdlEn}, any-lang=${ohCdlAny}`);

// Sample minnesota/car rows to see what language(s) exist
const sample = await fetch(`${URL}/rest/v1/questions?select=language,count&state=eq.minnesota&category=eq.car&limit=10`, { headers: HEADERS });
const sampleRows = await sample.json();
console.log(`minnesota/car sample langs:`, sampleRows.map(r => r.language).join(', '));

const sample2 = await fetch(`${URL}/rest/v1/questions?select=language&state=eq.ohio&category=eq.cdl&limit=10`, { headers: HEADERS });
const sample2Rows = await sample2.json();
console.log(`ohio/cdl sample langs:`, sample2Rows.map(r => r.language).join(', '));
