#!/usr/bin/env node
/**
 * Copy manual_reference + manual_section from EN questions to RU siblings
 * (linked via cluster_code). RU has 0% manual_reference coverage; this
 * bridges that gap using existing EN data at $0 API cost.
 *
 * The text stays in English (since manuals for most states are English-only),
 * but at least Russian users now see "📖 From the manual" with a real quote.
 *
 * Usage:
 *   node scripts/copy-manual-ref-en-to-ru.js --dry-run
 *   node scripts/copy-manual-ref-en-to-ru.js
 *   node scripts/copy-manual-ref-en-to-ru.js --lang=ua  # extend to UA missing rows
 *   node scripts/copy-manual-ref-en-to-ru.js --lang=es
 *   node scripts/copy-manual-ref-en-to-ru.js --lang=zh
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
const H = { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json' };

const args = process.argv.slice(2);
const argVal = (k) => args.find(a => a.startsWith(`--${k}=`))?.split('=')[1];
const TARGET_LANG = argVal('lang') || 'ru';
const DRY = args.includes('--dry-run');

async function fetchPage(lang, lastId, withRefOnly = false) {
  const params = new URLSearchParams({
    select: 'id,cluster_code,manual_reference,manual_section',
    order: 'id.asc',
    limit: '500',
    language: `eq.${lang}`,
  });
  if (lastId) params.set('id', `gt.${lastId}`);
  if (!withRefOnly) {
    params.set('cluster_code', 'not.is.null');
    params.set('manual_reference', 'is.null');
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(`${SUPA_URL}/rest/v1/questions?${params}`, { headers: H });
    if (res.ok) return res.json();
    if (res.status === 500 && attempt === 0) { await new Promise(r => setTimeout(r, 1000)); continue; }
    throw new Error(`${res.status}: ${await res.text()}`);
  }
}

// Build a map of cluster_code -> { manual_reference, manual_section } from EN
async function buildEnIndex() {
  console.log('Loading EN manual_references into memory...');
  const map = new Map();
  let lastId = '';
  let scanned = 0;
  while (true) {
    const params = new URLSearchParams({
      select: 'id,cluster_code,manual_reference,manual_section',
      order: 'id.asc',
      limit: '500',
      language: 'eq.en',
      cluster_code: 'not.is.null',
      manual_reference: 'not.is.null',
    });
    if (lastId) params.set('id', `gt.${lastId}`);
    const res = await fetch(`${SUPA_URL}/rest/v1/questions?${params}`, { headers: H });
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
    const batch = await res.json();
    if (batch.length === 0) break;
    for (const r of batch) {
      if (r.cluster_code && r.manual_reference) {
        map.set(r.cluster_code, {
          manual_reference: r.manual_reference,
          manual_section: r.manual_section,
        });
      }
    }
    lastId = batch[batch.length - 1].id;
    scanned += batch.length;
    process.stderr.write(`  EN loaded ${scanned}, unique clusters ${map.size}\r`);
    if (batch.length < 500) break;
  }
  console.log(`\n  EN index built: ${map.size} unique clusters with manual_reference`);
  return map;
}

async function patch(id, body) {
  const res = await fetch(`${SUPA_URL}/rest/v1/questions?id=eq.${id}`, {
    method: 'PATCH', headers: H,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`patch ${id}: ${res.status} ${await res.text()}`);
}

(async () => {
  console.log(`Mode: ${DRY ? 'DRY-RUN' : 'APPLY'}  target=${TARGET_LANG}`);

  // Step 1: build EN index
  const enIndex = await buildEnIndex();

  // Step 2: scan target lang for rows missing manual_reference
  console.log(`\nScanning ${TARGET_LANG} rows missing manual_reference...`);
  const candidates = [];
  let lastId = '', scanned = 0, noClusterMatch = 0;
  while (true) {
    const batch = await fetchPage(TARGET_LANG, lastId);
    if (batch.length === 0) break;
    scanned += batch.length;
    for (const row of batch) {
      const en = enIndex.get(row.cluster_code);
      if (en) {
        candidates.push({ id: row.id, ...en });
      } else {
        noClusterMatch++;
      }
    }
    lastId = batch[batch.length - 1].id;
    process.stderr.write(`  scanned ${scanned}, matched ${candidates.length}, no-EN-match ${noClusterMatch}\r`);
    if (batch.length < 500) break;
  }
  console.log(`\n  ${TARGET_LANG} scanned: ${scanned}`);
  console.log(`  Can fill from EN: ${candidates.length} (${(candidates.length / scanned * 100).toFixed(1)}%)`);
  console.log(`  No EN sibling with ref: ${noClusterMatch}`);

  // Show samples
  console.log(`\n=== Sample (first 3) ===`);
  for (const c of candidates.slice(0, 3)) {
    console.log(`id=${c.id}`);
    console.log(`  section: ${c.manual_section || '(none)'}`);
    console.log(`  ref: ${(c.manual_reference || '').slice(0, 150)}`);
  }

  if (DRY) {
    console.log(`\n(dry-run) Re-run without --dry-run to apply ${candidates.length} updates`);
    return;
  }

  console.log(`\nApplying ${candidates.length} updates...`);
  let done = 0, i = 0;
  const CONC = 5;
  async function worker() {
    while (i < candidates.length) {
      const c = candidates[i++];
      try {
        await patch(c.id, {
          manual_reference: c.manual_reference,
          manual_section: c.manual_section,
        });
        done++;
        if (done % 200 === 0) process.stderr.write(`  ${done}/${candidates.length}\r`);
      } catch (e) {
        console.error(`fail ${c.id}: ${e.message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONC }, () => worker()));
  console.log(`\nApplied ${done}/${candidates.length}`);
})();
