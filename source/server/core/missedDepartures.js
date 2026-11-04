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
    if (!Number.isFinite(depMs) || vnDate(depMs) !== today || today === DEMO_DATE || now - depMs <= GRACE_MS) continue;
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
