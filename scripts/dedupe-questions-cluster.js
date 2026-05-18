#!/usr/bin/env node
/**
 * Dedupe questions in DB where (cluster_code, state, language) has multiple rows.
 * Keeps the "best" row per group, deletes the rest.
 *
 * Best-row criteria, in order:
 *   1. Has image_url filled (critical — losing image binding breaks visual questions)
 *   2. Has admin_note filled (manual curation should never be lost)
 *   3. Has manual_reference filled (our explanation source)
 *   4. Longer explanation (richer content)
 *   5. More recent created_at (likely newer translation pipeline)
 *   6. Tie-break by id (deterministic)
 *
 * Safety:
 *   --dry-run         show what would be deleted, no DB write
 *   --category=X      optional filter (cdl | car | motorcycle); default all
 *   --state=X         optional filter (e.g. texas, california); default all
 *   --max=N           cap deletes at N (good for first careful run)
 *   --rollback-file=X path for rollback file (default: .dedupe-rollback-{state}-{category}-{ts}.json)
 *
 * Rollback file contains full rows (select=*) before delete, written in
 * append-style after each batch. To restore: POST each row back to
 * /rest/v1/questions with Prefer: resolution=merge-duplicates.
 *
 * Usage:
 *   node scripts/dedupe-questions-cluster.js --dry-run
 *   node scripts/dedupe-questions-cluster.js --dry-run --state=texas
 *   node scripts/dedupe-questions-cluster.js --state=texas --category=car --max=50
 *   node scripts/dedupe-questions-cluster.js --category=cdl
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
const H = { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY };

const args = process.argv.slice(2);
const argVal = (k) => args.find(a => a.startsWith(`--${k}=`))?.split('=')[1];
const DRY = args.includes('--dry-run');
const CATEGORY = argVal('category') || null;
const STATE = argVal('state') || null;
const MAX_DELETES = parseInt(argVal('max') || '99999', 10);
const ROLLBACK_FILE = argVal('rollback-file')
  || `.dedupe-rollback-${STATE || 'all'}-${CATEGORY || 'all'}-${Date.now()}.json`;

function score(row) {
  // Higher = keep
  let s = 0;
  if (row.image_url) s += 200;        // critical: visual question binding
  if (row.admin_note) s += 150;       // manual curation, never lose
  if (row.manual_reference) s += 100; // explanation source
  s += Math.min((row.explanation || '').length, 500) / 10;
  s += new Date(row.created_at || 0).getTime() / 1e12;
  return s;
}

(async () => {
  console.log(`Mode: ${DRY ? 'DRY-RUN' : 'APPLY'}  state=${STATE || 'all'}  category=${CATEGORY || 'all'}  max=${MAX_DELETES}`);
  if (!DRY) console.log(`Rollback file: ${ROLLBACK_FILE}`);

  // Load all relevant rows via keyset pagination
  const groups = new Map(); // key=`${cluster}|${state}|${lang}` -> rows[]
  let lastId = '';
  let scanned = 0;
  while (true) {
    const params = new URLSearchParams({
      select: 'id,cluster_code,language,state,category,explanation,manual_reference,admin_note,image_url,created_at',
      cluster_code: 'not.is.null',
      order: 'id.asc',
      limit: '1000',
    });
    if (CATEGORY) params.set('category', 'eq.' + CATEGORY);
    if (STATE) params.set('state', 'eq.' + STATE);
    if (lastId) params.set('id', 'gt.' + lastId);
    const r = await fetch(SUPA_URL + '/rest/v1/questions?' + params, { headers: H });
    if (!r.ok) { console.error('fetch ' + r.status); break; }
    const batch = await r.json();
    if (batch.length === 0) break;
    for (const row of batch) {
      const key = row.cluster_code + '|' + row.state + '|' + row.language;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }
    lastId = batch[batch.length - 1].id;
    scanned += batch.length;
    process.stderr.write('  scanned ' + scanned + '\r');
    if (batch.length < 1000) break;
  }
  console.log(`\nScanned ${scanned} rows in ${groups.size} (cluster,state,lang) groups`);

  // Find groups with duplicates
  const deleteIds = [];
  const sampleDeletes = [];
  for (const [key, rows] of groups) {
    if (rows.length <= 1) continue;
    rows.sort((a, b) => score(b) - score(a));
    const keep = rows[0];
    for (let i = 1; i < rows.length; i++) {
      deleteIds.push(rows[i].id);
      if (sampleDeletes.length < 5) {
        sampleDeletes.push({
          key,
          keepId: keep.id,
          deleteId: rows[i].id,
          keepHasRef: !!keep.manual_reference,
          deleteHasRef: !!rows[i].manual_reference,
          keepExpLen: (keep.explanation || '').length,
          deleteExpLen: (rows[i].explanation || '').length,
        });
      }
    }
  }

  console.log(`\nFound ${deleteIds.length} duplicate rows to delete (excess copies in ${deleteIds.length > 0 ? deleteIds.length : 0} groups)`);

  console.log(`\nSample decisions:`);
  for (const s of sampleDeletes) {
    console.log(`  ${s.key}`);
    console.log(`    KEEP   ${s.keepId.slice(0, 8)}  manual_ref=${s.keepHasRef}  explen=${s.keepExpLen}`);
    console.log(`    DELETE ${s.deleteId.slice(0, 8)}  manual_ref=${s.deleteHasRef}  explen=${s.deleteExpLen}`);
  }

  const toDelete = deleteIds.slice(0, MAX_DELETES);
  console.log(`\n${DRY ? 'Would delete' : 'Deleting'} ${toDelete.length} rows`);

  if (DRY) {
    console.log(`(dry-run) re-run without --dry-run to apply`);
    return;
  }

  // Initialize rollback file as empty array
  fs.writeFileSync(ROLLBACK_FILE, '[]');
  const rollbackRows = [];

  // Delete in batches of 50 ids:
  //   1. Fetch full rows (select=*) for rollback
  //   2. Append to rollback file (fsync before delete = crash-safe)
  //   3. DELETE
  let deleted = 0;
  for (let i = 0; i < toDelete.length; i += 50) {
    const batch = toDelete.slice(i, i + 50);
    const idList = batch.map(id => '"' + id + '"').join(',');

    // 1. Fetch full rows for rollback
    const fetchRes = await fetch(SUPA_URL + '/rest/v1/questions?select=*&id=in.(' + idList + ')', { headers: H });
    if (!fetchRes.ok) {
      console.error(`rollback fetch ${i / 50} failed: ${fetchRes.status} ${await fetchRes.text()}`);
      break;
    }
    const fullRows = await fetchRes.json();
    if (fullRows.length !== batch.length) {
      console.error(`rollback mismatch: expected ${batch.length}, got ${fullRows.length}. Aborting.`);
      break;
    }
    rollbackRows.push(...fullRows);

    // 2. Persist rollback BEFORE delete (crash-safe)
    fs.writeFileSync(ROLLBACK_FILE, JSON.stringify(rollbackRows));

    // 3. DELETE
    const r = await fetch(SUPA_URL + '/rest/v1/questions?id=in.(' + idList + ')', {
      method: 'DELETE',
      headers: { ...H, Prefer: 'return=minimal' },
    });
    if (!r.ok) {
      console.error(`batch ${i / 50} failed: ${r.status} ${await r.text()}`);
      break;
    }
    deleted += batch.length;
    process.stderr.write('  deleted ' + deleted + '/' + toDelete.length + '\r');
  }
  console.log(`\nDeleted ${deleted}/${toDelete.length}`);
  console.log(`Rollback saved to ${ROLLBACK_FILE} (${rollbackRows.length} rows)`);
  console.log(`To restore: POST each row to /rest/v1/questions with Prefer: resolution=merge-duplicates`);
})();
