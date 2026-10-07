/**
 * FleetBus Manager Operations Control Center Service
 * Implements MGR-001 through MGR-030 for Fleet Managers, Dispatchers, and Controllers.
 */

import { validateVietnamPhone } from '../../passenger/core/formatters.js';
import { signToken, TOKEN_PREFIXES } from '../../../core/tokens.js';
import { hashSecret, verifySecret, LoginGuard } from '../../../core/passwords.js';
import { verifyTotp } from '../../../core/totp.js';
import { getStaffTotpSecret } from '../../../config.js';

const POS_PAYMENT_METHODS = ['CASH_POS', 'CARD_POS', 'BANK_TRANSFER'];
// BR-MGR-AUTH-001: these roles need a TOTP code on every login (ROLE_OPS_ADMIN and ROLE_FINANCE of the spec)
const TOTP_ROLES = ['FLEET_DIRECTOR', 'FINANCIAL_CONTROLLER'];
const HOLD_POLICIES = ['UNTIL_DEPARTURE_OFFSET', 'CUSTOM_EXPIRY_MINUTES'];
// BR-POS-006: one phone number holds at most this many seats at once across all trips
const HOTLINE_MAX_SEATS_PER_PHONE = 4;
// BR-TRACK-002: a vehicle that has been silent for longer than this is STALE, then OFFLINE
const GPS_STALE_AFTER_MS = 60 * 1000;
const GPS_OFFLINE_AFTER_MS = 180 * 1000;

export const MOCK_MANAGERS_DB = [
  {
    user_id: 'mgr_01',
    username: 'admin@busgo.vn',
    password_hash: hashSecret('admin123'),
    full_name: 'Nguyễn Tiến Dũng',
    role: 'FLEET_DIRECTOR', // FLEET_DIRECTOR | DISPATCHER | CASHIER | FINANCIAL_CONTROLLER
    permissions: ['ALL']
  },
  {
    user_id: 'mgr_02',
    username: 'dispatcher@busgo.vn',
    password_hash: hashSecret('disp123'),
    full_name: 'Phạm Hồng Quân',
    role: 'DISPATCHER',
    permissions: ['DISPATCH_MANAGE', 'TRIP_EDIT', 'INCIDENT_BROADCAST', 'RADAR_VIEW']
  },
  {
    user_id: 'mgr_03',
    username: 'cashier@busgo.vn',
    password_hash: hashSecret('cash123'),
    full_name: 'Đỗ Thu Hà',
    role: 'CASHIER',
    permissions: ['POS_ISSUE', 'BOOKING_SEARCH']
  }
];

export class ManagerOperationsService {
  constructor() {
    this.loginGuard = new LoginGuard();
    this.vehicles = [
      { vehicle_id: 'veh_01', plate_number: '29B-123.45', model: 'Limousine 34 Phòng VIP', total_seats: 34, status: 'ASSIGNED', driver_name: 'Trần Văn Bình', lat: 20.9812, lng: 105.8430, speed_kmh: 62, heading: 180, gps_status: 'LIVE', gps_health: 'LIVE' },
      { vehicle_id: 'veh_02', plate_number: '29B-444.11', model: 'Cabin Cung Điện VIP 22', total_seats: 22, status: 'IN_TRANSIT', driver_name: 'Lê Văn Toàn', lat: 20.4500, lng: 105.9200, speed_kmh: 55, heading: 175, gps_status: 'STALE', gps_health: 'STALE' },
      { vehicle_id: 'veh_04', plate_number: '29B-882.19', model: 'Cabin Cung Điện VIP 22', total_seats: 22, status: 'ASSIGNED', driver_name: 'Trần Văn Bình', lat: 20.9806, lng: 105.8413, speed_kmh: 0, heading: 0, gps_status: 'LIVE', gps_health: 'LIVE' },
      { vehicle_id: 'veh_03', plate_number: '29B-888.22', model: 'Sleeper 34 Giường Nằm', total_seats: 34, status: 'STANDBY', driver_name: 'Hoàng Anh Tuấn', lat: 20.9800, lng: 105.8400, speed_kmh: 0, heading: 0, gps_status: 'LIVE', gps_health: 'LIVE' }
    ];

    this.drivers = [
      // Same people, ids and licences as the driver app (DRI-001), so a driver named here can sign in and see the trip
      { driver_id: 'drv_8821a', staff_id: 'TX8821', full_name: 'Trần Văn Bình', phone: '0912348821', license_class: 'FC', license_expiry: '2028-12-31', safety_score: 98.5, status: 'ON_DUTY' },
      { driver_id: 'drv_9912b', staff_id: 'TX9912', full_name: 'Phạm Quốc Huy', phone: '0988776655', license_class: 'FC', license_expiry: '2028-06-30', safety_score: 96.0, status: 'ON_DUTY' },
      { driver_id: 'drv_9902b', staff_id: 'TX9902', full_name: 'Lê Hoàng Nam', phone: '0987654321', license_class: 'FC', license_expiry: '2025-01-01', safety_score: 91.0, status: 'LICENSE_EXPIRED' }
    ];

    this.routes = [
      { route_id: 'rt_hn_th', name: 'Hà Nội — Thanh Hóa (Cao tốc)', distance_km: 160, base_fare_vnd: 220000, stops_count: 4 },
      { route_id: 'rt_hn_hp', name: 'Hà Nội — Hải Phòng (5B)', distance_km: 120, base_fare_vnd: 180000, stops_count: 3 },
      { route_id: 'rt_hn_nb', name: 'Hà Nội — Ninh Bình (Cao tốc)', distance_km: 95, base_fare_vnd: 150000, stops_count: 3 }
    ];

    this.trips = [
      { trip_id: 'trp_991823', driver_id: 'drv_8821a', route_id: 'rt_hn_th', vehicle_id: 'veh_01', vehicle_plate: '29B-123.45', departure_time: '2026-08-28T14:00:00+07:00', status: 'DISPATCHED', booked_seats: 28, total_seats: 34, delay_minutes: 0 },
      { trip_id: 'trp_991824', driver_id: 'drv_8821a', route_id: 'rt_hn_hp', vehicle_id: 'veh_02', vehicle_plate: '29B-444.11', departure_time: '2026-08-28T15:30:00+07:00', status: 'SCHEDULED', booked_seats: 20, total_seats: 22, delay_minutes: 35 },
      { trip_id: 'trp_hn_th_01', driver_id: 'drv_8821a', route_id: 'rt_hn_th', vehicle_id: 'veh_04', vehicle_plate: '29B-882.19', departure_time: '2026-08-28T07:00:00+07:00', status: 'READY', booked_seats: 2, total_seats: 22, delay_minutes: 0 }
    ];

    this.bookings = [
      { pnr: 'BG-88219', trip_id: 'trp_991823', passenger_name: 'Trần Văn Hùng', phone: '0981112233', seat_codes: ['A01', 'A02'], total_fare_vnd: 440000, payment_status: 'PAID', channel: 'PASSENGER_APP', issued_at: '2026-08-27T09:00:00+07:00' },
      { pnr: 'BG-99412', trip_id: 'trp_991823', passenger_name: 'Nguyễn Thị Hoa', phone: '0912334455', seat_codes: ['B01'], total_fare_vnd: 220000, payment_status: 'PAID', channel: 'POS_HOTLINE', issued_at: '2026-08-27T10:30:00+07:00' }
    ];

    this.alerts = [
      { alert_id: 'alt_01', vehicle_plate: '29B-444.11', type: 'DELAY_WARNING', severity: 'AMBER', message: 'Chuyến trp_991824 dự kiến trễ +35 phút do kẹt xe đầu cao tốc 5B', created_at: '2026-08-28T13:00:00Z' },
      { alert_id: 'alt_02', vehicle_plate: '29B-123.45', type: 'GPS_LIVE', severity: 'GREEN', message: 'Xe đang vận hành ổn định trên cao tốc Pháp Vân - Cầu Giẽ', created_at: '2026-08-28T13:02:00Z' }
    ];

    this.hotlineReservations = [];
    this.refundRequests = [];
    this.auditLog = [];
  }

  /**
   * MGR-028: Append-only record of who did what, to what, from where, with the values before and after.
   * Entries are frozen and never edited; secrets are never written to it.
   */
  recordAudit({ actor = 'anonymous', role = null, action, resource = null, ip = null, before = null, after = null, now = Date.now() }) {
    const entry = Object.freeze({
      audit_id: `aud_${now}_${this.auditLog.length + 1}`,
      at: new Date(now).toISOString(),
      actor,
      role,
      action,
      resource,
      ip,
      before,
      after
    });
    this.auditLog.push(entry);
    return entry;
  }

  /**
   * MGR-001: Manager Authentication & RBAC Session
   */
  authenticateManager(username, password, totp = null, mockNow = Date.now()) {
    const key = (username || '').trim().toLowerCase();

    const lockedFor = this.loginGuard.isLocked(key, mockNow);
    if (lockedFor > 0) {
      return {
        success: false,
        error: `Tài khoản tạm khóa do nhập sai nhiều lần. Thử lại sau ${Math.ceil(lockedFor / 60)} phút`,
        code: 'ACCOUNT_LOCKED',
        retry_after_seconds: lockedFor
      };
    }

    const user = MOCK_MANAGERS_DB.find(u => u.username === key);
    if (!user || !verifySecret(String(password ?? ''), user.password_hash)) {
      this.loginGuard.fail(key, mockNow);
      return { success: false, error: 'Tên đăng nhập hoặc mật khẩu không chính xác', code: 'INVALID_CREDENTIALS' };
    }

    // Second factor: asked only after the password is right, so it never tells whether a password is valid.
    if (TOTP_ROLES.includes(user.role)) {
      if (totp === null || totp === undefined || totp === '') {
        return { success: false, error: 'Cần mã xác thực 2 bước (6 số) từ ứng dụng Authenticator', code: 'TOTP_REQUIRED' };
      }
      const secret = getStaffTotpSecret(user.user_id);
      if (!secret) {
        return { success: false, error: 'Tài khoản chưa được cấp khóa xác thực 2 bước. Liên hệ quản trị hệ thống', code: 'TOTP_NOT_CONFIGURED' };
      }
      const check = verifyTotp(secret, totp, { now: mockNow, window: 1, lastUsedStep: user.totp_last_step ?? -1 });
      if (!check.valid) {
        this.loginGuard.fail(key, mockNow);
        return {
          success: false,
          error: check.reason === 'REPLAYED' ? 'Mã xác thực này đã được dùng. Đợi mã mới' : 'Mã xác thực 2 bước không đúng',
          code: 'INVALID_TOTP'
        };
      }
      user.totp_last_step = check.step;
    }
    this.loginGuard.succeed(key);

    const token = signToken(
      { sub: user.user_id, role: user.role, permissions: user.permissions, kind: 'staff' },
      { prefix: TOKEN_PREFIXES.staff, ttlSeconds: 8 * 3600, now: mockNow }
    );

    return {
      success: true,
      data: {
        user: {
          user_id: user.user_id,
          username: user.username,
          full_name: user.full_name,
          role: user.role,
          permissions: user.permissions
        },
        token
      }
    };
  }

  authenticateStaff(username, password, totp = null) {
    return this.authenticateManager(username, password, totp);
  }

  /**
   * MGR-002: Operations Dashboard Executive KPIs
   */
  /**
   * Money figures over a set of bookings: gross fares, refunds paid back, and what is left.
   */
  _moneyFigures(bookings) {
    const gross = bookings.reduce((sum, b) => sum + b.total_fare_vnd, 0);
    const refunded = bookings.reduce((sum, b) => sum + (b.refund_amount_vnd || 0), 0);
    return { gross_revenue_vnd: gross, refunded_vnd: refunded, net_revenue_vnd: gross - refunded };
  }

  getDashboardKPIs() {
    this.releaseExpiredHotlineHolds();
    const round1 = (n) => parseFloat(n.toFixed(1));
    const totalVehicles = this.vehicles.length;
    const activeVehicles = this.vehicles.filter(v => v.status === 'IN_TRANSIT').length;
    const totalBookedSeats = this.trips.reduce((acc, t) => acc + t.booked_seats, 0);
    const totalCapacity = this.trips.reduce((acc, t) => acc + t.total_seats, 0);

    // A trip leaves on time when its delay is at most 15 minutes (MGR-002)
    const onTimeTrips = this.trips.filter(t => (t.delay_minutes || 0) <= 15).length;
    const moving = this.vehicles.filter(v => v.status === 'IN_TRANSIT' && v.speed_kmh > 0);

    const corridors = this.routes
      .map(route => {
        const routeTrips = this.trips.filter(t => t.route_id === route.route_id);
        const booked = routeTrips.reduce((acc, t) => acc + t.booked_seats, 0);
        const capacity = routeTrips.reduce((acc, t) => acc + t.total_seats, 0);
        return {
          corridor: route.name,
          load_factor_pct: capacity > 0 ? round1((booked / capacity) * 100) : 0,
          active_trips: routeTrips.filter(t => t.status === 'IN_TRANSIT').length,
          trips: routeTrips.length
        };
      })
      .filter(c => c.trips > 0)
      .map(({ trips, ...corridor }) => corridor);

    return {
      success: true,
      data: {
        timestamp: new Date().toISOString(),
        kpi_metrics: {
          active_vehicles_count: activeVehicles,
          total_fleet_count: totalVehicles,
          overall_load_factor_pct: totalCapacity > 0 ? round1((totalBookedSeats / totalCapacity) * 100) : 0,
          ...this._moneyFigures(this.bookings),
          on_time_departure_rate_pct: this.trips.length > 0 ? round1((onTimeTrips / this.trips.length) * 100) : 100,
          active_alerts_count: this.alerts.length,
          fleet_average_speed_kmh: moving.length > 0 ? round1(moving.reduce((acc, v) => acc + v.speed_kmh, 0) / moving.length) : 0
        },
        corridors,
        recent_alerts: this.alerts
      }
    };
  }

  getOperationsDashboardKPIs() {
    return this.getDashboardKPIs();
  }

  /**
   * MGR-003: Live Fleet Radar Map Telemetry
   */
  getLiveFleetRadar(mockNow = Date.now()) {
    return {
      success: true,
      data: {
        tracked_at: new Date(mockNow).toISOString(),
        total_tracked_vehicles: this.vehicles.length,
        vehicles: this.vehicles.map(v => {
          const health = this._gpsHealth(v, mockNow);
          return {
            vehicle_id: v.vehicle_id,
            plate_number: v.plate_number,
            model: v.model,
            status: v.status,
            driver_name: v.driver_name,
            lat: v.lat,
            lng: v.lng,
            speed_kmh: v.speed_kmh,
            heading: v.heading,
            gps_status: health,
            gps_health: health,
            last_ping_at: v.last_ping_at ? new Date(v.last_ping_at).toISOString() : null
          };
        })
      }
    };
  }

  /**
   * GPS health of a vehicle (BR-TRACK-002). A vehicle that pinged is judged by the age of its last ping;
   * a vehicle that never pinged keeps the health it was registered with.
   */
  _gpsHealth(vehicle, mockNow = Date.now()) {
    if (!vehicle.last_ping_at) return vehicle.gps_health || vehicle.gps_status || 'LIVE';
    const age = mockNow - vehicle.last_ping_at;
    if (age > GPS_OFFLINE_AFTER_MS) return 'OFFLINE';
    if (age > GPS_STALE_AFTER_MS) return 'STALE';
    return 'LIVE';
  }

  /**
   * MGR-005: Fleet Roster & Vehicles
   */
  getFleetRoster() {
    return {
      success: true,
      data: this.vehicles
    };
  }

  getFleet() {
    return this.getFleetRoster();
  }

  getFleetVehicles() {
    return this.getFleetRoster();
  }

  addVehicle({ plate_number, model = 'Thaco Mobihome VIP', total_seats = 34 }) {
    const newVehicle = {
      vehicle_id: `veh_${Date.now()}`,
      plate_number,
      model,
      total_seats,
      status: 'STANDBY',
      driver_name: 'Chưa gán',
      lat: 20.9812,
      lng: 105.8430,
      speed_kmh: 0,
      heading: 0,
      gps_status: 'LIVE',
      gps_health: 'LIVE'
    };
    this.vehicles.push(newVehicle);
    return { success: true, data: newVehicle };
  }

  /**
   * MGR-008: Crew Directory
   */
  getCrewDrivers() {
    return {
      success: true,
      data: this.drivers
    };
  }

  getCrew() {
    return this.getCrewDrivers();
  }

  addDriver({ staff_id, full_name, phone, license_class = 'FC' }) {
    const newDriver = {
      driver_id: `drv_${Date.now()}`,
      staff_id,
      full_name,
      phone,
      license_class,
      license_expiry: '2028-12-31',
      safety_score: 98.0,
      status: 'ON_DUTY'
    };
    this.drivers.push(newDriver);
    return { success: true, data: newDriver };
  }

  /**
   * MGR-011: Routes
   */
  getRoutes() {
    return {
      success: true,
      data: this.routes
    };
  }

  addRoute({ name, distance_km, base_fare_vnd, stops_count = 4 }) {
    const newRoute = {
      route_id: `rt_${Date.now()}`,
      name,
      distance_km,
      base_fare_vnd,
      stops_count
    };
    this.routes.push(newRoute);
    return { success: true, data: newRoute };
  }

  /**
   * MGR-014: Dispatch Board Timeline
   */
  getDispatchBoard(shiftDate = new Date().toISOString().split('T')[0]) {
    this.releaseExpiredHotlineHolds();
    return {
      success: true,
      data: {
        shift_date: shiftDate,
        total_trips: this.trips.length,
        trips: this.trips.map(t => {
          const route = this.routes.find(r => r.route_id === t.route_id);
          const vehicle = this.vehicles.find(v => v.vehicle_id === t.vehicle_id);
          return {
            ...t,
            route_name: route ? route.name : t.route_id,
            driver_name: vehicle ? vehicle.driver_name : 'Chưa gán',
            load_factor_pct: parseFloat(((t.booked_seats / t.total_seats) * 100).toFixed(1))
          };
        })
      }
    };
  }

  findTrip(tripId) {
    return this.trips.find(t => t.trip_id === tripId);
  }

  /**
   * The seat inventory shared with online sales (bound by the event bridge), or null when running stand-alone.
   */
  _inventory() {
    return this.eventBridge?.services?.seatMapService || null;
  }

  /**
   * MGR-013: seat inventory of a trip, seat by seat. The legacy counters stay for the dashboard.
   */
  getSeatMatrix(tripId, mockNow = Date.now()) {
    this.releaseExpiredHotlineHolds(mockNow);
    const trip = this.findTrip(tripId);
    if (!trip) return { success: false, error: 'Không tìm thấy chuyến xe', code: 'TRIP_NOT_FOUND' };

    const matrix = this._inventory()?.getSeatMatrix(tripId, mockNow);
    const seats = matrix?.success ? matrix.data.seats : [];
    return {
      success: true,
      data: {
        trip_id: tripId,
        total_seats: trip.total_seats,
        booked_seats: trip.booked_seats,
        vacant_seats: trip.total_seats - trip.booked_seats,
        hotline_holds: this.hotlineReservations.filter(r => r.trip_id === tripId && r.hold_status === 'HELD_HOTLINE'),
        summary: matrix?.success ? matrix.data.summary : null,
        seats
      }
    };
  }

  /**
   * MGR-013 / BR-INVENTORY-001: block seats for a technical reason or open them again.
   */
  setSeatLock(tripId, { seatCodes, locked, reason, staffId }, mockNow = Date.now()) {
    this.releaseExpiredHotlineHolds(mockNow);
    const trip = this.findTrip(tripId);
    if (!trip) return { success: false, error: 'Không tìm thấy chuyến xe', code: 'TRIP_NOT_FOUND' };
    const inventory = this._inventory();
    if (!inventory) return { success: false, error: 'Kho ghế chưa sẵn sàng', code: 'INVENTORY_UNAVAILABLE' };
    return inventory.setSeatBlock(tripId, seatCodes, locked, { reason, staffId, mockNow });
  }

  /**
   * MGR-019 / MGR-020: Counter POS ticket issuance.
   * Seats are checked against the same inventory as online sales; a hotline caller collects the seats
   * that were locked for them by passing the reservation id.
   */
  createPosBooking({
    tripId,
    passengerName,
    phone,
    seatCodes,
    paymentMethod = 'CASH_POS',
    agentStaffId = 'stf_pos_01',
    reservationId = null,
    pickupStopId = null,
    dropoffStopId = null,
    mockNow = Date.now()
  }) {
    this.releaseExpiredHotlineHolds(mockNow);

    const trip = this.findTrip(tripId);
    if (!trip) return { success: false, error: 'Chuyến xe không tồn tại', code: 'TRIP_NOT_FOUND' };
    if (!Array.isArray(seatCodes) || seatCodes.length === 0) {
      return { success: false, error: 'Vui lòng chọn ít nhất 1 ghế', code: 'NO_SEAT_SELECTED' };
    }
    if (!passengerName || !String(passengerName).trim()) {
      return { success: false, error: 'Thiếu họ tên hành khách', code: 'INVALID_PASSENGER_NAME' };
    }
    if (phone && !validateVietnamPhone(phone).isValid) {
      return { success: false, error: 'Số điện thoại không hợp lệ', code: 'INVALID_PHONE' };
    }
    if (!POS_PAYMENT_METHODS.includes(paymentMethod)) {
      return { success: false, error: 'Hình thức thanh toán không hợp lệ', code: 'INVALID_PAYMENT_METHOD' };
    }

    let reservation = null;
    if (reservationId) {
      reservation = this.hotlineReservations.find(r => r.reservation_id === reservationId && r.trip_id === tripId && r.hold_status === 'HELD_HOTLINE');
      if (!reservation) {
        return { success: false, error: 'Không tìm thấy lệnh giữ chỗ còn hiệu lực', code: 'RESERVATION_NOT_FOUND' };
      }
      const sameSeats = reservation.seat_codes.length === seatCodes.length && seatCodes.every(code => reservation.seat_codes.includes(code));
      if (!sameSeats) {
        return { success: false, error: 'Ghế xuất vé không khớp với lệnh giữ chỗ', code: 'RESERVATION_MISMATCH' };
      }
    }

    const inventory = this._inventory();
    const owner = reservation ? `hotline:${reservation.reservation_id}` : null;
    // A sale from a reservation covers the segment that was held (BR-SEAT-001)
    let segment = { pickupStopId, dropoffStopId };
    if (reservation) segment = { pickupStopId: reservation.pickup_stop_id, dropoffStopId: reservation.dropoff_stop_id };
    let resolvedSegment = { pickup_stop_id: null, dropoff_stop_id: null };
    if (inventory) {
      const check = inventory.checkSellable(tripId, seatCodes, mockNow, owner, segment);
      if (!check.success) return check;
      resolvedSegment = check.data;
    } else if (!reservation && trip.booked_seats + seatCodes.length > trip.total_seats) {
      return { success: false, error: 'Chuyến xe đã hết chỗ', code: 'TRIP_FULL' };
    }

    const route = this.routes.find(r => r.route_id === trip.route_id);
    const unitPrice = route ? route.base_fare_vnd : 220000;
    const totalFare = seatCodes.length * unitPrice;

    const pnr = `BG-POS${Math.floor(1000 + Math.random() * 9000)}`;

    const newBooking = {
      pnr,
      trip_id: tripId,
      passenger_name: passengerName,
      phone,
      seat_codes: seatCodes,
      total_fare_vnd: totalFare,
      payment_method: paymentMethod,
      payment_status: 'PAID',
      agent_staff_id: agentStaffId,
      pickup_stop_id: resolvedSegment.pickup_stop_id,
      dropoff_stop_id: resolvedSegment.dropoff_stop_id,
      issued_at: new Date(mockNow).toISOString(),
      channel: 'POS_HOTLINE'
    };

    this.bookings.push(newBooking);
    if (reservation) {
      // The seats were counted when they were held
      inventory?.unlockSeats(tripId, reservation.seat_codes, owner);
      reservation.hold_status = 'CONVERTED';
      reservation.converted_at = new Date(mockNow).toISOString();
      reservation.pnr = pnr;
    } else {
      trip.booked_seats += seatCodes.length;
    }

    if (this.eventBridge && typeof this.eventBridge.emit === 'function') {
      this.eventBridge.emit('POS_BOOKING_CREATED', { booking: newBooking, seatCodes });
    }

    return {
      success: true,
      message: `Xuất vé POS thành công cho khách ${passengerName} (${seatCodes.join(', ')})`,
      data: newBooking
    };
  }

  /**
   * MGR-020 / REV-06: Hotline telephone seat hold.
   * The seats are locked in the shared inventory until `hold_until`, so online and counter sales cannot
   * take them, and the lock lapses by itself when the hold expires.
   */
  createHotlineHold({
    tripId,
    passengerName,
    phone,
    seatCodes,
    holdPolicy = 'UNTIL_DEPARTURE_OFFSET',
    departureOffsetMinutes = 30,
    customExpiryMinutes = 60,
    notes = '',
    agentStaffId = 'stf_hotline_01',
    pickupStopId = null,
    dropoffStopId = null,
    mockNow = Date.now()
  }) {
    this.releaseExpiredHotlineHolds(mockNow);

    const trip = this.findTrip(tripId);
    if (!trip) return { success: false, error: 'Chuyến xe không tồn tại', code: 'TRIP_NOT_FOUND' };
    if (!Array.isArray(seatCodes) || seatCodes.length === 0) {
      return { success: false, error: 'Vui lòng chọn ít nhất 1 ghế', code: 'NO_SEAT_SELECTED' };
    }
    if (!passengerName || !String(passengerName).trim()) {
      return { success: false, error: 'Thiếu họ tên khách gọi điện', code: 'INVALID_PASSENGER_NAME' };
    }
    if (!validateVietnamPhone(phone).isValid) {
      return { success: false, error: 'Số điện thoại khách không hợp lệ', code: 'INVALID_PHONE' };
    }
    if (!HOLD_POLICIES.includes(holdPolicy)) {
      return { success: false, error: 'Chế độ giữ chỗ không hợp lệ', code: 'INVALID_HOLD_POLICY' };
    }
    const offsetOk = Number.isFinite(Number(departureOffsetMinutes)) && Number(departureOffsetMinutes) >= 0;
    const customOk = Number.isFinite(Number(customExpiryMinutes)) && Number(customExpiryMinutes) >= 1;
    if ((holdPolicy === 'UNTIL_DEPARTURE_OFFSET' && !offsetOk) || (holdPolicy === 'CUSTOM_EXPIRY_MINUTES' && !customOk)) {
      return { success: false, error: 'Thời hạn giữ chỗ không hợp lệ', code: 'INVALID_HOLD_DURATION' };
    }

    const inventory = this._inventory();
    let resolvedSegment = { pickup_stop_id: null, dropoff_stop_id: null };
    if (inventory) {
      const check = inventory.checkSellable(tripId, seatCodes, mockNow, null, { pickupStopId, dropoffStopId });
      if (!check.success) return check;
      resolvedSegment = check.data;
    } else if (trip.booked_seats + seatCodes.length > trip.total_seats) {
      return { success: false, error: 'Chuyến xe đã hết chỗ', code: 'TRIP_FULL' };
    }

    // BR-POS-006: a caller without a deposit cannot tie up more than 4 seats (expired holds were released above)
    const callerPhone = validateVietnamPhone(phone).normalized;
    const alreadyHeld = this.hotlineReservations
      .filter(r => r.hold_status === 'HELD_HOTLINE' && validateVietnamPhone(r.phone).normalized === callerPhone)
      .reduce((sum, r) => sum + r.seat_codes.length, 0);
    if (alreadyHeld + seatCodes.length > HOTLINE_MAX_SEATS_PER_PHONE) {
      return {
        success: false,
        error: `Mỗi số điện thoại chỉ được giữ tối đa ${HOTLINE_MAX_SEATS_PER_PHONE} ghế cùng lúc (đang giữ ${alreadyHeld})`,
        code: 'HOTLINE_LIMIT_EXCEEDED',
        held_seats: alreadyHeld
      };
    }

    let holdUntilMs;
    if (holdPolicy === 'UNTIL_DEPARTURE_OFFSET') {
      const departureTimeMs = new Date(trip.departure_time).getTime();
      holdUntilMs = departureTimeMs - (Number(departureOffsetMinutes) * 60 * 1000);
      // If departure is very close or in the past relative to mockNow, fallback to 15m hold
      if (holdUntilMs <= mockNow) {
        holdUntilMs = mockNow + (15 * 60 * 1000);
      }
    } else {
      holdUntilMs = mockNow + (Number(customExpiryMinutes) * 60 * 1000);
    }

    const holdUntil = new Date(holdUntilMs).toISOString();
    const reservationId = `rsv_pos_${Date.now()}_${Math.floor(100 + Math.random() * 900)}`;

    const reservation = {
      reservation_id: reservationId,
      pnr: `BG-RSV-${Math.floor(100 + Math.random() * 900)}`,
      trip_id: tripId,
      passenger_name: passengerName,
      phone,
      seat_codes: seatCodes,
      hold_policy: holdPolicy,
      pickup_stop_id: resolvedSegment.pickup_stop_id,
      dropoff_stop_id: resolvedSegment.dropoff_stop_id,
      departure_offset_minutes: Number(departureOffsetMinutes),
      hold_status: 'HELD_HOTLINE',
      hold_until: holdUntil,
      created_at: new Date(mockNow).toISOString(),
      created_by: agentStaffId,
      notes
    };

    inventory?.lockSeats(tripId, seatCodes, `hotline:${reservationId}`, holdUntilMs, { pickupStopId, dropoffStopId });
    this.hotlineReservations.push(reservation);
    trip.booked_seats += seatCodes.length;

    return {
      success: true,
      message: `Giữ chỗ hotline thành công cho khách ${passengerName} (Hạn giữ đến: ${holdUntil})`,
      data: reservation
    };
  }

  /**
   * Release hotline holds whose time is up (REV-06). Called before any read or sale, so no timer is needed.
   */
  releaseExpiredHotlineHolds(mockNow = Date.now()) {
    const releasedList = [];

    for (const rsv of this.hotlineReservations) {
      if (rsv.hold_status === 'HELD_HOTLINE' && mockNow > new Date(rsv.hold_until).getTime()) {
        rsv.hold_status = 'EXPIRED_RELEASED';
        rsv.released_at = new Date(mockNow).toISOString();
        this._inventory()?.unlockSeats(rsv.trip_id, rsv.seat_codes, `hotline:${rsv.reservation_id}`);

        const trip = this.findTrip(rsv.trip_id);
        if (trip) {
          trip.booked_seats = Math.max(0, trip.booked_seats - rsv.seat_codes.length);
        }
        releasedList.push(rsv);
      }
    }

    return {
      success: true,
      released_count: releasedList.length,
      data: releasedList
    };
  }

  /**
   * Cancel a hotline hold explicitly
   */
  cancelHotlineHold(reservationId, reason = 'Khách hủy yêu cầu qua điện thoại', mockNow = Date.now()) {
    const rsv = this.hotlineReservations.find(r => r.reservation_id === reservationId);
    if (!rsv) return { success: false, error: 'Không tìm thấy thông tin giữ chỗ' };

    if (rsv.hold_status === 'HELD_HOTLINE') {
      rsv.hold_status = 'CANCELLED';
      rsv.cancel_reason = reason;
      rsv.cancelled_at = new Date(mockNow).toISOString();
      this._inventory()?.unlockSeats(rsv.trip_id, rsv.seat_codes, `hotline:${rsv.reservation_id}`);

      const trip = this.findTrip(rsv.trip_id);
      if (trip) {
        trip.booked_seats = Math.max(0, trip.booked_seats - rsv.seat_codes.length);
      }
    }

    return { success: true, data: rsv };
  }

  /**
   * MGR-023: Emergency Vehicle Replacement Wizard (OQ-005)
   * The replacement must be a real vehicle that is free and has at least as many seats as are booked,
   * so every passenger keeps the same seat code. Nothing changes unless every check passes.
   */
  replaceTripVehicle(tripId, newVehicleIdOrPlate, reason = 'Sự cố hỏng hóc kỹ thuật động cơ', newDriverId = null) {
    const trip = this.findTrip(tripId);
    if (!trip) return { success: false, error: 'Chuyến xe không tồn tại', code: 'TRIP_NOT_FOUND' };

    const targetVehicle = this.vehicles.find(v => v.vehicle_id === newVehicleIdOrPlate || v.plate_number === newVehicleIdOrPlate);
    if (!targetVehicle) {
      return { success: false, error: 'Không tìm thấy xe thay thế trong đội xe', code: 'VEHICLE_NOT_FOUND' };
    }
    if (targetVehicle.status !== 'STANDBY') {
      return { success: false, error: `Xe ${targetVehicle.plate_number} đang ở trạng thái ${targetVehicle.status}, không thể điều thay thế`, code: 'VEHICLE_UNAVAILABLE' };
    }
    if (targetVehicle.total_seats < trip.booked_seats) {
      return {
        success: false,
        error: `Xe thay thế chỉ có ${targetVehicle.total_seats} chỗ, chuyến đã bán ${trip.booked_seats} chỗ`,
        code: 'CAPACITY_INSUFFICIENT'
      };
    }
    const newDriver = newDriverId ? this.drivers.find(d => d.driver_id === newDriverId) : null;
    if (newDriverId && !newDriver) {
      return { success: false, error: 'Không tìm thấy tài xế thay thế', code: 'DRIVER_NOT_FOUND' };
    }
    // DRI-001 refuses a driver whose licence has expired; a replacement must be someone who can sign in
    if (newDriver && (newDriver.status !== 'ON_DUTY' || new Date(`${newDriver.license_expiry}T23:59:59+07:00`).getTime() < Date.now())) {
      return { success: false, error: `Tài xế ${newDriver.full_name} không đủ điều kiện nhận chuyến (giấy phép lái xe hoặc trạng thái ca)`, code: 'DRIVER_UNAVAILABLE' };
    }

    const oldPlate = trip.vehicle_plate;
    const oldVehicle = this.vehicles.find(v => v.vehicle_id === trip.vehicle_id);
    if (oldVehicle && oldVehicle.vehicle_id !== targetVehicle.vehicle_id) {
      oldVehicle.status = 'MAINTENANCE';
    }
    targetVehicle.status = trip.status === 'IN_TRANSIT' ? 'IN_TRANSIT' : 'ASSIGNED';
    if (newDriver) {
      trip.driver_id = newDriver.driver_id;
      targetVehicle.driver_name = newDriver.full_name;
    }
    trip.vehicle_id = targetVehicle.vehicle_id;
    trip.vehicle_plate = targetVehicle.plate_number;
    trip.emergency_swap = {
      old_vehicle_plate: oldPlate,
      new_vehicle_plate: targetVehicle.plate_number,
      reason,
      swapped_at: new Date().toISOString()
    };

    this.alerts.unshift({
      alert_id: `alt_swap_${Date.now()}`,
      vehicle_plate: targetVehicle.plate_number,
      type: 'EMERGENCY_VEHICLE_SWAP',
      severity: 'RED',
      message: `Chuyến ${tripId}: Đã thay xe từ ${oldPlate} sang ${targetVehicle.plate_number} do "${reason}". Hành khách giữ nguyên mã ghế và đã được gửi thông báo.`,
      created_at: new Date().toISOString()
    });

    if (this.eventBridge && typeof this.eventBridge.emit === 'function') {
      this.eventBridge.emit('VEHICLE_SWAPPED', {
        tripId,
        oldPlate,
        newPlate: targetVehicle.plate_number,
        newDriverId: newDriver ? newDriver.driver_id : null,
        reason
      });
    }

    return {
      success: true,
      message: `Đã thực thi đổi xe thành công từ ${oldPlate} sang ${targetVehicle.plate_number}`,
      data: {
        trip_id: tripId,
        old_vehicle_plate: oldPlate,
        new_vehicle_plate: targetVehicle.plate_number,
        auto_reallocated_passengers: trip.booked_seats,
        swapped_at: trip.emergency_swap.swapped_at
      }
    };
  }

  executeEmergencyVehicleSwap(tripId, { newVehiclePlate, newDriverId, reason }) {
    return this.replaceTripVehicle(tripId, newVehiclePlate, reason, newDriverId);
  }

  /**
   * MGR-024: Trip Delay & Disruption Management
   */
  broadcastTripDelay(tripId, delayMinutes, reason = 'Kẹt xe đường bộ') {
    const trip = this.findTrip(tripId);
    if (!trip) return { success: false, error: 'Chuyến xe không tồn tại' };

    trip.delay_minutes = delayMinutes;
    const msg = `Chuyến ${tripId} chậm ${delayMinutes} phút do ${reason}`;

    this.alerts.unshift({
      alert_id: `alt_delay_${Date.now()}`,
      vehicle_plate: trip.vehicle_plate,
      type: 'TRIP_DELAY',
      severity: 'AMBER',
      message: msg,
      created_at: new Date().toISOString()
    });

    if (this.eventBridge && typeof this.eventBridge.emit === 'function') {
      this.eventBridge.emit('TRIP_DELAYED', {
        tripId,
        delayMinutes,
        reason
      });
    }

    return {
      success: true,
      message: msg,
      data: {
        trip_id: tripId,
        delay_minutes: delayMinutes,
        affected_passengers: trip.booked_seats
      }
    };
  }

  /**
   * MGR-022: A refund request opened by a cancellation (PAX-021) or an overdue payment (OQ-008).
   */
  createRefundRequest({ pnr, ticket_id = null, trip_id = null, amount_vnd, reason, source = 'PASSENGER_CANCEL', policy = null }) {
    const request = {
      refund_id: `ref_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`,
      pnr,
      ticket_id,
      trip_id,
      amount_vnd,
      reason,
      source,
      policy,
      status: 'REFUND_REQUESTED',
      requested_at: new Date().toISOString()
    };
    this.refundRequests.push(request);
    return request;
  }

  /**
   * MGR-022: Approve or reject an open refund request, exactly once.
   */
  processRefundApproval(refundId, approved, notes = '') {
    const request = this.refundRequests.find(r => r.refund_id === refundId);
    if (!request) {
      return { success: false, error: 'Không tìm thấy yêu cầu hoàn tiền', code: 'REFUND_NOT_FOUND' };
    }
    if (request.status !== 'REFUND_REQUESTED') {
      return { success: false, error: `Yêu cầu hoàn tiền đã được xử lý (${request.status})`, code: 'REFUND_ALREADY_PROCESSED' };
    }

    request.status = approved ? 'REFUNDED' : 'REFUND_REJECTED';
    request.notes = notes;
    request.processed_at = new Date().toISOString();

    if (approved) {
      const booking = this.bookings.find(b => b.pnr === request.pnr);
      if (booking) {
        booking.refund_status = 'REFUNDED';
        booking.refund_amount_vnd = (booking.refund_amount_vnd || 0) + request.amount_vnd;
      }
    }

    return {
      success: true,
      message: approved ? `Đã duyệt hoàn ${request.amount_vnd} đ cho yêu cầu ${refundId}` : `Đã từ chối yêu cầu hoàn tiền ${refundId}`,
      data: request
    };
  }

  /**
   * MGR-027: Executive report for a period (inclusive dates, YYYY-MM-DD). Without a period, everything.
   */
  getExecutiveReport({ startDate, endDate } = {}) {
    const round1 = (n) => parseFloat(n.toFixed(1));
    const inPeriod = (booking) => {
      const day = String(booking.issued_at || '').slice(0, 10);
      return (!startDate || day >= startDate) && (!endDate || day <= endDate);
    };
    const bookings = this.bookings.filter(inPeriod);
    const money = this._moneyFigures(bookings);
    const share = (channels) => money.gross_revenue_vnd > 0
      ? round1((bookings.filter(b => channels.includes(b.channel)).reduce((sum, b) => sum + b.total_fare_vnd, 0) / money.gross_revenue_vnd) * 100)
      : 0;

    const delays = this.trips.map(t => t.delay_minutes || 0);
    const onTimeTrips = delays.filter(d => d <= 15).length;

    return {
      success: true,
      data: {
        period: { start_date: startDate || null, end_date: endDate || null },
        financial_summary: {
          total_revenue_vnd: money.gross_revenue_vnd,
          refunded_vnd: money.refunded_vnd,
          net_revenue_vnd: money.net_revenue_vnd,
          total_tickets_sold: bookings.reduce((sum, b) => sum + b.seat_codes.length, 0),
          pos_share_pct: share(['POS_HOTLINE']),
          app_share_pct: share(['PASSENGER_APP']),
          hail_share_pct: share(['DRIVER_HAIL'])
        },
        punctuality_summary: {
          on_time_departure_rate: `${delays.length ? round1((onTimeTrips / delays.length) * 100) : 100}%`,
          average_delay_minutes: delays.length ? round1(delays.reduce((a, b) => a + b, 0) / delays.length) : 0
        }
      }
    };
  }

  getExecutiveReports(options) {
    return this.getExecutiveReport(options);
  }
}
