import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { createFleetBusServer } from '../../source/server/apiServer.js';
import { missedDepartureAlerts } from '../../source/server/core/missedDepartures.js';
import { vnDate } from '../../source/server/core/serviceDate.js';
import { generateTotp } from '../../source/server/core/totp.js';
import { DEV_TOTP_SECRET } from '../../source/server/config.js';
import { enrichBookingForOps } from '../../source/server/routes/managerRoutes.js';

describe('Manager Web Redesign Step 1: Server Core, Permissions & Manifest', () => {
  let server;
  let services;
  let baseUrl;
  let directorToken;
  let dispatcherToken;
  let cashierToken;
  let otherOpToken;

  const totp = () => generateTotp(DEV_TOTP_SECRET, Date.now());

  const request = async (path, { method = 'GET', body, token, code = 'SAOMAI' } = {}) => {
    const headers = { 'Content-Type': 'application/json', 'X-Operator-Code': code };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (method === 'POST') headers['Idempotency-Key'] = crypto.randomUUID();
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const text = await res.text();
    let parsedBody;
    try {
      parsedBody = JSON.parse(text);
    } catch (_) {
      parsedBody = text;
    }
    return { status: res.status, body: parsedBody };
  };

  before(async () => {
    ({ server, services } = createFleetBusServer());
    await new Promise(resolve => server.listen(0, resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    const [dirLogin, dispLogin, cashLogin] = await Promise.all([
      request('/api/v1/ops/auth/login', {
        method: 'POST',
        body: { username: 'admin@busgo.vn', password: 'admin123', totp: totp() }
      }),
      request('/api/v1/ops/auth/login', {
        method: 'POST',
        body: { username: 'dispatcher@busgo.vn', password: 'disp123' }
      }),
      request('/api/v1/ops/auth/login', {
        method: 'POST',
        body: { username: 'cashier@busgo.vn', password: 'cash123' }
      })
    ]);

    assert.strictEqual(dirLogin.status, 200, JSON.stringify(dirLogin.body));
    assert.strictEqual(dispLogin.status, 200, JSON.stringify(dispLogin.body));
    assert.strictEqual(cashLogin.status, 200, JSON.stringify(cashLogin.body));

    directorToken = dirLogin.body.data.token;
    dispatcherToken = dispLogin.body.data.token;
    cashierToken = cashLogin.body.data.token;

    // Login for other operator dispatcher
    const otherLogin = await request('/api/v1/ops/auth/login', {
      method: 'POST',
      code: 'XUYENVIET',
      body: { username: 'dispatcher@xuyenviet.vn', password: 'xv123' }
    });
    assert.strictEqual(otherLogin.status, 200, JSON.stringify(otherLogin.body));
    otherOpToken = otherLogin.body.data.token;
  });

  after(() => new Promise(resolve => server.close(resolve)));

  describe('1. Gateway: DISPATCHER bookings read permissions', () => {
    it('DISPATCHER can GET /api/v1/ops/bookings with full passenger phones (has DISPATCH)', async () => {
      const res = await request('/api/v1/ops/bookings', { token: dispatcherToken });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.status, 'success');
      assert.ok(Array.isArray(res.body.data.bookings));
      const sample = res.body.data.bookings.find(b => b.phone);
      if (sample) {
        assert.ok(!sample.phone.includes('***'), `Dispatcher has DISPATCH permission so sees full phone: ${sample.phone}`);
      }
    });

    it('FLEET_DIRECTOR sees full passenger phones on GET /api/v1/ops/bookings', async () => {
      const res = await request('/api/v1/ops/bookings', { token: directorToken });
      assert.strictEqual(res.status, 200);
      const sample = res.body.data.bookings.find(b => b.phone);
      if (sample) {
        assert.ok(!sample.phone.includes('***'), `Director sees full phone: ${sample.phone}`);
      }
    });

    it('DISPATCHER is forbidden from POST /api/v1/ops/bookings (read-only)', async () => {
      const res = await request('/api/v1/ops/bookings', {
        method: 'POST',
        token: dispatcherToken,
        body: { some: 'payload' }
      });
      assert.strictEqual(res.status, 403);
    });
  });

  describe('2. TICKET_CANCELLED updates managerService.bookings', () => {
    it('partially cancelling seats updates cancelled_seat_codes, refunded_vnd, cod_amount_vnd and status', () => {
      const testPnr = 'BG-808788';
      const testTripId = 'trp_cancel_test_01';
      const booking = {
        pnr: testPnr,
        trip_id: testTripId,
        passenger_name: 'Nguyễn Văn Test',
        phone: '0912345678',
        seat_codes: ['A03', 'B03'],
        total_fare_vnd: 500000,
        payment_method: 'CASH',
        payment_status: 'UNPAID_COD',
        cod_amount_vnd: 500000,
        operator_id: 'op_saomai'
      };

      services.managerService.bookings.push(booking);

      // Emit cancellation for seat B03 with 250.000 đ refund
      services.eventBridge.emit('TICKET_CANCELLED', {
        ticketId: 'tkt_b03',
        pnr: testPnr,
        tripId: testTripId,
        seatCode: 'B03',
        refundAmountVnd: 250000
      });

      assert.deepStrictEqual(booking.seat_codes, ['A03', 'B03'], 'Original seat_codes preserved');
      assert.deepStrictEqual(booking.cancelled_seat_codes, ['B03'], 'Cancelled seat recorded');
      assert.strictEqual(booking.refunded_vnd, 250000, 'Refunded amount tracked');
      assert.strictEqual(booking.status, 'PARTIALLY_CANCELLED', 'Status reflects partial cancellation');
      assert.strictEqual(booking.cod_amount_vnd, 250000, 'COD amount decreased by one seat fare');

      // The same cancellation delivered again changes nothing
      services.eventBridge.emit('TICKET_CANCELLED', { ticketId: 'tkt_b03', pnr: testPnr, tripId: testTripId, seatCode: 'B03', refundAmountVnd: 250000 });
      assert.deepStrictEqual(booking.cancelled_seat_codes, ['B03']);
      assert.strictEqual(booking.refunded_vnd, 250000);
      assert.strictEqual(booking.cod_amount_vnd, 250000);

      // Cancel second seat A03
      services.eventBridge.emit('TICKET_CANCELLED', {
        ticketId: 'tkt_a03',
        pnr: testPnr,
        tripId: testTripId,
        seatCode: 'A03',
        refundAmountVnd: 250000
      });

      assert.strictEqual(booking.cancelled_seat_codes.length, 2);
      assert.strictEqual(booking.status, 'CANCELLED', 'Status reflects full cancellation');
      assert.strictEqual(booking.cod_amount_vnd, 0, 'COD amount reduced to 0');
      assert.strictEqual(booking.refunded_vnd, 500000);

      // Cleanup
      const idx = services.managerService.bookings.findIndex(b => b.pnr === testPnr);
      if (idx !== -1) services.managerService.bookings.splice(idx, 1);
    });
  });

  describe('3. Early warning alert UNASSIGNED_DEPARTURE_UPCOMING', () => {
    const fixedNow = Date.parse('2026-11-09T14:00:00+07:00');

    it('generates AMBER alert for unassigned trip departing in 110 minutes', () => {
      const mockManager = {
        trips: [
          {
            trip_id: 'trp_upcoming_unassigned_110m',
            route_name: 'Hà Nội — Thanh Hóa',
            operator_id: 'op_saomai',
            departure_time: '2026-11-09T15:50:00+07:00', // 110 min ahead
            status: 'SCHEDULED',
            vehicle_id: null,
            driver_id: null,
            booked_seats: 5
          }
        ]
      };

      const alerts = missedDepartureAlerts(mockManager, 'op_saomai', fixedNow);
      assert.strictEqual(alerts.length, 1);
      const a = alerts[0];
      assert.strictEqual(a.type, 'UNASSIGNED_DEPARTURE_UPCOMING');
      assert.strictEqual(a.severity, 'AMBER');
      assert.ok(a.message.includes('Hà Nội — Thanh Hóa'));
      assert.ok(a.message.includes('1 giờ 50 phút'));
      assert.ok(a.message.includes('chưa gán xe và tài xế'));
    });

    it('generates RED alert for trip departing in 45 minutes with no vehicle', () => {
      const mockManager = {
        trips: [
          {
            trip_id: 'trp_upcoming_unassigned_45m',
            route_name: 'Hà Nội — Thanh Hóa',
            operator_id: 'op_saomai',
            departure_time: '2026-11-09T14:45:00+07:00', // 45 min ahead
            status: 'SCHEDULED',
            vehicle_id: null,
            driver_id: 'drv_01',
            booked_seats: 5
          }
        ]
      };

      const alerts = missedDepartureAlerts(mockManager, 'op_saomai', fixedNow);
      assert.strictEqual(alerts.length, 1);
      const a = alerts[0];
      assert.strictEqual(a.severity, 'RED');
      assert.ok(a.message.includes('45 phút'));
      assert.ok(a.message.includes('chưa gán xe'));
    });

    it('clears alert automatically once vehicle and driver are assigned', () => {
      const mockManager = {
        trips: [
          {
            trip_id: 'trp_upcoming_assigned',
            route_name: 'Hà Nội — Thanh Hóa',
            operator_id: 'op_saomai',
            departure_time: '2026-11-09T15:00:00+07:00',
            status: 'SCHEDULED',
            vehicle_id: 'veh_01',
            driver_id: 'drv_01',
            booked_seats: 5
          }
        ]
      };

      const alerts = missedDepartureAlerts(mockManager, 'op_saomai', fixedNow);
      assert.strictEqual(alerts.length, 0, 'No alert when both vehicle and driver assigned');
    });
  });

  describe('4. GET /api/v1/ops/trips/:tripId/manifest', () => {
    const testTripId = 'trp_manifest_test_01';

    before(() => {
      services.driverService.activeTrips.set(testTripId, {
        trip_id: testTripId,
        operator_id: 'op_saomai',
        status: 'READY',
        vehicle_plate: '29B-882.19',
        stops: [
          { stop_id: 'stp_hn_nuocngam', name: 'Bến xe Nước Ngầm' },
          { stop_id: 'stp_th_pb', name: 'Bến xe Phía Bắc Thanh Hóa' }
        ],
        manifest: [
          {
            ticket_id: 'tkt_m_01',
            seat_code: 'A01',
            passenger_name: 'Trần Thị Mai',
            passenger_phone: '0988776655',
            pnr: 'BG-112233',
            pickup_stop_id: 'stp_hn_nuocngam',
            dropoff_stop_id: 'stp_th_pb',
            home_pickup: { address: '12 Hoàng Mai, Hà Nội' },
            payment_method: 'COD',
            cod_amount_vnd: 220000,
            cod_collected: false,
            boarding_status: 'ISSUED',
            boarding_check: { hmac: 'secret_driver_only' }
          },
          {
            ticket_id: 'tkt_m_02',
            seat_code: 'A02',
            passenger_name: 'Lê Văn Cancel',
            passenger_phone: '0912345678',
            pnr: 'BG-445566',
            pickup_stop_id: 'stp_hn_nuocngam',
            dropoff_stop_id: 'stp_th_pb',
            boarding_status: 'CANCELLED'
          }
        ]
      });
    });

    after(() => {
      services.driverService.activeTrips.delete(testTripId);
    });

    it('DISPATCHER can fetch manifest and sees full phone numbers (has DISPATCH)', async () => {
      const res = await request(`/api/v1/ops/trips/${testTripId}/manifest`, { token: dispatcherToken });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.data.trip_id, testTripId);
      assert.strictEqual(res.body.data.total_passengers, 2);

      const items = res.body.data.manifest;
      assert.strictEqual(items[0].seat_code, 'A01');
      assert.strictEqual(items[0].passenger_name, 'Trần Thị Mai');
      assert.strictEqual(items[0].phone, '0988776655', 'Phone unmasked for dispatcher with DISPATCH');
      assert.strictEqual(items[0].pnr, 'BG-112233');
      assert.strictEqual(items[0].pickup_stop_name, 'Bến xe Nước Ngầm');
      assert.strictEqual(items[0].dropoff_stop_name, 'Bến xe Phía Bắc Thanh Hóa');
      assert.strictEqual(items[0].home_pickup.address, '12 Hoàng Mai, Hà Nội');
      assert.strictEqual(items[0].payment_method, 'COD');
      assert.strictEqual(items[0].cod_amount_vnd, 220000);
      assert.strictEqual(items[0].cod_collected, false);
      assert.strictEqual(items[0].boarding_status, 'ISSUED');
      assert.strictEqual(items[0].boarding_check, undefined, 'Must not return driver secret check');

      // Cancelled seat returned with CANCELLED status
      assert.strictEqual(items[1].seat_code, 'A02');
      assert.strictEqual(items[1].boarding_status, 'CANCELLED');
    });

    it('FLEET_DIRECTOR sees full phone numbers on manifest', async () => {
      const res = await request(`/api/v1/ops/trips/${testTripId}/manifest`, { token: directorToken });
      assert.strictEqual(res.status, 200);
      const items = res.body.data.manifest;
      assert.strictEqual(items[0].phone, '0988776655');
    });

    it('CASHIER can read trip manifest for counter verification', async () => {
      const res = await request(`/api/v1/ops/trips/${testTripId}/manifest`, { token: cashierToken });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.data.total_passengers, 2);
    });

    it('Other operator cannot access this operator trip manifest (404)', async () => {
      const res = await request(`/api/v1/ops/trips/${testTripId}/manifest`, { token: otherOpToken, code: 'XUYENVIET' });
      assert.strictEqual(res.status, 404);
    });
  });

  describe('5. Today revenue & trips count in Dashboard KPIs', () => {
    it('returns today_revenue_vnd and today_trip_count in KPI dashboard', async () => {
      const fixedNow = Date.parse('2026-11-09T10:00:00+07:00');
      const today = vnDate(fixedNow);

      const tripId = 'trp_today_rev_01';
      services.managerService.trips.push({
        trip_id: tripId,
        operator_id: 'op_saomai',
        departure_time: `${today}T14:00:00+07:00`,
        status: 'SCHEDULED',
        booked_seats: 2,
        total_seats: 22
      });

      services.managerService.bookings.push({
        pnr: 'BG-TODAY-01',
        trip_id: tripId,
        passenger_name: 'Khách Hôm Nay',
        seat_codes: ['A01', 'A02'],
        total_fare_vnd: 440000,
        payment_status: 'PAID',
        operator_id: 'op_saomai'
      });

      const res = await request(`/api/v1/ops/dashboard/kpis?now=${fixedNow}`, { token: directorToken });
      assert.strictEqual(res.status, 200);
      assert.ok(res.body.data.kpi_metrics);
      assert.ok(typeof res.body.data.kpi_metrics.today_revenue_vnd === 'number');
      assert.ok(typeof res.body.data.kpi_metrics.today_trip_count === 'number');
      assert.ok(res.body.data.kpi_metrics.today_revenue_vnd >= 440000);
      assert.ok(res.body.data.kpi_metrics.today_trip_count >= 1);

      // Clean up
      const tIdx = services.managerService.trips.findIndex(t => t.trip_id === tripId);
      if (tIdx !== -1) services.managerService.trips.splice(tIdx, 1);
      const bIdx = services.managerService.bookings.findIndex(b => b.pnr === 'BG-TODAY-01');
      if (bIdx !== -1) services.managerService.bookings.splice(bIdx, 1);
    });
  });

  describe('6. enrichBookingForOps pure function & GET /bookings enriched fields', () => {
    it('enrichBookingForOps computes cancelled_seat_codes union, PARTIALLY_CANCELLED, cod_amount_vnd, and trip info', () => {
      const rawBooking = {
        pnr: 'BG-808788',
        trip_id: 'trp_mock_01',
        passenger_name: 'Nguyễn Văn Test',
        seat_codes: ['A03', 'B03'],
        total_fare_vnd: 500000,
        payment_method: 'CASH',
        payment_status: 'UNPAID_COD',
        cod_amount_vnd: 500000,
        status: 'CONFIRMED'
      };

      const mockTrip = {
        trip_id: 'trp_mock_01',
        route_name: 'Hà Nội — Thanh Hóa (Cao tốc)',
        departure_time: '2026-11-10T07:00:00+07:00',
        vehicle_plate: '29B-888.88'
      };

      // Ticket B03 cancelled in paymentService
      const tickets = [
        { pnr: 'BG-808788', seat_code: 'B03', status: 'CANCELLED' }
      ];

      const enriched = enrichBookingForOps(rawBooking, mockTrip, tickets);

      assert.strictEqual(enriched.pnr, 'BG-808788');
      assert.deepStrictEqual(enriched.cancelled_seat_codes, ['B03']);
      assert.strictEqual(enriched.status, 'PARTIALLY_CANCELLED');
      assert.strictEqual(enriched.cod_amount_vnd, 250000, 'Remaining COD fare for 1 active seat');
      assert.deepStrictEqual(enriched.trip, {
        route_name: 'Hà Nội — Thanh Hóa (Cao tốc)',
        departure_time: '2026-11-10T07:00:00+07:00',
        vehicle_plate: '29B-888.88'
      });
      // Raw booking object must not be mutated
      assert.strictEqual(rawBooking.cod_amount_vnd, 500000);
      assert.strictEqual(rawBooking.status, 'CONFIRMED');
    });

    it('enrichBookingForOps handles full cancellation of all seats', () => {
      const rawBooking = {
        pnr: 'BG-FULL-CANCEL',
        trip_id: 'trp_mock_02',
        seat_codes: ['A01', 'A02'],
        total_fare_vnd: 500000,
        payment_method: 'CASH',
        payment_status: 'UNPAID_COD',
        cod_amount_vnd: 500000,
        status: 'CONFIRMED'
      };
      const tickets = [
        { pnr: 'BG-FULL-CANCEL', seat_code: 'A01', status: 'CANCELLED' },
        { pnr: 'BG-FULL-CANCEL', seat_code: 'A02', status: 'CANCELLED' }
      ];
      const enriched = enrichBookingForOps(rawBooking, null, tickets);
      assert.strictEqual(enriched.status, 'CANCELLED');
      assert.strictEqual(enriched.cod_amount_vnd, 0);
      assert.strictEqual(enriched.trip, null);
    });

    it('GET /api/v1/ops/bookings returns trip and updated cancelled_seat_codes', async () => {
      const pnr = 'BG-API-ENRICH-01';
      const tripId = 'trp_api_enrich_01';
      services.managerService.trips.push({
        trip_id: tripId,
        operator_id: 'op_saomai',
        route_name: 'Hà Nội — Sầm Sơn',
        departure_time: '2026-11-10T08:00:00+07:00',
        vehicle_plate: '29B-999.99',
        status: 'SCHEDULED'
      });
      services.managerService.bookings.push({
        pnr,
        trip_id: tripId,
        passenger_name: 'Khách Đặt Trước',
        phone: '0912345678',
        seat_codes: ['A01', 'A02'],
        total_fare_vnd: 500000,
        payment_method: 'CASH',
        payment_status: 'UNPAID_COD',
        cod_amount_vnd: 500000,
        operator_id: 'op_saomai'
      });
      services.paymentService.tickets.set('tkt_api_02', {
        ticket_id: 'tkt_api_02',
        pnr,
        seat_code: 'A02',
        status: 'CANCELLED'
      });

      const res = await request('/api/v1/ops/bookings', { token: directorToken });
      assert.strictEqual(res.status, 200);
      const found = res.body.data.bookings.find(b => b.pnr === pnr);
      assert.ok(found, 'Booking should be returned');
      assert.deepStrictEqual(found.cancelled_seat_codes, ['A02']);
      assert.strictEqual(found.status, 'PARTIALLY_CANCELLED');
      assert.strictEqual(found.cod_amount_vnd, 250000);
      assert.ok(found.trip);
      assert.strictEqual(found.trip.route_name, 'Hà Nội — Sầm Sơn');
      assert.strictEqual(found.trip.vehicle_plate, '29B-999.99');

      // Clean up
      const tIdx = services.managerService.trips.findIndex(t => t.trip_id === tripId);
      if (tIdx !== -1) services.managerService.trips.splice(tIdx, 1);
      const bIdx = services.managerService.bookings.findIndex(b => b.pnr === pnr);
      if (bIdx !== -1) services.managerService.bookings.splice(bIdx, 1);
      services.paymentService.tickets.delete('tkt_api_02');
    });
  });
});
