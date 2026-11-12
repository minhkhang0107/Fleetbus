/**
 * Gateway rules shared by every route: who may call an endpoint (api-screen-map "Auth" column)
 * and which mutations must carry an Idempotency-Key.
 */
import crypto from 'crypto';
import { verifyToken } from './tokens.js';
import { DEFAULT_OPERATOR_ID, OPERATOR_INACTIVE, findOperatorByCode, findOperatorById, normalizeOperatorCode } from './operators.js';
import { MOCK_DRIVERS_DB } from '../services/driver/modules/driverService.js';
import { MOCK_MANAGERS_DB, TOTP_ROLES } from '../services/manager/modules/managerService.js';
import { isPassengerRevoked } from '../services/passenger/modules/auth.js';
import { normalizeStaffAccount } from '../services/manager/modules/staffAccounts.js';

const API = '/api/v1';

const PUBLIC_RULES = [
  ['GET', /^\/health$/],
  ['GET', /^\/(api\/v1\/)?openapi\.json$/],
  ['GET', /^\/api\/v1\/(app|passenger)\/config$/],
  ['GET', /^\/api\/v1\/service-config$/],
  ['GET', /^\/api\/v1\/legal$/],
  ['POST', /^\/api\/v1\/service-areas\/check$/],
  ['GET', /^\/api\/v1\/geocode\/reverse$/],
  ['GET', /^\/api\/v1\/passenger\/home-feed$/],
  ['GET', /^\/api\/v1\/passenger\/promo-banners(\/[^/]+)?$/],
  ['POST', /^\/api\/v1\/(auth\/(passenger|driver|staff)\/|passenger\/auth\/|driver\/auth\/(?!change-pin)|ops\/auth\/(?!change-password|totp\/))/],
  ['POST', /^\/api\/v1\/webhooks\//],
  ['GET', /^\/api\/v1\/(passenger\/)?(stations|trips)(\/search)?$/],
  ['GET', /^\/api\/v1\/routes\/stops\/search$/],
  // The SMS tracking link page: the token in the path is the credential (D144).
  ['POST', /^\/api\/v1\/share\/[A-Za-z0-9_-]+\/pickup-ready$/],
  ['GET', /^\/api\/v1\/trips\/run-days$/],
  ['GET', /^\/api\/v1\/(passenger\/)?trips\/[^/]+(\/(seat-map|tracking|tracking\/stream|radar|stops|eta|disruptions|replacement-info))?$/]
];

const PASSENGER_RULES = [
  /^\/api\/v1\/(passenger|bookings|tickets|payments)\//,
  /^\/api\/v1\/(passenger\/)?trips\/[^/]+\/(seats\/hold|hold-seats)$/
];

const IDEMPOTENT_RULES = {
  passenger: /\/(seats\/hold|hold-seats|bookings\/create|checkout\/create-order|delegate|qr\/reissue|cancel|home-request\/withdraw|tickets\/[^/]+\/stops)$/,
  driver: /\/(readiness|start|home-run|home-order|home-arrived|home-missed|arrive|depart|inaccessible|boarding|boarding\/manual|board-qr|payments\/cod-collect|collect-cod|onboard-hail|incidents?|end|no-show|batch-replay|change-pin)$/,
  staff: /\/(platform\/operators(\/[^/]+\/(activate|deactivate|director\/reset-password))?|auth\/(change-password|totp\/(setup|confirm))|pos\/(orders|bookings|hotline-hold|hotline-holds\/[^/]+\/cancel)|orders\/[^/]+\/confirm-payment|bank-transactions\/[^/]+\/assign|refunds\/[^/]+\/process|service-areas(\/[^/]+\/(activate|deactivate))?|promo-banners(\/[^/]+\/(activate|deactivate))?|vouchers(\/[^/]+\/(activate|deactivate))?|schedules|trips\/[^/]+\/(assign|cancel|sales|end)|home-requests\/[^/]+\/[^/]+\/(confirm|reject)|replace-vehicle|swap-vehicle|delay|seats\/override-lock|debt-receipts\/[^/]+\/redeem|cash-handovers\/[^/]+\/confirm|seat-layouts(\/[^/]+)?|vehicles(\/[^/]+)?|drivers(\/[^/]+\/reset-pin)?|staff(\/[^/]+\/reset-password)?|stations|routes(\/[^/]+)?)$/
};

export const DIRECTOR_ONLY = 'DIRECTOR_ONLY';

export const STAFF_AUTH_EXEMPT = [
  '/api/v1/ops/auth/change-password',
  '/api/v1/ops/auth/totp/setup',
  '/api/v1/ops/auth/totp/confirm',
  '/api/v1/ops/auth/logout'
];

// Staff permissions by capability. The first matching rule decides; no rule means:
// GET -> allowed for any staff of this operator; non-GET -> DIRECTOR_ONLY.
export const STAFF_RULES = [
  [/^\/api\/v1\/ops\/cash-handovers(\/.*)?$/, ['PAYMENTS']],
  [['GET'], /^\/api\/v1\/ops\/staff\/permissions-catalog$/, null],
  [/^\/api\/v1\/ops\/staff(\/.*)?$/, DIRECTOR_ONLY],
  [['PATCH'], /^\/api\/v1\/ops\/company$/, DIRECTOR_ONLY],
  [/^\/api\/v1\/ops\/(crew|drivers)(\/.*)?$/, ['DRIVERS']],
  [/^\/api\/v1\/ops\/seat-layouts/, ['FLEET']],
  [['POST', 'PATCH'], /^\/api\/v1\/ops\/vehicles(\/[^/]+)?$/, ['FLEET']],
  [/^\/api\/v1\/ops\/stations(\/.*)?$/, ['SCHEDULES']],
  [/^\/api\/v1\/ops\/routes(\/.*)?$/, ['SCHEDULES']],
  [/^\/api\/v1\/ops\/(pos\/hotline-hold|trips\/[^/]+\/hotline-holds)/, ['TICKETING', 'DISPATCH']],
  [/^\/api\/v1\/ops\/pos\//, ['TICKETING']],
  [/^\/api\/v1\/ops\/audit-logs/, ['AUDIT_VIEW']],
  [/^\/api\/v1\/ops\/pending-payments$/, ['PAYMENTS']],
  [/^\/api\/v1\/ops\/payments\/manual-confirmations$/, DIRECTOR_ONLY],
  [/^\/api\/v1\/ops\/(refunds|reports|payments)/, ['REFUNDS']],
  [['GET'], /^\/api\/v1\/ops\/bookings(\/.*)?$/, ['BOOKINGS_VIEW']],
  [['GET'], /^\/api\/v1\/ops\/trips\/[^/]+\/manifest$/, ['BOOKINGS_VIEW', 'DISPATCH']],
  [/^\/api\/v1\/ops\/orders\/[^/]+\/confirm-payment$/, ['PAYMENTS']],
  [/^\/api\/v1\/ops\/bank-transactions\/[^/]+\/assign$/, ['REFUNDS']],
  [/^\/api\/v1\/ops\/bank-transactions$/, ['PAYMENTS']],
  [['POST'], /^\/api\/v1\/ops\/payment-settings\/bank-change\/cancel$/, DIRECTOR_ONLY],
  [['GET'], /^\/api\/v1\/ops\/payment-settings$/, ['PAYMENTS', 'REFUNDS']],
  [['PUT'], /^\/api\/v1\/ops\/payment-settings$/, DIRECTOR_ONLY],
  [['POST'], /^\/api\/v1\/ops\/payment-settings\/test$/, DIRECTOR_ONLY],
  [/^\/api\/v1\/ops\/trips\/[^/]+\/(delay|replace-vehicle|swap-vehicle|seats\/override-lock)$/, ['DISPATCH']],
  // Refund money: only the director sets the cancellation policy (D184).
  [['PUT'], /^\/api\/v1\/ops\/service-config\/cancellation-policy$/, DIRECTOR_ONLY],
  [/^\/api\/v1\/ops\/service-(config|areas)/, ['SCHEDULES']],
  [/^\/api\/v1\/ops\/schedules/, ['SCHEDULES']],
  [/^\/api\/v1\/ops\/promo-banners/, ['MARKETING']],
  [/^\/api\/v1\/ops\/vouchers/, ['MARKETING']],
  [/^\/api\/v1\/ops\/trips\/[^/]+\/assign(-options)?$/, ['DISPATCH']],
  [/^\/api\/v1\/ops\/trips\/[^/]+\/cancel$/, ['TRIP_CANCEL']],
  [/^\/api\/v1\/ops\/trips\/[^/]+\/(sales|end)$/, ['DISPATCH']],
  [/^\/api\/v1\/ops\/home-requests/, ['DISPATCH']],
  [/^\/api\/v1\/ops\/debt-receipts\//, ['PAYMENTS']]
];

export const ADMIN_ROLE = 'FLEET_DIRECTOR';

/** Runs the platform (all bus companies); acts in one company only when it names it (spec 2.3). */
export const PLATFORM_ROLE = 'PLATFORM_ADMIN';

/** The director of the company (or the platform admin acting in it), as the account stored on the server says. */
export function isDirector(req) {
  return Boolean(req?.staffAccess?.isDirector || req?.staffAccess?.isPlatform);
}

/** Whether the staff member may do this now: read from the account on every request, never from the token (D196). */
export function hasStaffPermission(req, permission) {
  return isDirector(req) || Boolean(req?.staffAccess?.permissions?.has(permission));
}

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

const REVOKED = { ok: false, status: 401, code: 'TOKEN_REVOKED', message: 'Phiên đăng nhập đã hết hiệu lực, vui lòng đăng nhập lại' };

/**
 * A token ends when its account is locked, deleted, or has a newer token version (password or PIN changed,
 * role changed). Tokens signed before versions existed carry none and count as version 0 (H-06).
 */
function revoked(account, identity) {
  if (!account) return identity.tv !== undefined;
  return account.active === false || (identity.tv ?? 0) !== (account.token_version ?? 0);
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

  if (access.kind === 'passenger') {
    if (isPassengerRevoked(identity)) return REVOKED;
  }

  if (access.kind === 'driver') {
    const driver = MOCK_DRIVERS_DB.find(d => d.driver_id === identity.sub);
    if (revoked(driver, identity)) return REVOKED;
    if (driver?.status === 'LOCKED') {
      return { ok: false, status: 403, code: 'DRIVER_LOCKED', message: 'Tài khoản đã bị nhà xe khóa. Liên hệ điều độ.' };
    }
    if (driver?.must_change_pin && pathname !== '/api/v1/driver/auth/change-pin') {
      return { ok: false, status: 403, code: 'PIN_CHANGE_REQUIRED', message: 'Đổi mã PIN tạm trước khi dùng app' };
    }
  }

  if (access.kind === 'staff') {
    let staff = MOCK_MANAGERS_DB.find(m => m.user_id === identity.sub);
    if (staff) {
      staff = normalizeStaffAccount(staff);
    }
    if (revoked(staff, identity)) return REVOKED;
    // Platform endpoints are for the platform admin only; it may also use every ops endpoint of the company it names.
    if (pathname.startsWith(`${API}/platform/`) && identity.role !== PLATFORM_ROLE) {
      return { ok: false, status: 403, code: 'FORBIDDEN', message: 'Vai trò của bạn không được phép thực hiện thao tác này' };
    }
    if (staff?.must_change_password && pathname !== '/api/v1/ops/auth/change-password') {
      return { ok: false, status: 403, code: 'PASSWORD_CHANGE_REQUIRED', message: 'Đổi mật khẩu tạm trước khi tiếp tục' };
    }

    const isPlatform = identity.role === PLATFORM_ROLE;
    // An account the server does not hold gets no rights, whatever its token says.
    const isDirectorUser = staff?.role === 'FLEET_DIRECTOR';
    const userPermissions = new Set(Array.isArray(staff?.permissions) ? staff.permissions : []);

    req.staffAccount = staff;
    req.staffAccess = {
      isDirector: Boolean(isDirectorUser),
      isPlatform: Boolean(isPlatform),
      permissions: userPermissions
    };

    const isTotpRequired = isDirectorUser || Boolean(staff?.totp_required) || isPlatform;
    const mustEnrollTotp = isTotpRequired && staff?.totp_enrolled === false;
    const allowedDuringEnrollment = ['/api/v1/ops/auth/change-password', '/api/v1/ops/auth/totp/setup', '/api/v1/ops/auth/totp/confirm'];
    if (mustEnrollTotp && !allowedDuringEnrollment.includes(pathname)) {
      return { ok: false, status: 403, code: 'TOTP_ENROLLMENT_REQUIRED', message: 'Cài xác thực 2 bước trước khi tiếp tục' };
    }

    if (isPlatform) {
      return { ok: true, identity };
    }

    const rule = STAFF_RULES.find((entry) => {
      if (entry.length === 3) {
        const [methods, re] = entry;
        const matchesMethod = Array.isArray(methods) ? methods.includes(req.method) : methods === req.method;
        return matchesMethod && re.test(pathname);
      }
      return entry[0].test(pathname);
    });

    if (rule) {
      const required = rule.length === 3 ? rule[2] : rule[1];
      if (required === DIRECTOR_ONLY) {
        if (!isDirectorUser) {
          return { ok: false, status: 403, code: 'FORBIDDEN', message: 'Chức năng này chỉ dành cho Giám đốc điều hành' };
        }
      } else if (Array.isArray(required)) {
        if (!isDirectorUser && !required.some(p => userPermissions.has(p))) {
          return { ok: false, status: 403, code: 'FORBIDDEN', message: 'Bạn chưa được giám đốc giao quyền làm việc này', required_permissions: required };
        }
      }
    } else if (pathname.startsWith(`${API}/ops/`)) {
      // Default rule for ops endpoints:
      // GET -> allowed for any staff of this operator
      // Non-GET -> DIRECTOR_ONLY, unless in STAFF_AUTH_EXEMPT
      if (req.method !== 'GET' && !STAFF_AUTH_EXEMPT.includes(pathname)) {
        if (!isDirectorUser) {
          return { ok: false, status: 403, code: 'FORBIDDEN', message: 'Chức năng này chỉ dành cho Giám đốc điều hành' };
        }
      }
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
