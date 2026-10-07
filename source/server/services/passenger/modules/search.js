/**
 * FleetBus Passenger Search & Discovery Module
 * Implements PAX-004 (Home), PAX-005 (Location Picker), PAX-006 (Search Results), PAX-007 (Trip Detail).
 */

export const STATIONS_DATABASE = [
  {
    station_id: 'stp_hn_gb',
    name: 'Bến xe Giáp Bát',
    city: 'Hà Nội',
    address: 'Km 6 Giải Phóng, Giáp Bát, Hoàng Mai, Hà Nội',
    lat: 20.9806,
    lng: 105.8413,
    popular: true
  },
  {
    station_id: 'stp_hn_my_dinh',
    name: 'Bến xe Mỹ Đình',
    city: 'Hà Nội',
    address: '20 Phạm Hùng, Mỹ Đình, Nam Từ Liêm, Hà Nội',
    lat: 21.0285,
    lng: 105.7783,
    popular: true
  },
  {
    station_id: 'stp_hn_nuoc_ngam',
    name: 'Bến xe Nước Ngầm',
    city: 'Hà Nội',
    address: '01 Ngọc Hồi, Hoàng Liệt, Hoàng Mai, Hà Nội',
    lat: 20.9634,
    lng: 105.8446,
    popular: true
  },
  {
    station_id: 'stp_th_pb',
    name: 'Bến xe Phía Bắc Thanh Hóa',
    city: 'Thanh Hóa',
    address: 'Nguyễn Chí Thanh, Nam Ngạn, TP. Thanh Hóa',
    lat: 19.8067,
    lng: 105.7852,
    popular: true
  },
  {
    station_id: 'stp_th_sam_son',
    name: 'Bến xe Sầm Sơn',
    city: 'Thanh Hóa',
    address: 'Đường Lê Lợi, Sầm Sơn, Thanh Hóa',
    lat: 19.7423,
    lng: 105.9012,
    popular: true
  },
  {
    station_id: 'stp_na_vinh',
    name: 'Bến xe Chợ Vinh',
    city: 'Nghệ An',
    address: 'Đường Cao Thắng, TP. Vinh, Nghệ An',
    lat: 18.6672,
    lng: 105.6791,
    popular: true
  },
  {
    station_id: 'stp_dn_tt',
    name: 'Bến xe Trung tâm Đà Nẵng',
    city: 'Đà Nẵng',
    address: '185 Tôn Đức Thắng, Hòa Minh, Liên Chiểu, Đà Nẵng',
    lat: 16.0592,
    lng: 108.1673,
    popular: true
  }
];

export const MOCK_TRIPS_DATABASE = [
  {
    trip_id: 'trp_hn_th_01',
    route_id: 'rot_hn_th',
    route_name: 'Hà Nội — Thanh Hóa (Cao tốc)',
    vehicle_type: 'VIP_CABIN',
    vehicle_title: 'Cabin Cung Điện VIP 22 Phòng',
    plate_number: '29B-882.19',
    departure_time: '2026-08-28T07:00:00+07:00',
    arrival_time: '2026-08-28T09:30:00+07:00',
    duration_minutes: 150,
    base_fare_vnd: 220000,
    total_seats: 22,
    available_seats_count: 14,
    rating: 4.9,
    amenities: ['wifi', 'massage_seat', 'lcd_screen', 'blanket', 'water', 'usb_charging'],
    stops: [
      { stop_id: 'stp_hn_gb', name: 'Bến xe Giáp Bát', city: 'Hà Nội', order: 1, pickup_allowed: true, dropoff_allowed: false },
      { stop_id: 'stp_hn_nuoc_ngam', name: 'Bến xe Nước Ngầm', city: 'Hà Nội', order: 2, pickup_allowed: true, dropoff_allowed: false },
      { stop_id: 'stp_nb', name: 'Bến xe Ninh Bình', city: 'Ninh Bình', order: 3, pickup_allowed: true, dropoff_allowed: true },
      { stop_id: 'stp_th_pb', name: 'Bến xe Phía Bắc Thanh Hóa', city: 'Thanh Hóa', order: 4, pickup_allowed: false, dropoff_allowed: true },
      { stop_id: 'stp_th_sam_son', name: 'Bến xe Sầm Sơn', city: 'Thanh Hóa', order: 5, pickup_allowed: false, dropoff_allowed: true }
    ]
  },
  {
    trip_id: 'trp_hn_th_02',
    route_id: 'rot_hn_th',
    route_name: 'Hà Nội — Thanh Hóa (Cao tốc)',
    vehicle_type: 'SLEEPER_34',
    vehicle_title: 'Giường Nằm Cao Cấp 34 Chỗ',
    plate_number: '29B-991.02',
    departure_time: '2026-08-28T14:00:00+07:00',
    arrival_time: '2026-08-28T16:30:00+07:00',
    duration_minutes: 150,
    base_fare_vnd: 180000,
    total_seats: 34,
    available_seats_count: 8,
    rating: 4.7,
    amenities: ['wifi', 'blanket', 'water', 'usb_charging'],
    stops: [
      { stop_id: 'stp_hn_my_dinh', name: 'Bến xe Mỹ Đình', city: 'Hà Nội', order: 1, pickup_allowed: true, dropoff_allowed: false },
      { stop_id: 'stp_hn_gb', name: 'Bến xe Giáp Bát', city: 'Hà Nội', order: 2, pickup_allowed: true, dropoff_allowed: false },
      { stop_id: 'stp_th_pb', name: 'Bến xe Phía Bắc Thanh Hóa', city: 'Thanh Hóa', order: 3, pickup_allowed: false, dropoff_allowed: true }
    ]
  },
  {
    trip_id: 'trp_hn_th_03',
    route_id: 'rot_hn_th',
    route_name: 'Hà Nội — Sầm Sơn VIP Limousine',
    vehicle_type: 'VIP_CABIN',
    vehicle_title: 'Cabin Cung Điện VIP 22 Phòng',
    plate_number: '29B-678.90',
    departure_time: '2026-08-28T19:30:00+07:00',
    arrival_time: '2026-08-28T22:00:00+07:00',
    duration_minutes: 150,
    base_fare_vnd: 250000,
    total_seats: 22,
    available_seats_count: 5,
    rating: 4.95,
    amenities: ['wifi', 'massage_seat', 'lcd_screen', 'blanket', 'water', 'usb_charging'],
    stops: [
      { stop_id: 'stp_hn_gb', name: 'Bến xe Giáp Bát', city: 'Hà Nội', order: 1, pickup_allowed: true, dropoff_allowed: false },
      { stop_id: 'stp_th_sam_son', name: 'Bến xe Sầm Sơn', city: 'Thanh Hóa', order: 2, pickup_allowed: false, dropoff_allowed: true }
    ]
  }
];

export class PassengerSearchService {
  /**
   * PAX-005: Location / Station search with diacritics fuzzy matching
   */
  searchStations(query = '', limit = 10) {
    const q = this._normalizeVietnamese(query.trim());
    if (!q) {
      return STATIONS_DATABASE.filter(s => s.popular).slice(0, limit);
    }

    return STATIONS_DATABASE.filter(station => {
      const matchName = this._normalizeVietnamese(station.name).includes(q);
      const matchCity = this._normalizeVietnamese(station.city).includes(q);
      const matchAddress = this._normalizeVietnamese(station.address).includes(q);
      return matchName || matchCity || matchAddress;
    }).slice(0, limit);
  }

  /**
   * PAX-006: Search Trips with segment matching, vehicle type and time filters
   */
  searchTrips(criteria = {}) {
    const {
      originCity = 'Hà Nội',
      destinationCity = 'Thanh Hóa',
      date, // YYYY-MM-DD
      vehicleType, // 'VIP_CABIN' | 'SLEEPER_34'
      timeSlot, // 'MORNING' (05:00-12:00), 'AFTERNOON' (12:00-18:00), 'EVENING' (18:00-24:00)
      sortBy = 'DEPARTURE_ASC' // 'PRICE_ASC' | 'PRICE_DESC' | 'DEPARTURE_ASC'
    } = criteria;

    const normOrigin = this._normalizeVietnamese(originCity);
    const normDest = this._normalizeVietnamese(destinationCity);

    let results = MOCK_TRIPS_DATABASE.filter(trip => {
      // Must have a pickup stop in origin city and dropoff stop in destination city with order pickup < dropoff
      const pickupStop = trip.stops.find(s => this._normalizeVietnamese(s.city) === normOrigin && s.pickup_allowed);
      const dropoffStop = trip.stops.find(s => this._normalizeVietnamese(s.city) === normDest && s.dropoff_allowed);

      if (!pickupStop || !dropoffStop) return false;
      if (pickupStop.order >= dropoffStop.order) return false;

      // Filter by vehicle type
      if (vehicleType && trip.vehicle_type !== vehicleType) return false;

      // Filter by time slot
      if (timeSlot) {
        const hour = new Date(trip.departure_time).getHours();
        if (timeSlot === 'MORNING' && (hour < 5 || hour >= 12)) return false;
        if (timeSlot === 'AFTERNOON' && (hour < 12 || hour >= 18)) return false;
        if (timeSlot === 'EVENING' && (hour < 18 || hour >= 24)) return false;
      }

      return true;
    });

    // Sorting
    if (sortBy === 'PRICE_ASC') {
      results.sort((a, b) => a.base_fare_vnd - b.base_fare_vnd);
    } else if (sortBy === 'PRICE_DESC') {
      results.sort((a, b) => b.base_fare_vnd - a.base_fare_vnd);
    } else {
      results.sort((a, b) => new Date(a.departure_time).getTime() - new Date(b.departure_time).getTime());
    }

    return {
      status: 'success',
      total_count: results.length,
      data: results
    };
  }

  /**
   * PAX-007: Get Trip Detail
   */
  getTripDetail(tripId) {
    const trip = MOCK_TRIPS_DATABASE.find(t => t.trip_id === tripId);
    if (!trip) {
      return { success: false, error: 'Không tìm thấy chuyến xe', code: 'TRIP_NOT_FOUND' };
    }

    return {
      success: true,
      data: trip
    };
  }

  _normalizeVietnamese(str) {
    if (!str) return '';
    return str
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'd')
      .trim();
  }
}
