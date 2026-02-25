#!/usr/bin/env node
/**
 * Download MUTCD road sign PNGs from Wikimedia Commons.
 * US road signs (MUTCD) are public domain — free to use.
 * Output: /public/signs/<id>.png (~240px thumbnails)
 */

const fs = require('fs');
const path = require('path');

const SIGNS_DIR = path.join(__dirname, '..', 'public', 'signs');
const THUMB_WIDTH = 240;
const UA = 'DMVSOSSignDownloader/1.0 (https://dmvsos.com)';

// MUTCD signs commonly referenced in DMV tests
// id = local filename, file = Wikimedia Commons filename
const SIGNS = [
  { id: 'stop', file: 'MUTCD_R1-1.svg' },
  { id: 'yield', file: 'MUTCD_R1-2.svg' },
  { id: 'speed-limit', file: 'MUTCD_R2-1.svg' },
  { id: 'do-not-enter', file: 'MUTCD_R5-1.svg' },
  { id: 'wrong-way', file: 'MUTCD_R5-1a.svg' },
  { id: 'no-u-turn', file: 'MUTCD_R3-4.svg' },
  { id: 'no-left-turn', file: 'MUTCD_R3-2.svg' },
  { id: 'no-right-turn', file: 'MUTCD_R3-1.svg' },
  { id: 'one-way', file: 'MUTCD_R6-1R.svg' },
  { id: 'keep-right', file: 'MUTCD_R4-7.svg' },
  { id: 'no-passing', file: 'MUTCD_R4-1.svg' },
  { id: 'railroad-warning', file: 'MUTCD_W10-1.svg' },
  { id: 'railroad-crossbuck', file: 'MUTCD_R15-1.svg' },
  { id: 'school-zone', file: 'MUTCD_S1-1.svg' },
  { id: 'pedestrian-crossing', file: 'MUTCD_W11-2.svg' },
  { id: 'merge', file: 'MUTCD_W4-1.svg' },
  { id: 'curve-right', file: 'MUTCD_W1-2R.svg' },
  { id: 'winding-road', file: 'MUTCD_W1-5R.svg' },
  { id: 'slippery', file: 'MUTCD_W8-5.svg' },
  { id: 'divided-highway', file: 'MUTCD_W6-1.svg' },
  { id: 'two-way-traffic', file: 'MUTCD_W6-3.svg' },
  { id: 'hill', file: 'MUTCD_W7-1.svg' },
  { id: 'deer-crossing', file: 'MUTCD_W11-3.svg' },
  { id: 'road-work', file: 'MUTCD_W20-1.svg' },
  { id: 'signal-ahead', file: 'MUTCD_W3-3.svg' },
  { id: 'stop-ahead', file: 'MUTCD_W3-1.svg' },
  { id: 'sharp-turn', file: 'MUTCD_W1-1R.svg' },
  { id: 'lane-ends', file: 'MUTCD_W4-2.svg' },
  { id: 'narrow-bridge', file: 'MUTCD_W5-2.svg' },
  { id: 'advisory-speed', file: 'MUTCD_W13-1P.svg' },
];

async function getThumbUrl(filename) {
  const url = `https://commons.wikimedia.org/w/api.php?action=query&titles=File:${encodeURIComponent(filename)}&prop=imageinfo&iiprop=url&iiurlwidth=${THUMB_WIDTH}&format=json`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) return null;
  const data = await res.json();
  const pages = data?.query?.pages;
  if (!pages) return null;
  const page = Object.values(pages)[0];
  if (page.missing !== undefined) return null;
  return page?.imageinfo?.[0]?.thumburl || null;
}

async function downloadFile(url, dest) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buffer);
  return buffer.length;
}

async function main() {
  fs.mkdirSync(SIGNS_DIR, { recursive: true });

  let downloaded = 0, failed = 0, skipped = 0;

  for (const sign of SIGNS) {
    const dest = path.join(SIGNS_DIR, `${sign.id}.png`);
    if (fs.existsSync(dest)) {
      skipped++;
      console.log(`  [skip] ${sign.id} (already exists)`);
      continue;
    }

    try {
      const thumbUrl = await getThumbUrl(sign.file);
      if (!thumbUrl) {
        failed++;
        console.log(`  [miss] ${sign.id} (${sign.file} not found on Commons)`);
        continue;
      }
      const bytes = await downloadFile(thumbUrl, dest);
      downloaded++;
      console.log(`  [ok]   ${sign.id} (${(bytes / 1024).toFixed(1)} KB)`);
    } catch (e) {
      failed++;
      console.log(`  [err]  ${sign.id}: ${e.message}`);
    }
    // Be nice to Wikimedia
    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`\nDone: ${downloaded} downloaded, ${skipped} skipped, ${failed} failed`);
  console.log(`Signs directory: ${SIGNS_DIR}`);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
