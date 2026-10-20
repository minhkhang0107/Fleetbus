/**
 * FleetBus Manager Operations Control Center Service
 * Implements MGR-001 through MGR-030 for Fleet Managers, Dispatchers, and Controllers.
 */

import crypto from 'crypto';
import { createShareToken } from '../../passenger/core/cryptoEngine.js';
import { DEMO_DATE, vnDate, parseServiceDate } from '../../../core/serviceDate.js';
import { validateVietnamPhone, validatePersonName } from '../../passenger/core/formatters.js';
import { signToken, TOKEN_PREFIXES } from '../../../core/tokens.js';
import { hashSecret, verifySecret, LoginGuard } from '../../../core/passwords.js';
import { verifyTotp, generateSecret } from '../../../core/totp.js';
import { getStaffTotpSecret } from '../../../config.js';
import { DEFAULT_OPERATOR_ID, OPERATOR_INACTIVE, findOperatorById, publicOperatorProfile, generateTemporaryPassword } from '../../../core/operators.js';
import { DEFAULT_LAYOUT_ID, findLayout } from '../../../core/seatLayouts.js';
import { MOCK_DRIVERS_DB } from '../../driver/modules/driverService.js';

const POS_PAYMENT_METHODS = ['CASH_POS', 'CARD_POS', 'BANK_TRANSFER'];
// BR-MGR-AUTH-001: these roles need a TOTP code on every login (ROLE_OPS_ADMIN and ROLE_FINANCE of the spec)
export const TOTP_ROLES = ['FLEET_DIRECTOR', 'FINANCIAL_CONTROLLER', 'PLATFORM_ADMIN'];
const HOLD_POLICIES = ['UNTIL_DEPARTURE_OFFSET', 'CUSTOM_EXPIRY_MINUTES'];
// BR-POS-006: one phone number holds at most this many seats at once across all trips
const HOTLINE_MAX_SEATS_PER_PHONE = 4;
// BR-TRACK-002: a vehicle that has been silent for longer than this is STALE, then OFFLINE
const GPS_STALE_AFTER_MS = 60 * 1000;
const GPS_OFFLINE_AFTER_MS = 180 * 1000;

export const LICENSE_MAX_CAPACITY = {
  B2: 9,
  C: 0,
  FC: 0,
  D: 30,
  E: null
};

export function driverLicenseCapacityReason(licenseClass, capacity, plateNumber = '') {
  const max = LICENSE_MAX_CAPACITY[licenseClass];
  if (max === undefined || max === null) return null;
  const vehicleText = plateNumber ? `xe ${plateNumber} ` : '';
  if (max === 0) {
    return `Bằng ${licenseClass} không được lái xe chở khách; ${vehicleText}có ${capacity} chỗ (gồm lái)`;
  }
  if (capacity > max) {
    return `Bằng ${licenseClass} chỉ lái xe tối đa ${max} chỗ; ${vehicleText}có ${capacity} chỗ (gồm lái)`;
  }
  return null;
}

function auditHash(body) {
  return crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');
}

/** Revenue counted for a booking: cash bookings count only what the driver has collected. */
function bookingRevenue(b) {
  return b.payment_method === 'CASH' ? (b.cod_collected_vnd || 0) : b.total_fare_vnd;
}

export const MOCK_MANAGERS_DB = [
  {
    user_id: 'mgr_01',
    username: 'admin@busgo.vn',
    password_hash: hashSecret('admin123'),
    full_name: 'Nguyễn Tiến Dũng',
    role: 'FLEET_DIRECTOR', // FLEET_DIRECTOR | DISPATCHER | CASHIER | FINANCIAL_CONTROLLER
    permissions: ['ALL'],
    operator_id: 'op_saomai',
    must_change_password: false
  },
  {
    user_id: 'mgr_02',
    username: 'dispatcher@busgo.vn',
    password_hash: hashSecret('disp123'),
    full_name: 'Phạm Hồng Quân',
    role: 'DISPATCHER',
    permissions: ['DISPATCH_MANAGE', 'TRIP_EDIT', 'INCIDENT_BROADCAST', 'RADAR_VIEW'],
    operator_id: 'op_saomai',
    must_change_password: false
  },
  {
    user_id: 'mgr_03',
    username: 'cashier@busgo.vn',
    password_hash: hashSecret('cash123'),
    full_name: 'Đỗ Thu Hà',
    role: 'CASHIER',
    permissions: ['POS_ISSUE', 'BOOKING_SEARCH'],
    operator_id: 'op_saomai',
    must_change_password: false
  },
  {
    user_id: 'mgr_xv_01',
    username: 'dispatcher@xuyenviet.vn',
    password_hash: hashSecret('xv123'),
    full_name: 'Vũ Thị Lan',
    role: 'DISPATCHER',
    permissions: ['DISPATCH_MANAGE', 'TRIP_EDIT', 'INCIDENT_BROADCAST', 'RADAR_VIEW'],
    operator_id: 'op_xuyenviet',
    must_change_password: false
  },
  {
    user_id: 'mgr_xv_02',
    username: 'cashier@xuyenviet.vn',
    password_hash: hashSecret('xv123'),
    full_name: 'Hoàng Văn Tú',
    role: 'CASHIER',
    permissions: ['POS_ISSUE', 'BOOKING_SEARCH'],
    operator_id: 'op_xuyenviet',
    must_change_password: false
  },
  {
    // Platform owner: belongs to no bus company (spec 2.3).
    user_id: 'plat_01',
    username: 'root@busgo.vn',
    password_hash: hashSecret('root123'),
    full_name: 'Quản trị nền tảng',
    role: 'PLATFORM_ADMIN',
    permissions: ['PLATFORM_ALL'],
    operator_id: null,
    must_change_password: false
  }
];

export class ManagerOperationsService {
  constructor() {
    this.loginGuard = new LoginGuard();
    this.vehicles = [
      { vehicle_id: 'veh_01', plate_number: '29B-123.45', model: 'Limousine 34 Phòng VIP', total_seats: 34, layout_id: 'CABIN_34', status: 'ASSIGNED', driver_name: 'Trần Văn Bình', lat: 20.9812, lng: 105.8430, speed_kmh: 62, heading: 180, gps_status: 'LIVE', gps_health: 'LIVE', operator_id: 'op_saomai' },
      { vehicle_id: 'veh_02', plate_number: '29B-444.11', model: 'Cabin Cung Điện VIP 22', total_seats: 22, layout_id: 'CABIN_22', status: 'IN_TRANSIT', driver_name: 'Lê Văn Toàn', lat: 20.4500, lng: 105.9200, speed_kmh: 55, heading: 175, gps_status: 'STALE', gps_health: 'STALE', operator_id: 'op_saomai' },
      { vehicle_id: 'veh_04', plate_number: '29B-882.19', model: 'Cabin Cung Điện VIP 22', total_seats: 22, layout_id: 'CABIN_22', status: 'ASSIGNED', driver_name: 'Trần Văn Bình', lat: 20.9806, lng: 105.8413, speed_kmh: 0, heading: 0, gps_status: 'LIVE', gps_health: 'LIVE', operator_id: 'op_saomai' },
      { vehicle_id: 'veh_03', plate_number: '29B-888.22', model: 'Sleeper 34 Giường Nằm', total_seats: 34, layout_id: 'SLEEPER_34', status: 'STANDBY', driver_name: 'Hoàng Anh Tuấn', lat: 20.9800, lng: 105.8400, speed_kmh: 0, heading: 0, gps_status: 'LIVE', gps_health: 'LIVE', operator_id: 'op_saomai' },
      { vehicle_id: 'veh_xv_01', plate_number: '30H-246.80', model: 'Limousine Xuyên Việt 22 Phòng', total_seats: 22, layout_id: 'CABIN_22', status: 'ASSIGNED', driver_name: 'Đỗ Minh Khoa', lat: 21.0285, lng: 105.7787, speed_kmh: 0, heading: 0, gps_status: 'LIVE', gps_health: 'LIVE', operator_id: 'op_xuyenviet' }
    ];
    this.seatLayouts = [];

    this.drivers = [
      // Same people, ids and licences as the driver app (DRI-001), so a driver named here can sign in and see the trip
      { driver_id: 'drv_8821a', staff_id: 'TX8821', full_name: 'Trần Văn Bình', phone: '0912348821', license_class: 'E', license_expiry: '2028-12-31', safety_score: 98.5, status: 'ACTIVE', operator_id: 'op_saomai' },
      { driver_id: 'drv_9912b', staff_id: 'TX9912', full_name: 'Phạm Quốc Huy', phone: '0988776655', license_class: 'E', license_expiry: '2028-06-30', safety_score: 96.0, status: 'ACTIVE', operator_id: 'op_saomai' },
      { driver_id: 'drv_9902b', staff_id: 'TX9902', full_name: 'Lê Hoàng Nam', phone: '0987654321', license_class: 'E', license_expiry: '2025-01-01', safety_score: 91.0, status: 'ACTIVE', operator_id: 'op_saomai' },
      { driver_id: 'drv_xv_7701', staff_id: 'TX7701', full_name: 'Đỗ Minh Khoa', phone: '0901777001', license_class: 'E', license_expiry: '2029-03-31', safety_score: 100, status: 'ACTIVE', operator_id: 'op_xuyenviet' }
    ];

    this.routes = [
      { route_id: 'rt_hn_th', name: 'Hà Nội — Thanh Hóa (Cao tốc)', distance_km: 160, base_fare_vnd: 220000, stops_count: 4, operator_id: 'op_saomai' },
      { route_id: 'rt_hn_hp', name: 'Hà Nội — Hải Phòng (5B)', distance_km: 120, base_fare_vnd: 180000, stops_count: 3, operator_id: 'op_saomai' },
      { route_id: 'rt_hn_nb', name: 'Hà Nội — Ninh Bình (Cao tốc)', distance_km: 95, base_fare_vnd: 150000, stops_count: 3, operator_id: 'op_saomai' },
      { route_id: 'rt_xv_hn_th', name: 'Hà Nội — Thanh Hóa (Xuyên Việt)', distance_km: 160, base_fare_vnd: 200000, stops_count: 4, operator_id: 'op_xuyenviet' }
    ];

    this.trips = [
      { trip_id: 'trp_991823', driver_id: 'drv_8821a', route_id: 'rt_hn_th', vehicle_id: 'veh_01', vehicle_plate: '29B-123.45', departure_time: '2026-08-28T14:00:00+07:00', status: 'DISPATCHED', booked_seats: 28, total_seats: 34, delay_minutes: 0, operator_id: 'op_saomai' },
      { trip_id: 'trp_991824', driver_id: 'drv_8821a', route_id: 'rt_hn_hp', vehicle_id: 'veh_02', vehicle_plate: '29B-444.11', departure_time: '2026-08-28T15:30:00+07:00', status: 'SCHEDULED', booked_seats: 20, total_seats: 22, delay_minutes: 35, operator_id: 'op_saomai' },
      { trip_id: 'trp_hn_th_01', driver_id: 'drv_8821a', route_id: 'rt_hn_th', vehicle_id: 'veh_04', vehicle_plate: '29B-882.19', departure_time: '2026-08-28T07:00:00+07:00', status: 'READY', booked_seats: 2, total_seats: 22, delay_minutes: 0, operator_id: 'op_saomai' },
      { trip_id: 'trp_xv_hn_th_01', driver_id: 'drv_xv_7701', route_id: 'rt_xv_hn_th', vehicle_id: 'veh_xv_01', vehicle_plate: '30H-246.80', departure_time: '2026-08-28T08:30:00+07:00', status: 'READY', booked_seats: 0, total_seats: 22, delay_minutes: 0, operator_id: 'op_xuyenviet' }
    ];

    this.bookings = [
      { pnr: 'BG-88219', trip_id: 'trp_991823', passenger_name: 'Trần Văn Hùng', phone: '0981112233', seat_codes: ['A01', 'A02'], total_fare_vnd: 440000, payment_status: 'PAID', channel: 'PASSENGER_APP', issued_at: '2026-08-27T09:00:00+07:00', operator_id: 'op_saomai' },
      { pnr: 'BG-99412', trip_id: 'trp_991823', passenger_name: 'Nguyễn Thị Hoa', phone: '0912334455', seat_codes: ['B01'], total_fare_vnd: 220000, payment_status: 'PAID', channel: 'POS_HOTLINE', issued_at: '2026-08-27T10:30:00+07:00', operator_id: 'op_saomai' }
    ];

    this.alerts = [
      { alert_id: 'alt_01', vehicle_plate: '29B-444.11', type: 'DELAY_WARNING', severity: 'AMBER', message: 'Chuyến trp_991824 dự kiến trễ +35 phút do kẹt xe đầu cao tốc 5B', created_at: '2026-08-28T13:00:00Z', operator_id: 'op_saomai' },
      { alert_id: 'alt_02', vehicle_plate: '29B-123.45', type: 'GPS_LIVE', severity: 'GREEN', message: 'Xe đang vận hành ổn định trên cao tốc Pháp Vân - Cầu Giẽ', created_at: '2026-08-28T13:02:00Z', operator_id: 'op_saomai' }
    ];

    this.hotlineReservations = [];
    this.refundRequests = [];
    this.auditLog = [];
  }

  /**
   * MGR-028: Append-only record of who did what, to what, from where, with the values before and after.
   * Entries are frozen and never edited; secrets are never written to it.
   */
  recordAudit({ actor = 'anonymous', role = null, action, resource = null, ip = null, before = null, after = null, now = Date.now(), operator_id = DEFAULT_OPERATOR_ID }) {
    // Each company's entries form a hash chain (D127): removing or inserting an entry breaks it.
    const prev = this.auditLog.findLast(a => (a.operator_id || DEFAULT_OPERATOR_ID) === operator_id);
    const body = {
      audit_id: `aud_${now}_${this.auditLog.length + 1}`,
      at: new Date(now).toISOString(),
      actor,
      role,
      action,
      resource,
      ip,
      before,
      after,
      operator_id,
      prev_hash: prev?.hash || null
    };
    const entry = Object.freeze({ ...body, hash: auditHash(body) });
    this.auditLog.push(entry);
    return entry;
  }

  /** Walks a company's audit chain; `broken_at` is the first entry that does not follow from the one before. */
  verifyAuditChain(operatorId = DEFAULT_OPERATOR_ID) {
    let prevHash = null;
    let count = 0;
    for (const entry of this.auditLog) {
      if ((entry.operator_id || DEFAULT_OPERATOR_ID) !== operatorId) continue;
      const { hash, ...body } = entry;
      if (body.prev_hash !== prevHash || auditHash(body) !== hash) return { intact: false, broken_at: entry.audit_id, checked: count };
      prevHash = hash;
      count += 1;
    }
    return { intact: true, broken_at: null, checked: count };
  }

  /**
   * MGR-001: Manager Authentication & RBAC Session
   */
  authenticateManager(username, password, totp = null, mockNow = Date.now()) {
    const key = (username || '').trim().toLowerCase();

    const lockedFor = this.loginGuard.isLocked(key, mockNow);
    if (lockedFor > 0) {
      return {
        success: false,
        error: `Tài khoản tạm khóa do nhập sai nhiều lần. Thử lại sau ${Math.ceil(lockedFor / 60)} phút`,
        code: 'ACCOUNT_LOCKED',
        retry_after_seconds: lockedFor
      };
    }

    const user = MOCK_MANAGERS_DB.find(u => u.username === key);
    if (!user || !verifySecret(String(password ?? ''), user.password_hash)) {
      this.loginGuard.fail(key, mockNow);
      return { success: false, error: 'Tên đăng nhập hoặc mật khẩu không chính xác', code: 'INVALID_CREDENTIALS' };
    }

    // Second factor: asked only after the password is right, so it never tells whether a password is valid.
    // An account not enrolled yet is let in with password alone because it can only reach the enrollment endpoints.
    if (TOTP_ROLES.includes(user.role) && user.totp_enrolled !== false) {
      if (totp === null || totp === undefined || totp === '') {
        return { success: false, error: 'Cần mã xác thực 2 bước (6 số) từ ứng dụng Authenticator', code: 'TOTP_REQUIRED' };
      }
      const secret = getStaffTotpSecret(user.user_id, user);
      if (!secret) {
        return { success: false, error: 'Tài khoản chưa được cấp khóa xác thực 2 bước. Liên hệ quản trị hệ thống', code: 'TOTP_NOT_CONFIGURED' };
      }
      const check = verifyTotp(secret, totp, { now: mockNow, window: 1, lastUsedStep: user.totp_last_step ?? -1 });
      if (!check.valid) {
        this.loginGuard.fail(key, mockNow);
        return {
          success: false,
          error: check.reason === 'REPLAYED' ? 'Mã xác thực này đã được dùng. Đợi mã mới' : 'Mã xác thực 2 bước không đúng',
          code: 'INVALID_TOTP'
        };
      }
      user.totp_last_step = check.step;
    }
    this.loginGuard.succeed(key);

    const operator = user.operator_id ? findOperatorById(user.operator_id) : null;
    if (operator && operator.active === false) {
      return { success: false, error: OPERATOR_INACTIVE.message, code: OPERATOR_INACTIVE.code };
    }

    const token = signToken(
      { sub: user.user_id, role: user.role, permissions: user.permissions, kind: 'staff', operator_id: user.operator_id },
      { prefix: TOKEN_PREFIXES.staff, ttlSeconds: 8 * 3600, now: mockNow }
    );

    return {
      success: true,
      data: {
        user: {
          user_id: user.user_id,
          username: user.username,
          full_name: user.full_name,
          role: user.role,
          permissions: user.permissions,
          must_change_password: Boolean(user.must_change_password),
          must_enroll_totp: Boolean(TOTP_ROLES.includes(user.role) && user.totp_enrolled === false)
        },
        operator: publicOperatorProfile(operator),
        token
      }
    };
  }

  authenticateStaff(username, password, totp = null) {
    return this.authenticateManager(username, password, totp);
  }

  /**
   * MGR-001: Change password for staff
   */
  changePassword(userId, { current_password, new_password } = {}, mockNow = Date.now()) {
    const user = MOCK_MANAGERS_DB.find(u => u.user_id === userId);
    if (!user) {
      return { success: false, error: 'Không tìm thấy người dùng', code: 'USER_NOT_FOUND', status: 404 };
    }
    const key = (user.username || '').trim().toLowerCase();

    const lockedFor = this.loginGuard.isLocked(key, mockNow);
    if (lockedFor > 0) {
      return {
        success: false,
        error: `Tài khoản tạm khóa do nhập sai nhiều lần. Thử lại sau ${Math.ceil(lockedFor / 60)} phút`,
        code: 'ACCOUNT_LOCKED',
        retry_after_seconds: lockedFor,
        status: 429
      };
    }

    if (!current_password || typeof current_password !== 'string') {
      return { success: false, error: 'Cần mật khẩu hiện tại', code: 'VALIDATION_ERROR', status: 400 };
    }
    if (!new_password || typeof new_password !== 'string' || new_password.length < 10 || !/[a-zA-Z]/.test(new_password) || !/[0-9]/.test(new_password)) {
      return { success: false, error: 'Mật khẩu mới phải có ít nhất 10 ký tự, bao gồm cả chữ và số', code: 'VALIDATION_ERROR', status: 400 };
    }

    if (!verifySecret(String(current_password), user.password_hash)) {
      this.loginGuard.fail(key, mockNow);
      const nowLocked = this.loginGuard.isLocked(key, mockNow);
      if (nowLocked > 0) {
        return {
          success: false,
          error: `Tài khoản tạm khóa do nhập sai nhiều lần. Thử lại sau ${Math.ceil(nowLocked / 60)} phút`,
          code: 'ACCOUNT_LOCKED',
          retry_after_seconds: nowLocked,
          status: 429
        };
      }
      // 400, not 401: a wrong current password must not end the session the page is using.
      return { success: false, error: 'Mật khẩu hiện tại không chính xác', code: 'INVALID_CREDENTIALS', status: 400 };
    }

    if (new_password === current_password) {
      return { success: false, error: 'Mật khẩu mới phải khác mật khẩu hiện tại', code: 'VALIDATION_ERROR', status: 400 };
    }

    this.loginGuard.succeed(key);
    user.password_hash = hashSecret(new_password);
    user.must_change_password = false;
    user.totp_last_step = -1;
    return {
      success: true,
      username: user.username
    };
  }

  /**
   * Platform admin resets temporary password for a company's first FLEET_DIRECTOR
   */
  resetDirectorPassword(operatorId) {
    const director = MOCK_MANAGERS_DB.find(m => m.operator_id === operatorId && m.role === 'FLEET_DIRECTOR');
    if (!director) {
      return { success: false, error: 'Không tìm thấy giám đốc nhà xe', code: 'DIRECTOR_NOT_FOUND', status: 404 };
    }
    const temporary_password = generateTemporaryPassword(12);
    director.password_hash = hashSecret(temporary_password);
    director.must_change_password = true;
    director.totp_enrolled = false;
    delete director.totp_secret;
    delete director.pending_totp_secret;
    director.totp_last_step = -1;
    this.loginGuard.succeed((director.username || '').trim().toLowerCase());
    return {
      success: true,
      director: {
        user_id: director.user_id,
        username: director.username,
        full_name: director.full_name
      },
      temporary_password
    };
  }

  /**
   * MGR-001: Set up TOTP two-factor authentication (creates or replaces pending secret)
   */
  setupTotp(userId) {
    const user = MOCK_MANAGERS_DB.find(u => u.user_id === userId);
    if (!user) {
      return { success: false, error: 'Không tìm thấy người dùng', code: 'USER_NOT_FOUND', status: 404 };
    }
    if (user.totp_enrolled === true) {
      return { success: false, error: 'Tài khoản đã cài đặt xác thực 2 bước', code: 'TOTP_ALREADY_ENROLLED', status: 400 };
    }
    const secret = generateSecret();
    user.pending_totp_secret = secret;
    const email = user.username;
    const otpauth_uri = `otpauth://totp/BusGo:${email}?secret=${secret}&issuer=BusGo&digits=6&period=30`;
    return {
      success: true,
      data: {
        secret,
        otpauth_uri
      }
    };
  }

  /**
   * MGR-001: Confirm and activate TOTP two-factor authentication
   */
  confirmTotp(userId, code, mockNow = Date.now()) {
    const user = MOCK_MANAGERS_DB.find(u => u.user_id === userId);
    if (!user) {
      return { success: false, error: 'Không tìm thấy người dùng', code: 'USER_NOT_FOUND', status: 404 };
    }
    const key = (user.username || '').trim().toLowerCase();
    const lockedFor = this.loginGuard.isLocked(key, mockNow);
    if (lockedFor > 0) {
      return {
        success: false,
        error: `Tài khoản tạm khóa do nhập sai nhiều lần. Thử lại sau ${Math.ceil(lockedFor / 60)} phút`,
        code: 'ACCOUNT_LOCKED',
        retry_after_seconds: lockedFor,
        status: 429
      };
    }
    if (user.totp_enrolled === true) {
      return { success: false, error: 'Tài khoản đã cài đặt xác thực 2 bước', code: 'TOTP_ALREADY_ENROLLED', status: 400 };
    }
    const pendingSecret = user.pending_totp_secret;
    if (!pendingSecret) {
      return { success: false, error: 'Chưa khởi tạo khóa xác thực 2 bước', code: 'TOTP_SETUP_REQUIRED', status: 400 };
    }
    const check = verifyTotp(pendingSecret, code, { now: mockNow, window: 1 });
    if (!check.valid) {
      this.loginGuard.fail(key, mockNow);
      return {
        success: false,
        error: check.reason === 'REPLAYED' ? 'Mã xác thực này đã được dùng. Đợi mã mới' : 'Mã xác thực 2 bước không đúng',
        code: 'INVALID_TOTP',
        status: 400
      };
    }
    this.loginGuard.succeed(key);
    user.totp_secret = pendingSecret;
    user.totp_enrolled = true;
    user.totp_last_step = -1;
    delete user.pending_totp_secret;
    return {
      success: true,
      username: user.username
    };
  }

  /**
   * MGR-002: Operations Dashboard Executive KPIs
   */
  /**
   * Money figures over a set of bookings: gross fares, refunds paid back, and what is left.
   */
  _moneyFigures(bookings) {
    const gross = bookings.reduce((sum, b) => sum + bookingRevenue(b), 0);
    const refunded = bookings.reduce((sum, b) => sum + (b.refund_amount_vnd || 0), 0);
    return { gross_revenue_vnd: gross, refunded_vnd: refunded, net_revenue_vnd: gross - refunded };
  }

  getDashboardKPIs(operatorId = DEFAULT_OPERATOR_ID) {
    this.releaseExpiredHotlineHolds();
    const round1 = (n) => parseFloat(n.toFixed(1));
    const trips = this.trips.filter(t => t.operator_id === operatorId);
    const vehicles = this.vehicles.filter(v => v.operator_id === operatorId);
    const bookings = this.bookings.filter(b => trips.some(t => t.trip_id === b.trip_id));
    const alerts = this.alerts.filter(a => a.operator_id === operatorId);
    const routes = this.routes.filter(r => r.operator_id === operatorId);

    const totalVehicles = vehicles.length;
    const activeVehicles = vehicles.filter(v => v.status === 'IN_TRANSIT').length;
    const totalBookedSeats = trips.reduce((acc, t) => acc + t.booked_seats, 0);
    const totalCapacity = trips.reduce((acc, t) => acc + t.total_seats, 0);

    // A trip leaves on time when its delay is at most 15 minutes (MGR-002)
    const onTimeTrips = trips.filter(t => (t.delay_minutes || 0) <= 15).length;
    const moving = vehicles.filter(v => v.status === 'IN_TRANSIT' && v.speed_kmh > 0);

    const corridors = routes
      .map(route => {
        const routeTrips = trips.filter(t => t.route_id === route.route_id);
        const booked = routeTrips.reduce((acc, t) => acc + t.booked_seats, 0);
        const capacity = routeTrips.reduce((acc, t) => acc + t.total_seats, 0);
        return {
          corridor: route.name,
          load_factor_pct: capacity > 0 ? round1((booked / capacity) * 100) : 0,
          active_trips: routeTrips.filter(t => t.status === 'IN_TRANSIT').length,
          trips: routeTrips.length
        };
      })
      .filter(c => c.trips > 0)
      .map(({ trips, ...corridor }) => corridor);

    return {
      success: true,
      data: {
        timestamp: new Date().toISOString(),
        kpi_metrics: {
          active_vehicles_count: activeVehicles,
          total_fleet_count: totalVehicles,
          overall_load_factor_pct: totalCapacity > 0 ? round1((totalBookedSeats / totalCapacity) * 100) : 0,
          ...this._moneyFigures(bookings),
          on_time_departure_rate_pct: trips.length > 0 ? round1((onTimeTrips / trips.length) * 100) : 100,
          active_alerts_count: alerts.length,
          fleet_average_speed_kmh: moving.length > 0 ? round1(moving.reduce((acc, v) => acc + v.speed_kmh, 0) / moving.length) : 0
        },
        corridors,
        recent_alerts: alerts
      }
    };
  }

  getOperationsDashboardKPIs(operatorId = DEFAULT_OPERATOR_ID) {
    return this.getDashboardKPIs(operatorId);
  }

  /**
   * MGR-003: Live Fleet Radar Map Telemetry
   */
  getLiveFleetRadar(mockNow = Date.now(), operatorId = DEFAULT_OPERATOR_ID) {
    const vehicles = this.vehicles.filter(v => v.operator_id === operatorId);
    return {
      success: true,
      data: {
        tracked_at: new Date(mockNow).toISOString(),
        total_tracked_vehicles: vehicles.length,
        vehicles: vehicles.map(v => {
          const health = this._gpsHealth(v, mockNow);
          const activeTrips = this.trips
            .filter(t => (t.operator_id || DEFAULT_OPERATOR_ID) === operatorId && t.vehicle_id === v.vehicle_id && !['COMPLETED', 'CANCELLED'].includes(t.status))
            .sort((a, b) => (Date.parse(a.departure_time) || 0) - (Date.parse(b.departure_time) || 0));
          const workingTrip = activeTrips.find(t => t.status === 'IN_TRANSIT') || activeTrips[0];
          const assignedDriver = workingTrip?.driver_id ? this.drivers.find(d => d.driver_id === workingTrip.driver_id) : null;
          return {
            vehicle_id: v.vehicle_id,
            plate_number: v.plate_number,
            model: v.model,
            status: v.status,
            driver_name: assignedDriver?.full_name || v.driver_name,
            lat: v.lat,
            lng: v.lng,
            speed_kmh: v.speed_kmh,
            heading: v.heading,
            gps_status: health,
            gps_health: health,
            last_ping_at: v.last_ping_at ? new Date(v.last_ping_at).toISOString() : null
          };
        })
      }
    };
  }

  /**
   * GPS health of a vehicle (BR-TRACK-002). A vehicle that pinged is judged by the age of its last ping;
   * a vehicle that never pinged keeps the health it was registered with.
   */
  _gpsHealth(vehicle, mockNow = Date.now()) {
    if (!vehicle.last_ping_at) return vehicle.gps_health || vehicle.gps_status || 'LIVE';
    const age = mockNow - vehicle.last_ping_at;
    if (age > GPS_OFFLINE_AFTER_MS) return 'OFFLINE';
    if (age > GPS_STALE_AFTER_MS) return 'STALE';
    return 'LIVE';
  }

  /**
   * MGR-005: Fleet Roster & Vehicles
   */
  getFleetRoster(operatorId = DEFAULT_OPERATOR_ID) {
    const list = this.vehicles
      .filter(v => (v.operator_id || DEFAULT_OPERATOR_ID) === operatorId)
      .map(v => {
        // A bus saved before layouts existed runs on the old 22-cabin map its tickets were sold on (D147).
        const layout = this.layoutOfVehicle(v.vehicle_id);
        return { ...v, layout_id: layout.layout_id, layout_name: layout.name, total_seats: layout.seats.length };
      });
    return {
      success: true,
      data: list
    };
  }

  getFleet(operatorId = DEFAULT_OPERATOR_ID) {
    return this.getFleetRoster(operatorId);
  }

  getFleetVehicles(operatorId = DEFAULT_OPERATOR_ID) {
    return this.getFleetRoster(operatorId);
  }

  layoutOfVehicle(vehicleId) {
    const v = this.vehicles.find(veh => veh.vehicle_id === vehicleId);
    if (!v) return findLayout(DEFAULT_LAYOUT_ID, this.seatLayouts);
    return findLayout(v.layout_id, this.seatLayouts) || findLayout(DEFAULT_LAYOUT_ID, this.seatLayouts);
  }

  layoutOfTrip(tripId) {
    const trip = this.findTrip(tripId);
    if (!trip || !trip.vehicle_id) return null;
    return this.layoutOfVehicle(trip.vehicle_id);
  }

  addVehicle({ plate_number, model = 'Thaco Mobihome VIP', total_seats, layout_id }, operatorId = DEFAULT_OPERATOR_ID) {
    const chosenLayoutId = layout_id || DEFAULT_LAYOUT_ID;
    const template = findLayout(chosenLayoutId, this.seatLayouts) || findLayout(DEFAULT_LAYOUT_ID, this.seatLayouts);
    const seatsCount = (layout_id !== undefined || total_seats === undefined)
      ? (template ? template.seats.length : (total_seats || 34))
      : total_seats;
    const newVehicle = {
      vehicle_id: `veh_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      plate_number,
      model,
      total_seats: seatsCount,
      layout_id: template ? template.layout_id : chosenLayoutId,
      layout_name: template ? template.name : null,
      status: 'STANDBY',
      driver_name: 'Chưa gán',
      lat: 20.9812,
      lng: 105.8430,
      speed_kmh: 0,
      heading: 0,
      gps_status: 'LIVE',
      gps_health: 'LIVE',
      operator_id: operatorId
    };
    this.vehicles.push(newVehicle);
    return { success: true, data: newVehicle };
  }

  /**
   * MGR-008: Crew Directory
   */
  getCrewDrivers(operatorId = DEFAULT_OPERATOR_ID) {
    const today = vnDate();
    const list = this.drivers
      .filter(d => (d.operator_id || DEFAULT_OPERATOR_ID) === operatorId)
      .map(d => {
        const acc = MOCK_DRIVERS_DB.find(a => a.driver_id === d.driver_id);
        const status = d.status === 'LOCKED' ? 'LOCKED' : 'ACTIVE';
        const licenseExpired = Boolean(d.license_expiry && d.license_expiry <= today);
        const mustChangePin = acc ? Boolean(acc.must_change_pin) : false;
        return {
          driver_id: d.driver_id,
          staff_id: d.staff_id,
          full_name: d.full_name,
          phone: d.phone,
          license_class: d.license_class,
          license_expiry: d.license_expiry,
          status,
          must_change_pin: mustChangePin,
          license_expired: licenseExpired
        };
      });
    return {
      success: true,
      data: list
    };
  }

  getCrew(operatorId = DEFAULT_OPERATOR_ID) {
    return this.getCrewDrivers(operatorId);
  }

  addDriver({ full_name, phone, staff_id, license_class, license_expiry } = {}, operatorId = DEFAULT_OPERATOR_ID) {
    const nameCheck = validatePersonName(full_name);
    if (!nameCheck.isValid) {
      return { success: false, error: nameCheck.message, code: 'VALIDATION_ERROR', status: 400 };
    }
    const phoneCheck = validateVietnamPhone(phone);
    if (!phoneCheck.isValid) {
      return { success: false, error: phoneCheck.message, code: 'VALIDATION_ERROR', status: 400 };
    }
    const ALLOWED_LICENSE_CLASSES = ['B2', 'C', 'D', 'E', 'FC'];
    const licClass = String(license_class || '').trim().toUpperCase();
    if (!ALLOWED_LICENSE_CLASSES.includes(licClass)) {
      return { success: false, error: 'Hạng bằng lái phải là một trong các hạng: B2, C, D, E, FC', code: 'VALIDATION_ERROR', status: 400 };
    }
    const parsedExpiry = parseServiceDate(license_expiry);
    if (!parsedExpiry) {
      return { success: false, error: 'Ngày hết hạn bằng lái không hợp lệ (định dạng YYYY-MM-DD)', code: 'VALIDATION_ERROR', status: 400 };
    }
    const today = vnDate();
    if (parsedExpiry <= today) {
      return { success: false, error: 'Ngày hết hạn bằng lái phải sau ngày hôm nay', code: 'VALIDATION_ERROR', status: 400 };
    }

    let sid = null;
    if (staff_id != null && String(staff_id).trim() !== '') {
      const candidateSid = String(staff_id).trim().toUpperCase();
      if (!/^[A-Z0-9]{3,12}$/.test(candidateSid)) {
        return { success: false, error: 'Mã nhân viên không hợp lệ (3-12 ký tự chữ và số)', code: 'VALIDATION_ERROR', status: 400 };
      }
      sid = candidateSid;
    } else {
      const existingStaffIds = new Set([
        ...this.drivers.filter(d => (d.operator_id || DEFAULT_OPERATOR_ID) === operatorId).map(d => d.staff_id),
        ...MOCK_DRIVERS_DB.filter(d => (d.operator_id || DEFAULT_OPERATOR_ID) === operatorId).map(d => d.staff_id)
      ]);
      for (let attempts = 0; attempts < 10000; attempts++) {
        const candidate = `TX${String(crypto.randomInt(1000, 10000))}`;
        if (!existingStaffIds.has(candidate)) {
          sid = candidate;
          break;
        }
      }
      if (!sid) {
        return { success: false, error: 'Không thể tạo mã nhân viên tự động', code: 'STAFF_ID_GENERATION_FAILED', status: 500 };
      }
    }

    const existingPhone = this.drivers.some(d => (d.operator_id || DEFAULT_OPERATOR_ID) === operatorId && d.phone === phoneCheck.normalized) ||
      MOCK_DRIVERS_DB.some(d => (d.operator_id || DEFAULT_OPERATOR_ID) === operatorId && d.phone === phoneCheck.normalized);
    const existingSid = this.drivers.some(d => (d.operator_id || DEFAULT_OPERATOR_ID) === operatorId && d.staff_id === sid) ||
      MOCK_DRIVERS_DB.some(d => (d.operator_id || DEFAULT_OPERATOR_ID) === operatorId && d.staff_id === sid);
    if (existingPhone || existingSid) {
      return { success: false, error: 'Số điện thoại hoặc mã nhân viên đã tồn tại trong công ty', code: 'DRIVER_EXISTS', status: 409 };
    }

    const driver_id = `drv_${crypto.randomBytes(4).toString('hex')}`;
    const temporary_pin = String(crypto.randomInt(0, 1000000)).padStart(6, '0');

    const driver = {
      driver_id,
      staff_id: sid,
      full_name: nameCheck.normalized,
      phone: phoneCheck.normalized,
      license_class: licClass,
      license_expiry: parsedExpiry,
      status: 'ACTIVE',
      operator_id: operatorId
    };
    this.drivers.push(driver);

    const driverAccount = {
      driver_id,
      staff_id: sid,
      phone: phoneCheck.normalized,
      pin: hashSecret(temporary_pin),
      full_name: nameCheck.normalized,
      license_class: licClass,
      license_valid_until: parsedExpiry,
      is_license_expired: false,
      assigned_vehicle_plate: null,
      status: 'ACTIVE',
      must_change_pin: true,
      operator_id: operatorId
    };
    MOCK_DRIVERS_DB.push(driverAccount);

    const data = {
      driver: {
        ...driver,
        must_change_pin: true,
        license_expired: false
      },
      temporary_pin
    };

    return { success: true, data };
  }

  /** Test/review account, outside production only (the caller decides). */
  addTestDriver(operatorId = DEFAULT_OPERATOR_ID) {
    const res = this.addDriver({
      full_name: 'Tài xế thử nghiệm',
      phone: '0909998821',
      staff_id: 'TX8821',
      license_class: 'E',
      license_expiry: '2030-12-31'
    }, operatorId);
    if (!res.success) {
      return res;
    }
    const driverId = res.data?.driver?.driver_id;
    const acc = MOCK_DRIVERS_DB.find(d => d.driver_id === driverId);
    if (acc) {
      acc.pin = hashSecret('123456');
      acc.must_change_pin = false;
    }
    if (res.data?.driver) {
      res.data.driver.must_change_pin = false;
    }
    return { staff_id: 'TX8821', pin: '123456' };
  }

  updateDriver(driverId, updates = {}, operatorId = DEFAULT_OPERATOR_ID) {
    const driver = this.drivers.find(d => d.driver_id === driverId && (d.operator_id || DEFAULT_OPERATOR_ID) === operatorId);
    if (!driver) {
      return { success: false, error: 'Không tìm thấy tài xế', code: 'DRIVER_NOT_FOUND', status: 404 };
    }
    const acc = MOCK_DRIVERS_DB.find(a => a.driver_id === driverId && (a.operator_id || DEFAULT_OPERATOR_ID) === operatorId);

    const before = {
      driver_id: driver.driver_id,
      staff_id: driver.staff_id,
      full_name: driver.full_name,
      phone: driver.phone,
      license_class: driver.license_class,
      license_expiry: driver.license_expiry,
      status: driver.status,
      must_change_pin: acc ? Boolean(acc.must_change_pin) : false,
      license_expired: Boolean(driver.license_expiry && driver.license_expiry <= vnDate()),
      operator_id: driver.operator_id
    };

    let nameNormalized = null;
    if (updates.full_name !== undefined) {
      const nameCheck = validatePersonName(updates.full_name);
      if (!nameCheck.isValid) {
        return { success: false, error: nameCheck.message, code: 'VALIDATION_ERROR', status: 400 };
      }
      nameNormalized = nameCheck.normalized;
    }

    let phoneNormalized = null;
    if (updates.phone !== undefined) {
      const phoneCheck = validateVietnamPhone(updates.phone);
      if (!phoneCheck.isValid) {
        return { success: false, error: phoneCheck.message, code: 'VALIDATION_ERROR', status: 400 };
      }
      phoneNormalized = phoneCheck.normalized;
      const phoneExists = this.drivers.some(d => d.driver_id !== driverId && (d.operator_id || DEFAULT_OPERATOR_ID) === operatorId && d.phone === phoneNormalized) ||
        MOCK_DRIVERS_DB.some(d => d.driver_id !== driverId && (d.operator_id || DEFAULT_OPERATOR_ID) === operatorId && d.phone === phoneNormalized);
      if (phoneExists) {
        return { success: false, error: 'Số điện thoại đã tồn tại trong công ty', code: 'DRIVER_EXISTS', status: 409 };
      }
    }

    let licClass = null;
    if (updates.license_class !== undefined) {
      const ALLOWED_LICENSE_CLASSES = ['B2', 'C', 'D', 'E', 'FC'];
      licClass = String(updates.license_class || '').trim().toUpperCase();
      if (!ALLOWED_LICENSE_CLASSES.includes(licClass)) {
        return { success: false, error: 'Hạng bằng lái phải là một trong các hạng: B2, C, D, E, FC', code: 'VALIDATION_ERROR', status: 400 };
      }
    }

    let parsedExpiry = null;
    if (updates.license_expiry !== undefined) {
      parsedExpiry = parseServiceDate(updates.license_expiry);
      if (!parsedExpiry) {
        return { success: false, error: 'Ngày hết hạn bằng lái không hợp lệ (định dạng YYYY-MM-DD)', code: 'VALIDATION_ERROR', status: 400 };
      }
      const today = vnDate();
      if (parsedExpiry <= today) {
        return { success: false, error: 'Ngày hết hạn bằng lái phải sau ngày hôm nay', code: 'VALIDATION_ERROR', status: 400 };
      }
    }

    let newStatus = null;
    if (updates.status !== undefined) {
      const s = String(updates.status).trim().toUpperCase();
      if (s !== 'ACTIVE' && s !== 'LOCKED') {
        return { success: false, error: 'Trạng thái phải là ACTIVE hoặc LOCKED', code: 'VALIDATION_ERROR', status: 400 };
      }
      newStatus = s;
    }

    if (nameNormalized !== null) {
      driver.full_name = nameNormalized;
      if (acc) acc.full_name = nameNormalized;
    }
    if (phoneNormalized !== null) {
      driver.phone = phoneNormalized;
      if (acc) acc.phone = phoneNormalized;
    }
    if (licClass !== null) {
      driver.license_class = licClass;
      if (acc) acc.license_class = licClass;
    }
    if (parsedExpiry !== null) {
      driver.license_expiry = parsedExpiry;
      if (acc) {
        acc.license_valid_until = parsedExpiry;
        acc.is_license_expired = parsedExpiry <= vnDate();
      }
    }
    let lockChanged = null;
    if (newStatus !== null) {
      const oldStatus = driver.status;
      driver.status = newStatus;
      if (acc) acc.status = newStatus;
      if (oldStatus !== 'LOCKED' && newStatus === 'LOCKED') lockChanged = 'LOCK';
      else if (oldStatus === 'LOCKED' && newStatus === 'ACTIVE') lockChanged = 'UNLOCK';
    }

    const updated = {
      driver_id: driver.driver_id,
      staff_id: driver.staff_id,
      full_name: driver.full_name,
      phone: driver.phone,
      license_class: driver.license_class,
      license_expiry: driver.license_expiry,
      status: driver.status,
      must_change_pin: acc ? Boolean(acc.must_change_pin) : false,
      license_expired: Boolean(driver.license_expiry && driver.license_expiry <= vnDate()),
      operator_id: driver.operator_id
    };

    return {
      success: true,
      data: {
        driver: updated,
        before,
        lockChanged
      }
    };
  }

  resetDriverPin(driverId, operatorId = DEFAULT_OPERATOR_ID, { loginGuard } = {}) {
    const driver = this.drivers.find(d => d.driver_id === driverId && (d.operator_id || DEFAULT_OPERATOR_ID) === operatorId);
    const acc = MOCK_DRIVERS_DB.find(a => a.driver_id === driverId && (a.operator_id || DEFAULT_OPERATOR_ID) === operatorId);
    if (!driver && !acc) {
      return { success: false, error: 'Không tìm thấy tài xế', code: 'DRIVER_NOT_FOUND', status: 404 };
    }

    const temporary_pin = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    if (acc) {
      acc.pin = hashSecret(temporary_pin);
      acc.must_change_pin = true;
    }

    const staffId = acc?.staff_id || driver?.staff_id;
    const phone = acc?.phone || driver?.phone;
    if (loginGuard) {
      if (staffId) loginGuard.succeed(`${operatorId}:${staffId}`);
      if (phone) loginGuard.succeed(`${operatorId}:${phone}`);
    }

    return {
      success: true,
      data: {
        temporary_pin
      }
    };
  }

  /**
   * MGR-011: Routes
   */
  getRoutes(operatorId = DEFAULT_OPERATOR_ID) {
    return {
      success: true,
      data: this.routes.filter(r => r.operator_id === operatorId)
    };
  }

  addRoute({ name, distance_km, base_fare_vnd, stops_count = 4 }, operatorId = DEFAULT_OPERATOR_ID) {
    const newRoute = {
      route_id: `rt_${Date.now()}`,
      name,
      distance_km,
      base_fare_vnd,
      stops_count,
      operator_id: operatorId
    };
    this.routes.push(newRoute);
    return { success: true, data: newRoute };
  }

  /**
   * MGR-014: Dispatch Board Timeline
   */
  /**
   * MGR-014: the trips of a day (Vietnam time) for the office, every schedule's run of that day set up. Outside
   * production, the seed demo day's trips are listed with today's when no day is asked.
   */
  getDispatchBoard(shiftDate = null, operatorId = DEFAULT_OPERATOR_ID, { now = Date.now(), production = false } = {}) {
    this.releaseExpiredHotlineHolds();
    const day = shiftDate || vnDate(now);
    this.runsForDate?.(day, operatorId);
    const days = new Set([day]);
    if (!shiftDate && !production) days.add(DEMO_DATE);
    const trips = this.trips.filter(t => t.operator_id === operatorId && days.has(vnDate(Date.parse(t.departure_time))))
      .sort((a, b) => Date.parse(a.departure_time) - Date.parse(b.departure_time));
    return {
      success: true,
      data: {
        shift_date: day,
        total_trips: trips.length,
        trips: trips.map(t => {
          const route = this.routes.find(r => r.route_id === t.route_id);
          const vehicle = this.vehicles.find(v => v.vehicle_id === t.vehicle_id);
          return {
            ...t,
            route_name: route ? route.name : t.route_id,
            driver_name: this.drivers.find(d => d.driver_id === t.driver_id)?.full_name || 'Chưa gán',
            booked_seats: t.booked_seats || 0,
            held_seats: t.held_seats || 0,
            on_board_count: (t.boarded_passengers || 0) - (t.alighted_passengers || 0),
            load_factor_pct: parseFloat((((t.booked_seats || 0) / t.total_seats) * 100).toFixed(1))
          };
        })
      }
    };
  }

  /** A trip of the board; a schedule's run on another day is set up on first use (see runResolver). */
  findTrip(tripId) {
    return this.trips.find(t => t.trip_id === tripId) || this.runResolver?.(tripId) || undefined;
  }

  _resolveFareForSeats(tripId, trip, seatCodes = []) {
    const catalogTrip = this.eventBridge?.services?.searchService?.getTripDetail?.(tripId)?.data;
    const route = this.routes.find(r => r.route_id === (trip?.route_id || catalogTrip?.route_id));
    const routeFare = route ? route.base_fare_vnd : 220000;
    const catalogFare = (catalogTrip?.base_fare_vnd !== undefined && Number.isFinite(catalogTrip.base_fare_vnd))
      ? catalogTrip.base_fare_vnd
      : ((trip?.base_fare_vnd !== undefined && Number.isFinite(trip.base_fare_vnd)) ? trip.base_fare_vnd : routeFare);

    const inventory = this._inventory();
    const seatFares = {};
    let totalSeatsFare = 0;

    for (const code of seatCodes) {
      const seatInfo = inventory?.getSeatInfo?.(tripId, code);
      const price = (seatInfo && typeof seatInfo.price_vnd === 'number' && Number.isFinite(seatInfo.price_vnd))
        ? seatInfo.price_vnd
        : catalogFare;
      seatFares[code] = price;
      totalSeatsFare += price;
    }

    const farePerSeat = seatCodes.length > 0 ? seatFares[seatCodes[0]] : catalogFare;

    return {
      farePerSeat,
      unitPrice: farePerSeat,
      seatFares,
      totalSeatsFare
    };
  }

  /** Start and end (ms) of a trip, from the passenger catalog when it is there, else 3 h from departure. */
  _tripWindow(trip) {
    const start = Date.parse(trip.departure_time);
    const detail = this.eventBridge?.services?.searchService?.getTripDetail?.(trip.trip_id);
    const end = Date.parse(detail?.data?.arrival_time) || start + 3 * 3600000;
    return { start, end: Math.max(end, start) };
  }

  /**
   * MGR-017: the buses and drivers the office may give a trip, each with the reason it cannot when it cannot:
   * under maintenance, too few seats for what is sold, licence expired or invalid on the day, or already on a trip
   * that overlaps this one (30 min turnaround).
   */
  getAssignOptions(tripId, operatorId = DEFAULT_OPERATOR_ID) {
    const trip = this.findTrip(tripId);
    if (!trip || trip.operator_id !== operatorId) return { success: false, error: 'Không tìm thấy chuyến xe', code: 'TRIP_NOT_FOUND' };
    const TURNAROUND = 30 * 60000;
    const own = this._tripWindow(trip);
    const sold = (trip.booked_seats || 0) + (trip.held_seats || 0);
    const others = this.trips.filter(t => t.trip_id !== tripId && t.operator_id === operatorId && !['COMPLETED', 'CANCELLED'].includes(t.status));
    const clash = (field, id) => others.find(t => {
      if (t[field] !== id) return false;
      const w = this._tripWindow(t);
      return w.start < own.end + TURNAROUND && own.start < w.end + TURNAROUND;
    });
    const day = vnDate(own.start);
    const inventory = this._inventory();
    const occupiedCodes = inventory?.getOccupiedSeatCodes?.(tripId) || [];
    const vehicles = this.vehicles.filter(v => v.operator_id === operatorId).map(v => {
      const busy = clash('vehicle_id', v.vehicle_id);
      const vTemplate = this.layoutOfVehicle(v.vehicle_id);
      const templateSeatCodes = new Set(vTemplate?.seats?.map(s => s.seat_code) || []);
      const missing = occupiedCodes.filter(c => !templateSeatCodes.has(c));
      const seatCount = vTemplate?.seats?.length || 0;
      const reason = v.status === 'MAINTENANCE' ? 'Xe đang bảo dưỡng'
        : seatCount < sold ? `Xe ${seatCount} chỗ, chuyến đã bán ${sold} ghế`
          : missing.length > 0 ? `Xe thiếu ghế đã bán: ${missing.join(', ')}`
            : busy ? `Đang chạy chuyến ${busy.trip_id} trùng giờ` : null;
      return { vehicle_id: v.vehicle_id, plate_number: v.plate_number, model: v.model, total_seats: seatCount, capacity: seatCount + 1, assigned: v.vehicle_id === trip.vehicle_id, available: !reason, reason, conflict_trip_id: busy?.trip_id || null };
    });
    const drivers = this.drivers.filter(d => d.operator_id === operatorId).map(d => {
      const busy = clash('driver_id', d.driver_id);
      const reason = d.status === 'LOCKED' ? 'Tài xế đã bị khóa'
        : d.status === 'LICENSE_EXPIRED' || (d.license_expiry && d.license_expiry < day) ? 'Bằng lái hết hạn vào ngày chạy'
        : d.status === 'OFF_DUTY' || d.status === 'SUSPENDED' ? 'Tài xế không làm việc'
          : busy ? `Đang chạy chuyến ${busy.trip_id} trùng giờ` : null;
      return { driver_id: d.driver_id, staff_id: d.staff_id, full_name: d.full_name, license_class: d.license_class, license_expiry: d.license_expiry, max_capacity: LICENSE_MAX_CAPACITY[d.license_class] !== undefined ? LICENSE_MAX_CAPACITY[d.license_class] : null, assigned: d.driver_id === trip.driver_id, available: !reason, reason, conflict_trip_id: busy?.trip_id || null };
    });
    return { success: true, data: { trip_id: tripId, departure_time: trip.departure_time, status: trip.status, sold_seats: sold, vehicle_id: trip.vehicle_id || null, driver_id: trip.driver_id || null, vehicles, drivers } };
  }

  /**
   * MGR-017: gives a trip its bus and driver. A trip already under way cannot be changed. With scope SCHEDULE, the
   * pair also becomes the default of the schedule's future runs (not those already set up with another pair).
   */
  assignTrip(tripId, { vehicleId, driverId, scope = 'TRIP' } = {}, operatorId = DEFAULT_OPERATOR_ID) {
    const options = this.getAssignOptions(tripId, operatorId);
    if (!options.success) return options;
    const trip = this.findTrip(tripId);
    if (['IN_TRANSIT', 'COMPLETED', 'CANCELLED'].includes(trip.status)) {
      return { success: false, error: 'Chuyến đã chạy hoặc đã kết thúc, không đổi được xe và tài xế', code: 'TRIP_ALREADY_RUNNING' };
    }
    if (!['TRIP', 'SCHEDULE'].includes(scope)) return { success: false, error: 'Phạm vi phải là TRIP hoặc SCHEDULE', code: 'VALIDATION_ERROR' };
    const vehicle = options.data.vehicles.find(v => v.vehicle_id === vehicleId);
    const driver = options.data.drivers.find(d => d.driver_id === driverId);
    if (!vehicle) return { success: false, error: 'Không tìm thấy xe', code: 'VEHICLE_NOT_FOUND' };
    if (!driver) return { success: false, error: 'Không tìm thấy tài xế', code: 'DRIVER_NOT_FOUND' };

    const inventory = this._inventory();
    const occupiedCodes = inventory?.getOccupiedSeatCodes?.(tripId) || [];
    const chosenTemplate = this.layoutOfVehicle(vehicleId);
    if (chosenTemplate && occupiedCodes.length > 0) {
      const templateCodes = new Set(chosenTemplate.seats.map(s => s.seat_code));
      const missing = occupiedCodes.filter(c => !templateCodes.has(c));
      if (missing.length > 0) {
        return {
          success: false,
          code: 'LAYOUT_MISSING_SOLD_SEATS',
          error: `Xe mới thiếu ghế đã bán: ${missing.join(', ')}`
        };
      }
    }

    if (!vehicle.available && !vehicle.assigned) return { success: false, error: vehicle.reason, code: 'VEHICLE_UNAVAILABLE', conflict_trip_id: vehicle.conflict_trip_id };
    if (!driver.available && !driver.assigned) return { success: false, error: driver.reason, code: 'DRIVER_UNAVAILABLE', conflict_trip_id: driver.conflict_trip_id };

    // D151: Licence validity and capacity check
    const own = this._tripWindow(trip);
    const day = vnDate(own.start);
    const fullDriver = this.drivers.find(d => d.driver_id === driverId) || driver;
    if (fullDriver.status === 'LICENSE_EXPIRED' || (fullDriver.license_expiry && fullDriver.license_expiry < day)) {
      return { success: false, error: 'Bằng lái hết hạn vào ngày chạy', code: 'DRIVER_UNAVAILABLE' };
    }

    const vTemplate = this.layoutOfVehicle(vehicle.vehicle_id);
    const passengerSeats = vTemplate?.seats?.length || vehicle.total_seats || 0;
    const capacity = passengerSeats + 1;
    const licReason = driverLicenseCapacityReason(fullDriver.license_class, capacity, vehicle.plate_number);
    if (licReason) {
      return {
        success: false,
        error: licReason,
        code: 'DRIVER_LICENSE_INVALID'
      };
    }

    const previous = { vehicle_id: trip.vehicle_id || null, vehicle_plate: trip.vehicle_plate || null, driver_id: trip.driver_id || null };
    trip.vehicle_id = vehicle.vehicle_id;
    trip.vehicle_plate = vehicle.plate_number;
    const layout = this.layoutOfVehicle(vehicle.vehicle_id);
    trip.total_seats = layout?.seats?.length || vehicle.total_seats;
    trip.driver_id = driver.driver_id;
    if (scope === 'SCHEDULE') {
      if (!this.scheduleAssignments) this.scheduleAssignments = {};
      this.scheduleAssignments[trip.schedule_id || trip.trip_id] = { vehicle_id: vehicle.vehicle_id, driver_id: driver.driver_id };
    }
    this.eventBridge?.emit?.('TRIP_ASSIGNED', {
      tripId,
      vehiclePlate: vehicle.plate_number,
      vehicleModel: vehicle.model,
      capacity: trip.total_seats,
      driverId: driver.driver_id,
      driverName: driver.full_name,
      previous
    });
    return { success: true, data: { trip_id: tripId, vehicle_id: vehicle.vehicle_id, vehicle_plate: vehicle.plate_number, driver_id: driver.driver_id, driver_name: driver.full_name, scope, previous } };
  }

  /** The plate a schedule's runs get by default (the office's default for the schedule, else the seed trip's). */
  defaultPlateFor(scheduleId) {
    const preset = this.scheduleAssignments?.[scheduleId];
    if (preset) return this.vehicles.find(v => v.vehicle_id === preset.vehicle_id)?.plate_number || null;
    return this.trips.find(t => t.trip_id === scheduleId)?.vehicle_plate || null;
  }

  /**
   * The ops record of a schedule's run: the schedule's bus and driver (the office's default for the schedule
   * first, else the seed trip's), nothing sold yet.
   */
  createRunTrip(templateId, runTripId, trip) {
    const existing = this.trips.find(t => t.trip_id === runTripId);
    if (existing) return existing;
    const template = this.trips.find(t => t.trip_id === templateId);
    const preset = this.scheduleAssignments?.[templateId];
    const presetVehicle = preset ? this.vehicles.find(v => v.vehicle_id === preset.vehicle_id) : null;
    const run = {
      trip_id: runTripId,
      schedule_id: templateId,
      driver_id: preset?.driver_id || template?.driver_id || null,
      route_id: trip.route_id || template?.route_id || null,
      vehicle_id: preset?.vehicle_id || template?.vehicle_id || null,
      // No bus yet means no plate: the catalog's sample plate is not a bus the office gave.
      vehicle_plate: presetVehicle?.plate_number || template?.vehicle_plate || null,
      departure_time: trip.departure_time,
      status: 'SCHEDULED',
      booked_seats: 0,
      held_seats: 0,
      total_seats: trip.total_seats || template?.total_seats || 22,
      delay_minutes: 0,
      operator_id: trip.operator_id
    };
    this.trips.push(run);
    return run;
  }

  /**
   * The seat inventory shared with online sales (bound by the event bridge), or null when running stand-alone.
   */
  _inventory() {
    return this.eventBridge?.services?.seatMapService || null;
  }

  /**
   * MGR-013: seat inventory of a trip, seat by seat. The legacy counters stay for the dashboard.
   */
  getSeatMatrix(tripId, mockNow = Date.now(), operatorId = DEFAULT_OPERATOR_ID) {
    this.releaseExpiredHotlineHolds(mockNow);
    const trip = this.findTrip(tripId);
    if (!trip || trip.operator_id !== operatorId) return { success: false, error: 'Không tìm thấy chuyến xe', code: 'TRIP_NOT_FOUND' };

    const matrix = this._inventory()?.getSeatMatrix(tripId, mockNow);
    const seats = matrix?.success ? matrix.data.seats : [];
    return {
      success: true,
      data: {
        trip_id: tripId,
        total_seats: trip.total_seats,
        booked_seats: trip.booked_seats || 0,
        held_seats: trip.held_seats || 0,
        vacant_seats: trip.total_seats - (trip.booked_seats || 0) - (trip.held_seats || 0),
        hotline_holds: this.hotlineReservations.filter(r => r.trip_id === tripId && r.hold_status === 'HELD_HOTLINE'),
        summary: matrix?.success ? matrix.data.summary : null,
        seats
      }
    };
  }

  /**
   * MGR-013 / BR-INVENTORY-001: block seats for a technical reason or open them again.
   */
  setSeatLock(tripId, { seatCodes, locked, reason, staffId }, mockNow = Date.now(), operatorId = DEFAULT_OPERATOR_ID) {
    this.releaseExpiredHotlineHolds(mockNow);
    const trip = this.findTrip(tripId);
    if (!trip || trip.operator_id !== operatorId) return { success: false, error: 'Không tìm thấy chuyến xe', code: 'TRIP_NOT_FOUND' };
    const inventory = this._inventory();
    if (!inventory) return { success: false, error: 'Kho ghế chưa sẵn sàng', code: 'INVENTORY_UNAVAILABLE' };
    return inventory.setSeatBlock(tripId, seatCodes, locked, { reason, staffId, mockNow });
  }

  /**
   * MGR-019 / MGR-020: Counter POS ticket issuance.
   * Seats are checked against the same inventory as online sales; a hotline caller collects the seats
   * that were locked for them by passing the reservation id.
   */
  createPosBooking({
    tripId,
    passengerName,
    phone,
    seatCodes,
    paymentMethod = 'CASH_POS',
    agentStaffId = 'stf_pos_01',
    reservationId = null,
    pickupStopId = null,
    dropoffStopId = null,
    homePickup = null,
    homeFeeVnd = 0,
    mockNow = Date.now(),
    operatorId = DEFAULT_OPERATOR_ID
  }) {
    this.releaseExpiredHotlineHolds(mockNow);

    const trip = this.findTrip(tripId);
    if (!trip || trip.operator_id !== operatorId) return { success: false, error: 'Chuyến xe không tồn tại', code: 'TRIP_NOT_FOUND' };
    // A cancelled departure sells nothing, not even at the counter (D131); a closed online sale still does.
    if (trip.status === 'CANCELLED') return { success: false, error: 'Chuyến đã hủy', code: 'TRIP_CANCELLED' };
    if (!Array.isArray(seatCodes) || seatCodes.length === 0) {
      return { success: false, error: 'Vui lòng chọn ít nhất 1 ghế', code: 'NO_SEAT_SELECTED' };
    }
    const nameCheck = validatePersonName(passengerName);
    if (!nameCheck.isValid) {
      return { success: false, error: nameCheck.message, code: 'VALIDATION_ERROR' };
    }
    if (homePickup && !phone) {
      return { success: false, error: 'Đón tận nhà cần số điện thoại để báo khách khi xe tới', code: 'INVALID_PHONE' };
    }
    if (phone && !validateVietnamPhone(phone).isValid) {
      return { success: false, error: 'Số điện thoại không hợp lệ', code: 'INVALID_PHONE' };
    }
    if (!POS_PAYMENT_METHODS.includes(paymentMethod)) {
      return { success: false, error: 'Hình thức thanh toán không hợp lệ', code: 'INVALID_PAYMENT_METHOD' };
    }

    let reservation = null;
    if (reservationId) {
      reservation = this.hotlineReservations.find(r => r.reservation_id === reservationId && r.trip_id === tripId && r.hold_status === 'HELD_HOTLINE');
      if (!reservation) {
        return { success: false, error: 'Không tìm thấy lệnh giữ chỗ còn hiệu lực', code: 'RESERVATION_NOT_FOUND' };
      }
      const sameSeats = reservation.seat_codes.length === seatCodes.length && seatCodes.every(code => reservation.seat_codes.includes(code));
      if (!sameSeats) {
        return { success: false, error: 'Ghế xuất vé không khớp với lệnh giữ chỗ', code: 'RESERVATION_MISMATCH' };
      }
    }

    const inventory = this._inventory();
    const owner = reservation ? `hotline:${reservation.reservation_id}` : null;
    // A sale from a reservation covers the segment that was held (BR-SEAT-001)
    let segment = { pickupStopId, dropoffStopId };
    if (reservation) segment = { pickupStopId: reservation.pickup_stop_id, dropoffStopId: reservation.dropoff_stop_id };
    let resolvedSegment = { pickup_stop_id: null, dropoff_stop_id: null };
    if (inventory) {
      const check = inventory.checkSellable(tripId, seatCodes, mockNow, owner, segment);
      if (!check.success) return check;
      resolvedSegment = check.data;
    } else if (!reservation && trip.booked_seats + seatCodes.length > trip.total_seats) {
      return { success: false, error: 'Chuyến xe đã hết chỗ', code: 'TRIP_FULL' };
    }

    const { totalSeatsFare, unitPrice } = this._resolveFareForSeats(tripId, trip, seatCodes);
    const totalFare = totalSeatsFare + (homePickup ? homeFeeVnd : 0);

    const pnr = `BG-POS${Math.floor(1000 + Math.random() * 9000)}`;

    const newBooking = {
      pnr,
      trip_id: tripId,
      passenger_name: nameCheck.normalized,
      phone,
      seat_codes: seatCodes,
      total_fare_vnd: totalFare,
      payment_method: paymentMethod,
      payment_status: 'PAID',
      agent_staff_id: agentStaffId,
      pickup_stop_id: resolvedSegment.pickup_stop_id,
      dropoff_stop_id: resolvedSegment.dropoff_stop_id,
      issued_at: new Date(mockNow).toISOString(),
      channel: 'POS_HOTLINE',
      // D144: the address the passenger gave on the phone; the office confirmed it by taking it.
      home_pickup: homePickup || reservation?.home_pickup || null,
      home_fee_vnd: homePickup ? homeFeeVnd : (reservation?.home_fee_vnd || 0),
      operator_id: operatorId
    };

    this.bookings.push(newBooking);
    if (reservation) {
      // The seats were counted when they were held
      inventory?.unlockSeats(tripId, reservation.seat_codes, owner);
      reservation.hold_status = 'CONVERTED';
      reservation.converted_at = new Date(mockNow).toISOString();
      reservation.pnr = pnr;
      trip.held_seats = Math.max(0, (trip.held_seats || 0) - reservation.seat_codes.length);
      trip.booked_seats = (trip.booked_seats || 0) + reservation.seat_codes.length;
    } else {
      trip.booked_seats = (trip.booked_seats || 0) + seatCodes.length;
    }

    if (this.eventBridge && typeof this.eventBridge.emit === 'function') {
      this.eventBridge.emit('POS_BOOKING_CREATED', { booking: newBooking, seatCodes });
    }

    return {
      success: true,
      message: `Xuất vé POS thành công cho khách ${nameCheck.normalized} (${seatCodes.join(', ')})`,
      data: newBooking
    };
  }

  /**
   * MGR-020 / REV-06: Hotline telephone seat hold.
   * The seats are locked in the shared inventory until `hold_until`, so online and counter sales cannot
   * take them, and the lock lapses by itself when the hold expires.
   */
  createHotlineHold({
    tripId,
    passengerName,
    phone,
    seatCodes,
    holdPolicy = 'UNTIL_DEPARTURE_OFFSET',
    departureOffsetMinutes = 30,
    customExpiryMinutes = 60,
    notes = '',
    agentStaffId = 'stf_hotline_01',
    pickupStopId = null,
    dropoffStopId = null,
    homePickup = null,
    homeFeeVnd = 0,
    mockNow = Date.now(),
    operatorId = DEFAULT_OPERATOR_ID
  }) {
    this.releaseExpiredHotlineHolds(mockNow);

    const trip = this.findTrip(tripId);
    if (!trip || trip.operator_id !== operatorId) return { success: false, error: 'Chuyến xe không tồn tại', code: 'TRIP_NOT_FOUND' };
    // A cancelled departure sells nothing, not even at the counter (D131); a closed online sale still does.
    if (trip.status === 'CANCELLED') return { success: false, error: 'Chuyến đã hủy', code: 'TRIP_CANCELLED' };
    if (!Array.isArray(seatCodes) || seatCodes.length === 0) {
      return { success: false, error: 'Vui lòng chọn ít nhất 1 ghế', code: 'NO_SEAT_SELECTED' };
    }
    const nameCheck = validatePersonName(passengerName);
    if (!nameCheck.isValid) {
      return { success: false, error: nameCheck.message, code: 'VALIDATION_ERROR' };
    }
    if (!validateVietnamPhone(phone).isValid) {
      return { success: false, error: 'Số điện thoại khách không hợp lệ', code: 'INVALID_PHONE' };
    }
    if (!HOLD_POLICIES.includes(holdPolicy)) {
      return { success: false, error: 'Chế độ giữ chỗ không hợp lệ', code: 'INVALID_HOLD_POLICY' };
    }
    const offsetOk = Number.isFinite(Number(departureOffsetMinutes)) && Number(departureOffsetMinutes) >= 0;
    const customOk = Number.isFinite(Number(customExpiryMinutes)) && Number(customExpiryMinutes) >= 1;
    if ((holdPolicy === 'UNTIL_DEPARTURE_OFFSET' && !offsetOk) || (holdPolicy === 'CUSTOM_EXPIRY_MINUTES' && !customOk)) {
      return { success: false, error: 'Thời hạn giữ chỗ không hợp lệ', code: 'INVALID_HOLD_DURATION' };
    }

    const inventory = this._inventory();
    let resolvedSegment = { pickup_stop_id: null, dropoff_stop_id: null };
    if (inventory) {
      const check = inventory.checkSellable(tripId, seatCodes, mockNow, null, { pickupStopId, dropoffStopId });
      if (!check.success) return check;
      resolvedSegment = check.data;
    } else if (trip.booked_seats + seatCodes.length > trip.total_seats) {
      return { success: false, error: 'Chuyến xe đã hết chỗ', code: 'TRIP_FULL' };
    }

    // BR-POS-006: a caller without a deposit cannot tie up more than 4 seats (expired holds were released above)
    const callerPhone = validateVietnamPhone(phone).normalized;
    const alreadyHeld = this.hotlineReservations
      .filter(r => r.hold_status === 'HELD_HOTLINE' && validateVietnamPhone(r.phone).normalized === callerPhone)
      .reduce((sum, r) => sum + r.seat_codes.length, 0);
    if (alreadyHeld + seatCodes.length > HOTLINE_MAX_SEATS_PER_PHONE) {
      return {
        success: false,
        error: `Mỗi số điện thoại chỉ được giữ tối đa ${HOTLINE_MAX_SEATS_PER_PHONE} ghế cùng lúc (đang giữ ${alreadyHeld})`,
        code: 'HOTLINE_LIMIT_EXCEEDED',
        held_seats: alreadyHeld
      };
    }

    let holdUntilMs;
    if (homePickup) {
      // D144: a home pickup is collected before departure, so its seats are held until the bus leaves.
      holdUntilMs = Math.max(new Date(trip.departure_time).getTime(), mockNow + 15 * 60 * 1000);
    } else if (holdPolicy === 'UNTIL_DEPARTURE_OFFSET') {
      const departureTimeMs = new Date(trip.departure_time).getTime();
      holdUntilMs = departureTimeMs - (Number(departureOffsetMinutes) * 60 * 1000);
      // If departure is very close or in the past relative to mockNow, fallback to 15m hold
      if (holdUntilMs <= mockNow) {
        holdUntilMs = mockNow + (15 * 60 * 1000);
      }
    } else {
      holdUntilMs = mockNow + (Number(customExpiryMinutes) * 60 * 1000);
    }

    const holdUntil = new Date(holdUntilMs).toISOString();
    const reservationId = `rsv_pos_${Date.now()}_${Math.floor(100 + Math.random() * 900)}`;

    const { farePerSeat, totalSeatsFare, seatFares } = this._resolveFareForSeats(tripId, trip, seatCodes);
    const totalFare = totalSeatsFare + (homePickup ? homeFeeVnd : 0);

    const reservation = {
      reservation_id: reservationId,
      pnr: `BG-RSV-${Math.floor(100 + Math.random() * 900)}`,
      trip_id: tripId,
      passenger_name: nameCheck.normalized,
      phone,
      seat_codes: seatCodes,
      hold_policy: holdPolicy,
      pickup_stop_id: resolvedSegment.pickup_stop_id,
      dropoff_stop_id: resolvedSegment.dropoff_stop_id,
      departure_offset_minutes: Number(departureOffsetMinutes),
      hold_status: 'HELD_HOTLINE',
      hold_until: holdUntil,
      created_at: new Date(mockNow).toISOString(),
      created_by: agentStaffId,
      notes,
      home_pickup: homePickup || null,
      home_fee_vnd: homePickup ? homeFeeVnd : 0,
      total_fare_vnd: totalFare,
      fare_per_seat_vnd: farePerSeat,
      seat_fares: seatFares,
      // The SMS link to follow the bus and answer "ready" (D144).
      share_token: createShareToken(),
      operator_id: operatorId
    };

    inventory?.lockSeats(tripId, seatCodes, `hotline:${reservationId}`, holdUntilMs, { pickupStopId, dropoffStopId });
    this.hotlineReservations.push(reservation);
    trip.held_seats = (trip.held_seats || 0) + seatCodes.length;

    if (this.eventBridge && typeof this.eventBridge.emit === 'function') {
      this.eventBridge.emit('HOTLINE_HOLD_CREATED', {
        tripId,
        reservation,
        farePerSeat,
        operator: operatorId
      });
    }

    return {
      success: true,
      message: `Giữ chỗ hotline thành công cho khách ${passengerName} (Hạn giữ đến: ${holdUntil})`,
      data: reservation
    };
  }

  /**
   * Release hotline holds whose time is up (REV-06). Called before any read or sale, so no timer is needed.
   */
  releaseExpiredHotlineHolds(mockNow = Date.now()) {
    const releasedList = [];

    for (const rsv of this.hotlineReservations) {
      if (rsv.hold_status === 'HELD_HOTLINE') {
        const trip = this.findTrip(rsv.trip_id);
        let shouldRelease = false;
        let releaseStatus = 'EXPIRED_RELEASED';

        let driverTrip = this.eventBridge?.services?.driverService?.activeTrips?.get(rsv.trip_id);
        if (!driverTrip && this.driverService?.activeTrips) {
          driverTrip = this.driverService.activeTrips.get(rsv.trip_id);
        }

        if (trip && trip.status === 'IN_TRANSIT') {
          if (driverTrip) {
            const pickupIndex = driverTrip.stops.findIndex(s => s.stop_id === rsv.pickup_stop_id);
            if (pickupIndex !== -1 && (driverTrip.current_stop_index > pickupIndex || driverTrip.stops[pickupIndex]?.departed_at)) {
              shouldRelease = true;
              releaseStatus = 'NO_SHOW_RELEASED';
            }
          }
        } else if (mockNow > new Date(rsv.hold_until).getTime()) {
          shouldRelease = true;
          releaseStatus = 'EXPIRED_RELEASED';
        }

        if (shouldRelease) {
          rsv.hold_status = releaseStatus;
          rsv.released_at = new Date(mockNow).toISOString();
          this._inventory()?.unlockSeats(rsv.trip_id, rsv.seat_codes, `hotline:${rsv.reservation_id}`);

          if (trip) {
            trip.held_seats = Math.max(0, (trip.held_seats || 0) - rsv.seat_codes.length);
          }

          const seatStr = rsv.seat_codes.join(', ');
          const driverSvc = this.eventBridge?.services?.driverService || this.driverService;
          const stop = (trip?.stops || driverTrip?.stops || []).find(s => s.stop_id === rsv.pickup_stop_id);
          const stopName = stop?.name || rsv.pickup_stop || (rsv.pickup_stop_id ? `Trạm ${rsv.pickup_stop_id}` : 'điểm đón');
          const readable = releaseStatus === 'NO_SHOW_RELEASED'
            ? `Nhả ghế ${seatStr} giữ qua tổng đài (khách không lên xe tại ${stopName})`
            : `Nhả ghế ${seatStr} giữ qua tổng đài (hết hạn giữ chỗ)`;

          const eventData = {
            reservation_id: rsv.reservation_id,
            seat_code: seatStr,
            stop_id: rsv.pickup_stop_id || null,
            stop_name: stopName,
            status: releaseStatus,
            message: readable,
            description: readable,
            actor: 'system'
          };

          if (driverSvc && typeof driverSvc._event === 'function') {
            if (driverTrip) {
              driverSvc._event(driverTrip, 'HOTLINE_HOLD_RELEASED', eventData, mockNow);
            }
            if (trip && trip !== driverTrip) {
              driverSvc._event(trip, 'HOTLINE_HOLD_RELEASED', eventData, mockNow);
            }
          } else {
            const eventEntry = {
              type: 'HOTLINE_HOLD_RELEASED',
              trip_id: rsv.trip_id,
              at: new Date(mockNow).toISOString(),
              ...eventData
            };
            if (driverTrip) {
              if (!driverTrip.events) driverTrip.events = [];
              driverTrip.events.push(eventEntry);
            }
            if (trip && trip !== driverTrip) {
              if (!trip.events) trip.events = [];
              trip.events.push(eventEntry);
            }
          }

          this.recordAudit({
            actor: 'system',
            role: 'SYSTEM',
            action: releaseStatus === 'NO_SHOW_RELEASED' ? 'HOTLINE_HOLD_NO_SHOW_RELEASED' : 'HOTLINE_HOLD_EXPIRED_RELEASED',
            resource: `hotline:${rsv.reservation_id}`,
            before: { hold_status: 'HELD_HOTLINE' },
            after: { hold_status: releaseStatus, released_at: rsv.released_at, message: readable, seat_codes: rsv.seat_codes },
            operator_id: rsv.operator_id || DEFAULT_OPERATOR_ID,
            now: mockNow
          });

          if (this.eventBridge && typeof this.eventBridge.emit === 'function') {
            this.eventBridge.emit('HOTLINE_HOLD_RELEASED', { tripId: rsv.trip_id, reservationId: rsv.reservation_id, releaseStatus, readable });
          }

          releasedList.push(rsv);
        }
      }
    }

    return {
      success: true,
      released_count: releasedList.length,
      data: releasedList
    };
  }

  /**
   * Cancel a hotline hold explicitly
   */
  cancelHotlineHold(reservationId, reason = 'Khách hủy yêu cầu qua điện thoại', mockNow = Date.now()) {
    const rsv = this.hotlineReservations.find(r => r.reservation_id === reservationId);
    if (!rsv) return { success: false, error: 'Không tìm thấy thông tin giữ chỗ', code: 'RESERVATION_NOT_FOUND' };

    if (rsv.hold_status === 'HELD_HOTLINE') {
      rsv.hold_status = 'CANCELLED_BY_STAFF';
      rsv.cancel_reason = reason;
      rsv.cancelled_at = new Date(mockNow).toISOString();
      this._inventory()?.unlockSeats(rsv.trip_id, rsv.seat_codes, `hotline:${rsv.reservation_id}`);

      const trip = this.findTrip(rsv.trip_id);
      if (trip) {
        trip.held_seats = Math.max(0, (trip.held_seats || 0) - rsv.seat_codes.length);
      }

      if (this.eventBridge && typeof this.eventBridge.emit === 'function') {
        this.eventBridge.emit('HOTLINE_HOLD_RELEASED', { tripId: rsv.trip_id, reservationId: rsv.reservation_id });
      }
    }

    return { success: true, data: rsv };
  }

  /**
   * MGR-023: Emergency Vehicle Replacement Wizard (OQ-005)
   * The replacement must be a real vehicle that is free and has at least as many seats as are booked,
   * so every passenger keeps the same seat code. Nothing changes unless every check passes.
   */
  replaceTripVehicle(tripId, newVehicleIdOrPlate, reason = 'Sự cố hỏng hóc kỹ thuật động cơ', newDriverId = null, operatorId = DEFAULT_OPERATOR_ID) {
    const trip = this.findTrip(tripId);
    if (!trip || trip.operator_id !== operatorId) return { success: false, error: 'Chuyến xe không tồn tại', code: 'TRIP_NOT_FOUND' };

    const targetVehicle = this.vehicles.find(v => (v.vehicle_id === newVehicleIdOrPlate || v.plate_number === newVehicleIdOrPlate) && v.operator_id === operatorId);
    if (!targetVehicle) {
      return { success: false, error: 'Không tìm thấy xe thay thế trong đội xe', code: 'VEHICLE_NOT_FOUND' };
    }
    if (targetVehicle.status !== 'STANDBY') {
      return { success: false, error: `Xe ${targetVehicle.plate_number} đang ở trạng thái ${targetVehicle.status}, không thể điều thay thế`, code: 'VEHICLE_UNAVAILABLE' };
    }
    if (targetVehicle.total_seats < trip.booked_seats) {
      return {
        success: false,
        error: `Xe thay thế chỉ có ${targetVehicle.total_seats} chỗ, chuyến đã bán ${trip.booked_seats} chỗ`,
        code: 'CAPACITY_INSUFFICIENT'
      };
    }
    const newDriver = newDriverId ? this.drivers.find(d => d.driver_id === newDriverId && d.operator_id === operatorId) : null;
    if (newDriverId && !newDriver) {
      return { success: false, error: 'Không tìm thấy tài xế thay thế', code: 'DRIVER_NOT_FOUND' };
    }
    // DRI-001 refuses a driver whose licence has expired; a replacement must be someone who can sign in
    if (newDriver && (newDriver.status === 'LOCKED' || (newDriver.status !== 'ON_DUTY' && newDriver.status !== 'ACTIVE') || new Date(`${newDriver.license_expiry}T23:59:59+07:00`).getTime() < Date.now())) {
      return { success: false, error: `Tài xế ${newDriver.full_name} không đủ điều kiện nhận chuyến (giấy phép lái xe hoặc trạng thái ca)`, code: 'DRIVER_UNAVAILABLE' };
    }

    const oldPlate = trip.vehicle_plate;
    const oldVehicle = this.vehicles.find(v => v.vehicle_id === trip.vehicle_id);
    if (oldVehicle && oldVehicle.vehicle_id !== targetVehicle.vehicle_id) {
      oldVehicle.status = 'MAINTENANCE';
    }
    targetVehicle.status = trip.status === 'IN_TRANSIT' ? 'IN_TRANSIT' : 'ASSIGNED';
    if (newDriver) {
      trip.driver_id = newDriver.driver_id;
      targetVehicle.driver_name = newDriver.full_name;
    }
    trip.vehicle_id = targetVehicle.vehicle_id;
    trip.vehicle_plate = targetVehicle.plate_number;
    trip.emergency_swap = {
      old_vehicle_plate: oldPlate,
      new_vehicle_plate: targetVehicle.plate_number,
      reason,
      swapped_at: new Date().toISOString()
    };

    this.alerts.unshift({
      alert_id: `alt_swap_${Date.now()}`,
      vehicle_plate: targetVehicle.plate_number,
      type: 'EMERGENCY_VEHICLE_SWAP',
      severity: 'RED',
      message: `Chuyến ${tripId}: Đã thay xe từ ${oldPlate} sang ${targetVehicle.plate_number} do "${reason}". Hành khách giữ nguyên mã ghế và đã được gửi thông báo.`,
      created_at: new Date().toISOString(),
      operator_id: operatorId
    });

    if (this.eventBridge && typeof this.eventBridge.emit === 'function') {
      this.eventBridge.emit('VEHICLE_SWAPPED', {
        tripId,
        oldPlate,
        newPlate: targetVehicle.plate_number,
        newDriverId: newDriver ? newDriver.driver_id : null,
        reason
      });
    }

    return {
      success: true,
      message: `Đã thực thi đổi xe thành công từ ${oldPlate} sang ${targetVehicle.plate_number}`,
      data: {
        trip_id: tripId,
        old_vehicle_plate: oldPlate,
        new_vehicle_plate: targetVehicle.plate_number,
        auto_reallocated_passengers: trip.booked_seats,
        swapped_at: trip.emergency_swap.swapped_at
      }
    };
  }

  executeEmergencyVehicleSwap(tripId, { newVehiclePlate, newDriverId, reason, operatorId = DEFAULT_OPERATOR_ID }) {
    return this.replaceTripVehicle(tripId, newVehiclePlate, reason, newDriverId, operatorId);
  }

  /**
   * MGR-024: Trip Delay & Disruption Management
   */
  broadcastTripDelay(tripId, delayMinutes, reason = 'Kẹt xe đường bộ', operatorId = DEFAULT_OPERATOR_ID) {
    const trip = this.findTrip(tripId);
    if (!trip || trip.operator_id !== operatorId) return { success: false, error: 'Chuyến xe không tồn tại', code: 'TRIP_NOT_FOUND' };

    trip.delay_minutes = delayMinutes;
    const msg = `Chuyến ${tripId} chậm ${delayMinutes} phút do ${reason}`;

    this.alerts.unshift({
      alert_id: `alt_delay_${Date.now()}`,
      vehicle_plate: trip.vehicle_plate,
      type: 'TRIP_DELAY',
      severity: 'AMBER',
      message: msg,
      created_at: new Date().toISOString()
    });

    if (this.eventBridge && typeof this.eventBridge.emit === 'function') {
      this.eventBridge.emit('TRIP_DELAYED', {
        tripId,
        delayMinutes,
        reason
      });
    }

    return {
      success: true,
      message: msg,
      data: {
        trip_id: tripId,
        delay_minutes: delayMinutes,
        affected_passengers: trip.booked_seats
      }
    };
  }

  /**
   * MGR-022: A refund request opened by a cancellation (PAX-021) or an overdue payment (OQ-008).
   */
  createRefundRequest({ pnr, ticket_id = null, trip_id = null, amount_vnd, reason, source = 'PASSENGER_CANCEL', policy = null, operator_id = DEFAULT_OPERATOR_ID }) {
    const request = {
      refund_id: `ref_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`,
      pnr,
      ticket_id,
      trip_id,
      amount_vnd,
      reason,
      source,
      policy,
      status: 'REFUND_REQUESTED',
      requested_at: new Date().toISOString(),
      operator_id
    };
    this.refundRequests.push(request);
    return request;
  }

  /**
   * MGR-022: Approve or reject an open refund request, exactly once.
   */
  processRefundApproval(refundId, approved, notes = '', operatorId = DEFAULT_OPERATOR_ID) {
    const request = this.refundRequests.find(r => r.refund_id === refundId && (!operatorId || r.operator_id === operatorId));
    if (!request) {
      return { success: false, error: 'Không tìm thấy yêu cầu hoàn tiền', code: 'REFUND_NOT_FOUND' };
    }
    if (request.status !== 'REFUND_REQUESTED') {
      return { success: false, error: `Yêu cầu hoàn tiền đã được xử lý (${request.status})`, code: 'REFUND_ALREADY_PROCESSED' };
    }

    request.status = approved ? 'REFUNDED' : 'REFUND_REJECTED';
    request.notes = notes;
    request.processed_at = new Date().toISOString();

    if (approved) {
      const booking = this.bookings.find(b => b.pnr === request.pnr);
      if (booking) {
        booking.refund_status = 'REFUNDED';
        booking.refund_amount_vnd = (booking.refund_amount_vnd || 0) + request.amount_vnd;
      }
    }

    return {
      success: true,
      message: approved ? `Đã duyệt hoàn ${request.amount_vnd} đ cho yêu cầu ${refundId}` : `Đã từ chối yêu cầu hoàn tiền ${refundId}`,
      data: request
    };
  }

  /**
   * MGR-027: Executive report for a period (inclusive dates, YYYY-MM-DD). Without a period, everything.
   */
  getExecutiveReport({ startDate, endDate } = {}, operatorId = DEFAULT_OPERATOR_ID) {
    const round1 = (n) => parseFloat(n.toFixed(1));
    const inPeriod = (booking) => {
      const day = String(booking.issued_at || '').slice(0, 10);
      return (!startDate || day >= startDate) && (!endDate || day <= endDate);
    };
    const trips = this.trips.filter(t => t.operator_id === operatorId);
    const bookings = this.bookings.filter(b => trips.some(t => t.trip_id === b.trip_id) && inPeriod(b));
    const money = this._moneyFigures(bookings);
    const share = (channels) => money.gross_revenue_vnd > 0
      ? round1((bookings.filter(b => channels.includes(b.channel)).reduce((sum, b) => sum + bookingRevenue(b), 0) / money.gross_revenue_vnd) * 100)
      : 0;

    const delays = trips.map(t => t.delay_minutes || 0);
    const onTimeTrips = delays.filter(d => d <= 15).length;

    return {
      success: true,
      data: {
        period: { start_date: startDate || null, end_date: endDate || null },
        financial_summary: {
          total_revenue_vnd: money.gross_revenue_vnd,
          refunded_vnd: money.refunded_vnd,
          net_revenue_vnd: money.net_revenue_vnd,
          total_tickets_sold: bookings.reduce((sum, b) => sum + b.seat_codes.length, 0),
          pos_share_pct: share(['POS_HOTLINE']),
          app_share_pct: share(['PASSENGER_APP']),
          hail_share_pct: share(['DRIVER_HAIL'])
        },
        punctuality_summary: {
          on_time_departure_rate: `${delays.length ? round1((onTimeTrips / delays.length) * 100) : 100}%`,
          average_delay_minutes: delays.length ? round1(delays.reduce((a, b) => a + b, 0) / delays.length) : 0
        }
      }
    };
  }

  getExecutiveReports(options, operatorId = DEFAULT_OPERATOR_ID) {
    return this.getExecutiveReport(options, operatorId);
  }
}
