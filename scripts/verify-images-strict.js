#!/usr/bin/env node
/**
 * Strict image verification for non-EN languages.
 * Removes image_url from questions where image doesn't clearly match.
 *
 * Two modes:
 *   --apply-existing   Apply decisions from existing progress files (no AI calls)
 *   (default)          Fresh AI verification with strict rules
 *
 * Usage:
 *   node scripts/verify-images-strict.js --lang=ru --dry-run
 *   node scripts/verify-images-strict.js --lang=ru
 *   node scripts/verify-images-strict.js --all-langs
 *   node scripts/verify-images-strict.js --all-langs --apply-existing
 *
 * Requires: SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY (for AI mode)
 */

const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://yaogndpgnewqffbjrsgz.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const DRY_RUN = process.argv.includes('--dry-run');
const APPLY_EXISTING = process.argv.includes('--apply-existing');
const ALL_LANGS = process.argv.includes('--all-langs');
const LANG_ARG = process.argv.find(a => a.startsWith('--lang='))?.split('=')[1];
const BATCH_SIZE = 12;
const CONCURRENCY = parseInt(process.argv.find(a => a.startsWith('--concurrency='))?.split('=')[1] || '5', 10);
const WRITE_BATCH = 50; // DB writes per batch
const HAIKU_MODEL = 'claude-haiku-4-5-20251001';

if (!SERVICE_KEY) { console.error('Set SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
if (!APPLY_EXISTING && !ANTHROPIC_KEY) { console.error('Set ANTHROPIC_API_KEY'); process.exit(1); }

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const IMAGE_DESCRIPTIONS = {
  'stop': 'Red octagonal STOP sign',
  'yield': 'Red/white triangular YIELD sign',
  'do-not-enter': 'Red DO NOT ENTER sign',
  'wrong-way': 'Red WRONG WAY sign',
  'no-u-turn': 'No U-turn sign',
  'no-left-turn': 'No left turn sign',
  'no-right-turn': 'No right turn sign',
  'no-passing': 'No passing zone sign',
  'one-way': 'One-way directional sign',
  'keep-right': 'Keep right sign',
  'speed-limit': 'Speed limit sign',
  'school-zone': 'Yellow school zone sign',
  'pedestrian-crossing': 'Pedestrian crossing warning',
  'railroad-warning': 'Railroad advance warning sign',
  'railroad-crossbuck': 'Railroad crossbuck sign',
  'merge': 'Merge warning sign',
  'curve-right': 'Curve ahead sign',
  'winding-road': 'Winding road sign',
  'sharp-turn': 'Sharp turn warning sign',
  'slippery': 'Slippery when wet sign',
  'divided-highway': 'Divided highway sign',
  'two-way-traffic': 'Two-way traffic sign',
  'hill': 'Steep hill warning sign',
  'deer-crossing': 'Deer crossing sign',
  'road-work': 'Orange road work/construction sign',
  'signal-ahead': 'Traffic signal ahead warning',
  'stop-ahead': 'Stop ahead warning',
  'traffic-light': 'Standard traffic light (red/yellow/green)',
  'crosswalk': 'Pedestrian crosswalk marking',
  'roundabout': 'Roundabout/traffic circle sign',
  'detour': 'Orange detour sign',
  'road-closed': 'Road closed sign',
  'low-clearance': 'Low clearance warning sign',
  'added-lane': 'Added lane sign',
  'narrow-bridge': 'Narrow bridge warning sign',
  'advisory-speed': 'Advisory speed sign',
  'bump': 'Speed bump warning sign',
  'dip': 'Dip warning sign',
  'double-curve': 'Double curve warning sign',
  'chevron': 'Yellow chevron curve direction sign',
  'no-parking': 'No parking sign',
  'no-trucks': 'No trucks sign',
  'weight-limit': 'Weight limit sign',
  'motorcycle': 'Motorcycle illustration',
  'motorcycle-helmet': 'Motorcycle helmet',
  'semi-truck': 'Semi-truck / large commercial vehicle',
  'school-bus': 'Yellow school bus',
  'bicycle': 'Bicycle illustration',
  'bicycle-crossing': 'Bicycle crossing sign',
  'ambulance': 'Ambulance emergency vehicle',
  'fire-truck': 'Fire truck emergency vehicle',
  'police-car': 'Police car',
  'tow-truck': 'Tow truck',
  'seatbelt': 'Seatbelt fastened illustration',
  'airbag': 'Airbag deployment illustration',
  'car-crash': 'Car crash / accident scene',
  'hydroplaning': 'Car hydroplaning on wet road',
  'flat-tire': 'Flat tire illustration',
  'blind-spot': 'Vehicle blind spot diagram',
  'following-distance': 'Following distance between cars',
  'intersection': 'Road intersection diagram',
  'highway-road': 'Highway / freeway illustration',
  'crosswalk-diagram': 'Crosswalk diagram with pedestrian',
  'roundabout-diagram': 'Roundabout traffic flow diagram',
  'hand-signal-left': 'Left turn hand signal',
  'hand-signal-right': 'Right turn hand signal',
  'hand-signal-stop': 'Stop / slow hand signal',
  'no-texting': 'No texting while driving sign',
  'no-alcohol': 'No alcohol / DUI prohibition',
  'speedometer': 'Speedometer / speed gauge',
  'parking-meter': 'Parking meter',
  'pedestrian-signal': 'Walk / Don\'t Walk pedestrian signal',
  'playground': 'Playground zone sign',
  'rest-area': 'Rest area sign',
  'hospital': 'Hospital sign (blue H)',
  'fire-station': 'Fire station sign',
  'interstate': 'Interstate highway shield sign',
  'route-marker': 'US/state route marker sign',
  'fog-light': 'Fog lights on vehicle',
  'rear-fog-light': 'Rear fog light',
  'low-beam': 'Low beam headlights',
  'lane-keeping': 'Lane keeping / staying in lane',
  'electric-car': 'Electric vehicle',
  'ev-charging': 'EV charging station sign',
  'cattle-crossing': 'Cattle crossing sign',
  'truck-crossing': 'Truck crossing sign',
  'dash-brake': 'Dashboard brake warning light',
  'dash-oil-pressure': 'Dashboard oil pressure warning',
  'dash-temperature': 'Dashboard temperature warning',
  'dash-battery': 'Dashboard battery warning light',
  'dash-check-engine': 'Dashboard check engine light',
  'dash-seatbelt': 'Dashboard seatbelt reminder light',
  'dash-abs': 'Dashboard ABS warning light',
  'dash-highbeam': 'Dashboard high beam indicator',
  'dash-tire-pressure': 'Dashboard tire pressure warning',
};

// ---------------------------------------------------------------------------
// Supabase helpers
// ---------------------------------------------------------------------------

async function supabaseGetAll(table, params = '') {
  const PAGE = 1000;
  let all = [], offset = 0;
  while (true) {
    const sep = params ? '&' : '';
    const url = `${SUPABASE_URL}/rest/v1/${table}?${params}${sep}offset=${offset}&limit=${PAGE}`;
    const res = await fetch(url, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    });
    if (!res.ok) throw new Error(`GET ${table}: ${res.status} ${await res.text()}`);
    const batch = await res.json();
    all = all.concat(batch);
    if (batch.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

async function supabasePatch(table, filter, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
    method: 'PATCH',
    headers: {
      apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json', Prefer: 'return=minimal',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PATCH ${table}: ${res.status} ${await res.text()}`);
}

// ---------------------------------------------------------------------------
// Claude API
// ---------------------------------------------------------------------------

async function callClaude(prompt) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: HAIKU_MODEL,
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (res.status === 429) {
    const wait = parseInt(res.headers.get('retry-after') || '30', 10);
    console.log(`\n  Rate limited, waiting ${wait}s...`);
    await sleep(wait * 1000);
    return callClaude(prompt);
  }
  if (res.status === 529) {
    console.log('\n  API overloaded, waiting 60s...');
    await sleep(60000);
    return callClaude(prompt);
  }
  if (!res.ok) throw new Error(`Claude ${res.status}: ${await res.text()}`);

  const data = await res.json();
  return data.content?.[0]?.text || '';
}

// ---------------------------------------------------------------------------
// Mode 1: Apply existing progress files (no AI)
// ---------------------------------------------------------------------------

async function applyExisting(lang) {
  const progressFile = path.join(__dirname, '..', `.verify-images-${lang === 'en' ? '' : lang + '-'}progress.json`);
  if (!fs.existsSync(progressFile)) {
    console.log(`  No progress file for ${lang.toUpperCase()}, skipping`);
    return;
  }

  const progress = JSON.parse(fs.readFileSync(progressFile, 'utf8'));
  const toRemove = Object.entries(progress.checked)
    .filter(([, keep]) => keep === false)
    .map(([id]) => id);

  console.log(`  ${lang.toUpperCase()}: ${toRemove.length} images to remove (from ${Object.keys(progress.checked).length} checked)`);

  if (DRY_RUN) {
    console.log(`  DRY RUN — no changes written`);
    return;
  }

  let done = 0, errors = 0;
  // Batch the writes
  for (let i = 0; i < toRemove.length; i += WRITE_BATCH) {
    const batch = toRemove.slice(i, i + WRITE_BATCH);
    const promises = batch.map(id =>
      supabasePatch('questions', `id=eq.${id}`, { image_url: null })
        .then(() => { done++; })
        .catch(e => { errors++; console.error(`  ERR ${id}: ${e.message}`); })
    );
    await Promise.all(promises);
    process.stdout.write(`\r  ${done}/${toRemove.length} removed (${errors} errors)`);
  }
  console.log(`\n  Done: ${done} removed, ${errors} errors`);
}

// ---------------------------------------------------------------------------
// Mode 2: Fresh strict AI verification
// ---------------------------------------------------------------------------

async function verifyStrict(lang) {
  const progressFile = path.join(__dirname, '..', `.verify-images-strict-${lang}-progress.json`);

  console.log(`\n  Loading ${lang.toUpperCase()} questions with images...`);
  const questions = await supabaseGetAll('questions',
    `language=eq.${lang}&image_url=not.is.null&select=id,question_text,option_a,option_b,option_c,option_d,correct_answer,image_url&order=id`
  );
  console.log(`  Found: ${questions.length} questions with images`);

  // Load progress
  let progress = { checked: {}, removed: 0, kept: 0 };
  if (fs.existsSync(progressFile)) {
    try { progress = JSON.parse(fs.readFileSync(progressFile, 'utf8')); } catch {}
  }

  const alreadyDone = new Set(Object.keys(progress.checked));
  const toProcess = questions.filter(q => !alreadyDone.has(q.id));
  console.log(`  Already checked: ${alreadyDone.size}, remaining: ${toProcess.length}`);

  if (toProcess.length === 0) {
    console.log('  Nothing to do!');
    return;
  }

  let processed = 0, removed = progress.removed, kept = progress.kept, errors = 0;

  const batches = [];
  for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
    batches.push(toProcess.slice(i, i + BATCH_SIZE));
  }
  console.log(`  Batches: ${batches.length}, concurrency: ${CONCURRENCY}\n`);

  async function processBatch(batch) {
    const LABELS = ['A', 'B', 'C', 'D'];
    const qList = batch.map(q => {
      const imgName = q.image_url.replace('/signs/', '').replace('.png', '');
      const imgDesc = IMAGE_DESCRIPTIONS[imgName] || imgName;
      const options = [q.option_a, q.option_b, q.option_c, q.option_d]
        .filter(Boolean).map((o, i) => `  ${LABELS[i]}. ${o}`).join('\n');
      return `ID: ${q.id}\nImage: ${imgDesc}\nQuestion: ${q.question_text}\n${options}\nCorrect: ${LABELS[q.correct_answer]}`;
    }).join('\n\n---\n\n');

    const prompt = `You are strictly verifying if images match DMV test questions in ${lang.toUpperCase()} language. The questions are NOT in English — read them carefully in their original language.

For each question, decide: does showing this image DIRECTLY help understand the question?

KEEP the image ONLY if ALL of these are true:
1. The question is DIRECTLY and PRIMARILY about the thing in the image
2. The image adds real visual value (not just decoration)
3. Without the image, the question would be harder to understand

Examples of KEEP:
- "What does this sign mean?" + the actual sign image → KEEP
- "What shape is a yield sign?" + yield sign → KEEP
- "What dashboard light means low oil?" + dash-oil-pressure → KEEP

REMOVE the image if ANY of these are true:
- The question mentions the topic but is really about rules/laws/penalties/fines/BAC/age limits
- The image is a generic thematic decoration (motorcycle image for "minimum age for motorcycle license")
- The question is about procedures, documents, or regulations
- The question could be perfectly understood without the image
- The image shows a vehicle type but the question is about general driving rules
- The connection between image and question is indirect or tangential
- You have ANY doubt — when in doubt, REMOVE

Examples of REMOVE:
- "What is the blood alcohol limit?" + no-alcohol image → REMOVE (about BAC number, not about the sign)
- "At what age can you ride a motorcycle?" + motorcycle image → REMOVE (about age, not about motorcycle)
- "What is the fine for running a red light?" + traffic-light image → REMOVE (about fine, not about the light)
- "When should you use headlights?" + low-beam image → REMOVE (about rules, not about the lights)
- "What should you do at a school zone?" + school-zone sign → KEEP (about the sign/zone itself)

BE STRICT. It is much better to remove a borderline image than to show a misleading one.

Output ONLY a JSON array:
[{"id":"<uuid>","keep":true},{"id":"<uuid>","keep":false}]

Questions:
${qList}`;

    let batchRemoved = 0, batchKept = 0, batchErrors = 0;
    try {
      const response = await callClaude(prompt);
      const jsonMatch = response.match(/\[[\s\S]*?\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        for (const r of parsed) {
          if (!r.id || r.keep === undefined) continue;
          progress.checked[r.id] = r.keep;
          if (!r.keep) {
            if (!DRY_RUN) {
              try {
                await supabasePatch('questions', `id=eq.${r.id}`, { image_url: null });
                batchRemoved++;
              } catch (e) {
                batchErrors++;
              }
            } else {
              batchRemoved++;
            }
          } else {
            batchKept++;
          }
        }
      }
    } catch (e) {
      console.error(`\n  ERR: ${e.message}`);
      batchErrors++;
    }
    return { count: batch.length, removed: batchRemoved, kept: batchKept, errors: batchErrors };
  }

  // Process with concurrency
  let idx = 0;
  async function worker() {
    while (idx < batches.length) {
      const batchIdx = idx++;
      const result = await processBatch(batches[batchIdx]);
      processed += result.count;
      removed += result.removed;
      kept += result.kept;
      errors += result.errors;
      progress.removed = removed;
      progress.kept = kept;
      process.stdout.write(`\r  ${processed}/${toProcess.length} | kept:${kept} removed:${removed} err:${errors}`);
      if (processed % (BATCH_SIZE * 5) < BATCH_SIZE * CONCURRENCY) {
        fs.writeFileSync(progressFile, JSON.stringify(progress));
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  console.log();
  fs.writeFileSync(progressFile, JSON.stringify(progress));

  const total = kept + removed;
  const keepPct = total > 0 ? ((kept / total) * 100).toFixed(1) : '0';
  console.log(`\n  DONE ${lang.toUpperCase()}: ${kept} kept (${keepPct}%), ${removed} removed, ${errors} errors${DRY_RUN ? ' (DRY RUN)' : ''}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const langs = ALL_LANGS ? ['ru', 'es', 'zh', 'ua'] : (LANG_ARG ? [LANG_ARG] : []);

  if (langs.length === 0) {
    console.error('Usage: --lang=ru or --all-langs');
    process.exit(1);
  }

  console.log('\n==================================================');
  console.log(`  Image verification (strict) — ${APPLY_EXISTING ? 'APPLY EXISTING' : 'AI VERIFICATION'}`);
  console.log(`  Languages: ${langs.map(l => l.toUpperCase()).join(', ')}`);
  console.log(`  Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE (writes to DB)'}`);
  console.log('==================================================');

  for (const lang of langs) {
    console.log(`\n--- ${lang.toUpperCase()} ---`);
    if (APPLY_EXISTING) {
      await applyExisting(lang);
    } else {
      await verifyStrict(lang);
    }
  }

  console.log('\n==================================================');
  console.log('  ALL DONE');
  console.log('==================================================\n');
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
