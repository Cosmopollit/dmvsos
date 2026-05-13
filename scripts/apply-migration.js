// Apply a SQL migration via direct Postgres connection.
//
// Usage:
//   node scripts/apply-migration.js migrations/FILE.sql           # dry-run (auto wraps BEGIN/ROLLBACK)
//   node scripts/apply-migration.js migrations/FILE.sql --commit  # really apply (BEGIN/COMMIT)
//
// Reads SUPABASE_DB_URL from .env.local.

import pg from 'pg';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const envFile = readFileSync(join(root, '.env.local'), 'utf8');
const env = (k) => envFile.split('\n').find(l => l.startsWith(k + '='))?.slice(k.length + 1)?.trim();

const dbUrl = env('SUPABASE_DB_URL');
if (!dbUrl) { console.error('Missing SUPABASE_DB_URL in .env.local'); process.exit(1); }

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith('--'));
const commit = args.includes('--commit');

if (!file) { console.error('Usage: node scripts/apply-migration.js <file.sql> [--commit]'); process.exit(1); }

const sql = readFileSync(join(root, file), 'utf8');

// Strip an existing trailing BEGIN/ROLLBACK/COMMIT — we manage the transaction ourselves
const cleaned = sql
  .replace(/^\s*BEGIN\s*;\s*$/gim, '')
  .replace(/^\s*COMMIT\s*;\s*$/gim, '')
  .replace(/^\s*ROLLBACK\s*;\s*$/gim, '')
  .replace(/^\s*--\s*COMMIT\s*;\s*$/gim, '');

// Supabase direct host often resolves to IPv6, which is unreachable from many
// local networks. Resolve hostname to IPv4 ourselves before connecting.
import dns from 'dns/promises';
const url = new URL(dbUrl);
const ipv4 = (await dns.lookup(url.hostname, { family: 4 })).address;
console.log(`Resolved ${url.hostname} → ${ipv4} (IPv4)`);

const client = new pg.Client({
  host: ipv4,
  port: Number(url.port || 5432),
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: url.pathname.replace(/^\//, ''),
  ssl: { rejectUnauthorized: false, servername: url.hostname },
});

console.log(`Connecting to Supabase Postgres…`);
await client.connect();

const mode = commit ? 'COMMIT' : 'ROLLBACK (dry-run)';
console.log(`Running migration: ${file}  [${mode}]`);
console.log('─'.repeat(60));

try {
  await client.query('BEGIN');

  // Run the migration as a single batch — captures NOTICEs and result sets
  client.on('notice', (n) => console.log(`NOTICE: ${n.message}`));
  const results = await client.query({ text: cleaned, rowMode: undefined });

  // pg returns either a single result or an array if multiple statements
  const allResults = Array.isArray(results) ? results : [results];

  for (const r of allResults) {
    if (r.command && r.rows && r.rows.length > 0) {
      console.log(`\n=== ${r.command} (${r.rowCount} rows) ===`);
      console.table(r.rows);
    } else if (r.command) {
      console.log(`${r.command}${r.rowCount != null ? ` (${r.rowCount})` : ''}`);
    }
  }

  if (commit) {
    await client.query('COMMIT');
    console.log('\n✓ COMMIT — migration applied');
  } else {
    await client.query('ROLLBACK');
    console.log('\n↩ ROLLBACK — nothing committed (dry-run)');
    console.log('  Re-run with --commit to apply for real.');
  }
} catch (err) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('\n✗ ERROR:', err.message);
  if (err.position) console.error('  position:', err.position);
  if (err.hint)     console.error('  hint:', err.hint);
  if (err.detail)   console.error('  detail:', err.detail);
  process.exit(1);
} finally {
  await client.end();
}
