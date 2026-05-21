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

// ── State → list of source URLs (official .gov first, aggregators after) ──
// PLEASE expand the official URL list over time — every state with
// `.gov` should resolve to the actual state DMV "knowledge test format"
// page, not a generic landing page. Aggregators are fallback only.
const STATE_SOURCES = {
  alabama: [
    'https://www.alea.gov/dps/driver-license/dl-license-tests',
    'https://driving-tests.org/alabama/alabama-permit-practice-test/',
  ],
  alaska: [
    'https://dmv.alaska.gov/dlmanual/dlman1.htm',
    'https://driving-tests.org/alaska/alaska-permit-practice-test/',
  ],
  arizona: [
    'https://azdot.gov/motor-vehicles/driver-services/getting-license-or-permit',
    'https://driving-tests.org/arizona/arizona-permit-practice-test/',
  ],
  arkansas: [
    'https://www.dfa.arkansas.gov/services/category/drivers-license/',
    'https://driving-tests.org/arkansas/arkansas-permit-practice-test/',
  ],
  california: [
    'https://www.dmv.ca.gov/portal/driver-education-and-safety/educational-materials/fast-facts/dl-fast-facts/',
    'https://driving-tests.org/california/california-permit-practice-test/',
  ],
  colorado: [
    'https://dmv.colorado.gov/drivers-license-information',
    'https://driving-tests.org/colorado/colorado-permit-practice-test/',
  ],
  connecticut: [
    'https://portal.ct.gov/DMV/Driver-Services-Home',
    'https://driving-tests.org/connecticut/connecticut-permit-practice-test/',
  ],
  delaware: [
    'https://www.dmv.de.gov/services/driver_services/drivers_license/',
    'https://driving-tests.org/delaware/delaware-permit-practice-test/',
  ],
  florida: [
    'https://www.flhsmv.gov/driver-licenses-id-cards/getting-license/teen-drivers-licenses/',
    'https://driving-tests.org/florida/florida-permit-practice-test/',
  ],
  georgia: [
    'https://dds.georgia.gov/teen-drivers/instructional-permit',
    'https://driving-tests.org/georgia/georgia-permit-practice-test/',
  ],
  hawaii: [
    'https://hidot.hawaii.gov/highways/library/drivers-manuals/',
    'https://driving-tests.org/hawaii/hawaii-permit-practice-test/',
  ],
  idaho: [
    'https://itd.idaho.gov/driverservices/?target=knowledge-test',
    'https://driving-tests.org/idaho/idaho-permit-practice-test/',
  ],
  illinois: [
    'https://www.ilsos.gov/departments/drivers/drivers_license/dlguide.html',
    'https://driving-tests.org/illinois/illinois-permit-practice-test/',
  ],
  indiana: [
    'https://www.in.gov/bmv/licenses-permits-ids/drivers-licenses/',
    'https://driving-tests.org/indiana/indiana-permit-practice-test/',
  ],
  iowa: [
    'https://iowadot.gov/mvd/driverslicense/',
    'https://driving-tests.org/iowa/iowa-permit-practice-test/',
  ],
  kansas: [
    'https://www.ksrevenue.gov/dovindex.html',
    'https://driving-tests.org/kansas/kansas-permit-practice-test/',
  ],
  kentucky: [
    'https://drive.ky.gov/driver-licensing/Pages/Permit.aspx',
    'https://driving-tests.org/kentucky/kentucky-permit-practice-test/',
  ],
  louisiana: [
    'https://www.expresslane.org/Pages/PermitTesting.aspx',
    'https://driving-tests.org/louisiana/louisiana-permit-practice-test/',
  ],
  maine: [
    'https://www.maine.gov/sos/bmv/licenses/',
    'https://driving-tests.org/maine/maine-permit-practice-test/',
  ],
  maryland: [
    'https://mva.maryland.gov/drivers/Pages/written-test.aspx',
    'https://driving-tests.org/maryland/maryland-permit-practice-test/',
  ],
  massachusetts: [
    'https://www.mass.gov/learners-permit',
    'https://driving-tests.org/massachusetts/massachusetts-permit-practice-test/',
  ],
  michigan: [
    'https://www.michigan.gov/sos/license-id',
    'https://driving-tests.org/michigan/michigan-permit-practice-test/',
  ],
  minnesota: [
    'https://dps.mn.gov/divisions/dvs/Pages/default.aspx',
    'https://driving-tests.org/minnesota/minnesota-permit-practice-test/',
  ],
  mississippi: [
    'https://www.dps.ms.gov/driver-license',
    'https://driving-tests.org/mississippi/mississippi-permit-practice-test/',
  ],
  missouri: [
    'https://dor.mo.gov/driver-license/issuance/',
    'https://driving-tests.org/missouri/missouri-permit-practice-test/',
  ],
  montana: [
    'https://dojmt.gov/driving/',
    'https://driving-tests.org/montana/montana-permit-practice-test/',
  ],
  nebraska: [
    'https://dmv.nebraska.gov/dl/',
    'https://driving-tests.org/nebraska/nebraska-permit-practice-test/',
  ],
  nevada: [
    'https://dmv.nv.gov/dlfirst.htm',
    'https://driving-tests.org/nevada/nevada-permit-practice-test/',
  ],
  'new-hampshire': [
    'https://www.dmv.nh.gov/driver-licenses',
    'https://driving-tests.org/new-hampshire/new-hampshire-permit-practice-test/',
  ],
  'new-jersey': [
    'https://www.state.nj.us/mvc/license/index.shtml',
    'https://driving-tests.org/new-jersey/new-jersey-permit-practice-test/',
  ],
  'new-mexico': [
    'https://www.mvd.newmexico.gov/drivers/getting-your-license/',
    'https://driving-tests.org/new-mexico/new-mexico-permit-practice-test/',
  ],
  'new-york': [
    'https://dmv.ny.gov/driver-license/learner-permit',
    'https://driving-tests.org/new-york/new-york-permit-practice-test/',
  ],
  'north-carolina': [
    'https://www.ncdot.gov/dmv/license-id/drivers-license/Pages/default.aspx',
    'https://driving-tests.org/north-carolina/north-carolina-permit-practice-test/',
  ],
  'north-dakota': [
    'https://www.dot.nd.gov/divisions/driverslicense/',
    'https://driving-tests.org/north-dakota/north-dakota-permit-practice-test/',
  ],
  ohio: [
    'https://bmv.ohio.gov/drivers-license.aspx',
    'https://driving-tests.org/ohio/ohio-permit-practice-test/',
  ],
  oklahoma: [
    'https://oklahoma.gov/dps/driver-services.html',
    'https://driving-tests.org/oklahoma/oklahoma-permit-practice-test/',
  ],
  oregon: [
    'https://www.oregon.gov/odot/dmv/pages/driverid/instructpermit.aspx',
    'https://driving-tests.org/oregon/oregon-permit-practice-test/',
  ],
  pennsylvania: [
    'https://www.dmv.pa.gov/Driver-Services/Driver-Licensing/Pages/Knowledge-and-Skills-Testing.aspx',
    'https://driving-tests.org/pennsylvania/pennsylvania-permit-practice-test/',
  ],
  'rhode-island': [
    'https://dmv.ri.gov/licenses/permits/',
    'https://driving-tests.org/rhode-island/rhode-island-permit-practice-test/',
  ],
  'south-carolina': [
    'https://scdmvonline.com/Driver-Services',
    'https://driving-tests.org/south-carolina/south-carolina-permit-practice-test/',
  ],
  'south-dakota': [
    'https://dps.sd.gov/driver-licensing',
    'https://driving-tests.org/south-dakota/south-dakota-permit-practice-test/',
  ],
  tennessee: [
    'https://www.tn.gov/safety/driver-services/drivers-license-applicants.html',
    'https://driving-tests.org/tennessee/tennessee-permit-practice-test/',
  ],
  texas: [
    'https://www.dps.texas.gov/section/driver-license',
    'https://driving-tests.org/texas/texas-permit-practice-test/',
  ],
  utah: [
    'https://dld.utah.gov/general-information/',
    'https://driving-tests.org/utah/utah-permit-practice-test/',
  ],
  vermont: [
    'https://dmv.vermont.gov/licenses',
    'https://driving-tests.org/vermont/vermont-permit-practice-test/',
  ],
  virginia: [
    'https://www.dmv.virginia.gov/drivers/',
    'https://driving-tests.org/virginia/virginia-permit-practice-test/',
  ],
  washington: [
    'https://dol.wa.gov/driver-licenses-and-permits/get-driver-license/get-instruction-permit',
    'https://driving-tests.org/washington/washington-permit-practice-test/',
  ],
  'west-virginia': [
    'https://transportation.wv.gov/DMV/DriverServices/Pages/default.aspx',
    'https://driving-tests.org/west-virginia/west-virginia-permit-practice-test/',
  ],
  wisconsin: [
    'https://wisconsindot.gov/Pages/dmv/license-drvs/how-to-apply/teen.aspx',
    'https://driving-tests.org/wisconsin/wisconsin-permit-practice-test/',
  ],
  wyoming: [
    'https://www.dot.state.wy.us/home/driver_license_records.html',
    'https://driving-tests.org/wyoming/wyoming-permit-practice-test/',
  ],
};

// ── Helpers ──────────────────────────────────────────────────────────────

async function fetchTextWithTimeout(url, timeoutMs = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (DMVSOS Verification Bot)' },
      signal: ctrl.signal,
    });
    if (!r.ok) return null;
    const html = await r.text();
    // Strip HTML tags, collapse whitespace, cap length.
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .slice(0, 8000)
      .trim();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
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
    const text = await fetchTextWithTimeout(url);
    if (!text) {
      console.log(`  ✗ fetch failed: ${url}`);
      continue;
    }
    const parsed = await extractWithClaude(slug, url, text);
    if (parsed) {
      console.log(`  ${parsed.confidence?.toUpperCase() || '?'.padEnd(6)} ${url} → Q=${parsed.questions}, pass=${parsed.pass}, ${parsed.passPct}% [${parsed.evidence?.slice(0, 60)}]`);
      perSource.push({ url, ...parsed });
    } else {
      console.log(`  ! parse failed: ${url}`);
    }
  }
  // Consensus: prefer "high" confidence; if multiple, take the most common.
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
  const slugs = ONLY_STATE ? [ONLY_STATE] : Object.keys(STATE_SOURCES);
  console.log(`Verifying ${slugs.length} state(s), concurrency=${CONCURRENCY}\n`);

  const results = [];
  for (let i = 0; i < slugs.length; i += CONCURRENCY) {
    const batch = slugs.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(batch.map(slug => verifyState(slug, STATE_SOURCES[slug])));
    results.push(...batchResults);
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
