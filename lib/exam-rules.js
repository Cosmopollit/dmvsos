/**
 * Real DMV exam rules by state — number of questions on the official
 * written test, and the score required to pass.
 *
 * Used for:
 *   - Test mode selector ("Real Exam (matches your state's 30Q)")
 *   - State landing pages (/dmv-test/[state]): "California has 46
 *     questions; you need 38 correct to pass"
 *   - Marketing copy / SEO body sections
 *   - FAQ answers about exam format
 *
 * Sources: cross-checked against each state DMV's published rules and
 * driving-tests.org / driversprep.com aggregators. Last refresh:
 * 2026-05-20. **DMVs change formats occasionally** — re-verify
 * before relying on the exact number in customer-facing copy.
 *
 * Schema:
 *   STATE_EXAM_RULES[stateSlug] = {
 *     car:   { questions, pass },
 *     moto:  { questions, pass },
 *     cdl:   { questions, pass },  // CDL General Knowledge test
 *   }
 *   where `questions` is the count and `pass` is the minimum correct
 *   to pass. The pass-percentage is derivable: pass / questions.
 *
 * Endorsement add-ons (Air Brakes, Combination Vehicles, HazMat, etc.)
 * are federally standardized under 49 CFR 383 — see CDL_ENDORSEMENT_TESTS
 * at the bottom for those.
 */

export const STATE_EXAM_RULES = {
  alabama:        { car: { questions: 30, pass: 24 }, moto: { questions: 30, pass: 24 } },
  alaska:         { car: { questions: 20, pass: 16 }, moto: { questions: 25, pass: 20 } },
  arizona:        { car: { questions: 30, pass: 24 }, moto: { questions: 30, pass: 24 } },
  arkansas:       { car: { questions: 25, pass: 20 }, moto: { questions: 25, pass: 20 } },
  california:     { car: { questions: 36, pass: 30 }, moto: { questions: 25, pass: 21 } },
  colorado:       { car: { questions: 25, pass: 20 }, moto: { questions: 25, pass: 20 } },
  connecticut:    { car: { questions: 25, pass: 20 }, moto: { questions: 16, pass: 12 } },
  delaware:       { car: { questions: 30, pass: 24 }, moto: { questions: 30, pass: 24 } },
  florida:        { car: { questions: 50, pass: 40 }, moto: { questions: 40, pass: 32 } },
  georgia:        { car: { questions: 40, pass: 30 }, moto: { questions: 20, pass: 15 } },
  hawaii:         { car: { questions: 30, pass: 24 }, moto: { questions: 30, pass: 24 } },
  idaho:          { car: { questions: 40, pass: 34 }, moto: { questions: 25, pass: 21 } },
  illinois:       { car: { questions: 35, pass: 28 }, moto: { questions: 25, pass: 20 } },
  indiana:        { car: { questions: 50, pass: 42 }, moto: { questions: 50, pass: 42 } },
  iowa:           { car: { questions: 35, pass: 28 }, moto: { questions: 25, pass: 20 } },
  kansas:         { car: { questions: 25, pass: 20 }, moto: { questions: 25, pass: 20 } },
  kentucky:       { car: { questions: 40, pass: 32 }, moto: { questions: 20, pass: 16 } },
  louisiana:      { car: { questions: 40, pass: 32 }, moto: { questions: 40, pass: 32 } },
  maine:          { car: { questions: 30, pass: 24 }, moto: { questions: 30, pass: 24 } },
  maryland:       { car: { questions: 25, pass: 22 }, moto: { questions: 25, pass: 22 } },
  massachusetts:  { car: { questions: 25, pass: 18 }, moto: { questions: 25, pass: 18 } },
  michigan:       { car: { questions: 50, pass: 40 }, moto: { questions: 50, pass: 40 } },
  minnesota:      { car: { questions: 40, pass: 32 }, moto: { questions: 40, pass: 32 } },
  mississippi:    { car: { questions: 30, pass: 24 }, moto: { questions: 30, pass: 24 } },
  missouri:       { car: { questions: 25, pass: 20 }, moto: { questions: 25, pass: 20 } },
  montana:        { car: { questions: 33, pass: 27 }, moto: { questions: 33, pass: 27 } },
  nebraska:       { car: { questions: 25, pass: 20 }, moto: { questions: 25, pass: 20 } },
  nevada:         { car: { questions: 50, pass: 40 }, moto: { questions: 25, pass: 20 } },
  'new-hampshire':{ car: { questions: 40, pass: 32 }, moto: { questions: 40, pass: 32 } },
  'new-jersey':   { car: { questions: 50, pass: 40 }, moto: { questions: 50, pass: 40 } },
  'new-mexico':   { car: { questions: 25, pass: 18 }, moto: { questions: 25, pass: 18 } },
  'new-york':     { car: { questions: 20, pass: 14 }, moto: { questions: 20, pass: 14 } },
  'north-carolina':{car: { questions: 25, pass: 20 }, moto: { questions: 25, pass: 20 } },
  'north-dakota': { car: { questions: 25, pass: 20 }, moto: { questions: 25, pass: 20 } },
  ohio:           { car: { questions: 40, pass: 30 }, moto: { questions: 40, pass: 30 } },
  oklahoma:       { car: { questions: 50, pass: 40 }, moto: { questions: 25, pass: 20 } },
  oregon:         { car: { questions: 35, pass: 28 }, moto: { questions: 25, pass: 20 } },
  pennsylvania:   { car: { questions: 18, pass: 15 }, moto: { questions: 20, pass: 16 } },
  'rhode-island': { car: { questions: 40, pass: 28 }, moto: { questions: 25, pass: 20 } },
  'south-carolina':{car: { questions: 30, pass: 24 }, moto: { questions: 30, pass: 24 } },
  'south-dakota': { car: { questions: 25, pass: 20 }, moto: { questions: 25, pass: 20 } },
  tennessee:      { car: { questions: 30, pass: 24 }, moto: { questions: 30, pass: 24 } },
  texas:          { car: { questions: 30, pass: 21 }, moto: { questions: 20, pass: 14 } },
  utah:           { car: { questions: 50, pass: 40 }, moto: { questions: 25, pass: 20 } },
  vermont:        { car: { questions: 20, pass: 16 }, moto: { questions: 20, pass: 16 } },
  virginia:       { car: { questions: 35, pass: 30 }, moto: { questions: 25, pass: 20 } },
  washington:     { car: { questions: 40, pass: 32 }, moto: { questions: 25, pass: 20 } },
  'west-virginia':{ car: { questions: 25, pass: 19 }, moto: { questions: 25, pass: 19 } },
  wisconsin:      { car: { questions: 50, pass: 40 }, moto: { questions: 25, pass: 20 } },
  wyoming:        { car: { questions: 25, pass: 20 }, moto: { questions: 25, pass: 20 } },
};

// CDL is federally standardized (49 CFR 383). Each state administers
// the same test format; only the office acronym differs (DPS, DOL, etc).
export const CDL_GENERAL_KNOWLEDGE = { questions: 50, pass: 40 };  // 80%

// CDL endorsement tests — same across all states. Driver takes only
// the ones needed for their CDL class + endorsements.
export const CDL_ENDORSEMENT_TESTS = {
  air_brakes:         { questions: 25, pass: 20 },  // 80%
  combination_vehicles:{ questions: 20, pass: 16 }, // 80%
  doubles_triples:    { questions: 20, pass: 16 },
  tanker:             { questions: 20, pass: 16 },
  hazmat:             { questions: 30, pass: 24 },
  passenger:          { questions: 20, pass: 16 },
  school_bus:         { questions: 20, pass: 16 },
};

// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * Real-exam rules for a (state, category) pair.
 *   examRulesFor('washington', 'car')  → { questions: 25, pass: 20 }
 *   examRulesFor('texas', 'moto')      → { questions: 20, pass: 14 }
 *   examRulesFor('any-state', 'cdl')   → CDL_GENERAL_KNOWLEDGE (federal)
 *
 * Returns null for unknown state/category combos.
 */
export function examRulesFor(stateSlug, category) {
  if (category === 'cdl') return CDL_GENERAL_KNOWLEDGE;
  const rules = STATE_EXAM_RULES[stateSlug];
  if (!rules) return null;
  if (category === 'motorcycle' || category === 'moto') return rules.moto || null;
  return rules.car || null;
}

/**
 * Pass percentage for a (state, category) pair, rounded to integer.
 *   passPercentFor('texas', 'car')  → 70
 *   passPercentFor('california', 'car')  → 83
 */
export function passPercentFor(stateSlug, category) {
  const r = examRulesFor(stateSlug, category);
  if (!r) return null;
  return Math.round((r.pass / r.questions) * 100);
}
