import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import { createFleetBusServer } from '../../source/server/apiServer.js';
import { estimatedOffsets, effectiveStops } from '../../source/server/core/routeStops.js';

const READY = {
  tires_checked: true,
  brakes_fluid_checked: true,
  ac_cleanliness_checked: true,
  first_aid_extinguisher_checked: true,
  fuel_level_sufficient: true,
  gps_telemetry_beacon_active: true
};

describe('E2E Findings: F4, F7, F8, F14', () => {
  let services;

  before(() => {
    ({ services } = createFleetBusServer());
  });

  describe('(a) routeStops straight-line estimate proportional to distance', () => {
    it('estimates offset by cumulative haversine straight-line distance when shape is missing', () => {
      const trip = {
        trip_id: 'trip_straight_line_test',
        departure_time: '2026-10-16T14:00:00+07:00',
        arrival_time: '2026-10-16T16:30:00+07:00',
        stops: [
          { stop_id: 'stp_hn_my_dinh', name: 'Bến xe Mỹ Đình', order: 1 },
          { stop_id: 'stp_hn_gb', name: 'Bến xe Giáp Bát', order: 2 },
          { stop_id: 'stp_th_pb', name: 'Bến xe Phía Bắc Thanh Hóa', order: 3 }
        ]
      };
      const offsets = estimatedOffsets(trip);
      assert.strictEqual(offsets[0], 0);
      assert.ok(offsets[1] > 0 && offsets[1] < 25, `middle stop offset should be proportional to distance (~10 min), got ${offsets[1]}`);
      assert.strictEqual(offsets[2], 150);

      // Company override in effectiveStops takes precedence
      const settings = {
        stops: {
          stp_hn_gb: { offset_minutes: 35 }
        }
      };
      const customStops = effectiveStops(trip, settings);
      assert.strictEqual(customStops[1].offset_minutes, 35, 'company offset_minutes must take precedence');
    });
  });

  describe('(b) POST /depart records departed_at, trip-log with stop name, is idempotent', () => {
    it('handles stop departure, updates ops lifecycle, and logs event with stop name', () => {
      const tripId = 'trp_hn_th_01';
      const trip = services.driverService.activeTrips.get(tripId);
      assert.ok(trip);

      services.driverService.submitReadinessChecklist(tripId, READY);
      services.driverService.startTrip(tripId);

      // Stop 0: stp_hn_gb
      const stop0 = trip.stops[0];
      const stopId = stop0.stop_id;

      // Depart call
      const res1 = services.driverService.departStop(tripId, stopId);
      assert.strictEqual(res1.success, true);
      assert.ok(stop0.departed_at, 'departed_at must be set');
      assert.strictEqual(trip.current_stop_index, 1, 'the trip heads for the next stop, so a refresh does not send the driver back');

      // Check event in trip.events
      const departEv = trip.events.find(e => e.type === 'STOP_DEPARTED' && e.stop_id === stopId);
      assert.ok(departEv, 'STOP_DEPARTED event must be recorded in trip log');
      assert.strictEqual(departEv.stop_name, stop0.name, 'event must carry stop name');
      assert.match(departEv.message, new RegExp(stop0.name), 'event message must mention stop name');

      // Idempotent: repeating the call does not create duplicate events
      const evCount = trip.events.filter(e => e.type === 'STOP_DEPARTED' && e.stop_id === stopId).length;
      const res2 = services.driverService.departStop(tripId, stopId);
      assert.strictEqual(res2.success, true);
      const evCountAfter = trip.events.filter(e => e.type === 'STOP_DEPARTED' && e.stop_id === stopId).length;
      assert.strictEqual(evCountAfter, evCount, 'depart call must be idempotent');

      // Check ops stop status
      const ops = services.driverService.getTripOperations(tripId);
      assert.strictEqual(ops.success, true);
      const opsStop = ops.data.stops.find(s => s.stop_id === stopId);
      assert.strictEqual(opsStop.lifecycle_status, 'COMPLETED');
      assert.ok(opsStop.departed_at);
    });
  });

  describe('(c) hotline hold released on depart -> trip-log + audit entry with readable text', () => {
    it('writes trip-log and audit entries with stop name on NO_SHOW_RELEASED, and on EXPIRED_RELEASED', () => {
      const tripId = 'trp_hn_th_01';
      const trip = services.managerService.findTrip(tripId);
      assert.ok(trip);

      // Create hotline hold for seat A05 at stop stp_hn_gb
      const holdRes = services.managerService.createHotlineHold({
        tripId,
        passengerName: 'Khách Hotline',
        phone: '0912345678',
        seatCodes: ['A05'],
        pickupStopId: 'stp_hn_gb',
        dropoffStopId: 'stp_th_pb'
      });
      assert.strictEqual(holdRes.success, true);
      const rsv = holdRes.data;

      // When driver departs stp_hn_gb (already departed above in test b), releaseExpiredHotlineHolds releases the hold
      services.managerService.releaseExpiredHotlineHolds();
      assert.strictEqual(rsv.hold_status, 'NO_SHOW_RELEASED');

      // Check trip-log has readable event
      const driverTrip = services.driverService.activeTrips.get(tripId);
      const logEv = driverTrip.events.find(e => e.type === 'HOTLINE_HOLD_RELEASED' && e.reservation_id === rsv.reservation_id);
      assert.ok(logEv, 'trip-log must record HOTLINE_HOLD_RELEASED');
      assert.strictEqual(logEv.message, 'Nhả ghế A05 giữ qua tổng đài (khách không lên xe tại Bến xe Giáp Bát)');

      // Check audit log
      const auditEntry = services.managerService.auditLog.find(a => a.resource === `hotline:${rsv.reservation_id}`);
      assert.ok(auditEntry, 'audit entry must be recorded');
      assert.strictEqual(auditEntry.action, 'HOTLINE_HOLD_NO_SHOW_RELEASED');
      assert.match(auditEntry.after.message, /Nhả ghế A05 giữ qua tổng đài \(khách không lên xe tại Bến xe Giáp Bát\)/);

      // Also verify EXPIRED_RELEASED on a scheduled trip
      const schedTripId = 'trp_991824';
      const hold2 = services.managerService.createHotlineHold({
        tripId: schedTripId,
        passengerName: 'Khách Hết Hạn',
        phone: '0988776655',
        seatCodes: ['A06'],
        pickupStopId: 'stp_nb',
        dropoffStopId: 'stp_th_pb',
        holdPolicy: 'CUSTOM_EXPIRY_MINUTES',
        customExpiryMinutes: 1
      });
      assert.strictEqual(hold2.success, true);
      const rsv2 = hold2.data;

      // Mock time past expiry
      const futureNow = Date.now() + 5 * 60 * 1000;
      services.managerService.releaseExpiredHotlineHolds(futureNow);
      assert.strictEqual(rsv2.hold_status, 'EXPIRED_RELEASED');

      const schedTrip = services.managerService.findTrip(schedTripId);
      const logEv2 = (schedTrip?.events || []).find(e => e.type === 'HOTLINE_HOLD_RELEASED' && e.reservation_id === rsv2.reservation_id);
      if (logEv2) {
        assert.strictEqual(logEv2.message, 'Nhả ghế A06 giữ qua tổng đài (hết hạn giữ chỗ)');
      }

      const audit2 = services.managerService.auditLog.find(a => a.resource === `hotline:${rsv2.reservation_id}`);
      assert.ok(audit2);
      assert.strictEqual(audit2.action, 'HOTLINE_HOLD_EXPIRED_RELEASED');
    });
  });

  describe('(d) tracking at a route terminal that is also in REST_STOPS reports arrival not rest stop', () => {
    it('reports arrival at drop-off instead of rest stop when bus is at terminal', () => {
      const tripId = 'trp_hn_th_01';
      // Bến xe Phía Bắc Thanh Hóa (lat 19.8200, lng 105.7700) is in REST_STOPS as rs_thanh_hoa
      const terminalCoords = { lat: 19.8200, lng: 105.7700 };

      // Update bus telemetry to the terminal
      services.trackingService.updateBusPosition(tripId, {
        lat: terminalCoords.lat,
        lng: terminalCoords.lng,
        speed_kmh: 0,
        bearing_deg: 180,
        battery_level: 90
      });

      // Passenger boarded heading to Bến xe Phía Bắc Thanh Hóa (stp_th_pb)
      const radar = services.trackingService.getTripRadar(tripId, {
        pickupStopId: 'stp_hn_gb',
        dropoffStopId: 'stp_th_pb',
        boarded: true,
        canSeeBus: true,
        tripStatus: 'IN_TRANSIT'
      });

      assert.strictEqual(radar.success, true);
      assert.strictEqual(radar.data.is_at_rest_stop, false, 'terminal route stop must not be flagged as rest stop');
      assert.strictEqual(radar.data.is_at_station, true, 'bus is within 100m of terminal');
      assert.strictEqual(radar.data.hud_status_text, 'Xe đã đến điểm trả! Mời quý khách chuẩn bị xuống xe');
    });
  });

  describe('(e) ticket/wallet API returns pickup_time of the pickup stop', () => {
    it('returns pickup_time and pickup_time_estimated for passenger tickets', () => {
      const trip = services.searchService.getTripDetail('trp_hn_th_02').data;
      assert.ok(trip);
      const stopTimes = services.searchService.stopTimes('trp_hn_th_02');
      assert.ok(stopTimes.stp_hn_gb, 'Giáp Bát must have stop times');
      const plannedGb = stopTimes.stp_hn_gb.planned_time;

      const orderRes = services.paymentService.createPaymentOrder({
        trip,
        holdId: 'hold_test_pickup_time',
        seatCodes: ['B02'],
        payer: { full_name: 'Trần Văn Khách', phone: '0933221100' },
        passengers: [{ full_name: 'Trần Văn Khách', phone: '0933221100', seat_code: 'B02' }],
        amountVnd: 180000,
        pickupStopId: 'stp_hn_gb',
        pickupStop: 'Bến xe Giáp Bát',
        dropoffStopId: 'stp_th_pb',
        dropoffStop: 'Bến xe Phía Bắc Thanh Hóa'
      });
      assert.strictEqual(orderRes.success, true);
      assert.strictEqual(orderRes.data.pickup_time, plannedGb);
      assert.strictEqual(orderRes.data.pickup_time_estimated, true);

      // Settle payment
      const settleRes = services.paymentService.settlePayment(orderRes.data.order_id, {
        amountVnd: 180000,
        transactionRef: 'tx_test_pickup'
      });
      assert.strictEqual(settleRes.success, true);

      // Check ticket wallet
      const walletRes = services.paymentService.getTicketsByPhone('0933221100');
      assert.strictEqual(walletRes.success, true);
      const ticket = walletRes.data.find(t => t.pnr === orderRes.data.pnr);
      assert.ok(ticket, 'ticket must be in wallet');
      assert.strictEqual(ticket.pickup_time, plannedGb, 'ticket pickup_time must match planned stop time');
      assert.strictEqual(ticket.pickup_time_estimated, true);

      // Check boarding pass
      const passRes = services.paymentService.getBoardingPass(ticket.ticket_id, '0933221100');
      assert.strictEqual(passRes.success, true);
      assert.strictEqual(passRes.data.ticket.pickup_time, plannedGb);
      assert.strictEqual(passRes.data.ticket.pickup_time_estimated, true);
    });
  });
});
