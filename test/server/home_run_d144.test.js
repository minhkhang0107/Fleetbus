import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { createFleetBusServer } from '../../source/server/apiServer.js';
import { addDays, vnDate } from '../../source/server/core/serviceDate.js';
import { Messenger } from '../../source/server/core/messaging.js';

/**
 * D144: home pickups as bus companies run them. Bookings come by phone too; the bus collects the addresses in an
 * order, each passenger gets their own time and place in the run, says when they are ready, and the bus waits a
 * set time at each door. Messages reach a phone without the app.
 */
describe('Home pickup run as bus companies run it (D144)', () => {
  let server;
  let services;
  let baseUrl;
  let staff;
  let driver;
  let otherDriver;
  const day = addDays(vnDate(Date.now()), 1);
  const TRIP = `trp_hn_th_03_${day.replaceAll('-', '')}`;
  const A = { name: 'Khách A', phone: '0901000001', seat: 'A01', address: '12 Hàng Bài, Hoàn Kiếm', lat: 21.0245, lng: 105.8523 };
  const B = { name: 'Khách B', phone: '0901000002', seat: 'A02', address: '88 Láng Hạ, Đống Đa', lat: 21.0136, lng: 105.8150 };
  const C = { name: 'Khách C', phone: '0901000003', seat: 'A03', address: '20 Xuân Thủy, Cầu Giấy', lat: 21.0368, lng: 105.7860 };
  let seq = 1;

  const request = async (path, { method = 'GET', body, token } = {}) => {
    const headers = { 'Content-Type': 'application/json', 'X-Operator-Code': 'SAOMAI' };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (method === 'POST') headers['Idempotency-Key'] = crypto.randomUUID();
    const res = await fetch(`${baseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = text; }
    return { status: res.status, body: json };
  };
  const passengerToken = async (phone) => {
    const otp = await request('/api/v1/auth/passenger/otp/request', { method: 'POST', body: { phone } });
    return (await request('/api/v1/auth/passenger/otp/verify', { method: 'POST', body: { phone, otp: otp.body.data.mock_otp } })).body.data.token;
  };
  const buyHome = async (p) => {
    p.token = await passengerToken(p.phone);
    const stops = (await request(`/api/v1/trips/${TRIP}`)).body.data.stops;
    const hold = await request(`/api/v1/passenger/trips/${TRIP}/hold-seats`, { method: 'POST', token: p.token, body: { seatCodes: [p.seat], pickupStopId: stops[0].stop_id, dropoffStopId: stops.at(-1).stop_id } });
    assert.strictEqual(hold.status, 200, JSON.stringify(hold.body));
    const order = await request('/api/v1/passenger/bookings/create', { method: 'POST', token: p.token, body: { tripId: TRIP, holdId: hold.body.data.hold_id, seatCodes: [p.seat], payer: { full_name: p.name, phone: p.phone }, passengers: [{ seat_code: p.seat, full_name: p.name, phone: p.phone }], homePickup: { address: p.address, lat: p.lat, lng: p.lng } } });
    assert.strictEqual(order.status, 201, JSON.stringify(order.body));
    services.paymentService.settlePayment(order.body.data.payment.order_id);
    p.id = [...services.paymentService.tickets.values()].find(t => t.pnr === order.body.data.payment.pnr).ticket_id;
  };
  const trip = () => services.driverService.activeTrips.get(TRIP);
  const inbox = (phone) => { const r = services.trackingService.getNotifications(phone, 'op_saomai'); return r.data?.notifications ?? r.data; };
  const ofType = (phone, type) => inbox(phone).filter(n => n.type === type);
  const ping = (lat, lng, speed = 25) => services.driverService.recordTelemetry(TRIP, { lat, lng, speed_kmh: speed, bearing_deg: 0, seq: seq++ });
  const trackApp = async (p) => (await request(`/api/v1/trips/${TRIP}/tracking?ticket_id=${p.id}`, { token: p.token })).body.data;
  const trackShare = async (token) => (await request(`/api/v1/trips/${TRIP}/tracking?share=${token}`)).body.data;

  before(async () => {
    ({ server, services } = createFleetBusServer());
    await new Promise(resolve => server.listen(0, resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    staff = (await request('/api/v1/ops/auth/login', { method: 'POST', body: { username: 'dispatcher@busgo.vn', password: 'disp123' } })).body.data.token;
    await buyHome(A);
    const assigned = await request(`/api/v1/ops/trips/${TRIP}/assign`, { method: 'POST', token: staff, body: { vehicleId: 'veh_02', driverId: 'drv_9912b' } });
    assert.strictEqual(assigned.status, 200, JSON.stringify(assigned.body));
    driver = (await request('/api/v1/driver/auth/login', { method: 'POST', body: { staff_id: 'TX9912', pin: '112233' } })).body.data.token;
    otherDriver = (await request('/api/v1/driver/auth/login', { method: 'POST', body: { staff_id: 'TX8821', pin: '123456' } })).body.data.token;
  });

  after(() => new Promise(resolve => server.close(resolve)));

  it('TC-D144-01: a phone booking takes the home address, holds the seat until departure and texts the tracking link', async () => {
    const outside = await request('/api/v1/ops/pos/hotline-hold', { method: 'POST', token: staff, body: { tripId: TRIP, passengerName: B.name, phone: B.phone, seatCodes: [B.seat], homePickup: { address: 'Hạ Long', lat: 20.95, lng: 107.08 } } });
    assert.strictEqual(outside.status, 422, 'outside the service areas');

    const res = await request('/api/v1/ops/pos/hotline-hold', { method: 'POST', token: staff, body: { tripId: TRIP, passengerName: B.name, phone: B.phone, seatCodes: [B.seat], homePickup: { address: B.address, lat: B.lat, lng: B.lng, note: 'cổng sắt xanh' } } });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    const r = res.body.data;
    assert.strictEqual(r.home_pickup.status, 'CONFIRMED', 'the office took the address on the phone');
    assert.strictEqual(r.pickup_stop_id, (await request(`/api/v1/trips/${TRIP}`)).body.data.stops[0].stop_id, 'a home pickup rides from the first stop');
    assert.strictEqual(Date.parse(r.hold_until), Date.parse(services.managerService.findTrip(TRIP).departure_time), 'held until the bus leaves');
    assert.match(r.share_token, /^[A-Za-z0-9_-]{24}$/);
    B.share = r.share_token;
    B.id = `hl_${r.reservation_id}_${B.seat}`;

    const entry = trip().manifest.find(m => m.ticket_id === B.id);
    assert.strictEqual(entry.home_pickup.address, B.address);
    assert.strictEqual(entry.cod_amount_vnd > 220000, true, 'fare and home fee paid on board');

    const confirm = ofType(B.phone, 'PHONE_BOOKING_CONFIRMED');
    assert.strictEqual(confirm.length, 1);
    assert.match(confirm[0].body, /Đón tận nhà tại 88 Láng Hạ/);
    const sms = services.messenger.list('op_saomai', { tripId: TRIP }).find(m => m.to === B.phone && m.type === 'PHONE_BOOKING_CONFIRMED');
    assert.strictEqual(sms.channel, 'SMS');
    assert.strictEqual(sms.status, 'LOGGED', 'no SMS provider set in tests');
    assert.ok(sms.text.includes(`/t/${B.share}`), 'the message carries the tracking link');

    const page = await fetch(`${baseUrl}/t/${B.share}`);
    assert.strictEqual(page.status, 200);
    const view = await trackShare(B.share);
    assert.strictEqual(view.view, 'TICKET');
    assert.strictEqual(view.target_stop.kind, 'HOME_PICKUP');
    assert.ok(view.appointment_at, 'their own time before the run');
  });

  it('TC-D144-02: each home passenger gets their own appointment, in collection order, inside the window', async () => {
    await buyHome(C);
    const run = (await request(`/api/v1/driver/trips/${TRIP}`, { token: driver })).body.data.home_run;
    assert.strictEqual(run.stops.length, 3);
    assert.strictEqual(run.wait_minutes, 5);
    const times = run.stops.map(s => Date.parse(s.appointment_at));
    assert.ok(times.every((t, i) => i === 0 || t >= times[i - 1]), 'later in the run, later time');
    assert.ok(new Set(times).size > 1, 'not one shared window for everyone');
    const window = trip().manifest.find(m => m.ticket_id === A.id).home_pickup;
    assert.ok(times.every(t => t >= Date.parse(window.window_from) && t <= Date.parse(window.window_to)));
  });

  it('TC-D144-03: the driver may reorder the run; a wrong list is refused', async () => {
    const bad = await request(`/api/v1/driver/trips/${TRIP}/home-order`, { method: 'POST', token: driver, body: { ticket_ids: [A.id, B.id] } });
    assert.strictEqual(bad.status, 400);
    const ok = await request(`/api/v1/driver/trips/${TRIP}/home-order`, { method: 'POST', token: driver, body: { ticket_ids: [A.id, B.id, C.id] } });
    assert.strictEqual(ok.status, 200, JSON.stringify(ok.body));
    assert.deepStrictEqual(ok.body.data.stops.map(s => s.ticket_id), [A.id, B.id, C.id]);
    assert.strictEqual((await request(`/api/v1/driver/trips/${TRIP}/home-order`, { method: 'POST', token: otherDriver, body: { ticket_ids: [A.id, B.id, C.id] } })).status, 403);
  });

  it('TC-D144-04: setting off tells each one their place and time; only the next door hears "approaching"', async () => {
    assert.strictEqual((await request(`/api/v1/driver/trips/${TRIP}/home-run`, { method: 'POST', token: driver })).status, 200);
    const started = ofType(B.phone, 'HOME_RUN_STARTED');
    assert.strictEqual(started.length, 1);
    assert.match(started[0].body, /điểm đón thứ 2, giờ hẹn khoảng \d\d:\d\d/);

    // The bus is a few hundred metres from A: A is next, B and C wait their turn.
    ping(21.0215, 105.8510);
    const a = await trackApp(A);
    const b = await trackShare(B.share);
    const c = await trackApp(C);
    assert.deepStrictEqual([a.home_queue.position, b.home_queue.position, c.home_queue.position], [1, 2, 3]);
    assert.ok(b.eta_minutes >= a.eta_minutes + 3, 'B counts the stop at A');
    assert.ok(c.eta_minutes > b.eta_minutes);
    assert.match(b.hud_status_text, /Xe đang đón khách khác\. Bạn là điểm đón thứ 2\/3, còn 1 nhà trước bạn/);
    assert.strictEqual(ofType(A.phone, 'PICKUP_APPROACHING').length, 1);
    assert.strictEqual(ofType(B.phone, 'PICKUP_APPROACHING').length, 0, 'B is not told to go out while the bus is at A');
  });

  it('TC-D144-04b: a new order on the road gives new times; each passenger whose time moved is told', async () => {
    const before = (await request(`/api/v1/driver/trips/${TRIP}`, { token: driver })).body.data.home_run.stops;
    const res = await request(`/api/v1/driver/trips/${TRIP}/home-order`, { method: 'POST', token: driver, body: { ticket_ids: [A.id, C.id, B.id] } });
    assert.strictEqual(res.status, 200);
    const times = res.body.data.stops.map(s => Date.parse(s.appointment_at));
    assert.ok(times.every((t, i) => i === 0 || t >= times[i - 1]), 'still in run order');
    const moved = before.filter(b => res.body.data.stops.find(s => s.ticket_id === b.ticket_id).appointment_at !== b.appointment_at);
    assert.ok(moved.length > 0);
    assert.ok(ofType(B.phone, 'HOME_APPOINTMENT_CHANGED').length + ofType(C.phone, 'HOME_APPOINTMENT_CHANGED').length >= 1);
    // Back to the order the next cases expect.
    await request(`/api/v1/driver/trips/${TRIP}/home-order`, { method: 'POST', token: driver, body: { ticket_ids: [A.id, B.id, C.id] } });
  });

  it('TC-D144-05: a passenger says they are ready or need a few minutes; the driver sees it, the wait counts it', async () => {
    const need = await request(`/api/v1/share/${B.share}/pickup-ready`, { method: 'POST', body: { status: 'NEED_5' } });
    assert.strictEqual(need.status, 200, JSON.stringify(need.body));
    assert.deepStrictEqual([need.body.data.ready.status, need.body.data.ready.minutes, need.body.data.wait_minutes], ['NEED_TIME', 5, 5]);
    assert.strictEqual((await request(`/api/v1/share/${B.share}/pickup-ready`, { method: 'POST', body: { status: 'LATER' } })).status, 400);
    assert.strictEqual((await request(`/api/v1/share/${'x'.repeat(24)}/pickup-ready`, { method: 'POST', body: { status: 'READY' } })).status, 404);
    const ready = await request(`/api/v1/passenger/tickets/${C.id}/pickup-ready`, { method: 'POST', token: C.token, body: { status: 'READY' } });
    assert.strictEqual(ready.status, 200);
    assert.strictEqual((await request(`/api/v1/passenger/tickets/${C.id}/pickup-ready`, { method: 'POST', token: A.token, body: { status: 'READY' } })).status, 404, 'only the ticket owner');

    const run = (await request(`/api/v1/driver/trips/${TRIP}`, { token: driver })).body.data.home_run;
    assert.strictEqual(run.stops.find(s => s.ticket_id === B.id).ready.status, 'NEED_TIME');
    assert.strictEqual(run.stops.find(s => s.ticket_id === C.id).ready.status, 'READY');
    assert.strictEqual((await trackShare(B.share)).pickup_ready.minutes, 5);
  });

  it('TC-D144-06: at the door the bus waits the company time, then may go on; the ticket stays good from the first stop', async () => {
    // A boards; B is next.
    services.driverService.boardPassengerManually(TRIP, { ticketId: A.id });
    ping(B.lat + 0.0005, B.lng, 0);
    const door = await request(`/api/v1/driver/trips/${TRIP}/tickets/${B.id}/home-arrived`, { method: 'POST', token: driver });
    assert.strictEqual(door.status, 200);
    const told = ofType(B.phone, 'HOME_PICKUP_DOOR');
    assert.strictEqual(told.length, 1);
    assert.match(told[0].body, /chờ bạn tối đa 5 phút/);
    assert.match((await trackShare(B.share)).hud_status_text, /Tài xế chờ bạn tối đa 5 phút/);

    const early = await request(`/api/v1/driver/trips/${TRIP}/tickets/${B.id}/home-missed`, { method: 'POST', token: driver });
    assert.strictEqual(early.status, 409);
    assert.strictEqual(early.body.code, 'HOME_WAIT_NOT_OVER');

    const entry = trip().manifest.find(m => m.ticket_id === B.id);
    entry.home_pickup.arrived_at = new Date(Date.now() - 6 * 60000).toISOString();
    const missed = await request(`/api/v1/driver/trips/${TRIP}/tickets/${B.id}/home-missed`, { method: 'POST', token: driver });
    assert.strictEqual(missed.status, 200, JSON.stringify(missed.body));
    const gone = ofType(B.phone, 'HOME_PICKUP_MISSED');
    assert.strictEqual(gone.length, 1);
    assert.match(gone[0].body, /mời bạn ra Bến xe .+ trước \d\d:\d\d/);
    const after = await trackShare(B.share);
    assert.notStrictEqual(after.target_stop.kind, 'HOME_PICKUP', 'now followed to the first stop');
    assert.ok(trip().events.some(e => e.type === 'HOME_MISSED' && e.ticket_id === B.id));
    // C moves up.
    assert.strictEqual((await trackApp(C)).home_queue.position, 1);
  });

  it('TC-D144-07: the trip driver gets a passenger number for a call, logged; another driver does not', async () => {
    const res = await request(`/api/v1/driver/trips/${TRIP}/tickets/${C.id}/contact`, { method: 'POST', token: driver });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.phone, C.phone);
    assert.ok(trip().events.some(e => e.type === 'PASSENGER_CALLED' && e.ticket_id === C.id));
    assert.strictEqual((await request(`/api/v1/driver/trips/${TRIP}/tickets/${C.id}/contact`, { method: 'POST', token: otherDriver })).status, 403);
    // The manifest itself never shows the number.
    const manifest = (await request(`/api/v1/driver/trips/${TRIP}`, { token: driver })).body.data.manifest;
    assert.ok(manifest.every(m => !m.passenger_phone));
  });

  it('TC-D144-08: the office sees what went out by SMS or push, per trip', async () => {
    const res = await request(`/api/v1/ops/messages?trip_id=${TRIP}`, { token: staff });
    assert.strictEqual(res.status, 200);
    const types = new Set(res.body.data.messages.map(m => m.type));
    for (const t of ['PHONE_BOOKING_CONFIRMED', 'HOME_RUN_STARTED', 'PICKUP_APPROACHING', 'HOME_PICKUP_DOOR', 'HOME_PICKUP_MISSED']) assert.ok(types.has(t), t);
    assert.strictEqual(res.body.data.sms_provider, false);
    assert.strictEqual((await request(`/api/v1/ops/messages?trip_id=${TRIP}`, { token: A.token })).status, 403, 'not for passengers');
  });

  it('TC-D144-09: providers are plugged by URL: SMS to the gateway, push when the phone registered a token', async () => {
    const calls = [];
    const fetchImpl = async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return { ok: true, status: 200 }; };
    const m = new Messenger({ env: { FLEETBUS_SMS_WEBHOOK_URL: 'https://sms.example/send', FLEETBUS_PUSH_WEBHOOK_URL: 'https://push.example/send' }, fetchImpl });
    const sms = m.dispatch({ operatorId: 'op_saomai', phone: '0901000009', title: 'Xe sắp tới đón bạn', body: 'còn 8 phút', type: 'PICKUP_APPROACHING', link: 'http://x/t/abc' });
    m.registerDevice('0901000008', { token: 'fcm-token-1', platform: 'android', operatorId: 'op_saomai' });
    const push = m.dispatch({ operatorId: 'op_saomai', phone: '0901000008', title: 'Xe sắp tới đón bạn', body: 'còn 8 phút', type: 'PICKUP_APPROACHING' });
    const quiet = m.dispatch({ operatorId: 'op_saomai', phone: '0901000009', title: 'Ưu đãi', body: 'x', type: 'PROMO' });
    await new Promise(r => setTimeout(r, 10));
    assert.deepStrictEqual([sms.channel, sms.status, push.channel, push.status, quiet], ['SMS', 'SENT', 'PUSH', 'SENT', null]);
    assert.deepStrictEqual(calls.map(c => [c.url, c.body.to]), [['https://sms.example/send', '0901000009'], ['https://push.example/send', 'fcm-token-1']]);
    assert.ok(calls[0].body.text.endsWith('http://x/t/abc'));

    const reg = await request('/api/v1/passenger/devices', { method: 'POST', token: C.token, body: { platform: 'android' } });
    assert.strictEqual(reg.status, 200);
    assert.strictEqual(services.messenger.devices.get(C.phone).platform, 'android');
  });

  it('TC-D144-10: on board, the ETA to the drop-off does not jump with the speed of the minute', async () => {
    const shape = trip().stops;
    assert.ok(shape.length > 1);
    ping(21.0, 105.84, 0);
    const parked = (await trackApp(A)).eta_minutes;
    ping(21.0, 105.84, 30);
    const slow = (await trackApp(A)).eta_minutes;
    assert.strictEqual(parked, slow);
  });

  it('TC-D144-11: a counter sale with a home address carries it to the ticket, the driver and the passenger app', async () => {
    const D = { name: 'Khách D', phone: '0901000004', seat: 'A04', address: '5 Kim Mã, Ba Đình', lat: 21.0320, lng: 105.8230 };
    const cashier = (await request('/api/v1/ops/auth/login', { method: 'POST', body: { username: 'cashier@busgo.vn', password: 'cash123' } })).body.data.token;
    const res = await request('/api/v1/ops/pos/orders', { method: 'POST', token: cashier, body: { tripId: TRIP, passengerName: D.name, phone: D.phone, seatCodes: [D.seat], paymentMethod: 'CASH_POS', homePickup: { address: D.address, lat: D.lat, lng: D.lng } } });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    const ticket = [...services.paymentService.tickets.values()].find(t => t.pnr === res.body.data.pnr);
    assert.strictEqual(ticket.home_pickup.address, D.address);
    assert.ok(ticket.share_token);
    assert.doesNotMatch(ticket.pickup_stop, /POS|trung tâm/, 'the real stop name');
    assert.strictEqual(trip().manifest.find(m => m.ticket_id === ticket.ticket_id).home_pickup.address, D.address);
    const token = await passengerToken(D.phone);
    const wallet = (await request('/api/v1/passenger/tickets', { token })).body.data;
    const list = wallet.tickets || wallet.upcoming || wallet;
    assert.ok(JSON.stringify(list).includes(ticket.ticket_id), 'the phone booking is in the app of that number');
  });
});
