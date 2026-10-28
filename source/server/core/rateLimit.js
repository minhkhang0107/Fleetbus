/**
 * Per-IP sliding-window limits on the login and OTP endpoints (H-05): an OTP costs an SMS, a login is a guess.
 */
import { sendError } from '../middleware/httpUtils.js';

const TEN_MINUTES = 10 * 60 * 1000;
const MAX_KEYS = 10000;

/** The caller's address: the socket's, or behind a trusted proxy (FLEETBUS_TRUST_PROXY=1) the first X-Forwarded-For. */
export function clientIp(req, env = process.env) {
  if (env?.FLEETBUS_TRUST_PROXY === '1') {
    const first = String(req?.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
    if (first) return first;
  }
  return req?.socket?.remoteAddress || null;
}

export class RateLimiter {
  constructor({ max = 30, windowMs = TEN_MINUTES, maxKeys = MAX_KEYS } = {}) {
    this.max = max;
    this.windowMs = windowMs;
    this.maxKeys = maxKeys;
    this.hits = new Map(); // key -> request times, oldest first
  }

  /** Counts one request of `key`; returns { ok } or { ok: false, retryAfterSeconds }. */
  check(key, now = Date.now()) {
    const k = String(key || 'unknown');
    const hits = (this.hits.get(k) || []).filter(t => t > now - this.windowMs);
    if (hits.length >= this.max) {
      this.hits.set(k, hits);
      return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((hits[0] + this.windowMs - now) / 1000)) };
    }
    hits.push(now);
    // Re-inserted so the map stays ordered by last use; the least recently used key goes first when full.
    this.hits.delete(k);
    this.hits.set(k, hits);
    if (this.hits.size > this.maxKeys) this.hits.delete(this.hits.keys().next().value);
    return { ok: true };
  }

  /** Answers 429 and returns false when the caller is over the limit. */
  enforce(req, res, env = process.env) {
    const result = this.check(clientIp(req, env));
    if (result.ok) return true;
    res.setHeader('Retry-After', String(result.retryAfterSeconds));
    sendError(res, 'Quá nhiều yêu cầu, vui lòng thử lại sau ít phút', 'RATE_LIMITED', 429);
    return false;
  }
}

/** The limits of the auth endpoints; each may be replaced by a RateLimiter or its options (tests use small ones). */
export function createAuthRateLimiters(overrides = {}) {
  const build = (entry, max) => (entry instanceof RateLimiter ? entry : new RateLimiter({ max, ...entry }));
  return {
    requestOtp: build(overrides.requestOtp, 10),
    verifyOtp: build(overrides.verifyOtp, 30),
    staffLogin: build(overrides.staffLogin, 30),
    driverLogin: build(overrides.driverLogin, 30)
  };
}
