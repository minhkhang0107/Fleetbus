import test from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { createFleetBusServer } from '../../source/server/apiServer.js';
import { VIP_PASSENGER_PHONE, VIP_PASSENGER_OTP, isVipPassengerPhone } from '../../source/server/config.js';
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
