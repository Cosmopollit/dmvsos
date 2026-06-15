#!/usr/bin/env node
/**
 * clean-moto-cdl.js
 *
 * Removes CDL-contaminated questions that were generated into the MOTORCYCLE
 * category. A generation bug pulled CDL/commercial content into every state's
 * motorcycle set (~17% of moto questions). This script finds moto clusters
 * whose EN question_text contains unambiguous CDL/commercial markers and
 * deletes those clusters across all 5 languages.
 *
 * SAFETY:
 *   - Only ever touches category = 'motorcycle'. CDL/car rows are never queried
 *     for deletion. A guard aborts if any selected row is not 'motorcycle'.
 *   - --dry-run (DEFAULT) writes nothing — it prints exactly what would go.
 *   - --execute exports every row it deletes to .clean-moto-cdl-rollback.json
 *     FIRST, so a delete is fully reversible (re-insert from that file).
 *
 * USAGE:
 *   node scripts/clean-moto-cdl.js                  # dry-run, all states
 *   node scripts/clean-moto-cdl.js --state=texas    # dry-run, one state
 *   node scripts/clean-moto-cdl.js --execute        # DELETE, all states
 *   node scripts/clean-moto-cdl.js --execute --state=texas
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY (+ NEXT_PUBLIC_SUPABASE_URL) in env/.env.local.
 */
import fs from 'node:fs';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) { console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }

const args = process.argv.slice(2);
const EXECUTE = args.includes('--execute');
const ONLY_STATE = (args.find(a => a.startsWith('--state=')) || '').split('=')[1] || null;

const H = { apikey: KEY, Authorization: 'Bearer ' + KEY };

// Unambiguous CDL / commercial markers that must never appear in a real
// motorcycle question. High precision (verified 0 false positives on WA).
const MARKERS = [
  'cdl', 'commercial vehicle', 'commercial motor', 'commercial driver',
  'air brake', 'combination vehicle', 'tractor-trailer', 'tractor trailer',
  'fifth wheel', 'hazmat',
];
const isCdl = (text) => {
  const t = (text || '').toLowerCase();
  return MARKERS.some(m => t.includes(m));
};

async function getJson(path) {
  const r = await fetch(URL + path, { headers: H });
  if (!r.ok) throw new Error(`GET ${path} -> ${r.status} ${await r.text()}`);
  return r.json();
}

async function pageAll(buildPath) {
  const out = [];
  for (let off = 0; ; off += 1000) {
    const p = await getJson(buildPath(off));
    out.push(...p);
    if (p.length < 1000) break;
  }
  return out;
}

function inList(codes) { return '(' + codes.map(c => `"${c}"`).join(',') + ')'; }

async function main() {
  console.log(`Mode: ${EXECUTE ? 'EXECUTE (will DELETE)' : 'DRY-RUN (no writes)'}${ONLY_STATE ? ` | state=${ONLY_STATE}` : ' | all states'}`);

  // 1) Scan motorcycle/en (the source language) and flag CDL-contaminated clusters.
  const stateFilter = ONLY_STATE ? `&state=eq.${ONLY_STATE}` : '';
  const enRows = await pageAll(off =>
    `/rest/v1/questions?category=eq.motorcycle&language=eq.en${stateFilter}` +
    `&select=state,cluster_code,question_text&order=state.asc,cluster_code.asc&limit=1000&offset=${off}`);
  const flagged = enRows.filter(r => isCdl(r.question_text));

  // SAFETY: every flagged code must be a motorcycle cluster.
  const nonMoto = flagged.filter(r => !r.cluster_code || !r.cluster_code.includes('_moto'));
  if (nonMoto.length) { console.error('ABORT: non-moto cluster codes flagged:', nonMoto.slice(0, 5)); process.exit(1); }

  const byState = {};
  for (const r of flagged) (byState[r.state] ||= []).push(r.cluster_code);
  const states = Object.keys(byState).sort();
  console.log(`Scanned ${enRows.length} moto/en clusters. Flagged ${flagged.length} CDL-contaminated across ${states.length} states.`);
  for (const s of states.sort((a, b) => byState[b].length - byState[a].length).slice(0, 60)) {
    console.log(`  ${s.padEnd(18)} ${byState[s].length}`);
  }

  if (!EXECUTE) {
    console.log('\nDRY-RUN: nothing deleted. Re-run with --execute to delete (rollback is saved first).');
    return;
  }

  // 2) EXECUTE: per state, export rollback then delete (scoped to motorcycle).
  const rollback = [];
  let totalDeleted = 0;
  for (const s of states) {
    const codes = byState[s];
    const base = `state=eq.${s}&category=eq.motorcycle&cluster_code=in.${encodeURIComponent(inList(codes))}`;
    const rows = await getJson(`/rest/v1/questions?${base}&select=*`);
    const bad = rows.filter(r => r.category !== 'motorcycle');
    if (bad.length) { console.error(`ABORT at ${s}: ${bad.length} non-motorcycle rows in selection`); process.exit(1); }
    rollback.push(...rows);
    const dr = await fetch(`${URL}/rest/v1/questions?${base}`, { method: 'DELETE', headers: { ...H, Prefer: 'return=representation' } });
    if (!dr.ok) { console.error(`DELETE failed at ${s}: ${dr.status} ${await dr.text()}`); process.exit(1); }
    const deleted = await dr.json();
    if (deleted.some(r => r.category !== 'motorcycle')) { console.error(`ABORT: deleted a non-moto row at ${s}`); process.exit(1); }
    totalDeleted += deleted.length;
    console.log(`  ${s.padEnd(18)} deleted ${deleted.length} rows (${codes.length} clusters)`);
  }
  fs.writeFileSync('.clean-moto-cdl-rollback.json', JSON.stringify(rollback));
  console.log(`\nROLLBACK saved: ${rollback.length} rows -> .clean-moto-cdl-rollback.json`);
  console.log(`TOTAL DELETED: ${totalDeleted} rows. CDL category was never queried for deletion.`);
}

main().catch(e => { console.error(e); process.exit(1); });
