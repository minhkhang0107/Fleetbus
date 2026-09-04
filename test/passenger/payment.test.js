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
});
