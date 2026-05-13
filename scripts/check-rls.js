// Probe RLS by querying tables with the ANON key (no auth session).
// If a query returns rows, RLS is either disabled or has an overly broad
// public-read policy. Read-only — no writes.
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = readFileSync(join(__dirname, '..', '.env.local'), 'utf8');
const get = (k) => env.split('\n').find(l => l.startsWith(k + '='))?.slice(k.length + 1)?.trim();
const URL = get('NEXT_PUBLIC_SUPABASE_URL');
const ANON = get('NEXT_PUBLIC_SUPABASE_ANON_KEY');
const SERVICE = get('SUPABASE_SERVICE_ROLE_KEY');

if (!URL || !ANON) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
  process.exit(1);
}

const tables = ['profiles', 'test_sessions', 'questions'];

async function probe(table, key) {
  const res = await fetch(`${URL}/rest/v1/${table}?select=*&limit=3`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
  });
  const text = await res.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  const isArray = Array.isArray(parsed);
  const rowCount = isArray ? parsed.length : 'n/a';
  let countHint = null;
  if (isArray) {
    const head = await fetch(`${URL}/rest/v1/${table}?select=*`, {
      method: 'HEAD',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Prefer: 'count=exact',
      },
    });
    countHint = head.headers.get('content-range');
  }
  return { table, status: res.status, isArray, rowCount, sample: isArray && parsed[0] ? Object.keys(parsed[0]) : parsed, countHint };
}

for (const t of tables) {
  const anon = await probe(t, ANON);
  const svc = SERVICE ? await probe(t, SERVICE) : null;
  console.log(`\n=== ${t} ===`);
  console.log(`anon:    HTTP ${anon.status} | rows=${anon.rowCount} | total=${anon.countHint || 'n/a'}`);
  if (svc) {
    console.log(`service: HTTP ${svc.status} | rows=${svc.rowCount} | total=${svc.countHint || 'n/a'}`);
  }
  if (!anon.isArray) console.log(`anon response: ${JSON.stringify(anon.sample).slice(0, 200)}`);

  // Verdict
  const anonTotal = anon.countHint?.split('/')?.[1];
  const svcTotal = svc?.countHint?.split('/')?.[1];
  if (svc && svcTotal && svcTotal !== '0') {
    if (anonTotal === '0') {
      console.log(`✅ RLS BLOCKS anon (table has ${svcTotal} rows but anon sees 0)`);
    } else if (anonTotal === svcTotal) {
      console.log(`⚠️  anon sees ALL ${anonTotal} rows — RLS either disabled or public-read`);
    } else {
      console.log(`? anon sees ${anonTotal}, service sees ${svcTotal} — partial visibility`);
    }
  }
}
