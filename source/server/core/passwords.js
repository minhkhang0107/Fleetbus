/**
 * Salted scrypt hashes for PINs and passwords, compared in constant time.
 */
import crypto from 'crypto';

export function hashSecret(plain) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(plain), salt, 32).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifySecret(plain, stored) {
  if (typeof stored !== 'string' || typeof plain !== 'string') return false;
  const [scheme, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const candidate = crypto.scryptSync(plain, salt, 32);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

/**
 * Failed-login counter: a key (staff id, username) locks after maxAttempts wrong attempts.
 */
export class LoginGuard {
  constructor({ maxAttempts = 5, lockMinutes = 15 } = {}) {
    this.maxAttempts = maxAttempts;
    this.lockMs = lockMinutes * 60 * 1000;
    this.entries = new Map();
  }

  isLocked(key, now = Date.now()) {
    const entry = this.entries.get(key);
    if (!entry || !entry.lockedUntil) return 0;
    if (now >= entry.lockedUntil) {
      this.entries.delete(key);
      return 0;
    }
    return Math.ceil((entry.lockedUntil - now) / 1000);
  }

  fail(key, now = Date.now()) {
    const entry = this.entries.get(key) || { count: 0, lockedUntil: 0 };
    entry.count += 1;
    if (entry.count >= this.maxAttempts) entry.lockedUntil = now + this.lockMs;
    this.entries.set(key, entry);
  }

  succeed(key) {
    this.entries.delete(key);
  }
}
