import { describe, it } from 'node:test';
import assert from 'node:assert';
import { DriverCockpitService } from '../../source/driver-app/modules/driverService.js';
import { generateDynamicTicketQR } from '../../source/passenger-app/core/cryptoEngine.js';

describe('Phase Driver: Driver Tactical Cockpit Test Suite (DRI-001 to DRI-019)', () => {
  const driverService = new DriverCockpitService();
  const t0 = 1724800000000;

  it('TC-DRV-01: Should authenticate valid driver and reject expired license (BR-DRI-001 / DRI-001)', () => {
    // Valid driver (TX8821)
    const validLogin = driverService.authenticateDriver('TX8821', '123456');
    assert.strictEqual(validLogin.success, true);
    assert.strictEqual(validLogin.data.driver.full_name, 'Trần Văn Bình');
    assert.ok(validLogin.data.token.startsWith('drv_jwt_'));
    assert.strictEqual(validLogin.data.driver.assigned_vehicle_plate, '29B-123.45');

    // Expired license driver (TX9902) -> Rejected with LICENSE_EXPIRED
    const expiredLogin = driverService.authenticateDriver('TX9902', '654321');
    assert.strictEqual(expiredLogin.success, false);
    assert.strictEqual(expiredLogin.code, 'LICENSE_EXPIRED');
  });

  it('TC-DRV-02: Should retrieve today assigned shift trips (DRI-002)', () => {
    const todayRes = driverService.getTodayTrips('drv_8821a');
    assert.strictEqual(todayRes.success, true);
    assert.ok(todayRes.data.trips.length > 0);
    assert.strictEqual(todayRes.data.trips[0].vehicle_plate, '29B-123.45');
    assert.strictEqual(todayRes.data.trips[0].booked_passengers_count, 28);
  });

  it('TC-DRV-03: Should process pre-start readiness inspection checklist (DRI-004)', () => {
    const tripId = 'trp_991823';

    // Incomplete checklist
    const partialRes = driverService.submitReadinessChecklist(tripId, {
      tires_checked: true,
      brakes_fluid_checked: true,
      ac_cleanliness_checked: false
    });
    assert.strictEqual(partialRes.is_ready_to_start, false);

    // Complete checklist
    const completeRes = driverService.submitReadinessChecklist(tripId, {
      tires_checked: true,
      brakes_fluid_checked: true,
      ac_cleanliness_checked: true,
      first_aid_extinguisher_checked: true,
      fuel_level_sufficient: true,
      gps_telemetry_beacon_active: true
    });
    assert.strictEqual(completeRes.is_ready_to_start, true);
    assert.strictEqual(completeRes.data.status, 'READY');
  });

  it('TC-DRV-04: Should start trip and stream telemetry with offline queue buffer (DRI-005, DRI-006, DRI-015)', () => {
    const tripId = 'trp_991823';

    const startRes = driverService.startTrip(tripId);
    assert.strictEqual(startRes.success, true);
    assert.strictEqual(startRes.data.status, 'IN_TRANSIT');

    // Online Telemetry Ping
    const ping1 = driverService.recordTelemetry(tripId, {
      lat: 20.9806,
      lng: 105.8413,
      speed_kmh: 62.4,
      bearing_deg: 180,
      is_offline: false
    });
    assert.strictEqual(ping1.success, true);
    assert.strictEqual(ping1.buffered_offline_count, 0);

    // Offline Telemetry Ping (tunnels / remote area)
    const pingOffline = driverService.recordTelemetry(tripId, {
      lat: 20.9700,
      lng: 105.8400,
      speed_kmh: 60.0,
      bearing_deg: 180,
      is_offline: true
    });
    assert.strictEqual(pingOffline.buffered_offline_count, 1);

    // Flush Offline Queue (DRI-015)
    const flushRes = driverService.flushOfflineQueue();
    assert.strictEqual(flushRes.replayed_count, 1);
  });

  it('TC-DRV-05: Should scan dynamic QR, board passenger, and collect COD cash fare (DRI-009, DRI-010, DRI-012)', () => {
    const tripId = 'trp_991823';

    // Generate dynamic QR for passenger Tran Van Hung (A01)
    const ticketA01 = {
      pnr: 'BG-88219',
      ticket_id: 'tkt_88219_A01',
      seat_code: 'A01',
      trip_id: tripId
    };
    const qrData = generateDynamicTicketQR(ticketA01, 'busgo_ticket_master_secret', t0);

    // Driver scans QR
    const boardRes = driverService.boardPassengerByQR(tripId, qrData.qr_code_value, t0);
    assert.strictEqual(boardRes.success, true);
    assert.strictEqual(boardRes.data.passenger_name, 'Trần Văn Hùng');
    assert.strictEqual(boardRes.data.boarding_status, 'BOARDED');

    // Collect COD for passenger Nguyen Van Nam (A02 - 220,000 VND)
    const codRes = driverService.collectCod(tripId, 'tkt_88219_A02', 220000);
    assert.strictEqual(codRes.success, true);
    assert.strictEqual(codRes.data.cod_collected, true);
  });

  it('TC-DRV-06: Should mark no-show and report incident delay (DRI-011, DRI-019)', () => {
    const tripId = 'trp_991823';

    // Mark No-Show for B01
    const noShowRes = driverService.markNoShow(tripId, 'tkt_88219_B01', 'Quá 15p không liên lạc được');
    assert.strictEqual(noShowRes.success, true);
    assert.strictEqual(noShowRes.data.boarding_status, 'NO_SHOW');

    // Report Traffic Jam Incident
    const incidentRes = driverService.reportIncident(tripId, {
      type: 'TRAFFIC_JAM',
      description: 'Ùn tắc nghiêm trọng tại trạm thu phí Cao Bồ',
      estimated_delay_minutes: 25,
      lat: 20.3500,
      lng: 105.9000
    });
    assert.strictEqual(incidentRes.success, true);
    assert.strictEqual(incidentRes.data.estimated_delay_minutes, 25);
  });

  it('TC-DRV-07: Should complete trip at final terminal (DRI-017)', () => {
    const tripId = 'trp_991823';
    const endRes = driverService.endTrip(tripId);

    assert.strictEqual(endRes.success, true);
    assert.strictEqual(endRes.data.status, 'COMPLETED');
    assert.strictEqual(endRes.data.total_cod_collected_vnd, 220000);
  });
});
