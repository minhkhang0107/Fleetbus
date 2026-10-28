/**
 * What a home passenger sees of the run (D144): their appointment, their place in the run, the minutes until the
 * bus is at their door counting the addresses before theirs, and how long the bus waits there. Also finds who a
 * tracking link belongs to: an app ticket, or a phone booking held by the office (no app ticket, SMS link only).
 */
import { homeConfirmed } from './serviceAreas.js';
import { findOperatorById } from './operators.js';
import { homeAppointments, homeEta, homeWaitMinutes } from './homeRun.js';

/**
 * The holder of a tracking link: { tripId, manifestId, pickupStopId, dropoffStopId, boarded, home } or null.
 * App tickets first (paymentService), then phone holds (managerService.hotlineReservations).
 */
export function findShareHolder(services, token, tripId = null) {
  if (!token) return null;
  const { paymentService, managerService, driverService } = services;
  for (const t of paymentService?.tickets?.values() || []) {
    const shared = t.share_token === token && paymentService.shareLinkValid(t);
    const delegated = t.delegated_to?.share_token === token && paymentService.delegateLinkValid(t);
    if ((shared || delegated) && t.status !== 'CANCELLED' && (!tripId || t.trip_id === tripId)) {
      return { tripId: t.trip_id, manifestId: t.ticket_id, pickupStopId: t.pickup_stop_id || null, dropoffStopId: t.dropoff_stop_id || null, boarded: t.status === 'BOARDED', home: t.home_pickup || null, operatorId: t.operator_id };
    }
  }
  const r = (managerService?.hotlineReservations || []).find(x => x.share_token === token && ['HELD_HOTLINE', 'CONVERTED'].includes(x.hold_status) && (!tripId || x.trip_id === tripId));
  if (!r) return null;
  const manifestId = `hl_${r.reservation_id}_${r.seat_codes[0]}`;
  const entry = driverService?.activeTrips?.get(r.trip_id)?.manifest?.find(m => m.ticket_id === manifestId);
  return { tripId: r.trip_id, manifestId, pickupStopId: r.pickup_stop_id, dropoffStopId: r.dropoff_stop_id, boarded: entry?.boarding_status === 'BOARDED', home: entry?.home_pickup || r.home_pickup || null, operatorId: r.operator_id };
}

/** The home address the bus collects the passenger at (confirmed, reachable, not missed, pinned), or null. */
export function homeTarget(home) {
  if (!homeConfirmed(home) || home.inaccessible_at || home.missed_at || !Number.isFinite(home.lat) || !Number.isFinite(home.lng)) return null;
  return { lat: home.lat, lng: home.lng, address: home.address, window_from: home.window_from || null, window_to: home.window_to || null };
}

const hhmm = (iso) => new Date(Date.parse(iso) + 7 * 3600000).toISOString().slice(11, 16);

/**
 * Adds the run to a tracking view of a home pickup (mutates and returns [data]): appointment_at, home_queue,
 * pickup_ready, home_wait_minutes, door_arrived_at, and an ETA counted along the run.
 */
export function applyHomeRun(data, services, tripId, manifestId, now = Date.now()) {
  const trip = services.driverService?.activeTrips?.get(tripId);
  const p = trip?.manifest?.find(m => m.ticket_id === manifestId);
  if (!p || !homeConfirmed(p.home_pickup)) return data;
  const config = findOperatorById(trip.operator_id)?.service_config || {};
  const wait = homeWaitMinutes(config);
  data.pickup_ready = p.pickup_ready || null;
  data.home_wait_minutes = wait;
  data.door_arrived_at = p.home_pickup.arrived_at || null;
  const appointment = homeAppointments(trip)[manifestId] || null;
  data.appointment_at = appointment;
  if (data.target_stop?.kind !== 'HOME_PICKUP') return data;
  if (appointment) data.target_planned_time = appointment;
  if (data.position_hidden || !data.has_position || !data.bus_position) return data;

  const q = homeEta(trip, manifestId, data.bus_position, now);
  if (!q) return data;
  data.home_queue = { position: q.position, ahead: q.ahead, total: q.total };
  data.eta_minutes = q.eta_minutes;
  data.distance_meters = q.road_meters;
  // Over 3 minutes without a ping the last position says nothing about now: only the driver's "at the door" counts.
  const offline = data.signal_status === 'OFFLINE';
  const atDoor = q.ahead === 0 && ((q.at_door && !offline) || Boolean(p.home_pickup.arrived_at));
  // Near: the next door, the bus in the lane (300 m), time to come out; at the door: pulled up within 50 m.
  data.near_door = q.ahead === 0 && ((q.near_door && !offline) || atDoor);
  data.at_door = atDoor;
  data.is_at_station = atDoor;
  data.is_arriving_soon = !offline && q.ahead === 0 && q.eta_minutes <= 5;
  data.expected_at = offline ? null : new Date(now + q.eta_minutes * 60000).toISOString();
  const promised = Date.parse(appointment || data.target_window?.to || '');
  data.late_minutes = data.expected_at && Number.isFinite(promised) ? Math.max(0, Math.round((Date.parse(data.expected_at) - promised) / 60000)) : null;
  if (atDoor) {
    data.hud_status_text = p.home_pickup.arrived_at
      ? `Xe đã tới chỗ đón. Tài xế chờ bạn tối đa ${wait} phút (tới ${hhmm(new Date(Date.parse(p.home_pickup.arrived_at) + wait * 60000).toISOString())})`
      : 'Xe đã tới chỗ đón của bạn. Mời bạn ra xe';
  } else if (offline) {
    data.hud_status_text = `Chưa nhận được vị trí xe từ ${hhmm(data.bus_position.timestamp)}. Bạn là điểm đón thứ ${q.position}/${q.total}, giờ xe tới sẽ cập nhật khi có tín hiệu lại`;
  } else if (data.near_door) {
    data.hud_status_text = 'Xe đã tới gần chỗ đón của bạn. Mời bạn ra xe';
  } else if (q.ahead > 0) {
    data.hud_status_text = `Xe đang đón khách khác. Bạn là điểm đón thứ ${q.position}/${q.total}, còn ${q.ahead} nhà trước bạn (~${q.eta_minutes} phút)`;
  } else {
    data.hud_status_text = `Bạn là điểm đón tiếp theo. Xe còn khoảng ${q.eta_minutes} phút`;
  }
  return data;
}
