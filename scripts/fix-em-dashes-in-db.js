#!/usr/bin/env node
/**
 * Bulk replace em-dashes (-) with regular hyphens in all DB question text.
 * Safe automatic fix - em-dashes are never intentionally used per project style.
 *
 * Affects columns: question_text, option_a, option_b, option_c, option_d, explanation
 * Across all languages (en/ru/ua/es/zh).
 *
 * Usage:
 *   node scripts/fix-em-dashes-in-db.js --dry-run     # preview count, no writes
 *   node scripts/fix-em-dashes-in-db.js               # actually apply
 *   node scripts/fix-em-dashes-in-db.js --lang=ru     # one language only
 */

'use strict';

const fs = require('fs');

try {
  const txt = fs.readFileSync('.env.local', 'utf8');
  for (const line of txt.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch (_) {}

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPA_KEY) { console.error('Missing SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }

const args = process.argv.slice(2);
const argVal = (k) => args.find(a => a.startsWith(`--${k}=`))?.split('=')[1];
const DRY = args.includes('--dry-run');
const LANG = argVal('lang');
const CONCURRENCY = parseInt(argVal('concurrency') || '5', 10);

const H = { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json' };

const COLS = ['question_text', 'option_a', 'option_b', 'option_c', 'option_d', 'explanation'];

function fix(s) {
  if (!s) return s;
  // " - " (em-dash with spaces) -> " - " (hyphen with spaces)
  // "-" (em-dash standalone) -> "-" (hyphen)
  return s.replace(/ — /g, ' - ').replace(/—/g, '-');
}

async function fetchPage(from, lang) {
  const params = new URLSearchParams({
    select: ['id', ...COLS].join(','),
    order: 'id',
  });
  if (lang) params.set('language', `eq.${lang}`);
  const res = await fetch(`${SUPA_URL}/rest/v1/questions?${params}`, {
    headers: { ...H, Range: `${from}-${from + 999}` },
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

function hasEmDash(row) {
  for (const c of COLS) if (row[c] && row[c].includes('—')) return true;
  return false;
}

async function patch(id, patch) {
  const res = await fetch(`${SUPA_URL}/rest/v1/questions?id=eq.${id}`, {
    method: 'PATCH', headers: H,
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`patch ${id} ${res.status}: ${await res.text()}`);
}

(async () => {
  console.log(`Mode: ${DRY ? 'DRY-RUN (no writes)' : 'APPLY (will write)'}`);
  if (LANG) console.log(`Lang filter: ${LANG}`);

  const rows = [];
  let from = 0;
  let scanned = 0;
  while (true) {
    const batch = await fetchPage(from, LANG);
    scanned += batch.length;
    for (const r of batch) if (hasEmDash(r)) rows.push(r);
    process.stderr.write(`  scanned ${scanned}, with em-dashes ${rows.length}\r`);
    if (batch.length < 1000) break;
    from += 1000;
  }
  console.log(`\nScanned ${scanned} rows, found ${rows.length} containing em-dashes`);

  if (rows.length === 0) { console.log('Nothing to do.'); return; }

  let fixed = 0;
  let totalChanges = 0;
  let i = 0;
  async function worker() {
    while (i < rows.length) {
      const row = rows[i++];
      const updates = {};
      let changes = 0;
      for (const col of COLS) {
        const before = row[col];
        const after = fix(before);
        if (before !== after) {
          updates[col] = after;
          changes += (before.match(/—/g) || []).length;
        }
      }
      if (Object.keys(updates).length === 0) continue;
      totalChanges += changes;
      if (!DRY) {
        try {
          await patch(row.id, updates);
          fixed++;
        } catch (e) {
          console.error(`  fail ${row.id}: ${e.message}`);
        }
      } else {
        fixed++;
      }
      if (fixed % 100 === 0) process.stderr.write(`  ${DRY ? 'would fix' : 'fixed'} ${fixed}/${rows.length}\r`);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  console.log(`\n${DRY ? 'Would fix' : 'Fixed'} ${fixed} rows (${totalChanges} em-dash chars total)`);
  if (DRY) console.log('Re-run without --dry-run to apply.');
})();
