/**
 * FleetBus Driver Tactical Cockpit Service
 * Implements DRI-001 through DRI-019 for the commercial driver mobile/tablet platform.
 */

import {
  verifyDynamicTicketQR,
  verifyGroupBoardingQR,
  verifyOfflineSignedTicket,
  verifyTicketPin
} from '../../passenger/core/cryptoEngine.js';
import { getTicketSecret } from '../../../config.js';
import { maskPhone, validateVietnamPhone } from '../../passenger/core/formatters.js';
import { signToken, TOKEN_PREFIXES } from '../../../core/tokens.js';
import { hashSecret, verifySecret, LoginGuard } from '../../../core/passwords.js';

const CHANGE_METHODS = ['CASH_RETURNED', 'REST_STOP_DEBT_RECEIPT', 'WALLET_CREDIT'];
const NO_SHOW_GRACE_MINUTES = 10;
// BR-COD-005: change owed to passengers as debt receipts may total at most this much per trip
const DEBT_LIMIT_PER_TRIP_VND = 1000000;

export const MOCK_DRIVERS_DB = [
  {
    driver_id: 'drv_8821a',
    staff_id: 'TX8821',
    phone: '0912345678',
    pin: hashSecret('123456'),
    full_name: 'Trần Văn Bình',
    license_class: 'FC',
    license_valid_until: '2028-12-31',
    is_license_expired: false,
    assigned_vehicle_plate: '29B-123.45',
    status: 'ACTIVE'
  },
  {
    driver_id: 'drv_9902b',
    staff_id: 'TX9902',
    phone: '0987654321',
    pin: hashSecret('654321'),
    full_name: 'Lê Hoàng Nam',
    license_class: 'FC',
    license_valid_until: '2025-01-01', // Expired license
    is_license_expired: true,
    assigned_vehicle_plate: '29B-678.90',
    status: 'LICENSE_EXPIRED'
  },
  {
    driver_id: 'drv_9912b',
    staff_id: 'TX9912',
    phone: '0988776655',
    pin: hashSecret('112233'),
    full_name: 'Phạm Quốc Huy',
    license_class: 'FC',
    license_valid_until: '2028-06-30',
    is_license_expired: false,
    assigned_vehicle_plate: '29B-444.11',
    status: 'ACTIVE'
  }
];

export class DriverCockpitService {
  constructor(options = {}) {
    this.secretKey = options.secretKey || getTicketSecret();
    this.loginGuard = new LoginGuard();
    this.activeTrips = new Map(); // tripId -> TripState
    this.offlineQueue = []; // buffered telemetry pings
    this.incidents = [];

    this._initMockShiftTrips();
  }

  _initMockShiftTrips() {
    const trip1 = {
      trip_id: 'trp_991823',
      driver_id: 'drv_8821a',
      base_fare_vnd: 220000,
      debts: [],
      total_hail_collected_vnd: 0,
      route_name: 'Hà Nội — Thanh Hóa (Cao tốc)',
      planned_departure_time: '2026-08-28T14:00:00+07:00',
      status: 'DISPATCHED', // DISPATCHED | READY | IN_TRANSIT | COMPLETED
      vehicle_plate: '29B-123.45',
      vehicle_model: 'Limousine 34 Phòng VIP',
      total_capacity: 34,
      booked_passengers_count: 28,
      boarded_count: 0,
      total_cod_collected_vnd: 0,
      current_speed_kmh: 0,
      current_lat: 20.9806,
      current_lng: 105.8413,
      current_stop_index: 0,
      readiness_checklist: {
        tires_checked: false,
        brakes_fluid_checked: false,
        ac_cleanliness_checked: false,
        first_aid_extinguisher_checked: false,
        fuel_level_sufficient: false,
        gps_telemetry_beacon_active: false
      },
      stops: [
        { stop_id: 'stp_hn_gb', name: 'Bến xe Giáp Bát', city: 'Hà Nội', order: 1, expected_board: 18, expected_alight: 0, status: 'PENDING' },
        { stop_id: 'stp_hn_pv', name: 'Nút giao Pháp Vân', city: 'Hà Nội', order: 2, expected_board: 6, expected_alight: 0, status: 'PENDING' },
        { stop_id: 'stp_nb', name: 'Bến xe Ninh Bình', city: 'Ninh Bình', order: 3, expected_board: 4, expected_alight: 8, status: 'PENDING' },
        { stop_id: 'stp_th_pb', name: 'Bến xe Phía Bắc Thanh Hóa', city: 'Thanh Hóa', order: 4, expected_board: 0, expected_alight: 20, status: 'PENDING' }
      ],
      manifest: [
        { ticket_id: 'tkt_88219_A01', pnr: 'BG-88219', seat_code: 'A01', deck: 1, passenger_name: 'Trần Văn Hùng', phone_masked: '098***112', pickup_stop_id: 'stp_hn_gb', dropoff_stop_id: 'stp_nb', boarding_status: 'ISSUED', payment_method: 'VNPAY_ONLINE', cod_amount_vnd: 0 },
        { ticket_id: 'tkt_88219_A02', pnr: 'BG-88219', seat_code: 'A02', deck: 1, passenger_name: 'Nguyễn Văn Nam', phone_masked: '098***321', pickup_stop_id: 'stp_hn_pv', dropoff_stop_id: 'stp_th_pb', boarding_status: 'ISSUED', payment_method: 'COD', cod_amount_vnd: 220000 },
        { ticket_id: 'tkt_88219_B01', pnr: 'BG-88220', seat_code: 'B01', deck: 1, passenger_name: 'Lê Thị Mai', phone_masked: '091***889', pickup_stop_id: 'stp_hn_gb', dropoff_stop_id: 'stp_th_pb', boarding_status: 'ISSUED', payment_method: 'VIETQR', cod_amount_vnd: 0 }
      ]
    };

    const trip2 = {
      trip_id: 'trp_hn_th_01',
      driver_id: 'drv_8821a',
      base_fare_vnd: 220000,
      debts: [],
      total_hail_collected_vnd: 0,
      route_name: 'Hà Nội — Thanh Hóa (Cao tốc)',
      planned_departure_time: '2026-08-28T07:00:00+07:00',
      status: 'READY',
      vehicle_plate: '29B-882.19',
      vehicle_model: 'Cabin Cung Điện VIP 22 Phòng',
      total_capacity: 22,
      booked_passengers_count: 1,
      boarded_count: 0,
      total_cod_collected_vnd: 0,
      current_speed_kmh: 0,
      current_lat: 20.9806,
      current_lng: 105.8413,
      current_stop_index: 0,
      readiness_checklist: {
        tires_checked: true,
        brakes_fluid_checked: true,
        ac_cleanliness_checked: true,
        first_aid_extinguisher_checked: true,
        fuel_level_sufficient: true,
        gps_telemetry_beacon_active: true
      },
      stops: [
        { stop_id: 'stp_hn_gb', name: 'Bến xe Giáp Bát', city: 'Hà Nội', order: 1, expected_board: 1, expected_alight: 0, status: 'PENDING' },
        { stop_id: 'stp_hn_nuoc_ngam', name: 'Bến xe Nước Ngầm', city: 'Hà Nội', order: 2, expected_board: 0, expected_alight: 0, status: 'PENDING' },
        { stop_id: 'stp_nb', name: 'Bến xe Ninh Bình', city: 'Ninh Bình', order: 3, expected_board: 0, expected_alight: 0, status: 'PENDING' },
        { stop_id: 'stp_th_pb', name: 'Bến xe Phía Bắc Thanh Hóa', city: 'Thanh Hóa', order: 4, expected_board: 0, expected_alight: 1, status: 'PENDING' },
        { stop_id: 'stp_th_sam_son', name: 'Bến xe Sầm Sơn', city: 'Thanh Hóa', order: 5, expected_board: 0, expected_alight: 0, status: 'PENDING' }
      ],
      manifest: [
        { ticket_id: 'tkt_88219_A01', pnr: 'BG-88219', seat_code: 'A01', deck: 1, passenger_name: 'Trần Văn Hùng', phone_masked: '098***112', pickup_stop_id: 'stp_hn_gb', dropoff_stop_id: 'stp_th_pb', boarding_status: 'ISSUED', payment_method: 'VNPAY_ONLINE', cod_amount_vnd: 0 }
      ]
    };

    this.activeTrips.set(trip1.trip_id, trip1);
    this.activeTrips.set(trip2.trip_id, trip2);
  }

  /**
   * DRI-001: Driver Authentication & License Verification
   */
  authenticateDriver(staffIdOrPhone, pin, deviceInfo = {}, mockNow = Date.now()) {
    const input = (staffIdOrPhone || '').trim().toUpperCase();

    const lockedFor = this.loginGuard.isLocked(input, mockNow);
    if (lockedFor > 0) {
      return {
        success: false,
        error: `Tài khoản tạm khóa do nhập sai nhiều lần. Thử lại sau ${Math.ceil(lockedFor / 60)} phút`,
        code: 'ACCOUNT_LOCKED',
        retry_after_seconds: lockedFor
      };
    }

    const driver = MOCK_DRIVERS_DB.find(d => d.staff_id === input || d.phone === input);

    if (!driver || !verifySecret(String(pin ?? ''), driver.pin)) {
      this.loginGuard.fail(input, mockNow);
      return { success: false, error: 'Mã nhân viên hoặc mã PIN không chính xác', code: 'INVALID_CREDENTIALS' };
    }
    this.loginGuard.succeed(input);

    // BR-DRI-001: Commercial License check
    if (driver.is_license_expired || new Date(driver.license_valid_until) < new Date()) {
      return {
        success: false,
        error: 'Bằng lái xe của bạn đã hết hạn. Vui lòng liên hệ phòng Nhân sự / Điều độ để gia hạn.',
        code: 'LICENSE_EXPIRED',
        license_valid_until: driver.license_valid_until
      };
    }

    const token = signToken(
      { sub: driver.driver_id, staff_id: driver.staff_id, role: 'ROLE_DRIVER', kind: 'driver' },
      { prefix: TOKEN_PREFIXES.driver, ttlSeconds: 12 * 3600, now: mockNow }
    );

    return {
      success: true,
      data: {
        driver: {
          driver_id: driver.driver_id,
          staff_id: driver.staff_id,
          full_name: driver.full_name,
          phone: driver.phone,
          license_class: driver.license_class,
          license_valid_until: driver.license_valid_until,
          assigned_vehicle_plate: driver.assigned_vehicle_plate
        },
        token,
        mqtt_credentials: {
          broker_url: 'ssl://mqtt.busgo.vn:8883',
          client_id: `${driver.driver_id}_tablet`,
          topic: `busgo/telemetry/${driver.assigned_vehicle_plate}`
        }
      }
    };
  }

  /**
   * OQ-007: what the driver app may see of a passenger. The raw phone stays on the server
   * (it is needed for notifications) and never leaves in an API response.
   */
  _publicPassenger(passenger) {
    const { passenger_phone: rawPhone, ...rest } = passenger;
    return { ...rest, phone_masked: rest.phone_masked || (rawPhone ? maskPhone(rawPhone) : null) };
  }

  _publicTrip(trip) {
    return { ...trip, manifest: trip.manifest.map(p => this._publicPassenger(p)) };
  }

  /**
   * DRI-007: Passenger manifest for a trip, with masked phone numbers.
   */
  getManifest(tripId) {
    const trip = this.activeTrips.get(tripId);
    if (!trip) return { success: false, error: 'Không tìm thấy chuyến xe', code: 'TRIP_NOT_FOUND' };
    return {
      success: true,
      data: {
        trip_id: tripId,
        vehicle_plate: trip.vehicle_plate,
        boarded_count: trip.boarded_count,
        manifest: trip.manifest.map(p => this._publicPassenger(p))
      }
    };
  }

  /**
   * DRI-002: Get Today Assigned Trips (only the trips assigned to this driver)
   */
  getTodayTrips(driverId) {
    const trips = Array.from(this.activeTrips.values())
      .filter(t => t.driver_id === driverId)
      .map(t => this._publicTrip(t));
    return {
      success: true,
      data: {
        shift_date: new Date().toISOString().split('T')[0],
        total_trips: trips.length,
        trips
      }
    };
  }

  /**
   * DRI-018: Profile of the driver who asks. Credentials never leave the service; a figure without data
   * behind it (a rating) is not reported.
   */
  getProfile(driverId) {
    const driver = MOCK_DRIVERS_DB.find(d => d.driver_id === driverId);
    if (!driver) return { success: false, error: 'Không tìm thấy tài xế', code: 'DRIVER_NOT_FOUND' };
    const trips = Array.from(this.activeTrips.values()).filter(t => t.driver_id === driverId);
    return {
      success: true,
      data: {
        driver_id: driver.driver_id,
        staff_id: driver.staff_id,
        full_name: driver.full_name,
        phone: driver.phone,
        license_class: driver.license_class,
        license_valid_until: driver.license_valid_until,
        assigned_vehicle_plate: driver.assigned_vehicle_plate,
        trips_assigned_today: trips.length,
        trips_completed_today: trips.filter(t => t.status === 'COMPLETED').length
      }
    };
  }

  /**
   * DRI-003: Pre-start trip detail (route, stops, readiness), with masked passenger phones.
   */
  getTrip(tripId) {
    const trip = this.activeTrips.get(tripId);
    if (!trip) return { success: false, error: 'Không tìm thấy chuyến xe', code: 'TRIP_NOT_FOUND' };
    return { success: true, data: this._publicTrip(trip) };
  }

  /**
   * DRI-008: Confirm arrival at a stop of a running trip. Repeating it is harmless.
   */
  arriveAtStop(tripId, stopId, mockNow = Date.now()) {
    const trip = this.activeTrips.get(tripId);
    if (!trip) return { success: false, error: 'Chuyến xe không tồn tại', code: 'TRIP_NOT_FOUND' };
    if (trip.status !== 'IN_TRANSIT') {
      return { success: false, error: 'Chuyến xe chưa chạy hoặc đã kết thúc', code: 'TRIP_NOT_ACTIVE' };
    }
    const index = trip.stops.findIndex(s => s.stop_id === stopId);
    if (index === -1) return { success: false, error: 'Không tìm thấy điểm dừng', code: 'STOP_NOT_FOUND' };

    const stop = trip.stops[index];
    if (stop.status !== 'ARRIVED') {
      stop.status = 'ARRIVED';
      stop.arrived_at = new Date(mockNow).toISOString();
    }
    trip.current_stop_index = Math.max(trip.current_stop_index, index);
    return { success: true, data: stop };
  }

  /**
   * DRI-004: Submit Pre-Start Vehicle Readiness Inspection
   */
  submitReadinessChecklist(tripId, checklist = {}) {
    const trip = this.activeTrips.get(tripId);
    if (!trip) return { success: false, error: 'Chuyến xe không tồn tại', code: 'TRIP_NOT_FOUND' };

    const keys = [
      'tires_checked',
      'brakes_fluid_checked',
      'ac_cleanliness_checked',
      'first_aid_extinguisher_checked',
      'fuel_level_sufficient',
      'gps_telemetry_beacon_active'
    ];

    const allChecked = keys.every(k => checklist[k] === true);
    trip.readiness_checklist = { ...checklist };

    if (allChecked) {
      trip.status = 'READY';
    }

    return {
      success: true,
      is_ready_to_start: allChecked,
      data: {
        trip_id: tripId,
        status: trip.status,
        checklist: trip.readiness_checklist
      }
    };
  }

  /**
   * DRI-005: Start Trip & Activate Active Cockpit (only after the readiness checklist is complete)
   */
  startTrip(tripId) {
    const trip = this.activeTrips.get(tripId);
    if (!trip) return { success: false, error: 'Chuyến xe không tồn tại', code: 'TRIP_NOT_FOUND' };

    if (trip.status !== 'READY') {
      return {
        success: false,
        error: `Chuyến xe ở trạng thái ${trip.status}. Cần hoàn tất phiếu kiểm tra xe trước khi bắt đầu`,
        code: 'INVALID_TRIP_STATE'
      };
    }

    trip.status = 'IN_TRANSIT';
    trip.actual_start_time = new Date().toISOString();

    if (this.eventBridge && typeof this.eventBridge.emit === 'function') {
      this.eventBridge.emit('TRIP_STARTED', { tripId, vehiclePlate: trip.vehicle_plate });
    }

    return {
      success: true,
      message: 'Chuyến đi đã bắt đầu! Đang truyền telemetry GPS về trung tâm điều hành.',
      data: this._publicTrip(trip)
    };
  }

  /**
   * MGR-022 / FLOW-03: the cashier at a rest stop or depot pays out a debt receipt, once.
   */
  redeemDebtReceipt(receiptCode, { cashierId = null, stationId = null, mockNow = Date.now() } = {}) {
    const code = String(receiptCode || '').trim().toUpperCase();
    for (const trip of this.activeTrips.values()) {
      const receipt = trip.debts.find(d => d.receipt_code === code);
      if (!receipt) continue;
      if (receipt.status === 'REDEEMED') {
        return { success: false, error: `Biên lai ${code} đã được thanh toán`, code: 'DEBT_ALREADY_REDEEMED', redeemed_at: receipt.redeemed_at };
      }
      receipt.status = 'REDEEMED';
      receipt.redeemed_at = new Date(mockNow).toISOString();
      receipt.redeemed_by = cashierId;
      receipt.redeemed_station = stationId;
      return { success: true, data: { ...receipt } };
    }
    return { success: false, error: 'Không tìm thấy biên lai nợ', code: 'DEBT_RECEIPT_NOT_FOUND' };
  }

  /**
   * MGR-023: the dispatcher moved the trip to another vehicle and, optionally, another driver.
   */
  reassignTrip(tripId, { vehiclePlate, driverId = null }) {
    const trip = this.activeTrips.get(tripId);
    if (!trip) return { success: false, error: 'Chuyến xe không tồn tại', code: 'TRIP_NOT_FOUND' };
    trip.vehicle_plate = vehiclePlate;
    if (driverId) trip.driver_id = driverId;
    return { success: true, data: { trip_id: tripId, vehicle_plate: trip.vehicle_plate, driver_id: trip.driver_id } };
  }

  /**
   * DRI-006: Ingest GPS Telemetry (3s frequency / offline buffer support)
   */
  recordTelemetry(tripId, { lat, lng, speed_kmh, bearing_deg, is_offline = false, mockNow = Date.now() }) {
    const trip = this.activeTrips.get(tripId);
    if (!trip) return { success: false, error: 'Chuyến xe không tồn tại', code: 'TRIP_NOT_FOUND' };
    if (trip.status !== 'IN_TRANSIT') {
      return { success: false, error: 'Chuyến xe chưa chạy hoặc đã kết thúc', code: 'TRIP_NOT_ACTIVE' };
    }

    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);
    const speedNum = speed_kmh === undefined ? 0 : parseFloat(speed_kmh);
    const valid = Number.isFinite(latNum) && latNum >= -90 && latNum <= 90
      && Number.isFinite(lngNum) && lngNum >= -180 && lngNum <= 180
      && Number.isFinite(speedNum) && speedNum >= 0;
    if (!valid) {
      return { success: false, error: 'Tọa độ hoặc tốc độ không hợp lệ', code: 'INVALID_TELEMETRY' };
    }

    const ping = {
      trip_id: tripId,
      vehicle_plate: trip.vehicle_plate,
      lat: latNum,
      lng: lngNum,
      speed_kmh: speedNum,
      bearing_deg: parseInt(bearing_deg, 10) || 0,
      timestamp: new Date(mockNow).toISOString()
    };

    trip.current_lat = ping.lat;
    trip.current_lng = ping.lng;
    trip.current_speed_kmh = ping.speed_kmh;
    trip.last_telemetry_at = Math.max(trip.last_telemetry_at || 0, mockNow);

    if (is_offline) {
      this.offlineQueue.push(ping);
    }

    if (this.eventBridge && typeof this.eventBridge.emit === 'function') {
      this.eventBridge.emit('DRIVER_TELEMETRY', { tripId, telemetry: ping });
    }

    return {
      success: true,
      buffered_offline_count: this.offlineQueue.length,
      data: ping
    };
  }

  /**
   * An unpaid COD ticket boards only through collectCod, so the fare is never skipped (design review 2026-10-07).
   * Returns the refusal to send, or null when the passenger may board.
   */
  _codPaymentRequired(passenger) {
    if (passenger.payment_method !== 'COD' || !(passenger.cod_amount_vnd > 0) || passenger.cod_collected) return null;
    return {
      success: false,
      error: `Vé COD chưa thu tiền: thu ${passenger.cod_amount_vnd.toLocaleString('vi-VN')} đ trước khi cho khách lên xe`,
      code: 'COD_PAYMENT_REQUIRED',
      ticket_id: passenger.ticket_id,
      seat_code: passenger.seat_code,
      cod_amount_vnd: passenger.cod_amount_vnd
    };
  }

  /**
   * Single place where a manifest passenger becomes BOARDED, so that every boarding path
   * (QR, group QR, PIN, offline ticket, manual) updates the passenger wallet and the manager through the bridge.
   */
  _markBoarded(tripId, trip, passenger, mockNow, scanMethod = null) {
    passenger.boarding_status = 'BOARDED';
    passenger.boarded_at = new Date(mockNow).toISOString();
    if (scanMethod) passenger.scan_method = scanMethod;
    trip.boarded_count += 1;

    if (this.eventBridge && typeof this.eventBridge.emit === 'function') {
      this.eventBridge.emit('PASSENGER_BOARDED', {
        tripId,
        passenger,
        ticketId: passenger.ticket_id,
        pnr: passenger.pnr,
        now: mockNow
      });
    }
  }

  /**
   * DRI-009 / DRI-010: Scan Dynamic QR, Group QR, Offline PIN, or Offline Signed Ticket (REV-01, REV-03)
   * Tickets are matched on ticket_id within this trip's manifest only.
   */
  boardPassengerByQR(tripId, inputString, mockNow = Date.now()) {
    const trip = this.activeTrips.get(tripId);
    if (!trip) return { success: false, error: 'Chuyến xe không tồn tại' };
    if (!inputString) return { success: false, error: 'Dữ liệu quét không được để trống' };

    // Case 1: Group Boarding QR (BUSGO_GRP|...)
    if (typeof inputString === 'string' && inputString.startsWith('BUSGO_GRP|')) {
      const groupCheck = verifyGroupBoardingQR(inputString, this.secretKey, mockNow);
      if (!groupCheck.isValid) {
        return { success: false, error: `Mã QR nhóm không hợp lệ (${groupCheck.reason})`, code: groupCheck.reason };
      }

      const onTrip = groupCheck.ticket_ids
        .map(tktId => trip.manifest.find(m => m.ticket_id === tktId))
        .filter(Boolean);
      if (onTrip.length === 0) {
        return { success: false, error: 'Vé không thuộc chuyến xe này', code: 'TICKET_WRONG_TRIP' };
      }

      const boardedList = [];
      const codPending = [];
      for (const passenger of onTrip) {
        if (passenger.boarding_status === 'BOARDED') continue;
        if (this._codPaymentRequired(passenger)) {
          codPending.push(passenger);
          continue;
        }
        this._markBoarded(tripId, trip, passenger, mockNow);
        boardedList.push(passenger);
      }

      return {
        success: true,
        isGroup: true,
        message: `Soát vé đoàn thành công: ${boardedList.length} khách đã lên xe`,
        data: {
          pnr: groupCheck.pnr,
          boarded_passengers: boardedList.map(p => this._publicPassenger(p)),
          cod_pending_passengers: codPending.map(p => this._publicPassenger(p))
        }
      };
    }

    // Case 2: 6-digit Offline PIN (PIN:ticketId:pin)
    if (typeof inputString === 'string' && inputString.startsWith('PIN:')) {
      const [, ticketId, pin] = inputString.split(':');
      const pinCheck = verifyTicketPin(ticketId, pin, this.secretKey);
      if (!pinCheck.isValid) {
        return { success: false, error: 'Mã PIN vé không chính xác', code: 'INVALID_PIN' };
      }

      const passenger = trip.manifest.find(m => m.ticket_id === ticketId);
      if (!passenger) {
        return { success: false, error: 'Vé không thuộc chuyến xe này', code: 'TICKET_WRONG_TRIP' };
      }
      if (passenger.boarding_status === 'BOARDED') {
        return { success: false, error: `Khách ${passenger.passenger_name} đã lên xe trước đó!`, code: 'ALREADY_BOARDED' };
      }

      const codRefusal = this._codPaymentRequired(passenger);
      if (codRefusal) return codRefusal;

      this._markBoarded(tripId, trip, passenger, mockNow);

      return {
        success: true,
        message: `Xác thực PIN thành công: ${passenger.passenger_name} · Ghế ${passenger.seat_code}`,
        data: this._publicPassenger(passenger)
      };
    }

    // Case 3: Offline Signed JSON Ticket
    if (typeof inputString === 'string' && inputString.trim().startsWith('{')) {
      const offlineCheck = verifyOfflineSignedTicket(inputString, this.secretKey);
      if (!offlineCheck.isValid) {
        return { success: false, error: `Chữ ký vé offline không hợp lệ (${offlineCheck.reason})`, code: offlineCheck.reason };
      }
      const passenger = offlineCheck.trip_id === tripId
        ? trip.manifest.find(m => m.ticket_id === offlineCheck.ticket_id)
        : null;
      if (!passenger) return { success: false, error: 'Vé không thuộc chuyến xe này', code: 'TICKET_WRONG_TRIP' };

      if (passenger.boarding_status === 'BOARDED') {
        return { success: false, error: `Khách ${passenger.passenger_name} đã lên xe trước đó!`, code: 'ALREADY_BOARDED' };
      }

      const codRefusal = this._codPaymentRequired(passenger);
      if (codRefusal) return codRefusal;

      this._markBoarded(tripId, trip, passenger, mockNow);

      return {
        success: true,
        isOfflineSigned: true,
        message: `Soát vé offline thành công: ${passenger.passenger_name} · Ghế ${passenger.seat_code}`,
        data: this._publicPassenger(passenger)
      };
    }

    // Case 4: Standard Dynamic TOTP QR (BUSGO|...) with +-2 window tolerance
    const qrCheck = verifyDynamicTicketQR(inputString, this.secretKey, mockNow);
    if (!qrCheck.isValid) {
      return { success: false, error: `Mã QR không hợp lệ (${qrCheck.reason})`, code: qrCheck.reason };
    }

    const passenger = trip.manifest.find(m => m.ticket_id === qrCheck.ticket_id);
    if (!passenger) {
      return { success: false, error: 'Vé không thuộc chuyến xe này', code: 'TICKET_WRONG_TRIP' };
    }

    if (passenger.boarding_status === 'BOARDED') {
      return { success: false, error: `Khách ${passenger.passenger_name} (Ghế ${passenger.seat_code}) đã lên xe trước đó!`, code: 'ALREADY_BOARDED' };
    }

    const codRefusal = this._codPaymentRequired(passenger);
    if (codRefusal) return codRefusal;

    this._markBoarded(tripId, trip, passenger, mockNow);

    return {
      success: true,
      message: `Soát vé thành công: ${passenger.passenger_name} · Ghế ${passenger.seat_code}`,
      data: this._publicPassenger(passenger)
    };
  }

  /**
   * DRI-010: Driver manually boards a passenger found by ticket or seat (no scan available).
   */
  boardPassengerManually(tripId, { ticketId, seatCode }, mockNow = Date.now()) {
    const trip = this.activeTrips.get(tripId);
    if (!trip) return { success: false, error: 'Chuyến xe không tồn tại', code: 'TRIP_NOT_FOUND' };

    const passenger = trip.manifest.find(m => (ticketId && m.ticket_id === ticketId) || (seatCode && m.seat_code === seatCode));
    if (!passenger) {
      return { success: false, error: 'Không tìm thấy hành khách trong danh sách', code: 'NOT_FOUND' };
    }
    if (passenger.boarding_status === 'BOARDED') {
      return { success: false, error: `Khách ${passenger.passenger_name} đã lên xe trước đó!`, code: 'ALREADY_BOARDED' };
    }

    const codRefusal = this._codPaymentRequired(passenger);
    if (codRefusal) return codRefusal;

    this._markBoarded(tripId, trip, passenger, mockNow, 'MANUAL_OVERRIDE');
    return { success: true, data: this._publicPassenger(passenger) };
  }

  /**
   * REV-04: Validate the change method and, when needed, open the matching record.
   * Debt receipt codes are unique per ticket (DR-<ticket>-<thousands>K) and are listed at trip end.
   */
  _settleChange(trip, { ticketId, changeDue, method, phone }) {
    if (!CHANGE_METHODS.includes(method)) {
      return { success: false, error: 'Hình thức xử lý tiền thừa không hợp lệ', code: 'INVALID_SETTLEMENT_METHOD' };
    }
    if (method === 'WALLET_CREDIT' && changeDue > 0 && !phone) {
      return { success: false, error: 'Cần số điện thoại của khách để cộng tiền thừa vào ví', code: 'WALLET_PHONE_REQUIRED' };
    }

    let debtReceiptCode = null;
    let payoutLocation = null;
    if (method === 'REST_STOP_DEBT_RECEIPT' && changeDue > 0) {
      const issued = trip.debts.reduce((sum, d) => sum + d.amount_vnd, 0);
      if (issued + changeDue > DEBT_LIMIT_PER_TRIP_VND) {
        return {
          success: false,
          error: `Tổng biên lai nợ của chuyến không được vượt ${DEBT_LIMIT_PER_TRIP_VND.toLocaleString('vi-VN')} đ (đã phát hành ${issued.toLocaleString('vi-VN')} đ). Hãy trả tiền thừa bằng tiền mặt hoặc ví`,
          code: 'DEBT_LIMIT_EXCEEDED',
          issued_vnd: issued,
          limit_vnd: DEBT_LIMIT_PER_TRIP_VND
        };
      }
      const ticketPart = String(ticketId).replace(/^tkt_/, '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
      debtReceiptCode = `DR-${ticketPart}-${Math.round(changeDue / 1000)}K`;
      payoutLocation = 'Trạm dừng nghỉ kế tiếp / Bến xe đích';
      const holder = trip.manifest.find(m => m.ticket_id === ticketId);
      trip.debts.push({
        receipt_code: debtReceiptCode,
        trip_id: trip.trip_id,
        ticket_id: ticketId,
        passenger_name: holder?.passenger_name || null,
        phone_masked: holder?.passenger_phone ? maskPhone(holder.passenger_phone) : null,
        amount_vnd: changeDue,
        status: 'OUTSTANDING',
        issued_at: new Date().toISOString()
      });
    }

    return {
      success: true,
      data: { method, change_due_vnd: changeDue, debt_receipt_code: debtReceiptCode, payout_location: payoutLocation }
    };
  }

  _creditWalletIfNeeded(tripId, { ticketId, method, changeDue, phone }) {
    if (method === 'WALLET_CREDIT' && changeDue > 0 && this.eventBridge && typeof this.eventBridge.emit === 'function') {
      this.eventBridge.emit('WALLET_CREDIT_REQUESTED', { tripId, ticketId, phone, amountVnd: changeDue });
    }
  }

  /**
   * DRI-012: Collect COD Cash Fare with change due settlement options (REV-04)
   * The fare is the one stored on the ticket, a COD ticket is collected once, and the cash must cover the fare.
   */
  collectCod(tripId, ticketId, payloadOrAmount, mockNow = Date.now()) {
    const trip = this.activeTrips.get(tripId);
    if (!trip) return { success: false, error: 'Chuyến xe không tồn tại', code: 'TRIP_NOT_FOUND' };

    const item = trip.manifest.find(m => m.ticket_id === ticketId);
    if (!item) return { success: false, error: 'Không tìm thấy vé trong danh sách', code: 'TICKET_NOT_FOUND' };

    if (item.payment_method !== 'COD' || !(item.cod_amount_vnd > 0)) {
      return { success: false, error: 'Vé này không thu tiền COD', code: 'NOT_COD_TICKET' };
    }
    if (item.cod_collected) {
      return { success: false, error: 'Vé này đã thu COD', code: 'ALREADY_COLLECTED' };
    }

    const payload = typeof payloadOrAmount === 'number'
      ? { amount_collected_vnd: payloadOrAmount }
      : (payloadOrAmount || {});

    const fareAmount = item.cod_amount_vnd;
    if (payload.fare_amount_vnd !== undefined && Number(payload.fare_amount_vnd) !== fareAmount) {
      return { success: false, error: `Giá vé COD phải là ${fareAmount} đ`, code: 'FARE_MISMATCH' };
    }

    const collectedAmount = payload.amount_collected_vnd === undefined ? fareAmount : Number(payload.amount_collected_vnd);
    if (!Number.isFinite(collectedAmount) || collectedAmount < fareAmount) {
      return { success: false, error: 'Số tiền thu chưa đủ giá vé', code: 'INSUFFICIENT_AMOUNT' };
    }

    const changeDue = collectedAmount - fareAmount;
    const method = payload.change_settlement_method || 'CASH_RETURNED';
    const settlement = this._settleChange(trip, { ticketId, changeDue, method, phone: item.passenger_phone });
    if (!settlement.success) return settlement;

    item.cod_collected = true;
    item.cod_collected_amount = collectedAmount;
    item.payment_status = 'SUCCESS';
    item.change_settlement = {
      ...settlement.data,
      amount_collected_vnd: collectedAmount,
      fare_amount_vnd: fareAmount
    };
    trip.total_cod_collected_vnd += fareAmount;

    if (item.boarding_status !== 'BOARDED') {
      this._markBoarded(tripId, trip, item, mockNow);
    }
    if (this.eventBridge && typeof this.eventBridge.emit === 'function') {
      this.eventBridge.emit('COD_COLLECTED', { tripId, ticketId, pnr: item.pnr, fareVnd: fareAmount });
    }
    this._creditWalletIfNeeded(tripId, { ticketId, method, changeDue, phone: item.passenger_phone });

    return {
      success: true,
      message: `Đã thu COD ${fareAmount.toLocaleString('vi-VN')} đ từ khách ${item.passenger_name}`,
      data: this._publicPassenger(item)
    };
  }

  /**
   * DRI-006 / DRI-007: Onboard Hail Passenger (Đón khách vẫy dọc đường - REV-05)
   * The fare is the trip fare set by the server; the driver chooses only the seat, the drop-off and the cash received.
   */
  onboardHailPassenger(tripId, {
    passenger_name = 'Khách vẫy dọc đường',
    phone,
    dropoff_stop_id,
    dropoff_stop_name,
    seat_code,
    amount_collected_vnd,
    payment_method = 'CASH',
    change_settlement_method = 'CASH_RETURNED'
  }, mockNow = Date.now()) {
    const trip = this.activeTrips.get(tripId);
    if (!trip) return { success: false, error: 'Chuyến xe không tồn tại', code: 'TRIP_NOT_FOUND' };
    if (trip.status !== 'IN_TRANSIT') {
      return { success: false, error: 'Chỉ đón khách vẫy khi chuyến đang chạy', code: 'TRIP_NOT_ACTIVE' };
    }
    if (typeof seat_code !== 'string' || !seat_code.trim()) {
      return { success: false, error: 'Vui lòng chọn ghế trống cho khách', code: 'SEAT_REQUIRED' };
    }

    // The hail passenger rides from the stop the bus has reached to the drop-off (BR-SEAT-001, OQ-028)
    const stops = trip.stops || [];
    const pickupIndex = Math.min(trip.current_stop_index || 0, Math.max(0, stops.length - 1));
    const dropIndex = dropoff_stop_id ? stops.findIndex(s => s.stop_id === dropoff_stop_id) : stops.length - 1;
    if (stops.length > 0) {
      if (dropIndex < 0) return { success: false, error: 'Điểm xuống không thuộc chuyến xe này', code: 'STOP_NOT_FOUND' };
      if (dropIndex <= pickupIndex) return { success: false, error: 'Điểm xuống phải nằm sau điểm xe đang dừng', code: 'INVALID_SEGMENT' };
    }
    const pickupId = stops[pickupIndex]?.stop_id || null;
    const dropId = stops[dropIndex]?.stop_id || null;

    // A passenger on the manifest holds the seat only for the stops between their own pickup and drop-off
    const orderOf = (id, fallback) => { const i = stops.findIndex(s => s.stop_id === id); return i < 0 ? fallback : i; };
    const isOccupied = trip.manifest.some(m => {
      if (m.seat_code !== seat_code || m.boarding_status === 'NO_SHOW' || m.boarding_status === 'CANCELLED') return false;
      return orderOf(m.pickup_stop_id, 0) < dropIndex && pickupIndex < orderOf(m.dropoff_stop_id, stops.length - 1);
    });
    if (isOccupied) {
      return { success: false, error: `Ghế ${seat_code} đã có người ngồi hoặc đã được đặt!`, code: 'SEAT_OCCUPIED' };
    }

    // The seat must also be free in the shared inventory for that segment (sold online, held for a hotline caller, ...)
    const inventory = this.eventBridge?.services?.seatMapService;
    if (inventory) {
      const check = inventory.checkSellable(tripId, [seat_code], mockNow, null, { pickupStopId: pickupId, dropoffStopId: dropId });
      if (!check.success) {
        const passThrough = ['SEAT_NOT_FOUND', 'STOP_NOT_FOUND', 'INVALID_SEGMENT', 'STOP_NOT_ALLOWED'];
        return { success: false, error: check.error, code: passThrough.includes(check.code) ? check.code : 'SEAT_OCCUPIED' };
      }
    }

    let normalizedPhone = null;
    if (phone) {
      const phoneCheck = validateVietnamPhone(phone);
      if (!phoneCheck.isValid) return { success: false, error: phoneCheck.message, code: 'INVALID_PHONE' };
      normalizedPhone = phoneCheck.normalized;
    }

    const fare = trip.base_fare_vnd;
    const collected = amount_collected_vnd === undefined ? fare : Number(amount_collected_vnd);
    if (!Number.isFinite(collected) || collected < fare) {
      return { success: false, error: 'Số tiền thu chưa đủ giá vé', code: 'INSUFFICIENT_AMOUNT' };
    }

    const ticketId = `tkt_hail_${mockNow}_${seat_code}`;
    const changeDue = collected - fare;
    const settlement = this._settleChange(trip, { ticketId, changeDue, method: change_settlement_method, phone: normalizedPhone });
    if (!settlement.success) return settlement;

    const pnr = `BG-HAIL-${Math.floor(100 + Math.random() * 900)}`;
    const currentStop = trip.stops[trip.current_stop_index] || trip.stops[0];

    const newPassenger = {
      ticket_id: ticketId,
      pnr,
      seat_code,
      deck: seat_code.startsWith('A') ? 1 : 2,
      passenger_name,
      passenger_phone: normalizedPhone,
      phone_masked: normalizedPhone ? maskPhone(normalizedPhone) : null,
      pickup_stop_id: currentStop ? currentStop.stop_id : 'stp_hail',
      dropoff_stop_id: dropId || dropoff_stop_id,
      dropoff_stop_name: dropoff_stop_name || stops[dropIndex]?.name || trip.stops[trip.stops.length - 1]?.name,
      boarding_status: 'BOARDED',
      boarded_at: new Date(mockNow).toISOString(),
      payment_method,
      payment_status: 'SUCCESS',
      cod_amount_vnd: 0,
      is_hail_passenger: true,
      change_settlement: {
        ...settlement.data,
        amount_collected_vnd: collected,
        fare_amount_vnd: fare
      }
    };

    trip.manifest.push(newPassenger);
    trip.boarded_count += 1;
    trip.booked_passengers_count += 1;
    trip.total_hail_collected_vnd += fare;

    if (this.eventBridge && typeof this.eventBridge.emit === 'function') {
      this.eventBridge.emit('HAIL_BOARDED', { tripId, passenger: newPassenger, fareVnd: fare });
    }
    this._creditWalletIfNeeded(tripId, { ticketId, method: change_settlement_method, changeDue, phone: normalizedPhone });

    return {
      success: true,
      message: `Đón khách vẫy thành công! Ghế: ${seat_code}, đã thu ${fare.toLocaleString('vi-VN')} đ`,
      data: this._publicPassenger(newPassenger)
    };
  }

  /**
   * DRI-011: Mark Passenger as No-Show.
   * Allowed 10 minutes after the scheduled departure, or at once when the passenger asked to cancel by phone.
   * Only a passenger who is still waiting can be marked.
   */
  markNoShow(tripId, ticketId, reason = 'Quá giờ xuất bến không có mặt', { mockNow = Date.now(), passengerRequestedCancel = false } = {}) {
    const trip = this.activeTrips.get(tripId);
    if (!trip) return { success: false, error: 'Chuyến xe không tồn tại', code: 'TRIP_NOT_FOUND' };

    const item = trip.manifest.find(m => m.ticket_id === ticketId);
    if (!item) return { success: false, error: 'Không tìm thấy vé trong danh sách', code: 'TICKET_NOT_FOUND' };

    if (['BOARDED', 'NO_SHOW', 'CANCELLED'].includes(item.boarding_status)) {
      return { success: false, error: `Hành khách đang ở trạng thái ${item.boarding_status}, không thể đánh dấu vắng mặt`, code: 'INVALID_PASSENGER_STATE' };
    }

    const graceEnds = Date.parse(trip.planned_departure_time) + NO_SHOW_GRACE_MINUTES * 60 * 1000;
    if (!passengerRequestedCancel && mockNow < graceEnds) {
      return {
        success: false,
        error: `Chỉ được đánh dấu vắng mặt sau giờ xuất bến ${NO_SHOW_GRACE_MINUTES} phút`,
        code: 'NO_SHOW_TOO_EARLY'
      };
    }

    item.boarding_status = 'NO_SHOW';
    item.no_show_reason = reason;

    if (this.eventBridge && typeof this.eventBridge.emit === 'function') {
      this.eventBridge.emit('PASSENGER_NO_SHOW', {
        tripId,
        ticketId,
        pnr: item.pnr,
        seatCode: item.seat_code,
        phone: item.passenger_phone || null,
        currentStopId: trip.stops?.[trip.current_stop_index]?.stop_id || null
      });
    }

    return {
      success: true,
      data: this._publicPassenger(item)
    };
  }

  /**
   * DRI-019: Report Incident / SOS / Delay
   */
  /**
   * DRI-019: Report Incident / SOS / Delay (Polymorphic signature support)
   */
  reportIncident(tripId, payloadOrType, maybeDesc, maybeDelay, maybeLoc) {
    let type = 'TRAFFIC_JAM';
    let description = 'Sự cố vận hành';
    let estimatedDelay = 0;
    let lat = 20.98;
    let lng = 105.84;

    if (payloadOrType && typeof payloadOrType === 'object') {
      type = payloadOrType.type || payloadOrType.incident_type || payloadOrType.incidentType || 'TRAFFIC_JAM';
      description = payloadOrType.description || payloadOrType.desc || 'Sự cố vận hành';
      estimatedDelay = payloadOrType.estimated_delay_minutes || payloadOrType.estimatedDelayMinutes || payloadOrType.delay_minutes || 0;
      lat = payloadOrType.lat !== undefined ? payloadOrType.lat : (payloadOrType.location?.lat || 20.98);
      lng = payloadOrType.lng !== undefined ? payloadOrType.lng : (payloadOrType.location?.lng || 105.84);
    } else {
      type = payloadOrType || 'TRAFFIC_JAM';
      description = maybeDesc || 'Sự cố vận hành';
      estimatedDelay = maybeDelay || 0;
      if (maybeLoc && typeof maybeLoc === 'object') {
        lat = maybeLoc.lat || 20.98;
        lng = maybeLoc.lng || 105.84;
      }
    }

    const trip = this.activeTrips.get(tripId);
    const incident = {
      incident_id: `inc_${Date.now()}`,
      trip_id: tripId,
      vehicle_plate: trip ? trip.vehicle_plate : '29B-882.19',
      type,
      description,
      estimated_delay_minutes: parseInt(estimatedDelay, 10) || 0,
      location: { lat, lng },
      reported_at: new Date().toISOString()
    };

    this.incidents.push(incident);

    if (this.eventBridge && typeof this.eventBridge.emit === 'function') {
      this.eventBridge.emit('INCIDENT_ALERT', { tripId, incident });
    }

    return {
      success: true,
      message: 'Đã gửi báo cáo khẩn về trung tâm Điều hành (ATC Radar)',
      data: incident
    };
  }

  /**
   * DRI-015: Flush Buffered Offline Telemetry
   */
  flushOfflineQueue() {
    const count = this.offlineQueue.length;
    this.offlineQueue = [];
    return {
      success: true,
      replayed_count: count,
      message: `Đã đồng bộ ${count} bản ghi telemetry ngoại tuyến về máy chủ.`
    };
  }

  /**
   * DRI-015: Replay Offline Telemetry Buffer.
   * Pings are applied oldest first, a ping already replayed is skipped, a ping older than the newest known
   * position never overwrites it, and replayed pings leave the offline queue. Invalid pings are skipped.
   */
  replayOfflineBuffer(telemetryBuffer = [], mockNow = Date.now()) {
    const buffer = Array.isArray(telemetryBuffer) ? telemetryBuffer : [];
    const pings = [];
    let invalidSkipped = 0;

    buffer.forEach((item, index) => {
      const tripId = item.trip_id || item.tripId;
      const trip = this.activeTrips.get(tripId);
      const lat = parseFloat(item.lat);
      const lng = parseFloat(item.lng);
      const speed = item.speed_kmh === undefined ? 0 : parseFloat(item.speed_kmh);
      // A ping without a timestamp keeps the order it has in the buffer
      const at = item.timestamp ? Date.parse(item.timestamp) : mockNow + index;
      const valid = trip
        && Number.isFinite(lat) && lat >= -90 && lat <= 90
        && Number.isFinite(lng) && lng >= -180 && lng <= 180
        && Number.isFinite(speed) && speed >= 0
        && Number.isFinite(at);
      if (!valid) {
        invalidSkipped += 1;
        return;
      }
      pings.push({
        tripId,
        trip,
        at,
        hasTimestamp: Boolean(item.timestamp),
        data: {
          trip_id: tripId,
          vehicle_plate: trip.vehicle_plate || item.vehicle_plate,
          lat,
          lng,
          speed_kmh: speed,
          bearing_deg: parseInt(item.bearing_deg, 10) || 0,
          timestamp: new Date(at).toISOString()
        }
      });
    });

    pings.sort((a, b) => a.at - b.at);

    let replayed = 0;
    let positionUpdates = 0;
    let duplicatesSkipped = 0;
    const lastApplied = new Map();
    const processedKeys = new Set();

    for (const ping of pings) {
      const key = `${ping.tripId}|${ping.at}`;
      ping.trip.replayed_keys = ping.trip.replayed_keys || new Set();
      if (ping.hasTimestamp && ping.trip.replayed_keys.has(key)) {
        duplicatesSkipped += 1;
        continue;
      }
      ping.trip.replayed_keys.add(key);
      processedKeys.add(key);
      replayed += 1;

      if (ping.at >= (ping.trip.last_telemetry_at || 0)) {
        ping.trip.current_lat = ping.data.lat;
        ping.trip.current_lng = ping.data.lng;
        ping.trip.current_speed_kmh = ping.data.speed_kmh;
        ping.trip.last_telemetry_at = ping.at;
        positionUpdates += 1;
        lastApplied.set(ping.tripId, ping.data);
      }
    }

    this.offlineQueue = this.offlineQueue.filter(p => !processedKeys.has(`${p.trip_id}|${Date.parse(p.timestamp)}`));

    if (this.eventBridge && typeof this.eventBridge.emit === 'function') {
      for (const [tripId, telemetry] of lastApplied) {
        this.eventBridge.emit('DRIVER_TELEMETRY', { tripId, telemetry });
      }
    }

    return {
      success: true,
      replayed_count: replayed,
      position_updates: positionUpdates,
      duplicates_skipped: duplicatesSkipped,
      invalid_skipped: invalidSkipped,
      message: `Đã phát lại ${replayed} bản ghi telemetry (bỏ qua ${duplicatesSkipped} trùng, ${invalidSkipped} không hợp lệ).`
    };
  }

  /**
   * DRI-017: End Trip at final terminal.
   * Cash is reconciled on the server from the manifest; totals sent by the client are ignored. A trip ends once.
   */
  endTrip(tripId) {
    const trip = this.activeTrips.get(tripId);
    if (!trip) return { success: false, error: 'Chuyến xe không tồn tại', code: 'TRIP_NOT_FOUND' };
    if (trip.status !== 'IN_TRANSIT') {
      return { success: false, error: `Chuyến xe ở trạng thái ${trip.status}, không thể kết thúc`, code: 'INVALID_TRIP_STATE' };
    }

    const count = (status) => trip.manifest.filter(m => m.boarding_status === status).length;
    const settledStatuses = ['BOARDED', 'NO_SHOW', 'CANCELLED'];
    const summary = {
      trip_id: tripId,
      trip_status: 'COMPLETED',
      status: 'COMPLETED',
      total_passengers: trip.booked_passengers_count,
      boarded_count: trip.boarded_count,
      total_boarded: count('BOARDED'),
      total_no_show: count('NO_SHOW'),
      unresolved_passenger_count: trip.manifest.filter(m => !settledStatuses.includes(m.boarding_status)).length,
      total_cod_collected_vnd: trip.total_cod_collected_vnd,
      total_hail_collected_vnd: trip.total_hail_collected_vnd,
      total_cash_to_handover_vnd: trip.total_cod_collected_vnd + trip.total_hail_collected_vnd,
      debt_receipts_summary: {
        total_count: trip.debts.length,
        total_amount_vnd: trip.debts.reduce((sum, d) => sum + d.amount_vnd, 0),
        receipt_codes: trip.debts.map(d => d.receipt_code)
      },
      financial_reconciliation_status: 'PENDING_DEPOT_SETTLEMENT',
      completed_at: new Date().toISOString()
    };

    trip.status = 'COMPLETED';
    trip.completed_at = summary.completed_at;

    if (this.eventBridge && typeof this.eventBridge.emit === 'function') {
      this.eventBridge.emit('TRIP_COMPLETED', {
        tripId,
        summary: {
          vehicle_plate: trip.vehicle_plate,
          total_passengers: trip.booked_passengers_count,
          boarded_count: trip.boarded_count
        }
      });
    }

    return { success: true, data: summary };
  }
}
