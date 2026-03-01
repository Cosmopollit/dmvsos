#!/usr/bin/env node
/**
 * Verify image-question relevance and remove mismatched images.
 * Uses Claude Haiku to check if the image actually helps answer the question.
 *
 * Usage:
 *   node scripts/verify-images.js --dry-run     # report only
 *   node scripts/verify-images.js               # remove mismatched images
 *
 * Requires: SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY
 */

const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://yaogndpgnewqffbjrsgz.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const DRY_RUN = process.argv.includes('--dry-run');
const LANG = process.argv.find(a => a.startsWith('--lang='))?.split('=')[1] || 'en';
const BATCH_SIZE = 15;
const CONCURRENCY = parseInt(process.argv.find(a => a.startsWith('--concurrency='))?.split('=')[1] || '5', 10);
const HAIKU_MODEL = 'claude-haiku-4-5-20251001';
const PROGRESS_FILE = path.join(__dirname, '..', `.verify-images-${LANG}-progress.json`);

if (!SERVICE_KEY) { console.error('Set SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
if (!ANTHROPIC_KEY) { console.error('Set ANTHROPIC_API_KEY'); process.exit(1); }

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Image descriptions for context
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
  'railroad-warning': 'Railroad advance warning',
  'railroad-crossbuck': 'Railroad crossbuck sign',
  'merge': 'Merge warning sign',
  'curve-right': 'Curve ahead sign',
  'winding-road': 'Winding road sign',
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
  'slow': 'SLOW warning sign',
  'bump': 'Speed bump warning sign',
  'dip': 'Dip warning sign',
  'double-curve': 'Double curve warning sign',
  'chevron': 'Yellow chevron curve direction sign',
  'no-parking': 'No parking sign',
  'no-trucks': 'No trucks sign',
  'weight-limit': 'Weight limit sign',
  'motorcycle': 'Motorcycle illustration',
  'motorcycle-helmet': 'Motorcycle helmet',
  'semi-truck': 'Semi-truck/commercial vehicle',
  'school-bus': 'Yellow school bus',
  'bicycle': 'Bicycle illustration',
  'bicycle-crossing': 'Bicycle crossing sign',
  'ambulance': 'Ambulance emergency vehicle',
  'fire-truck': 'Fire truck emergency vehicle',
  'police-car': 'Police car',
  'tow-truck': 'Tow truck',
  'seatbelt': 'Seatbelt fastened illustration',
  'airbag': 'Airbag deployment illustration',
  'car-crash': 'Car crash/accident scene',
  'hydroplaning': 'Car hydroplaning on wet road',
  'flat-tire': 'Flat tire illustration',
  'blind-spot': 'Vehicle blind spot diagram',
  'following-distance': 'Following distance between cars',
  'intersection': 'Road intersection diagram',
  'highway-road': 'Highway/freeway illustration',
  'crosswalk-diagram': 'Crosswalk diagram with pedestrian',
  'roundabout-diagram': 'Roundabout traffic flow diagram',
  'hand-signal-left': 'Left turn hand signal',
  'hand-signal-right': 'Right turn hand signal',
  'hand-signal-stop': 'Stop/slow hand signal',
  'no-texting': 'No texting while driving sign',
  'no-alcohol': 'No alcohol/DUI prohibition',
  'speedometer': 'Speedometer/speed gauge',
  'traffic-light': 'Traffic light (red/yellow/green)',
  'parking-meter': 'Parking meter',
  'pedestrian-signal': 'Walk/Don\'t Walk pedestrian signal',
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
// Supabase
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
// Progress
// ---------------------------------------------------------------------------

function loadProgress() {
  if (fs.existsSync(PROGRESS_FILE)) {
    try { return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8')); } catch {}
  }
  return { checked: {}, removed: 0, kept: 0 };
}

function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('\n==================================================');
  console.log('  Verifying image-question relevance');
  console.log('==================================================\n');

  console.log(`  Loading ${LANG.toUpperCase()} questions with images...`);
  const questions = await supabaseGetAll('questions',
    `language=eq.${LANG}&image_url=not.is.null&select=id,question_text,option_a,option_b,option_c,option_d,correct_answer,image_url&order=id`
  );
  console.log(`  Found: ${questions.length} questions with images`);

  const progress = loadProgress();
  const alreadyDone = new Set(Object.keys(progress.checked));
  const toProcess = questions.filter(q => !alreadyDone.has(q.id));
  console.log(`  Already checked: ${alreadyDone.size}, remaining: ${toProcess.length}`);
  if (toProcess.length === 0) {
    console.log('  Nothing to do!');
    return;
  }

  let processed = 0, removed = progress.removed, kept = progress.kept, errors = 0;

  // Build batches
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
    }).join('\n\n');

    const prompt = `You are verifying if images match DMV test questions. For each question, decide if the described image is RELEVANT and HELPFUL for understanding or answering the question.

KEEP the image if:
- The question is specifically ABOUT the sign/item shown (e.g., "What does a yield sign mean?" + yield sign image)
- The image directly illustrates the scenario described (e.g., "What to do at an intersection?" + intersection diagram)
- The image shows a vehicle type and the question is specifically about operating that vehicle type

REMOVE the image if:
- The image is only tangentially related (e.g., motorcycle image for "blood alcohol limit for motorcycles" - the question is about BAC, not about the motorcycle itself)
- The image is a generic illustration that doesn't help answer the question (e.g., traffic-light for "what to do at speed limit?" just because "speed limit" mentions approaching intersection)
- The image shows a vehicle but the question is about rules/laws, not about the vehicle itself
- The question mentions the item but is really about something else (e.g., "stopping distance" + stop sign = WRONG)

Output ONLY a JSON array:
[{"id": "<uuid>", "keep": true/false}]

Questions:
${qList}`;

    let batchRemoved = 0, batchKept = 0, batchErrors = 0;
    try {
      const response = await callClaude(prompt);
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        for (const r of parsed) {
          if (!r.id || r.keep === undefined) continue;
          progress.checked[r.id] = r.keep;
          if (!r.keep) {
            if (!DRY_RUN) {
              try {
                // Remove image from this EN question
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
      if (processed % (BATCH_SIZE * 10) < BATCH_SIZE * CONCURRENCY) {
        saveProgress(progress);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  console.log();
  saveProgress(progress);
  console.log(`\n  Done: ${kept} kept, ${removed} removed, ${errors} errors${DRY_RUN ? ' (dry run)' : ''}`);

  // Cleanup on success
  if (!DRY_RUN && errors === 0) {
    if (fs.existsSync(PROGRESS_FILE)) fs.unlinkSync(PROGRESS_FILE);
  }

  console.log(`\n==================================================`);
  console.log(`  DONE: ${kept} kept, ${removed} removed${DRY_RUN ? ' (dry run)' : ''}`);
  console.log(`==================================================`);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
