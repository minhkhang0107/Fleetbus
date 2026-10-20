import test from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { createFleetBusServer } from '../../source/server/apiServer.js';
import { findOperatorById } from '../../source/server/core/operators.js';

test('TC-PAX-CASH-01: cash payment method booking, COD collection, operator toggle, cancellation, and revenue', async (t) => {
  const { server, services } = createFleetBusServer({ authMode: 'enforce', webhookSecret: null });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  const call = async (path, { method = 'GET', body, token } = {}) => {
    const h = { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID(), 'X-Operator-Code': 'SAOMAI' };
    if (token) h.Authorization = `Bearer ${token}`;
    const res = await fetch(`${base}${path}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, json: await res.json() };
  };

  const passenger = async (phone) => {
    const otp = (await call('/api/v1/auth/passenger/otp/request', { method: 'POST', body: { phone } })).json.data.mock_otp;
    return (await call('/api/v1/auth/passenger/otp/verify', { method: 'POST', body: { phone, otp } })).json.data.token;
  };

  const book = async (token, phone, seats, paymentMethod) => {
    const seatCodes = Array.isArray(seats) ? seats : [seats];
    const hold = await call('/api/v1/trips/trp_hn_th_01/seats/hold', { method: 'POST', token, body: { seatCodes } });
    return call('/api/v1/bookings/create', {
      method: 'POST',
      token,
      body: {
        tripId: 'trp_hn_th_01',
        holdId: hold.json.data.hold_id,
        seatCodes,
        ...(paymentMethod !== undefined ? { paymentMethod } : {}),
        payer: { full_name: 'Khach Tien Mat', phone },
        passengers: seatCodes.map(seat_code => ({ seat_code, full_name: 'Khach Tien Mat' }))
      }
    });
  };

  try {
    await t.test('cash booking of 1 seat sets UNPAID_COD and COD manifest item while VietQR stays PENDING_PAYMENT', async () => {
      const tokenCash = await passenger('0912000401');
      const resCash = await book(tokenCash, '0912000401', 'A05', 'CASH');
      assert.strictEqual(resCash.status, 201, JSON.stringify(resCash.json));

      const orderCash = services.paymentService.orders.get(resCash.json.data.payment.order_id);
      assert.ok(orderCash);
      assert.strictEqual(orderCash.payment_method, 'CASH');
      assert.strictEqual(orderCash.payment_status, 'UNPAID_COD');
      assert.strictEqual(orderCash.payment_details, null);
      assert.strictEqual(orderCash.ticket_ids.length, 1);

      const ticket = services.paymentService.tickets.get(orderCash.ticket_ids[0]);
      assert.ok(ticket);
      assert.strictEqual(ticket.payment_method, 'CASH');
      assert.strictEqual(ticket.payment_status, 'UNPAID_COD');
      assert.strictEqual(ticket.cod_amount_vnd, ticket.fare_vnd);
      assert.strictEqual(ticket.cod_collected, false);

      const driverTrip = services.driverService.activeTrips.get('trp_hn_th_01');
      const manifestItem = driverTrip.manifest.find(m => m.ticket_id === ticket.ticket_id);
      assert.ok(manifestItem);
      assert.strictEqual(manifestItem.payment_method, 'COD');
      assert.strictEqual(manifestItem.cod_amount_vnd, ticket.fare_vnd);
      assert.strictEqual(manifestItem.cod_collected, false);

      const tokenQr = await passenger('0912000402');
      const resQr = await book(tokenQr, '0912000402', 'A06');
      assert.strictEqual(resQr.status, 201, JSON.stringify(resQr.json));

      const orderQr = services.paymentService.orders.get(resQr.json.data.payment.order_id);
      assert.strictEqual(orderQr.payment_status, 'PENDING_PAYMENT');
      assert.notStrictEqual(orderQr.payment_details, null);
      assert.ok(orderQr.payment_details.qr_payload);
    });

    await t.test('2-seat cash booking transitions order and manager booking to PAID only after both seats are collected', async () => {
      const token = await passenger('0912000403');
      const res = await book(token, '0912000403', ['B01', 'B02'], 'CASH');
      assert.strictEqual(res.status, 201, JSON.stringify(res.json));

      const order = services.paymentService.orders.get(res.json.data.payment.order_id);
      assert.strictEqual(order.ticket_ids.length, 2);
      const [tkt1Id, tkt2Id] = order.ticket_ids;
      const tkt1 = services.paymentService.tickets.get(tkt1Id);
      const tkt2 = services.paymentService.tickets.get(tkt2Id);
      const fare = tkt1.fare_vnd;

      const mgrBooking = services.managerService.bookings.find(b => b.pnr === order.pnr);
      assert.ok(mgrBooking);
      assert.strictEqual(mgrBooking.payment_status, 'UNPAID_COD');
      assert.strictEqual(mgrBooking.cod_collected_vnd, 0);

      const collect1 = services.driverService.collectCod('trp_hn_th_01', tkt1Id);
      assert.ok(collect1.success, JSON.stringify(collect1));
      assert.strictEqual(tkt1.payment_status, 'PAID');
      assert.strictEqual(tkt1.cod_collected, true);
      assert.strictEqual(tkt2.payment_status, 'UNPAID_COD');
      assert.strictEqual(tkt2.cod_collected, false);
      assert.strictEqual(order.payment_status, 'UNPAID_COD');
      assert.strictEqual(mgrBooking.payment_status, 'UNPAID_COD');
      assert.strictEqual(mgrBooking.cod_collected_vnd, fare);

      const collect2 = services.driverService.collectCod('trp_hn_th_01', tkt2Id);
      assert.ok(collect2.success, JSON.stringify(collect2));
      assert.strictEqual(tkt1.payment_status, 'PAID');
      assert.strictEqual(tkt2.payment_status, 'PAID');
      assert.strictEqual(tkt2.cod_collected, true);
      assert.strictEqual(order.payment_status, 'PAID');
      assert.strictEqual(mgrBooking.payment_status, 'PAID');
      assert.strictEqual(mgrBooking.cod_collected_vnd, fare * 2);
    });

    await t.test('operator with allow_cash_payment = false rejects cash bookings with 422 PAYMENT_METHOD_NOT_ALLOWED', async () => {
      const saomai = findOperatorById('op_saomai');
      const prev = saomai.service_config.allow_cash_payment;
      saomai.service_config.allow_cash_payment = false;
      try {
        const token = await passenger('0912000404');
        const res = await book(token, '0912000404', 'B03', 'CASH');
        assert.strictEqual(res.status, 422, JSON.stringify(res.json));
        assert.strictEqual(res.json.code, 'PAYMENT_METHOD_NOT_ALLOWED');
      } finally {
        saomai.service_config.allow_cash_payment = prev;
      }
    });

    await t.test('cancelling an unpaid cash ticket returns refund_amount_vnd 0, tier CASH_UNPAID, and opens no refund request', async () => {
      const token = await passenger('0912000405');
      const res = await book(token, '0912000405', 'B04', 'CASH');
      assert.strictEqual(res.status, 201, JSON.stringify(res.json));

      const ticketId = res.json.data.payment.ticket_ids[0];
      const beforeRefunds = services.managerService.refundRequests.length;

      const cancelRes = services.paymentService.cancelTicket(ticketId);
      assert.ok(cancelRes.success, JSON.stringify(cancelRes));
      assert.strictEqual(cancelRes.data.refund_amount_vnd, 0);
      assert.strictEqual(cancelRes.data.tier, 'CASH_UNPAID');
      assert.strictEqual(services.managerService.refundRequests.length, beforeRefunds);
    });

    await t.test('a cash booking contributes 0 to _moneyFigures gross_revenue_vnd before collection and its collected amount after', async () => {
      const token = await passenger('0912000406');
      const res = await book(token, '0912000406', 'B05', 'CASH');
      assert.strictEqual(res.status, 201, JSON.stringify(res.json));

      const { pnr, ticket_ids: [ticketId] } = res.json.data.payment;
      const booking = services.managerService.bookings.find(b => b.pnr === pnr);
      assert.ok(booking);

      assert.strictEqual(services.managerService._moneyFigures([booking]).gross_revenue_vnd, 0);

      const collected = services.driverService.collectCod('trp_hn_th_01', ticketId);
      assert.ok(collected.success, JSON.stringify(collected));

      assert.ok(booking.cod_collected_vnd > 0);
      assert.strictEqual(services.managerService._moneyFigures([booking]).gross_revenue_vnd, booking.cod_collected_vnd);
    });
  } finally {
    server.close();
  }
});
