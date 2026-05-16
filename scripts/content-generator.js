// Content generator for DMVSOS social channels (TikTok, Reels, Reddit, Shorts).
// Pulls hard / surprising / commonly-failed questions from Supabase and turns
// them into ready-to-post hooks in a JSON file you can paste straight in.
//
// Strategy:
//   • Reuse our 149k-question DB as a content moat — every TikTok = 1 question.
//   • Hook framework: "Most drivers get this DMV question wrong. Can you?"
//   • Tease answer → reveal with explanation → CTA to dmvsos.com/[state].
//
// Usage:
//   node scripts/content-generator.js                   # 20 scripts, mixed
//   node scripts/content-generator.js --count=50 --state=california --category=car --lang=en
//   node scripts/content-generator.js --tricky-only     # only hard-to-answer/sign questions

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const envFile = readFileSync(join(root, '.env.local'), 'utf8');
const env = (k) => envFile.split('\n').find(l => l.startsWith(k + '='))?.slice(k.length + 1)?.trim();

const SUPA_URL = env('NEXT_PUBLIC_SUPABASE_URL');
const SUPA_KEY = env('SUPABASE_SERVICE_ROLE_KEY');

const args = process.argv.slice(2);
const argVal = (k, d) => args.find(a => a.startsWith(`--${k}=`))?.split('=')[1] ?? d;
const count = parseInt(argVal('count', '20'), 10);
const stateFilter = argVal('state', null);
const categoryFilter = argVal('category', null);
const langFilter = argVal('lang', 'en');
const trickyOnly = args.includes('--tricky-only');

const H = { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` };

const STATE_NAMES = {
  'california': 'California', 'texas': 'Texas', 'florida': 'Florida',
  'new-york': 'New York', 'washington': 'Washington', 'illinois': 'Illinois',
  'georgia': 'Georgia', 'virginia': 'Virginia', 'arizona': 'Arizona',
  'pennsylvania': 'Pennsylvania', 'new-jersey': 'New Jersey',
  'north-carolina': 'North Carolina', 'massachusetts': 'Massachusetts',
};

const HOOKS_EN = [
  "Most people fail this DMV question. Can you answer it in 5 seconds?",
  "If you can't answer this, you'll fail your DMV test.",
  "This is the #1 question new drivers get wrong on the {state} DMV test.",
  "POV: It's test day and the proctor asks you this. What do you say?",
  "Bet you didn't know this {state} road rule.",
  "9 out of 10 new drivers fail this question. Try it.",
  "This sign trips up everyone. Do you know what it means?",
  "Real {state} DMV question. 30 seconds — go.",
  "If you've ever driven in the US, this should be easy. Try it.",
  "Watch before your DMV test. You'll thank me later.",
];

const CTA_EN = (state) => state
  ? `Practice 100+ real {state} questions free → dmvsos.com`
  : `Practice free → dmvsos.com (50 states, 5 languages)`;

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

async function fetchQuestions() {
  // We want a diverse, surprising pool. Strategy:
  //   • Pull a random-ish chunk with limit=2000, then filter/sort client-side.
  //   • Prioritize image-bearing (signs) and questions with explanations.
  let path = `questions?language=eq.${langFilter}&limit=2000&select=id,state,category,question_text,option_a,option_b,option_c,option_d,correct_answer,explanation,image_url`;
  if (stateFilter) path += `&state=eq.${stateFilter}`;
  if (categoryFilter) path += `&category=eq.${categoryFilter}`;

  const res = await fetch(`${SUPA_URL}/rest/v1/${path}`, { headers: H });
  if (!res.ok) throw new Error(`fetch failed: ${res.status} ${await res.text()}`);
  return res.json();
}

function score(q) {
  // Higher score = more shareable content
  let s = 0;
  if (q.image_url) s += 3;                     // road sign visuals crush on TikTok
  if (q.explanation && q.explanation.length > 30) s += 2;
  const txt = (q.question_text || '').toLowerCase();
  if (/never|always|must|forbidden|illegal|fine|penalty|jail|alcohol|bac|0\.08/.test(txt)) s += 2;
  if (/feet|seconds|mph|miles per hour|distance/.test(txt)) s += 2; // specific numbers = surprising
  if (txt.length < 200 && txt.length > 40) s += 1;                  // readable on phone
  return s;
}

function answerLetter(idx) { return ['A', 'B', 'C', 'D'][idx] || '?'; }

function strip(opt) { return (opt || '').replace(/^[A-Da-dА-Га-г]\.\s*/, ''); }

function buildScript(q) {
  const stateName = STATE_NAMES[q.state] || q.state;
  const hook = pick(HOOKS_EN).replace('{state}', stateName);
  const cta = CTA_EN(stateName).replace('{state}', stateName);
  const correctIdx = q.correct_answer;
  const correctOpt = strip([q.option_a, q.option_b, q.option_c, q.option_d][correctIdx]);

  return {
    id: q.id,
    state: q.state,
    category: q.category,
    has_image: !!q.image_url,
    image_url: q.image_url || null,
    score: score(q),
    tiktok: {
      hook,
      question: q.question_text,
      options: [strip(q.option_a), strip(q.option_b), strip(q.option_c), strip(q.option_d)].filter(Boolean),
      reveal: `Answer: ${answerLetter(correctIdx)} — ${correctOpt}`,
      why: q.explanation || null,
      cta,
      hashtags: ['#dmvtest', `#${q.state.replace(/-/g, '')}dmv`, '#drivingtest', '#newdriver', '#driverslicense', '#usadriving'],
      caption: `${hook}\n\n${q.question_text}\n\nA) ${strip(q.option_a)}\nB) ${strip(q.option_b)}\nC) ${strip(q.option_c)}\nD) ${strip(q.option_d)}\n\nComment your guess 👇 Answer in next post.\n\n${cta}`,
    },
    reddit: {
      subreddits: ['r/newjersey', `r/${q.state.replace(/-/g, '')}`, 'r/dmv', 'r/immigration', 'r/personalfinance'],
      title: `${hook} (${stateName} DMV)`,
      body: `Quick context: I'm building a free DMV prep tool at dmvsos.com (50 states, 5 langs, no sign-up).\n\nHere's a sample from the ${stateName} pool — curious if folks get it right:\n\n> ${q.question_text}\n>\n> A) ${strip(q.option_a)}\n> B) ${strip(q.option_b)}\n> C) ${strip(q.option_c)}\n> D) ${strip(q.option_d)}\n\nWill drop the answer + explanation in a comment in ~1h.`,
      answer_comment: `Answer: **${answerLetter(correctIdx)}** — ${correctOpt}\n\n${q.explanation || ''}\n\nIf you want to drill 100s more, free at dmvsos.com.`,
    },
    twitter: {
      tweet: `${hook}\n\n${q.question_text.slice(0, 180)}${q.question_text.length > 180 ? '…' : ''}\n\nAnswer: ${answerLetter(correctIdx)}\n\ndmvsos.com`,
    },
  };
}

const pool = await fetchQuestions();
console.log(`Pool: ${pool.length} questions (lang=${langFilter}, state=${stateFilter || 'all'}, category=${categoryFilter || 'all'})`);

let candidates = pool.filter(q => q.question_text && q.correct_answer != null);
if (trickyOnly) {
  candidates = candidates.filter(q => score(q) >= 4);
  console.log(`Tricky-only filter: ${candidates.length} candidates remaining`);
}

// Sort by score desc, then pick top N with some shuffle to vary across runs
candidates.sort((a, b) => score(b) - score(a));
const top = candidates.slice(0, count * 3);
for (let i = top.length - 1; i > 0; i--) {
  const j = Math.floor(Math.random() * (i + 1));
  [top[i], top[j]] = [top[j], top[i]];
}
const picked = top.slice(0, count);

const scripts = picked.map(buildScript);

const outPath = join(root, `content-scripts-${langFilter}-${Date.now()}.json`);
writeFileSync(outPath, JSON.stringify(scripts, null, 2));

console.log(`\nGenerated ${scripts.length} scripts → ${outPath}`);
console.log(`\nPreview of first script:\n`);
console.log(scripts[0].tiktok.caption);
console.log(`\n--- Reddit title: ${scripts[0].reddit.title}`);
console.log(`--- Has image: ${scripts[0].has_image}`);

// Posting calendar suggestion: 1/day spread across the month
const today = new Date();
const calendar = scripts.map((s, i) => {
  const d = new Date(today.getTime() + i * 86400000);
  return { date: d.toISOString().slice(0, 10), id: s.id, channel: i % 3 === 0 ? 'reddit' : 'tiktok' };
});
writeFileSync(join(root, `content-calendar-${langFilter}.json`), JSON.stringify(calendar, null, 2));
console.log(`\nCalendar saved → content-calendar-${langFilter}.json`);
