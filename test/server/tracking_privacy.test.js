import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { createFleetBusServer } from '../../source/server/apiServer.js';
import { generateTotp } from '../../source/server/core/totp.js';
import { DEV_TOTP_SECRET } from '../../source/server/config.js';

describe('Tracking Privacy and GPS rules (Task S6)', () => {
  let server;
  let services;
  let baseUrl;
  
  let driverToken;
  let staffToken;
  let otherStaffToken;
  let paxToken;
  let otherPaxToken;
  
  let ticketId;
  let shareToken;

  const tripId = 'trp_hn_th_01'; // SAOMAI trip

  const request = async (path, { method = 'GET', body, token, headers = {} } = {}) => {
    const h = { 'Content-Type': 'application/json', ...headers };
    if (token) h.Authorization = `Bearer ${token}`;
    if (method === 'POST') h['Idempotency-Key'] = crypto.randomUUID();
    const res = await fetch(`${baseUrl}${path}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* HTML page */ }
    return { status: res.status, body: json, text };
  };

  const staffLogin = (username, password, code) => request('/api/v1/ops/auth/login', { method: 'POST', body: { username, password, totp: code } });
  
  before(async () => {
    ({ server, services } = createFleetBusServer());
    await new Promise(resolve => server.listen(0, resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    // Login driver
    const driverRes = await request('/api/v1/driver/auth/login', { method: 'POST', headers: { 'X-Operator-Code': 'SAOMAI' }, body: { staffIdOrPhone: 'TX8821', pin: '123456' } });
    if (!driverRes.body || !driverRes.body.data) throw new Error('Driver login failed: ' + JSON.stringify(driverRes.body) + ' ' + driverRes.text);
    driverToken = driverRes.body.data.token;

    // Login staff
    const staffRes = await staffLogin('dispatcher@busgo.vn', 'disp123'); // SAOMAI
    if (!staffRes.body || !staffRes.body.data) throw new Error('Staff login failed: ' + JSON.stringify(staffRes.body));
    staffToken = staffRes.body.data.token;

    const otherStaffRes = await staffLogin('dispatcher@xuyenviet.vn', 'xv123'); // XUYENVIET
    otherStaffToken = otherStaffRes.body.data.token;

    // Login pax 1
    const req1 = await request('/api/v1/auth/passenger/otp/request', { method: 'POST', headers: { 'X-Operator-Code': 'SAOMAI' }, body: { phone: '0901234567' }});
    const pax1Res = await request('/api/v1/auth/passenger/otp/verify', { method: 'POST', headers: { 'X-Operator-Code': 'SAOMAI' }, body: { phone: '0901234567', otp: req1.body.data.mock_otp }});
    if (!pax1Res.body || !pax1Res.body.data) throw new Error('Pax 1 login failed: ' + JSON.stringify(pax1Res.body));
    paxToken = pax1Res.body.data.token;

    // Login pax 2
    const req2 = await request('/api/v1/auth/passenger/otp/request', { method: 'POST', headers: { 'X-Operator-Code': 'SAOMAI' }, body: { phone: '0987654321' }});
    const pax2Res = await request('/api/v1/auth/passenger/otp/verify', { method: 'POST', headers: { 'X-Operator-Code': 'SAOMAI' }, body: { phone: '0987654321', otp: req2.body.data.mock_otp }});
    if (!pax2Res.body || !pax2Res.body.data) throw new Error('Pax 2 login failed: ' + JSON.stringify(pax2Res.body));
    otherPaxToken = pax2Res.body.data.token;

    // Start trip
    services.driverService.startTrip(tripId);
  });

  after(() => new Promise(resolve => server.close(resolve)));

  it('driver seq ordering (older seq ignored, position unchanged)', async () => {
    const p1 = services.driverService.recordTelemetry(tripId, { lat: 21.0, lng: 105.0, speed_kmh: 40, seq: 10, mockNow: Date.now() });
    assert.strictEqual(p1.success, true);
    assert.strictEqual(services.driverService.activeTrips.get(tripId).current_lat, 21.0);

    const p2 = services.driverService.recordTelemetry(tripId, { lat: 21.1, lng: 105.1, speed_kmh: 45, seq: 9, mockNow: Date.now() + 1000 });
    assert.strictEqual(p2.success, true);
    assert.strictEqual(p2.accepted, false);
    assert.strictEqual(p2.reason, 'STALE');
    assert.strictEqual(services.driverService.activeTrips.get(tripId).current_lat, 21.0, 'position unchanged');
  });

  it('low accuracy rejected', async () => {
    const p = services.driverService.recordTelemetry(tripId, { lat: 21.2, lng: 105.2, speed_kmh: 40, accuracy_m: 250, mockNow: Date.now() + 2000 });
    assert.strictEqual(p.success, false);
    assert.strictEqual(p.code, 'LOW_ACCURACY');
    assert.strictEqual(services.driverService.activeTrips.get(tripId).current_lat, 21.0);
  });

  it('a malformed device time or sequence is refused, and a device clock ahead of the server does not lock out later pings', async () => {
    const badTime = services.driverService.recordTelemetry(tripId, { lat: 21.2, lng: 105.2, recorded_at: 'not a date', mockNow: Date.now() });
    assert.strictEqual(badTime.code, 'INVALID_TELEMETRY');
    const badSeq = services.driverService.recordTelemetry(tripId, { lat: 21.2, lng: 105.2, seq: 'x', mockNow: Date.now() });
    assert.strictEqual(badSeq.code, 'INVALID_TELEMETRY');
    const asText = services.driverService.recordTelemetry(tripId, { lat: 21.2, lng: 105.2, seq: '9', mockNow: Date.now() });
    assert.strictEqual(asText.reason, 'STALE', 'a seq sent as text is compared as a number');
    const trip = services.driverService.activeTrips.get(tripId);
    const saved = { seq: trip.last_seq, at: trip.last_telemetry_at };
    trip.last_seq = undefined;
    const ahead = services.driverService.recordTelemetry(tripId, { lat: 21.25, lng: 105.25, recorded_at: Date.now() + 3600000, mockNow: Date.now() });
    assert.strictEqual(ahead.accepted, true);
    assert.ok(trip.last_telemetry_at <= Date.now(), 'device time is capped at the server time');
    trip.last_seq = saved.seq;
    trip.current_lat = 21.0;
  });

  it('too-old ping not applied', async () => {
    const oldTime = Date.now() - 130000;
    const p = services.driverService.recordTelemetry(tripId, { lat: 21.3, lng: 105.3, speed_kmh: 40, seq: 11, recorded_at: new Date(oldTime).toISOString(), mockNow: Date.now() });
    assert.strictEqual(p.success, true);
    assert.strictEqual(p.accepted, false);
    assert.strictEqual(p.reason, 'TOO_OLD');
    assert.strictEqual(services.driverService.activeTrips.get(tripId).current_lat, 21.0);
  });

  it('freshness fields present with correct state for a 90 s old ping', async () => {
    const pingTime = Date.now() - 90000; // 90 seconds old
    const p = services.driverService.recordTelemetry(tripId, { lat: 21.4, lng: 105.4, speed_kmh: 40, seq: 12, recorded_at: new Date(pingTime).toISOString(), mockNow: Date.now() });
    assert.strictEqual(p.success, true);
    assert.strictEqual(services.driverService.activeTrips.get(tripId).current_lat, 21.4);

    const track = await request(`/api/v1/trips/${tripId}/tracking`, { token: staffToken, headers: { 'X-Operator-Code': 'SAOMAI' } });
    assert.strictEqual(track.status, 200);
    assert.strictEqual(track.body.data.has_position, true);
    assert.ok(track.body.data.freshness, 'freshness field exists');
    assert.strictEqual(track.body.data.freshness.state, 'STALE'); // 90s is STALE
    assert.ok(track.body.data.freshness.warning);
  });

  it('anonymous tracking hides position but returns stops/route_shape', async () => {
    const track = await request(`/api/v1/trips/${tripId}/tracking`, { headers: { 'X-Operator-Code': 'SAOMAI' } });
    assert.strictEqual(track.status, 200);
    assert.strictEqual(track.body.data.position_hidden, true);
    assert.strictEqual(track.body.data.has_position, false);
    assert.strictEqual(track.body.data.bus_position, null);
    assert.ok(track.body.data.stops.length > 0);
    assert.ok(track.body.data.route_shape);
  });

  it('buy a ticket and create share token', async () => {
    const holdRes = await request(`/api/v1/passenger/trips/${tripId}/hold-seats`, { 
      method: 'POST', token: paxToken, 
      body: { seatCodes: ['B01'], pickupStopId: 'stp_nb', dropoffStopId: 'stp_th_pb', now: Date.now() },
      headers: { 'X-Operator-Code': 'SAOMAI' }
    });
    assert.strictEqual(holdRes.status, 200, JSON.stringify(holdRes.body));
    const holdId = holdRes.body.data.hold_id;

    const bookRes = await request('/api/v1/passenger/bookings/create', { 
      method: 'POST', token: paxToken, 
      body: { tripId: tripId, holdId: holdId, seatCodes: ['B01'], payer: { full_name: 'Pax One', phone: '0901234567' }, passengers: [{ seat_code: 'B01', full_name: 'Pax One', phone: '0901234567' }] },
      headers: { 'X-Operator-Code': 'SAOMAI' }
    });
    assert.strictEqual(bookRes.status, 201, JSON.stringify(bookRes.body));
    const settled = services.paymentService.settlePayment(bookRes.body.data.payment.order_id);
    assert.strictEqual(settled.success, true, JSON.stringify(settled));
    ticketId = [...services.paymentService.tickets.values()].find(t => t.pnr === bookRes.body.data.payment.pnr).ticket_id;

    const shareRes = await request(`/api/v1/passenger/tickets/${ticketId}/share`, { method: 'POST', token: paxToken, headers: { 'X-Operator-Code': 'SAOMAI' } });
    assert.strictEqual(shareRes.status, 200, JSON.stringify(shareRes.body));
    assert.ok(shareRes.body.data.share_token);
    assert.ok(shareRes.body.data.share_url);
    shareToken = shareRes.body.data.share_token;
  });

  it('owner with ticket_id+token sees the position', async () => {
    const track = await request(`/api/v1/passenger/trips/${tripId}/tracking?ticket_id=${ticketId}`, { token: paxToken, headers: { 'X-Operator-Code': 'SAOMAI' } });
    assert.strictEqual(track.status, 200);
    assert.strictEqual(track.body.data.position_hidden, undefined);
    assert.strictEqual(track.body.data.has_position, true);
    assert.ok(track.body.data.bus_position);
    assert.strictEqual(track.body.data.view, 'TICKET');
  });

  it('foreign passenger with someone else ticket_id does not see position', async () => {
    const track = await request(`/api/v1/passenger/trips/${tripId}/tracking?ticket_id=${ticketId}`, { token: otherPaxToken, headers: { 'X-Operator-Code': 'SAOMAI' } });
    assert.strictEqual(track.status, 200);
    assert.strictEqual(track.body.data.position_hidden, true);
    assert.strictEqual(track.body.data.has_position, false);
    assert.strictEqual(track.body.data.view, 'PUBLIC');
  });

  it('share token works without login and never leaks name/phone', async () => {
    const track = await request(`/api/v1/trips/${tripId}/tracking?share=${shareToken}`, { headers: { 'X-Operator-Code': 'SAOMAI' } });
    assert.strictEqual(track.status, 200);
    assert.strictEqual(track.body.data.has_position, true);
    assert.ok(track.body.data.bus_position);
    assert.strictEqual(track.body.data.view, 'TICKET');
    
    const text = JSON.stringify(track.body.data);
    assert.strictEqual(text.includes('Pax One'), false);
    assert.strictEqual(text.includes('0901234567'), false);
  });

  it('invalid share → hidden position', async () => {
    const track = await request(`/api/v1/trips/${tripId}/tracking?share=invalid_token`, { headers: { 'X-Operator-Code': 'SAOMAI' } });
    assert.strictEqual(track.status, 200);
    assert.strictEqual(track.body.data.has_position, false);
    assert.strictEqual(track.body.data.position_hidden, true);
  });

  it('staff token of the operator sees the bus', async () => {
    const track = await request(`/api/v1/trips/${tripId}/tracking`, { token: staffToken, headers: { 'X-Operator-Code': 'SAOMAI' } });
    assert.strictEqual(track.status, 200);
    assert.strictEqual(track.body.data.has_position, true);
    assert.strictEqual(track.body.data.view, 'STAFF');
  });

  it('staff of another operator gets 404', async () => {
    const track = await request(`/api/v1/trips/${tripId}/tracking`, { token: otherStaffToken, headers: { 'X-Operator-Code': 'XUYENVIET' } });
    assert.strictEqual(track.status, 404);
  });

  it('/t/<token> 200 and /t/bad 404, including bus position when telemetry exists (F15)', async () => {
    const dataRes = await request(`/api/v1/trips/${tripId}/tracking?share=${shareToken}`, { headers: { 'X-Operator-Code': 'SAOMAI' } });
    assert.strictEqual(dataRes.status, 200);
    assert.strictEqual(dataRes.body.data.has_position, true);
    assert.ok(dataRes.body.data.bus_position);
    assert.strictEqual(typeof dataRes.body.data.bus_position.lat, 'number');
    assert.strictEqual(typeof dataRes.body.data.bus_position.lng, 'number');

    const page = await request(`/t/${shareToken}`);
    assert.strictEqual(page.status, 200);
    assert.ok(page.text.includes('leaflet'));
    assert.ok(page.text.includes(shareToken));
    assert.ok(page.text.includes('"bus_position"'));
    assert.ok(page.text.includes(String(dataRes.body.data.bus_position.lat)));

    const bad = await request('/t/invalid_token');
    assert.strictEqual(bad.status, 404);
  });

  it('completed trip hides the position with tracking_ended', async () => {
    const end = await request(`/api/v1/driver/trips/${tripId}/end`, { method: 'POST', token: driverToken, headers: { 'X-Operator-Code': 'SAOMAI' }, body: { earlyEndReason: 'test tests tests' } });
    assert.strictEqual(end.status, 200, JSON.stringify(end.body));

    const track = await request(`/api/v1/trips/${tripId}/tracking?share=${shareToken}`, { headers: { 'X-Operator-Code': 'SAOMAI' } });
    assert.strictEqual(track.status, 200);
    assert.strictEqual(track.body.data.has_position, false);
    assert.strictEqual(track.body.data.position_hidden, true);
    assert.strictEqual(track.body.data.tracking_ended, true);

    const staffTrack = await request(`/api/v1/trips/${tripId}/tracking`, { token: staffToken, headers: { 'X-Operator-Code': 'SAOMAI' } });
    assert.strictEqual(staffTrack.status, 200);
    assert.strictEqual(staffTrack.body.data.has_position, true);
  });
});
