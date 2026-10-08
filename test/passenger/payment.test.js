import { describe, it } from 'node:test';
import assert from 'node:assert';
import { PassengerPaymentService } from '../../source/server/services/passenger/modules/payment.js';
import { verifyBoardingQR, verifyGroupBoardingQR, verifyTicketPin } from '../../source/server/services/passenger/core/cryptoEngine.js';

describe('Phase 6: Payment, Ticket Wallet & Boarding Pass Test Suite', () => {
  const paymentService = new PassengerPaymentService();
  const t0 = 1724800000000;

  const mockTrip = {
    trip_id: 'trp_hn_th_01',
    route_name: 'Hà Nội — Thanh Hóa',
    departure_time: '2026-08-28T07:00:00+07:00'
  };

  let createdOrderId = null;
  let createdPnr = null;

  it('TC-PAY-01: Should create VietQR payment order with unique memo and EMVCo payload (PAX-013)', () => {
    const orderRes = paymentService.createPaymentOrder({
      holdId: 'hld_123',
      trip: mockTrip,
      seatCodes: ['A01', 'A02'],
      payer: { full_name: 'Nguyễn Văn An', phone: '0912345678' },
      passengers: [
        { full_name: 'Nguyễn Văn An', phone: '0912345678' },
        { full_name: 'Trần Thị Mai', phone: '0987654321' }
      ],
      amountVnd: 410000,
      pickupStop: { name: 'Bến xe Giáp Bát' },
      dropoffStop: { name: 'Bến xe Phía Bắc Thanh Hóa' },
      mockNow: t0
    });

    assert.strictEqual(orderRes.success, true);
    assert.ok(orderRes.data.order_id.startsWith('ord_'));
    assert.ok(orderRes.data.pnr.startsWith('BG-'));
    assert.strictEqual(orderRes.data.payment_status, 'PENDING_PAYMENT');
    assert.ok(orderRes.data.payment_details.qr_payload.length > 50);

    createdOrderId = orderRes.data.order_id;
    createdPnr = orderRes.data.pnr;
  });

  it('TC-PAY-02: Should process settlement callback and issue e-tickets (PAX-014, PAX-015)', () => {
    const settleRes = paymentService.settlePayment(createdOrderId, 'vnpay_tx_998811', t0 + 60000);
    assert.strictEqual(settleRes.success, true);
    assert.strictEqual(settleRes.data.order.payment_status, 'PAID');
    assert.strictEqual(settleRes.data.tickets.length, 2);

    const tkt1 = settleRes.data.tickets[0];
    assert.strictEqual(tkt1.seat_code, 'A01');
    assert.strictEqual(tkt1.status, 'ACTIVE');
    assert.strictEqual(tkt1.pnr, createdPnr);
  });

  it('TC-PAY-03: Should query Ticket Wallet with tab filters (PAX-016)', () => {
    const walletRes = paymentService.getTicketsByPhone('0912345678', 'UPCOMING');
    assert.strictEqual(walletRes.success, true);
    assert.ok(walletRes.data.length >= 1);
    assert.strictEqual(walletRes.data[0].passenger_name, 'Nguyễn Văn An');
  });

  it('TC-PAY-04: Should issue a static boarding QR and reissue it with a new version (PAX-017, D104)', () => {
    const ticketId = `tkt_${createdPnr.replace('-', '')}_A01`;

    // Boarding happens in the driver service (DRI-009); this module only issues the pass.
    const passRes = paymentService.getBoardingPass(ticketId);
    assert.strictEqual(passRes.success, true);
    const qr = passRes.data.boarding_qr;
    assert.ok(qr.qr_code_value.startsWith('BUSGO|'));
    assert.strictEqual(paymentService.getBoardingPass(ticketId).data.boarding_qr.qr_code_value, qr.qr_code_value, 'the QR is the same every time it is opened');
    assert.strictEqual(verifyBoardingQR(qr.qr_code_value, paymentService.secretKey).isValid, true);

    const reissued = paymentService.reissueBoardingQR(ticketId);
    assert.strictEqual(reissued.success, true);
    assert.strictEqual(reissued.data.boarding_qr.version, 2);

    const locked = paymentService.reissueBoardingQR(ticketId, { boardingStarted: true });
    assert.strictEqual(locked.code, 'BOARDING_STARTED');
  });

  it('TC-PAY-05: Should handle active resume polling and manual payment trigger (PAX-013, REV-02)', () => {
    // Create new pending order
    const orderRes = paymentService.createPaymentOrder({
      holdId: 'hld_poll_01',
      trip: { trip_id: 'trp_01', route_name: 'Hà Nội — Ninh Bình', departure_time: '2026-08-28T10:00:00Z' },
      seatCodes: ['A03'],
      payer: { full_name: 'Đặng Tuấn', phone: '0988776655' },
      passengers: [{ full_name: 'Đặng Tuấn', phone: '0988776655' }],
      amountVnd: 150000,
      pickupStop: 'Bến xe Giáp Bát',
      dropoffStop: 'Bến xe Ninh Bình',
      mockNow: t0
    });
    const orderId = orderRes.data.order_id;

    // Normal poll while still pending
    const pollPending = paymentService.checkPaymentStatus(orderId, { manualTrigger: false, mockNow: t0 + 10000 });
    assert.strictEqual(pollPending.success, true);
    assert.strictEqual(pollPending.payment_status, 'PENDING_PAYMENT');
    assert.strictEqual(pollPending.is_settled, false);

    // User taps "Tôi đã chuyển tiền" (manualTrigger: true): only a reconciliation request, never a settlement
    const pollManual = paymentService.checkPaymentStatus(orderId, { manualTrigger: true, mockNow: t0 + 20000 });
    assert.strictEqual(pollManual.success, true);
    assert.strictEqual(pollManual.payment_status, 'PENDING_PAYMENT');
    assert.strictEqual(pollManual.is_settled, false);
    assert.strictEqual(pollManual.reconciliation_mode, 'MANUAL_RECONCILE_REQUESTED');
    assert.strictEqual(pollManual.tickets.length, 0);

    // The bank webhook is what settles the order
    const callback = paymentService.handleVietQrCallback({
      transferMemo: orderRes.data.payment_details.transfer_memo,
      amountVnd: 150000,
      bankRef: 'bank_poll_01',
      now: t0 + 30000
    });
    assert.strictEqual(callback.success, true);

    const pollAfterBank = paymentService.checkPaymentStatus(orderId, { mockNow: t0 + 40000 });
    assert.strictEqual(pollAfterBank.payment_status, 'PAID');
    assert.strictEqual(pollAfterBank.is_settled, true);
    assert.strictEqual(pollAfterBank.tickets.length, 1);
  });

  it('TC-PAY-06: Should generate a static group boarding pass for a multi-seat booking (PAX-017, REV-01)', () => {
    // Order with 2 seats
    const orderRes = paymentService.createPaymentOrder({
      holdId: 'hld_grp_01',
      trip: { trip_id: 'trp_01', route_name: 'Hà Nội — Thanh Hóa', departure_time: '2026-08-28T14:00:00Z' },
      seatCodes: ['B05', 'B06'],
      payer: { full_name: 'Nhóm Đi Biển', phone: '0933445566' },
      passengers: [
        { full_name: 'Khách 1', phone: '0933445566' },
        { full_name: 'Khách 2', phone: '0933445567' }
      ],
      amountVnd: 440000,
      pickupStop: 'Pháp Vân',
      dropoffStop: 'Thanh Hóa',
      mockNow: t0
    });

    const settle = paymentService.settlePayment(orderRes.data.order_id, 'tx_grp_01', t0 + 5000);
    assert.strictEqual(settle.success, true);

    // Get Group Boarding Pass
    const groupPass = paymentService.getGroupBoardingPass(orderRes.data.order_id);
    assert.strictEqual(groupPass.success, true);
    assert.strictEqual(groupPass.data.active_tickets_count, 2);
    assert.ok(groupPass.data.group_qr.qr_code_value.startsWith('BUSGO_GRP|'));

    const verified = verifyGroupBoardingQR(groupPass.data.group_qr.qr_code_value, paymentService.secretKey);
    assert.strictEqual(verified.isValid, true);
    assert.strictEqual(verified.ticket_count, 2);
  });

  it('TC-PAY-07: Should share a ticket with a backup PIN and an opaque link (PAX-017, REV-01)', () => {
    // Order for companion
    const orderRes = paymentService.createPaymentOrder({
      holdId: 'hld_del_01',
      trip: { trip_id: 'trp_01', route_name: 'Hà Nội — Thanh Hóa', departure_time: '2026-08-28T14:00:00Z' },
      seatCodes: ['A09'],
      payer: { full_name: 'Lê Văn Chính', phone: '0911223344' },
      passengers: [{ full_name: 'Lê Văn Phụ', phone: '0988001122' }],
      amountVnd: 220000,
      pickupStop: 'Pháp Vân',
      dropoffStop: 'Thanh Hóa',
      mockNow: t0
    });
    paymentService.settlePayment(orderRes.data.order_id, 'tx_del_01', t0 + 1000);
    const ticketId = orderRes.data.ticket_ids[0];

    // Delegate to companion
    const delegateRes = paymentService.delegateTicket(ticketId, {
      delegateToPhone: '0988001122',
      delegateToName: 'Lê Văn Phụ',
      mockNow: t0 + 2000
    });
    assert.strictEqual(delegateRes.success, true);
    assert.match(delegateRes.data.offline_pin, /^\d{6}$/);

    assert.strictEqual(verifyTicketPin(ticketId, delegateRes.data.offline_pin, paymentService.secretKey).isValid, true);
    assert.ok(!delegateRes.data.share_link.includes(delegateRes.data.offline_pin), 'the PIN is never in the link');
  });
});
