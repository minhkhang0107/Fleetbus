/**
 * Office review of home pickup / home drop-off requests (spec 4.2, 4.3, 8.4; D130).
 *
 * An address inside a MANUAL service area is booked as PENDING_REVIEW: the seat is sold and paid, but the bus
 * serves the ticket's stop until the office confirms the address. A refused request (by the office, by the
 * passenger withdrawing it, or because nobody reviewed it before the bus left) refunds its fee and leaves the
 * ticket on its stop. Requests are per order and side: one address and one fee for every seat of the order.
 */
import { operatorOfTrip } from './tenancy.js';

const SIDES = { PICKUP: 'home_pickup', DROPOFF: 'home_dropoff' };
const OPEN_TICKET = ['ACTIVE', 'BOARDED'];
const STARTED = ['IN_TRANSIT', 'COMPLETED'];

/** Whether an order's seats are sold (paid by transfer or payable in cash on board). */
function isSold(order) {
  return order.payment_status === 'PAID' || order.payment_status === 'UNPAID_COD';
}

function liveTickets(services, order) {
  return (order.ticket_ids || []).map(id => services.paymentService.tickets.get(id)).filter(t => t && OPEN_TICKET.includes(t.status));
}

function hhmmDate(iso) {
  if (!iso) return '';
  const vn = new Date(Date.parse(iso) + 7 * 3600000).toISOString();
  return `${vn.slice(11, 16)} ngày ${vn.slice(8, 10)}/${vn.slice(5, 7)}`;
}

function requestView(services, order, side) {
  const home = order[SIDES[side]];
  const tickets = liveTickets(services, order);
  // The office answers before the pickup window opens (a drop-off: before the departure).
  const deadline = Date.parse(home.window_from || order.departure_time);
  return {
    request_id: `${order.order_id}:${side}`,
    order_id: order.order_id,
    pnr: order.pnr,
    side,
    trip_id: order.trip_id,
    route_name: order.route_name,
    departure_time: order.departure_time,
    seat_codes: tickets.map(t => t.seat_code),
    passenger_name: order.payer?.full_name || tickets[0]?.passenger_name || null,
    passenger_phone: order.payer?.phone || tickets[0]?.passenger_phone || null,
    address: home.address,
    note: home.note || '',
    lat: home.lat,
    lng: home.lng,
    area_id: home.area_id,
    area_name: home.area_name,
    fee_vnd: home.fee_vnd,
    anchor_stop_id: home.anchor_stop_id,
    window_from: home.window_from || null,
    window_to: home.window_to || null,
    status: home.status || 'CONFIRMED',
    requested_at: order.paid_at || order.created_at,
    review_deadline: Number.isFinite(deadline) ? new Date(deadline).toISOString() : null,
    reviewed_at: home.reviewed_at || null,
    reviewed_by: home.reviewed_by || null,
    reject_reason: home.reject_reason || null
  };
}

/** The company's home requests, newest departure last; `status` filters (default: those waiting for review). */
export function listHomeRequests(services, operatorId, { status = 'PENDING_REVIEW' } = {}) {
  const out = [];
  for (const order of services.paymentService.orders.values()) {
    if (order.operator_id !== operatorId || !isSold(order)) continue;
    if (!liveTickets(services, order).length && status === 'PENDING_REVIEW') continue;
    for (const side of Object.keys(SIDES)) {
      const home = order[SIDES[side]];
      if (!home) continue;
      if (status !== 'ALL' && (home.status || 'CONFIRMED') !== status) continue;
      out.push(requestView(services, order, side));
    }
  }
  return out.sort((a, b) => Date.parse(a.departure_time) - Date.parse(b.departure_time));
}

/** Writes the new state of a request on the order, its tickets and the driver manifest. */
function applyHome(services, order, side, home) {
  const key = SIDES[side];
  order[key] = home;
  const tickets = liveTickets(services, order);
  for (const t of tickets) t[key] = home;
  const manifest = services.driverService?.activeTrips?.get(order.trip_id)?.manifest || [];
  for (const item of manifest) {
    if (!tickets.some(t => t.ticket_id === item.ticket_id)) continue;
    // Only a confirmed address is a stop of the bus (spec 7.3).
    item[key] = home.status === 'CONFIRMED' ? home : null;
  }
  return tickets;
}

/** Refunds the fee of a refused request: a refund request for the cashier, and each ticket's price goes down. */
function refundFee(services, order, side, home, tickets, reason) {
  if (!home.fee_vnd || !tickets.length) return null;
  const share = Math.round(home.fee_vnd / tickets.length);
  for (const t of tickets) {
    t.fare_vnd = Math.max(0, t.fare_vnd - share);
    t.home_fee_refunded_vnd = (t.home_fee_refunded_vnd || 0) + share;
  }
  if (order.payment_method === 'CASH' && order.payment_status === 'UNPAID_COD') {
    for (const t of tickets) {
      if (!t.cod_collected) t.cod_amount_vnd = Math.max(0, (t.cod_amount_vnd || 0) - share);
    }
    const manifest = services.driverService?.activeTrips?.get(order.trip_id)?.manifest || [];
    for (const item of manifest) {
      if (!tickets.some(t => t.ticket_id === item.ticket_id)) continue;
      if (!item.cod_collected) item.cod_amount_vnd = Math.max(0, (item.cod_amount_vnd || 0) - share);
    }
    return null;
  }
  return services.paymentService.eventBridge?.requestRefund?.({
    pnr: order.pnr,
    trip_id: order.trip_id,
    amount_vnd: home.fee_vnd,
    reason,
    source: 'HOME_SERVICE_REFUSED',
    policy: { tier: 'HOME_SERVICE_REFUSED', percentage: 100, fee_vnd: 0 }
  }) || null;
}

function notify(services, order, side, status, body) {
  const phone = order.payer?.phone || liveTickets(services, order)[0]?.passenger_phone;
  const titles = {
    CONFIRMED: side === 'PICKUP' ? 'Nhà xe đã xác nhận đón tận nhà' : 'Nhà xe đã xác nhận trả tận nhà',
    REJECTED: side === 'PICKUP' ? 'Nhà xe không nhận đón tận nhà' : 'Nhà xe không nhận trả tận nhà',
    WITHDRAWN: side === 'PICKUP' ? 'Đã hủy yêu cầu đón tận nhà' : 'Đã hủy yêu cầu trả tận nhà'
  };
  services.trackingService?.sendNotificationOnce?.(`${order.order_id}:HOME_${side}:${status}`, phone, {
    operatorId: operatorOfTrip(services, order.trip_id),
    title: titles[status],
    body,
    type: `HOME_${side}_${status}`,
    payload: { trip_id: order.trip_id, pnr: order.pnr, side, status }
  });
}

function stopName(services, order, stopId) {
  const stops = services.searchService?.getTripDetail?.(order.trip_id)?.data?.stops || [];
  return stops.find(s => s.stop_id === stopId)?.name || (stopId === order.pickup_stop_id ? order.pickup_stop : order.dropoff_stop);
}

function findOrder(services, operatorId, orderId) {
  const order = services.paymentService.orders.get(orderId);
  return order && order.operator_id === operatorId ? order : null;
}

function tripStarted(services, tripId) {
  const status = services.driverService?.activeTrips?.get(tripId)?.status;
  return STARTED.includes(status);
}

/** Refuses a request and tells the passenger where the bus serves them instead. */
function refuse(services, order, side, home, { status, reason, actor, now }) {
  const next = { ...home, status, reviewed_at: new Date(now).toISOString(), reviewed_by: actor, reject_reason: reason };
  const tickets = applyHome(services, order, side, next);
  const refund = refundFee(services, order, side, home, tickets, side === 'PICKUP' ? `Không đón tận nhà: ${reason}` : `Không trả tận nhà: ${reason}`);
  const stop = stopName(services, order, home.anchor_stop_id);
  const money = refund ? ` Phụ phí ${home.fee_vnd.toLocaleString('vi-VN')} đ sẽ được hoàn.` : '';
  const verb = side === 'PICKUP' ? 'Mời bạn lên xe tại' : 'Bạn xuống xe tại';
  notify(services, order, side, status, status === 'WITHDRAWN'
    ? `Vé ${order.pnr}: ${verb} ${stop}.${money}`
    : `Vé ${order.pnr}: ${reason}. ${verb} ${stop}, chuyến ${hhmmDate(order.departure_time)}.${money} Bạn có thể hủy vé được hoàn đủ tiền trước giờ xuất bến.`);
  return { request: requestView(services, order, side), refund };
}

/**
 * The office confirms or refuses a request. A refusal needs a reason the passenger can read (from 5 characters).
 * Returns { ok, status, code, message } on failure.
 */
export function reviewHomeRequest(services, operatorId, orderId, side, { approve, reason = '', actor = 'office', now = Date.now() } = {}) {
  const order = findOrder(services, operatorId, orderId);
  const key = SIDES[side];
  const home = order && key ? order[key] : null;
  if (!home || !isSold(order)) return { ok: false, status: 404, code: 'HOME_REQUEST_NOT_FOUND', message: 'Không tìm thấy yêu cầu đón/trả tận nhà' };
  if ((home.status || 'CONFIRMED') !== 'PENDING_REVIEW') return { ok: false, status: 409, code: 'HOME_REQUEST_ALREADY_REVIEWED', message: 'Yêu cầu đã được xử lý' };
  if (!liveTickets(services, order).length) return { ok: false, status: 409, code: 'TICKET_NOT_ACTIVE', message: 'Các vé của đơn đã hủy' };
  if (tripStarted(services, order.trip_id)) return { ok: false, status: 409, code: 'TRIP_DEPARTED', message: 'Xe đã xuất bến' };

  if (approve) {
    const next = { ...home, status: 'CONFIRMED', reviewed_at: new Date(now).toISOString(), reviewed_by: actor, reject_reason: null };
    applyHome(services, order, side, next);
    const where = side === 'PICKUP'
      ? `Xe đón bạn tại ${home.address}${home.window_from ? ` trong khoảng ${hhmmDate(home.window_from).slice(0, 5)}–${hhmmDate(home.window_to).slice(0, 5)}` : ''}. Bạn chuẩn bị sẵn trước giờ đón; tài xế sẽ gọi khi tới.`
      : `Xe trả bạn tại ${home.address}.`;
    notify(services, order, side, 'CONFIRMED', `Vé ${order.pnr}, chuyến ${hhmmDate(order.departure_time)}: ${where}`);
    return { ok: true, request: requestView(services, order, side), refund: null };
  }

  const text = String(reason || '').trim();
  if (text.length < 5) return { ok: false, status: 400, code: 'VALIDATION_ERROR', message: 'Cần lý do từ chối (từ 5 ký tự) để báo khách' };
  return { ok: true, ...refuse(services, order, side, home, { status: 'REJECTED', reason: text.slice(0, 200), actor, now }) };
}

/** The passenger takes back a request still under review; the fee is refunded and the ticket keeps its stop. */
export function withdrawHomeRequest(services, ticket, side, { now = Date.now() } = {}) {
  const order = services.paymentService.orders.get(ticket.order_id);
  const key = SIDES[side];
  const home = order && key ? order[key] : null;
  if (!home) return { ok: false, status: 404, code: 'HOME_REQUEST_NOT_FOUND', message: 'Vé này không có yêu cầu đón/trả tận nhà' };
  if ((home.status || 'CONFIRMED') !== 'PENDING_REVIEW') {
    return { ok: false, status: 409, code: 'HOME_REQUEST_ALREADY_REVIEWED', message: 'Yêu cầu đã được nhà xe xử lý; gọi tổng đài để đổi' };
  }
  if (tripStarted(services, order.trip_id)) return { ok: false, status: 409, code: 'TRIP_DEPARTED', message: 'Xe đã xuất bến' };
  return { ok: true, ...refuse(services, order, side, home, { status: 'WITHDRAWN', reason: 'Khách hủy yêu cầu', actor: 'passenger', now }) };
}

/** When the bus leaves, requests nobody reviewed are refused (the passenger was told to wait at the stop). */
export function expireHomeRequests(services, tripId, now = Date.now()) {
  const expired = [];
  for (const order of services?.paymentService?.orders?.values?.() || []) {
    if (order.trip_id !== tripId || !isSold(order)) continue;
    for (const side of Object.keys(SIDES)) {
      const home = order[SIDES[side]];
      if (home?.status !== 'PENDING_REVIEW' || !liveTickets(services, order).length) continue;
      expired.push(refuse(services, order, side, home, { status: 'REJECTED', reason: 'Nhà xe chưa xác nhận kịp trước giờ xuất bến', actor: 'system', now }).request);
    }
  }
  return expired;
}
