import { describe, it } from 'node:test';
import assert from 'node:assert';
import { hailFares, haversineMeters } from '../../source/server/core/hailFare.js';
import { DriverCockpitService } from '../../source/server/services/driver/modules/driverService.js';

// D188: a walk-up passenger pays by the distance ridden, not the whole-route fare.
describe('Walk-up (hail) fares by distance (D188)', () => {
  const stops = [{ stop_id: 'a' }, { stop_id: 'b' }, { stop_id: 'c' }, { stop_id: 'd' }];
  // Legs of 10, 30 and 60 km along a straight line: 100 km in all.
  const points = [{ km: 0 }, { km: 10 }, { km: 40 }, { km: 100 }];
  const legKm = (p, q) => (q.km - p.km) * 1000;

  it('prices each drop-off by its share of the route, rounded up to 10.000 đ, between 30 % and the full fare', () => {
    const fares = hailFares(stops, points, 0, 200000, legKm);
    assert.deepStrictEqual(fares, { b: 60000, c: 80000, d: 200000 });
  });

  it('starts from the stop the bus is at', () => {
    const fares = hailFares(stops, points, 1, 200000, legKm);
    assert.deepStrictEqual(fares, { c: 60000, d: 180000 });
  });

  it('charges the trip fare everywhere when a stop has no coordinates', () => {
    const fares = hailFares(stops, [points[0], null, points[2], points[3]], 0, 200000, legKm);
    assert.deepStrictEqual(fares, { b: 200000, c: 200000, d: 200000 });
  });

  it('measures straight-line distance in meters', () => {
    const giapBat = { lat: 20.9806, lng: 105.8413 };
    const ninhBinh = { lat: 20.2531, lng: 105.9745 };
    const km = haversineMeters(giapBat, ninhBinh) / 1000;
    assert.ok(km > 75 && km < 90, `got ${km}`);
  });

  it('the trip sent to the driver lists the fares, and a short ride is sold at its own fare', () => {
    const service = new DriverCockpitService();
    const tripId = 'trp_hn_th_01';
    service.startTrip(tripId);
    const trip = service.getTrip(tripId).data;
    const base = trip.base_fare_vnd;
    const near = trip.stops[1].stop_id;
    const last = trip.stops[trip.stops.length - 1].stop_id;
    assert.ok(trip.hail_fares[near] < base, 'the next stop costs less than the whole route');
    assert.strictEqual(trip.hail_fares[last], base);

    const sold = service.onboardHailPassenger(tripId, { seat_code: 'B05', dropoff_stop_id: near, amount_collected_vnd: trip.hail_fares[near] });
    assert.strictEqual(sold.success, true, sold.error);
    assert.strictEqual(service.getTrip(tripId).data.total_hail_collected_vnd, trip.hail_fares[near]);

    const short = service.onboardHailPassenger(tripId, { seat_code: 'B07', dropoff_stop_id: last, amount_collected_vnd: trip.hail_fares[near] });
    assert.strictEqual(short.code, 'INSUFFICIENT_AMOUNT');
  });

  it('a trip still on the road after midnight stays in the driver list', () => {
    const service = new DriverCockpitService();
    const trip = service.activeTrips.get('trp_hn_th_01');
    trip.planned_departure_time = '2026-10-29T22:00:00+07:00';
    trip.status = 'IN_TRANSIT';
    const now = Date.parse('2026-10-30T01:30:00+07:00');
    const ids = service.getTodayTrips(trip.driver_id, now).data.trips.map(t => t.trip_id);
    assert.ok(ids.includes('trp_hn_th_01'));
  });
});
