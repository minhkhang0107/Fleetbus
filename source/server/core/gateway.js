/**
 * Gateway rules shared by every route: who may call an endpoint (api-screen-map "Auth" column)
 * and which mutations must carry an Idempotency-Key.
 */
import crypto from 'crypto';
import { verifyToken } from './tokens.js';

const API = '/api/v1';

const PUBLIC_RULES = [
  ['GET', /^\/health$/],
  ['GET', /^\/(api\/v1\/)?openapi\.json$/],
  ['GET', /^\/api\/v1\/(app|passenger)\/config$/],
  ['GET', /^\/api\/v1\/passenger\/home-feed$/],
  ['POST', /^\/api\/v1\/(auth\/(passenger|driver|staff)\/|passenger\/auth\/|driver\/auth\/|ops\/auth\/)/],
  ['POST', /^\/api\/v1\/webhooks\//],
  ['GET', /^\/api\/v1\/(passenger\/)?(stations|trips)(\/search)?$/],
  ['GET', /^\/api\/v1\/routes\/stops\/search$/],
  ['GET', /^\/api\/v1\/(passenger\/)?trips\/[^/]+(\/(seat-map|tracking|radar|stops|eta|disruptions|replacement-info))?$/]
];

const PASSENGER_RULES = [
  /^\/api\/v1\/(passenger|bookings|tickets|payments)\//,
  /^\/api\/v1\/(passenger\/)?trips\/[^/]+\/(seats\/hold|hold-seats)$/
];

const IDEMPOTENT_RULES = {
  passenger: /\/(seats\/hold|hold-seats|bookings\/create|checkout\/create-order|delegate|cancel)$/,
  driver: /\/(readiness|start|arrive|boarding|boarding\/manual|board-qr|payments\/cod-collect|collect-cod|onboard-hail|incidents?|end|no-show|batch-replay)$/,
  staff: /\/(pos\/(orders|bookings|hotline-hold)|refunds\/[^/]+\/process|replace-vehicle|swap-vehicle|delay)$/
};

// Staff permissions by role (MGR-029). The first matching rule decides; no rule means any staff role.
const STAFF_RULES = [
  [/^\/api\/v1\/ops\/pos\//, ['FLEET_DIRECTOR', 'CASHIER']],
  [/^\/api\/v1\/ops\/(refunds|reports|payments|audit-logs)/, ['FLEET_DIRECTOR', 'FINANCIAL_CONTROLLER']],
  [/^\/api\/v1\/ops\/bookings/, ['FLEET_DIRECTOR', 'CASHIER', 'FINANCIAL_CONTROLLER']],
  [/^\/api\/v1\/ops\/trips\/[^/]+\/(delay|replace-vehicle|swap-vehicle)$/, ['FLEET_DIRECTOR', 'DISPATCHER']]
];

export const ADMIN_ROLE = 'FLEET_DIRECTOR';

export function resolveAccess(method, pathname) {
  if (!pathname.startsWith(API) && pathname !== '/health' && pathname !== '/openapi.json') {
    return { kind: 'public', idempotent: false };
  }
  if (PUBLIC_RULES.some(([m, re]) => m === method && re.test(pathname))) {
    return { kind: 'public', idempotent: false };
  }

  let kind = null;
  if (pathname.startsWith(`${API}/driver/`)) kind = 'driver';
  else if (pathname.startsWith(`${API}/ops/`)) kind = 'staff';
  else if (PASSENGER_RULES.some(re => re.test(pathname))) kind = 'passenger';
  if (!kind) return { kind: 'public', idempotent: false };

  const idempotent = method === 'POST' && IDEMPOTENT_RULES[kind].test(pathname);
  return { kind, idempotent };
}

/**
 * Check the Bearer token of a request. Returns { ok, identity } or { ok: false, status, code, message }.
 */
export function authenticate(req, access, pathname) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) {
    return { ok: false, status: 401, code: 'UNAUTHORIZED', message: 'Cần đăng nhập để thực hiện thao tác này' };
  }

  const result = verifyToken(token);
  if (!result.valid) {
    const message = result.code === 'TOKEN_EXPIRED' ? 'Phiên đăng nhập đã hết hạn' : 'Token không hợp lệ';
    return { ok: false, status: 401, code: result.code, message };
  }

  const identity = result.payload;
  if (identity.kind !== access.kind) {
    return { ok: false, status: 403, code: 'FORBIDDEN', message: 'Tài khoản không có quyền truy cập chức năng này' };
  }

  if (access.kind === 'staff') {
    const rule = STAFF_RULES.find(([re]) => re.test(pathname));
    if (rule && !rule[1].includes(identity.role)) {
      return { ok: false, status: 403, code: 'FORBIDDEN', message: 'Vai trò của bạn không được phép thực hiện thao tác này' };
    }
  }

  return { ok: true, identity };
}

/**
 * Remembers the outcome of a mutation for 24 hours, so a retry with the same Idempotency-Key
 * returns the same response instead of repeating the action.
 */
export class IdempotencyStore {
  constructor(ttlMs = 24 * 60 * 60 * 1000) {
    this.ttlMs = ttlMs;
    this.entries = new Map();
  }

  static fingerprint(rawBody) {
    return crypto.createHash('sha256').update(rawBody || '').digest('hex');
  }

  begin(scope, fingerprint, now = Date.now()) {
    for (const [key, entry] of this.entries) {
      if (now - entry.at > this.ttlMs) this.entries.delete(key);
    }
    const existing = this.entries.get(scope);
    if (!existing) {
      this.entries.set(scope, { fingerprint, at: now, done: false });
      return { state: 'new' };
    }
    if (existing.fingerprint !== fingerprint) return { state: 'reused' };
    if (!existing.done) return { state: 'in_progress' };
    return { state: 'replay', entry: existing };
  }

  complete(scope, status, body) {
    const entry = this.entries.get(scope);
    if (!entry) return;
    if (status >= 500) {
      this.entries.delete(scope);
      return;
    }
    entry.done = true;
    entry.status = status;
    entry.body = body;
  }
}
