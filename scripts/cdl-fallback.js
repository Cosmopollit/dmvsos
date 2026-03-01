#!/usr/bin/env node
/**
 * CDL Fallback: Use "All States CDL_Manual.pdf" to fill in missing CDL text files.
 * CDL questions are the same across all states (federal FMCSA manual).
 */

const fs = require('fs');
const path = require('path');
const { PDFParse } = require('pdf-parse');

const TEXT_DIR = path.join(__dirname, '..', '.manuals-text');
const CDL_PDF = '/tmp/dmv-manuals-local/ -DMV SOS TEST PLATFORM-/CDL Manuals/All States CDL_Manual.pdf';

// All 50 states + DC
const ALL_STATES = [
  'alabama','alaska','arizona','arkansas','california','colorado','connecticut',
  'delaware','florida','georgia','hawaii','idaho','illinois','indiana','iowa',
  'kansas','kentucky','louisiana','maine','maryland','massachusetts','michigan',
  'minnesota','mississippi','missouri','montana','nebraska','nevada','new-hampshire',
  'new-jersey','new-mexico','new-york','north-carolina','north-dakota','ohio',
  'oklahoma','oregon','pennsylvania','rhode-island','south-carolina','south-dakota',
  'tennessee','texas','utah','vermont','virginia','washington','west-virginia',
  'wisconsin','wyoming'
];

async function main() {
  // Extract text from All States CDL manual
  const buffer = fs.readFileSync(CDL_PDF);
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  const result = await parser.getText();
  const text = result.text.replace(/\r\n/g, '\n').replace(/\n{4,}/g, '\n\n\n').trim();
  console.log('All States CDL text:', (text.length / 1024).toFixed(0) + 'K chars');

  let created = 0, existed = 0;
  for (const state of ALL_STATES) {
    const cdlFile = path.join(TEXT_DIR, `${state}-cdl-en.txt`);
    if (fs.existsSync(cdlFile)) {
      existed++;
    } else {
      fs.writeFileSync(cdlFile, text);
      created++;
      console.log('  Created: ' + state + '-cdl-en.txt');
    }
  }
  console.log(`\nDone: ${created} created, ${existed} already existed`);

  // Also check missing motorcycle and car
  let missingMoto = [], missingCar = [];
  for (const state of ALL_STATES) {
    if (!fs.existsSync(path.join(TEXT_DIR, `${state}-motorcycle-en.txt`))) missingMoto.push(state);
    if (!fs.existsSync(path.join(TEXT_DIR, `${state}-car-en.txt`))) missingCar.push(state);
  }
  if (missingCar.length) console.log('\nMissing CAR manuals:', missingCar.join(', '));
  if (missingMoto.length) console.log('Missing MOTORCYCLE manuals:', missingMoto.join(', '));
}
main();
