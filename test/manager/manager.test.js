import { describe, it } from 'node:test';
import assert from 'node:assert';
import { ManagerOperationsService } from '../../source/server/services/manager/modules/managerService.js';

describe('Phase Manager: Operations Control Center Test Suite (MGR-001 to MGR-030)', () => {
  const managerService = new ManagerOperationsService();

  it('TC-MGR-01: Should authenticate manager with role and permissions (MGR-001 / MGR-029)', () => {
    const authRes = managerService.authenticateManager('admin@busgo.vn', 'admin123');
    assert.strictEqual(authRes.success, true);
    assert.strictEqual(authRes.data.user.full_name, 'Nguyễn Tiến Dũng');
    assert.strictEqual(authRes.data.user.role, 'FLEET_DIRECTOR');
    assert.ok(authRes.data.token.startsWith('mgr_session_'));

    // Invalid login
    const invalidRes = managerService.authenticateManager('admin@busgo.vn', 'wrong_pass');
    assert.strictEqual(invalidRes.success, false);
    assert.strictEqual(invalidRes.code, 'INVALID_CREDENTIALS');
  });

  it('TC-MGR-02: Should compute executive operations dashboard KPIs in real-time (MGR-002)', () => {
    const kpiRes = managerService.getDashboardKPIs();
    assert.strictEqual(kpiRes.success, true);
    assert.strictEqual(kpiRes.data.kpi_metrics.active_vehicles_count, 2);
    assert.strictEqual(kpiRes.data.kpi_metrics.total_fleet_count, 3);
    assert.ok(kpiRes.data.kpi_metrics.overall_load_factor_pct > 80);
    assert.ok(kpiRes.data.kpi_metrics.gross_revenue_vnd > 0);
    assert.ok(kpiRes.data.corridors.length >= 2);
  });

  it('TC-MGR-03: Should track live fleet telemetry radar map with GPS signal health (MGR-003, MGR-004)', () => {
    const radarRes = managerService.getLiveFleetRadar();
    assert.strictEqual(radarRes.success, true);
    assert.strictEqual(radarRes.data.total_tracked_vehicles, 3);

    const v1 = radarRes.data.vehicles.find(v => v.plate_number === '29B-123.45');
    assert.ok(v1);
    assert.strictEqual(v1.gps_health, 'LIVE');
    assert.strictEqual(v1.speed_kmh, 62);
    assert.strictEqual(v1.driver_name, 'Trần Văn Bình');
  });

  it('TC-MGR-04: Should fetch dispatch board and detect scheduled vs active trips (MGR-014)', () => {
    const dispatchRes = managerService.getDispatchBoard('2026-08-28');
    assert.strictEqual(dispatchRes.success, true);
    assert.ok(dispatchRes.data.trips.length >= 2);

    const trip1 = dispatchRes.data.trips.find(t => t.trip_id === 'trp_991823');
    assert.strictEqual(trip1.status, 'IN_TRANSIT');
    assert.strictEqual(trip1.vehicle_plate, '29B-123.45');
  });

  it('TC-MGR-05: Should execute POS counter & hotline telephone ticket booking (MGR-019, MGR-020)', () => {
    const posRes = managerService.createPosBooking({
      tripId: 'trp_991823',
      passengerName: 'Lê Minh Tâm',
      phone: '0988776655',
      seatCodes: ['A03']
    });

    assert.strictEqual(posRes.success, true);
    assert.ok(posRes.data.pnr.startsWith('BG-POS'));
    assert.strictEqual(posRes.data.passenger_name, 'Lê Minh Tâm');
    assert.strictEqual(posRes.data.total_fare_vnd, 220000);
  });

  it('TC-MGR-06: Should execute emergency vehicle replacement wizard with automatic seat reallocation (MGR-023)', () => {
    // Replace vehicle for trip trp_991823 from 29B-123.45 to standby vehicle 29B-888.22 (veh_03)
    const replaceRes = managerService.replaceTripVehicle('trp_991823', 'veh_03', 'Hỏng trục láp cầu sau');

    assert.strictEqual(replaceRes.success, true);
    assert.strictEqual(replaceRes.data.old_vehicle_plate, '29B-123.45');
    assert.strictEqual(replaceRes.data.new_vehicle_plate, '29B-888.22');
    assert.ok(replaceRes.data.auto_reallocated_passengers > 0);
  });

  it('TC-MGR-07: Should broadcast trip delay and process passenger refund reconciliation (MGR-021, MGR-022, MGR-024)', () => {
    // Broadcast delay
    const delayRes = managerService.broadcastTripDelay('trp_991824', 45, 'Ùn tắc nghiêm trọng tại trạm thu phí Đình Vũ');
    assert.strictEqual(delayRes.success, true);
    assert.strictEqual(delayRes.data.delay_minutes, 45);

    // Process refund
    const refundRes = managerService.processRefund('BG-88219', 440000, 'Hủy vé trước 24h hoàn tiền 100%');
    assert.strictEqual(refundRes.success, true);
    assert.strictEqual(refundRes.data.refund_status, 'REFUNDED');
    assert.strictEqual(refundRes.data.refund_amount_vnd, 440000);
  });

  it('TC-MGR-08: Should manage fleet roster, crew drivers, and routes (MGR-005 to MGR-013)', () => {
    // Add vehicle
    const addVehRes = managerService.addVehicle({ plate_number: '29B-999.88', model: 'Limousine 34 VIP' });
    assert.strictEqual(addVehRes.success, true);
    assert.strictEqual(addVehRes.data.plate_number, '29B-999.88');
    assert.ok(managerService.getFleetVehicles().data.length >= 4);

    // Add driver
    const addDrvRes = managerService.addDriver({ staff_id: 'TX7701', full_name: 'Vũ Đức Đam', phone: '0977112233' });
    assert.strictEqual(addDrvRes.success, true);
    assert.strictEqual(addDrvRes.data.staff_id, 'TX7701');
    assert.ok(managerService.getCrewDrivers().data.length >= 3);

    // Add route
    const addRouteRes = managerService.addRoute({ name: 'Hà Nội — Nam Định', distance_km: 90, base_fare_vnd: 130000 });
    assert.strictEqual(addRouteRes.success, true);
    assert.strictEqual(addRouteRes.data.name, 'Hà Nội — Nam Định');
    assert.ok(managerService.getRoutes().data.length >= 4);
  });

  it('TC-MGR-09: Should generate executive financial and punctuality reports (MGR-025, MGR-026)', () => {
    const reportRes = managerService.getExecutiveReport();
    assert.strictEqual(reportRes.success, true);
    assert.ok(reportRes.data.financial_summary.total_revenue_vnd > 0);
    assert.strictEqual(reportRes.data.punctuality_summary.on_time_departure_rate, '96.8%');
  });

  it('TC-MGR-10: Should create configurable hotline seat holds and release on expiry (MGR-020, REV-06)', () => {
    const service = new ManagerOperationsService();
    const trip = service.findTrip('trp_991823');
    const initialBooked = trip.booked_seats;
    const t0 = 1724820000000;

    // 1. Create hotline hold until departure offset (T - 30 mins)
    const holdRes = service.createHotlineHold({
      tripId: 'trp_991823',
      passengerName: 'Hoàng Thùy Linh',
      phone: '0988112233',
      seatCodes: ['B02'],
      holdPolicy: 'UNTIL_DEPARTURE_OFFSET',
      departureOffsetMinutes: 30,
      notes: 'Khách đón tại nút giao Vực Vòng',
      mockNow: t0
    });

    assert.strictEqual(holdRes.success, true);
    assert.strictEqual(holdRes.data.hold_status, 'HELD_HOTLINE');
    assert.ok(holdRes.data.hold_until);
    assert.strictEqual(trip.booked_seats, initialBooked + 1);

    // 2. Before expiry: hold remains active
    const activeCheck = service.releaseExpiredHotlineHolds(t0 + 1000);
    assert.strictEqual(activeCheck.released_count, 0);

    // 3. After hold_until expires: automatically released
    const expiryMs = new Date(holdRes.data.hold_until).getTime() + 1000;
    const releaseCheck = service.releaseExpiredHotlineHolds(expiryMs);
    assert.strictEqual(releaseCheck.released_count, 1);
    assert.strictEqual(releaseCheck.data[0].hold_status, 'EXPIRED_RELEASED');
    assert.strictEqual(trip.booked_seats, initialBooked);
  });
});
