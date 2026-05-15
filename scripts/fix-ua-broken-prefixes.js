#!/usr/bin/env node
/**
 * Recovery for UA rows where fix-ai-patterns-in-db left a verb-tail fragment
 * at the start (e.g. "є, що X" or "ється, що X"). Caused by my regex using
 * [а-я]* which doesn't include Ukrainian-specific letters (є/і/ї/ґ).
 *
 * Removes the broken prefix, capitalizes whatever comes next.
 *
 * Usage:
 *   node scripts/fix-ua-broken-prefixes.js --dry-run
 *   node scripts/fix-ua-broken-prefixes.js
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
const H = { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY, 'Content-Type': 'application/json' };
const DRY = process.argv.includes('--dry-run');

const COLS = ['question_text', 'option_a', 'option_b', 'option_c', 'option_d', 'explanation'];

// Patterns covering the broken verb tails left by the bad rule.
// Match at start of string OR start of sentence (after .!?).
// Examples: "є, що X" -> "X", "ється, що X" -> "X"
const BROKEN_RE = /(^|[.!?]\s+)(є|ється|ить|ують|уютьcя|ажуть|має|вказує|зазначає|стверджує|описує)(?:[а-яіїєґА-ЯІЇЄҐ]*)?,\s*(?:що\s+)?/g;

function fix(s) {
  if (!s) return s;
  let out = s.replace(BROKEN_RE, '$1');
  // Capitalize first letter if missing
  if (out && /^[а-яіїєґa-z]/.test(out)) out = out[0].toUpperCase() + out.slice(1);
  // Clean double spaces
  out = out.replace(/\s+/g, ' ').trim();
  return out;
}

async function fetchPage(lastId) {
  const params = new URLSearchParams({
    select: ['id', ...COLS].join(','),
    order: 'id.asc',
    limit: '500',
    language: 'eq.ua',
  });
  if (lastId) params.set('id', `gt.${lastId}`);
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(`${SUPA_URL}/rest/v1/questions?${params}`, { headers: H });
    if (res.ok) return res.json();
    if (res.status === 500 && attempt === 0) { await new Promise(r => setTimeout(r, 1000)); continue; }
    throw new Error(`${res.status}: ${await res.text()}`);
  }
}

async function patch(id, body) {
  const res = await fetch(`${SUPA_URL}/rest/v1/questions?id=eq.${id}`, {
    method: 'PATCH', headers: H,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`patch ${id}: ${res.status} ${await res.text()}`);
}

(async () => {
  console.log(`Mode: ${DRY ? 'DRY-RUN' : 'APPLY'}`);
  const fixes = [];
  let lastId = '', scanned = 0;
  while (true) {
    const batch = await fetchPage(lastId);
    if (batch.length === 0) break;
    scanned += batch.length;
    for (const row of batch) {
      const changes = {};
      for (const c of COLS) {
        const before = row[c];
        if (!before) continue;
        const after = fix(before);
        if (after !== before) changes[c] = { before, after };
      }
      if (Object.keys(changes).length > 0) {
        fixes.push({ id: row.id, changes });
      }
    }
    lastId = batch[batch.length - 1].id;
    process.stderr.write(`  scanned ${scanned}, fixes ${fixes.length}\r`);
    if (batch.length < 500) break;
  }
  console.log(`\nScanned ${scanned}, found ${fixes.length} to fix`);

  console.log(`\n=== Sample diffs ===`);
  for (const f of fixes.slice(0, 8)) {
    console.log(`\nid=${f.id}`);
    for (const [col, { before, after }] of Object.entries(f.changes)) {
      console.log(`  ${col}:`);
      console.log(`    OLD: ${before.slice(0, 200)}`);
      console.log(`    NEW: ${after.slice(0, 200)}`);
    }
  }

  if (DRY) { console.log(`\n(dry-run) re-run without --dry-run to apply`); return; }

  let done = 0;
  let i = 0;
  const CONC = 5;
  async function worker() {
    while (i < fixes.length) {
      const f = fixes[i++];
      const body = {};
      for (const [col, { after }] of Object.entries(f.changes)) body[col] = after;
      try {
        await patch(f.id, body);
        done++;
        if (done % 100 === 0) process.stderr.write(`  applied ${done}/${fixes.length}\r`);
      } catch (e) {
        console.error(`fail ${f.id}: ${e.message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONC }, () => worker()));
  console.log(`\nApplied ${done}/${fixes.length}`);
})();
