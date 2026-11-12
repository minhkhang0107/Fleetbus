/**
 * D191: runs of today still waiting more than 15 minutes after their time, as office alerts (MGR-025).
 * Computed when the office looks, never stored, so they go away once the bus leaves or the run is cancelled.
 */

import { DEMO_DATE, vnDate } from './serviceDate.js';

const GRACE_MS = 15 * 60000;

/** "30 phút", "10 giờ", "10 giờ 5 phút". */
function overdueText(minutes) {
  if (minutes < 60) return `${minutes} phút`;
  const rest = minutes % 60;
  return `${Math.floor(minutes / 60)} giờ${rest ? ` ${rest} phút` : ''}`;
}

/** DEPARTURE_MISSED alerts of a company at `now` (ms): red when passengers booked, else amber. */
export function missedDepartureAlerts(managerService, operatorId, now = Date.now()) {
  if (!managerService) return [];
  const today = vnDate(now);
  managerService.runsForDate?.(today, operatorId);
  const alerts = [];
  for (const trip of managerService.trips || []) {
    if (operatorId && trip.operator_id !== operatorId) continue;
    if (trip.status !== 'SCHEDULED' && trip.status !== 'DISPATCHED') continue;
    const depMs = Date.parse(trip.departure_time);
    if (!Number.isFinite(depMs) || vnDate(depMs) !== today || today === DEMO_DATE) continue;

    const diffMinutes = Math.floor((depMs - now) / 60000);
    const missingVehicle = !trip.vehicle_id;
    const missingDriver = !trip.driver_id;

    // Early warning: trip starts within 120 minutes but lacks vehicle or driver
    if (depMs > now && diffMinutes <= 120 && (missingVehicle || missingDriver)) {
      const hhmm = new Date(depMs + 7 * 3600000).toISOString().slice(11, 16);
      const routeLabel = trip.route_name ? ` ${trip.route_name}` : '';
      const missingReason = missingVehicle && missingDriver ? 'chưa gán xe và tài xế' : (missingVehicle ? 'chưa gán xe' : 'chưa gán tài xế');
      alerts.push({
        alert_id: `alt_unassigned_${trip.trip_id}`,
        type: 'UNASSIGNED_DEPARTURE_UPCOMING',
        severity: diffMinutes < 60 ? 'RED' : 'AMBER',
        message: `Chuyến ${hhmm}${routeLabel} còn ${overdueText(diffMinutes)} nữa chạy, ${missingReason}.`,
        vehicle_plate: trip.vehicle_plate || null,
        trip_id: trip.trip_id,
        created_at: new Date(now).toISOString(),
        operator_id: trip.operator_id
      });
    }

    if (now - depMs <= GRACE_MS) continue;
    const booked = trip.booked_seats || 0;
    const hhmm = new Date(depMs + 7 * 3600000).toISOString().slice(11, 16);
    alerts.push({
      alert_id: `alt_missed_${trip.trip_id}`,
      type: 'DEPARTURE_MISSED',
      severity: booked > 0 ? 'RED' : 'AMBER',
      message: `Chuyến ${hhmm} chưa xuất bến, đã quá giờ ${overdueText(Math.floor((now - depMs) / 60000))}${booked > 0 ? ` · ${booked} khách đã đặt` : ''}. Gọi tài xế, hoặc hủy chuyến nếu không chạy.`,
      vehicle_plate: trip.vehicle_plate || null,
      trip_id: trip.trip_id,
      created_at: new Date(depMs + GRACE_MS).toISOString(),
      operator_id: trip.operator_id
    });
  }
  return alerts;
}
