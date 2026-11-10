import { randomBytes, scrypt as _scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { authSecret } from './env';

const scrypt = promisify(_scrypt) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
) => Promise<Buffer>;

/**
 * Password hashing with scrypt (built into Node — no native build step, FIPS
 * friendly, and memory-hard). Format: scrypt$N$r$p$salt$hash
 */
const SCRYPT_N = 16384;
const SCRYPT_r = 8;
const SCRYPT_p = 1;
const KEYLEN = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password.normalize('NFKC'), salt, KEYLEN);
  return ['scrypt', SCRYPT_N, SCRYPT_r, SCRYPT_p, salt.toString('base64'), derived.toString('base64')].join(
    '$',
  );
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const [scheme, , , , saltB64, hashB64] = stored.split('$');
    if (scheme !== 'scrypt' || !saltB64 || !hashB64) return false;
    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(hashB64, 'base64');
    const derived = await scrypt(password.normalize('NFKC'), salt, expected.length);
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

/** URL-safe random token, default 32 bytes → 43 base64url chars. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** Short, human-friendly, unguessable share token (base62, 12 chars ≈ 71 bits). */
const BASE62 = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
export function randomBase62(length = 12): string {
  const out: string[] = [];
  const bytes = randomBytes(length * 2);
  for (let i = 0; i < bytes.length && out.length < length; i += 1) {
    // rejection sampling to keep the distribution uniform
    if (bytes[i] < 248) out.push(BASE62[bytes[i] % 62]);
  }
  if (out.length < length) {
    // astronomically unlikely; top up
    while (out.length < length) out.push(BASE62[randomBytes(1)[0] % 62]);
  }
  return out.join('');
}

export function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * HMAC-signed opaque value, used for CSRF tokens and signed share cookies.
 * Format: <payloadB64>.<sigB64>
 */
export function signValue(payload: string, secret = authSecret()): string {
  const enc = Buffer.from(payload, 'utf8').toString('base64url');
  const sig = createHash('sha256').update(`${enc}.${secret}`).digest('base64url');
  return `${enc}.${sig}`;
}

export function verifySignedValue(
  signed: string,
  secret = authSecret(),
): { valid: boolean; payload: string | null } {
  const parts = signed.split('.');
  if (parts.length !== 2) return { valid: false, payload: null };
  const expected = createHash('sha256').update(`${parts[0]}.${secret}`).digest('base64url');
  const a = Buffer.from(expected);
  const b = Buffer.from(parts[1]);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { valid: false, payload: null };
  try {
    return { valid: true, payload: Buffer.from(parts[0], 'base64url').toString('utf8') };
  } catch {
    return { valid: false, payload: null };
  }
}

export function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** Password policy check driven by admin settings. */
export function validatePasswordStrength(
  password: string,
  policy: { minLength: number; requireUpper: boolean; requireNumber: boolean; requireSymbol: boolean },
): string | null {
  if (password.length < policy.minLength) {
    return `Password must be at least ${policy.minLength} characters.`;
  }
  if (policy.requireUpper && !/[A-Z]/.test(password)) {
    return 'Password must contain an uppercase letter.';
  }
  if (policy.requireNumber && !/[0-9]/.test(password)) {
    return 'Password must contain a number.';
  }
  if (policy.requireSymbol && !/[^A-Za-z0-9]/.test(password)) {
    return 'Password must contain a symbol.';
  }
  if (password.length > 200) return 'Password is too long.';
  return null;
}
