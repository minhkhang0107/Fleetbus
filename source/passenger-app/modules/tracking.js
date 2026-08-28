/**
 * FleetBus Passenger Telemetry, Live Radar & Disruption Handling Module
 * Implements PAX-018 (Live Tracking), PAX-019 (ETA HUD), PAX-020 (Notifications), PAX-021 (Refund), PAX-024 (Swap Notice), PAX-025 (Delay Alert).
 */

import { calculateHaversineDistance, calculateETA } from '../core/cryptoEngine.js';
import { calculateRefundAmount } from '../core/formatters.js';

export class PassengerTrackingService {
  constructor() {
    this.busPositions = new Map(); // tripId -> Telemetry
    this.notifications = new Map(); // userId/phone -> [Notification]
    this.cancellations = new Map(); // pnr -> CancellationRecord
    this.disruptions = new Map(); // tripId -> DisruptionRecord
  }

  /**
   * PAX-018: Ingest Driver GPS telemetry ping & get Live Bus Radar Snapshot
   */
  updateBusPosition(tripId, { lat, lng, speed_kmh, bearing_deg, plate_number, mockNow = Date.now() }) {
    const record = {
      trip_id: tripId,
      plate_number: plate_number || '29B-882.19',
      lat: parseFloat(lat),
      lng: parseFloat(lng),
      speed_kmh: parseFloat(speed_kmh) || 0,
      bearing_deg: parseInt(bearing_deg, 10) || 0,
      timestamp: new Date(mockNow).toISOString(),
      status: speed_kmh > 5 ? 'IN_TRANSIT' : 'STOPPED'
    };

    this.busPositions.set(tripId, record);
    return { success: true, data: record };
  }

  /**
   * PAX-019: Get Live Radar HUD & ETA to passenger's pickup location
   */
  getLiveTrackingHUD(tripId, pickupLat = 20.9806, pickupLng = 105.8413) {
    const busPos = this.busPositions.get(tripId) || {
      trip_id: tripId,
      plate_number: '29B-882.19',
      lat: 20.9500,
      lng: 105.8400,
      speed_kmh: 52.4,
      bearing_deg: 180,
      timestamp: new Date().toISOString(),
      status: 'IN_TRANSIT'
    };

    const distanceMeters = calculateHaversineDistance(busPos.lat, busPos.lng, pickupLat, pickupLng);
    const etaMinutes = calculateETA(distanceMeters, busPos.speed_kmh || 45);
    const isArrivingSoon = distanceMeters <= 1000; // < 1 km
    const isAtStation = distanceMeters <= 100; // < 100 m

    return {
      success: true,
      data: {
        trip_id: tripId,
        bus_position: busPos,
        pickup_location: { lat: pickupLat, lng: pickupLng },
        distance_meters: distanceMeters,
        eta_minutes: etaMinutes,
        is_arriving_soon: isArrivingSoon,
        is_at_station: isAtStation,
        hud_status_text: isAtStation
          ? 'Xe đã cập bến! Mời quý khách chuẩn bị lên xe'
          : isArrivingSoon
          ? `Xe sắp đến trong ${etaMinutes} phút. Vui lòng có mặt tại điểm đón!`
          : `Xe đang di chuyển (Cách ${Math.round(distanceMeters / 1000)} km, ~${etaMinutes} phút)`
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
   * PAX-021: Cancel Ticket & Process Refund according to policy
   */
  requestTicketCancellation(pnr, totalPriceVnd, departureTime, reason = 'Kế hoạch cá nhân thay đổi') {
    const refundCalc = calculateRefundAmount(totalPriceVnd, departureTime);

    const cancelRecord = {
      pnr,
      total_price_vnd: totalPriceVnd,
      refund_percentage: refundCalc.percentage,
      refund_amount_vnd: refundCalc.refundAmount,
      fee_amount_vnd: refundCalc.feeAmount,
      tier: refundCalc.tier,
      policy_message: refundCalc.message,
      reason,
      status: 'CANCELLED_AND_REFUNDED',
      cancelled_at: new Date().toISOString()
    };

    this.cancellations.set(pnr, cancelRecord);

    return {
      success: true,
      data: cancelRecord
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
