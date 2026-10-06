/**
 * FleetBus Passenger Seat Map & Realtime Hold Engine
 * Implements PAX-008 (Pickup/Dropoff), PAX-009 (2D Seat Map), PAX-010 (10-Min Seat Hold Engine).
 */

// Trips that can be sold: the passenger search trips and the trips on the manager and driver boards.
const SEEDED_TRIPS = ['trp_hn_th_01', 'trp_hn_th_02', 'trp_hn_th_03', 'trp_991823', 'trp_991824'];

export class PassengerSeatMapService {
  constructor() {
    this.seatHolds = new Map(); // key: `${tripId}:${seatCode}` -> { holdId, userId, heldUntil, segmentId }
    this.holdDurationSeconds = 600; // 10 minutes Redis lock standard
    this.maxSeatsPerBooking = 5;

    // Seed mock layout for VIP Cabin 22 Rooms (2 decks, 11 cabins per deck)
    this.tripLayouts = new Map();
    for (const tripId of SEEDED_TRIPS) {
      this._initMockTripLayout(tripId);
    }
    // Seats already on the driver manifest of the shift trip are sold in the inventory too
    for (const code of ['A01', 'A02', 'B01']) {
      this.getSeatInfo('trp_991823', code).state = 'BOOKED';
    }
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

      if (effectiveState === 'AVAILABLE' && activeHold) {
        effectiveState = 'LOCKED_BY_OTHER';
        heldUntil = activeHold.heldUntil;
      }

      // The map never reveals who holds a seat
      return {
        ...seat,
        segment_state: effectiveState,
        locked_until: heldUntil ? new Date(heldUntil).toISOString() : null
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
   * The hold a user currently has on a trip (a user has at most one), or null.
   */
  _currentHold(tripId, userId) {
    const held = [];
    let holdId = null;
    let heldUntil = null;
    for (const hold of this.seatHolds.values()) {
      if (hold.tripId === tripId && hold.userId === userId) {
        held.push(hold.seatCode);
        holdId = hold.holdId;
        heldUntil = hold.heldUntil;
      }
    }
    return held.length ? { holdId, seatCodes: held, heldUntil } : null;
  }

  /**
   * PAX-010: Acquire Distributed 10-Minute Seat Hold (Redis Lock emulation)
   * A user has one active hold per trip (at most 5 seats, BR-SEAT-003). Holding a different set replaces the
   * previous hold; repeating the same set returns the existing hold without extending it.
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

    const current = this._currentHold(tripId, userId);
    const sameSet = current && current.seatCodes.length === seatCodes.length && seatCodes.every(code => current.seatCodes.includes(code));
    const describe = (holdId, heldUntil) => {
      const totalFare = seatCodes.reduce((sum, code) => sum + this.getSeatInfo(tripId, code).price_vnd, 0);
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
          seconds_remaining: Math.max(0, Math.round((heldUntil - mockNow) / 1000))
        }
      };
    };
    if (sameSet) {
      return describe(current.holdId, current.heldUntil);
    }

    // Atomic pre-check: verify all seats are available (the user's own previous hold is about to be replaced)
    for (const code of seatCodes) {
      const seat = layout.seats.find(s => s.seat_code === code);
      if (!seat) {
        return { success: false, error: `Ghế ${code} không tồn tại trên xe`, code: 'SEAT_NOT_FOUND' };
      }
      if (seat.state === 'BOOKED') {
        return { success: false, error: `Ghế ${code} đã có khách đặt mua`, code: 'SEAT_ALREADY_BOOKED', conflictingSeat: code };
      }

      const activeHold = this.seatHolds.get(`${tripId}:${code}`);
      if (activeHold && activeHold.userId !== userId) {
        return {
          success: false,
          error: `Ghế ${code} vừa có khách khác giữ chỗ. Vui lòng chọn ghế khác`,
          code: 'SEAT_LOCKED_BY_OTHER',
          conflictingSeat: code
        };
      }
    }

    if (current) {
      for (const code of current.seatCodes) {
        this.seatHolds.delete(`${tripId}:${code}`);
      }
    }

    // Acquire lock
    const holdId = `hld_${tripId}_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;
    const heldUntil = mockNow + this.holdDurationSeconds * 1000;

    for (const code of seatCodes) {
      this.seatHolds.set(`${tripId}:${code}`, { holdId, userId, tripId, seatCode: code, heldUntil });
    }

    return describe(holdId, heldUntil);
  }

  /**
   * PAX-010: Release the hold the user has on a trip (back button, "choose other seats"). Harmless when none.
   */
  releaseUserHold(tripId, userId, mockNow = Date.now()) {
    this._cleanExpiredHolds(mockNow);
    const current = this._currentHold(tripId, userId);
    if (!current) return { success: true, released_count: 0 };
    return this.releaseSeats(tripId, current.seatCodes, userId);
  }

  /**
   * Can these seats be sold right now (counter, hotline, hail)? Checks the same inventory as online sales.
   * `ownerRef` lets the holder of a lock (a hotline reservation) sell the seats it locked.
   */
  checkSellable(tripId, seatCodes, mockNow = Date.now(), ownerRef = null) {
    const layout = this.tripLayouts.get(tripId);
    if (!layout) {
      return { success: false, error: 'Chuyến xe không có sơ đồ ghế', code: 'TRIP_NOT_FOUND' };
    }
    if (!Array.isArray(seatCodes) || seatCodes.length === 0 || new Set(seatCodes).size !== seatCodes.length) {
      return { success: false, error: 'Vui lòng chọn ít nhất 1 ghế, không trùng nhau', code: 'NO_SEAT_SELECTED' };
    }

    this._cleanExpiredHolds(mockNow);
    for (const code of seatCodes) {
      const seat = layout.seats.find(s => s.seat_code === code);
      if (!seat) {
        return { success: false, error: `Ghế ${code} không tồn tại trên xe`, code: 'SEAT_NOT_FOUND', conflictingSeat: code };
      }
      if (seat.state === 'BOOKED') {
        return { success: false, error: `Ghế ${code} đã bán`, code: 'SEAT_ALREADY_BOOKED', conflictingSeat: code };
      }
      const hold = this.seatHolds.get(`${tripId}:${code}`);
      if (hold && hold.userId !== ownerRef) {
        return { success: false, error: `Ghế ${code} đang được giữ chỗ`, code: 'SEAT_LOCKED_BY_OTHER', conflictingSeat: code };
      }
    }
    return { success: true };
  }

  /**
   * Lock seats for an owner until a deadline (hotline reservation). The lock lapses by itself.
   */
  lockSeats(tripId, seatCodes, ownerRef, untilMs) {
    const holdId = `lck_${ownerRef}`;
    for (const code of seatCodes) {
      this.seatHolds.set(`${tripId}:${code}`, { holdId, userId: ownerRef, tripId, seatCode: code, heldUntil: untilMs });
    }
    return { success: true, hold_id: holdId };
  }

  unlockSeats(tripId, seatCodes, ownerRef) {
    for (const code of seatCodes) {
      const hold = this.seatHolds.get(`${tripId}:${code}`);
      if (hold && hold.userId === ownerRef) this.seatHolds.delete(`${tripId}:${code}`);
    }
  }

  /**
   * Seat attributes (deck, price) from the trip layout, or null when unknown.
   */
  getSeatInfo(tripId, seatCode) {
    const layout = this.tripLayouts.get(tripId);
    return layout?.seats.find(s => s.seat_code === seatCode) || null;
  }

  /**
   * PAX-012: A booking may only use a live hold that belongs to the same user and covers exactly the booked seats.
   * Returns the authoritative seat prices so that the price never comes from the client.
   */
  validateHold(tripId, holdId, userId, seatCodes = [], mockNow = Date.now()) {
    const invalid = (error) => ({ success: false, error, code: 'HOLD_INVALID' });
    this._cleanExpiredHolds(mockNow);

    if (!holdId || !userId || !Array.isArray(seatCodes) || seatCodes.length === 0) {
      return invalid('Cần giữ ghế trước khi đặt vé');
    }
    if (new Set(seatCodes).size !== seatCodes.length) {
      return invalid('Danh sách ghế bị trùng');
    }

    const heldByThisHold = [];
    for (const hold of this.seatHolds.values()) {
      if (hold.holdId === holdId && hold.tripId === tripId) heldByThisHold.push(hold.seatCode);
    }
    const sameSet = heldByThisHold.length === seatCodes.length && seatCodes.every(code => heldByThisHold.includes(code));
    const sameOwner = seatCodes.every(code => this.seatHolds.get(`${tripId}:${code}`)?.userId === userId);
    if (!sameSet || !sameOwner) {
      return invalid('Phiên giữ ghế không hợp lệ hoặc đã hết hạn. Vui lòng chọn ghế lại');
    }

    const seats = seatCodes.map(code => {
      const info = this.getSeatInfo(tripId, code);
      return { seat_code: code, price_vnd: info.price_vnd };
    });
    return { success: true, data: { hold_id: holdId, seats } };
  }

  /**
   * Convert a hold into a payment lock that lasts until the payment window of the order closes.
   */
  extendHold(tripId, holdId, untilMs) {
    for (const hold of this.seatHolds.values()) {
      if (hold.holdId === holdId && hold.tripId === tripId) {
        hold.heldUntil = Math.max(hold.heldUntil, untilMs);
      }
    }
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

  /**
   * Confirm booking: Transition held/available seats to permanently BOOKED.
   */
  confirmBooking(tripId, seatCodes = []) {
    const layout = this.tripLayouts.get(tripId);
    if (!layout) return { success: false, error: 'Chuyến xe không tồn tại', code: 'TRIP_NOT_FOUND' };

    for (const code of seatCodes) {
      const holdKey = `${tripId}:${code}`;
      this.seatHolds.delete(holdKey);

      const seat = layout.seats.find(s => s.seat_code === code);
      if (seat) {
        seat.state = 'BOOKED';
      }
    }

    return { success: true, booked_seats: seatCodes };
  }

  /**
   * Release booking: Transition cancelled seats back to AVAILABLE.
   */
  releaseBooking(tripId, seatCodes = []) {
    const layout = this.tripLayouts.get(tripId);
    if (!layout) return { success: false, error: 'Chuyến xe không tồn tại' };

    for (const code of seatCodes) {
      const holdKey = `${tripId}:${code}`;
      this.seatHolds.delete(holdKey);

      const seat = layout.seats.find(s => s.seat_code === code);
      if (seat) {
        seat.state = 'AVAILABLE';
      }
    }

    return { success: true, released_seats: seatCodes };
  }

  _cleanExpiredHolds(mockNow = Date.now()) {
    for (const [key, hold] of this.seatHolds.entries()) {
      if (mockNow >= hold.heldUntil) {
        this.seatHolds.delete(key);
      }
    }
  }
}

