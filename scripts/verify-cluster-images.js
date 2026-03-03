#!/usr/bin/env node
/**
 * Verify cluster images against their questions using Claude vision.
 * For each of the 149 good clusters:
 *   1. Downloads the cluster image
 *   2. Sends it to Claude Haiku with 10 sample EN questions
 *   3. KEEP → leave image_url as is
 *   4. REMOVE → set image_url = null for ALL questions in that cluster
 *
 * Usage:
 *   node scripts/verify-cluster-images.js --dry-run
 *   node scripts/verify-cluster-images.js
 *   node scripts/verify-cluster-images.js --concurrency=3
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
const PROGRESS_FILE = path.join(__dirname, '..', '.verify-cluster-images-progress.json');
const REPORT_FILE = path.join(__dirname, '..', '.verify-cluster-images-report.json');
const CLUSTERED_FILE = path.join(__dirname, '..', '..', 'Downloads', 'visualization', 'clustered_questions.json');
const IMAGES_DIR = path.join(__dirname, '..', '..', 'Downloads', 'visualization 2', 'images');

if (!SERVICE_KEY) { console.error('Set SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
if (!ANTHROPIC_KEY) { console.error('Set ANTHROPIC_API_KEY'); process.exit(1); }

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ---------------------------------------------------------------------------
// Load progress
// ---------------------------------------------------------------------------

function loadProgress() {
  if (fs.existsSync(PROGRESS_FILE)) {
    try { return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8')); } catch {}
  }
  return {};
}

function saveProgress(p) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(p, null, 2));
}

// ---------------------------------------------------------------------------
// Download image → base64
// ---------------------------------------------------------------------------

function downloadImageBase64(url) {
  try {
    const buf = execSync(`curl -s --max-time 30 "${url}"`, { maxBuffer: 10 * 1024 * 1024 });
    return buf.toString('base64');
  } catch (e) {
    throw new Error(`Failed to download ${url}: ${e.message}`);
  }
}

// ---------------------------------------------------------------------------
// Claude vision call
// ---------------------------------------------------------------------------

async function verifyCluster(cluster, imageBase64) {
  const enQuestions = cluster.all_questions.filter(q => q.language === 'en');
  const samples = (enQuestions.length >= 8 ? enQuestions : cluster.all_questions)
    .slice(0, 10)
    .map((q, i) => {
      const opts = [q.option_a, q.option_b, q.option_c, q.option_d].filter(Boolean);
      return `Q${i+1}: ${q.question_text}\n  Options: ${opts.join(' | ')}`;
    }).join('\n\n');

  const prompt = `You are reviewing a DMV test question bank. I will show you an image that is currently displayed alongside these ${Math.min(10, cluster.all_questions.length)} questions from cluster "${cluster.label || cluster.cluster_id}" (${cluster.size} total questions).

SAMPLE QUESTIONS:
${samples}

Your task: Decide if this image is RELEVANT to these questions.

KEEP if: The image directly illustrates what these questions are asking about (e.g., image shows a stop sign and questions ask about stop signs, or image shows a motorcycle and questions are about motorcycle operation).

REMOVE if:
- The image is unrelated to the question topics
- The image would confuse test-takers (wrong sign, wrong vehicle type, etc.)
- The questions are about rules/procedures that don't need a visual aid
- The image is a generic scene that doesn't help answer the specific questions

Be decisive. Answer with ONLY:
{"verdict": "KEEP", "reason": "brief reason"}
OR
{"verdict": "REMOVE", "reason": "brief reason"}`;

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
        return { verdict: parsed.verdict, reason: parsed.reason };
      }
      return { verdict: 'KEEP', reason: 'Could not parse response' };
    } catch (e) {
      if (attempt === 3) return { verdict: 'KEEP', reason: `Error: ${e.message}` };
      await sleep(2000);
    }
  }
}

// ---------------------------------------------------------------------------
// Supabase: clear image_url for a cluster
// ---------------------------------------------------------------------------

async function clearClusterImages(clusterQuestions) {
  const ids = clusterQuestions.map(q => q.id);
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
  console.log('  verify-cluster-images: Vision-based check');
  console.log(`  Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log(`  Concurrency: ${CONCURRENCY}`);
  console.log('================================================\n');

  // Load cluster data
  const clusters = JSON.parse(fs.readFileSync(CLUSTERED_FILE, 'utf8'));
  const goodClusters = clusters.filter(c =>
    fs.existsSync(path.join(IMAGES_DIR, `${c.cluster_id}.png`))
  );
  console.log(`Good clusters to verify: ${goodClusters.length}`);

  const progress = loadProgress();
  const toProcess = goodClusters.filter(c => !progress[c.cluster_id]);
  console.log(`Already verified: ${Object.keys(progress).length}, remaining: ${toProcess.length}\n`);

  let done = 0, kept = 0, removed = 0, errors = 0;
  // Count already done
  for (const v of Object.values(progress)) {
    if (v.verdict === 'KEEP') kept++;
    else removed++;
  }

  let idx = 0;
  async function worker() {
    while (idx < toProcess.length) {
      const cluster = toProcess[idx++];
      const imageUrl = `${SUPABASE_URL}/storage/v1/object/public/question-images/clusters/${cluster.cluster_id}.png`;

      try {
        // Download image
        const imageBase64 = downloadImageBase64(imageUrl);

        // Verify with Claude
        const result = await verifyCluster(cluster, imageBase64);
        progress[cluster.cluster_id] = {
          verdict: result.verdict,
          reason: result.reason,
          label: cluster.label,
          size: cluster.size,
        };

        if (result.verdict === 'REMOVE') {
          removed++;
          process.stdout.write(`\n  REMOVE cluster ${cluster.cluster_id} (${cluster.label}): ${result.reason}`);
          if (!DRY_RUN) {
            await clearClusterImages(cluster.all_questions);
          }
        } else {
          kept++;
        }

        done++;
        process.stdout.write(
          `\r  Progress: ${done + Object.keys(progress).length - toProcess.length}/${goodClusters.length} | keep:${kept} remove:${removed}`
        );
        saveProgress(progress);

      } catch (e) {
        errors++;
        progress[cluster.cluster_id] = { verdict: 'KEEP', reason: `Error: ${e.message}`, label: cluster.label, size: cluster.size };
        saveProgress(progress);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  console.log('\n');

  // Save report
  const removed_list = Object.entries(progress)
    .filter(([, v]) => v.verdict === 'REMOVE')
    .map(([id, v]) => ({ cluster_id: id, label: v.label, size: v.size, reason: v.reason }));

  const report = {
    timestamp: new Date().toISOString(),
    dryRun: DRY_RUN,
    total: goodClusters.length,
    kept, removed: removed_list.length, errors,
    removed_clusters: removed_list,
  };
  fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));

  console.log('================================================');
  console.log('  RESULTS');
  console.log('================================================');
  console.log(`  Total clusters:  ${goodClusters.length}`);
  console.log(`  KEEP:            ${kept}`);
  console.log(`  REMOVE:          ${removed_list.length}`);
  console.log(`  Errors:          ${errors}`);
  console.log();
  if (removed_list.length > 0) {
    console.log('  Removed clusters:');
    for (const r of removed_list) {
      console.log(`    [${r.cluster_id}] ${r.label} (${r.size}q): ${r.reason}`);
    }
  }
  console.log(`\n  Report: ${REPORT_FILE}`);
  if (DRY_RUN) console.log('\n  Re-run without --dry-run to apply changes.');
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
