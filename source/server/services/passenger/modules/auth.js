/**
 * FleetBus Passenger Auth Module
 * Implements PAX-001 (Splash & App Init), PAX-002 (Phone Login), PAX-003 (OTP Verification), and PAX-022 (Profile & Session).
 */

import crypto from 'crypto';
import { validateVietnamPhone } from '../core/formatters.js';
import { isProduction, VIP_PASSENGER_OTP, isVipPassengerPhone } from '../../../config.js';
import { signToken, TOKEN_PREFIXES } from '../../../core/tokens.js';
import { findOperatorById, DEFAULT_OPERATOR_ID, publicOperatorProfile } from '../../../core/operators.js';

// Passengers who deleted their account (B-12): "<operator>:<phone>" -> time; tokens signed before it stop working.
export const PASSENGER_REVOCATIONS = new Map();

export function isPassengerRevoked(identity) {
  const revokedAt = PASSENGER_REVOCATIONS.get(`${identity.operator_id || DEFAULT_OPERATOR_ID}:${identity.phone}`);
  return revokedAt !== undefined && (identity.iat || 0) <= revokedAt;
}

export const MAX_AVATAR_BYTES = 256 * 1024;

/** A profile photo: a JPEG, PNG or WebP data URL the app already shrank, at most 256 KB. */
function checkAvatar(value) {
  const match = typeof value === 'string' && /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if (!match) return { ok: false, message: 'Ảnh đại diện phải là ảnh JPEG, PNG hoặc WebP' };
  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.length > MAX_AVATAR_BYTES) return { ok: false, message: 'Ảnh đại diện tối đa 256 KB' };
  // The bytes must be the image the type says, not anything with an image label.
  const magic = { jpeg: [0xff, 0xd8, 0xff], png: [0x89, 0x50, 0x4e, 0x47], webp: [0x52, 0x49, 0x46, 0x46] }[match[1]];
  if (!magic.every((b, i) => bytes[i] === b)) return { ok: false, message: 'Ảnh đại diện phải là ảnh JPEG, PNG hoặc WebP' };
  return { ok: true };
}

export class PassengerAuthService {
  constructor(options = {}) {
    this.minSupportedVersion = options.minSupportedVersion || '3.0.0';
    this.latestVersion = options.latestVersion || '3.1.0';
    this.forceUpgrade = options.forceUpgrade ?? false;
    this.maintenanceActive = options.maintenanceActive ?? false;
    this.messenger = options.messenger || null;

    this.sessions = new Map(); // token -> session
    this.profiles = new Map(); // operatorId:phone -> { operator_id, phone, full_name, avatar, updated_at } (D186)
    this.otpStore = new Map(); // operatorId:phone -> { otp, expiresAt, attempts, lastSentAt }
    this.otpCooldownSeconds = 60;
    this.otpTtlSeconds = 180; // 3 minutes
  }

  /** Ends every session of a phone with one company and refuses the tokens already handed out. */
  revokePhone(operatorId, phone, now = Date.now()) {
    this.revokeSessions(operatorId, phone, now);
    this.otpStore.delete(`${operatorId}:${phone}`);
    this.profiles.delete(`${operatorId}:${phone}`);
  }

  /**
   * Sign out (D198): every token of the phone with this company handed out until now stops working, so a token
   * left on a lost or shared phone cannot be used for the rest of its 12 hours. The profile is kept.
   */
  revokeSessions(operatorId, phone, now = Date.now()) {
    PASSENGER_REVOCATIONS.set(`${operatorId}:${phone}`, now);
    for (const [token, session] of this.sessions) {
      if (session.phone === phone && (session.operator_id || DEFAULT_OPERATOR_ID) === operatorId) this.sessions.delete(token);
    }
  }

  /**
   * PAX-022 (D186): the name and photo the passenger chose. The phone is the login and never changes here; a
   * passenger who wants another number logs in with it. Every open session of that phone shows the new name.
   */
  updateProfile(operatorId, phone, body = {}, now = Date.now()) {
    if (body.phone !== undefined) return { ok: false, status: 400, code: 'PHONE_NOT_EDITABLE', message: 'Không đổi được số điện thoại. Đăng nhập bằng số mới nếu bạn muốn dùng số khác.' };
    const key = `${operatorId}:${phone}`;
    const next = { ...(this.profiles.get(key) || { operator_id: operatorId, phone }) };
    if (body.full_name !== undefined) {
      const name = String(body.full_name ?? '').trim().replace(/\s+/g, ' ');
      if (!/^\p{L}[\p{L}\p{M} .'-]{1,59}$/u.test(name)) return { ok: false, status: 400, code: 'VALIDATION_ERROR', message: 'Tên gồm 2-60 chữ cái, có thể có dấu cách' };
      next.full_name = name;
    }
    if (body.avatar !== undefined) {
      if (body.avatar === null) {
        delete next.avatar;
      } else {
        const avatar = checkAvatar(body.avatar);
        if (!avatar.ok) return { ok: false, status: 400, code: 'VALIDATION_ERROR', message: avatar.message };
        next.avatar = body.avatar;
      }
    }
    next.updated_at = new Date(now).toISOString();
    this.profiles.set(key, next);
    for (const session of this.sessions.values()) {
      if (session.phone === phone && (session.operator_id || DEFAULT_OPERATOR_ID) === operatorId && next.full_name) session.full_name = next.full_name;
    }
    return { ok: true, profile: this.profileView(operatorId, phone) };
  }

  /** Name and photo of a passenger, with the defaults when they never set them. */
  profileView(operatorId, phone) {
    const stored = this.profiles.get(`${operatorId}:${phone}`);
    return { phone, full_name: stored?.full_name ?? null, avatar: stored?.avatar ?? null, updated_at: stored?.updated_at ?? null };
  }

  /**
   * PAX-001: Handshake app config & version compatibility
   */
  checkAppConfig(clientVersion = '3.0.0') {
    const isUnderMin = this._compareVersions(clientVersion, this.minSupportedVersion) < 0;
    const isUpgradeRequired = isUnderMin || this.forceUpgrade;

    return {
      status: 'success',
      data: {
        client_version: clientVersion,
        min_supported_version: this.minSupportedVersion,
        latest_version: this.latestVersion,
        force_upgrade: isUpgradeRequired,
        maintenance_active: this.maintenanceActive,
        features: {
          guest_checkout: true,
          vietqr_enabled: true,
          seat_lock_duration_seconds: 600,
        },
        action: this.maintenanceActive
          ? 'SHOW_MAINTENANCE'
          : isUpgradeRequired
          ? 'FORCE_UPGRADE'
          : 'PROCEED'
      }
    };
  }

  /**
   * PAX-002: Request OTP via Vietnam phone number
   */
  requestOTP(phone, mockNow = Date.now(), operatorId = DEFAULT_OPERATOR_ID) {
    const phoneCheck = validateVietnamPhone(phone);
    if (!phoneCheck.isValid) {
      return { success: false, error: phoneCheck.message, code: 'INVALID_PHONE' };
    }

    const normalized = phoneCheck.normalized;
    const cacheKey = `${operatorId}:${normalized}`;
    const existing = this.otpStore.get(cacheKey);

    // Check 60s cooldown
    if (existing && mockNow - existing.lastSentAt < this.otpCooldownSeconds * 1000) {
      const remainingCooldown = Math.ceil(
        (this.otpCooldownSeconds * 1000 - (mockNow - existing.lastSentAt)) / 1000
      );
      return {
        success: false,
        error: `Vui lòng chờ ${remainingCooldown} giây trước khi yêu cầu mã OTP mới`,
        code: 'COOLDOWN_ACTIVE',
        remainingCooldown
      };
    }

    const hasSmsProvider = Boolean(this.messenger?.smsUrl);
    if (isProduction() && !hasSmsProvider) {
      return {
        success: false,
        error: 'Chưa gửi được mã OTP. Vui lòng thử lại sau hoặc gọi tổng đài nhà xe.',
        code: 'OTP_PROVIDER_UNAVAILABLE',
        status: 503
      };
    }

    // Generate 6-digit OTP (Deterministic mock for 0912345678 is 882199, VIP is 888777 outside production).
    // A real code comes from the crypto RNG, never Math.random (D198).
    const otp = isVipPassengerPhone(normalized)
      ? VIP_PASSENGER_OTP
      : !isProduction() && normalized === '0912345678'
      ? '882199'
      : String(crypto.randomInt(100000, 1000000));
    const expiresAt = mockNow + this.otpTtlSeconds * 1000;

    this.otpStore.set(cacheKey, {
      otp,
      expiresAt,
      attempts: 0,
      lastSentAt: mockNow
    });

    if (hasSmsProvider) {
      this.messenger.sendOtp({ operatorId, phone: normalized, otp, brand: 'BusGo' });
    }

    return {
      success: true,
      data: {
        phone: normalized,
        cooldown_seconds: this.otpCooldownSeconds,
        expires_in_seconds: this.otpTtlSeconds,
        // The OTP is only echoed outside production when no SMS gateway is configured
        ...(isProduction() || hasSmsProvider ? {} : { mock_otp: otp })
      }
    };
  }

  /**
   * PAX-003: Verify 6-digit OTP
   */
  verifyOTP(phone, inputOtp, mockNow = Date.now(), operatorId = DEFAULT_OPERATOR_ID) {
    const phoneCheck = validateVietnamPhone(phone);
    if (!phoneCheck.isValid) {
      return { success: false, error: phoneCheck.message, code: 'INVALID_PHONE' };
    }

    const normalized = phoneCheck.normalized;
    const cacheKey = `${operatorId}:${normalized}`;
    const record = this.otpStore.get(cacheKey);

    if (!record) {
      return { success: false, error: 'Chưa có yêu cầu OTP cho số điện thoại này', code: 'NO_OTP_RECORD' };
    }

    if (mockNow > record.expiresAt) {
      this.otpStore.delete(cacheKey);
      return { success: false, error: 'Mã OTP đã hết hạn. Vui lòng gửi lại', code: 'OTP_EXPIRED' };
    }

    if (record.attempts >= 5) {
      this.otpStore.delete(cacheKey);
      return { success: false, error: 'Bạn đã nhập sai quá 5 lần. Vui lòng yêu cầu mã mới', code: 'MAX_ATTEMPTS_EXCEEDED' };
    }

    // "The fixed test OTP 882199 for 0912345678 applies to every operator." Outside production only (D198):
    // the code is in a public repo, so in production it would sign anyone in as that phone.
    if (
      record.otp !== inputOtp &&
      !(!isProduction() && normalized === '0912345678' && inputOtp === '882199') &&
      !(isVipPassengerPhone(normalized) && inputOtp === VIP_PASSENGER_OTP)
    ) {
      record.attempts += 1;
      return {
        success: false,
        error: `Mã OTP không đúng. Còn ${5 - record.attempts} lần thử`,
        code: 'INVALID_OTP',
        remainingAttempts: 5 - record.attempts
      };
    }

    // OTP Verified -> Create Auth Session
    this.otpStore.delete(cacheKey);
    
    const op = findOperatorById(operatorId);
    const opCode = op ? op.code : 'UNKNOWN';
    let userId = `usr_${normalized.slice(-6)}`;
    if (operatorId !== DEFAULT_OPERATOR_ID) {
      userId = `usr_${opCode.toLowerCase()}_${normalized.slice(-6)}`;
    }

    const vip = isVipPassengerPhone(normalized);

    const user = {
      user_id: userId,
      phone: normalized,
      full_name: this.profiles.get(`${operatorId}:${normalized}`)?.full_name || (vip ? 'Khách VIP BusGo' : normalized === '0912345678' ? 'Nguyễn Văn An' : 'Hành khách BusGo'),
      email: `${normalized}@passenger.busgo.vn`,
      role: 'ROLE_PASSENGER',
      is_vip: vip,
      created_at: new Date(mockNow).toISOString(),
      operator_id: operatorId,
      operator: publicOperatorProfile(op)
    };

    const token = signToken(
      {
        sub: user.user_id,
        phone: normalized,
        role: user.role,
        kind: 'passenger',
        operator_id: operatorId,
        ...(vip ? { vip: true } : {})
      },
      { prefix: TOKEN_PREFIXES.passenger, ttlSeconds: 12 * 3600, now: mockNow }
    );
    this.sessions.set(token, user);

    return {
      success: true,
      data: {
        token,
        user
      }
    };
  }

  /**
   * PAX-022: Get user profile by token
   */
  getProfile(token) {
    if (!token || !this.sessions.has(token)) {
      return { success: false, error: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn', code: 'UNAUTHORIZED' };
    }
    return {
      success: true,
      data: this.sessions.get(token)
    };
  }

  /**
   * Compare semver strings (e.g. '3.0.0' vs '2.9.1')
   */
  _compareVersions(v1, v2) {
    const p1 = (v1 || '0.0.0').split('.').map(Number);
    const p2 = (v2 || '0.0.0').split('.').map(Number);
    for (let i = 0; i < 3; i++) {
      if ((p1[i] || 0) > (p2[i] || 0)) return 1;
      if ((p1[i] || 0) < (p2[i] || 0)) return -1;
    }
    return 0;
  }
}
