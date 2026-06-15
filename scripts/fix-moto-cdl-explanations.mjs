#!/usr/bin/env node
/**
 * fix-moto-cdl-explanations.mjs
 *
 * Many MOTORCYCLE questions are legit but their `explanation` wrongly cites the
 * "[State] CDL manual" (generation used CDL RAG). The question text + options are
 * correct motorcycle content, so these are KEEPERS — only the manual attribution
 * in the explanation is wrong. This rewrites that reference to the motorcycle
 * manual, per language. No deletion. CDL category is never touched.
 *
 *   node scripts/fix-moto-cdl-explanations.mjs              # dry-run (default)
 *   node scripts/fix-moto-cdl-explanations.mjs --execute    # PATCH explanations
 *
 * --execute saves .fix-moto-cdl-explanations-rollback.json (original rows) first.
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env.
 */
import fs from 'node:fs';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) { console.error('Missing Supabase env'); process.exit(1); }
const EXECUTE = process.argv.includes('--execute');
const H = { apikey: KEY, Authorization: 'Bearer ' + KEY };

// Ordered replacements per language. Longest/most-specific first; a trailing
// bare-"CDL" catch-all mops up the minority "...EnglishStateName CDL" variants.
// CDL only ever appears as the manual reference in these (moto) explanations.
const RULES = {
  en: [['CDL motorcycle manual', 'motorcycle manual'], ['CDL manual', 'motorcycle manual'], ['CDL', 'motorcycle']],
  ru: [['руководству CDL', 'руководству для мотоциклистов'], ['руководства CDL', 'руководства для мотоциклистов'],
       ['руководстве CDL', 'руководстве для мотоциклистов'], ['руководство CDL', 'руководство для мотоциклистов'],
       ['CDL', 'для мотоциклистов']],
  es: [['de motocicleta CDL', 'de motocicleta'], ['manual de CDL', 'manual de motocicleta'],
       ['manual CDL', 'manual de motocicleta'], ['CDL', 'de motocicleta']],
  zh: [['CDL摩托车手册', '摩托车手册'], ['摩托车CDL', '摩托车'], ['CDL 手册', '摩托车手册'],
       ['CDL手册', '摩托车手册'], ['CDL', '摩托车']],
  ua: [['CDL мотоциклів', 'для мотоциклістів'], ['Керівництво CDL', 'Керівництво для мотоциклістів'],
       ['посібником CDL', 'посібником для мотоциклістів'], ['посібника CDL', 'посібника для мотоциклістів'],
       ['посібнику CDL', 'посібнику для мотоциклістів'], ['посібник CDL', 'посібник для мотоциклістів'],
       ['CDL', 'для мотоциклістів']],
};
const fix = (lang, text) => {
  let out = text;
  for (const [a, b] of RULES[lang]) out = out.split(a).join(b);
  return out.replace(/\s{2,}/g, ' ').trim();
};

async function getJson(path) {
  const r = await fetch(URL + path, { headers: H });
  if (!r.ok) throw new Error(`GET ${path} -> ${r.status} ${await r.text()}`);
  return r.json();
}
async function pullMoto(lang) {
  const out = [];
  for (let off = 0; ; off += 1000) {
    const p = await getJson(`/rest/v1/questions?category=eq.motorcycle&language=eq.${lang}` +
      `&select=id,state,cluster_code,explanation&order=state.asc,cluster_code.asc&limit=1000&offset=${off}`);
    out.push(...p);
    if (p.length < 1000) break;
  }
  return out;
}

async function main() {
  console.log(`Mode: ${EXECUTE ? 'EXECUTE (PATCH)' : 'DRY-RUN (no writes)'}\n`);
  const rollback = [];
  let totalChanged = 0;
  for (const lang of Object.keys(RULES)) {
    const rows = await pullMoto(lang);
    const changes = [];
    for (const r of rows) {
      const e = r.explanation || '';
      if (!/cdl/i.test(e)) continue;
      const fixed = fix(lang, e);
      if (fixed !== e) changes.push({ r, before: e, after: fixed });
    }
    totalChanged += changes.length;
    console.log(`[${lang}] ${changes.length} explanations to fix`);
    for (const c of changes.slice(0, 2)) {
      console.log(`   - BEFORE: ${c.before.slice(0, 120)}`);
      console.log(`     AFTER : ${c.after.slice(0, 120)}`);
    }
    // leftover CDL after fix (should be 0) — quality guard for the dry-run
    const leftover = changes.filter(c => /cdl/i.test(c.after)).length;
    if (leftover) console.log(`   ⚠ ${leftover} still contain "CDL" after fix — review rules`);

    if (EXECUTE) {
      for (const c of changes) {
        rollback.push({ id: c.r.id, language: lang, explanation: c.before });
        const pr = await fetch(`${URL}/rest/v1/questions?id=eq.${c.r.id}`, {
          method: 'PATCH', headers: { ...H, 'Content-Type': 'application/json' },
          body: JSON.stringify({ explanation: c.after }),
        });
        if (!pr.ok) { console.error(`PATCH ${c.r.id} failed: ${pr.status} ${await pr.text()}`); process.exit(1); }
      }
      console.log(`   [${lang}] patched ${changes.length}`);
    }
  }
  if (EXECUTE) {
    fs.writeFileSync('.fix-moto-cdl-explanations-rollback.json', JSON.stringify(rollback));
    console.log(`\nROLLBACK saved: ${rollback.length} rows -> .fix-moto-cdl-explanations-rollback.json`);
    console.log(`TOTAL PATCHED: ${totalChanged} explanations.`);
  } else {
    console.log(`\nDRY-RUN total: ${totalChanged} explanations would change. Re-run with --execute.`);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
