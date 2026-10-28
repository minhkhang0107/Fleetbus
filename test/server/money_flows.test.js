/**
 * Money flows and passenger account lifecycle test suite (H-01, H-02, H-03, B-12).
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import http from 'node:http';
import { createFleetBusServer } from '../../source/server/apiServer.js';
import { generateTotp } from '../../source/server/core/totp.js';
import { DEV_TOTP_SECRET } from '../../source/server/config.js';
import { DriverCockpitService } from '../../source/server/services/driver/modules/driverService.js';

const TRIP = 'trp_hn_th_01';

describe('Money flows & passenger account lifecycle (H-01, H-02, H-03, B-12)', () => {
  let server;
  let services;
  let baseUrl;
  let directorToken;
  let cashierToken;
  let dispatcherToken;
  let phoneSeq = 925000000;

  function api(path, { method = 'GET', body, token, headers: customHeaders } = {}) {
    return new Promise((resolve, reject) => {
      const headers = { 'Content-Type': 'application/json', ...(customHeaders || {}) };
      if (token) headers.Authorization = `Bearer ${token}`;
      if (method === 'POST') headers['Idempotency-Key'] = crypto.randomUUID();
      const req = http.request(`${baseUrl}${path}`, { method, headers }, (res) => {
        let raw = '';
        res.on('data', (c) => { raw += c; });
        res.on('end', () => {
          let parsed;
          try { parsed = JSON.parse(raw); } catch { parsed = raw; }
          resolve({ status: res.statusCode, body: parsed });
        });
      });
      req.on('error', reject);
      if (body !== undefined) req.write(JSON.stringify(body));
      req.end();
    });
  }

  async function createPassenger() {
    const phone = `0${phoneSeq++}`;
    const otpRes = await api('/api/v1/auth/passenger/otp/request', { method: 'POST', body: { phone } });
    assert.strictEqual(otpRes.status, 200, JSON.stringify(otpRes.body));
    const verRes = await api('/api/v1/auth/passenger/otp/verify', {
      method: 'POST',
      body: { phone, otp: otpRes.body.data.mock_otp }
    });
    assert.strictEqual(verRes.status, 200, JSON.stringify(verRes.body));
    return { phone, token: verRes.body.data.token };
  }

  async function buyTicket(pax, seatCode, paymentMethod = 'VIETQR') {
    const holdRes = await api(`/api/v1/trips/${TRIP}/seats/hold`, {
      method: 'POST',
      token: pax.token,
      body: { seatCodes: [seatCode] }
    });
    assert.strictEqual(holdRes.status, 200, JSON.stringify(holdRes.body));

    const orderRes = await api('/api/v1/bookings/create', {
      method: 'POST',
      token: pax.token,
      body: {
        tripId: TRIP,
        holdId: holdRes.body.data.hold_id,
        seatCodes: [seatCode],
        paymentMethod,
        payer: { full_name: 'Nguyễn Văn Test', phone: pax.phone, email: 'pax@test.vn' },
        passengers: [{ full_name: 'Nguyễn Văn Test', phone: pax.phone, seat_code: seatCode }]
      }
    });
    assert.strictEqual(orderRes.status, 201, JSON.stringify(orderRes.body));

    if (paymentMethod === 'CASH') {
      const pnr = orderRes.body.data.payment.pnr;
      const ticketId = `tkt_${pnr.replace('-', '')}_${seatCode}`;
      const ticket = services.paymentService.tickets.get(ticketId);
      return { order: orderRes.body.data.order, ticket };
    }

    const memo = orderRes.body.data.payment.payment_details.transfer_memo;
    const amount = orderRes.body.data.order.total_payment_vnd;
    const ipnRes = await api('/api/v1/webhooks/vietqr/ipn', {
      method: 'POST',
      body: {
        transferMemo: memo,
        amountVnd: amount,
        bankRef: `tx_mf_${Date.now()}_${seatCode}`
      }
    });
    assert.strictEqual(ipnRes.status, 200, JSON.stringify(ipnRes.body));
    return { order: orderRes.body.data.order, ticket: ipnRes.body.data.issued_tickets[0] };
  }

  before(async () => {
    ({ server, services } = createFleetBusServer({ authMode: 'enforce', webhookSecret: null }));
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    directorToken = (await api('/api/v1/auth/staff/login', {
      method: 'POST',
      body: { username: 'admin@busgo.vn', password: 'admin123', totp: generateTotp(DEV_TOTP_SECRET, Date.now()) }
    })).body.data.token;

    cashierToken = (await api('/api/v1/auth/staff/login', {
      method: 'POST',
      body: { username: 'cashier@busgo.vn', password: 'cash123' }
    })).body.data.token;

    dispatcherToken = (await api('/api/v1/auth/staff/login', {
      method: 'POST',
      body: { username: 'dispatcher@busgo.vn', password: 'disp123' }
    })).body.data.token;
  });

  after(() => new Promise(resolve => server.close(resolve)));

  describe('H-01: Transfer refund destination', () => {
    it('TC-MF-01: cancelling a transfer-paid ticket without refund account returns 400 REFUND_ACCOUNT_REQUIRED', async () => {
      const pax = await createPassenger();
      const { ticket } = await buyTicket(pax, 'A04');

      const cancelRes = await api(`/api/v1/passenger/tickets/${ticket.ticket_id}/cancel`, {
        method: 'POST',
        token: pax.token,
        body: {
          now: Date.parse('2026-08-25T07:00:00+07:00'),
          reason: 'Bận đột xuất'
        }
      });
      assert.strictEqual(cancelRes.status, 400);
      assert.strictEqual(cancelRes.body.code, 'REFUND_ACCOUNT_REQUIRED');
      assert.strictEqual(cancelRes.body.message, 'Nhập tài khoản ngân hàng để nhận tiền hoàn');
    });

    it('TC-MF-02: cancelling with refund account stores account, masks in passenger views, and reveals in full to finance', async () => {
      const pax = await createPassenger();
      const { ticket } = await buyTicket(pax, 'A05');

      const cancelRes = await api(`/api/v1/passenger/tickets/${ticket.ticket_id}/cancel`, {
        method: 'POST',
        token: pax.token,
        body: {
          now: Date.parse('2026-08-25T07:00:00+07:00'),
          reason: 'Đổi lịch trình',
          refund_account: {
            bank_bin: '970415',
            account_number: '1088219999',
            account_name: 'nguyen van test'
          }
        }
      });
      assert.strictEqual(cancelRes.status, 200, JSON.stringify(cancelRes.body));
      const cancelData = cancelRes.body.data;
      assert.strictEqual(cancelData.status, 'REFUND_REQUESTED');
      assert.ok(cancelData.refund_account, 'Must return refund_account in cancel response');
      assert.strictEqual(cancelData.refund_account.account_number, '******9999', 'Account number must be masked in passenger response');
      assert.strictEqual(cancelData.refund_account.account_name, 'NGUYEN VAN TEST', 'Account name must be upper-cased non-diacritic');
      assert.strictEqual(cancelData.refund_account.bank_bin, '970415');

      // Passenger ticket history check
      const histRes = await api('/api/v1/passenger/tickets?tab=CANCELLED', { token: pax.token });
      assert.strictEqual(histRes.status, 200);
      const t = histRes.body.data.find(x => x.ticket_id === ticket.ticket_id);
      assert.ok(t, 'Cancelled ticket must be in cancelled tab');
      assert.strictEqual(t.refund.status, 'REFUND_REQUESTED');
      assert.strictEqual(t.refund.refund_account?.account_number, '******9999');

      // Finance / Fleet Director list refunds check
      const financeRes = await api('/api/v1/ops/refunds?status=REFUND_REQUESTED', { token: directorToken });
      assert.strictEqual(financeRes.status, 200);
      const req = financeRes.body.data.refunds.find(r => r.ticket_id === ticket.ticket_id);
      assert.ok(req, 'Finance must see the refund request');
      assert.strictEqual(req.refund_account?.account_number, '1088219999', 'Finance must see full unmasked account number');
      assert.strictEqual(req.refund_account?.account_name, 'NGUYEN VAN TEST');
    });

    it('TC-MF-03: PATCH /api/v1/passenger/tickets/:id/refund-account allows updating account while REFUND_REQUESTED', async () => {
      const pax = await createPassenger();
      const { ticket } = await buyTicket(pax, 'A06');

      await api(`/api/v1/passenger/tickets/${ticket.ticket_id}/cancel`, {
        method: 'POST',
        token: pax.token,
        body: {
          now: Date.parse('2026-08-25T07:00:00+07:00'),
          refund_account: {
            bank_bin: '970415',
            account_number: '1088219999',
            account_name: 'NGUYEN VAN TEST'
          }
        }
      });

      // Passenger updates to Vietcombank account
      const patchRes = await api(`/api/v1/passenger/tickets/${ticket.ticket_id}/refund-account`, {
        method: 'PATCH',
        token: pax.token,
        body: {
          refund_account: {
            bank_code: 'VCB',
            account_number: '0071001234567',
            account_name: 'nguyen van test sua'
          }
        }
      });
      assert.strictEqual(patchRes.status, 200, JSON.stringify(patchRes.body));
      assert.strictEqual(patchRes.body.data.refund_account.account_number, '******4567', 'Updated account must be masked');
      assert.strictEqual(patchRes.body.data.refund_account.account_name, 'NGUYEN VAN TEST SUA');

      // Finance view sees the updated unmasked account
      const financeRes = await api('/api/v1/ops/refunds?status=REFUND_REQUESTED', { token: directorToken });
      const req = financeRes.body.data.refunds.find(r => r.ticket_id === ticket.ticket_id);
      assert.strictEqual(req.refund_account?.account_number, '0071001234567');
      assert.strictEqual(req.refund_account?.account_name, 'NGUYEN VAN TEST SUA');
    });

    it('TC-MF-04: cancelling a COD ticket does not require a bank account', async () => {
      const pax = await createPassenger();
      const { ticket } = await buyTicket(pax, 'A08', 'CASH');

      const cancelRes = await api(`/api/v1/passenger/tickets/${ticket.ticket_id}/cancel`, {
        method: 'POST',
        token: pax.token,
        body: {
          now: Date.parse('2026-08-25T07:00:00+07:00'),
          reason: 'Hủy vé tiền mặt'
        }
      });
      assert.strictEqual(cancelRes.status, 200, JSON.stringify(cancelRes.body));
      assert.strictEqual(cancelRes.body.data.status, 'CANCELLED');
    });
  });

  describe('H-02: Cash handover settlement', () => {
    const testTripId = 'trp_handover_test_01';

    before(() => {
      // Seed a completed trip ready for depot settlement
      services.driverService.activeTrips.set(testTripId, {
        trip_id: testTripId,
        operator_id: 'op_saomai',
        driver_id: 'TX8821',
        driver_name: 'Trần Văn Lái',
        vehicle_plate: '29B-888.88',
        route_name: 'Hà Nội - Thanh Hóa',
        status: 'COMPLETED',
        departure_time: '2026-08-28T07:00:00+07:00',
        completed_at: '2026-08-28T11:00:00+07:00',
        total_cod_collected_vnd: 220000,
        total_hail_collected_vnd: 100000,
        total_cash_to_handover_vnd: 320000,
        financial_reconciliation_status: 'PENDING_DEPOT_SETTLEMENT',
        debts: [{ debt_id: 'd1', amount_vnd: 50000 }]
      });
    });

    it('TC-MF-05a: GET /api/v1/ops/cash-handovers lists pending handovers with correct details', async () => {
      const res = await api('/api/v1/ops/cash-handovers?status=PENDING', { token: cashierToken });
      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.body.data.handovers));
      const h = res.body.data.handovers.find(x => x.trip_id === testTripId);
      assert.ok(h, 'Trip must be in handovers list');
      assert.strictEqual(h.expected_cash_vnd, 320000);
      assert.strictEqual(h.debt_receipts.count, 1);
      assert.strictEqual(h.debt_receipts.amount_vnd, 50000);
      assert.strictEqual(h.financial_reconciliation_status, 'PENDING_DEPOT_SETTLEMENT');
    });

    it('TC-MF-05b: dispatcher is forbidden (403) from listing or confirming cash handovers', async () => {
      const getRes = await api('/api/v1/ops/cash-handovers', { token: dispatcherToken });
      assert.strictEqual(getRes.status, 403);

      const postRes = await api(`/api/v1/ops/cash-handovers/${testTripId}/confirm`, {
        method: 'POST',
        token: dispatcherToken,
        body: { received_vnd: 320000 }
      });
      assert.strictEqual(postRes.status, 403);
    });

    it('TC-MF-05c: confirming with a difference without note returns 400 NOTE_REQUIRED', async () => {
      const res = await api(`/api/v1/ops/cash-handovers/${testTripId}/confirm`, {
        method: 'POST',
        token: cashierToken,
        body: { received_vnd: 300000 }
      });
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.code, 'NOTE_REQUIRED');
    });

    it('TC-MF-05d: confirming with difference and note sets SETTLED_WITH_DIFFERENCE; second confirm returns 409', async () => {
      const res = await api(`/api/v1/ops/cash-handovers/${testTripId}/confirm`, {
        method: 'POST',
        token: cashierToken,
        body: {
          received_vnd: 300000,
          note: 'Thiếu 20.000 đ do tài xế chưa thu được tiền vẫy'
        }
      });
      assert.strictEqual(res.status, 200, JSON.stringify(res.body));
      assert.strictEqual(res.body.data.financial_reconciliation_status, 'SETTLED_WITH_DIFFERENCE');
      assert.strictEqual(res.body.data.difference_vnd, -20000);
      assert.strictEqual(res.body.data.received_vnd, 300000);

      // Second confirm should return 409 ALREADY_SETTLED
      const res2 = await api(`/api/v1/ops/cash-handovers/${testTripId}/confirm`, {
        method: 'POST',
        token: cashierToken,
        body: { received_vnd: 320000 }
      });
      assert.strictEqual(res2.status, 409);
      assert.strictEqual(res2.body.code, 'ALREADY_SETTLED');
    });

    it('TC-MF-05e: confirming exact amount sets SETTLED with difference 0', async () => {
      const exactTripId = 'trp_handover_exact_02';
      services.driverService.activeTrips.set(exactTripId, {
        trip_id: exactTripId,
        operator_id: 'op_saomai',
        driver_id: 'TX8821',
        status: 'COMPLETED',
        departure_time: '2026-08-28T14:00:00+07:00',
        completed_at: '2026-08-28T18:00:00+07:00',
        total_cod_collected_vnd: 220000,
        total_hail_collected_vnd: 0,
        total_cash_to_handover_vnd: 220000,
        financial_reconciliation_status: 'PENDING_DEPOT_SETTLEMENT'
      });

      const res = await api(`/api/v1/ops/cash-handovers/${exactTripId}/confirm`, {
        method: 'POST',
        token: directorToken,
        body: { received_vnd: 220000 }
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.data.financial_reconciliation_status, 'SETTLED');
      assert.strictEqual(res.body.data.difference_vnd, 0);
    });
  });

  describe('H-03: Service config flags (Insurance and Wallet)', () => {
    it('TC-MF-06: insurance fare is 0 when disabled and charged when enabled', async () => {
      // 1. Ensure insurance is disabled
      const put1 = await api('/api/v1/ops/service-config', {
        method: 'PUT',
        token: directorToken,
        body: { insurance_enabled: false }
      });
      assert.strictEqual(put1.status, 200, JSON.stringify(put1.body));

      const pax = await createPassenger();
      const hold1 = await api(`/api/v1/trips/${TRIP}/seats/hold`, {
        method: 'POST',
        token: pax.token,
        body: { seatCodes: ['A09'] }
      });
      assert.strictEqual(hold1.status, 200, JSON.stringify(hold1.body));

      const order1 = await api('/api/v1/bookings/create', {
        method: 'POST',
        token: pax.token,
        body: {
          tripId: TRIP,
          holdId: hold1.body.data.hold_id,
          seatCodes: ['A09'],
          insuranceSelected: true,
          payer: { full_name: 'Khách Bảo Hiểm Một', phone: pax.phone },
          passengers: [{ full_name: 'Khách Bảo Hiểm Một', phone: pax.phone, seat_code: 'A09' }]
        }
      });
      assert.strictEqual(order1.status, 201, JSON.stringify(order1.body));
      assert.strictEqual(order1.body.data.order.price_breakdown?.insurance_fare, 0, 'Insurance fare must be 0 when disabled');
      assert.strictEqual(order1.body.data.order.total_payment_vnd, 220000);

      // 2. Enable insurance
      await api('/api/v1/ops/service-config', {
        method: 'PUT',
        token: directorToken,
        body: { insurance_enabled: true }
      });

      const hold2 = await api(`/api/v1/trips/${TRIP}/seats/hold`, {
        method: 'POST',
        token: pax.token,
        body: { seatCodes: ['A10'] }
      });

      const order2 = await api('/api/v1/bookings/create', {
        method: 'POST',
        token: pax.token,
        body: {
          tripId: TRIP,
          holdId: hold2.body.data.hold_id,
          seatCodes: ['A10'],
          insuranceSelected: true,
          payer: { full_name: 'Khách Bảo Hiểm Hai', phone: pax.phone },
          passengers: [{ full_name: 'Khách Bảo Hiểm Hai', phone: pax.phone, seat_code: 'A10' }]
        }
      });
      assert.strictEqual(order2.status, 201, JSON.stringify(order2.body));
      assert.strictEqual(order2.body.data.order.price_breakdown?.insurance_fare, 10000, 'Insurance fare must be 10.000 đ when enabled');
      assert.strictEqual(order2.body.data.order.total_payment_vnd, 230000);

      // Reset back to default
      await api('/api/v1/ops/service-config', {
        method: 'PUT',
        token: directorToken,
        body: { insurance_enabled: false }
      });
    });

    it('TC-MF-07: WALLET_CREDIT is refused with 400 WALLET_DISABLED when wallet is disabled', () => {
      const driverService = new DriverCockpitService();
      const tripId = 'trp_wallet_test';
      driverService.activeTrips.set(tripId, {
        trip_id: tripId,
        operator_id: 'op_saomai',
        status: 'IN_TRANSIT',
        manifest: []
      });

      const trip = driverService.activeTrips.get(tripId);
      trip.manifest.push({
        ticket_id: 'tkt_wallet_test_01',
        pnr: 'BG-W01',
        seat_code: 'A11',
        passenger_name: 'Khách Ví',
        phone_masked: '098***111',
        cod_amount_vnd: 220000,
        payment_method: 'COD',
        boarding_status: 'ISSUED'
      });

      // Wallet disabled on op_saomai by default
      const res = driverService.collectCod(tripId, 'tkt_wallet_test_01', {
        amount_collected_vnd: 500000,
        fare_amount_vnd: 220000,
        change_settlement_method: 'WALLET_CREDIT',
        change_wallet_phone: '0988111222'
      });

      assert.strictEqual(res.success, false);
      assert.strictEqual(res.code, 'WALLET_DISABLED');
      assert.strictEqual(res.error, 'Nhà xe chưa bật ví BusGo. Trả tiền thừa bằng tiền mặt hoặc biên lai nợ.');
    });
  });

  describe('B-12: Passenger account deletion', () => {
    it('TC-MF-08: account deletion is refused with active tickets, succeeds after trip/cancellation, revokes token and anonymizes data', async () => {
      const pax = await createPassenger();
      const { ticket } = await buyTicket(pax, 'B05');

      // 1. Refused when owning upcoming ticket
      const del1 = await api('/api/v1/passenger/me', {
        method: 'DELETE',
        token: pax.token
      });
      assert.strictEqual(del1.status, 409);
      assert.strictEqual(del1.body.code, 'HAS_UPCOMING_TICKETS');

      // 2. Cancel the ticket -> opened refund request REFUND_REQUESTED
      const cancelRes = await api(`/api/v1/passenger/tickets/${ticket.ticket_id}/cancel`, {
        method: 'POST',
        token: pax.token,
        body: {
          now: Date.parse('2026-08-25T07:00:00+07:00'),
          refund_account: {
            bank_bin: '970415',
            account_number: '1088219999',
            account_name: 'NGUYEN VAN TEST'
          }
        }
      });
      assert.strictEqual(cancelRes.status, 200);

      // Still refused while refund is pending
      const del2 = await api('/api/v1/passenger/me', {
        method: 'DELETE',
        token: pax.token
      });
      assert.strictEqual(del2.status, 409);
      assert.strictEqual(del2.body.code, 'HAS_UPCOMING_TICKETS');

      // Finance approves refund
      const refundId = cancelRes.body.data.refund_id;
      const appRes = await api(`/api/v1/ops/refunds/${refundId}/process`, {
        method: 'POST',
        token: directorToken,
        body: { approved: true, notes: 'Đã hoàn tiền' }
      });
      assert.strictEqual(appRes.status, 200);

      // 3. Deletion succeeds
      const del3 = await api('/api/v1/passenger/me', {
        method: 'DELETE',
        token: pax.token
      });
      assert.strictEqual(del3.status, 200);
      assert.strictEqual(del3.body.data.deleted, true);

      // 4. Old token is now rejected
      const profileRes = await api('/api/v1/passenger/profile', {
        token: pax.token
      });
      assert.strictEqual(profileRes.status, 401);

      // 5. Check ticket payer/passenger name is anonymized and phone is masked
      const t = services.paymentService.tickets.get(ticket.ticket_id);
      assert.strictEqual(t.passenger_name, 'Khách đã xóa tài khoản');
      assert.ok(t.passenger_phone.includes('******'));

      // 6. Logging in again with the same phone creates a fresh account without old tickets
      const newOtp = await api('/api/v1/auth/passenger/otp/request', { method: 'POST', body: { phone: pax.phone } });
      const newVer = await api('/api/v1/auth/passenger/otp/verify', {
        method: 'POST',
        body: { phone: pax.phone, otp: newOtp.body.data.mock_otp }
      });
      assert.strictEqual(newVer.status, 200);
      const freshToken = newVer.body.data.token;

      const freshTicketsRes = await api('/api/v1/passenger/tickets?tab=UPCOMING', { token: freshToken });
      assert.strictEqual(freshTicketsRes.status, 200, JSON.stringify(freshTicketsRes.body));
      assert.strictEqual(freshTicketsRes.body.data.length, 0, 'Fresh account must have no old tickets');
    });
  });
});
