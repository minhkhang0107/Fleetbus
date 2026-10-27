/**
 * Pluggable payment providers & SePay integration tests (MGR-038).
 * Covers unit tests of SePay normalize/verify/registry, per-company payment settings & secret masking,
 * SePay webhook (API key & HMAC auth, deduplication, direction 'out', tenant isolation),
 * manual verify-status active reconciliation with cooldown, background sweep tick, and connection testing.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { createFleetBusServer } from '../../source/server/apiServer.js';
import { getProvider, listProviders, maskSecret } from '../../source/server/core/payments/providers.js';
import { SEPAY_PROVIDER, verifySePayWebhook, normalizeSePayPayload, parseSePayDate, formatSePayDate } from '../../source/server/core/payments/sepay.js';
import { reconcileSweep } from '../../source/server/core/payments/reconcile.js';
import { findOperatorById } from '../../source/server/core/operators.js';
import { generateTotp } from '../../source/server/core/totp.js';
import { signToken, TOKEN_PREFIXES } from '../../source/server/core/tokens.js';
import { DEV_TOTP_SECRET } from '../../source/server/config.js';

const TRIP_SAOMAI = 'trp_hn_th_01';
const TRIP_XV = 'trp_xv_hn_th_01';

describe('SePay unit tests: provider registry, verifyWebhook, normalize', () => {
  it('1. provider registry lists MANUAL and SEPAY without exposing handler functions', () => {
    const providers = listProviders();
    assert.ok(Array.isArray(providers));
    const manual = providers.find(p => p.id === 'MANUAL');
    const sepay = providers.find(p => p.id === 'SEPAY');
    assert.ok(manual && manual.auto === false);
    assert.ok(sepay && sepay.auto === true);
    assert.strictEqual(typeof sepay.verifyWebhook, 'undefined');
    assert.strictEqual(typeof sepay.normalize, 'undefined');
    assert.strictEqual(getProvider('sepay'), SEPAY_PROVIDER);
    assert.strictEqual(getProvider('UNKNOWN'), null);
    assert.strictEqual(maskSecret('super_secret_9876'), '••••9876');
  });

  it('2. verifySePayWebhook validates API_KEY and HMAC-SHA256 (ok, bad signature, stale timestamp)', () => {
    const rawBody = JSON.stringify({ id: 101, transferType: 'in', transferAmount: 220000 });
    const nowMs = 1761560000 * 1000;
    const nowSec = 1761560000;

    // API_KEY mode
    const apiCreds = { webhook_auth: 'API_KEY', webhook_secret: 'sepay_live_key_123456' };
    assert.strictEqual(
      verifySePayWebhook({
        headers: { Authorization: 'Apikey sepay_live_key_123456' },
        rawBody,
        credentials: apiCreds,
        now: nowMs
      }),
      true
    );
    assert.strictEqual(
      verifySePayWebhook({
        headers: { Authorization: 'Apikey wrong_key' },
        rawBody,
        credentials: apiCreds,
        now: nowMs
      }),
      false
    );
    assert.strictEqual(
      verifySePayWebhook({
        headers: { Authorization: 'Bearer sepay_live_key_123456' },
        rawBody,
        credentials: apiCreds,
        now: nowMs
      }),
      false
    );

    // HMAC mode
    const hmacSecret = 'hmac_signing_secret_xyz987';
    const hmacCreds = { webhook_auth: 'HMAC', webhook_secret: hmacSecret };
    const validSig = crypto.createHmac('sha256', hmacSecret).update(`${nowSec}.${rawBody}`).digest('hex');

    assert.strictEqual(
      verifySePayWebhook({
        headers: {
          'X-SePay-Signature': `sha256=${validSig}`,
          'X-SePay-Timestamp': String(nowSec)
        },
        rawBody,
        credentials: hmacCreds,
        now: nowMs
      }),
      true
    );

    // Bad signature
    assert.strictEqual(
      verifySePayWebhook({
        headers: {
          'X-SePay-Signature': `sha256=${'0'.repeat(64)}`,
          'X-SePay-Timestamp': String(nowSec)
        },
        rawBody,
        credentials: hmacCreds,
        now: nowMs
      }),
      false
    );

    // Stale timestamp (> 300s difference)
    const staleSec = nowSec - 301;
    const staleSig = crypto.createHmac('sha256', hmacSecret).update(`${staleSec}.${rawBody}`).digest('hex');
    assert.strictEqual(
      verifySePayWebhook({
        headers: {
          'X-SePay-Signature': `sha256=${staleSig}`,
          'X-SePay-Timestamp': String(staleSec)
        },
        rawBody,
        credentials: hmacCreds,
        now: nowMs
      }),
      false
    );
  });

  it('3. normalizeSePayPayload maps transferType in/out, content fallback to description, and +07:00 occurredAt', () => {
    const op = findOperatorById('op_saomai');
    const [txIn] = normalizeSePayPayload({
      id: 92704,
      gateway: 'VietinBank',
      transactionDate: '2026-10-27 14:25:30',
      accountNumber: '1088219999',
      subAccount: null,
      code: null,
      content: 'SAOMAI BG123456',
      transferType: 'in',
      description: 'BankAPINotify SAOMAI BG123456',
      transferAmount: 220000,
      accumulated: 19000000,
      referenceCode: 'MBVCB.3278907687'
    }, op);

    assert.strictEqual(txIn.operatorId, 'op_saomai');
    assert.strictEqual(txIn.provider, 'SEPAY');
    assert.strictEqual(txIn.providerTxId, '92704');
    assert.strictEqual(txIn.bankRef, 'MBVCB.3278907687');
    assert.strictEqual(txIn.amountVnd, 220000);
    assert.strictEqual(txIn.memo, 'SAOMAI BG123456');
    assert.strictEqual(txIn.accountNumber, '1088219999');
    assert.strictEqual(txIn.occurredAt, '2026-10-27T14:25:30+07:00');
    assert.strictEqual(txIn.direction, 'IN');

    // Fallback to description when content is empty, and transferType 'out' -> 'OUT'
    const [txOut] = normalizeSePayPayload({
      id: 92705,
      transactionDate: '2026-10-27 15:00:00',
      accountNumber: '1088219999',
      content: '',
      description: 'Hoan tien ve BG123456',
      transferType: 'out',
      transferAmount: 150000,
      referenceCode: ''
    }, op);

    assert.strictEqual(txOut.direction, 'OUT');
    assert.strictEqual(txOut.memo, 'Hoan tien ve BG123456');
    assert.strictEqual(txOut.bankRef, null);
    assert.strictEqual(parseSePayDate('2026-10-27 08:05:09'), '2026-10-27T08:05:09+07:00');
    assert.strictEqual(formatSePayDate(Date.parse('2026-10-27T08:05:09+07:00')), '2026-10-27 08:05:09');

    // Non-positive or NaN amounts are dropped and never returned
    assert.deepStrictEqual(normalizeSePayPayload({ id: 1, transferType: 'in', transferAmount: 0 }, op), []);
    assert.deepStrictEqual(normalizeSePayPayload({ id: 2, transferType: 'in', transferAmount: -50000 }, op), []);
    assert.deepStrictEqual(normalizeSePayPayload({ id: 3, transferType: 'in', transferAmount: 'not-a-number' }, op), []);
    assert.deepStrictEqual(normalizeSePayPayload({ id: 4, amount_in: '0.00' }, op), []);

    // Forged pass-through fields (provider: 'SEPAY', amountVnd, orderId, _txKey, staff) are ignored
    assert.deepStrictEqual(
      normalizeSePayPayload({ provider: 'SEPAY', amountVnd: 220000, orderId: 'ord_victim', _txKey: 'forged' }, op),
      []
    );
  });
});

describe('SePay HTTP integration: settings, webhook, reconciliation & background sweep', () => {
  let server;
  let services;
  let baseUrl;
  let paxToken;
  let xvPaxToken;
  let directorToken;
  let financeToken;
  let dispatcherToken;
  let xvDirectorToken;
  let fakeFetchHandler;
  let seatCursor = 0;

  const SEATS = ['A01', 'A02', 'A04', 'A05', 'A06', 'A07', 'A08', 'A09', 'A10', 'A11', 'B01', 'B02', 'B03', 'B04', 'B05', 'B07', 'B08', 'B09', 'B10'];
  const nextSeat = () => SEATS[(seatCursor++) % SEATS.length];

  const api = async (path, { method = 'GET', body, token, operatorCode, headers: extraHeaders = {} } = {}) => {
    const headers = { 'Content-Type': 'application/json', ...extraHeaders };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (operatorCode) headers['X-Operator-Code'] = operatorCode;
    if (method === 'POST' && token && !headers['Idempotency-Key']) {
      headers['Idempotency-Key'] = crypto.randomUUID();
    }
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body))
    });
    return { status: res.status, body: await res.json() };
  };

  const createOrder = async ({ seat = nextSeat(), tripId = TRIP_SAOMAI, token = paxToken, operatorCode = 'SAOMAI', phone = '0912880001', paymentMethod } = {}) => {
    const hold = await api(`/api/v1/trips/${tripId}/seats/hold`, {
      method: 'POST',
      token,
      operatorCode,
      body: { seatCodes: [seat] }
    });
    assert.strictEqual(hold.status, 200, JSON.stringify(hold.body));
    const created = await api('/api/v1/bookings/create', {
      method: 'POST',
      token,
      operatorCode,
      body: {
        tripId,
        holdId: hold.body.data.hold_id,
        seatCodes: [seat],
        ...(paymentMethod ? { paymentMethod } : {}),
        payer: { full_name: 'Hành Khách SePay', phone },
        passengers: [{ seat_code: seat, full_name: 'Hành Khách SePay', phone }]
      }
    });
    return { status: created.status, body: created.body, payment: created.body.data?.payment, order: created.body.data?.order };
  };

  before(async () => {
    fakeFetchHandler = async () => new Response(JSON.stringify({ status: 200, error: null, transactions: [] }), { status: 200 });
    ({ server, services } = createFleetBusServer({
      authMode: 'enforce',
      webhookSecret: null,
      fetchImpl: (...args) => fakeFetchHandler(...args)
    }));
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    const otp1 = await api('/api/v1/auth/passenger/otp/request', { method: 'POST', operatorCode: 'SAOMAI', body: { phone: '0912880001' } });
    paxToken = (await api('/api/v1/auth/passenger/otp/verify', { method: 'POST', operatorCode: 'SAOMAI', body: { phone: '0912880001', otp: otp1.body.data.mock_otp } })).body.data.token;

    const otp2 = await api('/api/v1/auth/passenger/otp/request', { method: 'POST', operatorCode: 'XUYENVIET', body: { phone: '0912880002' } });
    xvPaxToken = (await api('/api/v1/auth/passenger/otp/verify', { method: 'POST', operatorCode: 'XUYENVIET', body: { phone: '0912880002', otp: otp2.body.data.mock_otp } })).body.data.token;

    directorToken = (await api('/api/v1/auth/staff/login', {
      method: 'POST',
      body: { username: 'admin@busgo.vn', password: 'admin123', totp: generateTotp(DEV_TOTP_SECRET, Date.now()) }
    })).body.data.token;

    dispatcherToken = (await api('/api/v1/auth/staff/login', {
      method: 'POST',
      body: { username: 'dispatcher@busgo.vn', password: 'disp123' }
    })).body.data.token;

    financeToken = signToken(
      {
        kind: 'staff',
        sub: 'mgr_03',
        username: 'finance@busgo.vn',
        role: 'FINANCIAL_CONTROLLER',
        operator_id: 'op_saomai'
      },
      { prefix: TOKEN_PREFIXES.staff, ttlSeconds: 3600 }
    );

    xvDirectorToken = signToken(
      {
        kind: 'staff',
        sub: 'mgr_xv_dir',
        username: 'director@xuyenviet.vn',
        role: 'FLEET_DIRECTOR',
        operator_id: 'op_xuyenviet'
      },
      { prefix: TOKEN_PREFIXES.staff, ttlSeconds: 3600 }
    );
  });

  after(async () => {
    const saomai = findOperatorById('op_saomai');
    if (saomai?.service_config) {
      delete saomai.service_config.payment;
      saomai.service_config.allow_cash_payment = true;
    }
    const xv = findOperatorById('op_xuyenviet');
    if (xv?.service_config) {
      delete xv.service_config.payment;
      xv.service_config.allow_cash_payment = true;
    }
    await new Promise(resolve => server.close(resolve));
  });

  it('4. PUT by dispatcher is rejected with 403; switching to SEPAY without webhook_secret returns 400', async () => {
    const dispPut = await api('/api/v1/ops/payment-settings', {
      method: 'PUT',
      token: dispatcherToken,
      body: { methods: ['BANK_TRANSFER', 'CASH'], transfer_provider: 'MANUAL' }
    });
    assert.strictEqual(dispPut.status, 403);

    const dispGet = await api('/api/v1/ops/payment-settings', {
      method: 'GET',
      token: dispatcherToken
    });
    assert.strictEqual(dispGet.status, 403);

    // Finance controller can GET but cannot PUT
    const finGet = await api('/api/v1/ops/payment-settings', {
      method: 'GET',
      token: financeToken
    });
    assert.strictEqual(finGet.status, 200);
    assert.strictEqual(finGet.body.data.transfer_provider, 'MANUAL');

    const finPut = await api('/api/v1/ops/payment-settings', {
      method: 'PUT',
      token: financeToken,
      body: { methods: ['BANK_TRANSFER'], transfer_provider: 'MANUAL' }
    });
    assert.strictEqual(finPut.status, 403);

    // Switching to SEPAY without webhook_secret -> 400
    const noSecret = await api('/api/v1/ops/payment-settings', {
      method: 'PUT',
      token: directorToken,
      body: {
        methods: ['BANK_TRANSFER', 'CASH'],
        transfer_provider: 'SEPAY',
        credentials: { webhook_auth: 'API_KEY' }
      }
    });
    assert.strictEqual(noSecret.status, 400);
    assert.strictEqual(noSecret.body.code, 'VALIDATION_ERROR');
  });

  it('5. settings GET and audit log never leak secrets; masked value keeps the stored secret', async () => {
    const rawWebhookSecret = 'sepay_secret_key_alpha_7788';
    const rawApiToken = 'sepay_api_token_bravo_9900';

    const putRes = await api('/api/v1/ops/payment-settings', {
      method: 'PUT',
      token: directorToken,
      headers: { 'X-Forwarded-Proto': 'https' },
      body: {
        methods: ['BANK_TRANSFER', 'CASH'],
        transfer_provider: 'SEPAY',
        credentials: {
          webhook_auth: 'API_KEY',
          webhook_secret: rawWebhookSecret,
          api_token: rawApiToken
        }
      }
    });
    assert.strictEqual(putRes.status, 200, JSON.stringify(putRes.body));
    assert.strictEqual(putRes.body.data.transfer_provider, 'SEPAY');
    assert.strictEqual(putRes.body.data.credentials.webhook_auth, 'API_KEY');
    assert.strictEqual(putRes.body.data.credentials.webhook_secret, '••••7788');
    assert.strictEqual(putRes.body.data.credentials.api_token, '••••9900');
    assert.strictEqual(
      putRes.body.data.webhook_url,
      `${baseUrl.replace('http://', 'https://')}/api/v1/webhooks/sepay/SAOMAI`
    );
    assert.strictEqual(putRes.body.data.reconciliation.enabled, true);
    assert.ok(!JSON.stringify(putRes.body).includes(rawWebhookSecret));
    assert.ok(!JSON.stringify(putRes.body).includes(rawApiToken));

    // GET never leaks secrets
    const getRes = await api('/api/v1/ops/payment-settings', {
      method: 'GET',
      token: financeToken
    });
    assert.strictEqual(getRes.status, 200);
    assert.strictEqual(getRes.body.data.credentials.webhook_secret, '••••7788');
    assert.strictEqual(getRes.body.data.credentials.api_token, '••••9900');
    assert.ok(!JSON.stringify(getRes.body).includes(rawWebhookSecret));
    assert.ok(!JSON.stringify(getRes.body).includes(rawApiToken));

    // Audit log has PAYMENT_SETTINGS_UPDATE without secrets
    const auditLogs = services.managerService.auditLog.filter(a => a.action === 'PAYMENT_SETTINGS_UPDATE');
    assert.ok(auditLogs.length >= 1);
    const latestAudit = auditLogs.at(-1);
    assert.ok(!JSON.stringify(latestAudit).includes(rawWebhookSecret));
    assert.ok(!JSON.stringify(latestAudit).includes(rawApiToken));
    assert.strictEqual(latestAudit.after.credentials.webhook_secret, '••••7788');

    // Sending masked value '••••7788' keeps the stored secret 'sepay_secret_key_alpha_7788'
    const updateMasked = await api('/api/v1/ops/payment-settings', {
      method: 'PUT',
      token: directorToken,
      body: {
        methods: ['BANK_TRANSFER', 'CASH'],
        transfer_provider: 'SEPAY',
        credentials: {
          webhook_auth: 'API_KEY',
          webhook_secret: '••••7788',
          api_token: '••••9900'
        }
      }
    });
    assert.strictEqual(updateMasked.status, 200);
    const stored = services.paymentService.gatewayCredentials.get('op_saomai');
    assert.strictEqual(stored.values.webhook_secret, rawWebhookSecret);
    assert.strictEqual(stored.values.api_token, rawApiToken);
  });

  it('6. methods without CASH rejects cash checkout with 422 PAYMENT_METHOD_NOT_ALLOWED and updates publicOperatorProfile', async () => {
    const disableCash = await api('/api/v1/ops/payment-settings', {
      method: 'PUT',
      token: directorToken,
      body: {
        methods: ['BANK_TRANSFER'],
        transfer_provider: 'SEPAY',
        credentials: {
          webhook_auth: 'API_KEY',
          webhook_secret: '••••7788',
          api_token: '••••9900'
        }
      }
    });
    assert.strictEqual(disableCash.status, 200);
    assert.deepStrictEqual(disableCash.body.data.methods, ['BANK_TRANSFER']);

    const appCfg = await api('/api/v1/app/config', { operatorCode: 'SAOMAI' });
    assert.deepStrictEqual(appCfg.body.data.operator.payment_methods, ['BANK_TRANSFER']);
    assert.strictEqual(appCfg.body.data.operator.allow_cash_payment, false);

    const cashAttempt = await createOrder({ paymentMethod: 'CASH' });
    assert.strictEqual(cashAttempt.status, 422);
    assert.strictEqual(cashAttempt.body.code, 'PAYMENT_METHOD_NOT_ALLOWED');

    // Re-enable CASH
    await api('/api/v1/ops/payment-settings', {
      method: 'PUT',
      token: directorToken,
      body: {
        methods: ['BANK_TRANSFER', 'CASH'],
        transfer_provider: 'SEPAY',
        credentials: {
          webhook_auth: 'API_KEY',
          webhook_secret: '••••7788',
          api_token: '••••9900'
        }
      }
    });
  });

  it('7. SePay webhook: API key auth ok/bad, duplicate id settles once, direction out is ignored', async () => {
    const { payment } = await createOrder();
    assert.ok(payment);

    // Unknown company -> 404
    const unknownOp = await api('/api/v1/webhooks/sepay/NO_SUCH_OP', {
      method: 'POST',
      headers: { Authorization: 'Apikey sepay_secret_key_alpha_7788' },
      body: { id: 5001, transferType: 'in', transferAmount: payment.amount_vnd, content: payment.payment_details.transfer_memo }
    });
    assert.strictEqual(unknownOp.status, 404);

    // Company not using SEPAY (XUYENVIET is on MANUAL) -> 401
    const manualOp = await api('/api/v1/webhooks/sepay/XUYENVIET', {
      method: 'POST',
      headers: { Authorization: 'Apikey sepay_secret_key_alpha_7788' },
      body: { id: 5001, transferType: 'in', transferAmount: payment.amount_vnd, content: payment.payment_details.transfer_memo }
    });
    assert.strictEqual(manualOp.status, 401);

    // Bad API key -> 401 { success: false }
    const badAuth = await api('/api/v1/webhooks/sepay/SAOMAI', {
      method: 'POST',
      headers: { Authorization: 'Apikey wrong_key_0000' },
      body: { id: 5001, transferType: 'in', transferAmount: payment.amount_vnd, content: payment.payment_details.transfer_memo }
    });
    assert.strictEqual(badAuth.status, 401);
    assert.deepStrictEqual(badAuth.body, { success: false });

    // Valid API key -> 200 {"success": true} (exact plain JSON body)
    const okHook = await api('/api/v1/webhooks/sepay/SAOMAI', {
      method: 'POST',
      headers: { Authorization: 'Apikey sepay_secret_key_alpha_7788' },
      body: {
        id: 5001,
        gateway: 'VietinBank',
        transactionDate: '2026-10-27 10:15:00',
        accountNumber: '1088219999',
        content: `Chuyen khoan ${payment.payment_details.transfer_memo}`,
        transferType: 'in',
        transferAmount: payment.amount_vnd,
        referenceCode: 'FT26300SEPAY01'
      }
    });
    assert.strictEqual(okHook.status, 200);
    assert.deepStrictEqual(okHook.body, { success: true });

    const storedOrder = services.paymentService.orders.get(payment.order_id);
    assert.strictEqual(storedOrder.payment_status, 'PAID');
    assert.strictEqual(storedOrder.ticket_ids.length, 1);
    assert.strictEqual(storedOrder.payment_txs.length, 1);

    // Duplicate webhook (same SePay id 5001) -> 200 {"success": true}, no second settlement or refund
    const refundsBefore = services.managerService.refundRequests.filter(r => r.pnr === payment.pnr).length;
    const dupHook = await api('/api/v1/webhooks/sepay/SAOMAI', {
      method: 'POST',
      headers: { Authorization: 'Apikey sepay_secret_key_alpha_7788' },
      body: {
        id: 5001,
        gateway: 'VietinBank',
        transactionDate: '2026-10-27 10:15:00',
        accountNumber: '1088219999',
        content: `Chuyen khoan ${payment.payment_details.transfer_memo}`,
        transferType: 'in',
        transferAmount: payment.amount_vnd,
        referenceCode: 'FT26300SEPAY01'
      }
    });
    assert.strictEqual(dupHook.status, 200);
    assert.deepStrictEqual(dupHook.body, { success: true });
    assert.strictEqual(storedOrder.payment_txs.length, 1);
    assert.strictEqual(services.managerService.refundRequests.filter(r => r.pnr === payment.pnr).length, refundsBefore);

    // Outgoing transfer ('out') is ignored and not stored in bankTransactions
    const txSizeBefore = services.paymentService.bankTransactions.size;
    const outHook = await api('/api/v1/webhooks/sepay/SAOMAI', {
      method: 'POST',
      headers: { Authorization: 'Apikey sepay_secret_key_alpha_7788' },
      body: {
        id: 5002,
        gateway: 'VietinBank',
        transactionDate: '2026-10-27 10:20:00',
        accountNumber: '1088219999',
        content: `Chi tien ${payment.pnr}`,
        transferType: 'out',
        transferAmount: 100000,
        referenceCode: 'FT_OUT_5002'
      }
    });
    assert.strictEqual(outHook.status, 200);
    assert.deepStrictEqual(outHook.body, { success: true });
    assert.strictEqual(services.paymentService.bankTransactions.size, txSizeBefore);
  });

  it('8. SePay webhook with HMAC auth: valid settles, bad signature 401, stale timestamp 401', async () => {
    const hmacSecret = 'sepay_hmac_secret_key_3344';
    await api('/api/v1/ops/payment-settings', {
      method: 'PUT',
      token: directorToken,
      body: {
        methods: ['BANK_TRANSFER', 'CASH'],
        transfer_provider: 'SEPAY',
        credentials: {
          webhook_auth: 'HMAC',
          webhook_secret: hmacSecret,
          api_token: '••••9900'
        }
      }
    });

    const { payment } = await createOrder();
    const payloadStr = JSON.stringify({
      id: 6001,
      gateway: 'VietinBank',
      transactionDate: '2026-10-27 11:00:00',
      accountNumber: '1088219999',
      content: payment.payment_details.transfer_memo,
      transferType: 'in',
      transferAmount: payment.amount_vnd,
      referenceCode: 'FT26300HMAC01'
    });
    const tsSec = Math.floor(Date.now() / 1000);
    const goodSig = crypto.createHmac('sha256', hmacSecret).update(`${tsSec}.${payloadStr}`).digest('hex');

    // Bad signature -> 401
    const badSigRes = await api('/api/v1/webhooks/sepay/SAOMAI', {
      method: 'POST',
      headers: {
        'X-SePay-Signature': `sha256=${'f'.repeat(64)}`,
        'X-SePay-Timestamp': String(tsSec)
      },
      body: payloadStr
    });
    assert.strictEqual(badSigRes.status, 401);
    assert.deepStrictEqual(badSigRes.body, { success: false });

    // Stale timestamp -> 401
    const oldTs = tsSec - 600;
    const oldSig = crypto.createHmac('sha256', hmacSecret).update(`${oldTs}.${payloadStr}`).digest('hex');
    const staleRes = await api('/api/v1/webhooks/sepay/SAOMAI', {
      method: 'POST',
      headers: {
        'X-SePay-Signature': `sha256=${oldSig}`,
        'X-SePay-Timestamp': String(oldTs)
      },
      body: payloadStr
    });
    assert.strictEqual(staleRes.status, 401);
    assert.deepStrictEqual(staleRes.body, { success: false });

    // Valid HMAC -> 200 {"success": true} and order PAID
    const okRes = await api('/api/v1/webhooks/sepay/SAOMAI', {
      method: 'POST',
      headers: {
        'X-SePay-Signature': `sha256=${goodSig}`,
        'X-SePay-Timestamp': String(tsSec)
      },
      body: payloadStr
    });
    assert.strictEqual(okRes.status, 200);
    assert.deepStrictEqual(okRes.body, { success: true });
    assert.strictEqual(services.paymentService.orders.get(payment.order_id).payment_status, 'PAID');

    // Switch back to API_KEY for subsequent tests
    await api('/api/v1/ops/payment-settings', {
      method: 'PUT',
      token: directorToken,
      body: {
        methods: ['BANK_TRANSFER', 'CASH'],
        transfer_provider: 'SEPAY',
        credentials: {
          webhook_auth: 'API_KEY',
          webhook_secret: 'sepay_secret_key_alpha_7788',
          api_token: 'sepay_api_token_bravo_9900'
        }
      }
    });
  });

  it('9. tenant isolation: webhook for company A cannot settle company B order (UNMATCHED in A, B unchanged)', async () => {
    const xvOrder = await createOrder({
      seat: 'A02',
      tripId: TRIP_XV,
      token: xvPaxToken,
      operatorCode: 'XUYENVIET',
      phone: '0912880002'
    });
    assert.strictEqual(xvOrder.status, 201);
    const xvPayment = xvOrder.payment;

    // Send XUYENVIET order's memo to SAOMAI's webhook URL
    const hookRes = await api('/api/v1/webhooks/sepay/SAOMAI', {
      method: 'POST',
      headers: { Authorization: 'Apikey sepay_secret_key_alpha_7788' },
      body: {
        id: 7001,
        gateway: 'VietinBank',
        transactionDate: '2026-10-27 11:30:00',
        accountNumber: '1088219999',
        content: xvPayment.payment_details.transfer_memo,
        transferType: 'in',
        transferAmount: xvPayment.amount_vnd,
        referenceCode: 'FT_CROSS_TENANT_01'
      }
    });
    assert.strictEqual(hookRes.status, 200);
    assert.deepStrictEqual(hookRes.body, { success: true });

    // Recorded as UNMATCHED in SAOMAI
    const saomaiTx = services.paymentService.bankTransactions.get('op_saomai:SEPAY:7001');
    assert.ok(saomaiTx);
    assert.strictEqual(saomaiTx.outcome, 'UNMATCHED');
    assert.strictEqual(saomaiTx.operator_id, 'op_saomai');

    // XUYENVIET order remains PENDING_PAYMENT and untouched
    const xvStoredOrder = services.paymentService.orders.get(xvPayment.order_id);
    assert.strictEqual(xvStoredOrder.payment_status, 'PENDING_PAYMENT');
    assert.strictEqual(xvStoredOrder.ticket_ids.length, 0);

    // Authenticated webhook body injecting orderId of another order and _txKey does NOT settle that order (normal memo matching applies)
    const { payment: victimPayment } = await createOrder();
    const injectRes = await api('/api/v1/webhooks/sepay/SAOMAI', {
      method: 'POST',
      headers: { Authorization: 'Apikey sepay_secret_key_alpha_7788' },
      body: {
        id: 7002,
        provider: 'SEPAY',
        amountVnd: victimPayment.amount_vnd,
        orderId: victimPayment.order_id,
        _txKey: 'injected_tx_key_7002',
        staff: 'mgr_attacker',
        gateway: 'VietinBank',
        transactionDate: '2026-10-27 11:35:00',
        accountNumber: '1088219999',
        content: 'Chuyen khoan khong co ma PNR',
        transferType: 'in',
        transferAmount: victimPayment.amount_vnd,
        referenceCode: 'FT_INJECT_7002'
      }
    });
    assert.strictEqual(injectRes.status, 200);
    assert.deepStrictEqual(injectRes.body, { success: true });
    assert.strictEqual(services.paymentService.orders.get(victimPayment.order_id).payment_status, 'PENDING_PAYMENT');
    assert.strictEqual(services.paymentService.bankTransactions.has('injected_tx_key_7002'), false);
    const unmatched7002 = services.paymentService.bankTransactions.get('op_saomai:SEPAY:7002');
    assert.ok(unmatched7002);
    assert.strictEqual(unmatched7002.outcome, 'UNMATCHED');
  });

  it('10. verify-status with manualTrigger reconciles via fake fetchImpl (with 15 s cooldown) and returns PAID', async () => {
    const { payment } = await createOrder();
    let fetchCalls = 0;

    fakeFetchHandler = async (url, init) => {
      fetchCalls += 1;
      assert.ok(String(url).includes('https://my.sepay.vn/userapi/transactions/list'));
      assert.ok(String(url).includes('account_number=1088219999'));
      assert.strictEqual(init.headers.Authorization, 'Bearer sepay_api_token_bravo_9900');
      return new Response(
        JSON.stringify({
          status: 200,
          error: null,
          transactions: [
            {
              id: '8001',
              bank_brand_name: 'VietinBank',
              account_number: '1088219999',
              transaction_date: '2026-10-27 12:00:00',
              amount_in: `${payment.amount_vnd}.00`,
              amount_out: '0.00',
              transaction_content: `Thanh toan ${payment.payment_details.transfer_memo}`,
              reference_number: 'FT_RECONCILE_8001'
            },
            {
              id: '8002',
              account_number: '1088219999',
              transaction_date: '2026-10-27 12:01:00',
              amount_in: '0.00',
              amount_out: '50000.00',
              transaction_content: 'Giao dich chi ra'
            }
          ]
        }),
        { status: 200 }
      );
    };

    const verifyRes = await api(`/api/v1/passenger/payments/${payment.order_id}/verify-status`, {
      method: 'POST',
      token: paxToken,
      operatorCode: 'SAOMAI',
      body: { manualTrigger: true }
    });
    assert.strictEqual(verifyRes.status, 200);
    assert.strictEqual(fetchCalls, 1);
    assert.strictEqual(verifyRes.body.data.payment_status, 'PAID');
    assert.strictEqual(verifyRes.body.data.is_settled, true);
    assert.strictEqual(verifyRes.body.data.tickets.length, 1);

    // Cooldown check on another pending order: second manualTrigger within 15s does not call fetchImpl again
    const { payment: payment2 } = await createOrder();
    fetchCalls = 0;
    fakeFetchHandler = async () => {
      fetchCalls += 1;
      return new Response(JSON.stringify({ status: 200, error: null, transactions: [] }), { status: 200 });
    };
    const now = Date.now();
    await api(`/api/v1/passenger/payments/${payment2.order_id}/verify-status`, {
      method: 'POST',
      token: paxToken,
      operatorCode: 'SAOMAI',
      body: { manualTrigger: true, now }
    });
    assert.strictEqual(fetchCalls, 1);

    await api(`/api/v1/passenger/payments/${payment2.order_id}/verify-status`, {
      method: 'POST',
      token: paxToken,
      operatorCode: 'SAOMAI',
      body: { manualTrigger: true, now: now + 5000 }
    });
    assert.strictEqual(fetchCalls, 1, 'cooldown of 15s per order must prevent immediate re-fetch');
  });

  it('11. background sweep tick settles a pending order for companies using an auto provider', async () => {
    const { payment } = await createOrder();
    assert.strictEqual(services.paymentService.orders.get(payment.order_id).payment_status, 'PENDING_PAYMENT');

    fakeFetchHandler = async () => new Response(
      JSON.stringify({
        status: 200,
        error: null,
        transactions: [
          {
            id: '9001',
            account_number: '1088219999',
            transaction_date: '2026-10-27 12:30:00',
            amount_in: `${payment.amount_vnd}.00`,
            amount_out: '0.00',
            transaction_content: payment.payment_details.transfer_memo,
            reference_number: 'FT_SWEEP_9001'
          }
        ]
      }),
      { status: 200 }
    );

    await reconcileSweep(services);

    const settledOrder = services.paymentService.orders.get(payment.order_id);
    assert.strictEqual(settledOrder.payment_status, 'PAID');
    assert.strictEqual(settledOrder.ticket_ids.length, 1);

    const settingsView = await api('/api/v1/ops/payment-settings', {
      method: 'GET',
      token: directorToken
    });
    assert.ok(settingsView.body.data.reconciliation.last_run_at);
    assert.strictEqual(settingsView.body.data.reconciliation.last_error, null);
  });

  it('12. test connection endpoint returns Vietnamese message on 401 and ok: true on 200', async () => {
    fakeFetchHandler = async (url) => {
      assert.ok(String(url).includes('limit=1'));
      return new Response(JSON.stringify({ status: 401, error: 'Unauthorized' }), { status: 401 });
    };

    const failTest = await api('/api/v1/ops/payment-settings/test', {
      method: 'POST',
      token: directorToken,
      body: {}
    });
    assert.strictEqual(failTest.status, 200);
    assert.strictEqual(failTest.body.data.ok, false);
    assert.strictEqual(failTest.body.data.message, 'API token không đúng');

    fakeFetchHandler = async () => new Response(
      JSON.stringify({ status: 200, error: null, transactions: [] }),
      { status: 200 }
    );

    const okTest = await api('/api/v1/ops/payment-settings/test', {
      method: 'POST',
      token: directorToken,
      body: {}
    });
    assert.strictEqual(okTest.status, 200);
    assert.strictEqual(okTest.body.data.ok, true);

    // Missing api_token returns { ok: false, message: 'Chưa nhập API token SePay' } without calling network
    let networkCalled = false;
    fakeFetchHandler = async () => {
      networkCalled = true;
      return new Response('{}', { status: 200 });
    };
    const stored = services.paymentService.gatewayCredentials.get('op_saomai');
    const savedToken = stored.values.api_token;
    delete stored.values.api_token;
    try {
      const noTokenTest = await api('/api/v1/ops/payment-settings/test', {
        method: 'POST',
        token: directorToken,
        body: {}
      });
      assert.strictEqual(noTokenTest.status, 200);
      assert.strictEqual(noTokenTest.body.data.ok, false);
      assert.strictEqual(noTokenTest.body.data.message, 'Chưa nhập API token SePay');
      assert.strictEqual(networkCalled, false);
    } finally {
      stored.values.api_token = savedToken;
    }
  });
});
