#!/usr/bin/env node
/**
 * Show N random clusters with EN + all 4 translations side-by-side.
 * Read-only diagnostic.
 *
 * Usage:
 *   node scripts/sample-translations.js                  # 5 random from car
 *   node scripts/sample-translations.js --n=10           # 10 samples
 *   node scripts/sample-translations.js --category=cdl --subcategory=air_brakes
 *   node scripts/sample-translations.js --good           # skip EN-fallback (only translated)
 */

'use strict';

try {
  const fs = require('fs');
  const txt = fs.readFileSync('.env.local', 'utf8');
  for (const line of txt.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch (_) {}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

const N             = parseInt(process.argv.find(a => a.startsWith('--n='))?.split('=')[1] || '5', 10);
const CATEGORY      = process.argv.find(a => a.startsWith('--category='))?.split('=')[1] || 'car';
const SUBCATEGORY   = process.argv.find(a => a.startsWith('--subcategory='))?.split('=')[1];
const ONLY_GOOD     = process.argv.includes('--good');

async function sb(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

const hasCyrillic = (s) => /[Ѐ-ӿ]/.test(s || '');
const hasCJK      = (s) => /[一-鿿]/.test(s || '');

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  blue: '\x1b[34m', cyan: '\x1b[36m', yellow: '\x1b[33m',
  green: '\x1b[32m', red: '\x1b[31m', gray: '\x1b[90m',
};

const LANG_LABEL = { en: 'EN', ru: 'RU', es: 'ES', zh: 'ZH', ua: 'UA' };

(async () => {
  const subFilter = SUBCATEGORY ? `&subcategory=eq.${encodeURIComponent(SUBCATEGORY)}` : '';
  // Pick from a single big state to maximise hit-rate; randomise by limiting and ordering
  console.log(`${C.dim}Fetching ${CATEGORY}${SUBCATEGORY ? '/' + SUBCATEGORY : ''} samples...${C.reset}\n`);

  // Step 1: pull EN from a few random states (small queries, big queries timeout in Supabase)
  const ALL_STATES = ['washington','california','texas','florida','new-york','arizona','colorado','illinois','ohio','michigan','pennsylvania','virginia','iowa','oregon','georgia'];
  const pickStates = ALL_STATES.sort(() => Math.random() - 0.5).slice(0, 5);
  const ens = [];
  for (const st of pickStates) {
    const rows = await sb(
      `questions?select=cluster_code,state,question_text,option_a,option_b,option_c,option_d,explanation,correct_answer&state=eq.${st}&category=eq.${CATEGORY}&language=eq.en&cluster_code=not.is.null${subFilter}&limit=200`
    );
    ens.push(...rows);
  }
  if (!ens.length) { console.error('No EN questions found.'); process.exit(1); }

  // Shuffle and try clusters until we have N with all 4 translations
  for (let i = ens.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ens[i], ens[j]] = [ens[j], ens[i]];
  }

  const samples = [];
  for (const en of ens) {
    if (samples.length >= N) break;
    const translations = await sb(
      `questions?select=language,question_text,option_a,option_b,option_c,option_d,explanation&cluster_code=eq.${encodeURIComponent(en.cluster_code)}&language=in.(ru,es,zh,ua)`
    );
    if (translations.length < 4) continue; // skip incomplete clusters

    if (ONLY_GOOD) {
      const ru = translations.find(t => t.language === 'ru');
      const zh = translations.find(t => t.language === 'zh');
      const ua = translations.find(t => t.language === 'ua');
      const es = translations.find(t => t.language === 'es');
      const bad =
        (ru && !hasCyrillic(ru.question_text)) ||
        (ua && !hasCyrillic(ua.question_text)) ||
        (zh && !hasCJK(zh.question_text)) ||
        (es && es.question_text === en.question_text);
      if (bad) continue;
    }

    samples.push({ en, translations });
  }

  if (!samples.length) { console.error('No complete clusters found.'); process.exit(1); }

  // Pretty-print
  for (let i = 0; i < samples.length; i++) {
    const { en, translations } = samples[i];
    const correctLetter = ['A', 'B', 'C', 'D'][en.correct_answer];

    console.log(`${C.bold}${C.blue}─── Sample ${i + 1}/${samples.length}  [${en.cluster_code}]  state=${en.state}  correct=${correctLetter} ───${C.reset}\n`);

    // EN block
    console.log(`${C.bold}${C.cyan}EN${C.reset}`);
    console.log(`  Q: ${en.question_text}`);
    console.log(`  A) ${en.option_a}`);
    console.log(`  B) ${en.option_b}`);
    console.log(`  C) ${en.option_c}`);
    console.log(`  D) ${en.option_d}`);
    if (en.explanation) console.log(`  ${C.dim}Expl: ${en.explanation}${C.reset}`);
    console.log();

    // Each translation
    for (const lang of ['ru', 'es', 'zh', 'ua']) {
      const t = translations.find(x => x.language === lang);
      if (!t) continue;

      let label = `${LANG_LABEL[lang]}`;
      let isBad = false;
      if (lang === 'ru' || lang === 'ua') isBad = !hasCyrillic(t.question_text);
      else if (lang === 'zh') isBad = !hasCJK(t.question_text);
      else if (lang === 'es') isBad = t.question_text === en.question_text;

      const color = isBad ? C.red : C.green;
      const marker = isBad ? ' ⚠️ EN-fallback' : '';
      console.log(`${C.bold}${color}${label}${marker}${C.reset}`);
      console.log(`  Q: ${t.question_text}`);
      console.log(`  A) ${t.option_a}`);
      console.log(`  B) ${t.option_b}`);
      console.log(`  C) ${t.option_c}`);
      console.log(`  D) ${t.option_d}`);
      if (t.explanation) console.log(`  ${C.dim}Expl: ${t.explanation}${C.reset}`);
      console.log();
    }
  }
})();
