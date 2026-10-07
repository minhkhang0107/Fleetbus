/**
 * Spec conformance: seat inventory by segment (BR-SEAT-001, OQ-028).
 * Trip trp_hn_th_01 stops: stp_hn_gb (0), stp_hn_nuoc_ngam (1), stp_nb (2), stp_th_pb (3), stp_th_sam_son (4).
 * Segments 0 to 3: gb to nuoc_ngam, nuoc_ngam to nb, nb to th_pb, th_pb to sam_son.
 * Pickup is allowed at gb, nuoc_ngam, nb; drop-off at nb, th_pb, sam_son. The tests use the stops GB, NB and PB.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import http from 'node:http';
import { createFleetBusServer } from '../../source/server/apiServer.js';

const TRIP = 'trp_hn_th_01';
const GB = 'stp_hn_gb';
const NB = 'stp_nb';
const PB = 'stp_th_pb';
const READY = {
  tires_checked: true, brakes_fluid_checked: true, ac_cleanliness_checked: true,
  first_aid_extinguisher_checked: true, fuel_level_sufficient: true, gps_telemetry_beacon_active: true
};

describe('Spec conformance: seat inventory by segment', () => {
  let server;
  let services;
  let baseUrl;
  let driver;
  let dispatcher;
  let cashier;
  let phoneSeq = 913000000;

  before(async () => {
    ({ server, services } = createFleetBusServer({ webhookSecret: null }));
    await new Promise((resolve) => server.listen(0, '127.0.0.1', () => { baseUrl = `http://127.0.0.1:${server.address().port}`; resolve(); }));
    driver = (await login('/api/v1/auth/driver/login', { staffIdOrPhone: 'TX8821', pin: '123456' })).token;
    dispatcher = (await login('/api/v1/auth/staff/login', { username: 'dispatcher@busgo.vn', password: 'disp123' })).token;
    cashier = (await login('/api/v1/auth/staff/login', { username: 'cashier@busgo.vn', password: 'cash123' })).token;
  });
  after(() => new Promise((resolve) => server.close(resolve)));

  function api(path, { method = 'GET', body, token } = {}) {
    return new Promise((resolve, reject) => {
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      if (method === 'POST') headers['Idempotency-Key'] = crypto.randomUUID();
      const req = http.request(`${baseUrl}${path}`, { method, headers }, (res) => {
        let raw = '';
        res.on('data', (c) => { raw += c; });
        res.on('end', () => { let b; try { b = JSON.parse(raw); } catch { b = raw; } resolve({ status: res.statusCode, body: b }); });
      });
      req.on('error', reject);
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }
  async function login(path, body) {
    const res = await api(path, { method: 'POST', body });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    return res.body.data;
  }
  async function passenger() {
    const phone = `0${phoneSeq++}`;
    const otp = await api('/api/v1/auth/passenger/otp/request', { method: 'POST', body: { phone } });
    const ver = await api('/api/v1/auth/passenger/otp/verify', { method: 'POST', body: { phone, otp: otp.body.data.mock_otp } });
    return { phone, token: ver.body.data.token };
  }
  const hold = (pax, seatCodes, pickupStopId, dropoffStopId) => api(`/api/v1/trips/${TRIP}/seats/hold`, { method: 'POST', token: pax.token, body: { seatCodes, pickupStopId, dropoffStopId } });
  async function buy(pax, seatCodes, pickupStopId, dropoffStopId) {
    const h = await hold(pax, seatCodes, pickupStopId, dropoffStopId);
    assert.strictEqual(h.status, 200, JSON.stringify(h.body));
    const order = await api('/api/v1/bookings/create', {
      method: 'POST', token: pax.token,
      body: { tripId: TRIP, holdId: h.body.data.hold_id, seatCodes, payer: { full_name: 'Khach', phone: pax.phone, email: 'k@b.vn' }, passengers: seatCodes.map((s) => ({ full_name: `K ${s}`, phone: pax.phone, seat_code: s })) }
    });
    assert.strictEqual(order.status, 201, JSON.stringify(order.body));
    const ipn = await api('/api/v1/webhooks/vietqr/ipn', { method: 'POST', body: { transferMemo: order.body.data.payment.payment_details.transfer_memo, amountVnd: order.body.data.order.total_payment_vnd, bankRef: `FT${crypto.randomUUID()}` } });
    assert.strictEqual(ipn.status, 200, JSON.stringify(ipn.body));
    return ipn.body.data.issued_tickets;
  }
  const matrix = async () => (await api(`/api/v1/ops/trips/${TRIP}/seat-matrix`, { token: dispatcher })).body.data;
  const seatRow = async (code) => (await matrix()).seats.find((s) => s.seat_code === code);
  const segmentStates = async (code) => (await seatRow(code)).segments.map((s) => s.state);

  it('TC-SEG-01: a seat sold for the first segment stays free for the next one, but not for the whole route or an overlapping part', async () => {
    const a = await passenger();
    const b = await passenger();
    const tickets = await buy(a, ['A09'], GB, NB);
    assert.strictEqual(tickets[0].pickup_stop_id, GB);
    assert.strictEqual(tickets[0].dropoff_stop_id, NB);
    assert.deepStrictEqual(await segmentStates('A09'), ['BOOKED', 'BOOKED', 'AVAILABLE', 'AVAILABLE']);
    assert.strictEqual((await seatRow('A09')).state, 'PARTIALLY_BOOKED');

    const whole = await hold(b, ['A09']);
    assert.strictEqual(whole.status, 409);
    assert.strictEqual(whole.body.code, 'SEAT_ALREADY_BOOKED');
    const overlap = await hold(b, ['A09'], GB, PB);
    assert.strictEqual(overlap.status, 409);
    const next = await hold(b, ['A09'], NB, PB);
    assert.strictEqual(next.status, 200, JSON.stringify(next.body));
    assert.deepStrictEqual(await segmentStates('A09'), ['BOOKED', 'BOOKED', 'HELD', 'AVAILABLE']);
  });

  it('TC-SEG-02: the app seat map answers for the segment asked (PAX-009)', async () => {
    const seat = async (query) => (await api(`/api/v1/trips/${TRIP}/seat-map${query}`)).body.data.seats.find((s) => s.seat_code === 'A08');
    const a = await passenger();
    await buy(a, ['A08'], GB, NB);
    assert.strictEqual((await seat('')).segment_state, 'BOOKED', 'the default is the whole route');
    assert.strictEqual((await seat(`?pickup_stop_id=${GB}&dropoff_stop_id=${NB}`)).segment_state, 'BOOKED');
    assert.strictEqual((await seat(`?pickup_stop_id=${NB}&dropoff_stop_id=${PB}`)).segment_state, 'AVAILABLE');
  });

  it('TC-SEG-03: a segment must run forward between stops of the trip that allow it (PAX-008)', async () => {
    const a = await passenger();
    const code = async (p, d) => (await hold(a, ['B02'], p, d)).body.code;
    assert.strictEqual(await code(PB, GB), 'INVALID_SEGMENT');
    assert.strictEqual(await code(GB, GB), 'INVALID_SEGMENT');
    assert.strictEqual(await code('stp_nowhere', PB), 'STOP_NOT_FOUND');
    assert.strictEqual(await code(PB, 'stp_th_sam_son'), 'STOP_NOT_ALLOWED', 'no pickup at a drop-off only stop');
    assert.strictEqual(await code(GB, NB), undefined, 'a valid pair is held');
  });

  it('TC-SEG-04: cancelling a segment ticket frees only its segment', async () => {
    const a = await passenger();
    const [t1] = await buy(a, ['A07'], GB, NB);
    const b = await passenger();
    await buy(b, ['A07'], NB, PB);
    assert.deepStrictEqual(await segmentStates('A07'), ['BOOKED', 'BOOKED', 'BOOKED', 'AVAILABLE']);
    const cancel = await api(`/api/v1/passenger/tickets/${t1.ticket_id}/cancel`, { method: 'POST', token: a.token, body: {} });
    assert.strictEqual(cancel.status, 200);
    assert.deepStrictEqual(await segmentStates('A07'), ['AVAILABLE', 'AVAILABLE', 'BOOKED', 'AVAILABLE']);
  });

  it('TC-SEG-05: the counter and the hotline sell and hold by segment too (MGR-020)', async () => {
    const pos = (seatCodes, pickupStopId, dropoffStopId) => api('/api/v1/ops/pos/orders', { method: 'POST', token: cashier, body: { tripId: TRIP, passengerName: 'Khach Quay', phone: '0933555777', seatCodes, pickupStopId, dropoffStopId } });
    assert.strictEqual((await pos(['B07'], GB, NB)).status, 201);
    assert.deepStrictEqual(await segmentStates('B07'), ['BOOKED', 'BOOKED', 'AVAILABLE', 'AVAILABLE']);
    assert.strictEqual((await pos(['B07'], GB, PB)).status, 409);
    assert.strictEqual((await pos(['B07'], NB, PB)).status, 201);
    const rsv = await api('/api/v1/ops/pos/hotline-hold', { method: 'POST', token: cashier, body: { tripId: TRIP, passengerName: 'Khach Goi', phone: '0933555888', seatCodes: ['B10'], holdPolicy: 'CUSTOM_EXPIRY_MINUTES', customExpiryMinutes: 30, pickupStopId: NB, dropoffStopId: PB } });
    assert.strictEqual(rsv.status, 201, JSON.stringify(rsv.body));
    assert.deepStrictEqual(await segmentStates('B10'), ['AVAILABLE', 'AVAILABLE', 'HOTLINE_HOLD', 'AVAILABLE']);
  });

  describe('on the road', () => {
    before(async () => {
      assert.strictEqual((await api(`/api/v1/driver/trips/${TRIP}/readiness`, { method: 'POST', token: driver, body: { checklist: READY } })).status, 200);
      assert.strictEqual((await api(`/api/v1/driver/trips/${TRIP}/start`, { method: 'POST', token: driver })).status, 200);
    });
    const arrive = (stop) => api(`/api/v1/driver/trips/${TRIP}/stops/${stop}/arrive`, { method: 'POST', token: driver });

    it('TC-SEG-06: a no-show frees the seat from the stop the bus has reached, not the part already driven (DRI-011, OQ-028)', async () => {
      const a = await passenger();
      const [ticket] = await buy(a, ['A06'], GB, PB);
      assert.deepStrictEqual(await segmentStates('A06'), ['BOOKED', 'BOOKED', 'BOOKED', 'AVAILABLE']);
      assert.strictEqual((await arrive(GB)).status, 200);
      assert.strictEqual((await arrive(NB)).status, 200);
      const res = await api(`/api/v1/driver/trips/${TRIP}/tickets/${ticket.ticket_id}/no-show`, { method: 'POST', token: driver, body: { reason: 'Không đến' } });
      assert.strictEqual(res.status, 200, JSON.stringify(res.body));
      assert.deepStrictEqual(await segmentStates('A06'), ['BOOKED', 'BOOKED', 'AVAILABLE', 'AVAILABLE']);
      const b = await passenger();
      assert.strictEqual((await hold(b, ['A06'], NB, PB)).status, 200, 'the seat can be sold again for the rest of the trip');
      assert.strictEqual((await hold(await passenger(), ['A06'], GB, NB)).status, 409, 'the part already driven stays booked');
    });

    it('TC-SEG-07: a hail passenger takes a seat that is free from the current stop to the drop-off, even if sold earlier on the route (DRI-007)', async () => {
      const a = await passenger();
      await buy(a, ['B05'], GB, NB);
      await arrive(NB);
      const hail = await api(`/api/v1/driver/trips/${TRIP}/onboard-hail`, { method: 'POST', token: driver, body: { seat_code: 'B05', dropoff_stop_id: PB } });
      assert.strictEqual(hail.status, 201, JSON.stringify(hail.body));
      assert.strictEqual(hail.body.data.pickup_stop_id, NB);
      assert.deepStrictEqual(await segmentStates('B05'), ['BOOKED', 'BOOKED', 'BOOKED', 'AVAILABLE']);

      const taken = await api(`/api/v1/driver/trips/${TRIP}/onboard-hail`, { method: 'POST', token: driver, body: { seat_code: 'B05', dropoff_stop_id: PB } });
      assert.strictEqual(taken.status, 409);
      const b = await passenger();
      await buy(b, ['A05'], NB, PB);
      const clash = await api(`/api/v1/driver/trips/${TRIP}/onboard-hail`, { method: 'POST', token: driver, body: { seat_code: 'A05', dropoff_stop_id: PB } });
      assert.strictEqual(clash.status, 409, 'a seat sold from the current stop onwards is not free');
    });
  });
});
