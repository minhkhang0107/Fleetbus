import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { createFleetBusServer } from '../../source/server/apiServer.js';

describe('Driver Accounts & Lifecycle (MGR-015, MGR-016, DRI-001)', () => {
  let server;
  let baseUrl;
  let request;
  let dispToken;
  let cashToken;
  let xvToken;

  let createdDriver;
  let initialTempPin;
  let currentDriverToken;
  let currentTempPin;

  before(async () => {
    const instance = createFleetBusServer();
    server = instance.server;
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;
    baseUrl = `http://localhost:${port}/api/v1`;

    request = async (method, path, { token = null, operatorCode = null, body = null, idempotencyKey = null } = {}) => {
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      if (operatorCode) headers['X-Operator-Code'] = operatorCode;
      if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

      const opts = { method, headers };
      if (body) opts.body = JSON.stringify(body);

      const res = await fetch(`${baseUrl}${path}`, opts);
      const data = await res.json().catch(() => null);
      return { status: res.status, data };
    };

    // Staff Logins: Dispatcher & Cashier (Sao Mai) and Dispatcher (Xuyen Viet)
    const dispLogin = await request('POST', '/auth/staff/login', {
      body: { username: 'dispatcher@busgo.vn', password: 'disp123' }
    });
    assert.strictEqual(dispLogin.status, 200);
    dispToken = dispLogin.data.data.token;

    const cashLogin = await request('POST', '/auth/staff/login', {
      body: { username: 'cashier@busgo.vn', password: 'cash123' }
    });
    assert.strictEqual(cashLogin.status, 200);
    cashToken = cashLogin.data.data.token;

    const xvLogin = await request('POST', '/auth/staff/login', {
      body: { username: 'dispatcher@xuyenviet.vn', password: 'xv123' }
    });
    assert.strictEqual(xvLogin.status, 200);
    xvToken = xvLogin.data.data.token;
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('roles: dispatcher allowed and cashier 403', async () => {
    const cashGet = await request('GET', '/ops/drivers', { token: cashToken });
    assert.strictEqual(cashGet.status, 403);
    assert.strictEqual(cashGet.data.code, 'FORBIDDEN');

    const cashPost = await request('POST', '/ops/drivers', {
      token: cashToken,
      idempotencyKey: 'idem-cash-01',
      body: { full_name: 'Nguyễn Văn Test', phone: '0981234567', license_class: 'FC', license_expiry: '2028-12-31' }
    });
    assert.strictEqual(cashPost.status, 403);

    const cashPatch = await request('PATCH', '/ops/drivers/drv_8821a', {
      token: cashToken,
      body: { full_name: 'Trần Văn Bình Mới' }
    });
    assert.strictEqual(cashPatch.status, 403);

    const cashReset = await request('POST', '/ops/drivers/drv_8821a/reset-pin', {
      token: cashToken,
      idempotencyKey: 'idem-cash-02'
    });
    assert.strictEqual(cashReset.status, 403);

    const dispGet = await request('GET', '/ops/drivers', { token: dispToken });
    assert.strictEqual(dispGet.status, 200);
  });

  it('list has no pin hash: GET /ops/drivers never contains pin hash', async () => {
    const dispGet = await request('GET', '/ops/drivers', { token: dispToken });
    assert.strictEqual(dispGet.status, 200);
    assert.ok(Array.isArray(dispGet.data.data));
    for (const d of dispGet.data.data) {
      assert.ok(d.driver_id, 'driver_id must exist');
      assert.ok(d.staff_id, 'staff_id must exist');
      assert.ok(d.full_name, 'full_name must exist');
      assert.ok(d.phone, 'phone must exist');
      assert.ok(d.license_class, 'license_class must exist');
      assert.ok(d.license_expiry, 'license_expiry must exist');
      assert.ok(['ACTIVE', 'LOCKED'].includes(d.status), 'status must be ACTIVE or LOCKED');
      assert.strictEqual(typeof d.must_change_pin, 'boolean');
      assert.strictEqual(typeof d.license_expired, 'boolean');
      assert.strictEqual(d.pin, undefined, 'never return PIN hash');
      assert.strictEqual(d.password_hash, undefined, 'never return password_hash');
    }
    assert.ok(!JSON.stringify(dispGet.data).includes('scrypt'), 'PIN hash must never be in list response');
  });

  it('validation 400: invalid name, phone, class, expiry date, or staff id', async () => {
    const badName = await request('POST', '/ops/drivers', {
      token: dispToken,
      idempotencyKey: 'idem-val-01',
      body: { full_name: '1234', phone: '0981112233', license_class: 'FC', license_expiry: '2028-12-31' }
    });
    assert.strictEqual(badName.status, 400);

    const badPhone = await request('POST', '/ops/drivers', {
      token: dispToken,
      idempotencyKey: 'idem-val-02',
      body: { full_name: 'Nguyễn Văn A', phone: '123456', license_class: 'FC', license_expiry: '2028-12-31' }
    });
    assert.strictEqual(badPhone.status, 400);

    const badClass = await request('POST', '/ops/drivers', {
      token: dispToken,
      idempotencyKey: 'idem-val-03',
      body: { full_name: 'Nguyễn Văn A', phone: '0981112233', license_class: 'A1', license_expiry: '2028-12-31' }
    });
    assert.strictEqual(badClass.status, 400);

    const badExpiryDate = await request('POST', '/ops/drivers', {
      token: dispToken,
      idempotencyKey: 'idem-val-04',
      body: { full_name: 'Nguyễn Văn A', phone: '0981112233', license_class: 'FC', license_expiry: 'invalid-date' }
    });
    assert.strictEqual(badExpiryDate.status, 400);

    const pastExpiry = await request('POST', '/ops/drivers', {
      token: dispToken,
      idempotencyKey: 'idem-val-05',
      body: { full_name: 'Nguyễn Văn A', phone: '0981112233', license_class: 'FC', license_expiry: '2020-01-01' }
    });
    assert.strictEqual(pastExpiry.status, 400);

    const badStaffId = await request('POST', '/ops/drivers', {
      token: dispToken,
      idempotencyKey: 'idem-val-06',
      body: { full_name: 'Nguyễn Văn A', phone: '0981112233', staff_id: 'ab', license_class: 'FC', license_expiry: '2028-12-31' }
    });
    assert.strictEqual(badStaffId.status, 400);
  });

  it('create + first login: generated staff id, temp PIN works once, must_change_pin true, endpoints blocked until change-pin', async () => {
    const createRes = await request('POST', '/ops/drivers', {
      token: dispToken,
      idempotencyKey: 'idem-create-01',
      body: {
        full_name: 'Nguyễn Hải Đăng',
        phone: '0981122334',
        license_class: 'FC',
        license_expiry: '2029-06-30'
      }
    });
    assert.strictEqual(createRes.status, 201);
    assert.strictEqual(createRes.data.status, 'success');
    createdDriver = createRes.data.data.driver;
    initialTempPin = createRes.data.data.temporary_pin;
    currentTempPin = initialTempPin;

    assert.ok(createdDriver.driver_id.startsWith('drv_'));
    assert.strictEqual(createdDriver.driver_id.length, 12); // drv_ + 8 hex
    assert.ok(/^TX[0-9]{4}$/.test(createdDriver.staff_id), 'staff_id must be TX + 4 digits');
    assert.strictEqual(createdDriver.full_name, 'Nguyễn Hải Đăng');
    assert.strictEqual(createdDriver.phone, '0981122334');
    assert.strictEqual(createdDriver.license_class, 'FC');
    assert.strictEqual(createdDriver.license_expiry, '2029-06-30');
    assert.strictEqual(createdDriver.status, 'ACTIVE');
    assert.strictEqual(createdDriver.must_change_pin, true);
    assert.strictEqual(createdDriver.license_expired, false);
    assert.strictEqual(createdDriver.pin, undefined);
    assert.ok(/^[0-9]{6}$/.test(initialTempPin), 'temporary_pin must be 6 digits');

    // First login with temporary PIN
    const driverLoginRes = await request('POST', '/driver/auth/login', {
      body: { staffIdOrPhone: createdDriver.staff_id, pin: initialTempPin }
    });
    assert.strictEqual(driverLoginRes.status, 200);
    assert.strictEqual(driverLoginRes.data.data.driver.must_change_pin, true);
    currentDriverToken = driverLoginRes.data.data.token;

    // While must_change_pin is true, other endpoints return 403 PIN_CHANGE_REQUIRED
    const tripsBlocked = await request('GET', '/driver/trips/today', { token: currentDriverToken });
    assert.strictEqual(tripsBlocked.status, 403);
    assert.strictEqual(tripsBlocked.data.code, 'PIN_CHANGE_REQUIRED');
    assert.strictEqual(tripsBlocked.data.message, 'Đổi mã PIN tạm trước khi dùng app');

    const tripDetailBlocked = await request('GET', '/driver/trips/trp_991823', { token: currentDriverToken });
    assert.strictEqual(tripDetailBlocked.status, 403);
    assert.strictEqual(tripDetailBlocked.data.code, 'PIN_CHANGE_REQUIRED');
  });

  it('duplicates 409: duplicate phone and staff_id rejected within company', async () => {
    const dupPhone = await request('POST', '/ops/drivers', {
      token: dispToken,
      idempotencyKey: 'idem-dup-01',
      body: {
        full_name: 'Lê Văn Khác',
        phone: '0981122334', // same phone as createdDriver
        license_class: 'FC',
        license_expiry: '2029-06-30'
      }
    });
    assert.strictEqual(dupPhone.status, 409);
    assert.strictEqual(dupPhone.data.code, 'DRIVER_EXISTS');

    const dupStaffId = await request('POST', '/ops/drivers', {
      token: dispToken,
      idempotencyKey: 'idem-dup-02',
      body: {
        full_name: 'Lê Văn Khác',
        phone: '0989988776',
        staff_id: createdDriver.staff_id, // same staff_id as createdDriver
        license_class: 'FC',
        license_expiry: '2029-06-30'
      }
    });
    assert.strictEqual(dupStaffId.status, 409);
    assert.strictEqual(dupStaffId.data.code, 'DRIVER_EXISTS');
  });

  it('PIN change rules: weak PINs refused, wrong current PIN counts as failed attempt and lockouts', async () => {
    const weakPins = [
      currentTempPin, // same as current PIN
      '111111', // all same digit
      '000000', // zeroes
      '123456', // ascending run
      '654321', // descending run
      '12345',  // 5 digits
      '1234567', // 7 digits
      'abcdef'  // non-digit
    ];
    for (const wp of weakPins) {
      const weakRes = await request('POST', '/driver/auth/change-pin', {
        token: currentDriverToken,
        idempotencyKey: `idem-weak-${wp}`,
        body: { current_pin: currentTempPin, new_pin: wp }
      });
      assert.strictEqual(weakRes.status, 400, `weak PIN ${wp} must be refused`);
    }

    // Wrong current PIN counts as failed login attempt (lockout after 5 fails)
    for (let i = 0; i < 4; i++) {
      const wrongPinRes = await request('POST', '/driver/auth/change-pin', {
        token: currentDriverToken,
        idempotencyKey: `idem-wrong-${i}`,
        body: { current_pin: '000111', new_pin: '849201' }
      });
      assert.strictEqual(wrongPinRes.status, 400);
      assert.strictEqual(wrongPinRes.data.code, 'INVALID_CREDENTIALS');
    }

    // 5th wrong attempt triggers lockout
    const fifthFail = await request('POST', '/driver/auth/change-pin', {
      token: currentDriverToken,
      idempotencyKey: 'idem-wrong-4',
      body: { current_pin: '000111', new_pin: '849201' }
    });
    assert.strictEqual(fifthFail.status, 400);

    // Login is now locked out (429 ACCOUNT_LOCKED)
    const lockedLogin = await request('POST', '/driver/auth/login', {
      body: { staffIdOrPhone: createdDriver.staff_id, pin: currentTempPin }
    });
    assert.strictEqual(lockedLogin.status, 429);
    assert.strictEqual(lockedLogin.data.code, 'ACCOUNT_LOCKED');
  });

  it('reset-pin: clears lockout, generates new temp PIN, after change old temp fails and new works', async () => {
    const resetRes = await request('POST', `/ops/drivers/${createdDriver.driver_id}/reset-pin`, {
      token: dispToken,
      idempotencyKey: 'idem-reset-01'
    });
    assert.strictEqual(resetRes.status, 200);
    assert.ok(resetRes.data.data.temporary_pin);
    const newTempPin = resetRes.data.data.temporary_pin;
    assert.ok(/^[0-9]{6}$/.test(newTempPin));

    // Old temp PIN no longer works
    const oldLogin = await request('POST', '/driver/auth/login', {
      body: { staffIdOrPhone: createdDriver.staff_id, pin: initialTempPin }
    });
    assert.strictEqual(oldLogin.status, 401);

    // New temp PIN logs in successfully (lockout cleared)
    const newLogin = await request('POST', '/driver/auth/login', {
      body: { staffIdOrPhone: createdDriver.staff_id, pin: newTempPin }
    });
    assert.strictEqual(newLogin.status, 200);
    assert.strictEqual(newLogin.data.data.driver.must_change_pin, true);
    currentDriverToken = newLogin.data.data.token;
    currentTempPin = newTempPin;

    // Successful PIN Change
    const changeRes = await request('POST', '/driver/auth/change-pin', {
      token: currentDriverToken,
      idempotencyKey: 'idem-change-01',
      body: { current_pin: newTempPin, new_pin: '849201' }
    });
    assert.strictEqual(changeRes.status, 200);
    assert.strictEqual(changeRes.data.status, 'success');
    // The change ends the old session; the app goes on with the token it gets back.
    const oldSession = await request('GET', '/driver/trips/today', { token: currentDriverToken });
    assert.strictEqual(oldSession.status, 401);
    assert.strictEqual(oldSession.data.code, 'TOKEN_REVOKED');
    currentDriverToken = changeRes.data.data.token;

    // After change, driver can access endpoints
    const tripsAllowed = await request('GET', '/driver/trips/today', { token: currentDriverToken });
    assert.strictEqual(tripsAllowed.status, 200);

    // Old temp PIN fails at login
    const oldTempLogin = await request('POST', '/driver/auth/login', {
      body: { staffIdOrPhone: createdDriver.staff_id, pin: newTempPin }
    });
    assert.strictEqual(oldTempLogin.status, 401);

    // New PIN works at login, must_change_pin is false
    const newPinLogin = await request('POST', '/driver/auth/login', {
      body: { staffIdOrPhone: createdDriver.staff_id, pin: '849201' }
    });
    assert.strictEqual(newPinLogin.status, 200);
    assert.strictEqual(newPinLogin.data.data.driver.must_change_pin, false);
    currentDriverToken = newPinLogin.data.data.token;
  });

  it('lock/unlock + assignment: locked driver gets 403 DRIVER_LOCKED, unassignable, unlocked works', async () => {
    // Lock driver
    const lockRes = await request('PATCH', `/ops/drivers/${createdDriver.driver_id}`, {
      token: dispToken,
      body: { status: 'LOCKED' }
    });
    assert.strictEqual(lockRes.status, 200);
    assert.strictEqual(lockRes.data.data.status, 'LOCKED');

    // Login gets 403 DRIVER_LOCKED
    const lockedDriverLogin = await request('POST', '/driver/auth/login', {
      body: { staffIdOrPhone: createdDriver.staff_id, pin: '849201' }
    });
    assert.strictEqual(lockedDriverLogin.status, 403);
    assert.strictEqual(lockedDriverLogin.data.code, 'DRIVER_LOCKED');
    assert.strictEqual(lockedDriverLogin.data.message, 'Tài khoản đã bị nhà xe khóa. Liên hệ điều độ.');

    // In assign options, driver is listed but available: false with reason "Tài xế đã bị khóa"
    const assignOptions = await request('GET', '/ops/trips/trp_hn_th_01/assign-options', { token: dispToken });
    assert.strictEqual(assignOptions.status, 200);
    const lockedOption = assignOptions.data.data.drivers.find(d => d.driver_id === createdDriver.driver_id);
    assert.ok(lockedOption, 'locked driver must be listed in assign options');
    assert.strictEqual(lockedOption.available, false);
    assert.strictEqual(lockedOption.reason, 'Tài xế đã bị khóa');

    // Assigning locked driver fails
    const assignAttempt = await request('POST', '/ops/trips/trp_hn_th_01/assign', {
      token: dispToken,
      idempotencyKey: 'idem-assign-locked',
      body: { vehicleId: 'veh_04', driverId: createdDriver.driver_id }
    });
    assert.strictEqual(assignAttempt.status, 409);
    assert.strictEqual(assignAttempt.data.code, 'DRIVER_UNAVAILABLE');
    assert.strictEqual(assignAttempt.data.message, 'Tài xế đã bị khóa');

    // Unlock driver
    const unlockRes = await request('PATCH', `/ops/drivers/${createdDriver.driver_id}`, {
      token: dispToken,
      body: { status: 'ACTIVE' }
    });
    assert.strictEqual(unlockRes.status, 200);
    assert.strictEqual(unlockRes.data.data.status, 'ACTIVE');

    // Driver login succeeds again
    const unlockedLogin = await request('POST', '/driver/auth/login', {
      body: { staffIdOrPhone: createdDriver.staff_id, pin: '849201' }
    });
    assert.strictEqual(unlockedLogin.status, 200);
  });

  it('other company 404: PATCH and reset-pin return 404 DRIVER_NOT_FOUND for other company driver', async () => {
    const otherCompanyPatch = await request('PATCH', `/ops/drivers/${createdDriver.driver_id}`, {
      token: xvToken,
      body: { full_name: 'Tên Hacker' }
    });
    assert.strictEqual(otherCompanyPatch.status, 404);
    assert.strictEqual(otherCompanyPatch.data.code, 'DRIVER_NOT_FOUND');

    const otherCompanyReset = await request('POST', `/ops/drivers/${createdDriver.driver_id}/reset-pin`, {
      token: xvToken,
      idempotencyKey: 'idem-xv-reset'
    });
    assert.strictEqual(otherCompanyReset.status, 404);
    assert.strictEqual(otherCompanyReset.data.code, 'DRIVER_NOT_FOUND');

    // Verify audit logs
    const auditRes = await request('GET', '/ops/audit-logs', { token: dispToken });
    assert.strictEqual(auditRes.status, 200);
    const logs = auditRes.data.data.audit_logs;
    const actions = logs.map(l => l.action);

    assert.ok(actions.includes('DRIVER_CREATE'), 'audit must contain DRIVER_CREATE');
    assert.ok(actions.includes('DRIVER_LOCK'), 'audit must contain DRIVER_LOCK');
    assert.ok(actions.includes('DRIVER_UNLOCK'), 'audit must contain DRIVER_UNLOCK');
    assert.ok(actions.includes('DRIVER_PIN_RESET'), 'audit must contain DRIVER_PIN_RESET');

    // Ensure NO PIN appears in any audit log entry
    assert.ok(!JSON.stringify(logs).includes(initialTempPin), 'audit must never contain initial temporary pin');
    assert.ok(!JSON.stringify(logs).includes('849201'), 'audit must never contain driver pin');
    assert.ok(!JSON.stringify(logs).includes('scrypt'), 'audit must never contain pin hash');
  });
});
