#!/usr/bin/env node
/**
 * Match Storage cluster images (clusters/N.png) to new cluster_code questions.
 *
 * Phase 1: Vision-classify all 149 images via Haiku
 *          → saves .images-metadata.json (reused for CDL/moto pipelines)
 *
 * Phase 2: Text-match images to cluster_codes (no API calls)
 *          Filters by --category= so car images → car clusters only
 *
 * Phase 3: DB update
 *          - Clear old /signs/ image_url from clustered questions
 *          - Set new clusters/N.png image_url on matched cluster_codes
 *          - Propagate to all 5 language rows
 *
 * Usage:
 *   node scripts/match-images-to-clusters.js [--dry-run] [--category=car]
 *   node scripts/match-images-to-clusters.js --phase=1          # classify only
 *   node scripts/match-images-to-clusters.js --phase=2          # match only (no DB)
 *   node scripts/match-images-to-clusters.js --phase=3          # write to DB only
 *
 * Requires: SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SUPABASE_URL  = 'https://yaogndpgnewqffbjrsgz.supabase.co';
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

const DRY_RUN      = process.argv.includes('--dry-run');
const CATEGORY_ARG = process.argv.find(a => a.startsWith('--category='))?.split('=')[1] || 'car';
const PHASE_ARG    = parseInt(process.argv.find(a => a.startsWith('--phase='))?.split('=')[1] || '0', 10);

const HAIKU_MODEL      = 'claude-haiku-4-5-20251001';
const CONCURRENCY      = 5;
const METADATA_FILE    = path.join(__dirname, '..', '.images-metadata.json');
const MATCHES_FILE     = path.join(__dirname, '..', '.images-matches.json');
const STORAGE_BASE_URL = `${SUPABASE_URL}/storage/v1/object/public/question-images/clusters`;

if (!SERVICE_KEY)   { console.error('Set SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
if (!ANTHROPIC_KEY) { console.error('Set ANTHROPIC_API_KEY');         process.exit(1); }

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

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
// Claude helpers
// ---------------------------------------------------------------------------

async function callClaude(messages, maxTokens = 1024) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: HAIKU_MODEL, max_tokens: maxTokens, messages }),
  });
  if (res.status === 429) {
    const wait = parseInt(res.headers.get('retry-after') || '30', 10);
    console.log(`\n  Rate limited, waiting ${wait}s...`);
    await sleep(wait * 1000);
    return callClaude(messages, maxTokens);
  }
  if (res.status === 529) {
    console.log('\n  Overloaded, waiting 60s...');
    await sleep(60000);
    return callClaude(messages, maxTokens);
  }
  if (!res.ok) throw new Error(`Claude API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.content?.[0]?.text || '';
}

function parseJSON(text) {
  const cleaned = text.replace(/```(?:json)?\s*/g, '').replace(/```\s*/g, '').trim();
  try { return JSON.parse(cleaned); } catch { /* fall through */ }
  const match = cleaned.match(/(\{[\s\S]*\})/);
  if (match) { try { return JSON.parse(match[1]); } catch { /* fall through */ } }
  return null;
}

// ---------------------------------------------------------------------------
// Phase 1: Vision-classify Storage images
// ---------------------------------------------------------------------------

async function classifyImage(clusterId) {
  const imageUrl = `${STORAGE_BASE_URL}/${clusterId}.png`;

  const prompt = `You are analyzing a US traffic sign or road scene image from a DMV driving test.

Identify what this image shows and return a JSON object with these fields:
- "sign_name": short name (e.g., "stop sign", "yield sign", "speed limit 25 mph", "no left turn", "school zone", "railroad crossing")
- "keywords": array of 3-8 English words/phrases that would appear in DMV test questions about this sign
- "categories": array of which driver categories this sign is relevant for. Use only: "car", "cdl", "motorcycle". Use "all" as shorthand for all three.
- "description": 1 sentence describing what the sign means or instructs

Examples of categories:
- A stop sign: ["all"] (relevant for car, CDL trucks, and motorcycles)
- A CDL weigh station sign: ["cdl"] (only relevant for commercial trucks)
- A motorcycle curve warning: ["motorcycle"] (only for motorcycles)
- A school zone sign: ["car", "motorcycle"] (trucks have different rules but include cdl too so ["all"])

Return ONLY valid JSON, no markdown, no explanation.`;

  const raw = await callClaude([{
    role: 'user',
    content: [
      { type: 'image', source: { type: 'url', url: imageUrl } },
      { type: 'text', text: prompt },
    ],
  }], 512);

  const result = parseJSON(raw);
  if (!result || !result.sign_name) {
    console.log(`  [${clusterId}] parse error, raw: ${raw.substring(0, 100)}`);
    return null;
  }

  // Normalize categories: "all" → ["car","cdl","motorcycle"]
  if (result.categories && result.categories.includes('all')) {
    result.categories = ['car', 'cdl', 'motorcycle'];
  }

  return { cluster_id: clusterId, ...result };
}

async function phase1_classify() {
  console.log('\n=== PHASE 1: Vision-classify Storage images ===\n');

  // Load existing metadata (resume support)
  let metadata = {};
  if (fs.existsSync(METADATA_FILE)) {
    try { metadata = JSON.parse(fs.readFileSync(METADATA_FILE, 'utf8')); } catch { /* ignore */ }
  }

  // Get list of images from Storage
  const storRes = await fetch(`${SUPABASE_URL}/storage/v1/object/list/question-images`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefix: 'clusters/', limit: 300 }),
  });
  const storFiles = await storRes.json();
  const clusterIds = storFiles
    .filter(f => f.name.endsWith('.png'))
    .map(f => parseInt(f.name))
    .sort((a, b) => a - b);

  const todo = clusterIds.filter(id => !metadata[id]);
  console.log(`Total Storage images: ${clusterIds.length}`);
  console.log(`Already classified: ${clusterIds.length - todo.length}`);
  console.log(`To classify: ${todo.length}\n`);

  if (todo.length === 0) {
    console.log('All images already classified.');
    return metadata;
  }

  // Process with concurrency
  let done = 0;
  const queue = [...todo];

  async function worker() {
    while (queue.length > 0) {
      const id = queue.shift();
      process.stdout.write(`  [${id}] classifying...`);
      try {
        const result = await classifyImage(id);
        if (result) {
          metadata[id] = result;
          process.stdout.write(` ${result.sign_name} [${result.categories.join('/')}]\n`);
        } else {
          process.stdout.write(` FAILED\n`);
        }
      } catch (e) {
        process.stdout.write(` ERROR: ${e.message}\n`);
      }
      done++;
      // Save progress every 10 images
      if (done % 10 === 0 && !DRY_RUN) {
        fs.writeFileSync(METADATA_FILE, JSON.stringify(metadata, null, 2));
        console.log(`  [saved progress: ${done}/${todo.length}]`);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  if (!DRY_RUN) {
    fs.writeFileSync(METADATA_FILE, JSON.stringify(metadata, null, 2));
    console.log(`\nSaved: ${METADATA_FILE}`);
  }

  // Summary
  const cats = { car: 0, cdl: 0, motorcycle: 0 };
  for (const m of Object.values(metadata)) {
    for (const c of (m.categories || [])) cats[c] = (cats[c] || 0) + 1;
  }
  console.log('\nCategory distribution (images can be in multiple):');
  for (const [cat, count] of Object.entries(cats)) {
    console.log(`  ${cat}: ${count}`);
  }

  return metadata;
}

// ---------------------------------------------------------------------------
// Phase 2: Text-match images to cluster_codes
// ---------------------------------------------------------------------------

// Generic words that appear in almost all sign questions — exclude from scoring
const GENERIC_WORDS = new Set(['sign', 'signs', 'traffic', 'road', 'street', 'driver', 'driving',
  'vehicle', 'speed', 'lane', 'intersection', 'should', 'must', 'when', 'what', 'which', 'this',
  'that', 'with', 'from', 'have', 'will', 'your', 'indicates', 'means', 'posted']);

function scoreMatch(questionText, imageKeywords, signName) {
  const text = questionText.toLowerCase();
  let score = 0;

  // Strong requirement: question must use explicit sign reference language
  const hasDeictic = /\bthis sign\b|\bthe sign (shown|below|above|pictured|displayed)\b|\bsign shown\b|\bwhat (does|is) this sign\b|\byou see (this|a) sign\b/i.test(questionText);
  if (hasDeictic) score += 8;

  // Exact sign name as complete phrase (e.g., "yield sign", "stop sign", "railroad crossing")
  // Build multi-word phrases from sign name (strip generic words)
  const cleanName = signName.toLowerCase()
    .replace(/\d+ mph|\d+ km\/h/g, '') // remove speed values
    .replace(/\bsign\b/g, '')           // remove "sign" from name
    .replace(/\s+/g, ' ').trim();

  // Check if meaningful phrase (3+ chars after cleaning) appears in text
  if (cleanName.length >= 3 && text.includes(cleanName)) {
    score += 6;
  } else {
    // Check individual meaningful words from sign name
    const nameParts = signName.toLowerCase().split(/\s+/)
      .filter(p => p.length > 3 && !GENERIC_WORDS.has(p));
    const nameMatchCount = nameParts.filter(p => text.includes(p)).length;
    // Only count if multiple meaningful words match (avoids single-word false positives)
    if (nameMatchCount >= 2) score += nameMatchCount * 2;
    else if (nameMatchCount === 1 && nameParts.length === 1) score += 2; // single-word sign name
  }

  // Meaningful keyword matches (filter generic words)
  const meaningfulKws = (imageKeywords || []).filter(kw =>
    kw.length > 3 && !GENERIC_WORDS.has(kw.toLowerCase())
  );
  for (const kw of meaningfulKws) {
    if (text.includes(kw.toLowerCase())) score += 1;
  }

  return score;
}

// Minimum score to assign an image (requires either deictic + any match, or strong sign name match)
const MIN_SCORE = 8;

async function phase2_match(metadata) {
  console.log(`\n=== PHASE 2: Text-match to ${CATEGORY_ARG} cluster_codes ===\n`);

  if (!metadata || Object.keys(metadata).length === 0) {
    console.error('No image metadata. Run --phase=1 first.');
    process.exit(1);
  }

  // Filter images relevant for this category
  const relevantImages = Object.values(metadata).filter(m =>
    m.categories && m.categories.includes(CATEGORY_ARG)
  );
  console.log(`Images relevant for ${CATEGORY_ARG}: ${relevantImages.length} of ${Object.keys(metadata).length}`);

  // Fetch all EN cluster questions for this category
  console.log(`Fetching EN ${CATEGORY_ARG} cluster questions...`);
  const enQuestions = await supabaseGetAll(
    'questions',
    `category=eq.${CATEGORY_ARG}&language=eq.en&cluster_code=not.is.null&select=id,cluster_code,state,question_text,image_url`
  );
  console.log(`  Found: ${enQuestions.length} questions\n`);

  // Build cluster_code → representative question map
  // Use the first question per cluster as representative
  const clusterMap = {};
  for (const q of enQuestions) {
    if (!clusterMap[q.cluster_code]) {
      clusterMap[q.cluster_code] = { cluster_code: q.cluster_code, state: q.state, questions: [] };
    }
    clusterMap[q.cluster_code].questions.push(q);
  }

  // For each cluster, pick best matching image
  const assignments = {}; // cluster_code → { cluster_id, url, score, sign_name }
  let matched = 0;

  for (const [cc, cluster] of Object.entries(clusterMap)) {
    let bestScore = 0;
    let bestImage = null;

    // Score against all relevant images
    for (const img of relevantImages) {
      // Score across all questions in the cluster (take max)
      let clusterScore = 0;
      for (const q of cluster.questions) {
        const s = scoreMatch(q.question_text, img.keywords || [], img.sign_name);
        if (s > clusterScore) clusterScore = s;
      }
      if (clusterScore > bestScore) {
        bestScore = clusterScore;
        bestImage = img;
      }
    }

    // Only assign if score meets minimum threshold
    if (bestScore >= MIN_SCORE && bestImage) {
      assignments[cc] = {
        cluster_id: bestImage.cluster_id,
        url: `${STORAGE_BASE_URL}/${bestImage.cluster_id}.png`,
        score: bestScore,
        sign_name: bestImage.sign_name,
        state: cluster.state,
      };
      matched++;
    }
  }

  console.log(`Matched: ${matched} cluster_codes with images`);

  // Stats breakdown
  const bySign = {};
  for (const a of Object.values(assignments)) {
    bySign[a.sign_name] = (bySign[a.sign_name] || 0) + 1;
  }
  console.log('\nTop matched signs:');
  Object.entries(bySign).sort((a,b) => b[1]-a[1]).slice(0, 15).forEach(([sign, count]) => {
    console.log(`  ${sign}: ${count} clusters`);
  });

  // Show sample
  console.log('\nSample assignments (first 8):');
  Object.entries(assignments).slice(0, 8).forEach(([cc, a]) => {
    console.log(`  ${cc} (${a.state}) → clusters/${a.cluster_id}.png [${a.sign_name}] score=${a.score}`);
  });

  if (!DRY_RUN) {
    fs.writeFileSync(MATCHES_FILE, JSON.stringify({ category: CATEGORY_ARG, assignments }, null, 2));
    console.log(`\nSaved: ${MATCHES_FILE}`);
  }

  return assignments;
}

// ---------------------------------------------------------------------------
// Phase 3: Write to DB
// ---------------------------------------------------------------------------

async function phase3_writeDB(assignments) {
  console.log(`\n=== PHASE 3: Write to DB (${CATEGORY_ARG}) ===\n`);

  // Step A: Clear /signs/ image_url from clustered questions (old small icons — not wanted)
  const withSigns = await supabaseGetAll(
    'questions',
    `category=eq.${CATEGORY_ARG}&cluster_code=not.is.null&image_url=like.*%2Fsigns%2F*&select=id,cluster_code`
  );
  console.log(`Step A: Clearing /signs/ image_url from ${withSigns.length} clustered ${CATEGORY_ARG} questions...`);
  if (!DRY_RUN && withSigns.length > 0) {
    await supabasePatch(
      'questions',
      `category=eq.${CATEGORY_ARG}&cluster_code=not.is.null&image_url=like.*%2Fsigns%2F*`,
      { image_url: null }
    );
    console.log('  Cleared.');
  } else {
    console.log(`  [${DRY_RUN ? 'dry-run' : 'skipped — none found'}]`);
  }

  // Step B: Add new assignments ONLY for clusters without existing clusters/ image
  // (Don't overwrite existing clusters/ images — they're already correctly matched)
  const clusterList = Object.entries(assignments);
  if (clusterList.length > 0) {
    // Get cluster_codes that already have a clusters/ image
    const alreadyHaveImage = await supabaseGetAll(
      'questions',
      `category=eq.${CATEGORY_ARG}&language=eq.en&cluster_code=not.is.null&image_url=like.*%2Fclusters%2F*&select=cluster_code`
    );
    const existingSet = new Set(alreadyHaveImage.map(r => r.cluster_code));

    const toAdd = clusterList.filter(([cc]) => !existingSet.has(cc));
    console.log(`\nStep B: New image assignments for clusters without existing image: ${toAdd.length} of ${clusterList.length}`);

    let done = 0;
    for (const [cc, a] of toAdd) {
      if (DRY_RUN) {
        process.stdout.write(`  [dry-run] ${cc} → clusters/${a.cluster_id}.png [${a.sign_name}]\n`);
        continue;
      }
      try {
        await supabasePatch(
          'questions',
          `cluster_code=eq.${encodeURIComponent(cc)}&category=eq.${CATEGORY_ARG}`,
          { image_url: a.url }
        );
        done++;
      } catch (e) {
        console.log(`  ERROR ${cc}: ${e.message}`);
      }
    }
    if (!DRY_RUN) console.log(`  Added image_url to ${done} cluster_codes.`);
  } else {
    console.log('\nStep B: No new assignments to add.');
  }

  // Step C: Propagate image_url within each cluster to all 5 languages
  // Some clusters have image on EN but not on RU/ES/ZH/UA — fix that
  console.log(`\nStep C: Propagating image_url to all 5 langs within each cluster...`);

  // Get all EN rows with clusters/ image
  const enWithImage = await supabaseGetAll(
    'questions',
    `category=eq.${CATEGORY_ARG}&language=eq.en&cluster_code=not.is.null&image_url=like.*%2Fclusters%2F*&select=cluster_code,image_url`
  );
  console.log(`  EN clusters with image: ${enWithImage.length}`);

  // For each, ensure all 5 langs have same image_url
  let propagated = 0;
  const propagateQueue = [...enWithImage];

  async function propagateWorker() {
    while (propagateQueue.length > 0) {
      const { cluster_code, image_url } = propagateQueue.shift();
      if (DRY_RUN) { propagated++; continue; }
      try {
        // PATCH all non-EN rows in this cluster that have null or different image_url
        await supabasePatch(
          'questions',
          `cluster_code=eq.${encodeURIComponent(cluster_code)}&category=eq.${CATEGORY_ARG}&language=neq.en`,
          { image_url }
        );
        propagated++;
      } catch (e) {
        console.log(`  ERROR propagate ${cluster_code}: ${e.message}`);
      }
    }
  }

  await Promise.all(Array.from({ length: 10 }, propagateWorker));
  console.log(`  Propagated: ${propagated} clusters${DRY_RUN ? ' [dry-run]' : ''}`);

  // Final stats
  const countRes = await fetch(
    `${SUPABASE_URL}/rest/v1/questions?category=eq.${CATEGORY_ARG}&cluster_code=not.is.null&image_url=not.is.null&select=id`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, Prefer: 'count=exact' } }
  );
  const cr = countRes.headers.get('content-range') || '';
  const total = cr.split('/')[1] || '?';
  console.log(`\nTotal ${CATEGORY_ARG} clustered questions with image_url now: ${total}`);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main() {
  console.log(`match-images-to-clusters.js${DRY_RUN ? ' [DRY RUN]' : ''}`);
  console.log(`Category: ${CATEGORY_ARG} | Phase: ${PHASE_ARG || 'all'}\n`);

  let metadata = {};
  let assignments = {};

  // Load existing files if skipping phases
  if (PHASE_ARG === 2 || PHASE_ARG === 3) {
    if (fs.existsSync(METADATA_FILE)) {
      metadata = JSON.parse(fs.readFileSync(METADATA_FILE, 'utf8'));
      console.log(`Loaded metadata: ${Object.keys(metadata).length} images`);
    }
  }
  if (PHASE_ARG === 3) {
    if (fs.existsSync(MATCHES_FILE)) {
      const saved = JSON.parse(fs.readFileSync(MATCHES_FILE, 'utf8'));
      if (saved.category !== CATEGORY_ARG) {
        console.error(`Matches file is for category '${saved.category}', but --category=${CATEGORY_ARG}. Re-run --phase=2.`);
        process.exit(1);
      }
      assignments = saved.assignments;
      console.log(`Loaded assignments: ${Object.keys(assignments).length} cluster_codes`);
    }
  }

  if (PHASE_ARG === 0 || PHASE_ARG === 1) metadata    = await phase1_classify();
  if (PHASE_ARG === 0 || PHASE_ARG === 2) assignments = await phase2_match(metadata);
  if (PHASE_ARG === 0 || PHASE_ARG === 3) await phase3_writeDB(assignments);

  console.log('\nDone.');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
