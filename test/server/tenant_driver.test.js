import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createFleetBusServer } from '../../source/server/apiServer.js';
import { verifyToken } from '../../source/server/core/tokens.js';

describe('Tenant Driver API', () => {
  it('XUYENVIET driver logs in with correct operator code, gets proper token and only their trips', async () => {
    const { server } = createFleetBusServer();
    await new Promise(r => server.listen(0, r));
    const port = server.address().port;
    const url = `http://localhost:${port}`;

    try {
      const loginRes = await fetch(`${url}/api/v1/driver/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Operator-Code': 'XUYENVIET' },
        body: JSON.stringify({ staffIdOrPhone: 'TX7701', pin: '246810' })
      });
      const loginData = await loginRes.json();

      assert.strictEqual(loginRes.status, 200);
      assert.strictEqual(loginData.status, 'success');
      assert.strictEqual(loginData.data.operator.code, 'XUYENVIET');
      
      const token = loginData.data.token;
      const { payload } = verifyToken(token);
      assert.strictEqual(payload.operator_id, 'op_xuyenviet');
      assert.strictEqual(payload.sub, 'drv_xv_7701');

      const tripsRes = await fetch(`${url}/api/v1/driver/trips/today`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}`, 'X-Operator-Code': 'XUYENVIET' }
      });
      const tripsData = await tripsRes.json();
      
      assert.strictEqual(tripsRes.status, 200);
      assert.strictEqual(tripsData.status, 'success');
      assert.strictEqual(tripsData.data.trips.length, 1);
      assert.strictEqual(tripsData.data.trips[0].trip_id, 'trp_xv_hn_th_01');
      assert.ok(tripsData.data.trips[0].stops[0].lat !== undefined);
      assert.ok(tripsData.data.trips[0].route_shape !== undefined);
    } finally {
      server.close();
    }
  });

  it('XUYENVIET driver fails to login with SAOMAI or missing code', async () => {
    const { server } = createFleetBusServer();
    await new Promise(r => server.listen(0, r));
    const port = server.address().port;
    const url = `http://localhost:${port}`;

    try {
      const loginRes1 = await fetch(`${url}/api/v1/driver/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffIdOrPhone: 'TX7701', pin: '246810' })
      });
      const data1 = await loginRes1.json();
      assert.strictEqual(loginRes1.status, 401);
      assert.strictEqual(data1.code, 'INVALID_CREDENTIALS');

      const loginRes2 = await fetch(`${url}/api/v1/driver/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Operator-Code': 'SAOMAI' },
        body: JSON.stringify({ staffIdOrPhone: 'TX7701', pin: '246810' })
      });
      const data2 = await loginRes2.json();
      assert.strictEqual(loginRes2.status, 401);
      assert.strictEqual(data2.code, 'INVALID_CREDENTIALS');
    } finally {
      server.close();
    }
  });

  it('SAOMAI driver fails to login with XUYENVIET code', async () => {
    const { server } = createFleetBusServer();
    await new Promise(r => server.listen(0, r));
    const port = server.address().port;
    const url = `http://localhost:${port}`;

    try {
      const loginRes = await fetch(`${url}/api/v1/driver/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Operator-Code': 'XUYENVIET' },
        body: JSON.stringify({ staffIdOrPhone: 'TX8821', pin: '123456' })
      });
      const data = await loginRes.json();
      assert.strictEqual(loginRes.status, 401);
      assert.strictEqual(data.code, 'INVALID_CREDENTIALS');
    } finally {
      server.close();
    }
  });

  it('SAOMAI driver succeeds with SAOMAI code and does not see XUYENVIET trips', async () => {
    const { server } = createFleetBusServer();
    await new Promise(r => server.listen(0, r));
    const port = server.address().port;
    const url = `http://localhost:${port}`;

    try {
      const loginRes = await fetch(`${url}/api/v1/driver/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Operator-Code': 'SAOMAI' },
        body: JSON.stringify({ staffIdOrPhone: 'TX8821', pin: '123456' })
      });
      const data = await loginRes.json();
      assert.strictEqual(loginRes.status, 200);
      const token = data.data.token;
      assert.strictEqual(data.data.operator.code, 'SAOMAI');
      
      const tripsRes = await fetch(`${url}/api/v1/driver/trips/today`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}`, 'X-Operator-Code': 'SAOMAI' }
      });
      const tripsData = await tripsRes.json();
      
      assert.strictEqual(tripsRes.status, 200);
      assert.strictEqual(tripsData.status, 'success');
      const tripIds = tripsData.data.trips.map(t => t.trip_id);
      assert.ok(!tripIds.includes('trp_xv_hn_th_01'));
    } finally {
      server.close();
    }
  });

  it('XUYENVIET driver token on SAOMAI trip is refused', async () => {
    const { server } = createFleetBusServer();
    await new Promise(r => server.listen(0, r));
    const port = server.address().port;
    const url = `http://localhost:${port}`;

    try {
      const loginRes = await fetch(`${url}/api/v1/driver/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Operator-Code': 'XUYENVIET' },
        body: JSON.stringify({ staffIdOrPhone: 'TX7701', pin: '246810' })
      });
      const data = await loginRes.json();
      assert.strictEqual(loginRes.status, 200);
      const token = data.data.token;

      const tripRes = await fetch(`${url}/api/v1/driver/trips/trp_hn_th_01`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}`, 'X-Operator-Code': 'XUYENVIET' }
      });
      
      assert.ok(tripRes.status === 403 || tripRes.status === 404);
    } finally {
      server.close();
    }
  });
});
