/**
 * Home pickup / home drop-off rules of a bus company (spec 3.1-3.3): which modes it offers and the polygon
 * areas it serves, with a fee, a minimum lead time and service hours.
 *
 * Being inside an area does not prove a vehicle can reach an address (narrow lanes, truck bans): the driver
 * can still report the address inaccessible, and the office reassigns the pickup.
 */

export const PICKUP_MODES = ['FIXED_STOP', 'HOME_PICKUP'];
export const DROPOFF_MODES = ['FIXED_LOCATION', 'HOME_DROPOFF'];
export const AREA_KINDS = ['PICKUP', 'DROPOFF'];

const HOURS_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const VN_OFFSET_MS = 7 * 3600 * 1000;

/** Whether (lat, lng) is inside the polygon [[lat, lng], ...]; a point on an edge counts as inside. */
export function pointInPolygon(lat, lng, polygon) {
  if (!Array.isArray(polygon) || polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [yi, xi] = polygon[i];
    const [yj, xj] = polygon[j];
    // On the segment: collinear and within its bounding box.
    const cross = (lng - xi) * (yj - yi) - (lat - yi) * (xj - xi);
    if (Math.abs(cross) < 1e-12 && lng >= Math.min(xi, xj) && lng <= Math.max(xi, xj) && lat >= Math.min(yi, yj) && lat <= Math.max(yi, yj)) {
      return true;
    }
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Error message for an invalid area, or null when it is valid. */
export function validateArea(area) {
  if (!area || typeof area !== 'object') return 'Thiếu thông tin vùng phục vụ';
  if (typeof area.name !== 'string' || !area.name.trim()) return 'Cần tên vùng phục vụ';
  if (!AREA_KINDS.includes(area.kind)) return 'Loại vùng phải là PICKUP hoặc DROPOFF';
  if (!Array.isArray(area.polygon) || area.polygon.length < 3) return 'Vùng phục vụ cần ít nhất 3 điểm';
  const pointOk = (p) => Array.isArray(p) && p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.abs(p[0]) <= 90 && Math.abs(p[1]) <= 180;
  if (!area.polygon.every(pointOk)) return 'Tọa độ vùng phục vụ không hợp lệ';
  if (!Number.isInteger(area.fee_vnd) || area.fee_vnd < 0) return 'Phụ phí phải là số nguyên không âm';
  if (!Number.isInteger(area.lead_time_minutes) || area.lead_time_minutes < 0) return 'Thời gian đặt trước phải là số phút không âm';
  const hours = area.service_hours || {};
  if (!HOURS_RE.test(hours.from || '') || !HOURS_RE.test(hours.to || '')) return 'Giờ phục vụ có dạng HH:MM';
  return null;
}

/** The active area of this kind containing the point; the cheapest one when several do. */
export function findServiceArea(config, kind, lat, lng) {
  const areas = (config?.service_areas || []).filter(a => a.active !== false && a.kind === kind && pointInPolygon(lat, lng, a.polygon));
  return areas.sort((a, b) => a.fee_vnd - b.fee_vnd)[0] || null;
}

const minutesOf = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** Minutes after midnight, Vietnam time, of an instant. */
function vnMinutes(ms) {
  const d = new Date(ms + VN_OFFSET_MS);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

/** Whether a time of day is within [from, to]; a window like 22:00-05:00 crosses midnight. */
function withinHours(minutes, { from, to }) {
  const a = minutesOf(from);
  const b = minutesOf(to);
  return a <= b ? minutes >= a && minutes <= b : minutes >= a || minutes <= b;
}

/**
 * Checks a home pickup (kind PICKUP) or home drop-off (kind DROPOFF) address against the company's config.
 * Lead time and service hours apply to the trip's departure time when it is known.
 */
export function checkHomeService(config, { kind, lat, lng, departureTime = null, now = Date.now() }) {
  const enabled = kind === 'PICKUP' ? (config?.pickup_modes || []).includes('HOME_PICKUP') : (config?.dropoff_modes || []).includes('HOME_DROPOFF');
  if (!enabled) {
    return { ok: false, code: 'MODE_DISABLED', message: kind === 'PICKUP' ? 'Nhà xe chưa hỗ trợ đón tận nhà' : 'Nhà xe chưa hỗ trợ trả tận nhà' };
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { ok: false, code: 'VALIDATION_ERROR', message: 'Cần vị trí trên bản đồ của địa chỉ' };
  }
  const area = findServiceArea(config, kind, lat, lng);
  if (!area) return { ok: false, code: 'OUTSIDE_SERVICE_AREA', message: 'Địa chỉ nằm ngoài vùng phục vụ' };

  const departure = departureTime ? new Date(departureTime).getTime() : NaN;
  if (Number.isFinite(departure)) {
    if (departure - now < area.lead_time_minutes * 60000) {
      return { ok: false, code: 'LEAD_TIME_TOO_SHORT', message: `Cần đặt trước ít nhất ${area.lead_time_minutes} phút` };
    }
    if (!withinHours(vnMinutes(departure), area.service_hours)) {
      return { ok: false, code: 'OUTSIDE_SERVICE_HOURS', message: `Ngoài giờ phục vụ ${kind === 'PICKUP' ? 'đón' : 'trả'} tận nhà (${area.service_hours.from}–${area.service_hours.to})` };
    }
  }
  return { ok: true, area, fee_vnd: area.fee_vnd };
}

/** Error message for an invalid mode change, or null. */
export function validateModes({ pickup_modes: pickup, dropoff_modes: dropoff }) {
  if (!Array.isArray(pickup) || !pickup.length || !pickup.every(m => PICKUP_MODES.includes(m))) return 'Cần ít nhất một hình thức đón hợp lệ';
  if (!Array.isArray(dropoff) || !dropoff.length || !dropoff.every(m => DROPOFF_MODES.includes(m))) return 'Cần ít nhất một hình thức trả hợp lệ';
  return null;
}

/** What passengers may see of the config: modes and active areas. */
export function publicServiceConfig(config) {
  return {
    pickup_modes: [...(config?.pickup_modes || [])],
    dropoff_modes: [...(config?.dropoff_modes || [])],
    allow_home_to_home: Boolean(config?.allow_home_to_home),
    service_areas: (config?.service_areas || []).filter(a => a.active !== false).map(({ area_id, name, kind, polygon, fee_vnd, lead_time_minutes, service_hours }) => ({ area_id, name, kind, polygon, fee_vnd, lead_time_minutes, service_hours }))
  };
}

// A home pickup run reaches the passenger 75 to 30 minutes before the departure (spec adjustment A4).
const PICKUP_WINDOW_START_MIN = 75;
const PICKUP_WINDOW_END_MIN = 30;

function homeInput(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    address: typeof raw.address === 'string' ? raw.address.trim() : '',
    lat: Number(raw.lat),
    lng: Number(raw.lng),
    note: typeof raw.note === 'string' ? raw.note.trim().slice(0, 200) : ''
  };
}

/**
 * Checks the home pickup / drop-off of a booking and returns the snapshots stored on the order and its tickets.
 * A home pickup rides from the trip's first pickup stop, a home drop-off to its last drop-off stop: the seat segment
 * stays a stop-to-stop one. The fee is charged once per order and side.
 */
export function resolveHomeBooking(config, { stops = [], departureTime, pickupStopId, dropoffStopId, homePickup, homeDropoff, now = Date.now() }) {
  const pickup = homeInput(homePickup);
  const dropoff = homeInput(homeDropoff);
  if (!pickup && !dropoff) return { ok: true, home_pickup: null, home_dropoff: null, fee_vnd: 0 };
  if (pickup && dropoff && !config?.allow_home_to_home) {
    return { ok: false, code: 'HOME_TO_HOME_DISABLED', message: 'Nhà xe chưa nhận vừa đón vừa trả tận nhà trên cùng một vé' };
  }

  const result = { ok: true, home_pickup: null, home_dropoff: null, fee_vnd: 0 };
  const sides = [
    ['PICKUP', pickup, stops.find(s => s.pickup_allowed !== false), pickupStopId, 'home_pickup'],
    ['DROPOFF', dropoff, [...stops].reverse().find(s => s.dropoff_allowed !== false), dropoffStopId, 'home_dropoff']
  ];
  for (const [kind, home, anchor, chosenStopId, key] of sides) {
    if (!home) continue;
    if (!home.address) return { ok: false, code: 'VALIDATION_ERROR', message: 'Cần địa chỉ để tài xế tìm được bạn' };
    if (anchor && chosenStopId && chosenStopId !== anchor.stop_id) {
      return {
        ok: false,
        code: 'HOME_STOP_MISMATCH',
        message: kind === 'PICKUP' ? `Đón tận nhà đi từ điểm đầu tuyến (${anchor.name})` : `Trả tận nhà đi đến điểm cuối tuyến (${anchor.name})`
      };
    }
    const check = checkHomeService(config, { kind, lat: home.lat, lng: home.lng, departureTime, now });
    if (!check.ok) return check;
    const snapshot = { ...home, area_id: check.area.area_id, area_name: check.area.name, fee_vnd: check.fee_vnd, anchor_stop_id: anchor?.stop_id || chosenStopId || null };
    if (kind === 'PICKUP') {
      const departure = new Date(departureTime).getTime();
      if (Number.isFinite(departure)) {
        snapshot.window_from = new Date(departure - PICKUP_WINDOW_START_MIN * 60000).toISOString();
        snapshot.window_to = new Date(departure - PICKUP_WINDOW_END_MIN * 60000).toISOString();
      }
    }
    result[key] = snapshot;
    result.fee_vnd += check.fee_vnd;
  }
  return result;
}
