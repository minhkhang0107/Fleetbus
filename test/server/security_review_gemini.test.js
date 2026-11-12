/**
 * Findings of the second security review with Gemini (D198): test OTP backdoor, cancel after departure, driver
 * trips fail closed, ticket PIN guessing, passenger sign-out, replayable bank notices, public stream limits.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { createFleetBusServer } from '../../source/server/apiServer.js';
import { PassengerAuthService } from '../../source/server/services/passenger/modules/auth.js';
import { generateTicketPin } from '../../source/server/services/passenger/core/cryptoEngine.js';

function withProduction(fn) {
  const saved = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    return fn();
  } finally {
    process.env.NODE_ENV = saved;
  }
}

describe('Security review with Gemini (D198)', () => {
  let server;
  let services;
  let baseUrl;
  const WEBHOOK_SECRET = 'whsec_test_d198_0123456789abcdef';

  const api = async (path, { method = 'GET', body, token, headers = {} } = {}) => {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
      body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body))
    });
    let json = {};
    try { json = await res.json(); } catch (_) {}
    return { status: res.status, body: json };
  };

  before(async () => {
    ({ server, services } = createFleetBusServer({ authMode: 'enforce', webhookSecret: WEBHOOK_SECRET }));
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(() => new Promise(resolve => server.close(resolve)));

  it('the fixed test OTP of 0912345678 does not work in production', () => {
    const auth = new PassengerAuthService();
    const now = Date.now();
    withProduction(() => {
      auth.otpStore.set('op_saomai:0912345678', { otp: '402913', expiresAt: now + 60000, attempts: 0, lastSentAt: now });
      const res = auth.verifyOTP('0912345678', '882199', now, 'op_saomai');
      assert.strictEqual(res.success, false, 'backdoor OTP refused');
    });
    const dev = new PassengerAuthService();
    dev.otpStore.set('op_saomai:0912345678', { otp: '402913', expiresAt: now + 60000, attempts: 0, lastSentAt: now });
    assert.strictEqual(dev.verifyOTP('0912345678', '882199', now, 'op_saomai').success, true, 'still works in dev/test');
  });

  it('a ticket cannot be cancelled once the bus has left (no free ride, no delay refund on board)', () => {
    const { paymentService, driverService } = services;
    const trip = driverService.activeTrips.get('trp_hn_th_01');
    const saved = trip.status;
    const ticket = { ticket_id: 'tkt_d198_cash', trip_id: 'trp_hn_th_01', status: 'ACTIVE', payment_method: 'CASH', fare_vnd: 220000, operator_id: 'op_saomai' };
    paymentService.tickets.set(ticket.ticket_id, ticket);
    try {
      trip.status = 'IN_TRANSIT';
      const res = paymentService.cancelTicket(ticket.ticket_id, { now: Date.now() });
      assert.strictEqual(res.code, 'TRIP_ALREADY_DEPARTED');
      assert.strictEqual(ticket.status, 'ACTIVE');
      trip.status = 'READY';
      assert.strictEqual(paymentService.cancelTicket(ticket.ticket_id, { now: Date.now() }).success, true, 'before departure it still cancels');
    } finally {
      trip.status = saved;
      paymentService.tickets.delete(ticket.ticket_id);
    }
  });

  it('a driver reaching a trip that was never given to them gets 404, not a handler that happens to work', async () => {
    const login = await api('/api/v1/driver/auth/login', { method: 'POST', body: { staffIdOrPhone: 'TX8821', pin: '123456' } });
    assert.strictEqual(login.status, 200);
    const res = await api('/api/v1/driver/trips/trp_does_not_exist/manifest', { token: login.body.data.token });
    assert.strictEqual(res.status, 404);
  });

  it('5 wrong ticket PINs lock the PIN until the passenger reissues the QR', () => {
    const { driverService } = services;
    const tripId = 'trp_991823';
    const passenger = driverService.activeTrips.get(tripId).manifest[0];
    for (let i = 0; i < 5; i++) {
      assert.strictEqual(driverService.boardPassengerByQR(tripId, `PIN:${passenger.ticket_id}:000000`).code, 'INVALID_PIN');
    }
    const right = generateTicketPin(passenger.ticket_id, driverService.secretKey, passenger.qr_version || 1);
    assert.strictEqual(driverService.boardPassengerByQR(tripId, `PIN:${passenger.ticket_id}:${right}`).code, 'PIN_LOCKED');
    driverService.setTicketQrVersion(tripId, passenger.ticket_id, passenger.qr_version || 1);
    assert.notStrictEqual(driverService.boardPassengerByQR(tripId, `PIN:${passenger.ticket_id}:000000`).code, 'PIN_LOCKED', 'reissue clears the count');
  });

  it('signing out ends the passenger token on the server', async () => {
    await api('/api/v1/auth/passenger/otp/request', { method: 'POST', body: { phone: '0912345678' } });
    const verify = await api('/api/v1/auth/passenger/otp/verify', { method: 'POST', body: { phone: '0912345678', otp: '882199' } });
    const token = verify.body.data?.token;
    assert.ok(token);
    assert.strictEqual((await api('/api/v1/passenger/notifications', { token })).status, 200);
    // a token issued in the same millisecond as the sign-out is revoked too (iat <= revokedAt)
    await new Promise(r => setTimeout(r, 2));
    assert.strictEqual((await api('/api/v1/passenger/logout', { method: 'POST', token })).status, 200);
    assert.strictEqual((await api('/api/v1/passenger/notifications', { token })).status, 401);
  });

  it('in production a signed bank notice without a transaction id is refused (it could be replayed)', async () => {
    const raw = JSON.stringify({ transferMemo: 'BG 123456', amountVnd: 220000 });
    const sig = crypto.createHmac('sha256', WEBHOOK_SECRET).update(raw).digest('hex');
    const saved = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const res = await api('/api/v1/webhooks/vietqr/SAOMAI/ipn', { method: 'POST', body: raw, headers: { 'x-signature': sig } });
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.code, 'TX_ID_REQUIRED');
    } finally {
      process.env.NODE_ENV = saved;
    }
  });

  it('one address cannot hold more than 20 public tracking streams', async () => {
    const controllers = [];
    const responses = []; // held so an unread stream is not collected (and its socket closed) mid-test
    try {
      const statuses = [];
      for (let i = 0; i < 21; i++) {
        const ctrl = new AbortController();
        controllers.push(ctrl);
        const res = await fetch(`${baseUrl}/api/v1/trips/trp_hn_th_01/tracking/stream`, { signal: ctrl.signal });
        responses.push(res);
        statuses.push(res.status);
      }
      assert.ok(statuses.slice(0, 20).every(s => s === 200), statuses.join(','));
      assert.strictEqual(statuses[20], 429);
    } finally {
      for (const c of controllers) c.abort();
    }
  });
});
