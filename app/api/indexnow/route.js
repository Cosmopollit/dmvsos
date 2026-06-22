import sitemap from '@/app/sitemap';

// IndexNow — push our full URL list to Bing + Yandex (one endpoint reaches both)
// for near-instant (re)indexing instead of waiting on crawl scheduling. Yandex
// matters most here (RU/UA audience). Trigger after a deploy / content change:
//   GET /api/indexnow?key=<INDEXNOW_KEY>
// The matching key file must stay live at https://dmvsos.com/<key>.txt (public/).
// Submitting only our own sitemap URLs is harmless even if triggered repeatedly,
// so gating on the (public) key is sufficient.
//
// We chunk submissions because IndexNow rate-limits big single-batch posts
// (a 500-URL single batch returned 403 in practice while 5×100 batches all
// returned 200). 100 URLs per batch + a 1.5s pause stays well under the API
// limits and reliably gets everything indexed.
const KEY = '0d54b5ebd2a688fb0373af6705900ddd';
const HOST = 'dmvsos.com';
const BATCH_SIZE = 100;
const BATCH_DELAY_MS = 1500;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function submitBatch(urlList) {
  const res = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      host: HOST,
      key: KEY,
      keyLocation: `https://${HOST}/${KEY}.txt`,
      urlList,
    }),
  });
  return res.status;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  if (searchParams.get('key') !== KEY) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  let entries;
  try {
    entries = await sitemap();
  } catch (e) {
    return Response.json({ error: 'sitemap failed', detail: String(e) }, { status: 500 });
  }
  const urlList = entries.map(e => e.url);

  const batchResults = [];
  let allOk = true;
  for (let i = 0; i < urlList.length; i += BATCH_SIZE) {
    const batch = urlList.slice(i, i + BATCH_SIZE);
    try {
      const status = await submitBatch(batch);
      batchResults.push({ batch: batchResults.length + 1, urls: batch.length, status });
      if (status !== 200 && status !== 202) allOk = false;
    } catch (e) {
      batchResults.push({ batch: batchResults.length + 1, urls: batch.length, error: String(e) });
      allOk = false;
    }
    if (i + BATCH_SIZE < urlList.length) await sleep(BATCH_DELAY_MS);
  }

  return Response.json({
    submitted: urlList.length,
    batches: batchResults,
    ok: allOk,
  });
}
