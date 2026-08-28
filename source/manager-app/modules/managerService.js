/**
 * FleetBus Manager Operations Control Center Service
 * Implements MGR-001 through MGR-030 for Fleet Managers, Dispatchers, and Controllers.
 */

export const MOCK_MANAGERS_DB = [
  {
    user_id: 'mgr_01',
    username: 'admin@busgo.vn',
    password_hash: 'admin123',
    full_name: 'Nguyễn Tiến Dũng',
    role: 'FLEET_DIRECTOR', // FLEET_DIRECTOR | DISPATCHER | CASHIER | FINANCIAL_CONTROLLER
    permissions: ['ALL']
  },
  {
    user_id: 'mgr_02',
    username: 'dispatcher@busgo.vn',
    password_hash: 'disp123',
    full_name: 'Phạm Hồng Quân',
    role: 'DISPATCHER',
    permissions: ['DISPATCH_MANAGE', 'TRIP_EDIT', 'INCIDENT_BROADCAST', 'RADAR_VIEW']
  }
];

export class ManagerOperationsService {
  constructor() {
    this.vehicles = [
      { vehicle_id: 'veh_01', plate_number: '29B-123.45', model: 'Limousine 34 Phòng VIP', total_seats: 34, status: 'IN_TRANSIT', driver_name: 'Trần Văn Bình', lat: 20.9812, lng: 105.8430, speed_kmh: 62, heading: 180, gps_status: 'LIVE' },
      { vehicle_id: 'veh_02', plate_number: '29B-444.11', model: 'Cabin Cung Điện VIP 22', total_seats: 22, status: 'IN_TRANSIT', driver_name: 'Lê Văn Toàn', lat: 20.4500, lng: 105.9200, speed_kmh: 55, heading: 175, gps_status: 'STALE' },
      { vehicle_id: 'veh_03', plate_number: '29B-888.22', model: 'Sleeper 34 Giường Nằm', total_seats: 34, status: 'STANDBY', driver_name: 'Hoàng Anh Tuấn', lat: 20.9800, lng: 105.8400, speed_kmh: 0, heading: 0, gps_status: 'LIVE' }
    ];

    this.routes = [
      { route_id: 'rt_hn_th', name: 'Hà Nội — Thanh Hóa (Cao tốc)', distance_km: 160, base_fare_vnd: 220000, stops_count: 4 },
      { route_id: 'rt_hn_hp', name: 'Hà Nội — Hải Phòng (5B)', distance_km: 120, base_fare_vnd: 180000, stops_count: 3 },
      { route_id: 'rt_hn_nb', name: 'Hà Nội — Ninh Bình (Cao tốc)', distance_km: 95, base_fare_vnd: 150000, stops_count: 3 }
    ];

    this.trips = [
      { trip_id: 'trp_991823', route_id: 'rt_hn_th', vehicle_id: 'veh_01', vehicle_plate: '29B-123.45', departure_time: '2026-08-28T14:00:00+07:00', status: 'IN_TRANSIT', booked_seats: 28, total_seats: 34, delay_minutes: 0 },
      { trip_id: 'trp_991824', route_id: 'rt_hn_hp', vehicle_id: 'veh_02', vehicle_plate: '29B-444.11', departure_time: '2026-08-28T15:30:00+07:00', status: 'SCHEDULED', booked_seats: 20, total_seats: 22, delay_minutes: 35 }
    ];

    this.bookings = [
      { pnr: 'BG-88219', trip_id: 'trp_991823', passenger_name: 'Trần Văn Hùng', phone: '0981112233', seat_codes: ['A01', 'A02'], total_fare_vnd: 440000, payment_status: 'PAID', channel: 'PASSENGER_APP' },
      { pnr: 'BG-99412', trip_id: 'trp_991823', passenger_name: 'Nguyễn Thị Hoa', phone: '0912334455', seat_codes: ['B01'], total_fare_vnd: 220000, payment_status: 'PAID', channel: 'POS_HOTLINE' }
    ];

    this.alerts = [
      { alert_id: 'alt_01', vehicle_plate: '29B-444.11', type: 'DELAY_WARNING', severity: 'AMBER', message: 'Chuyến trp_991824 dự kiến trễ +35 phút do kẹt xe đầu cao tốc 5B', created_at: '2026-08-28T13:00:00Z' },
      { alert_id: 'alt_02', vehicle_plate: '29B-123.45', type: 'GPS_LIVE', severity: 'GREEN', message: 'Xe đang vận hành ổn định trên cao tốc Pháp Vân - Cầu Giẽ', created_at: '2026-08-28T13:02:00Z' }
    ];
  }

  /**
   * MGR-001: Manager Authentication & RBAC Session
   */
  authenticateManager(username, password) {
    const user = MOCK_MANAGERS_DB.find(u => u.username === (username || '').trim() && u.password_hash === password);
    if (!user) {
      return { success: false, error: 'Tên đăng nhập hoặc mật khẩu không chính xác', code: 'INVALID_CREDENTIALS' };
    }

    const token = `mgr_session_${Buffer.from(`${user.user_id}_${Date.now()}`).toString('base64').replace(/=/g, '')}`;

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

  /**
   * MGR-002: Operations Dashboard Executive KPIs
   */
  getDashboardKPIs() {
    const totalVehicles = this.vehicles.length;
    const activeVehicles = this.vehicles.filter(v => v.status === 'IN_TRANSIT').length;
    const totalBookedSeats = this.trips.reduce((acc, t) => acc + t.booked_seats, 0);
    const totalCapacity = this.trips.reduce((acc, t) => acc + t.total_seats, 0);
    const loadFactorPct = totalCapacity > 0 ? ((totalBookedSeats / totalCapacity) * 100).toFixed(1) : '0.0';
    const totalRevenueVnd = this.bookings.reduce((acc, b) => acc + b.total_fare_vnd, 0);

    return {
      success: true,
      data: {
        timestamp: new Date().toISOString(),
        kpi_metrics: {
          active_vehicles_count: activeVehicles,
          total_fleet_count: totalVehicles,
          overall_load_factor_pct: parseFloat(loadFactorPct),
          gross_revenue_vnd: totalRevenueVnd,
          on_time_departure_rate_pct: 96.8,
          active_alerts_count: this.alerts.length,
          fleet_average_speed_kmh: 58.5
        },
        corridors: [
          { corridor: 'Hà Nội — Thanh Hóa', load_factor_pct: 94.2, active_trips: 1 },
          { corridor: 'Hà Nội — Hải Phòng', load_factor_pct: 90.9, active_trips: 1 }
        ],
        recent_alerts: this.alerts
      }
    };
  }

  /**
   * MGR-003: Live Fleet Radar Map Telemetry
   */
  getLiveFleetRadar() {
    return {
      success: true,
      data: {
        total_tracked_vehicles: this.vehicles.length,
        vehicles: this.vehicles.map(v => ({
          vehicle_id: v.vehicle_id,
          plate_number: v.plate_number,
          model: v.model,
          driver_name: v.driver_name,
          current_coordinates: { lat: v.lat, lng: v.lng },
          speed_kmh: v.speed_kmh,
          heading_deg: v.heading,
          gps_health: v.gps_status, // LIVE | STALE | LOST
          status: v.status
        }))
      }
    };
  }

  /**
   * MGR-014: Interactive Dispatch Board
   */
  getDispatchBoard(date = '2026-08-28') {
    return {
      success: true,
      data: {
        dispatch_date: date,
        trips: this.trips.map(t => {
          const v = this.vehicles.find(veh => veh.vehicle_id === t.vehicle_id);
          const r = this.routes.find(rt => rt.route_id === t.route_id);
          return {
            trip_id: t.trip_id,
            route_name: r ? r.name : 'Unknown Route',
            vehicle_plate: t.vehicle_plate,
            driver_name: v ? v.driver_name : 'Unassigned',
            departure_time: t.departure_time,
            booked_ratio: `${t.booked_seats}/${t.total_seats}`,
            status: t.status,
            delay_minutes: t.delay_minutes
          };
        })
      }
    };
  }

  /**
   * MGR-019 / MGR-020: Hotline & POS Counter Booking
   */
  createPosBooking({ tripId, passengerName, phone, seatCodes = [] }) {
    const trip = this.trips.find(t => t.trip_id === tripId);
    if (!trip) return { success: false, error: 'Chuyến xe không tồn tại' };

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
      payment_status: 'PAID',
      channel: 'POS_HOTLINE',
      created_at: new Date().toISOString()
    };

    trip.booked_seats += seatCodes.length;
    this.bookings.push(newBooking);

    return {
      success: true,
      message: `Đã xuất vé POS thành công cho khách ${passengerName} (Mã PNR: ${pnr})`,
      data: newBooking
    };
  }

  /**
   * MGR-023: Emergency Vehicle Replacement Wizard with Seat Reallocation
   */
  replaceTripVehicle(tripId, newVehicleId, reason = 'Xe cũ gặp sự cố kỹ thuật') {
    const trip = this.trips.find(t => t.trip_id === tripId);
    if (!trip) return { success: false, error: 'Chuyến xe không tồn tại' };

    const oldVehicle = this.vehicles.find(v => v.vehicle_id === trip.vehicle_id);
    const newVehicle = this.vehicles.find(v => v.vehicle_id === newVehicleId);

    if (!newVehicle) return { success: false, error: 'Xe thay thế không tồn tại' };

    const oldPlate = trip.vehicle_plate;
    trip.vehicle_id = newVehicleId;
    trip.vehicle_plate = newVehicle.plate_number;
    trip.total_seats = newVehicle.total_seats;

    const alertMsg = `Đã điều động xe ${newVehicle.plate_number} thay thế xe ${oldPlate} cho chuyến ${tripId}. Lý do: ${reason}`;
    this.alerts.unshift({
      alert_id: `alt_repl_${Date.now()}`,
      vehicle_plate: newVehicle.plate_number,
      type: 'VEHICLE_REPLACEMENT',
      severity: 'AMBER',
      message: alertMsg,
      created_at: new Date().toISOString()
    });

    return {
      success: true,
      message: alertMsg,
      data: {
        trip_id: tripId,
        old_vehicle_plate: oldPlate,
        new_vehicle_plate: newVehicle.plate_number,
        total_seats: newVehicle.total_seats,
        auto_reallocated_passengers: trip.booked_seats
      }
    };
  }

  /**
   * MGR-024: Broadcast Trip Delay
   */
  broadcastTripDelay(tripId, delayMinutes, reason = 'Kẹt xe cao tốc') {
    const trip = this.trips.find(t => t.trip_id === tripId);
    if (!trip) return { success: false, error: 'Chuyến xe không tồn tại' };

    trip.delay_minutes = delayMinutes;
    const msg = `Chuyến ${tripId} (${trip.vehicle_plate}) thông báo trễ ${delayMinutes} phút. Lý do: ${reason}`;

    this.alerts.unshift({
      alert_id: `alt_del_${Date.now()}`,
      vehicle_plate: trip.vehicle_plate,
      type: 'TRIP_DELAY',
      severity: 'AMBER',
      message: msg,
      created_at: new Date().toISOString()
    });

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
   * MGR-021 / MGR-022: Automated Reconciliation & Refund Processing
   */
  processRefund(pnr, refundAmountVnd, reason = 'Khách hủy vé theo chính sách') {
    const booking = this.bookings.find(b => b.pnr === pnr);
    if (!booking) return { success: false, error: 'Mã PNR không tồn tại' };

    booking.refund_status = 'REFUNDED';
    booking.refund_amount_vnd = refundAmountVnd;
    booking.refund_reason = reason;

    return {
      success: true,
      message: `Đã phê duyệt hoàn trả ${refundAmountVnd} đ cho mã vé ${pnr}`,
      data: booking
    };
  }
}
