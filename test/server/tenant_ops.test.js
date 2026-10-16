import test from 'node:test';
import assert from 'node:assert';
import { createFleetBusServer } from '../../source/server/apiServer.js';

test('Tenant Operations and Scope Isolation', async (t) => {
  const { server, services } = createFleetBusServer();
  
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}/api/v1`;

  const request = async (method, path, token = null, body = null) => {
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (body) {
      headers['content-type'] = 'application/json';
      headers['Idempotency-Key'] = `test-${Math.random()}`;
    }
    
    const opts = { method, headers };
    if (body) opts.body = JSON.stringify(body);
    
    const res = await fetch(`${baseUrl}${path}`, opts);
    const data = await res.json().catch(() => null);
    return { status: res.status, data };
  };

  let tokenXV = null;
  let tokenSM = null;

  await t.test('dispatcher@xuyenviet.vn logs in', async () => {
    const res = await request('POST', '/ops/auth/login', null, {
      username: 'dispatcher@xuyenviet.vn',
      password: 'xv123'
    });
    if (res.status !== 200) console.log("DELAY ERROR:", res.data); assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.data.user.user_id, 'mgr_xv_01');
    assert.strictEqual(res.data.data.operator.operator_id, 'op_xuyenviet');
    tokenXV = res.data.data.token;
  });

  await t.test('dispatcher@busgo.vn logs in (SAOMAI)', async () => {
    const res = await request('POST', '/ops/auth/login', null, {
      username: 'dispatcher@busgo.vn',
      password: 'disp123'
    });
    if (res.status !== 200) console.log("DELAY ERROR:", res.data); assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.data.operator.operator_id, 'op_saomai');
    tokenSM = res.data.data.token;
  });

  await t.test('dispatch board shows only trp_xv_hn_th_01 for Xuyen Viet', async () => {
    const res = await request('GET', '/ops/dispatch/board', tokenXV);
    if (res.status !== 200) console.log("DELAY ERROR:", res.data); assert.strictEqual(res.status, 200);
    const trips = res.data.data.trips;
    assert.ok(trips.every(t => t.operator_id === 'op_xuyenviet'));
    assert.ok(trips.some(t => t.trip_id === 'trp_xv_hn_th_01'));
    assert.ok(!trips.some(t => t.trip_id === 'trp_hn_th_01'));
  });

  await t.test('radar only shows 30H-246.80 for Xuyen Viet', async () => {
    const res = await request('GET', '/ops/radar', tokenXV);
    if (res.status !== 200) console.log("DELAY ERROR:", res.data); assert.strictEqual(res.status, 200);
    const vehicles = res.data.data.vehicles;
    assert.ok(vehicles.length > 0);
    assert.ok(vehicles.every(v => v.plate_number === '30H-246.80'));
  });

  await t.test('crew only shows TX7701 for Xuyen Viet', async () => {
    const res = await request('GET', '/ops/crew', tokenXV);
    if (res.status !== 200) console.log("DELAY ERROR:", res.data); assert.strictEqual(res.status, 200);
    const crew = res.data.data;
    assert.ok(crew.length > 0);
    assert.ok(crew.every(d => d.staff_id === 'TX7701'));
  });

  await t.test('GET /api/v1/ops/trips/trp_hn_th_01 -> 404 for Xuyen Viet', async () => {
    const res = await request('GET', '/ops/trips/trp_hn_th_01', tokenXV);
    assert.strictEqual(res.status, 404);
  });

  await t.test('delay on trp_hn_th_01 -> 404 for Xuyen Viet', async () => {
    const res = await request('POST', '/ops/trips/trp_hn_th_01/delay', tokenXV, {
      delay_minutes: 20,
      reason: 'Traffic'
    });
    assert.strictEqual(res.status, 404);
    
    // verify nothing changed
    const trip = services.managerService.findTrip('trp_hn_th_01');
    assert.strictEqual(trip.delay_minutes, 0); // initial is 0
  });

  await t.test('delay on trp_xv_hn_th_01 -> OK for Xuyen Viet', async () => {
    const res = await request('POST', '/ops/trips/trp_xv_hn_th_01/delay', tokenXV, {
      delay_minutes: 20,
      reason: 'Traffic'
    });
    if (res.status !== 200) console.log("DELAY ERROR:", res.data); assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.data.delay_minutes, 20);
  });

  await t.test('SAOMAI never sees Xuyen Viet records and gets 404 on trp_xv_hn_th_01', async () => {
    const resBoard = await request('GET', '/ops/dispatch/board', tokenSM);
    assert.ok(!resBoard.data.data.trips.some(t => t.trip_id === 'trp_xv_hn_th_01'));

    const resTrip = await request('GET', '/ops/trips/trp_xv_hn_th_01', tokenSM);
    assert.strictEqual(resTrip.status, 404);
  });

  await t.test('audit logs only show own entries', async () => {
    const auditXV = services.managerService.auditLog.filter(a => a.operator_id === 'op_xuyenviet');
    assert.ok(auditXV.length > 0);
    assert.ok(auditXV.every(a => a.operator_id === 'op_xuyenviet'));
    assert.ok(auditXV.some(a => a.action === 'LOGIN' && a.resource === 'dispatcher@xuyenviet.vn'));

    const auditSM = services.managerService.auditLog.filter(a => a.operator_id === 'op_saomai');
    assert.ok(auditSM.length > 0);
    assert.ok(auditSM.every(a => a.operator_id === 'op_saomai'));
    assert.ok(!auditSM.some(a => a.operator_id === 'op_xuyenviet'));
  });

  t.after(() => {
    server.close();
  });
});
