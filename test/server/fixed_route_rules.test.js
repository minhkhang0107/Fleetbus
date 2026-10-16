/**
 * BusGo fixed-route rules (docs/specs/fixed_routes_schedules_spec.md): office review of home pickup / drop-off
 * (D130), cancelling and closing one day's departure (D131), route suspension (D132), passenger stop changes
 * inside the paid segment (D133) and extra departures (D134).
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { createFleetBusServer } from '../../source/server/apiServer.js';
import { addDays, vnDate } from '../../source/server/core/serviceDate.js';

const PHONE = '0901234567';
// Long Biên: inside the MANUAL pickup area of Sao Mai (fee 80 000 đ), outside the AUTO inner-city one.
const HOME_LB = { address: '8 Ngọc Lâm, Long Biên', lat: 21.04, lng: 105.9, note: 'nhà góc' };
const HOME_HN = { address: '12 ngõ 34 Giải Phóng, Hoàng Mai', lat: 20.99, lng: 105.84 };

describe('Fixed routes, schedules and home service rules', () => {
  let server;
  let services;
  let baseUrl;
  let pax;
  let dispatcher;
  let cashier;

  const request = async (path, { method = 'GET', body, token } = {}) => {
    const headers = { 'Content-Type': 'application/json', 'X-Operator-Code': 'SAOMAI' };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (method !== 'GET') headers['Idempotency-Key'] = crypto.randomUUID();
    const res = await fetch(`${baseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  };
  const freeSeat = (tripId) => services.seatMapService.getSeatMap(tripId).data.seats.find(s => s.state === 'AVAILABLE' && !used.has(`${tripId}:${s.seat_code}`)).seat_code;
  const used = new Set();
  const hold = async (tripId, pickupStopId, dropoffStopId) => {
    const seat = freeSeat(tripId);
    used.add(`${tripId}:${seat}`);
    const res = await request(`/api/v1/passenger/trips/${tripId}/hold-seats`, { method: 'POST', token: pax, body: { seatCodes: [seat], pickupStopId, dropoffStopId } });
    return { res, seat };
  };
  /** Holds, orders and pays one seat; returns { order, ticket }. */
  const buy = async (tripId, { pickup = 'stp_hn_gb', dropoff = 'stp_th_pb', extra = {} } = {}) => {
    const { res, seat } = await hold(tripId, pickup, dropoff);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const created = await request('/api/v1/passenger/bookings/create', {
      method: 'POST',
      token: pax,
      body: { tripId, holdId: res.body.data.hold_id, seatCodes: [seat], payer: { full_name: 'Nguyễn An', phone: PHONE }, passengers: [{ seat_code: seat, full_name: 'Nguyễn An', phone: PHONE }], ...extra }
    });
    assert.strictEqual(created.status, 201, JSON.stringify(created.body));
    const settled = services.paymentService.settlePayment(created.body.data.payment.order_id);
    assert.strictEqual(settled.success, true, JSON.stringify(settled));
    return { created: created.body.data, order: settled.data.order, ticket: settled.data.tickets[0] };
  };
  const manifestItem = (tripId, ticketId) => services.driverService.activeTrips.get(tripId)?.manifest.find(m => m.ticket_id === ticketId);
  const notifications = () => services.trackingService.getNotifications(PHONE, 'op_saomai').data;
  const refundsOf = (pnr) => services.managerService.refundRequests.filter(r => r.pnr === pnr);
  // Days' runs two days ahead: on sale, with ops and driver trips set up on demand.
  const day2 = addDays(vnDate(), 2);
  const run = (schedule) => `${schedule}_${day2.replaceAll('-', '')}`;
  const search = async (query) => (await request(`/api/v1/trips/search?origin=${encodeURIComponent('Hà Nội')}&destination=${encodeURIComponent('Thanh Hóa')}${query || ''}`)).body.data.map(t => t.trip_id);

  before(async () => {
    ({ server, services } = createFleetBusServer());
    await new Promise(resolve => server.listen(0, resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    const otp = await request('/api/v1/auth/passenger/otp/request', { method: 'POST', body: { phone: PHONE } });
    pax = (await request('/api/v1/auth/passenger/otp/verify', { method: 'POST', body: { phone: PHONE, otp: otp.body.data.mock_otp } })).body.data.token;
    const staff = async (username, password) => (await request('/api/v1/auth/staff/login', { method: 'POST', body: { username, password } })).body.data.token;
    dispatcher = await staff('dispatcher@busgo.vn', 'disp123');
    cashier = await staff('cashier@busgo.vn', 'cash123');
  });

  after(() => new Promise(resolve => server.close(resolve)));

  describe('home pickup under office review (D130)', () => {
    it('TC-FR-01: an address in a MANUAL area is sold as pending; the driver serves the stop until confirmed', async () => {
      const { created, order, ticket } = await buy('trp_hn_th_01', { extra: { homePickup: HOME_LB } });
      assert.strictEqual(created.order.home_needs_review, true, 'the app is told before the transfer');
      assert.strictEqual(created.order.home_pickup_status, 'PENDING_REVIEW');
      assert.strictEqual(created.order.home_service_fee_vnd, 80000, 'the fee is disclosed and charged up front');
      assert.strictEqual(ticket.home_pickup.status, 'PENDING_REVIEW');
      assert.strictEqual(manifestItem('trp_hn_th_01', ticket.ticket_id).home_pickup, null, 'a pending address is not a stop of the bus');

      const forbidden = await request('/api/v1/ops/home-requests', { token: cashier });
      assert.strictEqual(forbidden.status, 403);
      const list = await request('/api/v1/ops/home-requests', { token: dispatcher });
      const mine = list.body.data.find(r => r.order_id === order.order_id);
      assert.deepStrictEqual([mine.side, mine.status, mine.fee_vnd, mine.address], ['PICKUP', 'PENDING_REVIEW', 80000, HOME_LB.address]);
      assert.strictEqual(mine.review_deadline, ticket.home_pickup.window_from, 'answer before the pickup window opens');

      const ok = await request(`/api/v1/ops/home-requests/${order.order_id}/PICKUP/confirm`, { method: 'POST', token: dispatcher, body: {} });
      assert.strictEqual(ok.status, 200, JSON.stringify(ok.body));
      assert.strictEqual(services.paymentService.tickets.get(ticket.ticket_id).home_pickup.status, 'CONFIRMED');
      assert.strictEqual(manifestItem('trp_hn_th_01', ticket.ticket_id).home_pickup.address, HOME_LB.address, 'confirmed: the driver gets the address');
      assert.ok(notifications().some(n => n.type === 'HOME_PICKUP_CONFIRMED' && n.body.includes(HOME_LB.address)));
      const again = await request(`/api/v1/ops/home-requests/${order.order_id}/PICKUP/reject`, { method: 'POST', token: dispatcher, body: { reason: 'Ngõ quá hẹp' } });
      assert.strictEqual(again.body.code, 'HOME_REQUEST_ALREADY_REVIEWED');
      assert.ok(services.managerService.auditLog.some(a => a.action === 'HOME_REQUEST_CONFIRM'));
    });

    it('TC-FR-02: an AUTO area address is confirmed at once', async () => {
      const { created, ticket } = await buy('trp_hn_th_01', { extra: { homePickup: HOME_HN } });
      assert.strictEqual(created.order.home_needs_review, false);
      assert.strictEqual(manifestItem('trp_hn_th_01', ticket.ticket_id).home_pickup.status, 'CONFIRMED');
    });

    it('TC-FR-03: a refusal needs a reason, refunds the fee and makes cancelling free', async () => {
      const { order, ticket } = await buy('trp_hn_th_01', { extra: { homePickup: HOME_LB } });
      const fare = ticket.fare_vnd;
      const noReason = await request(`/api/v1/ops/home-requests/${order.order_id}/PICKUP/reject`, { method: 'POST', token: dispatcher, body: { reason: 'x' } });
      assert.strictEqual(noReason.status, 400);
      const no = await request(`/api/v1/ops/home-requests/${order.order_id}/PICKUP/reject`, { method: 'POST', token: dispatcher, body: { reason: 'Xe 34 chỗ không vào được ngõ' } });
      assert.strictEqual(no.status, 200, JSON.stringify(no.body));
      assert.ok(no.body.data.refund_id);
      const refund = refundsOf(order.pnr).find(r => r.source === 'HOME_SERVICE_REFUSED');
      assert.strictEqual(refund.amount_vnd, 80000);
      const t = services.paymentService.tickets.get(ticket.ticket_id);
      assert.deepStrictEqual([t.home_pickup.status, t.home_pickup.reject_reason, t.fare_vnd], ['REJECTED', 'Xe 34 chỗ không vào được ngõ', fare - 80000]);
      assert.strictEqual(manifestItem('trp_hn_th_01', ticket.ticket_id).pickup_stop_id, 'stp_hn_gb', 'the ticket rides from its stop');
      assert.ok(notifications().some(n => n.type === 'HOME_PICKUP_REJECTED' && n.body.includes('không vào được ngõ') && n.body.includes('Giáp Bát')));

      const cancel = await request(`/api/v1/passenger/tickets/${ticket.ticket_id}/cancel`, { method: 'POST', token: pax, body: {} });
      assert.strictEqual(cancel.status, 200, JSON.stringify(cancel.body));
      assert.deepStrictEqual([cancel.body.data.tier, cancel.body.data.refund_amount_vnd], ['HOME_SERVICE_REFUSED', fare - 80000], 'the rest of the price, no fee twice');
    });

    it('TC-FR-04: the passenger withdraws a pending request; one unreviewed when the bus leaves is refused', async () => {
      const a = await buy('trp_hn_th_01', { extra: { homePickup: HOME_LB } });
      const w = await request(`/api/v1/passenger/tickets/${a.ticket.ticket_id}/home-request/withdraw`, { method: 'POST', token: pax, body: { side: 'PICKUP' } });
      assert.strictEqual(w.status, 200, JSON.stringify(w.body));
      assert.strictEqual(w.body.data.status, 'WITHDRAWN');
      assert.strictEqual(refundsOf(a.order.pnr)[0].amount_vnd, 80000);

      const b = await buy('trp_hn_th_01', { extra: { homePickup: HOME_LB } });
      services.paymentService.eventBridge.emit('TRIP_STARTED', { tripId: 'trp_hn_th_01', vehiclePlate: 'x' });
      const t = services.paymentService.tickets.get(b.ticket.ticket_id);
      assert.deepStrictEqual([t.home_pickup.status, t.home_pickup.reviewed_by], ['REJECTED', 'system']);
      assert.strictEqual(refundsOf(b.order.pnr)[0].source, 'HOME_SERVICE_REFUSED');
    });
  });

  describe('one day\'s departure: close sales, cancel (D131)', () => {
    it('TC-FR-05: a closed departure leaves the search and refuses holds; reopening sells again', async () => {
      assert.ok((await search(`&date=${day2}`)).includes(run('trp_hn_th_03')));
      const close = await request(`/api/v1/ops/trips/${run('trp_hn_th_03')}/sales`, { method: 'POST', token: dispatcher, body: { open: false, reason: 'Xe đầy, bán tại bến' } });
      assert.strictEqual(close.status, 200, JSON.stringify(close.body));
      assert.strictEqual(close.body.data.sale_status, 'SALES_CLOSED');
      assert.ok(!(await search(`&date=${day2}`)).includes(run('trp_hn_th_03')));
      assert.strictEqual((await hold(run('trp_hn_th_03'), 'stp_hn_gb', 'stp_th_sam_son')).res.body.code, 'SALES_CLOSED');
      await request(`/api/v1/ops/trips/${run('trp_hn_th_03')}/sales`, { method: 'POST', token: dispatcher, body: { open: true } });
      assert.ok((await search(`&date=${day2}`)).includes(run('trp_hn_th_03')));
      assert.strictEqual((await request(`/api/v1/ops/trips/${run('trp_hn_th_03')}/sales`, { method: 'POST', token: cashier, body: { open: false } })).status, 403);
    });

    it('TC-FR-05b: a run that finished ahead of its timetable is no longer sold (D148)', async () => {
      const ops = services.managerService.findTrip(run('trp_hn_th_03'));
      ops.status = 'COMPLETED';
      assert.ok(!(await search(`&date=${day2}`)).includes(run('trp_hn_th_03')));
      assert.strictEqual((await hold(run('trp_hn_th_03'), 'stp_hn_gb', 'stp_th_sam_son')).res.body.code, 'TRIP_COMPLETED');
      ops.status = 'SCHEDULED';
      assert.ok((await search(`&date=${day2}`)).includes(run('trp_hn_th_03')));
    });

    it('TC-FR-06: cancelling refunds every ticket in full, tells passengers and stops all sales', async () => {
      const { ticket } = await buy(run('trp_hn_th_02'), { pickup: 'stp_hn_gb', dropoff: 'stp_th_pb' });
      const short = await request(`/api/v1/ops/trips/${run('trp_hn_th_02')}/cancel`, { method: 'POST', token: dispatcher, body: { reason: 'lũ' } });
      assert.strictEqual(short.status, 400);
      const res = await request(`/api/v1/ops/trips/${run('trp_hn_th_02')}/cancel`, { method: 'POST', token: dispatcher, body: { reason: 'Quốc lộ 1A ngập do lũ' } });
      assert.strictEqual(res.status, 200, JSON.stringify(res.body));
      assert.deepStrictEqual([res.body.data.cancelled_tickets, res.body.data.refund_total_vnd], [1, ticket.fare_vnd]);
      const t = services.paymentService.tickets.get(ticket.ticket_id);
      assert.deepStrictEqual([t.status, t.cancel_source], ['CANCELLED', 'OPERATOR']);
      const refund = refundsOf(ticket.pnr)[0];
      assert.deepStrictEqual([refund.source, refund.amount_vnd, refund.status], ['OPERATOR_CANCEL', ticket.fare_vnd, 'REFUND_REQUESTED'], 'refund requested, not claimed as paid back');
      assert.ok(notifications().some(n => n.type === 'TRIP_CANCELLED' && n.body.includes('ngập')));
      assert.ok(!(await search(`&date=${day2}`)).includes(run('trp_hn_th_02')));
      assert.strictEqual((await hold(run('trp_hn_th_02'), 'stp_hn_gb', 'stp_th_pb')).res.body.code, 'TRIP_CANCELLED');
      assert.strictEqual((await request(`/api/v1/ops/trips/${run('trp_hn_th_02')}/cancel`, { method: 'POST', token: dispatcher, body: { reason: 'Quốc lộ 1A ngập do lũ' } })).body.code, 'TRIP_ALREADY_CANCELLED');
      const pos = services.managerService.createPosBooking({ tripId: run('trp_hn_th_02'), passengerName: 'Khách quầy', phone: '0912000111', seatCodes: ['A09'], operatorId: 'op_saomai' });
      assert.strictEqual(pos.code, 'TRIP_CANCELLED');
    });

    it('TC-FR-07: a departure that left cannot be cancelled', async () => {
      const trip = services.driverService.activeTrips.get('trp_hn_th_01');
      const status = trip.status;
      trip.status = 'IN_TRANSIT';
      const res = await request('/api/v1/ops/trips/trp_hn_th_01/cancel', { method: 'POST', token: dispatcher, body: { reason: 'Thử hủy khi xe chạy' } });
      trip.status = status;
      assert.strictEqual(res.body.code, 'TRIP_ALREADY_STARTED');
    });
  });

  describe('route suspension (D132)', () => {
    it('TC-FR-08: a suspended route sells nothing and offers no day; sold tickets stay', async () => {
      const set = (value) => request('/api/v1/ops/service-config/routes/rt_hn_th', { method: 'PUT', token: dispatcher, body: { sales_suspended: value } });
      assert.strictEqual((await set('yes')).status, 400);
      assert.strictEqual((await set(true)).status, 200);
      assert.deepStrictEqual(await search(), []);
      assert.strictEqual((await hold('trp_hn_th_01', 'stp_hn_gb', 'stp_th_pb')).res.body.code, 'ROUTE_SUSPENDED');
      const days = await request(`/api/v1/trips/run-days?origin=${encodeURIComponent('Hà Nội')}&destination=${encodeURIComponent('Thanh Hóa')}`);
      assert.deepStrictEqual(days.body.data.days, []);
      await set(null);
      assert.ok((await search()).includes('trp_hn_th_01'));
    });
  });

  describe('passenger changes stops (D133)', () => {
    it('TC-FR-09: inside the paid segment the change is effective at once for the driver too', async () => {
      const { ticket } = await buy('trp_hn_th_01', { pickup: 'stp_hn_gb', dropoff: 'stp_th_pb' });
      const change = (body) => request(`/api/v1/passenger/tickets/${ticket.ticket_id}/stops`, { method: 'POST', token: pax, body });
      assert.strictEqual((await change({ pickup_stop_id: 'stp_th_pb' })).body.code, 'STOP_NOT_ALLOWED');
      assert.strictEqual((await change({ dropoff_stop_id: 'stp_th_sam_son' })).body.code, 'OUTSIDE_PAID_SEGMENT', 'farther costs more: through the office');
      assert.strictEqual((await change({ pickup_stop_id: 'stp_nb', dropoff_stop_id: 'stp_rs_phu_ly' })).body.code, 'INVALID_SEGMENT');
      const ok = await change({ pickup_stop_id: 'stp_rs_phap_van' });
      assert.strictEqual(ok.status, 200, JSON.stringify(ok.body));
      assert.strictEqual(ok.body.data.pickup_stop_id, 'stp_rs_phap_van');
      assert.strictEqual(manifestItem('trp_hn_th_01', ticket.ticket_id).pickup_stop_id, 'stp_rs_phap_van');
      assert.ok(notifications().some(n => n.type === 'STOPS_CHANGED'));
    });

    it('TC-FR-10: a ticket with a home pickup keeps it until the request is withdrawn', async () => {
      const { ticket } = await buy('trp_hn_th_01', { extra: { homePickup: HOME_HN } });
      const res = await request(`/api/v1/passenger/tickets/${ticket.ticket_id}/stops`, { method: 'POST', token: pax, body: { pickup_stop_id: 'stp_rs_phap_van' } });
      assert.strictEqual(res.body.code, 'HOME_SERVICE_ACTIVE');
    });
  });

  describe('fixed origin and destination (D135)', () => {
    it('TC-FR-12: the office sets the two stations; the app config carries them and which directions run', async () => {
      const cfg = async () => (await request('/api/v1/app/config')).body.data.fixed_endpoints;
      const seeded = await cfg();
      assert.deepStrictEqual([seeded.origin.name, seeded.destination.name, seeded.allow_swap, seeded.forward_available, seeded.reverse_available], ['Bến xe Giáp Bát', 'Bến xe Phía Bắc Thanh Hóa', true, true, false], 'out and back by default, even before a return schedule exists');

      const put = (body, token = dispatcher) => request('/api/v1/ops/service-config/endpoints', { method: 'PUT', token, body });
      assert.strictEqual((await put({ origin_station_id: 'stp_hn_gb', destination_station_id: 'stp_hn_my_dinh' })).status, 400, 'same city');
      assert.strictEqual((await put({ origin_station_id: 'stp_hn_gb', destination_station_id: 'stp_nowhere' })).status, 400);
      assert.strictEqual((await put({ origin_station_id: 'stp_hn_my_dinh', destination_station_id: 'stp_th_pb' }, cashier)).status, 403);
      const ok = await put({ origin_station_id: 'stp_hn_my_dinh', destination_station_id: 'stp_th_pb' });
      assert.strictEqual(ok.status, 200, JSON.stringify(ok.body));
      assert.strictEqual((await cfg()).origin.name, 'Bến xe Mỹ Đình');
      assert.strictEqual((await put({ origin_station_id: 'stp_hn_my_dinh', destination_station_id: 'stp_th_pb', allow_swap: 'no' })).status, 400);
      await put({ origin_station_id: 'stp_hn_my_dinh', destination_station_id: 'stp_th_pb', allow_swap: false });
      assert.strictEqual((await cfg()).allow_swap, false, 'one-way company: the office turns the swap off');
      assert.ok(ok.body.data.stations.length >= 2, 'the office picks from the company stations');
      assert.ok(services.managerService.auditLog.some(a => a.action === 'FIXED_ENDPOINTS_UPDATE'));

      assert.strictEqual((await put({ fixed_endpoints: null })).status, 200);
      assert.strictEqual(await cfg(), null, 'cleared: the app lets passengers pick places');
    });
  });

  describe('extra departure (D134)', () => {
    it('TC-FR-11: an extra run is sold on its day only and is not edited once on sale', async () => {
      const today = vnDate();
      const day = addDays(today, 3);
      const created = await request('/api/v1/ops/schedules', { method: 'POST', token: dispatcher, body: { route_id: 'rt_hn_th', departure: '23:10', extra_date: day } });
      assert.strictEqual(created.status, 201, JSON.stringify(created.body));
      assert.deepStrictEqual([created.body.data.extra, created.body.data.valid_from, created.body.data.valid_to], [true, day, day]);
      const id = created.body.data.schedule_id;
      const on = async (d) => (await request(`/api/v1/trips/search?origin=${encodeURIComponent('Hà Nội')}&destination=${encodeURIComponent('Thanh Hóa')}&date=${d}`)).body.data.some(t => t.schedule_id === id);
      assert.strictEqual(await on(day), true);
      assert.strictEqual(await on(addDays(today, 4)), false);
      const edit = await request(`/api/v1/ops/schedules/${id}`, { method: 'PATCH', token: dispatcher, body: { departure: '23:30' } });
      assert.strictEqual(edit.body.code, 'EXTRA_RUN_ON_SALE');
      const past = await request('/api/v1/ops/schedules', { method: 'POST', token: dispatcher, body: { route_id: 'rt_hn_th', departure: '23:10', extra_date: addDays(today, -1) } });
      assert.strictEqual(past.status, 400);
    });
  });
});
