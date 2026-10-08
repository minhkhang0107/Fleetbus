/**
 * Spec conformance: money, payment, ticket and boarding rules (Phase A review, FND-A13 to FND-A37).
 * Drives the real HTTP gateway with an in-process server on an ephemeral port.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import http from 'node:http';
import { createFleetBusServer } from '../../source/server/apiServer.js';
import { getTicketSecret } from '../../source/server/config.js';
import { generateBoardingQR } from '../../source/server/services/passenger/core/cryptoEngine.js';

const TRIP = 'trp_hn_th_01';
const HOUR = 3600 * 1000;

function startServer(options = {}) {
  const { server, services } = createFleetBusServer({ authMode: 'off', ...options });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, services, baseUrl: `http://127.0.0.1:${server.address().port}` });
    });
  });
}

function makeClient(baseUrl) {
  return function request(path, { method = 'GET', body, headers = {}, rawBody } = {}) {
    return new Promise((resolve, reject) => {
      const payload = rawBody !== undefined ? rawBody : (body ? JSON.stringify(body) : null);
      const req = http.request(`${baseUrl}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', ...headers }
      }, (res) => {
        let raw = '';
        res.on('data', (c) => { raw += c; });
        res.on('end', () => {
          let parsed;
          try { parsed = JSON.parse(raw); } catch { parsed = raw; }
          resolve({ status: res.statusCode, body: parsed });
        });
      });
      req.on('error', reject);
      if (payload) req.write(payload);
      req.end();
    });
  };
}

describe('Spec conformance: money, tickets and boarding', () => {
  let ctx;
  let api;

  before(async () => {
    ctx = await startServer();
    api = makeClient(ctx.baseUrl);
  });

  after(() => new Promise((resolve) => ctx.server.close(resolve)));

  async function holdSeats(seats, userId) {
    return api(`/api/v1/trips/${TRIP}/seats/hold`, { method: 'POST', body: { seatCodes: seats, userId } });
  }

  async function book(seats, userId, extra = {}) {
    const hold = await holdSeats(seats, userId);
    assert.strictEqual(hold.status, 200, 'hold must succeed');
    return api('/api/v1/bookings/create', {
      method: 'POST',
      body: {
        tripId: TRIP,
        userId,
        holdId: hold.body.data.hold_id,
        seatCodes: seats,
        payer: { full_name: 'Nguyen Van Test', phone: '0987000111' },
        passengers: seats.map((s) => ({ seat_code: s, full_name: 'Hanh Khach ' + s })),
        ...extra
      }
    });
  }

  async function settle(order, amountVnd = order.payment.amount_vnd) {
    return api('/api/v1/webhooks/vietqr/ipn', {
      method: 'POST',
      body: { transferMemo: order.payment.payment_details.transfer_memo, amountVnd, bankRef: `bank_${Date.now()}` }
    });
  }

  async function buyTicket(seat, userId, phone = '0987000111') {
    const created = await book([seat], userId, { payer: { full_name: 'Nguyen Van Test', phone } });
    assert.strictEqual(created.status, 201, `booking ${seat} must succeed`);
    const order = created.body.data;
    const paid = await settle(order);
    assert.strictEqual(paid.status, 200, 'settlement must succeed');
    return { order, ticket: paid.body.data.issued_tickets[0] };
  }

  it('TC-SPEC-A35: passenger OTP login works over HTTP (PAX-002, PAX-003)', async () => {
    const req = await api('/api/v1/auth/passenger/otp/request', { method: 'POST', body: { phone: '0912345678' } });
    assert.strictEqual(req.status, 200, JSON.stringify(req.body));
    const ver = await api('/api/v1/auth/passenger/otp/verify', { method: 'POST', body: { phone: '0912345678', otp: '882199' } });
    assert.strictEqual(ver.status, 200, JSON.stringify(ver.body));
    assert.ok(ver.body.data.token);
  });

  it('TC-SPEC-A13: client-supplied prices are ignored, server price applies (PAX-012)', async () => {
    const created = await book(['A01'], 'u_price', { unitPriceVnd: 1, selectedSeats: [{ seat_code: 'A01', price_vnd: 1 }] });
    assert.strictEqual(created.status, 201);
    assert.strictEqual(created.body.data.payment.amount_vnd, 220000);
  });

  it('TC-SPEC-A16: booking without a real hold is rejected (PAX-010, PAX-012)', async () => {
    const res = await api('/api/v1/bookings/create', {
      method: 'POST',
      body: {
        tripId: TRIP, userId: 'u_nohold', holdId: 'fake_hold', seatCodes: ['A02'],
        payer: { full_name: 'Khach Gia', phone: '0987000222' },
        passengers: [{ seat_code: 'A02', full_name: 'Khach Gia' }]
      }
    });
    assert.strictEqual(res.status, 409);
    assert.strictEqual(res.body.code, 'HOLD_INVALID');
  });

  it('TC-SPEC-A16b: a hold owned by another user cannot be used to book (PAX-010)', async () => {
    const hold = await holdSeats(['A04'], 'owner_user');
    const res = await api('/api/v1/bookings/create', {
      method: 'POST',
      body: {
        tripId: TRIP, userId: 'thief_user', holdId: hold.body.data.hold_id, seatCodes: ['A04'],
        payer: { full_name: 'Khach Khac', phone: '0987000333' },
        passengers: [{ seat_code: 'A04', full_name: 'Khach Khac' }]
      }
    });
    assert.strictEqual(res.status, 409);
    assert.strictEqual(res.body.code, 'HOLD_INVALID');
  });

  it('TC-SPEC-A15: "Toi da chuyen tien" does not settle without money received (PAX-013, REV-02)', async () => {
    const created = await book(['A05'], 'u_manual');
    const orderId = created.body.data.payment.order_id;
    const res = await api(`/api/v1/passenger/payments/${orderId}/verify-status`, { method: 'POST', body: { manualTrigger: true } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.payment_status, 'PENDING_PAYMENT');
    assert.strictEqual(res.body.data.is_settled, false);
    assert.strictEqual((res.body.data.tickets || []).length, 0);
  });

  it('TC-SPEC-A14: webhook with the wrong amount does not issue tickets (PAX-014)', async () => {
    const created = await book(['A06'], 'u_amount');
    const order = created.body.data;
    const underpaid = await settle(order, 1000);
    assert.strictEqual(underpaid.status, 400);
    assert.strictEqual(underpaid.body.code, 'AMOUNT_MISMATCH');
    const status = await api(`/api/v1/passenger/payments/${order.payment.order_id}/verify-status`, { method: 'POST', body: {} });
    assert.strictEqual(status.body.data.payment_status, 'PENDING_PAYMENT');
    const exact = await settle(order);
    assert.strictEqual(exact.status, 200);
    assert.strictEqual(exact.body.data.issued_tickets.length, 1);
  });

  it('TC-SPEC-A14b: webhook signature is enforced when a secret is configured (PAX-014)', async () => {
    const secret = 'unit_test_webhook_secret';
    const secured = await startServer({ webhookSecret: secret });
    const securedApi = makeClient(secured.baseUrl);
    try {
      const hold = await securedApi(`/api/v1/trips/${TRIP}/seats/hold`, { method: 'POST', body: { seatCodes: ['B01'], userId: 'u_sig' } });
      const created = await securedApi('/api/v1/bookings/create', {
        method: 'POST',
        body: {
          tripId: TRIP, userId: 'u_sig', holdId: hold.body.data.hold_id, seatCodes: ['B01'],
          payer: { full_name: 'Khach Ky', phone: '0987000444' },
          passengers: [{ seat_code: 'B01', full_name: 'Khach Ky' }]
        }
      });
      const order = created.body.data;
      const raw = JSON.stringify({
        transferMemo: order.payment.payment_details.transfer_memo,
        amountVnd: order.payment.amount_vnd,
        bankRef: 'bank_sig_1'
      });
      const unsigned = await securedApi('/api/v1/webhooks/vietqr/ipn', { method: 'POST', rawBody: raw });
      assert.strictEqual(unsigned.status, 401);
      const wrong = await securedApi('/api/v1/webhooks/vietqr/ipn', { method: 'POST', rawBody: raw, headers: { 'X-Signature': 'deadbeef' } });
      assert.strictEqual(wrong.status, 401);
      const good = crypto.createHmac('sha256', secret).update(raw).digest('hex');
      const signed = await securedApi('/api/v1/webhooks/vietqr/ipn', { method: 'POST', rawBody: raw, headers: { 'X-Signature': good } });
      assert.strictEqual(signed.status, 200, JSON.stringify(signed.body));
    } finally {
      await new Promise((resolve) => secured.server.close(resolve));
    }
  });

  it('TC-SPEC-A24: forged QR signature is rejected, genuine QR boards (DRI-009, D104)', async () => {
    const { ticket } = await buyTicket('A07', 'u_qr');
    const forged = `BUSGO|${ticket.pnr}|${ticket.ticket_id}|v1|deadbeefdeadbeef`;
    const bad = await api(`/api/v1/driver/trips/${TRIP}/boarding`, { method: 'POST', body: { qrString: forged } });
    assert.strictEqual(bad.status, 400);
    assert.strictEqual(bad.body.code, 'INVALID_SIGNATURE');

    const pass = await api(`/api/v1/tickets/${ticket.ticket_id}`);
    const genuine = pass.body.data.boarding_qr.qr_code_value;
    const ok = await api(`/api/v1/driver/trips/${TRIP}/boarding`, { method: 'POST', body: { qrString: genuine } });
    assert.strictEqual(ok.status, 200, JSON.stringify(ok.body));
  });

  it('TC-SPEC-A36: a validly signed QR for a ticket outside this trip never boards a PNR namesake (DRI-009)', async () => {
    const manifest = ctx.services.driverService.activeTrips.get(TRIP).manifest;
    const victim = manifest.find((m) => m.boarding_status !== 'BOARDED');
    assert.ok(victim, 'fixture needs an unboarded passenger');
    const foreign = { pnr: victim.pnr, ticket_id: 'tkt_not_on_this_trip', seat_code: 'Z99', trip_id: 'trp_other' };
    const qr = generateBoardingQR(foreign, getTicketSecret(), Date.now()).qr_code_value;
    const res = await api(`/api/v1/driver/trips/${TRIP}/boarding`, { method: 'POST', body: { qrString: qr } });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.code, 'TICKET_WRONG_TRIP');
    assert.notStrictEqual(victim.boarding_status, 'BOARDED');
  });

  it('TC-SPEC-A37: PIN boarding updates the passenger wallet through the event bridge (DRI-010)', async () => {
    const phone = '0987000555';
    const { ticket } = await buyTicket('A08', 'u_pin', phone);
    const delegated = await api(`/api/v1/passenger/tickets/${ticket.ticket_id}/delegate`, {
      method: 'POST', body: { delegateToPhone: '0987000556', delegateToName: 'Nguoi Di Cung' }
    });
    const pin = delegated.body.data.offline_pin;
    const board = await api(`/api/v1/driver/trips/${TRIP}/boarding/manual`, {
      method: 'POST', body: { ticket_id: ticket.ticket_id, pin }
    });
    assert.strictEqual(board.status, 200, JSON.stringify(board.body));
    const wallet = await api(`/api/v1/passenger/tickets?phone=${phone}&tab=UPCOMING`);
    assert.ok(wallet.body.data.some((t) => t.ticket_id === ticket.ticket_id && t.status === 'BOARDED'), 'a boarded ticket stays under UPCOMING with status BOARDED until the trip ends');
  });

  it('TC-SPEC-A29: ticket wallet requires an exact phone, never a substring (PAX-016)', async () => {
    await buyTicket('A09', 'u_wallet', '0987000666');
    const empty = await api('/api/v1/passenger/tickets?phone=');
    assert.strictEqual(empty.status, 400);
    const missing = await api('/api/v1/passenger/tickets');
    assert.strictEqual(missing.status, 400);
    const partial = await api('/api/v1/passenger/tickets?phone=0987');
    assert.strictEqual(partial.status, 400);
    const stranger = await api('/api/v1/passenger/tickets?phone=0911222333');
    assert.strictEqual(stranger.status, 200);
    assert.strictEqual(stranger.body.data.length, 0);
  });

  it('TC-SPEC-A18: refund tiers follow PAX-021 and use the stored ticket, not the client (PAX-021)', async () => {
    const { ticket } = await buyTicket('A10', 'u_cancel', '0987000777');
    const dep = Date.parse(ticket.departure_time);
    const farFuture = new Date(dep + 400 * HOUR).toISOString();

    const eightHours = await api(`/api/v1/passenger/tickets/${ticket.ticket_id}/cancel`, {
      method: 'POST', body: { now: dep - 8 * HOUR, departureTime: farFuture }
    });
    assert.strictEqual(eightHours.status, 200, JSON.stringify(eightHours.body));
    assert.strictEqual(eightHours.body.data.refund_percentage, 80);
    assert.strictEqual(eightHours.body.data.refund_amount_vnd, 176000);
    assert.strictEqual(eightHours.body.data.status, 'REFUND_REQUESTED');

    const again = await api(`/api/v1/passenger/tickets/${ticket.ticket_id}/cancel`, {
      method: 'POST', body: { now: dep - 8 * HOUR }
    });
    assert.strictEqual(again.status, 400);
    assert.strictEqual(again.body.code, 'TICKET_NOT_ACTIVE');
  });

  it('TC-SPEC-A18b: 14h before departure refunds 100% and under 6h refunds nothing (PAX-021 AC-001)', async () => {
    const a = await buyTicket('A11', 'u_cancel_a', '0987000778');
    const dep = Date.parse(a.ticket.departure_time);
    const full = await api(`/api/v1/passenger/tickets/${a.ticket.ticket_id}/cancel`, { method: 'POST', body: { now: dep - 14 * HOUR } });
    assert.strictEqual(full.body.data.refund_percentage, 100);
    assert.strictEqual(full.body.data.refund_amount_vnd, 220000);

    const b = await buyTicket('B02', 'u_cancel_b', '0987000779');
    const none = await api(`/api/v1/passenger/tickets/${b.ticket.ticket_id}/cancel`, { method: 'POST', body: { now: dep - 3 * HOUR } });
    assert.strictEqual(none.body.data.refund_percentage, 0);
    assert.strictEqual(none.body.data.refund_amount_vnd, 0);
  });

  it('TC-SPEC-A48: refund approval acts on a real request exactly once (MGR-022)', async () => {
    const { ticket } = await buyTicket('B03', 'u_refund', '0987000888');
    const dep = Date.parse(ticket.departure_time);
    const cancel = await api(`/api/v1/passenger/tickets/${ticket.ticket_id}/cancel`, { method: 'POST', body: { now: dep - 14 * HOUR } });
    const refundId = cancel.body.data.refund_id;
    assert.ok(refundId, 'cancellation must create a refund request');

    const unknown = await api('/api/v1/ops/refunds/does_not_exist/process', { method: 'POST', body: { approved: true } });
    assert.strictEqual(unknown.status, 404);
    const missingFlag = await api(`/api/v1/ops/refunds/${refundId}/process`, { method: 'POST', body: {} });
    assert.strictEqual(missingFlag.status, 400);

    const approved = await api(`/api/v1/ops/refunds/${refundId}/process`, { method: 'POST', body: { approved: true } });
    assert.strictEqual(approved.status, 200);
    assert.strictEqual(approved.body.data.status, 'REFUNDED');
    const twice = await api(`/api/v1/ops/refunds/${refundId}/process`, { method: 'POST', body: { approved: false } });
    assert.strictEqual(twice.status, 400);
    assert.strictEqual(twice.body.code, 'REFUND_ALREADY_PROCESSED');
  });
});
