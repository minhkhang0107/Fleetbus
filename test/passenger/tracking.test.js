import { describe, it } from 'node:test';
import assert from 'node:assert';
import { PassengerTrackingService } from '../../source/server/services/passenger/modules/tracking.js';

describe('Phase 7: Live GPS Telemetry, Radar & Disruption Test Suite', () => {
  const trackingService = new PassengerTrackingService();

  it('TC-TRACK-01: Should update bus GPS telemetry and calculate live radar ETA in PAX-018/PAX-019', () => {
    // Bus is at 20.9700, 105.8410 (near Giap Bat 20.9806, 105.8413)
    trackingService.updateBusPosition('trp_hn_th_01', {
      lat: 20.9700,
      lng: 105.8410,
      speed_kmh: 40,
      bearing_deg: 0,
      plate_number: '29B-882.19'
    });

    const hudRes = trackingService.getLiveTrackingHUD('trp_hn_th_01', 20.9806, 105.8413);
    assert.strictEqual(hudRes.success, true);
    assert.ok(hudRes.data.distance_meters > 500 && hudRes.data.distance_meters < 2000);
    assert.ok(hudRes.data.eta_minutes >= 1);
    assert.strictEqual(hudRes.data.bus_position.plate_number, '29B-882.19');
  });

  it('TC-TRACK-02: Should dispatch push notifications and track unread count in PAX-020', () => {
    trackingService.sendNotification('0912345678', {
      title: 'Nhắc nhở lên xe',
      body: 'Xe 29B-882.19 sẽ đón quý khách tại Bến xe Giáp Bát lúc 07:00',
      type: 'BOARDING_REMINDER'
    });

    const notifRes = trackingService.getNotifications('0912345678');
    assert.strictEqual(notifRes.success, true);
    assert.strictEqual(notifRes.unread_count, 1);
    assert.strictEqual(notifRes.data[0].type, 'BOARDING_REMINDER');
  });

  it('TC-TRACK-03: Should cancel ticket and calculate refund amount based on policy in PAX-021', () => {
    const departureFuture = new Date(Date.now() + 36 * 3600 * 1000); // 36 hours ahead
    const cancelRes = trackingService.requestTicketCancellation('BG-882199', 410000, departureFuture);

    assert.strictEqual(cancelRes.success, true);
    assert.strictEqual(cancelRes.data.refund_percentage, 100);
    assert.strictEqual(cancelRes.data.refund_amount_vnd, 410000);
    assert.strictEqual(cancelRes.data.status, 'CANCELLED_AND_REFUNDED');
  });

  it('TC-TRACK-04: Should broadcast and inspect vehicle replacement / delay disruption in PAX-024/PAX-025', () => {
    trackingService.registerDisruption('trp_hn_th_01', {
      type: 'VEHICLE_REPLACEMENT',
      title: 'Thông báo điều xe thay thế',
      message: 'Xe 29B-882.19 được thay thế bởi xe 29B-999.88 (Cabin VIP tương đương)',
      new_plate_number: '29B-999.88'
    });

    const checkDisruption = trackingService.getTripDisruption('trp_hn_th_01');
    assert.strictEqual(checkDisruption.has_disruption, true);
    assert.strictEqual(checkDisruption.data.new_plate_number, '29B-999.88');
    assert.strictEqual(checkDisruption.data.type, 'VEHICLE_REPLACEMENT');
  });

  it('TC-TRACK-05: Should detect stale GPS telemetry and display rest-stop status (PAX-018, PAX-019, REV-07)', () => {
    const t0 = 1756300000000;
    // 1. Stale GPS telemetry (>60s lag)
    trackingService.updateBusPosition('trp_stale_01', {
      lat: 20.4500,
      lng: 105.9000,
      speed_kmh: 60,
      bearing_deg: 180,
      plate_number: '29B-888.99',
      mockNow: t0
    });

    const staleHud = trackingService.getLiveTrackingHUD('trp_stale_01', 20.9806, 105.8413, t0 + 120000); // 120s later
    assert.strictEqual(staleHud.success, true);
    assert.strictEqual(staleHud.data.is_stale, true);
    assert.strictEqual(staleHud.data.telemetry_age_seconds, 120);
    assert.ok(staleHud.data.stale_warning.includes('Tín hiệu GPS'));

    // 2. Rest-stop status
    trackingService.updateBusPosition('trp_rest_01', {
      lat: 20.2500,
      lng: 105.9700,
      speed_kmh: 0,
      bearing_deg: 0,
      plate_number: '29B-123.45',
      is_at_rest_stop: true,
      rest_stop_name: 'Trạm dừng chân Cao tốc Ninh Bình',
      estimated_rest_minutes: 20,
      mockNow: t0
    });

    const restHud = trackingService.getLiveTrackingHUD('trp_rest_01', 19.8067, 105.7852, t0 + 5000);
    assert.strictEqual(restHud.success, true);
    assert.strictEqual(restHud.data.is_at_rest_stop, true);
    assert.strictEqual(restHud.data.rest_stop_name, 'Trạm dừng chân Cao tốc Ninh Bình');
    assert.strictEqual(restHud.data.estimated_rest_minutes, 20);
    assert.ok(restHud.data.hud_status_text.includes('Xe đang dừng nghỉ tại Trạm dừng chân Cao tốc Ninh Bình'));
  });
});
