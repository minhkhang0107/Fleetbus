/**
 * The home pickup run before departure (D143, D144): in which order the bus collects the home passengers, when
 * each one is expected, and what the passenger answered ("ready", "need a few minutes").
 *
 * The order is the driver's (trip.home_order, ticket ids) when set, else built back from the first stop: the
 * farthest address first, the one nearest the stop last (the bus ends its run there). Each passenger's time
 * counts the addresses before theirs: the road between two addresses is the straight line x HOME_ROAD_FACTOR at
 * city speed, plus a stop at each door. D202: once the road table of the run is known (refreshHomeRoad), the order
 * is the shortest by road time and every time counts the road, the coach being HOME_COACH_FACTOR slower than a car.
 */
import { calculateHaversineDistance } from '../services/passenger/core/cryptoEngine.js';
import { homeConfirmed } from './serviceAreas.js';
import { stopCoords } from './geo.js';
import { roadPath, roadTable } from './roadRouting.js';

export const HOME_ROAD_FACTOR = 1.3;
/** City speed for the home run, also the floor when the bus is slower (stopped at a door). */
export const HOME_CITY_SPEED_KMH = 20;
/** Time at each door: the passenger walks out, the bags go in. */
export const HOME_DWELL_MINUTES = 3;
/** Within this distance (road) the bus is near the passenger's door: in their lane, time to come out. */
export const HOME_NEAR_METERS = 300;
/** Within this distance (road), and slowed down, the bus is at the passenger's door. */
export const HOME_AT_DOOR_METERS = 50;
/** At or under this speed the bus has pulled up (a bus driving past the door is not at it). */
export const HOME_AT_DOOR_SPEED_KMH = 5;
/** Milestone M2: within these minutes or this road distance the bus is in the passenger's area, time to get the bags ready. */
export const HOME_AREA_MINUTES = 15;
export const HOME_AREA_METERS = 3000;
/** A cached ETA older than this is not used to steady the next one. */
const ETA_CACHE_MS = 2 * 60000;
/** Minutes the bus waits at a door before the driver may go on without the passenger, unless the company sets it. */
export const DEFAULT_HOME_WAIT_MINUTES = 5;
/** What a passenger may ask for before the bus arrives. */
export const READY_OPTIONS = { READY: 0, NEED_2: 2, NEED_5: 5 };

const BLOCKED = ['BOARDED', 'NO_SHOW', 'CANCELLED'];

/** A home pickup the bus still has to collect: confirmed, reachable, not missed, passenger not on board. */
export function isWaitingHome(p) {
  return homeConfirmed(p?.home_pickup) && !p.home_pickup.inaccessible_at && !p.home_pickup.missed_at
    && Number.isFinite(p.home_pickup.lat) && Number.isFinite(p.home_pickup.lng)
    && !BLOCKED.includes(p.boarding_status);
}

const roadMeters = (a, b) => calculateHaversineDistance(a.lat, a.lng, b.lat, b.lng) * HOME_ROAD_FACTOR;
const minutesFor = (meters, speedKmh) => (meters / 1000) / Math.max(speedKmh || 0, HOME_CITY_SPEED_KMH) * 60;

/** D202: a coach in town is slower than the car times of the road table. */
export const HOME_COACH_FACTOR = 1.3;
/** Exact best order up to this many doors (2^n states); a longer run uses nearest next then 2-opt. */
const EXACT_DOORS = 11;
/** The road table of a run is asked again after this long (roadworks, a new bridge). */
const ROAD_TABLE_TTL_MS = 6 * 3600000;
/** After the router did not answer, ask again after this long. */
const ROAD_RETRY_MS = 10 * 60000;

const pointKey = (pt) => `${Number(pt.lat).toFixed(5)},${Number(pt.lng).toFixed(5)}`;

/**
 * Road metres and coach minutes from a to b: from the trip's road table (trip.home_road) when both points are in
 * it, else the straight line x HOME_ROAD_FACTOR at city speed (D143).
 */
function leg(trip, a, b) {
  const t = trip?.home_road;
  const i = t?.index?.[pointKey(a)];
  const j = t?.index?.[pointKey(b)];
  if (i !== undefined && j !== undefined) return { meters: t.meters[i][j], minutes: t.minutes[i][j] * HOME_COACH_FACTOR };
  const meters = roadMeters(a, b);
  return { meters, minutes: minutesFor(meters, HOME_CITY_SPEED_KMH) };
}

/** The trip's first stop, where the home run ends. */
function firstStopPoint(trip) {
  const first = trip.stops?.[0];
  return (first && stopCoords(first.stop_id)) || null;
}

/** Tickets picked up at the same pinned address are one door: one place in the run, one appointment, one wait. */
export function doorKey(p) {
  return `${Number(p.home_pickup.lat).toFixed(5)},${Number(p.home_pickup.lng).toFixed(5)}`;
}

/** [list] cut into doors, in the order each door first appears. */
export function byDoor(list) {
  const doors = new Map();
  for (const p of list) {
    const key = doorKey(p);
    if (!doors.has(key)) doors.set(key, []);
    doors.get(key).push(p);
  }
  return [...doors.values()];
}

/** Place of each ticket's door in [list] (1-based), by ticket id. */
export function doorPositions(list) {
  const positions = {};
  byDoor(list).forEach((door, i) => door.forEach(p => { positions[p.ticket_id] = i + 1; }));
  return positions;
}

/** Nearest address next, from [from] (cost(a, b), straight road metres by default). */
function nearestFirst(from, list, cost = roadMeters) {
  const left = [...list];
  const ordered = [];
  let at = from;
  while (left.length) {
    let best = 0;
    if (at) {
      let bestD = Infinity;
      left.forEach((p, i) => {
        const d = cost(p.home_pickup, at);
        if (d < bestD) { bestD = d; best = i; }
      });
    }
    const next = left.splice(best, 1)[0];
    ordered.push(next);
    at = next.home_pickup;
  }
  return ordered;
}

/**
 * Every confirmed home pickup of the trip in collection order (waiting ones and the ones already done), the
 * driver's order first, then any address added since, nearest next.
 */
export function homeOrder(trip) {
  const all = (trip?.manifest || []).filter(p => homeConfirmed(p.home_pickup) && p.boarding_status !== 'CANCELLED'
    && Number.isFinite(p.home_pickup.lat) && Number.isFinite(p.home_pickup.lng));
  const set = Array.isArray(trip?.home_order) ? trip.home_order : [];
  const chosen = set.map(id => all.find(p => p.ticket_id === id)).filter(Boolean);
  const rest = all.filter(p => !chosen.includes(p));
  // The tickets of one door stay together whatever order the driver set.
  if (chosen.length) return byDoor([...chosen, ...nearestFirst(chosen[chosen.length - 1].home_pickup, rest)]).flat();
  // The run ends at the first stop: built back from it, the farthest address comes first, the nearest last.
  const end = firstStopPoint(trip);
  // D202: with the road table of these doors, the shortest run by road time (one-way streets, bridges).
  const doors = byDoor(rest);
  if (end && covers(trip, [...doors.map(d => d[0].home_pickup), end])) {
    const cost = (a, b) => leg(trip, a, b).minutes;
    return bestRun(doors, end, cost).flat();
  }
  return untangle(byDoor(nearestFirst(end, rest).reverse()), end).flat();
}

/** Whether the trip's road table has every point. */
function covers(trip, points) {
  const index = trip?.home_road?.index;
  return Boolean(index) && points.every(p => index[pointKey(p)] !== undefined);
}

/** Minutes of driving the doors in this order to [end], by cost(a, b). */
function runCost(doors, end, cost) {
  let total = 0;
  doors.forEach((door, k) => { total += cost(door[0].home_pickup, k + 1 < doors.length ? doors[k + 1][0].home_pickup : end); });
  return total;
}

/**
 * The order of doors that ends at [end] with the least cost; the start is open (the bus comes from wherever it
 * is). Exact (Held–Karp, built back from the end) up to EXACT_DOORS doors, else nearest next then 2-opt.
 */
function bestRun(doors, end, cost) {
  const n = doors.length;
  if (n <= 1) return doors;
  if (n > EXACT_DOORS) return untangle(byDoorList(nearestFirst(end, doors.map(d => d[0]), cost).reverse(), doors), end, cost);
  const pt = (k) => doors[k][0].home_pickup;
  const full = (1 << n) - 1;
  // best[mask][j]: least cost of a run that starts at door j, visits the doors in mask, ends at [end].
  const best = Array.from({ length: full + 1 }, () => new Array(n).fill(Infinity));
  const next = Array.from({ length: full + 1 }, () => new Array(n).fill(-1));
  for (let j = 0; j < n; j++) best[1 << j][j] = cost(pt(j), end);
  for (let mask = 1; mask <= full; mask++) {
    for (let j = 0; j < n; j++) {
      if (!(mask & (1 << j)) || best[mask][j] === Infinity) continue;
      for (let k = 0; k < n; k++) {
        if (mask & (1 << k)) continue;
        const m2 = mask | (1 << k);
        const c = best[mask][j] + cost(pt(k), pt(j));
        if (c < best[m2][k]) { best[m2][k] = c; next[m2][k] = j; }
      }
    }
  }
  let j = 0;
  for (let k = 1; k < n; k++) if (best[full][k] < best[full][j]) j = k;
  const order = [];
  let mask = full;
  while (j !== -1) {
    order.push(doors[j]);
    const nj = next[mask][j];
    mask &= ~(1 << j);
    j = nj;
  }
  return order;
}

/** The doors of [doors] in the order their first tickets appear in [tickets]. */
function byDoorList(tickets, doors) {
  return tickets.map(p => doors.find(d => d[0] === p));
}

/**
 * Shortens a run of doors that ends at [end] by reversing stretches of it while that saves road (2-opt). Nearest
 * next alone can cross the city twice (Cầu Giấy, Long Biên, then back to Hoàn Kiếm). The start is open: the bus
 * comes from wherever it is.
 */
function untangle(doors, end, cost = roadMeters) {
  if (!end || doors.length < 3) return doors;
  const at = (k) => (k < doors.length ? doors[k][0].home_pickup : end);
  let better = true;
  while (better) {
    better = false;
    for (let i = 0; i < doors.length - 1; i++) {
      for (let j = i + 1; j < doors.length; j++) {
        // Reversing a stretch reverses its legs too: on one-way streets that changes their cost.
        const stretch = (from, to, step) => {
          let c = 0;
          for (let k = from; k !== to; k += step) c += cost(at(k), at(k + step));
          return c;
        };
        const before = (i > 0 ? cost(at(i - 1), at(i)) : 0) + stretch(i, j, 1) + cost(at(j), at(j + 1));
        const after = (i > 0 ? cost(at(i - 1), at(j)) : 0) + stretch(j, i, -1) + cost(at(i), at(j + 1));
        if (after + 1e-6 < before - (cost === roadMeters ? 1 : 0)) {
          doors.splice(i, j - i + 1, ...doors.slice(i, j + 1).reverse());
          better = true;
        }
      }
    }
  }
  return doors;
}

/** Waiting home pickups only, in collection order. */
export function homeQueue(trip) {
  return homeOrder(trip).filter(isWaitingHome);
}

/** Extra minutes a passenger asked for, still running at [now]. */
function askedMinutesLeft(p, now) {
  const r = p.pickup_ready;
  if (!r || r.status === 'READY' || !Number.isFinite(r.minutes)) return 0;
  return Math.max(0, r.minutes - (now - Date.parse(r.at)) / 60000);
}

/** Minutes the bus spends at the door of [p]: the dwell, or longer when the bus waits there or they asked for time. */
function doorMinutes(p, now) {
  const arrived = p.home_pickup?.arrived_at ? (now - Date.parse(p.home_pickup.arrived_at)) / 60000 : 0;
  return Math.max(HOME_DWELL_MINUTES - arrived, askedMinutesLeft(p, now), 0);
}

/**
 * Whole minutes to show, steadied against the last ones shown for the ticket (trip.cached_etas): a new estimate
 * less than a minute above the shown number is GPS noise, so the number keeps counting down instead of going
 * 4 -> 5 -> 4. A real delay (a minute or more) shows at once.
 */
function steadyEtaMinutes(trip, ticketId, minutes, now) {
  const rounded = Math.max(0, Math.round(minutes));
  if (!trip) return rounded;
  const prev = trip.cached_etas?.[ticketId];
  const fresh = prev && Number.isFinite(prev.minutes) && now >= prev.at && now - prev.at <= ETA_CACHE_MS;
  const shown = fresh && rounded > prev.minutes && minutes - prev.minutes < 1 ? prev.minutes : rounded;
  trip.cached_etas = { ...trip.cached_etas, [ticketId]: { minutes: shown, at: now } };
  return shown;
}

/**
 * The passenger's place in the run and the minutes until the bus is at their door, from the bus position [pos]
 * ({lat, lng, speed_kmh}). Every door before theirs counts its stop: the dwell left, or the minutes that passenger
 * asked for. Null when the ticket is not a waiting home pickup or the bus position is unknown.
 */
export function homeEta(trip, ticketId, pos, now = Date.now()) {
  const doors = byDoor(homeQueue(trip));
  const index = doors.findIndex(door => door.some(p => p.ticket_id === ticketId));
  if (index < 0 || !pos || !Number.isFinite(pos.lat)) return null;
  let at = { lat: pos.lat, lng: pos.lng };
  let minutes = 0;
  let meters = 0;
  for (let i = 0; i <= index; i++) {
    const door = doors[i];
    // The bus drives the first leg (from where it is) at its own speed; the next ones by the road table.
    if (i === 0) {
      const first = roadMeters(at, door[0].home_pickup);
      meters += first;
      minutes += minutesFor(first, pos.speed_kmh);
    } else {
      const l = leg(trip, at, door[0].home_pickup);
      meters += l.meters;
      minutes += l.minutes;
    }
    // One stop per door: the bus leaves when the slowest of its passengers is in.
    if (i < index) minutes += Math.max(...door.map(p => doorMinutes(p, now)));
    at = door[0].home_pickup;
  }
  const direct = roadMeters(pos, doors[index][0].home_pickup);
  const pulledUp = pos.speed_kmh == null || pos.speed_kmh <= HOME_AT_DOOR_SPEED_KMH;
  return {
    position: index + 1,
    ahead: index,
    total: doors.length,
    eta_minutes: steadyEtaMinutes(trip, ticketId, minutes, now),
    road_meters: Math.round(meters),
    direct_meters: Math.round(direct),
    near_door: direct <= HOME_NEAR_METERS,
    at_door: index === 0 && direct <= HOME_AT_DOOR_METERS && pulledUp
  };
}

/**
 * The time each home passenger is given (ISO by ticket id): the first door when the bus can be there (the opening
 * of the window, or now when the run starts later), each next one after the road and a stop. A run too long for
 * the window gets its real times, past the window's end, rather than a time the bus cannot keep; homeRunOutlook
 * warns the driver. Frozen once the run starts.
 */
export function homeAppointments(trip, { fresh = false, now = Date.now() } = {}) {
  if (!fresh && trip?.home_appointments && trip.home_run_started_at) return trip.home_appointments;
  const order = homeOrder(trip).filter(p => homeConfirmed(p.home_pickup) && !p.home_pickup.inaccessible_at);
  const result = {};
  let at = null;
  let t = null;
  let lastDoor = null;
  for (const p of order) {
    const from = Date.parse(p.home_pickup.window_from || '');
    if (!Number.isFinite(from)) continue;
    // Same door as the ticket before: same time, no road and no second stop.
    if (lastDoor && doorKey(p) === lastDoor.key) {
      result[p.ticket_id] = lastDoor.at;
      continue;
    }
    t = t === null ? Math.max(from, now) : t + (leg(trip, at, p.home_pickup).minutes + HOME_DWELL_MINUTES) * 60000;
    t = Math.max(t, from);
    // Rounded to the next 5 minutes: an appointment people can remember.
    result[p.ticket_id] = new Date(Math.ceil(t / 300000) * 300000).toISOString();
    lastDoor = { key: doorKey(p), at: result[p.ticket_id] };
    at = p.home_pickup;
  }
  return result;
}

/**
 * Whether the run still fits (ISO back_at, minutes late for departure, tickets given a time past their window):
 * from the bus position once it set off (else from the first appointment), through the doors still waiting, to the
 * first stop. Null without waiting doors, a first stop or a departure time.
 */
export function homeRunOutlook(trip, now = Date.now()) {
  const departure = Date.parse(trip?.planned_departure_time || '');
  const end = firstStopPoint(trip);
  const queue = homeQueue(trip);
  if (!queue.length || !end || !Number.isFinite(departure)) return null;
  const appointments = homeAppointments(trip, { now });
  const live = trip.home_run_started_at && Number.isFinite(trip.current_lat) && Number.isFinite(trip.current_lng);
  let at = live ? { lat: trip.current_lat, lng: trip.current_lng } : null;
  let t = live ? now : null;
  for (const door of byDoor(queue)) {
    const from = Date.parse(door[0].home_pickup.window_from || '') || 0;
    t = t === null ? Date.parse(appointments[door[0].ticket_id]) || now : Math.max(t + leg(trip, at, door[0].home_pickup).minutes * 60000, from);
    t += Math.max(...door.map(p => p.home_pickup.arrived_at ? doorMinutes(p, now) : HOME_DWELL_MINUTES)) * 60000;
    at = door[0].home_pickup;
  }
  t += leg(trip, at, end).minutes * 60000;
  return {
    back_at: new Date(t).toISOString(),
    late_departure_minutes: Math.max(0, Math.round((t - departure) / 60000)),
    past_window: queue.filter(p => Date.parse(appointments[p.ticket_id]) > Date.parse(p.home_pickup.window_to || '')).map(p => p.ticket_id)
  };
}

/** Minutes the bus waits at a door for this company. */
export function homeWaitMinutes(config) {
  const v = config?.home_wait_minutes;
  return Number.isInteger(v) && v >= 1 && v <= 30 ? v : DEFAULT_HOME_WAIT_MINUTES;
}

/** When the driver may go on without the passenger (ISO), or null before the bus is at the door. */
export function missableAt(p, config) {
  if (!p?.home_pickup?.arrived_at) return null;
  return new Date(Date.parse(p.home_pickup.arrived_at) + homeWaitMinutes(config) * 60000).toISOString();
}

/** Confirmed home doors of the trip (done ones too) and its first stop, the points of its road table. */
function roadPoints(trip) {
  const all = (trip?.manifest || []).filter(p => homeConfirmed(p.home_pickup) && p.boarding_status !== 'CANCELLED'
    && Number.isFinite(p.home_pickup.lat) && Number.isFinite(p.home_pickup.lng));
  const end = firstStopPoint(trip);
  if (!end || !all.length) return null;
  return [...byDoor(all).map(d => d[0].home_pickup), end];
}

/** The waiting doors in collection order then the first stop: the road the bus still has to drive. */
function remainingPoints(trip) {
  const end = firstStopPoint(trip);
  const doors = byDoor(homeQueue(trip));
  return end && doors.length ? [...doors.map(d => d[0].home_pickup), end] : null;
}

/** Whether refreshHomeRoad has something to do (cheap: the app polls through it). */
export function homeRoadStale(trip, now = Date.now()) {
  const pts = roadPoints(trip);
  if (!pts) return false;
  const key = pts.map(pointKey).sort().join('|');
  if (trip.home_road?.key !== key || now - (trip.home_road?.at || 0) > ROAD_TABLE_TTL_MS) return true;
  const rest = remainingPoints(trip);
  return Boolean(rest) && trip.home_road_line?.key !== rest.map(pointKey).join('>');
}

/**
 * D202: asks the road table of the run's doors and its first stop (kept on trip.home_road, used by the order and
 * every time) and the road the bus still drives through the waiting doors in order (trip.home_road_line, for the
 * maps). Without an answer the straight-line estimates stay. Returns whether something changed.
 */
export async function refreshHomeRoad(trip, now = Date.now()) {
  const pts = roadPoints(trip);
  if (!pts) return false;
  let changed = false;
  const key = pts.map(pointKey).sort().join('|');
  if (trip.home_road?.key !== key || now - (trip.home_road?.at || 0) > ROAD_TABLE_TTL_MS) {
    const table = await roadTable(pts.map(p => [p.lat, p.lng]));
    // No answer: keep the table of the same doors if there is one, else remember the miss (asked again later);
    // a table of other doors would mix road and straight-line legs.
    trip.home_road = table
      ? { key, at: now, index: Object.fromEntries(pts.map((p, i) => [pointKey(p), i])), minutes: table.minutes, meters: table.meters }
      : (trip.home_road?.key === key && trip.home_road.index ? { ...trip.home_road, at: now } : { key, at: now - ROAD_TABLE_TTL_MS + ROAD_RETRY_MS, index: null });
    changed = true;
  }
  const rest = remainingPoints(trip);
  const lineKey = rest ? rest.map(pointKey).join('>') : null;
  if (trip.home_road_line?.key !== lineKey) {
    const road = rest && rest.length >= 2 ? await roadPath(rest.map(p => [p.lat, p.lng])) : null;
    trip.home_road_line = lineKey ? { key: lineKey, shape: road?.shape || null, distance_km: road?.distance_km ?? null } : null;
    changed = true;
  }
  return changed;
}

/**
 * The home run as a map (D202): each waiting door with its place in the run, the first stop where the run ends,
 * the road through them (or straight lines when the road is not known), the kilometres, and how many minutes
 * the driver's own order costs more than the shortest one.
 */
export function homeRunMap(trip) {
  const queue = homeQueue(trip);
  const end = firstStopPoint(trip);
  if (!queue.length || !end) return null;
  const doors = byDoor(queue);
  const rest = [...doors.map(d => d[0].home_pickup), end];
  const lineKey = rest.map(pointKey).join('>');
  const roadLine = trip.home_road_line?.key === lineKey ? trip.home_road_line : null;
  const byRoad = covers(trip, rest);
  let total = 0;
  for (let k = 0; k + 1 < rest.length; k++) total += leg(trip, rest[k], rest[k + 1]).meters;
  let extra = 0;
  // Also on the road: the driver may still reorder the doors left (D144), from wherever the bus is.
  if (byRoad && Array.isArray(trip.home_order) && doors.length >= 2) {
    const cost = (a, b) => leg(trip, a, b).minutes;
    extra = Math.max(0, Math.round(runCost(doors, end, cost) - runCost(bestRun(doors, end, cost), end, cost)));
  }
  const first = trip.stops?.[0];
  // The same numbers as the run list (doors already collected keep theirs), so "3" on the map is #3 in the list.
  const positions = doorPositions(homeOrder(trip));
  return {
    source: byRoad ? 'ROAD' : 'STRAIGHT',
    doors: doors.map((door, i) => ({
      position: positions[door[0].ticket_id] || i + 1,
      next: i === 0,
      lat: door[0].home_pickup.lat,
      lng: door[0].home_pickup.lng,
      address: door[0].home_pickup.address || null,
      ticket_ids: door.map(p => p.ticket_id),
      seats: door.map(p => p.seat_code).filter(Boolean)
    })),
    end: { stop_id: first?.stop_id || null, name: first?.name || null, lat: end.lat, lng: end.lng },
    line: roadLine?.shape || rest.map(p => [p.lat, p.lng]),
    line_on_road: Boolean(roadLine?.shape),
    distance_km: Math.round((roadLine?.distance_km ?? total / 1000) * 10) / 10,
    slower_than_best_minutes: extra
  };
}
