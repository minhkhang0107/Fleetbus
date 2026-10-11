/**
 * The stops of a trip as its bus company set them for the route (route_configs[routeId].stops): planned time at
 * each stop, pickup / drop-off allowed, hidden from passengers. Stops are never removed from the list, because
 * the seat inventory counts segments by stop position: a hidden stop simply allows no pickup and no drop-off.
 */
import { projectOnShape, routeShape, stopCoords } from './geo.js';

const MAX_OFFSET = 24 * 60;

/** Minutes after departure at each stop: the company's figure, else the share of the road driven, else even. */
function estimatedOffsets(trip) {
  const stops = trip.stops || [];
  const duration = Math.max(0, (Date.parse(trip.arrival_time) - Date.parse(trip.departure_time)) / 60000) || trip.duration_minutes || 0;
  const n = stops.length;
  const even = stops.map((_, i) => (n > 1 ? Math.round((duration * i) / (n - 1)) : 0));
  const shape = routeShape(trip.schedule_id || trip.trip_id);
  if (!shape || shape.length < 2) return even;
  const along = stops.map(s => {
    const c = stopCoords(s.stop_id) || (Number.isFinite(s.lat) && Number.isFinite(s.lng) ? s : null);
    return c ? projectOnShape(shape, c.lat, c.lng).along_m : null;
  });
  const first = along[0];
  const last = along[n - 1];
  if (along.some(a => a === null) || !(last > first)) return even;
  return along.map(a => Math.round((duration * (a - first)) / (last - first)));
}

/** The trip's stops with planned_time, offset_minutes, time_source, hidden and the allowed flags of the route. */
export function effectiveStops(trip, routeSettings = {}) {
  const own = routeSettings?.stops || {};
  const estimate = estimatedOffsets(trip);
  const departure = Date.parse(trip.departure_time);
  return (trip.stops || []).map((s, i) => {
    const set = own[s.stop_id] || {};
    const hidden = set.hidden === true;
    const offset = i === 0 ? 0 : (Number.isInteger(set.offset_minutes) ? set.offset_minutes : estimate[i]);
    return {
      ...s,
      pickup_allowed: hidden ? false : (set.pickup ?? s.pickup_allowed),
      dropoff_allowed: hidden ? false : (set.dropoff ?? s.dropoff_allowed),
      hidden,
      offset_minutes: offset,
      time_source: i === 0 || Number.isInteger(set.offset_minutes) ? 'OPERATOR' : 'ESTIMATED',
      planned_time: Number.isFinite(departure) ? new Date(departure + offset * 60000).toISOString() : null
    };
  });
}

/** Error message for the stop settings of a route, given its stops in order, or null. */
export function validateRouteStops(settings, stops) {
  if (settings == null) return null;
  if (typeof settings !== 'object' || Array.isArray(settings)) return 'Cấu hình điểm dừng không hợp lệ';
  const ids = stops.map(s => s.stop_id);
  for (const [id, set] of Object.entries(settings)) {
    if (!ids.includes(id)) return `Tuyến không có điểm ${id}`;
    if (!set || typeof set !== 'object') return `Cấu hình điểm ${id} không hợp lệ`;
    const unknown = Object.keys(set).filter(k => !['offset_minutes', 'pickup', 'dropoff', 'hidden'].includes(k));
    if (unknown.length) return `Không có trường ${unknown.join(', ')}`;
    if (set.offset_minutes != null && (!Number.isInteger(set.offset_minutes) || set.offset_minutes < 0 || set.offset_minutes > MAX_OFFSET)) return 'Giờ đến là số phút từ 0 đến 1440 sau giờ xuất bến';
    for (const k of ['pickup', 'dropoff', 'hidden']) if (set[k] != null && typeof set[k] !== 'boolean') return `${k} phải là true/false`;
  }
  if (settings[ids[0]]?.hidden) return 'Không ẩn được điểm xuất phát';
  // Times entered by the company must not go backwards along the route.
  let previous = 0;
  for (const id of ids.slice(1)) {
    const m = settings[id]?.offset_minutes;
    if (m == null) continue;
    if (m < previous) return 'Giờ đến các điểm phải tăng dần theo thứ tự tuyến';
    previous = m;
  }
  return null;
}
