const SUPABASE_URL = 'https://yaogndpgnewqffbjrsgz.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_KEY) {
  console.error('Set SUPABASE_SERVICE_ROLE_KEY env variable');
  process.exit(1);
}

const FETCH_SIZE = 1000;
const UPDATE_SIZE = 200;
const DELAY_MS = 200;

const stripQuestion = s => (s || '').replace(/^\d+\.\s*/, '').trim();
const stripOption = s => (s || '').replace(/^[A-DА-Га-гa-d]\.\s*/, '').trim();

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchBatch(offset) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/questions?select=*&order=id&limit=${FETCH_SIZE}&offset=${offset}`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
  );
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  return res.json();
}

async function updateBatch(rows, attempt = 1) {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/questions`,
      {
        method: 'POST',
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify(rows),
      }
    );
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Update failed (${res.status}): ${err}`);
    }
  } catch (e) {
    if (attempt < 3) {
      await sleep(2000 * attempt);
      return updateBatch(rows, attempt + 1);
    }
    throw e;
  }
}

async function main() {
  let offset = 0;
  let totalFetched = 0;
  let totalCleaned = 0;

  while (true) {
    const rows = await fetchBatch(offset);
    if (!rows.length) break;
    totalFetched += rows.length;

    const dirty = [];
    for (const row of rows) {
      const cleaned = {
        ...row,
        question_text: stripQuestion(row.question_text),
        option_a: stripOption(row.option_a),
        option_b: stripOption(row.option_b),
        option_c: row.option_c ? stripOption(row.option_c) : row.option_c,
        option_d: row.option_d ? stripOption(row.option_d) : row.option_d,
      };
      if (
        cleaned.question_text !== row.question_text ||
        cleaned.option_a !== row.option_a ||
        cleaned.option_b !== row.option_b ||
        cleaned.option_c !== row.option_c ||
        cleaned.option_d !== row.option_d
      ) {
        dirty.push(cleaned);
      }
    }

    if (dirty.length) {
      for (let i = 0; i < dirty.length; i += UPDATE_SIZE) {
        const batch = dirty.slice(i, i + UPDATE_SIZE);
        await updateBatch(batch);
        await sleep(DELAY_MS);
      }
      totalCleaned += dirty.length;
    }

    process.stdout.write(`\r  Fetched ${totalFetched}, cleaned ${totalCleaned}`);
    offset += rows.length;

    if (rows.length < FETCH_SIZE) break;
    await sleep(DELAY_MS);
  }

  console.log(`\nDone! Cleaned ${totalCleaned} / ${totalFetched} records.`);
}

main().catch(e => { console.error('\nFATAL:', e.message); process.exit(1); });
