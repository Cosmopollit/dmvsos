const SUPABASE_URL = 'https://yaogndpgnewqffbjrsgz.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_KEY) {
  console.error('Set SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

async function listRecursive(bucket, prefix = '', depth = 0) {
  let offset = 0;
  const page = 1000;
  const files = [];
  const folders = [];
  while (true) {
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${bucket}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ limit: page, offset, prefix }),
    });
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
    const rows = await res.json();
    for (const r of rows) {
      // A folder entry has id=null; a file has metadata.size
      if (r.id === null) folders.push(r.name);
      else files.push({ name: r.name, size: (r.metadata && r.metadata.size) || 0 });
    }
    if (rows.length < page) break;
    offset += page;
  }
  // Recurse into folders
  const all = files.slice();
  for (const f of folders) {
    const sub = await listRecursive(bucket, prefix ? `${prefix}/${f}` : f, depth + 1);
    for (const s of sub) all.push({ name: `${f}/${s.name}`, size: s.size });
  }
  return all;
}

function fmt(bytes) {
  if (bytes >= 1024 * 1024 * 1024) return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB';
  if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return bytes + ' B';
}

async function main() {
  for (const bucket of ['manuals', 'question-images']) {
    console.log(`\n== ${bucket} ==`);
    const files = await listRecursive(bucket);
    const total = files.reduce((s, f) => s + f.size, 0);
    console.log(`Files: ${files.length}`);
    console.log(`Total: ${fmt(total)}`);
    // Top-level subfolder breakdown
    const byFolder = {};
    for (const f of files) {
      const top = f.name.split('/')[0];
      byFolder[top] = (byFolder[top] || 0) + f.size;
    }
    const sorted = Object.entries(byFolder).sort((a, b) => b[1] - a[1]).slice(0, 10);
    console.log('Top folders by size:');
    for (const [k, v] of sorted) console.log(`  ${k.padEnd(30)} ${fmt(v)}`);
    // Biggest files
    const bigFiles = files.sort((a, b) => b.size - a.size).slice(0, 5);
    console.log('Biggest files:');
    for (const f of bigFiles) console.log(`  ${fmt(f.size).padStart(8)}  ${f.name}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
