#!/usr/bin/env node
/**
 * Upload local PDF manuals from the Desktop zip to Supabase Storage
 * and extract text for RAG context.
 *
 * Reads from /tmp/dmv-manuals-local/ (unzipped), maps filenames to
 * state/category, uploads to Supabase Storage, extracts text.
 */

const fs = require('fs');
const path = require('path');
const { PDFParse } = require('pdf-parse');

const SUPABASE_URL = 'https://yaogndpgnewqffbjrsgz.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = 'manuals';
const BASE = '/tmp/dmv-manuals-local/ -DMV SOS TEST PLATFORM-';
const TEXT_DIR = path.join(__dirname, '..', '.manuals-text');
const DRY_RUN = process.argv.includes('--dry-run');

if (!SERVICE_KEY) { console.error('Set SUPABASE_SERVICE_ROLE_KEY env var'); process.exit(1); }

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Map filenames to state slugs
const STATE_MAP = {
  'alabama': 'alabama', 'alaska': 'alaska', 'arizona': 'arizona', 'arkansas': 'arkansas',
  'california': 'california', 'colorado': 'colorado', 'connecticut': 'connecticut',
  'delaware': 'delaware', 'florida': 'florida', 'georgia': 'georgia', 'hawaii': 'hawaii',
  'idaho': 'idaho', 'illinois': 'illinois', 'illionois': 'illinois', 'indiana': 'indiana',
  'iowa': 'iowa', 'kansas': 'kansas', 'kentucky': 'kentucky', 'louisiana': 'louisiana',
  'maine': 'maine', 'maryland': 'maryland', 'massachusetts': 'massachusetts',
  'michigan': 'michigan', 'minnesota': 'minnesota', 'mississippi': 'mississippi',
  'missouri': 'missouri', 'montana': 'montana', 'nebraska': 'nebraska', 'nevada': 'nevada',
  'new hampshire': 'new-hampshire', 'new jersey': 'new-jersey', 'new mexico': 'new-mexico',
  'new york': 'new-york', 'north carolina': 'north-carolina', 'north dakota': 'north-dakota',
  'north d': 'north-dakota', 'ohio': 'ohio', 'oklahoma': 'oklahoma', 'oregon': 'oregon',
  'pennsylvania': 'pennsylvania', 'rhode island': 'rhode-island', 'south carolina': 'south-carolina',
  'south dakota': 'south-dakota', 'tennessee': 'tennessee', 'texas': 'texas',
  'utah': 'utah', 'vermont': 'vermont', 'virginia': 'virginia', 'washington': 'washington',
  'west virginia': 'west-virginia', 'wisconsin': 'wisconsin', 'wyoming': 'wyoming',
  // Abbreviations in motorcycle filenames
  'va': 'virginia', 'wv': 'west-virginia', 'wa': 'washington', 'wi': 'wisconsin',
  'vn': 'vermont', 'wy': 'wyoming', 'tx': 'texas', 'tn': 'tennessee',
  'ut': 'utah', 'ok': 'oklahoma', 'sc': 'south-carolina', 'pa': 'pennsylvania',
  'oh': 'ohio', 'or': 'oregon', 'ri': 'rhode-island',
};

function guessState(filename) {
  const lower = filename.toLowerCase()
    .replace(/[_-]/g, ' ')
    .replace(/\.pdf.*$/, '')
    .replace(/\.crdownload/, '')
    .trim();

  // Try exact and partial matches
  for (const [key, slug] of Object.entries(STATE_MAP)) {
    if (lower.startsWith(key) || lower.includes(key)) return slug;
  }

  // Try first word
  const firstWord = lower.split(/\s+/)[0];
  if (STATE_MAP[firstWord]) return STATE_MAP[firstWord];

  return null;
}

async function storageUpload(storagePath, buffer) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${storagePath}`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/pdf', 'x-upsert': 'true',
    },
    body: buffer,
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Upload ${storagePath}: ${res.status} ${err}`);
  }
}

async function extractText(buffer) {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  const result = await parser.getText();
  return result.text;
}

function cleanText(text) {
  return text.replace(/\r\n/g, '\n').replace(/\n{4,}/g, '\n\n\n').replace(/[ \t]+$/gm, '').trim();
}

async function processDir(dirPath, category) {
  const files = fs.readdirSync(dirPath).filter(f => f.toLowerCase().endsWith('.pdf'));
  console.log(`\n  ${category.toUpperCase()}: ${files.length} files`);

  let uploaded = 0, skipped = 0, failed = 0;

  for (const file of files) {
    const state = guessState(file);
    if (!state) {
      console.log(`    [skip] Cannot determine state: ${file}`);
      skipped++;
      continue;
    }

    // Skip "All States" generic manual
    if (file.toLowerCase().includes('all states')) {
      console.log(`    [skip] Generic: ${file}`);
      skipped++;
      continue;
    }

    const storagePath = `${state}/${category}-en.pdf`;
    const textFile = path.join(TEXT_DIR, `${state}-${category}-en.txt`);

    // Skip if text already exists (already processed)
    if (fs.existsSync(textFile) && !process.argv.includes('--force')) {
      process.stdout.write('.');
      skipped++;
      continue;
    }

    const fullPath = path.join(dirPath, file);

    try {
      const buffer = fs.readFileSync(fullPath);
      const sizeMB = (buffer.length / 1024 / 1024).toFixed(1);

      // Upload to Supabase Storage
      if (!DRY_RUN) {
        await storageUpload(storagePath, buffer);
      }

      // Extract text
      const rawText = await extractText(buffer);
      const text = cleanText(rawText);
      if (text.length < 100) {
        console.log(`    [warn] ${state}/${category}: text too short (${text.length} chars) - ${file}`);
        failed++;
        continue;
      }
      fs.mkdirSync(TEXT_DIR, { recursive: true });
      fs.writeFileSync(textFile, text);

      uploaded++;
      console.log(`    [ok] ${state}/${category} (${sizeMB}MB, ${(text.length/1024).toFixed(0)}K text) <- ${file}`);
    } catch (e) {
      failed++;
      console.log(`    [err] ${state}/${category}: ${e.message.substring(0, 100)} <- ${file}`);
    }

    await sleep(300);
  }

  return { uploaded, skipped, failed };
}

async function main() {
  console.log('==============================================');
  console.log('  Upload local manuals -> Supabase + text');
  console.log(`  Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log('==============================================');

  fs.mkdirSync(TEXT_DIR, { recursive: true });

  const dirs = [
    { path: path.join(BASE, 'Auto Driver guides'), category: 'car' },
    { path: path.join(BASE, 'CDL Manuals'), category: 'cdl' },
    { path: path.join(BASE, 'Motorcycle Operators_ Manual'), category: 'motorcycle' },
  ];

  let totalUp = 0, totalSkip = 0, totalFail = 0;
  for (const { path: dirPath, category } of dirs) {
    if (!fs.existsSync(dirPath)) {
      console.log(`  [missing] ${dirPath}`);
      continue;
    }
    const { uploaded, skipped, failed } = await processDir(dirPath, category);
    totalUp += uploaded;
    totalSkip += skipped;
    totalFail += failed;
  }

  console.log(`\n  Done: ${totalUp} uploaded+extracted, ${totalSkip} skipped, ${totalFail} failed`);

  // Report text coverage
  const textFiles = fs.readdirSync(TEXT_DIR).filter(f => f.endsWith('.txt'));
  const totalSize = textFiles.reduce((sum, f) => sum + fs.statSync(path.join(TEXT_DIR, f)).size, 0);
  console.log(`  Total text files: ${textFiles.length} (${(totalSize / 1024 / 1024).toFixed(1)} MB)`);

  // Now update manuals-index.json
  if (!DRY_RUN) {
    console.log('\n  Updating manuals-index.json...');
    // Fetch current index
    const indexRes = await fetch(`${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/manuals-index.json`);
    let index = {};
    if (indexRes.ok) index = await indexRes.json();

    // Add new entries
    for (const { category } of dirs) {
      const files = fs.readdirSync(TEXT_DIR).filter(f => f.endsWith(`-${category}-en.txt`));
      for (const f of files) {
        const state = f.replace(`-${category}-en.txt`, '');
        if (!index[state]) index[state] = {};
        if (!index[state][category]) index[state][category] = {};
        index[state][category].en = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${state}/${category}-en.pdf`;
      }
    }

    const indexBuffer = Buffer.from(JSON.stringify(index, null, 2));
    await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/manuals-index.json`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json', 'x-upsert': 'true',
      },
      body: indexBuffer,
    });
    console.log(`  Index updated: ${Object.keys(index).length} states`);
  }
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
