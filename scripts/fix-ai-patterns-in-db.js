#!/usr/bin/env node
/**
 * Deterministic bulk fix for AI-translation tells in question_text + options + explanation.
 * Pattern-based, no LLM. Only fixes things that have ONE obvious correct rewrite.
 *
 * Examples of replacements:
 *   "Согласно CDL руководству," -> "По CDL руководству,"
 *   "наиболее целесообразное действие" -> "лучшее действие"
 *   "Руководство указывает, что" -> ""
 *   "является" (as copula) -> ""
 *
 * Usage:
 *   node scripts/fix-ai-patterns-in-db.js --lang=ru --category=cdl --dry-run
 *   node scripts/fix-ai-patterns-in-db.js --lang=ru --category=cdl              # apply
 *   node scripts/fix-ai-patterns-in-db.js --lang=ru                              # all categories
 *
 * Always read --dry-run first to verify the rewrites look right.
 */

'use strict';

const fs = require('fs');

try {
  const txt = fs.readFileSync('.env.local', 'utf8');
  for (const line of txt.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch (_) {}

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPA_KEY) { console.error('Missing SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }

const args = process.argv.slice(2);
const argVal = (k) => args.find(a => a.startsWith(`--${k}=`))?.split('=')[1];
const DRY = args.includes('--dry-run');
const LANG = argVal('lang') || 'ru';
const CATEGORY = argVal('category') || null;
const SAMPLE = parseInt(argVal('sample') || '15', 10); // how many before/after diffs to print

const H = { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json' };

// ── Replacement rules for RU ─────────────────────────────────────────────
// Order matters - longest/most-specific first to avoid partial matches.
// Each: [regex, replacement]. Use lookbehind/ahead to keep punctuation correct.
// Conservative rule set: only changes that preserve Russian grammar.
// Removing AI-intro phrases is safe (rest of sentence stands alone).
// Pure adverb-for-adverb synonyms with same role are safe.
// Replacements that would shift noun case ("в соответствии с" -> "по",
// "посредством" -> "через", "является" -> "это") DROPPED - they break грамматику.
// Those are flagged in audit; user fixes by hand or we revisit with smarter rewrites.
const RULES_RU = [
  // ── AI intro phrases at start of sentence (safe to remove entirely).
  // Unified: match "Согласно/В соответствии с/Руководство/В CDL руководстве/CDL руководство"
  // followed by anything up to the next comma, then optional "что". Catches state-specific
  // variants like "Согласно руководству CDL Род-Айленда," or "Руководство FMCSA CDL указывает что".
  [/(^|\.\s+|\?\s+|!\s+)(?:Согласно|В\s+соответствии\s+с)\s+[^,.]{3,80},\s*(?:что\s+)?/g, '$1'],
  [/(^|\.\s+|\?\s+|!\s+)(?:Руководство|В\s+CDL\s+руководстве|CDL\s+руководство)\s+[^,.]{3,80}(?:указыва|говор|инструктиру|описыва|сообща|утвержда)[а-я]*,\s*(?:что\s+)?/g, '$1'],
  [/(^|\.\s+|\?\s+|!\s+)В\s+данном\s+случае,?\s*/g, '$1'],
  [/(^|\.\s+|\?\s+|!\s+)В\s+указанном\s+случае,?\s*/g, '$1'],

  // ── Safe adverb-for-adverb (same grammatical role)
  [/надлежащим\s+образом/g, 'правильно'],
  [/\bнадлежаще\b/g, 'правильно'],

  // ── Adjective-for-adjective, case-preserving (suffix captured)
  // "наиболее целесообразн(ое/ый/ым/ого)" -> "лучш(ее/ий/им/его)"
  [/наиболее\s+целесообразн(ое|ый|ым|ого|ая|ой|ую)/g, (m, suf) => 'лучш' + ({ое:'ее',ый:'ий',ым:'им',ого:'его',ая:'ая',ой:'ей',ую:'ую'}[suf] || suf)],
  // "целесообразн(ое/ый/...)" alone -> "правильн(...)"
  [/целесообразн(ое|ый|ого|ым|ая|ой|ую|ые|ых|ыми)/g, 'правильн$1'],

  // ── Specific phrase replacements with known correct form
  [/наиболее\s+оптимальн(ое|ый|ого|ым)/g, 'оптимальн$1'], // "most optimal" -> just "optimal"
];

// ── Rules for ES ──────────────────────────────────────────────────────────
// Same conservative approach: remove AI intros, replace adjectives where case is invariant.
const RULES_ES = [
  // AI intros at start of sentence (anything up to first comma, then optional "que")
  [/(^|\.\s+|\?\s+|!\s+)(?:Seg[uú]n|De\s+acuerdo\s+(?:al|con|a))\s+[^,.]{3,80},\s*(?:que\s+)?/g, '$1'],
  [/(^|\.\s+|\?\s+|!\s+)(?:El\s+manual|En\s+el\s+manual)\s+[^,.]{3,80}(?:indica|se[nñ]ala|establece|estipula|menciona|dispone)[a-z]*,?\s*(?:que\s+)?/gi, '$1'],
  [/(^|\.\s+|\?\s+|!\s+)En\s+(?:este|dicho|el\s+presente)\s+caso,?\s*/gi, '$1'],

  // Safe synonym swaps that preserve grammar
  [/de\s+manera\s+apropiada/gi, 'correctamente'],
  [/de\s+forma\s+apropiada/gi, 'correctamente'],
  [/de\s+manera\s+adecuada/gi, 'correctamente'],
  [/la\s+acci[oó]n\s+m[aá]s\s+apropiada/gi, 'la mejor acción'],
];

// ── Rules for UA ──────────────────────────────────────────────────────────
const RULES_UA = [
  // NOTE: must include Ukrainian-specific letters in char class — а-я alone
  // EXCLUDES і/ї/є/ґ which are needed for verb endings like "вказує".
  // Use [\p{L}] with u flag to be safe, or explicit ranges.
  [/(^|\.\s+|\?\s+|!\s+)(?:З[гґ]і?дно|В[іi]дпов[іi]дно\s+до)\s+[^,.]{3,80},\s*(?:що\s+)?/g, '$1'],
  [/(^|\.\s+|\?\s+|!\s+)(?:Пос[іi]бник|У\s+пос[іi]бнику)\s+[^,.]{3,80}(?:вказу|зазнача|стверджу|описує|говорить)[\p{L}]*,?\s*(?:що\s+)?/giu, '$1'],
  [/(^|\.\s+|\?\s+|!\s+)У\s+(?:цьому|даному|вказаному)\s+випадку,?\s*/gi, '$1'],

  // Cyrillic-safe (avoid \b)
  [/належним\s+чином/giu, 'правильно'],
  [/найбільш\s+доцільн(е|ий|им|ого|а|ої|у)/giu, 'найкращ$1'],
  [/доцільн(е|ий|ого|им|а|ої|у|их|і)/giu, 'правильн$1'],
];

const RULES = { ru: RULES_RU, es: RULES_ES, ua: RULES_UA };

const COLS = ['question_text', 'option_a', 'option_b', 'option_c', 'option_d', 'explanation'];

function applyRules(text, rules) {
  if (!text) return text;
  let out = text;
  for (const [re, rep] of rules) out = out.replace(re, rep);
  // Cleanup: double spaces, leading punctuation
  out = out.replace(/\s+/g, ' ').replace(/^\s*[,.;:-]\s*/, '').trim();
  // Capitalize first letter if we removed an intro
  if (out && out[0].match(/[а-яёa-z]/)) out = out[0].toUpperCase() + out.slice(1);
  return out;
}

async function fetchPage(lastId, lang, category, pageSize = 500) {
  const params = new URLSearchParams({
    select: ['id', 'state', 'category', ...COLS].join(','),
    order: 'id.asc',
    limit: String(pageSize),
    language: `eq.${lang}`,
  });
  if (lastId) params.set('id', `gt.${lastId}`);
  if (category) params.set('category', `eq.${category}`);
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(`${SUPA_URL}/rest/v1/questions?${params}`, { headers: H });
    if (res.ok) return res.json();
    if (res.status === 500 && attempt === 0) { await new Promise(r => setTimeout(r, 1000)); continue; }
    throw new Error(`${res.status}: ${await res.text()}`);
  }
}

async function patch(id, body) {
  const res = await fetch(`${SUPA_URL}/rest/v1/questions?id=eq.${id}`, {
    method: 'PATCH', headers: H,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`patch ${id} ${res.status}: ${await res.text()}`);
}

(async () => {
  const rules = RULES[LANG];
  if (!rules) { console.error(`No rules for lang=${LANG}`); process.exit(1); }

  console.log(`Mode: ${DRY ? 'DRY-RUN' : 'APPLY'}  lang=${LANG}  category=${CATEGORY || 'all'}`);

  const candidates = [];
  let lastId = '', scanned = 0;
  while (true) {
    const batch = await fetchPage(lastId, LANG, CATEGORY);
    if (batch.length === 0) break;
    scanned += batch.length;
    for (const row of batch) {
      const changes = {};
      let anyChange = false;
      for (const c of COLS) {
        const before = row[c];
        const after = applyRules(before, rules);
        if (before !== after && after) {
          changes[c] = { before, after };
          anyChange = true;
        }
      }
      if (anyChange) candidates.push({ id: row.id, state: row.state, category: row.category, changes });
    }
    lastId = batch[batch.length - 1].id;
    process.stderr.write(`  scanned ${scanned}, candidates ${candidates.length}\r`);
    if (batch.length < 500) break;
  }
  console.log(`\nScanned ${scanned} rows, ${candidates.length} will be modified`);

  // Show sample diffs
  console.log(`\n=== Sample diffs (first ${SAMPLE}) ===`);
  for (const c of candidates.slice(0, SAMPLE)) {
    console.log(`\n[${c.state}/${c.category}] id=${c.id}`);
    for (const [col, { before, after }] of Object.entries(c.changes)) {
      console.log(`  ${col}:`);
      console.log(`    OLD: ${before.slice(0, 220)}${before.length > 220 ? '...' : ''}`);
      console.log(`    NEW: ${after.slice(0, 220)}${after.length > 220 ? '...' : ''}`);
    }
  }

  if (DRY) {
    console.log(`\n(dry-run) Re-run without --dry-run to apply ${candidates.length} updates.`);
    return;
  }

  // Apply
  let done = 0;
  const CONCURRENCY = 5;
  let i = 0;
  async function worker() {
    while (i < candidates.length) {
      const c = candidates[i++];
      const body = {};
      for (const [col, { after }] of Object.entries(c.changes)) body[col] = after;
      try {
        await patch(c.id, body);
        done++;
        if (done % 50 === 0) process.stderr.write(`  applied ${done}/${candidates.length}\r`);
      } catch (e) {
        console.error(`  fail ${c.id}: ${e.message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  console.log(`\nApplied ${done}/${candidates.length}`);
})();
