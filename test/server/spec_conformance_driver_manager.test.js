/**
 * Spec conformance: driver trip lifecycle, COD, privacy and manager fleet rules
 * (Phase A review, FND-A38 to FND-A52). Drives the real HTTP gateway on an ephemeral port.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { createFleetBusServer } from '../../source/server/apiServer.js';

const PASSENGER_TRIP = 'trp_hn_th_01';
const SHIFT_TRIP = 'trp_991823';
const READY_CHECKLIST = {
  tires_checked: true,
  brakes_fluid_checked: true,
  ac_cleanliness_checked: true,
  first_aid_extinguisher_checked: true,
  fuel_level_sufficient: true,
  gps_telemetry_beacon_active: true
};

describe('Spec conformance: driver lifecycle, COD, privacy and fleet', () => {
  let server;
  let services;
  let baseUrl;

  before(async () => {
    ({ server, services } = createFleetBusServer());
    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        baseUrl = `http://127.0.0.1:${server.address().port}`;
        resolve();
      });
    });
  });

  after(() => new Promise((resolve) => server.close(resolve)));

  function api(path, { method = 'GET', body, headers = {} } = {}) {
    return new Promise((resolve, reject) => {
      const req = http.request(`${baseUrl}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', ...headers }
      }, (res) => {
        let raw = '';
        res.on('data', (c) => { raw += c; });
        res.on('end', () => {
          let parsed;
          try { parsed = JSON.parse(raw); } catch { parsed = raw; }
          resolve({ status: res.statusCode, body: parsed, raw });
        });
      });
      req.on('error', reject);
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }

  async function buyTicket(seat, userId, phone) {
    const hold = await api(`/api/v1/trips/${PASSENGER_TRIP}/seats/hold`, { method: 'POST', body: { seatCodes: [seat], userId } });
    const created = await api('/api/v1/bookings/create', {
      method: 'POST',
      body: {
        tripId: PASSENGER_TRIP, userId, holdId: hold.body.data.hold_id, seatCodes: [seat],
        payer: { full_name: 'Khach Rieng Tu', phone },
        passengers: [{ seat_code: seat, full_name: 'Khach Rieng Tu' }]
      }
    });
    const order = created.body.data;
    const paid = await api('/api/v1/webhooks/vietqr/ipn', {
      method: 'POST',
      body: { transferMemo: order.payment.payment_details.transfer_memo, amountVnd: order.payment.amount_vnd, bankRef: `bank_${Date.now()}_${seat}` }
    });
    return paid.body.data.issued_tickets[0];
  }

  it('TC-SPEC-A38: the driver never receives a full passenger phone number (OQ-007)', async () => {
    const rawPhone = '0987123456';
    const ticket = await buyTicket('B05', 'u_privacy', rawPhone);

    const manifest = await api(`/api/v1/driver/trips/${PASSENGER_TRIP}/manifest`);
    assert.strictEqual(manifest.status, 200);
    assert.ok(!manifest.raw.includes(rawPhone), 'manifest must not contain the raw phone');
    assert.ok(!manifest.raw.includes('passenger_phone'), 'manifest must not expose passenger_phone');
    const entry = manifest.body.data.manifest.find((m) => m.ticket_id === ticket.ticket_id);
    assert.strictEqual(entry.phone_masked, '098***456');

    const today = await api('/api/v1/driver/trips/today');
    assert.ok(!today.raw.includes(rawPhone), 'shift trip list must not contain the raw phone');

    const manual = await api(`/api/v1/driver/trips/${PASSENGER_TRIP}/boarding/manual`, {
      method: 'POST', body: { ticket_id: ticket.ticket_id }
    });
    assert.strictEqual(manual.status, 200);
    assert.ok(!manual.raw.includes(rawPhone), 'boarding response must not contain the raw phone');
  });

  it('TC-SPEC-A42: a driver only sees the trips assigned to them (DRI-002)', async () => {
    const other = await api('/api/v1/driver/trips/today', { headers: { 'x-driver-id': 'drv_9912b' } });
    assert.strictEqual(other.status, 200);
    assert.strictEqual(other.body.data.trips.length, 0);
    const own = await api('/api/v1/driver/trips/today', { headers: { 'x-driver-id': 'drv_8821a' } });
    assert.ok(own.body.data.trips.length >= 1);
  });

  it('TC-SPEC-A41a: a trip cannot start before the readiness checklist is complete (DRI-004, DRI-005)', async () => {
    const early = await api(`/api/v1/driver/trips/${SHIFT_TRIP}/start`, { method: 'POST' });
    assert.strictEqual(early.status, 400);
    assert.strictEqual(early.body.code, 'INVALID_TRIP_STATE');
  });

  it('TC-SPEC-A41b: telemetry is only accepted for a running trip with real coordinates (DRI-006)', async () => {
    const notStarted = await api(`/api/v1/driver/trips/${SHIFT_TRIP}/telemetry`, {
      method: 'POST', body: { lat: 20.98, lng: 105.84, speed_kmh: 40 }
    });
    assert.strictEqual(notStarted.status, 400);
    assert.strictEqual(notStarted.body.code, 'TRIP_NOT_ACTIVE');

    await api(`/api/v1/driver/trips/${SHIFT_TRIP}/readiness`, { method: 'POST', body: { checklist: READY_CHECKLIST } });
    const started = await api(`/api/v1/driver/trips/${SHIFT_TRIP}/start`, { method: 'POST' });
    assert.strictEqual(started.status, 200, JSON.stringify(started.body));

    const badCoords = await api(`/api/v1/driver/trips/${SHIFT_TRIP}/telemetry`, {
      method: 'POST', body: { lat: 'abc', lng: 500, speed_kmh: -5 }
    });
    assert.strictEqual(badCoords.status, 400);
    assert.strictEqual(badCoords.body.code, 'INVALID_TELEMETRY');

    const good = await api(`/api/v1/driver/trips/${SHIFT_TRIP}/telemetry`, {
      method: 'POST', body: { lat: 20.95, lng: 105.85, speed_kmh: 55, bearing_deg: 180 }
    });
    assert.strictEqual(good.status, 200);
  });

  it('TC-SPEC-A39: COD is collected once, at the server fare, with a valid change method (DRI-012)', async () => {
    const path = `/api/v1/driver/trips/${SHIFT_TRIP}/payments/cod-collect`;
    const ticketId = 'tkt_88219_A02';

    const mismatch = await api(path, { method: 'POST', body: { ticket_id: ticketId, amount_collected_vnd: 220000, fare_amount_vnd: 1000 } });
    assert.strictEqual(mismatch.status, 400);
    assert.strictEqual(mismatch.body.code, 'FARE_MISMATCH');

    const short = await api(path, { method: 'POST', body: { ticket_id: ticketId, amount_collected_vnd: 100000 } });
    assert.strictEqual(short.status, 400);
    assert.strictEqual(short.body.code, 'INSUFFICIENT_AMOUNT');

    const badMethod = await api(path, { method: 'POST', body: { ticket_id: ticketId, amount_collected_vnd: 500000, change_settlement_method: 'KEEP_IT' } });
    assert.strictEqual(badMethod.status, 400);
    assert.strictEqual(badMethod.body.code, 'INVALID_SETTLEMENT_METHOD');

    const notCod = await api(path, { method: 'POST', body: { ticket_id: 'tkt_88219_B01', amount_collected_vnd: 220000 } });
    assert.strictEqual(notCod.status, 400);
    assert.strictEqual(notCod.body.code, 'NOT_COD_TICKET');

    const ok = await api(path, {
      method: 'POST',
      body: { ticket_id: ticketId, amount_collected_vnd: 500000, change_settlement_method: 'REST_STOP_DEBT_RECEIPT' }
    });
    assert.strictEqual(ok.status, 200, JSON.stringify(ok.body));
    assert.strictEqual(ok.body.data.change_settlement.change_due_vnd, 280000);
    assert.strictEqual(ok.body.data.change_settlement.debt_receipt_code, 'DR-88219A02-280K');
    assert.strictEqual(ok.body.data.boarding_status, 'BOARDED');

    const twice = await api(path, { method: 'POST', body: { ticket_id: ticketId, amount_collected_vnd: 220000 } });
    assert.strictEqual(twice.status, 400);
    assert.strictEqual(twice.body.code, 'ALREADY_COLLECTED');
    assert.strictEqual(services.driverService.activeTrips.get(SHIFT_TRIP).total_cod_collected_vnd, 220000);
  });

  it('TC-SPEC-A40: a hail passenger is priced by the server and may be credited change to the wallet (DRI-007, REV-04, REV-05)', async () => {
    const path = `/api/v1/driver/trips/${SHIFT_TRIP}/onboard-hail`;

    const noSeat = await api(path, { method: 'POST', body: { passenger_name: 'Khach Vay', amount_collected_vnd: 220000 } });
    assert.strictEqual(noSeat.status, 400);
    assert.strictEqual(noSeat.body.code, 'SEAT_REQUIRED');

    const cheap = await api(path, { method: 'POST', body: { seat_code: 'A05', passenger_name: 'Khach Vay', fare_amount_vnd: 1000, amount_collected_vnd: 1000 } });
    assert.strictEqual(cheap.status, 400);
    assert.strictEqual(cheap.body.code, 'INSUFFICIENT_AMOUNT');

    const noPhoneWallet = await api(path, {
      method: 'POST',
      body: { seat_code: 'A05', passenger_name: 'Khach Vay', amount_collected_vnd: 500000, change_settlement_method: 'WALLET_CREDIT' }
    });
    assert.strictEqual(noPhoneWallet.status, 400);
    assert.strictEqual(noPhoneWallet.body.code, 'WALLET_PHONE_REQUIRED');

    const ok = await api(path, {
      method: 'POST',
      body: { seat_code: 'A05', passenger_name: 'Khach Vay', phone: '0987000999', fare_amount_vnd: 1000, amount_collected_vnd: 500000, change_settlement_method: 'WALLET_CREDIT' }
    });
    assert.strictEqual(ok.status, 201, JSON.stringify(ok.body));
    assert.strictEqual(ok.body.data.change_settlement.fare_amount_vnd, 220000);
    assert.strictEqual(ok.body.data.change_settlement.change_due_vnd, 280000);
    assert.ok(!ok.raw.includes('0987000999'), 'hail response must not expose the raw phone');
    assert.strictEqual(services.paymentService.getWalletBalance('0987000999'), 280000);

    const trip = services.driverService.activeTrips.get(SHIFT_TRIP);
    assert.strictEqual(trip.total_hail_collected_vnd, 220000);
  });

  it('TC-SPEC-A41c: ending a trip reconciles cash on the server and works exactly once (DRI-017)', async () => {
    const notStarted = await api(`/api/v1/driver/trips/${PASSENGER_TRIP}/end`, { method: 'POST', body: {} });
    assert.strictEqual(notStarted.status, 400);
    assert.strictEqual(notStarted.body.code, 'INVALID_TRIP_STATE');

    const end = await api(`/api/v1/driver/trips/${SHIFT_TRIP}/end`, {
      method: 'POST', body: { total_cod_collected_vnd: 999999999, total_hail_collected_vnd: 1 }
    });
    assert.strictEqual(end.status, 200, JSON.stringify(end.body));
    assert.strictEqual(end.body.data.total_cod_collected_vnd, 220000);
    assert.strictEqual(end.body.data.total_hail_collected_vnd, 220000);
    assert.strictEqual(end.body.data.total_cash_to_handover_vnd, 440000);
    assert.strictEqual(end.body.data.debt_receipts_summary.total_count, 1);
    assert.strictEqual(end.body.data.debt_receipts_summary.total_amount_vnd, 280000);
    assert.deepStrictEqual(end.body.data.debt_receipts_summary.receipt_codes, ['DR-88219A02-280K']);
    assert.strictEqual(end.body.data.financial_reconciliation_status, 'PENDING_DEPOT_SETTLEMENT');

    const again = await api(`/api/v1/driver/trips/${SHIFT_TRIP}/end`, { method: 'POST', body: {} });
    assert.strictEqual(again.status, 400);
    assert.strictEqual(again.body.code, 'INVALID_TRIP_STATE');
  });

  it('TC-SPEC-A47: a vehicle swap needs a real, free vehicle with enough seats (MGR-023, OQ-005)', async () => {
    const path = '/api/v1/ops/trips/trp_991824/replace-vehicle';

    const unknown = await api(path, { method: 'POST', body: { newVehiclePlate: 'ZZZ-NOT-REAL' } });
    assert.strictEqual(unknown.status, 404);
    assert.strictEqual(unknown.body.code, 'VEHICLE_NOT_FOUND');

    // Arrange: a vehicle that is out on another trip cannot be sent to this one
    services.managerService.vehicles.find((v) => v.plate_number === '29B-123.45').status = 'IN_TRANSIT';
    const busy = await api(path, { method: 'POST', body: { newVehiclePlate: '29B-123.45' } });
    assert.strictEqual(busy.status, 409);
    assert.strictEqual(busy.body.code, 'VEHICLE_UNAVAILABLE');

    services.managerService.addVehicle({ plate_number: '29B-777.01', model: 'Mini 10', total_seats: 10 });
    const small = await api(path, { method: 'POST', body: { newVehiclePlate: '29B-777.01' } });
    assert.strictEqual(small.status, 409);
    assert.strictEqual(small.body.code, 'CAPACITY_INSUFFICIENT');

    const badDriver = await api(path, { method: 'POST', body: { newVehiclePlate: '29B-888.22', newDriverId: 'drv_ghost' } });
    assert.strictEqual(badDriver.status, 404);
    assert.strictEqual(badDriver.body.code, 'DRIVER_NOT_FOUND');

    const ok = await api(path, { method: 'POST', body: { newVehiclePlate: '29B-888.22', newDriverId: 'drv_9912b' } });
    assert.strictEqual(ok.status, 200, JSON.stringify(ok.body));
    const vehicles = services.managerService.vehicles;
    assert.strictEqual(vehicles.find((v) => v.plate_number === '29B-444.11').status, 'MAINTENANCE');
    assert.notStrictEqual(vehicles.find((v) => v.plate_number === '29B-888.22').status, 'STANDBY');
    assert.strictEqual(services.managerService.findTrip('trp_991824').driver_id, 'drv_9912b');
  });

  it('TC-SPEC-A50: events for an unknown trip never touch another trip (event bridge)', () => {
    const driverTrip = services.driverService.activeTrips.get(SHIFT_TRIP);
    const manifestBefore = driverTrip.manifest.length;
    const mgrFirst = services.managerService.trips[0];
    const bookedBefore = mgrFirst.booked_seats;

    services.eventBridge.emit('TICKET_SETTLED', {
      order: { trip_id: 'trp_does_not_exist', seat_codes: ['A01'], pnr: 'BG-000000', amount_vnd: 1, payer: { phone: '0900000000', full_name: 'X' } },
      tickets: [{ ticket_id: 'tkt_x', pnr: 'BG-000000', seat_code: 'A01', passenger_name: 'X', passenger_phone: '0900000000' }]
    });

    assert.strictEqual(driverTrip.manifest.length, manifestBefore);
    assert.strictEqual(mgrFirst.booked_seats, bookedBefore);
  });

  it('TC-SPEC-A50b: cancelling a ticket frees the manager seat count (MGR-002)', async () => {
    const mgrTrip = services.managerService.findTrip(PASSENGER_TRIP);
    const before = mgrTrip.booked_seats;
    const ticket = await buyTicket('B04', 'u_count', '0987000321');
    assert.strictEqual(mgrTrip.booked_seats, before + 1);
    const dep = Date.parse(ticket.departure_time);
    const cancel = await api(`/api/v1/passenger/tickets/${ticket.ticket_id}/cancel`, { method: 'POST', body: { now: dep - 20 * 3600 * 1000 } });
    assert.strictEqual(cancel.status, 200);
    assert.strictEqual(mgrTrip.booked_seats, before);
  });

  it('TC-SPEC-A52: an unknown trip is not invented on lookup (MGR-012)', async () => {
    const count = services.managerService.trips.length;
    const missing = await api('/api/v1/ops/trips/trp_made_up');
    assert.strictEqual(missing.status, 404);
    assert.strictEqual(services.managerService.trips.length, count);
    const known = await api(`/api/v1/ops/trips/${PASSENGER_TRIP}`);
    assert.strictEqual(known.status, 200);
  });
});
