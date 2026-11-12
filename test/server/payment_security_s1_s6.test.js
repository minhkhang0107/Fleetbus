/**
 * Comprehensive test suite for Payment Security Hardening (S1 - S6).
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { createFleetBusServer, printDevSecurityWarning, listDevBehaviors } from '../../source/server/apiServer.js';
import { getWebhookSecret, DEV_TOTP_SECRET } from '../../source/server/config.js';
import { generateTotp } from '../../source/server/core/totp.js';
import { findOperatorById, findOperatorByCode, OPERATORS } from '../../source/server/core/operators.js';

const TRIP = 'trp_hn_th_01';

describe('Payment Security Hardening S1 - S6', () => {
  let server;
  let services;
  let baseUrl;
  let directorToken;
  let staffToken;
  let adminToken;
  let paxToken;
  let seatCounter = 0;

  const TEST_SECRET = 'test_webhook_secret_key_1234567890';

  const nextSeat = () => {
    const seats = ['A01', 'A02', 'A04', 'A05', 'A06', 'A07', 'A08', 'A09', 'A10', 'B01', 'B02', 'B03', 'B04', 'B05'];
    return seats[seatCounter++ % seats.length];
  };

  const api = async (path, { method = 'GET', body, token, operatorCode, key, headers: extraHeaders = {} } = {}) => {
    const headers = { 'Content-Type': 'application/json', ...extraHeaders };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (operatorCode) headers['X-Operator-Code'] = operatorCode;
    if (method === 'POST' && !headers['Idempotency-Key']) {
      headers['Idempotency-Key'] = key || crypto.randomUUID();
    }
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body))
    });
    const text = await res.text();
    let resBody;
    try {
      resBody = JSON.parse(text);
    } catch {
      resBody = text;
    }
    return { status: res.status, body: resBody };
  };

  const createOrder = async ({ seat = nextSeat(), phone = '0912340001' } = {}) => {
    const hold = await api(`/api/v1/trips/${TRIP}/seats/hold`, {
      method: 'POST',
      token: paxToken,
      operatorCode: 'SAOMAI',
      body: { seatCodes: [seat] }
    });
    assert.strictEqual(hold.status, 200, `Hold failed: ${JSON.stringify(hold.body)}`);
    const created = await api('/api/v1/bookings/create', {
      method: 'POST',
      token: paxToken,
      operatorCode: 'SAOMAI',
      body: {
        tripId: TRIP,
        holdId: hold.body.data.hold_id,
        seatCodes: [seat],
        payer: { phone, full_name: 'Test Passenger' },
        passengers: [{ full_name: 'Test Passenger', phone, seat_code: seat }],
        insurance_confirmed: false,
        payment_method: 'BANK_TRANSFER'
      }
    });
    assert.strictEqual(created.status, 201, `Create booking failed: ${JSON.stringify(created.body)}`);
    return {
      ...created.body.data.order,
      ...created.body.data.payment,
      total_amount_vnd: created.body.data.payment.amount_vnd
    };
  };

  before(async () => {
    const instance = createFleetBusServer({
      authMode: 'enforce',
      webhookSecret: TEST_SECRET
    });
    server = instance.server;
    services = instance.services;
    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        baseUrl = `http://127.0.0.1:${server.address().port}`;
        resolve();
      });
    });

    // Passenger token
    const otpRes = await api('/api/v1/auth/passenger/otp/request', {
      method: 'POST',
      operatorCode: 'SAOMAI',
      body: { phone: '0912340001' }
    });
    const verifyRes = await api('/api/v1/auth/passenger/otp/verify', {
      method: 'POST',
      operatorCode: 'SAOMAI',
      body: { phone: '0912340001', otp: otpRes.body.data.mock_otp }
    });
    paxToken = verifyRes.body.data.token;

    // Director token (admin@busgo.vn is FLEET_DIRECTOR of op_saomai)
    const dirRes = await api('/api/v1/auth/staff/login', {
      method: 'POST',
      body: {
        username: 'admin@busgo.vn',
        password: 'admin123',
        totp: generateTotp(DEV_TOTP_SECRET, Date.now())
      }
    });
    directorToken = dirRes.body.data.token;

    // Staff token (cashier@busgo.vn is STAFF of op_saomai with PAYMENTS permission)
    const staffRes = await api('/api/v1/auth/staff/login', {
      method: 'POST',
      body: {
        username: 'cashier@busgo.vn',
        password: 'cash123'
      }
    });
    staffToken = staffRes.body.data.token;

    // Platform admin token (root@busgo.vn)
    const rootRes = await api('/api/v1/auth/staff/login', {
      method: 'POST',
      body: {
        username: 'root@busgo.vn',
        password: 'root123',
        totp: generateTotp(DEV_TOTP_SECRET, Date.now())
      }
    });
    adminToken = rootRes.body.data.token;
  });

  after(async () => {
    if (server) await new Promise(r => server.close(r));
  });

  // --------------------------------------------------------------------------
  // S1: Webhook VietQR Signature & Anti-Replay
  // --------------------------------------------------------------------------
  describe('S1: Webhook VietQR signature & replay protection', () => {
    it('S1.1: Webhook without secret returns 503 WEBHOOK_NOT_CONFIGURED', async () => {
      const unconfiguredServer = createFleetBusServer({
        authMode: 'off',
        webhookSecret: null
      });
      const uncfgHttp = unconfiguredServer.server;
      await new Promise(r => uncfgHttp.listen(0, '127.0.0.1', r));
      const uncfgUrl = `http://127.0.0.1:${uncfgHttp.address().port}`;

      try {
        const res = await fetch(`${uncfgUrl}/api/v1/webhooks/vietqr/SAOMAI/ipn`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transferMemo: 'TEST', amountVnd: 100000 })
        });
        const body = await res.json();
        assert.strictEqual(res.status, 503);
        assert.strictEqual(body.code, 'WEBHOOK_NOT_CONFIGURED');
        assert.ok(body.message.includes('Nhà xe chưa cấu hình khóa webhook'));
      } finally {
        await new Promise(r => uncfgHttp.close(r));
      }
    });

    it('S1.2: Invalid signature returns 401 INVALID_SIGNATURE', async () => {
      const raw = JSON.stringify({ transferMemo: 'TEST', amountVnd: 100000 });
      const res = await api('/api/v1/webhooks/vietqr/SAOMAI/ipn', {
        method: 'POST',
        headers: {
          'x-signature': 'invalid_signature_hex'
        },
        body: raw
      });
      assert.strictEqual(res.status, 401);
      assert.strictEqual(res.body.code, 'INVALID_SIGNATURE');
    });

    it('S1.3: Valid signature with legacy signing (no x-timestamp) is processed', async () => {
      const order = await createOrder();
      const raw = JSON.stringify({
        transferMemo: order.pnr,
        amountVnd: order.total_amount_vnd,
        bankRef: `VN_REF_LEGACY_${Date.now()}`
      });
      const hmac = crypto.createHmac('sha256', TEST_SECRET);
      hmac.update(raw);
      const signature = hmac.digest('hex');

      const res = await api('/api/v1/webhooks/vietqr/SAOMAI/ipn', {
        method: 'POST',
        headers: {
          'x-signature': signature
        },
        body: raw
      });
      assert.strictEqual(res.status, 200, JSON.stringify(res.body));
      assert.strictEqual(res.body.data.settled, true);
    });

    it('S1.4: Valid signature with x-timestamp (anti-replay) is processed', async () => {
      const order = await createOrder();
      const nowTs = String(Date.now());
      const raw = JSON.stringify({
        transferMemo: order.pnr,
        amountVnd: order.total_amount_vnd,
        bankRef: `VN_REF_TS_${Date.now()}`
      });
      const payloadToSign = `${nowTs}.${raw}`;
      const signature = crypto.createHmac('sha256', TEST_SECRET).update(payloadToSign).digest('hex');

      const res = await api('/api/v1/webhooks/vietqr/SAOMAI/ipn', {
        method: 'POST',
        headers: {
          'x-timestamp': nowTs,
          'x-signature': signature
        },
        body: raw
      });
      assert.strictEqual(res.status, 200, JSON.stringify(res.body));
      assert.strictEqual(res.body.data.settled, true);
    });

    it('S1.5: Stale timestamp (> 5 minutes drift) returns 401 STALE_WEBHOOK', async () => {
      const staleTs = String(Date.now() - 6 * 60 * 1000); // 6 minutes ago
      const raw = JSON.stringify({ transferMemo: 'TEST', amountVnd: 100000 });
      const payloadToSign = `${staleTs}.${raw}`;
      const signature = crypto.createHmac('sha256', TEST_SECRET).update(payloadToSign).digest('hex');

      const res = await api('/api/v1/webhooks/vietqr/SAOMAI/ipn', {
        method: 'POST',
        headers: {
          'x-timestamp': staleTs,
          'x-signature': signature
        },
        body: raw
      });
      assert.strictEqual(res.status, 401);
      assert.strictEqual(res.body.code, 'STALE_WEBHOOK');
    });

    it('S1.6: In production, secret "off" or missing throws error on startup', () => {
      const prevEnv = process.env.NODE_ENV;
      const prevSecret = process.env.FLEETBUS_WEBHOOK_SECRET;
      try {
        process.env.NODE_ENV = 'production';
        process.env.FLEETBUS_WEBHOOK_SECRET = 'off';

        assert.throws(() => {
          getWebhookSecret();
        }, /FLEETBUS_WEBHOOK_SECRET cannot be "off" in production/);

        delete process.env.FLEETBUS_WEBHOOK_SECRET;
        assert.throws(() => {
          getWebhookSecret();
        }, /FLEETBUS_WEBHOOK_SECRET must be set in production/);
      } finally {
        process.env.NODE_ENV = prevEnv;
        if (prevSecret !== undefined) {
          process.env.FLEETBUS_WEBHOOK_SECRET = prevSecret;
        } else {
          delete process.env.FLEETBUS_WEBHOOK_SECRET;
        }
      }
    });
  });

  // --------------------------------------------------------------------------
  // S2: Bank Transactions Without Reference (NEEDS_REVIEW)
  // --------------------------------------------------------------------------
  describe('S2: Bank transactions without reference require review', () => {
    it('S2.1: VietQR transfer with empty bankRef and providerTxId is stored as NEEDS_REVIEW and emits PAYMENT_UNMATCHED', async () => {
      const order = await createOrder();
      let eventEmitted = null;
      const listener = (data) => { eventEmitted = data; };
      services.eventBridge.on('PAYMENT_UNMATCHED', listener);

      try {
        const raw = JSON.stringify({
          transferMemo: order.pnr,
          amountVnd: order.total_amount_vnd,
          bankRef: '',
          providerTxId: ''
        });
        const signature = crypto.createHmac('sha256', TEST_SECRET).update(raw).digest('hex');

        const res = await api('/api/v1/webhooks/vietqr/SAOMAI/ipn', {
          method: 'POST',
          headers: { 'x-signature': signature },
          body: raw
        });

        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.data.settled, false);
        assert.strictEqual(res.body.data.status, 'NEEDS_REVIEW');

        // Order is NOT credited
        const refreshedOrder = services.paymentService.orders.get(order.order_id);
        assert.strictEqual(refreshedOrder.payment_status, 'PENDING_PAYMENT');
        assert.strictEqual(refreshedOrder.paid_amount_vnd || 0, 0);

        // Event was emitted
        assert.ok(eventEmitted, 'PAYMENT_UNMATCHED must be emitted');
        assert.strictEqual(eventEmitted.operatorId, 'op_saomai');
        assert.strictEqual(eventEmitted.amountVnd, order.total_amount_vnd);

        // Listed in unmatched list for staff
        const unmatchedList = services.paymentService.listBankTransactions({
          operatorId: 'op_saomai',
          outcome: 'UNMATCHED'
        });
        const found = unmatchedList.find(tx => tx.outcome === 'NEEDS_REVIEW' && tx.amount_vnd === order.total_amount_vnd);
        assert.ok(found, 'NEEDS_REVIEW transaction must appear in UNMATCHED list');

        // S2.2: Manual assignment by staff credits the order
        const assignRes = services.paymentService.assignBankTransaction(
          found.tx_id,
          order.pnr,
          { operatorId: 'op_saomai', staff: 'cashier_01' }
        );
        assert.strictEqual(assignRes.success, true);
        assert.strictEqual(assignRes.outcome, 'SETTLED');
        assert.strictEqual(refreshedOrder.payment_status, 'PAID');
      } finally {
        services.eventBridge.removeListener('PAYMENT_UNMATCHED', listener);
      }
    });

    it('S2.3: SePay transfer with empty reference is stored as NEEDS_REVIEW', async () => {
      const order = await createOrder();
      const res = services.paymentService.applyBankTransfer({
        provider: 'SEPAY',
        operatorId: 'op_saomai',
        amountVnd: order.total_amount_vnd,
        memo: order.pnr,
        bankRef: null,
        providerTxId: null
      });
      assert.strictEqual(res.outcome, 'NEEDS_REVIEW');
      const refreshedOrder = services.paymentService.orders.get(order.order_id);
      assert.strictEqual(refreshedOrder.payment_status, 'PENDING_PAYMENT');
    });

    it('S2.4: Replaying transaction with same dedupe reference is ignored', async () => {
      const order = await createOrder();
      const ref = `DEDUPE_REF_${Date.now()}`;
      const first = services.paymentService.applyBankTransfer({
        provider: 'VIETQR_HMAC',
        operatorId: 'op_saomai',
        amountVnd: order.total_amount_vnd,
        memo: order.pnr,
        bankRef: ref
      });
      assert.strictEqual(first.outcome, 'SETTLED');

      const replay = services.paymentService.applyBankTransfer({
        provider: 'VIETQR_HMAC',
        operatorId: 'op_saomai',
        amountVnd: order.total_amount_vnd,
        memo: order.pnr,
        bankRef: ref
      });
      assert.strictEqual(replay.replay, true);
    });
  });

  // --------------------------------------------------------------------------
  // S3: Bank Account Verification with 7-Day Migration Grace Period
  // --------------------------------------------------------------------------
  describe('S3: Account number matching current and previous account (7 days)', () => {
    it('S3.1: Account number matching current bank account succeeds', async () => {
      const order = await createOrder();
      const op = findOperatorById('op_saomai');
      const currentAcc = op.bank.account_number;

      const raw = JSON.stringify({
        transferMemo: order.pnr,
        amountVnd: order.total_amount_vnd,
        bankRef: `ACC_MATCH_CURR_${Date.now()}`,
        accountNumber: currentAcc
      });
      const signature = crypto.createHmac('sha256', TEST_SECRET).update(raw).digest('hex');

      const res = await api('/api/v1/webhooks/vietqr/SAOMAI/ipn', {
        method: 'POST',
        headers: { 'x-signature': signature },
        body: raw
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.data.settled, true);
    });

    it('S3.2: Account number matching bank_previous within 7 days succeeds', async () => {
      const order = await createOrder();
      const op = findOperatorById('op_saomai');
      const prevAcc = '999888111222';
      op.bank_previous = {
        bin: '970422',
        bank_name: 'MBBank',
        account_number: prevAcc,
        account_name: 'NHA XE SAO MAI CU',
        until: new Date(Date.now() + 5 * 24 * 3600000).toISOString() // 5 days left
      };

      try {
        const raw = JSON.stringify({
          transferMemo: order.pnr,
          amountVnd: order.total_amount_vnd,
          bankRef: `ACC_MATCH_PREV_${Date.now()}`,
          accountNumber: prevAcc
        });
        const signature = crypto.createHmac('sha256', TEST_SECRET).update(raw).digest('hex');

        const res = await api('/api/v1/webhooks/vietqr/SAOMAI/ipn', {
          method: 'POST',
          headers: { 'x-signature': signature },
          body: raw
        });
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.data.settled, true);
      } finally {
        delete op.bank_previous;
      }
    });

    it('S3.3: Account number not matching current or expired bank_previous returns WRONG_ACCOUNT', async () => {
      const order = await createOrder();
      const op = findOperatorById('op_saomai');
      op.bank_previous = {
        bin: '970422',
        bank_name: 'MBBank',
        account_number: '999888111222',
        until: new Date(Date.now() - 1000).toISOString() // expired 1s ago
      };

      try {
        const raw = JSON.stringify({
          transferMemo: order.pnr,
          amountVnd: order.total_amount_vnd,
          bankRef: `ACC_WRONG_${Date.now()}`,
          accountNumber: '999888111222'
        });
        const signature = crypto.createHmac('sha256', TEST_SECRET).update(raw).digest('hex');

        const res = await api('/api/v1/webhooks/vietqr/SAOMAI/ipn', {
          method: 'POST',
          headers: { 'x-signature': signature },
          body: raw
        });
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.data.settled, false);
        assert.strictEqual(res.body.data.status, 'WRONG_ACCOUNT');
      } finally {
        delete op.bank_previous;
      }
    });
  });

  // --------------------------------------------------------------------------
  // S4: Manual Payment Confirmation Gate & Reporting
  // --------------------------------------------------------------------------
  describe('S4: Manual payment confirmation threshold, note length, and director reporting', () => {
    it('S4.1: Note with less than 10 characters is rejected with 400', async () => {
      const order = await createOrder();
      const res = await api(`/api/v1/ops/orders/${order.order_id}/confirm-payment`, {
        method: 'POST',
        token: staffToken,
        body: {
          amount_vnd: order.total_amount_vnd,
          note: 'ngắn'
        }
      });
      assert.strictEqual(res.status, 400);
      assert.ok(res.body.message.includes('10') && res.body.message.includes('ký tự'));
    });

    it('S4.2: Amount > manual_confirm_limit_vnd by non-director returns 403 MANUAL_CONFIRM_LIMIT', async () => {
      const order = await createOrder();
      // Default limit is 2.000.000 đ. Try confirming 2.500.000 đ
      const res = await api(`/api/v1/ops/orders/${order.order_id}/confirm-payment`, {
        method: 'POST',
        token: staffToken,
        body: {
          amount_vnd: 2500000,
          note: 'Xác nhận chuyển khoản ngân hàng qua ảnh chụp ủy nhiệm chi'
        }
      });
      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.body.code, 'MANUAL_CONFIRM_LIMIT');
      assert.ok(res.body.message.includes('cần giám đốc xác nhận'));
    });

    it('S4.3: Amount > manual_confirm_limit_vnd by director succeeds', async () => {
      const order = await createOrder();
      const res = await api(`/api/v1/ops/orders/${order.order_id}/confirm-payment`, {
        method: 'POST',
        token: directorToken,
        body: {
          amount_vnd: 2500000,
          note: 'Giám đốc trực tiếp duyệt giao dịch lớn qua ngân hàng'
        }
      });
      assert.strictEqual(res.status, 200);
      assert.ok(res.body.data.outcome === 'SETTLED' || res.body.data.outcome === 'OVERPAID_SETTLED');
    });

    it('S4.4: Director can update manual_confirm_limit_vnd; staff cannot', async () => {
      // Staff forbidden
      const staffPut = await api('/api/v1/ops/payment-settings', {
        method: 'PUT',
        token: staffToken,
        body: {
          manual_confirm_limit_vnd: 5000000
        }
      });
      assert.strictEqual(staffPut.status, 403);

      // Director allowed
      const dirPut = await api('/api/v1/ops/payment-settings', {
        method: 'PUT',
        token: directorToken,
        body: {
          manual_confirm_limit_vnd: 5000000
        }
      });
      assert.strictEqual(dirPut.status, 200);
      assert.strictEqual(dirPut.body.data.manual_confirm_limit_vnd, 5000000);

      // Reset back
      await api('/api/v1/ops/payment-settings', {
        method: 'PUT',
        token: directorToken,
        body: { manual_confirm_limit_vnd: 2000000 }
      });
    });

    it('S4.5: GET /api/v1/ops/payments/manual-confirmations returns confirmations list and total; staff receives 403', async () => {
      // Staff forbidden
      const staffGet = await api('/api/v1/ops/payments/manual-confirmations', {
        method: 'GET',
        token: staffToken
      });
      assert.strictEqual(staffGet.status, 403);

      // Director allowed
      const dirGet = await api('/api/v1/ops/payments/manual-confirmations', {
        method: 'GET',
        token: directorToken
      });
      assert.strictEqual(dirGet.status, 200);
      assert.ok(Array.isArray(dirGet.body.data.items));
      assert.ok(typeof dirGet.body.data.total_amount_vnd === 'number');
      assert.ok(dirGet.body.data.total_count >= 1);
    });
  });

  // --------------------------------------------------------------------------
  // S5: Safe Bank Account Migration & Director Alert
  // --------------------------------------------------------------------------
  describe('S5: Safe bank account migration, alert, and cancellation', () => {
    it('S5.1: PATCH /api/v1/platform/operators/:id queues bank_pending without immediately modifying bank', async () => {
      const opBefore = findOperatorById('op_saomai');
      const originalBank = { ...opBefore.bank };

      const patchRes = await api('/api/v1/platform/operators/op_saomai', {
        method: 'PATCH',
        token: adminToken,
        body: {
          bank: {
            bin: '970422',
            bank_name: 'MBBank',
            account_number: '1122334455',
            account_name: 'NHA XE SAO MAI MOI'
          }
        }
      });
      assert.strictEqual(patchRes.status, 200, JSON.stringify(patchRes.body));

      const opAfter = findOperatorById('op_saomai');
      // Bank is still the original bank
      assert.strictEqual(opAfter.bank.account_number, originalBank.account_number);
      // Pending bank is stored
      assert.ok(opAfter.bank_pending);
      assert.strictEqual(opAfter.bank_pending.account_number, '1122334455');
      assert.strictEqual(opAfter.bank_pending.bank_name, 'MBBank');
      assert.ok(opAfter.bank_pending.effective_at);
    });

    it('S5.2: Director sees RED alert in /api/v1/ops/alerts', async () => {
      const alertsRes = await api('/api/v1/ops/alerts', {
        method: 'GET',
        token: directorToken
      });
      assert.strictEqual(alertsRes.status, 200);
      const alert = alertsRes.body.data.alerts.find(a => a.type === 'BANK_CHANGE_PENDING');
      assert.ok(alert, 'Director must receive BANK_CHANGE_PENDING alert');
      assert.strictEqual(alert.severity, 'RED');
      assert.ok(alert.message.includes('****4455'));
      assert.ok(alert.message.includes('Nếu không phải bạn yêu cầu, gọi BusGo ngay.'));
    });

    it('S5.3: GET /api/v1/ops/payment-settings masks account number for non-director', async () => {
      const dirSettings = await api('/api/v1/ops/payment-settings', {
        method: 'GET',
        token: directorToken
      });
      assert.strictEqual(dirSettings.status, 200);
      assert.strictEqual(dirSettings.body.data.bank_pending.account_number, '1122334455');

      const staffSettings = await api('/api/v1/ops/payment-settings', {
        method: 'GET',
        token: staffToken
      });
      assert.strictEqual(staffSettings.status, 200);
      assert.strictEqual(staffSettings.body.data.bank_pending.account_number, '****4455');
      assert.ok(staffSettings.body.data.bank.account_number.startsWith('****'));
    });

    it('S5.4: Director cancels bank change via POST /api/v1/ops/payment-settings/bank-change/cancel', async () => {
      const staffCancel = await api('/api/v1/ops/payment-settings/bank-change/cancel', {
        method: 'POST',
        token: staffToken
      });
      assert.strictEqual(staffCancel.status, 403);

      const dirCancel = await api('/api/v1/ops/payment-settings/bank-change/cancel', {
        method: 'POST',
        token: directorToken
      });
      assert.strictEqual(dirCancel.status, 200);
      assert.strictEqual(dirCancel.body.data.success, true);

      const opAfter = findOperatorById('op_saomai');
      assert.strictEqual(opAfter.bank_pending, undefined);
    });

    it('S5.5: After effective_at passes, bank_pending transitions to bank and old bank becomes bank_previous', async () => {
      const op = findOperatorById('op_saomai');
      const originalBank = { ...op.bank };
      const now = Date.now();
      op.bank_pending = {
        bin: '970422',
        bank_name: 'MBBank',
        account_number: '9988776655',
        account_name: 'NHA XE SAO MAI MOI',
        requested_at: new Date(now - 25 * 3600000).toISOString(),
        effective_at: new Date(now - 1 * 3600000).toISOString(),
        requested_by: 'PLATFORM_ADMIN'
      };

      // Calling findOperatorById triggers applyPendingBankChangeIfDue
      const refreshed = findOperatorById('op_saomai', now);
      assert.strictEqual(refreshed.bank.account_number, '9988776655');
      assert.strictEqual(refreshed.bank_pending, undefined);
      assert.ok(refreshed.bank_previous);
      assert.strictEqual(refreshed.bank_previous.account_number, originalBank.account_number);

      // Restore original bank
      refreshed.bank = originalBank;
      delete refreshed.bank_previous;
    });
  });

  // --------------------------------------------------------------------------
  // S6: Dev Warning Banner
  // --------------------------------------------------------------------------
  describe('S6: Dev startup warning banner', () => {
    it('S6.1: listDevBehaviors enumerates active dev behaviors outside production', () => {
      const devList = listDevBehaviors({
        webhookSecret: 'off',
        env: { NODE_ENV: 'development' }
      });
      assert.ok(devList.some(b => b.includes('OTP trả trong response')));
      assert.ok(devList.some(b => b.includes('Khách VIP 0 đ')));
      assert.ok(devList.some(b => b.includes('Nhận "now" từ client')));
      assert.ok(devList.some(b => b.includes('Khóa ký token/vé mặc định')));
      assert.ok(devList.some(b => b.includes("Webhook 'off'")));

      const prodList = listDevBehaviors({
        webhookSecret: 'off',
        env: { NODE_ENV: 'production' }
      });
      assert.deepStrictEqual(prodList, []);
    });

    it('S6.2: printDevSecurityWarning outputs dev behaviors outside production', () => {
      let logged = '';
      const origWarn = console.warn;
      console.warn = (msg) => { logged += msg; };

      try {
        printDevSecurityWarning({ webhookSecret: 'off' });
        assert.ok(logged.includes('CẢNH BÁO: CHẾ ĐỘ PHÁT TRIỂN (DEV)'));
        assert.ok(logged.includes('OTP trả trong response'));
        assert.ok(logged.includes('Khách VIP 0 đ'));
        assert.ok(logged.includes('Nhận "now" từ client'));
        assert.ok(logged.includes('Khóa ký token/vé mặc định'));
        assert.ok(logged.includes("Webhook 'off'"));
      } finally {
        console.warn = origWarn;
      }
    });
  });
});
