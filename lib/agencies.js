/**
 * Driver-licensing agencies by US state.
 *
 * The agency users actually see at the office is not always "DMV" —
 * Washington uses DOL, Illinois uses SOS, Pennsylvania uses PennDOT,
 * etc. We use this mapping in:
 *
 *   • Test page button label ("Посмотреть оригинал в DOL" instead of
 *     "...DMV" for WA users — see app/test/page.js).
 *   • State landing pages (/dmv-test/[state]) — to refer to the right
 *     agency in body copy and schema.
 *   • Manuals page — when describing where the manual comes from.
 *   • Marketing / SEO copy — "If you live in Washington, your test
 *     is at DOL" reads more authentic than generic "DMV".
 *
 * Single source of truth: lib/manual-data.js STATE_META.dmvAbbr.
 * This file re-shapes that data into agency-keyed lookups and adds
 * full agency names + descriptions.
 */

import { STATE_META } from './manual-data';

// ── Full name for each short code ─────────────────────────────────────────
export const AGENCY_FULL_NAMES = {
  DMV: 'Department of Motor Vehicles',
  DOL: 'Department of Licensing',         // Washington
  SOS: 'Secretary of State',              // Illinois, Michigan
  PennDOT: 'Pennsylvania Department of Transportation',
  DPS: 'Department of Public Safety',     // Texas, Oklahoma, South Dakota
  MVD: 'Motor Vehicle Division',          // Arizona, Montana, New Mexico
  BMV: 'Bureau of Motor Vehicles',        // Indiana, Maine, Ohio
  MVA: 'Motor Vehicle Administration',    // Maryland
  RMV: 'Registry of Motor Vehicles',      // Massachusetts
  MVC: 'Motor Vehicle Commission',        // New Jersey
  DDS: 'Department of Driver Services',   // Georgia
  DVS: 'Driver and Vehicle Services',     // Minnesota
  OMV: 'Office of Motor Vehicles',        // Louisiana
  DOT: 'Department of Transportation',    // Iowa, North Dakota, Wyoming
  DOS: 'Department of Safety',            // Tennessee
  DLD: 'Driver License Division',         // Utah
};

// ── Computed: agency code → list of state slugs ───────────────────────────
// Derived from STATE_META so adding a state automatically lands in the
// right group. Sorted alphabetically for stable iteration.
export const BY_AGENCY = (() => {
  const groups = {};
  for (const [slug, meta] of Object.entries(STATE_META)) {
    const code = meta.dmvAbbr || 'DMV';
    if (!groups[code]) groups[code] = [];
    groups[code].push(slug);
  }
  for (const code of Object.keys(groups)) groups[code].sort();
  return groups;
})();

// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * Short agency code for a state ("DOL", "DPS", "DMV", ...).
 * Falls back to "DMV" for unknown slugs.
 */
export function agencyAbbrForState(stateSlug) {
  return STATE_META[stateSlug]?.dmvAbbr || 'DMV';
}

/**
 * Full agency name with state prefix:
 *   washington → "Washington Department of Licensing"
 *   california → "California Department of Motor Vehicles"
 *
 * Returns null if state is unknown.
 */
export function agencyFullNameForState(stateSlug) {
  const meta = STATE_META[stateSlug];
  if (!meta) return null;
  return meta.agency;
}

/**
 * States that use the given agency abbreviation.
 *   listStatesForAgency('DOL')      → ['washington']
 *   listStatesForAgency('PennDOT')  → ['pennsylvania']
 *   listStatesForAgency('DMV')      → ['alabama', 'alaska', ...]
 */
export function listStatesForAgency(abbr) {
  return BY_AGENCY[abbr] || [];
}

/**
 * Sorted list of all distinct agency codes in use ([DMV, DOL, DPS, ...]).
 * Useful for building filter UIs or sitemap section headers.
 */
export function allAgencyCodes() {
  return Object.keys(BY_AGENCY).sort();
}
