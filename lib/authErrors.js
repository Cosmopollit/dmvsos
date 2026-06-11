// Turns raw Supabase / network auth errors (always English) into a localized,
// human message. Ported from the mobile app (src/lib/auth-errors.ts) — same
// reason: our audience is multilingual immigrants, and surfacing "Invalid
// login credentials" in English to a Spanish/Chinese user reads as broken.
//
// Pages already hold `tex` (the active language block from translations.js),
// so pass it in. Substring matching is case-insensitive because Supabase
// wording shifts between versions; anything unrecognized falls back to the
// localized generic instead of leaking raw English.

const RULES = [
  { test: /already registered|already exists|already been registered/i, key: 'errUserExists' },
  { test: /email not confirmed|confirm your email|not confirmed/i, key: 'errEmailNotConfirmed' },
  { test: /invalid login credentials|invalid credentials|wrong password|incorrect/i, key: 'errInvalidCredentials' },
  { test: /password should be at least|password.*6 char|weak password|password is too short/i, key: 'errPasswordShort' },
  { test: /unable to validate email|invalid format|invalid email|valid email/i, key: 'errInvalidEmail' },
  { test: /rate limit|too many|for security purposes|after \d+ seconds/i, key: 'errRateLimit' },
  { test: /network|failed to fetch|timeout|timed out|offline|connection/i, key: 'errNetwork' },
  { test: /user not found|no user|not found/i, key: 'errUserNotFound' },
];

export function localizeAuthError(raw, tex) {
  const generic = (tex && tex.somethingWentWrong) || 'Something went wrong';
  if (!raw) return generic;
  for (const rule of RULES) {
    if (rule.test.test(raw)) return (tex && tex[rule.key]) || generic;
  }
  return generic;
}
