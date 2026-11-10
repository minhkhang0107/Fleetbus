import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert';
import { homeAppointments, homeOrder, homeRunMap, homeRoadStale, refreshHomeRoad, HOME_COACH_FACTOR, HOME_DWELL_MINUTES } from '../../source/server/core/homeRun.js';
import { setRoadRouter, setRoadTable } from '../../source/server/core/roadRouting.js';
import { stopCoords } from '../../source/server/core/geo.js';

/** D202: the home run ordered and timed by road, and drawn on the map. */
describe('Home run by road (D202)', () => {
  const FROM = Date.parse('2026-11-20T15:00:00.000Z');
  const home = (id, lat, lng, seat = id.toUpperCase()) => ({
    ticket_id: id,
    seat_code: seat,
    boarding_status: 'NOT_BOARDED',
    home_pickup: { status: 'CONFIRMED', lat, lng, address: `Nhà ${id}`, window_from: new Date(FROM).toISOString(), window_to: new Date(FROM + 3600000).toISOString() }
  });
  const trip = (manifest) => ({ trip_id: 'trp_home_road', planned_departure_time: '2026-11-20T23:30:00+07:00', stops: [{ stop_id: 'stp_hn_gb', name: 'Bến xe Giáp Bát' }], manifest });
  const end = stopCoords('stp_hn_gb');
  const sameAs = (a, b) => Math.abs(a[0] - b.lat) < 1e-6 && Math.abs(a[1] - b.lng) < 1e-6;

  // A table from a function of the two points (minutes); metres = minutes x 500.
  const tableOf = (minutesFn) => async (pts) => {
    const durations_s = pts.map(a => pts.map(b => (a === b ? 0 : minutesFn(a, b) * 60)));
    return { durations_s, distances_m: durations_s.map(r => r.map(s => (s / 60) * 500)) };
  };
  const straight = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) * 300;

  afterEach(() => {
    setRoadTable(null);
    setRoadRouter(null);
  });

  it('TC-HOME-ROAD-01: a one-way street changes the order the bus takes', async () => {
    // Three doors in a line north of the bus station: straight lines say far, middle, near.
    const t = trip([home('far', 21.06, 105.84), home('mid', 21.04, 105.84), home('near', 21.02, 105.84)]);
    assert.deepStrictEqual(homeOrder(t).map(p => p.ticket_id), ['far', 'mid', 'near']);
    // By road, mid -> near is a long way round (one-way, 60 min): mid, far, near takes 30 min to the station
    // (6 + 12 + 12) against 78 for the straight-line order (6 + 60 + 12).
    const isPt = (p, lat) => Math.abs(p[0] - lat) < 1e-6;
    setRoadTable(tableOf((a, b) => (isPt(a, 21.04) && isPt(b, 21.02) ? 60 : straight(a, b))));
    assert.strictEqual(await refreshHomeRoad(t), true);
    assert.deepStrictEqual(homeOrder(t).map(p => p.ticket_id), ['mid', 'far', 'near']);
    assert.strictEqual(homeRunMap(t).source, 'ROAD');
  });

  it('TC-HOME-ROAD-02: the order is the shortest of all orders (checked against every permutation)', async () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const t = trip(ids.map((id, i) => home(id, 21 + i * 0.01, 105.8 + ((i * 7) % 5) * 0.01)));
    // Asymmetric, irregular minutes from a fixed seed.
    const rnd = (a, b) => 3 + ((Math.round(a[0] * 1e4) * 31 + Math.round(b[1] * 1e4) * 17 + Math.round(a[1] * 1e4) * 7) % 23);
    setRoadTable(tableOf(rnd));
    await refreshHomeRoad(t);
    const pt = (id) => t.manifest.find(p => p.ticket_id === id).home_pickup;
    const cost = (order) => order.reduce((sum, id, k) => sum + rnd([pt(id).lat, pt(id).lng], k + 1 < order.length ? [pt(order[k + 1]).lat, pt(order[k + 1]).lng] : [end.lat, end.lng]), 0);
    const perms = (list) => (list.length <= 1 ? [list] : list.flatMap((x, i) => perms([...list.slice(0, i), ...list.slice(i + 1)]).map(p => [x, ...p])));
    const best = Math.min(...perms(ids).map(cost));
    assert.strictEqual(cost(homeOrder(t).map(p => p.ticket_id)), best);
  });

  it('TC-HOME-ROAD-03: appointments count the road minutes of a coach and a stop at each door', async () => {
    const t = trip([home('x', 21.03, 105.85), home('y', 21.01, 105.85)]);
    setRoadTable(tableOf(() => 10));
    await refreshHomeRoad(t);
    const order = homeOrder(t).map(p => p.ticket_id);
    const times = homeAppointments(t, { now: FROM - 3600000 });
    const gap = (Date.parse(times[order[1]]) - Date.parse(times[order[0]])) / 60000;
    const expected = 10 * HOME_COACH_FACTOR + HOME_DWELL_MINUTES;
    assert.ok(gap >= expected && gap < expected + 5, `gap ${gap} min (rounded up to 5 minutes)`);
  });

  it('TC-HOME-ROAD-04: the map numbers the doors, puts tickets of one door together and follows the road', async () => {
    const t = trip([home('p1', 21.03, 105.85, 'A1'), home('p2', 21.03, 105.85, 'A2'), home('q', 21.01, 105.86)]);
    setRoadTable(tableOf(straight));
    let routed = null;
    setRoadRouter(async (pts) => {
      routed = pts;
      return { shape: [pts[0], [21.02, 105.9], ...pts.slice(1)], distance_m: 9000, duration_s: 900 };
    });
    await refreshHomeRoad(t);
    const map = homeRunMap(t);
    assert.strictEqual(map.doors.length, 2);
    const shared = map.doors.find(d => d.ticket_ids.length === 2);
    assert.deepStrictEqual(shared.seats, ['A1', 'A2']);
    assert.deepStrictEqual(map.doors.map(d => d.position), [1, 2]);
    assert.strictEqual(map.end.name, 'Bến xe Giáp Bát');
    assert.strictEqual(map.line_on_road, true);
    assert.strictEqual(map.distance_km, 9);
    assert.strictEqual(routed.length, 3, 'two doors and the bus station');
    assert.ok(sameAs(routed[2], end), 'the road ends at the first stop');

    assert.deepStrictEqual(map.doors.map(d => d.next), [true, false]);

    // Picked up: the map keeps only the doors left, with their numbers in the run list, and the road is asked
    // again for them.
    const firstDoor = map.doors[0];
    t.manifest.filter(p => firstDoor.ticket_ids.includes(p.ticket_id)).forEach(p => { p.boarding_status = 'BOARDED'; });
    assert.strictEqual(homeRoadStale(t), true);
    await refreshHomeRoad(t);
    const left = homeRunMap(t).doors;
    assert.strictEqual(left.length, 1);
    assert.strictEqual(left[0].position, 2, 'still #2, as in the list');
    assert.strictEqual(left[0].next, true);
  });

  it('TC-HOME-ROAD-05: a driver order slower than the best one says by how many minutes', async () => {
    const t = trip([home('far', 21.06, 105.84), home('mid', 21.04, 105.84), home('near', 21.02, 105.84)]);
    setRoadTable(tableOf(straight));
    await refreshHomeRoad(t);
    assert.strictEqual(homeRunMap(t).slower_than_best_minutes, 0);
    t.home_order = ['near', 'far', 'mid'];
    assert.ok(homeRunMap(t).slower_than_best_minutes > 0);
    // Once the run started the order is the driver's (frozen at the start): still told when it is slower.
    t.home_run_started_at = new Date(FROM).toISOString();
    assert.ok(homeRunMap(t).slower_than_best_minutes > 0);
  });

  it('TC-HOME-ROAD-06: without a road table the straight-line plan stays, and it is asked again later', async () => {
    const t = trip([home('far', 21.06, 105.84), home('mid', 21.04, 105.84)]);
    setRoadTable(async () => { throw new Error('down'); });
    await refreshHomeRoad(t, FROM);
    assert.strictEqual(homeRunMap(t).source, 'STRAIGHT');
    assert.strictEqual(homeRunMap(t).line_on_road, false);
    assert.deepStrictEqual(homeOrder(t).map(p => p.ticket_id), ['far', 'mid']);
    assert.strictEqual(homeRoadStale(t, FROM + 60000), false, 'not asked again at once');
    assert.strictEqual(homeRoadStale(t, FROM + 11 * 60000), true, 'asked again after 10 minutes');
  });

  it('TC-HOME-ROAD-07: a long run (more than 11 doors) still gets every door once', async () => {
    const t = trip(Array.from({ length: 15 }, (_, i) => home(`h${i}`, 21 + (i % 5) * 0.01, 105.8 + Math.floor(i / 5) * 0.02)));
    setRoadTable(tableOf(straight));
    await refreshHomeRoad(t);
    const order = homeOrder(t).map(p => p.ticket_id);
    assert.strictEqual(order.length, 15);
    assert.strictEqual(new Set(order).size, 15);
  });
});
