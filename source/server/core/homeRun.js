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
/** Within this distance the bus is at the passenger's door. */
export const HOME_AT_DOOR_METERS = 300;
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
  if (chosen.length) return [...chosen, ...nearestFirst(chosen[chosen.length - 1].home_pickup, rest)];
  // The run ends at the first stop: built back from it, the farthest address comes first, the nearest last.
  return nearestFirst(firstStopPoint(trip), rest).reverse();
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
 * The passenger's place in the run and the minutes until the bus is at their door, from the bus position [pos]
 * ({lat, lng, speed_kmh}). Null when the ticket is not a waiting home pickup or the bus position is unknown.
 */
export function homeEta(trip, ticketId, pos, now = Date.now()) {
  const queue = homeQueue(trip);
  const index = queue.findIndex(p => p.ticket_id === ticketId);
  if (index < 0 || !pos || !Number.isFinite(pos.lat)) return null;
  let at = { lat: pos.lat, lng: pos.lng };
  let minutes = 0;
  let meters = 0;
  for (let i = 0; i <= index; i++) {
    const p = queue[i];
    const leg = roadMeters(at, p.home_pickup);
    meters += leg;
    // The bus drives the first leg at its own speed, the next ones at city speed.
    minutes += minutesFor(leg, i === 0 ? pos.speed_kmh : HOME_CITY_SPEED_KMH);
    if (i < index) minutes += doorMinutes(p, now);
    at = p.home_pickup;
  }
  const direct = roadMeters(pos, queue[index].home_pickup);
  return {
    position: index + 1,
    ahead: index,
    total: queue.length,
    eta_minutes: Math.max(0, Math.round(minutes)),
    road_meters: Math.round(meters),
    direct_meters: Math.round(direct),
    at_door: index === 0 && direct <= HOME_AT_DOOR_METERS
  };
}

/**
 * The time each home passenger is given before the run (ISO by ticket id): the first door at the opening of the
 * window, each next one after the road and a stop, never past the window's end. Frozen once the run starts.
 */
export function homeAppointments(trip, { fresh = false } = {}) {
  if (!fresh && trip?.home_appointments && trip.home_run_started_at) return trip.home_appointments;
  const order = homeOrder(trip).filter(p => homeConfirmed(p.home_pickup) && !p.home_pickup.inaccessible_at);
  const result = {};
  let at = null;
  let t = null;
  for (const p of order) {
    const from = Date.parse(p.home_pickup.window_from || '');
    const to = Date.parse(p.home_pickup.window_to || '');
    if (!Number.isFinite(from)) continue;
    t = t === null ? from : t + (minutesFor(roadMeters(at, p.home_pickup), HOME_CITY_SPEED_KMH) + HOME_DWELL_MINUTES) * 60000;
    t = Math.max(t, from);
    if (Number.isFinite(to)) t = Math.min(t, to);
    // Rounded to the next 5 minutes: an appointment people can remember.
    const rounded = Math.ceil(t / 300000) * 300000;
    result[p.ticket_id] = new Date(Number.isFinite(to) ? Math.min(rounded, to) : rounded).toISOString();
    at = p.home_pickup;
  }
  return result;
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
