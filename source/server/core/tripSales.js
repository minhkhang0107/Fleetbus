/**
 * Exceptions on one day's departure (spec 3.4, 5.5; D131): the office stops selling it, opens it again, or
 * cancels it. A cancelled departure refunds every ticket in full (the company's decision, never the passenger's
 * fee), tells each passenger once, frees the holds, and a payment that arrives afterwards follows the overdue
 * path (refunded, no ticket). Whole routes are suspended through the route setting `sales_suspended` (D132).
 */
import { operatorOfTrip } from './tenancy.js';
import { routeServiceConfig } from './serviceAreas.js';

const STARTED = ['IN_TRANSIT', 'COMPLETED'];

/** The ops trip as it stands, without setting a day's run up just to ask. */
function opsTrip(services, tripId) {
  return services.managerService?.trips?.find(t => t.trip_id === tripId) || null;
}

/**
 * Why a new online booking on this trip is refused, or null when it is on sale. Sold tickets are not affected
 * by a closed sale or a suspended route; only a cancellation ends them.
 */
export function saleBlock(services, tripId, operatorConfig, routeId) {
  const ops = opsTrip(services, tripId);
  if (ops?.status === 'CANCELLED') return { code: 'TRIP_CANCELLED', message: 'Nhà xe đã hủy chuyến này. Chọn chuyến khác.' };
  // A finished run is not sold, even when the bus ran ahead of its timetable (D148). A running one still sells
  // seats from the stops ahead.
  if (ops?.status === 'COMPLETED') return { code: 'TRIP_COMPLETED', message: 'Chuyến này đã kết thúc. Chọn chuyến khác.' };
  if (ops?.sales_closed) return { code: 'SALES_CLOSED', message: 'Chuyến đã ngừng bán vé trực tuyến. Chọn chuyến khác hoặc gọi tổng đài.' };
  if (routeServiceConfig(operatorConfig, routeId).sales_suspended) {
    return { code: 'ROUTE_SUSPENDED', message: 'Tuyến đang tạm ngừng bán vé. Chọn tuyến hoặc nhà xe khác.' };
  }
  return null;
}

/** What the office and passengers see of a departure's sale. */
export function saleStatus(services, tripId) {
  const ops = opsTrip(services, tripId);
  if (ops?.status === 'CANCELLED') return 'CANCELLED';
  if (ops?.status === 'COMPLETED') return 'COMPLETED';
  return ops?.sales_closed ? 'SALES_CLOSED' : 'ON_SALE';
}

function findOpsTrip(services, operatorId, tripId) {
  const trip = services.managerService.findTrip(tripId);
  return trip && trip.operator_id === operatorId ? trip : null;
}

function hhmmDate(iso) {
  if (!iso) return '';
  const vn = new Date(Date.parse(iso) + 7 * 3600000).toISOString();
  return `${vn.slice(11, 16)} ngày ${vn.slice(8, 10)}/${vn.slice(5, 7)}`;
}

/** Stops or resumes online sales of a departure. */
export function setTripSales(services, operatorId, tripId, { open, reason = '', actor = 'office', now = Date.now() }) {
  const trip = findOpsTrip(services, operatorId, tripId);
  if (!trip) return { ok: false, status: 404, code: 'TRIP_NOT_FOUND', message: 'Chuyến xe không tồn tại' };
  if (trip.status === 'CANCELLED') return { ok: false, status: 409, code: 'TRIP_CANCELLED', message: 'Chuyến đã hủy' };
  const before = { sales_closed: Boolean(trip.sales_closed) };
  trip.sales_closed = !open;
  trip.sales_closed_reason = open ? null : String(reason || '').trim().slice(0, 200) || null;
  trip.sales_changed_at = new Date(now).toISOString();
  trip.sales_changed_by = actor;
  return { ok: true, before, trip: { trip_id: tripId, sale_status: saleStatus(services, tripId), sales_closed_reason: trip.sales_closed_reason } };
}

/**
 * Cancels a departure that has not left. Every live ticket is cancelled with a 100% refund request, pending
 * payments are closed, seat and hotline holds are freed, and passengers and the driver's list follow.
 */
export function cancelTrip(services, operatorId, tripId, { reason, actor = 'office', now = Date.now() }) {
  const { paymentService, seatMapService, managerService, driverService, trackingService } = services;
  const trip = findOpsTrip(services, operatorId, tripId);
  if (!trip) return { ok: false, status: 404, code: 'TRIP_NOT_FOUND', message: 'Chuyến xe không tồn tại' };
  if (trip.status === 'CANCELLED') return { ok: false, status: 409, code: 'TRIP_ALREADY_CANCELLED', message: 'Chuyến đã hủy trước đó' };
  const driverTrip = driverService?.activeTrips?.get(tripId);
  if (STARTED.includes(trip.status) || STARTED.includes(driverTrip?.status)) {
    return { ok: false, status: 409, code: 'TRIP_ALREADY_STARTED', message: 'Xe đã xuất bến; xử lý sự cố trên chuyến thay vì hủy' };
  }
  const text = String(reason || '').trim();
  if (text.length < 5) return { ok: false, status: 400, code: 'VALIDATION_ERROR', message: 'Cần lý do hủy chuyến (từ 5 ký tự) để báo khách' };

  const at = new Date(now).toISOString();
  const departure = services.searchService?.getTripDetail?.(tripId)?.data?.departure_time || trip.departure_time;
  const when = hhmmDate(departure);
  const before = { status: trip.status };
  trip.status = 'CANCELLED';
  trip.cancelled_at = at;
  trip.cancel_reason = text.slice(0, 200);
  trip.cancelled_by = actor;
  if (driverTrip) driverTrip.status = 'CANCELLED';

  // Tickets: full refund, whatever the cancellation tier would have been.
  const refunds = [];
  for (const ticket of [...paymentService.tickets.values()]) {
    if (ticket.trip_id !== tripId || ticket.status !== 'ACTIVE') continue;
    ticket.status = 'CANCELLED';
    ticket.cancelled_at = at;
    ticket.cancel_source = 'OPERATOR';
    const refund = paymentService.eventBridge?.requestRefund?.({
      ticket_id: ticket.ticket_id,
      pnr: ticket.pnr,
      trip_id: tripId,
      amount_vnd: ticket.fare_vnd,
      reason: `Nhà xe hủy chuyến: ${text}`,
      source: 'OPERATOR_CANCEL',
      policy: { tier: 'OPERATOR_CANCEL', percentage: 100, fee_vnd: 0 }
    });
    if (refund) refunds.push(refund);
    paymentService.eventBridge?.emit?.('TICKET_CANCELLED', { ticketId: ticket.ticket_id, pnr: ticket.pnr, tripId, seatCode: ticket.seat_code });
    trackingService?.sendNotificationOnce?.(`${ticket.ticket_id}:TRIP_CANCELLED`, ticket.owner_phone || ticket.passenger_phone, {
      operatorId: operatorOfTrip(services, tripId),
      title: 'Nhà xe hủy chuyến',
      body: `Chuyến ${ticket.route_name || ''} ${when} (vé ${ticket.pnr}, ghế ${ticket.seat_code}) đã bị hủy: ${text}. Nhà xe hoàn 100% ${ticket.fare_vnd.toLocaleString('vi-VN')} đ, đang chờ xử lý. Bạn có thể đặt chuyến khác trong ứng dụng.`,
      type: 'TRIP_CANCELLED',
      payload: { trip_id: tripId, ticket_id: ticket.ticket_id, pnr: ticket.pnr, refund_amount_vnd: ticket.fare_vnd }
    });
  }

  // Orders still waiting for the transfer close now: money arriving later is refunded, no ticket (OQ-008 path).
  let closedOrders = 0;
  for (const order of paymentService.orders.values()) {
    if (order.trip_id !== tripId || order.payment_status !== 'PENDING_PAYMENT') continue;
    order.expires_at = at;
    order.closed_reason = 'TRIP_CANCELLED';
    closedOrders += 1;
  }
  for (const [holdId, hold] of [...(seatMapService?.seatHolds?.entries?.() || [])]) {
    if (hold.tripId === tripId) seatMapService.seatHolds.delete(holdId);
  }
  for (const r of [...(managerService.hotlineReservations || [])]) {
    if (r.trip_id === tripId && r.hold_status === 'HELD_HOTLINE') managerService.cancelHotlineHold?.(r.reservation_id, `Nhà xe hủy chuyến: ${text}`, now);
  }

  managerService.alerts?.unshift?.({
    alert_id: `alt_cancel_${tripId}`,
    vehicle_plate: trip.vehicle_plate,
    type: 'TRIP_CANCELLED',
    severity: 'RED',
    message: `Đã hủy chuyến ${when}: ${text}. ${refunds.length} vé chờ hoàn tiền.`,
    created_at: at,
    operator_id: operatorId,
    trip_id: tripId
  });

  return {
    ok: true,
    before,
    result: {
      trip_id: tripId,
      sale_status: 'CANCELLED',
      cancelled_at: at,
      cancel_reason: trip.cancel_reason,
      cancelled_tickets: refunds.length,
      refund_total_vnd: refunds.reduce((sum, r) => sum + (r.amount_vnd || 0), 0),
      closed_orders: closedOrders
    }
  };
}
