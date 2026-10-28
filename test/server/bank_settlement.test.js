/**
 * Unified bank transfer settlement engine & MGR-037 manual confirmation / unmatched assignment tests.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { createFleetBusServer } from '../../source/server/apiServer.js';
import { generateTotp } from '../../source/server/core/totp.js';
import { signToken, TOKEN_PREFIXES } from '../../source/server/core/tokens.js';
import { DEV_TOTP_SECRET } from '../../source/server/config.js';

const TRIP = 'trp_hn_th_01';
const XV_TRIP = 'trp_xv_hn_th_01';

describe('Unified bank transfer settlement engine (MGR-037)', () => {
  let server;
  let services;
  let baseUrl;
  let paxToken;
  let xvPaxToken;
  let directorToken;
  let cashierToken;
  let dispatcherToken;
  let xvDirectorToken;
  let seatIndex = 0;

  const FREE_SEATS = ['A01', 'A02', 'A04', 'A05', 'A06', 'A07', 'A08', 'A09', 'A10', 'A11', 'B01', 'B02', 'B03', 'B04', 'B05', 'B07', 'B08', 'B09', 'B10', 'B11'];

  const nextSeat = () => {
    const code = FREE_SEATS[seatIndex % FREE_SEATS.length];
    seatIndex += 1;
    return code;
  };

  const api = async (path, { method = 'GET', body, token, operatorCode, key } = {}) => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (operatorCode) headers['X-Operator-Code'] = operatorCode;
    if (method === 'POST') headers['Idempotency-Key'] = key || crypto.randomUUID();
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    return { status: res.status, body: await res.json() };
  };

  const createOrder = async ({ seat = nextSeat(), tripId = TRIP, token = paxToken, operatorCode = 'SAOMAI', phone = '0912340001' } = {}) => {
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
        payer: { full_name: 'Nguyễn Văn Thanh Toán', phone },
        passengers: [{ seat_code: seat, full_name: 'Nguyễn Văn Thanh Toán', phone }]
      }
    });
    assert.strictEqual(created.status, 201, JSON.stringify(created.body));
    return { seat, payment: created.body.data.payment, order: created.body.data.order };
  };

  before(async () => {
    ({ server, services } = createFleetBusServer({ authMode: 'enforce', webhookSecret: null }));
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    // Passenger tokens for Sao Mai and Xuyên Việt
    const otp1 = await api('/api/v1/auth/passenger/otp/request', { method: 'POST', operatorCode: 'SAOMAI', body: { phone: '0912340001' } });
    paxToken = (await api('/api/v1/auth/passenger/otp/verify', { method: 'POST', operatorCode: 'SAOMAI', body: { phone: '0912340001', otp: otp1.body.data.mock_otp } })).body.data.token;

    const otp2 = await api('/api/v1/auth/passenger/otp/request', { method: 'POST', operatorCode: 'XUYENVIET', body: { phone: '0912340002' } });
    xvPaxToken = (await api('/api/v1/auth/passenger/otp/verify', { method: 'POST', operatorCode: 'XUYENVIET', body: { phone: '0912340002', otp: otp2.body.data.mock_otp } })).body.data.token;

    // Staff tokens
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

  after(() => new Promise(resolve => server.close(resolve)));

  it('1. direction OUT is ignored (IGNORED_OUT) and not stored in bankTransactions', () => {
    const beforeSize = services.paymentService.bankTransactions.size;
    const res = services.paymentService.applyBankTransfer({
      operatorId: 'op_saomai',
      provider: 'SEPAY',
      providerTxId: 'out_tx_01',
      bankRef: 'FT_OUT_01',
      amountVnd: 500000,
      memo: 'Chi hoàn tiền khách',
      direction: 'OUT'
    });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.outcome, 'IGNORED_OUT');
    assert.strictEqual(services.paymentService.bankTransactions.size, beforeSize);
  });

  it('2. exact transfer settles order, scans all BG candidates in memo, and duplicate webhook replay changes nothing', async () => {
    const { payment } = await createOrder();
    const digits = payment.pnr.replace('BG-', '');
    // First BG candidate is a non-existent PNR, second is the real order
    const noisyMemo = `MBVCB.123456.BG000000 chuyen tien ve xe bG-${digits} cam on`;
    const ipn1 = await api('/api/v1/webhooks/vietqr/ipn', {
      method: 'POST',
      body: {
        transferMemo: noisyMemo,
        amountVnd: payment.amount_vnd,
        bankRef: 'FT_EXACT_01',
        accountNumber: '1088-219-999' // digits match Sao Mai 1088219999
      }
    });
    assert.strictEqual(ipn1.status, 200);
    assert.strictEqual(ipn1.body.data.settled, true);
    assert.strictEqual(ipn1.body.data.pnr, payment.pnr);
    assert.strictEqual(ipn1.body.data.issued_tickets.length, 1);

    const storedOrder = services.paymentService.orders.get(payment.order_id);
    assert.strictEqual(storedOrder.paid_amount_vnd, payment.amount_vnd);
    assert.strictEqual(storedOrder.payment_txs.length, 1);

    // Replay the exact same webhook (same bankRef) -> replay: true, nothing changes, no refund created
    const refundsBefore = services.managerService.refundRequests.filter(r => r.pnr === payment.pnr).length;
    const directReplay = services.paymentService.applyBankTransfer({
      operatorId: 'op_saomai',
      provider: 'VIETQR_HMAC',
      providerTxId: 'FT_EXACT_01',
      bankRef: 'FT_EXACT_01',
      amountVnd: payment.amount_vnd,
      memo: noisyMemo
    });
    assert.strictEqual(directReplay.outcome, 'SETTLED');
    assert.strictEqual(directReplay.replay, true);
    assert.strictEqual(storedOrder.paid_amount_vnd, payment.amount_vnd);
    assert.strictEqual(storedOrder.payment_txs.length, 1);
    assert.strictEqual(services.managerService.refundRequests.filter(r => r.pnr === payment.pnr).length, refundsBefore);
  });

  it('3. partial transfer then completion transfer settles the order', async () => {
    const { payment } = await createOrder();
    const part1 = 100000;
    const part2 = payment.amount_vnd - part1;

    const res1 = await api('/api/v1/webhooks/vietqr/ipn', {
      method: 'POST',
      body: {
        transferMemo: payment.payment_details.transfer_memo,
        amountVnd: part1,
        bankRef: 'FT_PART_1'
      }
    });
    assert.strictEqual(res1.status, 200);
    assert.strictEqual(res1.body.data.settled, false);
    assert.strictEqual(res1.body.data.status, 'PARTIAL');
    assert.strictEqual(res1.body.data.pnr, payment.pnr);

    const ord = services.paymentService.orders.get(payment.order_id);
    assert.strictEqual(ord.payment_status, 'PENDING_PAYMENT');
    assert.strictEqual(ord.paid_amount_vnd, part1);
    assert.strictEqual(ord.remaining_vnd, part2);
    assert.ok(services.managerService.alerts.some(a => a.type === 'PAYMENT_AMOUNT_MISMATCH' && a.message.includes(payment.pnr)));

    const res2 = await api('/api/v1/webhooks/vietqr/ipn', {
      method: 'POST',
      body: {
        transferMemo: payment.payment_details.transfer_memo,
        amountVnd: part2,
        bankRef: 'FT_PART_2'
      }
    });
    assert.strictEqual(res2.status, 200);
    assert.strictEqual(res2.body.data.settled, true);
    assert.strictEqual(res2.body.data.issued_tickets.length, 1);
    assert.strictEqual(ord.payment_status, 'PAID');
    assert.strictEqual(ord.paid_amount_vnd, payment.amount_vnd);
    assert.strictEqual(ord.remaining_vnd, 0);
    assert.strictEqual(ord.payment_txs.length, 2);
  });

  it('4. overpaid transfer settles the order and requests a refund of the excess (OVERPAID_EXCESS)', async () => {
    const { payment } = await createOrder();
    const excess = 50000;
    const res = services.paymentService.applyBankTransfer({
      operatorId: 'op_saomai',
      provider: 'VIETQR_HMAC',
      providerTxId: 'FT_OVER_1',
      bankRef: 'FT_OVER_1',
      amountVnd: payment.amount_vnd + excess,
      memo: payment.payment_details.transfer_memo
    });
    assert.strictEqual(res.outcome, 'OVERPAID_SETTLED');
    assert.strictEqual(res.issued_tickets.length, 1);
    assert.ok(res.refund_id);

    const refund = services.managerService.refundRequests.find(r => r.refund_id === res.refund_id);
    assert.ok(refund);
    assert.strictEqual(refund.pnr, payment.pnr);
    assert.strictEqual(refund.amount_vnd, excess);
    assert.strictEqual(refund.source, 'OVERPAID_EXCESS');

    const ord = services.paymentService.orders.get(payment.order_id);
    assert.strictEqual(ord.paid_amount_vnd, payment.amount_vnd);
    assert.strictEqual(ord.refunded_vnd, excess);
  });

  it('5. second distinct transfer on an already-paid order opens a full refund (DUPLICATE_REFUND)', async () => {
    const { payment } = await createOrder();
    await api('/api/v1/webhooks/vietqr/ipn', {
      method: 'POST',
      body: {
        transferMemo: payment.payment_details.transfer_memo,
        amountVnd: payment.amount_vnd,
        bankRef: 'FT_FIRST_PAID'
      }
    });

    const dup = await api('/api/v1/webhooks/vietqr/ipn', {
      method: 'POST',
      body: {
        transferMemo: payment.payment_details.transfer_memo,
        amountVnd: payment.amount_vnd,
        bankRef: 'FT_SECOND_DUP'
      }
    });
    assert.strictEqual(dup.status, 200);
    assert.strictEqual(dup.body.data.settled, false);
    assert.strictEqual(dup.body.data.status, 'DUPLICATE_REFUND');
    assert.strictEqual(dup.body.data.pnr, payment.pnr);

    const refund = services.managerService.refundRequests.find(r => r.pnr === payment.pnr && r.source === 'DUPLICATE_TRANSFER');
    assert.ok(refund);
    assert.strictEqual(refund.amount_vnd, payment.amount_vnd);

    const ord = services.paymentService.orders.get(payment.order_id);
    assert.strictEqual(ord.paid_amount_vnd, payment.amount_vnd);
    assert.strictEqual(ord.refunded_vnd, payment.amount_vnd);
  });

  it('6. transfer to wrong bank account is recorded as WRONG_ACCOUNT without touching the order', async () => {
    const { payment } = await createOrder();
    const res = await api('/api/v1/webhooks/vietqr/ipn', {
      method: 'POST',
      body: {
        transferMemo: payment.payment_details.transfer_memo,
        amountVnd: payment.amount_vnd,
        bankRef: 'FT_WRONG_ACC',
        accountNumber: '999988887777'
      }
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.settled, false);
    assert.strictEqual(res.body.data.status, 'WRONG_ACCOUNT');

    const ord = services.paymentService.orders.get(payment.order_id);
    assert.strictEqual(ord.payment_status, 'PENDING_PAYMENT');
    assert.strictEqual(ord.paid_amount_vnd || 0, 0);
  });

  it('7. unmatched transfer is stored, alerts office, listed via GET /ops/bank-transactions, and assigned to PNR', async () => {
    const { payment } = await createOrder();
    const unmatchedRes = await api('/api/v1/webhooks/vietqr/ipn', {
      method: 'POST',
      body: {
        transferMemo: 'CHUYEN TIEN VE XE KHONG GHI MA',
        amountVnd: payment.amount_vnd,
        bankRef: 'FT_UNMATCHED_01'
      }
    });
    assert.strictEqual(unmatchedRes.status, 200);
    assert.strictEqual(unmatchedRes.body.data.settled, false);
    assert.strictEqual(unmatchedRes.body.data.status, 'UNMATCHED');
    assert.strictEqual(unmatchedRes.body.data.pnr, null);

    // PAYMENT_UNMATCHED alert created
    assert.ok(services.managerService.alerts.some(a => a.type === 'PAYMENT_UNMATCHED' && a.message.includes('FT_UNMATCHED_01')));

    // Listed for cashier and director, newest first
    const listRes = await api('/api/v1/ops/bank-transactions?outcome=UNMATCHED', { token: cashierToken });
    assert.strictEqual(listRes.status, 200);
    const txRecord = listRes.body.data.transactions.find(t => t.bank_ref === 'FT_UNMATCHED_01');
    assert.ok(txRecord, 'unmatched transaction must appear in list');
    assert.strictEqual(txRecord.outcome, 'UNMATCHED');

    // Cashier cannot assign (only FLEET_DIRECTOR and FINANCIAL_CONTROLLER)
    const cashierAssign = await api(`/api/v1/ops/bank-transactions/${encodeURIComponent(txRecord.tx_id)}/assign`, {
      method: 'POST',
      token: cashierToken,
      body: { pnr: payment.pnr }
    });
    assert.strictEqual(cashierAssign.status, 403);

    // Director assigns the transaction to the booking PNR
    const assignRes = await api(`/api/v1/ops/bank-transactions/${encodeURIComponent(txRecord.tx_id)}/assign`, {
      method: 'POST',
      token: directorToken,
      body: { pnr: payment.pnr }
    });
    assert.strictEqual(assignRes.status, 200, JSON.stringify(assignRes.body));
    assert.strictEqual(assignRes.body.data.outcome, 'SETTLED');
    assert.strictEqual(assignRes.body.data.pnr, payment.pnr);
    assert.strictEqual(assignRes.body.data.issued_tickets.length, 1);
    assert.strictEqual(assignRes.body.data.assigned_by, 'mgr_01');

    // Stored record updated and keep assigned_by
    const updatedTx = services.paymentService.bankTransactions.get(txRecord.tx_id);
    assert.strictEqual(updatedTx.outcome, 'SETTLED');
    assert.strictEqual(updatedTx.pnr, payment.pnr);
    assert.strictEqual(updatedTx.assigned_by, 'mgr_01');

    // Audit log has BANK_TX_ASSIGN
    assert.ok(services.managerService.auditLog.some(a => a.action === 'BANK_TX_ASSIGN' && a.resource === txRecord.tx_id));

    // No longer in UNMATCHED list
    const afterList = await api('/api/v1/ops/bank-transactions?outcome=UNMATCHED', { token: cashierToken });
    assert.ok(!afterList.body.data.transactions.some(t => t.tx_id === txRecord.tx_id));
  });

  it('8. late transfer with seats still free settles the order (LATE_SETTLED)', async () => {
    const { payment } = await createOrder();
    const afterExpiry = Date.parse(payment.expires_at) + 5 * 60 * 1000;

    const lateOk = await api('/api/v1/webhooks/vietqr/ipn', {
      method: 'POST',
      body: {
        transferMemo: payment.payment_details.transfer_memo,
        amountVnd: payment.amount_vnd,
        bankRef: 'FT_LATE_FREE_01',
        now: afterExpiry
      }
    });
    assert.strictEqual(lateOk.status, 200);
    assert.strictEqual(lateOk.body.data.settled, true);
    assert.strictEqual(lateOk.body.data.issued_tickets.length, 1);

    const tx = services.paymentService.bankTransactions.get('op_saomai:VIETQR_HMAC:FT_LATE_FREE_01');
    assert.strictEqual(tx.outcome, 'LATE_SETTLED');
    assert.strictEqual(services.paymentService.orders.get(payment.order_id).payment_status, 'PAID');
  });

  it('9. late transfer when seat was already sold marks UNMATCHED_OVERDUE and refunds paid_amount_vnd (LATE_REFUND)', async () => {
    const { seat, payment } = await createOrder();
    const afterExpiry = Date.parse(payment.expires_at) + 5 * 60 * 1000;

    // Seat is sold at the counter after the passenger's hold expired
    const posSale = services.managerService.createPosBooking({
      tripId: TRIP,
      passengerName: 'Khách Mua Ghế Trễ',
      phone: '0933111222',
      seatCodes: [seat],
      mockNow: afterExpiry,
      operatorId: 'op_saomai'
    });
    assert.strictEqual(posSale.success, true, JSON.stringify(posSale));

    const lateRefund = await api('/api/v1/webhooks/vietqr/ipn', {
      method: 'POST',
      body: {
        transferMemo: payment.payment_details.transfer_memo,
        amountVnd: payment.amount_vnd,
        bankRef: 'FT_LATE_SOLD_01',
        now: afterExpiry + 1000
      }
    });
    assert.strictEqual(lateRefund.status, 200);
    assert.strictEqual(lateRefund.body.data.settled, false);
    assert.strictEqual(lateRefund.body.data.status, 'LATE_REFUND');
    assert.strictEqual(lateRefund.body.data.pnr, payment.pnr);

    const ord = services.paymentService.orders.get(payment.order_id);
    assert.strictEqual(ord.payment_status, 'UNMATCHED_OVERDUE');
    const refunds = services.managerService.refundRequests.filter(r => r.pnr === payment.pnr);
    assert.strictEqual(refunds.length, 1);
    assert.strictEqual(refunds[0].amount_vnd, payment.amount_vnd);
    assert.strictEqual(refunds[0].source, 'UNMATCHED_OVERDUE');
  });

  it('10. order expiring with partial money opens an UNDERPAID_EXPIRED refund once', async () => {
    const { payment } = await createOrder();
    const partialAmount = 80000;

    await api('/api/v1/webhooks/vietqr/ipn', {
      method: 'POST',
      body: {
        transferMemo: payment.payment_details.transfer_memo,
        amountVnd: partialAmount,
        bankRef: 'FT_EXP_PART_01'
      }
    });

    const afterExpiry = Date.parse(payment.expires_at) + 60000;
    const poll1 = services.paymentService.checkPaymentStatus(payment.order_id, { mockNow: afterExpiry });
    assert.strictEqual(poll1.success, false);
    assert.strictEqual(poll1.code, 'PAYMENT_EXPIRED');

    // Calling settlePayment after expiry also hits expiry path but must not create a second refund
    services.paymentService.settlePayment(payment.order_id, 'tx_late', afterExpiry);

    const refunds = services.managerService.refundRequests.filter(r => r.pnr === payment.pnr && r.source === 'UNDERPAID_EXPIRED');
    assert.strictEqual(refunds.length, 1, 'refund must be requested once');
    assert.strictEqual(refunds[0].amount_vnd, partialAmount);
  });

  it('11. manual payment confirmation by cashier succeeds (200) and by dispatcher is forbidden (403)', async () => {
    const { payment } = await createOrder();

    // Dispatcher gets 403
    const dispRes = await api(`/api/v1/ops/orders/${payment.order_id}/confirm-payment`, {
      method: 'POST',
      token: dispatcherToken,
      body: { amount_vnd: payment.amount_vnd, note: 'Đối soát sao kê VTB' }
    });
    assert.strictEqual(dispRes.status, 403);

    // Note too short (< 3 chars) -> 400
    const shortNote = await api(`/api/v1/ops/orders/${payment.order_id}/confirm-payment`, {
      method: 'POST',
      token: cashierToken,
      body: { amount_vnd: payment.amount_vnd, note: 'ok' }
    });
    assert.strictEqual(shortNote.status, 400);

    // Cashier confirms payment -> 200 SETTLED
    const cashRes = await api(`/api/v1/ops/orders/${payment.order_id}/confirm-payment`, {
      method: 'POST',
      token: cashierToken,
      body: { amount_vnd: payment.amount_vnd, note: 'Đã nhận tiền mặt tại quầy Giáp Bát' }
    });
    assert.strictEqual(cashRes.status, 200, JSON.stringify(cashRes.body));
    assert.strictEqual(cashRes.body.data.outcome, 'SETTLED');
    assert.strictEqual(cashRes.body.data.issued_tickets.length, 1);

    const manualKey = `op_saomai:MANUAL:manual_${payment.order_id}_1`;
    const storedTx = services.paymentService.bankTransactions.get(manualKey);
    assert.ok(storedTx);
    assert.strictEqual(storedTx.provider, 'MANUAL');
    assert.strictEqual(storedTx.outcome, 'SETTLED');
    assert.strictEqual(storedTx.note, 'Đã nhận tiền mặt tại quầy Giáp Bát');
    assert.ok(services.managerService.auditLog.some(a => a.action === 'PAYMENT_MANUAL_CONFIRM' && a.resource === payment.order_id));
  });

  it('12. cross-company isolation: Xuyên Việt staff cannot see or assign Sao Mai transactions', async () => {
    const { payment: saomaiPayment } = await createOrder();
    const { payment: xvPayment } = await createOrder({
      seat: 'A07',
      tripId: XV_TRIP,
      token: xvPaxToken,
      operatorCode: 'XUYENVIET',
      phone: '0912340002'
    });

    // Unmatched Sao Mai transfer
    await api('/api/v1/webhooks/vietqr/SAOMAI/ipn', {
      method: 'POST',
      body: {
        transferMemo: 'CHUYEN KHOAN SAO MAI KHONG MA',
        amountVnd: saomaiPayment.amount_vnd,
        bankRef: 'FT_SAOMAI_UNMATCHED_99'
      }
    });
    const saomaiTxId = 'op_saomai:VIETQR_HMAC:FT_SAOMAI_UNMATCHED_99';

    // Xuyên Việt staff lists bank transactions -> sees none of Sao Mai's transactions
    const xvList = await api('/api/v1/ops/bank-transactions?outcome=UNMATCHED', {
      token: xvDirectorToken,
      operatorCode: 'XUYENVIET'
    });
    assert.strictEqual(xvList.status, 200);
    assert.ok(!xvList.body.data.transactions.some(t => t.operator_id === 'op_saomai'));

    // Xuyên Việt director cannot assign Sao Mai's unmatched transaction
    const xvAssign = await api(`/api/v1/ops/bank-transactions/${encodeURIComponent(saomaiTxId)}/assign`, {
      method: 'POST',
      token: xvDirectorToken,
      operatorCode: 'XUYENVIET',
      body: { pnr: xvPayment.pnr }
    });
    assert.strictEqual(xvAssign.status, 404);
    assert.strictEqual(xvAssign.body.code, 'BANK_TX_NOT_FOUND');

    // Sao Mai director cannot assign Sao Mai's transaction to a Xuyên Việt PNR either
    const crossPnrAssign = await api(`/api/v1/ops/bank-transactions/${encodeURIComponent(saomaiTxId)}/assign`, {
      method: 'POST',
      token: directorToken,
      operatorCode: 'SAOMAI',
      body: { pnr: xvPayment.pnr }
    });
    assert.strictEqual(crossPnrAssign.status, 404);
    assert.strictEqual(crossPnrAssign.body.code, 'ORDER_NOT_FOUND');
  });

  it('13. Scenario 1: two late transfers on a non-sellable order refund X then Y (never X+Y)', async () => {
    const { seat, payment } = await createOrder();
    const afterExpiry = Date.parse(payment.expires_at) + 5 * 60 * 1000;

    // Seat sold to someone else after hold expired
    const posSale = services.managerService.createPosBooking({
      tripId: TRIP,
      passengerName: 'Khách Mua Trước',
      phone: '0933444555',
      seatCodes: [seat],
      mockNow: afterExpiry,
      operatorId: 'op_saomai'
    });
    assert.strictEqual(posSale.success, true);

    const amountX = 70000;
    const amountY = 100000;

    const tx1 = await api('/api/v1/webhooks/vietqr/ipn', {
      method: 'POST',
      body: {
        transferMemo: payment.payment_details.transfer_memo,
        amountVnd: amountX,
        bankRef: 'FT_LATE_DOUBLE_X',
        now: afterExpiry + 1000
      }
    });
    assert.strictEqual(tx1.status, 200);
    assert.strictEqual(tx1.body.data.status, 'LATE_REFUND');

    const tx2 = await api('/api/v1/webhooks/vietqr/ipn', {
      method: 'POST',
      body: {
        transferMemo: payment.payment_details.transfer_memo,
        amountVnd: amountY,
        bankRef: 'FT_LATE_DOUBLE_Y',
        now: afterExpiry + 2000
      }
    });
    assert.strictEqual(tx2.status, 200);
    assert.strictEqual(tx2.body.data.status, 'LATE_REFUND');

    const refunds = services.managerService.refundRequests.filter(r => r.pnr === payment.pnr);
    assert.deepStrictEqual(refunds.map(r => r.amount_vnd), [amountX, amountY]);

    const ord = services.paymentService.orders.get(payment.order_id);
    assert.strictEqual(ord.paid_amount_vnd, 0);
    assert.strictEqual(ord.refunded_vnd, amountX + amountY);
  });

  it('14. Scenario 2: partial X refunded on expiry, then late full transfer Y settles with excess = Y - amount (0 when exact)', async () => {
    // Case A: Y === amount -> 0 excess refund
    const { payment: pExact } = await createOrder();
    const amountX1 = 60000;

    await api('/api/v1/webhooks/vietqr/ipn', {
      method: 'POST',
      body: {
        transferMemo: pExact.payment_details.transfer_memo,
        amountVnd: amountX1,
        bankRef: 'FT_SC2_EXACT_X'
      }
    });

    const afterExp1 = Date.parse(pExact.expires_at) + 60000;
    services.paymentService.checkPaymentStatus(pExact.order_id, { mockNow: afterExp1 });

    const lateExact = await api('/api/v1/webhooks/vietqr/ipn', {
      method: 'POST',
      body: {
        transferMemo: pExact.payment_details.transfer_memo,
        amountVnd: pExact.amount_vnd,
        bankRef: 'FT_SC2_EXACT_Y',
        now: afterExp1 + 5000
      }
    });
    assert.strictEqual(lateExact.status, 200);
    assert.strictEqual(lateExact.body.data.settled, true);

    const refundsExact = services.managerService.refundRequests.filter(r => r.pnr === pExact.pnr);
    assert.strictEqual(refundsExact.length, 1);
    assert.strictEqual(refundsExact[0].source, 'UNDERPAID_EXPIRED');
    assert.strictEqual(refundsExact[0].amount_vnd, amountX1);

    const ordExact = services.paymentService.orders.get(pExact.order_id);
    assert.strictEqual(ordExact.paid_amount_vnd, pExact.amount_vnd);
    assert.strictEqual(ordExact.refunded_vnd, amountX1);

    // Case B: Y > amount -> excess refund is Y - amount (never X + Y - amount)
    const { payment: pOver } = await createOrder();
    const amountX2 = 50000;
    const extraOver = 30000;
    const amountY2 = pOver.amount_vnd + extraOver;

    await api('/api/v1/webhooks/vietqr/ipn', {
      method: 'POST',
      body: {
        transferMemo: pOver.payment_details.transfer_memo,
        amountVnd: amountX2,
        bankRef: 'FT_SC2_OVER_X'
      }
    });

    const afterExp2 = Date.parse(pOver.expires_at) + 60000;
    services.paymentService.checkPaymentStatus(pOver.order_id, { mockNow: afterExp2 });

    const lateOver = await api('/api/v1/webhooks/vietqr/ipn', {
      method: 'POST',
      body: {
        transferMemo: pOver.payment_details.transfer_memo,
        amountVnd: amountY2,
        bankRef: 'FT_SC2_OVER_Y',
        now: afterExp2 + 5000
      }
    });
    assert.strictEqual(lateOver.status, 200);
    assert.strictEqual(lateOver.body.data.settled, true);

    const refundsOver = services.managerService.refundRequests.filter(r => r.pnr === pOver.pnr);
    assert.deepStrictEqual(
      refundsOver.map(r => ({ source: r.source, amount_vnd: r.amount_vnd })),
      [
        { source: 'UNDERPAID_EXPIRED', amount_vnd: amountX2 },
        { source: 'OVERPAID_EXCESS', amount_vnd: extraOver }
      ]
    );

    const ordOver = services.paymentService.orders.get(pOver.order_id);
    assert.strictEqual(ordOver.paid_amount_vnd, pOver.amount_vnd);
    assert.strictEqual(ordOver.refunded_vnd, amountX2 + extraOver);
  });

  it('15. in production mode, webhook and staff routes ignore caller-supplied body.now', async () => {
    const { payment } = await createOrder();
    const farFuture = Date.parse(payment.expires_at) + 24 * 3600 * 1000;
    const prevNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const res = await api('/api/v1/webhooks/vietqr/SAOMAI/ipn', {
        method: 'POST',
        body: {
          transferMemo: payment.payment_details.transfer_memo,
          amountVnd: payment.amount_vnd,
          bankRef: 'FT_PROD_NOW_IGNORED',
          now: farFuture
        }
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.data.settled, true);
      const stored = services.paymentService.bankTransactions.get('op_saomai:VIETQR_HMAC:FT_PROD_NOW_IGNORED');
      assert.strictEqual(stored.outcome, 'SETTLED', 'far-future body.now must be ignored in production');
    } finally {
      if (prevNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = prevNodeEnv;
      }
    }
  });

  it('16. GET /api/v1/ops/pending-payments enforces roles, company isolation, and 3-day / status filtering (MGR-037)', async () => {
    // 1. Create a pending order for Sao Mai and one for Xuyên Việt
    const smOrder = await createOrder({ phone: '0912340001' });
    const xvOrder = await createOrder({
      tripId: XV_TRIP,
      token: xvPaxToken,
      operatorCode: 'XUYENVIET',
      phone: '0912340002'
    });

    const financeToken = signToken(
      {
        kind: 'staff',
        sub: 'mgr_sm_fin',
        username: 'fin@busgo.vn',
        role: 'FINANCIAL_CONTROLLER',
        operator_id: 'op_saomai'
      },
      { prefix: TOKEN_PREFIXES.staff, ttlSeconds: 3600 }
    );

    // 2. Roles: FLEET_DIRECTOR, CASHIER, FINANCIAL_CONTROLLER allowed; DISPATCHER forbidden
    const dirRes = await api('/api/v1/ops/pending-payments', { token: directorToken });
    assert.strictEqual(dirRes.status, 200);
    assert.ok(Array.isArray(dirRes.body.data.orders));
    const foundSmDir = dirRes.body.data.orders.find(o => o.order_id === smOrder.payment.order_id);
    assert.ok(foundSmDir, 'Sao Mai order must be visible to Sao Mai director');

    const cashRes = await api('/api/v1/ops/pending-payments', { token: cashierToken });
    assert.strictEqual(cashRes.status, 200);
    const foundSmCash = cashRes.body.data.orders.find(o => o.order_id === smOrder.payment.order_id);
    assert.ok(foundSmCash, 'Sao Mai order must be visible to cashier');
    // Cashier sees masked phone
    assert.ok(foundSmCash.payer_phone.includes('*'), 'Cashier must see masked phone number');
    assert.notStrictEqual(foundSmCash.payer_phone, '0912340001');

    const finRes = await api('/api/v1/ops/pending-payments', { token: financeToken });
    assert.strictEqual(finRes.status, 200);

    const dispRes = await api('/api/v1/ops/pending-payments', { token: dispatcherToken });
    assert.strictEqual(dispRes.status, 403);

    // 3. Company isolation
    assert.ok(!dirRes.body.data.orders.some(o => o.order_id === xvOrder.payment.order_id), 'Sao Mai must not see Xuyên Việt order');

    const xvRes = await api('/api/v1/ops/pending-payments', { token: xvDirectorToken, operatorCode: 'XUYENVIET' });
    assert.strictEqual(xvRes.status, 200);
    assert.ok(xvRes.body.data.orders.some(o => o.order_id === xvOrder.payment.order_id), 'Xuyên Việt director sees Xuyên Việt order');
    assert.ok(!xvRes.body.data.orders.some(o => o.order_id === smOrder.payment.order_id), 'Xuyên Việt must not see Sao Mai order');

    // 4. Filtering: CASH orders ignored, older than 3 days ignored, settled orders ignored
    // Modify one order to CASH
    const cashOrder = services.paymentService.orders.get(smOrder.payment.order_id);
    const origMethod = cashOrder.payment_method;
    cashOrder.payment_method = 'CASH';
    const resCashCheck = await api('/api/v1/ops/pending-payments', { token: directorToken });
    assert.ok(!resCashCheck.body.data.orders.some(o => o.order_id === cashOrder.order_id), 'CASH payment method must be excluded');
    cashOrder.payment_method = origMethod;

    // Modify created_at to 4 days ago
    const origCreated = cashOrder.created_at;
    cashOrder.created_at = new Date(Date.now() - 4 * 86400000).toISOString();
    const resOldCheck = await api('/api/v1/ops/pending-payments', { token: directorToken });
    assert.ok(!resOldCheck.body.data.orders.some(o => o.order_id === cashOrder.order_id), 'Orders older than 3 days must be excluded');
    cashOrder.created_at = origCreated;

    // Modify payment_status to PAID
    const origStatus = cashOrder.payment_status;
    cashOrder.payment_status = 'PAID';
    const resPaidCheck = await api('/api/v1/ops/pending-payments', { token: directorToken });
    assert.ok(!resPaidCheck.body.data.orders.some(o => o.order_id === cashOrder.order_id), 'Settled/paid orders must be excluded');

    // EXPIRED and UNMATCHED_OVERDUE must be included
    cashOrder.payment_status = 'EXPIRED';
    const resExpCheck = await api('/api/v1/ops/pending-payments', { token: directorToken });
    assert.ok(resExpCheck.body.data.orders.some(o => o.order_id === cashOrder.order_id), 'EXPIRED orders must be included');

    cashOrder.payment_status = 'UNMATCHED_OVERDUE';
    const resOverdueCheck = await api('/api/v1/ops/pending-payments', { token: directorToken });
    assert.ok(resOverdueCheck.body.data.orders.some(o => o.order_id === cashOrder.order_id), 'UNMATCHED_OVERDUE orders must be included');

    cashOrder.payment_status = origStatus;
  });

  it('17. GET /api/v1/ops/refunds lists open refunds per company; reject needs a reason; processed ones leave the default list (MGR-022)', async () => {
    const { payment } = await createOrder();
    const res = services.paymentService.applyBankTransfer({
      operatorId: 'op_saomai',
      provider: 'VIETQR_HMAC',
      providerTxId: 'FT_REFUND_LIST_1',
      bankRef: 'FT_REFUND_LIST_1',
      amountVnd: payment.amount_vnd + 30000,
      memo: payment.payment_details.transfer_memo
    });
    assert.strictEqual(res.outcome, 'OVERPAID_SETTLED');

    const list = await api('/api/v1/ops/refunds', { token: directorToken });
    assert.strictEqual(list.status, 200);
    const row = list.body.data.refunds.find(r => r.refund_id === res.refund_id);
    assert.ok(row, 'open refund must be listed');
    assert.strictEqual(row.amount_vnd, 30000);
    assert.strictEqual(row.source, 'OVERPAID_EXCESS');
    assert.strictEqual(row.payer_phone, '0912340001', 'the director sees the full phone to pay back');

    assert.strictEqual((await api('/api/v1/ops/refunds', { token: cashierToken })).status, 403);
    assert.strictEqual((await api('/api/v1/ops/refunds', { token: dispatcherToken })).status, 403);
    const xv = await api('/api/v1/ops/refunds?status=ALL', { token: xvDirectorToken });
    assert.ok(!xv.body.data.refunds.some(r => r.refund_id === res.refund_id), 'another company must not see it');

    const noReason = await api(`/api/v1/ops/refunds/${res.refund_id}/process`, { method: 'POST', token: directorToken, body: { approved: false, notes: ' ' } });
    assert.strictEqual(noReason.status, 400);
    assert.strictEqual(noReason.body.code ?? noReason.body.error?.code, 'REASON_REQUIRED');

    const done = await api(`/api/v1/ops/refunds/${res.refund_id}/process`, { method: 'POST', token: directorToken, body: { approved: true, notes: 'CK VCB FT123' } });
    assert.strictEqual(done.status, 200);
    assert.strictEqual(done.body.data.status, 'REFUNDED');
    assert.ok(done.body.data.processed_by);

    const open = await api('/api/v1/ops/refunds', { token: directorToken });
    assert.ok(!open.body.data.refunds.some(r => r.refund_id === res.refund_id), 'processed refund leaves the open list');
    const all = await api('/api/v1/ops/refunds?status=ALL', { token: directorToken });
    assert.strictEqual(all.body.data.refunds.find(r => r.refund_id === res.refund_id)?.status, 'REFUNDED');
  });
});
