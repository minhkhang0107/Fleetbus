import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { createFleetBusServer } from '../../source/server/apiServer.js';
import { addDays, vnDate } from '../../source/server/core/serviceDate.js';

/**
 * Tickets picked up at the same address are one door of the run: one place, one appointment, one wait. A family
 * of two booked on one order must not hear "one house before you" while the bus is at their own gate.
 */
describe('Home pickups at one address are one door', () => {
  let server;
  let services;
  let baseUrl;
  let driver;
  let staff;
  const day = addDays(vnDate(Date.now()), 1);
  const TRIP = `trp_hn_th_03_${day.replaceAll('-', '')}`;
  const FAMILY = { phone: '0901000101', seats: ['A01', 'A02'], names: ['Trần Thị Nhóm', 'Trần Văn Cùng'], address: '15 Bạch Mai, Hai Bà Trưng', lat: 21.0059, lng: 105.8573 };
  const OTHER = { phone: '0901000102', seats: ['A03'], names: ['Nguyễn Văn Xa'], address: '88 Xuân Thủy, Cầu Giấy', lat: 21.0362, lng: 105.7906 };
  let seq = 1;

  const request = async (path, { method = 'GET', body, token } = {}) => {
    const headers = { 'Content-Type': 'application/json', 'X-Operator-Code': 'SAOMAI' };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (method === 'POST') headers['Idempotency-Key'] = crypto.randomUUID();
    const res = await fetch(`${baseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  };
  const buyHome = async (g) => {
    const otp = await request('/api/v1/auth/passenger/otp/request', { method: 'POST', body: { phone: g.phone } });
    g.token = (await request('/api/v1/auth/passenger/otp/verify', { method: 'POST', body: { phone: g.phone, otp: otp.body.data.mock_otp } })).body.data.token;
    const stops = (await request(`/api/v1/trips/${TRIP}`)).body.data.stops;
    const hold = await request(`/api/v1/passenger/trips/${TRIP}/hold-seats`, { method: 'POST', token: g.token, body: { seatCodes: g.seats, pickupStopId: stops[0].stop_id, dropoffStopId: stops.at(-1).stop_id } });
    assert.strictEqual(hold.status, 200, JSON.stringify(hold.body));
    const order = await request('/api/v1/passenger/bookings/create', {
      method: 'POST',
      token: g.token,
      body: {
        tripId: TRIP, holdId: hold.body.data.hold_id, seatCodes: g.seats,
        payer: { full_name: g.names[0], phone: g.phone },
        passengers: g.seats.map((seat, i) => ({ seat_code: seat, full_name: g.names[i], phone: g.phone })),
        homePickup: { address: g.address, lat: g.lat, lng: g.lng }
      }
    });
    assert.strictEqual(order.status, 201, JSON.stringify(order.body));
    services.paymentService.settlePayment(order.body.data.payment.order_id);
    g.ids = [...services.paymentService.tickets.values()].filter(t => t.pnr === order.body.data.payment.pnr).map(t => t.ticket_id).sort();
  };
  const trip = () => services.driverService.activeTrips.get(TRIP);
  const ping = (lat, lng, speed = 25) => services.driverService.recordTelemetry(TRIP, { lat, lng, speed_kmh: speed, bearing_deg: 0, seq: seq++ });
  const track = async (g, id) => (await request(`/api/v1/trips/${TRIP}/tracking?ticket_id=${id}`, { token: g.token })).body.data;
  const inbox = (phone) => { const r = services.trackingService.getNotifications(phone, 'op_saomai'); return r.data?.notifications ?? r.data; };
  const arrivedFor = (id) => inbox(FAMILY.phone)
    .filter(n => n.type === 'HOME_PICKUP_ARRIVED' && n.payload?.ticket_id === id);

  before(async () => {
    ({ server, services } = createFleetBusServer());
    await new Promise(resolve => server.listen(0, resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    staff = (await request('/api/v1/ops/auth/login', { method: 'POST', body: { username: 'dispatcher@busgo.vn', password: 'disp123' } })).body.data.token;
    await buyHome(OTHER);
    await buyHome(FAMILY);
    const assigned = await request(`/api/v1/ops/trips/${TRIP}/assign`, { method: 'POST', token: staff, body: { vehicleId: 'veh_02', driverId: 'drv_9912b' } });
    assert.strictEqual(assigned.status, 200, JSON.stringify(assigned.body));
    driver = (await request('/api/v1/driver/auth/login', { method: 'POST', body: { staff_id: 'TX9912', pin: '112233' } })).body.data.token;
  });

  after(() => new Promise(resolve => server.close(resolve)));

  it('TC-DOOR-01: the run lists the family together, with one place and one appointment', async () => {
    const res = await request(`/api/v1/driver/trips/${TRIP}/home-run`, { method: 'POST', token: driver });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const run = (await request(`/api/v1/driver/trips/${TRIP}`, { token: driver })).body.data.home_run.stops;
    const family = run.filter(s => FAMILY.ids.includes(s.ticket_id));
    assert.strictEqual(run.findIndex(s => s.ticket_id === family[1].ticket_id) - run.findIndex(s => s.ticket_id === family[0].ticket_id), 1, 'next to each other');
    assert.strictEqual(family[0].position, family[1].position);
    assert.strictEqual(family[0].appointment_at, family[1].appointment_at);
    assert.strictEqual(Math.max(...run.map(s => s.position)), 2, 'two doors, three tickets');
  });

  it('TC-DOOR-02: with the bus at the gate, both tickets of the family are next and at the door', async () => {
    // The run starts at the farthest address: collect it first.
    const first = trip().home_order[0];
    const firstIsFamily = FAMILY.ids.includes(first);
    if (!firstIsFamily) {
      await request(`/api/v1/driver/trips/${TRIP}/boarding/manual`, { method: 'POST', token: driver, body: { ticket_id: OTHER.ids[0] } });
    }
    ping(FAMILY.lat + 0.0002, FAMILY.lng, 3);
    for (const id of FAMILY.ids) {
      const d = await track(FAMILY, id);
      assert.deepStrictEqual(d.home_queue, { position: 1, ahead: 0, total: firstIsFamily ? 2 : 1 }, id);
      assert.strictEqual(d.at_door, true, id);
      assert.match(d.hud_status_text, /tới chỗ đón của bạn/);
      assert.strictEqual(arrivedFor(id).length, 1, `${id} is told the bus is there`);
    }
  });

  it('TC-DOOR-03: "at the door" on one ticket starts the wait for the whole family', async () => {
    const res = await request(`/api/v1/driver/trips/${TRIP}/tickets/${FAMILY.ids[0]}/home-arrived`, { method: 'POST', token: driver });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    for (const id of FAMILY.ids) {
      const s = res.body.data.stops.find(x => x.ticket_id === id);
      assert.ok(s.arrived_at, `${id} waits from now`);
      assert.ok(s.missable_at);
    }
  });
});
