/**
 * FleetBus Passenger Telemetry, Live Radar & Disruption Handling Module
 * Implements PAX-018 (Live Tracking), PAX-019 (ETA HUD), PAX-020 (Notifications), PAX-024 (Swap Notice), PAX-025 (Delay Alert).
 */

import { calculateHaversineDistance, calculateETA } from '../core/cryptoEngine.js';
import { REST_STOPS, REST_STOP_AFTER_MS, STILL_SPEED_KMH } from '../../../core/restStops.js';

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

    let hudStatusText = `Xe đang di chuyển (Cách ${Math.round(distanceMeters / 1000)} km, ~${etaMinutes} phút)`;
    if (busPos.is_at_rest_stop || busPos.status === 'REST_STOP') {
      hudStatusText = `Xe đang dừng nghỉ tại ${busPos.rest_stop_name || 'Trạm dừng nghỉ'} (Dự kiến nghỉ ${busPos.estimated_rest_minutes || 15} phút)`;
    } else if (isAtStation) {
      hudStatusText = 'Xe đã cập bến! Mời quý khách chuẩn bị lên xe';
    } else if (isArrivingSoon) {
      hudStatusText = `Xe sắp đến trong ${etaMinutes} phút. Vui lòng có mặt tại điểm đón!`;
    }

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
