#!/usr/bin/env node
/**
 * Per-question image verification using Claude vision.
 * For each good cluster (149), downloads the cluster image and checks
 * every question against it in batches of 10.
 * Questions where the image doesn't match get image_url cleared.
 *
 * Usage:
 *   node scripts/verify-question-images.js --dry-run
 *   node scripts/verify-question-images.js
 *   node scripts/verify-question-images.js --concurrency=3
 *
 * Requires: SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY
 */

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SUPABASE_URL = 'https://yaogndpgnewqffbjrsgz.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const DRY_RUN = process.argv.includes('--dry-run');
const CONCURRENCY = parseInt(process.argv.find(a => a.startsWith('--concurrency='))?.split('=')[1] || '3', 10);
const HAIKU_MODEL = 'claude-haiku-4-5-20251001';
const PROGRESS_FILE = path.join(__dirname, '..', '.verify-question-images-progress.json');
const REPORT_FILE = path.join(__dirname, '..', '.verify-question-images-report.json');
const CLUSTERED_FILE = path.join(__dirname, '..', '..', 'Downloads', 'visualization', 'clustered_questions.json');
const IMAGES_DIR = path.join(__dirname, '..', '..', 'Downloads', 'visualization 2', 'images');

if (!SERVICE_KEY) { console.error('Set SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
if (!ANTHROPIC_KEY) { console.error('Set ANTHROPIC_API_KEY'); process.exit(1); }

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function loadProgress() {
  if (fs.existsSync(PROGRESS_FILE)) {
    try { return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8')); } catch {}
  }
  return {};
}

function saveProgress(p) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(p, null, 2));
}

function downloadImageBase64(url) {
  const buf = execSync(`curl -s --max-time 30 "${url}"`, { maxBuffer: 10 * 1024 * 1024 });
  if (!buf || buf.length < 500) throw new Error(`Image too small or missing: ${url}`);
  return buf.toString('base64');
}

// ---------------------------------------------------------------------------
// Verify a batch of up to 10 questions against an image
// Returns array of 1-indexed question numbers to remove
// ---------------------------------------------------------------------------

async function verifyBatch(questions, imageBase64) {
  const formatted = questions.map((q, i) => {
    const opts = [q.option_a, q.option_b, q.option_c, q.option_d].filter(Boolean);
    return `Q${i + 1}: ${q.question_text}\n  Options: ${opts.join(' | ')}`;
  }).join('\n\n');

  const prompt = `You are reviewing a DMV test question bank. This image is currently shown alongside these ${questions.length} questions.

${formatted}

For each question, decide: does this image accurately depict what the specific question is asking about?

KEEP if the image directly shows what this question is asking about (e.g., question asks about a stop sign and image shows a stop sign; question asks about a double yellow line and image shows one).

REMOVE if:
- The image shows a different sign, signal, or road situation than what the question is specifically asking about
- The image would confuse or mislead the test-taker about the correct answer
- The question asks to visually identify something, and the image shows the wrong thing

Respond with ONLY valid JSON: {"remove": [1, 3]} (1-indexed question numbers to remove; use empty array [] if all should be kept).`;

  const body = JSON.stringify({
    model: HAIKU_MODEL,
    max_tokens: 150,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: imageBase64 } },
        { type: 'text', text: prompt }
      ]
    }]
  });

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body,
      });

      if (res.status === 429) {
        const wait = parseInt(res.headers.get('retry-after') || '30', 10);
        console.log(`\n  Rate limited, waiting ${wait}s...`);
        await sleep(wait * 1000);
        continue;
      }
      if (res.status === 529) {
        console.log('\n  Overloaded, waiting 60s...');
        await sleep(60000);
        continue;
      }
      if (!res.ok) throw new Error(`Claude ${res.status}: ${await res.text()}`);

      const data = await res.json();
      const text = data.content?.[0]?.text || '';
      const m = text.match(/\{[\s\S]*?\}/);
      if (m) {
        const parsed = JSON.parse(m[0]);
        const removeList = Array.isArray(parsed.remove) ? parsed.remove : [];
        return removeList.filter(n => typeof n === 'number' && n >= 1 && n <= questions.length);
      }
      return [];
    } catch (e) {
      if (attempt === 3) return [];
      await sleep(2000);
    }
  }
  return [];
}

// ---------------------------------------------------------------------------
// Supabase: clear image_url for given question IDs
// ---------------------------------------------------------------------------

async function clearQuestionImages(ids) {
  const BATCH = 200;
  for (let i = 0; i < ids.length; i += BATCH) {
    const batch = ids.slice(i, i + BATCH);
    const url = `${SUPABASE_URL}/rest/v1/questions?id=in.(${batch.join(',')})`;
    const res = await fetch(url, {
      method: 'PATCH',
      headers: {
        apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json', Prefer: 'return=minimal',
      },
      body: JSON.stringify({ image_url: null }),
    });
    if (!res.ok) throw new Error(`PATCH failed: ${res.status} ${await res.text()}`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('\n================================================');
  console.log('  verify-question-images: Per-question check');
  console.log(`  Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log(`  Concurrency: ${CONCURRENCY}`);
  console.log('================================================\n');

  const clusters = JSON.parse(fs.readFileSync(CLUSTERED_FILE, 'utf8'));
  const goodClusters = clusters.filter(c =>
    fs.existsSync(path.join(IMAGES_DIR, `${c.cluster_id}.png`))
  );

  const totalQuestions = goodClusters.reduce((s, c) => s + c.all_questions.length, 0);
  console.log(`Good clusters: ${goodClusters.length}`);
  console.log(`Total questions to verify: ${totalQuestions}`);

  const progress = loadProgress();
  const toProcess = goodClusters.filter(c => !progress[c.cluster_id]);
  console.log(`Already processed: ${Object.keys(progress).length} clusters, remaining: ${toProcess.length}\n`);

  let totalKept = 0, totalRemoved = 0, totalErrors = 0;
  for (const v of Object.values(progress)) {
    totalKept += v.kept || 0;
    totalRemoved += v.removed || 0;
  }

  let clustersDone = Object.keys(progress).length;
  let clusterIdx = 0;

  async function worker() {
    while (clusterIdx < toProcess.length) {
      const cluster = toProcess[clusterIdx++];
      const imageUrl = `${SUPABASE_URL}/storage/v1/object/public/question-images/clusters/${cluster.cluster_id}.png`;

      try {
        const imageBase64 = downloadImageBase64(imageUrl);
        const questions = cluster.all_questions;
        const removedIds = [];

        for (let i = 0; i < questions.length; i += 10) {
          const batch = questions.slice(i, i + 10);
          const removeIndices = await verifyBatch(batch, imageBase64);
          for (const ri of removeIndices) {
            const q = batch[ri - 1];
            if (q) removedIds.push(q.id);
          }
          if (i + 10 < questions.length) await sleep(200);
        }

        const kept = questions.length - removedIds.length;
        const removed = removedIds.length;

        progress[cluster.cluster_id] = { kept, removed, removedIds };
        totalKept += kept;
        totalRemoved += removed;
        clustersDone++;

        if (removed > 0 && !DRY_RUN) {
          await clearQuestionImages(removedIds);
        }

        process.stdout.write(
          `\r  Clusters: ${clustersDone}/${goodClusters.length} | kept:${totalKept} removed:${totalRemoved}`
        );
        saveProgress(progress);

      } catch (e) {
        totalErrors++;
        progress[cluster.cluster_id] = { error: e.message, kept: 0, removed: 0, removedIds: [] };
        saveProgress(progress);
        process.stdout.write(`\n  ERROR cluster ${cluster.cluster_id}: ${e.message}\n`);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  console.log('\n');

  // Save report
  const clusterStats = Object.entries(progress)
    .filter(([, v]) => (v.removed || 0) > 0)
    .map(([id, v]) => ({ cluster_id: id, removed: v.removed, total: (v.kept || 0) + v.removed }))
    .sort((a, b) => b.removed - a.removed);

  const report = {
    timestamp: new Date().toISOString(),
    dryRun: DRY_RUN,
    totalClusters: goodClusters.length,
    totalQuestionsWithImages: totalQuestions,
    totalKept,
    totalRemoved,
    totalErrors,
    clustersWithRemovals: clusterStats,
  };
  fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));

  console.log('================================================');
  console.log('  RESULTS');
  console.log('================================================');
  console.log(`  Clusters:              ${goodClusters.length}`);
  console.log(`  Total questions:       ${totalQuestions}`);
  console.log(`  Questions kept:        ${totalKept}`);
  console.log(`  Questions removed:     ${totalRemoved} (${((totalRemoved / totalQuestions) * 100).toFixed(1)}%)`);
  console.log(`  Errors:                ${totalErrors}`);
  console.log(`\n  Report: ${REPORT_FILE}`);
  if (DRY_RUN) console.log('\n  Re-run without --dry-run to apply changes.');
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
