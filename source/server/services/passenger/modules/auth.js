/**
 * FleetBus Passenger Auth Module
 * Implements PAX-001 (Splash & App Init), PAX-002 (Phone Login), PAX-003 (OTP Verification), and PAX-022 (Profile & Session).
 */

import { validateVietnamPhone } from '../core/formatters.js';

export class PassengerAuthService {
  constructor(options = {}) {
    this.minSupportedVersion = options.minSupportedVersion || '3.0.0';
    this.latestVersion = options.latestVersion || '3.1.0';
    this.forceUpgrade = options.forceUpgrade ?? false;
    this.maintenanceActive = options.maintenanceActive ?? false;

    this.sessions = new Map(); // token -> session
    this.otpStore = new Map(); // phone -> { otp, expiresAt, attempts, lastSentAt }
    this.otpCooldownSeconds = 60;
    this.otpTtlSeconds = 180; // 3 minutes
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
  requestOTP(phone, mockNow = Date.now()) {
    const phoneCheck = validateVietnamPhone(phone);
    if (!phoneCheck.isValid) {
      return { success: false, error: phoneCheck.message, code: 'INVALID_PHONE' };
    }

    const normalized = phoneCheck.normalized;
    const existing = this.otpStore.get(normalized);

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

    // Generate 6-digit OTP (Deterministic mock for 0912345678 is 882199)
    const otp = normalized === '0912345678' ? '882199' : Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = mockNow + this.otpTtlSeconds * 1000;

    this.otpStore.set(normalized, {
      otp,
      expiresAt,
      attempts: 0,
      lastSentAt: mockNow
    });

    return {
      success: true,
      data: {
        phone: normalized,
        cooldown_seconds: this.otpCooldownSeconds,
        expires_in_seconds: this.otpTtlSeconds,
        // In testing/dev, expose mock OTP for verification
        mock_otp: otp
      }
    };
  }

  /**
   * PAX-003: Verify 6-digit OTP
   */
  verifyOTP(phone, inputOtp, mockNow = Date.now()) {
    const phoneCheck = validateVietnamPhone(phone);
    if (!phoneCheck.isValid) {
      return { success: false, error: phoneCheck.message, code: 'INVALID_PHONE' };
    }

    const normalized = phoneCheck.normalized;
    const record = this.otpStore.get(normalized);

    if (!record) {
      return { success: false, error: 'Chưa có yêu cầu OTP cho số điện thoại này', code: 'NO_OTP_RECORD' };
    }

    if (mockNow > record.expiresAt) {
      this.otpStore.delete(normalized);
      return { success: false, error: 'Mã OTP đã hết hạn. Vui lòng gửi lại', code: 'OTP_EXPIRED' };
    }

    if (record.attempts >= 5) {
      this.otpStore.delete(normalized);
      return { success: false, error: 'Bạn đã nhập sai quá 5 lần. Vui lòng yêu cầu mã mới', code: 'MAX_ATTEMPTS_EXCEEDED' };
    }

    if (record.otp !== inputOtp) {
      record.attempts += 1;
      return {
        success: false,
        error: `Mã OTP không đúng. Còn ${5 - record.attempts} lần thử`,
        code: 'INVALID_OTP',
        remainingAttempts: 5 - record.attempts
      };
    }

    // OTP Verified -> Create Auth Session
    this.otpStore.delete(normalized);
    const token = `pax_jwt_${Buffer.from(`${normalized}_${mockNow}`).toString('base64').replace(/=/g, '')}`;
    const user = {
      user_id: `usr_${normalized.slice(-6)}`,
      phone: normalized,
      full_name: normalized === '0912345678' ? 'Nguyễn Văn An' : 'Hành khách BusGo',
      email: `${normalized}@passenger.busgo.vn`,
      role: 'ROLE_PASSENGER',
      created_at: new Date(mockNow).toISOString()
    };

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
