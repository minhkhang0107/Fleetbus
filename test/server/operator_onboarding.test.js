import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { createFleetBusServer } from '../../source/server/apiServer.js';
import { generateTotp } from '../../source/server/core/totp.js';
import { DEV_TOTP_SECRET, getStaffTotpSecret } from '../../source/server/config.js';
import { MOCK_MANAGERS_DB } from '../../source/server/services/manager/modules/managerService.js';

describe('Operator onboarding: company creation, director account, password change, and reset', () => {
  let server;
  let services;
  let baseUrl;
  let rootToken;

  const request = async (path, { method = 'GET', body, token, headers = {} } = {}) => {
    const h = { 'Content-Type': 'application/json', ...headers };
    if (token) h.Authorization = `Bearer ${token}`;
    if (method === 'POST') h['Idempotency-Key'] = crypto.randomUUID();
    const res = await fetch(`${baseUrl}${path}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not json */ }
    return { status: res.status, body: json, text };
  };

  const totp = () => generateTotp(DEV_TOTP_SECRET, Date.now());
  const staffLogin = (username, password, code = totp()) => request('/api/v1/ops/auth/login', { method: 'POST', body: { username, password, totp: code } });

  before(async () => {
    ({ server, services } = createFleetBusServer({ authMode: 'enforce' }));
    await new Promise(resolve => server.listen(0, resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    rootToken = (await staffLogin('root@busgo.vn', 'root123')).body.data.token;
  });

  after(() => new Promise(resolve => server.close(resolve)));

  it('rejects company creation with missing director email (400)', async () => {
    const res = await request('/api/v1/platform/operators', {
      method: 'POST',
      token: rootToken,
      body: {
        code: 'BAONGA',
        name: 'Nhà xe Bảo Nga',
        director_name: 'Lê Bảo Nga',
        bank: { bin: '970422', bank_name: 'MB Bank', account_number: '0123456789', account_name: 'NHA XE BAO NGA' }
      }
    });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.code, 'VALIDATION_ERROR');
  });

  it('rejects company creation with duplicate director email (409 STAFF_EXISTS)', async () => {
    const res = await request('/api/v1/platform/operators', {
      method: 'POST',
      token: rootToken,
      body: {
        code: 'BAONGA',
        name: 'Nhà xe Bảo Nga',
        director_name: 'Lê Bảo Nga',
        director_email: 'admin@busgo.vn',
        bank: { bin: '970422', bank_name: 'MB Bank', account_number: '0123456789', account_name: 'NHA XE BAO NGA' }
      }
    });
    assert.strictEqual(res.status, 409);
    assert.strictEqual(res.body.code, 'STAFF_EXISTS');
  });

  it('full onboarding flow: create company, login with temp password, change password, create driver, and platform reset', async () => {
    const companyBody = {
      code: 'BAONGA',
      name: 'Nhà xe Bảo Nga',
      director_name: 'Lê Bảo Nga',
      director_email: 'director@baonga.vn',
      bank: { bin: '970422', bank_name: 'MB Bank', account_number: '0123456789', account_name: 'NHA XE BAO NGA' }
    };

    // 1. Create company
    const created = await request('/api/v1/platform/operators', { method: 'POST', token: rootToken, body: companyBody });
    assert.strictEqual(created.status, 201, JSON.stringify(created.body));
    assert.strictEqual(created.body.data.operator_id, 'op_baonga');
    assert.strictEqual(created.body.data.director.username, 'director@baonga.vn');
    assert.strictEqual(created.body.data.director.full_name, 'Lê Bảo Nga');
    const tempPassword = created.body.data.temporary_password;
    assert.strictEqual(typeof tempPassword, 'string');
    assert.strictEqual(tempPassword.length, 12);
    // Verify characters exclude look-alikes 0, O, 1, l, I
    assert.strictEqual(/[0O1lI]/.test(tempPassword), false);

    // 2. Duplicate director email against newly created account -> 409 STAFF_EXISTS
    const dupRes = await request('/api/v1/platform/operators', {
      method: 'POST',
      token: rootToken,
      body: { ...companyBody, code: 'BAONGA2' }
    });
    assert.strictEqual(dupRes.status, 409);
    assert.strictEqual(dupRes.body.code, 'STAFF_EXISTS');

    // 3. Director logs in with the temporary password without a TOTP code
    const loginRes = await request('/api/v1/ops/auth/login', {
      method: 'POST',
      body: { username: 'director@baonga.vn', password: tempPassword }
    });
    assert.strictEqual(loginRes.status, 200, JSON.stringify(loginRes.body));
    assert.strictEqual(loginRes.body.data.user.must_change_password, true);
    assert.strictEqual(loginRes.body.data.user.must_enroll_totp, true);
    const directorToken = loginRes.body.data.token;

    // 4. Director gets 403 PASSWORD_CHANGE_REQUIRED on /ops/drivers
    const blockedRes = await request('/api/v1/ops/drivers', { token: directorToken });
    assert.strictEqual(blockedRes.status, 403);
    assert.strictEqual(blockedRes.body.code, 'PASSWORD_CHANGE_REQUIRED');
    assert.strictEqual(blockedRes.body.message, 'Đổi mật khẩu tạm trước khi tiếp tục');

    // 5. Weak new password -> 400
    const weakRes = await request('/api/v1/ops/auth/change-password', {
      method: 'POST',
      token: directorToken,
      body: { current_password: tempPassword, new_password: 'short' }
    });
    assert.strictEqual(weakRes.status, 400);
    assert.strictEqual(weakRes.body.code, 'VALIDATION_ERROR');

    const noDigitsRes = await request('/api/v1/ops/auth/change-password', {
      method: 'POST',
      token: directorToken,
      body: { current_password: tempPassword, new_password: 'OnlyLettersPassword' }
    });
    assert.strictEqual(noDigitsRes.status, 400);

    const samePasswordRes = await request('/api/v1/ops/auth/change-password', {
      method: 'POST',
      token: directorToken,
      body: { current_password: tempPassword, new_password: tempPassword }
    });
    assert.strictEqual(samePasswordRes.status, 400);

    // Wrong current password -> 400 (the page keeps its session)
    const wrongCurrent = await request('/api/v1/ops/auth/change-password', {
      method: 'POST',
      token: directorToken,
      body: { current_password: 'WrongCurrentPass1', new_password: 'NewStrongPassword123' }
    });
    assert.strictEqual(wrongCurrent.status, 400);
    assert.strictEqual(wrongCurrent.body.code, 'INVALID_CREDENTIALS');

    // 6. Change password works
    const changeRes = await request('/api/v1/ops/auth/change-password', {
      method: 'POST',
      token: directorToken,
      body: { current_password: tempPassword, new_password: 'NewStrongPassword123' }
    });
    assert.strictEqual(changeRes.status, 200, JSON.stringify(changeRes.body));

    // Audit check for PASSWORD_CHANGE
    const changeAudit = services.managerService.auditLog.find(a => a.action === 'PASSWORD_CHANGE' && a.resource === 'director@baonga.vn');
    assert.ok(changeAudit, 'PASSWORD_CHANGE is audited');
    assert.strictEqual(JSON.stringify(changeAudit).includes('NewStrongPassword123'), false, 'no password in audit log');

    // After password change, director gets 403 TOTP_ENROLLMENT_REQUIRED on /ops/drivers
    const totpBlocked = await request('/api/v1/ops/drivers', { token: directorToken });
    assert.strictEqual(totpBlocked.status, 403);
    assert.strictEqual(totpBlocked.body.code, 'TOTP_ENROLLMENT_REQUIRED');
    assert.strictEqual(totpBlocked.body.message, 'Cài xác thực 2 bước trước khi tiếp tục');

    // Setup returns a secret and a URI
    const setupRes = await request('/api/v1/ops/auth/totp/setup', {
      method: 'POST',
      token: directorToken
    });
    assert.strictEqual(setupRes.status, 200, JSON.stringify(setupRes.body));
    const { secret, otpauth_uri } = setupRes.body.data;
    assert.ok(secret);
    assert.strictEqual(otpauth_uri, `otpauth://totp/BusGo:director@baonga.vn?secret=${secret}&issuer=BusGo&digits=6&period=30`);

    // A wrong code -> 400 INVALID_TOTP
    const wrongConfirm = await request('/api/v1/ops/auth/totp/confirm', {
      method: 'POST',
      token: directorToken,
      body: { code: '000000' }
    });
    assert.strictEqual(wrongConfirm.status, 400);
    assert.strictEqual(wrongConfirm.body.code, 'INVALID_TOTP');

    // The right code (generateTotp(secret)) enrolls
    const enrollRes = await request('/api/v1/ops/auth/totp/confirm', {
      method: 'POST',
      token: directorToken,
      body: { code: generateTotp(secret) }
    });
    assert.strictEqual(enrollRes.status, 200, JSON.stringify(enrollRes.body));

    // Audit check for TOTP_ENROLLED (never the secret)
    const totpAudit = services.managerService.auditLog.find(a => a.action === 'TOTP_ENROLLED' && a.resource === 'director@baonga.vn');
    assert.ok(totpAudit, 'TOTP_ENROLLED is audited');
    assert.strictEqual(totpAudit.operator_id, 'op_baonga');
    assert.strictEqual(JSON.stringify(totpAudit).includes(secret), false, 'never audit the secret');

    // /ops/drivers then works
    const driverRes = await request('/api/v1/ops/drivers', {
      method: 'POST',
      token: directorToken,
      body: {
        full_name: 'Nguyễn Văn Tài',
        phone: '0912345678',
        license_class: 'FC',
        license_expiry: '2028-12-31'
      }
    });
    assert.strictEqual(driverRes.status, 201, JSON.stringify(driverRes.body));
    assert.strictEqual(driverRes.body.data.driver.operator_id, 'op_baonga');
    assert.strictEqual(driverRes.body.data.driver.full_name, 'Nguyễn Văn Tài');

    // 7. Old password fails
    const oldLogin = await request('/api/v1/ops/auth/login', {
      method: 'POST',
      body: { username: 'director@baonga.vn', password: tempPassword }
    });
    assert.strictEqual(oldLogin.status, 401);
    assert.strictEqual(oldLogin.body.code, 'INVALID_CREDENTIALS');

    // 8. Next login requires a TOTP code from that secret (a code from the dev secret is refused)
    const noCodeLogin = await request('/api/v1/ops/auth/login', {
      method: 'POST',
      body: { username: 'director@baonga.vn', password: 'NewStrongPassword123' }
    });
    assert.strictEqual(noCodeLogin.status, 401);
    assert.strictEqual(noCodeLogin.body.code, 'TOTP_REQUIRED');

    const devCodeLogin = await request('/api/v1/ops/auth/login', {
      method: 'POST',
      body: { username: 'director@baonga.vn', password: 'NewStrongPassword123', totp: generateTotp(DEV_TOTP_SECRET) }
    });
    assert.strictEqual(devCodeLogin.status, 401);
    assert.strictEqual(devCodeLogin.body.code, 'INVALID_TOTP');

    const rightCodeLogin = await request('/api/v1/ops/auth/login', {
      method: 'POST',
      body: { username: 'director@baonga.vn', password: 'NewStrongPassword123', totp: generateTotp(secret) }
    });
    assert.strictEqual(rightCodeLogin.status, 200, JSON.stringify(rightCodeLogin.body));
    assert.strictEqual(rightCodeLogin.body.data.user.must_change_password, false);
    assert.strictEqual(rightCodeLogin.body.data.user.must_enroll_totp, false);
    const activeToken = rightCodeLogin.body.data.token;

    // Assert the per-account secret is used and persists across production check
    const directorUserId = rightCodeLogin.body.data.user.user_id;
    const directorAccount = MOCK_MANAGERS_DB.find(u => u.user_id === directorUserId);
    assert.strictEqual(getStaffTotpSecret(directorUserId, directorAccount), secret);
    const savedEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      assert.strictEqual(getStaffTotpSecret(directorUserId, directorAccount), secret);
    } finally {
      if (savedEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = savedEnv;
    }

    // 9. Non-platform staff gets 403 on reset-password
    const nonPlatRes = await request('/api/v1/platform/operators/op_baonga/director/reset-password', {
      method: 'POST',
      token: activeToken
    });
    assert.strictEqual(nonPlatRes.status, 403);

    // 10. Reset-password by platform admin works
    const resetRes = await request('/api/v1/platform/operators/op_baonga/director/reset-password', {
      method: 'POST',
      token: rootToken
    });
    assert.strictEqual(resetRes.status, 200, JSON.stringify(resetRes.body));
    const newTempPassword = resetRes.body.data.temporary_password;
    assert.strictEqual(typeof newTempPassword, 'string');
    assert.strictEqual(newTempPassword.length, 12);
    assert.strictEqual(/[0O1lI]/.test(newTempPassword), false);

    // Audit check for DIRECTOR_PASSWORD_RESET
    const resetAudit = services.managerService.auditLog.find(a => a.action === 'DIRECTOR_PASSWORD_RESET' && a.resource === 'director@baonga.vn');
    assert.ok(resetAudit, 'DIRECTOR_PASSWORD_RESET is audited');
    assert.strictEqual(resetAudit.operator_id, 'op_baonga');
    assert.strictEqual(JSON.stringify(resetAudit).includes(newTempPassword), false, 'temporary password not in audit log');

    // Director logs in with reset password without a code; must change password and must enroll TOTP again
    const resetLogin = await request('/api/v1/ops/auth/login', {
      method: 'POST',
      body: { username: 'director@baonga.vn', password: newTempPassword }
    });
    assert.strictEqual(resetLogin.status, 200);
    assert.strictEqual(resetLogin.body.data.user.must_change_password, true);
    assert.strictEqual(resetLogin.body.data.user.must_enroll_totp, true);
    const resetToken = resetLogin.body.data.token;

    // Password change required first
    const resetBlockedPass = await request('/api/v1/ops/drivers', { token: resetToken });
    assert.strictEqual(resetBlockedPass.status, 403);
    assert.strictEqual(resetBlockedPass.body.code, 'PASSWORD_CHANGE_REQUIRED');

    // Change password
    const afterResetChange = await request('/api/v1/ops/auth/change-password', {
      method: 'POST',
      token: resetToken,
      body: { current_password: newTempPassword, new_password: 'AfterResetStrongPass456' }
    });
    assert.strictEqual(afterResetChange.status, 200);

    // After password change, TOTP enrollment is required again
    const resetBlockedTotp = await request('/api/v1/ops/drivers', { token: resetToken });
    assert.strictEqual(resetBlockedTotp.status, 403);
    assert.strictEqual(resetBlockedTotp.body.code, 'TOTP_ENROLLMENT_REQUIRED');
  });
});
