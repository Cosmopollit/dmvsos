import sitemap from '@/app/sitemap';

// IndexNow — push our full URL list to Bing + Yandex (one endpoint reaches both)
// for near-instant (re)indexing instead of waiting on crawl scheduling. Yandex
// matters most here (RU/UA audience). Trigger after a deploy / content change:
//   GET /api/indexnow?key=<INDEXNOW_KEY>
// The matching key file must stay live at https://dmvsos.com/<key>.txt (public/).
// Submitting only our own sitemap URLs is harmless even if triggered repeatedly,
// so gating on the (public) key is sufficient.
const KEY = '0d54b5ebd2a688fb0373af6705900ddd';
const HOST = 'dmvsos.com';

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

  let indexnowStatus = 0;
  try {
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
    indexnowStatus = res.status;
  } catch (e) {
    return Response.json({ submitted: urlList.length, error: 'indexnow fetch failed', detail: String(e) }, { status: 502 });
  }

  // IndexNow returns 200 (accepted) or 202 (accepted, validation pending).
  return Response.json({ submitted: urlList.length, indexnowStatus });
}
