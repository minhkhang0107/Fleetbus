import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'http';
import { signToken, TOKEN_PREFIXES } from '../../source/server/core/tokens.js';
import {
  STOP_COORDS,
  ROUTE_SHAPES,
  stopCoords,
  routeShape,
  projectOnShape,
  distanceAlongRoute,
  signedDistanceAlongRoute
} from '../../source/server/core/geo.js';
import { calculateHaversineDistance } from '../../source/server/services/passenger/core/cryptoEngine.js';
import { PassengerTrackingService } from '../../source/server/services/passenger/modules/tracking.js';
import { PassengerSearchService } from '../../source/server/services/passenger/modules/search.js';
import { createFleetBusServer } from '../../source/server/apiServer.js';

describe('T1: Route-Aware Passenger Radar & Road Geometry Suite', () => {
  it('TC-GEO-01: projectOnShape and distanceAlongRoute basics (Giáp Bát to stp_nb)', () => {
    const shape = routeShape('trp_hn_th_01');
    assert.ok(Array.isArray(shape) && shape.length > 0, 'trp_hn_th_01 route shape must be defined');

    const gb = STOP_COORDS.stp_hn_gb;
    const nb = STOP_COORDS.stp_nb;

    const projGB = projectOnShape(shape, gb.lat, gb.lng);
    assert.ok(projGB, 'Projecting Giáp Bát should succeed');
    assert.ok(projGB.offset_m < 50, 'Giáp Bát should be very close to the start of the shape');

    const projNB = projectOnShape(shape, nb.lat, nb.lng);
    assert.ok(projNB, 'Projecting Ninh Bình should succeed');
    assert.ok(projNB.offset_m < 100, 'Ninh Bình should be close to the shape');

    const roadDist = distanceAlongRoute(shape, gb.lat, gb.lng, nb.lat, nb.lng);
    const straightDist = calculateHaversineDistance(gb.lat, gb.lng, nb.lat, nb.lng);

    // Distance between 80 km and 110 km along the road, and longer than the straight line
    assert.ok(roadDist >= 80000 && roadDist <= 110000, `Road distance (${roadDist} m) must be between 80 and 110 km`);
    assert.ok(roadDist > straightDist, `Road distance (${roadDist} m) must be longer than straight line (${straightDist} m)`);

    // Target behind returns 0 (clamped)
    const behindDist = distanceAlongRoute(shape, nb.lat, nb.lng, gb.lat, gb.lng);
    assert.strictEqual(behindDist, 0, 'Target behind must return 0');

    // More than 2000m off the shape returns null
    const farDist = distanceAlongRoute(shape, 10.0, 10.0, nb.lat, nb.lng);
    assert.strictEqual(farDist, null, 'Points > 2000 m off route must return null');
  });

  it('TC-GEO-02: stopCoords and routeShape lookup helpers', () => {
    assert.strictEqual(stopCoords('stp_unknown'), null);
    assert.deepStrictEqual(stopCoords('stp_nb'), { lat: 20.2531, lng: 105.9748 });
    assert.strictEqual(routeShape('trp_unknown'), null);
    assert.strictEqual(routeShape('trp_hn_th_01'), ROUTE_SHAPES.trp_hn_th_01);
  });

  it('TC-GEO-03: signedDistanceAlongRoute returns signed metres and null when off shape', () => {
    const shape = routeShape('trp_hn_th_01');
    const gb = STOP_COORDS.stp_hn_gb;
    const nb = STOP_COORDS.stp_nb;

    const forward = signedDistanceAlongRoute(shape, gb.lat, gb.lng, nb.lat, nb.lng);
    assert.ok(forward > 80000, 'Ahead distance should be positive');

    const backward = signedDistanceAlongRoute(shape, nb.lat, nb.lng, gb.lat, gb.lng);
    assert.ok(backward < -80000, 'Behind distance should be negative');
    assert.strictEqual(forward, -backward, 'Forward and backward should be opposite values');

    const offRoute = signedDistanceAlongRoute(shape, 10.0, 10.0, nb.lat, nb.lng);
    assert.strictEqual(offRoute, null, 'Off route point should return null');
  });

  describe('getTripRadar unit tests', () => {
    const searchService = new PassengerSearchService();
    const tripDetail = searchService.getTripDetail('trp_hn_th_01');
    const stops = tripDetail.data.stops;

    it('TC-RADAR-01: Bus ping near Nước Ngầm with target PICKUP stp_nb gives ROUTE basis and distance > straight-line', () => {
      const trackingService = new PassengerTrackingService();
      // Ping bus near Nước Ngầm (20.9655, 105.8426)
      trackingService.updateBusPosition('trp_hn_th_01', {
        lat: 20.9655,
        lng: 105.8426,
        speed_kmh: 50,
        bearing_deg: 180,
        plate_number: '29B-882.19'
      });

      const res = trackingService.getTripRadar('trp_hn_th_01', {
        canSeeBus: true, pickupStopId: 'stp_nb',
        stops
      });

      assert.strictEqual(res.success, true);
      assert.strictEqual(res.data.has_position, true);
      assert.strictEqual(res.data.distance_basis, 'ROUTE');
      assert.strictEqual(res.data.target_stop.stop_id, 'stp_nb');
      assert.strictEqual(res.data.target_stop.kind, 'PICKUP');
      assert.strictEqual(res.data.has_passed_target, false);

      const straightDist = calculateHaversineDistance(20.9655, 105.8426, STOP_COORDS.stp_nb.lat, STOP_COORDS.stp_nb.lng);
      assert.ok(
        res.data.distance_meters > straightDist,
        `Route distance (${res.data.distance_meters} m) must exceed straight line (${straightDist} m)`
      );
      assert.ok(res.data.eta_minutes > 0);
    });

    it('TC-RADAR-02: boarded=true with dropoff stp_th_pb gives kind DROPOFF and "điểm trả" wording', () => {
      const trackingService = new PassengerTrackingService();
      trackingService.updateBusPosition('trp_hn_th_01', {
        lat: 20.9655,
        lng: 105.8426,
        speed_kmh: 50,
        bearing_deg: 180,
        plate_number: '29B-882.19'
      });

      const res = trackingService.getTripRadar('trp_hn_th_01', {
        canSeeBus: true, dropoffStopId: 'stp_th_pb',
        boarded: true,
        stops
      });

      assert.strictEqual(res.success, true);
      assert.strictEqual(res.data.target_stop.stop_id, 'stp_th_pb');
      assert.strictEqual(res.data.target_stop.kind, 'DROPOFF');
      assert.strictEqual(res.data.has_passed_target, false);
      assert.ok(
        res.data.hud_status_text.includes('điểm trả'),
        `HUD status text should contain "điểm trả": got "${res.data.hud_status_text}"`
      );

      // Also verify when arriving soon (within 1000m)
      const thpb = STOP_COORDS.stp_th_pb;
      trackingService.updateBusPosition('trp_hn_th_01', {
        lat: thpb.lat + 0.003,
        lng: thpb.lng,
        speed_kmh: 20,
        bearing_deg: 180,
        plate_number: '29B-882.19'
      });
      const arrivingRes = trackingService.getTripRadar('trp_hn_th_01', {
        canSeeBus: true, dropoffStopId: 'stp_th_pb',
        boarded: true,
        stops
      });
      assert.strictEqual(arrivingRes.data.is_arriving_soon, true);
      assert.strictEqual(arrivingRes.data.has_passed_target, false);
      assert.ok(
        arrivingRes.data.hud_status_text.includes('điểm trả'),
        `Arriving HUD status text should contain "điểm trả": got "${arrivingRes.data.hud_status_text}"`
      );
    });

    it('TC-RADAR-03: no ping gives has_position false and still returns stops + route_shape', () => {
      const trackingService = new PassengerTrackingService();
      const res = trackingService.getTripRadar('trp_hn_th_01', { stops });

      assert.strictEqual(res.success, true);
      assert.strictEqual(res.data.has_position, false);
      assert.strictEqual(res.data.signal_status, undefined);
      assert.ok(Array.isArray(res.data.stops), 'Stops should be an array');
      assert.ok(res.data.stops.length > 0, 'Stops array should not be empty');
      assert.ok(res.data.stops.every(s => typeof s.lat === 'number' && typeof s.lng === 'number'), 'Stops must have coordinates');
      assert.ok(Array.isArray(res.data.route_shape), 'Route shape should be present');
      assert.strictEqual(res.data.target_stop.stop_id, 'stp_hn_gb', 'Target should fall back to first stop');
      assert.strictEqual(res.data.distance_basis, undefined);
      assert.strictEqual(res.data.has_passed_target, undefined);
      assert.strictEqual(res.data.view, 'PUBLIC');
    });

    it('TC-RADAR-04: an unknown trip (no shape) falls back to STRAIGHT_LINE', () => {
      const trackingService = new PassengerTrackingService();
      trackingService.updateBusPosition('trp_no_shape', {
        lat: 21.0,
        lng: 105.8,
        speed_kmh: 40,
        bearing_deg: 90,
        plate_number: '29B-111.11'
      });

      const res = trackingService.getTripRadar('trp_no_shape', {
        canSeeBus: true, pickupStopId: 'stp_hn_gb'
      });

      assert.strictEqual(res.success, true);
      assert.strictEqual(res.data.has_position, true);
      assert.strictEqual(res.data.distance_basis, 'STRAIGHT_LINE');
      assert.strictEqual(res.data.route_shape, null);
      assert.strictEqual(res.data.has_passed_target, false);
    });

    it('TC-RADAR-05: Bus past pickup stop with ACTIVE ticket sets has_passed_target true and not "cập bến"', () => {
      const trackingService = new PassengerTrackingService();
      // Bus ping near Nước Ngầm (passed Giáp Bát by ~2.5 km)
      trackingService.updateBusPosition('trp_hn_th_01', {
        lat: 20.9655,
        lng: 105.8426,
        speed_kmh: 50,
        bearing_deg: 180,
        plate_number: '29B-882.19'
      });

      const res = trackingService.getTripRadar('trp_hn_th_01', {
        canSeeBus: true, pickupStopId: 'stp_hn_gb',
        boarded: false,
        stops,
        view: 'TICKET'
      });

      assert.strictEqual(res.success, true);
      assert.strictEqual(res.data.has_passed_target, true);
      assert.strictEqual(res.data.distance_meters, 0);
      assert.strictEqual(res.data.eta_minutes, 0);
      assert.strictEqual(res.data.is_at_station, false);
      assert.strictEqual(res.data.is_arriving_soon, false);
      assert.strictEqual(res.data.hud_status_text, 'Xe đã qua Bến xe Giáp Bát');
      assert.strictEqual(res.data.view, 'TICKET');
    });

    it('TC-RADAR-06: Bus past drop-off stop with BOARDED ticket sets has_passed_target true and "Xe đã qua điểm trả"', () => {
      const trackingService = new PassengerTrackingService();
      // Bus ping near Thanh Hóa (passed Ninh Bình)
      const thpb = STOP_COORDS.stp_th_pb;
      trackingService.updateBusPosition('trp_hn_th_01', {
        lat: thpb.lat,
        lng: thpb.lng,
        speed_kmh: 50,
        bearing_deg: 180,
        plate_number: '29B-882.19'
      });

      const res = trackingService.getTripRadar('trp_hn_th_01', {
        canSeeBus: true, dropoffStopId: 'stp_nb',
        boarded: true,
        stops,
        view: 'TICKET'
      });

      assert.strictEqual(res.success, true);
      assert.strictEqual(res.data.has_passed_target, true);
      assert.strictEqual(res.data.distance_meters, 0);
      assert.strictEqual(res.data.eta_minutes, 0);
      assert.strictEqual(res.data.is_at_station, false);
      assert.strictEqual(res.data.is_arriving_soon, false);
      assert.strictEqual(res.data.hud_status_text, 'Xe đã qua điểm trả Bến xe Ninh Bình');
    });

    it('TC-RADAR-07: Public view after departure targets the next stop ahead of the bus (>200m)', () => {
      const trackingService = new PassengerTrackingService();
      // Bus ping near Nước Ngầm (past Giáp Bát; Nước Ngầm is at 0m, next ahead is Ninh Bình)
      trackingService.updateBusPosition('trp_hn_th_01', {
        lat: 20.9655,
        lng: 105.8426,
        speed_kmh: 50,
        bearing_deg: 180,
        plate_number: '29B-882.19'
      });

      const res = trackingService.getTripRadar('trp_hn_th_01', {
        stops,
        view: 'PUBLIC'
      });

      assert.strictEqual(res.success, true);
      assert.strictEqual(res.data.view, 'PUBLIC');
      assert.strictEqual(res.data.target_stop.stop_id, 'stp_nb');
      assert.strictEqual(res.data.target_stop.kind, 'PICKUP');
      assert.strictEqual(res.data.has_passed_target, undefined);
      assert.strictEqual(res.data.hud_status_text, undefined);
    });
  });

  describe('HTTP Route Integration: /api/v1/trips/:tripId/tracking & /radar', () => {
    let appServer;
    let baseUrl;
    let serverServices;

    before(async () => {
      const { server, services } = createFleetBusServer({ authMode: 'off' });
      serverServices = services;
      await new Promise((resolve) => {
        appServer = server.listen(0, () => {
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

    const passengerAuth = (phone) => ({ Authorization: `Bearer ${signToken({ sub: `u_${phone}`, phone, kind: 'passenger', operator_id: 'op_saomai' }, { prefix: TOKEN_PREFIXES.passenger, ttlSeconds: 600 })}` });

    function makeRequest(path, headers = {}) {
      return new Promise((resolve, reject) => {
        const url = `${baseUrl}${path}`;
        const req = http.request(url, { method: 'GET', headers }, (res) => {
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
        req.end();
      });
    }

    it('TC-ROUTE-01: Public view before departure targets the first stop', async () => {
      // Clear or set bus at Giáp Bát before departure
      serverServices.trackingService.updateBusPosition('trp_hn_th_01', {
        lat: 20.9806,
        lng: 105.8413,
        speed_kmh: 0,
        bearing_deg: 0,
        plate_number: '29B-882.19'
      });

      const res = await makeRequest('/api/v1/trips/trp_hn_th_01/tracking');
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.status, 'success');
      assert.strictEqual(res.body.data.target_stop.stop_id, 'stp_hn_gb');
      assert.strictEqual(res.body.data.target_stop.kind, 'PICKUP');
      assert.strictEqual(res.body.data.view, 'PUBLIC');
      assert.ok(Array.isArray(res.body.data.stops));
      assert.ok(res.body.data.stops.length > 0);
      assert.ok(typeof res.body.data.stops[0].lat === 'number');
      assert.ok(Array.isArray(res.body.data.route_shape));
      assert.strictEqual(res.body.data.passenger_name, undefined);
      assert.strictEqual(res.body.data.passenger_phone, undefined);
    });

    it('TC-ROUTE-02: Public view after departure targets the next stop ahead', async () => {
      // Bus ping near Nước Ngầm (past Giáp Bát)
      serverServices.trackingService.updateBusPosition('trp_hn_th_01', {
        lat: 20.9655,
        lng: 105.8426,
        speed_kmh: 45,
        bearing_deg: 180,
        plate_number: '29B-882.19'
      });

      const res = await makeRequest('/api/v1/trips/trp_hn_th_01/tracking');
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.status, 'success');
      assert.strictEqual(res.body.data.view, 'PUBLIC');
      assert.strictEqual(res.body.data.target_stop.stop_id, 'stp_nb');
      assert.strictEqual(res.body.data.target_stop.kind, 'PICKUP');
      assert.strictEqual(res.body.data.hud_status_text, undefined);
    });

    it('TC-ROUTE-03: With a BOARDED ticket_id, radar targets the drop-off stop and does not leak identity', async () => {
      const ticketId = 'tkt_test_boarded_01';
      serverServices.paymentService.tickets.set(ticketId, {
        ticket_id: ticketId,
        trip_id: 'trp_hn_th_01',
        pickup_stop_id: 'stp_hn_gb',
        dropoff_stop_id: 'stp_th_pb',
        status: 'BOARDED',
        passenger_name: 'Nguyen Van A',
        passenger_phone: '0988776655'
      });
      // Only the ticket's owner (or holder) sees the bus through ticket_id.

      const res = await makeRequest(`/api/v1/trips/trp_hn_th_01/tracking?ticket_id=${ticketId}`, passengerAuth('0988776655'));
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.status, 'success');
      assert.strictEqual(res.body.data.view, 'TICKET');
      assert.strictEqual(res.body.data.target_stop.stop_id, 'stp_th_pb');
      assert.strictEqual(res.body.data.target_stop.kind, 'DROPOFF');
      assert.strictEqual(res.body.data.has_passed_target, false);
      assert.ok(res.body.data.hud_status_text.includes('điểm trả'));
      assert.ok(Array.isArray(res.body.data.stops));
      assert.ok(Array.isArray(res.body.data.route_shape));
      assert.strictEqual(res.body.data.passenger_name, undefined);
      assert.strictEqual(res.body.data.passenger_phone, undefined);
    });

    it('TC-ROUTE-04: With an ACTIVE ticket whose bus has passed the pickup, has_passed_target is true', async () => {
      const ticketId = 'tkt_test_missed_01';
      serverServices.paymentService.tickets.set(ticketId, {
        ticket_id: ticketId,
        trip_id: 'trp_hn_th_01',
        pickup_stop_id: 'stp_hn_gb',
        dropoff_stop_id: 'stp_th_pb',
        status: 'ACTIVE',
        passenger_name: 'Tran Van B',
        passenger_phone: '0912345678'
      });

      // Bus is already at Nước Ngầm, past Giáp Bát
      serverServices.trackingService.updateBusPosition('trp_hn_th_01', {
        lat: 20.9655,
        lng: 105.8426,
        speed_kmh: 45,
        bearing_deg: 180,
        plate_number: '29B-882.19'
      });

      const res = await makeRequest(`/api/v1/trips/trp_hn_th_01/tracking?ticket_id=${ticketId}`, passengerAuth('0912345678'));
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.status, 'success');
      assert.strictEqual(res.body.data.view, 'TICKET');
      assert.strictEqual(res.body.data.target_stop.stop_id, 'stp_hn_gb');
      assert.strictEqual(res.body.data.target_stop.kind, 'PICKUP');
      assert.strictEqual(res.body.data.has_passed_target, true);
      assert.strictEqual(res.body.data.is_at_station, false);
      assert.strictEqual(res.body.data.distance_meters, 0);
      assert.strictEqual(res.body.data.eta_minutes, 0);
      assert.strictEqual(res.body.data.hud_status_text, 'Xe đã qua Bến xe Giáp Bát');
    });

    it('TC-ROUTE-05: The same ticket_id without the owner token gets the public view without the bus', async () => {
      const res = await makeRequest('/api/v1/trips/trp_hn_th_01/tracking?ticket_id=tkt_test_boarded_01');
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.data.view, 'PUBLIC');
      assert.strictEqual(res.body.data.bus_position, null);
      assert.strictEqual(res.body.data.position_hidden, true);
      assert.ok(Array.isArray(res.body.data.stops));
    });
  });
});
