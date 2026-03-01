#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { PDFParse } = require('pdf-parse');

const TEXT_DIR = path.join(__dirname, '..', '.manuals-text');
const UA = 'Mozilla/5.0 (compatible; DMVSOSBot/1.0; +https://dmvsos.com)';

const MISSING = [
  { url: 'https://dds.georgia.gov/media/12806/download', out: 'georgia-motorcycle-en.txt' },
  { url: 'https://dps.sd.gov/application/files/3115/0161/2426/Motorcycle-Operator-Manual-July.2015.pdf', out: 'south-dakota-motorcycle-en.txt' },
];

async function downloadAndExtract(url, outName) {
  console.log('Downloading ' + outName + '...');
  const res = await fetch(url, {
    headers: { 'User-Agent': UA },
    redirect: 'follow',
    signal: AbortSignal.timeout(90000),
  });
  if (res.status !== 200) throw new Error(res.status + ' ' + res.statusText);
  const buffer = Buffer.from(await res.arrayBuffer());
  console.log('  Downloaded: ' + (buffer.length / 1024 / 1024).toFixed(1) + 'MB');

  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  const result = await parser.getText();
  const text = result.text.replace(/\r\n/g, '\n').replace(/\n{4,}/g, '\n\n\n').trim();

  fs.writeFileSync(path.join(TEXT_DIR, outName), text);
  console.log('  Extracted: ' + (text.length / 1024).toFixed(0) + 'K chars');
}

async function main() {
  for (const { url, out } of MISSING) {
    try {
      await downloadAndExtract(url, out);
    } catch (e) {
      console.error('  FAILED ' + out + ': ' + e.message);
    }
  }
  console.log('Done!');
}
main();
