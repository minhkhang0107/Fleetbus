/**
 * Walk-up (hail) fares by distance (D188). A passenger who waves the bus down pays the trip fare in
 * proportion to the distance they ride, rounded up to 10.000 đ, never under 30 % of the trip fare
 * and never over it. Without stop coordinates every drop-off costs the trip fare, as before.
 */

const ROUND_TO = 10000;
const MIN_SHARE = 0.3;

const roundUp = (amount) => Math.ceil(amount / ROUND_TO) * ROUND_TO;

/** Straight-line distance in meters between two { lat, lng } points. */
export function haversineMeters(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

/**
 * The fare from the stop at `fromIndex` to each later stop, as { stop_id: fare }.
 * `points` holds each stop's { lat, lng } (or null); `legMeters(a, b)` measures one leg and may return null.
 */
export function hailFares(stops, points, fromIndex, baseFare, legMeters = haversineMeters) {
  const fares = {};
  const later = stops.slice(fromIndex + 1);
  const flat = () => {
    for (const s of later) fares[s.stop_id] = baseFare;
    return fares;
  };
  if (!baseFare || stops.length < 2 || points.some(p => !p)) return flat();

  const along = [0];
  for (let i = 1; i < stops.length; i++) {
    const leg = legMeters(points[i - 1], points[i]);
    if (leg === null || leg === undefined || !Number.isFinite(leg)) return flat();
    along.push(along[i - 1] + leg);
  }
  const total = along[along.length - 1];
  if (total <= 0) return flat();

  const floor = Math.min(baseFare, roundUp(baseFare * MIN_SHARE));
  for (let i = fromIndex + 1; i < stops.length; i++) {
    const share = (along[i] - along[fromIndex]) / total;
    fares[stops[i].stop_id] = Math.min(baseFare, Math.max(floor, roundUp(baseFare * share)));
  }
  return fares;
}
