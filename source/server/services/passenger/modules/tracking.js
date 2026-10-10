/**
 * FleetBus Passenger Telemetry, Live Radar & Disruption Handling Module
 * Implements PAX-018 (Live Tracking), PAX-019 (ETA HUD), PAX-020 (Notifications), PAX-024 (Swap Notice), PAX-025 (Delay Alert).
 */

import { calculateHaversineDistance, calculateETA } from '../core/cryptoEngine.js';
import { REST_STOPS, REST_STOP_AFTER_MS, STILL_SPEED_KMH } from '../../../core/restStops.js';
import { stopCoords, routeShape, distanceAlongRoute, signedDistanceAlongRoute } from '../../../core/geo.js';

export class PassengerTrackingService {
  constructor() {
    this.busPositions = new Map(); // tripId -> Telemetry
    this.notifications = new Map(); // userId/phone -> [Notification]
    this.disruptions = new Map(); // tripId -> DisruptionRecord
    this.stillSince = new Map(); // tripId -> { stopId, since }: the bus has been still inside a rest-stop geofence since then
  }

  /**
   * PAX-018: Ingest Driver GPS telemetry ping & get Live Bus Radar Snapshot
   */
  updateBusPosition(tripId, { lat, lng, speed_kmh, bearing_deg, plate_number, is_at_rest_stop, rest_stop_name = null, estimated_rest_minutes = null, mockNow = Date.now() }) {
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
      timestamp: new Date(mockNow).toISOString(),
      status: isRestStop ? 'REST_STOP' : (speed_kmh > 5 ? 'IN_TRANSIT' : 'STOPPED'),
      is_at_rest_stop: isRestStop,
      rest_stop_name: rest_stop_name || (isRestStop ? 'Trạm dừng chân Ninh Bình' : null),
      estimated_rest_minutes: estimated_rest_minutes || (isRestStop ? 15 : null)
    };

    this.busPositions.set(tripId, record);
    return { success: true, data: record };
  }

  _detectRestStop(tripId, lat, lng, speedKmh, now) {
    const stop = Number.isFinite(lat) && Number.isFinite(lng)
      ? REST_STOPS.find(s => calculateHaversineDistance(lat, lng, s.lat, s.lng) <= s.radius_m)
      : null;
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
    const etaMinutes = calculateETA(distanceMeters, busPos.speed_kmh || 45);
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

  _buildHudStatusText(busPos, distanceMeters, etaMinutes, isAtStation, isArrivingSoon, boarded = false, view = 'TICKET', targetName = null) {
    if (busPos.is_at_rest_stop || busPos.status === 'REST_STOP') {
      return `Xe đang dừng nghỉ tại ${busPos.rest_stop_name || 'Trạm dừng nghỉ'} (Dự kiến nghỉ ${busPos.estimated_rest_minutes || 15} phút)`;
    }
    if (view === 'PUBLIC') {
      if (isAtStation) {
        return `Xe đã đến ${targetName || 'điểm đón'}!`;
      }
      return `Xe đang đến ${targetName || 'điểm đón'} (Cách ${Math.round(distanceMeters / 1000)} km, ~${etaMinutes} phút)`;
    }
    if (isAtStation) {
      return boarded
        ? 'Xe đã đến điểm trả! Mời quý khách chuẩn bị xuống xe'
        : 'Xe đã cập bến! Mời quý khách chuẩn bị lên xe';
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
   * Route-aware Live Radar HUD with stop coordinates, road shape, and along-road ETA.
   */
  getTripRadar(tripId, { pickupStopId = null, dropoffStopId = null, boarded = false, stops = [], mockNow = Date.now(), view = null } = {}) {
    const effectiveView = view || (pickupStopId || dropoffStopId || boarded ? 'TICKET' : 'PUBLIC');
    const busPos = this.busPositions.get(tripId);
    const shape = routeShape(tripId);

    let targetStopId = boarded ? dropoffStopId : pickupStopId;
    if (!targetStopId && stops && stops.length > 0) {
      if (effectiveView === 'PUBLIC' && busPos && shape) {
        const firstStop = stops[0];
        const firstCoords = stopCoords(firstStop.stop_id) || (Number.isFinite(firstStop.lat) && Number.isFinite(firstStop.lng) ? { lat: firstStop.lat, lng: firstStop.lng } : null);
        const firstSigned = firstCoords
          ? signedDistanceAlongRoute(shape, busPos.lat, busPos.lng, firstCoords.lat, firstCoords.lng)
          : null;

        if (firstSigned !== null && firstSigned < -200) {
          const nextAhead = stops.find(s => {
            const sc = stopCoords(s.stop_id) || (Number.isFinite(s.lat) && Number.isFinite(s.lng) ? { lat: s.lat, lng: s.lng } : null);
            if (!sc) return false;
            const d = signedDistanceAlongRoute(shape, busPos.lat, busPos.lng, sc.lat, sc.lng);
            return d !== null && d > 200;
          });
          targetStopId = nextAhead ? nextAhead.stop_id : stops[stops.length - 1].stop_id;
        } else {
          targetStopId = stops[0].stop_id;
        }
      } else {
        targetStopId = stops[0].stop_id;
      }
    }

    const targetStopObj = stops && targetStopId ? stops.find(s => s.stop_id === targetStopId) : null;
    const coords = targetStopId ? stopCoords(targetStopId) : null;
    const targetLat = coords ? coords.lat : (targetStopObj && Number.isFinite(targetStopObj.lat) ? targetStopObj.lat : 20.9806);
    const targetLng = coords ? coords.lng : (targetStopObj && Number.isFinite(targetStopObj.lng) ? targetStopObj.lng : 105.8413);

    const targetStop = {
      stop_id: targetStopId || null,
      name: targetStopObj?.name || null,
      lat: targetLat,
      lng: targetLng,
      kind: boarded ? 'DROPOFF' : 'PICKUP'
    };

    const hudRes = this.getLiveTrackingHUD(tripId, targetLat, targetLng, mockNow);
    const data = { ...hudRes.data };

    let distanceBasis = 'STRAIGHT_LINE';
    let hasPassedTarget = false;

    if (data.has_position && data.bus_position && shape) {
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
          data.eta_minutes = calculateETA(roadDist, data.bus_position.speed_kmh || 45);
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
            targetStop.name
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
          targetStop.name
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
        targetStop.name
      );
    }

    const mappedStops = (Array.isArray(stops) ? stops : [])
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

    data.target_stop = targetStop;
    data.stops = mappedStops;
    data.route_shape = shape || null;
    data.distance_basis = distanceBasis;
    data.has_passed_target = hasPassedTarget;
    data.view = effectiveView;

    return {
      success: true,
      data
    };
  }

  /**
   * PAX-020: Send & retrieve Push Notifications
   */
  sendNotification(phone, { title, body, type = 'GENERAL', payload = {} }) {
    const normalized = phone.replace(/[\s\-\.]/g, '');
    const userNotifs = this.notifications.get(normalized) || [];

    const notif = {
      id: `notif_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      title,
      body,
      type, // 'TRIP_UPDATE' | 'DELAY' | 'SWAP' | 'BOARDING_REMINDER' | 'PAYMENT_SUCCESS'
      payload,
      is_read: false,
      created_at: new Date().toISOString()
    };

    userNotifs.unshift(notif);
    this.notifications.set(normalized, userNotifs);

    return { success: true, data: notif };
  }

  getNotifications(phone) {
    const normalized = phone.replace(/[\s\-\.]/g, '');
    const list = this.notifications.get(normalized) || [];
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
