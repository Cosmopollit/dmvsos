// Reads groups-enriched.json and generates an HTML outreach console:
//   - One row per alive GROUP (channels skipped — bot can't join channels)
//   - Per-row "Copy DM text" button + "Open group" link
//   - Status checkboxes you can mark as you go (saved to localStorage)
//
// Open the HTML in your browser, click through each row.
//
// Usage: node scripts/generate-outreach-dms.js [--min-members=100]

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const args = process.argv.slice(2);
const argVal = (k, d) => args.find(a => a.startsWith(`--${k}=`))?.split('=')[1] ?? d;
const minMembers = parseInt(argVal('min-members', '100'), 10);

const raw = readFileSync(join(root, 'groups-enriched.json'), 'utf8');
const groups = JSON.parse(raw);

const TEMPLATES = {
  ru: (groupName) => `Привет! Я Евгений, делаю dmvsos.com — бесплатная подготовка к DMV для 50 штатов на 5 языках (RU/EN/UA/ES/ZH).

Видел в "${groupName}" люди регулярно спрашивают про права. У меня есть бот @dmvsos_support_bot — он НИЧЕГО не пишет в группе. Просто тихо пересылает мне в личку такие вопросы, чтобы я успел сам подсказать. Отвечаю я с личного аккаунта, без автоматики.

Если что-то не понравится — выключи командой /disable в группе, или сразу кикни. Можно протестить неделю?`,

  ua: (groupName) => `Привіт! Я Євгеній, роблю dmvsos.com — безкоштовна підготовка до DMV для 50 штатів на 5 мовах.

Бачив, у "${groupName}" люди регулярно питають про права. У мене є бот @dmvsos_support_bot — він НІЧОГО не пише в групі. Просто тихо пересилає мені в особисті такі питання, щоб я встиг сам підказати. Відповідаю я зі свого акаунта, без автоматики.

Якщо щось не сподобається — вимкни командою /disable у групі або просто кикни. Можна спробувати тиждень?`,

  es: (groupName) => `¡Hola! Soy Evgenii, creé dmvsos.com — práctica gratis para el examen de DMV en los 50 estados, en 5 idiomas (EN/ES/RU/ZH/UA).

Veo que en "${groupName}" la gente pregunta seguido sobre la licencia de conducir. Tengo un bot @dmvsos_support_bot que NO publica nada en el grupo. Solo me reenvía esas preguntas en privado para que yo pueda responder a tiempo. Yo respondo desde mi cuenta personal, sin bots automáticos.

Si algo no te gusta — apágalo con /disable en el grupo, o sácalo. ¿Probamos una semana?`,
};

const eligible = groups.filter(g =>
  g.alive &&
  g.type !== 'channel' &&             // can't add bot to broadcast channels
  (g.members == null || g.members >= minMembers)
);

const skipped = groups.length - eligible.length;

const rows = eligible.map((g, i) => {
  const text = TEMPLATES[g.language] ? TEMPLATES[g.language](g.name || g.handle) : TEMPLATES.ru(g.name || g.handle);
  return `
    <tr data-handle="${g.handle}">
      <td>${i + 1}</td>
      <td><label><input type="checkbox" class="status" data-key="${g.handle}-done"></label></td>
      <td><a href="${g.link}" target="_blank" rel="noopener">${escape(g.name || g.handle)}</a><br><small>@${g.handle}</small></td>
      <td>${g.members != null ? g.members.toLocaleString() : '?'}</td>
      <td>${g.language.toUpperCase()}</td>
      <td>${g.type || '?'}</td>
      <td class="desc">${escape((g.description || '').slice(0, 120))}</td>
      <td>
        <button class="copy" data-text="${escape(text).replace(/\n/g, '&#10;')}">📋 Copy DM</button>
        <a class="btn" href="${g.link}" target="_blank">→ Open</a>
      </td>
    </tr>`;
}).join('');

const html = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8">
<title>DMVSOS — Telegram outreach console</title>
<style>
  body { font: 14px/1.5 -apple-system, BlinkMacSystemFont, sans-serif; max-width: 1200px; margin: 24px auto; padding: 0 16px; color: #0B1C3D; }
  h1 { margin: 0 0 8px; }
  .meta { color: #64748B; margin-bottom: 24px; font-size: 13px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 8px 6px; border-bottom: 1px solid #E2E8F0; vertical-align: top; text-align: left; }
  th { background: #F8FAFC; font-size: 12px; text-transform: uppercase; color: #64748B; }
  td.desc { color: #64748B; font-size: 12px; max-width: 240px; }
  a { color: #2563EB; text-decoration: none; }
  a:hover { text-decoration: underline; }
  button.copy { padding: 4px 10px; border: 1px solid #2563EB; background: white; color: #2563EB; border-radius: 6px; cursor: pointer; font-size: 12px; }
  button.copy:hover { background: #2563EB; color: white; }
  button.copy.done { background: #16A34A; border-color: #16A34A; color: white; }
  a.btn { display: inline-block; padding: 4px 10px; border: 1px solid #E2E8F0; border-radius: 6px; color: #0B1C3D; font-size: 12px; margin-left: 4px; }
  tr.done { opacity: 0.5; }
  input[type="checkbox"] { transform: scale(1.3); margin: 4px; }
  .note { background: #FEF3C7; border: 1px solid #F59E0B; padding: 10px 14px; border-radius: 8px; margin: 16px 0; font-size: 13px; }
  .stats { display: flex; gap: 24px; margin-bottom: 16px; }
  .stat { padding: 10px 16px; background: #F8FAFC; border-radius: 8px; }
  .stat b { font-size: 18px; display: block; color: #0B1C3D; }
  .stat span { font-size: 11px; color: #64748B; text-transform: uppercase; }
</style></head>
<body>

<h1>Telegram outreach console</h1>
<p class="meta">${eligible.length} eligible groups · ${skipped} skipped (channels, dead, or below ${minMembers} members). Generated ${new Date().toISOString()}</p>

<div class="note">
  <b>How to use:</b>
  <ol style="margin: 6px 0 0; padding-left: 18px">
    <li>Click <b>→ Open</b> to open the group in Telegram.</li>
    <li>In Telegram: tap group name → <b>Administrators</b> → tap an admin → <b>Send Message</b>.</li>
    <li>Come back here, click <b>📋 Copy DM</b> for that group, paste in the admin DM, review, send.</li>
    <li>Check the box ✓ when sent. Progress saved in this browser (localStorage).</li>
  </ol>
</div>

<div class="stats">
  <div class="stat"><b id="totalCount">${eligible.length}</b><span>groups</span></div>
  <div class="stat"><b id="doneCount">0</b><span>DM sent</span></div>
  <div class="stat"><b id="remainCount">${eligible.length}</b><span>remaining</span></div>
</div>

<table>
  <thead><tr>
    <th>#</th><th>Done</th><th>Group</th><th>Members</th><th>Lang</th><th>Type</th><th>Description</th><th>Actions</th>
  </tr></thead>
  <tbody>${rows}</tbody>
</table>

<script>
  // Restore checkbox state
  document.querySelectorAll('input.status').forEach(cb => {
    const key = cb.dataset.key;
    if (localStorage.getItem(key) === '1') {
      cb.checked = true;
      cb.closest('tr').classList.add('done');
    }
    cb.addEventListener('change', () => {
      localStorage.setItem(key, cb.checked ? '1' : '0');
      cb.closest('tr').classList.toggle('done', cb.checked);
      updateStats();
    });
  });

  // Copy buttons
  document.querySelectorAll('button.copy').forEach(btn => {
    btn.addEventListener('click', async () => {
      const text = btn.dataset.text.replace(/&#10;/g, '\\n');
      try {
        await navigator.clipboard.writeText(text);
        btn.classList.add('done');
        btn.textContent = '✓ Copied';
        setTimeout(() => { btn.textContent = '📋 Copy DM'; btn.classList.remove('done'); }, 2500);
      } catch (e) {
        alert('Copy failed: ' + e.message);
      }
    });
  });

  function updateStats() {
    const done = document.querySelectorAll('input.status:checked').length;
    const total = document.querySelectorAll('input.status').length;
    document.getElementById('doneCount').textContent = done;
    document.getElementById('remainCount').textContent = total - done;
  }
  updateStats();
</script>

</body></html>`;

const outPath = join(root, 'outreach-console.html');
writeFileSync(outPath, html);
console.log(`✓ ${eligible.length} eligible groups → ${outPath}`);
console.log(`  Skipped ${skipped} (channels, dead, <${minMembers} members)`);
console.log(`\nOpen the HTML in your browser:`);
console.log(`  open ${outPath}`);

function escape(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
