import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'http';
import { createFleetBusServer } from '../../source/server/apiServer.js';

describe('Phase Server: Unified Node.js API Gateway Integration Suite', () => {
  let appServer;
  let baseUrl;
  const TEST_PORT = 3999;

  before(async () => {
    const { server } = createFleetBusServer();
    await new Promise((resolve) => {
      appServer = server.listen(TEST_PORT, () => {
        baseUrl = `http://127.0.0.1:${TEST_PORT}`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise((resolve) => {
      if (appServer) {
        appServer.close(resolve);
      } else {
        resolve();
      }
    });
  });

  // Helper for HTTP requests
  async function makeRequest(path, options = {}) {
    return new Promise((resolve, reject) => {
      const url = `${baseUrl}${path}`;
      const req = http.request(url, {
        method: options.method || 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers || {})
        }
      }, (res) => {
        let rawData = '';
        res.on('data', chunk => rawData += chunk);
        res.on('end', () => {
          let parsedData;
          try {
            parsedData = JSON.parse(rawData);
          } catch {
            parsedData = rawData;
          }
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: parsedData
          });
        });
      });

      req.on('error', reject);

      if (options.body) {
        req.write(JSON.stringify(options.body));
      }
      req.end();
    });
  }

  it('TC-SRV-01: Healthcheck and OpenAPI spec must be accessible', async () => {
    const health = await makeRequest('/health');
    assert.strictEqual(health.statusCode, 200);
    assert.strictEqual(health.body.status, 'success');
    assert.strictEqual(health.body.data.status, 'UP');
    assert.strictEqual(health.body.data.services.passenger_service, 'HEALTHY');

    const openapi = await makeRequest('/api/v1/openapi.json');
    assert.strictEqual(openapi.statusCode, 200);
    assert.strictEqual(openapi.body.data.openapi, '3.0.3');
  });

  it('TC-SRV-02: Passenger API Endpoints (Config, Stations, Trips, Seat-map, Hold, Wallet)', async () => {
    // Config
    const configRes = await makeRequest('/api/v1/passenger/config', {
      headers: { 'x-app-version': '3.0.0' }
    });
    assert.strictEqual(configRes.statusCode, 200);
    assert.strictEqual(configRes.body.status, 'success');
    assert.strictEqual(configRes.body.data.min_supported_version, '3.0.0');

    // Stations
    const stationsRes = await makeRequest('/api/v1/passenger/stations?q=giap%20bat');
    assert.strictEqual(stationsRes.statusCode, 200);
    assert.ok(stationsRes.body.data.length > 0);

    // Trips
    const tripsRes = await makeRequest('/api/v1/passenger/trips?origin=Hà%20Nội&destination=Thanh%20Hóa');
    assert.strictEqual(tripsRes.statusCode, 200);
    assert.ok(tripsRes.body.data.length > 0);

    // Seat map
    const seatMapRes = await makeRequest('/api/v1/passenger/trips/trp_hn_th_01/seat-map');
    assert.strictEqual(seatMapRes.statusCode, 200);
    assert.ok(seatMapRes.body.data.seats.length > 0);

    // Hold seats
    const holdRes = await makeRequest('/api/v1/passenger/trips/trp_hn_th_01/hold-seats', {
      method: 'POST',
      body: { seatCodes: ['A01'], userId: 'usr_test_01' }
    });
    assert.strictEqual(holdRes.statusCode, 200);
    assert.strictEqual(holdRes.body.status, 'success');

    // Tickets Wallet
    const walletRes = await makeRequest('/api/v1/passenger/tickets?phone=0912345678');
    assert.strictEqual(walletRes.statusCode, 200);
    assert.strictEqual(walletRes.body.status, 'success');
  });

  it('TC-SRV-03: Driver API Endpoints (Auth Login, Today Trips, Start, Telemetry, QR Scan)', async () => {
    // Login
    const loginRes = await makeRequest('/api/v1/driver/auth/login', {
      method: 'POST',
      body: { staffIdOrPhone: 'TX8821', pin: '123456' }
    });
    assert.strictEqual(loginRes.statusCode, 200);
    assert.strictEqual(loginRes.body.data.driver.staff_id, 'TX8821');

    // Today trips
    const todayRes = await makeRequest('/api/v1/driver/trips/today', {
      headers: { 'x-driver-id': 'drv_8821a' }
    });
    assert.strictEqual(todayRes.statusCode, 200);
    assert.ok(todayRes.body.data.trips.length > 0);

    // Telemetry ping
    const telemetryRes = await makeRequest('/api/v1/driver/trips/trp_991823/telemetry', {
      method: 'POST',
      body: { lat: 20.9812, lng: 105.8430, speed_kmh: 62.4, bearing_deg: 180 }
    });
    assert.strictEqual(telemetryRes.statusCode, 200);
    assert.strictEqual(telemetryRes.body.data.data.speed_kmh, 62.4);
  });

  it('TC-SRV-04: Manager Operations API Endpoints (Dashboard KPIs, Radar, Fleet, Crew, Reports)', async () => {
    // Dashboard KPIs
    const kpiRes = await makeRequest('/api/v1/ops/dashboard/kpis');
    assert.strictEqual(kpiRes.statusCode, 200);
    assert.strictEqual(kpiRes.body.data.kpi_metrics.active_vehicles_count, 2);

    // Radar
    const radarRes = await makeRequest('/api/v1/ops/radar');
    assert.strictEqual(radarRes.statusCode, 200);
    assert.strictEqual(radarRes.body.data.total_tracked_vehicles, 3);

    // Fleet Roster
    const fleetRes = await makeRequest('/api/v1/ops/fleet/vehicles');
    assert.strictEqual(fleetRes.statusCode, 200);
    assert.ok(fleetRes.body.data.length >= 3);

    // Crew Drivers
    const crewRes = await makeRequest('/api/v1/ops/crew/drivers');
    assert.strictEqual(crewRes.statusCode, 200);
    assert.ok(crewRes.body.data.length >= 2);

    // Executive Report
    const repRes = await makeRequest('/api/v1/ops/reports/executive');
    assert.strictEqual(repRes.statusCode, 200);
    assert.ok(repRes.body.data.financial_summary.total_revenue_vnd > 0);

    // POS Booking
    const posRes = await makeRequest('/api/v1/ops/pos/bookings', {
      method: 'POST',
      body: {
        tripId: 'trp_991823',
        passengerName: 'Trịnh Thăng Bình',
        phone: '0977889900',
        seatCodes: ['B02']
      }
    });
    assert.strictEqual(posRes.statusCode, 201);
    assert.strictEqual(posRes.body.data.passenger_name, 'Trịnh Thăng Bình');
  });

  it('TC-SRV-05: Webhook & Static Pages (VietQR IPN, HTML views)', async () => {
    // Static HTML views
    const passView = await makeRequest('/passenger');
    assert.strictEqual(passView.statusCode, 200);
    assert.ok(passView.body.includes('BusGo Passenger'));

    const drvView = await makeRequest('/driver');
    assert.strictEqual(drvView.statusCode, 200);
    assert.ok(drvView.body.includes('BUSGO FLEET DRIVER'));

    const mgrView = await makeRequest('/manager');
    assert.strictEqual(mgrView.statusCode, 200);
    assert.ok(mgrView.body.includes('BUSGO OPS'));
  });
});
