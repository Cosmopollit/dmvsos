#!/usr/bin/env node
/**
 * Propagate image_url from EN questions to all other languages.
 * Matches by position: same state + category + insertion order (id).
 *
 * Requires: SUPABASE_SERVICE_ROLE_KEY
 */

const SUPABASE_URL = 'https://yaogndpgnewqffbjrsgz.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SERVICE_KEY) { console.error('Set SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }

const LANGS = ['ru', 'es', 'zh', 'ua'];
const DELAY_MS = 100;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

async function supabaseGetAll(params) {
  const PAGE = 1000;
  let all = [], offset = 0;
  while (true) {
    const url = `${SUPABASE_URL}/rest/v1/questions?${params}&offset=${offset}&limit=${PAGE}`;
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`GET: ${res.status} ${await res.text()}`);
    const batch = await res.json();
    all = all.concat(batch);
    if (batch.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

async function supabasePatch(id, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/questions?id=eq.${id}`, {
    method: 'PATCH',
    headers: { ...headers, Prefer: 'return=minimal' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PATCH ${id}: ${res.status} ${await res.text()}`);
}

async function main() {
  // 1. Get all EN questions with images
  console.log('Fetching EN questions with images...');
  const enWithImages = await supabaseGetAll(
    'language=eq.en&image_url=not.is.null&select=id,state,category,image_url&order=id'
  );
  console.log(`  Found ${enWithImages.length} EN questions with images\n`);

  // 2. Group by state+category to know which combos need processing
  const combos = {};
  for (const q of enWithImages) {
    const key = `${q.state}|${q.category}`;
    if (!combos[key]) combos[key] = [];
    combos[key].push(q);
  }
  console.log(`  ${Object.keys(combos).length} state/category combos to process\n`);

  let totalUpdated = 0;

  for (const lang of LANGS) {
    console.log(`--- ${lang.toUpperCase()} ---`);
    let langUpdated = 0;

    for (const [key, enQuestions] of Object.entries(combos)) {
      const [state, category] = key.split('|');

      // Get ALL EN questions for this state/category (to build position index)
      const allEn = await supabaseGetAll(
        `language=eq.en&state=eq.${encodeURIComponent(state)}&category=eq.${category}&select=id&order=id`
      );

      // Build position map: EN id -> position index
      const enIdToPos = {};
      allEn.forEach((q, i) => { enIdToPos[q.id] = i; });

      // Build position -> image_url map from EN questions with images
      const posToImage = {};
      for (const q of enQuestions) {
        const pos = enIdToPos[q.id];
        if (pos !== undefined) posToImage[pos] = q.image_url;
      }

      // Get ALL target lang questions for this state/category
      const targetAll = await supabaseGetAll(
        `language=eq.${lang}&state=eq.${encodeURIComponent(state)}&category=eq.${category}&select=id,image_url&order=id`
      );

      if (!targetAll.length) continue;

      // Match by position and update
      let comboUpdated = 0;
      for (let i = 0; i < targetAll.length; i++) {
        const imageUrl = posToImage[i];
        if (imageUrl && targetAll[i].image_url !== imageUrl) {
          await supabasePatch(targetAll[i].id, { image_url: imageUrl });
          comboUpdated++;
          await sleep(DELAY_MS);
        }
      }

      if (comboUpdated > 0) {
        langUpdated += comboUpdated;
        process.stdout.write(`\r  ${lang}: ${langUpdated} updated (${state}/${category}: +${comboUpdated})`);
      }

      await sleep(DELAY_MS);
    }

    console.log(`\n  ${lang}: ${langUpdated} questions updated\n`);
    totalUpdated += langUpdated;
  }

  console.log(`\nDone! Total: ${totalUpdated} questions updated across ${LANGS.length} languages.`);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
