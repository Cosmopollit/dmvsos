// Group helper logic for @dmvsos_support_bot.
//
// Detects DMV-related questions in group chats and replies once per hour
// per chat. State-aware: if the user mentions a US state by name (EN/RU/UA/ES)
// or its 2-letter code, the reply links straight to dmvsos.com/<state>.
//
// Used by app/api/telegram/route.js for non-command group messages.

import { STATE_OPTIONS, stateToSlug } from './states.js';

// ── Keyword triggers ─────────────────────────────────────────────────────
// Match if message contains a DMV-related term. Question mark NOT required —
// many people ask without it. We rely on throttle + admin /disable to control noise.
const TRIGGER_PATTERNS = [
  // English
  /\bdmv\b/i,
  /\bdriver(?:'?s)?\s+(?:license|licence|permit|test|manual|handbook|ed)\b/i,
  /\bdriving\s+(?:test|license|licence|permit|manual)\b/i,
  /\blearner(?:'?s)?\s+permit\b/i,
  /\broad\s+test\b/i,
  /\bwritten\s+test\b/i,
  /\bcdl\b/i,

  // Russian — `\b` doesn't work on Cyrillic in JS; use explicit non-letter boundaries
  /(?:^|[^\p{L}])(права|правах|правам|правами)(?:[^\p{L}]|$)/iu,
  /(?:^|[^\p{L}])сдав[аяею]/iu,        // "сдавать", "сдавая", "сдаю", "сдаём"
  /водительск/iu,                      // "водительские", "водительского"
  /(?:^|[^\p{L}])дмв(?:[^\p{L}]|$)/iu, // "ДМВ" Cyrillic
  /(?:^|[^\p{L}])пермит/iu,

  // Ukrainian
  /(?:^|[^\p{L}])прав[аи]/iu,
  /водійськ/iu,

  // Spanish
  /\blicencia\s+de\s+(?:conducir|manejar)\b/i,
  /\bexamen\s+(?:de\s+)?(?:manejo|conducir|teor)/i,
  /\bpermiso\s+de\s+aprendiz\b/i,

  // Chinese (basic)
  /驾照|驾驶证|驾驶执照|路考|笔试/,
];

// ── State detection ──────────────────────────────────────────────────────
// Build name + 2-letter code + Cyrillic alias map → slug.
const STATE_ALIASES = {
  // Cyrillic (most common only — exhaustive list is overkill at this scale)
  'калифорни': 'california', 'техас': 'texas', 'флорид': 'florida',
  'нью-йорк': 'new-york', 'нью йорк': 'new-york', 'ньюйорк': 'new-york',
  'вашингтон': 'washington', 'иллинойс': 'illinois', 'джорджи': 'georgia',
  'вирджини': 'virginia', 'аризон': 'arizona', 'пенсильвани': 'pennsylvania',
  'нью-джерси': 'new-jersey', 'нью джерси': 'new-jersey',
  'северн.*каролин': 'north-carolina', 'южн.*каролин': 'south-carolina',
  'массачусетс': 'massachusetts', 'огайо': 'ohio', 'мичиган': 'michigan',
  'орегон': 'oregon', 'невад': 'nevada', 'мэрилэнд': 'maryland', 'мэриленд': 'maryland',
  'колорадо': 'colorado', 'аляска': 'alaska', 'гавайи': 'hawaii',
};

// State names: case-insensitive (longest first to avoid prefix collisions).
// State codes: UPPERCASE-only — otherwise "de", "or", "in" etc. blow up in any sentence.
const STATE_PATTERNS = [
  // RU/UA Cyrillic aliases first (no overlap with EN words)
  ...Object.entries(STATE_ALIASES).map(([alias, slug]) => ({
    slug,
    re: new RegExp(alias, 'iu'),
  })),
  // EN full names, longest first so "New York" beats "York"
  ...STATE_OPTIONS
    .map(opt => ({
      slug: stateToSlug(opt),
      name: opt.replace(/\s*\([A-Z]{2}\)\s*$/, '').trim(),
    }))
    .sort((a, b) => b.name.length - a.name.length)
    .map(({ slug, name }) => ({ slug, re: new RegExp(`\\b${escape(name)}\\b`, 'i') })),
  // 2-letter codes, case-SENSITIVE (must be uppercase)
  ...STATE_OPTIONS.map(opt => ({
    slug: stateToSlug(opt),
    code: opt.match(/\(([A-Z]{2})\)/)?.[1],
  })).filter(x => x.code).map(({ slug, code }) => ({ slug, re: new RegExp(`\\b${code}\\b`) })),
];

function escape(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

export function detectState(text) {
  for (const { slug, re } of STATE_PATTERNS) {
    if (re.test(text)) return slug;
  }
  return null;
}

export function matchTrigger(text) {
  for (const re of TRIGGER_PATTERNS) {
    const m = text.match(re);
    if (m) return m[0];
  }
  return null;
}

// ── Reply composition ────────────────────────────────────────────────────
export function composeReply(lang, stateSlug, userName) {
  const stateName = stateSlug
    ? STATE_OPTIONS.find(o => stateToSlug(o) === stateSlug)?.replace(/\s*\([A-Z]{2}\)\s*$/, '') || stateSlug
    : null;

  const link = stateSlug
    ? `https://dmvsos.com/category?state=${stateSlug}&lang=${lang}`
    : `https://dmvsos.com/?lang=${lang}`;

  const M = {
    en: stateName
      ? `👋 Hi ${userName}! For ${stateName} — practice questions from the official handbook (5 languages, free start): ${link}`
      : `👋 Hi ${userName}! Free DMV practice for all 50 states (5 languages): ${link}`,
    ru: stateName
      ? `👋 Привет, ${userName}! По ${stateName} — вопросы из официального handbook (5 языков, бесплатный старт): ${link}`
      : `👋 Привет, ${userName}! Бесплатная подготовка к DMV для всех 50 штатов (5 языков): ${link}`,
    ua: stateName
      ? `👋 Привіт, ${userName}! По ${stateName} — питання з офіційного handbook (5 мов, безкоштовний старт): ${link}`
      : `👋 Привіт, ${userName}! Безкоштовна підготовка до DMV для всіх 50 штатів: ${link}`,
    es: stateName
      ? `👋 ¡Hola ${userName}! Para ${stateName} — preguntas del manual oficial (5 idiomas, gratis): ${link}`
      : `👋 ¡Hola ${userName}! Práctica DMV gratis para los 50 estados (5 idiomas): ${link}`,
    zh: stateName
      ? `👋 你好 ${userName}！${stateName} 官方手册练习题（5种语言，免费开始）：${link}`
      : `👋 你好 ${userName}！全美50州DMV免费练习（5种语言）：${link}`,
  };

  return M[lang] || M.en;
}

// ── Throttle ─────────────────────────────────────────────────────────────
// Bot replies at most once per chat per THROTTLE_MS, to avoid being kicked
// as spam by group admins.
export const THROTTLE_MS = 60 * 60 * 1000; // 1 hour

export function isThrottled(lastReplyAt) {
  if (!lastReplyAt) return false;
  return Date.now() - new Date(lastReplyAt).getTime() < THROTTLE_MS;
}
