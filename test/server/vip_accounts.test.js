import test from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { createFleetBusServer } from '../../source/server/apiServer.js';
import { VIP_PASSENGER_PHONE, VIP_PASSENGER_OTP, isVipPassengerPhone, DEV_TOTP_SECRET } from '../../source/server/config.js';
import { generateTotp } from '../../source/server/core/totp.js';
import { PassengerAuthService } from '../../source/server/services/passenger/modules/auth.js';

function decodePayload(token) {
  const withoutPrefix = token.replace(/^pax_jwt_/, '');
  const [bodyB64] = withoutPrefix.split('.');
  return JSON.parse(Buffer.from(bodyB64, 'base64url').toString('utf8'));
}

test('TC-VIP: VIP passenger account lifecycle and permissions', async (t) => {
  const { server, services } = createFleetBusServer({ authMode: 'enforce', webhookSecret: null });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  const call = async (path, { method = 'GET', body, token, operatorCode = 'SAOMAI' } = {}) => {
    const h = { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() };
    if (operatorCode) h['X-Operator-Code'] = operatorCode;
    if (token) h.Authorization = `Bearer ${token}`;
    const res = await fetch(`${base}${path}`, {
      method,
      headers: h,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    return { status: res.status, json: await res.json() };
  };

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    services.tenantDbs?.close();
  });

  await t.test('TC-VIP-01: VIP phone logs in with OTP 888777 for SAOMAI and for XUYENVIET', async () => {
    // 1. SAOMAI login
    const reqSaomai = await call('/api/v1/auth/passenger/otp/request', {
      method: 'POST',
      body: { phone: VIP_PASSENGER_PHONE },
      operatorCode: 'SAOMAI'
    });
    assert.strictEqual(reqSaomai.status, 200, JSON.stringify(reqSaomai.json));
    assert.strictEqual(reqSaomai.json.data.mock_otp, VIP_PASSENGER_OTP);

    const verSaomai = await call('/api/v1/auth/passenger/otp/verify', {
      method: 'POST',
      body: { phone: VIP_PASSENGER_PHONE, otp: VIP_PASSENGER_OTP },
      operatorCode: 'SAOMAI'
    });
    assert.strictEqual(verSaomai.status, 200, JSON.stringify(verSaomai.json));
    assert.strictEqual(verSaomai.json.data.user.phone, VIP_PASSENGER_PHONE);
    assert.strictEqual(verSaomai.json.data.user.is_vip, true);
    assert.strictEqual(verSaomai.json.data.user.full_name, 'Khách VIP BusGo');
    assert.strictEqual(verSaomai.json.data.user.operator_id, 'op_saomai');

    const payloadSaomai = decodePayload(verSaomai.json.data.token);
    assert.strictEqual(payloadSaomai.vip, true);
    assert.strictEqual(payloadSaomai.operator_id, 'op_saomai');
    assert.strictEqual(payloadSaomai.phone, VIP_PASSENGER_PHONE);
    assert.strictEqual(payloadSaomai.kind, 'passenger');

    const profSaomai = await call('/api/v1/passenger/profile', {
      token: verSaomai.json.data.token,
      operatorCode: 'SAOMAI'
    });
    assert.strictEqual(profSaomai.status, 200);
    assert.strictEqual(profSaomai.json.data.is_vip, true);
    assert.strictEqual(profSaomai.json.data.full_name, 'Khách VIP BusGo');

    // 2. XUYENVIET login
    const reqXv = await call('/api/v1/auth/passenger/otp/request', {
      method: 'POST',
      body: { phone: VIP_PASSENGER_PHONE },
      operatorCode: 'XUYENVIET'
    });
    assert.strictEqual(reqXv.status, 200, JSON.stringify(reqXv.json));
    assert.strictEqual(reqXv.json.data.mock_otp, VIP_PASSENGER_OTP);

    const verXv = await call('/api/v1/auth/passenger/otp/verify', {
      method: 'POST',
      body: { phone: VIP_PASSENGER_PHONE, otp: VIP_PASSENGER_OTP },
      operatorCode: 'XUYENVIET'
    });
    assert.strictEqual(verXv.status, 200, JSON.stringify(verXv.json));
    assert.strictEqual(verXv.json.data.user.phone, VIP_PASSENGER_PHONE);
    assert.strictEqual(verXv.json.data.user.is_vip, true);
    assert.strictEqual(verXv.json.data.user.full_name, 'Khách VIP BusGo');
    assert.strictEqual(verXv.json.data.user.operator_id, 'op_xuyenviet');

    const payloadXv = decodePayload(verXv.json.data.token);
    assert.strictEqual(payloadXv.vip, true);
    assert.strictEqual(payloadXv.operator_id, 'op_xuyenviet');
    assert.strictEqual(payloadXv.phone, VIP_PASSENGER_PHONE);
    assert.strictEqual(payloadXv.kind, 'passenger');

    const profXv = await call('/api/v1/passenger/profile', {
      token: verXv.json.data.token,
      operatorCode: 'XUYENVIET'
    });
    assert.strictEqual(profXv.status, 200);
    assert.strictEqual(profXv.json.data.is_vip, true);
    assert.strictEqual(profXv.json.data.full_name, 'Khách VIP BusGo');
  });

  await t.test('TC-VIP-02: Normal phone gets is_vip false, no vip token claim, and OTP 888777 is refused', async () => {
    const normalPhone = '0912000777';
    const reqNormal = await call('/api/v1/auth/passenger/otp/request', {
      method: 'POST',
      body: { phone: normalPhone },
      operatorCode: 'SAOMAI'
    });
    assert.strictEqual(reqNormal.status, 200, JSON.stringify(reqNormal.json));
    const randomOtp = reqNormal.json.data.mock_otp;
    assert.ok(randomOtp && randomOtp.length === 6);

    // Refuse fixed VIP OTP 888777 unless it matches the generated random OTP
    if (randomOtp !== VIP_PASSENGER_OTP) {
      const badVerify = await call('/api/v1/auth/passenger/otp/verify', {
        method: 'POST',
        body: { phone: normalPhone, otp: VIP_PASSENGER_OTP },
        operatorCode: 'SAOMAI'
      });
      assert.strictEqual(badVerify.status, 400);
      assert.strictEqual(badVerify.json.code, 'INVALID_OTP');
    }

    // Login with the actual mock OTP
    const verNormal = await call('/api/v1/auth/passenger/otp/verify', {
      method: 'POST',
      body: { phone: normalPhone, otp: randomOtp },
      operatorCode: 'SAOMAI'
    });
    assert.strictEqual(verNormal.status, 200, JSON.stringify(verNormal.json));
    assert.strictEqual(verNormal.json.data.user.is_vip, false);
    assert.strictEqual(verNormal.json.data.user.full_name, 'Hành khách BusGo');

    const payload = decodePayload(verNormal.json.data.token);
    assert.strictEqual(payload.vip, undefined);
    assert.strictEqual('vip' in payload, false);

    const prof = await call('/api/v1/passenger/profile', {
      token: verNormal.json.data.token,
      operatorCode: 'SAOMAI'
    });
    assert.strictEqual(prof.status, 200);
    assert.strictEqual(prof.json.data.is_vip, false);
  });

  await t.test('TC-VIP-03: Normal paying passenger 0912345678 remains unchanged', async () => {
    const stdPhone = '0912345678';
    const reqStd = await call('/api/v1/auth/passenger/otp/request', {
      method: 'POST',
      body: { phone: stdPhone },
      operatorCode: 'SAOMAI'
    });
    assert.strictEqual(reqStd.status, 200);
    assert.strictEqual(reqStd.json.data.mock_otp, '882199');

    const verStd = await call('/api/v1/auth/passenger/otp/verify', {
      method: 'POST',
      body: { phone: stdPhone, otp: '882199' },
      operatorCode: 'SAOMAI'
    });
    assert.strictEqual(verStd.status, 200);
    assert.strictEqual(verStd.json.data.user.full_name, 'Nguyễn Văn An');
    assert.strictEqual(verStd.json.data.user.is_vip, false);

    const payload = decodePayload(verStd.json.data.token);
    assert.strictEqual(payload.vip, undefined);
    assert.strictEqual('vip' in payload, false);
  });

  await t.test('TC-VIP-04: In production, 0999888777 is never VIP and has no fixed OTP', () => {
    const originalEnv = process.env.NODE_ENV;
    const originalTokenSecret = process.env.FLEETBUS_TOKEN_SECRET;
    try {
      process.env.NODE_ENV = 'production';
      process.env.FLEETBUS_TOKEN_SECRET = 'test_token_secret_for_production';
      assert.strictEqual(isVipPassengerPhone('0999888777'), false);
      assert.strictEqual(isVipPassengerPhone(VIP_PASSENGER_PHONE), false);

      const prodAuth = new PassengerAuthService();
      const reqRes = prodAuth.requestOTP('0999888777');
      assert.strictEqual(reqRes.success, true);
      assert.strictEqual(reqRes.data.mock_otp, undefined, 'no mock_otp in production');

      const cacheKey = `op_saomai:0999888777`;
      const generatedOtp = prodAuth.otpStore.get(cacheKey)?.otp;
      if (generatedOtp !== '888777') {
        const verRes = prodAuth.verifyOTP('0999888777', '888777');
        assert.strictEqual(verRes.success, false);
        assert.strictEqual(verRes.code, 'INVALID_OTP');
      }

      if (generatedOtp) {
        const verReal = prodAuth.verifyOTP('0999888777', generatedOtp);
        assert.strictEqual(verReal.success, true);
        assert.strictEqual(verReal.data.user.is_vip, false);
        assert.strictEqual(verReal.data.user.full_name, 'Hành khách BusGo');
        const payload = decodePayload(verReal.data.token);
        assert.strictEqual(payload.vip, undefined);
        assert.strictEqual('vip' in payload, false);
      }
    } finally {
      if (originalEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = originalEnv;
      }
      if (originalTokenSecret === undefined) {
        delete process.env.FLEETBUS_TOKEN_SECRET;
      } else {
        process.env.FLEETBUS_TOKEN_SECRET = originalTokenSecret;
      }
    }
  });
});

test('TC-VIP: VIP passenger order pricing and zero-fare settlement', async (t) => {
  const { server, services } = createFleetBusServer({ authMode: 'enforce', webhookSecret: null });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  const call = async (path, { method = 'GET', body, token, operatorCode = 'SAOMAI' } = {}) => {
    const h = { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() };
    if (operatorCode) h['X-Operator-Code'] = operatorCode;
    if (token) h.Authorization = `Bearer ${token}`;
    const res = await fetch(`${base}${path}`, {
      method,
      headers: h,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    return { status: res.status, json: await res.json() };
  };

  const passengerLogin = async (phone, otp = null) => {
    const reqRes = await call('/api/v1/auth/passenger/otp/request', { method: 'POST', body: { phone } });
    const useOtp = otp || reqRes.json.data.mock_otp;
    const verRes = await call('/api/v1/auth/passenger/otp/verify', { method: 'POST', body: { phone, otp: useOtp } });
    return verRes.json.data.token;
  };

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    services.tenantDbs?.close();
  });

  await t.test('TC-VIP-05: VIP books 2 seats with insurance, voucher and home service: 0 đ, PAID at once, tickets issued, no voucher used, home fees 0', async () => {
    const vipToken = await passengerLogin(VIP_PASSENGER_PHONE, VIP_PASSENGER_OTP);
    const hold = await call('/api/v1/trips/trp_hn_th_01/seats/hold', {
      method: 'POST',
      token: vipToken,
      body: { seatCodes: ['A10', 'A11'] }
    });
    assert.strictEqual(hold.status, 200, JSON.stringify(hold.json));
    const holdId = hold.json.data.hold_id;

    const bookRes = await call('/api/v1/bookings/create', {
      method: 'POST',
      token: vipToken,
      body: {
        tripId: 'trp_hn_th_01',
        holdId,
        seatCodes: ['A10', 'A11'],
        voucherCode: 'BUSGO50K',
        insuranceSelected: true,
        homePickup: { address: '8 Ngọc Lâm, Long Biên', lat: 21.04, lng: 105.9 },
        homeDropoff: { address: 'Đại lộ Lê Lợi, TP Thanh Hóa', lat: 19.80, lng: 105.78 },
        payer: { full_name: 'Khách VIP BusGo', phone: VIP_PASSENGER_PHONE },
        passengers: [
          { seat_code: 'A10', full_name: 'Khách VIP Một' },
          { seat_code: 'A11', full_name: 'Khách VIP Hai' }
        ]
      }
    });

    assert.strictEqual(bookRes.status, 201, JSON.stringify(bookRes.json));
    const { order, payment } = bookRes.json.data;
    assert.strictEqual(payment.amount_vnd, 0);
    assert.strictEqual(order.price_breakdown.final_total_vnd, 0);
    assert.strictEqual(order.price_breakdown.seat_fare_unit, 0);
    assert.strictEqual(order.price_breakdown.subtotal_fare, 0);
    assert.strictEqual(order.price_breakdown.insurance_fare, 0);
    assert.strictEqual(order.price_breakdown.voucher_discount, 0);
    assert.strictEqual(order.home_service_fee_vnd, 0);
    assert.strictEqual(order.total_payment_vnd, 0);
    assert.strictEqual(order.vip, true);
    assert.strictEqual(order.free, true);
    assert.strictEqual(order.applied_voucher, null);

    const orderId = payment.order_id;
    const paidOrder = services.paymentService.orders.get(orderId);
    assert.ok(paidOrder);
    assert.strictEqual(paidOrder.payment_status, 'PAID');
    assert.strictEqual(paidOrder.ticket_ids.length, 2);
    assert.strictEqual(paidOrder.payment_ref, 'VIP_FREE');
    assert.strictEqual(paidOrder.home_pickup.fee_vnd, 0);
    assert.strictEqual(paidOrder.home_dropoff.fee_vnd, 0);

    for (const ticketId of paidOrder.ticket_ids) {
      const ticket = services.paymentService.tickets.get(ticketId);
      assert.strictEqual(ticket.fare_vnd, 0);
    }

    const redemption = services.tenantDbs.forOperator('op_saomai').prepare('SELECT * FROM voucher_redemptions WHERE order_id = ?').get(orderId);
    assert.strictEqual(redemption, undefined);
  });

  await t.test('TC-VIP-06: Normal passenger booking one seat on the same trip still pays the seat price (> 0) and stays PENDING_PAYMENT', async () => {
    const normalPhone = '0912000777';
    const normalToken = await passengerLogin(normalPhone);
    const hold = await call('/api/v1/trips/trp_hn_th_01/seats/hold', {
      method: 'POST',
      token: normalToken,
      body: { seatCodes: ['B04'] }
    });
    assert.strictEqual(hold.status, 200, JSON.stringify(hold.json));
    const holdId = hold.json.data.hold_id;

    const bookRes = await call('/api/v1/bookings/create', {
      method: 'POST',
      token: normalToken,
      body: {
        tripId: 'trp_hn_th_01',
        holdId,
        seatCodes: ['B04'],
        payer: { full_name: 'Nguyễn Văn Bình', phone: normalPhone },
        passengers: [{ seat_code: 'B04', full_name: 'Nguyễn Văn Bình' }]
      }
    });

    assert.strictEqual(bookRes.status, 201, JSON.stringify(bookRes.json));
    const { order, payment } = bookRes.json.data;
    assert.ok(payment.amount_vnd > 0);
    assert.strictEqual(payment.amount_vnd, 220000);
    assert.strictEqual(order.price_breakdown.final_total_vnd, 220000);
    assert.strictEqual(order.vip, undefined);
    assert.strictEqual(order.free, undefined);

    const normalOrder = services.paymentService.orders.get(payment.order_id);
    assert.ok(normalOrder);
    assert.strictEqual(normalOrder.payment_status, 'PENDING_PAYMENT');
    assert.strictEqual(normalOrder.ticket_ids.length, 0);
  });

  await t.test('TC-VIP-07: Forged-looking case: a normal passenger token (no vip claim) whose body payer.phone is 0999888777 still pays full price', async () => {
    const normalPhone = '0912345678';
    const normalToken = await passengerLogin(normalPhone, '882199');
    const hold = await call('/api/v1/trips/trp_hn_th_01/seats/hold', {
      method: 'POST',
      token: normalToken,
      body: { seatCodes: ['B05'] }
    });
    assert.strictEqual(hold.status, 200, JSON.stringify(hold.json));
    const holdId = hold.json.data.hold_id;

    const bookRes = await call('/api/v1/bookings/create', {
      method: 'POST',
      token: normalToken,
      body: {
        tripId: 'trp_hn_th_01',
        holdId,
        seatCodes: ['B05'],
        payer: { full_name: 'Khách Giả Mạo', phone: VIP_PASSENGER_PHONE },
        passengers: [{ seat_code: 'B05', full_name: 'Khách Giả Mạo' }]
      }
    });

    assert.strictEqual(bookRes.status, 201, JSON.stringify(bookRes.json));
    const { order, payment } = bookRes.json.data;
    assert.ok(payment.amount_vnd > 0);
    assert.strictEqual(payment.amount_vnd, 220000);
    assert.strictEqual(order.price_breakdown.final_total_vnd, 220000);
    assert.strictEqual(order.vip, undefined);
    assert.strictEqual(order.free, undefined);

    const forgedOrder = services.paymentService.orders.get(payment.order_id);
    assert.ok(forgedOrder);
    assert.strictEqual(forgedOrder.payment_status, 'PENDING_PAYMENT');
    assert.strictEqual(forgedOrder.ticket_ids.length, 0);
  });
});

test('TC-VIP: Ready-made test driver for newly created bus companies', async (t) => {
  const { server, services } = createFleetBusServer({ authMode: 'enforce', webhookSecret: null });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  const request = async (path, { method = 'GET', body, token, headers = {} } = {}) => {
    const h = { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID(), ...headers };
    if (token) h.Authorization = `Bearer ${token}`;
    const res = await fetch(`${base}${path}`, {
      method,
      headers: h,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not json */ }
    return { status: res.status, body: json, text };
  };

  const totp = () => generateTotp(DEV_TOTP_SECRET, Date.now());
  const staffLogin = (username, password, code = totp()) =>
    request('/api/v1/ops/auth/login', { method: 'POST', body: { username, password, totp: code } });

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    services.tenantDbs?.close();
  });

  const rootRes = await staffLogin('root@busgo.vn', 'root123');
  assert.strictEqual(rootRes.status, 200);
  const rootToken = rootRes.body.data.token;

  await t.test('TC-VIP-08: Non-production operator creation provisions test driver TX8821 / 123456 who can log in and call driver APIs without PIN change', async () => {
    const companyBody = {
      code: 'HOANGLONG',
      name: 'Nhà xe Hoàng Long',
      director_name: 'Đoàn Hoàng Long',
      director_email: 'director@hoanglong.vn',
      bank: { bin: '970422', bank_name: 'MB Bank', account_number: '0123456789', account_name: 'NHA XE HOANG LONG' }
    };

    const created = await request('/api/v1/platform/operators', {
      method: 'POST',
      token: rootToken,
      body: companyBody
    });

    assert.strictEqual(created.status, 201, JSON.stringify(created.body));
    assert.strictEqual(created.body.data.operator_id, 'op_hoanglong');
    assert.ok(created.body.data.test_driver, 'test_driver should be returned in response');
    assert.strictEqual(created.body.data.test_driver.staff_id, 'TX8821');
    assert.strictEqual(created.body.data.test_driver.pin, '123456');

    // Driver login with operator code HOANGLONG + TX8821 + 123456
    const driverLogin = await request('/api/v1/auth/driver/login', {
      method: 'POST',
      headers: { 'X-Operator-Code': 'HOANGLONG' },
      body: { staffIdOrPhone: 'TX8821', pin: '123456' }
    });
    assert.strictEqual(driverLogin.status, 200, JSON.stringify(driverLogin.body));
    assert.ok(driverLogin.body.data.token, 'login should return token');
    assert.strictEqual(driverLogin.body.data.driver.staff_id, 'TX8821');
    const driverToken = driverLogin.body.data.token;

    // Call GET /api/v1/driver/trips/today with the driver token -> 200 (not 403 PIN_CHANGE_REQUIRED)
    const tripsRes = await request('/api/v1/driver/trips/today', {
      method: 'GET',
      token: driverToken,
      headers: { 'X-Operator-Code': 'HOANGLONG' }
    });
    assert.strictEqual(tripsRes.status, 200, JSON.stringify(tripsRes.body));
    assert.ok(Array.isArray(tripsRes.body.data.trips));
  });

  await t.test('TC-VIP-09: In production, creating a company does not create test driver and has no test_driver field', async () => {
    const originalEnv = process.env.NODE_ENV;
    const originalTokenSecret = process.env.FLEETBUS_TOKEN_SECRET;
    try {
      process.env.NODE_ENV = 'production';
      process.env.FLEETBUS_TOKEN_SECRET = 'fleetbus_dev_only_token_secret';

      const prodCompany = {
        code: 'KIMCHI',
        name: 'Nhà xe Kim Chi',
        director_name: 'Nguyễn Kim Chi',
        director_email: 'director@kimchi.vn',
        bank: { bin: '970422', bank_name: 'MB Bank', account_number: '0987654321', account_name: 'NHA XE KIM CHI' }
      };

      const created = await request('/api/v1/platform/operators', {
        method: 'POST',
        token: rootToken,
        body: prodCompany
      });

      assert.strictEqual(created.status, 201, JSON.stringify(created.body));
      assert.strictEqual(created.body.data.operator_id, 'op_kimchi');
      assert.strictEqual(created.body.data.test_driver, undefined);
      assert.strictEqual('test_driver' in created.body.data, false);
    } finally {
      if (originalEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = originalEnv;
      }
      if (originalTokenSecret === undefined) {
        delete process.env.FLEETBUS_TOKEN_SECRET;
      } else {
        process.env.FLEETBUS_TOKEN_SECRET = originalTokenSecret;
      }
    }
  });
});


