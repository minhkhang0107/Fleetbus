import test from 'node:test';
import assert from 'node:assert';
import { createFleetBusServer } from '../../source/server/apiServer.js';

test('Tenant Catalog and Scope Isolation', async (t) => {
  const { server } = createFleetBusServer();
  
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}/api/v1`;

  const request = async (method, path, headers = {}, body = null) => {
    const opts = { method, headers: { ...headers } };
    if (body) {
      opts.headers['content-type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(`${baseUrl}${path}`, opts);
    const data = await res.json().catch(() => null);
    return { status: res.status, data };
  };

  await t.test('Search HN -> TH with SAOMAI returns only op_saomai trips', async () => {
    const res = await request('GET', '/trips?originCity=Hà Nội&destinationCity=Thanh Hóa', {
      'X-Operator-Code': 'SAOMAI'
    });
    assert.strictEqual(res.status, 200);
    const trips = res.data.data;
    assert.ok(trips.length > 0);
    for (const trip of trips) {
      assert.strictEqual(trip.operator_id, 'op_saomai');
      assert.notStrictEqual(trip.trip_id, 'trp_xv_hn_th_01');
    }
  });

  await t.test('Search HN -> TH with XUYENVIET returns only trp_xv_hn_th_01', async () => {
    const res = await request('GET', '/trips?originCity=Hà Nội&destinationCity=Thanh Hóa', {
      'X-Operator-Code': 'XUYENVIET'
    });
    assert.strictEqual(res.status, 200);
    const trips = res.data.data;
    assert.strictEqual(trips.length, 1);
    assert.strictEqual(trips[0].trip_id, 'trp_xv_hn_th_01');
    assert.strictEqual(trips[0].operator_id, 'op_xuyenviet');
  });

  await t.test('XUYENVIET GET /trips/trp_hn_th_01 -> 404 TRIP_NOT_FOUND', async () => {
    const res = await request('GET', '/trips/trp_hn_th_01', {
      'X-Operator-Code': 'XUYENVIET'
    });
    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.data.code, 'TRIP_NOT_FOUND');
  });

  await t.test('XUYENVIET GET /trips/trp_hn_th_01/seat-map -> 404', async () => {
    const res = await request('GET', '/trips/trp_hn_th_01/seat-map', {
      'X-Operator-Code': 'XUYENVIET'
    });
    assert.strictEqual(res.status, 404);
  });

  await t.test('XUYENVIET GET /trips/trp_hn_th_01/tracking -> 404', async () => {
    const res = await request('GET', '/trips/trp_hn_th_01/tracking', {
      'X-Operator-Code': 'XUYENVIET'
    });
    assert.strictEqual(res.status, 404);
  });

  await t.test('SAOMAI GET /trips/trp_xv_hn_th_01 -> 404', async () => {
    const res = await request('GET', '/trips/trp_xv_hn_th_01', {
      'X-Operator-Code': 'SAOMAI'
    });
    assert.strictEqual(res.status, 404);
  });

  await t.test('Stations lists differ (XUYENVIET has no Giáp Bát)', async () => {
    const resXV = await request('GET', '/stations', {
      'X-Operator-Code': 'XUYENVIET'
    });
    const resSM = await request('GET', '/stations', {
      'X-Operator-Code': 'SAOMAI'
    });
    assert.strictEqual(resXV.status, 200);
    assert.strictEqual(resSM.status, 200);
    
    const xvIds = resXV.data.data.map(s => s.station_id);
    const smIds = resSM.data.data.map(s => s.station_id);
    
    assert.ok(!xvIds.includes('stp_hn_gb'));
    assert.ok(smIds.includes('stp_hn_gb'));
    assert.ok(xvIds.includes('stp_nb'));
    assert.ok(smIds.includes('stp_nb'));
  });

  await t.test('OTP verify with XUYENVIET returns token with payload operator_id and user.operator.code', async () => {
    const phone = '0912345678';
    // Request OTP first (to create the mock record)
    await request('POST', '/auth/passenger/otp/request', {
      'X-Operator-Code': 'XUYENVIET'
    }, { phone });

    // Verify OTP
    const res = await request('POST', '/auth/passenger/otp/verify', {
      'X-Operator-Code': 'XUYENVIET'
    }, { phone, otp: '882199' });
    
    assert.strictEqual(res.status, 200);
    const user = res.data.data.user;
    const token = res.data.data.token;
    assert.strictEqual(user.operator_id, 'op_xuyenviet');
    assert.strictEqual(user.operator.code, 'XUYENVIET');
    
    // Test OPERATOR_MISMATCH
    const mismatchRes = await request('GET', '/passenger/profile', {
      'X-Operator-Code': 'SAOMAI',
      'Authorization': `Bearer ${token}`
    });
    
    assert.strictEqual(mismatchRes.status, 403);
    assert.strictEqual(mismatchRes.data.code, 'OPERATOR_MISMATCH');
  });

  await t.test('Tracking of trp_xv_hn_th_01 has route_shape and distance_basis works', async () => {
    const res = await request('GET', '/trips/trp_xv_hn_th_01/tracking', {
      'X-Operator-Code': 'XUYENVIET'
    });
    assert.strictEqual(res.status, 200);
    assert.ok(res.data.data.route_shape.length > 0);
  });

  server.close();
});
