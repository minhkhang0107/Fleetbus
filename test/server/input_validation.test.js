import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { createFleetBusServer } from '../../source/server/apiServer.js';
import { validatePersonName, normalizePlate } from '../../source/server/services/passenger/core/formatters.js';

describe('Input Validation Test Suite', () => {
  let server;
  let services;
  let baseUrl;
  let dispatcher;
  let cashier;
  let driver;
  let passengerToken;

  const request = async (path, { method = 'GET', body, token } = {}) => {
    const headers = { 'Content-Type': 'application/json', 'X-Operator-Code': 'SAOMAI' };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (method === 'POST') headers['Idempotency-Key'] = crypto.randomUUID();
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };

  before(async () => {
    ({ server, services } = createFleetBusServer({ authMode: 'enforce' }));
    await new Promise(resolve => server.listen(0, resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    dispatcher = (await request('/api/v1/ops/auth/login', {
      method: 'POST',
      body: { username: 'dispatcher@busgo.vn', password: 'disp123' }
    })).body.data.token;

    cashier = (await request('/api/v1/ops/auth/login', {
      method: 'POST',
      body: { username: 'cashier@busgo.vn', password: 'cash123' }
    })).body.data.token;

    driver = (await request('/api/v1/driver/auth/login', {
      method: 'POST',
      body: { staff_id: 'TX8821', pin: '123456' }
    })).body.data.token;

    const otpReq = await request('/api/v1/auth/passenger/otp/request', {
      method: 'POST',
      body: { phone: '0901234567' }
    });
    passengerToken = (await request('/api/v1/auth/passenger/otp/verify', {
      method: 'POST',
      body: { phone: '0901234567', otp: otpReq.body.data.mock_otp }
    })).body.data.token;
  });

  after(() => new Promise(resolve => server.close(resolve)));

  describe('1. Person names validation', () => {
    it('unit: "Lê Văn A" ok, collapses inner spaces', () => {
      const res = validatePersonName('   Lê   Văn   A   ');
      assert.strictEqual(res.isValid, true);
      assert.strictEqual(res.normalized, 'Lê Văn A');
      assert.strictEqual(res.message, null);
    });

    it('unit: "A" refused (length < 2)', () => {
      const res = validatePersonName('A');
      assert.strictEqual(res.isValid, false);
      assert.strictEqual(res.message, 'Họ tên cần 2-60 ký tự');
    });

    it('unit: name over 60 characters refused', () => {
      const longName = 'Nguyễn '.repeat(10);
      assert.ok(longName.length > 60);
      const res = validatePersonName(longName);
      assert.strictEqual(res.isValid, false);
      assert.strictEqual(res.message, 'Họ tên cần 2-60 ký tự');
    });

    it('unit: "12345" refused (contains digits)', () => {
      const res = validatePersonName('12345');
      assert.strictEqual(res.isValid, false);
      assert.strictEqual(res.message, 'Họ tên không được chứa số hoặc ký tự đặc biệt');
    });

    it('unit: "Nam<script>" refused (contains special characters)', () => {
      const res = validatePersonName('Nam<script>');
      assert.strictEqual(res.isValid, false);
      assert.strictEqual(res.message, 'Họ tên không được chứa số hoặc ký tự đặc biệt');
    });

    it('API: passenger booking refuses invalid names and stores normalized name', async () => {
      const holdRes = await request('/api/v1/trips/trp_hn_th_01/seats/hold', {
        method: 'POST',
        token: passengerToken,
        body: { seatCodes: ['A01'], userId: 'u_val_1' }
      });
      assert.strictEqual(holdRes.status, 200);
      const holdId = holdRes.body.data.hold_id;

      // Refuse "Nam<script>"
      const badRes = await request('/api/v1/bookings/create', {
        method: 'POST',
        token: passengerToken,
        body: {
          tripId: 'trp_hn_th_01',
          holdId,
          seatCodes: ['A01'],
          payer: { full_name: 'Nam<script>', phone: '0901234567' },
          passengers: [{ seat_code: 'A01', full_name: 'Nam<script>' }]
        }
      });
      assert.strictEqual(badRes.status, 400);
      assert.strictEqual(badRes.body.code, 'INVALID_PAYER_NAME');

      // Valid name with extra spaces is normalized and saved
      const okRes = await request('/api/v1/bookings/create', {
        method: 'POST',
        token: passengerToken,
        body: {
          tripId: 'trp_hn_th_01',
          holdId,
          seatCodes: ['A01'],
          payer: { full_name: '  Lê   Văn   A  ', phone: '0901234567' },
          passengers: [{ seat_code: 'A01', full_name: '  Lê   Văn   A  ' }]
        }
      });
      assert.strictEqual(okRes.status, 201);
      const order = services.paymentService.orders.get(okRes.body.data.payment.order_id);
      assert.strictEqual(order.payer.full_name, 'Lê Văn A');
      assert.strictEqual(order.passengers[0].full_name, 'Lê Văn A');
    });

    it('API: POS booking and hotline hold refuse invalid names and normalize valid names', async () => {
      // POS booking with 1-char name
      const badPos = await request('/api/v1/ops/pos/bookings', {
        method: 'POST',
        token: cashier,
        body: {
          tripId: 'trp_991823',
          passengerName: 'A',
          phone: '0912345678',
          seatCodes: ['A07']
        }
      });
      assert.strictEqual(badPos.status, 400);
      assert.strictEqual(badPos.body.code, 'VALIDATION_ERROR');
      assert.strictEqual(badPos.body.message, 'Họ tên cần 2-60 ký tự');

      // POS booking with valid name
      const okPos = await request('/api/v1/ops/pos/bookings', {
        method: 'POST',
        token: cashier,
        body: {
          tripId: 'trp_991823',
          passengerName: '  Trần   Thị   Mai  ',
          phone: '0912345678',
          seatCodes: ['A07']
        }
      });
      assert.strictEqual(okPos.status, 201);
      assert.strictEqual(okPos.body.data.passenger_name, 'Trần Thị Mai');

      // Hotline hold with digits in name
      const badHold = await request('/api/v1/ops/pos/hotline-hold', {
        method: 'POST',
        token: dispatcher,
        body: {
          tripId: 'trp_991823',
          passengerName: 'Khách 123',
          phone: '0912345678',
          seatCodes: ['A08']
        }
      });
      assert.strictEqual(badHold.status, 400);
      assert.strictEqual(badHold.body.code, 'VALIDATION_ERROR');
      assert.strictEqual(badHold.body.message, 'Họ tên không được chứa số hoặc ký tự đặc biệt');

      // Hotline hold with valid name
      const okHold = await request('/api/v1/ops/pos/hotline-hold', {
        method: 'POST',
        token: dispatcher,
        body: {
          tripId: 'trp_991823',
          passengerName: '  Hoàng   Văn   Thái  ',
          phone: '0912345678',
          seatCodes: ['A08']
        }
      });
      assert.strictEqual(okHold.status, 201);
      assert.strictEqual(okHold.body.data.passenger_name, 'Hoàng Văn Thái');
    });
  });

  describe('2. Vehicle plates and model validation', () => {
    it('unit: normalizePlate formats valid plates and rejects invalid', () => {
      assert.deepStrictEqual(normalizePlate('29b 123.45'), { isValid: true, normalized: '29B-123.45', message: null });
      assert.deepStrictEqual(normalizePlate('29B12345'), { isValid: true, normalized: '29B-123.45', message: null });
      assert.deepStrictEqual(normalizePlate('51LD12345'), { isValid: true, normalized: '51LD-123.45', message: null });
      assert.deepStrictEqual(normalizePlate('30H24680'), { isValid: true, normalized: '30H-246.80', message: null });
      assert.deepStrictEqual(normalizePlate('29B1234'), { isValid: true, normalized: '29B-1234', message: null });

      const invalid = normalizePlate('abc');
      assert.strictEqual(invalid.isValid, false);
      assert.strictEqual(invalid.message, 'Biển số không đúng dạng (VD: 29B-123.45)');
    });

    it('API: POST /api/v1/ops/vehicles validates plate and model, stores normalized, refuses duplicate in another spelling', async () => {
      // Invalid plate format refused
      const badPlate = await request('/api/v1/ops/vehicles', {
        method: 'POST',
        token: dispatcher,
        body: {
          plate_number: 'abc',
          model: 'Thaco VIP',
          layout_id: 'CABIN_22'
        }
      });
      assert.strictEqual(badPlate.status, 400);
      assert.strictEqual(badPlate.body.code, 'VALIDATION_ERROR');
      assert.strictEqual(badPlate.body.message, 'Biển số không đúng dạng (VD: 29B-123.45)');

      // Missing model refused
      const noModel = await request('/api/v1/ops/vehicles', {
        method: 'POST',
        token: dispatcher,
        body: {
          plate_number: '29B-999.11',
          layout_id: 'CABIN_22'
        }
      });
      assert.strictEqual(noModel.status, 400);
      assert.strictEqual(noModel.body.code, 'VALIDATION_ERROR');

      // Model > 80 characters refused
      const longModel = await request('/api/v1/ops/vehicles', {
        method: 'POST',
        token: dispatcher,
        body: {
          plate_number: '29B-999.11',
          model: 'A'.repeat(81),
          layout_id: 'CABIN_22'
        }
      });
      assert.strictEqual(longModel.status, 400);
      assert.strictEqual(longModel.body.code, 'VALIDATION_ERROR');

      // Add with lowercase and spaces: "29b 999.11" -> stores "29B-999.11"
      const addOk = await request('/api/v1/ops/vehicles', {
        method: 'POST',
        token: dispatcher,
        body: {
          plate_number: '29b 999.11',
          model: 'Thaco Mobihome 22',
          layout_id: 'CABIN_22'
        }
      });
      assert.strictEqual(addOk.status, 201);
      assert.strictEqual(addOk.body.data.plate_number, '29B-999.11');

      // Duplicate in another spelling "29B99911" refused with 409 VEHICLE_EXISTS
      const dupRes = await request('/api/v1/ops/vehicles', {
        method: 'POST',
        token: dispatcher,
        body: {
          plate_number: '29B99911',
          model: 'Thaco Mobihome 22',
          layout_id: 'CABIN_22'
        }
      });
      assert.strictEqual(dupRes.status, 409);
      assert.strictEqual(dupRes.body.code, 'VEHICLE_EXISTS');
    });
  });

  describe('3. Delay minutes validation', () => {
    it('API: delay 0 clears delay, negatives / decimals / strings / 601 refused', async () => {
      // Negatives refused
      const negRes = await request('/api/v1/ops/trips/trp_991823/delay', {
        method: 'POST',
        token: dispatcher,
        body: { delayMinutes: -5, reason: 'Kẹt xe' }
      });
      assert.strictEqual(negRes.status, 400);
      assert.strictEqual(negRes.body.code, 'VALIDATION_ERROR');
      assert.strictEqual(negRes.body.message, 'Số phút trễ là số nguyên từ 0 đến 600');

      // Decimals refused
      const decRes = await request('/api/v1/ops/trips/trp_991823/delay', {
        method: 'POST',
        token: dispatcher,
        body: { delayMinutes: 2.5, reason: 'Kẹt xe' }
      });
      assert.strictEqual(decRes.status, 400);
      assert.strictEqual(decRes.body.code, 'VALIDATION_ERROR');

      // String refused
      const strRes = await request('/api/v1/ops/trips/trp_991823/delay', {
        method: 'POST',
        token: dispatcher,
        body: { delayMinutes: 'x', reason: 'Kẹt xe' }
      });
      assert.strictEqual(strRes.status, 400);
      assert.strictEqual(strRes.body.code, 'VALIDATION_ERROR');

      // 601 refused
      const highRes = await request('/api/v1/ops/trips/trp_991823/delay', {
        method: 'POST',
        token: dispatcher,
        body: { delayMinutes: 601, reason: 'Kẹt xe' }
      });
      assert.strictEqual(highRes.status, 400);
      assert.strictEqual(highRes.body.code, 'VALIDATION_ERROR');

      // Delay 30 minutes works
      const ok30 = await request('/api/v1/ops/trips/trp_991823/delay', {
        method: 'POST',
        token: dispatcher,
        body: { delayMinutes: 30, reason: 'Mưa bão lớn' }
      });
      assert.strictEqual(ok30.status, 200);
      assert.strictEqual(ok30.body.data.delay_minutes, 30);
      assert.strictEqual(services.managerService.findTrip('trp_991823').delay_minutes, 30);

      // Delay 0 clears delay
      const ok0 = await request('/api/v1/ops/trips/trp_991823/delay', {
        method: 'POST',
        token: dispatcher,
        body: { delayMinutes: 0, reason: 'Đã thông đường' }
      });
      assert.strictEqual(ok0.status, 200);
      assert.strictEqual(ok0.body.data.delay_minutes, 0);
      assert.strictEqual(services.managerService.findTrip('trp_991823').delay_minutes, 0);
    });
  });

  describe('5. Free-text length (max 200 characters)', () => {
    it('API: 201-character note refused with 400 VALIDATION_ERROR "Nội dung tối đa 200 ký tự"', async () => {
      const note201 = 'a'.repeat(201);
      const tripId = 'trp_hn_th_01';
      const drvTrip = services.driverService.activeTrips.get(tripId);
      drvTrip.status = 'IN_TRANSIT';

      // 1. Incident note > 200 chars refused
      const badInc = await request(`/api/v1/driver/trips/${tripId}/incident`, {
        method: 'POST',
        token: driver,
        body: {
          incident_type: 'TRAFFIC_JAM',
          description: note201
        }
      });
      assert.strictEqual(badInc.status, 400);
      assert.strictEqual(badInc.body.code, 'VALIDATION_ERROR');
      assert.strictEqual(badInc.body.message, 'Nội dung tối đa 200 ký tự');

      // 2. Early-end reason > 200 chars refused
      const badEarly = await request(`/api/v1/driver/trips/${tripId}/end`, {
        method: 'POST',
        token: driver,
        body: {
          early_end_reason: note201
        }
      });
      assert.strictEqual(badEarly.status, 400);
      assert.strictEqual(badEarly.body.code, 'VALIDATION_ERROR');
      assert.strictEqual(badEarly.body.message, 'Nội dung tối đa 200 ký tự');

      // 3. Inaccessible address reason > 200 chars refused
      const badInacc = await request(`/api/v1/driver/trips/${tripId}/tickets/tkt_dummy/inaccessible`, {
        method: 'POST',
        token: driver,
        body: {
          reason: note201,
          meeting_point: 'Cổng làng'
        }
      });
      assert.strictEqual(badInacc.status, 400);
      assert.strictEqual(badInacc.body.code, 'VALIDATION_ERROR');
      assert.strictEqual(badInacc.body.message, 'Nội dung tối đa 200 ký tự');

      // 4. Inaccessible address meeting point > 200 chars refused
      const badMeet = await request(`/api/v1/driver/trips/${tripId}/tickets/tkt_dummy/inaccessible`, {
        method: 'POST',
        token: driver,
        body: {
          reason: 'Đường ngập',
          meeting_point: note201
        }
      });
      assert.strictEqual(badMeet.status, 400);
      assert.strictEqual(badMeet.body.code, 'VALIDATION_ERROR');
      assert.strictEqual(badMeet.body.message, 'Nội dung tối đa 200 ký tự');
    });
  });
});
