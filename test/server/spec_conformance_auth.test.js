/**
 * Spec conformance: authentication, authorization, ownership and idempotency
 * (Phase A review, FND-A01, FND-A02, FND-A30, FND-A51). Runs the gateway with authMode "enforce".
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import http from 'node:http';
import { createFleetBusServer } from '../../source/server/apiServer.js';
import { signToken } from '../../source/server/core/tokens.js';

const TRIP = 'trp_hn_th_01';

describe('Spec conformance: authentication, authorization and idempotency', () => {
  let server;
  let services;
  let baseUrl;

  before(async () => {
    ({ server, services } = createFleetBusServer({ authMode: 'enforce', webhookSecret: null }));
    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        baseUrl = `http://127.0.0.1:${server.address().port}`;
        resolve();
      });
    });
  });

  after(() => new Promise((resolve) => server.close(resolve)));

  function api(path, { method = 'GET', body, token, key, headers = {} } = {}) {
    return new Promise((resolve, reject) => {
      const h = { 'Content-Type': 'application/json', ...headers };
      if (token) h.Authorization = `Bearer ${token}`;
      if (method === 'POST') h['Idempotency-Key'] = key === undefined ? crypto.randomUUID() : key;
      if (h['Idempotency-Key'] === null) delete h['Idempotency-Key'];
      const req = http.request(`${baseUrl}${path}`, { method, headers: h }, (res) => {
        let raw = '';
        res.on('data', (c) => { raw += c; });
        res.on('end', () => {
          let parsed;
          try { parsed = JSON.parse(raw); } catch { parsed = raw; }
          resolve({ status: res.statusCode, body: parsed, headers: res.headers });
        });
      });
      req.on('error', reject);
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }

  async function passengerToken(phone) {
    const req = await api('/api/v1/auth/passenger/otp/request', { method: 'POST', body: { phone } });
    const ver = await api('/api/v1/auth/passenger/otp/verify', { method: 'POST', body: { phone, otp: req.body.data.mock_otp } });
    assert.strictEqual(ver.status, 200, JSON.stringify(ver.body));
    return ver.body.data.token;
  }

  async function staffToken(username, password) {
    const res = await api('/api/v1/auth/staff/login', { method: 'POST', body: { username, password } });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    return res.body.data.token;
  }

  async function driverToken(staffId, pin) {
    const res = await api('/api/v1/auth/driver/login', { method: 'POST', body: { staffIdOrPhone: staffId, pin } });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    return res.body.data.token;
  }

  async function buyTicket(token, seat, payerPhone) {
    const hold = await api(`/api/v1/trips/${TRIP}/seats/hold`, { method: 'POST', token, body: { seatCodes: [seat] } });
    assert.strictEqual(hold.status, 200, JSON.stringify(hold.body));
    const created = await api('/api/v1/bookings/create', {
      method: 'POST',
      token,
      body: {
        tripId: TRIP, holdId: hold.body.data.hold_id, seatCodes: [seat],
        payer: { full_name: 'Chu Ve', phone: payerPhone },
        passengers: [{ seat_code: seat, full_name: 'Chu Ve' }]
      }
    });
    assert.strictEqual(created.status, 201, JSON.stringify(created.body));
    const order = created.body.data;
    const paid = await api('/api/v1/webhooks/vietqr/ipn', {
      method: 'POST',
      key: null,
      body: { transferMemo: order.payment.payment_details.transfer_memo, amountVnd: order.payment.amount_vnd, bankRef: `bank_${seat}` }
    });
    assert.strictEqual(paid.status, 200, JSON.stringify(paid.body));
    return paid.body.data.issued_tickets[0];
  }

  it('TC-SPEC-A01a: protected endpoints need a valid token, public ones stay open (api-screen-map Auth column)', async () => {
    const open = [
      '/health',
      '/api/v1/app/config',
      '/api/v1/trips/search?origin=H&destination=T',
      `/api/v1/trips/${TRIP}`,
      `/api/v1/trips/${TRIP}/seat-map`,
      '/api/v1/routes/stops/search?q=giap'
    ];
    for (const path of open) {
      const res = await api(path);
      assert.strictEqual(res.status, 200, `${path} must stay public`);
    }

    const closed = [
      ['GET', '/api/v1/passenger/tickets'],
      ['GET', '/api/v1/passenger/notifications'],
      ['POST', `/api/v1/trips/${TRIP}/seats/hold`],
      ['POST', '/api/v1/bookings/create'],
      ['GET', '/api/v1/driver/trips/today'],
      ['GET', `/api/v1/driver/trips/${TRIP}/manifest`],
      ['GET', '/api/v1/ops/bookings'],
      ['POST', '/api/v1/ops/pos/orders']
    ];
    for (const [method, path] of closed) {
      const res = await api(path, { method });
      assert.strictEqual(res.status, 401, `${method} ${path} must require a token`);
      assert.strictEqual(res.body.code, 'UNAUTHORIZED');
    }
  });

  it('TC-SPEC-A01b: forged, expired and wrong-kind tokens are rejected', async () => {
    const forged = await api('/api/v1/passenger/tickets', { token: 'pax_jwt_eyJzdWIiOiJ4In0.deadbeef' });
    assert.strictEqual(forged.status, 401);
    assert.strictEqual(forged.body.code, 'INVALID_TOKEN');

    const unsigned = await api('/api/v1/passenger/tickets', { token: `pax_jwt_${Buffer.from('0912345678_1700000000000').toString('base64')}` });
    assert.strictEqual(unsigned.status, 401);

    const old = signToken({ sub: 'usr_x', phone: '0912345678', kind: 'passenger' }, { prefix: 'pax_jwt_', ttlSeconds: 3600, now: Date.now() - 2 * 3600 * 1000 });
    const expired = await api('/api/v1/passenger/tickets', { token: old });
    assert.strictEqual(expired.status, 401);
    assert.strictEqual(expired.body.code, 'TOKEN_EXPIRED');

    const passenger = await passengerToken('0912000009');
    const wrongKind = await api('/api/v1/ops/bookings', { token: passenger });
    assert.strictEqual(wrongKind.status, 403);
    assert.strictEqual(wrongKind.body.code, 'FORBIDDEN');
    const driverOnPassenger = await api('/api/v1/passenger/tickets', { token: await driverToken('TX8821', '123456') });
    assert.strictEqual(driverOnPassenger.status, 403);
  });

  it('TC-SPEC-A30: tickets belong to their owner; the wallet follows the token, not a query phone (PAX-016, PAX-017, PAX-021)', async () => {
    const phoneA = '0912000001';
    const phoneB = '0912000002';
    const tokenA = await passengerToken(phoneA);
    const tokenB = await passengerToken(phoneB);
    const ticket = await buyTicket(tokenA, 'A04', phoneA);

    const ownWallet = await api('/api/v1/passenger/tickets', { token: tokenA });
    assert.strictEqual(ownWallet.status, 200);
    assert.ok(ownWallet.body.data.some((t) => t.ticket_id === ticket.ticket_id));

    const spy = await api(`/api/v1/passenger/tickets?phone=${phoneA}`, { token: tokenB });
    assert.strictEqual(spy.status, 200);
    assert.strictEqual(spy.body.data.length, 0, 'the phone in the query string must be ignored');

    assert.strictEqual((await api(`/api/v1/tickets/${ticket.ticket_id}`, { token: tokenB })).status, 403);
    assert.strictEqual((await api(`/api/v1/passenger/tickets/${ticket.ticket_id}/delegate`, { method: 'POST', token: tokenB, body: { delegateToPhone: phoneB, delegateToName: 'B' } })).status, 403);
    assert.strictEqual((await api(`/api/v1/passenger/tickets/${ticket.ticket_id}/cancel`, { method: 'POST', token: tokenB, body: {} })).status, 403);

    assert.strictEqual((await api(`/api/v1/tickets/${ticket.ticket_id}`, { token: tokenA })).status, 200);
    const delegated = await api(`/api/v1/passenger/tickets/${ticket.ticket_id}/delegate`, { method: 'POST', token: tokenA, body: { delegateToPhone: phoneB, delegateToName: 'Nguoi B' } });
    assert.strictEqual(delegated.status, 200);
    assert.strictEqual((await api(`/api/v1/tickets/${ticket.ticket_id}`, { token: tokenB })).status, 200, 'the delegate may show the ticket');
    assert.strictEqual((await api(`/api/v1/passenger/tickets/${ticket.ticket_id}/cancel`, { method: 'POST', token: tokenB, body: {} })).status, 403, 'only the owner may cancel');
  });

  it('TC-SPEC-A01c: a driver only reaches the trips assigned to them (DRI-002, DRI-007)', async () => {
    const owner = await driverToken('TX8821', '123456');
    const other = await driverToken('TX9912', '112233');

    const own = await api('/api/v1/driver/trips/today', { token: owner, headers: { 'x-driver-id': 'drv_9912b' } });
    assert.ok(own.body.data.trips.length >= 1, 'the token decides who the driver is, not a header');
    const none = await api('/api/v1/driver/trips/today', { token: other, headers: { 'x-driver-id': 'drv_8821a' } });
    assert.strictEqual(none.body.data.trips.length, 0);

    assert.strictEqual((await api('/api/v1/driver/trips/trp_991823/manifest', { token: owner })).status, 200);
    const forbidden = await api('/api/v1/driver/trips/trp_991823/manifest', { token: other });
    assert.strictEqual(forbidden.status, 403);
    assert.strictEqual(forbidden.body.code, 'FORBIDDEN');
    assert.strictEqual((await api('/api/v1/driver/trips/trp_991823/start', { method: 'POST', token: other })).status, 403);
  });

  it('TC-SPEC-A01d: staff permissions follow the role, and only the admin sees full phone numbers (MGR-029, OQ-007)', async () => {
    const director = await staffToken('admin@busgo.vn', 'admin123');
    const dispatcher = await staffToken('dispatcher@busgo.vn', 'disp123');
    const cashier = await staffToken('cashier@busgo.vn', 'cash123');

    assert.strictEqual((await api('/api/v1/ops/pos/orders', { method: 'POST', token: dispatcher, body: {} })).status, 403);
    assert.strictEqual((await api('/api/v1/ops/refunds/x/process', { method: 'POST', token: dispatcher, body: { approved: true } })).status, 403);
    assert.strictEqual((await api('/api/v1/ops/refunds/x/process', { method: 'POST', token: cashier, body: { approved: true } })).status, 403);
    const delay = await api('/api/v1/ops/trips/trp_991824/delay', { method: 'POST', token: dispatcher, body: { delayMinutes: 10, reason: 'Ket xe' } });
    assert.strictEqual(delay.status, 200, JSON.stringify(delay.body));
    assert.strictEqual((await api('/api/v1/ops/dashboard/kpis', { token: dispatcher })).status, 200);
    assert.strictEqual((await api('/api/v1/ops/bookings', { token: dispatcher })).status, 403);

    const adminView = await api('/api/v1/ops/bookings', { token: director });
    assert.strictEqual(adminView.body.data.bookings.find((b) => b.pnr === 'BG-88219').phone, '0981112233');
    const cashierView = await api('/api/v1/ops/bookings', { token: cashier });
    assert.strictEqual(cashierView.body.data.bookings.find((b) => b.pnr === 'BG-88219').phone, '098***233');
  });

  it('TC-SPEC-A02: Idempotency-Key makes a mutation safe to retry (api-screen-map Idempotency column)', async () => {
    const phone = '0912000003';
    const token = await passengerToken(phone);
    const hold = await api(`/api/v1/trips/${TRIP}/seats/hold`, { method: 'POST', token, body: { seatCodes: ['A05'] } });
    const body = {
      tripId: TRIP, holdId: hold.body.data.hold_id, seatCodes: ['A05'],
      payer: { full_name: 'Khach Thu Lai', phone },
      passengers: [{ seat_code: 'A05', full_name: 'Khach Thu Lai' }]
    };

    const missing = await api('/api/v1/bookings/create', { method: 'POST', token, key: null, body });
    assert.strictEqual(missing.status, 400);
    assert.strictEqual(missing.body.code, 'IDEMPOTENCY_KEY_REQUIRED');

    const before = services.paymentService.orders.size;
    const key = crypto.randomUUID();
    const first = await api('/api/v1/bookings/create', { method: 'POST', token, key, body });
    const retry = await api('/api/v1/bookings/create', { method: 'POST', token, key, body });
    assert.strictEqual(first.status, 201);
    assert.strictEqual(retry.status, 201);
    assert.strictEqual(retry.body.data.payment.order_id, first.body.data.payment.order_id);
    assert.strictEqual(retry.headers['idempotent-replay'], 'true');
    assert.strictEqual(services.paymentService.orders.size, before + 1, 'the retry must not create a second order');

    const reused = await api('/api/v1/bookings/create', { method: 'POST', token, key, body: { ...body, voucherCode: 'BUSGO50K' } });
    assert.strictEqual(reused.status, 422);
    assert.strictEqual(reused.body.code, 'IDEMPOTENCY_KEY_REUSED');
  });

  it('TC-SPEC-A51b: a driver with an expired license is refused with 403 (DRI-001, BR-DRI-001)', async () => {
    const res = await api('/api/v1/auth/driver/login', { method: 'POST', body: { staffIdOrPhone: 'TX9902', pin: '654321' } });
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.code, 'LICENSE_EXPIRED');
  });

  it('TC-SPEC-A51: staff and driver logins lock after 5 wrong attempts (MGR-001, DRI-001)', async () => {
    for (let i = 0; i < 5; i++) {
      const bad = await api('/api/v1/auth/driver/login', { method: 'POST', body: { staffIdOrPhone: 'TX9912', pin: '000000' } });
      assert.strictEqual(bad.status, 401);
    }
    const locked = await api('/api/v1/auth/driver/login', { method: 'POST', body: { staffIdOrPhone: 'TX9912', pin: '112233' } });
    assert.strictEqual(locked.status, 429);
    assert.strictEqual(locked.body.code, 'ACCOUNT_LOCKED');

    for (let i = 0; i < 5; i++) {
      await api('/api/v1/auth/staff/login', { method: 'POST', body: { username: 'cashier@busgo.vn', password: 'wrong' } });
    }
    const staffLocked = await api('/api/v1/auth/staff/login', { method: 'POST', body: { username: 'cashier@busgo.vn', password: 'cash123' } });
    assert.strictEqual(staffLocked.status, 429);
    assert.strictEqual(staffLocked.body.code, 'ACCOUNT_LOCKED');
  });
});
