#!/usr/bin/env node
/**
 * Full offline backup of DMVSOS.
 *
 * Backs up:
 *   - Supabase auth.users (admin API)
 *   - All public schema tables (REST API, keyset paginated)
 *   - Supabase Storage 'manuals' bucket (all PDFs + index)
 *
 * Output: ./backups/<timestamp>/
 *   ├── auth-users.json
 *   ├── tables/<table_name>.json (one per table)
 *   ├── manuals/<state>/<file>.pdf
 *   ├── manuals-index.json
 *   └── manifest.json (timestamp, counts, environment)
 *
 * After running, you can compress + encrypt:
 *   tar czf backup-DATE.tar.gz ./backups/DATE
 *   gpg --symmetric --cipher-algo AES256 backup-DATE.tar.gz
 *   (gives backup-DATE.tar.gz.gpg — store on external drive / Backblaze)
 *
 * Usage:
 *   node scripts/backup-all.js
 *   node scripts/backup-all.js --skip-storage   # faster, code+data only
 *   node scripts/backup-all.js --out=/Volumes/MyExternalDrive/dmvsos-backup
 *
 * Recommended cadence: daily via cron/launchd, or before any risky DB change.
 */

'use strict';

const fs = require('fs');
const path = require('path');

try {
  const txt = fs.readFileSync('.env.local', 'utf8');
  for (const line of txt.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch (_) {}

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPA_KEY) { console.error('Missing SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }

const args = process.argv.slice(2);
const argVal = (k) => args.find(a => a.startsWith(`--${k}=`))?.split('=')[1];
const SKIP_STORAGE = args.includes('--skip-storage');
const OUT_BASE = argVal('out') || path.join(__dirname, '..', 'backups');

const H = { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY };

// Tables to back up. Service role bypasses RLS so we get full data.
const TABLES = [
  'profiles',
  'questions',
  'purchases',
  'active_passes',
  'test_sessions',
  'bot_groups',
  'bot_user_prefs',
  'bot_keyword_hits',
  'experiment_exposures',
  'question_reports',
];

function ts() {
  const d = new Date();
  return d.getFullYear() + '-'
    + String(d.getMonth() + 1).padStart(2, '0') + '-'
    + String(d.getDate()).padStart(2, '0') + 'T'
    + String(d.getHours()).padStart(2, '0')
    + String(d.getMinutes()).padStart(2, '0');
}

async function dumpAuthUsers(dir) {
  console.log('  Dumping auth.users...');
  const all = [];
  let page = 1;
  while (true) {
    const res = await fetch(`${SUPA_URL}/auth/v1/admin/users?per_page=1000&page=${page}`, { headers: H });
    if (!res.ok) throw new Error(`auth.users: ${res.status} ${await res.text()}`);
    const data = await res.json();
    const users = data.users || [];
    if (users.length === 0) break;
    all.push(...users);
    if (users.length < 1000) break;
    page++;
  }
  fs.writeFileSync(path.join(dir, 'auth-users.json'), JSON.stringify(all, null, 2));
  console.log('    ' + all.length + ' users');
  return all.length;
}

async function dumpTable(table, dir) {
  process.stdout.write('  ' + table.padEnd(28));
  const all = [];
  const PAGE = 1000;
  // Try keyset by id -> created_at -> updated_at -> no-order Range fallback.
  const candidates = ['id', 'created_at', 'updated_at', null];
  let keysetField = candidates[0];
  let lastVal = null;
  let candIdx = 0;
  while (true) {
    const params = new URLSearchParams({ select: '*', limit: String(PAGE) });
    if (keysetField) {
      params.set('order', keysetField + '.asc');
      if (lastVal != null) params.set(keysetField, 'gt.' + lastVal);
    }
    let res;
    try {
      const headers = keysetField ? H : { ...H, Range: '0-' + (PAGE - 1) };
      res = await fetch(`${SUPA_URL}/rest/v1/${table}?${params}`, { headers });
    } catch (e) { console.log(' fetch error: ' + e.message); return -1; }

    if (!res.ok) {
      const text = await res.text();
      // Table missing
      if (res.status === 404) {
        console.log(' MISSING (skip)');
        return -1;
      }
      // Field not present — try next candidate
      if (res.status === 400 && candIdx < candidates.length - 1) {
        candIdx++;
        keysetField = candidates[candIdx];
        lastVal = null;
        if (keysetField === null) all.length = 0; // restart with no-order
        continue;
      }
      console.log(' ERROR ' + res.status + ': ' + text.slice(0, 80));
      return -1;
    }
    const batch = await res.json();
    if (batch.length === 0) break;
    all.push(...batch);
    if (!keysetField) break; // no-order fallback: one page only
    lastVal = batch[batch.length - 1][keysetField];
    if (batch.length < PAGE) break;
  }
  fs.writeFileSync(path.join(dir, table + '.json'), JSON.stringify(all, null, 2));
  console.log(' ' + all.length + ' rows' + (keysetField === null ? ' (no order)' : ''));
  return all.length;
}

async function downloadManuals(dir) {
  console.log('  Downloading manuals from Storage...');
  fs.mkdirSync(dir, { recursive: true });

  // First grab the index
  const indexUrl = SUPA_URL + '/storage/v1/object/public/manuals/manuals-index.json';
  const indexRes = await fetch(indexUrl);
  if (!indexRes.ok) { console.warn('    index fetch failed: ' + indexRes.status); return 0; }
  const indexBuf = await indexRes.arrayBuffer();
  fs.writeFileSync(path.join(dir, 'manuals-index.json'), Buffer.from(indexBuf));
  const idx = JSON.parse(Buffer.from(indexBuf).toString('utf8'));

  // Walk every state/category/lang URL
  let downloaded = 0, failed = 0, totalBytes = 0;
  for (const [state, cats] of Object.entries(idx)) {
    const stateDir = path.join(dir, state);
    fs.mkdirSync(stateDir, { recursive: true });
    for (const [cat, langs] of Object.entries(cats || {})) {
      for (const [lang, url] of Object.entries(langs || {})) {
        const fname = cat + '-' + lang + '.pdf';
        const dest = path.join(stateDir, fname);
        // Skip if already exists same-day backup
        if (fs.existsSync(dest)) { downloaded++; continue; }
        try {
          const r = await fetch(url);
          if (!r.ok) { failed++; continue; }
          const buf = Buffer.from(await r.arrayBuffer());
          fs.writeFileSync(dest, buf);
          totalBytes += buf.length;
          downloaded++;
          if (downloaded % 10 === 0) process.stdout.write('\r    ' + downloaded + ' files...');
        } catch { failed++; }
      }
    }
  }
  console.log('\r    ' + downloaded + ' files, ' + (totalBytes / 1024 / 1024).toFixed(1) + ' MB, ' + failed + ' failed');
  return downloaded;
}

(async () => {
  const tag = ts();
  const dir = path.join(OUT_BASE, tag);
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(dir, 'tables'), { recursive: true });

  console.log('Backup target: ' + dir);
  console.log();

  const manifest = {
    timestamp: new Date().toISOString(),
    supabase_url: SUPA_URL,
    tag,
    counts: {},
  };

  // 1. auth.users
  try { manifest.counts.auth_users = await dumpAuthUsers(dir); }
  catch (e) { console.error('  auth.users failed: ' + e.message); manifest.counts.auth_users = 'FAILED'; }

  // 2. public tables
  console.log('  Dumping public tables...');
  for (const t of TABLES) {
    try { manifest.counts[t] = await dumpTable(t, path.join(dir, 'tables')); }
    catch (e) { console.error('    ' + t + ' failed: ' + e.message); manifest.counts[t] = 'FAILED'; }
  }

  // 3. Storage
  if (SKIP_STORAGE) {
    console.log('  --skip-storage: skipping manuals download');
  } else {
    try { manifest.counts.storage_files = await downloadManuals(path.join(dir, 'manuals')); }
    catch (e) { console.error('  storage failed: ' + e.message); manifest.counts.storage_files = 'FAILED'; }
  }

  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));

  // Summary + size
  function dirSize(p) {
    let sum = 0;
    for (const entry of fs.readdirSync(p, { withFileTypes: true })) {
      const full = path.join(p, entry.name);
      if (entry.isDirectory()) sum += dirSize(full);
      else sum += fs.statSync(full).size;
    }
    return sum;
  }
  const totalMb = (dirSize(dir) / 1024 / 1024).toFixed(1);

  console.log();
  console.log('Done. ' + totalMb + ' MB written to:');
  console.log('  ' + dir);
  console.log();
  console.log('Next step (recommended):');
  console.log('  cd "' + OUT_BASE + '"');
  console.log('  tar czf ' + tag + '.tar.gz "' + tag + '"');
  console.log('  gpg --symmetric --cipher-algo AES256 ' + tag + '.tar.gz');
  console.log('  # Copy ' + tag + '.tar.gz.gpg to external drive / Backblaze / iCloud');
})();
