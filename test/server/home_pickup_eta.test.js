import { describe, it } from 'node:test';
import assert from 'node:assert';
import { homeEta, HOME_NEAR_METERS, HOME_AT_DOOR_METERS, HOME_DWELL_MINUTES } from '../../source/server/core/homeRun.js';
import { createFleetBusServer } from '../../source/server/apiServer.js';
import { findOperatorById } from '../../source/server/core/operators.js';

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

/**
 * SPEC-HOME-PICKUP-TRACKING-V2, phase 2 (D159): the four milestones a passenger waiting at home hears, each once:
 * M1 the run starts, M2 the bus in their area (15 min or 3 km), M3 about to arrive (near the door or within the
 * company threshold), M4 at the door.
 */
describe('Home pickup milestones M1-M4 (SPEC-HOME-PICKUP-TRACKING-V2)', () => {
  const NOW = Date.parse('2026-10-23T05:00:00Z');
  const OP = 'op_saomai';
  let seq = 0;

  // A trip of its own with three doors along one street (~1.4 km of road apart), the bus coming from the south.
  const setup = () => {
    const { services } = createFleetBusServer();
    const tripId = `trp_ms_${++seq}`;
    const door = (id, seat, phone, lat) => ({
      ticket_id: id, seat_code: seat, passenger_name: id, passenger_phone: phone, pickup_stop_id: 'stp_hn_gb',
      dropoff_stop_id: 'stp_th_pb', boarding_status: 'ISSUED', payment_method: 'VIETQR', cod_amount_vnd: 0,
      home_pickup: { status: 'CONFIRMED', address: `${seat} Phố Huế`, lat, lng: 105.85 }
    });
    services.driverService.activeTrips.set(tripId, {
      trip_id: tripId, operator_id: OP, vehicle_plate: '29B-123.45', status: 'SCHEDULED',
      departure_time: new Date(NOW + 3600000).toISOString(), stops: [{ stop_id: 'stp_hn_gb' }], home_order: ['tkt_A', 'tkt_B', 'tkt_C'],
      manifest: [door('tkt_A', 'A01', '0912000001', 21.00), door('tkt_B', 'A02', '0912000002', 21.01), door('tkt_C', 'A03', '0912000003', 21.02)]
    });
    const bridge = services.driverService.eventBridge;
    const ofType = (phone, type) => {
      const inbox = services.trackingService.getNotifications(phone, OP);
      return (inbox.data?.notifications ?? inbox.data).filter(n => n.type === type);
    };
    // A live position, then the check the server runs on each one.
    const ping = (lat, speed_kmh, at) => {
      services.trackingService.busPositions.set(tripId, { lat, lng: 105.85, speed_kmh, timestamp: new Date(at).toISOString() });
      bridge._notifyApproaching(tripId, at);
    };
    assert.strictEqual(services.driverService.startHomeRun(tripId, NOW).success, true);
    return { services, tripId, ofType, ping };
  };
  const A = '0912000001';
  const B = '0912000002';

  it('TC-ETA-07: M1 when the run starts, with the passenger\'s place in it, once', () => {
    const { services, tripId, ofType } = setup();
    assert.strictEqual(services.driverService.startHomeRun(tripId, NOW + 1000).success, true, 'starting again is a no-op');
    const m1 = ofType(B, 'HOME_RUN_STARTED');
    assert.strictEqual(m1.length, 1);
    assert.strictEqual(m1[0].payload.milestone, 'M1');
    assert.strictEqual(m1[0].payload.position, 2);
    assert.strictEqual(m1[0].payload.total, 3);
    assert.match(m1[0].body, /điểm đón thứ 2/);
  });

  it('TC-ETA-08: M2 within 15 minutes, then M3 within the threshold, then M4 at the door, each once', () => {
    const { ofType, ping } = setup();
    // ~7.2 km of road, ~22 min: nothing yet.
    ping(20.95, 20, NOW);
    assert.strictEqual(ofType(A, 'HOME_PICKUP_NEAR_AREA').length, 0);

    // ~4.6 km of road, ~14 min: in the area.
    ping(20.968, 20, NOW + 60000);
    ping(20.968, 20, NOW + 70000);
    const m2 = ofType(A, 'HOME_PICKUP_NEAR_AREA');
    assert.strictEqual(m2.length, 1, 'M2 once');
    assert.strictEqual(m2[0].payload.milestone, 'M2');
    assert.ok(m2[0].payload.road_meters > 3000 && m2[0].payload.eta_minutes <= 15, 'the time decided');
    assert.strictEqual(m2[0].title, 'Xe đang tới gần khu vực của bạn');
    assert.match(m2[0].body, /29B-123\.45 .*còn khoảng 14 phút, ~4\.6 km.*ghế A01/);
    assert.strictEqual(ofType(A, 'PICKUP_APPROACHING').length, 0);

    // ~3.2 km of road, 10 min: the company threshold (10).
    ping(20.978, 20, NOW + 120000);
    const m3 = ofType(A, 'PICKUP_APPROACHING');
    assert.strictEqual(m3.length, 1);
    assert.strictEqual(m3[0].payload.milestone, 'M3');
    assert.strictEqual(m3[0].payload.eta_minutes, 10);

    // In the lane (~145 m): near the door, M3 already said.
    ping(20.999, 3, NOW + 600000);
    assert.strictEqual(ofType(A, 'PICKUP_APPROACHING').length, 1, 'M3 once');
    assert.strictEqual(ofType(A, 'HOME_PICKUP_ARRIVED').length, 0);

    // ~30 m and pulled up: at the door.
    ping(20.9998, 4, NOW + 660000);
    ping(20.9998, 0, NOW + 670000);
    const m4 = ofType(A, 'HOME_PICKUP_ARRIVED');
    assert.strictEqual(m4.length, 1, 'M4 once');
    assert.strictEqual(m4[0].payload.milestone, 'M4');
    assert.strictEqual(m4[0].title, 'Xe đã tới chỗ đón');
    assert.strictEqual(m4[0].body, 'Xe 29B-123.45 đã tới A01 Phố Huế. Mời bạn ra xe, ghế A01.');

    // Only the next door hears the bus come.
    for (const type of ['HOME_PICKUP_NEAR_AREA', 'PICKUP_APPROACHING', 'HOME_PICKUP_ARRIVED']) assert.strictEqual(ofType(B, type).length, 0, type);
  });

  it('TC-ETA-09: M2 within 3 km of road when the time alone would not say it', () => {
    const config = findOperatorById(OP).service_config;
    const before = config.approaching_threshold_minutes;
    config.approaching_threshold_minutes = 5;
    try {
      const { ofType, ping } = setup();
      // ~2.9 km of road, ~9 min: over the threshold (5), under 15 min and 3 km.
      ping(20.98, 20, NOW);
      const m2 = ofType(A, 'HOME_PICKUP_NEAR_AREA');
      assert.strictEqual(m2.length, 1);
      assert.ok(m2[0].payload.road_meters <= 3000);
      assert.strictEqual(ofType(A, 'PICKUP_APPROACHING').length, 0);
    } finally {
      config.approaching_threshold_minutes = before;
    }
  });

  it('TC-ETA-10: M3 near the door (300 m) on the first ping, and an earlier milestone is not sent after a later one', () => {
    const { ofType, ping } = setup();
    ping(20.999, 3, NOW);
    const m3 = ofType(A, 'PICKUP_APPROACHING');
    assert.strictEqual(m3.length, 1);
    assert.strictEqual(m3[0].payload.milestone, 'M3');
    assert.strictEqual(ofType(A, 'HOME_PICKUP_NEAR_AREA').length, 0, 'no "in your area" once the bus is in the lane');
    // The bus backs off to ~14 min (a wrong turn): M2 is not said after M3.
    ping(20.968, 20, NOW + 30000);
    assert.strictEqual(ofType(A, 'HOME_PICKUP_NEAR_AREA').length, 0);
  });

  it('TC-ETA-11: a stale position says nothing', () => {
    const { services, tripId, ofType } = setup();
    services.trackingService.busPositions.set(tripId, { lat: 20.9998, lng: 105.85, speed_kmh: 0, timestamp: new Date(NOW).toISOString() });
    services.driverService.eventBridge._notifyApproaching(tripId, NOW + 120000);
    assert.strictEqual(ofType(A, 'HOME_PICKUP_ARRIVED').length, 0);
  });
});
