/**
 * Gateway rules shared by every route: who may call an endpoint (api-screen-map "Auth" column)
 * and which mutations must carry an Idempotency-Key.
 */
import crypto from 'crypto';
import { verifyToken } from './tokens.js';
import { DEFAULT_OPERATOR_ID, OPERATOR_INACTIVE, findOperatorByCode, findOperatorById, normalizeOperatorCode } from './operators.js';

const API = '/api/v1';

const PUBLIC_RULES = [
  ['GET', /^\/health$/],
  ['GET', /^\/(api\/v1\/)?openapi\.json$/],
  ['GET', /^\/api\/v1\/(app|passenger)\/config$/],
  ['GET', /^\/api\/v1\/service-config$/],
  ['POST', /^\/api\/v1\/service-areas\/check$/],
  ['GET', /^\/api\/v1\/passenger\/home-feed$/],
  ['GET', /^\/api\/v1\/passenger\/promo-banners(\/[^/]+)?$/],
  ['POST', /^\/api\/v1\/(auth\/(passenger|driver|staff)\/|passenger\/auth\/|driver\/auth\/|ops\/auth\/)/],
  ['POST', /^\/api\/v1\/webhooks\//],
  ['GET', /^\/api\/v1\/(passenger\/)?(stations|trips)(\/search)?$/],
  ['GET', /^\/api\/v1\/routes\/stops\/search$/],
  ['GET', /^\/api\/v1\/trips\/run-days$/],
  ['GET', /^\/api\/v1\/(passenger\/)?trips\/[^/]+(\/(seat-map|tracking|tracking\/stream|radar|stops|eta|disruptions|replacement-info))?$/]
];

const PASSENGER_RULES = [
  /^\/api\/v1\/(passenger|bookings|tickets|payments)\//,
  /^\/api\/v1\/(passenger\/)?trips\/[^/]+\/(seats\/hold|hold-seats)$/
];

const IDEMPOTENT_RULES = {
  passenger: /\/(seats\/hold|hold-seats|bookings\/create|checkout\/create-order|delegate|qr\/reissue|cancel|home-request\/withdraw|tickets\/[^/]+\/stops)$/,
  driver: /\/(readiness|start|home-run|arrive|inaccessible|boarding|boarding\/manual|board-qr|payments\/cod-collect|collect-cod|onboard-hail|incidents?|end|no-show|batch-replay)$/,
  staff: /\/(platform\/operators(\/[^/]+\/(activate|deactivate))?|pos\/(orders|bookings|hotline-hold)|refunds\/[^/]+\/process|service-areas(\/[^/]+\/(activate|deactivate))?|promo-banners(\/[^/]+\/(activate|deactivate))?|schedules|trips\/[^/]+\/(assign|cancel|sales)|home-requests\/[^/]+\/[^/]+\/(confirm|reject)|replace-vehicle|swap-vehicle|delay|seats\/override-lock|debt-receipts\/[^/]+\/redeem)$/
};

// Staff permissions by role (MGR-029). The first matching rule decides; no rule means any staff role.
const STAFF_RULES = [
  [/^\/api\/v1\/ops\/pos\/hotline-hold/, ['FLEET_DIRECTOR', 'CASHIER', 'DISPATCHER']],
  [/^\/api\/v1\/ops\/pos\//, ['FLEET_DIRECTOR', 'CASHIER']],
  [/^\/api\/v1\/ops\/audit-logs/, ['FLEET_DIRECTOR', 'FINANCIAL_CONTROLLER', 'DISPATCHER']],
  [/^\/api\/v1\/ops\/(refunds|reports|payments)/, ['FLEET_DIRECTOR', 'FINANCIAL_CONTROLLER']],
  [/^\/api\/v1\/ops\/bookings/, ['FLEET_DIRECTOR', 'CASHIER', 'FINANCIAL_CONTROLLER']],
  [/^\/api\/v1\/ops\/trips\/[^/]+\/(delay|replace-vehicle|swap-vehicle|seats\/override-lock)$/, ['FLEET_DIRECTOR', 'DISPATCHER']],
  [/^\/api\/v1\/ops\/service-(config|areas)/, ['FLEET_DIRECTOR', 'DISPATCHER']],
  [/^\/api\/v1\/ops\/schedules/, ['FLEET_DIRECTOR', 'DISPATCHER']],
  [/^\/api\/v1\/ops\/promo-banners/, ['FLEET_DIRECTOR']],
  [/^\/api\/v1\/ops\/trips\/[^/]+\/assign(-options)?$/, ['FLEET_DIRECTOR', 'DISPATCHER']],
  [/^\/api\/v1\/ops\/trips\/[^/]+\/(cancel|sales)$/, ['FLEET_DIRECTOR', 'DISPATCHER']],
  [/^\/api\/v1\/ops\/home-requests/, ['FLEET_DIRECTOR', 'DISPATCHER']],
  [/^\/api\/v1\/ops\/debt-receipts\//, ['FLEET_DIRECTOR', 'CASHIER', 'FINANCIAL_CONTROLLER']]
];

export const ADMIN_ROLE = 'FLEET_DIRECTOR';

/** Runs the platform (all bus companies); acts in one company only when it names it (spec 2.3). */
export const PLATFORM_ROLE = 'PLATFORM_ADMIN';

export function resolveAccess(method, pathname) {
  if (!pathname.startsWith(API) && pathname !== '/health' && pathname !== '/openapi.json') {
    return { kind: 'public', idempotent: false };
  }
  if (PUBLIC_RULES.some(([m, re]) => m === method && re.test(pathname))) {
    return { kind: 'public', idempotent: false };
  }

  let kind = null;
  if (pathname.startsWith(`${API}/driver/`)) kind = 'driver';
  else if (pathname.startsWith(`${API}/ops/`) || pathname.startsWith(`${API}/platform/`)) kind = 'staff';
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
    // Platform endpoints are for the platform admin only; it may also use every ops endpoint of the company it names.
    if (pathname.startsWith(`${API}/platform/`) && identity.role !== PLATFORM_ROLE) {
      return { ok: false, status: 403, code: 'FORBIDDEN', message: 'Vai trò của bạn không được phép thực hiện thao tác này' };
    }
    const rule = STAFF_RULES.find(([re]) => re.test(pathname));
    if (rule && identity.role !== PLATFORM_ROLE && !rule[1].includes(identity.role)) {
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

/**
 * Resolves the operator for a request based on identity, headers, or query parameters.
 */
export function resolveOperator(req, parsedUrl, identity, { production }) {
  const explicitCode = req.headers['x-operator-code'] || parsedUrl.searchParams.get('operator');
  const normalizedCode = normalizeOperatorCode(explicitCode);
  
  let explicitOp = null;
  if (normalizedCode) {
    explicitOp = findOperatorByCode(normalizedCode);
    if (!explicitOp) {
      return { ok: false, status: 404, code: 'OPERATOR_NOT_FOUND', message: 'Mã nhà xe không đúng' };
    }
  }

  // The platform admin has no company of its own: it must name the one it acts in.
  if (identity?.role === PLATFORM_ROLE) {
    if (!explicitOp) return { ok: false, status: 400, code: 'OPERATOR_REQUIRED', message: 'Chọn nhà xe cần xem (X-Operator-Code)' };
    return { ok: true, operator: explicitOp };
  }

  let identityOp = null;
  if (identity) {
    const opId = identity.operator_id || DEFAULT_OPERATOR_ID;
    identityOp = findOperatorById(opId);
    if (!identityOp) {
      return { ok: false, status: 404, code: 'OPERATOR_NOT_FOUND', message: 'Mã nhà xe không đúng' };
    }
  }

  if (identityOp && explicitOp && identityOp.operator_id !== explicitOp.operator_id) {
    return { ok: false, status: 403, code: 'OPERATOR_MISMATCH', message: 'Mã nhà xe không khớp' };
  }

  const resolvedOp = identityOp || explicitOp;

  if (resolvedOp && resolvedOp.active === false) return OPERATOR_INACTIVE;
  if (resolvedOp) {
    return { ok: true, operator: resolvedOp };
  }

  if (production) {
    return { ok: false, status: 400, code: 'OPERATOR_REQUIRED', message: 'Cần mã nhà xe' };
  }

  return { ok: true, operator: findOperatorById(DEFAULT_OPERATOR_ID) };
}
