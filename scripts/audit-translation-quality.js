#!/usr/bin/env node
/**
 * Pattern-based quality audit for translated DMV questions.
 * Flags AI-translation tells (bureaucratic Russian, calques from English,
 * em-dashes, overly long sentences) so they can be fixed by hand.
 *
 * READ-ONLY: does not modify the database. Outputs:
 *   - translation-quality-audit.json (machine-readable, all flagged questions)
 *   - translation-quality-audit.csv  (open in Excel/Sheets for manual review)
 *   - console summary by flag type and state
 *
 * Usage:
 *   node scripts/audit-translation-quality.js                   # all langs (ru/ua/es)
 *   node scripts/audit-translation-quality.js --lang=ru
 *   node scripts/audit-translation-quality.js --state=virginia
 *   node scripts/audit-translation-quality.js --top=200         # only worst 200 by flag count
 */

'use strict';

const fs = require('fs');

// Load .env.local
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
const LANG = argVal('lang') || null;       // null = all non-EN
const STATE = argVal('state') || null;
const TOP = parseInt(argVal('top') || '0', 10);

const H = { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` };

// ── Red-flag patterns per language ───────────────────────────────────────
// Each entry: { id, re, weight, desc }
// weight: how much this signals AI-translation (higher = worse)
const PATTERNS = {
  ru: [
    // Bureaucratic Russian (canstyleyarsky / kantselyarit)
    { id: 'целесообр', re: /целесообразн/i, weight: 3, desc: 'bureaucratic (expedient)' },
    { id: 'осуществ',  re: /осуществл[яе]/i, weight: 2, desc: 'bureaucratic (carry out)' },
    { id: 'посредств', re: /посредством/i, weight: 3, desc: 'bureaucratic (by means of)' },
    { id: 'указанн',   re: /(?:в|на)\s+указанн[оа]/i, weight: 2, desc: 'bureaucratic (specified)' },
    { id: 'данн-ref',  re: /\bданн(?:ый|ая|ое|ые|ого|ой|ом)\s+(?:тип|случа|ситуац|вопрос)/i, weight: 1, desc: 'bureaucratic (this/given X)' },
    { id: 'являет',    re: /являет(?:ся|есь)/i, weight: 1, desc: 'passive (X is/are)' },
    { id: 'надлежа',   re: /надлежащ/i, weight: 2, desc: 'bureaucratic (proper)' },
    { id: 'оптимал',   re: /оптимальн/i, weight: 1, desc: 'AI-ish (optimal)' },
    { id: 'наибол-цел', re: /наиболее\s+(?:целесообразн|оптимал|правильн)/i, weight: 3, desc: 'AI-ish (most expedient/optimal)' },

    // English-to-Russian calques
    { id: 'способность-к', re: /способност[ьи]\s+(?:резко|менять|принимать|выполнять|тормозить|объезжать)/i, weight: 2, desc: 'calque (ability to)' },
    { id: 'выполнен-N',    re: /выполнен(?:ие|ия|ий)\s+(?:резкого|плавного|сильного|маневра|поворота|торможен|осмотра)/i, weight: 2, desc: 'calque (performing X)' },
    { id: 'произвед-N',    re: /произвед(?:ение|ите|ите\sоценк)/i, weight: 2, desc: 'calque (perform/produce X)' },
    { id: 'согласно',      re: /^Согласно/im, weight: 1, desc: 'AI intro (According to)' },
    { id: 'в-соответст',   re: /В\s+соответствии\s+с/i, weight: 1, desc: 'AI intro (In accordance with)' },
    { id: 'руководств-указ', re: /Руководств[оае]\s+(?:указыва|говорит|утвержд|описыва)/i, weight: 2, desc: 'AI intro (The manual indicates...)' },

    // Style markers
    { id: 'em-dash',    re: /—/, weight: 1, desc: 'em-dash usage' },
    { id: 'redundant-vy', re: /\bВаш(?:а|е|и|ей|их)\s+способност/i, weight: 1, desc: 'overly formal "Ваша способность"' },
    { id: 'all-of-above', re: /Всё\s+перечисленное\s+выше/i, weight: 0, desc: 'all of the above (DMV-typical, OK but flag for review)' },
  ],
  ua: [
    { id: 'доцільн',    re: /доцільн/i, weight: 3, desc: 'bureaucratic (expedient)' },
    { id: 'здійснюв',   re: /здійсню/i, weight: 2, desc: 'bureaucratic (carry out)' },
    { id: 'являє',      re: /являє(?:ть|ся)/i, weight: 1, desc: 'passive' },
    { id: 'em-dash',    re: /—/, weight: 1, desc: 'em-dash' },
    { id: 'згідно',     re: /^Згідно/im, weight: 1, desc: 'AI intro' },
  ],
  es: [
    { id: 'realiz',     re: /realiza?r?\s+(?:la|el)\s+(?:acción|maniobra|operación)/i, weight: 2, desc: 'calque (perform X)' },
    { id: 'de-acuerdo', re: /^De\s+acuerdo\s+(?:al|con)/im, weight: 1, desc: 'AI intro' },
    { id: 'em-dash',    re: /—/, weight: 1, desc: 'em-dash' },
    { id: 'manual-ind', re: /[Ee]l\s+manual\s+(?:indica|señala|establece)/i, weight: 2, desc: 'AI intro (manual indicates)' },
  ],
};

// ── Fetch ────────────────────────────────────────────────────────────────
async function fetchAll(lang, state) {
  const rows = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const params = new URLSearchParams({
      select: 'id,state,category,language,question_text,option_a,option_b,option_c,option_d,explanation',
      language: `eq.${lang}`,
      order: 'id',
    });
    if (state) params.set('state', `eq.${state}`);
    const res = await fetch(`${SUPA_URL}/rest/v1/questions?${params}`, {
      headers: { ...H, Range: `${from}-${from + PAGE - 1}` },
    });
    if (!res.ok) throw new Error(`fetch ${res.status}: ${await res.text()}`);
    const batch = await res.json();
    rows.push(...batch);
    if (batch.length < PAGE) break;
    from += PAGE;
    process.stderr.write(`  ${lang} ${state || 'all'}: ${rows.length} fetched\r`);
  }
  return rows;
}

// ── Scan one row ─────────────────────────────────────────────────────────
function scanRow(row, patterns) {
  const haystack = [
    row.question_text, row.option_a, row.option_b, row.option_c, row.option_d, row.explanation,
  ].filter(Boolean).join(' ');

  const flags = [];
  let score = 0;
  for (const p of patterns) {
    if (p.re.test(haystack)) {
      flags.push({ id: p.id, desc: p.desc, weight: p.weight });
      score += p.weight;
    }
  }

  // Length penalty: 1 point per 100 chars over 250 in question_text or 350 in explanation
  if (row.question_text && row.question_text.length > 250) {
    const over = Math.floor((row.question_text.length - 250) / 100);
    if (over > 0) { flags.push({ id: 'long-q', desc: `question too long (${row.question_text.length}c)`, weight: over }); score += over; }
  }
  if (row.explanation && row.explanation.length > 350) {
    const over = Math.floor((row.explanation.length - 350) / 100);
    if (over > 0) { flags.push({ id: 'long-exp', desc: `explanation too long (${row.explanation.length}c)`, weight: over }); score += over; }
  }

  return { flags, score };
}

// ── Main ─────────────────────────────────────────────────────────────────
(async () => {
  const langs = LANG ? [LANG] : Object.keys(PATTERNS);
  const flagged = [];

  for (const lang of langs) {
    const patterns = PATTERNS[lang];
    if (!patterns) { console.warn(`No patterns for lang=${lang}`); continue; }
    console.log(`\n=== ${lang.toUpperCase()} ${STATE ? `(${STATE})` : '(all states)'} ===`);

    const rows = await fetchAll(lang, STATE);
    console.log(`  Loaded ${rows.length} questions`);

    let total = 0;
    for (const row of rows) {
      const { flags, score } = scanRow(row, patterns);
      if (score > 0) {
        total++;
        flagged.push({
          id: row.id,
          state: row.state,
          category: row.category,
          language: row.language,
          score,
          flag_ids: flags.map(f => f.id).join(','),
          flag_desc: flags.map(f => f.desc).join(' | '),
          question_text: row.question_text,
          explanation: row.explanation,
        });
      }
    }
    console.log(`  ${total} flagged (${((total / rows.length) * 100).toFixed(1)}%)`);
  }

  // Sort by score desc
  flagged.sort((a, b) => b.score - a.score);
  const out = TOP > 0 ? flagged.slice(0, TOP) : flagged;

  // ── Summary by flag type ───────────────────────────────────────────────
  const byFlag = {};
  const byState = {};
  for (const r of out) {
    for (const fid of r.flag_ids.split(',')) {
      byFlag[fid] = (byFlag[fid] || 0) + 1;
    }
    byState[`${r.language}:${r.state}`] = (byState[`${r.language}:${r.state}`] || 0) + 1;
  }
  console.log(`\n=== Summary ===`);
  console.log(`Total flagged: ${out.length}`);
  console.log(`\nTop flag types:`);
  for (const [k, v] of Object.entries(byFlag).sort((a, b) => b[1] - a[1]).slice(0, 15)) {
    console.log(`  ${String(v).padStart(5)}  ${k}`);
  }
  console.log(`\nTop state x lang:`);
  for (const [k, v] of Object.entries(byState).sort((a, b) => b[1] - a[1]).slice(0, 10)) {
    console.log(`  ${String(v).padStart(5)}  ${k}`);
  }

  // ── Write JSON ─────────────────────────────────────────────────────────
  fs.writeFileSync('translation-quality-audit.json', JSON.stringify(out, null, 2));
  console.log(`\nWrote translation-quality-audit.json (${out.length} entries)`);

  // ── Write CSV ──────────────────────────────────────────────────────────
  const csvRows = [
    ['id', 'lang', 'state', 'category', 'score', 'flags', 'question', 'explanation'].join(','),
    ...out.map(r => [
      r.id,
      r.language,
      r.state,
      r.category,
      r.score,
      `"${r.flag_ids.replace(/"/g, '""')}"`,
      `"${(r.question_text || '').replace(/"/g, '""').replace(/\n/g, ' ').slice(0, 300)}"`,
      `"${(r.explanation || '').replace(/"/g, '""').replace(/\n/g, ' ').slice(0, 300)}"`,
    ].join(',')),
  ].join('\n');
  fs.writeFileSync('translation-quality-audit.csv', csvRows);
  console.log(`Wrote translation-quality-audit.csv (open in Excel/Sheets)`);

  console.log(`\nFix workflow:`);
  console.log(`  1. Open translation-quality-audit.csv, sort by 'score' desc`);
  console.log(`  2. Top 50-100 worst offenders -> open /admin -> search by id -> edit text`);
  console.log(`  3. Re-run this audit after fixing; expect score totals to drop`);
})();
