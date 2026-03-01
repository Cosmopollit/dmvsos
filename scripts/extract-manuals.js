#!/usr/bin/env node
/**
 * Extract text from manual PDFs (Supabase Storage) for RAG context.
 *
 * Downloads PDFs from Supabase Storage -> extracts text via pdf-parse ->
 * saves to .manuals-text/{state}-{category}-{lang}.txt
 *
 * Usage:
 *   node scripts/extract-manuals.js                     # extract all
 *   node scripts/extract-manuals.js --state=california  # one state
 *   node scripts/extract-manuals.js --lang=en           # one language only
 *   node scripts/extract-manuals.js --force             # re-extract even if .txt exists
 *
 * Requires: SUPABASE_SERVICE_ROLE_KEY
 */

const fs = require('fs');
const path = require('path');
const { PDFParse } = require('pdf-parse');

async function extractText(buffer) {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  const result = await parser.getText();
  return result.text;
}

const SUPABASE_URL = 'https://yaogndpgnewqffbjrsgz.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = 'manuals';
const INDEX_URL = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/manuals-index.json`;
const OUTPUT_DIR = path.join(__dirname, '..', '.manuals-text');
const STATE_ARG = process.argv.find(a => a.startsWith('--state='))?.split('=')[1];
const LANG_ARG = process.argv.find(a => a.startsWith('--lang='))?.split('=')[1];
const FORCE = process.argv.includes('--force');

if (!SERVICE_KEY) { console.error('Set SUPABASE_SERVICE_ROLE_KEY env var'); process.exit(1); }

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function downloadFromStorage(storagePath) {
  const url = `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${storagePath}`;
  const res = await fetch(url, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!res.ok) throw new Error(`Download ${storagePath}: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

function cleanText(text) {
  // Normalize whitespace, remove excessive blank lines
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .replace(/[ \t]+$/gm, '')  // trailing spaces
    .trim();
}

async function main() {
  console.log('==============================================');
  console.log('  extract-manuals: PDF -> text for RAG');
  if (STATE_ARG) console.log(`  State: ${STATE_ARG}`);
  if (LANG_ARG) console.log(`  Language: ${LANG_ARG}`);
  console.log('==============================================\n');

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Fetch index
  console.log('Fetching manuals index...');
  const indexRes = await fetch(INDEX_URL);
  if (!indexRes.ok) {
    console.error('Failed to fetch manuals index. Run download-manuals.js first.');
    process.exit(1);
  }
  const index = await indexRes.json();

  let extracted = 0, skipped = 0, failed = 0, total = 0;

  for (const [state, categories] of Object.entries(index)) {
    if (STATE_ARG && state !== STATE_ARG) continue;

    for (const [category, langs] of Object.entries(categories)) {
      for (const [lang, publicUrl] of Object.entries(langs)) {
        if (LANG_ARG && lang !== LANG_ARG) continue;
        total++;

        const outFile = path.join(OUTPUT_DIR, `${state}-${category}-${lang}.txt`);
        if (!FORCE && fs.existsSync(outFile)) {
          skipped++;
          process.stdout.write('.');
          continue;
        }

        const storagePath = `${state}/${category}-${lang}.pdf`;

        try {
          const buffer = await downloadFromStorage(storagePath);
          const rawText = await extractText(buffer);
          const text = cleanText(rawText);

          if (text.length < 100) {
            console.log(`\n  [warn] ${storagePath}: extracted text too short (${text.length} chars)`);
            failed++;
            continue;
          }

          fs.writeFileSync(outFile, text);
          extracted++;
          process.stdout.write('+');
        } catch (e) {
          failed++;
          console.log(`\n  [err] ${storagePath}: ${e.message}`);
        }

        await sleep(200);
      }
    }
  }

  console.log(`\n\n  Done: ${extracted} extracted, ${skipped} skipped, ${failed} failed (${total} total)`);
  console.log(`  Output: ${OUTPUT_DIR}`);

  // Report sizes
  if (fs.existsSync(OUTPUT_DIR)) {
    const files = fs.readdirSync(OUTPUT_DIR).filter(f => f.endsWith('.txt'));
    const totalSize = files.reduce((sum, f) => {
      return sum + fs.statSync(path.join(OUTPUT_DIR, f)).size;
    }, 0);
    console.log(`  Total text files: ${files.length} (${(totalSize / 1024 / 1024).toFixed(1)} MB)`);
  }
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
