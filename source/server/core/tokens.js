/**
 * Signed session tokens: <prefix><base64url(payload)>.<base64url(HMAC-SHA256(prefix + payload))>
 * The prefix tells the kind of session (passenger, driver, staff) and is part of the signature.
 */
import crypto from 'crypto';
import { getTokenSecret } from '../config.js';

export const TOKEN_PREFIXES = {
  passenger: 'pax_jwt_',
  driver: 'drv_jwt_',
  staff: 'mgr_session_'
};

function sign(secret, prefix, body) {
  return crypto.createHmac('sha256', secret).update(prefix + body).digest('base64url');
}

export function signToken(payload, { prefix, ttlSeconds, now = Date.now(), secret } = {}) {
  const body = Buffer.from(JSON.stringify({
    ...payload,
    iat: now,
    exp: now + ttlSeconds * 1000
  })).toString('base64url');
  return `${prefix}${body}.${sign(secret || getTokenSecret(), prefix, body)}`;
}

export function verifyToken(token, { now = Date.now(), secret } = {}) {
  const invalid = { valid: false, code: 'INVALID_TOKEN' };
  if (typeof token !== 'string') return invalid;

  const prefix = Object.values(TOKEN_PREFIXES).find(p => token.startsWith(p));
  if (!prefix) return invalid;

  const [body, signature] = token.slice(prefix.length).split('.');
  if (!body || !signature) return invalid;

  const expected = sign(secret || getTokenSecret(), prefix, body);
  if (expected.length !== signature.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) {
    return invalid;
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return invalid;
  }
  if (TOKEN_PREFIXES[payload.kind] !== prefix) return invalid;
  if (!(payload.exp > now)) return { valid: false, code: 'TOKEN_EXPIRED' };

  return { valid: true, payload };
}
