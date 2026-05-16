#!/usr/bin/env node
/**
 * Check if our question translations appear on other sites = signal we've been scraped.
 *
 * Strategy:
 *   1. Pull distinctive questions per language (long, has manual_reference,
 *      not English to avoid generic phrasing).
 *   2. Search each phrase via DuckDuckGo HTML (no API key needed).
 *   3. Report any hits that aren't dmvsos.com domains.
 *
 * Usage:
 *   node scripts/leak-detection.js
 *   node scripts/leak-detection.js --per-lang=5  # quick check
 *
 * Limitations:
 *   - DuckDuckGo HTML scraping is throttled; this is slow on purpose (~3s between queries)
 *   - Some clones won't be indexed by search engines yet
 *   - Generic question phrasing produces false positives
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

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY };

const args = process.argv.slice(2);
const argVal = (k) => args.find(a => a.startsWith(`--${k}=`))?.split('=')[1];
const PER_LANG = parseInt(argVal('per-lang') || '10', 10);

const LANGS = ['ru', 'ua', 'es', 'zh'];
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';

async function pickSamples(lang) {
  // Distinctive: longish question_text, has manual_reference (we wrote it),
  // not too short (>60 chars), not too long (<200 to fit search query).
  const url = `${SUPA_URL}/rest/v1/questions?language=eq.${lang}&manual_reference=not.is.null&select=id,state,category,question_text&limit=200`;
  const r = await fetch(url, { headers: H });
  if (!r.ok) throw new Error(`fetch lang=${lang}: ${r.status}`);
  const all = await r.json();
  const filtered = all.filter(q => {
    const t = q.question_text || '';
    return t.length >= 60 && t.length <= 180;
  });
  // Shuffle + take N
  for (let i = filtered.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [filtered[i], filtered[j]] = [filtered[j], filtered[i]];
  }
  return filtered.slice(0, PER_LANG);
}

async function searchDdg(phrase) {
  // DuckDuckGo HTML search. Returns top result URLs.
  const url = 'https://html.duckduckgo.com/html/?q=' + encodeURIComponent('"' + phrase + '"');
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' },
    });
    if (!r.ok) return { error: `http ${r.status}` };
    const html = await r.text();
    // Extract result URLs (DDG HTML format: <a class="result__a" href="...">)
    const urls = [];
    const re = /<a[^>]+class="result__a"[^>]+href="([^"]+)"/g;
    let m;
    while ((m = re.exec(html)) !== null) {
      let u = m[1];
      // DDG often wraps URLs in tracking redirect; extract real URL
      if (u.startsWith('//duckduckgo.com/l/')) {
        try {
          const parsed = new URL('https:' + u);
          const uddg = parsed.searchParams.get('uddg');
          if (uddg) u = decodeURIComponent(uddg);
        } catch { /* keep as is */ }
      }
      if (u.startsWith('//')) u = 'https:' + u;
      urls.push(u);
      if (urls.length >= 10) break;
    }
    return { urls };
  } catch (e) {
    return { error: e.message };
  }
}

function isUsDomain(url) {
  try {
    const u = new URL(url);
    return u.hostname.includes('dmvsos.com') || u.hostname.includes('localhost');
  } catch { return false; }
}

(async () => {
  console.log('Leak detection scan');
  console.log('Sampling ' + PER_LANG + ' questions per language: ' + LANGS.join(', '));
  console.log();

  const findings = [];
  for (const lang of LANGS) {
    console.log('=== ' + lang.toUpperCase() + ' ===');
    let samples;
    try { samples = await pickSamples(lang); }
    catch (e) { console.error('  sample failed: ' + e.message); continue; }
    if (samples.length === 0) {
      console.log('  no qualifying questions');
      continue;
    }
    for (const q of samples) {
      const snippet = q.question_text.slice(0, 60).replace(/\s+/g, ' ');
      process.stdout.write('  searching: "' + snippet + '..."');
      const res = await searchDdg(q.question_text);
      if (res.error) {
        console.log(' -> error: ' + res.error);
        await new Promise(r => setTimeout(r, 3000));
        continue;
      }
      const externalHits = (res.urls || []).filter(u => !isUsDomain(u));
      if (externalHits.length === 0) {
        console.log(' ✓ no external hits');
      } else {
        console.log(' ⚠️  ' + externalHits.length + ' external hits');
        for (const u of externalHits.slice(0, 3)) console.log('     -> ' + u);
        findings.push({ lang, state: q.state, category: q.category, question_id: q.id, question: q.question_text, hits: externalHits });
      }
      // Polite throttle so DDG doesn't block us
      await new Promise(r => setTimeout(r, 3000));
    }
    console.log();
  }

  console.log('=== Summary ===');
  console.log('Total checked: ' + PER_LANG * LANGS.length);
  console.log('Questions with external hits: ' + findings.length);
  if (findings.length > 0) {
    const outPath = 'leak-detection-report.json';
    fs.writeFileSync(outPath, JSON.stringify(findings, null, 2));
    console.log('Report: ' + outPath);
    // Cluster by domain
    const byDomain = {};
    for (const f of findings) {
      for (const u of f.hits) {
        try { const d = new URL(u).hostname; byDomain[d] = (byDomain[d] || 0) + 1; } catch {}
      }
    }
    console.log();
    console.log('Top external domains:');
    for (const [d, c] of Object.entries(byDomain).sort((a, b) => b[1] - a[1]).slice(0, 10)) {
      console.log('  ' + c + ' hits  -  ' + d);
    }
  } else {
    console.log('Clean. No evidence of scraping detected today.');
  }
})();
