import { describe, it } from 'node:test';
import assert from 'node:assert';
import { DriverCockpitService } from '../../source/server/services/driver/modules/driverService.js';
import {
  generateDynamicTicketQR,
  generateGroupBoardingQR,
  generateTicketPin
} from '../../source/server/services/passenger/core/cryptoEngine.js';

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
    const qrData = generateDynamicTicketQR(ticketA01, driverService.secretKey, t0);

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

  it('TC-DRV-08: Should handle COD change-due settlement via REST_STOP_DEBT_RECEIPT and WALLET_CREDIT (DRI-012, REV-04)', () => {
    const service = new DriverCockpitService();
    const tripId = 'trp_hn_th_01';
    service.startTrip(tripId);

    // Add a COD passenger to manifest
    const trip = service.activeTrips.get(tripId);
    trip.manifest.push({
      ticket_id: 'tkt_cod_change_01',
      pnr: 'BG-COD-01',
      seat_code: 'A03',
      passenger_name: 'Phạm Minh Đức',
      phone_masked: '098***777',
      cod_amount_vnd: 220000,
      payment_method: 'COD',
      boarding_status: 'ISSUED'
    });

    // Customer gives 500,000 VND, change due 280,000 VND. Driver lacks change -> Issue debt receipt
    const codDebtRes = service.collectCod(tripId, 'tkt_cod_change_01', {
      amount_collected_vnd: 500000,
      fare_amount_vnd: 220000,
      change_settlement_method: 'REST_STOP_DEBT_RECEIPT'
    });

    assert.strictEqual(codDebtRes.success, true);
    assert.strictEqual(codDebtRes.data.boarding_status, 'BOARDED');
    assert.strictEqual(codDebtRes.data.payment_status, 'SUCCESS');
    assert.strictEqual(codDebtRes.data.change_settlement.method, 'REST_STOP_DEBT_RECEIPT');
    assert.strictEqual(codDebtRes.data.change_settlement.change_due_vnd, 280000);
    assert.ok(codDebtRes.data.change_settlement.debt_receipt_code.startsWith('DR-'));
  });

  it('TC-DRV-09: Should onboard hail passenger on vacant seat and record instant cash fare (DRI-006, DRI-007, REV-05)', () => {
    const service = new DriverCockpitService();
    const tripId = 'trp_hn_th_01';
    service.startTrip(tripId);

    // Onboard passenger on vacant seat B05
    const hailRes = service.onboardHailPassenger(tripId, {
      passenger_name: 'Nguyễn Văn Vẫy',
      phone: '0977889900',
      seat_code: 'B05',
      amount_collected_vnd: 250000,
      payment_method: 'CASH',
      change_settlement_method: 'CASH_RETURNED'
    });

    assert.strictEqual(hailRes.success, true);
    assert.strictEqual(hailRes.data.boarding_status, 'BOARDED');
    assert.strictEqual(hailRes.data.seat_code, 'B05');
    assert.strictEqual(hailRes.data.is_hail_passenger, true);
    // The fare is set by the server (trip base fare), not by the driver
    assert.strictEqual(hailRes.data.change_settlement.fare_amount_vnd, 220000);
    assert.strictEqual(hailRes.data.change_settlement.change_due_vnd, 30000);

    // Attempting to onboard another passenger on same seat B05 -> Rejected
    const duplicateSeat = service.onboardHailPassenger(tripId, {
      passenger_name: 'Người Thứ Hai',
      phone: '0911223344',
      seat_code: 'B05'
    });
    assert.strictEqual(duplicateSeat.success, false);
    assert.strictEqual(duplicateSeat.code, 'SEAT_OCCUPIED');
  });

  it('TC-DRV-10: Should support group QR and offline PIN boarding modes in driver cockpit (DRI-009, REV-01, REV-03)', () => {
    const service = new DriverCockpitService();
    const tripId = 'trp_hn_th_01';
    service.startTrip(tripId);
    const trip = service.activeTrips.get(tripId);

    // 1. Group QR Boarding
    trip.manifest.push(
      { ticket_id: 'tkt_g1', pnr: 'BG-GRP-9', seat_code: 'A07', passenger_name: 'G1', boarding_status: 'ISSUED' },
      { ticket_id: 'tkt_g2', pnr: 'BG-GRP-9', seat_code: 'A08', passenger_name: 'G2', boarding_status: 'ISSUED' }
    );
    const groupQR = generateGroupBoardingQR(
      [
        { ticket_id: 'tkt_g1', pnr: 'BG-GRP-9', order_id: 'ord_9' },
        { ticket_id: 'tkt_g2', pnr: 'BG-GRP-9', order_id: 'ord_9' }
      ],
      service.secretKey,
      t0
    );
    const groupBoard = service.boardPassengerByQR(tripId, groupQR.qr_code_value, t0);
    assert.strictEqual(groupBoard.success, true);
    assert.strictEqual(groupBoard.isGroup, true);
    assert.strictEqual(groupBoard.data.boarded_passengers.length, 2);

    // 2. Offline PIN Boarding
    trip.manifest.push({
      ticket_id: 'tkt_pin_test',
      pnr: 'BG-PIN-1',
      seat_code: 'B09',
      passenger_name: 'Khách Hết Pin ĐT',
      boarding_status: 'ISSUED'
    });
    const pin = generateTicketPin('tkt_pin_test', service.secretKey);
    const pinBoard = service.boardPassengerByQR(tripId, `PIN:tkt_pin_test:${pin}`, t0);
    assert.strictEqual(pinBoard.success, true);
    assert.strictEqual(pinBoard.data.boarding_status, 'BOARDED');
    assert.strictEqual(pinBoard.data.seat_code, 'B09');
  });
});
