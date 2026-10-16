import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { createFleetBusServer } from '../../source/server/apiServer.js';
import { addDays, vnDate } from '../../source/server/core/serviceDate.js';

describe('A day\'s run is operated: ops trip, driver trip and manifest set up from its schedule', () => {
  let server;
  let services;
  let baseUrl;
  let pax;
  let dispatcher;
  let cashier;
  const day = addDays(vnDate(Date.now()), 2);
  const runId = `trp_hn_th_01_${day.replaceAll('-', '')}`;

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
    const otp = await request('/api/v1/auth/passenger/otp/request', { method: 'POST', body: { phone: '0904445566' } });
    pax = (await request('/api/v1/auth/passenger/otp/verify', { method: 'POST', body: { phone: '0904445566', otp: otp.body.data.mock_otp } })).body.data.token;
    dispatcher = (await request('/api/v1/ops/auth/login', { method: 'POST', body: { username: 'dispatcher@busgo.vn', password: 'disp123' } })).body.data.token;
    cashier = (await request('/api/v1/ops/auth/login', { method: 'POST', body: { username: 'cashier@busgo.vn', password: 'cash123' } })).body.data.token;
  });

  after(() => new Promise(resolve => server.close(resolve)));

  it('a paid ticket on a day\'s run reaches the schedule\'s driver and the office', async () => {
    const hold = await request(`/api/v1/passenger/trips/${runId}/hold-seats`, { method: 'POST', token: pax, body: { seatCodes: ['A05'], pickupStopId: 'stp_hn_gb', dropoffStopId: 'stp_th_pb' } });
    assert.strictEqual(hold.status, 200, JSON.stringify(hold.body));
    const order = await request('/api/v1/passenger/bookings/create', { method: 'POST', token: pax, body: { tripId: runId, holdId: hold.body.data.hold_id, seatCodes: ['A05'], payer: { full_name: 'Đỗ Văn Ngày', phone: '0904445566' }, passengers: [{ seat_code: 'A05', full_name: 'Đỗ Văn Ngày', phone: '0904445566' }] } });
    assert.strictEqual(order.status, 201, JSON.stringify(order.body));
    assert.strictEqual(services.paymentService.settlePayment(order.body.data.payment.order_id).success, true);

    const driverTrip = services.driverService.activeTrips.get(runId);
    assert.ok(driverTrip, 'the run has a driver trip');
    assert.strictEqual(driverTrip.driver_id, 'drv_8821a', 'the schedule\'s driver');
    assert.strictEqual(driverTrip.vehicle_plate, '29B-882.19');
    assert.strictEqual(driverTrip.status, 'DISPATCHED', 'the vehicle check is to do again');
    assert.ok(Object.values(driverTrip.readiness_checklist).every(v => v === false));
    assert.strictEqual(driverTrip.planned_departure_time.slice(0, 10), day);
    assert.deepStrictEqual(driverTrip.manifest.map(p => p.seat_code), ['A05']);
    assert.ok(driverTrip.stops.every(s => s.status === 'PENDING'));
    assert.strictEqual(services.driverService.activeTrips.get('trp_hn_th_01').manifest.length, 0, 'the seed trip is untouched');

    const opsTrip = services.managerService.findTrip(runId);
    assert.strictEqual(opsTrip.booked_seats, 1);
    assert.strictEqual(opsTrip.vehicle_id, 'veh_04');
  });

  it('the driver sees the trips of the day only', () => {
    const onDay = services.driverService.getTodayTrips('drv_8821a', Date.parse(`${day}T06:00:00+07:00`)).data.trips.map(t => t.trip_id);
    assert.ok(onDay.includes(runId));
    const dayBefore = services.driverService.getTodayTrips('drv_8821a', Date.parse(`${addDays(day, -1)}T06:00:00+07:00`)).data.trips.map(t => t.trip_id);
    assert.ok(!dayBefore.includes(runId));
  });

  it('the office\'s board lists a day\'s runs, set up, and refuses a malformed day', async () => {
    const board = await request(`/api/v1/ops/dispatch/board?date=${addDays(day, 1)}`, { token: dispatcher });
    assert.strictEqual(board.status, 200, JSON.stringify(board.body));
    assert.strictEqual(board.body.data.shift_date, addDays(day, 1));
    const ids = board.body.data.trips.map(t => t.trip_id);
    assert.ok(ids.includes(`trp_hn_th_01_${addDays(day, 1).replaceAll('-', '')}`));
    assert.ok(board.body.data.trips.every(t => t.departure_time.startsWith(addDays(day, 1))));
    assert.ok(board.body.data.trips.every(t => t.operator_id === 'op_saomai'));
    assert.strictEqual((await request('/api/v1/ops/dispatch/board?date=28/08', { token: dispatcher })).status, 400);
    const far = await request(`/api/v1/ops/dispatch/board?date=${addDays(vnDate(Date.now()), 120)}`, { token: dispatcher });
    assert.strictEqual(far.body.data.total_trips, 0, 'no runs are created far outside the booking window');
  });

  it('the counter sells a seat on a day\'s run', async () => {
    const pos = await request('/api/v1/ops/pos/orders', { method: 'POST', token: cashier, body: { tripId: runId, passengerName: 'Khách quầy', phone: '0905556677', seatCodes: ['B02'], pickupStopId: 'stp_hn_gb', dropoffStopId: 'stp_nb' } });
    assert.ok([200, 201].includes(pos.status), JSON.stringify(pos.body));
  });

  it('a ticket whose day is over moves to history; the demo day stays upcoming outside production', () => {
    const tickets = services.paymentService;
    const [ticket] = [...tickets.tickets.values()].filter(t => t.trip_id === runId);
    const after = Date.parse(`${addDays(day, 1)}T08:00:00+07:00`);
    assert.ok(tickets.getTicketsByPhone('0904445566', 'UPCOMING').data.some(t => t.ticket_id === ticket.ticket_id));
    assert.ok(!tickets.getTicketsByPhone('0904445566', 'UPCOMING', 'op_saomai', after).data.some(t => t.ticket_id === ticket.ticket_id));
    assert.ok(tickets.getTicketsByPhone('0904445566', 'HISTORY', 'op_saomai', after).data.some(t => t.ticket_id === ticket.ticket_id));
  });
});
