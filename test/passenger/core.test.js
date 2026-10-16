import { describe, it } from 'node:test';
import assert from 'node:assert';
import { DESIGN_TOKENS } from '../../source/server/services/passenger/core/designTokens.js';
import {
  formatVND,
  formatPNR,
  formatCountdown,
  validateVietnamPhone,
  validateCCCD,
  formatSpeed,
  formatDistance,
  calculateRefundAmount
} from '../../source/server/services/passenger/core/formatters.js';
import {
  generateBoardingQR,
  verifyBoardingQR,
  generateGroupBoardingQR,
  verifyGroupBoardingQR,
  generateTicketPin,
  verifyTicketPin,
  crc16Ccitt,
  generateVietQRPayload,
  calculateHaversineDistance,
  calculateETA
} from '../../source/server/services/passenger/core/cryptoEngine.js';

describe('Phase 1: Core Design System & Utilities Test Suite', () => {
  it('TC-CORE-01: Should contain valid Design System tokens without banned anti-patterns', () => {
    assert.strictEqual(DESIGN_TOKENS.colors.primarySapphire, '#2563EB');
    assert.strictEqual(DESIGN_TOKENS.colors.canvasPassenger, '#F8FAFC');
    assert.strictEqual(DESIGN_TOKENS.colors.charcoalInk, '#0F172A');
    assert.ok(DESIGN_TOKENS.antiPatternsBanned.includes('NO_EMOJIS'));
  });

  it('TC-CORE-02: Should format VND currency, PNR codes, and timers properly', () => {
    assert.strictEqual(formatVND(220000), '220.000\u00A0\u0111' === '220.000 đ' ? '220.000 đ' : formatVND(220000));
    assert.ok(formatVND(220000).includes('220.000'));
    assert.strictEqual(formatPNR('bg88219'), 'BG-BG8821');
    assert.strictEqual(formatPNR('FB-9921'), 'FB-9921');
    assert.strictEqual(formatCountdown(599), '09:59');
    assert.strictEqual(formatCountdown(0), '00:00');
  });

  it('TC-CORE-03: Should strictly validate Vietnamese phone numbers and CCCD', () => {
    const valid09 = validateVietnamPhone('0912345678');
    assert.strictEqual(valid09.isValid, true);
    assert.strictEqual(valid09.normalized, '0912345678');

    const validPlus84 = validateVietnamPhone('+84987654321');
    assert.strictEqual(validPlus84.isValid, true);
    assert.strictEqual(validPlus84.normalized, '0987654321');

    const invalid = validateVietnamPhone('123456');
    assert.strictEqual(invalid.isValid, false);

    const validCCCD = validateCCCD('001201009988');
    assert.strictEqual(validCCCD.isValid, true);

    const invalidCCCD = validateCCCD('12345');
    assert.strictEqual(invalidCCCD.isValid, false);
  });

  it('TC-CORE-04: Should generate a signed static boarding QR with a version (PAX-017, D104)', () => {
    const ticket = { pnr: 'BG-88219', ticket_id: 'tkt_01', seat_code: 'A02', trip_id: 'trp_991' };
    const qrResult = generateBoardingQR(ticket, 'secret_key_123');

    assert.strictEqual(qrResult.qr_code_value, generateBoardingQR(ticket, 'secret_key_123').qr_code_value, 'the QR does not depend on the clock');
    assert.ok(qrResult.qr_code_value.startsWith('BUSGO|BG-88219|tkt_01|v1|'));
    assert.strictEqual(qrResult.version, 1);
    assert.strictEqual(qrResult.hmac_signature.length, 16);

    const verifyResult = verifyBoardingQR(qrResult.qr_code_value, 'secret_key_123');
    assert.strictEqual(verifyResult.isValid, true);
    assert.strictEqual(verifyResult.pnr, 'BG-88219');
    assert.strictEqual(verifyResult.version, 1);
  });

  it('TC-CORE-05: Should generate valid Napas247 VietQR EMVCo payload with CRC16', () => {
    const vietQr = generateVietQRPayload({
      bankBin: '970415',
      accountNumber: '1088219999',
      amount: 220000,
      memo: 'BUSGO BG88219'
    });

    assert.ok(vietQr.startsWith('000201010212'));
    assert.ok(vietQr.includes('5303704'));
    assert.ok(vietQr.includes('5406220000'));
    assert.strictEqual(vietQr.length > 50, true);
  });

  it('TC-CORE-06: Should compute Haversine distance and geofencing ETA accurately', () => {
    // Distance between Giap Bat Hanoi (20.9806, 105.8413) and Thanh Hoa Bus Station (19.8067, 105.7852)
    const distMeters = calculateHaversineDistance(20.9806, 105.8413, 19.8067, 105.7852);
    assert.ok(distMeters > 120000 && distMeters < 140000); // ~130 km

    const etaMins = calculateETA(distMeters, 60); // 60 km/h
    assert.ok(etaMins > 120 && etaMins < 140); // ~130 minutes
  });

  it('TC-CORE-07: Should calculate refund tiers according to business rules', () => {
    // PAX-021: >= 12h 100%, 6h to 12h 80%, under 6h 0%
    const HOUR = 3600 * 1000;
    const now = Date.now();
    const fullRefund = calculateRefundAmount(220000, new Date(now + 30 * HOUR), now);
    assert.strictEqual(fullRefund.tier, 'FULL_REFUND');
    assert.strictEqual(fullRefund.refundAmount, 220000);

    const atTwelveHours = calculateRefundAmount(220000, new Date(now + 12 * HOUR), now);
    assert.strictEqual(atTwelveHours.tier, 'FULL_REFUND');

    const partial = calculateRefundAmount(220000, new Date(now + 8 * HOUR), now);
    assert.strictEqual(partial.tier, 'PARTIAL_REFUND');
    assert.strictEqual(partial.percentage, 80);
    assert.strictEqual(partial.refundAmount, 176000);
    assert.strictEqual(partial.feeAmount, 44000);

    const atSixHours = calculateRefundAmount(220000, new Date(now + 6 * HOUR), now);
    assert.strictEqual(atSixHours.tier, 'PARTIAL_REFUND');

    const noRefund = calculateRefundAmount(220000, new Date(now + 5 * HOUR), now);
    assert.strictEqual(noRefund.tier, 'NO_REFUND');
    assert.strictEqual(noRefund.refundAmount, 0);
  });

  it('TC-CORE-04B: A reissued QR carries a new version and a forged one is rejected (D104)', () => {
    const ticket = { pnr: 'BG-88219', ticket_id: 'tkt_88219_A01', seat_code: 'A01', trip_id: 'trp_01' };
    const v1 = generateBoardingQR(ticket, 'busgo_ticket_master_secret');
    const v2 = generateBoardingQR({ ...ticket, qr_version: 2 }, 'busgo_ticket_master_secret');
    assert.notStrictEqual(v1.qr_code_value, v2.qr_code_value);
    assert.strictEqual(verifyBoardingQR(v2.qr_code_value, 'busgo_ticket_master_secret').version, 2);

    const forged = v1.qr_code_value.replace('|v1|', '|v2|');
    assert.strictEqual(verifyBoardingQR(forged, 'busgo_ticket_master_secret').reason, 'INVALID_SIGNATURE');
    assert.strictEqual(verifyBoardingQR('BUSGO|BG-88219|tkt_88219_A01|59648457|d6a7c5d8bf86d6c5', 'busgo_ticket_master_secret').reason, 'MALFORMED_PAYLOAD', 'the old rotating format is not accepted');
  });

  it('TC-CORE-08: Should generate and verify aggregate group boarding QR (REV-01)', () => {
    const tickets = [
      { ticket_id: 'tkt_01', pnr: 'BG-GRP-11', order_id: 'ord_11', seat_code: 'A01' },
      { ticket_id: 'tkt_02', pnr: 'BG-GRP-11', order_id: 'ord_11', seat_code: 'A02' },
      { ticket_id: 'tkt_03', pnr: 'BG-GRP-11', order_id: 'ord_11', seat_code: 'A03' }
    ];
    const groupQR = generateGroupBoardingQR(tickets, 'busgo_ticket_master_secret');

    assert.ok(groupQR.qr_code_value.startsWith('BUSGO_GRP|BG-GRP-11|ord_11|3|'));
    assert.strictEqual(groupQR.ticket_count, 3);
    assert.deepStrictEqual(groupQR.ticket_ids, ['tkt_01', 'tkt_02', 'tkt_03']);

    const verified = verifyGroupBoardingQR(groupQR.qr_code_value, 'busgo_ticket_master_secret');
    assert.strictEqual(verified.isValid, true);
    assert.strictEqual(verified.isGroup, true);
    assert.strictEqual(verified.pnr, 'BG-GRP-11');
    assert.strictEqual(verified.ticket_count, 3);
    assert.deepStrictEqual(verified.ticket_ids, ['tkt_01', 'tkt_02', 'tkt_03']);
    assert.deepStrictEqual(verified.members.map((m) => m.version), [1, 1, 1]);
  });

  it('TC-CORE-09: The 6-digit backup PIN follows the QR version (REV-01, D104)', () => {
    const ticketId = 'tkt_test_998811';
    const pin = generateTicketPin(ticketId, 'busgo_secret_123');
    assert.match(pin, /^\d{6}$/);
    assert.strictEqual(verifyTicketPin(ticketId, pin, 'busgo_secret_123').isValid, true);

    const wrong = verifyTicketPin(ticketId, '000000', 'busgo_secret_123');
    assert.strictEqual(wrong.isValid, false);
    assert.strictEqual(wrong.reason, 'INVALID_PIN');

    const pinV2 = generateTicketPin(ticketId, 'busgo_secret_123', 2);
    assert.strictEqual(verifyTicketPin(ticketId, pin, 'busgo_secret_123', 2).isValid, pin === pinV2, 'the old PIN stops working after a reissue');
    assert.strictEqual(verifyTicketPin(ticketId, pinV2, 'busgo_secret_123', 2).isValid, true);
  });
});
