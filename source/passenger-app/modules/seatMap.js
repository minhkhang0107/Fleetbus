/**
 * FleetBus Passenger Seat Map & Realtime Hold Engine
 * Implements PAX-008 (Pickup/Dropoff), PAX-009 (2D Seat Map), PAX-010 (10-Min Seat Hold Engine).
 */

export class PassengerSeatMapService {
  constructor() {
    this.seatHolds = new Map(); // key: `${tripId}:${seatCode}` -> { holdId, userId, heldUntil, segmentId }
    this.holdDurationSeconds = 600; // 10 minutes Redis lock standard
    this.maxSeatsPerBooking = 5;

    // Seed mock layout for VIP Cabin 22 Rooms (2 decks, 11 cabins per deck)
    this.tripLayouts = new Map();
    this._initMockTripLayout('trp_hn_th_01');
  }

  _initMockTripLayout(tripId) {
    const seats = [];
    // Deck 1 (Tầng 1): A01-A06, B01-B05
    for (let i = 1; i <= 6; i++) {
      seats.push({
        seat_code: `A0${i}`,
        deck: 1,
        row: i,
        column: 1,
        type: 'VIP_CABIN',
        price_vnd: 220000,
        state: i === 3 ? 'BOOKED' : 'AVAILABLE'
      });
    }
    for (let i = 1; i <= 5; i++) {
      seats.push({
        seat_code: `B0${i}`,
        deck: 1,
        row: i,
        column: 3,
        type: 'VIP_CABIN',
        price_vnd: 220000,
        state: 'AVAILABLE'
      });
    }
    // Deck 2 (Tầng 2): A07-A11, B06-B11
    for (let i = 7; i <= 11; i++) {
      seats.push({
        seat_code: `A${i.toString().padStart(2, '0')}`,
        deck: 2,
        row: i - 6,
        column: 1,
        type: 'VIP_CABIN',
        price_vnd: 220000,
        state: 'AVAILABLE'
      });
    }
    for (let i = 6; i <= 11; i++) {
      seats.push({
        seat_code: `B${i.toString().padStart(2, '0')}`,
        deck: 2,
        row: i - 5,
        column: 3,
        type: 'VIP_CABIN',
        price_vnd: 220000,
        state: i === 6 ? 'BOOKED' : 'AVAILABLE'
      });
    }

    this.tripLayouts.set(tripId, {
      vehicle_type: 'DOUBLE_DECK_VIP_CABIN',
      total_decks: 2,
      total_seats: 22,
      aisle_column: 2,
      seats
    });
  }

  /**
   * PAX-009: Get Seat Map with real-time hold snapshot for segment
   */
  getSeatMap(tripId, pickupStopId, dropoffStopId, mockNow = Date.now()) {
    const layout = this.tripLayouts.get(tripId);
    if (!layout) {
      return { success: false, error: 'Chuyến xe không tồn tại', code: 'TRIP_NOT_FOUND' };
    }

    // Clean expired holds
    this._cleanExpiredHolds(mockNow);

    const evaluatedSeats = layout.seats.map(seat => {
      const holdKey = `${tripId}:${seat.seat_code}`;
      const activeHold = this.seatHolds.get(holdKey);

      let effectiveState = seat.state;
      let heldUntil = null;
      let heldBy = null;

      if (effectiveState === 'AVAILABLE' && activeHold) {
        effectiveState = 'LOCKED_BY_OTHER';
        heldUntil = activeHold.heldUntil;
        heldBy = activeHold.userId;
      }

      return {
        ...seat,
        segment_state: effectiveState,
        locked_until: heldUntil ? new Date(heldUntil).toISOString() : null,
        locked_by_user: heldBy
      };
    });

    return {
      success: true,
      data: {
        trip_id: tripId,
        pickup_stop_id: pickupStopId,
        dropoff_stop_id: dropoffStopId,
        total_decks: layout.total_decks,
        total_seats: layout.total_seats,
        seats: evaluatedSeats
      }
    };
  }

  /**
   * PAX-010: Acquire Distributed 10-Minute Seat Hold (Redis Lock emulation)
   */
  holdSeats(tripId, seatCodes = [], userId = 'guest_user', mockNow = Date.now()) {
    if (!Array.isArray(seatCodes) || seatCodes.length === 0) {
      return { success: false, error: 'Vui lòng chọn ít nhất 1 ghế', code: 'NO_SEAT_SELECTED' };
    }

    if (seatCodes.length > this.maxSeatsPerBooking) {
      return {
        success: false,
        error: `Bạn chỉ được chọn tối đa ${this.maxSeatsPerBooking} ghế trong một lần đặt`,
        code: 'MAX_SEATS_EXCEEDED'
      };
    }

    this._cleanExpiredHolds(mockNow);

    const layout = this.tripLayouts.get(tripId);
    if (!layout) {
      return { success: false, error: 'Chuyến xe không tồn tại', code: 'TRIP_NOT_FOUND' };
    }

    // Atomic pre-check: verify all seats are available
    for (const code of seatCodes) {
      const seat = layout.seats.find(s => s.seat_code === code);
      if (!seat) {
        return { success: false, error: `Ghế ${code} không tồn tại trên xe`, code: 'SEAT_NOT_FOUND' };
      }
      if (seat.state === 'BOOKED') {
        return { success: false, error: `Ghế ${code} đã có khách đặt mua`, code: 'SEAT_ALREADY_BOOKED', conflictingSeat: code };
      }

      const holdKey = `${tripId}:${code}`;
      const activeHold = this.seatHolds.get(holdKey);
      if (activeHold && activeHold.userId !== userId) {
        return {
          success: false,
          error: `Ghế ${code} vừa có khách khác giữ chỗ. Vui lòng chọn ghế khác`,
          code: 'SEAT_LOCKED_BY_OTHER',
          conflictingSeat: code
        };
      }
    }

    // Acquire lock
    const holdId = `hld_${tripId}_${Date.now()}`;
    const heldUntil = mockNow + this.holdDurationSeconds * 1000;

    for (const code of seatCodes) {
      const holdKey = `${tripId}:${code}`;
      this.seatHolds.set(holdKey, {
        holdId,
        userId,
        tripId,
        seatCode: code,
        heldUntil
      });
    }

    const totalFare = seatCodes.length * 220000;

    return {
      success: true,
      data: {
        hold_id: holdId,
        trip_id: tripId,
        user_id: userId,
        seat_codes: seatCodes,
        total_seats: seatCodes.length,
        total_fare_vnd: totalFare,
        hold_duration_seconds: this.holdDurationSeconds,
        expires_at: new Date(heldUntil).toISOString(),
        seconds_remaining: this.holdDurationSeconds
      }
    };
  }

  /**
   * Release seat hold (User back button or cancel)
   */
  releaseSeats(tripId, seatCodes = [], userId = null) {
    let releasedCount = 0;
    for (const code of seatCodes) {
      const holdKey = `${tripId}:${code}`;
      const hold = this.seatHolds.get(holdKey);
      if (hold && (!userId || hold.userId === userId)) {
        this.seatHolds.delete(holdKey);
        releasedCount++;
      }
    }
    return { success: true, released_count: releasedCount };
  }

  _cleanExpiredHolds(mockNow = Date.now()) {
    for (const [key, hold] of this.seatHolds.entries()) {
      if (mockNow >= hold.heldUntil) {
        this.seatHolds.delete(key);
      }
    }
  }
}
