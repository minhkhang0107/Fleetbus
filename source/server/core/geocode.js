/**
 * Address of a map point for the home pickup form (D187): the passenger who uses "my location" gets a readable
 * street address instead of coordinates. Nominatim (OpenStreetMap) by default, another compatible service through
 * FLEETBUS_GEOCODE_URL. Answers are cached and calls spaced one second apart, as the public service asks.
 */

const DEFAULT_URL = 'https://nominatim.openstreetmap.org/reverse';
const MIN_GAP_MS = 1000;
const TIMEOUT_MS = 4000;
const CACHE_SIZE = 2000;

/** "12 Ngõ 34 Giải Phóng, Phương Liệt, Hoàng Mai, Hà Nội" from a Nominatim answer; null when it names nothing. */
export function shortAddress(answer) {
  const a = answer?.address;
  if (!a) return null;
  const street = [a.house_number, a.road || a.pedestrian || a.footway].filter(Boolean).join(' ');
  // Since 2025 an address is street, ward, province; older data still names a district or a quarter.
  const parts = [
    street || a.amenity || a.building || a.historic,
    a.quarter || a.suburb || a.neighbourhood || a.village || a.hamlet,
    a.city_district || a.district || a.county || a.town,
    a.city,
    a.state
  ].filter(Boolean);
  // "Phương Liệt" is dropped next to "Phường Phương Liệt"; the same name twice once.
  const kept = parts.filter((p, i) => parts.indexOf(p) === i && !parts.some(q => q !== p && q.includes(p)));
  return kept.length ? kept.join(', ').slice(0, 200) : null;
}

export function createGeocoder({ fetchImpl = globalThis.fetch, env = process.env, now = () => Date.now(), sleep = (ms) => new Promise(r => setTimeout(r, ms)) } = {}) {
  const url = env.FLEETBUS_GEOCODE_URL || DEFAULT_URL;
  const contact = env.FLEETBUS_PRIVACY_EMAIL || 'mjnhkhang1@gmail.com';
  const cache = new Map();
  let queue = Promise.resolve();
  let lastCall = -Infinity;

  async function call(lat, lng) {
    const wait = lastCall + MIN_GAP_MS - now();
    if (wait > 0) await sleep(wait);
    lastCall = now();
    const query = new URLSearchParams({ format: 'jsonv2', lat: String(lat), lon: String(lng), zoom: '18', addressdetails: '1', 'accept-language': 'vi' });
    const res = await fetchImpl(`${url}?${query}`, { headers: { 'User-Agent': `BusGo/1.0 (${contact})` }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new Error(`geocode ${res.status}`);
    return shortAddress(await res.json());
  }

  return {
    /** The address of a point, or null when the service knows none; throws when it cannot be reached. */
    reverse(lat, lng) {
      // About 11 m: two taps on the same house share one call.
      const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
      if (cache.has(key)) return Promise.resolve(cache.get(key));
      const result = queue.then(() => call(lat, lng));
      queue = result.catch(() => {});
      return result.then(address => {
        if (cache.size >= CACHE_SIZE) cache.delete(cache.keys().next().value);
        cache.set(key, address);
        return address;
      });
    }
  };
}
