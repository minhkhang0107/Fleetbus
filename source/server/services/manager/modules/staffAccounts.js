/**
 * FleetBus Staff Accounts Service (B-10 / MGR-038)
 * FLEET_DIRECTOR manages office staff accounts.
 */
import crypto from 'crypto';
import { hashSecret } from '../../../core/passwords.js';
import { generateTemporaryPassword } from '../../../core/operators.js';
import { validateVietnamPhone, validatePersonName } from '../../passenger/core/formatters.js';
import { MOCK_MANAGERS_DB, TOTP_ROLES } from './managerService.js';

export const ALLOWED_STAFF_ROLES = ['STAFF'];

export const ALLOWED_PERMISSIONS = [
  'DISPATCH',
  'TRIP_CANCEL',
  'TICKETING',
  'BOOKINGS_VIEW',
  'PAYMENTS',
  'REFUNDS',
  'FLEET',
  'DRIVERS',
  'SCHEDULES',
  'MARKETING',
  'AUDIT_VIEW'
];

export const STAFF_ROLE_TEMPLATES = {
  DISPATCHER: {
    name: 'Điều độ viên',
    description: 'Phụ trách điều phối xe, tài xế, lịch trình và hỗ trợ hành khách',
    permissions: ['DISPATCH', 'TRIP_CANCEL', 'BOOKINGS_VIEW', 'FLEET', 'DRIVERS', 'SCHEDULES', 'AUDIT_VIEW']
  },
  CASHIER: {
    name: 'Thu ngân phòng vé',
    description: 'Bán vé quầy, giữ chỗ tổng đài và thu tiền vé',
    permissions: ['TICKETING', 'BOOKINGS_VIEW', 'PAYMENTS']
  },
  FINANCIAL_CONTROLLER: {
    name: 'Kế toán',
    description: 'Quản lý thanh toán, đối soát, hoàn tiền và báo cáo thu chi',
    permissions: ['PAYMENTS', 'REFUNDS', 'BOOKINGS_VIEW', 'AUDIT_VIEW'],
    totp_required: true
  }
};

export function normalizeStaffAccount(user) {
  if (!user || typeof user !== 'object') return user;

  if (user.role === 'PLATFORM_ADMIN') {
    if (!Array.isArray(user.permissions)) user.permissions = ['PLATFORM_ALL'];
    return user;
  }

  if (user.role === 'FLEET_DIRECTOR') {
    user.permissions = ['ALL'];
    return user;
  }

  const template = STAFF_ROLE_TEMPLATES[user.role];
  if (template) {
    user.role = 'STAFF';
    user.permissions = [...template.permissions];
    if (template.totp_required) {
      user.totp_required = true;
    }
  } else if (user.role === 'STAFF') {
    if (!Array.isArray(user.permissions)) {
      user.permissions = [];
    } else {
      user.permissions = user.permissions.filter(p => ALLOWED_PERMISSIONS.includes(p));
    }
  }

  if (user.totp_required === undefined) {
    user.totp_required = false;
  }

  return user;
}

export function getPermissionsCatalog() {
  return {
    permissions: [
      { code: 'DISPATCH', name: 'Điều độ chuyến', description: 'Gán xe/tài xế, đổi xe, báo trễ, ngừng/mở bán, kết thúc chuyến, duyệt đón trả tận nhà', group: 'VẬN HÀNH' },
      { code: 'TRIP_CANCEL', name: 'Hủy chuyến xe', description: 'Hủy chuyến và hoàn tiền tự động cho hành khách', group: 'VẬN HÀNH' },
      { code: 'TICKETING', name: 'Bán vé & Giữ chỗ', description: 'Bán vé quầy POS, giữ chỗ qua tổng đài hotline', group: 'PHÒNG VÉ' },
      { code: 'BOOKINGS_VIEW', name: 'Xem đặt chỗ & Khách', description: 'Xem danh sách đặt chỗ, chi tiết đơn hàng, danh sách khách (manifest)', group: 'PHÒNG VÉ' },
      { code: 'PAYMENTS', name: 'Thu tiền & Khớp lệnh', description: 'Xác nhận đơn chuyển khoản, xem sao kê, gán giao dịch ngân hàng, thu tiền nộp cuối chuyến, xử lý nợ', group: 'THANH TOÁN' },
      { code: 'REFUNDS', name: 'Hoàn tiền & Thu chi', description: 'Duyệt/từ chối hoàn tiền cho khách, xem báo cáo thu chi, xuất file CSV', group: 'THANH TOÁN' },
      { code: 'FLEET', name: 'Đội xe & Sơ đồ ghế', description: 'Thêm/sửa thông tin xe và sơ đồ ghế', group: 'ĐỘI XE & TUYẾN' },
      { code: 'DRIVERS', name: 'Quản lý tài xế', description: 'Thêm/sửa tài xế, cấp lại mã PIN tài xế', group: 'ĐỘI XE & TUYẾN' },
      { code: 'SCHEDULES', name: 'Lịch chạy & Tuyến đường', description: 'Quản lý lịch chạy, tuyến đường, bến bãi, cấu hình đón trả', group: 'ĐỘI XE & TUYẾN' },
      { code: 'MARKETING', name: 'Tiếp thị & Khuyến mãi', description: 'Quản lý quảng cáo banner và mã giảm giá', group: 'QUẢN TRỊ' },
      { code: 'AUDIT_VIEW', name: 'Nhật ký thao tác', description: 'Xem nhật ký hoạt động hệ thống', group: 'QUẢN TRỊ' }
    ],
    templates: [
      {
        key: 'DISPATCHER',
        name: 'Điều độ viên',
        description: 'Phụ trách điều phối xe, tài xế, lịch trình và hỗ trợ hành khách',
        permissions: ['DISPATCH', 'TRIP_CANCEL', 'BOOKINGS_VIEW', 'FLEET', 'DRIVERS', 'SCHEDULES', 'AUDIT_VIEW']
      },
      {
        key: 'CASHIER',
        name: 'Thu ngân phòng vé',
        description: 'Bán vé quầy, giữ chỗ tổng đài và thu tiền vé',
        permissions: ['TICKETING', 'BOOKINGS_VIEW', 'PAYMENTS']
      },
      {
        key: 'FINANCIAL_CONTROLLER',
        name: 'Kế toán',
        description: 'Quản lý thanh toán, đối soát, hoàn tiền và báo cáo thu chi',
        permissions: ['PAYMENTS', 'REFUNDS', 'BOOKINGS_VIEW', 'AUDIT_VIEW'],
        totp_required: true
      }
    ]
  };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function permissionsForRole(role) {
  if (role === 'FLEET_DIRECTOR') return ['ALL'];
  return STAFF_ROLE_TEMPLATES[role]?.permissions || [];
}

export function sanitizeStaff(user) {
  if (!user) return null;
  return {
    user_id: user.user_id,
    username: user.username,
    full_name: user.full_name,
    phone: user.phone || null,
    role: user.role,
    permissions: Array.isArray(user.permissions) ? user.permissions : [],
    totp_required: Boolean(user.totp_required),
    active: user.active !== false,
    must_change_password: Boolean(user.must_change_password),
    totp_enrolled: Boolean(user.totp_enrolled),
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
    .map(normalizeStaffAccount)
    .map(sanitizeStaff);
  return { ok: true, data: staff };
}

/**
 * Creates a new staff account (role STAFF with permissions) for the company.
 */
export function createStaff(operatorId, input = {}, now = Date.now()) {
  let role = input.role !== undefined && input.role !== null && input.role !== '' ? String(input.role).trim() : 'STAFF';
  if (role !== 'STAFF') {
    return {
      ok: false,
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Vai trò không hợp lệ. Chỉ được tạo tài khoản với vai trò Nhân viên (STAFF) và thiết lập danh sách quyền'
    };
  }

  let permissions = [];
  if (input.permissions !== undefined) {
    if (!Array.isArray(input.permissions)) {
      return {
        ok: false,
        status: 400,
        code: 'VALIDATION_ERROR',
        message: 'Danh sách quyền (permissions) phải là một mảng'
      };
    }
    for (const p of input.permissions) {
      if (!ALLOWED_PERMISSIONS.includes(p)) {
        return {
          ok: false,
          status: 400,
          code: 'VALIDATION_ERROR',
          message: `Quyền không hợp lệ: ${p}`
        };
      }
    }
    permissions = [...new Set(input.permissions)];
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
  const userId = `mgr_${codePart}_staff_${crypto.randomBytes(3).toString('hex')}`;

  const staff = {
    user_id: userId,
    username: rawUsername,
    password_hash: hashSecret(temporary_password),
    full_name: nameCheck.normalized,
    phone,
    role: 'STAFF',
    permissions,
    totp_required: Boolean(input.totp_required),
    operator_id: operatorId,
    active: true,
    token_version: 0,
    must_change_password: true,
    totp_enrolled: false,
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

  if (patch.role !== undefined) {
    const r = String(patch.role).trim();
    if (!ALLOWED_STAFF_ROLES.includes(r)) {
      return {
        ok: false,
        status: 400,
        code: 'VALIDATION_ERROR',
        message: 'Vai trò không hợp lệ. Chỉ chấp nhận vai trò Nhân viên (STAFF)'
      };
    }
  }

  let nextPermissions = null;
  if (patch.permissions !== undefined) {
    if (!Array.isArray(patch.permissions)) {
      return {
        ok: false,
        status: 400,
        code: 'VALIDATION_ERROR',
        message: 'Danh sách quyền (permissions) phải là một mảng'
      };
    }
    for (const p of patch.permissions) {
      if (!ALLOWED_PERMISSIONS.includes(p)) {
        return {
          ok: false,
          status: 400,
          code: 'VALIDATION_ERROR',
          message: `Quyền không hợp lệ: ${p}`
        };
      }
    }
    nextPermissions = [...new Set(patch.permissions)];
  }

  let nextTotpRequired = null;
  if (patch.totp_required !== undefined) {
    nextTotpRequired = Boolean(patch.totp_required);
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
  if (nextPermissions !== null) staff.permissions = nextPermissions;
  if (nextTotpRequired !== null) staff.totp_required = nextTotpRequired;

  let deactivated = false;
  if (patch.active !== undefined) {
    const nextActive = Boolean(patch.active);
    if (staff.active !== false && !nextActive) {
      deactivated = true;
    }
    staff.active = nextActive;
  }

  // Bump token_version ONLY on deactivation
  if (deactivated) {
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

  if (staff.role === 'FLEET_DIRECTOR' || staff.totp_required) {
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
