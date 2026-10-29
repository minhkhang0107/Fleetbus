/**
 * FleetBus Staff Accounts Service (B-10 / MGR-038)
 * FLEET_DIRECTOR manages office staff accounts (DISPATCHER, CASHIER, FINANCIAL_CONTROLLER).
 */
import crypto from 'crypto';
import { hashSecret } from '../../../core/passwords.js';
import { generateTemporaryPassword } from '../../../core/operators.js';
import { validateVietnamPhone, validatePersonName } from '../../passenger/core/formatters.js';
import { MOCK_MANAGERS_DB, TOTP_ROLES } from './managerService.js';

export const ALLOWED_STAFF_ROLES = ['DISPATCHER', 'CASHIER', 'FINANCIAL_CONTROLLER'];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function permissionsForRole(role) {
  switch (role) {
    case 'FLEET_DIRECTOR':
      return ['ALL'];
    case 'DISPATCHER':
      return ['DISPATCH_MANAGE', 'TRIP_EDIT', 'INCIDENT_BROADCAST', 'RADAR_VIEW'];
    case 'CASHIER':
      return ['POS_ISSUE', 'BOOKING_SEARCH'];
    case 'FINANCIAL_CONTROLLER':
      return ['FINANCE_MANAGE', 'REPORTS_VIEW', 'REFUND_MANAGE', 'PAYMENT_AUDIT'];
    default:
      return [];
  }
}

export function sanitizeStaff(user) {
  if (!user) return null;
  return {
    user_id: user.user_id,
    username: user.username,
    full_name: user.full_name,
    phone: user.phone || null,
    role: user.role,
    active: user.active !== false,
    must_change_password: Boolean(user.must_change_password),
    totp_enrolled: TOTP_ROLES.includes(user.role) ? Boolean(user.totp_enrolled) : false,
    created_at: user.created_at || null,
    last_login_at: user.last_login_at || null
  };
}

/**
 * Returns all staff accounts of the given company.
 */
export function listStaff(operatorId) {
  const staff = MOCK_MANAGERS_DB
    .filter(m => m.operator_id === operatorId)
    .map(sanitizeStaff);
  return { ok: true, data: staff };
}

/**
 * Creates a new staff account (DISPATCHER, CASHIER, or FINANCIAL_CONTROLLER) for the company.
 */
export function createStaff(operatorId, input = {}, now = Date.now()) {
  const role = String(input.role || '').trim();
  if (!ALLOWED_STAFF_ROLES.includes(role)) {
    return {
      ok: false,
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Vai trò không hợp lệ. Chỉ được tạo Điều phối, Thu ngân hoặc Kế toán'
    };
  }

  const rawUsername = String(input.username || input.email || '').trim().toLowerCase();
  if (!rawUsername || !EMAIL_RE.test(rawUsername)) {
    return {
      ok: false,
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Email không hợp lệ'
    };
  }

  const usernameTaken = MOCK_MANAGERS_DB.some(m => (m.username || '').toLowerCase() === rawUsername);
  if (usernameTaken) {
    return {
      ok: false,
      status: 409,
      code: 'STAFF_EXISTS',
      message: 'Email này đã có tài khoản'
    };
  }

  const nameCheck = validatePersonName(input.full_name);
  if (!nameCheck.isValid) {
    return {
      ok: false,
      status: 400,
      code: 'VALIDATION_ERROR',
      message: nameCheck.message
    };
  }

  let phone = null;
  if (input.phone) {
    const phoneCheck = validateVietnamPhone(input.phone);
    if (!phoneCheck.isValid) {
      return {
        ok: false,
        status: 400,
        code: 'VALIDATION_ERROR',
        message: phoneCheck.message
      };
    }
    phone = phoneCheck.normalized;
  }

  const temporary_password = generateTemporaryPassword(12);
  const codePart = (operatorId || 'op').replace(/^op_/, '').toLowerCase();
  const userId = `mgr_${codePart}_${role.toLowerCase().slice(0, 4)}_${crypto.randomBytes(3).toString('hex')}`;

  const staff = {
    user_id: userId,
    username: rawUsername,
    password_hash: hashSecret(temporary_password),
    full_name: nameCheck.normalized,
    phone,
    role,
    permissions: permissionsForRole(role),
    operator_id: operatorId,
    active: true,
    token_version: 0,
    must_change_password: true,
    ...(TOTP_ROLES.includes(role) ? { totp_enrolled: false } : {}),
    created_at: new Date(now).toISOString()
  };

  MOCK_MANAGERS_DB.push(staff);

  return {
    ok: true,
    data: {
      staff: sanitizeStaff(staff),
      temporary_password
    }
  };
}

/**
 * Updates an existing staff account of the caller's company.
 * Cannot modify or deactivate the caller themself or any FLEET_DIRECTOR.
 */
export function updateStaff(operatorId, userId, callerUserId, patch = {}) {
  const staff = MOCK_MANAGERS_DB.find(m => m.user_id === userId && m.operator_id === operatorId);
  if (!staff) {
    return {
      ok: false,
      status: 404,
      code: 'STAFF_NOT_FOUND',
      message: 'Không tìm thấy nhân viên'
    };
  }

  if (userId === callerUserId) {
    return {
      ok: false,
      status: 400,
      code: 'CANNOT_MODIFY_SELF',
      message: 'Không thể tự thay đổi thông tin hoặc khóa tài khoản của chính mình'
    };
  }

  if (staff.role === 'FLEET_DIRECTOR') {
    return {
      ok: false,
      status: 400,
      code: 'CANNOT_MODIFY_DIRECTOR',
      message: 'Không thể thay đổi thông tin hoặc khóa tài khoản Giám đốc'
    };
  }

  let nextRole = null;
  if (patch.role !== undefined) {
    const r = String(patch.role).trim();
    if (!ALLOWED_STAFF_ROLES.includes(r)) {
      return {
        ok: false,
        status: 400,
        code: 'VALIDATION_ERROR',
        message: 'Vai trò không hợp lệ. Chỉ được chọn Điều phối, Thu ngân hoặc Kế toán'
      };
    }
    nextRole = r;
  }

  let nextName = null;
  if (patch.full_name !== undefined) {
    const nameCheck = validatePersonName(patch.full_name);
    if (!nameCheck.isValid) {
      return {
        ok: false,
        status: 400,
        code: 'VALIDATION_ERROR',
        message: nameCheck.message
      };
    }
    nextName = nameCheck.normalized;
  }

  let nextPhone = null;
  let updatePhone = false;
  if (patch.phone !== undefined) {
    updatePhone = true;
    if (patch.phone) {
      const phoneCheck = validateVietnamPhone(patch.phone);
      if (!phoneCheck.isValid) {
        return {
          ok: false,
          status: 400,
          code: 'VALIDATION_ERROR',
          message: phoneCheck.message
        };
      }
      nextPhone = phoneCheck.normalized;
    }
  }

  const before = sanitizeStaff(staff);

  if (nextName !== null) staff.full_name = nextName;
  if (updatePhone) staff.phone = nextPhone;

  let roleChanged = false;
  if (nextRole !== null && nextRole !== staff.role) {
    staff.role = nextRole;
    staff.permissions = permissionsForRole(nextRole);
    if (TOTP_ROLES.includes(nextRole) && staff.totp_enrolled === undefined) {
      staff.totp_enrolled = false;
    }
    roleChanged = true;
  }

  let deactivated = false;
  if (patch.active !== undefined) {
    const nextActive = Boolean(patch.active);
    if (staff.active !== false && !nextActive) {
      deactivated = true;
    }
    staff.active = nextActive;
  }

  // Bump token_version on role change or deactivation
  if (roleChanged || deactivated) {
    staff.token_version = (staff.token_version || 0) + 1;
  }

  return {
    ok: true,
    before,
    data: {
      staff: sanitizeStaff(staff)
    }
  };
}

/**
 * Resets a staff member's password and issues a new temporary password.
 * Cannot reset self or any FLEET_DIRECTOR.
 */
export function resetStaffPassword(operatorId, userId, callerUserId, { loginGuard } = {}) {
  const staff = MOCK_MANAGERS_DB.find(m => m.user_id === userId && m.operator_id === operatorId);
  if (!staff) {
    return {
      ok: false,
      status: 404,
      code: 'STAFF_NOT_FOUND',
      message: 'Không tìm thấy nhân viên'
    };
  }

  if (userId === callerUserId) {
    return {
      ok: false,
      status: 400,
      code: 'CANNOT_MODIFY_SELF',
      message: 'Không thể tự đặt lại mật khẩu của chính mình'
    };
  }

  if (staff.role === 'FLEET_DIRECTOR') {
    return {
      ok: false,
      status: 400,
      code: 'CANNOT_MODIFY_DIRECTOR',
      message: 'Không thể đặt lại mật khẩu của Giám đốc'
    };
  }

  const temporary_password = generateTemporaryPassword(12);
  staff.password_hash = hashSecret(temporary_password);
  staff.must_change_password = true;
  staff.token_version = (staff.token_version || 0) + 1;

  if (TOTP_ROLES.includes(staff.role)) {
    staff.totp_enrolled = false;
    delete staff.totp_secret;
    delete staff.pending_totp_secret;
    staff.totp_last_step = -1;
  }

  if (loginGuard) {
    loginGuard.succeed((staff.username || '').trim().toLowerCase());
  }

  return {
    ok: true,
    data: {
      staff: sanitizeStaff(staff),
      temporary_password
    }
  };
}
