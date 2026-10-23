import { describe, it } from 'node:test';
import assert from 'node:assert';
import { homeEta, HOME_NEAR_METERS, HOME_AT_DOOR_METERS, HOME_DWELL_MINUTES } from '../../source/server/core/homeRun.js';

/**
 * SPEC-HOME-PICKUP-TRACKING-V2, phase 1: the near (300 m) and at-door (50 m) thresholds, the run's ETA counting
 * every door before the passenger's (dwell or the minutes they asked for), and an ETA that does not jump back up.
 */
describe('Home pickup ETA engine (SPEC-HOME-PICKUP-TRACKING-V2)', () => {
  const NOW = Date.parse('2026-10-23T05:00:00Z');
  const pax = (id, lat, lng, extra = {}) => ({ ticket_id: id, boarding_status: 'PENDING', home_pickup: { status: 'CONFIRMED', lat, lng }, ...extra });
  // Three doors along one street, ~1.1 km apart (0.01° of latitude).
  const run = () => ({
    trip_id: 'trp_eta',
    home_order: ['A', 'B', 'C'],
    manifest: [pax('A', 21.00, 105.85), pax('B', 21.01, 105.85), pax('C', 21.02, 105.85)]
  });
  // ~1.3 km of road before A, at city speed.
  const bus = { lat: 20.99, lng: 105.85, speed_kmh: 20 };

  it('TC-ETA-01: the thresholds are 300 m near and 50 m at the door', () => {
    assert.strictEqual(HOME_NEAR_METERS, 300);
    assert.strictEqual(HOME_AT_DOOR_METERS, 50);
  });

  it('TC-ETA-02: near the door at 300 m, at the door only within 50 m and pulled up', () => {
    const trip = run();
    // ~145 m of road.
    let q = homeEta(trip, 'A', { lat: 20.999, lng: 105.85, speed_kmh: 3 }, NOW);
    assert.strictEqual(q.near_door, true);
    assert.strictEqual(q.at_door, false);
    // ~30 m of road, still driving past.
    q = homeEta(trip, 'A', { lat: 20.9998, lng: 105.85, speed_kmh: 25 }, NOW);
    assert.strictEqual(q.near_door, true);
    assert.strictEqual(q.at_door, false, 'a bus driving past is not at the door');
    q = homeEta(trip, 'A', { lat: 20.9998, lng: 105.85, speed_kmh: 4 }, NOW);
    assert.strictEqual(q.at_door, true);
    q = homeEta(trip, 'A', { lat: 20.9998, lng: 105.85 }, NOW);
    assert.strictEqual(q.at_door, true, 'no speed reported: the distance decides');
    // Far from A: not near.
    assert.strictEqual(homeEta(run(), 'A', bus, NOW).near_door, false);
  });

  it('TC-ETA-03: only the next door can be at the door', () => {
    const trip = run();
    const q = homeEta(trip, 'B', { lat: 21.0098, lng: 105.85, speed_kmh: 0 }, NOW);
    assert.strictEqual(q.ahead, 1);
    assert.strictEqual(q.near_door, true);
    assert.strictEqual(q.at_door, false);
  });

  it('TC-ETA-04: each door before counts its dwell, or the minutes that passenger asked for', () => {
    const plain = homeEta(run(), 'C', bus, NOW);
    assert.strictEqual(plain.position, 3);
    assert.strictEqual(plain.ahead, 2);
    // ~3.9 km at 20 km/h ≈ 11.7 min + 2 doors x 3 min.
    assert.strictEqual(plain.eta_minutes, Math.round((plain.road_meters / 1000) / 20 * 60 + 2 * HOME_DWELL_MINUTES));

    const asked = run();
    asked.manifest[0].pickup_ready = { status: 'NEED_5', minutes: 5, at: new Date(NOW).toISOString() };
    const q = homeEta(asked, 'C', bus, NOW);
    // A asked for 5 minutes: their door takes 5, not 3.
    assert.strictEqual(q.eta_minutes, plain.eta_minutes + 2);

    // The bus has waited 2 minutes at A, who asked for nothing: 1 minute of dwell left.
    const waiting = run();
    waiting.manifest[0].home_pickup.arrived_at = new Date(NOW - 2 * 60000).toISOString();
    const atA = { lat: 21.00, lng: 105.85, speed_kmh: 0 };
    const b = homeEta(waiting, 'B', atA, NOW);
    assert.strictEqual(b.eta_minutes, Math.round((b.road_meters / 1000) / 20 * 60 + 1));
  });

  it('TC-ETA-05: the ETA does not jump back up under a minute of noise, a real delay shows at once', () => {
    const trip = run();
    const first = homeEta(trip, 'A', bus, NOW);
    assert.deepStrictEqual(trip.cached_etas.A, { minutes: first.eta_minutes, at: NOW });

    // 4.3 min shown as 4; a jittered ping 4.8 min out would round to 5: the shown number stays.
    assert.strictEqual(first.eta_minutes, 4);
    const noisy = homeEta(trip, 'A', { ...bus, lat: 20.9889 }, NOW + 10000);
    assert.strictEqual(noisy.eta_minutes, 4);

    // Counting down goes through.
    const closer = homeEta(trip, 'A', { ...bus, lat: 20.995 }, NOW + 20000);
    assert.ok(closer.eta_minutes < first.eta_minutes);

    // A minute or more later than shown (the bus went the other way): shown at once.
    const back = homeEta(trip, 'A', { ...bus, lat: 20.97 }, NOW + 30000);
    assert.ok(back.eta_minutes >= closer.eta_minutes + 1);
  });

  it('TC-ETA-06: an old cached ETA is not used', () => {
    const trip = run();
    trip.cached_etas = { A: { minutes: 1, at: NOW - 10 * 60000 } };
    const q = homeEta(trip, 'A', bus, NOW);
    assert.ok(q.eta_minutes > 1);
  });
});
