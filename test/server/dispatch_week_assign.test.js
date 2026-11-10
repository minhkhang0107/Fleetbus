import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { createFleetBusServer } from '../../source/server/apiServer.js';
import { addDays, vnDate } from '../../source/server/core/serviceDate.js';

describe('Dispatch multi-day summary and enhanced assignment (board, options, SCHEDULE scope)', () => {
  let server;
  let services;
  let baseUrl;
  let dispatcherToken;

  const id = (schedule, d) => `${schedule}_${d.replaceAll('-', '')}`;

  const request = async (path, { method = 'GET', body, token = dispatcherToken } = {}) => {
    const headers = { 'Content-Type': 'application/json', 'X-Operator-Code': 'SAOMAI' };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (method === 'POST') headers['Idempotency-Key'] = crypto.randomUUID();
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const text = await res.text();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (_) {
      parsed = text;
    }
    return { status: res.status, body: parsed };
  };

  before(async () => {
    ({ server, services } = createFleetBusServer());
    await new Promise(resolve => server.listen(0, resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    const loginRes = await request('/api/v1/ops/auth/login', {
      method: 'POST',
      body: { username: 'dispatcher@busgo.vn', password: 'disp123' }
    });
    assert.strictEqual(loginRes.status, 200, JSON.stringify(loginRes.body));
    dispatcherToken = loginRes.body.data.token;
  });

  after(() => new Promise(resolve => server.close(resolve)));

  describe('1. GET /api/v1/ops/dispatch/summary', () => {
    it('returns 400 INVALID_DATE on invalid date formats', async () => {
      const bad1 = await request('/api/v1/ops/dispatch/summary?from=2026-02-30');
      assert.strictEqual(bad1.status, 400);
      assert.strictEqual(bad1.body.code, 'INVALID_DATE');

      const bad2 = await request('/api/v1/ops/dispatch/summary?from=not-a-date');
      assert.strictEqual(bad2.status, 400);
      assert.strictEqual(bad2.body.code, 'INVALID_DATE');

      const bad3 = await request('/api/v1/ops/dispatch/summary?from=28/08/2026');
      assert.strictEqual(bad3.status, 400);
      assert.strictEqual(bad3.body.code, 'INVALID_DATE');
    });

    it('defaults to today Vietnam time and 7 days, returning expected shape and counts', async () => {
      const res = await request('/api/v1/ops/dispatch/summary');
      assert.strictEqual(res.status, 200, JSON.stringify(res.body));
      assert.strictEqual(res.body.status, 'success');
      assert.ok(Array.isArray(res.body.data.days));
      assert.strictEqual(res.body.data.days.length, 7);

      const today = vnDate();
      for (let i = 0; i < 7; i++) {
        const item = res.body.data.days[i];
        assert.strictEqual(item.date, addDays(today, i));
        assert.strictEqual(typeof item.total, 'number');
        assert.strictEqual(typeof item.no_vehicle, 'number');
        assert.strictEqual(typeof item.no_driver, 'number');
        assert.strictEqual(typeof item.cancelled, 'number');
        assert.ok(item.total >= 0);
        assert.ok(item.no_vehicle >= 0);
        assert.ok(item.no_driver >= 0);
        assert.ok(item.cancelled >= 0);
        assert.ok(item.no_vehicle <= item.total);
        assert.ok(item.no_driver <= item.total);
      }
    });

    it('excludes CANCELLED trips from missing vehicle and driver counts', async () => {
      const testDay = addDays(vnDate(), 4);
      services.managerService.trips.push({
        trip_id: 'trp_cancelled_summary_test',
        operator_id: 'op_saomai',
        route_id: 'rt_hn_th',
        vehicle_id: null,
        driver_id: null,
        departure_time: `${testDay}T11:00:00+07:00`,
        status: 'CANCELLED',
        booked_seats: 0,
        total_seats: 22
      });

      const res = await request(`/api/v1/ops/dispatch/summary?from=${testDay}&days=1`);
      assert.strictEqual(res.status, 200);
      const daySummary = res.body.data.days[0];
      assert.strictEqual(daySummary.date, testDay);
      assert.ok(daySummary.cancelled >= 1);

      const dayTrips = services.managerService.trips.filter(t =>
        t.operator_id === 'op_saomai' &&
        vnDate(Date.parse(t.departure_time)) === testDay
      );
      const activeTrips = dayTrips.filter(t => t.status !== 'CANCELLED');
      const expectedNoVeh = activeTrips.filter(t => !t.vehicle_id).length;
      const expectedNoDrv = activeTrips.filter(t => !t.driver_id).length;

      assert.strictEqual(daySummary.no_vehicle, expectedNoVeh);
      assert.strictEqual(daySummary.no_driver, expectedNoDrv);
      assert.strictEqual(daySummary.total, dayTrips.length);
    });

    it('respects days parameter clamped to maximum 14 days', async () => {
      const res = await request('/api/v1/ops/dispatch/summary?days=20');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.data.days.length, 14);
    });
  });

  describe('2. Board trips have arrival_time (ISO)', () => {
    it('returns arrival_time on every trip of the board', async () => {
      const day = addDays(vnDate(), 1);
      const res = await request(`/api/v1/ops/dispatch/board?date=${day}`);
      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.body.data.trips));
      assert.ok(res.body.data.trips.length > 0);

      for (const trip of res.body.data.trips) {
        assert.ok(typeof trip.arrival_time === 'string', `Trip ${trip.trip_id} must have arrival_time`);
        const depMs = Date.parse(trip.departure_time);
        const arrMs = Date.parse(trip.arrival_time);
        assert.ok(!isNaN(arrMs), `Trip ${trip.trip_id} arrival_time must be valid ISO`);
        assert.ok(arrMs >= depMs, `arrival_time (${trip.arrival_time}) must be >= departure_time (${trip.departure_time})`);
      }
    });
  });

  describe('3. getAssignOptions: day_trips, layout_match, and expected layout context', () => {
    it('shows the 07:00 trip on the vehicle already used at 07:00 when asking for the 14:00 trip', async () => {
      const testDay = addDays(vnDate(), 2);
      services.eventBridge?.runsForDate?.(testDay, 'op_saomai');

      const trip07Id = id('trp_hn_th_01', testDay);
      const trip14Id = id('trp_hn_th_02', testDay);

      const trip07 = services.managerService.findTrip(trip07Id);
      assert.ok(trip07, `07:00 run ${trip07Id} must exist`);
      assert.strictEqual(trip07.vehicle_id, 'veh_04');

      const res = await request(`/api/v1/ops/trips/${trip14Id}/assign-options`);
      assert.strictEqual(res.status, 200, JSON.stringify(res.body));
      const opts = res.body.data;

      const veh04 = opts.vehicles.find(v => v.vehicle_id === 'veh_04');
      assert.ok(veh04, 'veh_04 must be listed in vehicles');
      assert.ok(Array.isArray(veh04.day_trips), 'veh_04 must have day_trips array');

      const dayTrip07 = veh04.day_trips.find(t => t.trip_id === trip07Id);
      assert.ok(dayTrip07, 'day_trips must include the 07:00 trip run');
      assert.strictEqual(dayTrip07.trip_id, trip07Id);
      assert.ok(dayTrip07.departure_time.includes('07:00:00'));
      assert.ok(typeof dayTrip07.arrival_time === 'string');
      assert.ok(typeof dayTrip07.route_name === 'string');
      assert.ok(dayTrip07.status);

      const drv8821 = opts.drivers.find(d => d.driver_id === 'drv_8821a');
      assert.ok(drv8821, 'drv_8821a must be listed in drivers');
      assert.ok(Array.isArray(drv8821.day_trips), 'driver must have day_trips array');
      const driverDayTrip07 = drv8821.day_trips.find(t => t.trip_id === trip07Id);
      assert.ok(driverDayTrip07, 'driver day_trips must include the 07:00 trip run');
    });

    it('sets layout_match true/false for vehicles with same/different layout, and sets expected layout context', async () => {
      const testDay = addDays(vnDate(), 2);
      const trip14Id = id('trp_hn_th_02', testDay);

      const res = await request(`/api/v1/ops/trips/${trip14Id}/assign-options`);
      assert.strictEqual(res.status, 200);
      const opts = res.body.data;

      assert.strictEqual(opts.expected_layout_name, 'Giường nằm 34 chỗ (2 tầng, 3 dãy)');
      assert.strictEqual(opts.expected_seats, 34);

      const vehSleeper34 = opts.vehicles.find(v => v.vehicle_id === 'veh_03');
      assert.ok(vehSleeper34);
      assert.strictEqual(vehSleeper34.layout_name, 'Giường nằm 34 chỗ (2 tầng, 3 dãy)');
      assert.strictEqual(vehSleeper34.layout_match, true, 'Vehicle with matching SLEEPER_34 layout must have layout_match true');

      const vehCabin34 = opts.vehicles.find(v => v.vehicle_id === 'veh_01');
      assert.ok(vehCabin34);
      assert.strictEqual(vehCabin34.layout_name, 'Limousine 34 phòng (2 tầng, 3 dãy)');
      assert.strictEqual(vehCabin34.layout_match, false, 'Vehicle with different CABIN_34 layout must have layout_match false');

      const vehCabin22 = opts.vehicles.find(v => v.vehicle_id === 'veh_02');
      assert.ok(vehCabin22);
      assert.strictEqual(vehCabin22.layout_name, 'Limousine 22 phòng (2 tầng)');
      assert.strictEqual(vehCabin22.layout_match, false, 'Vehicle with different CABIN_22 layout must have layout_match false');
    });
  });

  describe('4. assignTrip with scope SCHEDULE', () => {
    it('fills an unassigned later run and skips one whose bus is busy', async () => {
      const day1 = addDays(vnDate(), 6);
      const day2 = addDays(vnDate(), 7);
      const day3 = addDays(vnDate(), 8);

      services.eventBridge?.runsForDate?.(day1, 'op_saomai');
      services.eventBridge?.runsForDate?.(day2, 'op_saomai');
      services.eventBridge?.runsForDate?.(day3, 'op_saomai');

      const run1Id = id('trp_hn_th_03', day1);
      const run2Id = id('trp_hn_th_03', day2);
      const run3Id = id('trp_hn_th_03', day3);

      const r1 = services.managerService.findTrip(run1Id);
      const r2 = services.managerService.findTrip(run2Id);
      const r3 = services.managerService.findTrip(run3Id);

      assert.ok(r1 && r2 && r3, 'All 3 runs must exist');

      // Keep only run1, run2, run3 for trp_hn_th_03 in this.trips so we isolate the exact runs under test
      services.managerService.trips = services.managerService.trips.filter(t =>
        (t.schedule_id !== 'trp_hn_th_03' && !t.trip_id.startsWith('trp_hn_th_03_')) ||
        [run1Id, run2Id, run3Id].includes(t.trip_id)
      );

      r1.vehicle_id = null;
      r1.vehicle_plate = null;
      r1.driver_id = null;

      r2.vehicle_id = null;
      r2.vehicle_plate = null;
      r2.driver_id = null;

      r3.vehicle_id = null;
      r3.vehicle_plate = null;
      r3.driver_id = null;

      const conflictTripId = 'trp_conflict_busy_bus_test';
      services.managerService.trips.push({
        trip_id: conflictTripId,
        operator_id: 'op_saomai',
        route_id: 'rt_hn_th',
        vehicle_id: 'veh_01',
        vehicle_plate: '29B-123.45',
        driver_id: 'drv_8821a',
        departure_time: `${day3}T20:00:00+07:00`,
        status: 'SCHEDULED',
        booked_seats: 0,
        total_seats: 34
      });

      let emittedAssignments = [];
      const listener = (payload) => emittedAssignments.push(payload);
      services.eventBridge?.on?.('TRIP_ASSIGNED', listener);

      try {
        const assignRes = await request(`/api/v1/ops/trips/${run1Id}/assign`, {
          method: 'POST',
          body: {
            vehicleId: 'veh_01',
            driverId: 'drv_9912b',
            scope: 'SCHEDULE'
          }
        });

        assert.strictEqual(assignRes.status, 200, JSON.stringify(assignRes.body));
        assert.strictEqual(assignRes.body.status, 'success');
        assert.strictEqual(assignRes.body.data.scope, 'SCHEDULE');
        assert.strictEqual(assignRes.body.data.applied_runs, 1, 'Exactly one extra run (run2) should be applied');
        assert.ok(Array.isArray(assignRes.body.data.skipped_runs));
        assert.strictEqual(assignRes.body.data.skipped_runs.length, 1);
        assert.strictEqual(assignRes.body.data.skipped_runs[0].trip_id, run3Id);
        assert.match(assignRes.body.data.skipped_runs[0].reason, new RegExp(conflictTripId));

        assert.strictEqual(r1.vehicle_id, 'veh_01');
        assert.strictEqual(r1.driver_id, 'drv_9912b');

        assert.strictEqual(r2.vehicle_id, 'veh_01');
        assert.strictEqual(r2.driver_id, 'drv_9912b');
        assert.strictEqual(r2.vehicle_plate, '29B-123.45');

        assert.strictEqual(r3.vehicle_id, null, 'Conflicting run3 should not have vehicle assigned');
        assert.strictEqual(r3.driver_id, null, 'Conflicting run3 should not have driver assigned');

        const r2Emitted = emittedAssignments.find(e => e.tripId === run2Id);
        assert.ok(r2Emitted, 'TRIP_ASSIGNED must be emitted for applied run2');
        assert.strictEqual(r2Emitted.vehiclePlate, '29B-123.45');
        assert.strictEqual(r2Emitted.driverId, 'drv_9912b');
      } finally {
        services.eventBridge?.removeListener?.('TRIP_ASSIGNED', listener);
        const idx = services.managerService.trips.findIndex(t => t.trip_id === conflictTripId);
        if (idx >= 0) services.managerService.trips.splice(idx, 1);
      }
    });
  });

  describe('5. Busy and driving-hour rules (D199)', () => {
    const ms = () => services.managerService;
    const day = () => addDays(vnDate(), 12);
    const at = (hhmm, d = day()) => `${d}T${hhmm}:00+07:00`;
    const added = [];
    const addTrip = (fields) => {
      const trip = { route_id: 'rt_hn_th', status: 'SCHEDULED', booked_seats: 0, held_seats: 0, total_seats: 22, delay_minutes: 0, operator_id: 'op_saomai', ...fields };
      ms().trips.push(trip);
      added.push(trip.trip_id);
      return trip;
    };
    const cleanup = () => {
      ms().trips = ms().trips.filter(t => !added.includes(t.trip_id));
      added.length = 0;
    };
    const freeVehicle = (n = 0) => ms().vehicles.filter(v => v.operator_id === 'op_saomai' && v.status !== 'MAINTENANCE')[n].vehicle_id;
    const freeDriver = () => {
      addTrip({ trip_id: 'd199_probe', departure_time: at('03:00') });
      const opts = ms().getAssignOptions('d199_probe', 'op_saomai').data;
      cleanup();
      return opts.drivers.find(d => d.available && !d.day_trips.length).driver_id;
    };

    after(cleanup);

    it('a reported delay keeps the bus busy longer', () => {
      const veh = freeVehicle();
      const first = addTrip({ trip_id: 'd199_delay_a', departure_time: at('08:00'), vehicle_id: veh });
      addTrip({ trip_id: 'd199_delay_b', departure_time: at('12:15') });
      const free = ms().getAssignOptions('d199_delay_b', 'op_saomai').data.vehicles.find(v => v.vehicle_id === veh);
      assert.strictEqual(free.available, true, 'arrives 11:00, 30 min turnaround, free at 12:15');
      first.delay_minutes = 60;
      const busy = ms().getAssignOptions('d199_delay_b', 'op_saomai').data.vehicles.find(v => v.vehicle_id === veh);
      assert.strictEqual(busy.available, false, 'one hour late: arrives 12:00, not back before 12:30');
      assert.strictEqual(busy.conflict_trip_id, 'd199_delay_a');
      cleanup();
    });

    it('a bus still on the road after its arrival time stays busy', () => {
      const veh = freeVehicle();
      const now = Date.now();
      const running = addTrip({ trip_id: 'd199_road_a', departure_time: new Date(now - 4 * 3600000).toISOString(), vehicle_id: veh, status: 'IN_TRANSIT' });
      addTrip({ trip_id: 'd199_road_b', departure_time: new Date(now + 10 * 60000).toISOString() });
      const busy = ms().getAssignOptions('d199_road_b', 'op_saomai').data.vehicles.find(v => v.vehicle_id === veh);
      assert.strictEqual(busy.available, false, 'should have arrived 1 h ago but is still running');
      assert.strictEqual(busy.conflict_trip_id, 'd199_road_a');
      running.status = 'COMPLETED';
      const free = ms().getAssignOptions('d199_road_b', 'op_saomai').data.vehicles.find(v => v.vehicle_id === veh);
      assert.strictEqual(free.available, true, 'once ended the bus is free again');
      cleanup();
    });

    it('a driver cannot drive more than 10 hours in a day', async () => {
      const drv = freeDriver();
      addTrip({ trip_id: 'd199_h1', departure_time: at('04:00'), driver_id: drv, status: 'COMPLETED' });
      addTrip({ trip_id: 'd199_h2', departure_time: at('07:30'), driver_id: drv });
      addTrip({ trip_id: 'd199_h3', departure_time: at('11:00'), driver_id: drv });
      addTrip({ trip_id: 'd199_h4', departure_time: at('15:00') });
      const opt = ms().getAssignOptions('d199_h4', 'op_saomai').data.drivers.find(d => d.driver_id === drv);
      assert.strictEqual(opt.driven_minutes, 540);
      assert.strictEqual(opt.available, false);
      assert.match(opt.reason, /Quá 10 giờ lái ngày .*đã lái 9 giờ, chuyến này 3 giờ/);

      const res = await request('/api/v1/ops/trips/d199_h4/assign', { method: 'POST', body: { vehicle_id: freeVehicle(), driver_id: drv } });
      assert.strictEqual(res.status, 409, JSON.stringify(res.body));
      assert.strictEqual(res.body.code, 'DRIVER_UNAVAILABLE');

      // Only the part of a night trip that falls on the day counts.
      addTrip({ trip_id: 'd199_h0', departure_time: at('21:30', addDays(day(), -1)), driver_id: drv });
      ms().trips = ms().trips.filter(t => t.trip_id !== 'd199_h1');
      const opt2 = ms().getAssignOptions('d199_h4', 'op_saomai').data.drivers.find(d => d.driver_id === drv);
      assert.strictEqual(opt2.driven_minutes, 6 * 60 + 30, '30 min after midnight + 2 trips of 3 h');
      assert.strictEqual(opt2.available, true, '6 h 30 + 3 h stays under 10 h');
      cleanup();
    });

    it('the emergency swap refuses a bus that is on another trip at that time', () => {
      const standby = ms().vehicles.find(v => v.operator_id === 'op_saomai' && v.status === 'STANDBY');
      addTrip({ trip_id: 'd199_swap_other', departure_time: at('09:00'), vehicle_id: standby.vehicle_id });
      addTrip({ trip_id: 'd199_swap', departure_time: at('10:00'), vehicle_id: freeVehicle() === standby.vehicle_id ? freeVehicle(1) : freeVehicle() });
      const res = ms().replaceTripVehicle('d199_swap', standby.vehicle_id, 'Hỏng máy', null, 'op_saomai');
      assert.strictEqual(res.success, false);
      assert.strictEqual(res.code, 'VEHICLE_UNAVAILABLE');
      assert.strictEqual(res.conflict_trip_id, 'd199_swap_other');
      cleanup();
    });

    it('a new run does not inherit a bus or driver that is busy at that time', () => {
      const veh = freeVehicle();
      const drv = freeDriver();
      addTrip({ trip_id: 'd199_other', departure_time: at('09:00'), vehicle_id: veh, driver_id: drv });
      ms().scheduleAssignments = { ...(ms().scheduleAssignments || {}), d199_tpl: { vehicle_id: veh, driver_id: drv } };
      const run = ms().createRunTrip('d199_tpl', 'd199_tpl_run', { departure_time: at('10:00'), operator_id: 'op_saomai' });
      added.push(run.trip_id);
      assert.strictEqual(run.vehicle_id, null);
      assert.strictEqual(run.vehicle_plate, null);
      assert.strictEqual(run.driver_id, null);
      delete ms().scheduleAssignments.d199_tpl;
      cleanup();
    });
  });

  describe('6. Roadside stops of existing routes can go on a new route (D200)', () => {
    it('lists them among the company stops and accepts them in POST /ops/routes', async () => {
      const list = await request('/api/v1/ops/stations');
      assert.strictEqual(list.status, 200, JSON.stringify(list.body));
      const phuLy = list.body.data.find(s => s.station_id === 'stp_rs_phu_ly');
      assert.ok(phuLy, 'roadside stop of rt_hn_th is listed');
      assert.strictEqual(phuLy.kind, 'ROADSIDE');
      assert.ok(Number.isFinite(phuLy.lat) && Number.isFinite(phuLy.lng));
      assert.strictEqual(new Set(list.body.data.map(s => s.station_id)).size, list.body.data.length, 'no stop listed twice');

      const giapBat = list.body.data.find(s => s.name.includes('Giáp Bát'));
      const res = await request('/api/v1/ops/routes', {
        method: 'POST',
        body: {
          name: 'Hà Nội — Phủ Lý (thử D200)',
          stops: [
            { stop_id: giapBat.station_id, pickup_allowed: true, dropoff_allowed: false },
            { stop_id: 'stp_rs_phu_ly', pickup_allowed: false, dropoff_allowed: true }
          ],
          schedule: { departure: '06:00', duration_minutes: 90, base_fare_vnd: 120000, vehicle_type: 'DOUBLE_DECK_VIP_CABIN', total_seats: 22 }
        }
      });
      assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    });
  });
});
