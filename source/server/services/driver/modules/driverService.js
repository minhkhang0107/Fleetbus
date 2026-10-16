/**
 * FleetBus Driver Tactical Cockpit Service
 * Implements DRI-001 through DRI-019 for the commercial driver mobile/tablet platform.
 */

import { homeConfirmed } from '../../../core/serviceAreas.js';
import { homeAppointments, homeOrder, homeQueue, homeWaitMinutes, isWaitingHome, missableAt } from '../../../core/homeRun.js';
import crypto from 'crypto';
import {
  generateBoardingQR,
  generateTicketPin,
  verifyBoardingQR,
  verifyGroupBoardingQR,
  verifyTicketPin
} from '../../passenger/core/cryptoEngine.js';
import { getTicketSecret, isProduction } from '../../../config.js';
import { maskPhone, validateVietnamPhone } from '../../passenger/core/formatters.js';
import { signToken, TOKEN_PREFIXES } from '../../../core/tokens.js';
import { hashSecret, verifySecret, LoginGuard } from '../../../core/passwords.js';
import { stopCoords, routeShape } from '../../../core/geo.js';
import { DEFAULT_OPERATOR_ID, findOperatorById, publicOperatorProfile } from '../../../core/operators.js';
import { DEMO_DATE, vnDate } from '../../../core/serviceDate.js';

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
    status: 'ACTIVE',
    must_change_pin: false,
    operator_id: 'op_saomai'
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
    status: 'LICENSE_EXPIRED',
    must_change_pin: false,
    operator_id: 'op_saomai'
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
    status: 'ACTIVE',
    must_change_pin: false,
    operator_id: 'op_saomai'
  },
  {
    driver_id: 'drv_xv_7701',
    staff_id: 'TX7701',
    phone: '0901777001',
    pin: hashSecret('246810'),
    full_name: 'Đỗ Minh Khoa',
    license_class: 'FC',
    license_valid_until: '2029-03-31',
    is_license_expired: false,
    assigned_vehicle_plate: '30H-246.80',
    status: 'ACTIVE',
    must_change_pin: false,
    operator_id: 'op_xuyenviet'
  }
];

// Spec 5.1 state names, mapped from the statuses the apps already use (adjustment A5).
function tripLifecycle(status) {
  return { DISPATCHED: 'SCHEDULED', SCHEDULED: 'SCHEDULED', READY: 'BOARDING', IN_TRANSIT: 'IN_PROGRESS', COMPLETED: 'COMPLETED', CANCELLED: 'CANCELLED' }[status] || status;
}

function stopLifecycle(trip, stop, index) {
  if (stop.skipped_at) return 'SKIPPED';
  if (stop.status === 'ARRIVED') return index < trip.current_stop_index || trip.status === 'COMPLETED' ? 'COMPLETED' : 'ARRIVED';
  return 'UPCOMING';
}

const text = (v) => (v == null ? '' : String(v).trim());

export class DriverCockpitService {
  constructor(options = {}) {
    this.secretKey = options.secretKey || getTicketSecret();
    this.loginGuard = new LoginGuard();
    this.activeTrips = new Map(); // tripId -> TripState
    this.offlineQueue = []; // buffered telemetry pings
    this.incidents = [];

    this._initMockShiftTrips();
    // The seed trips as they start: the model of each schedule's run on another day.
    this.tripTemplates = new Map([...this.activeTrips].map(([id, t]) => [id, structuredClone(t)]));
  }

  _initMockShiftTrips() {
    const trip1 = {
      trip_id: 'trp_991823',
      operator_id: 'op_saomai',
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
      operator_id: 'op_saomai',
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
      booked_passengers_count: 0,
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
        { stop_id: 'stp_hn_gb', name: 'Bến xe Giáp Bát', city: 'Hà Nội', order: 1, expected_board: 0, expected_alight: 0, status: 'PENDING' },
        { stop_id: 'stp_hn_nuoc_ngam', name: 'Bến xe Nước Ngầm', city: 'Hà Nội', order: 2, expected_board: 0, expected_alight: 0, status: 'PENDING' },
        { stop_id: 'stp_rs_phap_van', name: 'Nút giao Pháp Vân', city: 'Hà Nội', order: 3, kind: 'ROADSIDE', expected_board: 0, expected_alight: 0, status: 'PENDING' },
        { stop_id: 'stp_rs_phu_ly', name: 'Nút giao Phủ Lý (cao tốc)', city: 'Hà Nam', order: 4, kind: 'ROADSIDE', expected_board: 0, expected_alight: 0, status: 'PENDING' },
        { stop_id: 'stp_nb', name: 'Bến xe Ninh Bình', city: 'Ninh Bình', order: 5, expected_board: 0, expected_alight: 0, status: 'PENDING' },
        { stop_id: 'stp_rs_bim_son', name: 'Ngã ba Bỉm Sơn', city: 'Thanh Hóa', order: 6, kind: 'ROADSIDE', expected_board: 0, expected_alight: 0, status: 'PENDING' },
        { stop_id: 'stp_th_pb', name: 'Bến xe Phía Bắc Thanh Hóa', city: 'Thanh Hóa', order: 7, expected_board: 0, expected_alight: 0, status: 'PENDING' },
        { stop_id: 'stp_th_sam_son', name: 'Bến xe Sầm Sơn', city: 'Thanh Hóa', order: 8, expected_board: 0, expected_alight: 0, status: 'PENDING' }
      ],
      // Starts empty: its tickets are sold in the passenger app and arrive through the event bridge,
      // so the driver manifest and the passenger seat map stay the same seats.
      manifest: []
    };

    const trip3 = {
      trip_id: 'trp_xv_hn_th_01',
      operator_id: 'op_xuyenviet',
      driver_id: 'drv_xv_7701',
      base_fare_vnd: 200000,
      debts: [],
      total_hail_collected_vnd: 0,
      route_name: 'Hà Nội — Thanh Hóa (Xuyên Việt)',
      planned_departure_time: '2026-08-28T08:30:00+07:00',
      status: 'READY',
      vehicle_plate: '30H-246.80',
      vehicle_model: 'Cabin Cung Điện VIP 22 Phòng',
      total_capacity: 22,
      booked_passengers_count: 0,
      boarded_count: 0,
      total_cod_collected_vnd: 0,
      current_speed_kmh: 0,
      current_lat: 21.0285,
      current_lng: 105.7787,
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
        { stop_id: 'stp_hn_my_dinh', name: 'Bến xe Mỹ Đình', city: 'Hà Nội', order: 1, expected_board: 0, expected_alight: 0, status: 'PENDING' },
        { stop_id: 'stp_nb', name: 'Bến xe Ninh Bình', city: 'Ninh Bình', order: 2, expected_board: 0, expected_alight: 0, status: 'PENDING' },
        { stop_id: 'stp_th_pb', name: 'Bến xe Phía Bắc Thanh Hóa', city: 'Thanh Hóa', order: 3, expected_board: 0, expected_alight: 0, status: 'PENDING' }
      ],
      manifest: []
    };

    this.activeTrips.set(trip1.trip_id, trip1);
    this.activeTrips.set(trip2.trip_id, trip2);
    this.activeTrips.set(trip3.trip_id, trip3);
  }

  /**
   * DRI-001: Driver Authentication & License Verification
   */
  authenticateDriver(staffIdOrPhone, pin, deviceInfo = {}, mockNow = Date.now(), operatorId = DEFAULT_OPERATOR_ID) {
    const input = (staffIdOrPhone || '').trim().toUpperCase();
    const loginKey = `${operatorId}:${input}`;

    const lockedFor = this.loginGuard.isLocked(loginKey, mockNow);
    if (lockedFor > 0) {
      return {
        success: false,
        error: `Tài khoản tạm khóa do nhập sai nhiều lần. Thử lại sau ${Math.ceil(lockedFor / 60)} phút`,
        code: 'ACCOUNT_LOCKED',
        retry_after_seconds: lockedFor
      };
    }

    const driver = MOCK_DRIVERS_DB.find(d => 
      (d.staff_id === input || d.phone === input) && 
      (d.operator_id || DEFAULT_OPERATOR_ID) === operatorId
    );

    if (!driver || !verifySecret(String(pin ?? ''), driver.pin)) {
      this.loginGuard.fail(loginKey, mockNow);
      return { success: false, error: 'Mã nhân viên hoặc mã PIN không chính xác', code: 'INVALID_CREDENTIALS' };
    }
    this.loginGuard.succeed(loginKey);

    if (driver.status === 'LOCKED') {
      return {
        success: false,
        error: 'Tài khoản đã bị nhà xe khóa. Liên hệ điều độ.',
        code: 'DRIVER_LOCKED'
      };
    }

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
      { sub: driver.driver_id, staff_id: driver.staff_id, role: 'ROLE_DRIVER', kind: 'driver', operator_id: operatorId },
      { prefix: TOKEN_PREFIXES.driver, ttlSeconds: 12 * 3600, now: mockNow }
    );

    const op = findOperatorById(operatorId);

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
          assigned_vehicle_plate: driver.assigned_vehicle_plate,
          must_change_pin: Boolean(driver.must_change_pin)
        },
        operator: publicOperatorProfile(op),
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
   * DRI-001: Driver PIN Change
   */
  changePin(driverId, { currentPin, newPin } = {}, operatorId = DEFAULT_OPERATOR_ID) {
    const driver = MOCK_DRIVERS_DB.find(d =>
      d.driver_id === driverId &&
      (d.operator_id || DEFAULT_OPERATOR_ID) === operatorId
    );
    if (!driver) {
      return { success: false, error: 'Không tìm thấy tài xế', code: 'DRIVER_NOT_FOUND', status: 404 };
    }
    if (driver.status === 'LOCKED') {
      return { success: false, error: 'Tài khoản đã bị nhà xe khóa. Liên hệ điều độ.', code: 'DRIVER_LOCKED', status: 403 };
    }

    const cur = String(currentPin ?? '');
    const next = String(newPin ?? '');

    if (!/^[0-9]{6}$/.test(next)) {
      return { success: false, error: 'Mã PIN mới phải gồm đúng 6 chữ số', code: 'WEAK_PIN', status: 400 };
    }
    if (next === cur) {
      return { success: false, error: 'Mã PIN mới không được trùng với mã PIN hiện tại', code: 'WEAK_PIN', status: 400 };
    }
    const isAllSame = new Set(next.split('')).size === 1;
    const RUNS = ['012345', '123456', '234567', '345678', '456789', '987654', '876543', '765432', '654321', '543210'];
    if (isAllSame || next === '000000' || RUNS.includes(next)) {
      return { success: false, error: 'Mã PIN mới quá yếu hoặc dễ đoán', code: 'WEAK_PIN', status: 400 };
    }

    const loginKey = `${driver.operator_id || operatorId}:${driver.staff_id}`;
    const phoneKey = `${driver.operator_id || operatorId}:${driver.phone}`;

    if (!verifySecret(cur, driver.pin)) {
      this.loginGuard.fail(loginKey);
      this.loginGuard.fail(phoneKey);
      return { success: false, error: 'Mã PIN hiện tại không chính xác', code: 'INVALID_CREDENTIALS', status: 400 };
    }

    driver.pin = hashSecret(next);
    driver.must_change_pin = false;
    this.loginGuard.succeed(loginKey);
    this.loginGuard.succeed(phoneKey);

    return { success: true };
  }

  /**
   * OQ-007: what the driver app may see of a passenger. The raw phone stays on the server
   * (it is needed for notifications) and never leaves in an API response.
   */
  _publicPassenger(passenger) {
    const { passenger_phone: rawPhone, phone: rawPhone2, ...rest } = passenger;
    const phoneToMask = rawPhone || rawPhone2;
    return { ...rest, phone_masked: rest.phone_masked || (phoneToMask ? maskPhone(phoneToMask) : null) };
  }

  /**
   * Operational events of a trip (spec 5.3): who did what, when, to which ticket or stop. Manual boardings are
   * flagged so the office can review corrections.
   */
  _event(trip, type, fields = {}, at = Date.now()) {
    if (!trip.events) trip.events = [];
    trip.events.push({ type, trip_id: trip.trip_id, actor: trip.driver_id || null, at: new Date(at).toISOString(), ...fields });
    if (trip.events.length > 2000) trip.events.shift();
  }

  /** Passenger counts of each stop (spec 5.2): to pick up, boarded, excluded (no-show/cancelled), to drop off. */
  _stopCounts(trip, stopId) {
    const pickups = (trip.manifest || []).filter(p => p.pickup_stop_id === stopId);
    return {
      confirmed: pickups.filter(p => p.boarding_status !== 'CANCELLED').length,
      boarded: pickups.filter(p => p.boarding_status === 'BOARDED').length,
      excluded: pickups.filter(p => ['NO_SHOW', 'CANCELLED'].includes(p.boarding_status)).length,
      home_pickups: pickups.filter(p => homeConfirmed(p.home_pickup) && p.boarding_status !== 'CANCELLED').length,
      dropoffs: (trip.manifest || []).filter(p => p.dropoff_stop_id === stopId && p.boarding_status === 'BOARDED').length,
      alighted: (trip.manifest || []).filter(p => p.dropoff_stop_id === stopId && p.alighted_at).length
    };
  }

  _publicTrip(trip) {
    const stops = (trip.stops || []).map((s, index) => {
      const extra = { lifecycle_status: stopLifecycle(trip, s, index), counts: this._stopCounts(trip, s.stop_id) };
      const coords = stopCoords(s.stop_id);
      if (coords) {
        return { ...s, ...extra, lat: coords.lat, lng: coords.lng };
      }
      const { lat, lng, ...rest } = s;
      return { ...rest, ...extra };
    });
    const { events, telemetry_history: history, ...rest } = trip;
    return {
      ...rest,
      lifecycle_status: tripLifecycle(trip.status),
      on_board_count: trip.boarded_count - (trip.alighted_count || 0),
      stops,
      route_shape: routeShape(trip.trip_id) || null,
      home_run: this._homeRunView(trip),
      manifest: (trip.manifest || []).map(p => this._publicPassenger(p))
    };
  }

  /** Stops with their counts and the event log of a trip, for the office (spec 5.2, 5.3). */
  getTripOperations(tripId) {
    const trip = this.activeTrips.get(tripId);
    if (!trip) return { success: false, error: 'Không tìm thấy chuyến xe', code: 'TRIP_NOT_FOUND' };
    const pub = this._publicTrip(trip);
    return {
      success: true,
      data: {
        trip_id: tripId,
        status: trip.status,
        lifecycle_status: pub.lifecycle_status,
        on_board_count: pub.on_board_count,
        stops: pub.stops.map(({ stop_id, name, order, time, lifecycle_status, counts, arrived_at, skipped_at }) => ({ stop_id, name, order, time, lifecycle_status, counts, arrived_at: arrived_at || null, skipped_at: skipped_at || null })),
        home_pickups: (() => {
          // D144: in collection order, with each passenger's time, answer and what happened at the door.
          const run = this._homeRunView(trip);
          const at = Object.fromEntries((run?.stops || []).map(s => [s.ticket_id, s]));
          const ordered = [...(run?.stops || []).map(s => trip.manifest.find(p => p.ticket_id === s.ticket_id)), ...trip.manifest.filter(p => homeConfirmed(p.home_pickup) && !at[p.ticket_id])];
          return ordered.filter(p => p && homeConfirmed(p.home_pickup) && p.boarding_status !== 'CANCELLED').map(p => ({
            ticket_id: p.ticket_id, seat_code: p.seat_code, boarding_status: p.boarding_status, address: p.home_pickup.address,
            window_from: p.home_pickup.window_from || null, window_to: p.home_pickup.window_to || null,
            position: at[p.ticket_id]?.position || null, appointment_at: at[p.ticket_id]?.appointment_at || null,
            ready: p.pickup_ready || null, arrived_at: p.home_pickup.arrived_at || null, missed_at: p.home_pickup.missed_at || null,
            inaccessible_at: p.home_pickup.inaccessible_at || null, source: p.source || null
          }));
        })(),
        events: [...(trip.events || [])].reverse()
      }
    };
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
        manifest: trip.manifest.map(p => ({ ...this._publicPassenger(p), boarding_check: this._boardingCheck(p) }))
      }
    };
  }

  /**
   * What an offline tablet needs to check a scan of this ticket (DRI-009, D104): the signature its
   * current QR must carry and a digest of its PIN. No shared secret ever leaves the server, so a lost
   * tablet exposes one trip at most, never the means to forge any ticket.
   */
  _boardingCheck(passenger) {
    const version = passenger.qr_version || 1;
    const pin = generateTicketPin(passenger.ticket_id, this.secretKey, version);
    return {
      qr_version: version,
      qr_digest: generateBoardingQR({ ...passenger, qr_version: version }, this.secretKey).hmac_signature,
      pin_digest: crypto.createHash('sha256').update(`${passenger.ticket_id}|${pin}`).digest('hex')
    };
  }

  /**
   * DRI-002: Get Today Assigned Trips (only the trips assigned to this driver)
   */
  /**
   * The driver trip of a schedule's run on another day: same driver, bus and stops as the schedule, no
   * passengers yet, the vehicle check to do again. Null when the schedule has no driver trip.
   */
  createRunTrip(templateId, runTripId, departureTime) {
    if (this.activeTrips.has(runTripId)) return this.activeTrips.get(runTripId);
    const template = this.tripTemplates?.get(templateId);
    if (!template) return null;
    const first = template.stops?.[0] ? stopCoords(template.stops[0].stop_id) : null;
    const trip = {
      ...structuredClone(template),
      trip_id: runTripId,
      schedule_id: templateId,
      planned_departure_time: departureTime,
      status: 'DISPATCHED',
      manifest: [],
      debts: [],
      events: [],
      booked_passengers_count: 0,
      boarded_count: 0,
      alighted_count: 0,
      total_cod_collected_vnd: 0,
      total_hail_collected_vnd: 0,
      current_stop_index: 0,
      current_speed_kmh: 0,
      current_lat: first?.lat ?? template.current_lat,
      current_lng: first?.lng ?? template.current_lng,
      readiness_checklist: Object.fromEntries(Object.keys(template.readiness_checklist || {}).map(k => [k, false])),
      stops: (template.stops || []).map(({ arrived_at, skipped_at, ...s }) => ({ ...s, status: 'PENDING' }))
    };
    this.activeTrips.set(runTripId, trip);
    return trip;
  }

  /**
   * The office gave a trip its bus and driver (MGR-017): the driver trip follows, created when there is none yet
   * (from the schedule's trip, else from the passenger catalog trip).
   */
  applyAssignment(tripId, { driverId, vehiclePlate, vehicleModel, capacity }, catalogTrip = null, scheduleId = null) {
    let trip = this.activeTrips.get(tripId);
    if (!trip && scheduleId && catalogTrip) trip = this.createRunTrip(scheduleId, tripId, catalogTrip.departure_time);
    if (!trip && catalogTrip) {
      const first = catalogTrip.stops?.[0] ? stopCoords(catalogTrip.stops[0].stop_id) : null;
      trip = {
        trip_id: tripId,
        schedule_id: scheduleId || null,
        operator_id: catalogTrip.operator_id || DEFAULT_OPERATOR_ID,
        base_fare_vnd: catalogTrip.base_fare_vnd,
        route_name: catalogTrip.route_name,
        planned_departure_time: catalogTrip.departure_time,
        status: 'DISPATCHED',
        manifest: [],
        debts: [],
        events: [],
        booked_passengers_count: 0,
        boarded_count: 0,
        alighted_count: 0,
        total_cod_collected_vnd: 0,
        total_hail_collected_vnd: 0,
        current_speed_kmh: 0,
        current_lat: first?.lat ?? null,
        current_lng: first?.lng ?? null,
        current_stop_index: 0,
        readiness_checklist: Object.fromEntries(['tires_checked', 'brakes_fluid_checked', 'ac_cleanliness_checked', 'first_aid_extinguisher_checked', 'fuel_level_sufficient', 'gps_telemetry_beacon_active'].map(k => [k, false])),
        stops: (catalogTrip.stops || []).map(({ stop_id, name, city, order, kind }) => ({ stop_id, name, city, order, kind, expected_board: 0, expected_alight: 0, status: 'PENDING' }))
      };
      this.activeTrips.set(tripId, trip);
    }
    if (!trip) return null;
    trip.driver_id = driverId;
    trip.vehicle_plate = vehiclePlate;
    if (vehicleModel) trip.vehicle_model = vehicleModel;
    if (capacity) trip.total_capacity = capacity;
    return trip;
  }

  /** The driver's trips of today (Vietnam time); outside production the seed demo day too. */
  getTodayTrips(driverId, now = Date.now()) {
    const today = vnDate(now);
    const trips = Array.from(this.activeTrips.values())
      .filter(t => t.driver_id === driverId)
      .filter(t => {
        const day = t.planned_departure_time ? vnDate(Date.parse(t.planned_departure_time)) : null;
        return !day || day === today || (!isProduction() && day === DEMO_DATE);
      })
      .sort((a, b) => Date.parse(a.planned_departure_time || 0) - Date.parse(b.planned_departure_time || 0))
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
    // Stops are served in order: the bus cannot come back to a stop it has left without visiting (spec 5.1).
    if (stop.status !== 'ARRIVED' && index < trip.current_stop_index) {
      return { success: false, error: `Xe đã qua ${stop.name}, không thể báo tới trạm này`, code: 'STOP_OUT_OF_ORDER' };
    }
    if (stop.status !== 'ARRIVED') {
      // Stops between the last one reached and this one were passed without a visit.
      for (let i = trip.current_stop_index; i < index; i++) {
        const passed = trip.stops[i];
        if (passed.status !== 'ARRIVED' && !passed.skipped_at) {
          passed.skipped_at = new Date(mockNow).toISOString();
          this._event(trip, 'STOP_SKIPPED', { stop_id: passed.stop_id }, mockNow);
        }
      }
      stop.status = 'ARRIVED';
      stop.arrived_at = new Date(mockNow).toISOString();
      this._event(trip, 'STOP_ARRIVED', { stop_id: stop.stop_id }, mockNow);
    }
    trip.current_stop_index = Math.max(trip.current_stop_index, index);

    // F: Drop-off logic
    const alightedTicketIds = [];
    if (!trip.alighted_count) trip.alighted_count = 0;
    
    for (const p of trip.manifest) {
      if (p.dropoff_stop_id === stopId && p.boarding_status === 'BOARDED' && !p.alighted_at) {
        p.alighted_at = new Date(mockNow).toISOString();
        trip.alighted_count += 1;
        alightedTicketIds.push(p.ticket_id);
        this._event(trip, 'ALIGHTED', { ticket_id: p.ticket_id, seat_code: p.seat_code, stop_id: stopId }, mockNow);
      }
    }

    if (alightedTicketIds.length > 0 && this.eventBridge && typeof this.eventBridge.emit === 'function') {
      this.eventBridge.emit('PASSENGERS_ALIGHTED', { tripId, stopId, ticketIds: alightedTicketIds });
    }

    // Emit STOP_ARRIVED for hotline release logic
    if (this.eventBridge && typeof this.eventBridge.emit === 'function') {
      this.eventBridge.emit('STOP_ARRIVED', { tripId, stopId, index });
    }

    return { success: true, data: stop };
  }

  /**
   * DRI-004: Submit Pre-Start Vehicle Readiness Inspection
   */
  submitReadinessChecklist(tripId, checklist = {}) {
    const trip = this.activeTrips.get(tripId);
    if (!trip) return { success: false, error: 'Chuyến xe không tồn tại', code: 'TRIP_NOT_FOUND' };
    if (trip.status === 'CANCELLED') return { success: false, error: 'Nhà xe đã hủy chuyến này', code: 'TRIP_CANCELLED' };

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
    this._event(trip, 'TRIP_STARTED');

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
   * DRI-006: Ingest GPS telemetry (spec 6.1, 6.4). A ping older than the last applied one (by seq, else by device time)
   * is ignored; one recorded over 120 s ago is kept as history only; one less accurate than 200 m is refused.
   */
  recordTelemetry(tripId, { lat, lng, speed_kmh, bearing_deg, seq, recorded_at, accuracy_m, is_offline = false, mockNow = Date.now() }) {
    const trip = this.activeTrips.get(tripId);
    if (!trip) return { success: false, error: 'Chuyến xe không tồn tại', code: 'TRIP_NOT_FOUND' };
    // Before departure the bus already moves while it collects home pickups (D143): its positions count then too.
    const homeRun = trip.home_run_started_at && !['COMPLETED', 'CANCELLED'].includes(trip.status);
    if (trip.status !== 'IN_TRANSIT' && !homeRun) {
      return { success: false, error: 'Chuyến xe chưa chạy hoặc đã kết thúc', code: 'TRIP_NOT_ACTIVE' };
    }

    if (accuracy_m !== undefined && parseFloat(accuracy_m) > 200) {
      return { success: false, error: 'Độ chính xác GPS quá thấp', code: 'LOW_ACCURACY' };
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

    const seqNum = seq === undefined || seq === null ? undefined : Number(seq);
    if (seqNum !== undefined && (!Number.isInteger(seqNum) || seqNum < 0)) {
      return { success: false, error: 'Số thứ tự bản tin GPS không hợp lệ', code: 'INVALID_TELEMETRY' };
    }
    let at = mockNow;
    if (recorded_at !== undefined && recorded_at !== null) {
      at = typeof recorded_at === 'string' ? Date.parse(recorded_at) : Number(recorded_at);
      if (!Number.isFinite(at)) return { success: false, error: 'Thời điểm ghi vị trí không hợp lệ', code: 'INVALID_TELEMETRY' };
      // A device clock ahead of the server must not lock out the next pings.
      at = Math.min(at, mockNow);
    }
    seq = seqNum;

    if (seq !== undefined && trip.last_seq !== undefined && seq <= trip.last_seq) {
      return { success: true, accepted: false, reason: 'STALE' };
    }
    if (seq === undefined && trip.last_telemetry_at && at < trip.last_telemetry_at) {
      return { success: true, accepted: false, reason: 'STALE' };
    }

    const ping = {
      trip_id: tripId,
      vehicle_plate: trip.vehicle_plate,
      lat: latNum,
      lng: lngNum,
      speed_kmh: speedNum,
      bearing_deg: parseInt(bearing_deg, 10) || 0,
      timestamp: new Date(at).toISOString(),
      seq,
      accuracy_m: accuracy_m !== undefined ? parseFloat(accuracy_m) : undefined,
      recorded_at: new Date(at).toISOString()
    };

    if (!trip.telemetry_history) trip.telemetry_history = [];
    trip.telemetry_history.push(ping);
    if (trip.telemetry_history.length > 500) trip.telemetry_history.shift();

    if (mockNow - at > 120000) {
      return { success: true, accepted: false, reason: 'TOO_OLD' };
    }

    trip.current_lat = ping.lat;
    trip.current_lng = ping.lng;
    trip.current_speed_kmh = ping.speed_kmh;
    trip.last_telemetry_at = at;
    if (seq !== undefined) trip.last_seq = seq;

    if (is_offline) {
      this.offlineQueue.push(ping);
    }

    if (this.eventBridge && typeof this.eventBridge.emit === 'function') {
      this.eventBridge.emit('DRIVER_TELEMETRY', { tripId, telemetry: ping });
    }

    return {
      success: true,
      accepted: true,
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
    this._event(trip, 'BOARDED', {
      ticket_id: passenger.ticket_id,
      seat_code: passenger.seat_code,
      stop_id: trip.stops?.[trip.current_stop_index]?.stop_id || null,
      method: scanMethod || 'SCAN',
      manual: scanMethod === 'MANUAL_OVERRIDE'
    }, mockNow);

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
   * DRI-009 / DRI-010: board by the static boarding QR, the group QR or the backup PIN (D104).
   * Tickets are matched on ticket_id within this trip's manifest only, and the QR or PIN must be
   * of the ticket's current version: a reissued ticket revokes its older copies (QR_REVOKED).
   */
  boardPassengerByQR(tripId, inputString, mockNow = Date.now()) {
    const trip = this.activeTrips.get(tripId);
    if (!trip) return { success: false, error: 'Chuyến xe không tồn tại' };
    if (!inputString || typeof inputString !== 'string') return { success: false, error: 'Dữ liệu quét không được để trống' };
    const versionOf = (passenger) => passenger.qr_version || 1;
    const revoked = (passenger) => ({ success: false, error: `Mã QR của ghế ${passenger.seat_code} đã được khách đổi. Đề nghị khách mở lại vé trong app.`, code: 'QR_REVOKED' });

    // Group boarding QR (BUSGO_GRP|...)
    if (inputString.startsWith('BUSGO_GRP|')) {
      const groupCheck = verifyGroupBoardingQR(inputString, this.secretKey);
      if (!groupCheck.isValid) {
        return { success: false, error: `Mã QR nhóm không hợp lệ (${groupCheck.reason})`, code: groupCheck.reason };
      }

      const onTrip = groupCheck.members
        .map(m => ({ member: m, passenger: trip.manifest.find(p => p.ticket_id === m.ticket_id) }))
        .filter(x => x.passenger);
      if (onTrip.length === 0) {
        return { success: false, error: 'Vé không thuộc chuyến xe này', code: 'TICKET_WRONG_TRIP' };
      }

      const boardedList = [];
      const codPending = [];
      const revokedList = [];
      for (const { member, passenger } of onTrip) {
        if (passenger.boarding_status === 'BOARDED') continue;
        if (member.version !== versionOf(passenger)) {
          revokedList.push(passenger);
          continue;
        }
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
          cod_pending_passengers: codPending.map(p => this._publicPassenger(p)),
          revoked_passengers: revokedList.map(p => this._publicPassenger(p))
        }
      };
    }

    // Backup PIN (PIN:ticketId:pin), entered by the driver (DRI-010)
    if (inputString.startsWith('PIN:')) {
      const [, ticketId, pin] = inputString.split(':');
      const passenger = trip.manifest.find(m => m.ticket_id === ticketId);
      if (!passenger) {
        return { success: false, error: 'Vé không thuộc chuyến xe này', code: 'TICKET_WRONG_TRIP' };
      }
      if (!verifyTicketPin(ticketId, pin, this.secretKey, versionOf(passenger)).isValid) {
        return { success: false, error: 'Mã PIN vé không chính xác', code: 'INVALID_PIN' };
      }
      return this._boardOne(tripId, trip, passenger, mockNow, 'Xác thực PIN thành công');
    }

    // Single boarding QR (BUSGO|pnr|ticket|v<n>|hmac)
    const qrCheck = verifyBoardingQR(inputString, this.secretKey);
    if (!qrCheck.isValid) {
      return { success: false, error: `Mã QR không hợp lệ (${qrCheck.reason})`, code: qrCheck.reason };
    }
    const passenger = trip.manifest.find(m => m.ticket_id === qrCheck.ticket_id);
    if (!passenger) {
      return { success: false, error: 'Vé không thuộc chuyến xe này', code: 'TICKET_WRONG_TRIP' };
    }
    if (passenger.boarding_status !== 'BOARDED' && qrCheck.version !== versionOf(passenger)) return revoked(passenger);
    return this._boardOne(tripId, trip, passenger, mockNow, 'Soát vé thành công');
  }

  /** Shared tail of the single-ticket boarding paths: one boarding per ticket, COD first. */
  _boardOne(tripId, trip, passenger, mockNow, label) {
    if (passenger.boarding_status === 'BOARDED') {
      return { success: false, error: `Khách ${passenger.passenger_name} (Ghế ${passenger.seat_code}) đã lên xe trước đó!`, code: 'ALREADY_BOARDED' };
    }
    const codRefusal = this._codPaymentRequired(passenger);
    if (codRefusal) return codRefusal;

    this._markBoarded(tripId, trip, passenger, mockNow);
    return {
      success: true,
      message: `${label}: ${passenger.passenger_name} · Ghế ${passenger.seat_code}`,
      data: this._publicPassenger(passenger)
    };
  }

  /**
   * Keeps the manifest copy of a ticket on the version the passenger holds (PAX-017 reissue).
   */
  setTicketQrVersion(tripId, ticketId, version) {
    const passenger = this.activeTrips.get(tripId)?.manifest.find(m => m.ticket_id === ticketId);
    if (passenger) passenger.qr_version = version;
  }

  /** Confirmed home pickups of the trip still to collect (not boarded, not refused, address reachable). */
  homePickupsWaiting(trip) {
    return homeQueue(trip);
  }

  /** The company settings of a trip (wait at a door, threshold). */
  _configOf(trip) {
    return findOperatorById(trip?.operator_id)?.service_config || {};
  }

  /** The home run as the driver sees it (D144): order, each passenger's appointment and the wait at a door. */
  _homeRunView(trip) {
    const order = homeOrder(trip);
    if (order.length === 0) return null;
    const config = this._configOf(trip);
    const appointments = homeAppointments(trip);
    return {
      started_at: trip.home_run_started_at || null,
      wait_minutes: homeWaitMinutes(config),
      stops: order.map((p, i) => ({
        ticket_id: p.ticket_id,
        position: i + 1,
        appointment_at: appointments[p.ticket_id] || null,
        arrived_at: p.home_pickup.arrived_at || null,
        missable_at: missableAt(p, config),
        missed_at: p.home_pickup.missed_at || null,
        ready: p.pickup_ready || null,
        waiting: isWaitingHome(p)
      }))
    };
  }

  _homePassenger(tripId, ticketId) {
    const trip = this.activeTrips.get(tripId);
    if (!trip) return { error: { success: false, error: 'Chuyến xe không tồn tại', code: 'TRIP_NOT_FOUND' } };
    const p = (trip.manifest || []).find(m => m.ticket_id === ticketId);
    if (!p) return { error: { success: false, error: 'Không tìm thấy vé trong danh sách khách', code: 'TICKET_NOT_FOUND' } };
    if (!homeConfirmed(p.home_pickup)) return { error: { success: false, error: 'Vé này không đón tận nhà', code: 'NOT_HOME_PICKUP' } };
    return { trip, p };
  }

  /** D144: the driver's order for the home pickups (ticket ids, first to last); unknown or missing ids are refused. */
  setHomeOrder(tripId, ticketIds, mockNow = Date.now()) {
    const trip = this.activeTrips.get(tripId);
    if (!trip) return { success: false, error: 'Chuyến xe không tồn tại', code: 'TRIP_NOT_FOUND' };
    const homes = homeOrder(trip).map(p => p.ticket_id);
    if (!Array.isArray(ticketIds) || ticketIds.length !== homes.length || new Set(ticketIds).size !== homes.length || !ticketIds.every(id => homes.includes(id))) {
      return { success: false, error: 'Thứ tự đón phải gồm đúng các khách đón tận nhà của chuyến', code: 'VALIDATION_ERROR' };
    }
    trip.home_order = [...ticketIds];
    this._event(trip, 'HOME_ORDER_SET', { ticket_ids: [...ticketIds] }, mockNow);
    // A new order on the road moves the times given to the passengers: each one whose time moved is told.
    if (trip.home_run_started_at) {
      const before = trip.home_appointments || {};
      const after = homeAppointments(trip, { fresh: true });
      trip.home_appointments = after;
      const queue = homeQueue(trip);
      const moved = queue.filter(p => before[p.ticket_id] && after[p.ticket_id] && Math.abs(Date.parse(after[p.ticket_id]) - Date.parse(before[p.ticket_id])) >= 5 * 60000);
      if (moved.length) {
        this.eventBridge?.emit?.('HOME_APPOINTMENT_CHANGED', {
          tripId, vehiclePlate: trip.vehicle_plate,
          passengers: moved.map(p => ({ ticket_id: p.ticket_id, phone: p.passenger_phone || null, address: p.home_pickup.address, appointment_at: after[p.ticket_id], position: queue.indexOf(p) + 1 })),
          now: mockNow
        });
      }
    }
    return { success: true, data: this._homeRunView(trip) };
  }

  /** D144: the bus is at the passenger's door. The wait starts; the passenger is told how long the bus waits. */
  homeArrived(tripId, ticketId, mockNow = Date.now()) {
    const { trip, p, error } = this._homePassenger(tripId, ticketId);
    if (error) return error;
    if (!isWaitingHome(p)) return { success: false, error: 'Khách này không còn chờ đón tận nhà', code: 'HOME_PICKUP_CLOSED' };
    if (!p.home_pickup.arrived_at) {
      p.home_pickup = { ...p.home_pickup, arrived_at: new Date(mockNow).toISOString() };
      this._event(trip, 'HOME_ARRIVED', { ticket_id: ticketId, seat_code: p.seat_code }, mockNow);
      this.eventBridge?.emit?.('HOME_PICKUP_DOOR', {
        tripId, ticketId, seatCode: p.seat_code, phone: p.passenger_phone || null, address: p.home_pickup.address,
        vehiclePlate: trip.vehicle_plate, waitMinutes: homeWaitMinutes(this._configOf(trip)), now: mockNow
      });
    }
    return { success: true, data: this._homeRunView(trip) };
  }

  /**
   * D144: the passenger did not come out within the company's wait. The driver goes on; the ticket stays valid and
   * the passenger is told to board at the first stop before departure.
   */
  homeMissed(tripId, ticketId, mockNow = Date.now()) {
    const { trip, p, error } = this._homePassenger(tripId, ticketId);
    if (error) return error;
    if (!isWaitingHome(p)) return { success: false, error: 'Khách này không còn chờ đón tận nhà', code: 'HOME_PICKUP_CLOSED' };
    const config = this._configOf(trip);
    const until = missableAt(p, config);
    if (!until) return { success: false, error: 'Bấm "Đã tới" khi xe tới nhà khách trước', code: 'HOME_NOT_ARRIVED' };
    if (mockNow < Date.parse(until)) {
      return { success: false, error: `Chờ khách đủ ${homeWaitMinutes(config)} phút (tới ${new Date(Date.parse(until) + 7 * 3600000).toISOString().slice(11, 16)})`, code: 'HOME_WAIT_NOT_OVER', missable_at: until };
    }
    p.home_pickup = { ...p.home_pickup, missed_at: new Date(mockNow).toISOString() };
    this._event(trip, 'HOME_MISSED', { ticket_id: ticketId, seat_code: p.seat_code }, mockNow);
    const first = trip.stops?.find(s => s.stop_id === p.pickup_stop_id) || trip.stops?.[0];
    this.eventBridge?.emit?.('HOME_PICKUP_MISSED', {
      tripId, ticketId, seatCode: p.seat_code, phone: p.passenger_phone || null, address: p.home_pickup.address,
      stopName: first?.name || 'bến đầu', departure: trip.planned_departure_time, vehiclePlate: trip.vehicle_plate,
      waitMinutes: homeWaitMinutes(config), now: mockNow
    });
    return { success: true, data: this._homeRunView(trip) };
  }

  /** D144: the passenger's answer before the bus comes ("ready", "2 more minutes", "5 more minutes"). */
  setPickupReady(tripId, ticketId, status, mockNow = Date.now()) {
    const { trip, p, error } = this._homePassenger(tripId, ticketId);
    if (error) return error;
    if (!isWaitingHome(p)) return { success: false, error: 'Xe không còn đón bạn tại nhà cho vé này', code: 'HOME_PICKUP_CLOSED' };
    const minutes = { READY: 0, NEED_2: 2, NEED_5: 5 }[status];
    if (minutes === undefined) return { success: false, error: 'Trạng thái phải là READY, NEED_2 hoặc NEED_5', code: 'VALIDATION_ERROR' };
    p.pickup_ready = { status: minutes === 0 ? 'READY' : 'NEED_TIME', minutes, at: new Date(mockNow).toISOString() };
    this._event(trip, 'PICKUP_READY', { ticket_id: ticketId, seat_code: p.seat_code, status: p.pickup_ready.status, minutes }, mockNow);
    return { success: true, data: { ticket_id: ticketId, ready: p.pickup_ready, wait_minutes: homeWaitMinutes(this._configOf(trip)) } };
  }

  /** D144: the passenger's number for a call by the trip's own driver; every reveal is in the trip log. */
  passengerContact(tripId, ticketId, mockNow = Date.now()) {
    const trip = this.activeTrips.get(tripId);
    if (!trip) return { success: false, error: 'Chuyến xe không tồn tại', code: 'TRIP_NOT_FOUND' };
    if (['COMPLETED', 'CANCELLED'].includes(trip.status)) return { success: false, error: 'Chuyến xe đã kết thúc', code: 'TRIP_NOT_ACTIVE' };
    const p = (trip.manifest || []).find(m => m.ticket_id === ticketId);
    const phone = p?.passenger_phone || p?.phone || null;
    if (!p || !phone) return { success: false, error: 'Không có số điện thoại của khách', code: 'TICKET_NOT_FOUND' };
    this._event(trip, 'PASSENGER_CALLED', { ticket_id: ticketId, seat_code: p.seat_code }, mockNow);
    return { success: true, data: { ticket_id: ticketId, phone } };
  }

  /**
   * D143: the driver sets off to collect the home pickups before departure. From then on the app sends the bus
   * position, so each passenger waiting at home sees the bus coming. Once is enough: a second call changes nothing.
   */
  startHomeRun(tripId, mockNow = Date.now()) {
    const trip = this.activeTrips.get(tripId);
    if (!trip) return { success: false, error: 'Chuyến xe không tồn tại', code: 'TRIP_NOT_FOUND' };
    if (['COMPLETED', 'CANCELLED'].includes(trip.status)) {
      return { success: false, error: 'Chuyến xe đã kết thúc', code: 'TRIP_NOT_ACTIVE' };
    }
    if (trip.home_run_started_at) return { success: true, data: this._publicTrip(trip) };
    const waiting = this.homePickupsWaiting(trip);
    if (waiting.length === 0) {
      return { success: false, error: 'Chuyến này không còn khách đón tận nhà', code: 'NO_HOME_PICKUPS' };
    }
    // Times given to the passengers are frozen when the bus sets off, with the order it follows.
    const appointments = homeAppointments(trip);
    trip.home_order = homeOrder(trip).map(p => p.ticket_id);
    trip.home_appointments = appointments;
    trip.home_run_started_at = new Date(mockNow).toISOString();
    this._event(trip, 'HOME_RUN_STARTED', { ticket_ids: waiting.map(p => p.ticket_id) }, mockNow);
    this.eventBridge?.emit?.('HOME_RUN_STARTED', {
      tripId,
      vehiclePlate: trip.vehicle_plate,
      passengers: homeQueue(trip).map((p, i) => ({ ticket_id: p.ticket_id, seat_code: p.seat_code, phone: p.passenger_phone || null, address: p.home_pickup.address, position: i + 1, appointment_at: appointments[p.ticket_id] || null })),
      now: mockNow
    });
    return { success: true, data: this._publicTrip(trip) };
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
      if (item.source === 'HOTLINE' && item.reservation_id) {
        this.eventBridge.emit('HOTLINE_HOLD_CONVERTED', { tripId, reservationId: item.reservation_id, seatCode: item.seat_code });
      }
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
      deck: inventory?.getSeatInfo?.(tripId, seat_code)?.deck || 1,
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
    this._event(trip, 'BOARDED', { ticket_id: newPassenger.ticket_id, seat_code: newPassenger.seat_code, stop_id: newPassenger.pickup_stop_id || null, method: 'HAIL', manual: false }, mockNow);
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

    // The grace period runs at the passenger's own pickup stop (design review 2): from the planned
    // departure at the first stop, from the arrival of the bus at a later stop.
    if (!passengerRequestedCancel) {
      const pickupIndex = Math.max(0, (trip.stops || []).findIndex(s => s.stop_id === item.pickup_stop_id));
      const pickupStop = trip.stops?.[pickupIndex];
      const atStop = trip.status === 'IN_TRANSIT' && (pickupIndex === 0 || pickupStop?.status === 'ARRIVED');
      if (!atStop) {
        return {
          success: false,
          error: `Xe chưa tới điểm đón của khách (${pickupStop?.name || 'điểm đón'}), chưa thể đánh dấu vắng mặt`,
          code: 'BUS_NOT_AT_STOP'
        };
      }
      const graceFrom = pickupIndex === 0 ? Date.parse(trip.planned_departure_time) : Date.parse(pickupStop.arrived_at);
      if (mockNow < graceFrom + NO_SHOW_GRACE_MINUTES * 60 * 1000) {
        return {
          success: false,
          error: `Chỉ được đánh dấu vắng mặt sau khi xe chờ tại điểm đón ${NO_SHOW_GRACE_MINUTES} phút`,
          code: 'NO_SHOW_TOO_EARLY'
        };
      }
    }

    item.boarding_status = 'NO_SHOW';
    item.no_show_reason = reason;
    this._event(trip, 'NO_SHOW', { ticket_id: ticketId, seat_code: item.seat_code, stop_id: item.pickup_stop_id, reason, passenger_requested: passengerRequestedCancel }, mockNow);

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
   * Spec A9: the driver cannot reach a home pickup address (narrow lane, truck ban). The passenger is told why
   * and, when the driver gives one, where to meet; the office gets an alert to arrange it. Recorded once.
   */
  reportInaccessibleAddress(tripId, ticketId, { reason, meetingPoint = null } = {}, mockNow = Date.now()) {
    const reasonText = text(reason);
    if (reasonText.length > 200) return { success: false, error: 'Nội dung tối đa 200 ký tự', code: 'VALIDATION_ERROR' };
    const meetText = text(meetingPoint);
    if (meetText.length > 200) return { success: false, error: 'Nội dung tối đa 200 ký tự', code: 'VALIDATION_ERROR' };

    const trip = this.activeTrips.get(tripId);
    if (!trip) return { success: false, error: 'Chuyến xe không tồn tại', code: 'TRIP_NOT_FOUND' };
    const item = trip.manifest.find(m => m.ticket_id === ticketId);
    if (!item) return { success: false, error: 'Không tìm thấy vé trong danh sách', code: 'TICKET_NOT_FOUND' };
    if (!homeConfirmed(item.home_pickup)) return { success: false, error: 'Vé này không đón tận nhà', code: 'NOT_HOME_PICKUP' };
    if (item.boarding_status === 'BOARDED') return { success: false, error: 'Khách đã lên xe', code: 'ALREADY_BOARDED' };
    if (reasonText.length < 5) return { success: false, error: 'Ghi lý do không vào được (5-200 ký tự)', code: 'VALIDATION_ERROR' };
    const meet = meetText || null;
    if (item.home_pickup.inaccessible_at) return { success: true, data: this._publicPassenger(item) };
    item.home_pickup = { ...item.home_pickup, inaccessible_at: new Date(mockNow).toISOString(), inaccessible_reason: reasonText, meeting_point: meet };
    this._event(trip, 'HOME_ADDRESS_INACCESSIBLE', { ticket_id: ticketId, seat_code: item.seat_code, reason: reasonText, meeting_point: meet }, mockNow);
    this.eventBridge?.emit?.('HOME_PICKUP_INACCESSIBLE', { tripId, ticketId, seatCode: item.seat_code, phone: item.passenger_phone || null, address: item.home_pickup.address, reason: reasonText, meetingPoint: meet, vehiclePlate: trip.vehicle_plate, now: mockNow });
    return { success: true, data: this._publicPassenger(item) };
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

    if (text(description).length > 200) {
      return { success: false, error: 'Nội dung tối đa 200 ký tự', code: 'VALIDATION_ERROR' };
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
      const at = item.recorded_at ? Date.parse(item.recorded_at) : (item.timestamp ? Date.parse(item.timestamp) : mockNow + index);
      const valid = trip
        && Number.isFinite(lat) && lat >= -90 && lat <= 90
        && Number.isFinite(lng) && lng >= -180 && lng <= 180
        && Number.isFinite(speed) && speed >= 0
        && Number.isFinite(at)
        && (item.accuracy_m === undefined || parseFloat(item.accuracy_m) <= 200);
      if (!valid) {
        invalidSkipped += 1;
        return;
      }
      pings.push({
        tripId,
        trip,
        at,
        hasTimestamp: Boolean(item.timestamp) || Boolean(item.recorded_at),
        data: {
          trip_id: tripId,
          vehicle_plate: trip.vehicle_plate || item.vehicle_plate,
          lat,
          lng,
          speed_kmh: speed,
          bearing_deg: parseInt(item.bearing_deg, 10) || 0,
          timestamp: new Date(at).toISOString(),
          seq: item.seq !== undefined ? parseInt(item.seq, 10) : undefined,
          accuracy_m: item.accuracy_m !== undefined ? parseFloat(item.accuracy_m) : undefined,
          recorded_at: new Date(at).toISOString()
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

      if (ping.data.seq !== undefined && ping.trip.last_seq !== undefined && ping.data.seq <= ping.trip.last_seq) {
        continue;
      }
      if (ping.data.seq === undefined && ping.trip.last_telemetry_at && ping.at < ping.trip.last_telemetry_at) {
        continue;
      }

      if (!ping.trip.telemetry_history) ping.trip.telemetry_history = [];
      ping.trip.telemetry_history.push(ping.data);
      if (ping.trip.telemetry_history.length > 500) ping.trip.telemetry_history.shift();

      if (mockNow - ping.at > 120000) {
        continue; // TOO_OLD
      }

      if (ping.at >= (ping.trip.last_telemetry_at || 0)) {
        ping.trip.current_lat = ping.data.lat;
        ping.trip.current_lng = ping.data.lng;
        ping.trip.current_speed_kmh = ping.data.speed_kmh;
        ping.trip.last_telemetry_at = ping.at;
        if (ping.data.seq !== undefined) ping.trip.last_seq = ping.data.seq;
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
  endTrip(tripId, { earlyEndReason = null } = {}) {
    const trip = this.activeTrips.get(tripId);
    if (!trip) return { success: false, error: 'Chuyến xe không tồn tại', code: 'TRIP_NOT_FOUND' };
    if (trip.status !== 'IN_TRANSIT') {
      return { success: false, error: `Chuyến xe ở trạng thái ${trip.status}, không thể kết thúc`, code: 'INVALID_TRIP_STATE' };
    }
    // A trip ends at its last stop. Ending it earlier (breakdown, all passengers moved) needs a
    // written reason, kept in the end report (BR-END-005, design review 2).
    const lastStop = (trip.stops || [])[(trip.stops || []).length - 1];
    const atFinalStop = !lastStop || lastStop.status === 'ARRIVED';
    const reason = text(earlyEndReason);
    if (reason.length > 200) {
      return {
        success: false,
        error: 'Nội dung tối đa 200 ký tự',
        code: 'VALIDATION_ERROR'
      };
    }
    if (!atFinalStop && reason.length < 5) {
      return {
        success: false,
        error: `Xe chưa tới bến cuối (${lastStop.name}). Kết thúc giữa đường cần ghi lý do`,
        code: 'TRIP_NOT_AT_FINAL_STOP'
      };
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
      early_end_reason: atFinalStop ? null : reason,
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
    this._event(trip, 'TRIP_COMPLETED', { early_end_reason: summary.early_end_reason });

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
