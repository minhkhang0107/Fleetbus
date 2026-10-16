import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import { createFleetBusServer } from '../../source/server/apiServer.js';

const READY = {
  tires_checked: true,
  brakes_fluid_checked: true,
  ac_cleanliness_checked: true,
  first_aid_extinguisher_checked: true,
  fuel_level_sufficient: true,
  gps_telemetry_beacon_active: true
};

describe('E2E Findings: assign options, live radar driver, and grouped pickup notification', () => {
  let services;

  before(() => {
    ({ services } = createFleetBusServer());
  });

  describe('Bug 1: Assign options and assignment use vehicle layout seat count', () => {
    it('reports 22 seats for a bus without layout_id, checks capacity against 22, and sets trip seats to 22', () => {
      const veh01 = services.managerService.vehicles.find(v => v.vehicle_id === 'veh_01');
      assert.ok(veh01, 'veh_01 exists in seed fleet');
      // Simulate legacy vehicle saved before layouts existed: no layout_id, raw total_seats is 34
      delete veh01.layout_id;
      veh01.total_seats = 34;

      const tripId = 'trp_hn_th_01';
      const trip = services.managerService.findTrip(tripId);
      assert.ok(trip);

      // Verify assign options reports 22 (CABIN_22 default), not raw 34
      const options = services.managerService.getAssignOptions(tripId);
      const optVeh = options.data.vehicles.find(v => v.vehicle_id === 'veh_01');
      assert.ok(optVeh);
      assert.strictEqual(optVeh.total_seats, 22, 'must report 22 seats from layoutOfVehicle fallback');

      // Verify the capacity check uses 22 seats
      const oldBooked = trip.booked_seats;
      trip.booked_seats = 23;
      const optionsOverbooked = services.managerService.getAssignOptions(tripId);
      const optVehOverbooked = optionsOverbooked.data.vehicles.find(v => v.vehicle_id === 'veh_01');
      assert.strictEqual(optVehOverbooked.available, false);
      assert.match(optVehOverbooked.reason, /Xe 22 chỗ, chuyến đã bán 23 ghế/);

      // Restore seats and assign vehicle to trip; trip.total_seats must become layout seat count (22)
      trip.booked_seats = 0;
      const assignRes = services.managerService.assignTrip(tripId, {
        vehicleId: 'veh_01',
        driverId: 'drv_8821a'
      });
      assert.strictEqual(assignRes.success, true);
      assert.strictEqual(trip.total_seats, 22, 'trip.total_seats must become the layout seat count of 22');

      // Cleanup
      trip.booked_seats = oldBooked;
    });
  });

  describe('Bug 2: Live fleet radar reports the working trip driver', () => {
    it('reports the assigned driver instead of the seed vehicle driver, prioritizing IN_TRANSIT', () => {
      const radar = services.managerService.getLiveFleetRadar().data;
      // veh_02 has seed driver_name "Lê Văn Toàn", but is assigned trip trp_991824 with drv_8821a ("Trần Văn Bình")
      const v2 = radar.vehicles.find(v => v.vehicle_id === 'veh_02');
      assert.ok(v2);
      assert.strictEqual(v2.driver_name, 'Trần Văn Bình', 'assigned trip driver must replace seed driver_name');

      // Standby bus veh_03 has no trips; must fall back to its own driver_name
      const v3 = radar.vehicles.find(v => v.vehicle_id === 'veh_03');
      assert.ok(v3);
      assert.strictEqual(v3.driver_name, 'Hoàng Anh Tuấn', 'bus without trips falls back to seed driver_name');

      // Test IN_TRANSIT trip prioritization over earlier scheduled trips
      const vTestId = 'veh_04';
      const v4Before = services.managerService.vehicles.find(v => v.vehicle_id === vTestId);
      const originalTrips = [...services.managerService.trips];

      services.managerService.trips.push(
        {
          trip_id: 'trp_test_early',
          vehicle_id: vTestId,
          driver_id: 'drv_9912b', // Phạm Quốc Huy
          departure_time: '2026-08-28T05:00:00+07:00',
          status: 'SCHEDULED',
          operator_id: 'op_saomai'
        },
        {
          trip_id: 'trp_test_transit',
          vehicle_id: vTestId,
          driver_id: 'drv_8821a', // Trần Văn Bình
          departure_time: '2026-08-28T09:00:00+07:00',
          status: 'IN_TRANSIT',
          operator_id: 'op_saomai'
        }
      );

      const radarTransit = services.managerService.getLiveFleetRadar().data;
      const v4Transit = radarTransit.vehicles.find(v => v.vehicle_id === vTestId);
      assert.strictEqual(v4Transit.driver_name, 'Trần Văn Bình', 'IN_TRANSIT trip driver takes precedence');

      // When IN_TRANSIT is completed, earliest non-completed/non-cancelled trip driver is chosen
      const inTransitTrip = services.managerService.trips.find(t => t.trip_id === 'trp_test_transit');
      inTransitTrip.status = 'COMPLETED';

      const radarNext = services.managerService.getLiveFleetRadar().data;
      const v4Next = radarNext.vehicles.find(v => v.vehicle_id === vTestId);
      assert.strictEqual(v4Next.driver_name, 'Phạm Quốc Huy', 'earliest non-completed trip driver is chosen');

      // Restore trips
      services.managerService.trips = originalTrips;
    });
  });

  describe('Bug 3: STOP_ARRIVED groups tickets by phone to send one push listing all seats', () => {
    it('sends one notification per phone with all seats listed when bus arrives at pickup stop', () => {
      const tripId = 'trp_hn_th_01';
      const activeTrip = services.driverService.activeTrips.get(tripId);
      assert.ok(activeTrip);

      const multiPhone = '0977889900';
      const singlePhone = '0966554433';
      const stopId = 'stp_nb';

      activeTrip.manifest.push(
        {
          ticket_id: 'tkt_multi_a',
          pnr: 'BG-M1',
          seat_code: 'A05',
          passenger_name: 'Nguyễn Văn A',
          passenger_phone: multiPhone,
          pickup_stop_id: stopId,
          dropoff_stop_id: 'stp_th_pb',
          boarding_status: 'ISSUED'
        },
        {
          ticket_id: 'tkt_multi_b',
          pnr: 'BG-M1',
          seat_code: 'B03',
          passenger_name: 'Nguyễn Văn A',
          passenger_phone: multiPhone,
          pickup_stop_id: stopId,
          dropoff_stop_id: 'stp_th_pb',
          boarding_status: 'ISSUED'
        },
        {
          ticket_id: 'tkt_single_c',
          pnr: 'BG-S1',
          seat_code: 'A06',
          passenger_name: 'Trần Thị B',
          passenger_phone: singlePhone,
          pickup_stop_id: stopId,
          dropoff_stop_id: 'stp_th_pb',
          boarding_status: 'ISSUED'
        }
      );

      services.driverService.submitReadinessChecklist(tripId, READY);
      services.driverService.startTrip(tripId);

      // Bus arrives at stop stp_nb
      const arriveRes = services.driverService.arriveAtStop(tripId, stopId);
      assert.strictEqual(arriveRes.success, true);

      // Verify notifications for multiPhone: exactly one message listing both seats
      const multiInbox = services.trackingService.getNotifications(multiPhone, 'op_saomai').data?.notifications
        ?? services.trackingService.getNotifications(multiPhone, 'op_saomai').data;
      const multiArrived = (multiInbox || []).filter(n => n.type === 'PICKUP_ARRIVED');

      assert.strictEqual(multiArrived.length, 1, 'passenger with 2 seats gets exactly one notification');
      assert.match(multiArrived[0].body, /ghế A05, B03\./, 'notification body lists all seats');
      assert.strictEqual(multiArrived[0].payload.ticket_id, 'tkt_multi_a', 'payload retains first ticket_id');
      assert.deepStrictEqual(multiArrived[0].payload.ticket_ids, ['tkt_multi_a', 'tkt_multi_b'], 'payload adds all ticket_ids');
      assert.strictEqual(multiArrived[0].payload.stop_id, stopId);
      assert.strictEqual(multiArrived[0].payload.trip_id, tripId);

      // Verify singlePhone gets normal notification with single seat
      const singleInbox = services.trackingService.getNotifications(singlePhone, 'op_saomai').data?.notifications
        ?? services.trackingService.getNotifications(singlePhone, 'op_saomai').data;
      const singleArrived = (singleInbox || []).filter(n => n.type === 'PICKUP_ARRIVED');

      assert.strictEqual(singleArrived.length, 1);
      assert.match(singleArrived[0].body, /ghế A06\./);
      assert.strictEqual(singleArrived[0].payload.ticket_id, 'tkt_single_c');
      assert.deepStrictEqual(singleArrived[0].payload.ticket_ids, ['tkt_single_c']);

      // Repeated arrival at the same stop is deduplicated
      services.driverService.arriveAtStop(tripId, stopId);
      const multiInbox2 = services.trackingService.getNotifications(multiPhone, 'op_saomai').data?.notifications
        ?? services.trackingService.getNotifications(multiPhone, 'op_saomai').data;
      const multiArrived2 = (multiInbox2 || []).filter(n => n.type === 'PICKUP_ARRIVED');
      assert.strictEqual(multiArrived2.length, 1, 'notification must remain deduplicated on repeated stop arrival');
    });
  });
});
