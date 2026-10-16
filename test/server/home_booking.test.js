import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { createFleetBusServer } from '../../source/server/apiServer.js';
import { findOperatorByCode } from '../../source/server/core/operators.js';
import { resolveHomeBooking } from '../../source/server/core/serviceAreas.js';

const HOME_HN = { address: '12 ngõ 34 Giải Phóng, Hoàng Mai', lat: 20.99, lng: 105.84, note: 'cổng xanh' };
const HOME_TH = { address: '5 Lê Lợi, TP Thanh Hóa', lat: 19.8, lng: 105.78 };
const HAI_PHONG = { address: 'Lạch Tray, Hải Phòng', lat: 20.86, lng: 106.68 };
const STOPS = [
  { stop_id: 'stp_hn_gb', name: 'Bến xe Giáp Bát', pickup_allowed: true, dropoff_allowed: false },
  { stop_id: 'stp_nb', name: 'Bến xe Ninh Bình', pickup_allowed: true, dropoff_allowed: true },
  { stop_id: 'stp_th_pb', name: 'Bến xe Phía Bắc Thanh Hóa', pickup_allowed: false, dropoff_allowed: true }
];
const DEPARTURE = '2026-08-28T07:00:00+07:00';
const DAY_BEFORE = new Date(DEPARTURE).getTime() - 24 * 3600000;

describe('Booking with home pickup / home drop-off', () => {
  describe('rules', () => {
    const saomai = () => findOperatorByCode('SAOMAI').service_config;
    const base = { stops: STOPS, departureTime: DEPARTURE, pickupStopId: 'stp_hn_gb', dropoffStopId: 'stp_th_pb', now: DAY_BEFORE };

    it('snapshots the address, fee, area and pickup window', () => {
      const r = resolveHomeBooking(saomai(), { ...base, homePickup: HOME_HN });
      assert.strictEqual(r.ok, true);
      assert.strictEqual(r.fee_vnd, 50000);
      assert.strictEqual(r.home_dropoff, null);
      assert.deepStrictEqual(
        { address: r.home_pickup.address, note: r.home_pickup.note, area: r.home_pickup.area_id, anchor: r.home_pickup.anchor_stop_id },
        { address: HOME_HN.address, note: 'cổng xanh', area: 'sa_saomai_hn', anchor: 'stp_hn_gb' }
      );
      assert.strictEqual(r.home_pickup.window_from, '2026-08-27T22:45:00.000Z', '75 min before 07:00');
      assert.strictEqual(r.home_pickup.window_to, '2026-08-27T23:30:00.000Z', '30 min before 07:00');
    });

    it('no home service means no fee and nothing stored', () => {
      assert.deepStrictEqual(resolveHomeBooking(saomai(), base), { ok: true, home_pickup: null, home_dropoff: null, fee_vnd: 0 });
    });

    it('home to home adds both fees when the company allows it, and is refused when it does not', () => {
      const both = resolveHomeBooking(saomai(), { ...base, homePickup: HOME_HN, homeDropoff: HOME_TH });
      assert.strictEqual(both.fee_vnd, 80000);
      assert.strictEqual(both.home_dropoff.anchor_stop_id, 'stp_th_pb');
      const strict = resolveHomeBooking({ ...saomai(), allow_home_to_home: false }, { ...base, homePickup: HOME_HN, homeDropoff: HOME_TH });
      assert.strictEqual(strict.code, 'HOME_TO_HOME_DISABLED');
    });

    it('refuses an address outside the area, a missing address, a mid-route segment and a disabled mode', () => {
      assert.strictEqual(resolveHomeBooking(saomai(), { ...base, homePickup: HAI_PHONG }).code, 'OUTSIDE_SERVICE_AREA');
      assert.strictEqual(resolveHomeBooking(saomai(), { ...base, homePickup: { ...HOME_HN, address: ' ' } }).code, 'VALIDATION_ERROR');
      const midRoute = resolveHomeBooking(saomai(), { ...base, pickupStopId: 'stp_nb', homePickup: HOME_HN });
      assert.strictEqual(midRoute.code, 'HOME_STOP_MISMATCH');
      assert.match(midRoute.message, /Giáp Bát/);
      assert.strictEqual(resolveHomeBooking(findOperatorByCode('XUYENVIET').service_config, { ...base, homePickup: HOME_HN }).code, 'MODE_DISABLED');
      const late = resolveHomeBooking(saomai(), { ...base, homePickup: HOME_HN, now: new Date(DEPARTURE).getTime() - 30 * 60000 });
      assert.strictEqual(late.code, 'LEAD_TIME_TOO_SHORT');
    });
  });

  describe('HTTP: order, ticket and driver manifest', () => {
    let server;
    let services;
    let baseUrl;
    let paxToken;

    const request = async (path, { method = 'GET', body, token } = {}) => {
      const headers = { 'Content-Type': 'application/json', 'X-Operator-Code': 'SAOMAI' };
      if (token) headers.Authorization = `Bearer ${token}`;
      if (method === 'POST') headers['Idempotency-Key'] = crypto.randomUUID();
      const res = await fetch(`${baseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
      return { status: res.status, body: await res.json() };
    };
    const hold = async (seat, pickupStopId = 'stp_hn_gb', dropoffStopId = 'stp_th_pb') => {
      const res = await request('/api/v1/passenger/trips/trp_hn_th_01/hold-seats', { method: 'POST', token: paxToken, body: { seatCodes: [seat], pickupStopId, dropoffStopId } });
      assert.strictEqual(res.status, 200, JSON.stringify(res.body));
      return res.body.data.hold_id;
    };
    const order = (seat, holdId, extra) => request('/api/v1/passenger/bookings/create', {
      method: 'POST',
      token: paxToken,
      body: { tripId: 'trp_hn_th_01', holdId, seatCodes: [seat], payer: { full_name: 'Nguyễn An', phone: '0901234567' }, passengers: [{ seat_code: seat, full_name: 'Nguyễn An', phone: '0901234567' }], ...extra }
    });

    before(async () => {
      ({ server, services } = createFleetBusServer());
      await new Promise(resolve => server.listen(0, resolve));
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      const otp = await request('/api/v1/auth/passenger/otp/request', { method: 'POST', body: { phone: '0901234567' } });
      paxToken = (await request('/api/v1/auth/passenger/otp/verify', { method: 'POST', body: { phone: '0901234567', otp: otp.body.data.mock_otp } })).body.data.token;
    });

    after(() => new Promise(resolve => server.close(resolve)));

    it('a home pickup is charged, ticketed and shown to the driver with its address and window', async () => {
      const plain = await order('B02', await hold('B02'));
      assert.strictEqual(plain.status, 201, JSON.stringify(plain.body));
      const fare = plain.body.data.payment.amount_vnd;

      const created = await order('B03', await hold('B03'), { homePickup: HOME_HN });
      assert.strictEqual(created.status, 201, JSON.stringify(created.body));
      assert.strictEqual(created.body.data.order.home_service_fee_vnd, 50000);
      assert.strictEqual(created.body.data.payment.amount_vnd, fare + 50000, 'the fee is added to the transfer amount');

      const settled = services.paymentService.settlePayment(created.body.data.payment.order_id);
      assert.strictEqual(settled.success, true, JSON.stringify(settled));

      const tickets = await request('/api/v1/passenger/tickets?tab=UPCOMING', { token: paxToken });
      const ticket = tickets.body.data.find(t => t.seat_code === 'B03');
      assert.strictEqual(ticket.home_pickup.address, HOME_HN.address);
      assert.ok(ticket.home_pickup.window_from && ticket.home_pickup.window_to);
      assert.strictEqual(ticket.home_dropoff, null);

      const manifest = services.driverService.activeTrips.get('trp_hn_th_01').manifest.find(p => p.seat_code === 'B03');
      assert.strictEqual(manifest.home_pickup.address, HOME_HN.address);
      assert.strictEqual(manifest.home_pickup.note, 'cổng xanh');
      assert.strictEqual(manifest.pickup_stop_id, 'stp_hn_gb');
    });

    it('refuses an address outside the area and a home pickup on a mid-route segment', async () => {
      const outside = await order('B04', await hold('B04'), { homePickup: HAI_PHONG });
      assert.strictEqual(outside.status, 422);
      assert.strictEqual(outside.body.code, 'OUTSIDE_SERVICE_AREA');
      const mid = await order('B05', await hold('B05', 'stp_nb'), { homePickup: HOME_HN });
      assert.strictEqual(mid.status, 422);
      assert.strictEqual(mid.body.code, 'HOME_STOP_MISMATCH');
    });
  });
});
