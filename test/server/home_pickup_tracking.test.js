import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { createFleetBusServer } from '../../source/server/apiServer.js';
import { stopCoords } from '../../source/server/core/geo.js';

/** D143: a passenger waiting at home sees the bus coming to the door; every passenger sees where the bus is and when it will be there. */
describe('Following the bus that comes to pick me up (D143)', () => {
  let server;
  let services;
  let baseUrl;
  let pax;
  let driver;
  let homeTicket;
  let stopTicket;
  let seq = 1;
  const TRIP = 'trp_hn_th_01';
  const PHONE = '0907770011';
  const HOME = { address: '12 Hàng Bài, Hoàn Kiếm', lat: 21.0245, lng: 105.8523 };

  const request = async (path, { method = 'GET', body, token } = {}) => {
    const headers = { 'Content-Type': 'application/json', 'X-Operator-Code': 'SAOMAI' };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (method === 'POST') headers['Idempotency-Key'] = crypto.randomUUID();
    const res = await fetch(`${baseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  };
  const buy = async (seat, pickupStopId, extra = {}) => {
    const hold = await request(`/api/v1/passenger/trips/${TRIP}/hold-seats`, { method: 'POST', token: pax, body: { seatCodes: [seat], pickupStopId, dropoffStopId: 'stp_th_pb' } });
    assert.strictEqual(hold.status, 200, JSON.stringify(hold.body));
    const order = await request('/api/v1/passenger/bookings/create', { method: 'POST', token: pax, body: { tripId: TRIP, holdId: hold.body.data.hold_id, seatCodes: [seat], payer: { full_name: 'Đỗ Văn Nhà', phone: PHONE }, passengers: [{ seat_code: seat, full_name: 'Đỗ Văn Nhà', phone: PHONE }], ...extra } });
    assert.strictEqual(order.status, 201, JSON.stringify(order.body));
    services.paymentService.settlePayment(order.body.data.payment.order_id);
    return [...services.paymentService.tickets.values()].find(t => t.pnr === order.body.data.payment.pnr).ticket_id;
  };
  const track = (ticketId) => request(`/api/v1/trips/${TRIP}/tracking?ticket_id=${ticketId}`, { token: pax });
  const ping = (lat, lng, speed = 30) => services.driverService.recordTelemetry(TRIP, { lat, lng, speed_kmh: speed, bearing_deg: 180, seq: seq++ });
  const sent = (type) => {
    const inbox = services.trackingService.getNotifications(PHONE, 'op_saomai');
    return (inbox.data?.notifications ?? inbox.data).filter(n => n.type === type);
  };

  before(async () => {
    ({ server, services } = createFleetBusServer());
    await new Promise(resolve => server.listen(0, resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    const otp = await request('/api/v1/auth/passenger/otp/request', { method: 'POST', body: { phone: PHONE } });
    pax = (await request('/api/v1/auth/passenger/otp/verify', { method: 'POST', body: { phone: PHONE, otp: otp.body.data.mock_otp } })).body.data.token;
    driver = (await request('/api/v1/driver/auth/login', { method: 'POST', body: { staff_id: 'TX8821', pin: '123456' } })).body.data.token;
    homeTicket = await buy('B10', 'stp_hn_gb', { homePickup: HOME });
    stopTicket = await buy('B11', 'stp_nb');
  });

  after(() => new Promise(resolve => server.close(resolve)));

  it('TC-HOME-TRACK-01: before the driver sets off, the home ticket aims at the address and shows the pickup window', async () => {
    const res = await track(homeTicket);
    assert.strictEqual(res.status, 200);
    const d = res.body.data;
    assert.strictEqual(d.target_stop.kind, 'HOME_PICKUP');
    assert.strictEqual(d.target_stop.name, HOME.address);
    assert.strictEqual(d.has_position, false);
    assert.ok(d.target_window?.from && d.target_window?.to, 'the window the office promised');
    assert.strictEqual(d.target_planned_time, d.target_window.from);
    assert.match(d.hud_status_text, /chưa bắt đầu đi đón/);
    assert.strictEqual(ping(21.0, 105.84).code, 'TRIP_NOT_ACTIVE', 'no position is taken before the run starts');
  });

  it('TC-HOME-TRACK-02: setting off is the trip driver\'s, once, and tells each passenger waiting at home', async () => {
    const res = await request(`/api/v1/driver/trips/${TRIP}/home-run`, { method: 'POST', token: driver });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.ok(res.body.data.home_run_started_at);
    await request(`/api/v1/driver/trips/${TRIP}/home-run`, { method: 'POST', token: driver });
    const told = sent('HOME_RUN_STARTED');
    assert.strictEqual(told.length, 1);
    assert.match(told[0].body, /12 Hàng Bài/);
  });

  it('TC-HOME-TRACK-03: the bus on its way shows distance, ETA and expected time to the door, then the two notices', async () => {
    assert.notStrictEqual(ping(21.0600, 105.8450, 20).accepted, false);
    let d = (await track(homeTicket)).body.data;
    assert.strictEqual(d.has_position, true);
    assert.strictEqual(d.distance_basis, 'ESTIMATED_ROAD');
    assert.ok(d.distance_meters > 4000 && d.distance_meters < 6000, `${d.distance_meters}`);
    assert.ok(d.eta_minutes > 10);
    assert.ok(Date.parse(d.expected_at) > Date.now());
    assert.match(d.hud_status_text, /^Bạn là điểm đón tiếp theo/);
    assert.strictEqual(d.bus_location, null, 'off the route, no stop names are made up');
    assert.strictEqual(sent('PICKUP_APPROACHING').length, 0);

    ping(21.0330, 105.8500, 20);
    d = (await track(homeTicket)).body.data;
    assert.ok(d.eta_minutes <= 10);
    assert.strictEqual(sent('PICKUP_APPROACHING').length, 1);
    assert.match(sent('PICKUP_APPROACHING')[0].body, /tới 12 Hàng Bài/);

    // ~145 m of road: in the lane (near), not yet at the door (50 m).
    ping(HOME.lat + 0.001, HOME.lng, 5);
    d = (await track(homeTicket)).body.data;
    assert.strictEqual(d.near_door, true);
    assert.strictEqual(d.at_door, false);
    assert.strictEqual(d.is_at_station, false);
    assert.match(d.hud_status_text, /tới gần chỗ đón/);
    assert.strictEqual(sent('HOME_PICKUP_ARRIVED').length, 0);

    // ~30 m of road, pulled up: at the door.
    ping(HOME.lat + 0.0002, HOME.lng, 3);
    d = (await track(homeTicket)).body.data;
    assert.strictEqual(d.at_door, true);
    assert.strictEqual(d.is_at_station, true);
    assert.match(d.hud_status_text, /tới chỗ đón của bạn/);
    assert.strictEqual(sent('HOME_PICKUP_ARRIVED').length, 1);
  });

  it('TC-HOME-TRACK-04: a stop ticket sees its planned time, the expected time, how late, and where the bus is on the route', async () => {
    services.driverService.activeTrips.get(TRIP).status = 'IN_TRANSIT';
    const phuLy = stopCoords('stp_pl_cao_toc') || stopCoords([...services.driverService.activeTrips.get(TRIP).stops].find(s => /Phủ Lý/.test(s.name)).stop_id);
    ping(phuLy.lat, phuLy.lng, 60);
    const d = (await track(stopTicket)).body.data;
    assert.strictEqual(d.target_stop.stop_id, 'stp_nb');
    assert.ok(d.target_planned_time, 'the stop time the passenger was sold');
    assert.ok(Date.parse(d.expected_at) > Date.now());
    assert.ok(Number.isInteger(d.late_minutes) && d.late_minutes >= 0);
    assert.match(d.bus_location.at_stop || d.bus_location.last_passed_stop, /Phủ Lý/);
    assert.strictEqual(d.bus_location.next_stop, 'Bến xe Ninh Bình');
    assert.strictEqual(d.bus_location.stops_before_target, 0, 'Ninh Bình is the next stop');
  });

  it('TC-HOME-TRACK-05: without the owner token, none of it is shown', async () => {
    const res = await request(`/api/v1/trips/${TRIP}/tracking?ticket_id=${homeTicket}`);
    assert.strictEqual(res.body.data.view, 'PUBLIC');
    assert.strictEqual(res.body.data.expected_at, undefined);
    assert.strictEqual(res.body.data.bus_location, undefined);
  });
});
