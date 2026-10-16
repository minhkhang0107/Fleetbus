/**
 * The passenger moves the pickup or drop-off of a ticket to another stop of the trip (spec 4.6; D133).
 *
 * Self-service stays inside the paid segment: a later pickup or an earlier drop-off on the same trip, so the
 * seat, the fare and the seat inventory are unchanged and nothing has to be paid or refunded. Anything wider
 * (an earlier pickup, another trip) goes through the office. Changes close 30 minutes before the departure
 * and once the bus has left. The new stop is effective at once: ticket, driver list and a notice to the passenger.
 */
import { operatorOfTrip } from './tenancy.js';

export const CHANGE_CUTOFF_MINUTES = 30;
const STARTED = ['IN_TRANSIT', 'COMPLETED', 'CANCELLED'];

function fail(status, code, message) {
  return { ok: false, status, code, message };
}

export function changeTicketStops(services, ticket, { pickupStopId, dropoffStopId, now = Date.now(), demo = false }) {
  const { searchService, driverService, trackingService } = services;
  if (ticket.status !== 'ACTIVE') return fail(409, 'TICKET_NOT_ACTIVE', 'Chỉ đổi được điểm của vé chưa lên xe');
  if (!pickupStopId && !dropoffStopId) return fail(400, 'VALIDATION_ERROR', 'Chọn điểm đón hoặc điểm trả mới');
  if (STARTED.includes(driverService?.activeTrips?.get(ticket.trip_id)?.status)) return fail(409, 'TRIP_DEPARTED', 'Xe đã xuất bến, không đổi điểm được nữa');
  const departure = Date.parse(ticket.departure_time);
  // Seed trips (2026-08-28) are already past outside production; they stay changeable for the demo.
  if (!(demo && departure < now) && departure - now < CHANGE_CUTOFF_MINUTES * 60000) {
    return fail(409, 'CHANGE_CUTOFF_PASSED', `Chỉ đổi điểm được tới ${CHANGE_CUTOFF_MINUTES} phút trước giờ xuất bến; gọi tổng đài nhà xe`);
  }
  const home = (h) => h && ['CONFIRMED', 'PENDING_REVIEW'].includes(h.status || 'CONFIRMED');
  if (pickupStopId && home(ticket.home_pickup)) return fail(409, 'HOME_SERVICE_ACTIVE', 'Vé đang đón tận nhà; hủy yêu cầu đón tận nhà trước hoặc gọi tổng đài');
  if (dropoffStopId && home(ticket.home_dropoff)) return fail(409, 'HOME_SERVICE_ACTIVE', 'Vé đang trả tận nhà; hủy yêu cầu trả tận nhà trước hoặc gọi tổng đài');

  const stops = searchService.getTripDetail(ticket.trip_id)?.data?.stops || [];
  const index = (id) => stops.findIndex(s => s.stop_id === id);
  const paidFrom = index(ticket.pickup_stop_id);
  const paidTo = index(ticket.dropoff_stop_id);
  const nextPickup = pickupStopId || ticket.pickup_stop_id;
  const nextDropoff = dropoffStopId || ticket.dropoff_stop_id;
  const from = index(nextPickup);
  const to = index(nextDropoff);
  if (from < 0 || to < 0) return fail(400, 'STOP_NOT_FOUND', 'Điểm không thuộc chuyến này');
  if (pickupStopId && (stops[from].pickup_allowed === false || stops[from].hidden)) return fail(400, 'STOP_NOT_ALLOWED', `${stops[from].name} không nhận đón khách`);
  if (dropoffStopId && (stops[to].dropoff_allowed === false || stops[to].hidden)) return fail(400, 'STOP_NOT_ALLOWED', `${stops[to].name} không nhận trả khách`);
  if (from >= to) return fail(400, 'INVALID_SEGMENT', 'Điểm đón phải trước điểm trả theo chiều xe chạy');
  if (paidFrom >= 0 && paidTo >= 0 && (from < paidFrom || to > paidTo)) {
    return fail(409, 'OUTSIDE_PAID_SEGMENT', 'Chỉ tự đổi được trong chặng đã mua (lên muộn hơn hoặc xuống sớm hơn); chặng khác cần gọi tổng đài vì giá vé khác');
  }
  if (nextPickup === ticket.pickup_stop_id && nextDropoff === ticket.dropoff_stop_id) return fail(400, 'NO_CHANGE', 'Điểm đón và trả không đổi');

  const before = { pickup_stop_id: ticket.pickup_stop_id, pickup_stop: ticket.pickup_stop, dropoff_stop_id: ticket.dropoff_stop_id, dropoff_stop: ticket.dropoff_stop };
  const after = { pickup_stop_id: nextPickup, pickup_stop: stops[from].name, dropoff_stop_id: nextDropoff, dropoff_stop: stops[to].name };
  Object.assign(ticket, after, { stops_changed_at: new Date(now).toISOString() });
  const item = driverService?.activeTrips?.get(ticket.trip_id)?.manifest?.find(m => m.ticket_id === ticket.ticket_id);
  if (item) Object.assign(item, after);

  const time = (s) => (s?.time ? ` (khoảng ${s.time})` : '');
  trackingService?.sendNotification?.(ticket.owner_phone || ticket.passenger_phone, {
    operatorId: operatorOfTrip(services, ticket.trip_id),
    title: 'Đã đổi điểm đón/trả',
    body: `Vé ${ticket.pnr}, ghế ${ticket.seat_code}: lên xe tại ${after.pickup_stop}${time(stops[from])}, xuống tại ${after.dropoff_stop}. Tài xế đã nhận thay đổi.`,
    type: 'STOPS_CHANGED',
    payload: { trip_id: ticket.trip_id, ticket_id: ticket.ticket_id, ...after }
  });
  return { ok: true, before, ticket };
}
