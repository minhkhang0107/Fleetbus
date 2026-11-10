import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { createFleetBusServer } from '../../source/server/apiServer.js';
import { addDays, vnDate, runId } from '../../source/server/core/serviceDate.js';
import { getScheduleTemplate, runsOn } from '../../source/server/services/passenger/modules/search.js';

describe('Driver today trips lazy run materialization (DRI-002)', () => {
  let server;
  let services;
  let baseUrl;
  let driverToken;

  const request = async (path, { method = 'GET', body, token } = {}) => {
    const headers = { 'Content-Type': 'application/json', 'X-Operator-Code': 'SAOMAI' };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (method === 'POST') headers['Idempotency-Key'] = crypto.randomUUID();
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    return { status: res.status, body: await res.json() };
  };

  before(async () => {
    ({ server, services } = createFleetBusServer());
    await new Promise(resolve => server.listen(0, resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    // Fresh server: log in driver TX8821 PIN 123456
    const loginRes = await request('/api/v1/driver/auth/login', {
      method: 'POST',
      body: { staffIdOrPhone: 'TX8821', pin: '123456' }
    });
    assert.strictEqual(loginRes.status, 200);
    driverToken = loginRes.body.data.token;
    assert.ok(driverToken, 'driver login returns a token');
  });

  after(() => new Promise(resolve => server.close(resolve)));

  it('TC-DRV-TODAY-01: fresh server materializes today runs so driver TX8821 sees scheduled trip without dispatch board or search', async () => {
    const today = vnDate();
    const template = getScheduleTemplate('trp_hn_th_01');
    assert.ok(template, 'trp_hn_th_01 schedule template exists in seed');
    assert.ok(runsOn(template, today), 'schedule trp_hn_th_01 runs today per seed');

    const defaultDriverTrip = services.driverService.tripTemplates.get('trp_hn_th_01');
    assert.strictEqual(defaultDriverTrip?.driver_id, 'drv_8821a', 'trp_hn_th_01 default driver is drv_8821a (TX8821)');

    // Call GET /api/v1/driver/trips/today WITHOUT touching dispatch board or search
    const res = await request('/api/v1/driver/trips/today', { token: driverToken });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.status, 'success');

    const expectedTripId = runId('trp_hn_th_01', today);
    const trips = res.body.data?.trips || [];
    const tripIds = trips.map(t => t.trip_id);

    assert.ok(
      tripIds.includes(expectedTripId),
      `expected ${expectedTripId} to be in data.trips, got: ${JSON.stringify(tripIds)}`
    );

    const trip = trips.find(t => t.trip_id === expectedTripId);
    assert.strictEqual(trip.driver_id, 'drv_8821a');
  });

  it('TC-DRV-TODAY-02: tomorrow run is also materialized in activeTrips for upcoming trip window', () => {
    const today = vnDate();
    const tomorrow = addDays(today, 1);
    const expectedTomorrowTripId = runId('trp_hn_th_01', tomorrow);

    assert.ok(
      services.driverService.activeTrips.has(expectedTomorrowTripId),
      `expected tomorrow run ${expectedTomorrowTripId} to be materialized in activeTrips`
    );
  });

  it("TC-DRV-TODAY-04: the monthly schedule lists the runs of the schedule's default driver before the office assigns anything (D194)", async () => {
    const fresh = createFleetBusServer();
    await new Promise(resolve => fresh.server.listen(0, resolve));
    try {
      const url = `http://127.0.0.1:${fresh.server.address().port}`;
      const headers = { 'Content-Type': 'application/json', 'X-Operator-Code': 'SAOMAI' };
      const login = await (await fetch(`${url}/api/v1/driver/auth/login`, { method: 'POST', headers, body: JSON.stringify({ staffIdOrPhone: 'TX8821', pin: '123456' }) })).json();
      const res = await (await fetch(`${url}/api/v1/driver/schedule`, { headers: { ...headers, Authorization: `Bearer ${login.data.token}` } })).json();
      const today = vnDate();
      const ids = res.data.days.flatMap(d => d.trips.map(t => t.trip_id));
      assert.ok(ids.includes(runId('trp_hn_th_01', today)), `today's run missing from ${JSON.stringify(ids)}`);
    } finally {
      await new Promise(resolve => fresh.server.close(resolve));
    }
  });

  it('TC-DRV-TODAY-03: route guards and never throws even if eventBridge is missing', async () => {
    const originalEventBridge = services.eventBridge;
    try {
      services.eventBridge = undefined;
      const res = await request('/api/v1/driver/trips/today', { token: driverToken });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.status, 'success');
    } finally {
      services.eventBridge = originalEventBridge;
    }
  });
});
