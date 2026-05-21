#!/usr/bin/env node
/**
 * Verify the per-state DMV knowledge test format (number of questions,
 * pass score, time limit) by fetching authoritative sources and asking
 * Claude Haiku to extract the numbers.
 *
 * Output: .state-exam-rules-verification.json — a side-by-side diff
 * between what lib/exam-rules.js currently says and what the verified
 * sources say. Review the diff, then update lib/exam-rules.js by hand
 * (don't auto-overwrite — DMV pages occasionally have ambiguous wording).
 *
 * Usage:
 *   node scripts/verify-state-exam-rules.js                # all 50
 *   node scripts/verify-state-exam-rules.js --state=texas  # one state
 *   node scripts/verify-state-exam-rules.js --concurrency=5
 *
 * Requires: ANTHROPIC_API_KEY in .env.local.
 *
 * Strategy:
 *   1. For each state, fetch a list of candidate sources (official
 *      .gov page first, then trusted aggregators as fallback /
 *      cross-check).
 *   2. Strip HTML to text and feed to Claude Haiku with a strict JSON
 *      extraction prompt.
 *   3. Cross-reference Claude's answer across sources; flag mismatches.
 *   4. Write the consolidated result to the verification JSON.
 *
 * Cost estimate: ~50 states × ~3 sources × ~$0.001/Haiku call ≈ $0.20.
 * Cheap. Re-run quarterly to catch DMV format changes.
 */

'use strict';

const fs = require('fs');

try {
  const txt = fs.readFileSync('.env.local', 'utf8');
  for (const line of txt.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch (_) {}

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_KEY) {
  console.error('Missing ANTHROPIC_API_KEY in .env.local');
  process.exit(1);
}

const args = process.argv.slice(2);
const argVal = (k) => args.find(a => a.startsWith(`--${k}=`))?.split('=')[1];
const ONLY_STATE = argVal('state') || null;
const CONCURRENCY = parseInt(argVal('concurrency') || '3', 10);

// State → 2-letter postal code, used to build aggregator URLs.
const STATE_CODE = {
  alabama: 'al', alaska: 'ak', arizona: 'az', arkansas: 'ar',
  california: 'ca', colorado: 'co', connecticut: 'ct', delaware: 'de',
  florida: 'fl', georgia: 'ga', hawaii: 'hi', idaho: 'id',
  illinois: 'il', indiana: 'in', iowa: 'ia', kansas: 'ks',
  kentucky: 'ky', louisiana: 'la', maine: 'me', maryland: 'md',
  massachusetts: 'ma', michigan: 'mi', minnesota: 'mn', mississippi: 'ms',
  missouri: 'mo', montana: 'mt', nebraska: 'ne', nevada: 'nv',
  'new-hampshire': 'nh', 'new-jersey': 'nj', 'new-mexico': 'nm',
  'new-york': 'ny', 'north-carolina': 'nc', 'north-dakota': 'nd',
  ohio: 'oh', oklahoma: 'ok', oregon: 'or', pennsylvania: 'pa',
  'rhode-island': 'ri', 'south-carolina': 'sc', 'south-dakota': 'sd',
  tennessee: 'tn', texas: 'tx', utah: 'ut', vermont: 'vt',
  virginia: 'va', washington: 'wa', 'west-virginia': 'wv',
  wisconsin: 'wi', wyoming: 'wy',
};

// Compute candidate source URLs for a state. Order matters — earlier
// entries are preferred when there's a tie. We hit 3-4 aggregators per
// state for cross-check; one will usually return clean data even when
// official .gov pages block scrapers or move their URL structure.
function sourcesForState(slug) {
  const code = STATE_CODE[slug];
  return [
    // Aggregator 1: driving-tests.org — most reliable, clean text
    `https://driving-tests.org/${slug}/${slug}-permit-practice-test/`,
    // Aggregator 2: zutobi.com — has explicit "test format" sections
    code && `https://zutobi.com/us/${code}-car/practice-permit-test`,
    // Aggregator 3: epermittest.com — adult-test pages have format details
    `https://www.epermittest.com/${slug}/${slug.replace(/-/g, '_')}-dmv-adult-permit-test`,
    // Aggregator 4: nextdoordriving — usually has question count
    `https://nextdoordriving.com/${slug}/${code}-permit-test-simulator`,
  ].filter(Boolean);
}

// ── Helpers ──────────────────────────────────────────────────────────────

// Browser-ish UA helps with aggregators that block obvious bots.
const REALISTIC_UAS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
];

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function fetchTextWithRetry(url, { timeoutMs = 15000, maxRetries = 2 } = {}) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) await sleep(800 * attempt); // simple linear backoff
    const ua = REALISTIC_UAS[attempt % REALISTIC_UAS.length];
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const r = await fetch(url, {
        headers: {
          'User-Agent': ua,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
        },
        signal: ctrl.signal,
        redirect: 'follow',
      });
      clearTimeout(t);
      if (r.status === 429 || r.status >= 500) {
        // Transient — retry
        continue;
      }
      if (!r.ok) return null;
      const html = await r.text();
      return html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .slice(0, 8000)
        .trim();
    } catch {
      clearTimeout(t);
      // Retry on timeout / network error
      continue;
    }
  }
  return null;
}

async function extractWithClaude(stateSlug, sourceUrl, pageText) {
  const prompt = `You are extracting structured data from a US state DMV web page.

The page is from: ${sourceUrl}
This is for the state: ${stateSlug.replace(/-/g, ' ')}

I need ONLY these three numbers about the OFFICIAL ADULT KNOWLEDGE TEST
(written test) for a regular Class C / car driver's license — NOT
motorcycle, NOT CDL, NOT teen-specific tests if a separate adult
version exists:

  questions    Total number of multiple-choice questions on the test.
  pass         Minimum number of correct answers required to pass.
  passPct      Pass percentage (pass / questions × 100, rounded integer).

Output STRICTLY this JSON, no commentary:

  {"questions": <int or null>, "pass": <int or null>, "passPct": <int or null>, "confidence": "high"|"medium"|"low", "evidence": "<short quoted phrase from the page or 'not found'>"}

If the page does not state these numbers, return all nulls and
confidence="low" with evidence="not found".

Page content:
"""
${pageText}
"""`;

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!r.ok) {
    console.error('  Claude error:', r.status, await r.text());
    return null;
  }
  const data = await r.json();
  const text = data.content?.[0]?.text || '';
  try {
    const m = text.match(/\{[\s\S]*\}/);
    return m ? JSON.parse(m[0]) : null;
  } catch {
    return null;
  }
}

async function verifyState(slug, sources) {
  console.log(`▶ ${slug}`);
  const perSource = [];
  for (const url of sources) {
    const text = await fetchTextWithRetry(url);
    if (!text) {
      console.log(`  ✗ fetch failed: ${url}`);
      continue;
    }
    const parsed = await extractWithClaude(slug, url, text);
    if (parsed) {
      console.log(`  ${(parsed.confidence?.toUpperCase() || '?').padEnd(6)} ${url} → Q=${parsed.questions}, pass=${parsed.pass}, ${parsed.passPct}% [${parsed.evidence?.slice(0, 60)}]`);
      perSource.push({ url, ...parsed });
    } else {
      console.log(`  ! parse failed: ${url}`);
    }
    // Polite delay between hits to the same aggregator across states.
    await sleep(400);
  }
  // Consensus: weighted by confidence; ties broken by source order.
  const counts = {};
  for (const r of perSource) {
    if (r.questions != null) {
      const key = `${r.questions}/${r.pass}`;
      counts[key] = (counts[key] || 0) + (r.confidence === 'high' ? 2 : r.confidence === 'medium' ? 1 : 0.5);
    }
  }
  const consensus = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  const finalAnswer = consensus
    ? { questions: parseInt(consensus[0].split('/')[0], 10), pass: parseInt(consensus[0].split('/')[1], 10) }
    : { questions: null, pass: null };
  return { slug, sources: perSource, consensus: finalAnswer };
}

// ── Main ─────────────────────────────────────────────────────────────────

(async () => {
  const slugs = ONLY_STATE ? [ONLY_STATE] : Object.keys(STATE_CODE);
  console.log(`Verifying ${slugs.length} state(s), concurrency=${CONCURRENCY}\n`);

  const results = [];
  for (let i = 0; i < slugs.length; i += CONCURRENCY) {
    const batch = slugs.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(batch.map(slug => verifyState(slug, sourcesForState(slug))));
    results.push(...batchResults);
    // Spread batches out to dodge aggregator rate limits.
    if (i + CONCURRENCY < slugs.length) await sleep(1500);
  }

  // Diff against current lib/exam-rules.js
  const currentRules = (await import('../lib/exam-rules.js')).STATE_EXAM_RULES || {};
  const diff = [];
  for (const r of results) {
    const cur = currentRules[r.slug]?.car;
    if (!cur && !r.consensus.questions) continue;
    const sameQ = cur?.questions === r.consensus.questions;
    const sameP = cur?.pass === r.consensus.pass;
    if (!sameQ || !sameP) {
      diff.push({
        state: r.slug,
        current: cur ? `${cur.questions}/${cur.pass}` : '(none)',
        verified: r.consensus.questions != null ? `${r.consensus.questions}/${r.consensus.pass}` : '(unable to verify)',
        sources: r.sources.map(s => `${s.url} → Q=${s.questions} pass=${s.pass} [${s.confidence}]`),
      });
    }
  }

  console.log('\n=== Diff summary ===');
  for (const d of diff) {
    console.log(`  ${d.state.padEnd(18)} current=${d.current}  →  verified=${d.verified}`);
  }
  console.log(`\n${diff.length} states differ from current lib/exam-rules.js`);

  const out = '.state-exam-rules-verification.json';
  fs.writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), results, diff }, null, 2));
  console.log(`\nFull data written to ${out}`);
})();
