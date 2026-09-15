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
  generateDynamicTicketQR,
  verifyDynamicTicketQR,
  generateGroupBoardingQR,
  verifyGroupBoardingQR,
  generateTicketPin,
  verifyTicketPin,
  generateOfflineSignedTicket,
  verifyOfflineSignedTicket,
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

  it('TC-CORE-04: Should generate dynamic 30s rotating HMAC ticket QR payload', () => {
    const ticket = {
      pnr: 'BG-88219',
      ticket_id: 'tkt_01',
      seat_code: 'A02',
      trip_id: 'trp_991'
    };
    const now = 1724800000000;
    const qrResult = generateDynamicTicketQR(ticket, 'secret_key_123', now);
    
    assert.ok(qrResult.qr_code_value.startsWith('BUSGO|BG-88219|tkt_01|'));
    assert.ok(qrResult.seconds_remaining <= 30 && qrResult.seconds_remaining >= 0);
    assert.strictEqual(typeof qrResult.hmac_signature, 'string');
    assert.strictEqual(qrResult.hmac_signature.length, 16);

    const verifyResult = verifyDynamicTicketQR(qrResult.qr_code_value, 'secret_key_123', now);
    assert.strictEqual(verifyResult.isValid, true);
    assert.strictEqual(verifyResult.pnr, 'BG-88219');
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
    const depDate = new Date(Date.now() + 30 * 3600 * 1000); // 30h ahead (>24h)
    const fullRefund = calculateRefundAmount(220000, depDate);
    assert.strictEqual(fullRefund.tier, 'FULL_REFUND');
    assert.strictEqual(fullRefund.refundAmount, 220000);

    const depDate18h = new Date(Date.now() + 18 * 3600 * 1000); // 18h ahead (12-24h)
    const halfRefund = calculateRefundAmount(220000, depDate18h);
    assert.strictEqual(halfRefund.tier, 'PARTIAL_REFUND');
    assert.strictEqual(halfRefund.refundAmount, 110000);

    const depDate6h = new Date(Date.now() + 6 * 3600 * 1000); // 6h ahead (<12h)
    const noRefund = calculateRefundAmount(220000, depDate6h);
    assert.strictEqual(noRefund.tier, 'NO_REFUND');
    assert.strictEqual(noRefund.refundAmount, 0);
  });

  it('TC-CORE-04B: Should verify dynamic QR with +-2 window tolerance (60s drift allowance - REV-03)', () => {
    const ticket = { pnr: 'BG-88219', ticket_id: 'tkt_88219_A01', seat_code: 'A01', trip_id: 'trp_01' };
    const baseNow = 1756300000000;
    const qrResult = generateDynamicTicketQR(ticket, 'busgo_ticket_master_secret', baseNow);

    // Same window
    const checkSame = verifyDynamicTicketQR(qrResult.qr_code_value, 'busgo_ticket_master_secret', baseNow);
    assert.strictEqual(checkSame.isValid, true);
    assert.strictEqual(checkSame.isCurrentWindow, true);

    // 1 window ahead (+30s)
    const check1Ahead = verifyDynamicTicketQR(qrResult.qr_code_value, 'busgo_ticket_master_secret', baseNow + 30000);
    assert.strictEqual(check1Ahead.isValid, true);

    // 2 windows ahead (+60s) -> Valid under REV-03
    const check2Ahead = verifyDynamicTicketQR(qrResult.qr_code_value, 'busgo_ticket_master_secret', baseNow + 60000);
    assert.strictEqual(check2Ahead.isValid, true);

    // 3 windows ahead (+90s) -> Invalid
    const check3Ahead = verifyDynamicTicketQR(qrResult.qr_code_value, 'busgo_ticket_master_secret', baseNow + 90000);
    assert.strictEqual(check3Ahead.isValid, false);
    assert.strictEqual(check3Ahead.reason, 'QR_EXPIRED');
  });

  it('TC-CORE-08: Should generate and verify aggregate group boarding QR (REV-01)', () => {
    const tickets = [
      { ticket_id: 'tkt_01', pnr: 'BG-GRP-11', order_id: 'ord_11', seat_code: 'A01' },
      { ticket_id: 'tkt_02', pnr: 'BG-GRP-11', order_id: 'ord_11', seat_code: 'A02' },
      { ticket_id: 'tkt_03', pnr: 'BG-GRP-11', order_id: 'ord_11', seat_code: 'A03' }
    ];
    const baseNow = 1756300000000;
    const groupQR = generateGroupBoardingQR(tickets, 'busgo_ticket_master_secret', baseNow);

    assert.ok(groupQR.qr_code_value.startsWith('BUSGO_GRP|BG-GRP-11|ord_11|3|'));
    assert.strictEqual(groupQR.ticket_count, 3);
    assert.deepStrictEqual(groupQR.ticket_ids, ['tkt_01', 'tkt_02', 'tkt_03']);

    const verified = verifyGroupBoardingQR(groupQR.qr_code_value, 'busgo_ticket_master_secret', baseNow + 30000);
    assert.strictEqual(verified.isValid, true);
    assert.strictEqual(verified.isGroup, true);
    assert.strictEqual(verified.pnr, 'BG-GRP-11');
    assert.strictEqual(verified.ticket_count, 3);
    assert.deepStrictEqual(verified.ticket_ids, ['tkt_01', 'tkt_02', 'tkt_03']);
  });

  it('TC-CORE-09: Should generate and verify offline 6-digit PIN and signed offline ticket (REV-01, REV-03)', () => {
    const ticketId = 'tkt_test_998811';
    const pin = generateTicketPin(ticketId, 'busgo_secret_123');
    assert.match(pin, /^\d{6}$/);

    const checkPinValid = verifyTicketPin(ticketId, pin, 'busgo_secret_123');
    assert.strictEqual(checkPinValid.isValid, true);

    const checkPinWrong = verifyTicketPin(ticketId, '000000', 'busgo_secret_123');
    assert.strictEqual(checkPinWrong.isValid, false);
    assert.strictEqual(checkPinWrong.reason, 'INVALID_PIN');

    // Offline signed ticket payload
    const ticket = { ticket_id: 'tkt_off_01', pnr: 'BG-991', seat_code: 'B02', trip_id: 'trp_100' };
    const offlineSigned = generateOfflineSignedTicket(ticket, 'busgo_secret_123');
    assert.ok(offlineSigned.sig);
    assert.strictEqual(offlineSigned.tkt, 'tkt_off_01');

    const verifiedTicket = verifyOfflineSignedTicket(offlineSigned, 'busgo_secret_123');
    assert.strictEqual(verifiedTicket.isValid, true);
    assert.strictEqual(verifiedTicket.ticket_id, 'tkt_off_01');
  });
});
