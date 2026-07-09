// Download all 50 US state flags to public/flags/{slug}.png.
// Source: Wikimedia Commons (US state flags are public domain). We pull the
// PNG thumbnail render (?width=) instead of the raw SVGs — several state
// flags carry full state seals and weigh 1MB+ as SVG; the 128px PNG is ~10KB.
//   node scripts/download-state-flags.mjs
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { STATE_META } from '../lib/manual-data.js';

const WIDTH = 128;
const OUT = new URL('../public/flags/', import.meta.url);
mkdirSync(OUT, { recursive: true });

// Wikimedia file title per slug. Default: Flag_of_<Title Case with spaces>.
const SPECIAL = {
  georgia: 'Flag_of_Georgia_(U.S._state).svg', // plain "Georgia" is the country
};

function titleFor(slug) {
  if (SPECIAL[slug]) return SPECIAL[slug];
  const name = slug.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
  return `Flag_of_${name.replaceAll(' ', '_')}.svg`;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const slugs = Object.keys(STATE_META);
let ok = 0, failed = [];
for (const slug of slugs) {
  const dest = new URL(`${slug}.png`, OUT);
  if (existsSync(dest)) { ok++; continue; } // resume-friendly
  const url = `https://commons.wikimedia.org/wiki/Special:FilePath/${titleFor(slug)}?width=${WIDTH}`;
  let saved = false;
  // Commons rate-limits bursts (429) — pace requests and back off on 429.
  for (let attempt = 0; attempt < 4 && !saved; attempt++) {
    if (attempt > 0) await sleep(5000 * attempt);
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'DMVSOS-flag-fetch/1.0 (dmvsos.com)' }, redirect: 'follow' });
      const buf = Buffer.from(await r.arrayBuffer());
      if (r.status === 429) continue;
      // PNG magic + sanity size; Commons serves an HTML error page on misses.
      if (!r.ok || buf.length < 1000 || buf[0] !== 0x89 || buf[1] !== 0x50) break;
      writeFileSync(dest, buf);
      ok++; saved = true;
      process.stdout.write(`${slug} `);
    } catch { /* retry */ }
  }
  if (!saved) failed.push(slug);
  await sleep(1200);
}
console.log(`\n${ok}/${slugs.length} flags saved to public/flags/`);
if (failed.length) { console.log('FAILED:', failed.join(', ')); process.exit(1); }
