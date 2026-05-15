// Enrich a curated list of Telegram group handles with live member counts +
// descriptions, by fetching their PUBLIC t.me/<handle> preview pages.
//
// Why this approach (vs scraping tgstat etc.):
//   - tgstat.ru returns 403 to bot UA; tgstat.com hides results behind JS.
//   - t.me/<handle> is a stable, JS-free preview served by Telegram itself
//     for every public group/channel. Always works, no rate limiting at our scale.
//
// Input:  HANDLES list below (extend freely)
// Output: groups-enriched.json with { name, handle, link, members, description, type, language }
//
// Usage:
//   node scripts/find-telegram-groups.js
//   node scripts/find-telegram-groups.js --handles=russian_miami_chat,latinos_usa
//
// To discover NEW handles, see OUTREACH.md → tgstat.com / tlgrm.eu / combot.org
// (search those manually in browser, paste new handles into HANDLES below.)

import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const args = process.argv.slice(2);
const argVal = (k) => args.find(a => a.startsWith(`--${k}=`))?.split('=')[1];
const customHandles = argVal('handles')?.split(',').map(s => s.trim().replace(/^@/, '')).filter(Boolean);

// Curated seed list. Sourced from OUTREACH.md (research agent, early 2026).
// Each entry: handle + language hint (used for outreach template selection).
const HANDLES = [
  // RU general / city
  { h: 'russian_usa_chat', lang: 'ru' },
  { h: 'rusinusa', lang: 'ru' },
  { h: 'russian_ny_chat', lang: 'ru' },
  { h: 'brighton_chat', lang: 'ru' },
  { h: 'russian_miami_chat', lang: 'ru' },
  { h: 'rusmiamichat', lang: 'ru' },
  { h: 'russianla_chat', lang: 'ru' },
  { h: 'russian_california', lang: 'ru' },
  { h: 'ru_sf_bayarea', lang: 'ru' },
  { h: 'russian_seattle', lang: 'ru' },
  { h: 'russian_chicago_chat', lang: 'ru' },
  { h: 'russian_texas', lang: 'ru' },
  { h: 'russian_boston', lang: 'ru' },
  { h: 'russian_colorado', lang: 'ru' },
  { h: 'russian_sandiego', lang: 'ru' },
  { h: 'russian_florida', lang: 'ru' },
  { h: 'usa_relocation_chat', lang: 'ru' },
  { h: 'parallel_amerika_chat', lang: 'ru' },
  // UA
  { h: 'ukrainians_usa', lang: 'ua' },
  { h: 'u4u_chat', lang: 'ua' },
  { h: 'ukrainians_california', lang: 'ua' },
  { h: 'ukrainians_ny', lang: 'ua' },
  { h: 'ukrainians_texas', lang: 'ua' },
  { h: 'ukrainians_seattle', lang: 'ua' },
  { h: 'ukrainians_chicago', lang: 'ua' },
  // ES
  { h: 'latinosenusa', lang: 'es' },
  { h: 'hispanosenusa', lang: 'es' },
  { h: 'venezolanosenusa', lang: 'es' },
  { h: 'venezolanosmiami', lang: 'es' },
  { h: 'cubanosenusa', lang: 'es' },
  { h: 'cubanosmiami', lang: 'es' },
  { h: 'mexicanosenusa', lang: 'es' },
  { h: 'colombianosenusa', lang: 'es' },
  { h: 'latinoshouston', lang: 'es' },
  { h: 'latinosla', lang: 'es' },
  { h: 'latinosny', lang: 'es' },
  { h: 'inmigrantesusa', lang: 'es' },
];

const targets = customHandles
  ? customHandles.map(h => ({ h, lang: 'ru' /* default */ }))
  : HANDLES;

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';

async function fetchPreview(handle) {
  const url = `https://t.me/${handle}`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'en' },
      redirect: 'follow',
    });
    if (!res.ok) return { status: res.status, html: null };
    return { status: 200, html: await res.text() };
  } catch (e) {
    return { status: 0, html: null, error: e.message };
  }
}

// Telegram's public preview HTML uses og: meta tags + a few well-known classes.
function parsePreview(html) {
  if (!html) return null;

  // Page title — usually "Name – Telegram"
  const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/);
  const name = titleMatch ? titleMatch[1] : null;

  const descMatch = html.match(/<meta property="og:description" content="([^"]*)"/);
  const description = descMatch ? descMatch[1] : null;

  // Members:
  //   - Groups: "tgme_page_extra">12 345 members"  or  "12 345 subscribers, 1 234 online"
  //   - Channels: similar
  const extraMatch = html.match(/tgme_page_extra[^>]*>([^<]+)<\/div>/);
  const extra = extraMatch ? extraMatch[1].trim() : null;

  let members = null;
  if (extra) {
    const numMatch = extra.match(/([\d\s,]+)\s*(members?|subscribers?|подпис|участ)/i);
    if (numMatch) {
      const n = parseInt(numMatch[1].replace(/[\s,]/g, ''), 10);
      if (!isNaN(n)) members = n;
    }
  }

  // Channel vs group: very rough — Telegram preview doesn't distinguish reliably
  // but channels usually say "subscribers", groups say "members"
  let type = 'unknown';
  if (extra && /subscribers?/i.test(extra)) type = 'channel';
  else if (extra && /members?/i.test(extra)) type = 'group';

  // "If you have Telegram, you can view…" → group/channel that exists
  // "Sorry, this group is unavailable" → dead
  const isDead = /sorry|not\s+found|unavailable/i.test(html) && !members;

  return { name, description, members, type, extra, isDead };
}

// ── Main ─────────────────────────────────────────────────────────────────
console.log(`Enriching ${targets.length} handles via t.me preview pages…\n`);

const results = [];
for (const { h, lang } of targets) {
  process.stdout.write(`  ${h.padEnd(28)} → `);
  const { status, html } = await fetchPreview(h);
  if (status !== 200 || !html) {
    console.log(`HTTP ${status} (skip)`);
    results.push({ handle: h, link: `https://t.me/${h}`, language: lang, status, alive: false });
    continue;
  }
  const parsed = parsePreview(html);
  if (!parsed || parsed.isDead) {
    console.log('dead / not public');
    results.push({ handle: h, link: `https://t.me/${h}`, language: lang, alive: false });
    continue;
  }
  console.log(`${parsed.name || h}  •  ${parsed.members ? parsed.members.toLocaleString() : '?'} ${parsed.type}`);
  results.push({
    handle: h,
    link: `https://t.me/${h}`,
    name: parsed.name,
    description: parsed.description,
    members: parsed.members,
    type: parsed.type,
    language: lang,
    alive: true,
  });

  // Tiny politeness delay
  await new Promise(r => setTimeout(r, 250));
}

// Sort alive groups by members desc
results.sort((a, b) => {
  if (a.alive && !b.alive) return -1;
  if (!a.alive && b.alive) return 1;
  return (b.members || 0) - (a.members || 0);
});

const outPath = join(root, 'groups-enriched.json');
writeFileSync(outPath, JSON.stringify(results, null, 2));

const alive = results.filter(r => r.alive);
const dead = results.length - alive.length;

console.log(`\n✓ ${alive.length} alive, ${dead} dead / private`);
console.log(`✓ Saved → ${outPath}`);
console.log(`\nNext: node scripts/generate-outreach-dms.js`);

if (alive.length === 0) {
  console.log(`\n⚠ Zero alive groups. Likely:`);
  console.log(`  • Handles are stale — open OUTREACH.md, find replacements via tgstat.com in browser`);
  console.log(`  • Network blocked to t.me — try VPN`);
}
