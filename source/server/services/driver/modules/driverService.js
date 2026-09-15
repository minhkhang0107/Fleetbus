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

export const MOCK_DRIVERS_DB = [
  {
    driver_id: 'drv_8821a',
    staff_id: 'TX8821',
    phone: '0912345678',
    pin: '123456',
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
    pin: '654321',
    full_name: 'Lê Hoàng Nam',
    license_class: 'FC',
    license_valid_until: '2025-01-01', // Expired license
    is_license_expired: true,
    assigned_vehicle_plate: '29B-678.90',
    status: 'LICENSE_EXPIRED'
  }
];

export class DriverCockpitService {
  constructor(options = {}) {
    this.secretKey = options.secretKey || 'busgo_ticket_master_secret';
    this.activeTrips = new Map(); // tripId -> TripState
    this.offlineQueue = []; // buffered telemetry pings
    this.incidents = [];

    this._initMockShiftTrips();
  }

  _initMockShiftTrips() {
    const trip1 = {
      trip_id: 'trp_991823',
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
        { stop_id: 'stp_th_pb', name: 'Bến xe Phía Bắc Thanh Hóa', city: 'Thanh Hóa', order: 2, expected_board: 0, expected_alight: 1, status: 'PENDING' }
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
  authenticateDriver(staffIdOrPhone, pin, deviceInfo = {}) {
    const input = (staffIdOrPhone || '').trim().toUpperCase();
    const driver = MOCK_DRIVERS_DB.find(d => d.staff_id === input || d.phone === input);

    if (!driver || driver.pin !== pin) {
      return { success: false, error: 'Mã nhân viên hoặc mã PIN không chính xác', code: 'INVALID_CREDENTIALS' };
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

    const token = `drv_jwt_${Buffer.from(`${driver.driver_id}_${Date.now()}`).toString('base64').replace(/=/g, '')}`;

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
   * DRI-002: Get Today Assigned Trips
   */
  getTodayTrips(driverId) {
    const trips = Array.from(this.activeTrips.values());
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
   * DRI-005: Start Trip & Activate Active Cockpit
   */
  startTrip(tripId) {
    const trip = this.activeTrips.get(tripId);
    if (!trip) return { success: false, error: 'Chuyến xe không tồn tại', code: 'TRIP_NOT_FOUND' };

    if (trip.status !== 'READY' && trip.status !== 'DISPATCHED') {
      return { success: false, error: `Chuyến xe ở trạng thái ${trip.status}, không thể bắt đầu`, code: 'INVALID_TRIP_STATE' };
    }

    trip.status = 'IN_TRANSIT';
    trip.actual_start_time = new Date().toISOString();

    return {
      success: true,
      message: 'Chuyến đi đã bắt đầu! Đang truyền telemetry GPS về trung tâm điều hành.',
      data: trip
    };
  }

  /**
   * DRI-006: Ingest GPS Telemetry (3s frequency / offline buffer support)
   */
  recordTelemetry(tripId, { lat, lng, speed_kmh, bearing_deg, is_offline = false, mockNow = Date.now() }) {
    const trip = this.activeTrips.get(tripId);
    if (!trip) return { success: false, error: 'Chuyến xe không tồn tại' };

    const ping = {
      trip_id: tripId,
      vehicle_plate: trip.vehicle_plate,
      lat: parseFloat(lat),
      lng: parseFloat(lng),
      speed_kmh: parseFloat(speed_kmh) || 0,
      bearing_deg: parseInt(bearing_deg, 10) || 0,
      timestamp: new Date(mockNow).toISOString()
    };

    trip.current_lat = ping.lat;
    trip.current_lng = ping.lng;
    trip.current_speed_kmh = ping.speed_kmh;

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
   * DRI-009 / DRI-010: Scan Dynamic QR, Group QR, Offline PIN, or Offline Signed Ticket (REV-01, REV-03)
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

      const boardedList = [];
      for (const tktId of groupCheck.ticket_ids) {
        const passenger = trip.manifest.find(m => m.ticket_id === tktId);
        if (passenger && passenger.boarding_status !== 'BOARDED') {
          passenger.boarding_status = 'BOARDED';
          passenger.boarded_at = new Date(mockNow).toISOString();
          trip.boarded_count += 1;
          boardedList.push(passenger);
        }
      }

      return {
        success: true,
        isGroup: true,
        message: `Soát vé đoàn thành công: ${boardedList.length} khách đã lên xe`,
        data: {
          pnr: groupCheck.pnr,
          boarded_passengers: boardedList
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

      passenger.boarding_status = 'BOARDED';
      passenger.boarded_at = new Date(mockNow).toISOString();
      trip.boarded_count += 1;

      return {
        success: true,
        message: `Xác thực PIN thành công: ${passenger.passenger_name} · Ghế ${passenger.seat_code}`,
        data: passenger
      };
    }

    // Case 3: Offline Signed JSON Ticket
    if (typeof inputString === 'string' && inputString.trim().startsWith('{')) {
      const offlineCheck = verifyOfflineSignedTicket(inputString, this.secretKey);
      if (!offlineCheck.isValid) {
        return { success: false, error: `Chữ ký vé offline không hợp lệ (${offlineCheck.reason})`, code: offlineCheck.reason };
      }
      const passenger = trip.manifest.find(m => m.ticket_id === offlineCheck.ticket_id || m.pnr === offlineCheck.pnr);
      if (!passenger) return { success: false, error: 'Vé không thuộc chuyến xe này', code: 'TICKET_WRONG_TRIP' };

      if (passenger.boarding_status === 'BOARDED') {
        return { success: false, error: `Khách ${passenger.passenger_name} đã lên xe trước đó!`, code: 'ALREADY_BOARDED' };
      }

      passenger.boarding_status = 'BOARDED';
      passenger.boarded_at = new Date(mockNow).toISOString();
      trip.boarded_count += 1;

      return {
        success: true,
        isOfflineSigned: true,
        message: `Soát vé offline thành công: ${passenger.passenger_name} · Ghế ${passenger.seat_code}`,
        data: passenger
      };
    }

    // Case 4: Standard Dynamic TOTP QR (BUSGO|...) with +-2 window tolerance
    const qrCheck = verifyDynamicTicketQR(inputString, this.secretKey, mockNow);
    if (!qrCheck.isValid) {
      return { success: false, error: `Mã QR không hợp lệ (${qrCheck.reason})`, code: qrCheck.reason };
    }

    const passenger = trip.manifest.find(m => m.ticket_id === qrCheck.ticket_id || m.pnr === qrCheck.pnr);
    if (!passenger) {
      return { success: false, error: 'Vé không thuộc chuyến xe này', code: 'TICKET_WRONG_TRIP' };
    }

    if (passenger.boarding_status === 'BOARDED') {
      return { success: false, error: `Khách ${passenger.passenger_name} (Ghế ${passenger.seat_code}) đã lên xe trước đó!`, code: 'ALREADY_BOARDED' };
    }

    passenger.boarding_status = 'BOARDED';
    passenger.boarded_at = new Date(mockNow).toISOString();
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

    return {
      success: true,
      message: `Soát vé thành công: ${passenger.passenger_name} · Ghế ${passenger.seat_code}`,
      data: passenger,
      requires_cod: passenger.payment_method === 'COD' && passenger.cod_amount_vnd > 0
    };
  }

  /**
   * DRI-012: Collect COD Cash Fare with change due settlement options (REV-04)
   */
  collectCod(tripId, ticketId, payloadOrAmount) {
    const trip = this.activeTrips.get(tripId);
    if (!trip) return { success: false, error: 'Chuyến xe không tồn tại' };

    const item = trip.manifest.find(m => m.ticket_id === ticketId);
    if (!item) return { success: false, error: 'Không tìm thấy vé trong danh sách' };

    const payload = typeof payloadOrAmount === 'number'
      ? { amount_collected_vnd: payloadOrAmount }
      : (payloadOrAmount || {});

    const fareAmount = payload.fare_amount_vnd || item.cod_amount_vnd || 0;
    const collectedAmount = payload.amount_collected_vnd || fareAmount;
    const changeDue = Math.max(0, collectedAmount - fareAmount);
    const method = payload.change_settlement_method || 'CASH_RETURNED';

    let debtReceiptCode = null;
    let payoutLocation = null;

    if (method === 'REST_STOP_DEBT_RECEIPT') {
      debtReceiptCode = `DR-${ticketId.slice(-6).toUpperCase()}-${Math.round(changeDue / 1000)}K`;
      payoutLocation = 'Trạm dừng nghỉ kế tiếp / Bến xe đích';
    }

    item.cod_collected = true;
    item.cod_collected_amount = collectedAmount;
    item.payment_status = 'SUCCESS';
    item.boarding_status = 'BOARDED';
    item.change_settlement = {
      method,
      amount_collected_vnd: collectedAmount,
      fare_amount_vnd: fareAmount,
      change_due_vnd: changeDue,
      debt_receipt_code: debtReceiptCode,
      payout_location: payoutLocation
    };

    trip.total_cod_collected_vnd += fareAmount;

    return {
      success: true,
      message: `Đã thu COD ${fareAmount.toLocaleString('vi-VN')} đ từ khách ${item.passenger_name}`,
      data: item
    };
  }

  /**
   * DRI-006 / DRI-007: Onboard Hail Passenger (Đón khách vẫy dọc đường - REV-05)
   */
  onboardHailPassenger(tripId, {
    passenger_name = 'Khách Vẫy Dọc Đường',
    phone = '0901234567',
    dropoff_stop_id,
    dropoff_stop_name,
    seat_code,
    fare_amount_vnd = 220000,
    amount_collected_vnd,
    payment_method = 'CASH',
    change_settlement_method = 'CASH_RETURNED'
  }, mockNow = Date.now()) {
    const trip = this.activeTrips.get(tripId);
    if (!trip) return { success: false, error: 'Chuyến xe không tồn tại' };

    // Validate seat availability
    const isOccupied = trip.manifest.some(m => m.seat_code === seat_code && m.boarding_status !== 'NO_SHOW');
    if (isOccupied) {
      return { success: false, error: `Ghế ${seat_code} đã có người ngồi hoặc đã được đặt!`, code: 'SEAT_OCCUPIED' };
    }

    const pnr = `BG-HAIL-${Math.floor(100 + Math.random() * 900)}`;
    const ticketId = `tkt_hail_${Date.now()}_${seat_code}`;
    const collected = amount_collected_vnd || fare_amount_vnd;
    const changeDue = Math.max(0, collected - fare_amount_vnd);

    let debtReceiptCode = null;
    if (change_settlement_method === 'REST_STOP_DEBT_RECEIPT') {
      debtReceiptCode = `DR-${ticketId.slice(-6).toUpperCase()}-${Math.round(changeDue / 1000)}K`;
    }

    const currentStop = trip.stops[trip.current_stop_index] || trip.stops[0];

    const newPassenger = {
      ticket_id: ticketId,
      pnr,
      seat_code,
      deck: seat_code.startsWith('A') ? 1 : 2,
      passenger_name,
      phone_masked: phone.slice(0, 3) + '***' + phone.slice(-3),
      pickup_stop_id: currentStop ? currentStop.stop_id : 'stp_hail',
      dropoff_stop_id: dropoff_stop_id || trip.stops[trip.stops.length - 1]?.stop_id,
      dropoff_stop_name: dropoff_stop_name || trip.stops[trip.stops.length - 1]?.name,
      boarding_status: 'BOARDED',
      boarded_at: new Date(mockNow).toISOString(),
      payment_method,
      payment_status: 'SUCCESS',
      cod_amount_vnd: 0,
      is_hail_passenger: true,
      change_settlement: {
        method: change_settlement_method,
        amount_collected_vnd: collected,
        fare_amount_vnd,
        change_due_vnd: changeDue,
        debt_receipt_code: debtReceiptCode
      }
    };

    trip.manifest.push(newPassenger);
    trip.boarded_count += 1;
    trip.booked_passengers_count += 1;
    trip.total_cod_collected_vnd += fare_amount_vnd;

    return {
      success: true,
      message: `Đón khách vẫy thành công! Ghế: ${seat_code}, đã thu ${fare_amount_vnd.toLocaleString('vi-VN')} đ`,
      data: newPassenger
    };
  }

  /**
   * DRI-011: Mark Passenger as No-Show
   */
  markNoShow(tripId, ticketId, reason = 'Quá giờ xuất bến không có mặt') {
    const trip = this.activeTrips.get(tripId);
    if (!trip) return { success: false, error: 'Chuyến xe không tồn tại' };

    const item = trip.manifest.find(m => m.ticket_id === ticketId);
    if (!item) return { success: false, error: 'Không tìm thấy vé trong danh sách' };

    item.boarding_status = 'NO_SHOW';
    item.no_show_reason = reason;

    return {
      success: true,
      data: item
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
   * DRI-015: Replay Offline Telemetry Buffer
   */
  replayOfflineBuffer(telemetryBuffer = []) {
    const buffer = Array.isArray(telemetryBuffer) ? telemetryBuffer : [];
    let lastPing = null;

    for (const item of buffer) {
      const tripId = item.trip_id || item.tripId || 'trp_hn_th_01';
      const trip = this.activeTrips.get(tripId);
      lastPing = {
        trip_id: tripId,
        vehicle_plate: (trip && trip.vehicle_plate) || item.vehicle_plate || '29B-882.19',
        lat: parseFloat(item.lat || 20.98),
        lng: parseFloat(item.lng || 105.84),
        speed_kmh: parseFloat(item.speed_kmh) || 0,
        bearing_deg: parseInt(item.bearing_deg, 10) || 0,
        timestamp: item.timestamp || new Date().toISOString()
      };
      if (trip) {
        trip.current_lat = lastPing.lat;
        trip.current_lng = lastPing.lng;
        trip.current_speed_kmh = lastPing.speed_kmh;
      }
    }

    if (lastPing && this.eventBridge && typeof this.eventBridge.emit === 'function') {
      this.eventBridge.emit('DRIVER_TELEMETRY', { tripId: lastPing.trip_id, telemetry: lastPing });
    }

    return {
      success: true,
      replayed_count: buffer.length,
      message: `Đã phát lại và đồng bộ ${buffer.length} bản ghi telemetry về máy chủ.`
    };
  }

  /**
   * DRI-017: End Trip at final terminal
   */
  endTrip(tripId) {
    const trip = this.activeTrips.get(tripId);
    if (!trip) return { success: false, error: 'Chuyến xe không tồn tại' };

    trip.status = 'COMPLETED';
    trip.completed_at = new Date().toISOString();

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

    return {
      success: true,
      data: {
        trip_id: tripId,
        total_passengers: trip.booked_passengers_count,
        boarded_count: trip.boarded_count,
        total_cod_collected_vnd: trip.total_cod_collected_vnd,
        status: 'COMPLETED'
      }
    };
  }
}
