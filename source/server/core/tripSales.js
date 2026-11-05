/**
 * Exceptions on one day's departure (spec 3.4, 5.5; D131): the office stops selling it, opens it again, or
 * cancels it. A cancelled departure refunds every ticket in full (the company's decision, never the passenger's
 * fee), tells each passenger once, frees the holds, and a payment that arrives afterwards follows the overdue
 * path (refunded, no ticket). Whole routes are suspended through the route setting `sales_suspended` (D132).
 * A trip that ends before its final stop refunds the passengers it never picked up (D189) and those still on board
 * short of their stop (D190), and the office can end a trip the driver left running (D189).
 */
import { operatorOfTrip } from './tenancy.js';
import { routeServiceConfig } from './serviceAreas.js';
import { DEMO_DATE, checkBookableDeparture, vnDate } from './serviceDate.js';
import { DEFAULT_OPERATOR_ID } from './operators.js';

export const DEFAULT_ONLINE_SALES_CUTOFF_MINUTES = 15;

const STARTED = ['IN_TRANSIT', 'COMPLETED'];

/** The ops trip as it stands, without setting a day's run up just to ask. */
function opsTrip(services, tripId) {
  return services?.managerService?.findTrip?.(tripId)
    || services?.managerService?.trips?.find(t => t.trip_id === tripId)
    || null;
}

/**
 * Why a new online booking on this trip is refused, or null when it is on sale. Sold tickets are not affected
 * by a closed sale or a suspended route; only a cancellation ends them.
 */
export function saleBlock(services, tripId, operatorConfig, routeId) {
  const ops = opsTrip(services, tripId);
  if (ops?.status === 'CANCELLED') return { code: 'TRIP_CANCELLED', message: 'Nhà xe đã hủy chuyến này. Chọn chuyến khác.' };
  // A finished run is not sold, even when the bus ran ahead of its timetable (D148). For the passenger app,
  // decision D185 reverses D148: a running trip (IN_TRANSIT) no longer sells online seats (handled in bookingBlock).
  // Counter POS, hotline holds, and driver hail remain unaffected.
  if (ops?.status === 'COMPLETED') return { code: 'TRIP_COMPLETED', message: 'Chuyến này đã kết thúc. Chọn chuyến khác.' };
  if (ops?.sales_closed) return { code: 'SALES_CLOSED', message: 'Chuyến đã ngừng bán vé trực tuyến. Chọn chuyến khác hoặc gọi tổng đài.' };
  if (routeServiceConfig(operatorConfig, routeId).sales_suspended) {
    return { code: 'ROUTE_SUSPENDED', message: 'Tuyến đang tạm ngừng bán vé. Chọn tuyến hoặc nhà xe khác.' };
  }
  return null;
}

function cutoffMinutesOf(operatorConfig) {
  const val = operatorConfig?.online_sales_cutoff_minutes ?? operatorConfig?.service_config?.online_sales_cutoff_minutes;
  if (typeof val === 'number' && Number.isInteger(val) && val >= 0 && val <= 240) {
    return val;
  }
  return DEFAULT_ONLINE_SALES_CUTOFF_MINUTES;
}

/** Seed trips dated DEMO_DATE stay bookable outside production whatever the clock says (D120). */
export function isDemoDeparture(departureTime, production) {
  const depMs = departureTime ? Date.parse(departureTime) : NaN;
  return !production && Number.isFinite(depMs) && vnDate(depMs) === DEMO_DATE;
}

/** When the bus actually leaves: the timetable time plus a delay the office declared (NaN when unknown). */
export function effectiveDepartureMs(services, trip) {
  const departureTime = trip?.departure_time || trip?.departureTime;
  const depMs = departureTime ? Date.parse(departureTime) : NaN;
  const tripId = trip?.trip_id || trip?.tripId;
  const ops = tripId ? opsTrip(services, tripId) : null;
  return depMs + (ops?.delay_minutes ?? trip?.delay_minutes ?? 0) * 60000;
}

/** Whether the bus is on the road (driver or office says so), even ahead of its timetable. */
export function tripStarted(services, tripId) {
  return opsTrip(services, tripId)?.status === 'IN_TRANSIT' || services?.driverService?.activeTrips?.get?.(tripId)?.status === 'IN_TRANSIT';
}

/** The ISO instant until which passengers can book online tickets for this trip. */
export function bookUntil(services, trip, operatorConfig) {
  const effective = effectiveDepartureMs(services, trip);
  if (!Number.isFinite(effective)) return null;
  return new Date(effective - cutoffMinutesOf(operatorConfig) * 60000).toISOString();
}

/**
 * Checks whether an online passenger booking is blocked for this trip (D185).
 * Order of rules:
 * 1. saleBlock: TRIP_CANCELLED / TRIP_COMPLETED / SALES_CLOSED / ROUTE_SUSPENDED
 * 2. Bus started: ops or driver status 'IN_TRANSIT'
 * 3. Online sales cutoff: effectiveDeparture and bookUntil
 * 4. Date window from checkBookableDeparture
 */
export function bookingBlock(services, trip, operatorConfig, { now = Date.now(), production = false } = {}) {
  const tripId = trip?.trip_id || trip?.tripId;
  const routeId = trip?.route_id || trip?.routeId;
  const departureTime = trip?.departure_time || trip?.departureTime;
  const until = bookUntil(services, trip, operatorConfig);

  // 1. TRIP_CANCELLED / TRIP_COMPLETED / SALES_CLOSED / ROUTE_SUSPENDED
  const sale = saleBlock(services, tripId, operatorConfig, routeId);
  if (sale) {
    return { code: sale.code, message: sale.message, book_until: until };
  }

  // 2. Bus started: ops trip status 'IN_TRANSIT' or driver activeTrips status 'IN_TRANSIT'
  if (tripStarted(services, tripId)) {
    return {
      code: 'TRIP_DEPARTED',
      message: 'Xe đã xuất bến, không đặt vé trực tuyến được nữa. Chọn chuyến khác hoặc gọi tổng đài nhà xe.',
      book_until: until
    };
  }

  // Demo exemption: outside production, a trip whose Vietnam date is DEMO_DATE is not blocked by rules 3/4
  if (isDemoDeparture(departureTime, production)) {
    return null;
  }

  // If departure_time is invalid/missing, delegate to checkBookableDeparture
  const effectiveDeparture = effectiveDepartureMs(services, trip);
  if (!Number.isFinite(effectiveDeparture)) {
    const depCheck = checkBookableDeparture(departureTime, now, { production });
    return { code: depCheck.code, message: depCheck.message, book_until: null };
  }

  // 3. Online sales cutoff
  const cutoffMinutes = cutoffMinutesOf(operatorConfig);
  const bookUntilMs = effectiveDeparture - cutoffMinutes * 60000;

  if (now >= effectiveDeparture) {
    return {
      code: 'TRIP_DEPARTED',
      message: 'Chuyến xe đã chạy',
      book_until: until
    };
  }
  if (now >= bookUntilMs) {
    return {
      code: 'BOOKING_CUTOFF_PASSED',
      message: `Đã hết giờ đặt vé trực tuyến (trước giờ chạy ${cutoffMinutes} phút). Gọi tổng đài nhà xe để được hỗ trợ.`,
      book_until: until
    };
  }

  // 4. Existing date-window rule from checkBookableDeparture (DATE_BEYOND_WINDOW etc.)
  const depCheck = checkBookableDeparture(departureTime, now, { production });
  if (!depCheck.ok && depCheck.code !== 'TRIP_DEPARTED') {
    return {
      code: depCheck.code,
      message: depCheck.message,
      book_until: until
    };
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
 * Cancels a live ticket for something the company did (D131, D189): a paid ticket is refunded in full, whatever
 * the cancellation tier. The passenger is told by `tellPassengers`, once per booking. Returns the refund opened, if any.
 */
function cancelForCompany(services, ticket, { at, source, cancelSource = source, refundReason }) {
  const { paymentService } = services;
  ticket.status = 'CANCELLED';
  ticket.cancelled_at = at;
  ticket.cancel_source = cancelSource;
  const cashUnpaid = ticket.payment_method === 'CASH' && ticket.cod_collected !== true;
  const refund = cashUnpaid ? null : paymentService.eventBridge?.requestRefund?.({
    ticket_id: ticket.ticket_id,
    pnr: ticket.pnr,
    trip_id: ticket.trip_id,
    amount_vnd: ticket.fare_vnd,
    reason: refundReason,
    source,
    policy: { tier: source, percentage: 100, fee_vnd: 0 }
  });
  paymentService.eventBridge?.emit?.('TICKET_CANCELLED', { ticketId: ticket.ticket_id, pnr: ticket.pnr, tripId: ticket.trip_id, seatCode: ticket.seat_code });
  return refund || null;
}

/**
 * Tells each passenger once per booking what the company cancelled (D193): one notice naming all its seats and
 * the whole refund, not one per seat. `text(seats, pnr)` words what happened.
 */
function tellPassengers(services, tickets, { type, title, text }) {
  const groups = new Map();
  for (const ticket of tickets) {
    const phone = ticket.owner_phone || ticket.passenger_phone;
    const key = `${ticket.pnr || ticket.ticket_id}:${phone}`;
    if (!groups.has(key)) groups.set(key, { phone, tickets: [] });
    groups.get(key).tickets.push(ticket);
  }
  for (const [key, { phone, tickets: own }] of groups) {
    const first = own[0];
    const refund = own.filter(t => !(t.payment_method === 'CASH' && t.cod_collected !== true)).reduce((sum, t) => sum + (t.fare_vnd || 0), 0);
    const money = refund > 0 ? `Nhà xe hoàn 100% ${refund.toLocaleString('vi-VN')} đ, đang chờ xử lý.` : 'Bạn chưa thanh toán nên không mất khoản nào.';
    services.trackingService?.sendNotificationOnce?.(`${key}:${type}`, phone, {
      operatorId: operatorOfTrip(services, first.trip_id),
      title,
      body: `${text(own.map(t => t.seat_code).join(', '), first.pnr)} ${money} Bạn có thể đặt chuyến khác trong ứng dụng.`,
      type,
      payload: { trip_id: first.trip_id, ticket_id: first.ticket_id, pnr: first.pnr, refund_amount_vnd: refund }
    });
  }
}

/**
 * Cancels a departure that has not left. Every live ticket is cancelled with a 100% refund request, pending
 * payments are closed, seat and hotline holds are freed, and passengers and the driver's list follow.
 */
export function cancelTrip(services, operatorId, tripId, { reason, actor = 'office', now = Date.now() }) {
  const { paymentService, seatMapService, managerService, driverService } = services;
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
  const cancelled = [];
  let cancelledTickets = 0;
  for (const ticket of [...paymentService.tickets.values()]) {
    if (ticket.trip_id !== tripId || ticket.status !== 'ACTIVE') continue;
    cancelledTickets += 1;
    const refund = cancelForCompany(services, ticket, {
      at,
      source: 'OPERATOR_CANCEL',
      cancelSource: 'OPERATOR',
      refundReason: `Nhà xe hủy chuyến: ${text}`
    });
    if (refund) refunds.push(refund);
    cancelled.push(ticket);
  }
  const route = cancelled[0]?.route_name || '';
  tellPassengers(services, cancelled, {
    type: 'TRIP_CANCELLED',
    title: 'Nhà xe hủy chuyến',
    text: (seats, pnr) => `Chuyến ${route} ${when} (vé ${pnr}, ghế ${seats}) đã bị hủy: ${text}.`
  });

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

  // D192: the driver hears it on the phone, not only when the trip list reloads.
  if (trip.driver_id) {
    services.messenger?.dispatchDriver?.({ operatorId, driverId: trip.driver_id, type: 'TRIP_CANCELLED', title: 'Nhà xe hủy chuyến', body: `Chuyến ${when}${trip.vehicle_plate ? ` (xe ${trip.vehicle_plate})` : ''} đã hủy: ${text}. Không cần chạy chuyến này.`, payload: { trip_id: tripId } });
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
      cancelled_tickets: cancelledTickets,
      refund_total_vnd: refunds.reduce((sum, r) => sum + (r.amount_vnd || 0), 0),
      closed_orders: closedOrders
    }
  };
}

/**
 * A trip ended before its final stop (breakdown): the passengers it never picked up lose their seat through no
 * fault of theirs, so their tickets are cancelled with a full refund and a notice, and the office is alerted (D189).
 * Passengers on board who had not reached their stop are refunded the same way (D190); those already dropped off are
 * untouched. To carry them on instead, the office swaps the vehicle (MGR-023) rather than ending the trip.
 */
export function refundEarlyEnd(services, tripId, reason, { now = Date.now() } = {}) {
  const { paymentService, managerService, driverService } = services;
  const driverTrip = driverService?.activeTrips?.get(tripId);
  const at = new Date(now).toISOString();
  const when = hhmmDate(driverTrip?.planned_departure_time || opsTrip(services, tripId)?.departure_time);
  const strandedTickets = [];
  const unpickedTickets = [];
  for (const passenger of driverTrip?.manifest || []) {
    const ticket = paymentService.tickets.get(passenger.ticket_id);
    // On board and not yet at their stop (D190): the company did not carry them there, so they are refunded in full.
    if (passenger.boarding_status === 'BOARDED') {
      if (passenger.alighted_at || !['BOARDED', 'ACTIVE'].includes(ticket?.status)) continue;
      strandedTickets.push(ticket);
      cancelForCompany(services, ticket, { at, source: 'TRIP_INTERRUPTED', refundReason: `Chuyến dừng giữa đường: ${reason}` });
      continue;
    }
    if (['NO_SHOW', 'CANCELLED'].includes(passenger.boarding_status) || ticket?.status !== 'ACTIVE') continue;
    passenger.boarding_status = 'CANCELLED';
    unpickedTickets.push(ticket);
    cancelForCompany(services, ticket, { at, source: 'TRIP_ENDED_EARLY', refundReason: `Chuyến kết thúc sớm: ${reason}` });
  }
  const route = (strandedTickets[0] || unpickedTickets[0])?.route_name || '';
  const where = (seats, pnr) => `Chuyến ${route} ${when} (vé ${pnr}, ghế ${seats})`;
  tellPassengers(services, strandedTickets, { type: 'TRIP_INTERRUPTED', title: 'Chuyến dừng giữa đường', text: (seats, pnr) => `${where(seats, pnr)} dừng trước điểm trả của bạn: ${reason}.` });
  tellPassengers(services, unpickedTickets, { type: 'TRIP_ENDED_EARLY', title: 'Xe không đón được bạn', text: (seats, pnr) => `${where(seats, pnr)} kết thúc sớm: ${reason}.` });
  const unpicked = unpickedTickets.length;
  const stranded = strandedTickets.length;
  managerService.alerts?.unshift?.({
    alert_id: `alt_early_end_${tripId}`,
    vehicle_plate: driverTrip?.vehicle_plate,
    type: 'TRIP_ENDED_EARLY',
    severity: 'RED',
    message: `Chuyến ${when} kết thúc sớm: ${reason}. ${unpicked} khách chưa được đón, ${stranded} khách trên xe chưa tới điểm trả (hoàn 100%).`,
    created_at: at,
    operator_id: driverTrip?.operator_id || operatorOfTrip(services, tripId),
    trip_id: tripId
  });
  return { unpicked, stranded };
}

/** The office ends a trip the driver left running (D189). The reason goes to the end report and the passengers. */
export function endTripByOffice(services, operatorId, tripId, { reason, now = Date.now() }) {
  const text = String(reason || '').trim();
  if (text.length < 5 || text.length > 200) {
    return { ok: false, status: 400, code: 'VALIDATION_ERROR', message: 'Cần lý do kết thúc chuyến (từ 5 đến 200 ký tự)' };
  }
  const driverTrip = services.driverService?.activeTrips?.get(tripId);
  if (!driverTrip || (driverTrip.operator_id || DEFAULT_OPERATOR_ID) !== operatorId) {
    return { ok: false, status: 404, code: 'TRIP_NOT_FOUND', message: 'Chuyến xe không tồn tại' };
  }
  const before = { status: driverTrip.status };
  const ended = services.driverService.endTrip(tripId, { earlyEndReason: `Điều hành kết thúc: ${text}`, endedBy: 'OFFICE' });
  if (!ended.success) return { ok: false, status: 400, code: ended.code, message: ended.error };
  const refunded = ended.data.early_end_reason ? refundEarlyEnd(services, tripId, ended.data.early_end_reason, { now }) : { unpicked: 0, stranded: 0 };
  return { ok: true, before, result: { ...ended.data, unpicked_count: refunded.unpicked, stranded_count: refunded.stranded } };
}
