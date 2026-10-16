import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import http from 'http';
import { DriverCockpitService } from '../../source/server/services/driver/modules/driverService.js';
import { PassengerSearchService, MOCK_TRIPS_DATABASE } from '../../source/server/services/passenger/modules/search.js';
import { createFleetBusServer } from '../../source/server/apiServer.js';
import {
  lastAcceptedTelemetry,
  isTelemetryRateLimited
} from '../../source/server/routes/driverRoutes.js';

describe('T2: Stop coordinates, road shape payloads, and telemetry rate limit', () => {
  describe('Driver Cockpit: _publicTrip payload & seed isolation', () => {
    it('TC-GEO-PAYLOAD-01: driver getTrip("trp_hn_th_01") stops all have lat/lng and route_shape > 100 points', () => {
      const driverService = new DriverCockpitService();
      const res = driverService.getTrip('trp_hn_th_01');

      assert.strictEqual(res.success, true);
      assert.ok(res.data, 'trip payload must exist');

      // Stops should each have numerical lat and lng
      assert.ok(Array.isArray(res.data.stops), 'stops must be an array');
      assert.ok(res.data.stops.length >= 4, 'stops count should be at least 4');
      for (const stop of res.data.stops) {
        assert.strictEqual(typeof stop.lat, 'number', `stop ${stop.stop_id} must have numeric lat`);
        assert.strictEqual(typeof stop.lng, 'number', `stop ${stop.stop_id} must have numeric lng`);
      }

      // Route shape should be present with > 100 geometry points
      assert.ok(Array.isArray(res.data.route_shape), 'route_shape must be an array');
      assert.ok(
        res.data.route_shape.length > 100,
        `route_shape length (${res.data.route_shape.length}) should be > 100 points`
      );

      // Verify the stored trip in activeTrips is NOT mutated
      const storedTrip = driverService.activeTrips.get('trp_hn_th_01');
      assert.ok(storedTrip, 'stored trip must exist');
      for (const s of storedTrip.stops) {
        assert.strictEqual(s.lat, undefined, 'stored stop should not have lat property');
        assert.strictEqual(s.lng, undefined, 'stored stop should not have lng property');
      }
      assert.strictEqual(storedTrip.route_shape, undefined, 'stored trip should not have route_shape property');
    });

    it('TC-GEO-PAYLOAD-02: driver getTodayTrips includes stop coordinates and route_shape', () => {
      const driverService = new DriverCockpitService();
      const todayRes = driverService.getTodayTrips('drv_8821a');

      assert.strictEqual(todayRes.success, true);
      const trip = todayRes.data.trips.find(t => t.trip_id === 'trp_hn_th_01');
      assert.ok(trip, 'trp_hn_th_01 should be among assigned today trips');
      assert.ok(Array.isArray(trip.route_shape) && trip.route_shape.length > 100);
      assert.ok(trip.stops.every(s => typeof s.lat === 'number' && typeof s.lng === 'number'));
    });

    it('TC-GEO-PAYLOAD-03: _publicTrip omits lat/lng for unknown stops and sets route_shape to null when absent', () => {
      const driverService = new DriverCockpitService();
      const mockTrip = {
        trip_id: 'trp_no_shape_99',
        stops: [
          { stop_id: 'stp_unknown_x', name: 'Unknown Stop', order: 1 }
        ],
        manifest: []
      };
      const publicTrip = driverService._publicTrip(mockTrip);

      assert.strictEqual(publicTrip.route_shape, null, 'route_shape should be null when none exists');
      assert.strictEqual(publicTrip.stops[0].lat, undefined, 'unknown stop must not have lat');
      assert.strictEqual(publicTrip.stops[0].lng, undefined, 'unknown stop must not have lng');
      assert.strictEqual(publicTrip.stops[0].stop_id, 'stp_unknown_x');
    });
  });

  describe('Passenger Search: getTripDetail payload & seed isolation', () => {
    it('TC-GEO-PAYLOAD-04: getTripDetail stops have lat/lng and seed MOCK entry is not mutated', () => {
      const searchService = new PassengerSearchService();
      const res = searchService.getTripDetail('trp_hn_th_01');

      assert.strictEqual(res.success, true);
      assert.ok(res.data, 'detail payload must exist');

      // Returned stops have lat/lng
      assert.ok(Array.isArray(res.data.stops), 'stops must be an array');
      assert.ok(res.data.stops.length > 0, 'stops must not be empty');
      for (const stop of res.data.stops) {
        assert.strictEqual(typeof stop.lat, 'number', `stop ${stop.stop_id} must have numeric lat`);
        assert.strictEqual(typeof stop.lng, 'number', `stop ${stop.stop_id} must have numeric lng`);
      }

      // Returned route_shape has > 100 points
      assert.ok(Array.isArray(res.data.route_shape), 'route_shape must be an array');
      assert.ok(
        res.data.route_shape.length > 100,
        `route_shape length (${res.data.route_shape.length}) should be > 100 points`
      );

      // Verify the original seed object in MOCK_TRIPS_DATABASE has NOT been mutated
      const seedTrip = MOCK_TRIPS_DATABASE.find(t => t.trip_id === 'trp_hn_th_01');
      assert.ok(seedTrip, 'seed trip entry must exist');
      for (const stop of seedTrip.stops) {
        assert.strictEqual(stop.lat, undefined, 'seed stop must not have lat');
        assert.strictEqual(stop.lng, undefined, 'seed stop must not have lng');
      }
      assert.strictEqual(seedTrip.route_shape, undefined, 'seed trip entry must not have route_shape');
    });

    it('TC-GEO-PAYLOAD-05: getTripDetail returns route_shape null for trip without precomputed geometry', () => {
      const searchService = new PassengerSearchService();
      const res = searchService.getTripDetail('trp_hn_th_02');

      assert.strictEqual(res.success, true);
      assert.strictEqual(res.data.route_shape, null);
      assert.ok(res.data.stops.length > 0);
      for (const stop of res.data.stops) {
        assert.strictEqual(typeof stop.lat, 'number');
        assert.strictEqual(typeof stop.lng, 'number');
      }
    });

    it('TC-GEO-PAYLOAD-06: getTripDetail returns 404/TRIP_NOT_FOUND for non-existent trip', () => {
      const searchService = new PassengerSearchService();
      const res = searchService.getTripDetail('trp_does_not_exist');

      assert.strictEqual(res.success, false);
      assert.strictEqual(res.code, 'TRIP_NOT_FOUND');
    });
  });

  describe('Telemetry Rate Limiting & Batch Replay HTTP Integration', () => {
    let appServer;
    let baseUrl;
    let services;

    before(async () => {
      const serverInstance = createFleetBusServer({ authMode: 'off' });
      services = serverInstance.services;
      await new Promise((resolve) => {
        appServer = serverInstance.server.listen(0, () => {
          const port = appServer.address().port;
          baseUrl = `http://127.0.0.1:${port}`;
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

    beforeEach(() => {
      lastAcceptedTelemetry.clear();
    });

    function request(path, options = {}) {
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
          res.on('data', chunk => { rawData += chunk; });
          res.on('end', () => {
            let parsed;
            try {
              parsed = JSON.parse(rawData);
            } catch {
              parsed = rawData;
            }
            resolve({ statusCode: res.statusCode, body: parsed });
          });
        });
        req.on('error', reject);
        if (options.body) {
          req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
        }
        req.end();
      });
    }

    it('TC-GEO-RATE-01: two telemetry POSTs 0 ms apart for the same trip → first 200, second 429 TELEMETRY_RATE_LIMITED', async () => {
      const tripId = 'trp_hn_th_01';

      // Start the trip via HTTP POST /start (trp_hn_th_01 is READY by default)
      const startRes = await request(`/api/v1/driver/trips/${tripId}/start`, { method: 'POST' });
      assert.strictEqual(startRes.statusCode, 200, `Starting trip should succeed: ${JSON.stringify(startRes.body)}`);

      const pingBody = {
        lat: 20.9806,
        lng: 105.8413,
        speed_kmh: 55,
        bearing_deg: 180,
        is_offline: false
      };

      // 1st telemetry POST
      const res1 = await request(`/api/v1/driver/trips/${tripId}/telemetry`, {
        method: 'POST',
        body: pingBody
      });
      assert.strictEqual(res1.statusCode, 200, 'First telemetry POST should succeed with 200');
      assert.strictEqual(res1.body.status, 'success');

      // 2nd telemetry POST immediately (0 ms apart)
      const res2 = await request(`/api/v1/driver/trips/${tripId}/telemetry`, {
        method: 'POST',
        body: pingBody
      });
      assert.strictEqual(res2.statusCode, 429, 'Second rapid telemetry POST should return 429');
      assert.strictEqual(res2.body.status, 'error');
      assert.strictEqual(res2.body.code, 'TELEMETRY_RATE_LIMITED');
      assert.strictEqual(res2.body.message, 'Gửi vị trí quá dày, tối thiểu 1 giây một lần');
    });

    it('TC-GEO-RATE-02: rate limit helper isTelemetryRateLimited functions correctly across time offsets', () => {
      const tripId = 'trp_rate_test';
      const t0 = 1000000;

      lastAcceptedTelemetry.set(tripId, t0);

      // Within 1000 ms (< 1000 ms diff) → rate limited
      assert.strictEqual(isTelemetryRateLimited(tripId, t0), true);
      assert.strictEqual(isTelemetryRateLimited(tripId, t0 + 500), true);
      assert.strictEqual(isTelemetryRateLimited(tripId, t0 + 999), true);

      // At or after 1000 ms (>= 1000 ms diff) → not rate limited
      assert.strictEqual(isTelemetryRateLimited(tripId, t0 + 1000), false);
      assert.strictEqual(isTelemetryRateLimited(tripId, t0 + 2000), false);

      // Different trip is not rate limited
      assert.strictEqual(isTelemetryRateLimited('trp_other_trip', t0 + 100), false);
    });

    it('TC-GEO-RATE-03: batch-replay endpoint is NOT rate limited even when rapid', async () => {
      const tripId = 'trp_hn_th_01';

      const replayPayload = {
        telemetryBuffer: [
          {
            trip_id: tripId,
            lat: 20.9700,
            lng: 105.8420,
            speed_kmh: 60,
            bearing_deg: 180,
            timestamp: new Date().toISOString()
          },
          {
            trip_id: tripId,
            lat: 20.9650,
            lng: 105.8425,
            speed_kmh: 58,
            bearing_deg: 180,
            timestamp: new Date().toISOString()
          }
        ]
      };

      // 1st batch replay
      const res1 = await request('/api/v1/driver/telemetry/batch-replay', {
        method: 'POST',
        body: replayPayload
      });
      assert.strictEqual(res1.statusCode, 200);
      assert.strictEqual(res1.body.status, 'success');

      // 2nd batch replay immediately
      const res2 = await request('/api/v1/driver/telemetry/batch-replay', {
        method: 'POST',
        body: replayPayload
      });
      assert.strictEqual(res2.statusCode, 200, 'Batch replay must not be rate limited');
      assert.strictEqual(res2.body.status, 'success');
    });

    it('TC-GEO-RATE-04: failed telemetry does not update rate limit timestamp', async () => {
      const tripId = 'trp_hn_th_01';

      // Send invalid coordinates
      const badRes = await request(`/api/v1/driver/trips/${tripId}/telemetry`, {
        method: 'POST',
        body: { lat: 'invalid', lng: 999, speed_kmh: -1 }
      });
      assert.strictEqual(badRes.statusCode, 400);

      // Verify tripId was not recorded in lastAcceptedTelemetry
      assert.strictEqual(lastAcceptedTelemetry.has(tripId), false);
    });
  });
});
