// Regenerate lib/state-question-counts.js — a static per-state snapshot of the
// question-bank size, so the SEO state pages show a real, consistent per-state
// number without a live DB query on every render.
//
// Counts DISTINCT questions per state by filtering to a single language
// (English), so the 5 translated copies of each question do not 5x-inflate the
// total. Run after bulk question changes:
//   node scripts/count-state-questions.mjs
//
// Requires SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL (from .env.local).
import { readFileSync, writeFileSync } from 'node:fs';
import { STATE_META } from '../lib/manual-data.js';

function envVar(name) {
  const raw = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
  const m = raw.match(new RegExp(`^${name}=(.*)$`, 'm'));
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : '';
}

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || envVar('NEXT_PUBLIC_SUPABASE_URL');
const SKEY = process.env.SUPABASE_SERVICE_ROLE_KEY || envVar('SUPABASE_SERVICE_ROLE_KEY');
if (!SUPA_URL || !SKEY) { console.error('Missing Supabase env vars'); process.exit(1); }

const states = Object.keys(STATE_META);
const CATS = ['car', 'motorcycle', 'cdl'];

async function countWhere(filter) {
  const r = await fetch(`${SUPA_URL}/rest/v1/questions?${filter}&language=eq.en&select=id`, {
    headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}`, Prefer: 'count=exact', Range: '0-0' },
  });
  return parseInt((r.headers.get('content-range') || '').split('/')[1], 10) || 0;
}

const counts = {};
const catCounts = {};
for (const s of states) {
  counts[s] = await countWhere(`state=eq.${s}`);
  catCounts[s] = {};
  for (const c of CATS) catCounts[s][c] = await countWhere(`state=eq.${s}&category=eq.${c}`);
  process.stdout.write(`${s}:${counts[s]}(${CATS.map(c => catCounts[s][c]).join('/')}) `);
}
const total = Object.values(counts).reduce((a, b) => a + b, 0);

const entries = Object.entries(counts).sort((a, b) => a[0].localeCompare(b[0]));
let out = '// Per-state question-bank sizes (distinct questions, counted in one\n';
out += '// language so the 5 language copies do not inflate the number). Static\n';
out += '// snapshot so the SEO state pages read a real, consistent per-state count\n';
out += '// without a live DB query. Regenerate with scripts/count-state-questions.mjs.\n';
out += `// Generated total across 50 states: ${total}.\n\n`;
out += 'export const STATE_QUESTION_COUNTS = {\n';
for (const [k, v] of entries) out += `  ${JSON.stringify(k)}: ${v},\n`;
out += '};\n\n';
out += '// Same, split by DB category (car / motorcycle / cdl) — the per-pass\n';
out += '// surfaces (paywall, /upgrade terminal) sell ONE category, so their\n';
out += '// numbers must be the category bank, not the whole-state bank.\n';
out += 'export const STATE_CATEGORY_COUNTS = {\n';
for (const [k] of entries) {
  const c = catCounts[k];
  out += `  ${JSON.stringify(k)}: { car: ${c.car}, motorcycle: ${c.motorcycle}, cdl: ${c.cdl} },\n`;
}
out += '};\n\n';
out += '// Total distinct questions across all states (for the global "N+ bank" line).\n';
out += `export const TOTAL_QUESTIONS = ${total};\n\n`;
out += 'export function questionCountForState(slug) {\n';
out += '  return STATE_QUESTION_COUNTS[slug] || null;\n';
out += '}\n\n';
out += '// cat: DB category ("car" | "motorcycle" | "cdl").\n';
out += 'export function questionCountForStateCategory(slug, cat) {\n';
out += '  return STATE_CATEGORY_COUNTS[slug]?.[cat] || null;\n';
out += '}\n';
writeFileSync(new URL('../lib/state-question-counts.js', import.meta.url), out);
console.log(`\nwrote lib/state-question-counts.js — ${entries.length} states, total ${total}`);
