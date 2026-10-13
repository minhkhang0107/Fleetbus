import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { createFleetBusServer } from '../../source/server/apiServer.js';
import { addDays, vnDate } from '../../source/server/core/serviceDate.js';

describe('The office gives a trip its bus and driver (MGR-017)', () => {
  let server;
  let services;
  let baseUrl;
  let dispatcher;
  let cashier;
  let pax;
  const day = addDays(vnDate(Date.now()), 3);
  const id = (schedule, d = day) => `${schedule}_${d.replaceAll('-', '')}`;

  const request = async (path, { method = 'GET', body, token } = {}) => {
    const headers = { 'Content-Type': 'application/json', 'X-Operator-Code': 'SAOMAI' };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (method === 'POST') headers['Idempotency-Key'] = crypto.randomUUID();
    const res = await fetch(`${baseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  };
  const assign = (tripId, body, token = dispatcher) => request(`/api/v1/ops/trips/${tripId}/assign`, { method: 'POST', token, body });
  const options = async (tripId) => (await request(`/api/v1/ops/trips/${tripId}/assign-options`, { token: dispatcher })).body.data;

  before(async () => {
    ({ server, services } = createFleetBusServer());
    await new Promise(resolve => server.listen(0, resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    dispatcher = (await request('/api/v1/ops/auth/login', { method: 'POST', body: { username: 'dispatcher@busgo.vn', password: 'disp123' } })).body.data.token;
    cashier = (await request('/api/v1/ops/auth/login', { method: 'POST', body: { username: 'cashier@busgo.vn', password: 'cash123' } })).body.data.token;
    const otp = await request('/api/v1/auth/passenger/otp/request', { method: 'POST', body: { phone: '0906667788' } });
    pax = (await request('/api/v1/auth/passenger/otp/verify', { method: 'POST', body: { phone: '0906667788', otp: otp.body.data.mock_otp } })).body.data.token;
  });

  after(() => new Promise(resolve => server.close(resolve)));

  it('an unassigned run gets a bus and driver; the driver then sees it on that day', async () => {
    const board = await request(`/api/v1/ops/dispatch/board?date=${day}`, { token: dispatcher });
    const trip = board.body.data.trips.find(t => t.trip_id === id('trp_hn_th_02'));
    assert.strictEqual(trip.driver_name, 'Chưa gán');

    const opts = await options(id('trp_hn_th_02'));
    assert.ok(opts.vehicles.every(v => typeof v.available === 'boolean'));
    const expired = opts.drivers.find(d => d.staff_id === 'TX9902');
    assert.strictEqual(expired.available, false);
    assert.match(expired.reason, /Bằng lái hết hạn/);
    assert.ok(opts.vehicles.every(v => v.vehicle_id !== 'veh_xv_01'), 'only the company\'s buses');

    const done = await assign(id('trp_hn_th_02'), { vehicleId: 'veh_03', driverId: 'drv_9912b' });
    assert.strictEqual(done.status, 200, JSON.stringify(done.body));
    assert.deepStrictEqual([done.body.data.vehicle_plate, done.body.data.driver_name], ['29B-888.22', 'Phạm Quốc Huy']);
    const after = (await request(`/api/v1/ops/dispatch/board?date=${day}`, { token: dispatcher })).body.data.trips.find(t => t.trip_id === id('trp_hn_th_02'));
    assert.deepStrictEqual([after.vehicle_plate, after.driver_name], ['29B-888.22', 'Phạm Quốc Huy']);

    const driverTrip = services.driverService.activeTrips.get(id('trp_hn_th_02'));
    assert.strictEqual(driverTrip.driver_id, 'drv_9912b');
    assert.strictEqual(driverTrip.vehicle_plate, '29B-888.22');
    assert.strictEqual(driverTrip.status, 'DISPATCHED');
    assert.ok(driverTrip.stops.length >= 2, 'stops from the passenger catalog');
    const seen = services.driverService.getTodayTrips('drv_9912b', Date.parse(`${day}T06:00:00+07:00`)).data.trips.map(t => t.trip_id);
    assert.ok(seen.includes(id('trp_hn_th_02')));
    assert.ok(services.managerService.auditLog.some(a => a.action === 'TRIP_ASSIGN' && a.resource === id('trp_hn_th_02')));
  });

  it('refuses a bus or driver already on an overlapping trip, an expired licence and a bus too small', async () => {
    services.managerService.trips.push({ trip_id: 'trp_clash', operator_id: 'op_saomai', route_id: 'rt_hn_th', driver_id: 'drv_9912b', vehicle_id: 'veh_01', vehicle_plate: '29B-123.45', departure_time: `${day}T20:00:00+07:00`, status: 'SCHEDULED', booked_seats: 0, total_seats: 34 });
    const opts = await options(id('trp_hn_th_03'));
    const busyDriver = opts.drivers.find(d => d.driver_id === 'drv_9912b');
    assert.strictEqual(busyDriver.available, false);
    assert.strictEqual(busyDriver.conflict_trip_id, 'trp_clash');
    const clash = await assign(id('trp_hn_th_03'), { vehicleId: 'veh_03', driverId: 'drv_9912b' });
    assert.strictEqual(clash.status, 409);
    assert.strictEqual(clash.body.code, 'DRIVER_UNAVAILABLE');
    const busyBus = await assign(id('trp_hn_th_03'), { vehicleId: 'veh_01', driverId: 'drv_8821a' });
    assert.strictEqual(busyBus.body.code, 'VEHICLE_UNAVAILABLE');
    const expired = await assign(id('trp_hn_th_03'), { vehicleId: 'veh_03', driverId: 'drv_9902b' });
    assert.strictEqual(expired.body.code, 'DRIVER_UNAVAILABLE');

    services.managerService.findTrip(id('trp_hn_th_03')).booked_seats = 30;
    const small = await assign(id('trp_hn_th_03'), { vehicleId: 'veh_02', driverId: 'drv_8821a' });
    assert.strictEqual(small.body.code, 'VEHICLE_UNAVAILABLE');
    assert.match(small.body.message, /22 chỗ, chuyến đã bán 30 ghế/);
    services.managerService.findTrip(id('trp_hn_th_03')).booked_seats = 0;
  });

  it('changing the bus of a trip with tickets tells each passenger once', async () => {
    const tripId = id('trp_hn_th_02');
    const hold = await request(`/api/v1/passenger/trips/${tripId}/hold-seats`, { method: 'POST', token: pax, body: { seatCodes: ['A04'] } });
    assert.strictEqual(hold.status, 200, JSON.stringify(hold.body));
    const order = await request('/api/v1/passenger/bookings/create', { method: 'POST', token: pax, body: { tripId, holdId: hold.body.data.hold_id, seatCodes: ['A04'], payer: { full_name: 'Vũ Thị Gán', phone: '0906667788' }, passengers: [{ seat_code: 'A04', full_name: 'Vũ Thị Gán', phone: '0906667788' }] } });
    services.paymentService.settlePayment(order.body.data.payment.order_id);
    assert.deepStrictEqual(services.driverService.activeTrips.get(tripId).manifest.map(p => p.seat_code), ['A04'], 'the ticket reaches the assigned driver');

    assert.strictEqual((await assign(tripId, { vehicleId: 'veh_02', driverId: 'drv_9912b' })).status, 200);
    await assign(tripId, { vehicleId: 'veh_02', driverId: 'drv_9912b' });
    const inbox = services.trackingService.getNotifications('0906667788', 'op_saomai');
    const list = (inbox.data?.notifications ?? inbox.data).filter(n => n.type === 'TRIP_REASSIGNED');
    assert.strictEqual(list.length, 1);
    assert.match(list[0].body, /29B-444\.11/);
    assert.match(list[0].body, /ghế A04/);
    assert.strictEqual(services.driverService.activeTrips.get(tripId).vehicle_plate, '29B-444.11');
  });

  it('a ticket sold before the run has a driver reaches the driver once the office assigns one', async () => {
    // A day of its own, away from the clashes the other cases set up.
    const tripId = id('trp_hn_th_02', addDays(day, 4));
    assert.strictEqual(services.driverService.activeTrips.get(tripId)?.driver_id ?? null, null);
    const hold = await request(`/api/v1/passenger/trips/${tripId}/hold-seats`, { method: 'POST', token: pax, body: { seatCodes: ['B05'] } });
    assert.strictEqual(hold.status, 200, JSON.stringify(hold.body));
    const order = await request('/api/v1/passenger/bookings/create', { method: 'POST', token: pax, body: { tripId, holdId: hold.body.data.hold_id, seatCodes: ['B05'], payer: { full_name: 'Vũ Thị Sớm', phone: '0906667788' }, passengers: [{ seat_code: 'B05', full_name: 'Vũ Thị Sớm', phone: '0906667788' }] } });
    services.paymentService.settlePayment(order.body.data.payment.order_id);

    const first = await assign(tripId, { vehicleId: 'veh_04', driverId: 'drv_9912b' });
    assert.strictEqual(first.status, 200, JSON.stringify(first.body));
    await assign(tripId, { vehicleId: 'veh_04', driverId: 'drv_9912b' });
    assert.deepStrictEqual(services.driverService.activeTrips.get(tripId).manifest.map(p => p.seat_code), ['B05'], 'once, not twice');
  });

  it('a trip under way cannot be changed; only directors and dispatchers assign', async () => {
    services.managerService.findTrip(id('trp_hn_th_02')).status = 'IN_TRANSIT';
    const running = await assign(id('trp_hn_th_02'), { vehicleId: 'veh_03', driverId: 'drv_9912b' });
    assert.strictEqual(running.body.code, 'TRIP_ALREADY_RUNNING');
    services.managerService.findTrip(id('trp_hn_th_02')).status = 'SCHEDULED';
    assert.strictEqual((await assign(id('trp_hn_th_02'), { vehicleId: 'veh_03', driverId: 'drv_9912b' }, cashier)).status, 403);
    assert.strictEqual((await request(`/api/v1/ops/trips/${id('trp_hn_th_02')}/assign-options`, { token: cashier })).status, 403);
  });

  it('with scope SCHEDULE the pair becomes the default of the schedule\'s later runs', async () => {
    const res = await assign(id('trp_hn_th_03', addDays(day, 1)), { vehicleId: 'veh_03', driverId: 'drv_9912b', scope: 'SCHEDULE' });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const later = (await request(`/api/v1/ops/dispatch/board?date=${addDays(day, 2)}`, { token: dispatcher })).body.data.trips.find(t => t.trip_id === id('trp_hn_th_03', addDays(day, 2)));
    assert.deepStrictEqual([later.vehicle_plate, later.driver_name], ['29B-888.22', 'Phạm Quốc Huy']);
  });

  it('passengers see the bus the run will get: its own, else the schedule\'s default, else none', async () => {
    const plates = async (d) => Object.fromEntries((await request(`/api/v1/trips/search?origin=${encodeURIComponent('Hà Nội')}&destination=${encodeURIComponent('Thanh Hóa')}&date=${d}`)).body.data.map(t => [t.trip_id.split('_').slice(0, 4).join('_'), t.plate_number]));
    const later = await plates(addDays(day, 5));
    assert.strictEqual(later.trp_hn_th_01, '29B-882.19', 'the schedule\'s seed bus before the run is set up');
    assert.strictEqual(later.trp_hn_th_02, null, 'no bus for this schedule yet');
    assert.strictEqual(later.trp_hn_th_03, '29B-888.22', 'the default set with scope SCHEDULE');
    assert.strictEqual((await plates(day)).trp_hn_th_02, '29B-444.11', 'the bus assigned to that day');
  });
});
