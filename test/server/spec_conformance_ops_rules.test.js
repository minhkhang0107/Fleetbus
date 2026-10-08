/**
 * Spec conformance: no-show rules, offline telemetry replay and manager figures
 * (Phase A review, FND-A43, FND-A44, FND-A49). Works on the bound services, no HTTP needed.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createFleetBusServer } from '../../source/server/apiServer.js';

const MINUTE = 60 * 1000;

describe('Spec conformance: no-show, replay and manager figures', () => {
  it('TC-SPEC-A43: a no-show needs the 10-minute grace period, a waiting passenger and a known ticket (DRI-011)', () => {
    const { services } = createFleetBusServer();
    const driver = services.driverService;
    const trip = 'trp_991823';
    const departure = Date.parse(driver.activeTrips.get(trip).planned_departure_time);
    driver.activeTrips.get(trip).status = 'IN_TRANSIT';

    const early = driver.markNoShow(trip, 'tkt_88219_B01', 'chua den', { mockNow: departure + 5 * MINUTE });
    assert.strictEqual(early.success, false);
    assert.strictEqual(early.code, 'NO_SHOW_TOO_EARLY');

    const requested = driver.markNoShow(trip, 'tkt_88219_A01', 'khach goi huy', { mockNow: departure - 30 * MINUTE, passengerRequestedCancel: true });
    assert.strictEqual(requested.success, true, 'the passenger asked to cancel by phone, no grace period needed');

    const onTime = driver.markNoShow(trip, 'tkt_88219_B01', 'qua gio', { mockNow: departure + 10 * MINUTE });
    assert.strictEqual(onTime.success, true);
    assert.strictEqual(onTime.data.boarding_status, 'NO_SHOW');

    const again = driver.markNoShow(trip, 'tkt_88219_B01', 'lan hai', { mockNow: departure + 20 * MINUTE });
    assert.strictEqual(again.success, false);
    assert.strictEqual(again.code, 'INVALID_PASSENGER_STATE');

    driver.collectCod(trip, 'tkt_88219_A02', 220000);
    const boarded = driver.markNoShow(trip, 'tkt_88219_A02', 'sai', { mockNow: departure + 30 * MINUTE });
    assert.strictEqual(boarded.success, false);
    assert.strictEqual(boarded.code, 'INVALID_PASSENGER_STATE');

    const unknown = driver.markNoShow(trip, 'tkt_ghost', 'khong co', { mockNow: departure + 30 * MINUTE });
    assert.strictEqual(unknown.code, 'TICKET_NOT_FOUND');
  });

  it('TC-NOSHOW-01: a passenger waiting at a later stop cannot be marked absent before the bus reaches that stop (DRI-011, design review 2)', () => {
    const { services } = createFleetBusServer();
    const driver = services.driverService;
    const trip = 'trp_991823';
    const t = driver.activeTrips.get(trip);
    const departure = Date.parse(t.planned_departure_time);
    t.status = 'IN_TRANSIT';

    // tkt_88219_A02 boards at Pháp Vân (stp_hn_pv), the second stop
    const notThere = driver.markNoShow(trip, 'tkt_88219_A02', 'chua thay', { mockNow: departure + 120 * MINUTE });
    assert.strictEqual(notThere.success, false);
    assert.strictEqual(notThere.code, 'BUS_NOT_AT_STOP', 'two hours after departure the bus may still be on the way');

    driver.arriveAtStop(trip, 'stp_hn_pv', departure + 30 * MINUTE);
    const tooSoon = driver.markNoShow(trip, 'tkt_88219_A02', 'chua thay', { mockNow: departure + 35 * MINUTE });
    assert.strictEqual(tooSoon.code, 'NO_SHOW_TOO_EARLY', 'the passenger gets 10 minutes from the arrival of the bus at their stop');

    const ok = driver.markNoShow(trip, 'tkt_88219_A02', 'qua 10 phut', { mockNow: departure + 40 * MINUTE });
    assert.strictEqual(ok.success, true, JSON.stringify(ok));
  });

  it('TC-NOSHOW-02: nobody is marked absent before the trip has left (DRI-011)', () => {
    const { services } = createFleetBusServer();
    const driver = services.driverService;
    const trip = 'trp_991823';
    const departure = Date.parse(driver.activeTrips.get(trip).planned_departure_time);
    const res = driver.markNoShow(trip, 'tkt_88219_B01', 'chua den', { mockNow: departure + 30 * MINUTE });
    assert.strictEqual(res.code, 'BUS_NOT_AT_STOP');
  });

  it('TC-END-01: a trip ends at its last stop; ending earlier needs a reason (DRI-017, design review 2)', () => {
    const { services } = createFleetBusServer();
    const driver = services.driverService;
    const trip = 'trp_991823';
    const t = driver.activeTrips.get(trip);
    t.status = 'IN_TRANSIT';

    const early = driver.endTrip(trip);
    assert.strictEqual(early.success, false);
    assert.strictEqual(early.code, 'TRIP_NOT_AT_FINAL_STOP', 'a slip of the finger mid-route must not close the trip');

    const withReason = driver.endTrip(trip, { earlyEndReason: 'Xe hỏng, khách đã chuyển sang xe 29B-888.22' });
    assert.strictEqual(withReason.success, true, JSON.stringify(withReason));
    assert.strictEqual(withReason.data.early_end_reason, 'Xe hỏng, khách đã chuyển sang xe 29B-888.22');
  });

  it('TC-END-02: arriving at the last stop lets the trip end without a reason (DRI-017)', () => {
    const { services } = createFleetBusServer();
    const driver = services.driverService;
    const trip = 'trp_991823';
    const t = driver.activeTrips.get(trip);
    t.status = 'IN_TRANSIT';
    driver.arriveAtStop(trip, t.stops[t.stops.length - 1].stop_id);
    const res = driver.endTrip(trip);
    assert.strictEqual(res.success, true, JSON.stringify(res));
    assert.strictEqual(res.data.early_end_reason, null);
  });

  it('TC-SPEC-A44: replaying the offline buffer is ordered, duplicate-safe and keeps the newest position (DRI-015)', () => {
    const { services } = createFleetBusServer();
    const driver = services.driverService;
    const trip = 'trp_hn_th_01';
    assert.strictEqual(driver.startTrip(trip).success, true);

    const t1 = Date.parse('2026-08-28T07:10:00Z');
    const t2 = t1 + MINUTE;
    const queued = driver.recordTelemetry(trip, { lat: 20.9, lng: 105.8, speed_kmh: 50, is_offline: true, mockNow: t1 });
    assert.strictEqual(queued.buffered_offline_count, 1);

    const newer = { trip_id: trip, lat: 20.5, lng: 105.9, speed_kmh: 60, timestamp: new Date(t2).toISOString() };
    const older = { trip_id: trip, lat: 20.9, lng: 105.8, speed_kmh: 50, timestamp: new Date(t1).toISOString() };
    const result = driver.replayOfflineBuffer([newer, older, { ...newer }, { trip_id: trip, lat: 'x', lng: 105.9 }]);

    assert.strictEqual(result.replayed_count, 2);
    assert.strictEqual(result.position_updates, 2);
    assert.strictEqual(result.duplicates_skipped, 1);
    assert.strictEqual(result.invalid_skipped, 1);
    assert.strictEqual(driver.activeTrips.get(trip).current_lat, 20.5, 'the newest ping wins regardless of the order in the buffer');
    assert.strictEqual(driver.offlineQueue.length, 0, 'replayed pings leave the offline queue');

    const stale = driver.replayOfflineBuffer([{ trip_id: trip, lat: 19.0, lng: 105.0, timestamp: new Date(t1 - MINUTE).toISOString() }]);
    assert.strictEqual(stale.replayed_count, 1);
    assert.strictEqual(stale.position_updates, 0);
    assert.strictEqual(driver.activeTrips.get(trip).current_lat, 20.5, 'an older ping never overwrites a newer position');
  });

  it('TC-SPEC-A49: dashboard figures are computed from the data (MGR-002)', () => {
    const { services } = createFleetBusServer();
    const manager = services.managerService;

    const onTimeShare = () => parseFloat(((manager.trips.filter((t) => (t.delay_minutes || 0) <= 15).length / manager.trips.length) * 100).toFixed(1));
    const before = manager.getDashboardKPIs().data.kpi_metrics;
    assert.strictEqual(before.on_time_departure_rate_pct, onTimeShare());

    manager.trips[0].delay_minutes = 45;
    const delayed = manager.getDashboardKPIs().data.kpi_metrics;
    assert.strictEqual(delayed.on_time_departure_rate_pct, onTimeShare());
    assert.ok(delayed.on_time_departure_rate_pct < before.on_time_departure_rate_pct, 'a delayed trip lowers the on-time rate')

    const moving = manager.vehicles.filter((v) => v.status === 'IN_TRANSIT' && v.speed_kmh > 0);
    const expectedSpeed = moving.length ? parseFloat((moving.reduce((s, v) => s + v.speed_kmh, 0) / moving.length).toFixed(1)) : 0;
    assert.strictEqual(delayed.fleet_average_speed_kmh, expectedSpeed);

    const corridor = manager.getDashboardKPIs().data.corridors.find((c) => c.corridor.includes('Thanh Hóa'));
    const thTrips = manager.trips.filter((t) => t.route_id === 'rt_hn_th');
    assert.strictEqual(corridor.load_factor_pct, parseFloat(((thTrips.reduce((s, t) => s + t.booked_seats, 0) / thTrips.reduce((s, t) => s + t.total_seats, 0)) * 100).toFixed(1)));
  });

  it('TC-SPEC-A49b: revenue shows refunds, channel shares and respects the report period (MGR-002, MGR-027)', () => {
    const { services } = createFleetBusServer();
    const manager = services.managerService;

    const gross = manager.getDashboardKPIs().data.kpi_metrics;
    assert.strictEqual(gross.refunded_vnd, 0);
    assert.strictEqual(gross.net_revenue_vnd, gross.gross_revenue_vnd);

    const request = manager.createRefundRequest({ pnr: 'BG-88219', amount_vnd: 440000, reason: 'Khach huy' });
    manager.processRefundApproval(request.refund_id, true);
    const after = manager.getDashboardKPIs().data.kpi_metrics;
    assert.strictEqual(after.gross_revenue_vnd, gross.gross_revenue_vnd, 'gross fares do not change');
    assert.strictEqual(after.refunded_vnd, 440000);
    assert.strictEqual(after.net_revenue_vnd, gross.gross_revenue_vnd - 440000);

    const all = manager.getExecutiveReports({}).data;
    assert.strictEqual(all.financial_summary.net_revenue_vnd, after.net_revenue_vnd);
    const shares = all.financial_summary.pos_share_pct + all.financial_summary.app_share_pct + all.financial_summary.hail_share_pct;
    assert.ok(Math.abs(shares - 100) < 0.2, `channel shares must add up to 100, got ${shares}`);

    const outside = manager.getExecutiveReports({ startDate: '2030-01-01', endDate: '2030-01-31' }).data;
    assert.strictEqual(outside.financial_summary.total_revenue_vnd, 0);
    assert.strictEqual(outside.financial_summary.total_tickets_sold, 0);
    const inside = manager.getExecutiveReports({ startDate: '2026-08-01', endDate: '2026-08-31' }).data;
    assert.strictEqual(inside.financial_summary.total_revenue_vnd, gross.gross_revenue_vnd);
    assert.ok(!('zero_incident_days' in all.punctuality_summary), 'a figure with no data behind it is not reported');
  });

  it('TC-SPEC-A60: every seat in a driver manifest at start shows as sold on the passenger seat map', () => {
    const { services } = createFleetBusServer();
    for (const [tripId, trip] of services.driverService.activeTrips) {
      const map = services.seatMapService.getSeatMap(tripId);
      if (!map.success) continue;
      for (const passenger of trip.manifest) {
        const seat = map.data.seats.find(s => s.seat_code === passenger.seat_code);
        assert.ok(seat && seat.state !== 'AVAILABLE', `${tripId} ${passenger.seat_code} is in the driver manifest but free for sale`);
      }
    }
  });
});
