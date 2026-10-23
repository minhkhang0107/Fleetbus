/**
 * FleetBus Passenger Telemetry, Live Radar & Disruption Handling Module
 * Implements PAX-018 (Live Tracking), PAX-019 (ETA HUD), PAX-020 (Notifications), PAX-024 (Swap Notice), PAX-025 (Delay Alert).
 */

import { EventEmitter } from 'events';
import { calculateHaversineDistance, calculateETA } from '../core/cryptoEngine.js';
import { REST_STOPS, REST_STOP_AFTER_MS, STILL_SPEED_KMH } from '../../../core/restStops.js';
import { stopCoords, routeShape, distanceAlongRoute, signedDistanceAlongRoute } from '../../../core/geo.js';
import { DEFAULT_OPERATOR_ID } from '../../../core/operators.js';
import { HOME_ROAD_FACTOR, HOME_CITY_SPEED_KMH, HOME_NEAR_METERS, HOME_AT_DOOR_METERS, HOME_AT_DOOR_SPEED_KMH } from '../../../core/homeRun.js';

/** Within this distance of a stop, a parked bus is waiting at that stop. */
const AT_STOP_METERS = 150;
/**
 * Speed for an ETA: over a long way the bus averages its road speed whatever it does this minute (parked at a stop,
 * slowed in a town), so the minutes do not jump between pings; close by, its own speed.
 */
const ROAD_SPEED_KMH = 45;
function etaSpeed(meters, speedKmh) {
  const speed = Number(speedKmh) || 0;
  return meters > 5000 ? Math.max(speed, ROAD_SPEED_KMH) : (speed || ROAD_SPEED_KMH);
}

/** Along the route, a stop this far behind the bus counts as passed. */
const PASSED_METERS = 200;

export class PassengerTrackingService {
  constructor() {
    this.busPositions = new Map(); // tripId -> Telemetry
    this.notifications = new Map(); // userId/phone -> [Notification]
    this.disruptions = new Map(); // tripId -> DisruptionRecord
    this.stillSince = new Map(); // tripId -> { stopId, since }: the bus has been still inside a rest-stop geofence since then
    this.positionEvents = new EventEmitter(); // event = tripId, emitted after each applied position
    this.positionEvents.setMaxListeners(0);
  }

  /** Calls [listener] after each position applied for the trip; returns the function that stops it. */
  watchPositions(tripId, listener) {
    this.positionEvents.on(tripId, listener);
    return () => this.positionEvents.off(tripId, listener);
  }

  /**
   * PAX-018: Ingest Driver GPS telemetry ping & get Live Bus Radar Snapshot
   */
  updateBusPosition(tripId, { lat, lng, speed_kmh, bearing_deg, plate_number, is_at_rest_stop, rest_stop_name = null, estimated_rest_minutes = null, seq, recorded_at, accuracy_m, mockNow = Date.now() }) {
    // BR-TRACK-004: the rest stop is detected from the pings (still for over 5 minutes inside a geofence) unless told
    let isRestStop = Boolean(is_at_rest_stop);
    if (is_at_rest_stop === undefined) {
      const detected = this._detectRestStop(tripId, parseFloat(lat), parseFloat(lng), parseFloat(speed_kmh) || 0, mockNow);
      if (detected) {
        isRestStop = true;
        rest_stop_name = rest_stop_name || detected.name;
        estimated_rest_minutes = estimated_rest_minutes || detected.planned_rest_minutes;
      }
    }
    const record = {
      trip_id: tripId,
      plate_number: plate_number || '29B-882.19',
      lat: parseFloat(lat),
      lng: parseFloat(lng),
      speed_kmh: parseFloat(speed_kmh) || 0,
      bearing_deg: parseInt(bearing_deg, 10) || 0,
      timestamp: recorded_at ? new Date(recorded_at).toISOString() : new Date(mockNow).toISOString(),
      seq: seq !== undefined ? parseInt(seq, 10) : undefined,
      accuracy_m: accuracy_m !== undefined ? parseFloat(accuracy_m) : undefined,
      status: isRestStop ? 'REST_STOP' : (speed_kmh > 5 ? 'IN_TRANSIT' : 'STOPPED'),
      is_at_rest_stop: isRestStop,
      rest_stop_name: rest_stop_name || (isRestStop ? 'Trạm dừng chân Ninh Bình' : null),
      estimated_rest_minutes: estimated_rest_minutes || (isRestStop ? 15 : null)
    };

    this.busPositions.set(tripId, record);
    this.positionEvents.emit(tripId, record);
    return { success: true, data: record };
  }

  _detectRestStop(tripId, lat, lng, speedKmh, now) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    const stops = this.stopsProvider ? this.stopsProvider(tripId) : (this.eventBridge?.services?.driverService?.activeTrips?.get(tripId)?.stops || null);
    if (Array.isArray(stops)) {
      const isRouteStop = stops.some(s => {
        const sc = stopCoords(s.stop_id) || (Number.isFinite(s.lat) && Number.isFinite(s.lng) ? s : null);
        return sc && calculateHaversineDistance(lat, lng, sc.lat, sc.lng) <= 300;
      });
      if (isRouteStop) {
        this.stillSince.delete(tripId);
        return null;
      }
    }
    const stop = REST_STOPS.find(s => calculateHaversineDistance(lat, lng, s.lat, s.lng) <= s.radius_m);
    if (!stop || speedKmh >= STILL_SPEED_KMH) {
      this.stillSince.delete(tripId);
      return null;
    }
    const current = this.stillSince.get(tripId);
    if (!current || current.stopId !== stop.stop_id) {
      this.stillSince.set(tripId, { stopId: stop.stop_id, since: now });
      return null;
    }
    return now - current.since > REST_STOP_AFTER_MS ? stop : null;
  }

  /**
   * PAX-019: Get Live Radar HUD & ETA to passenger's pickup location (with Stale GPS check & Rest-stop HUD - REV-07)
   */
  getLiveTrackingHUD(tripId, pickupLat = 20.9806, pickupLng = 105.8413, mockNow = Date.now()) {
    const busPos = this.busPositions.get(tripId);
    if (!busPos) {
      // No ping has ever arrived for this trip: say so instead of drawing an invented bus (REV-07)
      return {
        success: true,
        data: {
          trip_id: tripId,
          has_position: false,
          signal_status: 'NO_SIGNAL',
          bus_position: null,
          is_stale: false,
          is_at_rest_stop: false,
          hud_status_text: 'Chưa nhận được tín hiệu GPS từ xe. Vị trí sẽ hiện khi xe bắt đầu chạy'
        }
      };
    }

    const distanceMeters = calculateHaversineDistance(busPos.lat, busPos.lng, pickupLat, pickupLng);
    const etaMinutes = calculateETA(distanceMeters, etaSpeed(distanceMeters, busPos.speed_kmh));
    const isArrivingSoon = distanceMeters <= 1000; // < 1 km
    const isAtStation = distanceMeters <= 100; // < 100 m

    // Detect telemetry staleness (PAX-018 BR-TRACK-002): over 60 s the position is STALE, over 180 s the signal is OFFLINE
    const posTimestampMs = new Date(busPos.timestamp).getTime();
    const ageSeconds = Math.max(0, Math.round((mockNow - posTimestampMs) / 1000));
    const isOffline = ageSeconds > 180;
    const isStale = ageSeconds > 60;
    const staleWarning = isOffline
      ? `Mất tín hiệu GPS xe (${ageSeconds} giây). Đang kết nối lại, vị trí hiển thị là vị trí cuối cùng nhận được.`
      : (isStale
        ? `Tín hiệu GPS cập nhật ${ageSeconds} giây trước. Xe có thể đang di chuyển qua hầm hoặc khu vực sóng di động yếu.`
        : null);

    const hudStatusText = this._buildHudStatusText(busPos, distanceMeters, etaMinutes, isAtStation, isArrivingSoon, false);

    return {
      success: true,
      data: {
        trip_id: tripId,
        has_position: true,
        signal_status: isOffline ? 'OFFLINE' : (isStale ? 'STALE' : 'LIVE'),
        bus_position: busPos,
        pickup_location: { lat: pickupLat, lng: pickupLng },
        distance_meters: distanceMeters,
        eta_minutes: etaMinutes,
        is_arriving_soon: isArrivingSoon,
        is_at_station: isAtStation,
        is_at_rest_stop: Boolean(busPos.is_at_rest_stop),
        rest_stop_name: busPos.rest_stop_name,
        estimated_rest_minutes: busPos.estimated_rest_minutes,
        is_stale: isStale,
        telemetry_age_seconds: ageSeconds,
        stale_warning: staleWarning,
        hud_status_text: hudStatusText
      }
    };
  }

  _buildHudStatusText(busPos, distanceMeters, etaMinutes, isAtStation, isArrivingSoon, boarded = false, view = 'TICKET', targetName = null, isAtRouteStop = false) {
    if (isAtStation) {
      if (view === 'PUBLIC') {
        return `Xe đã đến ${targetName || 'điểm đón'}!`;
      }
      return boarded
        ? 'Xe đã đến điểm trả! Mời quý khách chuẩn bị xuống xe'
        : 'Xe đã cập bến! Mời quý khách chuẩn bị lên xe';
    }
    if (!isAtRouteStop && (busPos.is_at_rest_stop || busPos.status === 'REST_STOP')) {
      return `Xe đang dừng nghỉ tại ${busPos.rest_stop_name || 'Trạm dừng nghỉ'} (Dự kiến nghỉ ${busPos.estimated_rest_minutes || 15} phút)`;
    }
    if (view === 'PUBLIC') {
      return `Xe đang đến ${targetName || 'điểm đón'} (Cách ${Math.round(distanceMeters / 1000)} km, ~${etaMinutes} phút)`;
    }
    if (isArrivingSoon) {
      return boarded
        ? `Xe sắp đến điểm trả của bạn trong ${etaMinutes} phút. Vui lòng chuẩn bị xuống xe!`
        : `Xe sắp đến trong ${etaMinutes} phút. Vui lòng có mặt tại điểm đón!`;
    }
    return boarded
      ? `Xe đang di chuyển đến điểm trả (Cách ${Math.round(distanceMeters / 1000)} km, ~${etaMinutes} phút)`
      : `Xe đang di chuyển (Cách ${Math.round(distanceMeters / 1000)} km, ~${etaMinutes} phút)`;
  }

  /**
   * Where the bus is on its route, in the passenger's words: the stop it is at or last passed, the next one,
   * and how many stops are left before the passenger's own. Null when the bus is off the route shape.
   */
  _busLocation(shape, pos, stops, targetStopId) {
    const along = stops.map(s => ({ stop: s, d: signedDistanceAlongRoute(shape, pos.lat, pos.lng, s.lat, s.lng) }));
    if (along.some(a => a.d === null)) return null;
    const here = along.find(a => Math.abs(a.d) <= AT_STOP_METERS);
    const passed = along.filter(a => a.d < -PASSED_METERS);
    const ahead = along.filter(a => a.d >= -PASSED_METERS && a !== here);
    const targetIndex = along.findIndex(a => a.stop.stop_id === targetStopId);
    const before = targetIndex < 0 ? null : along.slice(0, targetIndex).filter(a => a.d > AT_STOP_METERS).length;
    return {
      at_stop: here ? here.stop.name : null,
      last_passed_stop: passed.length ? passed[passed.length - 1].stop.name : null,
      next_stop: ahead.length ? ahead[0].stop.name : null,
      stops_before_target: before
    };
  }

  /**
   * Route-aware Live Radar HUD with stop coordinates, road shape, and along-road ETA.
   */
  getTripRadar(tripId, { pickupStopId = null, dropoffStopId = null, boarded = false, stops = [], mockNow = Date.now(), view = null, canSeeBus = false, tripStatus = null, isStaff = false, homePickup = null } = {}) {
    let effectiveStops = stops;
    if ((!effectiveStops || effectiveStops.length === 0) && this.stopsProvider) {
      effectiveStops = this.stopsProvider(tripId) || [];
    }
    const effectiveView = view || (pickupStopId || dropoffStopId || boarded ? 'TICKET' : 'PUBLIC');
    // D143: a confirmed home pickup is collected at the passenger's address, so that is where the bus is heading.
    const home = !boarded && homePickup && Number.isFinite(homePickup.lat) && Number.isFinite(homePickup.lng) ? homePickup : null;
    const busPos = this.busPositions.get(tripId);
    const shape = routeShape(tripId);

    let targetStopId = boarded ? dropoffStopId : pickupStopId;
    if (!targetStopId && effectiveStops && effectiveStops.length > 0) {
      if (effectiveView === 'PUBLIC' && busPos && shape) {
        const firstStop = effectiveStops[0];
        const firstCoords = stopCoords(firstStop.stop_id) || (Number.isFinite(firstStop.lat) && Number.isFinite(firstStop.lng) ? { lat: firstStop.lat, lng: firstStop.lng } : null);
        const firstSigned = firstCoords
          ? signedDistanceAlongRoute(shape, busPos.lat, busPos.lng, firstCoords.lat, firstCoords.lng)
          : null;

        if (firstSigned !== null && firstSigned < -200) {
          const nextAhead = effectiveStops.find(s => {
            const sc = stopCoords(s.stop_id) || (Number.isFinite(s.lat) && Number.isFinite(s.lng) ? { lat: s.lat, lng: s.lng } : null);
            if (!sc) return false;
            const d = signedDistanceAlongRoute(shape, busPos.lat, busPos.lng, sc.lat, sc.lng);
            return d !== null && d > 200;
          });
          targetStopId = nextAhead ? nextAhead.stop_id : effectiveStops[effectiveStops.length - 1].stop_id;
        } else {
          targetStopId = effectiveStops[0].stop_id;
        }
      } else {
        targetStopId = effectiveStops[0].stop_id;
      }
    }

    const targetStopObj = effectiveStops && targetStopId ? effectiveStops.find(s => s.stop_id === targetStopId) : null;
    const coords = targetStopId ? stopCoords(targetStopId) : null;
    const targetLat = coords ? coords.lat : (targetStopObj && Number.isFinite(targetStopObj.lat) ? targetStopObj.lat : 20.9806);
    const targetLng = coords ? coords.lng : (targetStopObj && Number.isFinite(targetStopObj.lng) ? targetStopObj.lng : 105.8413);

    const targetStop = home
      ? { stop_id: null, name: home.address || 'Địa chỉ đón', lat: home.lat, lng: home.lng, kind: 'HOME_PICKUP' }
      : {
        stop_id: targetStopId || null,
        name: targetStopObj?.name || null,
        lat: targetLat,
        lng: targetLng,
        kind: boarded ? 'DROPOFF' : 'PICKUP'
      };

    const hudRes = this.getLiveTrackingHUD(tripId, targetStop.lat, targetStop.lng, mockNow);
    const data = { ...hudRes.data };

    const isAtRouteStop = data.has_position && data.bus_position && Array.isArray(effectiveStops) && effectiveStops.some(s => {
      const sc = stopCoords(s.stop_id) || (Number.isFinite(s.lat) && Number.isFinite(s.lng) ? s : null);
      return sc && calculateHaversineDistance(data.bus_position.lat, data.bus_position.lng, sc.lat, sc.lng) <= 300;
    });

    if (isAtRouteStop) {
      data.is_at_rest_stop = false;
      if (data.bus_position) {
        data.bus_position.is_at_rest_stop = false;
        if (data.bus_position.status === 'REST_STOP') {
          data.bus_position.status = (data.bus_position.speed_kmh || 0) > STILL_SPEED_KMH ? 'IN_TRANSIT' : 'STOPPED';
        }
      }
    }

    let distanceBasis = 'STRAIGHT_LINE';
    let hasPassedTarget = false;

    if (home) {
      if (data.has_position && data.bus_position) {
        const pos = data.bus_position;
        const roadDist = Math.round(calculateHaversineDistance(pos.lat, pos.lng, home.lat, home.lng) * HOME_ROAD_FACTOR);
        distanceBasis = 'ESTIMATED_ROAD';
        data.distance_meters = roadDist;
        data.eta_minutes = calculateETA(roadDist, Math.max(pos.speed_kmh || 0, HOME_CITY_SPEED_KMH));
        data.near_door = roadDist <= HOME_NEAR_METERS;
        data.at_door = roadDist <= HOME_AT_DOOR_METERS && (pos.speed_kmh == null || pos.speed_kmh <= HOME_AT_DOOR_SPEED_KMH);
        data.is_at_station = data.at_door;
        data.is_arriving_soon = roadDist <= 1000;
        data.hud_status_text = data.at_door
          ? 'Xe đã tới chỗ đón của bạn. Mời bạn ra xe'
          : data.near_door
            ? 'Xe đã tới gần chỗ đón của bạn. Mời bạn ra xe'
            : data.is_arriving_soon
              ? `Xe sắp tới đón bạn, còn khoảng ${data.eta_minutes} phút. Bạn chuẩn bị ra xe nhé`
              : `Xe đang trên đường đón bạn (Cách ~${(roadDist / 1000).toFixed(1)} km, ~${data.eta_minutes} phút)`;
      } else {
        data.hud_status_text = 'Tài xế chưa bắt đầu đi đón. Vị trí xe sẽ hiện khi tài xế lên đường đón bạn';
      }
    } else if (data.has_position && data.bus_position && shape) {
      const signedDist = signedDistanceAlongRoute(
        shape,
        data.bus_position.lat,
        data.bus_position.lng,
        targetLat,
        targetLng
      );

      if (signedDist !== null) {
        distanceBasis = 'ROUTE';
        if (signedDist < -200) {
          hasPassedTarget = true;
          data.has_passed_target = true;
          data.distance_meters = 0;
          data.eta_minutes = 0;
          data.is_at_station = false;
          data.is_arriving_soon = false;
          data.hud_status_text = targetStop.kind === 'DROPOFF'
            ? (targetStop.name ? `Xe đã qua điểm trả ${targetStop.name}` : 'Xe đã qua điểm trả')
            : `Xe đã qua ${targetStop.name || 'điểm này'}`;
        } else {
          hasPassedTarget = false;
          const roadDist = Math.max(0, signedDist);
          data.distance_meters = roadDist;
          data.eta_minutes = calculateETA(roadDist, etaSpeed(roadDist, data.bus_position.speed_kmh));
          data.is_arriving_soon = roadDist <= 1000;
          data.is_at_station = roadDist <= 100;
          data.hud_status_text = this._buildHudStatusText(
            data.bus_position,
            roadDist,
            data.eta_minutes,
            data.is_at_station,
            data.is_arriving_soon,
            boarded,
            effectiveView,
            targetStop.name,
            isAtRouteStop
          );
        }
      } else {
        data.hud_status_text = this._buildHudStatusText(
          data.bus_position,
          data.distance_meters,
          data.eta_minutes,
          data.is_at_station,
          data.is_arriving_soon,
          boarded,
          effectiveView,
          targetStop.name,
          isAtRouteStop
        );
      }
    } else if (data.has_position && data.bus_position) {
      data.hud_status_text = this._buildHudStatusText(
        data.bus_position,
        data.distance_meters,
        data.eta_minutes,
        data.is_at_station,
        data.is_arriving_soon,
        boarded,
        effectiveView,
        targetStop.name,
        isAtRouteStop
      );
    }

    // A parked bus is not "moving": name the stop it waits at (or say it is stopped), keep the distance and ETA.
    const pos = data.bus_position;
    if (!home && data.has_position && pos && !hasPassedTarget && !data.is_at_station && effectiveView === 'TICKET'
      && !pos.is_at_rest_stop && pos.status !== 'REST_STOP' && Number.isFinite(pos.speed_kmh) && pos.speed_kmh < STILL_SPEED_KMH) {
      const here = (Array.isArray(effectiveStops) ? effectiveStops : []).find(s => {
        const sc = stopCoords(s.stop_id) || (Number.isFinite(s.lat) && Number.isFinite(s.lng) ? s : null);
        return sc && calculateHaversineDistance(pos.lat, pos.lng, sc.lat, sc.lng) <= AT_STOP_METERS;
      });
      const left = `Cách ${Math.round(data.distance_meters / 1000)} km, ~${data.eta_minutes} phút`;
      data.hud_status_text = here
        ? `Xe đang dừng ở ${here.name} (${boarded ? 'tới điểm trả' : 'tới điểm đón'}: ${left})`
        : `Xe đang dừng (${boarded ? 'tới điểm trả' : 'tới điểm đón'}: ${left})`;
    }

    const mappedStops = (Array.isArray(effectiveStops) ? effectiveStops : [])
      .map(s => {
        const sc = stopCoords(s.stop_id) || (Number.isFinite(s.lat) && Number.isFinite(s.lng) ? { lat: s.lat, lng: s.lng } : null);
        if (!sc) return null;
        return {
          stop_id: s.stop_id,
          name: s.name,
          order: s.order,
          lat: sc.lat,
          lng: sc.lng
        };
      })
      .filter(Boolean);

    // When the passenger should be ready, and when the bus will actually be there (spec 9: estimated pickup time).
    const window = home && home.window_from ? { from: home.window_from, to: home.window_to || home.window_from } : null;
    data.target_planned_time = home ? (window?.from || null) : (targetStopObj?.planned_time || null);
    data.target_window = window;
    const etaKnown = data.has_position && !hasPassedTarget && Number.isFinite(data.eta_minutes) && data.signal_status !== 'OFFLINE';
    data.expected_at = etaKnown ? new Date(mockNow + data.eta_minutes * 60000).toISOString() : null;
    const promised = window ? Date.parse(window.to) : Date.parse(data.target_planned_time || '');
    data.late_minutes = data.expected_at && Number.isFinite(promised)
      ? Math.max(0, Math.round((Date.parse(data.expected_at) - promised) / 60000))
      : null;
    data.bus_location = data.has_position && pos && shape && !home ? this._busLocation(shape, pos, mappedStops, targetStop.stop_id) : null;

    data.target_stop = targetStop;
    data.stops = mappedStops;
    data.route_shape = shape || null;
    data.distance_basis = distanceBasis;
    data.has_passed_target = hasPassedTarget;
    data.view = effectiveView;

    // Freshness
    if (data.has_position && data.bus_position) {
      const state = data.signal_status || 'NO_SIGNAL';
      const freshness = {
        position_at: data.bus_position.timestamp,
        eta_computed_at: new Date(mockNow).toISOString(),
        age_seconds: data.telemetry_age_seconds || 0,
        state,
        eta_basis: distanceBasis
      };
      if (state !== 'LIVE') {
        freshness.warning = 'Vị trí có thể đã cũ, giờ đến chỉ là ước tính';
      }
      data.freshness = freshness;
    } else {
      data.freshness = { position_at: null, eta_computed_at: new Date(mockNow).toISOString(), age_seconds: null, state: 'NO_SIGNAL', eta_basis: distanceBasis, warning: 'Chưa nhận được vị trí của xe' };
    }

    // Privacy
    const isEnded = tripStatus === 'COMPLETED' || tripStatus === 'CANCELLED';
    if (!isStaff && (isEnded || !canSeeBus)) {
      data.bus_position = null;
      data.has_position = false;
      delete data.distance_meters;
      delete data.eta_minutes;
      delete data.is_arriving_soon;
      delete data.is_at_station;
      delete data.has_passed_target;
      delete data.hud_status_text;
      delete data.signal_status;
      delete data.telemetry_age_seconds;
      delete data.stale_warning;
      delete data.is_stale;
      delete data.freshness;
      delete data.distance_basis;
      delete data.expected_at;
      delete data.late_minutes;
      delete data.bus_location;

      data.position_hidden = true;
      if (isEnded) {
        data.tracking_ended = true;
        data.trip_status = tripStatus;
        data.hud_status_text = tripStatus === 'COMPLETED' ? 'Chuyến đã kết thúc' : 'Chuyến xe đã bị hủy';
      }
    } else {
      if (tripStatus) {
        data.trip_status = tripStatus;
      }
      if (isEnded) {
        data.tracking_ended = true;
      }
    }

    return {
      success: true,
      data
    };
  }

  /**
   * PAX-020: Send & retrieve Push Notifications
   */
  sendNotification(phone, { title, body, type = 'GENERAL', payload = {}, operatorId = DEFAULT_OPERATOR_ID, link = null }) {
    const normalized = phone.replace(/[\s\-\.]/g, '');
    const userNotifs = this.notifications.get(normalized) || [];

    const notif = {
      id: `notif_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      title,
      body,
      type, // 'TRIP_UPDATE' | 'DELAY' | 'SWAP' | 'BOARDING_REMINDER' | 'PAYMENT_SUCCESS'
      payload,
      operator_id: operatorId,
      is_read: false,
      created_at: new Date().toISOString()
    };

    userNotifs.unshift(notif);
    this.notifications.set(normalized, userNotifs);
    // D144: the moments that make someone go out to the bus also leave by push or SMS.
    this.messenger?.dispatch?.({ operatorId, phone: normalized, title, body, type, payload, link });

    return { success: true, data: notif };
  }

  /**
   * Sends a notification only the first time for this key (spec 9: each event once per ticket), e.g.
   * `tkt_X:PICKUP_APPROACHING`. Returns null when it was already sent.
   */
  sendNotificationOnce(key, phone, notification) {
    if (!this.sentNotificationKeys) this.sentNotificationKeys = new Set();
    if (!phone || this.sentNotificationKeys.has(key)) return null;
    this.sentNotificationKeys.add(key);
    return this.sendNotification(phone, notification).data;
  }

  getNotifications(phone, operatorId = DEFAULT_OPERATOR_ID) {
    const normalized = phone.replace(/[\s\-\.]/g, '');
    const list = (this.notifications.get(normalized) || []).filter(n => (n.operator_id || DEFAULT_OPERATOR_ID) === operatorId);
    const unreadCount = list.filter(n => !n.is_read).length;

    return {
      success: true,
      unread_count: unreadCount,
      data: list
    };
  }

  /**
   * PAX-024 / PAX-025: Broadcast vehicle replacement or delay disruption notice
   */
  registerDisruption(tripId, { type, title, message, new_plate_number = null, delay_minutes = 0 }) {
    const record = {
      trip_id: tripId,
      type, // 'VEHICLE_REPLACEMENT' | 'TRIP_DELAY'
      title,
      message,
      new_plate_number,
      delay_minutes,
      created_at: new Date().toISOString()
    };

    this.disruptions.set(tripId, record);
    return { success: true, data: record };
  }

  getTripDisruption(tripId) {
    const disruption = this.disruptions.get(tripId);
    return {
      success: true,
      has_disruption: !!disruption,
      data: disruption || null
    };
  }
}
