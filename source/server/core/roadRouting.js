/**
 * Road geometry for a route a company draws itself (D201): the road the bus drives through its stops in order,
 * asked once from an OSRM router when the route is made and kept on the route, so maps, tracking and estimated
 * stop times follow the road instead of a straight line. Off unless ROUTING_URL is set; without it, or when the
 * router does not answer, callers keep the straight line through the stops.
 */
import { calculateHaversineDistance } from './geo.js';

const MAX_POINTS = 25;
let router = null;

/** Replace the router (tests, or another provider). fn(points [[lat, lng]]) → { shape, distance_m, duration_s } | null. */
export function setRoadRouter(fn) {
  router = typeof fn === 'function' ? fn : null;
}

export function roadRoutingEnabled() {
  return Boolean(router);
}

/** A router over the OSRM HTTP API (`/route/v1/driving`). */
export function osrmRouter(baseUrl, { timeoutMs = 10000, fetchImpl = fetch } = {}) {
  const base = String(baseUrl).replace(/\/+$/, '');
  return async (points) => {
    const coords = points.map(([lat, lng]) => `${lng.toFixed(5)},${lat.toFixed(5)}`).join(';');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(`${base}/route/v1/driving/${coords}?overview=full&geometries=geojson`, { signal: controller.signal });
      if (!res.ok) return null;
      const json = await res.json();
      const route = json?.code === 'Ok' ? json.routes?.[0] : null;
      const line = route?.geometry?.coordinates;
      if (!Array.isArray(line) || line.length < 2) return null;
      return { shape: line.map(([lng, lat]) => [lat, lng]), distance_m: route.distance, duration_s: route.duration };
    } finally {
      clearTimeout(timer);
    }
  };
}

/** Douglas–Peucker in metres (equirectangular, fine at route scale): fewer points, same road. */
export function simplifyLine(points, toleranceM = 40) {
  if (points.length <= 2) return points.slice();
  const toXY = ([lat, lng]) => [lng * 111320 * Math.cos(lat * Math.PI / 180), lat * 110540];
  const xy = points.map(toXY);
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = xy[a];
    const [bx, by] = xy[b];
    const len = Math.hypot(bx - ax, by - ay) || 1;
    let far = -1;
    let farDist = toleranceM;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((bx - ax) * (ay - xy[i][1]) - (ax - xy[i][0]) * (by - ay)) / len;
      if (d > farDist) { farDist = d; far = i; }
    }
    if (far > 0) {
      keep[far] = 1;
      stack.push([a, far], [far, b]);
    }
  }
  return points.filter((_, i) => keep[i]).map(([lat, lng]) => [Number(lat.toFixed(5)), Number(lng.toFixed(5))]);
}

/**
 * The road through the points in order, or null (routing off, too few or too many points, router failed or the
 * road it found is absurd: more than 3 times the straight distance).
 */
export async function roadPath(points) {
  const pts = (points || []).filter(p => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]));
  if (!router || pts.length < 2 || pts.length > MAX_POINTS) return null;
  try {
    const result = await router(pts);
    if (!result?.shape || result.shape.length < 2) return null;
    let straight = 0;
    for (let i = 1; i < pts.length; i++) straight += calculateHaversineDistance(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
    if (Number.isFinite(result.distance_m) && straight > 0 && result.distance_m > straight * 3 + 5000) return null;
    return {
      shape: simplifyLine(result.shape),
      distance_km: Number.isFinite(result.distance_m) ? Math.round(result.distance_m / 1000) : null,
      duration_minutes: Number.isFinite(result.duration_s) ? Math.round(result.duration_s / 60) : null
    };
  } catch (_) {
    return null;
  }
}

const MAX_TABLE_POINTS = 26;
let tabler = null;

/** Replace the travel-time table (tests, or another provider). fn(points) → { durations_s[][], distances_m[][] } | null. */
export function setRoadTable(fn) {
  tabler = typeof fn === 'function' ? fn : null;
}

/** A travel-time table over the OSRM HTTP API (`/table/v1/driving`): from every point to every other. */
export function osrmTable(baseUrl, { timeoutMs = 10000, fetchImpl = fetch } = {}) {
  const base = String(baseUrl).replace(/\/+$/, '');
  return async (points) => {
    const coords = points.map(([lat, lng]) => `${lng.toFixed(5)},${lat.toFixed(5)}`).join(';');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(`${base}/table/v1/driving/${coords}?annotations=duration,distance`, { signal: controller.signal });
      if (!res.ok) return null;
      const json = await res.json();
      return json?.code === 'Ok' ? { durations_s: json.durations, distances_m: json.distances } : null;
    } finally {
      clearTimeout(timer);
    }
  };
}

/**
 * D202: car minutes and metres by road from each point to each other ([i][j], one-way streets make it
 * asymmetric), or null when the table is off, fails or has a hole (a point the router cannot reach).
 */
export async function roadTable(points) {
  const pts = (points || []).filter(p => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]));
  if (!tabler || pts.length < 2 || pts.length > MAX_TABLE_POINTS || pts.length !== points.length) return null;
  try {
    const t = await tabler(pts);
    const full = (m) => Array.isArray(m) && m.length === pts.length && m.every(row => Array.isArray(row) && row.length === pts.length && row.every(Number.isFinite));
    if (!t || !full(t.durations_s) || !full(t.distances_m)) return null;
    return {
      minutes: t.durations_s.map(row => row.map(s => s / 60)),
      meters: t.distances_m.map(row => row.map(m => Math.round(m)))
    };
  } catch (_) {
    return null;
  }
}
