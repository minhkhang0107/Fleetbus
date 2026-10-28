/**
 * FleetBus Passenger Search & Discovery Module
 * Implements PAX-004 (Home), PAX-005 (Location Picker), PAX-006 (Search Results), PAX-007 (Trip Detail).
 */

import { effectiveStops } from '../../../core/routeStops.js';
import { findOperatorById } from '../../../core/operators.js';
import crypto from 'crypto';
import { DEMO_DATE, addDays, parseRunId, parseServiceDate, runId, serviceCalendar, vnDate } from '../../../core/serviceDate.js';
import { stopCoords, routeShape, aliasShape, setStationsProvider, setRouteShape, setStopCoords } from '../../../core/geo.js';
import { findLayout, BUILTIN_LAYOUTS } from '../../../core/seatLayouts.js';

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

// Read-only accessor for schedule templates; callers must not mutate the returned array or objects.
export function getScheduleTemplates() {
  return Array.from(SCHEDULE_TEMPLATES.values());
}

export function getScheduleTemplate(templateId) {
  return SCHEDULE_TEMPLATES.get(templateId) || null;
}

/** Rebuilds the schedule index after the catalog was reloaded from the database: runs carry a schedule_id. */
export function reloadScheduleTemplates() {
  SCHEDULE_TEMPLATES.clear();
  for (const t of MOCK_TRIPS_DATABASE) {
    if (t.schedule_id) continue;
    SCHEDULE_TEMPLATES.set(t.trip_id, t);
    aliasShape(t.trip_id, t.shape_id);
    // A route a company drew itself has no surveyed road: a line through its stops, as when it was created.
    if (!routeShape(t.trip_id)) {
      const line = (t.stops || []).filter(st => Number.isFinite(st.lat) && Number.isFinite(st.lng)).map(st => [st.lat, st.lng]);
      if (line.length >= 2) setRouteShape(t.shape_id || t.trip_id, line);
    }
  }
}

setStationsProvider((id) => STATIONS_DATABASE.find(s => s.station_id === id));

// ---------- Fixed timetable of a company (D128, D129) ----------
// A schedule is a fixed departure of a route: a clock time, the weekdays it runs (1 = Monday .. 7 = Sunday),
// a validity (YYYY-MM-DD, inclusive) and an on/off switch. Each day it runs has its own trip.
// Changes never touch a day already on sale: a schedule keeps dated versions, and a travel day takes the
// latest version in force on that day (`settingsOn`). A change starts on the first day not yet on sale.
export const ALL_WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];
const HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
// What a dated version may change; the route, stops and bus type stay with the schedule.
const VERSION_FIELDS = ['departure_time', 'arrival_time', 'duration_minutes', 'base_fare_vnd', 'days_of_week', 'valid_to', 'active'];

export function weekdayOf(date) {
  const d = new Date(`${date}T00:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

/** The schedule as it stands on a travel day: its base, then every dated version in force by then. */
export function settingsOn(schedule, date) {
  let settings = schedule;
  for (const v of schedule.versions || []) {
    if (v.effective_from <= date) settings = { ...settings, ...pickVersion(v) };
  }
  return settings;
}

function pickVersion(v) {
  return Object.fromEntries(VERSION_FIELDS.filter(k => v[k] !== undefined).map(k => [k, v[k]]));
}

/** Does this schedule run on that travel day? */
export function runsOn(schedule, date) {
  if (!schedule) return false;
  const s = settingsOn(schedule, date);
  if (s.active === false) return false;
  if (Array.isArray(s.days_of_week) && !s.days_of_week.includes(weekdayOf(date))) return false;
  if (schedule.valid_from && date < schedule.valid_from) return false;
  if (s.valid_to && date > s.valid_to) return false;
  return true;
}

function versionView(v) {
  return {
    departure: v.departure_time.slice(11, 16),
    duration_minutes: v.duration_minutes,
    days_of_week: v.days_of_week || ALL_WEEKDAYS,
    valid_to: v.valid_to || null,
    active: v.active !== false,
    base_fare_vnd: v.base_fare_vnd
  };
}

/**
 * The office's view of a schedule on `today`: the settings in force, and the dated changes still to come
 * (`locked` when their first day is already on sale, so they can no longer be cancelled).
 */
export function scheduleView(t, { today = vnDate(), changeFrom = null } = {}) {
  const current = settingsOn(t, today);
  const status = t.valid_from && t.valid_from > today ? 'UPCOMING'
    : current.valid_to && current.valid_to < today ? 'ENDED'
      : current.active === false ? 'STOPPED' : 'ACTIVE';
  return {
    schedule_id: t.trip_id,
    route_id: t.route_id,
    route_name: t.route_name,
    ...versionView(current),
    valid_from: t.valid_from || null,
    status,
    extra: Boolean(t.extra),
    vehicle_type: t.vehicle_type,
    vehicle_title: t.vehicle_title,
    total_seats: t.total_seats,
    upcoming: (t.versions || []).filter(v => v.effective_from > today).map(v => ({
      effective_from: v.effective_from,
      locked: Boolean(changeFrom) && v.effective_from < changeFrom,
      ...versionView({ ...settingsOn(t, v.effective_from) })
    }))
  };
}

function invalid(message) {
  return { ok: false, status: 400, code: 'VALIDATION_ERROR', message };
}

const dmy = (date) => date.split('-').reverse().join('/');

/** Checks the editable fields of a schedule; returns an error result or null. */
function checkScheduleFields(f) {
  if (!HHMM_RE.test(f.departure || '')) return invalid('Giờ xuất bến dạng HH:mm');
  if (!Number.isInteger(f.duration_minutes) || f.duration_minutes < 15 || f.duration_minutes > 24 * 60) return invalid('Thời gian chạy 15-1440 phút');
  if (!Array.isArray(f.days_of_week) || !f.days_of_week.length || f.days_of_week.some(d => !ALL_WEEKDAYS.includes(d)) || new Set(f.days_of_week).size !== f.days_of_week.length) {
    return invalid('Chọn ít nhất một ngày chạy trong tuần (1 = Thứ Hai .. 7 = Chủ Nhật)');
  }
  for (const key of ['valid_from', 'valid_to']) {
    if (f[key] !== null && f[key] !== undefined && !parseServiceDate(f[key])) return invalid('Ngày hiệu lực dạng YYYY-MM-DD');
  }
  if (f.valid_from && f.valid_to && f.valid_to < f.valid_from) return invalid('Ngày kết thúc phải từ ngày bắt đầu trở đi');
  if (!Number.isInteger(f.base_fare_vnd) || f.base_fare_vnd < 10000 || f.base_fare_vnd > 10000000) return invalid('Giá vé 10.000 - 10.000.000 đ');
  if (typeof f.active !== 'boolean') return invalid('Trạng thái bật/tắt không hợp lệ');
  return null;
}

/** Departure and arrival of a schedule's template (the date part is only a placeholder). */
function clockTimes(departure, durationMinutes) {
  const dep = `${DEMO_DATE}T${departure}:00+07:00`;
  const arr = new Date(Date.parse(dep) + durationMinutes * 60000 + 7 * 3600000).toISOString();
  return { departure_time: dep, arrival_time: `${arr.slice(0, 10)}T${arr.slice(11, 19)}+07:00` };
}

/** The editable fields of a schedule as the office sends them, over the settings in force. */
function editFields(current, input) {
  const view = versionView(current);
  const pick = (k) => (input[k] === undefined ? view[k] : input[k]);
  return {
    departure: pick('departure'),
    duration_minutes: pick('duration_minutes'),
    days_of_week: pick('days_of_week'),
    valid_to: pick('valid_to'),
    base_fare_vnd: pick('base_fare_vnd'),
    active: pick('active')
  };
}

function versionOf(fields) {
  const { departure, ...rest } = fields;
  return { ...rest, ...clockTimes(departure, fields.duration_minutes), days_of_week: [...fields.days_of_week].sort() };
}

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
      const popular = stations.filter(s => s.popular);
      return (popular.length ? popular : stations).slice(0, limit);
    }

    return stations.filter(station => {
      const matchName = this._normalizeVietnamese(station.name).includes(q);
      const matchCity = this._normalizeVietnamese(station.city).includes(q);
      const matchAddress = this._normalizeVietnamese(station.address || '').includes(q);
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
    // A day the schedule does not run has no trip (an existing one keeps its tickets: see _findTrip).
    if (!template || !runsOn(template, date)) return null;
    if (date === DEMO_DATE) return template;
    const id = runId(templateId, date);
    const existing = MOCK_TRIPS_DATABASE.find(t => t.trip_id === id);
    if (existing) return existing;
    // The timetable in force that day; same Vietnam clock time, arrival keeps the trip's duration.
    const settings = settingsOn(template, date);
    const time = settings.departure_time.slice(10);
    const departure = `${date}${time}`;
    const arrival = new Date(Date.parse(departure) + (Date.parse(settings.arrival_time) - Date.parse(settings.departure_time)));
    const { versions, valid_from, valid_to, days_of_week, active, ...base } = structuredClone(settings);
    const run = {
      ...base,
      trip_id: id,
      schedule_id: templateId,
      departure_time: departure,
      arrival_time: `${vnDate(arrival.getTime())}T${new Date(arrival.getTime() + 7 * 3600000).toISOString().slice(11, 19)}+07:00`,
      available_seats_count: settings.total_seats
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
    const pool = date ? [...SCHEDULE_TEMPLATES.keys()].map(id => this.materializeRun(id, date)).filter(Boolean) : [...SCHEDULE_TEMPLATES.values()];
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

  /**
   * May a new booking be made on this trip? A day's run whose schedule no longer runs that day (switched off,
   * weekday or validity changed) keeps its tickets but takes no new ones.
   */
  isOnSchedule(tripId) {
    const run = parseRunId(tripId);
    if (!run) return true;
    return runsOn(SCHEDULE_TEMPLATES.get(run.templateId), run.date);
  }

  /** Travel days of the window on which some schedule of the company serves origin -> destination. */
  runDays({ originCity, destinationCity, operatorId, days, routeOpen = () => true }) {
    const normOrigin = this._normalizeVietnamese(originCity);
    const normDest = this._normalizeVietnamese(destinationCity);
    const serving = [...SCHEDULE_TEMPLATES.values()].filter(t => (!operatorId || t.operator_id === operatorId) && routeOpen(t.route_id) && this._serves(t, normOrigin, normDest));
    return days.filter(day => serving.some(t => runsOn(t, day)));
  }

  /** Does any schedule of the company run from one city to the other (D135)? */
  servesCities(operatorId, originCity, destinationCity) {
    const o = this._normalizeVietnamese(originCity);
    const d = this._normalizeVietnamese(destinationCity);
    return [...SCHEDULE_TEMPLATES.values()].some(t => t.operator_id === operatorId && this._serves(t, o, d));
  }

  _serves(trip, normOrigin, normDest) {
    const stops = this._stopsOf(trip);
    const pickup = stops.find(s => this._normalizeVietnamese(s.city) === normOrigin && s.pickup_allowed);
    const dropoff = stops.find(s => this._normalizeVietnamese(s.city) === normDest && s.dropoff_allowed);
    return Boolean(pickup && dropoff && pickup.order < dropoff.order);
  }

  /** A company's timetable for the office, by route then departure. */
  listSchedules(operatorId, when = {}) {
    return [...SCHEDULE_TEMPLATES.values()]
      .filter(t => t.operator_id === operatorId)
      .map(t => scheduleView(t, when))
      .sort((a, b) => a.route_id.localeCompare(b.route_id) || a.departure.localeCompare(b.departure));
  }

  /**
   * Creates a new route with its first schedule template (MGR-011).
   */
  createRoute(operatorId, input = {}, { changeFrom, today = vnDate(), operatorCode = null, customLayouts = [] } = {}) {
    if (!input.name || typeof input.name !== 'string' || input.name.trim().length < 3) {
      return invalid('Tên tuyến từ 3 ký tự trở lên');
    }

    if (!Array.isArray(input.stops) || input.stops.length < 2) {
      return invalid('Tuyến phải có ít nhất 2 điểm dừng');
    }

    const stopIds = input.stops.map(s => s?.stop_id);
    if (new Set(stopIds).size !== stopIds.length) {
      return invalid('Điểm dừng không được trùng lặp');
    }

    const usableStations = STATIONS_DATABASE.filter(s => s.operator_ids && s.operator_ids.includes(operatorId));
    const stationMap = new Map(usableStations.map(s => [s.station_id, s]));

    for (const s of input.stops) {
      if (!s?.stop_id || !stationMap.has(s.stop_id)) {
        return invalid(`Điểm dừng ${s?.stop_id || ''} không thuộc danh sách bến của nhà xe`);
      }
    }

    if (input.stops[0].pickup_allowed === false) {
      return invalid('Điểm đầu tuyến phải cho phép đón khách');
    }

    if (input.stops[input.stops.length - 1].dropoff_allowed === false) {
      return invalid('Điểm cuối tuyến phải cho phép trả khách');
    }

    const sch = input.schedule;
    if (!sch || typeof sch !== 'object') {
      return invalid('Cần thông tin lịch chạy ban đầu');
    }

    const knownVehicleTypes = new Set([
      ...BUILTIN_LAYOUTS.map(l => l.vehicle_type),
      ...BUILTIN_LAYOUTS.map(l => l.layout_id),
      ...customLayouts.map(l => l.vehicle_type),
      ...customLayouts.map(l => l.layout_id),
      'VIP_CABIN',
      'SLEEPER_34'
    ]);

    if (!sch.vehicle_type || !knownVehicleTypes.has(sch.vehicle_type)) {
      return invalid('Loại xe không hợp lệ');
    }

    // The seat count is the layout's when the bus type has one; a legacy type gives its own count.
    const layout = findLayout(sch.vehicle_type, customLayouts) || BUILTIN_LAYOUTS.find(l => l.vehicle_type === sch.vehicle_type);
    const totalSeats = layout?.seats?.length || sch.total_seats;
    if (!Number.isInteger(totalSeats) || totalSeats <= 0) {
      return invalid('Số lượng ghế phải là số nguyên dương');
    }

    const extra = sch.extra_date !== undefined && sch.extra_date !== null;
    if (extra) {
      if (!parseServiceDate(sch.extra_date)) return invalid('Ngày chạy tăng cường dạng YYYY-MM-DD');
      if (sch.extra_date < today) return invalid('Ngày chạy tăng cường đã qua');
    }
    const validFrom = extra ? sch.extra_date : sch.valid_from || changeFrom;
    if (!extra && validFrom < changeFrom) {
      return invalid(`Lịch mới áp dụng sớm nhất từ ${dmy(changeFrom)}, sau các ngày đang mở bán`);
    }

    const fields = {
      departure: sch.departure,
      duration_minutes: sch.duration_minutes,
      days_of_week: extra ? ALL_WEEKDAYS : sch.days_of_week ?? ALL_WEEKDAYS,
      valid_from: validFrom,
      valid_to: extra ? validFrom : sch.valid_to ?? null,
      base_fare_vnd: sch.base_fare_vnd,
      active: sch.active ?? true
    };
    const error = checkScheduleFields(fields);
    if (error) return error;

    const codeStr = (operatorCode || operatorId).toLowerCase().replace(/^op_/, '');
    const routeId = `rt_${codeStr}_${crypto.randomBytes(3).toString('hex')}`;
    const scheduleId = `sch_${crypto.randomBytes(5).toString('hex')}`;

    const builtStops = input.stops.map((s, idx) => {
      const st = stationMap.get(s.stop_id);
      return {
        stop_id: s.stop_id,
        name: st.name,
        city: st.city,
        order: idx + 1,
        pickup_allowed: s.pickup_allowed !== false,
        dropoff_allowed: s.dropoff_allowed !== false,
        kind: st.kind || 'STATION',
        lat: st.lat,
        lng: st.lng
      };
    });

    const vehicleTitle = sch.vehicle_title || (layout ? layout.name : 'Xe Limousine');

    const template = {
      trip_id: scheduleId,
      operator_id: operatorId,
      route_id: routeId,
      route_name: input.name.trim(),
      vehicle_type: sch.vehicle_type,
      vehicle_title: vehicleTitle,
      plate_number: null,
      duration_minutes: fields.duration_minutes,
      base_fare_vnd: fields.base_fare_vnd,
      total_seats: totalSeats,
      available_seats_count: totalSeats,
      rating: 5.0,
      amenities: [],
      stops: builtStops,
      shape_id: routeId,
      ...versionOf(fields),
      valid_from: validFrom,
      extra,
      versions: []
    };
    delete template.schedule_id;

    MOCK_TRIPS_DATABASE.push(template);
    SCHEDULE_TEMPLATES.set(scheduleId, template);

    const straightLine = builtStops.filter(s => Number.isFinite(s.lat) && Number.isFinite(s.lng)).map(s => [s.lat, s.lng]);
    if (straightLine.length >= 2) {
      setRouteShape(routeId, straightLine);
    }
    aliasShape(scheduleId, routeId);

    for (const s of builtStops) {
      if (Number.isFinite(s.lat) && Number.isFinite(s.lng)) {
        setStopCoords(s.stop_id, { lat: s.lat, lng: s.lng });
      }
    }

    return {
      ok: true,
      route_id: routeId,
      schedule_id: scheduleId,
      template,
      stops: builtStops,
      fields
    };
  }

  /**
   * A new fixed departure on a route the company already runs: stops, bus type and road come from that route.
   * It starts on `changeFrom` at the earliest, the first day not yet on sale (D129).
   */
  createSchedule(operatorId, input = {}, { changeFrom, today = vnDate() }) {
    const source = this.templateForRoute(input.route_id, operatorId);
    if (!source) return { ok: false, status: 404, code: 'ROUTE_NOT_FOUND', message: 'Không tìm thấy tuyến của nhà xe' };
    // An extra departure (chuyến tăng cường, spec 3.4, D134) runs on one day and may be inside the booking
    // window: it adds seats and changes nothing already sold.
    const extra = input.extra_date !== undefined && input.extra_date !== null;
    if (extra) {
      if (!parseServiceDate(input.extra_date)) return invalid('Ngày chạy tăng cường dạng YYYY-MM-DD');
      if (input.extra_date < today) return invalid('Ngày chạy tăng cường đã qua');
    }
    const validFrom = extra ? input.extra_date : input.valid_from || changeFrom;
    if (!extra && validFrom < changeFrom) return invalid(`Lịch mới áp dụng sớm nhất từ ${dmy(changeFrom)}, sau các ngày đang mở bán`);
    const fields = {
      departure: input.departure,
      duration_minutes: input.duration_minutes ?? source.duration_minutes,
      days_of_week: extra ? ALL_WEEKDAYS : input.days_of_week ?? ALL_WEEKDAYS,
      valid_from: validFrom,
      valid_to: extra ? validFrom : input.valid_to ?? null,
      base_fare_vnd: input.base_fare_vnd ?? source.base_fare_vnd,
      active: input.active ?? true
    };
    const error = checkScheduleFields(fields);
    if (error) return error;
    const id = `sch_${crypto.randomBytes(5).toString('hex')}`;
    const { versions, ...from } = structuredClone(source);
    const schedule = {
      ...from,
      ...versionOf(fields),
      valid_from: validFrom,
      trip_id: id,
      // No bus is given yet: the office assigns one per day or for the whole schedule.
      plate_number: null,
      extra,
      available_seats_count: source.total_seats,
      shape_id: source.shape_id || source.trip_id
    };
    delete schedule.schedule_id;
    MOCK_TRIPS_DATABASE.push(schedule);
    SCHEDULE_TEMPLATES.set(id, schedule);
    aliasShape(id, schedule.shape_id);
    return { ok: true, before: null, schedule };
  }

  /**
   * Changes a schedule from `effective_from` (default and earliest: `changeFrom`). A schedule with no day on
   * sale yet is changed outright; otherwise the change is a dated version and the days on sale keep theirs.
   */
  updateSchedule(operatorId, scheduleId, input = {}, { today, changeFrom }) {
    const schedule = SCHEDULE_TEMPLATES.get(scheduleId);
    if (!schedule || schedule.operator_id !== operatorId) return { ok: false, status: 404, code: 'SCHEDULE_NOT_FOUND', message: 'Không tìm thấy lịch chạy' };
    const before = structuredClone(schedule);
    // Versions already in force for every day still ahead fold into the base.
    const due = (schedule.versions || []).filter(v => v.effective_from <= today);
    if (due.length) {
      const ahead = schedule.versions.filter(v => v.effective_from > today);
      for (const v of due) Object.assign(schedule, pickVersion(v));
      schedule.versions = ahead;
    }

    if (schedule.valid_from && schedule.valid_from >= changeFrom) {
      // Nothing of it is on sale yet: change it outright (its start may move, never before changeFrom).
      const validFrom = input.valid_from ?? schedule.valid_from;
      if (validFrom < changeFrom) return invalid(`Lịch áp dụng sớm nhất từ ${dmy(changeFrom)}, sau các ngày đang mở bán`);
      const fields = { ...editFields(schedule, input), valid_from: validFrom };
      const error = checkScheduleFields(fields);
      if (error) return error;
      Object.assign(schedule, versionOf(fields), { valid_from: validFrom, versions: [] });
      return { ok: true, before, schedule, effective_from: validFrom };
    }

    if (schedule.extra) {
      return { ok: false, status: 409, code: 'EXTRA_RUN_ON_SALE', message: 'Chuyến tăng cường đang bán vé, không sửa được; hủy chuyến trên bảng điều độ nếu không chạy' };
    }
    if (input.valid_from !== undefined && input.valid_from !== schedule.valid_from) {
      return invalid('Lịch đang bán vé, không đổi được ngày bắt đầu');
    }
    const effective = input.effective_from || changeFrom;
    if (!parseServiceDate(effective) || effective < changeFrom) {
      return invalid(`Thay đổi có hiệu lực sớm nhất từ ${dmy(changeFrom)}: các ngày trước đó đã mở bán`);
    }
    const fields = editFields(settingsOn(schedule, effective), input);
    const error = checkScheduleFields({ ...fields, valid_from: schedule.valid_from || null });
    if (error) return error;
    // A later change replaces the ones not on sale yet from the same day on.
    schedule.versions = [...(schedule.versions || []).filter(v => v.effective_from < effective), { effective_from: effective, ...versionOf(fields) }];
    return { ok: true, before, schedule, effective_from: effective };
  }

  /** Drops the changes of a schedule that start on a day not yet on sale. */
  cancelScheduleChanges(operatorId, scheduleId, { changeFrom }) {
    const schedule = SCHEDULE_TEMPLATES.get(scheduleId);
    if (!schedule || schedule.operator_id !== operatorId) return { ok: false, status: 404, code: 'SCHEDULE_NOT_FOUND', message: 'Không tìm thấy lịch chạy' };
    const keep = (schedule.versions || []).filter(v => v.effective_from < changeFrom);
    if (keep.length === (schedule.versions || []).length) return { ok: false, status: 404, code: 'NO_PENDING_CHANGE', message: 'Không có thay đổi nào chưa mở bán để hủy' };
    const before = structuredClone(schedule);
    schedule.versions = keep;
    return { ok: true, before, schedule };
  }

  /** The day's runs already set up for a company (whatever its schedules say now). */
  existingRunsOn(date, operatorId) {
    return MOCK_TRIPS_DATABASE.filter(t => t.schedule_id && parseRunId(t.trip_id)?.date === date && (!operatorId || t.operator_id === operatorId));
  }

  /** Ids of a company's schedules. */
  schedulesOf(operatorId) {
    return [...SCHEDULE_TEMPLATES.values()].filter(t => !operatorId || t.operator_id === operatorId).map(t => t.trip_id);
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

  /** Planned time and its source at each stop of a sold trip, by stop id, the same times the passenger sees. */
  stopTimes(tripId) {
    const trip = this._findTrip(tripId);
    if (!trip) return {};
    return Object.fromEntries(this._stopsOf(trip).map(s => [s.stop_id, { planned_time: s.planned_time, time_source: s.time_source }]));
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
