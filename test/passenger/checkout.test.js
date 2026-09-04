import { describe, it } from 'node:test';
import assert from 'node:assert';
import { PassengerCheckoutService } from '../../source/server/services/passenger/modules/checkout.js';

describe('Phase 5: Passenger Manifest & Checkout Review Test Suite', () => {
  const checkoutService = new PassengerCheckoutService();

  it('TC-CHECKOUT-01: Should validate payer and multi-seat passenger manifest in PAX-011', () => {
    const manifestInput = {
      payerInfo: {
        full_name: 'Nguyễn Văn An',
        phone: '0912345678',
        email: 'an.nguyen@example.com'
      },
      seatCodes: ['A01', 'A02'],
      passengerList: [
        { full_name: 'Nguyễn Văn An', phone: '0912345678', cccd: '001201009988' },
        { full_name: 'Trần Thị Mai', phone: '0987654321', cccd: '001201007766' }
      ]
    };

    const res = checkoutService.validateManifest(manifestInput);
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.data.payer.full_name, 'Nguyễn Văn An');
    assert.strictEqual(res.data.passengers.length, 2);
    assert.strictEqual(res.data.passengers[0].seat_code, 'A01');
    assert.strictEqual(res.data.passengers[1].seat_code, 'A02');
  });

  it('TC-CHECKOUT-02: Should reject invalid phone or passenger count mismatch', () => {
    const badPhone = checkoutService.validateManifest({
      payerInfo: { full_name: 'Test', phone: '123' },
      seatCodes: ['A01'],
      passengerList: [{ full_name: 'Test' }]
    });
    assert.strictEqual(badPhone.success, false);
    assert.strictEqual(badPhone.code, 'INVALID_PAYER_PHONE');

    const countMismatch = checkoutService.validateManifest({
      payerInfo: { full_name: 'Test', phone: '0912345678' },
      seatCodes: ['A01', 'A02'],
      passengerList: [{ full_name: 'Only One' }]
    });
    assert.strictEqual(countMismatch.success, false);
    assert.strictEqual(countMismatch.code, 'PASSENGER_COUNT_MISMATCH');
  });

  it('TC-CHECKOUT-03: Should compute Order Review price breakdown with voucher in PAX-012', () => {
    const trip = {
      trip_id: 'trp_hn_th_01',
      route_name: 'Hà Nội — Thanh Hóa',
      departure_time: '2026-08-28T07:00:00+07:00',
      base_fare_vnd: 220000
    };

    // 2 seats (440,000) + Insurance 20,000 - BUSGO50K (50,000) = 410,000 VND
    const review = checkoutService.calculateOrderReview({
      trip,
      seatCodes: ['A01', 'A02'],
      pickupStop: { name: 'Bến xe Giáp Bát' },
      dropoffStop: { name: 'Bến xe Phía Bắc Thanh Hóa' },
      voucherCode: 'BUSGO50K',
      insuranceSelected: true
    });

    assert.strictEqual(review.success, true);
    assert.strictEqual(review.data.price_breakdown.subtotal_fare, 440000);
    assert.strictEqual(review.data.price_breakdown.insurance_fare, 20000);
    assert.strictEqual(review.data.price_breakdown.voucher_discount, 50000);
    assert.strictEqual(review.data.price_breakdown.final_total_vnd, 410000);
    assert.strictEqual(review.data.applied_voucher.code, 'BUSGO50K');
  });
});
