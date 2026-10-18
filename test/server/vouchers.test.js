import test from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { createFleetBusServer } from '../../source/server/apiServer.js';
import { TenantDatabases } from '../../source/server/core/tenantDb.js';
import { confirmVoucherUse, createVoucher, deleteVoucher, evaluateVoucher, listOfficeVouchers, reserveVoucher, seedVouchers } from '../../source/server/core/vouchers.js';
import { generateTotp } from '../../source/server/core/totp.js';
import { DEV_TOTP_SECRET } from '../../source/server/config.js';

const NOW = Date.parse('2026-10-18T09:00:00+07:00');
const MIN = 60000;

test('TC-MGR-035-01: limits, window and uses of a discount code, per company', () => {
  const dbs = new TenantDatabases({ seed: (db) => seedVouchers(db) });
  const saomai = dbs.forOperator('op_saomai');
  const xuyenviet = dbs.forOperator('op_xuyenviet');
  const created = createVoucher(saomai, {
    code: 'saomai2027', description: 'Giảm 30k', discount_type: 'FIXED', discount_value: 30000,
    ends_at: '2027-10-18T23:59:59+07:00', usage_limit: 2, per_customer_limit: 1
  }, NOW);
  assert.ok(created.ok, created.message);
  assert.strictEqual(created.voucher.code, 'SAOMAI2027', 'codes are kept upper-case');
  assert.strictEqual(createVoucher(saomai, { code: 'SAOMAI2027', discount_value: 10000 }, NOW).code, 'VOUCHER_EXISTS');
  assert.strictEqual(createVoucher(saomai, { code: 'X1', discount_value: 10000 }, NOW).code, 'VALIDATION_ERROR');

  const check = (code, phone, at = NOW, subtotal = 220000) => evaluateVoucher(saomai, code, { subtotal, phone, now: at });
  assert.strictEqual(check('saomai2027', '0900000001').discount_vnd, 30000);
  assert.strictEqual(evaluateVoucher(xuyenviet, 'SAOMAI2027', { subtotal: 220000, now: NOW }).code, 'VOUCHER_INVALID', 'another company never sees it');
  assert.strictEqual(check('SAOMAI2027', null, Date.parse('2027-10-19T00:00:00+07:00')).code, 'VOUCHER_EXPIRED');
  assert.strictEqual(check('BUSGO50K', null, NOW, 150000).code, 'VOUCHER_MIN_ORDER');
  assert.strictEqual(check('VIP10', null, NOW, 900000).discount_vnd, 50000, 'a percentage is capped');

  // A use is taken by an order, counted per phone, and given back when the order is left unpaid.
  reserveVoucher(saomai, { code: 'SAOMAI2027', orderId: 'ord_a', phone: '0900000001', discountVnd: 30000, expiresAt: new Date(NOW + 10 * MIN).toISOString(), now: NOW });
  assert.strictEqual(check('SAOMAI2027', '0900000001').code, 'VOUCHER_CUSTOMER_LIMIT');
  reserveVoucher(saomai, { code: 'SAOMAI2027', orderId: 'ord_b', phone: '0900000002', discountVnd: 30000, expiresAt: new Date(NOW + 10 * MIN).toISOString(), now: NOW });
  assert.strictEqual(check('SAOMAI2027', '0900000003').code, 'VOUCHER_USED_UP');
  confirmVoucherUse(saomai, 'ord_a');
  const later = NOW + 11 * MIN;
  assert.ok(check('SAOMAI2027', '0900000003', later).ok, 'the unpaid order gave its use back');
  assert.strictEqual(check('SAOMAI2027', '0900000001', later).code, 'VOUCHER_CUSTOMER_LIMIT', 'the paid one keeps it');
  const listed = listOfficeVouchers(saomai, later).find(v => v.code === 'SAOMAI2027');
  assert.deepStrictEqual([listed.used_count, listed.status], [1, 'LIVE']);
  assert.strictEqual(deleteVoucher(saomai, 'SAOMAI2027', later).code, 'VOUCHER_IN_USE');

  // A code only an abandoned order took can still be deleted.
  reserveVoucher(saomai, { code: 'VIP10', orderId: 'ord_c', phone: '0900000004', discountVnd: 22000, expiresAt: new Date(NOW + 10 * MIN).toISOString(), now: NOW });
  assert.strictEqual(deleteVoucher(saomai, 'VIP10', NOW).code, 'VOUCHER_IN_USE', 'not while the order can still be paid');
  assert.ok(deleteVoucher(saomai, 'VIP10', later).ok);
  dbs.close();
});

test('TC-MGR-035-02: the director creates a code, the passenger uses it, the order is priced with it', async (t) => {
  const { server, services } = createFleetBusServer({ authMode: 'enforce', webhookSecret: null });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, { method = 'GET', body, token } = {}) => {
    const h = { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID(), 'X-Operator-Code': 'SAOMAI' };
    if (token) h.Authorization = `Bearer ${token}`;
    const res = await fetch(`${base}${path}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, json: await res.json() };
  };
  const staff = async (username, password, totp) => (await call('/api/v1/ops/auth/login', { method: 'POST', body: { username, password, totp } })).json.data?.token;
  const passenger = async (phone) => {
    const otp = (await call('/api/v1/auth/passenger/otp/request', { method: 'POST', body: { phone } })).json.data.mock_otp;
    return (await call('/api/v1/auth/passenger/otp/verify', { method: 'POST', body: { phone, otp } })).json.data.token;
  };
  const director = await staff('admin@busgo.vn', 'admin123', generateTotp(DEV_TOTP_SECRET, Date.now()));
  const dispatcher = await staff('dispatcher@busgo.vn', 'disp123');
  const book = async (token, phone, seat, voucherCode) => {
    const hold = await call('/api/v1/trips/trp_hn_th_01/seats/hold', { method: 'POST', token, body: { seatCodes: [seat] } });
    return call('/api/v1/bookings/create', {
      method: 'POST', token,
      body: { tripId: 'trp_hn_th_01', holdId: hold.json.data.hold_id, seatCodes: [seat], voucherCode, payer: { full_name: 'Khach Ma Giam', phone }, passengers: [{ seat_code: seat, full_name: 'Khach Ma Giam' }] }
    });
  };
  const oneYear = new Date(Date.now() + 365 * 24 * 3600000).toISOString();

  await t.test('only the director manages codes', async () => {
    assert.strictEqual((await call('/api/v1/ops/vouchers', { token: dispatcher })).status, 403);
    const created = await call('/api/v1/ops/vouchers', { method: 'POST', token: director, body: { code: 'ONCE20K', discount_type: 'FIXED', discount_value: 20000, ends_at: oneYear, usage_limit: 1 } });
    assert.strictEqual(created.status, 201, JSON.stringify(created.json));
    assert.strictEqual(created.json.data.status, 'LIVE');
    const list = await call('/api/v1/ops/vouchers', { token: director });
    assert.deepStrictEqual(list.json.data.vouchers.map(v => v.code).sort(), ['BUSGO50K', 'ONCE20K', 'VIP10']);
  });

  await t.test('the app previews a code; the order takes the discount and its use', async () => {
    const tokenA = await passenger('0912000301');
    const preview = await call('/api/v1/passenger/vouchers/check', { method: 'POST', token: tokenA, body: { code: 'once20k', subtotal_vnd: 220000 } });
    assert.strictEqual(preview.status, 200, JSON.stringify(preview.json));
    assert.strictEqual(preview.json.data.discount_vnd, 20000);
    const wrong = await call('/api/v1/passenger/vouchers/check', { method: 'POST', token: tokenA, body: { code: 'NOPE', subtotal_vnd: 220000 } });
    assert.deepStrictEqual([wrong.status, wrong.json.code], [422, 'VOUCHER_INVALID']);

    const orderA = await book(tokenA, '0912000301', 'A07', 'ONCE20K');
    assert.strictEqual(orderA.status, 201, JSON.stringify(orderA.json));
    assert.strictEqual(orderA.json.data.order.price_breakdown.voucher_discount, 20000);
    assert.strictEqual(orderA.json.data.payment.amount_vnd, orderA.json.data.order.price_breakdown.subtotal_fare - 20000);

    const tokenB = await passenger('0912000302');
    const orderB = await book(tokenB, '0912000302', 'A08', 'ONCE20K');
    assert.deepStrictEqual([orderB.status, orderB.json.code], [422, 'VOUCHER_USED_UP'], 'a wrong code refuses the order instead of charging full price');

    const payment = orderA.json.data.payment;
    const paid = await call('/api/v1/webhooks/vietqr/ipn', { method: 'POST', body: { transferMemo: payment.payment_details.transfer_memo, amountVnd: payment.amount_vnd, bankRef: 'bank_v1' } });
    assert.strictEqual(paid.status, 200, JSON.stringify(paid.json));
    const row = services.tenantDbs.forOperator('op_saomai').prepare('SELECT status FROM voucher_redemptions WHERE order_id = ?').get(payment.order_id);
    assert.strictEqual(row.status, 'USED');
    const listed = (await call('/api/v1/ops/vouchers', { token: director })).json.data.vouchers.find(v => v.code === 'ONCE20K');
    assert.deepStrictEqual([listed.used_count, listed.status], [1, 'USED_UP']);
  });

  await t.test('a code that takes the whole fare gives a ticket without a transfer', async () => {
    const created = await call('/api/v1/ops/vouchers', { method: 'POST', token: director, body: { code: 'FREE100', discount_type: 'PERCENT', discount_value: 100 } });
    assert.strictEqual(created.status, 201, JSON.stringify(created.json));
    const token = await passenger('0912000303');
    const order = await book(token, '0912000303', 'A09', 'FREE100');
    assert.strictEqual(order.status, 201, JSON.stringify(order.json));
    assert.strictEqual(order.json.data.payment.amount_vnd, 0);
    const paid = services.paymentService.orders.get(order.json.data.payment.order_id);
    assert.strictEqual(paid.payment_status, 'PAID');
    assert.strictEqual(paid.ticket_ids.length, 1);
    const row = services.tenantDbs.forOperator('op_saomai').prepare('SELECT status FROM voucher_redemptions WHERE order_id = ?').get(paid.order_id);
    assert.strictEqual(row.status, 'USED');
  });

  await t.test('switch off, edit and delete', async () => {
    const off = await call('/api/v1/ops/vouchers/VIP10/deactivate', { method: 'POST', token: director });
    assert.strictEqual(off.json.data.status, 'OFF');
    const edited = await call('/api/v1/ops/vouchers/VIP10', { method: 'PATCH', token: director, body: { discount_value: 15 } });
    assert.strictEqual(edited.json.data.discount_value, 15);
    assert.strictEqual((await call('/api/v1/ops/vouchers/ONCE20K', { method: 'DELETE', token: director })).json.code, 'VOUCHER_IN_USE');
    assert.strictEqual((await call('/api/v1/ops/vouchers/VIP10', { method: 'DELETE', token: director })).status, 200);
  });

  server.close();
});
