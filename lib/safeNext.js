// Hardened version of the post-auth ?next redirect check.
//
// The string-prefix check we used before (startsWith('/') and not
// startsWith('//')) rejects the obvious "//evil.com" case but lets
// a handful of tricks through: backslash variants (/\evil.com),
// URL-encoded slashes (/%2fevil.com), protocol-relative scenarios
// after browser normalization, javascript: URIs, etc.
//
// Parsing through URL with a fixed sentinel base gives us the real
// origin the browser would resolve to. Anything that doesn't end up
// on that sentinel origin is dropped.
//
// Returns the clean internal path (always starts with '/') or the
// fallback if anything looks off.

const SENTINEL_BASE = 'https://x.invalid/';

export function safeInternalPath(raw, fallback = '/test') {
  if (!raw || typeof raw !== 'string') return fallback;
  // Strip whitespace early — sometimes browsers preserve a leading
  // space when the URL has been touched by clients (Outlook, etc).
  const trimmed = raw.trim();
  if (!trimmed) return fallback;

  let url;
  try { url = new URL(trimmed, SENTINEL_BASE); }
  catch { return fallback; }

  // Anything that escapes the sentinel origin (absolute URL,
  // protocol-relative, javascript:, etc) is a redirect-off-site.
  if (url.origin !== SENTINEL_BASE.slice(0, -1)) return fallback;

  // Re-emit the URL's pathname+search+hash and make sure it still
  // looks like a clean internal path. Defends against weird inputs
  // that parse OK but emit with leading // after normalization.
  const path = (url.pathname || '/') + (url.search || '') + (url.hash || '');
  if (!path.startsWith('/')) return fallback;
  if (path.startsWith('//')) return fallback;
  return path;
}
