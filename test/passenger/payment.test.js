import { describe, it } from 'node:test';
import assert from 'node:assert';
import { PassengerPaymentService } from '../../source/server/services/passenger/modules/payment.js';

describe('Phase 6: Payment, Ticket Wallet & Dynamic HMAC QR Test Suite', () => {
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

  it('TC-PAY-04: Should generate 30s rotating HMAC QR boarding pass and board passenger (PAX-017)', () => {
    const ticketId = `tkt_${createdPnr.replace('-', '')}_A01`;
    
    // 1. Passenger opens boarding pass
    const passRes = paymentService.getDynamicBoardingPass(ticketId, t0 + 120000);
    assert.strictEqual(passRes.success, true);
    assert.ok(passRes.data.dynamic_qr.qr_code_value.startsWith('BUSGO|'));
    assert.strictEqual(passRes.data.dynamic_qr.hmac_signature.length, 16);

    // 2. Driver scans dynamic QR
    const scanRes = paymentService.validateAndBoardTicket(passRes.data.dynamic_qr.qr_code_value, t0 + 121000);
    assert.strictEqual(scanRes.success, true);
    assert.strictEqual(scanRes.data.status, 'BOARDED');

    // 3. Re-scan of already boarded ticket -> Rejected
    const duplicateScan = paymentService.validateAndBoardTicket(passRes.data.dynamic_qr.qr_code_value, t0 + 122000);
    assert.strictEqual(duplicateScan.success, false);
    assert.strictEqual(duplicateScan.code, 'TICKET_ALREADY_USED');
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

    // User taps "Tôi đã chuyển tiền" (manualTrigger: true)
    const pollManual = paymentService.checkPaymentStatus(orderId, { manualTrigger: true, mockNow: t0 + 20000 });
    assert.strictEqual(pollManual.success, true);
    assert.strictEqual(pollManual.payment_status, 'PAID');
    assert.strictEqual(pollManual.is_settled, true);
    assert.strictEqual(pollManual.reconciliation_mode, 'MANUAL_TRIGGER');
    assert.strictEqual(pollManual.tickets.length, 1);
  });

  it('TC-PAY-06: Should generate aggregate group boarding pass and board entire group (PAX-017, REV-01)', () => {
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
    const groupPass = paymentService.getGroupBoardingPass(orderRes.data.order_id, t0 + 60000);
    assert.strictEqual(groupPass.success, true);
    assert.strictEqual(groupPass.data.active_tickets_count, 2);
    assert.ok(groupPass.data.group_qr.qr_code_value.startsWith('BUSGO_GRP|'));

    // Driver scans Group QR
    const groupScan = paymentService.validateAndBoardTicket(groupPass.data.group_qr.qr_code_value, t0 + 61000);
    assert.strictEqual(groupScan.success, true);
    assert.strictEqual(groupScan.isGroup, true);
    assert.strictEqual(groupScan.data.boarded_count, 2);
  });

  it('TC-PAY-07: Should delegate ticket with offline 6-digit PIN and allow PIN check-in (PAX-017, REV-01)', () => {
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

    // Companion boards using PIN:ticketId:pin
    const pinString = `PIN:${ticketId}:${delegateRes.data.offline_pin}`;
    const boardRes = paymentService.validateAndBoardTicket(pinString, t0 + 50000);
    assert.strictEqual(boardRes.success, true);
    assert.strictEqual(boardRes.data.status, 'BOARDED');
  });
});
