/**
 * The home pickup run before departure (D143, D144): in which order the bus collects the home passengers, when
 * each one is expected, and what the passenger answered ("ready", "need a few minutes").
 *
 * The order is the driver's (trip.home_order, ticket ids) when set, else built back from the first stop: the
 * farthest address first, the one nearest the stop last (the bus ends its run there). Each passenger's time
 * counts the addresses before theirs: the road between two addresses is the straight line x HOME_ROAD_FACTOR at
 * city speed, plus a stop at each door.
 */
import { calculateHaversineDistance } from '../services/passenger/core/cryptoEngine.js';
import { homeConfirmed } from './serviceAreas.js';
import { stopCoords } from './geo.js';

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

/** Nearest address next, from [from]. */
function nearestFirst(from, list) {
  const left = [...list];
  const ordered = [];
  let at = from;
  while (left.length) {
    let best = 0;
    if (at) {
      let bestD = Infinity;
      left.forEach((p, i) => {
        const d = roadMeters(at, p.home_pickup);
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
  return byDoor(nearestFirst(firstStopPoint(trip), rest).reverse()).flat();
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
    const leg = roadMeters(at, door[0].home_pickup);
    meters += leg;
    // The bus drives the first leg at its own speed, the next ones at city speed.
    minutes += minutesFor(leg, i === 0 ? pos.speed_kmh : HOME_CITY_SPEED_KMH);
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
    t = t === null ? Math.max(from, now) : t + (minutesFor(roadMeters(at, p.home_pickup), HOME_CITY_SPEED_KMH) + HOME_DWELL_MINUTES) * 60000;
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
    t = t === null ? Date.parse(appointments[door[0].ticket_id]) || now : Math.max(t + minutesFor(roadMeters(at, door[0].home_pickup), HOME_CITY_SPEED_KMH) * 60000, from);
    t += Math.max(...door.map(p => p.home_pickup.arrived_at ? doorMinutes(p, now) : HOME_DWELL_MINUTES)) * 60000;
    at = door[0].home_pickup;
  }
  t += minutesFor(roadMeters(at, end), HOME_CITY_SPEED_KMH) * 60000;
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
