/**
 * Opaque session tokens for question IDs.
 *
 * Phase 2 of the anti-scraping stack. Instead of returning real UUIDs to
 * the client, /api/test/questions mints a `q_token` per question. The
 * token is an AES-GCM encrypted blob containing the real UUID + an
 * expiry timestamp + a per-mint nonce. /api/test/check accepts only
 * these tokens, decrypts them server-side, then looks up the real
 * question in the DB.
 *
 * Why this matters:
 *   - Real UUIDs are stable across sessions. A scraper that obtains
 *     one UUID can replay it forever. With tokens, every request
 *     gets a new opaque value that expires in 30 minutes.
 *   - Tokens are not enumerable. A scraper can't iterate `?id=1, ?id=2`
 *     because tokens are 52 random bytes (64-char base64url string).
 *   - Tokens are tamper-proof. The AES-GCM auth tag rejects any
 *     modification — the only way to produce a valid token is to know
 *     QUESTION_TOKEN_SECRET, which lives only on the server.
 *
 * Token layout (52 bytes total, base64url ≈ 70 chars):
 *
 *   bytes 0..11   12-byte random IV
 *   bytes 12..35  24-byte AES-GCM ciphertext of:
 *                   [0..15]  question UUID (raw 16 bytes)
 *                   [16..19] expiry (uint32 BE, unix seconds)
 *                   [20..23] per-mint nonce (random)
 *   bytes 36..51  16-byte GCM authentication tag
 *
 * Wire format: "q_" + base64url(IV ‖ CT ‖ TAG)
 *
 * Stateless by design — no DB writes per token, no cleanup cron. The
 * only cost is ~10 µs of AES per mint and per verify.
 */

import crypto from 'node:crypto';

const SECRET = process.env.QUESTION_TOKEN_SECRET;
if (!SECRET || SECRET.length < 32) {
  // Fail loudly so deploys without the env var don't silently mint
  // unverifiable tokens.
  throw new Error(
    'QUESTION_TOKEN_SECRET env var must be at least 32 chars. ' +
    'Generate with: openssl rand -hex 64'
  );
}

// Derive AES-256 key by hashing the secret. Hashing means the secret
// can be any length and we always get a 32-byte key.
const KEY = crypto.createHash('sha256').update(SECRET).digest();

// 4 hours. Long enough that someone who pauses a test mid-way (lunch
// break, phone interruption) can still finish. Short enough that a
// scraper can't snowball tokens across days. With token space being
// 2^160 effective bits, expiry isn't really how we prevent enumeration —
// it just bounds the "stolen token" replay window.
const TOKEN_TTL_SECONDS = 4 * 60 * 60;
const TOKEN_PREFIX = 'q_';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Mint an opaque token for a question UUID.
 *
 * @param {string} questionId - The real DB UUID.
 * @returns {string} q_token like "q_abc123..."
 */
export function mintQuestionToken(questionId) {
  if (typeof questionId !== 'string' || !UUID_RE.test(questionId)) {
    throw new Error('mintQuestionToken: invalid UUID');
  }

  const idBytes = Buffer.from(questionId.replace(/-/g, ''), 'hex');
  const expiry = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
  const nonce = crypto.randomBytes(4);

  // 24-byte plaintext: 16 UUID + 4 expiry + 4 nonce
  const plaintext = Buffer.alloc(24);
  idBytes.copy(plaintext, 0);
  plaintext.writeUInt32BE(expiry, 16);
  nonce.copy(plaintext, 20);

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return TOKEN_PREFIX + Buffer.concat([iv, ciphertext, tag]).toString('base64url');
}

/**
 * Decrypt and verify a q_token. Returns the real question UUID or an
 * error code (token tampered, expired, malformed, etc.).
 *
 * @param {string} token
 * @returns {{ ok: true, questionId: string, expiry: number } | { ok: false, error: string }}
 */
export function verifyQuestionToken(token) {
  if (typeof token !== 'string' || !token.startsWith(TOKEN_PREFIX)) {
    return { ok: false, error: 'bad_format' };
  }

  let buf;
  try {
    buf = Buffer.from(token.slice(TOKEN_PREFIX.length), 'base64url');
  } catch {
    return { ok: false, error: 'bad_base64' };
  }
  if (buf.length !== 52) {
    return { ok: false, error: 'bad_length' };
  }

  const iv = buf.subarray(0, 12);
  const ciphertext = buf.subarray(12, 36);
  const tag = buf.subarray(36, 52);

  let plaintext;
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
    decipher.setAuthTag(tag);
    plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    // GCM auth tag mismatch — token was tampered with or signed with a
    // different secret.
    return { ok: false, error: 'auth_failed' };
  }

  const idHex = plaintext.subarray(0, 16).toString('hex');
  const questionId = [
    idHex.slice(0, 8),
    idHex.slice(8, 12),
    idHex.slice(12, 16),
    idHex.slice(16, 20),
    idHex.slice(20, 32),
  ].join('-');

  const expiry = plaintext.readUInt32BE(16);
  if (expiry < Math.floor(Date.now() / 1000)) {
    // Still return questionId so callers that accept expired tokens
    // (e.g. /api/question-report — user may report after the test
    // session has ended) can recover the real UUID. The cryptographic
    // signature is still valid, only the time window has passed.
    return { ok: false, error: 'expired', questionId, expiry };
  }

  return { ok: true, questionId, expiry };
}
