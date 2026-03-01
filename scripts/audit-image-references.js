#!/usr/bin/env node
/**
 * Audit questions that reference images (deictic: "this sign", "shown here")
 * but have image_url = NULL. These are broken — users see text about an image
 * that isn't displayed.
 *
 * Phases:
 *   1. Regex scan — find NULL-image questions with deictic references
 *   2. AI classification (Haiku) — NEEDS_IMAGE / OK_WITHOUT / ASSIGN:{slug}
 *   3. Fix — assign images or delete broken questions
 *   4. Report — per-language summary
 *
 * Usage:
 *   node scripts/audit-image-references.js --lang=en              # audit English
 *   node scripts/audit-image-references.js --all-langs             # audit all languages
 *   node scripts/audit-image-references.js --lang=en --dry-run     # report only
 *   node scripts/audit-image-references.js --lang=en --state=texas # one state only
 *
 * Requires: SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY
 */

const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://yaogndpgnewqffbjrsgz.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const DRY_RUN = process.argv.includes('--dry-run');
const ALL_LANGS = process.argv.includes('--all-langs');
const LANG_ARG = process.argv.find(a => a.startsWith('--lang='))?.split('=')[1];
const STATE_ARG = process.argv.find(a => a.startsWith('--state='))?.split('=')[1];
const BATCH_SIZE = 10;
const CONCURRENCY = parseInt(process.argv.find(a => a.startsWith('--concurrency='))?.split('=')[1] || '5', 10);
const HAIKU_MODEL = 'claude-haiku-4-5-20251001';

if (!SERVICE_KEY) { console.error('Set SUPABASE_SERVICE_ROLE_KEY env var'); process.exit(1); }
if (!ANTHROPIC_KEY) { console.error('Set ANTHROPIC_API_KEY env var'); process.exit(1); }
if (!ALL_LANGS && !LANG_ARG) {
  console.error('Specify --lang=en or --all-langs');
  process.exit(1);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ---------------------------------------------------------------------------
// Deictic reference patterns per language
// ---------------------------------------------------------------------------

const DEICTIC_PATTERNS = {
  en: [
    /\bthis\s+sign\b/i,
    /\bthe\s+sign\s+shown\b/i,
    /\bin\s+the\s+image\b/i,
    /\bshown\s+here\b/i,
    /\bshown\s+above\b/i,
    /\bshown\s+below\b/i,
    /\bthis\s+picture\b/i,
    /\bthe\s+picture\b/i,
    /\bthis\s+image\b/i,
    /\bthe\s+image\b/i,
    /\bthis\s+symbol\b/i,
    /\bthe\s+following\s+sign\b/i,
    /\bthis\s+road\s+sign\b/i,
    /\bthis\s+traffic\s+sign\b/i,
    /\bthis\s+warning\s+sign\b/i,
    /\bthis\s+regulatory\s+sign\b/i,
    /\bthis\s+dashboard\b/i,
    /\bthis\s+indicator\b/i,
    /\bthis\s+light\s+on\b/i,
    /\bthis\s+hand\s+signal\b/i,
  ],
  ru: [
    /\bэтот\s+знак\b/i,
    /\bэтого\s+знака\b/i,
    /\bданный\s+знак\b/i,
    /\bна\s+картинке\b/i,
    /\bна\s+изображении\b/i,
    /\bна\s+рисунке\b/i,
    /\bпоказанн\w+\s+знак\b/i,
    /\bизображённ\w+\s+знак\b/i,
    /\bчто\s+означает\s+эт\w+/i,
    /\bэтот\s+сигнал\b/i,
    /\bэтот\s+символ\b/i,
    /\bэта\s+разметка\b/i,
    /\bэтот\s+индикатор\b/i,
    /\bэтот\s+дорожный\s+знак\b/i,
  ],
  es: [
    /\besta\s+señal\b/i,
    /\bla\s+señal\s+mostrada\b/i,
    /\ben\s+la\s+imagen\b/i,
    /\bqué\s+significa\s+esta\b/i,
    /\bque\s+significa\s+esta\b/i,
    /\besta\s+imagen\b/i,
    /\bla\s+imagen\b/i,
    /\bmostrad[oa]\s+aquí\b/i,
    /\besta\s+señal\s+de\s+tránsito\b/i,
    /\beste\s+letrero\b/i,
    /\beste\s+símbolo\b/i,
    /\beste\s+indicador\b/i,
    /\besta\s+señal\s+vial\b/i,
  ],
  zh: [
    /这个标志/,
    /这个路标/,
    /该标志/,
    /图中/,
    /如图所示/,
    /下图/,
    /图片中/,
    /所示标志/,
    /该路标/,
    /这个信号/,
    /这个符号/,
    /这个指示/,
    /图示/,
    /这个标识/,
  ],
  ua: [
    /\bцей\s+знак\b/i,
    /\bцього\s+знак[уа]\b/i,
    /\bданий\s+знак\b/i,
    /\bна\s+картинці\b/i,
    /\bна\s+зображенні\b/i,
    /\bна\s+малюнку\b/i,
    /\bпоказан\w+\s+знак\b/i,
    /\bзображен\w+\s+знак\b/i,
    /\bщо\s+означає\s+ц\w+/i,
    /\bцей\s+сигнал\b/i,
    /\bцей\s+символ\b/i,
    /\bця\s+розмітка\b/i,
    /\bцей\s+індикатор\b/i,
    /\bцей\s+дорожній\s+знак\b/i,
  ],
};

// ---------------------------------------------------------------------------
// Image catalog (slug -> description) — for AI assignment
// ---------------------------------------------------------------------------

const IMAGE_CATALOG = {
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
  'slow': 'SLOW warning sign',
  'lane-ends': 'Lane ends warning sign',
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

const IMAGE_CATALOG_TEXT = Object.entries(IMAGE_CATALOG)
  .map(([slug, desc]) => `  ${slug}: ${desc}`)
  .join('\n');

// ---------------------------------------------------------------------------
// Supabase helpers
// ---------------------------------------------------------------------------

async function supabaseGet(table, params = '', { offset = 0, limit = 1000 } = {}) {
  const sep = params ? '&' : '';
  const url = `${SUPABASE_URL}/rest/v1/${table}?${params}${sep}offset=${offset}&limit=${limit}`;
  const res = await fetch(url, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!res.ok) throw new Error(`GET ${table}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function supabaseGetAll(table, params = '') {
  const PAGE = 1000;
  let all = [], offset = 0;
  while (true) {
    const batch = await supabaseGet(table, params, { offset, limit: PAGE });
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

async function supabaseDelete(table, filter) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
    method: 'DELETE',
    headers: {
      apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
      Prefer: 'return=minimal',
    },
  });
  if (!res.ok) throw new Error(`DELETE ${table}: ${res.status} ${await res.text()}`);
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
// Progress & rollback helpers
// ---------------------------------------------------------------------------

function getProgressFile(lang) {
  return path.join(__dirname, '..', `.audit-image-refs-${lang}-progress.json`);
}

function getReportFile(lang) {
  return path.join(__dirname, '..', `.audit-image-refs-${lang}-report.json`);
}

function getRollbackFile(lang) {
  return path.join(__dirname, '..', `.audit-image-refs-${lang}-rollback.json`);
}

function loadProgress(lang) {
  const file = getProgressFile(lang);
  if (fs.existsSync(file)) {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* ignore */ }
  }
  return { classified: {} };
}

function saveProgress(lang, progress) {
  fs.writeFileSync(getProgressFile(lang), JSON.stringify(progress, null, 2));
}

// ---------------------------------------------------------------------------
// Phase 1: Regex scan for deictic references
// ---------------------------------------------------------------------------

function hasDeictic(text, lang) {
  if (!text) return false;
  const patterns = DEICTIC_PATTERNS[lang] || DEICTIC_PATTERNS.en;
  return patterns.some(p => p.test(text));
}

function scanQuestion(q, lang) {
  const fields = [q.question_text, q.option_a, q.option_b, q.option_c, q.option_d];
  return fields.some(f => hasDeictic(f, lang));
}

// ---------------------------------------------------------------------------
// Phase 2: AI classification (Haiku)
// ---------------------------------------------------------------------------

const OPTION_LABELS = ['A', 'B', 'C', 'D'];

function buildClassifyPrompt(questions, lang) {
  const qList = questions.map(q => {
    const options = [q.option_a, q.option_b, q.option_c, q.option_d]
      .filter(Boolean)
      .map((o, i) => `  ${OPTION_LABELS[i]}. ${o}`)
      .join('\n');
    return `ID: ${q.id}
Question: ${q.question_text}
${options}
Correct: ${OPTION_LABELS[q.correct_answer]}`;
  }).join('\n\n---\n\n');

  const langName = { en: 'English', ru: 'Russian', es: 'Spanish', zh: 'Chinese', ua: 'Ukrainian' }[lang] || lang;

  return `You are auditing DMV test questions in ${langName}. These questions have NO image attached, but they were flagged because they contain references like "this sign", "shown here", "in the image", etc.

For each question, classify it as one of:

1. **OK_WITHOUT** — The question works fine without an image. The reference is generic or the question is self-contained. Examples:
   - "What does a stop sign mean?" — mentions a specific sign by name, no image needed
   - "When you see a yield sign, you should..." — describes the sign, no image needed
   - "This type of sign is usually..." — "this" refers to a type described in text, not a visual

2. **ASSIGN:{slug}** — The question needs an image AND you can confidently identify which one from the catalog below. The slug must exactly match one from the catalog. Example:
   - "What does this sign mean?" where context (options, correct answer) makes it clear it's about a stop sign → ASSIGN:stop

3. **NEEDS_IMAGE** — The question truly needs an image to be answerable, but you CANNOT determine which image from context alone. The question is broken without an image. These will be deleted.

IMPORTANT RULES:
- Be conservative with ASSIGN — only assign if you are VERY confident which specific image is needed based on the question text, answer options, and correct answer
- If the question names the sign/symbol explicitly (e.g., "What does the STOP sign mean?"), it's OK_WITHOUT — naming it replaces the image
- If options list specific signs and it's asking "which sign means X?", it's likely OK_WITHOUT
- "this sign" + options that each describe different signs = probably OK_WITHOUT (it's asking which description matches)
- "this sign" + options that describe meanings/actions = NEEDS_IMAGE or ASSIGN (it's asking what a shown sign means)

AVAILABLE IMAGES (slug: description):
${IMAGE_CATALOG_TEXT}

Output ONLY a JSON array:
[{"id":"<exact question ID>","verdict":"OK_WITHOUT"|"NEEDS_IMAGE"|"ASSIGN:slug","reason":"brief note"}]

Questions:
${qList}`;
}

async function phase2_classify(flagged, lang, progress) {
  console.log(`\n=== Phase 2: AI classification (${lang}) ===\n`);

  const results = { ...progress.classified };
  const processedIds = new Set(Object.keys(results));
  const toProcess = flagged.filter(q => !processedIds.has(String(q.id)));
  console.log(`  Total flagged: ${flagged.length}, already classified: ${processedIds.size}, remaining: ${toProcess.length}`);

  if (toProcess.length === 0) return results;

  // Build batches
  const allBatches = [];
  for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
    allBatches.push(toProcess.slice(i, i + BATCH_SIZE));
  }
  console.log(`  Concurrency: ${CONCURRENCY}, batches: ${allBatches.length}`);

  let processed = 0;
  let okCount = Object.values(results).filter(r => r.verdict === 'OK_WITHOUT').length;
  let needsCount = Object.values(results).filter(r => r.verdict === 'NEEDS_IMAGE').length;
  let assignCount = Object.values(results).filter(r => r.verdict?.startsWith('ASSIGN:')).length;

  async function processBatch(batch) {
    const batchResults = {};
    try {
      const prompt = buildClassifyPrompt(batch, lang);
      const response = await callClaude(prompt);
      const jsonMatch = response.match(/\[[\s\S]*\]/);

      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        for (const r of parsed) {
          if (!r.id || !r.verdict) continue;
          // Validate ASSIGN slugs
          if (r.verdict.startsWith('ASSIGN:')) {
            const slug = r.verdict.replace('ASSIGN:', '');
            if (!IMAGE_CATALOG[slug]) {
              // Invalid slug — treat as NEEDS_IMAGE
              r.verdict = 'NEEDS_IMAGE';
              r.reason = (r.reason || '') + ` (invalid slug: ${slug})`;
            }
          }
          batchResults[String(r.id)] = r;
        }
      }

      // Fill missing
      for (const q of batch) {
        if (!batchResults[String(q.id)]) {
          batchResults[String(q.id)] = {
            id: q.id, verdict: 'NEEDS_IMAGE', reason: 'No AI response for this question',
          };
        }
      }
    } catch (e) {
      for (const q of batch) {
        if (!batchResults[String(q.id)]) {
          batchResults[String(q.id)] = {
            id: q.id, verdict: 'NEEDS_IMAGE', reason: `Error: ${e.message}`,
          };
        }
      }
    }
    return batchResults;
  }

  let idx = 0;
  async function worker() {
    while (idx < allBatches.length) {
      const batchIdx = idx++;
      const batchResults = await processBatch(allBatches[batchIdx]);
      for (const [id, r] of Object.entries(batchResults)) {
        results[id] = r;
        if (r.verdict === 'OK_WITHOUT') okCount++;
        else if (r.verdict === 'NEEDS_IMAGE') needsCount++;
        else if (r.verdict?.startsWith('ASSIGN:')) assignCount++;
      }
      processed += allBatches[batchIdx].length;
      process.stdout.write(
        `\r  Classify [${lang}]: ${processed}/${toProcess.length} | ok:${okCount} needs:${needsCount} assign:${assignCount}`
      );
      if (processed % (BATCH_SIZE * 10) < BATCH_SIZE * CONCURRENCY) {
        progress.classified = results;
        saveProgress(lang, progress);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  console.log();
  progress.classified = results;
  saveProgress(lang, progress);

  return results;
}

// ---------------------------------------------------------------------------
// Phase 3: Fix — assign images or delete broken questions
// ---------------------------------------------------------------------------

async function phase3_fix(classifiedResults, flagged, lang) {
  console.log(`\n=== Phase 3: Apply fixes (${lang}) ===\n`);

  const assignments = [];
  const deletions = [];
  const okWithout = [];

  for (const [id, r] of Object.entries(classifiedResults)) {
    if (r.verdict === 'OK_WITHOUT') {
      okWithout.push({ id, reason: r.reason });
    } else if (r.verdict === 'NEEDS_IMAGE') {
      deletions.push({ id, reason: r.reason });
    } else if (r.verdict?.startsWith('ASSIGN:')) {
      const slug = r.verdict.replace('ASSIGN:', '');
      assignments.push({ id, slug, imageUrl: `/signs/${slug}.png`, reason: r.reason });
    }
  }

  console.log(`  OK without image: ${okWithout.length}`);
  console.log(`  Assign image: ${assignments.length}`);
  console.log(`  Delete (broken): ${deletions.length}`);

  if (assignments.length > 0) {
    console.log('\n  Image assignments:');
    for (const a of assignments.slice(0, 15)) {
      console.log(`    q${a.id}: -> ${a.slug} — ${a.reason}`);
    }
    if (assignments.length > 15) console.log(`    ... and ${assignments.length - 15} more`);
  }

  if (deletions.length > 0) {
    console.log('\n  Deletions (broken without image):');
    for (const d of deletions.slice(0, 15)) {
      console.log(`    q${d.id}: ${d.reason}`);
    }
    if (deletions.length > 15) console.log(`    ... and ${deletions.length - 15} more`);
  }

  // Build rollback data (full question data for deleted questions)
  const deletionIds = new Set(deletions.map(d => d.id));
  const rollbackQuestions = flagged.filter(q => deletionIds.has(String(q.id)));

  // Save report
  const report = {
    lang,
    timestamp: new Date().toISOString(),
    stats: {
      totalFlagged: Object.keys(classifiedResults).length,
      okWithout: okWithout.length,
      assigned: assignments.length,
      deleted: deletions.length,
    },
    assignments,
    deletions,
  };
  fs.writeFileSync(getReportFile(lang), JSON.stringify(report, null, 2));
  console.log(`\n  Report saved: ${getReportFile(lang)}`);

  if (DRY_RUN) {
    console.log('  [dry-run] Skipping DB writes');
    return { assigned: assignments.length, deleted: deletions.length };
  }

  // Save rollback (full question data for deletions)
  if (rollbackQuestions.length > 0) {
    fs.writeFileSync(getRollbackFile(lang), JSON.stringify(rollbackQuestions, null, 2));
    console.log(`  Rollback saved: ${getRollbackFile(lang)} (${rollbackQuestions.length} questions)`);
  }

  // Apply assignments
  let assignedCount = 0;
  for (const a of assignments) {
    try {
      await supabasePatch('questions', `id=eq.${a.id}`, { image_url: a.imageUrl });
      assignedCount++;
    } catch (e) {
      console.log(`\n  Error assigning q${a.id}: ${e.message}`);
    }
    if (assignedCount % 20 === 0 && assignedCount > 0) {
      process.stdout.write(`\r  Assignments: ${assignedCount}/${assignments.length}`);
    }
  }
  if (assignments.length > 0) console.log(`\r  Assignments written: ${assignedCount}/${assignments.length}`);

  // Apply deletions
  let deletedCount = 0;
  for (const d of deletions) {
    try {
      await supabaseDelete('questions', `id=eq.${d.id}`);
      deletedCount++;
    } catch (e) {
      console.log(`\n  Error deleting q${d.id}: ${e.message}`);
    }
    if (deletedCount % 20 === 0 && deletedCount > 0) {
      process.stdout.write(`\r  Deletions: ${deletedCount}/${deletions.length}`);
    }
  }
  if (deletions.length > 0) console.log(`\r  Deletions applied: ${deletedCount}/${deletions.length}`);

  return { assigned: assignedCount, deleted: deletedCount };
}

// ---------------------------------------------------------------------------
// Main per-language flow
// ---------------------------------------------------------------------------

async function processLanguage(lang) {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`  Auditing image references: ${lang.toUpperCase()}`);
  console.log(`  Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log(`${'='.repeat(50)}`);

  let progress = loadProgress(lang);

  // Phase 1: Load & scan
  console.log('\n=== Phase 1: Regex scan for deictic references ===\n');
  let filter = `language=eq.${lang}&image_url=is.null&select=id,state,category,question_text,option_a,option_b,option_c,option_d,correct_answer,explanation&order=id`;
  if (STATE_ARG) filter += `&state=eq.${STATE_ARG}`;

  const questions = await supabaseGetAll('questions', filter);
  console.log(`  Loaded: ${questions.length} questions with image_url=NULL`);

  if (questions.length === 0) {
    console.log('  Nothing to audit.');
    return { assigned: 0, deleted: 0 };
  }

  const flagged = questions.filter(q => scanQuestion(q, lang));
  console.log(`  Flagged with deictic references: ${flagged.length} (${(flagged.length / questions.length * 100).toFixed(1)}%)`);

  if (flagged.length === 0) {
    console.log('  No deictic references found. Done.');
    return { assigned: 0, deleted: 0 };
  }

  // Show samples
  console.log('\n  Sample flagged questions:');
  for (const q of flagged.slice(0, 5)) {
    const text = q.question_text.length > 80 ? q.question_text.substring(0, 80) + '...' : q.question_text;
    console.log(`    [${q.state}] ${text}`);
  }
  if (flagged.length > 5) console.log(`    ... and ${flagged.length - 5} more`);

  // Phase 2: AI classification
  const classifiedResults = await phase2_classify(flagged, lang, progress);

  // Phase 3: Fix
  const result = await phase3_fix(classifiedResults, flagged, lang);

  // Cleanup progress on success (not dry-run)
  if (!DRY_RUN) {
    const progressFile = getProgressFile(lang);
    if (fs.existsSync(progressFile)) fs.unlinkSync(progressFile);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const langs = ALL_LANGS ? ['en', 'ru', 'es', 'zh', 'ua'] : [LANG_ARG];

  const totals = { assigned: 0, deleted: 0 };
  for (const lang of langs) {
    const r = await processLanguage(lang);
    totals.assigned += (r?.assigned || 0);
    totals.deleted += (r?.deleted || 0);
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log('  FINAL SUMMARY');
  console.log(`${'='.repeat(50)}`);
  console.log(`  Languages: ${langs.join(', ')}`);
  console.log(`  Images assigned: ${totals.assigned}${DRY_RUN ? ' (dry run)' : ''}`);
  console.log(`  Questions deleted: ${totals.deleted}${DRY_RUN ? ' (dry run)' : ''}`);
  console.log(`${'='.repeat(50)}`);

  if (DRY_RUN) {
    console.log('\nRe-run without --dry-run to apply fixes.');
  }
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
