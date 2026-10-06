/**
 * Spec conformance: one seat inventory for online sales, POS, hotline holds and hail passengers
 * (Phase A review, FND-A31, FND-A40, FND-A45, FND-A46). Drives the real HTTP gateway on an ephemeral port.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { createFleetBusServer } from '../../source/server/apiServer.js';

const TRIP = 'trp_hn_th_01';
const MINUTE = 60 * 1000;

describe('Spec conformance: seat inventory integrity', () => {
  let server;
  let services;
  let baseUrl;

  before(async () => {
    ({ server, services } = createFleetBusServer({ authMode: 'off' }));
    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        baseUrl = `http://127.0.0.1:${server.address().port}`;
        resolve();
      });
    });
  });

  after(() => new Promise((resolve) => server.close(resolve)));

  function api(path, { method = 'GET', body } = {}) {
    return new Promise((resolve, reject) => {
      const req = http.request(`${baseUrl}${path}`, { method, headers: { 'Content-Type': 'application/json' } }, (res) => {
        let raw = '';
        res.on('data', (c) => { raw += c; });
        res.on('end', () => {
          let parsed;
          try { parsed = JSON.parse(raw); } catch { parsed = raw; }
          resolve({ status: res.statusCode, body: parsed });
        });
      });
      req.on('error', reject);
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }

  const pos = (seatCodes, extra = {}) => api('/api/v1/ops/pos/orders', {
    method: 'POST',
    body: { tripId: TRIP, passengerName: 'Khach Quay', phone: '0911000111', seatCodes, ...extra }
  });
  const hold = (seatCodes, userId, trip = TRIP) => api(`/api/v1/trips/${trip}/seats/hold`, { method: 'POST', body: { seatCodes, userId } });
  const seatState = (seat, trip = TRIP) => services.seatMapService.getSeatMap(trip, 'a', 'b').data.seats.find((s) => s.seat_code === seat).segment_state;

  it('TC-SPEC-A45: POS validates seats, payment method and never sells a seat twice (MGR-020)', async () => {
    const noSeats = await pos([]);
    assert.strictEqual(noSeats.status, 400);
    assert.strictEqual(noSeats.body.code, 'NO_SEAT_SELECTED');

    const ghost = await pos(['Z99']);
    assert.strictEqual(ghost.status, 400);
    assert.strictEqual(ghost.body.code, 'SEAT_NOT_FOUND');

    const badMethod = await pos(['A04'], { paymentMethod: 'BARTER' });
    assert.strictEqual(badMethod.status, 400);
    assert.strictEqual(badMethod.body.code, 'INVALID_PAYMENT_METHOD');

    const sold = await pos(['A03']); // A03 is already BOOKED in the seeded inventory
    assert.strictEqual(sold.status, 409);
    assert.strictEqual(sold.body.code, 'SEAT_ALREADY_BOOKED');

    const first = await pos(['A04']);
    assert.strictEqual(first.status, 201, JSON.stringify(first.body));
    const second = await pos(['A04']);
    assert.strictEqual(second.status, 409);
    assert.strictEqual(second.body.code, 'SEAT_ALREADY_BOOKED');

    const online = await hold(['A04'], 'u_late');
    assert.strictEqual(online.status, 409);
  });

  it('TC-SPEC-A45b: a POS ticket carries the real trip, departure and fare (PAX-021, MGR-020)', async () => {
    const res = await pos(['A05']);
    assert.strictEqual(res.status, 201);
    const ticket = [...services.paymentService.tickets.values()].find((t) => t.pnr === res.body.data.pnr && t.seat_code === 'A05');
    const mgrTrip = services.managerService.findTrip(TRIP);
    assert.strictEqual(ticket.departure_time, mgrTrip.departure_time);
    assert.strictEqual(ticket.fare_vnd, 220000);
    assert.notStrictEqual(ticket.route_name, 'Vé đặt qua Quầy POS / Hotline');
  });

  it('TC-SPEC-A46: a hotline hold locks the seat for everyone until it expires (MGR-020, REV-06)', async () => {
    const t0 = Date.now();
    const booked = services.managerService.findTrip(TRIP).booked_seats;
    const res = await api('/api/v1/ops/pos/hotline-hold', {
      method: 'POST',
      body: { tripId: TRIP, passengerName: 'Khach Goi', phone: '0911000222', seatCodes: ['A06'], holdPolicy: 'CUSTOM_EXPIRY_MINUTES', customExpiryMinutes: 30, now: t0 }
    });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    assert.strictEqual(seatState('A06'), 'LOCKED_BY_OTHER');
    assert.strictEqual(services.managerService.findTrip(TRIP).booked_seats, booked + 1);

    const online = await hold(['A06'], 'u_online');
    assert.strictEqual(online.status, 409);
    const counter = await pos(['A06']);
    assert.strictEqual(counter.status, 409);
    assert.strictEqual(counter.body.code, 'SEAT_LOCKED_BY_OTHER');

    const released = services.managerService.releaseExpiredHotlineHolds(t0 + 31 * MINUTE);
    assert.strictEqual(released.released_count, 1);
    assert.strictEqual(services.managerService.findTrip(TRIP).booked_seats, booked);
    assert.strictEqual(services.seatMapService.getSeatMap(TRIP, 'a', 'b', t0 + 31 * MINUTE).data.seats.find((s) => s.seat_code === 'A06').segment_state, 'AVAILABLE');
  });

  it('TC-SPEC-A46b: the hotline caller collects the ticket at the counter without a second sale (MGR-020)', async () => {
    const created = await api('/api/v1/ops/pos/hotline-hold', {
      method: 'POST',
      body: { tripId: TRIP, passengerName: 'Khach Den Quay', phone: '0911000333', seatCodes: ['A07', 'A08'], holdPolicy: 'CUSTOM_EXPIRY_MINUTES', customExpiryMinutes: 60 }
    });
    assert.strictEqual(created.status, 201);
    const reservation = created.body.data;
    const booked = services.managerService.findTrip(TRIP).booked_seats;

    const wrongSeats = await pos(['A07'], { reservationId: reservation.reservation_id });
    assert.strictEqual(wrongSeats.status, 409);
    assert.strictEqual(wrongSeats.body.code, 'RESERVATION_MISMATCH');

    const converted = await pos(['A07', 'A08'], { reservationId: reservation.reservation_id });
    assert.strictEqual(converted.status, 201, JSON.stringify(converted.body));
    assert.strictEqual(services.managerService.hotlineReservations.find((r) => r.reservation_id === reservation.reservation_id).hold_status, 'CONVERTED');
    assert.strictEqual(services.managerService.findTrip(TRIP).booked_seats, booked, 'seats were already counted when held');
    assert.strictEqual(seatState('A07'), 'BOOKED');
  });

  it('TC-SPEC-A46c: a hotline hold needs free seats and valid details (MGR-020)', async () => {
    const taken = await api('/api/v1/ops/pos/hotline-hold', {
      method: 'POST', body: { tripId: TRIP, passengerName: 'Khach', phone: '0911000444', seatCodes: ['A03'] }
    });
    assert.strictEqual(taken.status, 409);
    const badPhone = await api('/api/v1/ops/pos/hotline-hold', {
      method: 'POST', body: { tripId: TRIP, passengerName: 'Khach', phone: '123', seatCodes: ['A09'] }
    });
    assert.strictEqual(badPhone.status, 400);
    assert.strictEqual(badPhone.body.code, 'INVALID_PHONE');
    const badPolicy = await api('/api/v1/ops/pos/hotline-hold', {
      method: 'POST', body: { tripId: TRIP, passengerName: 'Khach', phone: '0911000444', seatCodes: ['A09'], holdPolicy: 'FOREVER' }
    });
    assert.strictEqual(badPolicy.status, 400);
    assert.strictEqual(badPolicy.body.code, 'INVALID_HOLD_POLICY');
  });

  it('TC-SPEC-A40: a hail passenger can only take a seat that is really free, and takes it for good (DRI-007, OQ-014)', async () => {
    await api(`/api/v1/driver/trips/${TRIP}/start`, { method: 'POST' });

    const sold = await api(`/api/v1/driver/trips/${TRIP}/onboard-hail`, {
      method: 'POST', body: { seat_code: 'A03', passenger_name: 'Khach Vay', amount_collected_vnd: 220000 }
    });
    assert.strictEqual(sold.status, 409);
    assert.strictEqual(sold.body.code, 'SEAT_OCCUPIED');

    const ghost = await api(`/api/v1/driver/trips/${TRIP}/onboard-hail`, {
      method: 'POST', body: { seat_code: 'Z99', passenger_name: 'Khach Vay', amount_collected_vnd: 220000 }
    });
    assert.strictEqual(ghost.status, 400);
    assert.strictEqual(ghost.body.code, 'SEAT_NOT_FOUND');

    const ok = await api(`/api/v1/driver/trips/${TRIP}/onboard-hail`, {
      method: 'POST', body: { seat_code: 'A09', passenger_name: 'Khach Vay', amount_collected_vnd: 220000 }
    });
    assert.strictEqual(ok.status, 201, JSON.stringify(ok.body));
    assert.strictEqual(seatState('A09'), 'BOOKED');
    const late = await hold(['A09'], 'u_too_late');
    assert.strictEqual(late.status, 409);
  });

  it('TC-SPEC-A31: one active hold per user and trip, never extended by repeating it (PAX-009, PAX-010)', async () => {
    const first = await hold(['B01', 'B02'], 'u_hoarder');
    assert.strictEqual(first.status, 200);

    const same = await hold(['B02', 'B01'], 'u_hoarder');
    assert.strictEqual(same.body.data.hold_id, first.body.data.hold_id);
    assert.strictEqual(same.body.data.expires_at, first.body.data.expires_at);

    const other = await hold(['B03'], 'u_hoarder');
    assert.strictEqual(other.status, 200);
    assert.strictEqual(seatState('B01'), 'AVAILABLE', 'the earlier hold is replaced, so a user never holds more than one set');
    assert.strictEqual(seatState('B03'), 'LOCKED_BY_OTHER');

    const mapSeat = services.seatMapService.getSeatMap(TRIP, 'a', 'b').data.seats.find((s) => s.seat_code === 'B03');
    assert.ok(!('locked_by_user' in mapSeat), 'the seat map must not reveal who holds a seat');
  });

  it('TC-SPEC-A31b: every sellable trip has an inventory and unknown trips are never invented (PAX-009)', async () => {
    const onSecondTrip = await hold(['A10'], 'u_second_trip', 'trp_hn_th_02');
    assert.strictEqual(onSecondTrip.status, 200);

    const result = services.seatMapService.confirmBooking('trp_nope', ['A01']);
    assert.strictEqual(result.success, false);
    assert.strictEqual(services.seatMapService.tripLayouts.has('trp_nope'), false);
  });
});
