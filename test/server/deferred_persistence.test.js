/**
 * Tests for deferred persistence (step 1 performance):
 * Reads and GPS pings defer their database writes to a timer or server shutdown,
 * while business mutations flush synchronously before responding.
 */
import { describe, it, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createFleetBusServer } from '../../source/server/apiServer.js';
import { lastAcceptedTelemetry } from '../../source/server/routes/driverRoutes.js';

describe('Deferred Persistence: reads and GPS pings', () => {
  const dirs = [];
  const tempDir = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fleetbus-deferred-'));
    dirs.push(dir);
    return dir;
  };

  beforeEach(() => {
    lastAcceptedTelemetry.clear();
  });

  after(() => {
    for (const dir of dirs) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // ignore cleanup errors
      }
    }
  });

  it('a GET does not call store.flush synchronously, marks store dirty, and flushes after persistIntervalMs', async () => {
    const dir = tempDir();
    const { server, services } = createFleetBusServer({ dataDir: dir, persistIntervalMs: 100, authMode: 'off' });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    try {
      let flushes = 0;
      const origFlush = services.store.flush.bind(services.store);
      services.store.flush = (...args) => {
        flushes++;
        return origFlush(...args);
      };

      assert.strictEqual(services.store.dirty, false);
      const res = await fetch(`${baseUrl}/api/v1/passenger/trips`);
      assert.strictEqual(res.status, 200);

      // GET does not call flush synchronously, but store is marked dirty
      assert.strictEqual(flushes, 0, 'flush should not be called synchronously during GET');
      assert.strictEqual(services.store.dirty, true, 'store should be marked dirty');

      // Shortly after (with persistIntervalMs: 100), the timer flushes
      await new Promise(resolve => setTimeout(resolve, 400));
      assert.strictEqual(flushes, 1, 'flush should be called by persist timer');
      assert.strictEqual(services.store.dirty, false, 'store should not be dirty after flush');
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });

  it('a POST that changes data is flushed before the response resolves', async () => {
    const dir = tempDir();
    const { server, services } = createFleetBusServer({ dataDir: dir, persistIntervalMs: 1000, authMode: 'off' });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    try {
      let flushes = 0;
      let flushedBeforeResponse = false;
      const origFlush = services.store.flush.bind(services.store);
      services.store.flush = (...args) => {
        flushes++;
        flushedBeforeResponse = true;
        return origFlush(...args);
      };

      const res = await fetch(`${baseUrl}/api/v1/auth/passenger/otp/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: '0987654321' }),
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(flushedBeforeResponse, true, 'store must flush before response resolves');
      assert.ok(flushes >= 1, 'flush count went up');
      assert.strictEqual(services.store.dirty, false, 'store is not dirty after flush');
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });

  it('a GPS ping is not flushed synchronously but survives a restart after the interval', async () => {
    const dir = tempDir();
    let { server, services } = createFleetBusServer({ dataDir: dir, persistIntervalMs: 100, authMode: 'off' });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    let baseUrl = `http://127.0.0.1:${server.address().port}`;

    try {
      // 1. Prepare and start the trip as in TC-SRV-03
      const readinessRes = await fetch(`${baseUrl}/api/v1/driver/trips/trp_991823/readiness`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          checklist: {
            tires_checked: true,
            brakes_fluid_checked: true,
            ac_cleanliness_checked: true,
            first_aid_extinguisher_checked: true,
            fuel_level_sufficient: true,
            gps_telemetry_beacon_active: true
          }
        })
      });
      assert.strictEqual(readinessRes.status, 200);

      const startRes = await fetch(`${baseUrl}/api/v1/driver/trips/trp_991823/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      assert.strictEqual(startRes.status, 200);

      // 2. Wrap flush to monitor calls
      let flushes = 0;
      const origFlush = services.store.flush.bind(services.store);
      services.store.flush = (...args) => {
        flushes++;
        return origFlush(...args);
      };

      // Seen when the ping marks the store dirty, i.e. before its answer: the 100 ms timer may flush any time after.
      let flushesWhenAnswered = null;
      const origMarkDirty = services.store.markDirty.bind(services.store);
      services.store.markDirty = (...args) => {
        flushesWhenAnswered ??= flushes;
        return origMarkDirty(...args);
      };

      // 3. Send GPS ping
      const pingRes = await fetch(`${baseUrl}/api/v1/driver/trips/trp_991823/telemetry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat: 20.9812, lng: 105.8430, speed_kmh: 62.4, bearing_deg: 180, seq: 42 })
      });
      assert.strictEqual(pingRes.status, 200);

      // Ping was NOT flushed synchronously
      assert.strictEqual(flushesWhenAnswered, 0, 'GPS ping must not call store.flush synchronously');

      // Wait > persistIntervalMs for the deferred flush to execute
      await new Promise(resolve => setTimeout(resolve, 400));
      assert.strictEqual(flushes, 1, 'store should be flushed after interval');
      assert.strictEqual(services.store.dirty, false, 'store must be clean after deferred flush');

      // Close server
      await new Promise(resolve => server.close(resolve));

      // Reopen server on the same data folder
      ({ server, services } = createFleetBusServer({ dataDir: dir, authMode: 'off' }));
      await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

      // Check the bus position and trip last_seq survived
      const busPos = services.trackingService.busPositions.get('trp_991823');
      assert.ok(busPos, 'bus position should exist after restart');
      assert.strictEqual(busPos.lat, 20.9812);
      assert.strictEqual(busPos.lng, 105.8430);

      const trip = services.driverService.activeTrips.get('trp_991823');
      assert.ok(trip, 'active trip should exist after restart');
      assert.strictEqual(trip.last_seq, 42);
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });

  it('closing the server flushes pending data even when the timer is disabled (persistIntervalMs: 0)', async () => {
    const dir = tempDir();
    let { server, services } = createFleetBusServer({ dataDir: dir, persistIntervalMs: 0, authMode: 'off' });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    let baseUrl = `http://127.0.0.1:${server.address().port}`;

    try {
      // 1. Prepare and start the trip
      await fetch(`${baseUrl}/api/v1/driver/trips/trp_991823/readiness`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          checklist: {
            tires_checked: true,
            brakes_fluid_checked: true,
            ac_cleanliness_checked: true,
            first_aid_extinguisher_checked: true,
            fuel_level_sufficient: true,
            gps_telemetry_beacon_active: true
          }
        })
      });
      await fetch(`${baseUrl}/api/v1/driver/trips/trp_991823/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      // 2. Send GPS ping
      const pingRes = await fetch(`${baseUrl}/api/v1/driver/trips/trp_991823/telemetry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat: 21.0285, lng: 105.8542, speed_kmh: 55.0, bearing_deg: 90, seq: 99 })
      });
      assert.strictEqual(pingRes.status, 200);
      assert.strictEqual(services.store.dirty, true, 'store is dirty');

      // 3. Close immediately without waiting
      await new Promise(resolve => server.close(resolve));

      // 4. Reopen on the same data folder
      ({ server, services } = createFleetBusServer({ dataDir: dir, authMode: 'off' }));
      await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

      // Check data is there
      const busPos = services.trackingService.busPositions.get('trp_991823');
      assert.ok(busPos, 'bus position should be persisted on close');
      assert.strictEqual(busPos.lat, 21.0285);
      assert.strictEqual(busPos.lng, 105.8542);

      const trip = services.driverService.activeTrips.get('trp_991823');
      assert.strictEqual(trip?.last_seq, 99);
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });

  it('a batch replay of offline pings is stored before its answer; a failing deferred flush sets 503 without throwing', async () => {
    const dir = tempDir();
    const { server, services } = createFleetBusServer({ dataDir: dir, persistIntervalMs: 50, authMode: 'off' });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    try {
      let flushes = 0;
      const origFlush = services.store.flush.bind(services.store);
      services.store.flush = (...args) => {
        flushes++;
        return origFlush(...args);
      };

      const res = await fetch(`${baseUrl}/api/v1/driver/telemetry/batch-replay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buffer: [] })
      });
      assert.strictEqual(res.status, 200);
      // The app drops its queue on this answer, so the replayed pings are already stored.
      assert.strictEqual(flushes, 1, 'batch replay flushes before answering');

      // A live ping leaves the store dirty for the background flush.
      services.store.markDirty();

      // Verify failure behaviour: flushIfDirty never throws, sets store.failed, subsequent requests get 503
      services.store.flush = () => {
        const err = Object.assign(new Error('Disk write failed test simulation'), { code: 'STORAGE_FAILED' });
        services.store.failed = err;
        throw err;
      };

      // flushIfDirty does not throw out of the timer/call
      assert.doesNotThrow(() => services.store.flushIfDirty());
      assert.ok(services.store.failed);

      // Subsequent requests get 503
      const reqAfterFail = await fetch(`${baseUrl}/api/v1/passenger/trips`);
      assert.strictEqual(reqAfterFail.status, 503);
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });
});
