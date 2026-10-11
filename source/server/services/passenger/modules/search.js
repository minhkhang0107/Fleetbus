/**
 * FleetBus Passenger Search & Discovery Module
 * Implements PAX-004 (Home), PAX-005 (Location Picker), PAX-006 (Search Results), PAX-007 (Trip Detail).
 */

import { effectiveStops } from '../../../core/routeStops.js';
import { findOperatorById } from '../../../core/operators.js';
import { DEMO_DATE, addDays, parseRunId, runId, serviceCalendar, vnDate } from '../../../core/serviceDate.js';
import { stopCoords, routeShape } from '../../../core/geo.js';

export const STATIONS_DATABASE = [
  {
    station_id: 'stp_hn_gb',
    name: 'Bến xe Giáp Bát',
    city: 'Hà Nội',
    address: 'Km 6 Giải Phóng, Giáp Bát, Hoàng Mai, Hà Nội',
    lat: 20.9806,
    lng: 105.8413,
    popular: true,
    operator_ids: ['op_saomai']
  },
  {
    station_id: 'stp_hn_my_dinh',
    name: 'Bến xe Mỹ Đình',
    city: 'Hà Nội',
    address: '20 Phạm Hùng, Mỹ Đình, Nam Từ Liêm, Hà Nội',
    lat: 21.0285,
    lng: 105.7783,
    popular: true,
    operator_ids: ['op_saomai', 'op_xuyenviet']
  },
  {
    station_id: 'stp_hn_nuoc_ngam',
    name: 'Bến xe Nước Ngầm',
    city: 'Hà Nội',
    address: '01 Ngọc Hồi, Hoàng Liệt, Hoàng Mai, Hà Nội',
    lat: 20.9634,
    lng: 105.8446,
    popular: true,
    operator_ids: ['op_saomai']
  },
  {
    station_id: 'stp_th_pb',
    name: 'Bến xe Phía Bắc Thanh Hóa',
    city: 'Thanh Hóa',
    address: 'Nguyễn Chí Thanh, Nam Ngạn, TP. Thanh Hóa',
    lat: 19.8067,
    lng: 105.7852,
    popular: true,
    operator_ids: ['op_saomai', 'op_xuyenviet']
  },
  {
    station_id: 'stp_th_sam_son',
    name: 'Bến xe Sầm Sơn',
    city: 'Thanh Hóa',
    address: 'Đường Lê Lợi, Sầm Sơn, Thanh Hóa',
    lat: 19.7423,
    lng: 105.9012,
    popular: true,
    operator_ids: ['op_saomai']
  },
  {
    station_id: 'stp_na_vinh',
    name: 'Bến xe Chợ Vinh',
    city: 'Nghệ An',
    address: 'Đường Cao Thắng, TP. Vinh, Nghệ An',
    lat: 18.6672,
    lng: 105.6791,
    popular: true,
    operator_ids: ['op_saomai']
  },
  {
    station_id: 'stp_dn_tt',
    name: 'Bến xe Trung tâm Đà Nẵng',
    city: 'Đà Nẵng',
    address: '185 Tôn Đức Thắng, Hòa Minh, Liên Chiểu, Đà Nẵng',
    lat: 16.0592,
    lng: 108.1673,
    popular: true,
    operator_ids: ['op_saomai']
  },
  {
    station_id: 'stp_nb',
    name: 'Bến xe Ninh Bình',
    city: 'Ninh Bình',
    address: 'Đường Lê Đại Hành, TP. Ninh Bình',
    lat: 20.2531,
    lng: 105.9748,
    popular: true,
    operator_ids: ['op_saomai', 'op_xuyenviet']
  }
];

export const MOCK_TRIPS_DATABASE = [
  {
    trip_id: 'trp_hn_th_01',
    operator_id: 'op_saomai',
    route_id: 'rt_hn_th',
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
      { stop_id: 'stp_rs_phap_van', name: 'Nút giao Pháp Vân', city: 'Hà Nội', order: 3, pickup_allowed: true, dropoff_allowed: false, kind: 'ROADSIDE' },
      { stop_id: 'stp_rs_phu_ly', name: 'Nút giao Phủ Lý (cao tốc)', city: 'Hà Nam', order: 4, pickup_allowed: true, dropoff_allowed: true, kind: 'ROADSIDE' },
      { stop_id: 'stp_nb', name: 'Bến xe Ninh Bình', city: 'Ninh Bình', order: 5, pickup_allowed: true, dropoff_allowed: true },
      { stop_id: 'stp_rs_bim_son', name: 'Ngã ba Bỉm Sơn', city: 'Thanh Hóa', order: 6, pickup_allowed: false, dropoff_allowed: true, kind: 'ROADSIDE' },
      { stop_id: 'stp_th_pb', name: 'Bến xe Phía Bắc Thanh Hóa', city: 'Thanh Hóa', order: 7, pickup_allowed: false, dropoff_allowed: true },
      { stop_id: 'stp_th_sam_son', name: 'Bến xe Sầm Sơn', city: 'Thanh Hóa', order: 8, pickup_allowed: false, dropoff_allowed: true }
    ]
  },
  {
    trip_id: 'trp_hn_th_02',
    operator_id: 'op_saomai',
    route_id: 'rt_hn_th',
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
    operator_id: 'op_saomai',
    route_id: 'rt_hn_th',
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
  },
  {
    trip_id: 'trp_xv_hn_th_01',
    operator_id: 'op_xuyenviet',
    route_id: 'rt_xv_hn_th',
    route_name: 'Hà Nội — Thanh Hóa (Xuyên Việt)',
    vehicle_type: 'VIP_CABIN',
    vehicle_title: 'Limousine Xuyên Việt 22 Phòng',
    plate_number: '30H-246.80',
    departure_time: '2026-08-28T08:30:00+07:00',
    arrival_time: '2026-08-28T11:00:00+07:00',
    duration_minutes: 150,
    base_fare_vnd: 200000,
    total_seats: 22,
    available_seats_count: 22,
    rating: 4.8,
    amenities: ['wifi', 'water', 'usb_charging'],
    stops: [
      { stop_id: 'stp_hn_my_dinh', name: 'Bến xe Mỹ Đình', city: 'Hà Nội', order: 1, pickup_allowed: true, dropoff_allowed: false },
      { stop_id: 'stp_nb', name: 'Bến xe Ninh Bình', city: 'Ninh Bình', order: 2, pickup_allowed: true, dropoff_allowed: true },
      { stop_id: 'stp_th_pb', name: 'Bến xe Phía Bắc Thanh Hóa', city: 'Thanh Hóa', order: 3, pickup_allowed: false, dropoff_allowed: true }
    ]
  }
];

// A stop is a bus station (bến xe) or a roadside point (điểm dọc đường); the passenger app draws a route line
// of every stop, or lists the stations only, depending on the route's stop_style.
for (const trip of MOCK_TRIPS_DATABASE) {
  for (const stop of trip.stops) stop.kind = stop.kind || (stop.name.startsWith('Bến xe') ? 'STATION' : 'ROADSIDE');
}

// Schedules: the seed trips, each repeated every day at the same time.
const SCHEDULE_TEMPLATES = new Map(MOCK_TRIPS_DATABASE.map(t => [t.trip_id, t]));

export class PassengerSearchService {
  /**
   * PAX-005: Location / Station search with diacritics fuzzy matching
   */
  searchStations(query = '', limit = 10, operatorId = null) {
    const q = this._normalizeVietnamese(query.trim());
    let stations = STATIONS_DATABASE;
    if (operatorId) {
      stations = stations.filter(s => s.operator_ids && s.operator_ids.includes(operatorId));
    }
    
    if (!q) {
      return stations.filter(s => s.popular).slice(0, limit);
    }

    return stations.filter(station => {
      const matchName = this._normalizeVietnamese(station.name).includes(q);
      const matchCity = this._normalizeVietnamese(station.city).includes(q);
      const matchAddress = this._normalizeVietnamese(station.address).includes(q);
      return matchName || matchCity || matchAddress;
    }).slice(0, limit);
  }

  /**
   * The run of a schedule on a travel day (spec 3.4: a Trip is one run on a date). The seed trips run on
   * DEMO_DATE and keep their ids; any other day gets its own run `<schedule>_<YYYYMMDD>` with its own seats,
   * created once and kept in the catalog so every service finds it.
   */
  materializeRun(templateId, date) {
    const template = SCHEDULE_TEMPLATES.get(templateId);
    if (!template) return null;
    if (date === DEMO_DATE) return template;
    const id = runId(templateId, date);
    const existing = MOCK_TRIPS_DATABASE.find(t => t.trip_id === id);
    if (existing) return existing;
    // Same Vietnam clock time on the new day; arrival keeps the trip's duration.
    const time = template.departure_time.slice(10);
    const departure = `${date}${time}`;
    const arrival = new Date(Date.parse(departure) + (Date.parse(template.arrival_time) - Date.parse(template.departure_time)));
    const run = {
      ...structuredClone(template),
      trip_id: id,
      schedule_id: templateId,
      departure_time: departure,
      arrival_time: `${vnDate(arrival.getTime())}T${new Date(arrival.getTime() + 7 * 3600000).toISOString().slice(11, 19)}+07:00`,
      available_seats_count: template.total_seats
    };
    MOCK_TRIPS_DATABASE.push(run);
    return run;
  }

  /** Finds a trip, creating a schedule's run when the id names one (e.g. after a server restart). */
  _findTrip(tripId) {
    const found = MOCK_TRIPS_DATABASE.find(t => t.trip_id === tripId);
    if (found) return found;
    const run = parseRunId(tripId);
    if (!run) return null;
    // Only days around the booking window: an id for any other day must not grow the catalog.
    const { today, last_date: last } = serviceCalendar();
    if (run.date < addDays(today, -1) || run.date > last) return null;
    return this.materializeRun(run.templateId, run.date);
  }

  /**
   * PAX-006: Search Trips with segment matching, vehicle type and time filters
   */
  searchTrips(criteria = {}) {
    const {
      originCity = 'Hà Nội',
      destinationCity = 'Thanh Hóa',
      date, // YYYY-MM-DD, already checked against the booking window by the route
      vehicleType, // 'VIP_CABIN' | 'SLEEPER_34'
      timeSlot, // 'MORNING' (05:00-12:00), 'AFTERNOON' (12:00-18:00), 'EVENING' (18:00-24:00)
      sortBy = 'DEPARTURE_ASC', // 'PRICE_ASC' | 'PRICE_DESC' | 'DEPARTURE_ASC'
      operatorId
    } = criteria;

    const normOrigin = this._normalizeVietnamese(originCity);
    const normDest = this._normalizeVietnamese(destinationCity);

    // A travel day lists that day's runs of every schedule; without a day, the seed trips (old callers).
    const pool = date ? [...SCHEDULE_TEMPLATES.keys()].map(id => this.materializeRun(id, date)) : [...SCHEDULE_TEMPLATES.values()];
    let results = pool.filter(trip => {
      if (operatorId && trip.operator_id !== operatorId) return false;

      // Must have a pickup stop in origin city and dropoff stop in destination city with order pickup < dropoff
      const stops = this._stopsOf(trip);
      const pickupStop = stops.find(s => this._normalizeVietnamese(s.city) === normOrigin && s.pickup_allowed);
      const dropoffStop = stops.find(s => this._normalizeVietnamese(s.city) === normDest && s.dropoff_allowed);

      if (!pickupStop || !dropoffStop) return false;
      if (pickupStop.order >= dropoffStop.order) return false;

      // Filter by vehicle type
      if (vehicleType && trip.vehicle_type !== vehicleType) return false;

      // Filter by time slot
      if (timeSlot) {
        // Vietnam clock hour, whatever the server's time zone.
        const hour = (new Date(trip.departure_time).getUTCHours() + 7) % 24;
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
  getTripDetail(tripId, operatorId = null) {
    const trip = this._findTrip(tripId);
    if (!trip) {
      return { success: false, error: 'Không tìm thấy chuyến xe', code: 'TRIP_NOT_FOUND' };
    }
    if (operatorId && trip.operator_id !== operatorId) {
      return { success: false, error: 'Không tìm thấy chuyến xe', code: 'TRIP_NOT_FOUND' };
    }

    const stops = this._stopsOf(trip).map(s => {
      const coords = stopCoords(s.stop_id);
      if (coords) {
        return { ...s, lat: coords.lat, lng: coords.lng };
      }
      const { lat, lng, ...rest } = s;
      return rest;
    });

    return {
      success: true,
      data: {
        ...trip,
        stops,
        route_shape: routeShape(trip.schedule_id || trip.trip_id) || null
      }
    };
  }

  /** A schedule of the route (its stops are the route's stops), or null. */
  templateForRoute(routeId, operatorId = null) {
    return [...SCHEDULE_TEMPLATES.values()].find(t => t.route_id === routeId && (!operatorId || t.operator_id === operatorId)) || null;
  }

  /** The route's stops with the company's settings applied, for the office. */
  routeStops(routeId, operatorId = null) {
    const template = this.templateForRoute(routeId, operatorId);
    return template ? this._stopsOf(template) : [];
  }

  /** The stops of a trip as its company set them for the route (times, allowed, hidden). */
  _stopsOf(trip) {
    const settings = findOperatorById(trip.operator_id)?.service_config?.route_configs?.[trip.route_id];
    return effectiveStops(trip, settings);
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
