import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { createFleetBusServer } from '../../source/server/apiServer.js';
import { findOperatorByCode } from '../../source/server/core/operators.js';
import { checkHomeService, pointInPolygon, validateArea } from '../../source/server/core/serviceAreas.js';

const SQUARE = [[0, 0], [0, 10], [10, 10], [10, 0]];
// A "U": the notch between x 3..7 above y 3 is outside.
const U_SHAPE = [[0, 0], [0, 10], [10, 10], [10, 7], [3, 7], [3, 3], [10, 3], [10, 0]];
const GIAP_BAT = { lat: 20.9806, lng: 105.8413 };
const HAI_PHONG = { lat: 20.86, lng: 106.68 };
const DEPARTURE = '2026-08-28T07:00:00+07:00';
const LONG_BEFORE = new Date('2026-08-27T07:00:00+07:00').getTime();

describe('Pickup / drop-off modes and service areas', () => {
  describe('rules', () => {
    it('point in polygon: inside, outside, on an edge, concave', () => {
      assert.strictEqual(pointInPolygon(5, 5, SQUARE), true);
      assert.strictEqual(pointInPolygon(11, 5, SQUARE), false);
      assert.strictEqual(pointInPolygon(0, 5, SQUARE), true, 'on an edge counts as inside');
      assert.strictEqual(pointInPolygon(10, 10, SQUARE), true, 'a corner counts as inside');
      assert.strictEqual(pointInPolygon(1, 5, U_SHAPE), true);
      assert.strictEqual(pointInPolygon(5, 5, U_SHAPE), false, 'inside the notch of the U');
      assert.strictEqual(pointInPolygon(5, 8.5, U_SHAPE), true);
    });

    it('validates an area', () => {
      const ok = { name: 'A', kind: 'PICKUP', polygon: SQUARE, fee_vnd: 0, lead_time_minutes: 0, service_hours: { from: '05:00', to: '21:00' } };
      assert.strictEqual(validateArea(ok), null);
      assert.ok(validateArea({ ...ok, polygon: SQUARE.slice(0, 2) }));
      assert.ok(validateArea({ ...ok, polygon: [[0, 0], [0, 200], [1, 1]] }));
      assert.ok(validateArea({ ...ok, kind: 'HOME' }));
      assert.ok(validateArea({ ...ok, fee_vnd: -1 }));
      assert.ok(validateArea({ ...ok, service_hours: { from: '5h', to: '21:00' } }));
    });

    it('Sao Mai picks up at home in Hà Nội with its fee, not in Hải Phòng (AC 2)', () => {
      const config = findOperatorByCode('SAOMAI').service_config;
      const ok = checkHomeService(config, { kind: 'PICKUP', ...GIAP_BAT, departureTime: DEPARTURE, now: LONG_BEFORE });
      assert.strictEqual(ok.ok, true);
      assert.strictEqual(ok.fee_vnd, 50000);
      assert.strictEqual(ok.area.area_id, 'sa_saomai_hn');
      const out = checkHomeService(config, { kind: 'PICKUP', ...HAI_PHONG, departureTime: DEPARTURE, now: LONG_BEFORE });
      assert.strictEqual(out.code, 'OUTSIDE_SERVICE_AREA');
    });

    it('enforces lead time and service hours on the departure time (Vietnam time)', () => {
      const config = findOperatorByCode('SAOMAI').service_config;
      const late = checkHomeService(config, { kind: 'PICKUP', ...GIAP_BAT, departureTime: DEPARTURE, now: new Date(DEPARTURE).getTime() - 60 * 60000 });
      assert.strictEqual(late.code, 'LEAD_TIME_TOO_SHORT');
      assert.match(late.message, /120 phút/);
      const night = checkHomeService(config, { kind: 'PICKUP', ...GIAP_BAT, departureTime: '2026-08-28T23:30:00+07:00', now: LONG_BEFORE });
      assert.strictEqual(night.code, 'OUTSIDE_SERVICE_HOURS');
      const early = checkHomeService(config, { kind: 'PICKUP', ...GIAP_BAT, departureTime: '2026-08-28T04:30:00+07:00', now: LONG_BEFORE });
      assert.strictEqual(early.ok, true, '04:30 is the first pickup slot');
    });

    it('Xuyên Việt has no home pickup (AC 1)', () => {
      const res = checkHomeService(findOperatorByCode('XUYENVIET').service_config, { kind: 'PICKUP', ...GIAP_BAT, now: LONG_BEFORE });
      assert.strictEqual(res.code, 'MODE_DISABLED');
    });
  });

  describe('HTTP', () => {
    let server;
    let services;
    let baseUrl;
    let saomaiDispatcher;
    let xvDispatcher;
    let cashier;

    const request = async (path, { method = 'GET', body, token, code } = {}) => {
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      if (code) headers['X-Operator-Code'] = code;
      if (method === 'POST' && token) headers['Idempotency-Key'] = crypto.randomUUID();
      const res = await fetch(`${baseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
      return { status: res.status, body: await res.json() };
    };
    const login = async (username, password) => (await request('/api/v1/ops/auth/login', { method: 'POST', body: { username, password } })).body.data.token;
    const AREA = { name: 'Phố cổ', kind: 'PICKUP', polygon: [[21.04, 105.84], [21.04, 105.86], [21.02, 105.86], [21.02, 105.84]], fee_vnd: 40000, lead_time_minutes: 60, service_hours: { from: '05:00', to: '21:00' } };

    before(async () => {
      ({ server, services } = createFleetBusServer());
      await new Promise(resolve => server.listen(0, resolve));
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      saomaiDispatcher = await login('dispatcher@busgo.vn', 'disp123');
      xvDispatcher = await login('dispatcher@xuyenviet.vn', 'xv123');
      cashier = await login('cashier@busgo.vn', 'cash123');
    });

    after(() => new Promise(resolve => server.close(resolve)));

    it('passengers read the modes and active areas of their company only', async () => {
      const sm = await request('/api/v1/service-config', { code: 'SAOMAI' });
      assert.strictEqual(sm.status, 200);
      assert.deepStrictEqual(sm.body.data.pickup_modes, ['FIXED_STOP', 'HOME_PICKUP']);
      assert.strictEqual(sm.body.data.service_areas.length, 2);
      const xv = await request('/api/v1/service-config', { code: 'XUYENVIET' });
      assert.deepStrictEqual(xv.body.data.pickup_modes, ['FIXED_STOP']);
      assert.strictEqual(xv.body.data.service_areas.length, 0);
      const app = await request('/api/v1/app/config?operator=XUYENVIET');
      assert.ok(JSON.stringify(app.body.data).includes('"pickup_modes":["FIXED_STOP"]'));
    });

    it('checks an address over HTTP', async () => {
      const ok = await request('/api/v1/service-areas/check', { method: 'POST', code: 'SAOMAI', body: { kind: 'DROPOFF', lat: 19.8, lng: 105.78 } });
      assert.strictEqual(ok.status, 200);
      assert.deepStrictEqual({ ...ok.body.data }, { serviceable: true, area_id: 'sa_saomai_th', area_name: 'TP Thanh Hóa', fee_vnd: 30000 });
      const out = await request('/api/v1/service-areas/check', { method: 'POST', code: 'SAOMAI', body: { kind: 'PICKUP', ...HAI_PHONG } });
      assert.strictEqual(out.status, 422);
      assert.strictEqual(out.body.code, 'OUTSIDE_SERVICE_AREA');
      const disabled = await request('/api/v1/service-areas/check', { method: 'POST', code: 'XUYENVIET', body: { kind: 'PICKUP', ...GIAP_BAT } });
      assert.strictEqual(disabled.body.code, 'MODE_DISABLED');
      const demoTrip = await request('/api/v1/service-areas/check', { method: 'POST', code: 'SAOMAI', body: { kind: 'PICKUP', ...GIAP_BAT, trip_id: 'trp_hn_th_01' } });
      assert.strictEqual(demoTrip.status, 200, 'outside production a past seed trip is checked as if booked the day before');
      const foreignTrip = await request('/api/v1/service-areas/check', { method: 'POST', code: 'XUYENVIET', body: { kind: 'PICKUP', ...GIAP_BAT, trip_id: 'trp_hn_th_01' } });
      assert.strictEqual(foreignTrip.status, 404);
    });

    it('an office turns on home pickup and adds an area for its own company only', async () => {
      const put = await request('/api/v1/ops/service-config', { method: 'PUT', token: xvDispatcher, body: { pickup_modes: ['FIXED_STOP', 'HOME_PICKUP'] } });
      assert.strictEqual(put.status, 200, JSON.stringify(put.body));
      const created = await request('/api/v1/ops/service-areas', { method: 'POST', token: xvDispatcher, body: AREA });
      assert.strictEqual(created.status, 201, JSON.stringify(created.body));
      assert.match(created.body.data.area_id, /^sa_/);

      const xv = await request('/api/v1/service-areas/check', { method: 'POST', code: 'XUYENVIET', body: { kind: 'PICKUP', lat: 21.03, lng: 105.85 } });
      assert.strictEqual(xv.status, 200);
      assert.strictEqual(xv.body.data.fee_vnd, 40000);
      const sm = await request('/api/v1/service-config', { code: 'SAOMAI' });
      assert.ok(!sm.body.data.service_areas.some(a => a.name === 'Phố cổ'), 'Sao Mai is unchanged');

      const foreign = await request(`/api/v1/ops/service-areas/${created.body.data.area_id}/deactivate`, { method: 'POST', token: saomaiDispatcher });
      assert.strictEqual(foreign.status, 404);
      assert.strictEqual(foreign.body.code, 'AREA_NOT_FOUND');

      const patched = await request(`/api/v1/ops/service-areas/${created.body.data.area_id}`, { method: 'PATCH', token: xvDispatcher, body: { fee_vnd: 45000 } });
      assert.strictEqual(patched.body.data.fee_vnd, 45000);
      const off = await request(`/api/v1/ops/service-areas/${created.body.data.area_id}/deactivate`, { method: 'POST', token: xvDispatcher });
      assert.strictEqual(off.body.data.active, false);
      const after = await request('/api/v1/service-areas/check', { method: 'POST', code: 'XUYENVIET', body: { kind: 'PICKUP', lat: 21.03, lng: 105.85 } });
      assert.strictEqual(after.body.code, 'OUTSIDE_SERVICE_AREA', 'an inactive area serves nobody');

      const actions = services.managerService.auditLog.filter(a => a.operator_id === 'op_xuyenviet').map(a => a.action);
      for (const action of ['SERVICE_CONFIG_UPDATE', 'SERVICE_AREA_CREATE', 'SERVICE_AREA_UPDATE', 'SERVICE_AREA_DEACTIVATE']) assert.ok(actions.includes(action), action);
      const update = services.managerService.auditLog.find(a => a.action === 'SERVICE_CONFIG_UPDATE');
      assert.deepStrictEqual(update.before.pickup_modes, ['FIXED_STOP']);
      assert.deepStrictEqual(update.after.pickup_modes, ['FIXED_STOP', 'HOME_PICKUP']);
    });

    it('each route has a stop style and modes: the company default, or its own (null goes back to the default)', async () => {
      const sm = await request('/api/v1/trips/search?origin=Hà Nội&destination=Thanh Hóa', { code: 'SAOMAI' });
      const trip = sm.body.data.find(t => t.trip_id === 'trp_hn_th_01');
      assert.strictEqual(trip.route_id, 'rt_hn_th', 'catalog and ops share route ids');
      assert.deepStrictEqual(trip.service, { route_id: 'rt_hn_th', stop_style: 'ROUTE_LINE', pickup_modes: ['FIXED_STOP', 'HOME_PICKUP'], dropoff_modes: ['FIXED_LOCATION', 'HOME_DROPOFF'], allow_home_to_home: true });
      assert.ok(trip.stops.every(s => ['STATION', 'ROADSIDE'].includes(s.kind)));
      const xv = await request('/api/v1/trips/trp_xv_hn_th_01', { code: 'XUYENVIET' });
      assert.strictEqual(xv.body.data.service.stop_style, 'STATIONS');

      const list = await request('/api/v1/ops/service-config/routes', { token: saomaiDispatcher });
      assert.ok(list.body.data.routes.some(r => r.route_id === 'rt_hn_th' && r.stop_style === 'ROUTE_LINE'));
      assert.ok(list.body.data.routes.every(r => r.route_id !== 'rt_xv_hn_th'), 'only the company\'s routes');

      const own = await request('/api/v1/ops/service-config/routes/rt_hn_th', { method: 'PUT', token: saomaiDispatcher, body: { stop_style: 'STATIONS', pickup_modes: ['FIXED_STOP'] } });
      assert.strictEqual(own.status, 200, JSON.stringify(own.body));
      const detail = await request('/api/v1/trips/trp_hn_th_01', { code: 'SAOMAI' });
      assert.strictEqual(detail.body.data.service.stop_style, 'STATIONS');
      assert.deepStrictEqual(detail.body.data.service.pickup_modes, ['FIXED_STOP']);
      assert.deepStrictEqual(detail.body.data.service.dropoff_modes, ['FIXED_LOCATION', 'HOME_DROPOFF'], 'not set on the route: the company value');
      const check = await request('/api/v1/service-areas/check', { method: 'POST', code: 'SAOMAI', body: { kind: 'PICKUP', ...GIAP_BAT, trip_id: 'trp_hn_th_01' } });
      assert.strictEqual(check.body.code, 'MODE_DISABLED', 'the route no longer picks up at home');
      const elsewhere = await request('/api/v1/service-areas/check', { method: 'POST', code: 'SAOMAI', body: { kind: 'PICKUP', ...GIAP_BAT } });
      assert.strictEqual(elsewhere.status, 200, 'the company default is unchanged');

      const back = await request('/api/v1/ops/service-config/routes/rt_hn_th', { method: 'PUT', token: saomaiDispatcher, body: { stop_style: null, pickup_modes: null } });
      assert.deepStrictEqual(back.body.data.own, {});
      assert.strictEqual((await request('/api/v1/trips/trp_hn_th_01', { code: 'SAOMAI' })).body.data.service.stop_style, 'ROUTE_LINE');

      assert.strictEqual((await request('/api/v1/ops/service-config/routes/rt_xv_hn_th', { method: 'PUT', token: saomaiDispatcher, body: { stop_style: 'STATIONS' } })).status, 404);
      assert.strictEqual((await request('/api/v1/ops/service-config/routes/rt_hn_th', { method: 'PUT', token: saomaiDispatcher, body: { stop_style: 'METRO' } })).status, 400);
      assert.strictEqual((await request('/api/v1/ops/service-config/routes/rt_hn_th', { method: 'PUT', token: saomaiDispatcher, body: { fee: 1 } })).status, 400);
      assert.ok(services.managerService.auditLog.some(a => a.action === 'ROUTE_SERVICE_UPDATE' && a.resource === 'rt_hn_th'));
    });

    it('refuses invalid changes and other roles', async () => {
      const bad = await request('/api/v1/ops/service-areas', { method: 'POST', token: saomaiDispatcher, body: { ...AREA, polygon: [[21, 105]] } });
      assert.strictEqual(bad.status, 400);
      const empty = await request('/api/v1/ops/service-config', { method: 'PUT', token: saomaiDispatcher, body: { pickup_modes: [] } });
      assert.strictEqual(empty.status, 400);
      const unknown = await request('/api/v1/ops/service-config', { method: 'PUT', token: saomaiDispatcher, body: { dropoff_modes: ['TELEPORT'] } });
      assert.strictEqual(unknown.status, 400);
      const role = await request('/api/v1/ops/service-config', { token: cashier });
      assert.strictEqual(role.status, 403);
      const noKey = await fetch(`${baseUrl}/api/v1/ops/service-areas`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${saomaiDispatcher}` }, body: JSON.stringify(AREA) });
      assert.strictEqual(noKey.status, 400, 'creating an area needs an Idempotency-Key');
    });
  });
});
