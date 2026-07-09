// Per-state question-bank sizes (distinct questions, counted in one
// language so the 5 language copies do not inflate the number). Static
// snapshot so the SEO state pages read a real, consistent per-state count
// without a live DB query. Regenerate with scripts/count-state-questions.mjs.
// Generated total across 50 states: 27848.

export const STATE_QUESTION_COUNTS = {
  "alabama": 568,
  "alaska": 580,
  "arizona": 607,
  "arkansas": 594,
  "california": 635,
  "colorado": 624,
  "connecticut": 559,
  "delaware": 561,
  "florida": 637,
  "georgia": 596,
  "hawaii": 420,
  "idaho": 560,
  "illinois": 755,
  "indiana": 542,
  "iowa": 572,
  "kansas": 579,
  "kentucky": 561,
  "louisiana": 623,
  "maine": 366,
  "maryland": 558,
  "massachusetts": 507,
  "michigan": 588,
  "minnesota": 495,
  "mississippi": 539,
  "missouri": 555,
  "montana": 533,
  "nebraska": 638,
  "nevada": 563,
  "new-hampshire": 494,
  "new-jersey": 607,
  "new-mexico": 568,
  "new-york": 407,
  "north-carolina": 551,
  "north-dakota": 580,
  "ohio": 611,
  "oklahoma": 471,
  "oregon": 537,
  "pennsylvania": 612,
  "rhode-island": 460,
  "south-carolina": 590,
  "south-dakota": 508,
  "tennessee": 572,
  "texas": 565,
  "utah": 477,
  "vermont": 511,
  "virginia": 457,
  "washington": 631,
  "west-virginia": 583,
  "wisconsin": 565,
  "wyoming": 576,
};

// Total distinct questions across all states (for the global "N+ bank" line).
export const TOTAL_QUESTIONS = 27848;

export function questionCountForState(slug) {
  return STATE_QUESTION_COUNTS[slug] || null;
}
