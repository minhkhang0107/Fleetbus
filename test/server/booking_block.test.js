/**
 * D185: Passenger online booking block & sales cutoff rules.
 * Online booking is blocked when:
 * 1. Trip is cancelled, completed, sales closed, or route suspended (saleBlock)
 * 2. Bus started (status IN_TRANSIT on ops or driver trip) -> 409 TRIP_DEPARTED
 * 3. Online sales cutoff passed (now >= effectiveDeparture - cutoffMinutes) -> 409 BOOKING_CUTOFF_PASSED
 * 4. Outside date window (checkBookableDeparture)
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { createFleetBusServer } from '../../source/server/apiServer.js';
import { addDays, vnDate } from '../../source/server/core/serviceDate.js';
import { DEFAULT_ONLINE_SALES_CUTOFF_MINUTES, bookUntil, bookingBlock } from '../../source/server/core/tripSales.js';

const PHONE = '0901234569';

describe('Booking block and sales cutoff rules (D185)', () => {
  let server;
  let services;
  let baseUrl;
  let paxToken;
  let dispatcherToken;

  const day2 = addDays(vnDate(), 2);
  const run = (schedule) => `${schedule}_${day2.replaceAll('-', '')}`;

  const request = async (path, { method = 'GET', body, token, headers: extraHeaders = {} } = {}) => {
    const headers = { 'Content-Type': 'application/json', 'X-Operator-Code': 'SAOMAI', ...extraHeaders };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (method !== 'GET' && !headers['Idempotency-Key']) headers['Idempotency-Key'] = crypto.randomUUID();
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const text = await res.text();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
    return { status: res.status, body: parsed };
  };

  before(async () => {
    ({ server, services } = createFleetBusServer({ webhookSecret: 'off' }));
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    // Get dispatcher token
    const dispRes = await request('/api/v1/auth/staff/login', {
      method: 'POST',
      body: { username: 'dispatcher@busgo.vn', password: 'disp123' }
    });
    dispatcherToken = dispRes.body.data.token;

    // Get passenger token
    const otp = await request('/api/v1/auth/passenger/otp/request', { method: 'POST', body: { phone: PHONE } });
    const verify = await request('/api/v1/auth/passenger/otp/verify', {
      method: 'POST',
      body: { phone: PHONE, otp: otp.body.data.mock_otp }
    });
    paxToken = verify.body.data.token;

    // Trigger search to populate day2 schedules in managerService and searchService
    await request(`/api/v1/trips/search?origin=${encodeURIComponent('Hà Nội')}&destination=${encodeURIComponent('Thanh Hóa')}&date=${day2}`);
  });

  after(() => new Promise((resolve) => server.close(resolve)));

  it('TC-BB-01: exports DEFAULT_ONLINE_SALES_CUTOFF_MINUTES and functions correctly', () => {
    assert.strictEqual(DEFAULT_ONLINE_SALES_CUTOFF_MINUTES, 15);
    const mockTrip = { trip_id: 't1', route_id: 'r1', departure_time: '2026-11-01T07:00:00+07:00' };
    const until = bookUntil(services, mockTrip, { online_sales_cutoff_minutes: 20 });
    assert.strictEqual(until, new Date(Date.parse('2026-11-01T07:00:00+07:00') - 20 * 60000).toISOString());

    const blocked = bookingBlock(services, mockTrip, { online_sales_cutoff_minutes: 20 }, {
      now: Date.parse('2026-11-01T06:50:00+07:00')
    });
    assert.strictEqual(blocked?.code, 'BOOKING_CUTOFF_PASSED');
    assert.match(blocked?.message, /20 phút/);
  });

  it('TC-BB-02: cutoff passed returns 409 BOOKING_CUTOFF_PASSED on hold and bookable false in search & seat-map', async () => {
    const tripId = run('trp_hn_th_01');
    const opsTrip = services.managerService.findTrip(tripId);
    assert.ok(opsTrip, 'trip must exist');
    const depMs = Date.parse(opsTrip.departure_time);

    // 10 minutes before departure (cutoff is default 15 min -> cutoff passed)
    const testNow = depMs - 10 * 60000;

    // Search returns the trip with bookable: false and block details
    const searchRes = await request(`/api/v1/trips/search?origin=${encodeURIComponent('Hà Nội')}&destination=${encodeURIComponent('Thanh Hóa')}&date=${day2}&now=${testNow}`);
    assert.strictEqual(searchRes.status, 200);
    const trip = searchRes.body.data.find((t) => t.trip_id === tripId);
    assert.ok(trip);
    assert.strictEqual(trip.bookable, false);
    assert.strictEqual(trip.block_code, 'BOOKING_CUTOFF_PASSED');
    assert.match(trip.block_message, /15 phút/);
    assert.strictEqual(trip.book_until, new Date(depMs - 15 * 60000).toISOString());

    // Seat map returns the same block info
    const seatMapRes = await request(`/api/v1/passenger/trips/${tripId}/seat-map?now=${testNow}`);
    assert.strictEqual(seatMapRes.status, 200);
    assert.strictEqual(seatMapRes.body.data.bookable, false);
    assert.strictEqual(seatMapRes.body.data.block_code, 'BOOKING_CUTOFF_PASSED');
    assert.match(seatMapRes.body.data.block_message, /15 phút/);
    assert.strictEqual(seatMapRes.body.data.book_until, new Date(depMs - 15 * 60000).toISOString());

    // Hold returns 409 BOOKING_CUTOFF_PASSED
    const holdRes = await request(`/api/v1/passenger/trips/${tripId}/hold-seats`, {
      method: 'POST',
      token: paxToken,
      body: { seatCodes: ['A01'], now: testNow }
    });
    assert.strictEqual(holdRes.status, 409);
    assert.strictEqual(holdRes.body.code, 'BOOKING_CUTOFF_PASSED');
    assert.match(holdRes.body.message, /15 phút/);
  });

  it('TC-BB-03: office declared delay extends effective departure and keeps sale open', async () => {
    const tripId = run('trp_hn_th_01');
    const opsTrip = services.managerService.findTrip(tripId);
    const depMs = Date.parse(opsTrip.departure_time);

    // Declare a 30-minute delay by office
    const delayRes = await request(`/api/v1/ops/trips/${tripId}/delay`, {
      method: 'POST',
      token: dispatcherToken,
      body: { delay_minutes: 30, reason: 'Xe bảo dưỡng phát sinh' }
    });
    assert.strictEqual(delayRes.status, 200);

    // At testNow (10 min before original timetable departure):
    // effective departure = depMs + 30 min, book_until = depMs + 30 - 15 = depMs + 15 min.
    // Since testNow < book_until, the trip is bookable!
    const testNow = depMs - 10 * 60000;

    const searchRes = await request(`/api/v1/trips/search?origin=${encodeURIComponent('Hà Nội')}&destination=${encodeURIComponent('Thanh Hóa')}&date=${day2}&now=${testNow}`);
    const trip = searchRes.body.data.find((t) => t.trip_id === tripId);
    assert.ok(trip);
    assert.strictEqual(trip.bookable, true);
    assert.strictEqual(trip.block_code, null);
    assert.strictEqual(trip.book_until, new Date(depMs + (30 - 15) * 60000).toISOString());

    // Holding seat succeeds
    const holdRes = await request(`/api/v1/passenger/trips/${tripId}/hold-seats`, {
      method: 'POST',
      token: paxToken,
      body: { seatCodes: ['A02'], now: testNow }
    });
    assert.strictEqual(holdRes.status, 200);

    // Reset delay back to 0
    await request(`/api/v1/ops/trips/${tripId}/delay`, {
      method: 'POST',
      token: dispatcherToken,
      body: { delay_minutes: 0, reason: 'Khôi phục giờ chuẩn' }
    });
  });

  it('TC-BB-04: trip IN_TRANSIT before timetable departure returns 409 TRIP_DEPARTED', async () => {
    const tripId = run('trp_hn_th_02');
    const opsTrip = services.managerService.findTrip(tripId);
    assert.ok(opsTrip);
    const depMs = Date.parse(opsTrip.departure_time);

    // Bus starts 2 hours before timetable departure
    opsTrip.status = 'IN_TRANSIT';
    const testNow = depMs - 120 * 60000;

    // Search shows bookable: false with TRIP_DEPARTED
    const searchRes = await request(`/api/v1/trips/search?origin=${encodeURIComponent('Hà Nội')}&destination=${encodeURIComponent('Thanh Hóa')}&date=${day2}&now=${testNow}`);
    const trip = searchRes.body.data.find((t) => t.trip_id === tripId);
    assert.ok(trip);
    assert.strictEqual(trip.bookable, false);
    assert.strictEqual(trip.block_code, 'TRIP_DEPARTED');
    assert.strictEqual(trip.block_message, 'Xe đã xuất bến, không đặt vé trực tuyến được nữa. Chọn chuyến khác hoặc gọi tổng đài nhà xe.');

    // Hold returns 409 TRIP_DEPARTED
    const holdRes = await request(`/api/v1/passenger/trips/${tripId}/hold-seats`, {
      method: 'POST',
      token: paxToken,
      body: { seatCodes: ['A01'], now: testNow }
    });
    assert.strictEqual(holdRes.status, 409);
    assert.strictEqual(holdRes.body.code, 'TRIP_DEPARTED');
    assert.strictEqual(holdRes.body.message, 'Xe đã xuất bến, không đặt vé trực tuyến được nữa. Chọn chuyến khác hoặc gọi tổng đài nhà xe.');

    // Reset status
    opsTrip.status = 'SCHEDULED';
  });

  it('TC-BB-05: closed sales shown in search with bookable false and block_code SALES_CLOSED', async () => {
    const tripId = run('trp_hn_th_03');
    const closeRes = await request(`/api/v1/ops/trips/${tripId}/sales`, {
      method: 'POST',
      token: dispatcherToken,
      body: { open: false, reason: 'Xe kín chỗ hợp đồng' }
    });
    assert.strictEqual(closeRes.status, 200);

    const searchRes = await request(`/api/v1/trips/search?origin=${encodeURIComponent('Hà Nội')}&destination=${encodeURIComponent('Thanh Hóa')}&date=${day2}`);
    const trip = searchRes.body.data.find((t) => t.trip_id === tripId);
    assert.ok(trip);
    assert.strictEqual(trip.bookable, false);
    assert.strictEqual(trip.block_code, 'SALES_CLOSED');

    // Hold returns 409 SALES_CLOSED
    const holdRes = await request(`/api/v1/passenger/trips/${tripId}/hold-seats`, {
      method: 'POST',
      token: paxToken,
      body: { seatCodes: ['A01'] }
    });
    assert.strictEqual(holdRes.status, 409);
    assert.strictEqual(holdRes.body.code, 'SALES_CLOSED');

    // Reopen sales
    await request(`/api/v1/ops/trips/${tripId}/sales`, {
      method: 'POST',
      token: dispatcherToken,
      body: { open: true }
    });
  });

  it('TC-BB-06: office sets online_sales_cutoff_minutes via PUT /api/v1/ops/service-config and validates 0..240', async () => {
    // Invalid negative number
    const badNeg = await request('/api/v1/ops/service-config', {
      method: 'PUT',
      token: dispatcherToken,
      body: { online_sales_cutoff_minutes: -1 }
    });
    assert.strictEqual(badNeg.status, 400);
    assert.strictEqual(badNeg.body.code, 'VALIDATION_ERROR');
    assert.strictEqual(badNeg.body.message, 'Giờ ngừng bán trực tuyến là số phút 0-240');

    // Invalid > 240
    const badHigh = await request('/api/v1/ops/service-config', {
      method: 'PUT',
      token: dispatcherToken,
      body: { online_sales_cutoff_minutes: 241 }
    });
    assert.strictEqual(badHigh.status, 400);
    assert.strictEqual(badHigh.body.code, 'VALIDATION_ERROR');
    assert.strictEqual(badHigh.body.message, 'Giờ ngừng bán trực tuyến là số phút 0-240');

    // Valid: set to 0
    const okZero = await request('/api/v1/ops/service-config', {
      method: 'PUT',
      token: dispatcherToken,
      body: { online_sales_cutoff_minutes: 0 }
    });
    assert.strictEqual(okZero.status, 200);
    assert.strictEqual(okZero.body.data.online_sales_cutoff_minutes, 0);

    // Public service config reflects cutoff 0
    const pubRes = await request('/api/v1/service-config');
    assert.strictEqual(pubRes.status, 200);
    assert.strictEqual(pubRes.body.data.online_sales_cutoff_minutes, 0);

    // Reset cutoff back to 15
    await request('/api/v1/ops/service-config', {
      method: 'PUT',
      token: dispatcherToken,
      body: { online_sales_cutoff_minutes: 15 }
    });
  });

  it('TC-BB-07: payment order expires_at is capped at effective departure time (not shortened to cutoff)', async () => {
    const tripId = run('trp_hn_th_01');
    const opsTrip = services.managerService.findTrip(tripId);
    const depMs = Date.parse(opsTrip.departure_time);

    // Set cutoff to 0 so booking is allowed right up to departure
    await request('/api/v1/ops/service-config', {
      method: 'PUT',
      token: dispatcherToken,
      body: { online_sales_cutoff_minutes: 0 }
    });

    // now is 5 minutes before departure
    const testNow = depMs - 5 * 60000;

    const holdRes = await request(`/api/v1/passenger/trips/${tripId}/hold-seats`, {
      method: 'POST',
      token: paxToken,
      body: { seatCodes: ['A03'], now: testNow }
    });
    assert.strictEqual(holdRes.status, 200);

    const bookingRes = await request('/api/v1/passenger/bookings/create', {
      method: 'POST',
      token: paxToken,
      body: {
        tripId,
        holdId: holdRes.body.data.hold_id,
        seatCodes: ['A03'],
        payer: { full_name: 'Nguyễn Văn Test', phone: PHONE },
        passengers: [{ full_name: 'Nguyễn Văn Test', seat_code: 'A03', phone: PHONE }],
        now: testNow
      }
    });
    assert.strictEqual(bookingRes.status, 201, JSON.stringify(bookingRes.body));
    const payment = bookingRes.body.data.payment;

    // Normal payment expiry is 10 min, but departure is in 5 min: expires_at must equal departure time
    assert.strictEqual(Date.parse(payment.expires_at), depMs);

    // Reset cutoff
    await request('/api/v1/ops/service-config', {
      method: 'PUT',
      token: dispatcherToken,
      body: { online_sales_cutoff_minutes: 15 }
    });
  });

  it('TC-BB-08: bank IPN on a trip that started triggers refund (LATE_REFUND) instead of issuing tickets', async () => {
    const tripId = run('trp_hn_th_02');
    const opsTrip = services.managerService.findTrip(tripId);
    const depMs = Date.parse(opsTrip.departure_time);

    // Create an order while trip is SCHEDULED (1 hour before departure)
    const orderNow = depMs - 60 * 60000;
    const holdRes = await request(`/api/v1/passenger/trips/${tripId}/hold-seats`, {
      method: 'POST',
      token: paxToken,
      body: { seatCodes: ['A04'], now: orderNow }
    });
    assert.strictEqual(holdRes.status, 200);

    const bookingRes = await request('/api/v1/passenger/bookings/create', {
      method: 'POST',
      token: paxToken,
      body: {
        tripId,
        holdId: holdRes.body.data.hold_id,
        seatCodes: ['A04'],
        payer: { full_name: 'Nguyễn Văn Hoàn', phone: PHONE },
        passengers: [{ full_name: 'Nguyễn Văn Hoàn', seat_code: 'A04', phone: PHONE }],
        now: orderNow
      }
    });
    assert.strictEqual(bookingRes.status, 201, JSON.stringify(bookingRes.body));
    const payment = bookingRes.body.data.payment;
    const orderId = payment.order_id;
    const pnr = payment.pnr;

    // Now bus departs (status becomes IN_TRANSIT) before payment arrives
    opsTrip.status = 'IN_TRANSIT';

    // Bank IPN arrives on time (before order expires_at)
    const ipnNow = orderNow + 2 * 60000;
    const ipnRes = await request('/api/v1/webhooks/vietqr/SAOMAI/ipn', {
      method: 'POST',
      body: {
        transferMemo: payment.payment_details.transfer_memo,
        amountVnd: payment.amount_vnd,
        bankRef: `tx_started_refund_${Date.now()}`,
        now: ipnNow
      }
    });
    assert.strictEqual(ipnRes.status, 200);
    assert.strictEqual(ipnRes.body.data.settled, false);

    // Order status is marked UNMATCHED_OVERDUE and late refund is recorded
    const storedOrder = services.paymentService.orders.get(orderId);
    assert.strictEqual(storedOrder.payment_status, 'UNMATCHED_OVERDUE');
    assert.strictEqual(storedOrder.refunded_vnd, payment.amount_vnd);

    const refund = services.managerService.refundRequests.find((r) => r.pnr === pnr);
    assert.ok(refund, 'A refund request must be opened');
    assert.strictEqual(refund.source, 'UNMATCHED_OVERDUE');
    assert.strictEqual(refund.amount_vnd, payment.amount_vnd);

    // No tickets issued
    const issuedTickets = [...services.paymentService.tickets.values()].filter((t) => t.order_id === orderId);
    assert.strictEqual(issuedTickets.length, 0);

    // Reset status
    opsTrip.status = 'SCHEDULED';
  });
});
