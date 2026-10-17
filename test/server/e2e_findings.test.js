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

  describe('Bug G5: Hotline hold converted on COD collection creates POS_HOTLINE booking', () => {
    let services;

    before(() => {
      ({ services } = createFleetBusServer());
    });

    it('hold 1 seat -> driver collects COD with change -> bookings has one PAID POS_HOTLINE booking with fare = seat fare and dashboard net revenue includes it; collecting again is refused/does not duplicate', () => {
      const tripId = 'trp_hn_th_01';
      const trip = services.managerService.findTrip(tripId);
      assert.ok(trip);
      const operatorId = trip.operator_id || 'op_saomai';

      // 1. Hold 1 seat via hotline
      const holdRes = services.managerService.createHotlineHold({
        tripId,
        passengerName: 'Le Thi Hoa',
        phone: '0987000333',
        seatCodes: ['A11'],
        holdPolicy: 'CUSTOM_EXPIRY_MINUTES',
        customExpiryMinutes: 60,
        operatorId
      });
      assert.strictEqual(holdRes.success, true);
      const reservation = holdRes.data;
      assert.ok(reservation);
      const pnr = reservation.pnr;
      const seatFare = services.managerService.routes.find(r => r.route_id === trip.route_id)?.base_fare_vnd || trip.base_fare_vnd || 220000;

      // Initial revenue before collecting COD
      const kpisBefore = services.managerService.getDashboardKPIs(operatorId);
      const netBefore = kpisBefore.data.kpi_metrics.net_revenue_vnd;

      // Find ticket on driver's manifest
      const driverTrip = services.driverService.activeTrips.get(tripId);
      assert.ok(driverTrip, 'driver trip must exist');
      const manifestItem = driverTrip.manifest.find(m => m.pnr === pnr && m.seat_code === 'A11');
      assert.ok(manifestItem, 'hotline passenger must be in driver manifest');
      const ticketId = manifestItem.ticket_id;

      // 2. Driver collects COD with change (passenger gives seatFare + 20.000 đ)
      const collectRes = services.driverService.collectCod(tripId, ticketId, {
        amount_collected_vnd: seatFare + 20000,
        fare_amount_vnd: seatFare,
        change_settlement_method: 'CASH_RETURNED'
      });
      assert.strictEqual(collectRes.success, true);

      // 3. bookings has one PAID POS_HOTLINE booking with fare = seat fare
      const matchingBookings = services.managerService.bookings.filter(b => b.pnr === pnr);
      assert.strictEqual(matchingBookings.length, 1, 'must have exactly one booking for this PNR');
      const b = matchingBookings[0];
      assert.strictEqual(b.payment_status, 'PAID');
      assert.strictEqual(b.channel, 'POS_HOTLINE');
      assert.strictEqual(b.total_fare_vnd, seatFare, 'fare must be seat fare, not cash given, not change');
      assert.deepStrictEqual(b.seat_codes, ['A11']);
      assert.strictEqual(b.passenger_name, 'Le Thi Hoa');
      assert.strictEqual(b.phone, '0987000333');

      // Dashboard net revenue includes it
      const kpisAfter = services.managerService.getDashboardKPIs(operatorId);
      assert.strictEqual(kpisAfter.data.kpi_metrics.net_revenue_vnd, netBefore + seatFare);

      // 4. Collecting again is refused / does not duplicate
      const collectAgainRes = services.driverService.collectCod(tripId, ticketId, {
        amount_collected_vnd: seatFare,
        fare_amount_vnd: seatFare
      });
      assert.strictEqual(collectAgainRes.success, false);
      assert.strictEqual(collectAgainRes.code, 'ALREADY_COLLECTED');

      // Even if event is fired directly, it does not double count
      services.eventBridge.emit('COD_COLLECTED', { tripId, ticketId, pnr, fareVnd: seatFare, seatCode: 'A11' });
      assert.strictEqual(services.managerService.bookings.filter(b => b.pnr === pnr).length, 1);
      assert.strictEqual(services.managerService.bookings.find(b => b.pnr === pnr).total_fare_vnd, seatFare);
      const kpisAfterDup = services.managerService.getDashboardKPIs(operatorId);
      assert.strictEqual(kpisAfterDup.data.kpi_metrics.net_revenue_vnd, netBefore + seatFare);
    });

    it('multi-seat hotline hold collected seat by seat extends the booking and never double counts', () => {
      const tripId = 'trp_hn_th_01';
      const trip = services.managerService.findTrip(tripId);
      const operatorId = trip.operator_id || 'op_saomai';

      const holdRes = services.managerService.createHotlineHold({
        tripId,
        passengerName: 'Nguyen Van Hai',
        phone: '0987000888',
        seatCodes: ['B04', 'B05'],
        holdPolicy: 'CUSTOM_EXPIRY_MINUTES',
        customExpiryMinutes: 60,
        operatorId
      });
      assert.strictEqual(holdRes.success, true);
      const reservation = holdRes.data;
      const pnr = reservation.pnr;
      const seatFare = services.managerService.routes.find(r => r.route_id === trip.route_id)?.base_fare_vnd || trip.base_fare_vnd || 220000;

      const driverTrip = services.driverService.activeTrips.get(tripId);
      const itemB04 = driverTrip.manifest.find(m => m.pnr === pnr && m.seat_code === 'B04');
      const itemB05 = driverTrip.manifest.find(m => m.pnr === pnr && m.seat_code === 'B05');

      // Collect seat 1
      const res1 = services.driverService.collectCod(tripId, itemB04.ticket_id, {
        amount_collected_vnd: seatFare,
        fare_amount_vnd: seatFare
      });
      assert.strictEqual(res1.success, true);

      let b = services.managerService.bookings.find(b => b.pnr === pnr);
      assert.ok(b);
      assert.deepStrictEqual(b.seat_codes, ['B04']);
      assert.strictEqual(b.total_fare_vnd, seatFare);

      // Collect seat 2
      const res2 = services.driverService.collectCod(tripId, itemB05.ticket_id, {
        amount_collected_vnd: seatFare,
        fare_amount_vnd: seatFare
      });
      assert.strictEqual(res2.success, true);

      b = services.managerService.bookings.find(b => b.pnr === pnr);
      assert.ok(b);
      assert.deepStrictEqual(b.seat_codes, ['B04', 'B05']);
      assert.strictEqual(b.total_fare_vnd, seatFare * 2);
    });
  });

  describe('Bug G2: Issued tickets take vehicle plate from assigned trip and update on swap', () => {
    let services;

    before(() => {
      ({ services } = createFleetBusServer());
    });

    it('settled tickets get vehicle_plate from the assigned trip and update on assignment/swap', () => {
      const tripId = 'trp_hn_th_01';
      // 1. Assign bus veh_01 (29B-123.45) to trip
      const assignRes = services.managerService.assignTrip(tripId, {
        vehicleId: 'veh_01',
        driverId: 'drv_8821a'
      });
      assert.strictEqual(assignRes.success, true);
      const trip = services.managerService.findTrip(tripId);
      assert.strictEqual(trip.vehicle_plate, '29B-123.45');

      // 2. Passenger creates payment order for trip (simulating trip without plate at client search time)
      const mockTripWithoutPlate = {
        trip_id: tripId,
        route_name: 'Hà Nội — Thanh Hóa',
        departure_time: '2026-08-28T07:00:00+07:00'
      };
      const orderRes = services.paymentService.createPaymentOrder({
        holdId: 'hld_g2_test',
        trip: mockTripWithoutPlate,
        seatCodes: ['A03'],
        payer: { full_name: 'Nguyễn Văn An', phone: '0987654321' },
        passengers: [{ full_name: 'Nguyễn Văn An', phone: '0987654321' }],
        amountVnd: 220000,
        pickupStop: { name: 'Mỹ Đình' },
        dropoffStop: { name: 'Thanh Hóa' }
      });
      assert.strictEqual(orderRes.success, true);
      const orderId = orderRes.data.order_id;

      // 3. Settle payment
      const settleRes = services.paymentService.settlePayment(orderId, 'tx_g2_001');
      assert.strictEqual(settleRes.success, true);
      assert.strictEqual(settleRes.data.tickets.length, 1);
      const issuedTicket = settleRes.data.tickets[0];
      assert.strictEqual(issuedTicket.vehicle_plate, '29B-123.45', 'issued ticket must carry vehicle_plate from assigned trip');

      // 4. Ticket wallet query returns vehicle_plate
      const walletRes = services.paymentService.getTicketsByPhone('0987654321', 'UPCOMING');
      assert.strictEqual(walletRes.success, true);
      const walletTicket = walletRes.data.find(t => t.ticket_id === issuedTicket.ticket_id);
      assert.ok(walletTicket);
      assert.strictEqual(walletTicket.vehicle_plate, '29B-123.45');

      // 5. If emergency swap happens to veh_03 (standby bus 29B-888.22), tickets are updated
      const veh03 = services.managerService.vehicles.find(v => v.vehicle_id === 'veh_03');
      assert.ok(veh03);
      assert.strictEqual(veh03.plate_number, '29B-888.22');
      const swapRes = services.managerService.replaceTripVehicle(tripId, 'veh_03', 'Xe bảo dưỡng định kỳ');
      assert.strictEqual(swapRes.success, true);
      assert.strictEqual(issuedTicket.vehicle_plate, '29B-888.22', 'ticket vehicle_plate must update on vehicle swap');
    });
  });
});


