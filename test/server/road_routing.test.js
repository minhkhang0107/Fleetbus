import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { createFleetBusServer } from '../../source/server/apiServer.js';
import { setRoadRouter, roadPath, simplifyLine, osrmRouter } from '../../source/server/core/roadRouting.js';
import { routeShape } from '../../source/server/core/geo.js';

// A fake router: a bend half way between each pair of points, so the road is not the straight line.
const bendRouter = async (points) => {
  const shape = [];
  points.forEach((p, i) => {
    shape.push(p);
    const n = points[i + 1];
    if (n) shape.push([(p[0] + n[0]) / 2 + 0.05, (p[1] + n[1]) / 2 + 0.05]);
  });
  return { shape, distance_m: 160000, duration_s: 3 * 3600 + 600 };
};

describe('Road geometry for routes companies draw (D201)', () => {
  describe('roadPath and simplifyLine', () => {
    after(() => setRoadRouter(null));

    it('is off without a router and gives up on a failing or absurd router', async () => {
      setRoadRouter(null);
      assert.strictEqual(await roadPath([[21, 105.8], [20.8, 105.9]]), null);
      setRoadRouter(async () => { throw new Error('down'); });
      assert.strictEqual(await roadPath([[21, 105.8], [20.8, 105.9]]), null);
      setRoadRouter(async (pts) => ({ shape: pts, distance_m: 500000, duration_s: 100 }));
      assert.strictEqual(await roadPath([[21, 105.8], [20.8, 105.9]]), null, '500 km for a 24 km hop is not that road');
    });

    it('returns the simplified road with km and minutes', async () => {
      setRoadRouter(bendRouter);
      const road = await roadPath([[21.0, 105.84], [20.5, 105.9], [19.8, 105.78]]);
      assert.strictEqual(road.distance_km, 160);
      assert.strictEqual(road.duration_minutes, 190);
      assert.strictEqual(road.shape.length, 5);
    });

    it('simplifyLine drops points that sit on the line', () => {
      const line = [[21, 105], [20.9, 105], [20.8, 105], [20.7, 105.05], [20.6, 105]];
      assert.deepStrictEqual(simplifyLine(line), [[21, 105], [20.8, 105], [20.7, 105.05], [20.6, 105]]);
    });

    it('osrmRouter reads an OSRM answer', async () => {
      let asked = null;
      const fetchImpl = async (url) => {
        asked = url;
        return { ok: true, json: async () => ({ code: 'Ok', routes: [{ distance: 1000, duration: 120, geometry: { coordinates: [[105.8, 21], [105.81, 20.99]] } }] }) };
      };
      const result = await osrmRouter('https://osrm.example/', { fetchImpl })([[21, 105.8], [20.99, 105.81]]);
      assert.strictEqual(asked, 'https://osrm.example/route/v1/driving/105.80000,21.00000;105.81000,20.99000?overview=full&geometries=geojson');
      assert.deepStrictEqual(result.shape, [[21, 105.8], [20.99, 105.81]]);
    });
  });

  describe('ops endpoints', () => {
    let server;
    let services;
    let baseUrl;
    let token;

    const request = async (path, { method = 'GET', body } = {}) => {
      const headers = { 'Content-Type': 'application/json', 'X-Operator-Code': 'SAOMAI', Authorization: `Bearer ${token}` };
      if (method === 'POST') headers['Idempotency-Key'] = crypto.randomUUID();
      const res = await fetch(`${baseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
      return { status: res.status, body: await res.json() };
    };

    before(async () => {
      ({ server, services } = createFleetBusServer());
      await new Promise(resolve => server.listen(0, resolve));
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      const login = await fetch(`${baseUrl}/api/v1/ops/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Operator-Code': 'SAOMAI', 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify({ username: 'dispatcher@busgo.vn', password: 'disp123' })
      });
      token = (await login.json()).data.token;
    });

    after(() => {
      setRoadRouter(null);
      return new Promise(resolve => server.close(resolve));
    });

    it('road-preview says OFF without a router and returns the road with one', async () => {
      setRoadRouter(null);
      const off = await request('/api/v1/ops/routes/road-preview', { method: 'POST', body: { points: [[21, 105.84], [19.8, 105.78]] } });
      assert.strictEqual(off.status, 200, JSON.stringify(off.body));
      assert.strictEqual(off.body.data.source, 'OFF');
      assert.strictEqual(off.body.data.shape, null);

      const bad = await request('/api/v1/ops/routes/road-preview', { method: 'POST', body: { points: [[21, 105.84]] } });
      assert.strictEqual(bad.status, 400);

      setRoadRouter(bendRouter);
      const on = await request('/api/v1/ops/routes/road-preview', { method: 'POST', body: { points: [[21, 105.84], [19.8, 105.78]] } });
      assert.strictEqual(on.body.data.source, 'ROAD');
      assert.strictEqual(on.body.data.shape.length, 3);
      assert.strictEqual(on.body.data.distance_km, 160);
    });

    it('a new route keeps the road, and the route list returns it', async () => {
      setRoadRouter(bendRouter);
      const stations = (await request('/api/v1/ops/stations')).body.data;
      const a = stations.find(s => s.name.includes('Giáp Bát'));
      const b = stations.find(s => s.name.includes('Phía Bắc Thanh Hóa'));
      const res = await request('/api/v1/ops/routes', {
        method: 'POST',
        body: {
          name: 'Giáp Bát — Thanh Hóa (đường bộ)',
          stops: [{ stop_id: a.station_id, pickup_allowed: true, dropoff_allowed: false }, { stop_id: b.station_id, pickup_allowed: false, dropoff_allowed: true }],
          schedule: { departure: '05:00', duration_minutes: 190, base_fare_vnd: 200000, vehicle_type: 'DOUBLE_DECK_VIP_CABIN', total_seats: 22 }
        }
      });
      assert.strictEqual(res.status, 201, JSON.stringify(res.body));
      assert.strictEqual(res.body.data.road_shape, true);
      const routeId = res.body.data.route_id;
      const template = services.searchService.templateForRoute(routeId, 'op_saomai');
      assert.strictEqual(template.road_shape.length, 3, 'kept on the schedule, so it survives a restart');
      assert.deepStrictEqual(routeShape(template.trip_id), template.road_shape);

      const list = await request('/api/v1/ops/service-config/routes');
      const route = (list.body.data.routes || list.body.data).find(r => r.route_id === routeId);
      assert.strictEqual(route.shape.length, 3);
    });

    it('road-shape finds the road again for a route drawn as straight lines', async () => {
      setRoadRouter(null);
      const stations = (await request('/api/v1/ops/stations')).body.data;
      const a = stations.find(s => s.name.includes('Mỹ Đình'));
      const b = stations.find(s => s.name.includes('Ninh Bình'));
      const created = await request('/api/v1/ops/routes', {
        method: 'POST',
        body: {
          name: 'Mỹ Đình — Ninh Bình (thẳng)',
          stops: [{ stop_id: a.station_id, pickup_allowed: true, dropoff_allowed: false }, { stop_id: b.station_id, pickup_allowed: false, dropoff_allowed: true }],
          schedule: { departure: '05:30', duration_minutes: 120, base_fare_vnd: 120000, vehicle_type: 'DOUBLE_DECK_VIP_CABIN', total_seats: 22 }
        }
      });
      assert.strictEqual(created.body.data.road_shape, false);
      const routeId = created.body.data.route_id;

      const down = await request(`/api/v1/ops/routes/${routeId}/road-shape`, { method: 'POST' });
      assert.strictEqual(down.status, 503);
      assert.strictEqual(down.body.code, 'ROAD_UNAVAILABLE');

      setRoadRouter(bendRouter);
      const ok = await request(`/api/v1/ops/routes/${routeId}/road-shape`, { method: 'POST' });
      assert.strictEqual(ok.status, 200, JSON.stringify(ok.body));
      assert.strictEqual(services.searchService.routeLine(routeId, 'op_saomai').length, 3);
      assert.ok(services.managerService.auditLog.some(e => e.action === 'ROUTE_ROAD_UPDATE' && e.resource === routeId));

      const missing = await request('/api/v1/ops/routes/rt_nope/road-shape', { method: 'POST' });
      assert.strictEqual(missing.status, 404);
    });
  });
});
