/**
 * GET /api/v1/geocode/reverse?lat=&lng= (D187): a street address for a point inside Vietnam, for the home pickup form.
 */
import { sendSuccess, sendError } from '../middleware/httpUtils.js';

export function handleGeocodeRoutes(req, res, pathname, parsedUrl, services) {
  if (pathname !== '/api/v1/geocode/reverse' || req.method !== 'GET') return false;
  const lat = Number(parsedUrl.searchParams.get('lat'));
  const lng = Number(parsedUrl.searchParams.get('lng'));
  // Vietnam and its seas only: the service is for pickup addresses, not a free geocoder.
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 8 || lat > 24 || lng < 102 || lng > 110) {
    sendError(res, 'Tọa độ không hợp lệ', 'VALIDATION_ERROR', 400);
    return true;
  }
  services.geocoder.reverse(lat, lng).then(address => {
    if (!address) sendError(res, 'Không tìm thấy địa chỉ ở vị trí này', 'ADDRESS_NOT_FOUND', 404);
    else sendSuccess(res, { address });
  }).catch(() => sendError(res, 'Chưa tra được địa chỉ, hãy nhập tay', 'GEOCODE_UNAVAILABLE', 503));
  return true;
}
