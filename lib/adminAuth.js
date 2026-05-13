import { timingSafeEqual } from 'crypto';

// Constant-time password compare. Pads both sides so a length mismatch
// doesn't short-circuit timingSafeEqual and leak the expected length.
export function checkAdminPassword(input) {
  const expected = process.env.ADMIN_PASSWORD || '';
  if (typeof input !== 'string' || expected.length === 0) return false;
  const a = Buffer.from(input);
  const b = Buffer.from(expected);
  const len = Math.max(a.length, b.length, 1);
  const ap = Buffer.alloc(len);
  const bp = Buffer.alloc(len);
  a.copy(ap);
  b.copy(bp);
  return timingSafeEqual(ap, bp) && a.length === b.length;
}
