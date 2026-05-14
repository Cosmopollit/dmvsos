#!/usr/bin/env node
/**
 * Variant C resolution: when 2+ EN questions share the same (state, cluster_code,
 * subcategory) — different questions, same cluster code — split them into
 * unique cluster_codes and smart-match existing non-EN translations to the
 * correct EN parent via Sonnet.
 *
 * For each Variant C group:
 *   1. Keep the first EN's cluster_code unchanged
 *   2. Re-cluster siblings to new sequential codes in the same state+subcat namespace
 *   3. Pull all non-EN translations under the original cluster_code
 *   4. Ask Sonnet which EN each translation matches
 *   5. Update each translation's cluster_code to point at its matched EN
 *
 * Translations Sonnet cannot confidently match are left with the OLD code
 * (they become orphans; cleaned up in a later sweep).
 *
 * Resumable via .resolve-variant-c-progress.json.
 *
 * Usage:
 *   node scripts/resolve-variant-c.js --dry-run
 *   node scripts/resolve-variant-c.js --subcategory=air_brakes
 *   node scripts/resolve-variant-c.js --concurrency=3
 *   node scripts/resolve-variant-c.js --max-cost=20
 *
 * Requires: SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY
 */

'use strict';

const fs = require('fs');
const path = require('path');

// Load .env.local
try {
  const txt = fs.readFileSync('.env.local', 'utf8');
  for (const line of txt.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch (_) {}

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

const SUB_ARG       = process.argv.find(a => a.startsWith('--subcategory='))?.split('=')[1];
const CATEGORY      = process.argv.find(a => a.startsWith('--category='))?.split('=')[1] || 'cdl';
const CONCURRENCY   = parseInt(process.argv.find(a => a.startsWith('--concurrency='))?.split('=')[1] || '3', 10);
const MAX_COST      = parseFloat(process.argv.find(a => a.startsWith('--max-cost='))?.split('=')[1] || '25');
const DRY_RUN       = process.argv.includes('--dry-run');

if (!SERVICE_KEY)   { console.error('Missing SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
if (!ANTHROPIC_KEY) { console.error('Missing ANTHROPIC_API_KEY'); process.exit(1); }

const SONNET_MODEL = 'claude-sonnet-4-6';
const PROGRESS_FILE = path.join(
  __dirname, '..',
  `.resolve-variant-c${SUB_ARG ? '-' + SUB_ARG : ''}-progress.json`
);

// ─── helpers ───────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function sb(path, opts = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY, ...(opts.headers || {}) },
    ...opts,
  });
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${(await r.text()).slice(0,300)}`);
  return r.status === 204 ? null : r.json();
}

async function sbAll(table, query, fields, pageSize = 1000) {
  const all = []; let offset = 0;
  for (;;) {
    const rows = await sb(`${table}?select=${fields}&${query}&limit=${pageSize}&offset=${offset}`);
    all.push(...rows);
    if (rows.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}

async function sbPatch(table, filter, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
    method: 'PATCH',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: 'Bearer ' + SERVICE_KEY,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`PATCH ${table}: ${r.status} ${(await r.text()).slice(0,300)}`);
}

function loadProgress() {
  if (!fs.existsSync(PROGRESS_FILE)) return { done: {}, stats: { groups: 0, matched: 0, unmatched: 0, cost_est: 0 } };
  try { return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8')); }
  catch { return { done: {}, stats: { groups: 0, matched: 0, unmatched: 0, cost_est: 0 } }; }
}
function saveProgress(p) { fs.writeFileSync(PROGRESS_FILE, JSON.stringify(p, null, 2)); }

// ─── Sonnet caller ────────────────────────────────────────────────────────

const TOOL = {
  name: 'submit_matches',
  description: 'Submit translation-to-EN matches for a Variant C cluster group',
  input_schema: {
    type: 'object',
    properties: {
      matches: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            translation_id:    { type: 'string', description: 'The translation row id provided in the prompt' },
            matched_en_index:  { type: ['integer', 'null'], description: '1-based index of EN that this translation matches, or null if no confident match' },
            confidence:        { type: 'string', enum: ['high','medium','low'] },
          },
          required: ['translation_id', 'matched_en_index', 'confidence'],
        },
      },
    },
    required: ['matches'],
  },
};

async function callSonnet(prompt, maxTokens = 4096) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: SONNET_MODEL,
          max_tokens: maxTokens,
          tools: [TOOL],
          tool_choice: { type: 'tool', name: TOOL.name },
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      if (r.status === 429) { const wait = parseInt(r.headers.get('retry-after') || '20', 10); console.log(`  Rate limited, waiting ${wait}s`); await sleep(wait * 1000); continue; }
      if (r.status === 529) { console.log('  Overloaded, waiting 60s'); await sleep(60000); continue; }
      if (!r.ok) throw new Error(`${r.status}: ${(await r.text()).slice(0,200)}`);
      const data = await r.json();
      const tu = data.content?.find(b => b.type === 'tool_use');
      if (!tu) throw new Error('No tool_use in response');
      const inputTok  = data.usage?.input_tokens || 0;
      const outputTok = data.usage?.output_tokens || 0;
      const cost = inputTok / 1e6 * 3 + outputTok / 1e6 * 15;
      return { matches: tu.input.matches || [], cost };
    } catch (e) {
      if (attempt === 3) throw e;
      console.log(`  Retry ${attempt}/3: ${e.message.slice(0,150)}`);
      await sleep(2000 * attempt);
    }
  }
}

function buildPrompt(ens, translations) {
  const enLines = ens.map((e, i) => {
    return `[EN${i + 1}] (id=${e.id.slice(0,8)}, new_cluster_code=${e._new_cluster_code})
Q:  ${e.question_text}
A)  ${e.option_a}
B)  ${e.option_b}
C)  ${e.option_c}
D)  ${e.option_d}`;
  }).join('\n\n');

  const trLines = translations.map((t) => {
    return `[T id=${t.id}] (lang=${t.language})
Q:  ${t.question_text}
A)  ${t.option_a}
B)  ${t.option_b}
C)  ${t.option_c}
D)  ${t.option_d}`;
  }).join('\n\n');

  return `You are matching translated DMV/DOL test questions to their English originals.

The following ${ens.length} English questions accidentally share the same cluster code due to a clustering bug. They are DIFFERENT questions. Below them is a list of translations that all point to that same cluster code; each translation is a translation of exactly ONE of the English questions (or possibly none, if the translation is malformed/wrong).

ENGLISH ORIGINALS:

${enLines}

TRANSLATIONS TO MATCH:

${trLines}

For each translation, identify which English (by index 1, 2, etc.) it matches by content. Use confidence:
- "high" — clear semantic match (same topic, same options, same factual content)
- "medium" — likely match but some divergence (e.g., shortened or paraphrased)
- "low" — uncertain; you can still pick the closest one
- null index — translation matches NONE of the English (call it null)

Call submit_matches with one entry per translation.`;
}

// ─── main ──────────────────────────────────────────────────────────────────

(async () => {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Variant C resolution — ${CATEGORY}${SUB_ARG ? '/' + SUB_ARG : ' (all subcategories)'}${DRY_RUN ? ' [DRY RUN]' : ''}`);
  console.log(`Max cost: $${MAX_COST}, concurrency: ${CONCURRENCY}`);
  console.log(`${'='.repeat(60)}\n`);

  const progress = loadProgress();
  console.log(`Loaded progress: ${Object.keys(progress.done).length} groups already processed`);

  // 1. Pull all EN rows for the scope
  const subFilter = SUB_ARG
    ? `&subcategory=eq.${encodeURIComponent(SUB_ARG)}`
    : (CATEGORY === 'cdl' ? '' : ''); // for "all cdl", include all subs
  console.log(`Fetching EN clusters...`);
  const en = await sbAll('questions',
    `category=eq.${CATEGORY}&language=eq.en&cluster_code=not.is.null${subFilter}`,
    'id,state,subcategory,cluster_code,question_text,option_a,option_b,option_c,option_d');
  console.log(`  ${en.length} EN rows`);

  // 2. Find Variant C groups: (state, subcategory, cluster_code) with >1 EN
  const groups = new Map();
  for (const r of en) {
    const k = `${r.state}|${r.subcategory || ''}|${r.cluster_code}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  const variantC = [...groups.values()].filter(rs => rs.length > 1);
  console.log(`  Variant C groups (>1 EN sharing code): ${variantC.length}`);

  // 3. For each group, determine next free cluster_code suffix within its (state, subcat) namespace
  //    Format: {state}_{cat}_{sub_token}_{NNN}
  //    We need to find the max NNN currently used in that namespace.
  const SUB_TOKEN = { general_knowledge: 'gk', air_brakes: 'ab', combination_vehicles: 'cv' };
const STATE_ABBR = {
  'alabama':'al','alaska':'ak','arizona':'az','arkansas':'ar','california':'ca',
  'colorado':'co','connecticut':'ct','delaware':'de','florida':'fl','georgia':'ga',
  'hawaii':'hi','idaho':'id','illinois':'il','indiana':'in','iowa':'ia','kansas':'ks',
  'kentucky':'ky','louisiana':'la','maine':'me','maryland':'md','massachusetts':'ma',
  'michigan':'mi','minnesota':'mn','mississippi':'ms','missouri':'mo','montana':'mt',
  'nebraska':'ne','nevada':'nv','new-hampshire':'nh','new-jersey':'nj','new-mexico':'nm',
  'new-york':'ny','north-carolina':'nc','north-dakota':'nd','ohio':'oh','oklahoma':'ok',
  'oregon':'or','pennsylvania':'pa','rhode-island':'ri','south-carolina':'sc',
  'south-dakota':'sd','tennessee':'tn','texas':'tx','utah':'ut','vermont':'vt',
  'virginia':'va','washington':'wa','west-virginia':'wv','wisconsin':'wi','wyoming':'wy',
};

  // Build a map: (state, subcategory) -> Set of all numeric suffixes
  console.log('  Building per-(state,subcat) max suffix index...');
  const suffixMap = new Map();   // key -> Set<number>
  for (const r of en) {
    if (!r.cluster_code || !r.subcategory) continue;
    const k = `${r.state}|${r.subcategory}`;
    const match = r.cluster_code.match(/_(\d+)$/);
    if (!match) continue;
    const n = parseInt(match[1], 10);
    if (!suffixMap.has(k)) suffixMap.set(k, new Set());
    suffixMap.get(k).add(n);
  }
  // Convert to maxSeen helper
  function nextFreeCode(state, subcategory) {
    const k = `${state}|${subcategory}`;
    const used = suffixMap.get(k) || new Set();
    let n = used.size > 0 ? Math.max(...used) + 1 : 1;
    while (used.has(n)) n++;
    used.add(n);
    if (!suffixMap.has(k)) suffixMap.set(k, used);
    const tok = SUB_TOKEN[subcategory];
    const abbr = STATE_ABBR[state] || state;
    return `${abbr}_${CATEGORY}_${tok}_${String(n).padStart(3, '0')}`;
  }

  // 4. Plan all renames (for EN rows beyond the first in each group) and skip already-done groups
  const workItems = [];
  for (const group of variantC) {
    const [first, ...rest] = group;
    const key = `${first.state}|${first.subcategory}|${first.cluster_code}`;
    if (progress.done[key]) continue;
    // Assign new cluster_codes to siblings
    const ensWithCodes = [
      { ...first, _new_cluster_code: first.cluster_code }, // keep
      ...rest.map(r => ({ ...r, _new_cluster_code: nextFreeCode(first.state, first.subcategory) })),
    ];
    workItems.push({ key, state: first.state, subcategory: first.subcategory, cluster_code: first.cluster_code, ens: ensWithCodes });
  }
  console.log(`\nWork to do: ${workItems.length} groups`);

  // Estimate cost
  const estimatedCost = workItems.length * 0.012;
  console.log(`Estimated cost: ~$${estimatedCost.toFixed(2)} (Sonnet)`);

  if (DRY_RUN) {
    console.log('\n[DRY RUN] Sample of first 5 groups:');
    for (const w of workItems.slice(0, 5)) {
      console.log(`  ${w.state} ${w.cluster_code} (${w.subcategory})`);
      for (const e of w.ens) {
        console.log(`    EN${e.id.slice(0,8)} → ${e._new_cluster_code}`);
        console.log(`      "${(e.question_text||'').slice(0,80)}..."`);
      }
    }
    return;
  }

  // 5. Process
  let done = 0;
  const t0 = Date.now();

  async function processGroup(w) {
    // Cost cap check
    if (progress.stats.cost_est >= MAX_COST) {
      console.log(`\n  COST CAP $${MAX_COST} reached. Stopping.`);
      process.exit(0);
    }

    // Fetch all translations for this cluster_code (under the OLD code, in this state+subcat)
    const trs = await sbAll('questions',
      `category=eq.${CATEGORY}&language=neq.en&cluster_code=eq.${encodeURIComponent(w.cluster_code)}&state=eq.${encodeURIComponent(w.state)}&subcategory=eq.${encodeURIComponent(w.subcategory)}`,
      'id,language,question_text,option_a,option_b,option_c,option_d');

    let cost = 0;
    let matched = 0, unmatched = 0;

    // 5a. Rename siblings' cluster_codes (UPDATE EN rows)
    for (const e of w.ens) {
      if (e._new_cluster_code !== w.cluster_code) {
        await sbPatch('questions', `id=eq.${e.id}`, { cluster_code: e._new_cluster_code });
      }
    }

    // 5b. If no translations exist, we're done with this group
    if (trs.length === 0) {
      done++;
      progress.done[w.key] = { ts: Date.now(), translations: 0 };
      progress.stats.groups++;
      return;
    }

    // 5c. Ask Sonnet to match translations to ENs
    const prompt = buildPrompt(w.ens, trs);
    const { matches, cost: callCost } = await callSonnet(prompt);
    cost = callCost;
    progress.stats.cost_est += cost;

    // 5d. Apply assignments — update each translation's cluster_code
    for (const m of matches) {
      const tr = trs.find(t => t.id === m.translation_id);
      if (!tr) continue;
      if (m.matched_en_index == null) {
        unmatched++;
        continue;
      }
      const enIdx = m.matched_en_index - 1;
      if (enIdx < 0 || enIdx >= w.ens.length) { unmatched++; continue; }
      const targetCode = w.ens[enIdx]._new_cluster_code;
      if (targetCode !== w.cluster_code) {
        // Only update if assignment changes the code
        await sbPatch('questions', `id=eq.${tr.id}`, { cluster_code: targetCode });
      }
      matched++;
    }

    done++;
    progress.done[w.key] = { ts: Date.now(), translations: trs.length, matched, unmatched, cost };
    progress.stats.groups++;
    progress.stats.matched += matched;
    progress.stats.unmatched += unmatched;

    if (done % 5 === 0 || done === workItems.length) {
      saveProgress(progress);
      const elapsed = Math.round((Date.now() - t0) / 1000);
      const rate = (done / elapsed).toFixed(2);
      const eta = Math.round((workItems.length - done) / Math.max(parseFloat(rate), 0.01));
      console.log(`  ${done}/${workItems.length} · ${rate} groups/s · ETA ${Math.floor(eta/60)}m${eta%60}s · matched=${progress.stats.matched} unmatched=${progress.stats.unmatched} · ~$${progress.stats.cost_est.toFixed(2)}`);
    }
  }

  let idx = 0;
  async function worker() {
    while (idx < workItems.length) {
      const i = idx++;
      try { await processGroup(workItems[i]); }
      catch (e) { console.error(`  ERR ${workItems[i].cluster_code}: ${e.message.slice(0,200)}`); }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, workItems.length) }, worker));

  saveProgress(progress);
  console.log(`\n${'='.repeat(60)}`);
  console.log(`DONE in ${Math.round((Date.now() - t0) / 1000)}s`);
  console.log(`Groups processed: ${progress.stats.groups}`);
  console.log(`Translations matched: ${progress.stats.matched}`);
  console.log(`Translations unmatched: ${progress.stats.unmatched}`);
  console.log(`Estimated cost: ~$${progress.stats.cost_est.toFixed(2)}`);
})().catch(err => { console.error('FATAL:', err.message); process.exit(1); });
