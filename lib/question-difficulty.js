/**
 * Heuristic difficulty score for a test question — no DB column needed, works
 * on the question text + options in any of our 5 languages.
 *
 * Used to bias the FREE tier toward hard questions: the free ride should feel
 * like the real exam's tricky end ("wow, this is harder than I thought"), so
 * the value of full prep is obvious. Paid modes keep the natural mix.
 *
 * Signals (well-known hard classes in DMV prep):
 *  - Numbers: fines, distances, speeds, BAC, days/points. Numeric recall is
 *    the classic fail category. Strongest weight, language-independent.
 *  - Negation / exception wording ("not", "except", "unless", "false" and the
 *    RU/ES/ZH/UA equivalents) — trips fast readers.
 *  - Confusable options: several options sharing the same first word(s).
 *  - "All/none of the above"-style options.
 *  - Sheer length: long stem + long options = more parsing under time.
 */

const NEGATION = /\b(not|never|except|unless|false|prohibited|illegal|нельзя|запрещ|не разреш|кроме|неверн|заборон|крім|окрім|excepto|prohibid|ilegal|nunca|falso)\b|不得|禁止|不正确|除非|除了/i;

const ALL_OF_ABOVE = /(all|none|both) of the above|всё вышеперечисленн|все вышеука|все перечисленн|усе перелічен|todas las anteriores|ninguna de las anteriores|以上(都|全部|均)/i;

// Digits, plus spelled-out units that flag numeric-rule questions even when
// the stem itself has no digit ("within how many days must you notify...").
const NUMERIC_UNITS = /\d|mph|миль в час|км\/ч|feet|фут|ft\b|metros|метр|米|hours|час[оа]|годин|horas|小时|days|дней|днів|días|天|months|месяц|місяц|meses|个月|points|балл|бали|puntos|分|BAC|promille|%/i;

export function difficultyScore(q) {
  const stem = q.question || '';
  const answers = q.answers || [];
  let score = 0;

  // Numeric recall — the hard core. Digits in 2+ options means the choices
  // are competing numbers (25 vs 50 vs 100 feet): peak confusability.
  const numericOptions = answers.filter(a => /\d/.test(a)).length;
  if (numericOptions >= 2) score += 4;
  else if (numericOptions === 1 || NUMERIC_UNITS.test(stem)) score += 2;

  if (NEGATION.test(stem)) score += 2;
  if (answers.some(a => ALL_OF_ABOVE.test(a))) score += 1;

  // Confusable options: share the same opening word (e.g. "Yield to...", 4x).
  const firstWords = answers.map(a => (a.trim().split(/\s+/)[0] || '').toLowerCase()).filter(Boolean);
  if (firstWords.length >= 3 && new Set(firstWords).size < firstWords.length) score += 1;

  // Parsing load.
  if (stem.length > 120) score += 1;
  const avgOpt = answers.length ? answers.reduce((s, a) => s + a.length, 0) / answers.length : 0;
  if (avgOpt > 45) score += 1;

  return score;
}

/**
 * Pick `limit` questions for the FREE tier from a (pre-shuffled) pool:
 * take the hardest ~2x-limit slice, then shuffle inside it so retakes still
 * vary. Falls back gracefully on tiny pools.
 */
export function pickHardest(pool, limit) {
  if (pool.length <= limit) return pool.slice(0, limit);
  const scored = pool.map(q => ({ q, d: difficultyScore(q) }));
  scored.sort((a, b) => b.d - a.d);
  const hard = scored.slice(0, Math.max(limit * 2, Math.min(30, pool.length))).map(x => x.q);
  for (let i = hard.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [hard[i], hard[j]] = [hard[j], hard[i]];
  }
  return hard.slice(0, limit);
}
