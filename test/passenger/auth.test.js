import { describe, it } from 'node:test';
import assert from 'node:assert';
import { PassengerAuthService } from '../../source/server/services/passenger/modules/auth.js';

describe('Phase 2: Authentication & Onboarding Test Suite', () => {
  it('TC-AUTH-01: App config should enforce force upgrade if client version < min_supported', () => {
    const authService = new PassengerAuthService({ minSupportedVersion: '3.0.0' });
    
    // Outdated version 2.9.0
    const checkOutdated = authService.checkAppConfig('2.9.0');
    assert.strictEqual(checkOutdated.data.force_upgrade, true);
    assert.strictEqual(checkOutdated.data.action, 'FORCE_UPGRADE');

    // Supported version 3.0.0
    const checkValid = authService.checkAppConfig('3.0.0');
    assert.strictEqual(checkValid.data.force_upgrade, false);
    assert.strictEqual(checkValid.data.action, 'PROCEED');
  });

  it('TC-AUTH-02: Should request OTP, enforce 60s cooldown, and prevent rapid re-requests', () => {
    const authService = new PassengerAuthService();
    const t0 = 1724800000000;

    // First OTP request
    const req1 = authService.requestOTP('0912345678', t0);
    assert.strictEqual(req1.success, true);
    assert.strictEqual(req1.data.mock_otp, '882199');

    // Immediate second OTP request (10s later) -> Should trigger cooldown rejection
    const req2 = authService.requestOTP('0912345678', t0 + 10000);
    assert.strictEqual(req2.success, false);
    assert.strictEqual(req2.code, 'COOLDOWN_ACTIVE');
    assert.strictEqual(req2.remainingCooldown, 50);

    // After 61 seconds -> Cooldown cleared
    const req3 = authService.requestOTP('0912345678', t0 + 61000);
    assert.strictEqual(req3.success, true);
  });

  it('TC-AUTH-03: Should verify valid OTP, reject invalid OTP with attempt countdown', () => {
    const authService = new PassengerAuthService();
    const t0 = 1724800000000;

    authService.requestOTP('0912345678', t0);

    // Wrong OTP
    const wrongRes = authService.verifyOTP('0912345678', '000000', t0 + 5000);
    assert.strictEqual(wrongRes.success, false);
    assert.strictEqual(wrongRes.code, 'INVALID_OTP');
    assert.strictEqual(wrongRes.remainingAttempts, 4);

    // Correct OTP (882199)
    const validRes = authService.verifyOTP('0912345678', '882199', t0 + 10000);
    assert.strictEqual(validRes.success, true);
    assert.ok(validRes.data.token.startsWith('pax_jwt_'));
    assert.strictEqual(validRes.data.user.phone, '0912345678');
    assert.strictEqual(validRes.data.user.role, 'ROLE_PASSENGER');

    // Profile lookup
    const profile = authService.getProfile(validRes.data.token);
    assert.strictEqual(profile.success, true);
    assert.strictEqual(profile.data.full_name, 'Nguyễn Văn An');
  });

  it('TC-AUTH-04: Should expire OTP after 180 seconds TTL', () => {
    const authService = new PassengerAuthService();
    const t0 = 1724800000000;

    authService.requestOTP('0988776655', t0);

    // Verify after 181 seconds
    const expiredRes = authService.verifyOTP('0988776655', '123456', t0 + 181000);
    assert.strictEqual(expiredRes.success, false);
    assert.strictEqual(expiredRes.code, 'OTP_EXPIRED');
  });
});
