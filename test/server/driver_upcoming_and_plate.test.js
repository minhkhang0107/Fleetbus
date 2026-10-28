import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { createFleetBusServer } from '../../source/server/apiServer.js';
import { addDays, vnDate } from '../../source/server/core/serviceDate.js';
import { DRIVER_UPCOMING_WINDOW_MS } from '../../source/server/services/driver/modules/driverService.js';

describe('Task T2: Driver upcoming trips within 12 hours & schedule template default plate fallback', () => {
  let server;
  let services;
  let baseUrl;
  let paxToken;

  const request = async (path, { method = 'GET', body, token } = {}) => {
    const headers = { 'Content-Type': 'application/json', 'X-Operator-Code': 'SAOMAI' };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (method === 'POST') headers['Idempotency-Key'] = crypto.randomUUID();
    const res = await fetch(`${baseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  };

  before(async () => {
    ({ server, services } = createFleetBusServer());
    await new Promise(resolve => server.listen(0, resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    const otp = await request('/api/v1/auth/passenger/otp/request', { method: 'POST', body: { phone: '0905556677' } });
    paxToken = (await request('/api/v1/auth/passenger/otp/verify', { method: 'POST', body: { phone: '0905556677', otp: otp.body.data.mock_otp } })).body.data.token;
  });

  after(() => new Promise(resolve => server.close(resolve)));

  describe('Driver upcoming trip window (next 12 hours)', () => {
    it('TC-DRV-UPCOMING-01: at day D 23:30 (VN), a run departing D+1 07:00 appears in getTodayTrips; a run departing D+2 07:00 does not', () => {
      const dayD = vnDate(Date.now()); // today: runs are only made around the booking window
      const dayD1 = addDays(dayD, 1);
      const dayD2 = addDays(dayD, 2);
      const runD1 = `trp_hn_th_01_${dayD1.replaceAll('-', '')}`;
      const runD2 = `trp_hn_th_01_${dayD2.replaceAll('-', '')}`;

      services.eventBridge.ensureRunOperations(runD1);
      services.eventBridge.ensureRunOperations(runD2);

      const nowD2330 = Date.parse(`${dayD}T23:30:00+07:00`);
      const res = services.driverService.getTodayTrips('drv_8821a', nowD2330);
      assert.strictEqual(res.success, true);
      const tripIds = res.data.trips.map(t => t.trip_id);

      assert.ok(tripIds.includes(runD1), 'run departing D+1 07:00 (7.5h away) must appear in driver trips');
      assert.ok(!tripIds.includes(runD2), 'run departing D+2 07:00 (31.5h away) must NOT appear in driver trips');
    });

    it('TC-DRV-UPCOMING-02: 12-hour window boundary respects DRIVER_UPCOMING_WINDOW_MS', () => {
      assert.strictEqual(DRIVER_UPCOMING_WINDOW_MS, 12 * 3600000, 'window constant is exactly 12 hours');

      const driverId = 'drv_8821a';
      const now = Date.parse('2026-10-25T12:00:00+07:00');

      // Trip departing in 11 hours (23:00 today)
      services.driverService.activeTrips.set('trp_test_11h', {
        trip_id: 'trp_test_11h',
        driver_id: driverId,
        planned_departure_time: new Date(now + 11 * 3600000).toISOString(),
        stops: []
      });

      // Trip departing in 13 hours tomorrow (01:00 next day)
      services.driverService.activeTrips.set('trp_test_13h', {
        trip_id: 'trp_test_13h',
        driver_id: driverId,
        planned_departure_time: new Date(now + 13 * 3600000).toISOString(),
        stops: []
      });

      const res = services.driverService.getTodayTrips(driverId, now);
      const tripIds = res.data.trips.map(t => t.trip_id);

      assert.ok(tripIds.includes('trp_test_11h'), 'trip within 12h must be included');
      assert.ok(!tripIds.includes('trp_test_13h'), 'trip beyond 12h must be excluded');

      // Cleanup test trips
      services.driverService.activeTrips.delete('trp_test_11h');
      services.driverService.activeTrips.delete('trp_test_13h');
    });

    it('TC-DRV-UPCOMING-03: today\'s past/current trips remain visible alongside upcoming morning trips', () => {
      const dayD = vnDate(Date.now()); // today: runs are only made around the booking window
      const dayD1 = addDays(dayD, 1);
      const runD1 = `trp_hn_th_01_${dayD1.replaceAll('-', '')}`;

      services.eventBridge.ensureRunOperations(runD1);

      // Current time is 23:40 on day D
      const now = Date.parse(`${dayD}T23:40:00+07:00`);

      // Add a completed trip from earlier today (08:00)
      services.driverService.activeTrips.set('trp_today_completed', {
        trip_id: 'trp_today_completed',
        driver_id: 'drv_8821a',
        planned_departure_time: `${dayD}T08:00:00+07:00`,
        status: 'COMPLETED',
        stops: []
      });

      const res = services.driverService.getTodayTrips('drv_8821a', now);
      const tripIds = res.data.trips.map(t => t.trip_id);

      assert.ok(tripIds.includes('trp_today_completed'), 'today\'s earlier trip must still be visible');
      assert.ok(tripIds.includes(runD1), 'tomorrow\'s 07:00 trip (<12h away) must be visible');

      // Verify chronological sort
      const idxToday = tripIds.indexOf('trp_today_completed');
      const idxTomorrow = tripIds.indexOf(runD1);
      assert.ok(idxToday < idxTomorrow, 'trips must be sorted chronologically by departure');

      services.driverService.activeTrips.delete('trp_today_completed');
    });
  });

  describe('Plate fallback for runs made from schedules', () => {
    it('TC-PLATE-RUN-01: unassigned trp_hn_th_02 run returns template plate_number on tickets and plateProvider', async () => {
      // Read the actual template plate value from search data (not hard-coded)
      const templateDetail = services.searchService.getTripDetail('trp_hn_th_02');
      assert.strictEqual(templateDetail.success, true);
      const expectedTemplatePlate = templateDetail.data.plate_number;
      assert.strictEqual(expectedTemplatePlate, '29B-991.02', 'schedule template plate in search data');

      const date = addDays(vnDate(Date.now()), 3);
      const runId = `trp_hn_th_02_${date.replaceAll('-', '')}`;

      // 1. Check plateProvider direct call
      const plateFromProvider = services.paymentService.plateProvider(runId);
      assert.strictEqual(plateFromProvider, expectedTemplatePlate, 'plateProvider returns template plate for unassigned run');

      // 2. Buy a ticket via HTTP and check issued ticket vehicle_plate
      const hold = await request(`/api/v1/passenger/trips/${runId}/hold-seats`, {
        method: 'POST',
        token: paxToken,
        body: { seatCodes: ['A03'], pickupStopId: 'stp_hn_my_dinh', dropoffStopId: 'stp_th_pb' }
      });
      assert.strictEqual(hold.status, 200, JSON.stringify(hold.body));

      const booking = await request('/api/v1/passenger/bookings/create', {
        method: 'POST',
        token: paxToken,
        body: {
          tripId: runId,
          holdId: hold.body.data.hold_id,
          seatCodes: ['A03'],
          payer: { full_name: 'Nguyễn Văn Test', phone: '0905556677' },
          passengers: [{ seat_code: 'A03', full_name: 'Nguyễn Văn Test', phone: '0905556677' }]
        }
      });
      assert.strictEqual(booking.status, 201, JSON.stringify(booking.body));

      const settle = services.paymentService.settlePayment(booking.body.data.payment.order_id);
      assert.strictEqual(settle.success, true);
      const issuedTicket = settle.data.tickets[0];
      assert.strictEqual(issuedTicket.vehicle_plate, expectedTemplatePlate, 'paid ticket has schedule default plate');

      // 3. Check wallet endpoint /api/v1/passenger/tickets
      const wallet = await request('/api/v1/passenger/tickets?filter=UPCOMING', { token: paxToken });
      assert.strictEqual(wallet.status, 200);
      const ticketInWallet = wallet.body.data.find(t => t.ticket_id === issuedTicket.ticket_id);
      assert.ok(ticketInWallet, 'ticket is in upcoming wallet');
      assert.strictEqual(ticketInWallet.vehicle_plate, expectedTemplatePlate, 'wallet ticket has schedule default plate');
    });

    it('TC-PLATE-RUN-02: assigned bus on the run still wins over schedule template plate fallback', () => {
      const date = addDays(vnDate(Date.now()), 4);
      const runId = `trp_hn_th_02_${date.replaceAll('-', '')}`;

      services.eventBridge.ensureRunOperations(runId);
      // Office assigns a specific bus to this run
      const opsTrip = services.managerService.findTrip(runId);
      opsTrip.vehicle_id = 'veh_01';
      opsTrip.vehicle_plate = '29B-444.11';

      const plate = services.paymentService.plateProvider(runId);
      assert.strictEqual(plate, '29B-444.11', 'assigned bus plate must take precedence');
    });

    it('TC-PLATE-RUN-03: preset schedule assignment (scope SCHEDULE) wins over schedule template default', () => {
      const date = addDays(vnDate(Date.now()), 5);
      const runId = `trp_hn_th_02_${date.replaceAll('-', '')}`;

      // Simulate preset schedule assignment in managerService
      if (!services.managerService.scheduleAssignments) services.managerService.scheduleAssignments = {};
      services.managerService.scheduleAssignments['trp_hn_th_02'] = { vehicle_id: 'veh_03', driver_id: 'drv_9912b' };

      const plate = services.paymentService.plateProvider(runId);
      assert.strictEqual(plate, '29B-888.22', 'preset schedule assignment plate (veh_03) wins over template plate');

      // Clean up schedule assignment
      delete services.managerService.scheduleAssignments['trp_hn_th_02'];
    });

    it('TC-PLATE-RUN-04: passenger trip search for unassigned run still returns plate_number null', async () => {
      const date = addDays(vnDate(Date.now()), 6);
      const searchRes = await request(`/api/v1/trips/search?origin=${encodeURIComponent('Hà Nội')}&destination=${encodeURIComponent('Thanh Hóa')}&date=${date}`);
      assert.strictEqual(searchRes.status, 200);

      const run02 = searchRes.body.data.find(t => t.trip_id.startsWith('trp_hn_th_02_'));
      assert.ok(run02, 'run for trp_hn_th_02 must exist in search');
      assert.strictEqual(run02.plate_number, null, 'unassigned run detail in search must return null plate_number');
    });
  });
});
