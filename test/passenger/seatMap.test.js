import { describe, it } from 'node:test';
import assert from 'node:assert';
import { PassengerSeatMapService } from '../../source/server/services/passenger/modules/seatMap.js';

describe('Phase 4: 2D VIP Seat Map & 10-Minute Seat Hold Test Suite', () => {
  it('TC-SEAT-01: Should generate complete 2D layout with Deck 1 and Deck 2', () => {
    const seatService = new PassengerSeatMapService();
    const mapRes = seatService.getSeatMap('trp_hn_th_01', 'stp_hn_gb', 'stp_th_pb');

    assert.strictEqual(mapRes.success, true);
    assert.strictEqual(mapRes.data.total_decks, 2);
    assert.strictEqual(mapRes.data.total_seats, 22);

    const deck1Seats = mapRes.data.seats.filter(s => s.deck === 1);
    const deck2Seats = mapRes.data.seats.filter(s => s.deck === 2);
    assert.strictEqual(deck1Seats.length, 11);
    assert.strictEqual(deck2Seats.length, 11);

    // Initial booked seats
    const a03 = mapRes.data.seats.find(s => s.seat_code === 'A03');
    assert.strictEqual(a03.segment_state, 'BOOKED');
  });

  it('TC-SEAT-02: Should enforce max 5 seats selection invariant (BR-SEAT-001)', () => {
    const seatService = new PassengerSeatMapService();
    const overLimitRes = seatService.holdSeats(
      'trp_hn_th_01',
      ['A01', 'A02', 'A04', 'A05', 'B01', 'B02'], // 6 seats
      'usr_100'
    );

    assert.strictEqual(overLimitRes.success, false);
    assert.strictEqual(overLimitRes.code, 'MAX_SEATS_EXCEEDED');
  });

  it('TC-SEAT-03: Should acquire 10-minute hold and prevent concurrent lock by other user', () => {
    const seatService = new PassengerSeatMapService();
    const t0 = 1724800000000;

    // User A holds A01 and A02
    const holdA = seatService.holdSeats('trp_hn_th_01', ['A01', 'A02'], 'usr_A', t0);
    assert.strictEqual(holdA.success, true);
    assert.strictEqual(holdA.data.total_seats, 2);
    assert.strictEqual(holdA.data.total_fare_vnd, 440000);
    assert.strictEqual(holdA.data.hold_duration_seconds, 600);

    // User B tries to select A01 concurrently -> Rejected with race conflict
    const holdB = seatService.holdSeats('trp_hn_th_01', ['A01', 'B01'], 'usr_B', t0 + 5000);
    assert.strictEqual(holdB.success, false);
    assert.strictEqual(holdB.code, 'SEAT_LOCKED_BY_OTHER');
    assert.strictEqual(holdB.conflictingSeat, 'A01');

    // Seat map viewed by User B shows A01 as LOCKED_BY_OTHER
    const mapB = seatService.getSeatMap('trp_hn_th_01', 'stp_hn_gb', 'stp_th_pb', t0 + 5000);
    const seatA01 = mapB.data.seats.find(s => s.seat_code === 'A01');
    assert.strictEqual(seatA01.segment_state, 'LOCKED_BY_OTHER');
  });

  it('TC-SEAT-04: Should automatically release hold after 600s TTL expiry', () => {
    const seatService = new PassengerSeatMapService();
    const t0 = 1724800000000;

    seatService.holdSeats('trp_hn_th_01', ['A01'], 'usr_A', t0);

    // Check at t0 + 601s (expired)
    const mapAfterExpiry = seatService.getSeatMap('trp_hn_th_01', 'stp_hn_gb', 'stp_th_pb', t0 + 601000);
    const seatA01 = mapAfterExpiry.data.seats.find(s => s.seat_code === 'A01');
    assert.strictEqual(seatA01.segment_state, 'AVAILABLE');

    // User B can now acquire A01
    const holdB = seatService.holdSeats('trp_hn_th_01', ['A01'], 'usr_B', t0 + 602000);
    assert.strictEqual(holdB.success, true);
  });
});
