const SUPABASE_URL = 'https://yaogndpgnewqffbjrsgz.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_KEY) { console.error('Set SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }

const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
};

async function sbAll(table, query) {
  const pageSize = 1000;
  let offset = 0;
  const out = [];
  while (true) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
      headers: { ...headers, Range: `${offset}-${offset + pageSize - 1}` },
    });
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
    const rows = await res.json();
    out.push(...rows);
    if (rows.length < pageSize) break;
    offset += pageSize;
  }
  return out;
}

async function main() {
  console.log('Loading question metadata (state, category, language)...');
  const rows = await sbAll('questions', 'select=state,category,language');
  console.log(`Total: ${rows.length} questions\n`);

  // Build bucket map
  const buckets = new Map();
  const states = new Set();
  const categories = new Set();
  const languages = new Set();
  for (const r of rows) {
    const key = `${r.state}|${r.category}|${r.language}`;
    buckets.set(key, (buckets.get(key) || 0) + 1);
    states.add(r.state);
    categories.add(r.category);
    languages.add(r.language);
  }

  const langs = [...languages].sort();
  const cats = [...categories].sort();
  const sts = [...states].sort();

  console.log('States observed:', sts.length);
  console.log('Categories:', cats);
  console.log('Languages:', langs);
  console.log('');

  // Grand totals
  const byLang = {};
  const byCat = {};
  for (const [key, n] of buckets) {
    const [, cat, lang] = key.split('|');
    byLang[lang] = (byLang[lang] || 0) + n;
    byCat[cat] = (byCat[cat] || 0) + n;
  }
  console.log('── By language ──────────────');
  for (const l of langs) console.log(`  ${l.padEnd(6)} ${String(byLang[l] || 0).padStart(7)}`);
  console.log('\n── By category ──────────────');
  for (const c of cats) console.log(`  ${c.padEnd(12)} ${String(byCat[c] || 0).padStart(7)}`);
  console.log('');

  // Matrix: state × category, shown as cells across langs
  // First find states that have NO questions at all
  const allCombos = sts.length * cats.length * langs.length;
  const filled = buckets.size;
  console.log(`Combinations filled: ${filled}/${allCombos} (${(filled/allCombos*100).toFixed(1)}%)\n`);

  // Count per (state, category) across ALL langs
  console.log('── States × categories (sum across langs) ──');
  const stateCatTotals = {};
  for (const s of sts) {
    stateCatTotals[s] = {};
    for (const c of cats) stateCatTotals[s][c] = 0;
  }
  for (const [key, n] of buckets) {
    const [s, c] = key.split('|');
    stateCatTotals[s][c] += n;
  }
  const header = '  ' + 'state'.padEnd(22) + cats.map(c => c.padStart(10)).join('');
  console.log(header);
  for (const s of sts) {
    const row = '  ' + s.padEnd(22) + cats.map(c => {
      const v = stateCatTotals[s][c];
      return String(v || '-').padStart(10);
    }).join('');
    console.log(row);
  }

  // Empty cells (state × category with 0 questions)
  console.log('\n── Gaps: state × category with 0 questions ──');
  const gaps = [];
  for (const s of sts) for (const c of cats) if (stateCatTotals[s][c] === 0) gaps.push(`${s}/${c}`);
  if (gaps.length === 0) console.log('  none');
  else gaps.forEach(g => console.log('  ' + g));

  // Missing language translations
  console.log('\n── Gaps: state × category without all 5 languages ──');
  const partialTrans = [];
  for (const s of sts) for (const c of cats) {
    if (stateCatTotals[s][c] === 0) continue;
    const missing = langs.filter(l => (buckets.get(`${s}|${c}|${l}`) || 0) === 0);
    if (missing.length > 0) partialTrans.push(`${s}/${c}  missing: ${missing.join(',')}`);
  }
  if (partialTrans.length === 0) console.log('  none');
  else {
    console.log(`  ${partialTrans.length} combinations`);
    partialTrans.slice(0, 20).forEach(p => console.log('  ' + p));
    if (partialTrans.length > 20) console.log(`  ... +${partialTrans.length - 20} more`);
  }

  // Thin buckets: language count <= 10 (suspiciously low)
  console.log('\n── Thin buckets (≤10 questions in a state/cat/lang cell) ──');
  const thin = [];
  for (const [key, n] of buckets) {
    if (n <= 10) thin.push([key, n]);
  }
  thin.sort((a, b) => a[1] - b[1]);
  console.log(`  ${thin.length} buckets with ≤10 questions`);
  thin.slice(0, 15).forEach(([k, n]) => console.log(`  ${String(n).padStart(4)}  ${k}`));
}

main().catch(e => { console.error(e); process.exit(1); });
