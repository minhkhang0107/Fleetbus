/**
 * Fixed origin and destination of a bus company's line (D135). The office sets the two stations on the web
 * portal; the passenger app then shows them as fixed (no place picker). Companies usually run out and back, so the
 * swap button is on unless the office turns it off (`allow_swap`, D136). Without a setting, passengers pick places.
 */
import { STATIONS_DATABASE } from '../services/passenger/modules/search.js';

const stationOf = (operatorId, id) => STATIONS_DATABASE.find(s => s.station_id === id && (s.operator_ids || []).includes(operatorId)) || null;

/** The company's stations the office may choose from. */
export function endpointChoices(operatorId) {
  return STATIONS_DATABASE.filter(s => (s.operator_ids || []).includes(operatorId)).map(({ station_id, name, city }) => ({ station_id, name, city }));
}

/** Error message for an invalid setting, or null. `null` clears the setting. */
export function validateFixedEndpoints(operatorId, value) {
  if (value === null) return null;
  if (!value || typeof value !== 'object') return 'Thiếu điểm đi và điểm đến';
  const origin = stationOf(operatorId, value.origin_station_id);
  const destination = stationOf(operatorId, value.destination_station_id);
  if (!origin || !destination) return 'Điểm đi và điểm đến phải là bến của nhà xe';
  if (origin.city === destination.city) return 'Điểm đi và điểm đến phải ở hai tỉnh/thành khác nhau';
  if (value.allow_swap !== undefined && typeof value.allow_swap !== 'boolean') return 'Cho đổi chiều phải là true hoặc false';
  return null;
}

/**
 * What the passenger app gets: both stations with their city, and whether each direction has a schedule.
 * `serves(originCity, destinationCity)` says whether a schedule of the company runs that way.
 */
export function publicFixedEndpoints(operatorId, config, serves) {
  const value = config?.fixed_endpoints;
  if (!value) return null;
  const origin = stationOf(operatorId, value.origin_station_id);
  const destination = stationOf(operatorId, value.destination_station_id);
  if (!origin || !destination) return null;
  const view = (s) => ({ station_id: s.station_id, name: s.name, city: s.city });
  return {
    origin: view(origin),
    destination: view(destination),
    // The office's choice (D136); the availability flags only inform the app and the office.
    allow_swap: value.allow_swap !== false,
    forward_available: serves(origin.city, destination.city),
    reverse_available: serves(destination.city, origin.city)
  };
}
