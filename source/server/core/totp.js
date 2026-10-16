/**
 * TOTP (RFC 6238, HMAC-SHA1, 30 s step, 6 digits) for the second login factor of staff (MGR-001, BR-MGR-AUTH-001).
 */
import crypto from 'crypto';

const STEP_SECONDS = 30;
const DIGITS = 6;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Decode(text) {
  const clean = String(text).replace(/[\s=-]/g, '').toUpperCase();
  let bits = '';
  for (const ch of clean) {
    const v = ALPHABET.indexOf(ch);
    if (v < 0) throw new Error('Invalid base32 secret');
    bits += v.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

export function base32Encode(buffer) {
  let bits = '';
  for (const byte of buffer) bits += byte.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i < bits.length; i += 5) out += ALPHABET[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)];
  return out;
}

export function generateSecret() {
  return base32Encode(crypto.randomBytes(20));
}

function hotp(key, counter) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', key).update(msg).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(code % 10 ** DIGITS).padStart(DIGITS, '0');
}

export function totpStep(now = Date.now()) {
  return Math.floor(now / 1000 / STEP_SECONDS);
}

export function generateTotp(secret, now = Date.now()) {
  return hotp(base32Decode(secret), totpStep(now));
}

/**
 * Accepts the code of the current step and of `window` steps either side (clock drift).
 * `lastUsedStep` blocks a code that was already accepted. Returns { valid, step, reason }.
 */
export function verifyTotp(secret, code, { now = Date.now(), window = 1, lastUsedStep = -1 } = {}) {
  if (!/^\d{6}$/.test(String(code ?? ''))) return { valid: false, reason: 'MALFORMED' };
  const key = base32Decode(secret);
  const current = totpStep(now);
  for (let step = current - window; step <= current + window; step++) {
    const expected = Buffer.from(hotp(key, step));
    const given = Buffer.from(String(code));
    if (crypto.timingSafeEqual(expected, given)) {
      return step <= lastUsedStep ? { valid: false, reason: 'REPLAYED' } : { valid: true, step };
    }
  }
  return { valid: false, reason: 'WRONG' };
}

export function provisioningUri(secret, account, issuer = 'FleetBus') {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&period=${STEP_SECONDS}&digits=${DIGITS}`;
}
