/**
 * FleetBus Passenger Seat Map & Realtime Hold Engine
 * Implements PAX-008 (Pickup/Dropoff), PAX-009 (2D Seat Map), PAX-010 (10-Min Seat Hold Engine).
 */

// Trips that can be sold: the passenger search trips and the trips on the manager and driver boards.
const SEEDED_TRIPS = ['trp_hn_th_01', 'trp_hn_th_02', 'trp_hn_th_03', 'trp_991823', 'trp_991824'];

export class PassengerSeatMapService {
  constructor() {
    // key: `${tripId}|${seatCode}|${holdId}` -> { holdId, userId, tripId, seatCode, heldUntil, from, to, whole, pickup_stop_id, dropoff_stop_id }.
    // Several holds may sit on one seat when they cover different segments (BR-SEAT-001).
    this.seatHolds = new Map();
    // (tripId) => ordered stops [{ stop_id, pickup_allowed?, dropoff_allowed? }], set by the event bridge
    this.stopsProvider = null;
    this.holdDurationSeconds = 600; // 10 minutes Redis lock standard
    this.maxSeatsPerBooking = 5;

    // Seed mock layout for VIP Cabin 22 Rooms (2 decks, 11 cabins per deck)
    this.tripLayouts = new Map();
    for (const tripId of SEEDED_TRIPS) {
      this._initMockTripLayout(tripId);
    }
    // Seats already on the driver manifest of the shift trip are sold in the inventory too
    for (const code of ['A01', 'A02', 'B01']) {
      this.getSeatInfo('trp_991823', code).bookings.push({ whole: true, pnr: null });
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
        bookings: i === 3 ? [{ whole: true, pnr: null }] : []
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
        bookings: []
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
        bookings: []
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
        bookings: i === 6 ? [{ whole: true, pnr: null }] : []
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


  // ---------------------------------------------------------------------------
  // Segments (BR-SEAT-001, OQ-028): a trip with n stops has n-1 segments, numbered from 0. A booking or a hold
  // covers the segments [from, to) between a pickup stop and a drop-off stop. No stops given means the whole route.
  // ---------------------------------------------------------------------------

  _stops(tripId) {
    const stops = this.stopsProvider ? this.stopsProvider(tripId) : null;
    return Array.isArray(stops) ? stops : [];
  }

  _segmentCount(tripId) {
    return Math.max(1, this._stops(tripId).length - 1);
  }

  /**
   * Turn a pickup and a drop-off stop into a range of segments. Both missing: the whole route.
   * `lenient` (events that were validated earlier) falls back to the whole route instead of failing.
   */
  _resolveSegment(tripId, pickupStopId = null, dropoffStopId = null, { lenient = false } = {}) {
    const stops = this._stops(tripId);
    const count = this._segmentCount(tripId);
    // A trip whose stops are not known cannot be split: every sale covers the whole route
    if ((!pickupStopId && !dropoffStopId) || stops.length === 0) {
      return { success: true, range: { whole: true, from: 0, to: count }, pickup_stop_id: stops[0]?.stop_id || null, dropoff_stop_id: stops[stops.length - 1]?.stop_id || null };
    }
    const fail = (error, code) => (lenient
      ? { success: true, range: { whole: true, from: 0, to: count }, pickup_stop_id: stops[0]?.stop_id || null, dropoff_stop_id: stops[stops.length - 1]?.stop_id || null }
      : { success: false, error, code });

    const fromIndex = pickupStopId ? stops.findIndex(s => s.stop_id === pickupStopId) : 0;
    const toIndex = dropoffStopId ? stops.findIndex(s => s.stop_id === dropoffStopId) : stops.length - 1;
    if (fromIndex < 0 || toIndex < 0) return fail('Điểm đón hoặc điểm trả không thuộc chuyến xe này', 'STOP_NOT_FOUND');
    if (fromIndex >= toIndex) return fail('Điểm đón phải đứng trước điểm trả trên hành trình', 'INVALID_SEGMENT');
    if (pickupStopId && stops[fromIndex].pickup_allowed === false) return fail(`Không đón khách tại ${stops[fromIndex].name || pickupStopId}`, 'STOP_NOT_ALLOWED');
    if (dropoffStopId && stops[toIndex].dropoff_allowed === false) return fail(`Không trả khách tại ${stops[toIndex].name || dropoffStopId}`, 'STOP_NOT_ALLOWED');

    const whole = fromIndex === 0 && toIndex === stops.length - 1;
    return { success: true, range: { whole, from: fromIndex, to: toIndex }, pickup_stop_id: stops[fromIndex].stop_id, dropoff_stop_id: stops[toIndex].stop_id };
  }

  // Segments covered by a stored booking or hold (a whole-route record follows the trip when its stops are known)
  _range(tripId, record) {
    return record.whole ? { from: 0, to: this._segmentCount(tripId) } : { from: record.from, to: record.to };
  }

  _overlaps(a, b) {
    return a.from < b.to && b.from < a.to;
  }

  _holdsOn(tripId, seatCode) {
    const found = [];
    for (const hold of this.seatHolds.values()) {
      if (hold.tripId === tripId && hold.seatCode === seatCode) found.push(hold);
    }
    return found;
  }

  _holdKey(hold) {
    return `${hold.tripId}|${hold.seatCode}|${hold.holdId}`;
  }

  _addHold(tripId, seatCode, { holdId, userId, heldUntil }, resolved) {
    const hold = {
      holdId, userId, tripId, seatCode, heldUntil,
      whole: resolved.range.whole, from: resolved.range.from, to: resolved.range.to,
      pickup_stop_id: resolved.pickup_stop_id, dropoff_stop_id: resolved.dropoff_stop_id
    };
    this.seatHolds.set(this._holdKey(hold), hold);
    return hold;
  }

  /**
   * Why a seat cannot be given to `owner` for a range of segments, or null when it can.
   */
  _conflict(tripId, seat, range, owner = null) {
    if (seat.blocked) return 'SEAT_BLOCKED';
    if (seat.bookings.some(b => this._overlaps(this._range(tripId, b), range))) return 'SEAT_ALREADY_BOOKED';
    const other = this._holdsOn(tripId, seat.seat_code).find(h => h.userId !== owner && this._overlaps(this._range(tripId, h), range));
    return other ? 'SEAT_LOCKED_BY_OTHER' : null;
  }

  _segmentState(tripId, seat, index) {
    const unit = { from: index, to: index + 1 };
    if (seat.blocked) return { state: 'BLOCKED', reason: seat.block_reason };
    const booking = seat.bookings.find(b => this._overlaps(this._range(tripId, b), unit));
    if (booking) return { state: 'BOOKED', pnr: booking.pnr || null };
    const hold = this._holdsOn(tripId, seat.seat_code).find(h => this._overlaps(this._range(tripId, h), unit));
    if (hold) {
      const hotline = String(hold.userId).startsWith('hotline:');
      return {
        state: hotline ? 'HOTLINE_HOLD' : 'HELD',
        held_until: new Date(hold.heldUntil).toISOString(),
        ...(hotline ? { reservation_id: String(hold.userId).slice('hotline:'.length) } : {})
      };
    }
    return { state: 'AVAILABLE' };
  }

  /**
   * PAX-009: Get Seat Map with real-time hold snapshot for the segment between two stops (the whole route by default)
   */
  getSeatMap(tripId, pickupStopId = null, dropoffStopId = null, mockNow = Date.now()) {
    const layout = this.tripLayouts.get(tripId);
    if (!layout) {
      return { success: false, error: 'Chuyến xe không tồn tại', code: 'TRIP_NOT_FOUND' };
    }
    const resolved = this._resolveSegment(tripId, pickupStopId, dropoffStopId);
    if (!resolved.success) return resolved;

    this._cleanExpiredHolds(mockNow);
    const count = this._segmentCount(tripId);

    const evaluatedSeats = layout.seats.map(seat => {
      const { bookings, blocked, block_reason, blocked_by, ...visible } = seat;
      const wholeRoute = Array.from({ length: count }, (_, i) => this._segmentState(tripId, seat, i));
      const state = blocked ? 'BLOCKED' : (wholeRoute.every(x => x.state === 'BOOKED') ? 'BOOKED' : 'AVAILABLE');

      let segmentState = 'AVAILABLE';
      let heldUntil = null;
      const conflict = this._conflict(tripId, seat, resolved.range, '\u0000nobody');
      if (conflict === 'SEAT_BLOCKED') segmentState = 'BLOCKED';
      else if (conflict === 'SEAT_ALREADY_BOOKED') segmentState = 'BOOKED';
      else if (conflict === 'SEAT_LOCKED_BY_OTHER') {
        segmentState = 'LOCKED_BY_OTHER';
        const hold = this._holdsOn(tripId, seat.seat_code).find(h => this._overlaps(this._range(tripId, h), resolved.range));
        heldUntil = hold.heldUntil;
      }

      // The map never reveals who holds or bought a seat (no PNR, no staff id)
      return {
        ...visible,
        state,
        segment_state: segmentState,
        locked_until: heldUntil ? new Date(heldUntil).toISOString() : null
      };
    });

    return {
      success: true,
      data: {
        trip_id: tripId,
        pickup_stop_id: resolved.pickup_stop_id,
        dropoff_stop_id: resolved.dropoff_stop_id,
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
    let first = null;
    for (const hold of this.seatHolds.values()) {
      if (hold.tripId === tripId && hold.userId === userId) {
        held.push(hold.seatCode);
        first = first || hold;
      }
    }
    return held.length ? { holdId: first.holdId, seatCodes: held, heldUntil: first.heldUntil, whole: first.whole, from: first.from, to: first.to, pickup_stop_id: first.pickup_stop_id, dropoff_stop_id: first.dropoff_stop_id } : null;
  }

  /**
   * PAX-010: Acquire Distributed 10-Minute Seat Hold (Redis Lock emulation)
   * A user has one active hold per trip (at most 5 seats, BR-SEAT-003). Holding a different set or segment replaces the
   * previous hold; repeating the same set returns the existing hold without extending it. The segment is
   * given by `pickupStopId` and `dropoffStopId`; none means the whole route.
   */
  holdSeats(tripId, seatCodes = [], userId = 'guest_user', mockNow = Date.now(), segment = {}) {
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
    const resolved = this._resolveSegment(tripId, segment?.pickupStopId, segment?.dropoffStopId);
    if (!resolved.success) return resolved;

    const current = this._currentHold(tripId, userId);
    const sameSegment = current && (current.whole ? resolved.range.whole : (!resolved.range.whole && current.from === resolved.range.from && current.to === resolved.range.to));
    const sameSet = current && sameSegment && current.seatCodes.length === seatCodes.length && seatCodes.every(code => current.seatCodes.includes(code));
    const describe = (holdId, heldUntil) => {
      const totalFare = seatCodes.reduce((sum, code) => sum + this.getSeatInfo(tripId, code).price_vnd, 0);
      return {
        success: true,
        data: {
          hold_id: holdId,
          trip_id: tripId,
          user_id: userId,
          seat_codes: seatCodes,
          pickup_stop_id: resolved.pickup_stop_id,
          dropoff_stop_id: resolved.dropoff_stop_id,
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

    // Atomic pre-check: verify all seats are free for the segment (the user's own previous hold is about to be replaced)
    const messages = {
      SEAT_ALREADY_BOOKED: (code) => `Ghế ${code} đã có khách đặt mua`,
      SEAT_BLOCKED: (code) => `Ghế ${code} tạm khóa`,
      SEAT_LOCKED_BY_OTHER: (code) => `Ghế ${code} vừa có khách khác giữ chỗ. Vui lòng chọn ghế khác`
    };
    for (const code of seatCodes) {
      const seat = layout.seats.find(s => s.seat_code === code);
      if (!seat) {
        return { success: false, error: `Ghế ${code} không tồn tại trên xe`, code: 'SEAT_NOT_FOUND' };
      }
      const conflict = this._conflict(tripId, seat, resolved.range, userId);
      if (conflict) {
        return { success: false, error: messages[conflict](code), code: conflict, conflictingSeat: code };
      }
    }

    if (current) {
      for (const code of current.seatCodes) {
        this.seatHolds.delete(`${tripId}|${code}|${current.holdId}`);
      }
    }

    // Acquire lock
    const holdId = `hld_${tripId}_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;
    const heldUntil = mockNow + this.holdDurationSeconds * 1000;

    for (const code of seatCodes) {
      this._addHold(tripId, code, { holdId, userId, heldUntil }, resolved);
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
   * Can these seats be sold right now (counter, hotline, hail)? Checks the same inventory as online sales,
   * for the segment between two stops (the whole route by default).
   * `ownerRef` lets the holder of a lock (a hotline reservation) sell the seats it locked.
   */
  checkSellable(tripId, seatCodes, mockNow = Date.now(), ownerRef = null, segment = {}) {
    const layout = this.tripLayouts.get(tripId);
    if (!layout) {
      return { success: false, error: 'Chuyến xe không có sơ đồ ghế', code: 'TRIP_NOT_FOUND' };
    }
    if (!Array.isArray(seatCodes) || seatCodes.length === 0 || new Set(seatCodes).size !== seatCodes.length) {
      return { success: false, error: 'Vui lòng chọn ít nhất 1 ghế, không trùng nhau', code: 'NO_SEAT_SELECTED' };
    }
    const resolved = this._resolveSegment(tripId, segment?.pickupStopId, segment?.dropoffStopId);
    if (!resolved.success) return resolved;

    this._cleanExpiredHolds(mockNow);
    const messages = {
      SEAT_ALREADY_BOOKED: (code) => `Ghế ${code} đã bán`,
      SEAT_BLOCKED: (code) => `Ghế ${code} tạm khóa`,
      SEAT_LOCKED_BY_OTHER: (code) => `Ghế ${code} đang được giữ chỗ`
    };
    for (const code of seatCodes) {
      const seat = layout.seats.find(s => s.seat_code === code);
      if (!seat) {
        return { success: false, error: `Ghế ${code} không tồn tại trên xe`, code: 'SEAT_NOT_FOUND', conflictingSeat: code };
      }
      const conflict = this._conflict(tripId, seat, resolved.range, ownerRef);
      if (conflict) {
        return { success: false, error: messages[conflict](code), code: conflict, conflictingSeat: code };
      }
    }
    return { success: true, data: { pickup_stop_id: resolved.pickup_stop_id, dropoff_stop_id: resolved.dropoff_stop_id } };
  }

  /**
   * Lock seats for an owner until a deadline (hotline reservation). The lock lapses by itself.
   */
  lockSeats(tripId, seatCodes, ownerRef, untilMs, segment = {}) {
    const holdId = `lck_${ownerRef}`;
    const resolved = this._resolveSegment(tripId, segment?.pickupStopId, segment?.dropoffStopId, { lenient: true });
    for (const code of seatCodes) {
      this._addHold(tripId, code, { holdId, userId: ownerRef, heldUntil: untilMs }, resolved);
    }
    return { success: true, hold_id: holdId };
  }

  unlockSeats(tripId, seatCodes, ownerRef) {
    for (const code of seatCodes) {
      for (const hold of this._holdsOn(tripId, code)) {
        if (hold.userId === ownerRef) this.seatHolds.delete(this._holdKey(hold));
      }
    }
  }

  /**
   * MGR-013: every seat of the trip with its state for the dispatcher, and the state of each segment.
   * Seat states: AVAILABLE, HELD (a passenger is paying), HOTLINE_HOLD, BOOKED (every segment sold, with the PNR),
   * PARTIALLY_BOOKED (some segments sold) and BLOCKED (with the reason).
   */
  getSeatMatrix(tripId, mockNow = Date.now()) {
    const layout = this.tripLayouts.get(tripId);
    if (!layout) return { success: false, error: 'Chuyến xe không tồn tại', code: 'TRIP_NOT_FOUND' };
    this._cleanExpiredHolds(mockNow);

    const stops = this._stops(tripId);
    const count = this._segmentCount(tripId);
    const seats = layout.seats.map(seat => {
      const segments = Array.from({ length: count }, (_, i) => ({
        segment_index: i,
        from_stop_id: stops[i]?.stop_id || null,
        to_stop_id: stops[i + 1]?.stop_id || null,
        ...this._segmentState(tripId, seat, i)
      }));
      const row = { seat_code: seat.seat_code, deck: seat.deck, row: seat.row, column: seat.column, price_vnd: seat.price_vnd, state: 'AVAILABLE', segments };
      const has = (state) => segments.some(x => x.state === state);
      if (seat.blocked) {
        row.state = 'BLOCKED';
        row.reason = seat.block_reason;
        row.blocked_by = seat.blocked_by;
      } else if (segments.every(x => x.state === 'BOOKED')) {
        row.state = 'BOOKED';
      } else if (has('BOOKED')) {
        row.state = 'PARTIALLY_BOOKED';
      } else if (has('HOTLINE_HOLD')) {
        row.state = 'HOTLINE_HOLD';
      } else if (has('HELD')) {
        row.state = 'HELD';
      }
      if (row.state === 'BOOKED' || row.state === 'PARTIALLY_BOOKED') {
        row.pnr = seat.bookings[0]?.pnr || null;
      }
      const hold = segments.find(x => x.held_until);
      if (hold && ['HELD', 'HOTLINE_HOLD'].includes(row.state)) {
        row.held_until = hold.held_until;
        if (hold.reservation_id) row.reservation_id = hold.reservation_id;
      }
      return row;
    });

    const countState = (state) => seats.filter(s => s.state === state).length;
    return {
      success: true,
      data: {
        trip_id: tripId,
        total_seats: layout.total_seats,
        stops: stops.map(s => s.stop_id),
        summary: {
          available: countState('AVAILABLE'),
          held: countState('HELD'),
          hotline_hold: countState('HOTLINE_HOLD'),
          booked: countState('BOOKED'),
          partially_booked: countState('PARTIALLY_BOOKED'),
          blocked: countState('BLOCKED')
        },
        seats
      }
    };
  }

  /**
   * MGR-013 / BR-INVENTORY-001: block seats for a technical reason, or open them again. Atomic: nothing changes
   * unless every seat can change. A sold or held seat (on any segment) cannot be blocked.
   */
  setSeatBlock(tripId, seatCodes, locked, { reason = '', staffId = null, mockNow = Date.now() } = {}) {
    const layout = this.tripLayouts.get(tripId);
    if (!layout) return { success: false, error: 'Chuyến xe không tồn tại', code: 'TRIP_NOT_FOUND' };
    if (!Array.isArray(seatCodes) || seatCodes.length === 0 || new Set(seatCodes).size !== seatCodes.length) {
      return { success: false, error: 'Vui lòng chọn ít nhất 1 ghế, không trùng nhau', code: 'NO_SEAT_SELECTED' };
    }
    if (locked && !String(reason).trim()) {
      return { success: false, error: 'Cần ghi lý do khi khóa ghế', code: 'REASON_REQUIRED' };
    }

    this._cleanExpiredHolds(mockNow);
    const targets = [];
    for (const code of seatCodes) {
      const seat = layout.seats.find(s => s.seat_code === code);
      if (!seat) return { success: false, error: `Ghế ${code} không tồn tại trên xe`, code: 'SEAT_NOT_FOUND', conflictingSeat: code };
      if (locked) {
        if (seat.bookings.length > 0) return { success: false, error: `Ghế ${code} đã bán, không thể khóa`, code: 'SEAT_ALREADY_BOOKED', conflictingSeat: code };
        if (seat.blocked) return { success: false, error: `Ghế ${code} đã bị khóa`, code: 'SEAT_ALREADY_BLOCKED', conflictingSeat: code };
        if (this._holdsOn(tripId, code).length > 0) return { success: false, error: `Ghế ${code} đang được giữ chỗ`, code: 'SEAT_LOCKED_BY_OTHER', conflictingSeat: code };
      } else if (!seat.blocked) {
        return { success: false, error: `Ghế ${code} không bị khóa kỹ thuật`, code: 'SEAT_NOT_BLOCKED', conflictingSeat: code };
      }
      targets.push(seat);
    }

    for (const seat of targets) {
      if (locked) {
        seat.blocked = true;
        seat.block_reason = String(reason).trim();
        seat.blocked_by = staffId;
      } else {
        delete seat.blocked;
        delete seat.block_reason;
        delete seat.blocked_by;
      }
    }
    return { success: true, data: { trip_id: tripId, seat_codes: seatCodes, locked: Boolean(locked), reason: locked ? String(reason).trim() : null } };
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
   * Returns the authoritative seat prices so that the price never comes from the client, and the segment of the hold.
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

    const mine = [];
    for (const hold of this.seatHolds.values()) {
      if (hold.holdId === holdId && hold.tripId === tripId) mine.push(hold);
    }
    const heldCodes = mine.map(h => h.seatCode);
    const sameSet = heldCodes.length === seatCodes.length && seatCodes.every(code => heldCodes.includes(code));
    const sameOwner = mine.every(h => h.userId === userId);
    if (!sameSet || !sameOwner) {
      return invalid('Phiên giữ ghế không hợp lệ hoặc đã hết hạn. Vui lòng chọn ghế lại');
    }

    const seats = seatCodes.map(code => {
      const info = this.getSeatInfo(tripId, code);
      return { seat_code: code, price_vnd: info.price_vnd };
    });
    return { success: true, data: { hold_id: holdId, seats, pickup_stop_id: mine[0].pickup_stop_id, dropoff_stop_id: mine[0].dropoff_stop_id } };
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
      for (const hold of this._holdsOn(tripId, code)) {
        if (!userId || hold.userId === userId) {
          this.seatHolds.delete(this._holdKey(hold));
          releasedCount++;
        }
      }
    }
    return { success: true, released_count: releasedCount };
  }

  /**
   * Confirm booking: the seats are sold for the segment (the whole route by default) and the holds on it end.
   */
  confirmBooking(tripId, seatCodes = [], pnr = null, segment = {}) {
    const layout = this.tripLayouts.get(tripId);
    if (!layout) return { success: false, error: 'Chuyến xe không tồn tại', code: 'TRIP_NOT_FOUND' };

    const resolved = this._resolveSegment(tripId, segment?.pickupStopId, segment?.dropoffStopId, { lenient: true });
    for (const code of seatCodes) {
      for (const hold of this._holdsOn(tripId, code)) {
        if (this._overlaps(this._range(tripId, hold), resolved.range)) this.seatHolds.delete(this._holdKey(hold));
      }

      const seat = layout.seats.find(s => s.seat_code === code);
      if (seat && !seat.bookings.some(b => b.pnr === pnr && pnr !== null && b.from === resolved.range.from && b.to === resolved.range.to)) {
        seat.bookings.push({ whole: resolved.range.whole, from: resolved.range.from, to: resolved.range.to, pnr, pickup_stop_id: resolved.pickup_stop_id, dropoff_stop_id: resolved.dropoff_stop_id });
      }
    }

    return { success: true, booked_seats: seatCodes };
  }

  /**
   * Release booking (cancellation, no-show). With a `pnr` only that booking is released, otherwise every booking of
   * the seat. With `fromStopId` only the segments from that stop on are released: the part already driven stays sold.
   */
  releaseBooking(tripId, seatCodes = [], { pnr = null, fromStopId = null } = {}) {
    const layout = this.tripLayouts.get(tripId);
    if (!layout) return { success: false, error: 'Chuyến xe không tồn tại' };
    const cut = fromStopId ? this._stops(tripId).findIndex(s => s.stop_id === fromStopId) : -1;

    for (const code of seatCodes) {
      const seat = layout.seats.find(s => s.seat_code === code);
      if (!seat) continue;
      seat.bookings = seat.bookings.flatMap(b => {
        if (pnr !== null && b.pnr !== pnr) return [b];
        if (cut < 0) return [];
        const range = this._range(tripId, b);
        if (cut <= range.from) return [];
        if (cut >= range.to) return [b];
        return [{ ...b, whole: false, from: range.from, to: cut, dropoff_stop_id: this._stops(tripId)[cut]?.stop_id }];
      });
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
