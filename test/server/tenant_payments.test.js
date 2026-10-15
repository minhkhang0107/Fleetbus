import test from 'node:test';
import assert from 'node:assert';
import { createFleetBusServer } from '../../source/server/apiServer.js';

test('Multi-tenant Payments and Tickets (T2b)', async (t) => {
  try {
    const { server } = createFleetBusServer({ authMode: 'enforce' });
    
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;
    const baseUrl = `http://localhost:${port}/api/v1`;

    const request = async (method, path, headers = {}, body = null) => {
      const opts = { method, headers: { ...headers } };
      if (body) {
        opts.headers['content-type'] = 'application/json';
        opts.body = JSON.stringify(body);
      }
      const res = await fetch(`${baseUrl}${path}`, opts);
      const data = await res.json().catch(() => null);
      if (res.status >= 400) console.log(method, path, res.status, data);
      return { status: res.status, data };
    };

    const phone = '0912345678';

    // 1. Login with phone 0912345678 as SAOMAI
    await request('POST', '/passenger/auth/request-otp', { 'X-Operator-Code': 'SAOMAI' }, { phone, now: Date.now() });
    const otpResSaoMai = await request('POST', '/passenger/auth/verify-otp', { 'X-Operator-Code': 'SAOMAI' }, { phone, otp: '882199', now: Date.now() });
    const tokenSaoMai = otpResSaoMai.data.data.token;

    // 2. Login with phone 0912345678 as XUYENVIET
    await request('POST', '/passenger/auth/request-otp', { 'X-Operator-Code': 'XUYENVIET' }, { phone, now: Date.now() });
    const otpResXV = await request('POST', '/passenger/auth/verify-otp', { 'X-Operator-Code': 'XUYENVIET' }, { phone, otp: '882199', now: Date.now() });
    const tokenXV = otpResXV.data.data.token;

    let order;
    const tripId = 'trp_xv_hn_th_01';

    await t.test('book a Xuyên Việt seat on trp_xv_hn_th_01', async () => {
      const holdRes = await request('POST', `/passenger/trips/${tripId}/hold-seats`, { 'Authorization': `Bearer ${tokenXV}`, 'X-Operator-Code': 'XUYENVIET', 'Idempotency-Key': `hold-${Date.now()}` }, {
        userId: 'u_' + Date.now(),
        seatCodes: ['A06'],
        pickupStopId: 'stp_hn_my_dinh',
        dropoffStopId: 'stp_th_pb',
        now: Date.now()
      });
      assert.strictEqual(holdRes.status, 200);
      const holdId = holdRes.data.data.hold_id;

      const bookRes = await request('POST', '/passenger/bookings/create', { 'Authorization': `Bearer ${tokenXV}`, 'X-Operator-Code': 'XUYENVIET', 'Idempotency-Key': `book-${Date.now()}` }, {
        tripId,
        holdId,
        seatCodes: ['A06'],
        payer: { phone, full_name: 'Khách Xuyên Việt' },
        passengers: [{ phone, full_name: 'Khách Xuyên Việt' }]
      });
      assert.strictEqual(bookRes.status, 201);
      order = bookRes.data.data.payment;
      
      assert.strictEqual(order.payment_details.account_number, '0071000123456');
      assert.ok(order.payment_details.transfer_memo.startsWith('XUYENVIET BG'));
    });

    await t.test('default webhook path with XUYENVIET memo yields ORDER_NOT_MATCHED', async () => {
      const defaultWebhookRes = await request('POST', '/webhooks/vietqr/ipn', { 'Idempotency-Key': `ipn-${Date.now()}` }, {
        transferMemo: order.payment_details.transfer_memo,
        amountVnd: order.amount_vnd,
        bankRef: 'BANKREF_123',
        now: Date.now()
      });
      assert.strictEqual(defaultWebhookRes.status, 400);
      assert.strictEqual(defaultWebhookRes.data.code, 'ORDER_NOT_MATCHED');
    });

    let issuedTickets = [];
    await t.test('/api/v1/webhooks/vietqr/XUYENVIET/ipn yields success and tickets have op_xuyenviet', async () => {
      const xvWebhookRes = await request('POST', '/webhooks/vietqr/XUYENVIET/ipn', { 'Idempotency-Key': `ipn2-${Date.now()}` }, {
        transferMemo: order.payment_details.transfer_memo,
        amountVnd: order.amount_vnd,
        bankRef: 'BANKREF_123',
        now: Date.now()
      });
      assert.strictEqual(xvWebhookRes.status, 200);
      assert.strictEqual(xvWebhookRes.data.data.settled, true);
      
      issuedTickets = xvWebhookRes.data.data.issued_tickets;
      assert.ok(issuedTickets.length > 0);
      assert.strictEqual(issuedTickets[0].operator_id, 'op_xuyenviet');
    });

    await t.test('Same phone logged in as SAOMAI sees none of those tickets', async () => {
      const saomaiWalletRes = await request('GET', `/passenger/tickets?phone=${phone}`, { 'Authorization': `Bearer ${tokenSaoMai}`, 'X-Operator-Code': 'SAOMAI' });
      assert.strictEqual(saomaiWalletRes.status, 200);
      const hasXV = saomaiWalletRes.data.data.some(t => t.operator_id === 'op_xuyenviet');
      assert.strictEqual(hasXV, false);
    });

    await t.test('XUYENVIET sees the tickets', async () => {
      const xvWalletRes = await request('GET', `/passenger/tickets?phone=${phone}`, { 'Authorization': `Bearer ${tokenXV}`, 'X-Operator-Code': 'XUYENVIET' });
      assert.strictEqual(xvWalletRes.status, 200);
      const xvTickets = xvWalletRes.data.data.filter(t => t.ticket_id === issuedTickets[0].ticket_id);
      assert.strictEqual(xvTickets.length, 1);
    });

    await t.test('Notifications from SAOMAI do not include the XUYENVIET booking notice', async () => {
      const saomaiNotifsRes = await request('GET', '/passenger/notifications', { 'Authorization': `Bearer ${tokenSaoMai}`, 'X-Operator-Code': 'SAOMAI' });
      assert.strictEqual(saomaiNotifsRes.status, 200);
      assert.ok(!saomaiNotifsRes.data.data.some(n => n.payload?.trip_id === tripId));
    });

    await t.test('XUYENVIET notifications DO include the XUYENVIET booking notice', async () => {
      const xvNotifsRes = await request('GET', '/passenger/notifications', { 'Authorization': `Bearer ${tokenXV}`, 'X-Operator-Code': 'XUYENVIET' });
      assert.strictEqual(xvNotifsRes.status, 200);
      assert.ok(xvNotifsRes.data.data.some(n => n.payload?.trip_id === tripId));
    });

    server.close();
  } catch (err) {
    console.error(err);
    throw err;
  }
});
