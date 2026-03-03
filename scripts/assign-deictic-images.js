#!/usr/bin/env node
/**
 * Assign images ONLY to deictic questions ("What does THIS sign mean?").
 *
 * Phases:
 *   0. (optional) Fix JPEG-as-PNG files (--fix-jpegs)
 *   1. Rollback + Clear — save current image_url values, then NULL all
 *   2. Regex scan — find questions with deictic references
 *   3. AI matching (Haiku) — classify deictic questions
 *   4. AI verification — verify ASSIGN results
 *   5. Write to DB — apply verified assignments
 *
 * Usage:
 *   node scripts/assign-deictic-images.js --lang=en              # one language
 *   node scripts/assign-deictic-images.js --all-langs             # all 5 languages
 *   node scripts/assign-deictic-images.js --lang=en --dry-run     # report only
 *   node scripts/assign-deictic-images.js --fix-jpegs             # fix JPEG files only
 *   node scripts/assign-deictic-images.js --lang=en --state=texas # one state
 *   node scripts/assign-deictic-images.js --concurrency=3         # custom concurrency
 *
 * Requires: SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SUPABASE_URL = 'https://yaogndpgnewqffbjrsgz.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const DRY_RUN = process.argv.includes('--dry-run');
const ALL_LANGS = process.argv.includes('--all-langs');
const FIX_JPEGS = process.argv.includes('--fix-jpegs');
const LANG_ARG = process.argv.find(a => a.startsWith('--lang='))?.split('=')[1];
const STATE_ARG = process.argv.find(a => a.startsWith('--state='))?.split('=')[1];
const BATCH_SIZE = 10;
const CONCURRENCY = parseInt(process.argv.find(a => a.startsWith('--concurrency='))?.split('=')[1] || '5', 10);
const HAIKU_MODEL = 'claude-haiku-4-5-20251001';
const LANGS = ['en', 'ru', 'es', 'zh', 'ua'];

if (!FIX_JPEGS) {
  if (!SERVICE_KEY) { console.error('Set SUPABASE_SERVICE_ROLE_KEY env var'); process.exit(1); }
  if (!ANTHROPIC_KEY) { console.error('Set ANTHROPIC_API_KEY env var'); process.exit(1); }
  if (!ALL_LANGS && !LANG_ARG) {
    console.error('Specify --lang=en or --all-langs');
    process.exit(1);
  }
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
// Image catalog (slug -> description)
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
  return path.join(__dirname, '..', `.assign-deictic-${lang}-progress.json`);
}

function getRollbackFile(lang) {
  return path.join(__dirname, '..', `.assign-deictic-${lang}-rollback.json`);
}

function getReportFile(lang) {
  return path.join(__dirname, '..', `.assign-deictic-${lang}-report.json`);
}

function loadProgress(lang) {
  const file = getProgressFile(lang);
  if (fs.existsSync(file)) {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* ignore */ }
  }
  return { phase: 0, classified: {}, verified: {} };
}

function saveProgress(lang, progress) {
  fs.writeFileSync(getProgressFile(lang), JSON.stringify(progress, null, 2));
}

// ---------------------------------------------------------------------------
// Phase 0: Fix JPEG-as-PNG files
// ---------------------------------------------------------------------------

function phase0_fixJpegs() {
  console.log('\n=== Phase 0: Fix JPEG-as-PNG files ===\n');

  const signsDir = path.join(__dirname, '..', 'public', 'signs');
  const files = ['hand-signal-left.png', 'hand-signal-right.png', 'hand-signal-stop.png'];

  for (const file of files) {
    const filePath = path.join(signsDir, file);
    if (!fs.existsSync(filePath)) {
      console.log(`  ${file}: not found, skipping`);
      continue;
    }

    // Check if it's actually JPEG by reading magic bytes
    const buf = Buffer.alloc(3);
    const fd = fs.openSync(filePath, 'r');
    fs.readSync(fd, buf, 0, 3, 0);
    fs.closeSync(fd);

    const isJpeg = buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF;
    if (!isJpeg) {
      console.log(`  ${file}: already PNG, skipping`);
      continue;
    }

    console.log(`  ${file}: JPEG detected, converting to PNG...`);
    if (DRY_RUN) {
      console.log(`    [dry-run] Would convert with sips`);
      continue;
    }

    try {
      execSync(`sips -s format png "${filePath}" --out "${filePath}"`, { stdio: 'pipe' });
      console.log(`    Converted successfully`);
    } catch (e) {
      console.error(`    Error converting: ${e.message}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Phase 1: Rollback + Clear
// ---------------------------------------------------------------------------

async function phase1_rollbackAndClear(lang) {
  console.log(`\n=== Phase 1: Rollback + Clear (${lang}) ===\n`);

  // Fetch all questions with non-null image_url for this language
  let filter = `language=eq.${lang}&image_url=not.is.null&select=id,image_url&order=id`;
  if (STATE_ARG) filter += `&state=eq.${STATE_ARG}`;

  const withImages = await supabaseGetAll('questions', filter);
  console.log(`  Questions with images: ${withImages.length}`);

  if (withImages.length === 0) {
    console.log('  Nothing to clear.');
    return;
  }

  // Save rollback
  const rollbackFile = getRollbackFile(lang);
  const rollbackData = withImages.map(q => ({ id: q.id, image_url: q.image_url }));
  fs.writeFileSync(rollbackFile, JSON.stringify(rollbackData, null, 2));
  console.log(`  Rollback saved: ${rollbackFile} (${rollbackData.length} entries)`);

  if (DRY_RUN) {
    console.log('  [dry-run] Would clear all image_url');
    return;
  }

  // Clear all image_url for this language
  let clearFilter = `language=eq.${lang}&image_url=not.is.null`;
  if (STATE_ARG) clearFilter += `&state=eq.${STATE_ARG}`;
  await supabasePatch('questions', clearFilter, { image_url: null });
  console.log(`  Cleared image_url for ${withImages.length} questions`);
}

// ---------------------------------------------------------------------------
// Phase 2: Find deictic questions (regex)
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

async function phase2_findDeictic(lang) {
  console.log(`\n=== Phase 2: Find deictic questions (${lang}) ===\n`);

  let filter = `language=eq.${lang}&select=id,state,category,question_text,option_a,option_b,option_c,option_d,correct_answer,explanation&order=id`;
  if (STATE_ARG) filter += `&state=eq.${STATE_ARG}`;

  const questions = await supabaseGetAll('questions', filter);
  console.log(`  Total questions: ${questions.length}`);

  const flagged = questions.filter(q => scanQuestion(q, lang));
  console.log(`  Deictic questions: ${flagged.length} (${(flagged.length / questions.length * 100).toFixed(1)}%)`);

  if (flagged.length > 0) {
    console.log('\n  Samples:');
    for (const q of flagged.slice(0, 5)) {
      const text = q.question_text.length > 80 ? q.question_text.substring(0, 80) + '...' : q.question_text;
      console.log(`    [${q.state}] ${text}`);
    }
    if (flagged.length > 5) console.log(`    ... and ${flagged.length - 5} more`);
  }

  return { questions, flagged };
}

// ---------------------------------------------------------------------------
// Phase 3: AI matching (Haiku)
// ---------------------------------------------------------------------------

const OPTION_LABELS = ['A', 'B', 'C', 'D'];

function buildMatchPrompt(questions, lang) {
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

  return `You are assigning images to DMV test questions in ${langName}. These questions were flagged because they contain deictic references like "this sign", "shown here", "in the image", etc. — language suggesting an image should accompany the question.

For each question, classify it as one of:

1. **ASSIGN:{slug}** — The question genuinely refers to a visual element (sign, dashboard light, hand signal, etc.) AND you can confidently identify which one from the catalog below. The slug must exactly match.

2. **NO_IMAGE** — The question works fine without an image. The deictic reference is:
   - Generic ("This type of sign is usually...")
   - The sign/item is named explicitly ("What does the STOP sign mean?") so no visual needed
   - Options list different signs and the question asks which one ("Which of these signs...") — text is sufficient
   - A false positive from regex matching

3. **NEEDS_IMAGE** — The question genuinely needs an image to be answerable, but you CANNOT determine which specific image from context alone. These will be logged for manual review.

CRITICAL RULES:
- Only ASSIGN when you are VERY confident which specific image matches based on question text, options, and correct answer
- If the question NAMES the sign explicitly (e.g., "What does the stop sign mean?"), it's NO_IMAGE
- If options each describe different signs/meanings and the question asks to pick one, it's NO_IMAGE
- "this sign" + options describing meanings/actions = likely ASSIGN or NEEDS_IMAGE (asking what a shown sign means)
- "this sign" + options listing different sign names = likely NO_IMAGE (text quiz about sign knowledge)
- Dashboard indicator questions ("this light on your dashboard") → ASSIGN if you can identify which dashboard light
- Hand signal questions ("this hand signal") → ASSIGN if clear which signal
- When in doubt, use NO_IMAGE. False negatives are far better than false positives.

AVAILABLE IMAGES (slug: description):
${IMAGE_CATALOG_TEXT}

Output ONLY a JSON array:
[{"id":"<exact question ID>","verdict":"ASSIGN:slug"|"NO_IMAGE"|"NEEDS_IMAGE","reason":"brief note"}]

Questions:
${qList}`;
}

async function phase3_aiMatch(flagged, lang, progress) {
  console.log(`\n=== Phase 3: AI matching (${lang}) ===\n`);

  const results = { ...progress.classified };
  const processedIds = new Set(Object.keys(results));
  const toProcess = flagged.filter(q => !processedIds.has(String(q.id)));
  console.log(`  Total deictic: ${flagged.length}, already classified: ${processedIds.size}, remaining: ${toProcess.length}`);

  if (toProcess.length === 0) return results;

  const allBatches = [];
  for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
    allBatches.push(toProcess.slice(i, i + BATCH_SIZE));
  }
  console.log(`  Concurrency: ${CONCURRENCY}, batches: ${allBatches.length}`);

  let processed = 0;
  let assignCount = Object.values(results).filter(r => r.verdict?.startsWith('ASSIGN:')).length;
  let noImageCount = Object.values(results).filter(r => r.verdict === 'NO_IMAGE').length;
  let needsCount = Object.values(results).filter(r => r.verdict === 'NEEDS_IMAGE').length;

  async function processBatch(batch) {
    const batchResults = {};
    try {
      const prompt = buildMatchPrompt(batch, lang);
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
              r.verdict = 'NO_IMAGE';
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
            id: q.id, verdict: 'NO_IMAGE', reason: 'No AI response for this question',
          };
        }
      }
    } catch (e) {
      for (const q of batch) {
        if (!batchResults[String(q.id)]) {
          batchResults[String(q.id)] = {
            id: q.id, verdict: 'NO_IMAGE', reason: `Error: ${e.message}`,
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
        if (r.verdict?.startsWith('ASSIGN:')) assignCount++;
        else if (r.verdict === 'NO_IMAGE') noImageCount++;
        else if (r.verdict === 'NEEDS_IMAGE') needsCount++;
      }
      processed += allBatches[batchIdx].length;
      process.stdout.write(
        `\r  Match [${lang}]: ${processed}/${toProcess.length} | assign:${assignCount} no_image:${noImageCount} needs:${needsCount}`
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
// Phase 4: AI verification
// ---------------------------------------------------------------------------

function buildVerifyPrompt(items, lang) {
  const langName = { en: 'English', ru: 'Russian', es: 'Spanish', zh: 'Chinese', ua: 'Ukrainian' }[lang] || lang;

  const list = items.map(it => {
    const imgDesc = IMAGE_CATALOG[it.slug] || it.slug;
    const options = [it.option_a, it.option_b, it.option_c, it.option_d]
      .filter(Boolean)
      .map((o, i) => `  ${OPTION_LABELS[i]}. ${o}`)
      .join('\n');
    return `ID: ${it.id}
Image: ${it.slug} (${imgDesc})
Question: ${it.question_text}
${options}
Correct: ${OPTION_LABELS[it.correct_answer]}
Match reason: ${it.reason}`;
  }).join('\n\n---\n\n');

  return `You are verifying image-to-question matches for DMV test questions in ${langName}. Each question below has been proposed to show a specific image.

For each, decide: **keep** or **reject**.

KEEP only if ALL of these are true:
1. The question is DIRECTLY about the thing in the image (sign, dashboard light, hand signal)
2. The image is the CORRECT one — it matches what the question is asking about
3. Without the image, the question would be harder or impossible to answer
4. The question has a deictic reference that genuinely points to a visual ("this sign", "shown here")

REJECT if ANY of these are true:
1. The WRONG image was assigned (e.g., stop sign image for a yield sign question)
2. The question names the item explicitly — image is redundant ("What does the stop sign mean?" doesn't need a stop sign image)
3. The question is really about rules/laws/penalties, not about identifying a visual
4. The deictic reference was a false positive
5. You have ANY doubt — when in doubt, REJECT

BE STRICT. It is far better to reject a correct match than to show a wrong image. False negatives (missing images) are invisible to users. False positives (wrong images) are confusing and embarrassing.

Output ONLY a JSON array:
[{"id":"<exact question ID>","verdict":"keep"|"reject","reason":"brief reason"}]

Questions with proposed images:
${list}`;
}

async function phase4_verify(classified, flagged, lang, progress) {
  console.log(`\n=== Phase 4: AI verification (${lang}) ===\n`);

  // Collect only ASSIGN results
  const assignments = [];
  const flaggedMap = {};
  for (const q of flagged) flaggedMap[String(q.id)] = q;

  for (const [id, r] of Object.entries(classified)) {
    if (!r.verdict?.startsWith('ASSIGN:')) continue;
    const q = flaggedMap[id];
    if (!q) continue;
    const slug = r.verdict.replace('ASSIGN:', '');
    assignments.push({
      id, slug, reason: r.reason || '',
      question_text: q.question_text,
      option_a: q.option_a, option_b: q.option_b,
      option_c: q.option_c, option_d: q.option_d,
      correct_answer: q.correct_answer,
    });
  }

  console.log(`  Assignments to verify: ${assignments.length}`);

  if (assignments.length === 0) {
    console.log('  Nothing to verify.');
    return {};
  }

  const verified = { ...progress.verified };
  const alreadyVerified = new Set(Object.keys(verified));
  const toVerify = assignments.filter(a => !alreadyVerified.has(a.id));
  console.log(`  Already verified: ${alreadyVerified.size}, remaining: ${toVerify.length}`);

  if (toVerify.length === 0) return verified;

  const allBatches = [];
  for (let i = 0; i < toVerify.length; i += BATCH_SIZE) {
    allBatches.push(toVerify.slice(i, i + BATCH_SIZE));
  }

  let processed = 0;
  let kept = Object.values(verified).filter(v => v.verdict === 'keep').length;
  let rejected = Object.values(verified).filter(v => v.verdict === 'reject').length;

  let idx = 0;
  async function worker() {
    while (idx < allBatches.length) {
      const batchIdx = idx++;
      const batch = allBatches[batchIdx];
      try {
        const prompt = buildVerifyPrompt(batch, lang);
        const response = await callClaude(prompt);
        const jsonMatch = response.match(/\[[\s\S]*\]/);

        if (jsonMatch) {
          const results = JSON.parse(jsonMatch[0]);
          for (const r of results) {
            const item = batch.find(b => b.id === r.id);
            if (!item) continue;
            verified[r.id] = {
              verdict: r.verdict,
              reason: r.reason || '',
              slug: item.slug,
            };
            if (r.verdict === 'keep') kept++;
            else rejected++;
          }
        }

        // Fill missing
        for (const item of batch) {
          if (!verified[item.id]) {
            verified[item.id] = { verdict: 'reject', reason: 'No AI response', slug: item.slug };
            rejected++;
          }
        }
      } catch (e) {
        for (const item of batch) {
          if (!verified[item.id]) {
            verified[item.id] = { verdict: 'reject', reason: `Error: ${e.message}`, slug: item.slug };
            rejected++;
          }
        }
      }

      processed += batch.length;
      process.stdout.write(
        `\r  Verify [${lang}]: ${processed}/${toVerify.length} | kept:${kept} rejected:${rejected}`
      );
      if (processed % (BATCH_SIZE * 10) < BATCH_SIZE * CONCURRENCY) {
        progress.verified = verified;
        saveProgress(lang, progress);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  console.log();
  progress.verified = verified;
  saveProgress(lang, progress);

  return verified;
}

// ---------------------------------------------------------------------------
// Phase 5: Write to DB
// ---------------------------------------------------------------------------

async function phase5_write(classified, verified, lang) {
  console.log(`\n=== Phase 5: Write to DB (${lang}) ===\n`);

  // Collect final assignments (verified + kept)
  const toWrite = [];
  for (const [id, v] of Object.entries(verified)) {
    if (v.verdict === 'keep') {
      toWrite.push({ id, slug: v.slug, imageUrl: `/signs/${v.slug}.png` });
    }
  }

  // Collect NEEDS_IMAGE for report
  const needsImage = [];
  for (const [id, r] of Object.entries(classified)) {
    if (r.verdict === 'NEEDS_IMAGE') {
      needsImage.push({ id, reason: r.reason });
    }
  }

  // Collect NO_IMAGE
  const noImageCount = Object.values(classified).filter(r => r.verdict === 'NO_IMAGE').length;

  // Collect rejected
  const rejectedCount = Object.values(verified).filter(v => v.verdict === 'reject').length;

  console.log(`  Final assignments: ${toWrite.length}`);
  console.log(`  NO_IMAGE (deictic false positives): ${noImageCount}`);
  console.log(`  NEEDS_IMAGE (manual review): ${needsImage.length}`);
  console.log(`  Rejected by verification: ${rejectedCount}`);

  // Per-slug summary
  if (toWrite.length > 0) {
    const slugCounts = {};
    for (const { slug } of toWrite) {
      slugCounts[slug] = (slugCounts[slug] || 0) + 1;
    }
    const sorted = Object.entries(slugCounts).sort((a, b) => b[1] - a[1]);
    console.log('\n  Per image:');
    for (const [slug, count] of sorted) {
      console.log(`    ${slug}: ${count}`);
    }
  }

  // Show NEEDS_IMAGE questions
  if (needsImage.length > 0) {
    console.log(`\n  NEEDS_IMAGE questions (for manual review):`);
    for (const n of needsImage.slice(0, 20)) {
      console.log(`    q${n.id}: ${n.reason}`);
    }
    if (needsImage.length > 20) console.log(`    ... and ${needsImage.length - 20} more`);
  }

  // Save report
  const report = {
    lang,
    timestamp: new Date().toISOString(),
    dryRun: DRY_RUN,
    stats: {
      totalClassified: Object.keys(classified).length,
      noImage: noImageCount,
      needsImage: needsImage.length,
      assignedBeforeVerification: Object.keys(verified).length,
      verifiedKept: toWrite.length,
      verifiedRejected: rejectedCount,
    },
    assignments: toWrite.map(w => ({ id: w.id, slug: w.slug })),
    needsImage,
  };
  fs.writeFileSync(getReportFile(lang), JSON.stringify(report, null, 2));
  console.log(`\n  Report saved: ${getReportFile(lang)}`);

  if (DRY_RUN) {
    console.log('  [dry-run] Skipping DB writes');
    return toWrite.length;
  }

  // Write assignments
  let written = 0;
  for (const { id, imageUrl } of toWrite) {
    try {
      await supabasePatch('questions', `id=eq.${id}`, { image_url: imageUrl });
      written++;
      if (written % 20 === 0) {
        process.stdout.write(`\r  Written: ${written}/${toWrite.length}`);
      }
    } catch (e) {
      console.log(`\n  Error writing q${id}: ${e.message}`);
    }
  }
  if (toWrite.length > 0) console.log(`\r  Written: ${written}/${toWrite.length}`);

  return written;
}

// ---------------------------------------------------------------------------
// Main per-language flow
// ---------------------------------------------------------------------------

async function processLanguage(lang) {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`  Assign deictic images: ${lang.toUpperCase()}`);
  console.log(`  Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  if (STATE_ARG) console.log(`  State filter: ${STATE_ARG}`);
  console.log(`${'='.repeat(50)}`);

  let progress = loadProgress(lang);

  // Phase 1: Rollback + Clear
  if (progress.phase < 1) {
    await phase1_rollbackAndClear(lang);
    progress.phase = 1;
    saveProgress(lang, progress);
  } else {
    console.log('\n=== Phase 1: Rollback + Clear === (skipped, already done)');
  }

  // Phase 2: Find deictic questions
  const { flagged } = await phase2_findDeictic(lang);

  if (flagged.length === 0) {
    console.log('\n  No deictic questions found. Done.');
    return { written: 0, needsImage: 0 };
  }

  // Phase 3: AI matching
  let classified;
  if (progress.phase < 3) {
    classified = await phase3_aiMatch(flagged, lang, progress);
    progress.classified = classified;
    progress.phase = 3;
    saveProgress(lang, progress);
  } else {
    classified = progress.classified || {};
    console.log(`\n=== Phase 3: AI matching === (skipped, ${Object.keys(classified).length} from progress)`);
  }

  // Phase 4: AI verification
  let verified;
  if (progress.phase < 4) {
    verified = await phase4_verify(classified, flagged, lang, progress);
    progress.verified = verified;
    progress.phase = 4;
    saveProgress(lang, progress);
  } else {
    verified = progress.verified || {};
    console.log(`\n=== Phase 4: AI verification === (skipped, from progress)`);
  }

  // Phase 5: Write to DB
  const written = await phase5_write(classified, verified, lang);

  const needsImageCount = Object.values(classified).filter(r => r.verdict === 'NEEDS_IMAGE').length;

  // Cleanup progress on success (not dry-run)
  if (!DRY_RUN) {
    const progressFile = getProgressFile(lang);
    if (fs.existsSync(progressFile)) fs.unlinkSync(progressFile);
  }

  return { written, needsImage: needsImageCount };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // Phase 0: Fix JPEG files (standalone)
  if (FIX_JPEGS) {
    phase0_fixJpegs();
    if (!ALL_LANGS && !LANG_ARG) return;
  }

  const langs = ALL_LANGS ? LANGS : [LANG_ARG];

  console.log('\n==================================================');
  console.log('  assign-deictic-images: Deictic-only image assignment');
  console.log(`  Languages: ${langs.map(l => l.toUpperCase()).join(', ')}`);
  console.log(`  Mode: ${DRY_RUN ? 'DRY RUN (no DB writes)' : 'LIVE'}`);
  console.log(`  Concurrency: ${CONCURRENCY}`);
  if (STATE_ARG) console.log(`  State filter: ${STATE_ARG}`);
  console.log('==================================================');

  const totals = { written: 0, needsImage: 0 };
  for (const lang of langs) {
    const r = await processLanguage(lang);
    totals.written += (r?.written || 0);
    totals.needsImage += (r?.needsImage || 0);
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log('  FINAL SUMMARY');
  console.log(`${'='.repeat(50)}`);
  console.log(`  Languages: ${langs.join(', ')}`);
  console.log(`  Images assigned: ${totals.written}${DRY_RUN ? ' (dry run)' : ''}`);
  console.log(`  NEEDS_IMAGE (manual review): ${totals.needsImage}`);
  console.log(`${'='.repeat(50)}`);

  if (DRY_RUN) {
    console.log('\nRe-run without --dry-run to apply changes.');
  }

  if (totals.needsImage > 0) {
    console.log(`\nCheck .assign-deictic-{lang}-report.json for NEEDS_IMAGE questions.`);
  }
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
