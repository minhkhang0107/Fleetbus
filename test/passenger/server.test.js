import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'http';
import { server } from '../../source/passenger-app/server.js';

describe('Phase 8: End-to-End Passenger Server & API Gateway Test Suite', () => {
  const TEST_PORT = 3099;

  before((done) => {
    server.listen(TEST_PORT, done);
  });

  after((done) => {
    server.close(done);
  });

  function makeRequest(path, method = 'GET', headers = {}) {
    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: TEST_PORT,
          path,
          method,
          headers
        },
        (res) => {
          let data = '';
          res.on('data', chunk => { data += chunk; });
          res.on('end', () => {
            resolve({
              statusCode: res.statusCode,
              headers: res.headers,
              body: data
            });
          });
        }
      );
      req.on('error', reject);
      req.end();
    });
  }

  it('TC-E2E-01: Should serve high-fidelity passenger UI suite HTML on root /', async () => {
    const res = await makeRequest('/');
    assert.strictEqual(res.statusCode, 200);
    assert.ok(res.body.includes('BusGo'));
    assert.ok(res.body.includes('Geist'));
    assert.ok(res.body.includes('JetBrains Mono'));
    assert.ok(res.body.includes('2D Interactive Seat Grid') || res.body.includes('seat-grid-container'));
  });

  it('TC-E2E-02: Should respond to App Config API /api/v1/app/config', async () => {
    const res = await makeRequest('/api/v1/app/config', 'GET', { 'x-app-version': '3.0.0' });
    assert.strictEqual(res.statusCode, 200);
    const json = JSON.parse(res.body);
    assert.strictEqual(json.status, 'success');
    assert.strictEqual(json.data.min_supported_version, '3.0.0');
    assert.strictEqual(json.data.force_upgrade, false);
  });

  it('TC-E2E-03: Should respond to Stations Search API /api/v1/stations?q=giap%20bat', async () => {
    const res = await makeRequest('/api/v1/stations?q=giap%20bat');
    assert.strictEqual(res.statusCode, 200);
    const json = JSON.parse(res.body);
    assert.strictEqual(json.status, 'success');
    assert.ok(json.data.length > 0);
    assert.strictEqual(json.data[0].station_id, 'stp_hn_gb');
  });

  it('TC-E2E-04: Should respond to Trip Search API /api/v1/trips', async () => {
    const res = await makeRequest('/api/v1/trips?origin=H%C3%A0%20N%E1%BB%99i&destination=Thanh%20H%C3%B3a');
    assert.strictEqual(res.statusCode, 200);
    const json = JSON.parse(res.body);
    assert.strictEqual(json.status, 'success');
    assert.ok(json.data.length >= 2);
  });

  it('TC-E2E-05: Should respond to Seat Map API /api/v1/trips/trp_hn_th_01/seat-map', async () => {
    const res = await makeRequest('/api/v1/trips/trp_hn_th_01/seat-map');
    assert.strictEqual(res.statusCode, 200);
    const json = JSON.parse(res.body);
    assert.strictEqual(json.success, true);
    assert.strictEqual(json.data.total_decks, 2);
    assert.strictEqual(json.data.total_seats, 22);
  });

  it('TC-E2E-06: Should respond to Live GPS Radar API /api/v1/trips/trp_hn_th_01/radar', async () => {
    const res = await makeRequest('/api/v1/trips/trp_hn_th_01/radar');
    assert.strictEqual(res.statusCode, 200);
    const json = JSON.parse(res.body);
    assert.strictEqual(json.success, true);
    assert.ok(json.data.distance_meters > 0);
    assert.ok(json.data.eta_minutes >= 0);
  });
});
