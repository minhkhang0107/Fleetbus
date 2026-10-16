/**
 * Tests for vehicle seat layout templates, layout validation, dynamic seat maps,
 * missing sold seat checks on assignment, and accurate ticket deck persistence.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { createFleetBusServer } from '../../source/server/apiServer.js';
import { BUILTIN_LAYOUTS, validateLayout, findLayout, DEFAULT_LAYOUT_ID } from '../../source/server/core/seatLayouts.js';
import { addDays, vnDate } from '../../source/server/core/serviceDate.js';

describe('Seat Layouts & Vehicle-Driven Seat Maps', () => {
  let server;
  let services;
  let baseUrl;
  let dispatcher;
  let pax;
  const day = addDays(vnDate(Date.now()), 2);
  const runId = (schedule) => `${schedule}_${day.replaceAll('-', '')}`;

  const request = async (path, { method = 'GET', body, token } = {}) => {
    const headers = { 'Content-Type': 'application/json', 'X-Operator-Code': 'SAOMAI' };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (method === 'POST') headers['Idempotency-Key'] = crypto.randomUUID();
    const res = await fetch(`${baseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  };

  before(async () => {
    ({ server, services } = createFleetBusServer());
    await new Promise(resolve => server.listen(0, resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    const login = await request('/api/v1/ops/auth/login', { method: 'POST', body: { username: 'dispatcher@busgo.vn', password: 'disp123' } });
    dispatcher = login.body.data.token;

    const otp = await request('/api/v1/auth/passenger/otp/request', { method: 'POST', body: { phone: '0912999888' } });
    const verify = await request('/api/v1/auth/passenger/otp/verify', { method: 'POST', body: { phone: '0912999888', otp: otp.body.data.mock_otp } });
    pax = verify.body.data.token;
  });

  after(() => new Promise(resolve => server.close(resolve)));

  it('every built-in passes validateLayout and has the stated seat counts and decks', () => {
    assert.strictEqual(DEFAULT_LAYOUT_ID, 'CABIN_22');
    assert.strictEqual(BUILTIN_LAYOUTS.length, 4);

    for (const layout of BUILTIN_LAYOUTS) {
      assert.strictEqual(validateLayout(layout), null, `Layout ${layout.layout_id} failed validation`);
      assert.strictEqual(findLayout(layout.layout_id)?.layout_id, layout.layout_id);
    }

    const cabin22 = findLayout('CABIN_22');
    assert.strictEqual(cabin22.seats.length, 22);
    assert.strictEqual(cabin22.total_decks, 2);
    assert.strictEqual(cabin22.columns, 3);
    assert.strictEqual(cabin22.vehicle_type, 'DOUBLE_DECK_VIP_CABIN');

    const cabin34 = findLayout('CABIN_34');
    assert.strictEqual(cabin34.seats.length, 34);
    assert.strictEqual(cabin34.total_decks, 2);
    assert.strictEqual(cabin34.columns, 5);
    assert.strictEqual(cabin34.vehicle_type, 'DOUBLE_DECK_VIP_CABIN');

    const sleeper34 = findLayout('SLEEPER_34');
    assert.strictEqual(sleeper34.seats.length, 34);
    assert.strictEqual(sleeper34.total_decks, 2);
    assert.strictEqual(sleeper34.columns, 5);
    assert.strictEqual(sleeper34.vehicle_type, 'DOUBLE_DECK_SLEEPER');

    const seat45 = findLayout('SEAT_45');
    assert.strictEqual(seat45.seats.length, 45);
    assert.strictEqual(seat45.total_decks, 1);
    assert.strictEqual(seat45.columns, 5);
    assert.strictEqual(seat45.vehicle_type, 'SINGLE_DECK_SEATER');
  });

  it('validateLayout rejects duplicate codes, a seat outside columns, two seats in one cell, an empty deck', () => {
    const base = findLayout('CABIN_22');

    // Duplicate seat code
    const duplicate = structuredClone(base);
    duplicate.seats[1].seat_code = duplicate.seats[0].seat_code;
    const errDup = validateLayout(duplicate);
    assert.ok(typeof errDup === 'string');
    assert.match(errDup, /Mã ghế trùng lặp/);

    // Seat outside columns (columns = 3, but seat has column = 4)
    const outsideCol = structuredClone(base);
    outsideCol.seats[0].column = 4;
    const errCol = validateLayout(outsideCol);
    assert.ok(typeof errCol === 'string');
    assert.match(errCol, /Cột của ghế/);

    // Two seats in one cell (same deck, row, column)
    const sameCell = structuredClone(base);
    sameCell.seats[1].deck = sameCell.seats[0].deck;
    sameCell.seats[1].row = sameCell.seats[0].row;
    sameCell.seats[1].column = sameCell.seats[0].column;
    const errCell = validateLayout(sameCell);
    assert.ok(typeof errCell === 'string');
    assert.match(errCell, /Trùng vị trí ghế/);

    // Empty deck (total_decks = 2, but deck 2 has no seats)
    const emptyDeck = structuredClone(base);
    emptyDeck.seats = emptyDeck.seats.filter(s => s.deck === 1);
    const errDeck = validateLayout(emptyDeck);
    assert.ok(typeof errDeck === 'string');
    assert.match(errDeck, /Tầng 2 không có ghế nào/);
  });

  it('a trip whose assigned vehicle uses SEAT_45 gets a 45-seat 1-deck seat map with columns: 5', async () => {
    const tripId = runId('trp_hn_th_01');

    // Add a 45-seat vehicle using layout SEAT_45
    const added = services.managerService.addVehicle({
      plate_number: '29B-455.55',
      model: 'Hyundai Universe 45 Chỗ',
      layout_id: 'SEAT_45'
    });
    assert.strictEqual(added.data.total_seats, 45);
    assert.strictEqual(added.data.layout_id, 'SEAT_45');

    // Assign vehicle to trip via assignTrip
    const assigned = services.managerService.assignTrip(tripId, {
      vehicleId: added.data.vehicle_id,
      driverId: 'drv_8821a'
    });
    assert.strictEqual(assigned.success, true, JSON.stringify(assigned));

    // Read the seat map
    const mapRes = await request(`/api/v1/trips/${tripId}/seat-map`);
    assert.strictEqual(mapRes.status, 200, JSON.stringify(mapRes.body));
    const data = mapRes.body.data;
    assert.strictEqual(data.total_seats, 45);
    assert.strictEqual(data.total_decks, 1);
    assert.strictEqual(data.columns, 5);
    assert.strictEqual(data.layout_id, 'SEAT_45');
    assert.strictEqual(data.seats.length, 45);
    assert.strictEqual(data.seats[0].seat_code, 'S01');
    assert.strictEqual(data.seats[44].seat_code, 'S45');
  });

  it('assigning a vehicle whose template lacks a sold seat is refused with LAYOUT_MISSING_SOLD_SEATS', async () => {
    const tripId = runId('trp_hn_th_02');

    // Currently trip has default CABIN_22 layout; hold and book seat A01
    const hold = await request(`/api/v1/passenger/trips/${tripId}/hold-seats`, {
      method: 'POST',
      token: pax,
      body: { seatCodes: ['A01'] }
    });
    assert.strictEqual(hold.status, 200, JSON.stringify(hold.body));

    const order = await request('/api/v1/passenger/bookings/create', {
      method: 'POST',
      token: pax,
      body: {
        tripId,
        holdId: hold.body.data.hold_id,
        seatCodes: ['A01'],
        payer: { full_name: 'Nguyễn Văn Kiểm', phone: '0912999888' },
        passengers: [{ seat_code: 'A01', full_name: 'Nguyễn Văn Kiểm', phone: '0912999888' }]
      }
    });
    assert.strictEqual(order.status, 201, JSON.stringify(order.body));
    services.paymentService.settlePayment(order.body.data.payment.order_id);

    // Find the SEAT_45 vehicle which uses seat codes S01..S45 (does not have A01)
    const seat45Veh = services.managerService.vehicles.find(v => v.layout_id === 'SEAT_45');
    assert.ok(seat45Veh);

    // Check getAssignOptions marks it unavailable with the missing seat reason
    const opts = services.managerService.getAssignOptions(tripId);
    const targetVeh = opts.data.vehicles.find(v => v.vehicle_id === seat45Veh.vehicle_id);
    assert.strictEqual(targetVeh.available, false);
    assert.match(targetVeh.reason, /Xe thiếu ghế đã bán: A01/);

    // Attempting to assign must be refused with LAYOUT_MISSING_SOLD_SEATS
    const res = await request(`/api/v1/ops/trips/${tripId}/assign`, {
      method: 'POST',
      token: dispatcher,
      body: {
        vehicleId: seat45Veh.vehicle_id,
        driverId: 'drv_8821a'
      }
    });
    assert.strictEqual(res.status, 409);
    assert.strictEqual(res.body.code, 'LAYOUT_MISSING_SOLD_SEATS');
    assert.match(res.body.message, /Xe mới thiếu ghế đã bán: A01/);
  });

  it('the deck stored on a paid ticket for seat B02 on CABIN_22 is 1', async () => {
    const tripId = runId('trp_hn_th_03');

    // Hold and book B02 on CABIN_22
    const hold = await request(`/api/v1/passenger/trips/${tripId}/hold-seats`, {
      method: 'POST',
      token: pax,
      body: { seatCodes: ['B02'] }
    });
    assert.strictEqual(hold.status, 200, JSON.stringify(hold.body));

    const order = await request('/api/v1/passenger/bookings/create', {
      method: 'POST',
      token: pax,
      body: {
        tripId,
        holdId: hold.body.data.hold_id,
        seatCodes: ['B02'],
        payer: { full_name: 'Lê Hoàng Deck', phone: '0912999888' },
        passengers: [{ seat_code: 'B02', full_name: 'Lê Hoàng Deck', phone: '0912999888' }]
      }
    });
    assert.strictEqual(order.status, 201, JSON.stringify(order.body));
    services.paymentService.settlePayment(order.body.data.payment.order_id);

    const ticket = [...services.paymentService.tickets.values()].find(t => t.trip_id === tripId && t.seat_code === 'B02');
    assert.ok(ticket, 'ticket for B02 was issued');
    assert.strictEqual(ticket.seat_code, 'B02');
    assert.strictEqual(ticket.deck, 1, 'seat B02 on CABIN_22 is on deck 1, not 2');
  });
});
