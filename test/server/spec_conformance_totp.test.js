/**
 * Spec conformance: TOTP second factor of staff (MGR-001, BR-MGR-AUTH-001, OQ-027).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { ManagerOperationsService } from '../../source/server/services/manager/modules/managerService.js';
import { generateTotp, verifyTotp, base32Encode, generateSecret, provisioningUri } from '../../source/server/core/totp.js';
import { DEV_TOTP_SECRET } from '../../source/server/config.js';

// RFC 6238 appendix B, SHA1 secret "12345678901234567890", 6 digits are the last 6 of the 8-digit values
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'));

describe('Spec conformance: staff TOTP 2FA', () => {
  it('TC-TOTP-01: codes match the RFC 6238 test vectors', () => {
    assert.strictEqual(generateTotp(RFC_SECRET, 59 * 1000), '287082');
    assert.strictEqual(generateTotp(RFC_SECRET, 1111111109 * 1000), '081804');
    assert.strictEqual(generateTotp(RFC_SECRET, 1234567890 * 1000), '005924');
    assert.strictEqual(generateTotp(RFC_SECRET, 2000000000 * 1000), '279037');
  });

  it('TC-TOTP-02: one step of drift either side is accepted, two are not, and a used step cannot be used again', () => {
    const t = 1700000000000;
    const code = generateTotp(DEV_TOTP_SECRET, t);
    assert.strictEqual(verifyTotp(DEV_TOTP_SECRET, code, { now: t + 30000 }).valid, true);
    assert.strictEqual(verifyTotp(DEV_TOTP_SECRET, code, { now: t - 30000 }).valid, true);
    assert.strictEqual(verifyTotp(DEV_TOTP_SECRET, code, { now: t + 60000 }).valid, false);
    const ok = verifyTotp(DEV_TOTP_SECRET, code, { now: t });
    assert.strictEqual(verifyTotp(DEV_TOTP_SECRET, code, { now: t, lastUsedStep: ok.step }).reason, 'REPLAYED');
    assert.strictEqual(verifyTotp(DEV_TOTP_SECRET, '12345', { now: t }).reason, 'MALFORMED');
    assert.match(generateSecret(), /^[A-Z2-7]{32}$/);
    assert.ok(provisioningUri(DEV_TOTP_SECRET, 'admin@busgo.vn').startsWith('otpauth://totp/FleetBus:admin%40busgo.vn?secret='));
  });

  it('TC-TOTP-03: the director needs the code, other roles do not (BR-MGR-AUTH-001)', () => {
    const service = new ManagerOperationsService();
    const now = Date.now() + 10 * 60 * 1000;
    const missing = service.authenticateManager('admin@busgo.vn', 'admin123', null, now);
    assert.strictEqual(missing.code, 'TOTP_REQUIRED');
    assert.strictEqual(service.authenticateManager('admin@busgo.vn', 'admin123', '000000', now).code, 'INVALID_TOTP');
    const good = service.authenticateManager('admin@busgo.vn', 'admin123', generateTotp(DEV_TOTP_SECRET, now), now);
    assert.strictEqual(good.success, true);
    assert.strictEqual(service.authenticateManager('dispatcher@busgo.vn', 'disp123').success, true, 'the dispatcher has no second factor');
  });

  it('TC-TOTP-04: a wrong password never reveals whether a code is needed; a code works once', () => {
    const service = new ManagerOperationsService();
    const now = Date.now() + 20 * 60 * 1000;
    assert.strictEqual(service.authenticateManager('admin@busgo.vn', 'wrong', null, now).code, 'INVALID_CREDENTIALS');
    const code = generateTotp(DEV_TOTP_SECRET, now);
    assert.strictEqual(service.authenticateManager('admin@busgo.vn', 'admin123', code, now).success, true);
    const again = service.authenticateManager('admin@busgo.vn', 'admin123', code, now);
    assert.strictEqual(again.code, 'INVALID_TOTP');
    assert.match(again.error, /đã được dùng/);
  });

  it('TC-TOTP-05: wrong codes count towards the lockout like wrong passwords (BR-MGR-AUTH-002)', () => {
    const service = new ManagerOperationsService();
    const now = Date.now() + 30 * 60 * 1000;
    for (let i = 0; i < 5; i++) service.authenticateManager('admin@busgo.vn', 'admin123', '000000', now);
    const locked = service.authenticateManager('admin@busgo.vn', 'admin123', generateTotp(DEV_TOTP_SECRET, now), now);
    assert.strictEqual(locked.code, 'ACCOUNT_LOCKED');
    assert.ok(locked.retry_after_seconds > 0);
  });

  it('TC-TOTP-06: production without a configured secret refuses the director instead of using the dev secret', () => {
    const saved = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    process.env.FLEETBUS_TOKEN_SECRET = 'prod-token-secret';
    try {
      const service = new ManagerOperationsService();
      const res = service.authenticateManager('admin@busgo.vn', 'admin123', '123456', Date.now() + 40 * 60 * 1000);
      assert.strictEqual(res.code, 'TOTP_NOT_CONFIGURED');
      process.env.FLEETBUS_TOTP_SECRET_MGR_01 = RFC_SECRET;
      const now = Date.now() + 50 * 60 * 1000;
      assert.strictEqual(service.authenticateManager('admin@busgo.vn', 'admin123', generateTotp(RFC_SECRET, now), now).success, true);
    } finally {
      delete process.env.FLEETBUS_TOTP_SECRET_MGR_01;
      delete process.env.FLEETBUS_TOKEN_SECRET;
      if (saved === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = saved;
    }
  });
});
