// Shared helpers for the auth UI: email normalization, common-typo
// suggestions, and in-app browser detection. Used by /login and
// /reset-password so the same rules apply at every email entry point.

// Normalize before sending to Supabase. The client SDK does not lowercase
// or trim for us, so " Galina@Gmail.com " (phone auto-capitalization + a
// trailing space) would create / target a different identity than the
// lowercased form our backend (webhook, passes endpoint) uses everywhere.
export function normalizeEmail(raw) {
  return (raw || '').trim().toLowerCase();
}

// The handful of providers our audience actually uses. mail.ru / yandex.ru
// are here because a large share of users are Russian-speaking.
const COMMON_DOMAINS = [
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com',
  'aol.com', 'proton.me', 'protonmail.com', 'live.com', 'msn.com',
  'gmx.com', 'mail.ru', 'yandex.ru', 'ukr.net', 'qq.com', '163.com',
];

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const prev = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(
        prev[j] + 1,           // deletion
        prev[j - 1] + 1,       // insertion
        diag + (a[i - 1] === b[j - 1] ? 0 : 1) // substitution
      );
      diag = tmp;
    }
  }
  return prev[n];
}

// Returns a corrected email string if the domain looks like a 1-2 character
// typo of a common provider (gamil.com → gmail.com, yaho.com → yahoo.com),
// otherwise null. Catches the exact failure that silently bounced
// gudeliafelipe7@gamil.com. Conservative: only fires when the domain is
// close to a known provider but not an exact match, so real company /
// custom domains are never "corrected".
export function suggestEmailFix(rawEmail) {
  const email = (rawEmail || '').trim().toLowerCase();
  const at = email.lastIndexOf('@');
  if (at <= 0 || at === email.length - 1) return null;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (!domain.includes('.')) return null;
  if (COMMON_DOMAINS.includes(domain)) return null;

  let best = null;
  let bestDist = Infinity;
  for (const d of COMMON_DOMAINS) {
    const dist = levenshtein(domain, d);
    if (dist < bestDist) { bestDist = dist; best = d; }
  }
  // 1-2 edits away from a known provider → very likely a typo. Larger
  // distances are probably a legitimate domain we don't know about.
  if (best && bestDist >= 1 && bestDist <= 2) {
    return `${local}@${best}`;
  }
  return null;
}

// Detects the embedded browsers inside social apps (Facebook, Instagram,
// TikTok, etc.). Critical because Google OAuth refuses to run in these
// webviews ("disallowed_useragent"), and a large slice of our traffic
// arrives from facebook.com / l.instagram.com links opened in-app. In that
// case we hide the Google button and steer the user to email sign-in.
// \bwv\b is the standalone Android WebView token ("; wv)"), word-bounded so
// it never matches inside another word.
export function isInAppBrowser() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /FBAN|FBAV|FB_IAB|FBIOS|Instagram|Line\/|Twitter|TikTok|musical_ly|Snapchat|Pinterest|\bWhatsApp|Telegram|\bwv\b|LinkedInApp|Messenger/i.test(ua);
}
