import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { createFleetBusServer } from '../../source/server/apiServer.js';
import { generateTotp } from '../../source/server/core/totp.js';
import { DEV_TOTP_SECRET } from '../../source/server/config.js';
import { addDays, vnDate } from '../../source/server/core/serviceDate.js';

describe('Route & Station Builder: Newly onboarded operator creates stations, routes, and sells trips', () => {
  let server;
  let services;
  let baseUrl;
  let rootToken;

  const totp = (secret = DEV_TOTP_SECRET) => generateTotp(secret, Date.now());

  const request = async (path, { method = 'GET', body, token, operatorCode, headers = {} } = {}) => {
    const h = { 'Content-Type': 'application/json', ...headers };
    if (token) h.Authorization = `Bearer ${token}`;
    if (operatorCode) h['X-Operator-Code'] = operatorCode;
    if (method === 'POST') h['Idempotency-Key'] = crypto.randomUUID();
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: h,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not json */ }
    return { status: res.status, body: json, text };
  };

  const loginStaff = async (username, password, code = null) => {
    const payload = { username, password };
    if (code) payload.totp = code;
    return request('/api/v1/ops/auth/login', { method: 'POST', body: payload });
  };

  const completeDirectorAuth = async (email, tempPassword) => {
    // 1. Initial login
    const loginRes = await loginStaff(email, tempPassword);
    assert.strictEqual(loginRes.status, 200);
    let token = loginRes.body.data.token;

    // 2. Change password
    const newPassword = 'DirectorSecret123!';
    const changeRes = await request('/api/v1/ops/auth/change-password', {
      method: 'POST',
      token,
      body: { current_password: tempPassword, new_password: newPassword }
    });
    assert.strictEqual(changeRes.status, 200);
    token = changeRes.body.data.token;

    // 3. TOTP enrollment
    const setupRes = await request('/api/v1/ops/auth/totp/setup', { method: 'POST', token });
    assert.strictEqual(setupRes.status, 200);
    const { secret } = setupRes.body.data;
    const confirmRes = await request('/api/v1/ops/auth/totp/confirm', {
      method: 'POST',
      token,
      body: { code: generateTotp(secret) }
    });
    assert.strictEqual(confirmRes.status, 200);

    return { token, email, password: newPassword, totpSecret: secret };
  };

  before(async () => {
    ({ server, services } = createFleetBusServer({ authMode: 'enforce', dataDir: null }));
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    // Login as platform admin root
    const rootRes = await loginStaff('root@busgo.vn', 'root123', totp());
    assert.strictEqual(rootRes.status, 200, JSON.stringify(rootRes.body));
    rootToken = rootRes.body.data.token;
  });

  after(() => new Promise(resolve => server.close(resolve)));

  let opA;
  let opB;
  let directorA;
  let directorB;
  let dispatcherA;
  let cashierA;
  let stationA1;
  let stationA2;
  let createdRouteA;

  it('Step 1: Onboard two companies via platform admin API', async () => {
    const resA = await request('/api/v1/platform/operators', {
      method: 'POST',
      token: rootToken,
      body: {
        code: 'PHUONGNAM',
        name: 'Nhà xe Phương Nam Express',
        director_name: 'Nguyễn Phương Nam',
        director_email: 'director@phuongnam.vn',
        bank: { bin: '970422', bank_name: 'MB Bank', account_number: '1234567890', account_name: 'NHA XE PHUONG NAM' }
      }
    });
    assert.strictEqual(resA.status, 201, JSON.stringify(resA.body));
    opA = resA.body.data;
    assert.strictEqual(opA.operator_id, 'op_phuongnam');

    const resB = await request('/api/v1/platform/operators', {
      method: 'POST',
      token: rootToken,
      body: {
        code: 'HAIDANG',
        name: 'Nhà xe Hải Đăng',
        director_name: 'Trần Hải Đăng',
        director_email: 'director@haidang.vn',
        bank: { bin: '970407', bank_name: 'Techcombank', account_number: '9876543210', account_name: 'NHA XE HAI DANG' }
      }
    });
    assert.strictEqual(resB.status, 201);
    opB = resB.body.data;
    assert.strictEqual(opB.operator_id, 'op_haidang');

    // Director logins with password change & TOTP
    directorA = await completeDirectorAuth('director@phuongnam.vn', opA.temporary_password);
    directorB = await completeDirectorAuth('director@haidang.vn', opB.temporary_password);
  });

  it('Step 2: Director A creates Dispatcher and Cashier accounts; verifies permissions', async () => {
    // Create dispatcher
    const dispCreate = await request('/api/v1/ops/staff', {
      method: 'POST',
      token: directorA.token,
      body: { username: 'dieu_phoi@phuongnam.vn', full_name: 'Lê Điều Phối', role: 'DISPATCHER' }
    });
    assert.strictEqual(dispCreate.status, 201);
    const dispTemp = dispCreate.body.data.temporary_password;

    // Dispatcher login & change password
    const dispLogin = await loginStaff('dieu_phoi@phuongnam.vn', dispTemp);
    const dispChange = await request('/api/v1/ops/auth/change-password', {
      method: 'POST',
      token: dispLogin.body.data.token,
      body: { current_password: dispTemp, new_password: 'DispatcherPass123!' }
    });
    dispatcherA = { token: dispChange.body.data.token };

    // Create cashier
    const cashCreate = await request('/api/v1/ops/staff', {
      method: 'POST',
      token: directorA.token,
      body: { username: 'thu_ngan@phuongnam.vn', full_name: 'Trần Thu Ngân', role: 'CASHIER' }
    });
    assert.strictEqual(cashCreate.status, 201);
    const cashTemp = cashCreate.body.data.temporary_password;

    // Cashier login & change password
    const cashLogin = await loginStaff('thu_ngan@phuongnam.vn', cashTemp);
    const cashChange = await request('/api/v1/ops/auth/change-password', {
      method: 'POST',
      token: cashLogin.body.data.token,
      body: { current_password: cashTemp, new_password: 'CashierPass123!' }
    });
    cashierA = { token: cashChange.body.data.token };

    // Permission check: Cashier 403 on stations & routes
    const cashGetStations = await request('/api/v1/ops/stations', { token: cashierA.token });
    assert.strictEqual(cashGetStations.status, 403);
    assert.strictEqual(cashGetStations.body.code, 'FORBIDDEN');

    const cashPostStation = await request('/api/v1/ops/stations', {
      method: 'POST',
      token: cashierA.token,
      body: { name: 'Bến Thử', city: 'Sài Gòn', lat: 10.8, lng: 106.8, kind: 'STATION' }
    });
    assert.strictEqual(cashPostStation.status, 403);

    const cashPostRoute = await request('/api/v1/ops/routes', {
      method: 'POST',
      token: cashierA.token,
      body: { name: 'Tuyến Thử', stops: [] }
    });
    assert.strictEqual(cashPostRoute.status, 403);

    // Permission check: Dispatcher is allowed to view stations
    const dispGetStations = await request('/api/v1/ops/stations', { token: dispatcherA.token });
    assert.strictEqual(dispGetStations.status, 200);
  });

  it('Step 3: Station validation and creation for company A', async () => {
    // Validation: name < 3 chars -> 400
    const shortName = await request('/api/v1/ops/stations', {
      method: 'POST',
      token: directorA.token,
      body: { name: 'Bx', city: 'TP. Hồ Chí Minh', lat: 10.8756, lng: 106.8228, kind: 'STATION' }
    });
    assert.strictEqual(shortName.status, 400);
    assert.strictEqual(shortName.body.code, 'VALIDATION_ERROR');

    // Validation: missing city -> 400
    const noCity = await request('/api/v1/ops/stations', {
      method: 'POST',
      token: directorA.token,
      body: { name: 'Bến xe Miền Đông Mới', city: '', lat: 10.8756, lng: 106.8228, kind: 'STATION' }
    });
    assert.strictEqual(noCity.status, 400);

    // Validation: lat/lng outside Vietnam -> 400
    const badCoords = await request('/api/v1/ops/stations', {
      method: 'POST',
      token: directorA.token,
      body: { name: 'Bến xe Miền Đông Mới', city: 'TP. Hồ Chí Minh', lat: 35.0, lng: 106.8, kind: 'STATION' }
    });
    assert.strictEqual(badCoords.status, 400);

    // Validation: invalid kind -> 400
    const badKind = await request('/api/v1/ops/stations', {
      method: 'POST',
      token: directorA.token,
      body: { name: 'Bến xe Miền Đông Mới', city: 'TP. Hồ Chí Minh', lat: 10.8756, lng: 106.8228, kind: 'AIRPORT' }
    });
    assert.strictEqual(badKind.status, 400);

    // Create Station 1 (by Dispatcher to verify dispatcher permission)
    const st1Res = await request('/api/v1/ops/stations', {
      method: 'POST',
      token: dispatcherA.token,
      body: {
        name: 'Bến xe Miền Đông Mới',
        city: 'TP. Hồ Chí Minh',
        address: '501 Hoàng Hữu Nam, Long Bình, TP. Thủ Đức',
        lat: 10.8756,
        lng: 106.8228,
        kind: 'STATION'
      }
    });
    assert.strictEqual(st1Res.status, 201, JSON.stringify(st1Res.body));
    stationA1 = st1Res.body.data;
    assert.ok(stationA1.station_id.startsWith('stp_phuongnam_'));
    assert.strictEqual(stationA1.name, 'Bến xe Miền Đông Mới');
    assert.strictEqual(stationA1.city, 'TP. Hồ Chí Minh');
    assert.deepStrictEqual(stationA1.operator_ids, ['op_phuongnam']);

    // Duplicate station name in same city for Company A -> 409
    const dupRes = await request('/api/v1/ops/stations', {
      method: 'POST',
      token: directorA.token,
      body: {
        name: 'Bến xe Miền Đông Mới',
        city: 'TP. Hồ Chí Minh',
        lat: 10.875,
        lng: 106.82,
        kind: 'STATION'
      }
    });
    assert.strictEqual(dupRes.status, 409);
    assert.strictEqual(dupRes.body.code, 'STATION_EXISTS');

    // Create Station 2 (by Director)
    const st2Res = await request('/api/v1/ops/stations', {
      method: 'POST',
      token: directorA.token,
      body: {
        name: 'Bến xe Liên tỉnh Đà Lạt',
        city: 'Lâm Đồng',
        address: '01 Tô Hiến Thành, Phường 3, TP. Đà Lạt',
        lat: 11.9254,
        lng: 108.4452,
        kind: 'STATION'
      }
    });
    assert.strictEqual(st2Res.status, 201);
    stationA2 = st2Res.body.data;
    assert.ok(stationA2.station_id.startsWith('stp_phuongnam_'));

    // Company A stations list
    const listA = await request('/api/v1/ops/stations', { token: directorA.token });
    assert.strictEqual(listA.status, 200);
    const ids = listA.body.data.map(s => s.station_id);
    assert.ok(ids.includes(stationA1.station_id));
    assert.ok(ids.includes(stationA2.station_id));

    // Audit verification for STATION_CREATE
    const auditEntries = services.managerService.auditLog.filter(a => a.operator_id === 'op_phuongnam' && a.action === 'STATION_CREATE');
    assert.ok(auditEntries.length >= 2);
  });

  it('Step 4: Isolation check — Company B cannot use Company A stations', async () => {
    // Company B has not created any station yet; list should not contain Company A's exclusive stations
    const listB = await request('/api/v1/ops/stations', { token: directorB.token });
    assert.strictEqual(listB.status, 200);
    const idsB = listB.body.data.map(s => s.station_id);
    assert.ok(!idsB.includes(stationA1.station_id), 'Company B must not have Station A1');
    assert.ok(!idsB.includes(stationA2.station_id), 'Company B must not have Station A2');

    // Company B creates its own station in Da Lat
    const stBRes = await request('/api/v1/ops/stations', {
      method: 'POST',
      token: directorB.token,
      body: {
        name: 'Bến xe Khách Đà Lạt',
        city: 'Lâm Đồng',
        lat: 11.93,
        lng: 108.44,
        kind: 'STATION'
      }
    });
    assert.strictEqual(stBRes.status, 201);
    const stationB1 = stBRes.body.data;

    // Company B tries to create a route using Company A's station -> 400
    const routeBRes = await request('/api/v1/ops/routes', {
      method: 'POST',
      token: directorB.token,
      body: {
        name: 'Đà Lạt — Sài Gòn',
        stops: [
          { stop_id: stationB1.station_id, pickup_allowed: true, dropoff_allowed: false },
          { stop_id: stationA1.station_id, pickup_allowed: false, dropoff_allowed: true }
        ],
        schedule: {
          departure: '08:00',
          duration_minutes: 360,
          base_fare_vnd: 250000,
          vehicle_type: 'DOUBLE_DECK_VIP_CABIN',
          total_seats: 22
        }
      }
    });
    assert.strictEqual(routeBRes.status, 400);
    assert.strictEqual(routeBRes.body.code, 'VALIDATION_ERROR');
    assert.ok(routeBRes.body.message.includes(stationA1.station_id));
  });

  it('Step 5: Route creation validation errors for company A', async () => {
    const validSchedule = {
      departure: '08:00',
      duration_minutes: 360,
      base_fare_vnd: 280000,
      vehicle_type: 'DOUBLE_DECK_VIP_CABIN',
      total_seats: 22
    };

    // Unknown station
    const unkRes = await request('/api/v1/ops/routes', {
      method: 'POST',
      token: directorA.token,
      body: {
        name: 'Sài Gòn — Đà Lạt',
        stops: [
          { stop_id: 'stp_fake_station_999', pickup_allowed: true, dropoff_allowed: false },
          { stop_id: stationA2.station_id, pickup_allowed: false, dropoff_allowed: true }
        ],
        schedule: validSchedule
      }
    });
    assert.strictEqual(unkRes.status, 400);
    assert.strictEqual(unkRes.body.code, 'VALIDATION_ERROR');

    // Only one stop
    const oneStop = await request('/api/v1/ops/routes', {
      method: 'POST',
      token: directorA.token,
      body: {
        name: 'Sài Gòn — Đà Lạt',
        stops: [{ stop_id: stationA1.station_id, pickup_allowed: true, dropoff_allowed: true }],
        schedule: validSchedule
      }
    });
    assert.strictEqual(oneStop.status, 400);

    // Duplicate stops
    const dupStops = await request('/api/v1/ops/routes', {
      method: 'POST',
      token: directorA.token,
      body: {
        name: 'Sài Gòn — Đà Lạt',
        stops: [
          { stop_id: stationA1.station_id, pickup_allowed: true, dropoff_allowed: false },
          { stop_id: stationA1.station_id, pickup_allowed: false, dropoff_allowed: true }
        ],
        schedule: validSchedule
      }
    });
    assert.strictEqual(dupStops.status, 400);

    // First stop without pickup
    const noFirstPickup = await request('/api/v1/ops/routes', {
      method: 'POST',
      token: directorA.token,
      body: {
        name: 'Sài Gòn — Đà Lạt',
        stops: [
          { stop_id: stationA1.station_id, pickup_allowed: false, dropoff_allowed: true },
          { stop_id: stationA2.station_id, pickup_allowed: false, dropoff_allowed: true }
        ],
        schedule: validSchedule
      }
    });
    assert.strictEqual(noFirstPickup.status, 400);

    // Last stop without dropoff
    const noLastDropoff = await request('/api/v1/ops/routes', {
      method: 'POST',
      token: directorA.token,
      body: {
        name: 'Sài Gòn — Đà Lạt',
        stops: [
          { stop_id: stationA1.station_id, pickup_allowed: true, dropoff_allowed: false },
          { stop_id: stationA2.station_id, pickup_allowed: true, dropoff_allowed: false }
        ],
        schedule: validSchedule
      }
    });
    assert.strictEqual(noLastDropoff.status, 400);

    // Bad vehicle type
    const badVehicle = await request('/api/v1/ops/routes', {
      method: 'POST',
      token: directorA.token,
      body: {
        name: 'Sài Gòn — Đà Lạt',
        stops: [
          { stop_id: stationA1.station_id, pickup_allowed: true, dropoff_allowed: false },
          { stop_id: stationA2.station_id, pickup_allowed: false, dropoff_allowed: true }
        ],
        schedule: { ...validSchedule, vehicle_type: 'AIRPLANE_BOEING_737' }
      }
    });
    assert.strictEqual(badVehicle.status, 400);
    assert.strictEqual(badVehicle.body.code, 'VALIDATION_ERROR');
  });

  it('Step 6: Company A successfully creates its first route with its initial schedule', async () => {
    // Create route (by Dispatcher to verify dispatcher permission)
    const createRes = await request('/api/v1/ops/routes', {
      method: 'POST',
      token: dispatcherA.token,
      body: {
        name: 'Sài Gòn — Đà Lạt (Cao tốc)',
        distance_km: 310,
        stops: [
          { stop_id: stationA1.station_id, pickup_allowed: true, dropoff_allowed: false },
          { stop_id: stationA2.station_id, pickup_allowed: false, dropoff_allowed: true }
        ],
        schedule: {
          departure: '07:30',
          duration_minutes: 360,
          base_fare_vnd: 280000,
          vehicle_type: 'DOUBLE_DECK_VIP_CABIN',
          total_seats: 22,
          days_of_week: [1, 2, 3, 4, 5, 6, 7]
        }
      }
    });
    assert.strictEqual(createRes.status, 201, JSON.stringify(createRes.body));
    createdRouteA = createRes.body.data;
    assert.ok(createdRouteA.route_id.startsWith('rt_phuongnam_'));
    assert.strictEqual(createdRouteA.name, 'Sài Gòn — Đà Lạt (Cao tốc)');
    assert.strictEqual(createdRouteA.stops_count, 2);
    assert.strictEqual(createdRouteA.active, true);
    assert.ok(createdRouteA.schedule_id.startsWith('sch_'));
    assert.strictEqual(createdRouteA.schedule.departure, '07:30');
    assert.strictEqual(createdRouteA.schedule.total_seats, 22);

    // GET /api/v1/ops/routes lists the newly created route
    const routesRes = await request('/api/v1/ops/routes', { token: directorA.token });
    assert.strictEqual(routesRes.status, 200);
    assert.ok(routesRes.body.data.some(r => r.route_id === createdRouteA.route_id));

    // GET /api/v1/ops/schedules lists the new schedule under this route
    const schedRes = await request('/api/v1/ops/schedules', { token: directorA.token });
    assert.strictEqual(schedRes.status, 200);
    assert.ok(schedRes.body.data.routes.some(r => r.route_id === createdRouteA.route_id));
    assert.ok(schedRes.body.data.schedules.some(s => s.schedule_id === createdRouteA.schedule_id));

    // Audit check for ROUTE_CREATE
    const routeAudit = services.managerService.auditLog.find(a => a.operator_id === 'op_phuongnam' && a.action === 'ROUTE_CREATE');
    assert.ok(routeAudit, 'ROUTE_CREATE was recorded');
    assert.strictEqual(routeAudit.resource, createdRouteA.route_id);
  });

  it('Step 7: Adding additional schedule on the new route via POST /api/v1/ops/schedules works', async () => {
    // Add an extra run on a saleable day in the booking window
    const today = vnDate();
    const extraDay = addDays(today, 3);
    const extraRes = await request('/api/v1/ops/schedules', {
      method: 'POST',
      token: dispatcherA.token,
      body: {
        route_id: createdRouteA.route_id,
        departure: '22:00',
        extra_date: extraDay,
        duration_minutes: 360,
        base_fare_vnd: 300000
      }
    });
    assert.strictEqual(extraRes.status, 201, JSON.stringify(extraRes.body));
    const extraSchedule = extraRes.body.data;
    assert.strictEqual(extraSchedule.departure, '22:00');
    assert.strictEqual(extraSchedule.extra, true);
    assert.strictEqual(extraSchedule.valid_from, extraDay);
  });

  it('Step 8: Passenger can discover stations and search/view trips of the new company', async () => {
    // 1. Passenger station list includes the new company's stations
    const stationsRes = await request('/api/v1/passenger/stations', { operatorCode: 'PHUONGNAM' });
    assert.strictEqual(stationsRes.status, 200);
    const stationIds = stationsRes.body.data.map(s => s.station_id);
    assert.ok(stationIds.includes(stationA1.station_id), 'Passenger stations list includes Station A1');
    assert.ok(stationIds.includes(stationA2.station_id), 'Passenger stations list includes Station A2');

    // Query search for station by keyword
    const searchStationRes = await request('/api/v1/passenger/stations?q=Đà%20Lạt', { operatorCode: 'PHUONGNAM' });
    assert.strictEqual(searchStationRes.status, 200);
    assert.ok(searchStationRes.body.data.some(s => s.station_id === stationA2.station_id));

    // 2. Search trips without date (catalog search across templates)
    const tripSearchRes = await request(
      `/api/v1/trips/search?origin=${encodeURIComponent('TP. Hồ Chí Minh')}&destination=${encodeURIComponent('Lâm Đồng')}`,
      { operatorCode: 'PHUONGNAM' }
    );
    assert.strictEqual(tripSearchRes.status, 200);
    assert.ok(tripSearchRes.body.data.length >= 1, 'Trips found for newly created route');
    const firstTrip = tripSearchRes.body.data[0];
    assert.strictEqual(firstTrip.route_id, createdRouteA.route_id);
    assert.strictEqual(firstTrip.available_seats_count, 22);

    // 3. Search trips on the sale day with extra run
    const today = vnDate();
    const extraDay = addDays(today, 3);
    const dateSearchRes = await request(
      `/api/v1/trips/search?origin=${encodeURIComponent('TP. Hồ Chí Minh')}&destination=${encodeURIComponent('Lâm Đồng')}&date=${extraDay}`,
      { operatorCode: 'PHUONGNAM' }
    );
    assert.strictEqual(dateSearchRes.status, 200);
    const tripsOnSale = dateSearchRes.body.data;
    assert.ok(tripsOnSale.length >= 1, 'Trip on sale found');
    const onSaleTrip = tripsOnSale.find(t => t.departure_time.includes('22:00'));
    assert.ok(onSaleTrip, 'The extra run departure is returned on its day');
    assert.strictEqual(onSaleTrip.base_fare_vnd, 300000);
    assert.strictEqual(onSaleTrip.stops.length, 2);
    // Stops have coordinates and straight line road shape is not crashing
    assert.strictEqual(typeof onSaleTrip.stops[0].lat, 'number');
    assert.strictEqual(typeof onSaleTrip.stops[0].lng, 'number');
    assert.strictEqual(typeof onSaleTrip.stops[1].lat, 'number');
    assert.strictEqual(typeof onSaleTrip.stops[1].lng, 'number');
    assert.ok(Array.isArray(onSaleTrip.route_shape), 'Route shape polyline is populated');
  });

  it('Step 9: PATCH /api/v1/ops/routes/:routeId renames and closes route; verify sales suspended', async () => {
    // Rename route
    const renameRes = await request(`/api/v1/ops/routes/${createdRouteA.route_id}`, {
      method: 'PATCH',
      token: directorA.token,
      body: { name: 'Sài Gòn — Đà Lạt Limousine VIP' }
    });
    assert.strictEqual(renameRes.status, 200);
    assert.strictEqual(renameRes.body.data.name, 'Sài Gòn — Đà Lạt Limousine VIP');

    // Close route (active: false)
    const closeRes = await request(`/api/v1/ops/routes/${createdRouteA.route_id}`, {
      method: 'PATCH',
      token: directorA.token,
      body: { active: false }
    });
    assert.strictEqual(closeRes.status, 200);
    assert.strictEqual(closeRes.body.data.active, false);

    // New schedule creation on closed route is refused (409 ROUTE_CLOSED)
    const postSchedClosed = await request('/api/v1/ops/schedules', {
      method: 'POST',
      token: dispatcherA.token,
      body: {
        route_id: createdRouteA.route_id,
        departure: '15:00',
        days_of_week: [1, 2, 3, 4, 5],
        base_fare_vnd: 280000
      }
    });
    assert.strictEqual(postSchedClosed.status, 409);
    assert.strictEqual(postSchedClosed.body.code, 'ROUTE_CLOSED');

    // Passenger search on closed route returns no bookable trips (sales suspended)
    const today = vnDate();
    const extraDay = addDays(today, 3);
    const searchClosedRes = await request(
      `/api/v1/trips/search?origin=${encodeURIComponent('TP. Hồ Chí Minh')}&destination=${encodeURIComponent('Lâm Đồng')}&date=${extraDay}`,
      { operatorCode: 'PHUONGNAM' }
    );
    assert.strictEqual(searchClosedRes.status, 200);
    assert.strictEqual(searchClosedRes.body.data.length, 0, 'No trips returned while route is closed');

    // Reopen route (active: true)
    const reopenRes = await request(`/api/v1/ops/routes/${createdRouteA.route_id}`, {
      method: 'PATCH',
      token: directorA.token,
      body: { active: true }
    });
    assert.strictEqual(reopenRes.status, 200);
    assert.strictEqual(reopenRes.body.data.active, true);

    // Passenger search resumes
    const searchReopenRes = await request(
      `/api/v1/trips/search?origin=${encodeURIComponent('TP. Hồ Chí Minh')}&destination=${encodeURIComponent('Lâm Đồng')}&date=${extraDay}`,
      { operatorCode: 'PHUONGNAM' }
    );
    assert.strictEqual(searchReopenRes.status, 200);
    assert.ok(searchReopenRes.body.data.length >= 1, 'Trips available again after reopening');

    // Audit check for ROUTE_UPDATE
    const updateAudits = services.managerService.auditLog.filter(a => a.operator_id === 'op_phuongnam' && a.action === 'ROUTE_UPDATE');
    assert.ok(updateAudits.length >= 3);
  });
});
