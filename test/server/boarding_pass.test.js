/**
 * Boarding pass redesign (design review 2, D104): one QR per ticket that does not change with the clock,
 * a version the passenger can bump to revoke a leaked copy, a PIN that follows that version,
 * and a share link that does not carry the PIN (PAX-017, DRI-009, DRI-010).
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import crypto from 'node:crypto';
import { createFleetBusServer } from '../../source/server/apiServer.js';

const TRIP = 'trp_hn_th_01';
const HOUR = 3600 * 1000;

function startServer() {
  const { server, services } = createFleetBusServer({ authMode: 'off' });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, services, baseUrl: `http://127.0.0.1:${server.address().port}` }));
  });
}

function makeClient(baseUrl) {
  return (path, { method = 'GET', body } = {}) => new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(`${baseUrl}${path}`, { method, headers: { 'Content-Type': 'application/json' } }, (res) => {
      let raw = '';
      res.on('data', (c) => { raw += c; });
      res.on('end', () => { let parsed; try { parsed = JSON.parse(raw); } catch { parsed = raw; } resolve({ status: res.statusCode, body: parsed }); });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

describe('Boarding pass: static versioned QR (PAX-017, D104)', () => {
  let ctx;
  let api;

  before(async () => { ctx = await startServer(); api = makeClient(ctx.baseUrl); });
  after(() => new Promise((resolve) => ctx.server.close(resolve)));

  async function buyTicket(seat, userId) {
    const hold = await api(`/api/v1/trips/${TRIP}/seats/hold`, { method: 'POST', body: { seatCodes: [seat], userId } });
    assert.strictEqual(hold.status, 200, JSON.stringify(hold.body));
    const created = await api('/api/v1/bookings/create', {
      method: 'POST',
      body: {
        tripId: TRIP, userId, holdId: hold.body.data.hold_id, seatCodes: [seat],
        payer: { full_name: 'Nguyen Van Test', phone: '0987000222' },
        passengers: [{ seat_code: seat, full_name: 'Hanh Khach ' + seat }]
      }
    });
    assert.strictEqual(created.status, 201, JSON.stringify(created.body));
    const order = created.body.data;
    const paid = await api('/api/v1/webhooks/vietqr/ipn', {
      method: 'POST',
      body: { transferMemo: order.payment.payment_details.transfer_memo, amountVnd: order.payment.amount_vnd, bankRef: `bank_${seat}_${Date.now()}` }
    });
    assert.strictEqual(paid.status, 200, JSON.stringify(paid.body));
    return paid.body.data.issued_tickets[0];
  }

  const qrOf = async (ticketId) => (await api(`/api/v1/tickets/${ticketId}`)).body.data.boarding_qr;
  const scan = (qr) => api(`/api/v1/driver/trips/${TRIP}/boarding`, { method: 'POST', body: { qrString: qr } });

  it('TC-QR-01: the QR does not change with the clock and carries no expiry', async () => {
    const ticket = await buyTicket('B05', 'u_qr1');
    const first = await qrOf(ticket.ticket_id);
    const second = await qrOf(ticket.ticket_id);
    assert.ok(first && first.qr_code_value, 'the ticket has a boarding QR');
    assert.strictEqual(second.qr_code_value, first.qr_code_value);
    assert.strictEqual(first.version, 1);
    assert.strictEqual(first.expires_at, undefined, 'a boarding QR has no 30-second expiry');
    assert.strictEqual(first.seconds_remaining, undefined);
  });

  it('TC-QR-02: a saved QR still boards hours later (screenshot, print, offline)', async () => {
    const ticket = await buyTicket('A04', 'u_qr2');
    const qr = (await qrOf(ticket.ticket_id)).qr_code_value;
    const later = ctx.services.driverService.boardPassengerByQR(TRIP, qr, Date.now() + 3 * HOUR);
    assert.strictEqual(later.success, true, JSON.stringify(later));
    const again = await scan(qr);
    assert.strictEqual(again.body.code, 'ALREADY_BOARDED', 'one ticket boards once');
  });

  it('TC-QR-03: reissuing revokes the old QR and the old PIN', async () => {
    const ticket = await buyTicket('B07', 'u_qr3');
    const oldQr = (await qrOf(ticket.ticket_id)).qr_code_value;
    const oldPin = (await api(`/api/v1/passenger/tickets/${ticket.ticket_id}/delegate`, { method: 'POST', body: { phone: '0987000333', name: 'Nguoi Di Cung' } })).body.data.offline_pin;

    const re = await api(`/api/v1/passenger/tickets/${ticket.ticket_id}/qr/reissue`, { method: 'POST', body: {} });
    assert.strictEqual(re.status, 200, JSON.stringify(re.body));
    assert.strictEqual(re.body.data.boarding_qr.version, 2);
    assert.notStrictEqual(re.body.data.boarding_qr.qr_code_value, oldQr);

    const revoked = await scan(oldQr);
    assert.strictEqual(revoked.status, 400);
    assert.strictEqual(revoked.body.code, 'QR_REVOKED');
    const oldPinTry = await api(`/api/v1/driver/trips/${TRIP}/boarding/manual`, { method: 'POST', body: { ticket_id: ticket.ticket_id, pin: oldPin } });
    assert.strictEqual(oldPinTry.body.code, 'INVALID_PIN');

    const fresh = await scan(re.body.data.boarding_qr.qr_code_value);
    assert.strictEqual(fresh.status, 200, JSON.stringify(fresh.body));
  });

  it('TC-QR-04: a QR cannot be reissued once the trip has started', async () => {
    const ticket = await buyTicket('B08', 'u_qr4');
    const trip = ctx.services.driverService.activeTrips.get(TRIP);
    const before = trip.status;
    trip.status = 'IN_TRANSIT';
    try {
      const re = await api(`/api/v1/passenger/tickets/${ticket.ticket_id}/qr/reissue`, { method: 'POST', body: {} });
      assert.strictEqual(re.status, 409);
      assert.strictEqual(re.body.code, 'BOARDING_STARTED');
    } finally {
      trip.status = before;
    }
  });

  it('TC-QR-05: the share link does not carry the PIN', async () => {
    const ticket = await buyTicket('B09', 'u_qr5');
    const shared = await api(`/api/v1/passenger/tickets/${ticket.ticket_id}/delegate`, { method: 'POST', body: { phone: '0987000444', name: 'Ba Noi' } });
    assert.strictEqual(shared.status, 200, JSON.stringify(shared.body));
    const { share_link: link, offline_pin: pin } = shared.body.data;
    assert.ok(/^\d{6}$/.test(pin));
    assert.ok(!link.includes(pin), 'the PIN never goes in a URL');
    assert.ok(!link.includes(ticket.ticket_id), 'the link is an opaque token');
  });

  it('TC-QR-06: the group QR is static too and boards the paid members', async () => {
    const hold = await api(`/api/v1/trips/${TRIP}/seats/hold`, { method: 'POST', body: { seatCodes: ['B10', 'B11'], userId: 'u_grp' } });
    const created = await api('/api/v1/bookings/create', {
      method: 'POST',
      body: {
        tripId: TRIP, userId: 'u_grp', holdId: hold.body.data.hold_id, seatCodes: ['B10', 'B11'],
        payer: { full_name: 'Truong Doan', phone: '0987000555' },
        passengers: [{ seat_code: 'B10', full_name: 'Khach Mot' }, { seat_code: 'B11', full_name: 'Khach Hai' }]
      }
    });
    const order = created.body.data;
    await api('/api/v1/webhooks/vietqr/ipn', { method: 'POST', body: { transferMemo: order.payment.payment_details.transfer_memo, amountVnd: order.payment.amount_vnd, bankRef: 'bank_grp' } });
    const gRes = await api(`/api/v1/passenger/orders/${order.payment.order_id}/group-qr`);
    assert.strictEqual(gRes.status, 200, JSON.stringify(gRes.body));
    const g1 = gRes.body.data.group_qr;
    const g2 = (await api(`/api/v1/passenger/orders/${order.payment.order_id}/group-qr`)).body.data.group_qr;
    assert.strictEqual(g1.qr_code_value, g2.qr_code_value);
    assert.strictEqual(g1.expires_at, undefined);
    const res = await scan(g1.qr_code_value);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.data.boarded_passengers.length, 2);
  });

  it('TC-QR-07: the manifest lets an offline tablet check QR and PIN without any shared secret (DRI-009, D104)', async () => {
    const ticket = await buyTicket('A05', 'u_qr7');
    const qr = (await qrOf(ticket.ticket_id)).qr_code_value;
    const pin = (await api(`/api/v1/passenger/tickets/${ticket.ticket_id}/delegate`, { method: 'POST', body: { phone: '0987000666', name: 'Con Gai' } })).body.data.offline_pin;

    const manifest = (await api(`/api/v1/driver/trips/${TRIP}/manifest`)).body.data.manifest;
    const row = manifest.find((m) => m.ticket_id === ticket.ticket_id);
    assert.ok(row && row.boarding_check, 'each manifest row carries what the tablet needs to check a scan');
    assert.strictEqual(row.boarding_check.qr_version, 1);
    assert.strictEqual(row.boarding_check.qr_digest, qr.split('|')[4], 'the tablet compares the scanned signature to the manifest');
    assert.strictEqual(row.boarding_check.pin_digest, crypto.createHash('sha256').update(`${ticket.ticket_id}|${pin}`).digest('hex'));
    assert.ok(!JSON.stringify(manifest).includes(String(pin)), 'the PIN itself is never sent to the tablet');
  });

  it('TC-QR-08: the ticket detail carries the backup PIN of its current version (PAX-017 section 7.1)', async () => {
    const ticket = await buyTicket('A06', 'u_qr8');
    const first = (await api(`/api/v1/tickets/${ticket.ticket_id}`)).body.data;
    assert.ok(/^\d{6}$/.test(first.offline_pin), 'the owner sees the backup PIN on the ticket');
    const shared = (await api(`/api/v1/passenger/tickets/${ticket.ticket_id}/delegate`, { method: 'POST', body: { phone: '0987000777', name: 'Ban' } })).body.data;
    assert.strictEqual(shared.offline_pin, first.offline_pin, 'one PIN per QR version');
    const re = (await api(`/api/v1/passenger/tickets/${ticket.ticket_id}/qr/reissue`, { method: 'POST', body: {} })).body.data;
    assert.ok(re.offline_pin && re.offline_pin !== first.offline_pin, 'a reissue gives a new PIN');
  });
});
