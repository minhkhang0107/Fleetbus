import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { createFleetBusServer } from '../../source/server/apiServer.js';
import { generateTotp } from '../../source/server/core/totp.js';
import { DEV_TOTP_SECRET } from '../../source/server/config.js';
import { runId, serviceCalendar } from '../../source/server/core/serviceDate.js';

describe('Phase S1: Operations Fixes Integration', () => {
  let appServer;
  let baseUrl;
  let managerService;
  let driverService;
  let services;
  const TEST_PORT = 3998;

  let dispatcherToken;
  let driverToken;

  before(async () => {
    const serverInstance = createFleetBusServer({ authMode: 'on' });
    appServer = serverInstance.server;
    services = serverInstance.services;
    managerService = serverInstance.services.managerService;
    driverService = serverInstance.services.driverService;

    await new Promise((resolve) => {
      appServer.listen(TEST_PORT, () => {
        baseUrl = `http://127.0.0.1:${TEST_PORT}`;
        resolve();
      });
    });

    // Login dispatcher (SAOMAI)
    const totp = generateTotp(DEV_TOTP_SECRET, Date.now() + 90000);
    const mgrRes = await fetch(`${baseUrl}/api/v1/ops/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-app-version': '3.0.0' },
      body: JSON.stringify({ username: 'dispatcher@busgo.vn', password: 'disp123', totp })
    }).then(r => r.json());
    dispatcherToken = mgrRes.data.token;

    // Login driver TX8821 (SAOMAI)
    const drvRes = await fetch(`${baseUrl}/api/v1/driver/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-app-version': '3.0.0', 'x-tenant-id': 'op_saomai' },
      body: JSON.stringify({ staff_id: 'TX8821', pin: '123456' })
    }).then(r => r.json());
    driverToken = drvRes.data.token;
  });

  after(async () => {
    if (appServer) {
      await new Promise(resolve => appServer.close(resolve));
    }
  });

  const request = async (path, method = 'GET', body = null, token = null, headers = {}) => {
    const reqHeaders = { 'Content-Type': 'application/json', 'x-app-version': '3.0.0', ...headers };
    if (token) reqHeaders.Authorization = `Bearer ${token}`;
    if (method === 'POST' || method === 'PUT') reqHeaders['Idempotency-Key'] = crypto.randomUUID();

    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: reqHeaders,
      body: body ? JSON.stringify(body) : undefined
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };

  it('1. dispatcher@busgo.vn creates a hotline hold on trp_hn_th_01 for seat A05 pickup stp_nb; driver sees it in manifest; ops held_seats +1 and booked_seats unchanged', async () => {
    // Check initial ops trip
    const opsTripRes = await request('/api/v1/ops/trips/trp_hn_th_01', 'GET', null, dispatcherToken, { 'x-tenant-id': 'op_saomai' });
    assert.strictEqual(opsTripRes.status, 200);
    const initialHeld = opsTripRes.body.data.held_seats || 0;
    const initialBooked = opsTripRes.body.data.booked_seats || 0;

    // Dispatcher creates hold
    const holdRes = await request('/api/v1/ops/pos/hotline-hold', 'POST', {
      trip_id: 'trp_hn_th_01',
      seat_codes: ['A05'],
      pickup_stop_id: 'stp_nb',
      dropoff_stop_id: 'stp_th_pb',
      phone: '0987654321',
      passenger_name: 'Nguyen Van A'
    }, dispatcherToken, { 'x-tenant-id': 'op_saomai' });

    assert.ok([200, 201].includes(holdRes.status), 'DISPATCHER must be able to create hotline hold');
    assert.strictEqual(holdRes.body.status, 'success');

    // Driver fetches trip manifest
    const manifestRes = await request('/api/v1/driver/trips/trp_hn_th_01', 'GET', null, driverToken);
    assert.strictEqual(manifestRes.status, 200);

    const passenger = manifestRes.body.data.manifest.find(p => p.seat_code === 'A05');
    assert.ok(passenger, 'Held passenger should be in manifest');
    assert.strictEqual(passenger.source, 'HOTLINE');
    assert.strictEqual(passenger.boarding_status, 'ISSUED');
    assert.strictEqual(passenger.payment_method, 'COD');
    assert.strictEqual(passenger.pnr, holdRes.body.data.pnr);
    assert.strictEqual(passenger.pickup_stop_id, 'stp_nb');
    assert.strictEqual(passenger.ticket_id, `hl_${holdRes.body.data.reservation_id}_A05`);

    // Ops trip should show held_seats +1, booked_seats unchanged
    const afterOpsTripRes = await request('/api/v1/ops/trips/trp_hn_th_01', 'GET', null, dispatcherToken, { 'x-tenant-id': 'op_saomai' });
    assert.strictEqual(afterOpsTripRes.body.data.held_seats, initialHeld + 1);
    assert.strictEqual(afterOpsTripRes.body.data.booked_seats, initialBooked);
  });

  it('2. DISPATCHER can GET /ops/audit-logs (own company only)', async () => {
    const auditRes = await request('/api/v1/ops/audit-logs', 'GET', null, dispatcherToken, { 'x-tenant-id': 'op_saomai' });
    assert.strictEqual(auditRes.status, 200, 'DISPATCHER should have access to audit logs');
    assert.strictEqual(auditRes.body.status, 'success');
    assert.ok(Array.isArray(auditRes.body.data.audit_logs));
    for (const log of auditRes.body.data.audit_logs) {
      assert.strictEqual(log.operator_id, 'op_saomai');
    }
  });

  it('3. Driver starts trip, arrives Giáp Bát, boards passenger for Ninh Bình, and leaves; far beyond 15m hold is still HELD; another hold passed without boarding is NO_SHOW_RELEASED; COD collected at Ninh Bình converts hold', async () => {
    // Create second hold on seat B01 with pickup at Giáp Bát (stp_hn_gb)
    const holdB01Res = await request('/api/v1/ops/pos/hotline-hold', 'POST', {
      trip_id: 'trp_hn_th_01',
      seat_codes: ['B01'],
      pickup_stop_id: 'stp_hn_gb',
      phone: '0987654322',
      passenger_name: 'Nguyen Van B'
    }, dispatcherToken, { 'x-tenant-id': 'op_saomai' });
    assert.ok([200, 201].includes(holdB01Res.status));

    // Add a passenger to be boarded at Giáp Bát with drop-off at Ninh Bình (stp_nb)
    const driverTrip = driverService.activeTrips.get('trp_hn_th_01');
    driverTrip.manifest.push({
      ticket_id: 'tkt_gb_nb_99',
      pnr: 'BG-GBNB99',
      passenger_name: 'Khach Xuong Ninh Binh',
      passenger_phone: '0977112233',
      seat_code: 'A01',
      pickup_stop_id: 'stp_hn_gb',
      dropoff_stop_id: 'stp_nb',
      boarding_status: 'ISSUED',
      payment_method: 'VNPAY_ONLINE',
      cod_amount_vnd: 0,
      boarded_at: null
    });

    // Driver starts trip
    const startRes = await request('/api/v1/driver/trips/trp_hn_th_01/start', 'POST', {}, driverToken);
    assert.strictEqual(startRes.status, 200);

    // Driver arrives Giáp Bát (stp_hn_gb)
    const arrGbRes = await request('/api/v1/driver/trips/trp_hn_th_01/stops/stp_hn_gb/arrive', 'POST', {}, driverToken);
    assert.strictEqual(arrGbRes.status, 200);

    // Board the passenger for Ninh Bình manually at Giáp Bát
    const boardRes = await request('/api/v1/driver/trips/trp_hn_th_01/boarding/manual', 'POST', {
      ticket_id: 'tkt_gb_nb_99'
    }, driverToken);
    assert.strictEqual(boardRes.status, 200);
    assert.strictEqual(boardRes.body.data.boarding_status, 'BOARDED');

    // Driver leaves Giáp Bát: mockNow far beyond the 15-min fallback (e.g. +2 hours)
    const futureTime = Date.now() + 2 * 60 * 60 * 1000;
    managerService.releaseExpiredHotlineHolds(futureTime);

    // The hold for A05 (pickup stp_nb) is still HELD (trip started, pickup not reached)
    const rsvA05 = managerService.hotlineReservations.find(r => r.seat_codes.includes('A05') && r.trip_id === 'trp_hn_th_01');
    assert.strictEqual(rsvA05.hold_status, 'HELD_HOTLINE');

    // Ops trip before arriving Ninh Bình
    const opsBeforeNb = await request('/api/v1/ops/trips/trp_hn_th_01', 'GET', null, dispatcherToken, { 'x-tenant-id': 'op_saomai' });
    const heldBeforeNb = opsBeforeNb.body.data.held_seats;
    const bookedBeforeNb = opsBeforeNb.body.data.booked_seats;

    // Driver arrives at Ninh Bình (stp_nb)
    const arrNbRes = await request('/api/v1/driver/trips/trp_hn_th_01/stops/stp_nb/arrive', 'POST', {}, driverToken);
    assert.strictEqual(arrNbRes.status, 200);

    // Hold B01 whose pickup stop (Giáp Bát) was passed without boarding is now NO_SHOW_RELEASED
    const rsvB01 = managerService.hotlineReservations.find(r => r.seat_codes.includes('B01') && r.trip_id === 'trp_hn_th_01');
    assert.strictEqual(rsvB01.hold_status, 'NO_SHOW_RELEASED');

    // Manifest after arriving Ninh Bình: B01 should be gone
    const manifestNbRes = await request('/api/v1/driver/trips/trp_hn_th_01', 'GET', null, driverToken);
    assert.strictEqual(manifestNbRes.body.data.manifest.some(p => p.seat_code === 'B01'), false);

    // At Ninh Bình, driver collects COD for A05
    const tktA05 = manifestNbRes.body.data.manifest.find(p => p.seat_code === 'A05');
    assert.ok(tktA05, 'A05 COD ticket should be present in manifest');

    const codRes = await request('/api/v1/driver/trips/trp_hn_th_01/collect-cod', 'POST', {
      ticket_id: tktA05.ticket_id,
      amount_collected_vnd: tktA05.cod_amount_vnd || 220000
    }, driverToken);
    assert.strictEqual(codRes.status, 200);

    // Reservation A05 is CONVERTED
    assert.strictEqual(rsvA05.hold_status, 'CONVERTED');

    // Ops trip: booked_seats +1, held_seats decremented
    const opsAfterCod = await request('/api/v1/ops/trips/trp_hn_th_01', 'GET', null, dispatcherToken, { 'x-tenant-id': 'op_saomai' });
    assert.strictEqual(opsAfterCod.body.data.booked_seats, bookedBeforeNb + 1);
    // heldBeforeNb had A05 and B01; B01 was released (-1) and A05 converted (-1)
    assert.strictEqual(opsAfterCod.body.data.held_seats, heldBeforeNb - 2);
  });

  it('4. Hail sale increments ops boarded_passengers', async () => {
    const opsBeforeHail = await request('/api/v1/ops/trips/trp_hn_th_01', 'GET', null, dispatcherToken, { 'x-tenant-id': 'op_saomai' });
    const initialBoarded = opsBeforeHail.body.data.boarded_passengers || 0;

    // Hail sale at current stop (stp_nb) to next stop (stp_th_pb)
    const hailRes = await request('/api/v1/driver/trips/trp_hn_th_01/onboard-hail', 'POST', {
      seat_code: 'A07',
      amount_collected_vnd: 220000,
      dropoff_stop_id: 'stp_th_pb'
    }, driverToken);
    assert.strictEqual(hailRes.status, 201);

    const opsAfterHail = await request('/api/v1/ops/trips/trp_hn_th_01', 'GET', null, dispatcherToken, { 'x-tenant-id': 'op_saomai' });
    assert.strictEqual(opsAfterHail.body.data.boarded_passengers, initialBoarded + 1);
  });

  it('5. Passenger boarded at Giáp Bát with drop-off Ninh Bình has alighted_at set, on_board_count decreased by 1; arriving again does not change it', async () => {
    const trip = driverService.activeTrips.get('trp_hn_th_01');
    const passenger = trip.manifest.find(p => p.ticket_id === 'tkt_gb_nb_99');
    assert.ok(passenger, 'Passenger boarded earlier must exist in manifest');

    // alighted_at was set when arriving at Ninh Bình
    assert.ok(passenger.alighted_at, 'alighted_at ISO timestamp must be set');
    assert.strictEqual(passenger.boarding_status, 'BOARDED', 'boarding_status must not change');

    const manifestRes1 = await request('/api/v1/driver/trips/trp_hn_th_01', 'GET', null, driverToken);
    const onBoard1 = manifestRes1.body.data.on_board_count;
    const alightedCount1 = trip.alighted_count;

    // Arriving at Ninh Bình AGAIN must not alight twice
    const arriveAgainRes = await request('/api/v1/driver/trips/trp_hn_th_01/stops/stp_nb/arrive', 'POST', {}, driverToken);
    assert.strictEqual(arriveAgainRes.status, 200);

    assert.strictEqual(trip.alighted_count, alightedCount1, 'alighted_count must not increase on second arrival');

    const manifestRes2 = await request('/api/v1/driver/trips/trp_hn_th_01', 'GET', null, driverToken);
    assert.strictEqual(manifestRes2.body.data.on_board_count, onBoard1, 'on_board_count must not change on duplicate arrival');
  });

  it('6. Hotline hold total and driver manifest COD amount equal trip fare when it differs from route fare', async () => {
    const today = serviceCalendar().today;
    const runTripId = runId('trp_hn_th_02', today);

    // Route rt_hn_th base fare is 220000, but catalog trip fare is 180000
    const route = services.managerService.routes.find(r => r.route_id === 'rt_hn_th');
    assert.strictEqual(route.base_fare_vnd, 220000);

    const tripDetail = services.searchService.getTripDetail(runTripId);
    assert.strictEqual(tripDetail.data.base_fare_vnd, 180000);

    // Online seat map prices seats at the trip catalog fare (180.000 đ)
    const seatMapRes = await request(`/api/v1/trips/${runTripId}/seat-map`, 'GET');
    assert.strictEqual(seatMapRes.status, 200);
    const seatB02 = seatMapRes.body.data.seats.find(s => s.seat_code === 'B02');
    assert.strictEqual(seatB02.price_vnd, 180000, 'Online seat price must equal catalog trip fare (180.000 đ)');

    // Assign run to driver drv_8821a so driver manifest exists
    const assignRes = await request(`/api/v1/ops/trips/${runTripId}/assign`, 'POST', {
      vehicleId: 'veh_02',
      driverId: 'drv_8821a'
    }, dispatcherToken, { 'x-tenant-id': 'op_saomai' });
    assert.strictEqual(assignRes.status, 200, JSON.stringify(assignRes.body));

    // Create hotline hold on runTripId
    const holdRes = await request('/api/v1/ops/pos/hotline-hold', 'POST', {
      trip_id: runTripId,
      seat_codes: ['B02'],
      pickup_stop_id: 'stp_hn_my_dinh',
      dropoff_stop_id: 'stp_th_pb',
      phone: '0987654399',
      passenger_name: 'Nguyen Van Gia Ve'
    }, dispatcherToken, { 'x-tenant-id': 'op_saomai' });

    assert.ok([200, 201].includes(holdRes.status), JSON.stringify(holdRes.body));
    assert.strictEqual(holdRes.body.data.total_fare_vnd, 180000, 'Hotline hold total must equal trip fare (180.000 đ), not route fare (220.000 đ)');

    // Driver fetches trip manifest
    const manifestRes = await request(`/api/v1/driver/trips/${runTripId}`, 'GET', null, driverToken);
    assert.strictEqual(manifestRes.status, 200, JSON.stringify(manifestRes.body));
    const passenger = manifestRes.body.data.manifest.find(p => p.seat_code === 'B02');
    assert.ok(passenger, 'Held passenger should be on driver manifest');
    assert.strictEqual(passenger.cod_amount_vnd, 180000, 'Driver manifest COD amount must equal trip fare (180.000 đ)');
  });
});
