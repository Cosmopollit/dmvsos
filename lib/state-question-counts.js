// Per-state question-bank sizes (distinct questions, counted in one
// language so the 5 language copies do not inflate the number). Static
// snapshot so the SEO state pages read a real, consistent per-state count
// without a live DB query. Regenerate with scripts/count-state-questions.mjs.
// Generated total across 50 states: 28586.

export const STATE_QUESTION_COUNTS = {
  "alabama": 568,
  "alaska": 580,
  "arizona": 607,
  "arkansas": 594,
  "california": 635,
  "colorado": 624,
  "connecticut": 559,
  "delaware": 719,
  "florida": 637,
  "georgia": 596,
  "hawaii": 420,
  "idaho": 560,
  "illinois": 666,
  "indiana": 542,
  "iowa": 572,
  "kansas": 579,
  "kentucky": 561,
  "louisiana": 623,
  "maine": 509,
  "maryland": 558,
  "massachusetts": 507,
  "michigan": 588,
  "minnesota": 655,
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
  "oregon": 725,
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
  "wisconsin": 743,
  "wyoming": 576,
};

// Same, split by DB category (car / motorcycle / cdl) — the per-pass
// surfaces (paywall, /upgrade terminal) sell ONE category, so their
// numbers must be the category bank, not the whole-state bank.
export const STATE_CATEGORY_COUNTS = {
  "alabama": { car: 170, motorcycle: 108, cdl: 290 },
  "alaska": { car: 148, motorcycle: 125, cdl: 307 },
  "arizona": { car: 139, motorcycle: 119, cdl: 349 },
  "arkansas": { car: 139, motorcycle: 104, cdl: 351 },
  "california": { car: 180, motorcycle: 103, cdl: 352 },
  "colorado": { car: 151, motorcycle: 114, cdl: 359 },
  "connecticut": { car: 113, motorcycle: 91, cdl: 355 },
  "delaware": { car: 255, motorcycle: 117, cdl: 347 },
  "florida": { car: 200, motorcycle: 106, cdl: 331 },
  "georgia": { car: 160, motorcycle: 127, cdl: 309 },
  "hawaii": { car: 135, motorcycle: 102, cdl: 183 },
  "idaho": { car: 104, motorcycle: 121, cdl: 335 },
  "illinois": { car: 194, motorcycle: 104, cdl: 368 },
  "indiana": { car: 108, motorcycle: 98, cdl: 336 },
  "iowa": { car: 121, motorcycle: 111, cdl: 340 },
  "kansas": { car: 163, motorcycle: 79, cdl: 337 },
  "kentucky": { car: 146, motorcycle: 107, cdl: 308 },
  "louisiana": { car: 154, motorcycle: 109, cdl: 360 },
  "maine": { car: 186, motorcycle: 87, cdl: 236 },
  "maryland": { car: 101, motorcycle: 107, cdl: 350 },
  "massachusetts": { car: 136, motorcycle: 137, cdl: 234 },
  "michigan": { car: 135, motorcycle: 105, cdl: 348 },
  "minnesota": { car: 258, motorcycle: 94, cdl: 303 },
  "mississippi": { car: 107, motorcycle: 90, cdl: 342 },
  "missouri": { car: 149, motorcycle: 91, cdl: 315 },
  "montana": { car: 126, motorcycle: 98, cdl: 309 },
  "nebraska": { car: 117, motorcycle: 118, cdl: 403 },
  "nevada": { car: 135, motorcycle: 93, cdl: 335 },
  "new-hampshire": { car: 139, motorcycle: 121, cdl: 234 },
  "new-jersey": { car: 146, motorcycle: 136, cdl: 325 },
  "new-mexico": { car: 133, motorcycle: 90, cdl: 345 },
  "new-york": { car: 100, motorcycle: 74, cdl: 233 },
  "north-carolina": { car: 120, motorcycle: 109, cdl: 322 },
  "north-dakota": { car: 129, motorcycle: 87, cdl: 364 },
  "ohio": { car: 148, motorcycle: 112, cdl: 351 },
  "oklahoma": { car: 128, motorcycle: 111, cdl: 232 },
  "oregon": { car: 244, motorcycle: 140, cdl: 341 },
  "pennsylvania": { car: 127, motorcycle: 165, cdl: 320 },
  "rhode-island": { car: 122, motorcycle: 105, cdl: 233 },
  "south-carolina": { car: 136, motorcycle: 121, cdl: 333 },
  "south-dakota": { car: 128, motorcycle: 100, cdl: 280 },
  "tennessee": { car: 150, motorcycle: 103, cdl: 319 },
  "texas": { car: 200, motorcycle: 83, cdl: 282 },
  "utah": { car: 137, motorcycle: 107, cdl: 233 },
  "vermont": { car: 126, motorcycle: 77, cdl: 308 },
  "virginia": { car: 121, motorcycle: 102, cdl: 234 },
  "washington": { car: 200, motorcycle: 129, cdl: 302 },
  "west-virginia": { car: 105, motorcycle: 133, cdl: 345 },
  "wisconsin": { car: 269, motorcycle: 123, cdl: 351 },
  "wyoming": { car: 131, motorcycle: 128, cdl: 317 },
};

// Total distinct questions across all states (for the global "N+ bank" line).
export const TOTAL_QUESTIONS = 28586;

export function questionCountForState(slug) {
  return STATE_QUESTION_COUNTS[slug] || null;
}

// cat: DB category ("car" | "motorcycle" | "cdl").
export function questionCountForStateCategory(slug, cat) {
  return STATE_CATEGORY_COUNTS[slug]?.[cat] || null;
}
