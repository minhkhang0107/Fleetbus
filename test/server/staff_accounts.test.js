/**
 * B-10 & H-06 Staff Accounts & Token Revocation Test Suite
 * Covers staff creation, temp password forced change, RBAC 403, cross-company 404,
 * duplicate username 409, deactivation TOKEN_REVOKED & ACCOUNT_DISABLED,
 * password change token revocation, and driver PIN reset token revocation.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { createFleetBusServer } from '../../source/server/apiServer.js';
import { generateTotp } from '../../source/server/core/totp.js';
import { DEV_TOTP_SECRET } from '../../source/server/config.js';

describe('B-10 & H-06: Staff accounts management and token revocation', () => {
  let server;
  let services;
  let baseUrl;
  let directorToken;
  let dispatcherToken;
  let rootToken;

  const totp = () => generateTotp(DEV_TOTP_SECRET, Date.now());

  const api = async (path, { method = 'GET', body, token, operatorCode, key } = {}) => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (operatorCode) headers['X-Operator-Code'] = operatorCode;
    if (method === 'POST') headers['Idempotency-Key'] = key || crypto.randomUUID();
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const text = await res.text();
    let json = {};
    try { json = JSON.parse(text); } catch (_) {}
    return { status: res.status, body: json, text };
  };

  before(async () => {
    ({ server, services } = createFleetBusServer({ authMode: 'enforce' }));
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    // Director login (Sao Mai)
    const dirRes = await api('/api/v1/ops/auth/login', {
      method: 'POST',
      body: { username: 'admin@busgo.vn', password: 'admin123', totp: totp() }
    });
    assert.strictEqual(dirRes.status, 200, JSON.stringify(dirRes.body));
    directorToken = dirRes.body.data.token;

    // Dispatcher login (Sao Mai)
    const dispRes = await api('/api/v1/ops/auth/login', {
      method: 'POST',
      body: { username: 'dispatcher@busgo.vn', password: 'disp123' }
    });
    assert.strictEqual(dispRes.status, 200);
    dispatcherToken = dispRes.body.data.token;

    // Root platform admin login
    const rootRes = await api('/api/v1/ops/auth/login', {
      method: 'POST',
      body: { username: 'root@busgo.vn', password: 'root123', totp: totp() }
    });
    assert.strictEqual(rootRes.status, 200);
    rootToken = rootRes.body.data.token;
  });

  after(() => new Promise(resolve => server.close(resolve)));

  let createdCashier = null;
  let tempPassword = null;
  let cashierToken = null;

  it('1. director creates a cashier with random temporary password, returned once (201)', async () => {
    const res = await api('/api/v1/ops/staff', {
      method: 'POST',
      token: directorToken,
      body: {
        username: 'thu_ngan_01@saomai.vn',
        full_name: 'Nguyễn Thị Thu Ngân',
        phone: '0988112233',
        role: 'CASHIER'
      }
    });

    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    assert.ok(res.body.data.staff);
    assert.ok(res.body.data.temporary_password);
    assert.strictEqual(typeof res.body.data.temporary_password, 'string');
    assert.strictEqual(res.body.data.temporary_password.length, 12);

    createdCashier = res.body.data.staff;
    tempPassword = res.body.data.temporary_password;

    assert.strictEqual(createdCashier.username, 'thu_ngan_01@saomai.vn');
    assert.strictEqual(createdCashier.full_name, 'Nguyễn Thị Thu Ngân');
    assert.strictEqual(createdCashier.role, 'CASHIER');
    assert.strictEqual(createdCashier.active, true);
    assert.strictEqual(createdCashier.must_change_password, true);

    // Verify secrets never returned
    assert.strictEqual(createdCashier.password_hash, undefined);
    assert.strictEqual(createdCashier.totp_secret, undefined);

    // Verify audit log
    const auditEntry = services.managerService.auditLog.find(a => a.action === 'STAFF_CREATE' && a.resource === createdCashier.user_id);
    assert.ok(auditEntry, 'STAFF_CREATE must be audited');
    assert.strictEqual(JSON.stringify(auditEntry).includes(tempPassword), false, 'Temporary password must never be in audit log');
  });

  it('2. cashier logs in with temp password, is forced to change password before doing anything else', async () => {
    // Login with temp password
    const loginRes = await api('/api/v1/ops/auth/login', {
      method: 'POST',
      body: { username: 'thu_ngan_01@saomai.vn', password: tempPassword }
    });
    assert.strictEqual(loginRes.status, 200);
    assert.strictEqual(loginRes.body.data.user.must_change_password, true);
    cashierToken = loginRes.body.data.token;

    // Normal ops endpoint blocked with 403 PASSWORD_CHANGE_REQUIRED
    const blockedRes = await api('/api/v1/ops/bookings', { token: cashierToken });
    assert.strictEqual(blockedRes.status, 403);
    assert.strictEqual(blockedRes.body.code, 'PASSWORD_CHANGE_REQUIRED');

    // Change password
    const changeRes = await api('/api/v1/ops/auth/change-password', {
      method: 'POST',
      token: cashierToken,
      body: { current_password: tempPassword, new_password: 'StrongPassword123' }
    });
    assert.strictEqual(changeRes.status, 200);
    cashierToken = changeRes.body.data.token;

    // After change, cashier can access permitted endpoints
    const allowedRes = await api('/api/v1/ops/bookings', { token: cashierToken });
    assert.strictEqual(allowedRes.status, 200);
  });

  it('3. dispatcher and cashier get 403 on /api/v1/ops/staff (director-only)', async () => {
    // Cashier GET /ops/staff -> 403
    const cashierGet = await api('/api/v1/ops/staff', { token: cashierToken });
    assert.strictEqual(cashierGet.status, 403);
    assert.strictEqual(cashierGet.body.code, 'FORBIDDEN');

    // Cashier POST /ops/staff -> 403
    const cashierPost = await api('/api/v1/ops/staff', {
      method: 'POST',
      token: cashierToken,
      body: { username: 'sub_cashier@saomai.vn', full_name: 'Phụ Ngân', role: 'CASHIER' }
    });
    assert.strictEqual(cashierPost.status, 403);

    // Dispatcher GET /ops/staff -> 403
    const dispGet = await api('/api/v1/ops/staff', { token: dispatcherToken });
    assert.strictEqual(dispGet.status, 403);
    assert.strictEqual(dispGet.body.code, 'FORBIDDEN');

    // Dispatcher POST /ops/staff -> 403
    const dispPost = await api('/api/v1/ops/staff', {
      method: 'POST',
      token: dispatcherToken,
      body: { username: 'sub_disp@saomai.vn', full_name: 'Phụ Điều', role: 'DISPATCHER' }
    });
    assert.strictEqual(dispPost.status, 403);

    // Director GET /ops/staff -> 200
    const dirGet = await api('/api/v1/ops/staff', { token: directorToken });
    assert.strictEqual(dirGet.status, 200);
    assert.ok(Array.isArray(dirGet.body.data.staff));
    assert.ok(dirGet.body.data.staff.some(s => s.user_id === createdCashier.user_id));
  });

  it('4. director of company A cannot see or edit staff of company B (404)', async () => {
    // Create company B
    const bRes = await api('/api/v1/platform/operators', {
      method: 'POST',
      token: rootToken,
      body: {
        code: 'HOANGLONG',
        name: 'Nhà xe Hoàng Long',
        director_email: 'director@hoanglong.vn',
        director_name: 'Hoàng Long Vũ',
        bank: { bin: '970415', bank_name: 'VietinBank', account_number: '1099887766', account_name: 'HOANG LONG VU' }
      }
    });
    assert.strictEqual(bRes.status, 201);
    const hlDirector = bRes.body.data.director;

    // Director of Sao Mai tries to PATCH company B's staff -> 404
    const patchOther = await api(`/api/v1/ops/staff/${hlDirector.user_id}`, {
      method: 'PATCH',
      token: directorToken,
      body: { full_name: 'Hacker Name' }
    });
    assert.strictEqual(patchOther.status, 404);
    assert.strictEqual(patchOther.body.code, 'STAFF_NOT_FOUND');

    // Director of Sao Mai tries to reset password of company B's staff -> 404
    const resetOther = await api(`/api/v1/ops/staff/${hlDirector.user_id}/reset-password`, {
      method: 'POST',
      token: directorToken
    });
    assert.strictEqual(resetOther.status, 404);
    assert.strictEqual(resetOther.body.code, 'STAFF_NOT_FOUND');

    // Director of Sao Mai listing staff does NOT see company B's staff
    const saoMaiList = await api('/api/v1/ops/staff', { token: directorToken });
    assert.strictEqual(saoMaiList.status, 200);
    assert.ok(!saoMaiList.body.data.staff.some(s => s.user_id === hlDirector.user_id));

    // Director cannot modify or deactivate themselves or other FLEET_DIRECTOR
    const patchSelf = await api('/api/v1/ops/staff/mgr_01', {
      method: 'PATCH',
      token: directorToken,
      body: { active: false }
    });
    assert.strictEqual(patchSelf.status, 400);
    assert.strictEqual(patchSelf.body.code, 'CANNOT_MODIFY_SELF');

    // Cannot create another FLEET_DIRECTOR or PLATFORM_ADMIN
    const createDir = await api('/api/v1/ops/staff', {
      method: 'POST',
      token: directorToken,
      body: { username: 'second_dir@saomai.vn', full_name: 'Giám Đốc 2', role: 'FLEET_DIRECTOR' }
    });
    assert.strictEqual(createDir.status, 400);
    assert.strictEqual(createDir.body.code, 'VALIDATION_ERROR');

    const createRoot = await api('/api/v1/ops/staff', {
      method: 'POST',
      token: directorToken,
      body: { username: 'second_root@saomai.vn', full_name: 'Quản Trị 2', role: 'PLATFORM_ADMIN' }
    });
    assert.strictEqual(createRoot.status, 400);
  });

  it('5. duplicate username rejected across all companies (409 STAFF_EXISTS)', async () => {
    // Duplicate within company
    const dupRes1 = await api('/api/v1/ops/staff', {
      method: 'POST',
      token: directorToken,
      body: { username: 'thu_ngan_01@saomai.vn', full_name: 'Trùng Tên', role: 'CASHIER' }
    });
    assert.strictEqual(dupRes1.status, 409);
    assert.strictEqual(dupRes1.body.code, 'STAFF_EXISTS');

    // Duplicate of another company director (director@hoanglong.vn)
    const dupRes2 = await api('/api/v1/ops/staff', {
      method: 'POST',
      token: directorToken,
      body: { username: 'director@hoanglong.vn', full_name: 'Trùng Khác Công Ty', role: 'DISPATCHER' }
    });
    assert.strictEqual(dupRes2.status, 409);
    assert.strictEqual(dupRes2.body.code, 'STAFF_EXISTS');

    // Invalid email format
    const invalidEmail = await api('/api/v1/ops/staff', {
      method: 'POST',
      token: directorToken,
      body: { username: 'notanemail', full_name: 'Email Sai', role: 'CASHIER' }
    });
    assert.strictEqual(invalidEmail.status, 400);
    assert.strictEqual(invalidEmail.body.code, 'VALIDATION_ERROR');
  });

  it('6. deactivating a staff makes their existing token fail with TOKEN_REVOKED and login fail with ACCOUNT_DISABLED', async () => {
    // 1. Cashier logs in with current password to get an active token
    const loginRes = await api('/api/v1/ops/auth/login', {
      method: 'POST',
      body: { username: 'thu_ngan_01@saomai.vn', password: 'StrongPassword123' }
    });
    assert.strictEqual(loginRes.status, 200);
    const activeCashierToken = loginRes.body.data.token;

    // Verify token currently works
    const checkActive = await api('/api/v1/ops/bookings', { token: activeCashierToken });
    assert.strictEqual(checkActive.status, 200);

    // 2. Director deactivates the cashier account
    const deactRes = await api(`/api/v1/ops/staff/${createdCashier.user_id}`, {
      method: 'PATCH',
      token: directorToken,
      body: { active: false }
    });
    assert.strictEqual(deactRes.status, 200);
    assert.strictEqual(deactRes.body.data.staff.active, false);

    // 3. Existing token fails with 401 TOKEN_REVOKED
    const revokedRes = await api('/api/v1/ops/bookings', { token: activeCashierToken });
    assert.strictEqual(revokedRes.status, 401);
    assert.strictEqual(revokedRes.body.code, 'TOKEN_REVOKED');
    assert.strictEqual(revokedRes.body.message, 'Phiên đăng nhập đã hết hiệu lực, vui lòng đăng nhập lại');

    // 4. Cashier tries to log in -> fails with 403 ACCOUNT_DISABLED
    const disabledLogin = await api('/api/v1/ops/auth/login', {
      method: 'POST',
      body: { username: 'thu_ngan_01@saomai.vn', password: 'StrongPassword123' }
    });
    assert.strictEqual(disabledLogin.status, 403);
    assert.strictEqual(disabledLogin.body.code, 'ACCOUNT_DISABLED');
    assert.strictEqual(disabledLogin.body.message, 'Tài khoản đã bị khóa. Liên hệ giám đốc nhà xe.');

    // 5. Director reactivates the cashier
    const reactRes = await api(`/api/v1/ops/staff/${createdCashier.user_id}`, {
      method: 'PATCH',
      token: directorToken,
      body: { active: true }
    });
    assert.strictEqual(reactRes.status, 200);
    assert.strictEqual(reactRes.body.data.staff.active, true);

    // Cashier can log in again with new session
    const okLogin = await api('/api/v1/ops/auth/login', {
      method: 'POST',
      body: { username: 'thu_ngan_01@saomai.vn', password: 'StrongPassword123' }
    });
    assert.strictEqual(okLogin.status, 200);
  });

  it('7. password change revokes old tokens', async () => {
    // 1. Cashier logs in to get session A
    const loginA = await api('/api/v1/ops/auth/login', {
      method: 'POST',
      body: { username: 'thu_ngan_01@saomai.vn', password: 'StrongPassword123' }
    });
    assert.strictEqual(loginA.status, 200);
    const tokenA = loginA.body.data.token;

    // Verify token A works
    const checkA = await api('/api/v1/ops/bookings', { token: tokenA });
    assert.strictEqual(checkA.status, 200);

    // 2. Cashier changes password
    const changeRes = await api('/api/v1/ops/auth/change-password', {
      method: 'POST',
      token: tokenA,
      body: { current_password: 'StrongPassword123', new_password: 'EvenStrongerPassword456' }
    });
    assert.strictEqual(changeRes.status, 200);
    assert.ok(changeRes.body.data.token, 'the page that changed the password gets a new token');

    // 3. Old token A is now revoked
    const afterChangeA = await api('/api/v1/ops/bookings', { token: tokenA });
    assert.strictEqual(afterChangeA.status, 401);
    assert.strictEqual(afterChangeA.body.code, 'TOKEN_REVOKED');

    // 4. Old password fails
    const oldLogin = await api('/api/v1/ops/auth/login', {
      method: 'POST',
      body: { username: 'thu_ngan_01@saomai.vn', password: 'StrongPassword123' }
    });
    assert.strictEqual(oldLogin.status, 401);

    // 5. New password works and gets a valid token
    const newLogin = await api('/api/v1/ops/auth/login', {
      method: 'POST',
      body: { username: 'thu_ngan_01@saomai.vn', password: 'EvenStrongerPassword456' }
    });
    assert.strictEqual(newLogin.status, 200);
    const tokenB = newLogin.body.data.token;
    const checkB = await api('/api/v1/ops/bookings', { token: tokenB });
    assert.strictEqual(checkB.status, 200);
  });

  it('8. driver PIN reset revokes the driver\'s old token', async () => {
    // 1. Driver logs in to get driverToken
    const driverLogin = await api('/api/v1/driver/auth/login', {
      method: 'POST',
      operatorCode: 'SAOMAI',
      body: { staffIdOrPhone: 'TX8821', pin: '123456' }
    });
    assert.strictEqual(driverLogin.status, 200);
    const driverToken = driverLogin.body.data.token;

    // Verify driverToken works on driver endpoints
    const tripsBefore = await api('/api/v1/driver/trips/today', { token: driverToken });
    assert.strictEqual(tripsBefore.status, 200);

    // 2. Director resets the driver PIN
    const resetRes = await api('/api/v1/ops/drivers/drv_8821a/reset-pin', {
      method: 'POST',
      token: directorToken
    });
    assert.strictEqual(resetRes.status, 200);
    const tempPin = resetRes.body.data.temporary_pin;
    assert.ok(tempPin);

    // 3. Old driverToken is now rejected with 401 TOKEN_REVOKED
    const tripsAfter = await api('/api/v1/driver/trips/today', { token: driverToken });
    assert.strictEqual(tripsAfter.status, 401);
    assert.strictEqual(tripsAfter.body.code, 'TOKEN_REVOKED');
    assert.strictEqual(tripsAfter.body.message, 'Phiên đăng nhập đã hết hiệu lực, vui lòng đăng nhập lại');

    // 4. Driver logs in with tempPin -> gets new token and must_change_pin true
    const newDriverLogin = await api('/api/v1/driver/auth/login', {
      method: 'POST',
      operatorCode: 'SAOMAI',
      body: { staffIdOrPhone: 'TX8821', pin: tempPin }
    });
    assert.strictEqual(newDriverLogin.status, 200);
    assert.strictEqual(newDriverLogin.body.data.driver.must_change_pin, true);
  });
});
