/**
 * Spec conformance: shape of the API (Phase A review, FND-A04, A05, A07, A10, A11, A32).
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import http from 'node:http';
import { createFleetBusServer } from '../../source/server/apiServer.js';
import { API_CATALOG } from '../../source/server/core/apiCatalog.js';

const TRIP = 'trp_hn_th_01';

function boot(options) {
  const { server, services } = createFleetBusServer({ authMode: 'off', ...options });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, services, baseUrl: `http://127.0.0.1:${server.address().port}` }));
  });
}

function client(baseUrl) {
  return function api(path, { method = 'GET', body, token, key } = {}) {
    return new Promise((resolve, reject) => {
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      if (method === 'POST' && token) headers['Idempotency-Key'] = key || crypto.randomUUID();
      const req = http.request(`${baseUrl}${path}`, { method, headers }, (res) => {
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
  };
}

describe('Spec conformance: API shape (development mode)', () => {
  let ctx;
  let api;
  before(async () => { ctx = await boot({}); api = client(ctx.baseUrl); });
  after(() => new Promise((resolve) => ctx.server.close(resolve)));

  it('TC-SPEC-A04: a path the API does not have answers 404, never the data of another endpoint', async () => {
    const missing = [
      `/api/v1/trips/${TRIP}/unknown`,
      '/api/v1/ops/vehicles/veh_01/telemetry-trail',
      '/api/v1/ops/drivers/drv_8821a/performance',
      '/api/v1/ops/fleet/anything',
      '/api/v1/ops/crew/anything',
      '/api/v1/tickets/x/y',
      '/api/v1/ops/trips/trp_991823/unknown'
    ];
    for (const path of missing) {
      const res = await api(path);
      assert.strictEqual(res.status, 404, `${path} must be 404`);
      assert.strictEqual(res.body.code, 'NOT_FOUND', `${path} must not be answered by another endpoint`);
    }
  });

  it('TC-SPEC-A32: a trip without any GPS ping reports no signal instead of an invented position (PAX-018, REV-07)', async () => {
    const res = await api('/api/v1/trips/trp_hn_th_02/tracking');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.has_position, false);
    assert.strictEqual(res.body.data.signal_status, 'NO_SIGNAL');
    assert.ok(!('bus_position' in res.body.data) || res.body.data.bus_position === null);

    const unknownTrip = await api('/api/v1/trips/trp_not_a_trip/tracking');
    assert.strictEqual(unknownTrip.status, 404);

    services_updatePosition(ctx.services);
    const live = await api(`/api/v1/trips/${TRIP}/tracking`);
    assert.strictEqual(live.body.data.has_position, true);
    assert.strictEqual(live.body.data.signal_status, 'LIVE');
  });

  it('TC-SPEC-A11: a booking is found by its PNR only (MGR-018)', async () => {
    assert.strictEqual((await api('/api/v1/ops/bookings/BG-88219')).status, 200);
    const byTrip = await api('/api/v1/ops/bookings/trp_991823');
    assert.strictEqual(byTrip.status, 404);
    assert.strictEqual(byTrip.body.code, 'BOOKING_NOT_FOUND');
  });

  it('TC-SPEC-A05a: alerts and the audit log are two different feeds (MGR-025, MGR-028)', async () => {
    const alerts = await api('/api/v1/ops/alerts');
    assert.strictEqual(alerts.status, 200);
    assert.ok(Array.isArray(alerts.body.data.alerts));
    assert.ok(alerts.body.data.alerts.every((a) => a.severity));
    const audit = await api('/api/v1/ops/audit-logs');
    assert.ok(Array.isArray(audit.body.data.audit_logs));
    assert.ok(audit.body.data.audit_logs.every((entry) => !('severity' in entry)), 'the audit log does not carry alerts');
  });

  it('TC-SPEC-A07: endpoints the spec lists and the services can back are served (PAX-008, PAX-010, PAX-013, PAX-015, PAX-024, PAX-025, DRI-003, DRI-008, MGR-012, MGR-013)', async () => {
    const stops = await api(`/api/v1/trips/${TRIP}/stops`);
    assert.strictEqual(stops.status, 200);
    assert.ok(stops.body.data.stops.length >= 2);
    assert.strictEqual((await api('/api/v1/trips/trp_not_a_trip/stops')).status, 404);

    const hold = await api(`/api/v1/trips/${TRIP}/seats/hold`, { method: 'POST', body: { seatCodes: ['B05'], userId: 'u_release' } });
    assert.strictEqual(hold.status, 200);
    const released = await api(`/api/v1/trips/${TRIP}/seats/hold?userId=u_release`, { method: 'DELETE' });
    assert.strictEqual(released.status, 200);
    assert.strictEqual(released.body.data.released_count, 1);
    const again = await api(`/api/v1/trips/${TRIP}/seats/hold?userId=u_release`, { method: 'DELETE' });
    assert.strictEqual(again.body.data.released_count, 0, 'releasing twice is harmless');
    assert.strictEqual((await api(`/api/v1/trips/${TRIP}/seats/hold`, { method: 'POST', body: { seatCodes: ['B05'], userId: 'u_next' } })).status, 200);

    const none = await api(`/api/v1/trips/${TRIP}/disruptions`);
    assert.strictEqual(none.status, 200);
    assert.strictEqual(none.body.data.has_disruption, false);
    assert.strictEqual((await api(`/api/v1/trips/${TRIP}/replacement-info`)).body.data.has_replacement, false);

    ctx.services.trackingService.registerDisruption(TRIP, { type: 'VEHICLE_REPLACEMENT', title: 'Doi xe', message: 'Xe moi 29B-888.22', new_plate_number: '29B-888.22' });
    const replaced = await api(`/api/v1/trips/${TRIP}/replacement-info`);
    assert.strictEqual(replaced.body.data.has_replacement, true);
    assert.strictEqual(replaced.body.data.new_plate_number, '29B-888.22');
    assert.strictEqual((await api(`/api/v1/trips/${TRIP}/disruptions`)).body.data.has_disruption, true);

    const created = await api('/api/v1/bookings/create', {
      method: 'POST',
      body: {
        tripId: TRIP, userId: 'u_next', holdId: (await api(`/api/v1/trips/${TRIP}/seats/hold`, { method: 'POST', body: { seatCodes: ['B05'], userId: 'u_next' } })).body.data.hold_id,
        seatCodes: ['B05'], payer: { full_name: 'Khach Tra Cuu', phone: '0987000123' }, passengers: [{ seat_code: 'B05', full_name: 'Khach Tra Cuu' }]
      }
    });
    const orderId = created.body.data.payment.order_id;
    const pnr = created.body.data.payment.pnr;
    const status = await api(`/api/v1/payments/${orderId}/status`);
    assert.strictEqual(status.status, 200);
    assert.strictEqual(status.body.data.payment_status, 'PENDING_PAYMENT');
    const booking = await api(`/api/v1/bookings/${pnr}`);
    assert.strictEqual(booking.status, 200);
    assert.strictEqual(booking.body.data.pnr, pnr);
    assert.strictEqual((await api('/api/v1/bookings/BG-000000')).status, 404);

    assert.strictEqual((await api('/api/v1/driver/trips/trp_991823')).status, 200);
    assert.strictEqual((await api('/api/v1/driver/trips/trp_nope')).status, 404);
    const early = await api('/api/v1/driver/trips/trp_991823/stops/stp_hn_gb/arrive', { method: 'POST' });
    assert.strictEqual(early.status, 400);
    assert.strictEqual(early.body.code, 'TRIP_NOT_ACTIVE');

    assert.strictEqual((await api('/api/v1/ops/trips/trp_991823/master')).status, 200);
    assert.strictEqual((await api('/api/v1/ops/trips/trp_991823/seat-matrix')).status, 200);
  });

  it('TC-SPEC-A09: the driver profile belongs to the driver who asks, and never exposes the PIN (DRI-018)', async () => {
    const other = await new Promise((resolve, reject) => {
      http.get(`${ctx.baseUrl}/api/v1/driver/profile`, { headers: { 'x-driver-id': 'drv_9912b' } }, (res) => {
        let raw = '';
        res.on('data', (c) => { raw += c; });
        res.on('end', () => resolve(JSON.parse(raw)));
      }).on('error', reject);
    });
    assert.strictEqual(other.data.driver_id, 'drv_9912b');
    assert.strictEqual(other.data.full_name, 'Phạm Quốc Huy');
    assert.strictEqual(other.data.license_valid_until, '2028-06-30');
    assert.ok(!('pin' in other.data) && !JSON.stringify(other).includes('scrypt'), 'no credential in the profile');

    const own = (await api('/api/v1/driver/profile')).body.data;
    assert.strictEqual(own.driver_id, 'drv_8821a');
    assert.strictEqual(typeof own.trips_assigned_today, 'number');
    assert.ok(!('rating' in own), 'a rating with no data behind it is not reported');
  });

  it('TC-SPEC-A10: the OpenAPI document lists every endpoint of the catalog, and every catalog entry exists', async () => {
    const doc = await api('/api/v1/openapi.json');
    const paths = doc.body.data.paths;
    for (const entry of API_CATALOG) {
      assert.ok(paths[entry.path]?.[entry.method.toLowerCase()], `${entry.method} ${entry.path} must be in openapi.json`);
    }
    assert.ok(Object.keys(paths).length >= 60, 'the document must describe the real API, not a sample');

    for (const entry of API_CATALOG) {
      const concrete = entry.path.replace(/\{[^}]+\}/g, 'x');
      const res = await api(concrete, { method: entry.method });
      assert.notStrictEqual(res.body?.code, 'NOT_FOUND', `${entry.method} ${entry.path} is in the catalog but not served`);
    }
  });
});

function services_updatePosition(services) {
  services.trackingService.updateBusPosition(TRIP, { lat: 20.95, lng: 105.84, speed_kmh: 50, bearing_deg: 90, plate_number: '29B-882.19' });
}

describe('Spec conformance: API shape (authentication enforced)', () => {
  let ctx;
  let api;
  before(async () => { ctx = await boot({ authMode: 'enforce', webhookSecret: null }); api = client(ctx.baseUrl); });
  after(() => new Promise((resolve) => ctx.server.close(resolve)));

  it('TC-SPEC-A05b: the audit log records who did what, to what, from where, with before and after (MGR-028)', async () => {
    const login = await api('/api/v1/auth/staff/login', { method: 'POST', body: { username: 'dispatcher@busgo.vn', password: 'disp123' } });
    const token = login.body.data.token;
    const delay = await api('/api/v1/ops/trips/trp_991824/delay', { method: 'POST', token, body: { delayMinutes: 20, reason: 'Ket xe' } });
    assert.strictEqual(delay.status, 200);

    const admin = await api('/api/v1/auth/staff/login', { method: 'POST', body: { username: 'admin@busgo.vn', password: 'admin123' } });
    const logs = await api('/api/v1/ops/audit-logs', { token: admin.body.data.token });
    assert.strictEqual(logs.status, 200);
    const entry = logs.body.data.audit_logs.find((l) => l.action === 'TRIP_DELAY');
    assert.ok(entry, 'the delay must be in the audit log');
    assert.strictEqual(entry.actor, 'mgr_02');
    assert.strictEqual(entry.role, 'DISPATCHER');
    assert.strictEqual(entry.resource, 'trp_991824');
    assert.ok(entry.ip);
    assert.strictEqual(entry.after.delay_minutes, 20);
    assert.strictEqual(entry.before.delay_minutes, 35);
    assert.ok(Date.parse(entry.at) > 0);
    assert.ok(logs.body.data.audit_logs.some((l) => l.action === 'LOGIN' && l.actor === 'mgr_02'));

    await api('/api/v1/auth/staff/login', { method: 'POST', body: { username: 'dispatcher@busgo.vn', password: 'wrong' } });
    const afterFail = await api('/api/v1/ops/audit-logs', { token: admin.body.data.token });
    assert.ok(afterFail.body.data.audit_logs.some((l) => l.action === 'LOGIN_FAILED' && l.resource === 'dispatcher@busgo.vn'));
    assert.ok(!JSON.stringify(afterFail.body).includes('wrong'), 'a password never reaches the audit log');
  });

  it('TC-SPEC-A07b: a passenger reads their own profile from the token (PAX-022)', async () => {
    const phone = '0912000777';
    const request = await api('/api/v1/auth/passenger/otp/request', { method: 'POST', body: { phone } });
    const verify = await api('/api/v1/auth/passenger/otp/verify', { method: 'POST', body: { phone, otp: request.body.data.mock_otp } });
    const profile = await api('/api/v1/passenger/profile', { token: verify.body.data.token });
    assert.strictEqual(profile.status, 200);
    assert.strictEqual(profile.body.data.phone, phone);
    assert.strictEqual((await api('/api/v1/passenger/profile')).status, 401);
  });
});
