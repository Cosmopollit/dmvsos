import pg from 'pg';
import dns from 'dns/promises';
import { readFileSync } from 'fs';

const env = readFileSync('.env.local', 'utf8');
const get = (k) => env.split('\n').find(l => l.startsWith(k + '='))?.slice(k.length + 1)?.trim();

const dbUrl = new URL(get('SUPABASE_DB_URL'));
const ipv4 = (await dns.lookup(dbUrl.hostname, { family: 4 })).address;

const client = new pg.Client({
  host: ipv4, port: Number(dbUrl.port || 5432),
  user: decodeURIComponent(dbUrl.username),
  password: decodeURIComponent(dbUrl.password),
  database: dbUrl.pathname.replace(/^\//, ''),
  ssl: { rejectUnauthorized: false, servername: dbUrl.hostname },
});

await client.connect();
const email = process.argv[2] || 'evgeniypegas@gmail.com';
const r = await client.query('SELECT id, email FROM auth.users WHERE LOWER(email) = LOWER($1)', [email]);
console.log(JSON.stringify(r.rows));
await client.end();
