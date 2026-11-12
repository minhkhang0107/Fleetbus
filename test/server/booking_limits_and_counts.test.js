import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { createFleetBusServer } from '../../source/server/apiServer.js';
import { addDays, vnDate } from '../../source/server/core/serviceDate.js';

describe('Booking limits, search seat counts, and alert resolution', () => {
  let server;
  let services;
  let baseUrl;
  let dispatcherToken;

  const request = async (path, { method = 'GET', body, token, headers: customHeaders } = {}) => {
    const headers = { 'Content-Type': 'application/json', 'X-Operator-Code': 'SAOMAI', ...(customHeaders || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (method === 'POST') headers['Idempotency-Key'] = crypto.randomUUID();
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    return { status: res.status, body: await res.json() };
  };

  const getPassengerToken = async (phone) => {
    const otp = await request('/api/v1/auth/passenger/otp/request', { method: 'POST', body: { phone } });
    const verified = await request('/api/v1/auth/passenger/otp/verify', {
      method: 'POST',
      body: { phone, otp: otp.body.data.mock_otp }
    });
    return verified.body.data.token;
  };

  before(async () => {
    ({ server, services } = createFleetBusServer({ authMode: 'enforce', webhookSecret: 'off' }));
    await new Promise(resolve => server.listen(0, resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    const loginRes = await request('/api/v1/ops/auth/login', {
      method: 'POST',
      body: { username: 'dispatcher@busgo.vn', password: 'disp123' }
    });
    dispatcherToken = loginRes.body.data.token;
  });

  after(() => new Promise(resolve => server.close(resolve)));

  it('1. search count drops after a booking on a run with no bus assigned', async () => {
    const travelDay = addDays(vnDate(Date.now()), 3);
    const runId = `trp_hn_th_02_${travelDay.replaceAll('-', '')}`;

    // Search trips on this travel day before booking
    const searchBefore = await request(`/api/v1/trips/search?origin=${encodeURIComponent('Hà Nội')}&destination=${encodeURIComponent('Thanh Hóa')}&date=${travelDay}`);
    assert.strictEqual(searchBefore.status, 200);
    const tripBefore = searchBefore.body.data.find(t => t.trip_id === runId);
    assert.ok(tripBefore, `Trip ${runId} should exist in search results`);
    assert.strictEqual(tripBefore.plate_number, null, 'No bus assigned to this run yet');
    const initialSeats = tripBefore.available_seats_count;
    assert.strictEqual(initialSeats, 34, 'Unassigned catalog trip has 34 seats initially');

    // Hold and book 2 seats
    const paxToken = await getPassengerToken('0971000101');
    const holdRes = await request(`/api/v1/trips/${runId}/seats/hold`, {
      method: 'POST',
      token: paxToken,
      body: { seatCodes: ['A01', 'A02'] }
    });
    assert.strictEqual(holdRes.status, 200, JSON.stringify(holdRes.body));
    const holdId = holdRes.body.data.hold_id;

    const bookRes = await request('/api/v1/bookings/create', {
      method: 'POST',
      token: paxToken,
      body: {
        tripId: runId,
        holdId,
        seatCodes: ['A01', 'A02'],
        payer: { full_name: 'Nguyễn Văn Đặt Chỗ', phone: '0971000101' },
        passengers: [
          { seat_code: 'A01', full_name: 'Nguyễn Văn Đặt Chỗ', phone: '0971000101' },
          { seat_code: 'A02', full_name: 'Trần Thị Bạn', phone: '0971000102' }
        ]
      }
    });
    assert.strictEqual(bookRes.status, 201, JSON.stringify(bookRes.body));

    // Search trips again after booking
    const searchAfter = await request(`/api/v1/trips/search?origin=${encodeURIComponent('Hà Nội')}&destination=${encodeURIComponent('Thanh Hóa')}&date=${travelDay}`);
    assert.strictEqual(searchAfter.status, 200);
    const tripAfter = searchAfter.body.data.find(t => t.trip_id === runId);
    assert.ok(tripAfter);
    assert.strictEqual(tripAfter.plate_number, null, 'Still no bus plate assigned');
    assert.strictEqual(tripAfter.available_seats_count, initialSeats - 2, 'Available seats count must drop by 2 after booking');

    // Also verify GET /api/v1/trips/:tripId detail endpoint reflects the drop
    const detailRes = await request(`/api/v1/trips/${runId}`);
    assert.strictEqual(detailRes.status, 200);
    assert.strictEqual(detailRes.body.data.available_seats_count, initialSeats - 2);
  });

  it('2. the amount alert disappears after the rest of the money settles the order', async () => {
    const paxToken = await getPassengerToken('0972000201');
    const holdRes = await request('/api/v1/trips/trp_hn_th_01/seats/hold', {
      method: 'POST',
      token: paxToken,
      body: { seatCodes: ['A01'] }
    });
    assert.strictEqual(holdRes.status, 200);
    const holdId = holdRes.body.data.hold_id;

    const bookRes = await request('/api/v1/bookings/create', {
      method: 'POST',
      token: paxToken,
      body: {
        tripId: 'trp_hn_th_01',
        holdId,
        seatCodes: ['A01'],
        paymentMethod: 'VIETQR_NAPAS247',
        payer: { full_name: 'Lê Văn Chuyển Khoản', phone: '0972000201' },
        passengers: [{ seat_code: 'A01', full_name: 'Lê Văn Chuyển Khoản', phone: '0972000201' }]
      }
    });
    assert.strictEqual(bookRes.status, 201);
    const orderData = bookRes.body.data.payment;
    const totalAmount = bookRes.body.data.order.total_payment_vnd;
    const partialAmount = 100000;
    const remainingAmount = totalAmount - partialAmount;

    // Send partial payment via VietQR IPN
    const ipn1 = await request('/api/v1/webhooks/vietqr/ipn', {
      method: 'POST',
      body: {
        transferMemo: orderData.payment_details.transfer_memo,
        amountVnd: partialAmount,
        bankRef: 'FT_PARTIAL_TEST_1'
      }
    });
    assert.strictEqual(ipn1.status, 200);
    assert.strictEqual(ipn1.body.data.settled, false);
    assert.strictEqual(ipn1.body.data.status, 'PARTIAL');

    // The passenger's check shows what is left, and the QR asks for that amount only.
    const check = await request(`/api/v1/passenger/payments/${orderData.order_id}/verify-status`, { method: 'POST', token: paxToken, body: {} });
    assert.strictEqual(check.body.data.data.paid_amount_vnd, partialAmount);
    assert.strictEqual(check.body.data.data.remaining_vnd, remainingAmount);
    assert.ok(check.body.data.data.payment_details.qr_payload.includes(`54${String(remainingAmount).length.toString().padStart(2, '0')}${remainingAmount}`), 'the QR carries the remaining amount');
    assert.ok(check.body.data.data.payment_details.qr_payload !== orderData.payment_details.qr_payload);

    // The alert should be present in managerService.alerts and GET /api/v1/ops/alerts
    const alertFound = services.managerService.alerts.find(
      a => a.type === 'PAYMENT_AMOUNT_MISMATCH' && (a.order_id === orderData.order_id || a.message.includes(orderData.pnr))
    );
    assert.ok(alertFound, 'Amount mismatch alert must be present after partial payment');
    assert.strictEqual(alertFound.order_id, orderData.order_id, 'Alert must have order_id');

    const alertsApiBefore = await request('/api/v1/ops/alerts', { token: dispatcherToken });
    assert.strictEqual(alertsApiBefore.status, 200);
    assert.ok(
      alertsApiBefore.body.data.alerts.some(a => a.type === 'PAYMENT_AMOUNT_MISMATCH' && a.order_id === orderData.order_id),
      'GET /api/v1/ops/alerts should list the partial payment alert'
    );

    // Send remaining payment
    const ipn2 = await request('/api/v1/webhooks/vietqr/ipn', {
      method: 'POST',
      body: {
        transferMemo: orderData.payment_details.transfer_memo,
        amountVnd: remainingAmount,
        bankRef: 'FT_PARTIAL_TEST_2'
      }
    });
    assert.strictEqual(ipn2.status, 200);
    assert.strictEqual(ipn2.body.data.settled, true);

    const order = services.paymentService.orders.get(orderData.order_id);
    assert.strictEqual(order.payment_status, 'PAID');

    // The alert must disappear after full settlement
    const alertAfter = services.managerService.alerts.find(
      a => a.type === 'PAYMENT_AMOUNT_MISMATCH' && (a.order_id === orderData.order_id || a.message.includes(orderData.pnr))
    );
    assert.strictEqual(alertAfter, undefined, 'Amount mismatch alert must be removed once order is settled');

    const alertsApiAfter = await request('/api/v1/ops/alerts', { token: dispatcherToken });
    assert.strictEqual(alertsApiAfter.status, 200);
    assert.ok(
      !alertsApiAfter.body.data.alerts.some(a => a.type === 'PAYMENT_AMOUNT_MISMATCH' && a.order_id === orderData.order_id),
      'GET /api/v1/ops/alerts must not contain the resolved alert'
    );
  });

  it('3. third unpaid cash order is refused with CASH_LIMIT_REACHED while bank-transfer is accepted', async () => {
    const phone = '0973000301';
    const paxToken = await getPassengerToken(phone);

    // Order 1 (CASH)
    const hold1 = await request('/api/v1/trips/trp_hn_th_01/seats/hold', {
      method: 'POST',
      token: paxToken,
      body: { seatCodes: ['A04'] }
    });
    assert.strictEqual(hold1.status, 200);
    const order1 = await request('/api/v1/bookings/create', {
      method: 'POST',
      token: paxToken,
      body: {
        tripId: 'trp_hn_th_01',
        holdId: hold1.body.data.hold_id,
        seatCodes: ['A04'],
        paymentMethod: 'CASH',
        payer: { full_name: 'Nguyễn Tiền Mặt', phone },
        passengers: [{ seat_code: 'A04', full_name: 'Nguyễn Tiền Mặt', phone }]
      }
    });
    assert.strictEqual(order1.status, 201, JSON.stringify(order1.body));
    assert.strictEqual(order1.body.data.payment.payment_status, 'UNPAID_COD');

    // Order 2 (CASH)
    const hold2 = await request('/api/v1/trips/trp_hn_th_01/seats/hold', {
      method: 'POST',
      token: paxToken,
      body: { seatCodes: ['A05'] }
    });
    assert.strictEqual(hold2.status, 200);
    const order2 = await request('/api/v1/bookings/create', {
      method: 'POST',
      token: paxToken,
      body: {
        tripId: 'trp_hn_th_01',
        holdId: hold2.body.data.hold_id,
        seatCodes: ['A05'],
        paymentMethod: 'CASH',
        payer: { full_name: 'Nguyễn Tiền Mặt', phone },
        passengers: [{ seat_code: 'A05', full_name: 'Nguyễn Tiền Mặt', phone }]
      }
    });
    assert.strictEqual(order2.status, 201, JSON.stringify(order2.body));
    assert.strictEqual(order2.body.data.payment.payment_status, 'UNPAID_COD');

    // Order 3 (CASH) -> refused with 422 CASH_LIMIT_REACHED
    const hold3 = await request('/api/v1/trips/trp_hn_th_01/seats/hold', {
      method: 'POST',
      token: paxToken,
      body: { seatCodes: ['A06'] }
    });
    assert.strictEqual(hold3.status, 200);
    const order3Cash = await request('/api/v1/bookings/create', {
      method: 'POST',
      token: paxToken,
      body: {
        tripId: 'trp_hn_th_01',
        holdId: hold3.body.data.hold_id,
        seatCodes: ['A06'],
        paymentMethod: 'CASH',
        payer: { full_name: 'Nguyễn Tiền Mặt', phone },
        passengers: [{ seat_code: 'A06', full_name: 'Nguyễn Tiền Mặt', phone }]
      }
    });
    assert.strictEqual(order3Cash.status, 422);
    assert.strictEqual(order3Cash.body.code, 'CASH_LIMIT_REACHED');
    assert.strictEqual(
      order3Cash.body.message,
      'Bạn đang có 2 đơn trả tiền mặt khi lên xe chưa đi. Chuyển khoản để đặt thêm, hoặc hủy bớt đơn cũ.'
    );

    // Using the same hold3, switch payment method to bank-transfer -> accepted!
    const order3Transfer = await request('/api/v1/bookings/create', {
      method: 'POST',
      token: paxToken,
      body: {
        tripId: 'trp_hn_th_01',
        holdId: hold3.body.data.hold_id,
        seatCodes: ['A06'],
        paymentMethod: 'VIETQR_NAPAS247',
        payer: { full_name: 'Nguyễn Tiền Mặt', phone },
        passengers: [{ seat_code: 'A06', full_name: 'Nguyễn Tiền Mặt', phone }]
      }
    });
    assert.strictEqual(order3Transfer.status, 201, JSON.stringify(order3Transfer.body));
    assert.strictEqual(order3Transfer.body.data.payment.payment_status, 'PENDING_PAYMENT');
  });

  it('4. a collected (paid) cash order no longer counts towards the cash limit', async () => {
    const phone = '0974000401';
    const paxToken = await getPassengerToken(phone);

    // Cash order 1
    const hold1 = await request('/api/v1/trips/trp_hn_th_01/seats/hold', {
      method: 'POST',
      token: paxToken,
      body: { seatCodes: ['B03'] }
    });
    assert.strictEqual(hold1.status, 200);
    const order1 = await request('/api/v1/bookings/create', {
      method: 'POST',
      token: paxToken,
      body: {
        tripId: 'trp_hn_th_01',
        holdId: hold1.body.data.hold_id,
        seatCodes: ['B03'],
        paymentMethod: 'CASH',
        payer: { full_name: 'Trần Thu Tiền', phone },
        passengers: [{ seat_code: 'B03', full_name: 'Trần Thu Tiền', phone }]
      }
    });
    assert.strictEqual(order1.status, 201);
    const ticket1Id = order1.body.data.payment.ticket_ids[0];

    // Cash order 2
    const hold2 = await request('/api/v1/trips/trp_hn_th_01/seats/hold', {
      method: 'POST',
      token: paxToken,
      body: { seatCodes: ['B04'] }
    });
    assert.strictEqual(hold2.status, 200);
    const order2 = await request('/api/v1/bookings/create', {
      method: 'POST',
      token: paxToken,
      body: {
        tripId: 'trp_hn_th_01',
        holdId: hold2.body.data.hold_id,
        seatCodes: ['B04'],
        paymentMethod: 'CASH',
        payer: { full_name: 'Trần Thu Tiền', phone },
        passengers: [{ seat_code: 'B04', full_name: 'Trần Thu Tiền', phone }]
      }
    });
    assert.strictEqual(order2.status, 201);

    // Attempting a 3rd cash order before collection -> refused
    const hold3 = await request('/api/v1/trips/trp_hn_th_01/seats/hold', {
      method: 'POST',
      token: paxToken,
      body: { seatCodes: ['B05'] }
    });
    assert.strictEqual(hold3.status, 200);
    const attemptBeforeCollect = await request('/api/v1/bookings/create', {
      method: 'POST',
      token: paxToken,
      body: {
        tripId: 'trp_hn_th_01',
        holdId: hold3.body.data.hold_id,
        seatCodes: ['B05'],
        paymentMethod: 'CASH',
        payer: { full_name: 'Trần Thu Tiền', phone },
        passengers: [{ seat_code: 'B05', full_name: 'Trần Thu Tiền', phone }]
      }
    });
    assert.strictEqual(attemptBeforeCollect.status, 422);
    assert.strictEqual(attemptBeforeCollect.body.code, 'CASH_LIMIT_REACHED');

    // Driver collects COD for order 1
    const ticket1 = services.paymentService.tickets.get(ticket1Id);
    assert.strictEqual(ticket1.cod_collected, false);
    const collectRes = services.driverService.collectCod('trp_hn_th_01', ticket1Id, {
      amount_collected_vnd: ticket1.cod_amount_vnd,
      fare_amount_vnd: ticket1.cod_amount_vnd
    });
    assert.strictEqual(collectRes.success, true);
    assert.strictEqual(ticket1.cod_collected, true);

    // Now attempt booking the 3rd cash order using the still-active hold3 -> accepted!
    const attemptAfterCollect = await request('/api/v1/bookings/create', {
      method: 'POST',
      token: paxToken,
      body: {
        tripId: 'trp_hn_th_01',
        holdId: hold3.body.data.hold_id,
        seatCodes: ['B05'],
        paymentMethod: 'CASH',
        payer: { full_name: 'Trần Thu Tiền', phone },
        passengers: [{ seat_code: 'B05', full_name: 'Trần Thu Tiền', phone }]
      }
    });
    assert.strictEqual(attemptAfterCollect.status, 201, JSON.stringify(attemptAfterCollect.body));
    assert.strictEqual(attemptAfterCollect.body.data.payment.payment_status, 'UNPAID_COD');
  });

  it('5. someone who was only a passenger in orders booked by a friend is not blocked from booking cash', async () => {
    const friendPhone = '0978000801';
    const riderPhone = '0978000802';
    const friendToken = await getPassengerToken(friendPhone);
    const riderToken = await getPassengerToken(riderPhone);

    // Friend books 2 cash orders with rider as the passenger
    const holdF1 = await request('/api/v1/trips/trp_hn_th_01/seats/hold', {
      method: 'POST',
      token: friendToken,
      body: { seatCodes: ['A07'] }
    });
    assert.strictEqual(holdF1.status, 200);
    const orderF1 = await request('/api/v1/bookings/create', {
      method: 'POST',
      token: friendToken,
      body: {
        tripId: 'trp_hn_th_01',
        holdId: holdF1.body.data.hold_id,
        seatCodes: ['A07'],
        paymentMethod: 'CASH',
        payer: { full_name: 'Bạn Đặt Hộ', phone: friendPhone },
        passengers: [{ seat_code: 'A07', full_name: 'Hành Khách Đi Kèm', phone: riderPhone }]
      }
    });
    assert.strictEqual(orderF1.status, 201);

    const holdF2 = await request('/api/v1/trips/trp_hn_th_01/seats/hold', {
      method: 'POST',
      token: friendToken,
      body: { seatCodes: ['A08'] }
    });
    assert.strictEqual(holdF2.status, 200);
    const orderF2 = await request('/api/v1/bookings/create', {
      method: 'POST',
      token: friendToken,
      body: {
        tripId: 'trp_hn_th_01',
        holdId: holdF2.body.data.hold_id,
        seatCodes: ['A08'],
        paymentMethod: 'CASH',
        payer: { full_name: 'Bạn Đặt Hộ', phone: friendPhone },
        passengers: [{ seat_code: 'A08', full_name: 'Hành Khách Đi Kèm', phone: riderPhone }]
      }
    });
    assert.strictEqual(orderF2.status, 201);

    // Now rider books their own cash order as payer: must succeed because rider owns 0 orders
    const holdR = await request('/api/v1/trips/trp_hn_th_01/seats/hold', {
      method: 'POST',
      token: riderToken,
      body: { seatCodes: ['A09'] }
    });
    assert.strictEqual(holdR.status, 200);
    const orderR = await request('/api/v1/bookings/create', {
      method: 'POST',
      token: riderToken,
      body: {
        tripId: 'trp_hn_th_01',
        holdId: holdR.body.data.hold_id,
        seatCodes: ['A09'],
        paymentMethod: 'CASH',
        payer: { full_name: 'Hành Khách Tự Đặt', phone: riderPhone },
        passengers: [{ seat_code: 'A09', full_name: 'Hành Khách Tự Đặt', phone: riderPhone }]
      }
    });
    assert.strictEqual(orderR.status, 201, 'Rider must not be blocked when they were only a passenger on friend orders');
  });

  it('6. late payment after hold expired when seat was taken receives LATE_REFUND and push notification', async () => {
    const phone = '0975000501';
    const paxToken = await getPassengerToken(phone);

    const holdRes = await request('/api/v1/trips/trp_hn_th_01/seats/hold', {
      method: 'POST',
      token: paxToken,
      body: { seatCodes: ['A10'] }
    });
    assert.strictEqual(holdRes.status, 200);

    const bookRes = await request('/api/v1/bookings/create', {
      method: 'POST',
      token: paxToken,
      body: {
        tripId: 'trp_hn_th_01',
        holdId: holdRes.body.data.hold_id,
        seatCodes: ['A10'],
        paymentMethod: 'VIETQR_NAPAS247',
        payer: { full_name: 'Nguyễn Thanh Toán Trễ', phone },
        passengers: [{ seat_code: 'A10', full_name: 'Nguyễn Thanh Toán Trễ', phone }]
      }
    });
    assert.strictEqual(bookRes.status, 201);
    const orderData = bookRes.body.data.payment;
    const afterExpiry = Date.parse(orderData.expires_at) + 5 * 60 * 1000;

    // The seat is sold at the counter to someone else after the hold expired
    const posSale = services.managerService.createPosBooking({
      tripId: 'trp_hn_th_01',
      passengerName: 'Khách Quầy Chiếm Ghế',
      phone: '0933999888',
      seatCodes: ['A10'],
      mockNow: afterExpiry,
      operatorId: 'op_saomai'
    });
    assert.strictEqual(posSale.success, true, JSON.stringify(posSale));

    // Passenger 1 transfer arrives late
    const lateIpn = await request('/api/v1/webhooks/vietqr/ipn', {
      method: 'POST',
      body: {
        transferMemo: orderData.payment_details.transfer_memo,
        amountVnd: orderData.amount_vnd,
        bankRef: 'FT_LATE_NOTICE_TEST_01',
        now: afterExpiry + 1000
      }
    });
    assert.strictEqual(lateIpn.status, 200);
    assert.strictEqual(lateIpn.body.data.settled, false);
    assert.strictEqual(lateIpn.body.data.status, 'LATE_REFUND');

    // Verify notification was sent to payer phone
    const notifs = services.trackingService.getNotifications(phone, 'op_saomai').data || [];
    const lateNotice = notifs.find(n => n.type === 'PAYMENT_LATE_REFUND');
    assert.ok(lateNotice, 'Notification with type PAYMENT_LATE_REFUND must be dispatched');
    assert.strictEqual(lateNotice.title, 'Chưa xuất được vé');
    assert.strictEqual(
      lateNotice.body,
      `Nhà xe nhận ${orderData.amount_vnd.toLocaleString('vi-VN')} đ cho đơn ${orderData.pnr} khi đơn đã hết hạn và không còn xuất vé được (ghế đã có người đặt, hoặc chuyến đã chạy hay đã hủy). Nhà xe sẽ hoàn lại ${orderData.amount_vnd.toLocaleString('vi-VN')} đ về tài khoản đã chuyển. Bạn có thể đặt chuyến khác trong ứng dụng.`
    );
    assert.deepStrictEqual(lateNotice.payload, {
      order_id: orderData.order_id,
      pnr: orderData.pnr,
      refund_amount_vnd: orderData.amount_vnd
    });

    // Also check GET /api/v1/passenger/notifications API returns it
    const notifApiRes = await request('/api/v1/passenger/notifications', { token: paxToken });
    assert.strictEqual(notifApiRes.status, 200);
    assert.ok(
      notifApiRes.body.data.some(n => n.type === 'PAYMENT_LATE_REFUND' && n.payload?.order_id === orderData.order_id),
      'GET /api/v1/passenger/notifications should contain the PAYMENT_LATE_REFUND notice'
    );
  });
  it('7. a cancellation that refunds nothing opens no refund for the office', async () => {
    const phone = '0975000701';
    const paxToken = await getPassengerToken(phone);
    const hold = await request('/api/v1/trips/trp_hn_th_01/seats/hold', { method: 'POST', token: paxToken, body: { seatCodes: ['B11'] } });
    const book = await request('/api/v1/bookings/create', {
      method: 'POST',
      token: paxToken,
      body: {
        tripId: 'trp_hn_th_01',
        holdId: hold.body.data.hold_id,
        seatCodes: ['B11'],
        paymentMethod: 'VIETQR_NAPAS247',
        payer: { full_name: 'Đinh Văn Hủy', phone },
        passengers: [{ seat_code: 'B11', full_name: 'Đinh Văn Hủy', phone }]
      }
    });
    const pay = book.body.data.payment;
    const ipn = await request('/api/v1/webhooks/vietqr/ipn', { method: 'POST', body: { transferMemo: pay.payment_details.transfer_memo, amountVnd: book.body.data.order.total_payment_vnd, bankRef: 'FT_ZERO_REFUND' } });
    const ticketId = ipn.body.data.issued_tickets[0].ticket_id;
    const before = services.managerService.refunds?.length ?? services.eventBridge?.refunds?.length;

    // Two hours before the 07:00 departure: no refund under the default policy.
    const cancel = await request(`/api/v1/passenger/tickets/${ticketId}/cancel`, { method: 'POST', token: paxToken, body: { now: '2026-08-28T05:00:00+07:00' } });
    assert.strictEqual(cancel.status, 200);
    assert.strictEqual(cancel.body.data.refund_amount_vnd, 0);
    assert.strictEqual(cancel.body.data.refund_id, null);
    assert.strictEqual(cancel.body.data.status, 'CANCELLED');
    const wallet = await request('/api/v1/passenger/tickets?tab=CANCELLED', { token: paxToken });
    const row = wallet.body.data.find(t => t.ticket_id === ticketId);
    assert.ok(row, 'the cancelled ticket is listed');
    assert.ok(!row.refund, 'no refund is shown for it');
    if (before !== undefined) assert.strictEqual(services.managerService.refunds?.length ?? services.eventBridge?.refunds?.length, before);
  });
});
