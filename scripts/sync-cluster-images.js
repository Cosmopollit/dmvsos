#!/usr/bin/env node
/**
 * Sync image_url from EN questions to all other language rows in the same cluster.
 *
 * For every EN question that has a cluster_code + image_url,
 * update all other language rows (ru/es/zh/ua) with the same
 * cluster_code+state+category to have the same image_url.
 * Also clears image_url on non-EN rows whose EN counterpart has no image.
 *
 * Usage:
 *   node scripts/sync-cluster-images.js --state=washington --category=car [--dry-run]
 *   node scripts/sync-cluster-images.js --all --category=car [--dry-run]
 *   node scripts/sync-cluster-images.js --all --category=motorcycle [--dry-run]
 *
 * Requires: SUPABASE_SERVICE_ROLE_KEY
 */

'use strict';

const SUPABASE_URL = 'https://yaogndpgnewqffbjrsgz.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY_RUN = process.argv.includes('--dry-run');
const ALL = process.argv.includes('--all');

const stateArg = process.argv.find(a => a.startsWith('--state='));
const catArg = process.argv.find(a => a.startsWith('--category='));
const STATE = stateArg ? stateArg.split('=')[1] : null;
const CATEGORY = catArg ? catArg.split('=')[1] : 'car';

if (!SERVICE_KEY) { console.error('Set SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
if (!ALL && !STATE) { console.error('Usage: --state=X or --all'); process.exit(1); }

// ---------------------------------------------------------------------------
// Supabase helpers
// ---------------------------------------------------------------------------

async function supabaseGetAll(params) {
  const PAGE = 1000;
  let all = [], offset = 0;
  while (true) {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/questions?${params}&limit=${PAGE}&offset=${offset}`,
      { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
    );
    if (!res.ok) throw new Error(`GET ${res.status}: ${await res.text()}`);
    const rows = await res.json();
    all.push(...rows);
    if (rows.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

async function supabasePatch(filter, updates) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/questions?${filter}`, {
    method: 'PATCH',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error(`PATCH ${res.status}: ${await res.text()}`);
}

// ---------------------------------------------------------------------------
// Sync one state
// ---------------------------------------------------------------------------

async function syncState(state) {
  // Fetch all EN clustered questions
  const enRows = await supabaseGetAll(
    `state=eq.${encodeURIComponent(state)}&category=eq.${CATEGORY}&language=eq.en&cluster_code=not.is.null&select=cluster_code,image_url`
  );

  if (enRows.length === 0) {
    console.log(`  ${state}: no EN clustered questions, skipping`);
    return { updated: 0, cleared: 0 };
  }

  let updated = 0, cleared = 0, errors = 0;

  for (const en of enRows) {
    const { cluster_code, image_url } = en;
    const filter = `cluster_code=eq.${encodeURIComponent(cluster_code)}&state=eq.${encodeURIComponent(state)}&category=eq.${CATEGORY}&language=neq.en`;

    try {
      if (DRY_RUN) {
        if (image_url) updated++;
        else cleared++;
        continue;
      }
      await supabasePatch(filter, { image_url: image_url ?? null });
      if (image_url) updated++;
      else cleared++;
    } catch (e) {
      console.error(`  Error on ${cluster_code}: ${e.message}`);
      errors++;
    }
  }

  return { updated, cleared, errors };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const STATES = [
  'alabama','alaska','arizona','arkansas','california','colorado','connecticut',
  'delaware','florida','georgia','hawaii','idaho','illinois','indiana','iowa',
  'kansas','kentucky','louisiana','maine','maryland','massachusetts','michigan',
  'minnesota','mississippi','missouri','montana','nebraska','nevada',
  'new-hampshire','new-jersey','new-mexico','new-york','north-carolina',
  'north-dakota','ohio','oklahoma','oregon','pennsylvania','rhode-island',
  'south-carolina','south-dakota','tennessee','texas','utah','vermont',
  'virginia','washington','west-virginia','wisconsin','wyoming',
];

async function main() {
  if (DRY_RUN) console.log('\n*** DRY RUN — no DB writes ***\n');
  console.log(`Category: ${CATEGORY}\n`);

  const targets = ALL ? STATES : [STATE];
  let totalUpdated = 0, totalCleared = 0;

  for (const state of targets) {
    process.stdout.write(`  ${state}... `);
    const { updated, cleared, errors } = await syncState(state);
    console.log(`${updated} clusters synced, ${cleared} cleared${errors ? `, ${errors} errors` : ''}`);
    totalUpdated += updated;
    totalCleared += cleared;
  }

  console.log(`\nDone! Synced: ${totalUpdated} clusters with images, cleared: ${totalCleared} without images`);
}

main().catch(e => { console.error(e); process.exit(1); });
