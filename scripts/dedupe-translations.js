const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'lib', 'translations.js');
const DRY = process.argv.includes('--dry-run');

const src = fs.readFileSync(FILE, 'utf8');
const lines = src.split('\n');

const langs = ['en', 'ru', 'es', 'zh', 'ua'];
const blocks = [];

for (const lang of langs) {
  const re = new RegExp('^  ' + lang + ':\\s*\\{');
  let startLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i])) { startLine = i; break; }
  }
  if (startLine < 0) { console.error('missing lang block: ' + lang); continue; }
  let depth = 0, endLine = -1;
  for (let li = startLine; li < lines.length && endLine < 0; li++) {
    for (const ch of lines[li]) {
      if (ch === '{') depth++;
      else if (ch === '}') { depth--; if (depth === 0) { endLine = li; break; } }
    }
  }
  blocks.push({ lang, startLine, endLine });
}

const keyRe = /^(\s+)([a-zA-Z_][\w]*)\s*:\s*(.*)$/;
const linesToDrop = new Set();
const stats = {};
const droppedKeys = {};

for (const b of blocks) {
  const seen = new Map();
  const dropped = [];
  for (let li = b.startLine + 1; li < b.endLine; li++) {
    const m = lines[li].match(keyRe);
    if (!m) continue;
    if (m[1].length !== 4) continue;
    const key = m[2];
    const valueStart = m[3];

    let endOfEntry = li;
    const looksComplete = valueStart.endsWith(',') || /^'.*',$/.test(valueStart) || /^".*",$/.test(valueStart) || /^\d+,$/.test(valueStart) || /^(true|false|null),$/.test(valueStart) || /^\[.*\],$/.test(valueStart);

    if (!looksComplete) {
      if (/^\[/.test(valueStart)) {
        for (let j = li + 1; j < b.endLine; j++) {
          if (/^\s{4}\],?\s*$/.test(lines[j])) { endOfEntry = j; break; }
        }
      } else {
        endOfEntry = li;
      }
    }

    if (seen.has(key)) {
      for (let j = li; j <= endOfEntry; j++) linesToDrop.add(j);
      dropped.push({ key, atLine: li + 1, kept: seen.get(key) + 1 });
    } else {
      seen.set(key, li);
    }
    li = endOfEntry;
  }
  stats[b.lang] = dropped.length;
  droppedKeys[b.lang] = dropped;
}

console.log('Drops per language:', stats);
console.log('Total lines to drop:', linesToDrop.size);
console.log('\nEN drops:');
droppedKeys.en.forEach(d => console.log(`  line ${d.atLine}: ${d.key}  (keeping line ${d.kept})`));

if (DRY) {
  console.log('\n(dry-run — not writing)');
  process.exit(0);
}

const kept = lines.filter((_, i) => !linesToDrop.has(i));
const out = kept.join('\n');
fs.writeFileSync(FILE, out, 'utf8');
console.log('\nWritten: ' + FILE);
