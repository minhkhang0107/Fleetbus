import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { createFleetBusServer } from '../../source/server/apiServer.js';
import { vnDate, runId } from '../../source/server/core/serviceDate.js';
import { MOCK_TRIPS_DATABASE, reloadScheduleTemplates } from '../../source/server/services/passenger/modules/search.js';

describe('Driver Monthly Schedule (DRI-021, D155)', () => {
  let server;
  let baseUrl;
  let services;
  let driverToken;
  let otherDriverToken;

  before(async () => {
    const instance = createFleetBusServer();
    server = instance.server;
    services = instance.services;
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;
    baseUrl = `http://localhost:${port}/api/v1`;

    // Login TX8821 (drv_8821a, op_saomai)
    const loginRes = await fetch(`${baseUrl}/auth/driver/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ staffIdOrPhone: 'TX8821', pin: '123456' })
    });
    assert.strictEqual(loginRes.status, 200);
    const loginData = await loginRes.json();
    driverToken = loginData.data.token;

    // Login TX9912 (drv_9912b, op_saomai)
    const otherLoginRes = await fetch(`${baseUrl}/auth/driver/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ staffIdOrPhone: 'TX9912', pin: '112233' })
    });
    assert.strictEqual(otherLoginRes.status, 200);
    const otherLoginData = await otherLoginRes.json();
    otherDriverToken = otherLoginData.data.token;
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  async function getSchedule(params = '', token = driverToken) {
    const url = `${baseUrl}/driver/schedule${params ? (params.startsWith('?') ? params : `?${params}`) : ''}`;
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(url, { headers });
    const body = await res.json().catch(() => null);
    return { status: res.status, body };
  }

  it('TC-DRI-SCHED-01: trip-level assignment shows ASSIGNED with the right status (scheduled, completed with cash)', async () => {
    // 1. Scheduled trip in managerService.trips
    services.managerService.trips.push({
      trip_id: 'trip_test_assigned_sched',
      schedule_id: null,
      driver_id: 'drv_8821a',
      operator_id: 'op_saomai',
      vehicle_id: 'veh_01',
      vehicle_plate: '29B-123.45',
      route_id: 'rt_hn_th',
      route_name: 'Hà Nội — Thanh Hóa (Cao tốc)',
      departure_time: '2026-10-15T08:00:00+07:00',
      status: 'SCHEDULED',
      booked_seats: 15,
      delay_minutes: 0
    });

    // 2. Completed trip with cash handover in driverService.activeTrips
    services.driverService.activeTrips.set('trip_test_assigned_comp', {
      trip_id: 'trip_test_assigned_comp',
      schedule_id: null,
      driver_id: 'drv_8821a',
      operator_id: 'op_saomai',
      vehicle_plate: '29B-444.11',
      route_name: 'Thanh Hóa — Hà Nội',
      planned_departure_time: '2026-10-16T14:30:00+07:00',
      status: 'COMPLETED',
      booked_passengers_count: 22,
      delay_minutes: 15,
      total_cash_to_handover_vnd: 520000
    });

    const res = await getSchedule('?month=2026-10');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.status, 'success');
    const { month, today, days, summary } = res.body.data;
    assert.strictEqual(month, '2026-10');
    assert.strictEqual(today, vnDate(Date.now()));

    // Check scheduled trip on 2026-10-15
    const day15 = days.find((d) => d.date === '2026-10-15');
    assert.ok(day15, 'Day 2026-10-15 must exist in response');
    const schedTrip = day15.trips.find((t) => t.trip_id === 'trip_test_assigned_sched');
    assert.ok(schedTrip, 'Scheduled trip must be found on 2026-10-15');
    assert.strictEqual(schedTrip.source, 'ASSIGNED');
    assert.strictEqual(schedTrip.status, 'SCHEDULED');
    assert.strictEqual(schedTrip.departure, '08:00');
    assert.strictEqual(schedTrip.vehicle_plate, '29B-123.45');
    assert.strictEqual(schedTrip.route_name, 'Hà Nội — Thanh Hóa (Cao tốc)');
    assert.strictEqual(schedTrip.passengers, 15);
    assert.strictEqual(schedTrip.delay_minutes, 0);
    assert.strictEqual(schedTrip.cash_handed_in_vnd, null);

    // Check completed trip on 2026-10-16
    const day16 = days.find((d) => d.date === '2026-10-16');
    assert.ok(day16, 'Day 2026-10-16 must exist in response');
    const compTrip = day16.trips.find((t) => t.trip_id === 'trip_test_assigned_comp');
    assert.ok(compTrip, 'Completed trip must be found on 2026-10-16');
    assert.strictEqual(compTrip.source, 'ASSIGNED');
    assert.strictEqual(compTrip.status, 'COMPLETED');
    assert.strictEqual(compTrip.departure, '14:30');
    assert.strictEqual(compTrip.vehicle_plate, '29B-444.11');
    assert.strictEqual(compTrip.passengers, 22);
    assert.strictEqual(compTrip.delay_minutes, 15);
    assert.strictEqual(compTrip.cash_handed_in_vnd, 520000);

    // Verify summary counts
    assert.ok(summary.total >= 2);
    assert.ok(summary.completed >= 1);
    assert.ok(summary.upcoming >= 1);
  });

  it('TC-DRI-SCHED-02: a schedule default yields one SCHEDULE_DEFAULT entry per run day of the month (respect days the schedule does not run)', async () => {
    // Register a schedule template that only runs on Monday (1), Wednesday (3), Friday (5)
    const templateId = 'trp_test_mwf_template';
    MOCK_TRIPS_DATABASE.push({
      trip_id: templateId,
      operator_id: 'op_saomai',
      route_id: 'rt_hn_th',
      route_name: 'Hà Nội — Thanh Hóa (Cao tốc MWF)',
      departure_time: '2026-08-28T09:15:00+07:00',
      arrival_time: '2026-08-28T11:45:00+07:00',
      days_of_week: [1, 3, 5],
      total_seats: 22,
      stops: []
    });
    reloadScheduleTemplates();

    // Set schedule default for drv_8821a
    if (!services.managerService.scheduleAssignments) {
      services.managerService.scheduleAssignments = {};
    }
    services.managerService.scheduleAssignments[templateId] = {
      vehicle_id: 'veh_04',
      driver_id: 'drv_8821a'
    };

    const res = await getSchedule('?month=2026-11');
    assert.strictEqual(res.status, 200);
    const { days } = res.body.data;

    // November 2026 has 30 days:
    // 2026-11-01 is Sunday (weekday 7) -> does not run
    // 2026-11-02 is Monday (weekday 1) -> runs!
    // 2026-11-03 is Tuesday (weekday 2) -> does not run
    // 2026-11-04 is Wednesday (weekday 3) -> runs!
    // 2026-11-05 is Thursday (weekday 4) -> does not run
    // 2026-11-06 is Friday (weekday 5) -> runs!
    // 2026-11-07 is Saturday (weekday 6) -> does not run
    // 2026-11-08 is Sunday (weekday 7) -> does not run

    // Check Sunday 2026-11-01 has NO mwf trip
    const day01 = days.find((d) => d.date === '2026-11-01');
    assert.ok(!day01?.trips.some((t) => t.trip_id.startsWith(templateId)));

    // Check Monday 2026-11-02 has SCHEDULE_DEFAULT entry
    const day02 = days.find((d) => d.date === '2026-11-02');
    assert.ok(day02, '2026-11-02 must have trips');
    const run02 = day02.trips.find((t) => t.trip_id === runId(templateId, '2026-11-02'));
    assert.ok(run02, 'Run on 2026-11-02 must be found');
    assert.strictEqual(run02.source, 'SCHEDULE_DEFAULT');
    assert.strictEqual(run02.status, 'SCHEDULED');
    assert.strictEqual(run02.departure, '09:15');
    assert.strictEqual(run02.vehicle_plate, '29B-882.19');
    assert.strictEqual(run02.passengers, null);
    assert.strictEqual(run02.delay_minutes, 0);
    assert.strictEqual(run02.cash_handed_in_vnd, null);

    // Check Tuesday 2026-11-03 has NO mwf trip
    const day03 = days.find((d) => d.date === '2026-11-03');
    assert.ok(!day03?.trips.some((t) => t.trip_id.startsWith(templateId)));

    // Check Wednesday 2026-11-04 has SCHEDULE_DEFAULT entry
    const day04 = days.find((d) => d.date === '2026-11-04');
    assert.ok(day04, '2026-11-04 must have trips');
    const run04 = day04.trips.find((t) => t.trip_id === runId(templateId, '2026-11-04'));
    assert.ok(run04, 'Run on 2026-11-04 must be found');
    assert.strictEqual(run04.source, 'SCHEDULE_DEFAULT');

    // Count all MWF runs in Nov 2026: Mondays (2, 9, 16, 23, 30 = 5), Wednesdays (4, 11, 18, 25 = 4), Fridays (6, 13, 20, 27 = 4) -> 13 runs total
    const allMwfRuns = days.flatMap((d) => d.trips).filter((t) => t.trip_id.startsWith(templateId));
    assert.strictEqual(allMwfRuns.length, 13);
  });

  it('TC-DRI-SCHED-03: a trip-level reassignment to another driver removes that day', async () => {
    const templateId = 'trp_test_mwf_template';
    const reassignDate = '2026-11-04'; // Wednesday
    const runTripId = runId(templateId, reassignDate);

    // Reassign this specific run to drv_9912b at trip-level
    services.managerService.trips.push({
      trip_id: runTripId,
      schedule_id: templateId,
      driver_id: 'drv_9912b',
      operator_id: 'op_saomai',
      vehicle_id: 'veh_02',
      vehicle_plate: '29B-444.11',
      route_id: 'rt_hn_th',
      departure_time: `${reassignDate}T09:15:00+07:00`,
      status: 'SCHEDULED',
      booked_seats: 10,
      delay_minutes: 0
    });

    // Query for drv_8821a: run on 2026-11-04 must NOT appear
    const res = await getSchedule('?month=2026-11', driverToken);
    assert.strictEqual(res.status, 200);
    const day04 = res.body.data.days.find((d) => d.date === reassignDate);
    const runForDriver = day04?.trips.find((t) => t.trip_id === runTripId);
    assert.strictEqual(runForDriver, undefined, 'Reassigned trip must not appear for the original driver');

    // Query for drv_9912b: run on 2026-11-04 MUST appear as ASSIGNED
    const otherRes = await getSchedule('?month=2026-11', otherDriverToken);
    assert.strictEqual(otherRes.status, 200);
    const otherDay04 = otherRes.body.data.days.find((d) => d.date === reassignDate);
    const runForOther = otherDay04?.trips.find((t) => t.trip_id === runTripId);
    assert.ok(runForOther, 'Reassigned trip must appear for the newly assigned driver');
    assert.strictEqual(runForOther.source, 'ASSIGNED');
    assert.strictEqual(runForOther.vehicle_plate, '29B-444.11');
  });

  it('TC-DRI-SCHED-04: another driver\'s trips never appear', async () => {
    // Add a trip for drv_9912b in 2026-10
    services.managerService.trips.push({
      trip_id: 'trip_exclusive_to_other_driver',
      schedule_id: null,
      driver_id: 'drv_9912b',
      operator_id: 'op_saomai',
      departure_time: '2026-10-22T10:00:00+07:00',
      status: 'SCHEDULED',
      vehicle_plate: '29B-123.45',
      route_name: 'Hà Nội — Ninh Bình',
      booked_seats: 8,
      delay_minutes: 0
    });

    const res = await getSchedule('?month=2026-10', driverToken);
    assert.strictEqual(res.status, 200);
    const tripFound = res.body.data.days.flatMap((d) => d.trips).find((t) => t.trip_id === 'trip_exclusive_to_other_driver');
    assert.strictEqual(tripFound, undefined, 'Trips of other drivers must never appear');
  });

  it('TC-DRI-SCHED-05: month out of range / malformed → 400', async () => {
    // Current month is 2026-10 (based on test environment / server time)
    // Allowed: 3 months before (2026-07) to 3 months after (2027-01)

    // 4 months before: 2026-06 -> 400 MONTH_OUT_OF_RANGE
    const tooEarly = await getSchedule('?month=2026-06');
    assert.strictEqual(tooEarly.status, 400);
    assert.strictEqual(tooEarly.body.code, 'MONTH_OUT_OF_RANGE');
    assert.ok(tooEarly.body.message.includes('3 tháng'));

    // 4 months after: 2027-02 -> 400 MONTH_OUT_OF_RANGE
    const tooLate = await getSchedule('?month=2027-02');
    assert.strictEqual(tooLate.status, 400);
    assert.strictEqual(tooLate.body.code, 'MONTH_OUT_OF_RANGE');
    assert.ok(tooLate.body.message.includes('3 tháng'));

    // Boundary check: 2026-07 (3 months before) -> 200 OK
    const boundaryEarly = await getSchedule('?month=2026-07');
    assert.strictEqual(boundaryEarly.status, 200);

    // Boundary check: 2027-01 (3 months after) -> 200 OK
    const boundaryLate = await getSchedule('?month=2027-01');
    assert.strictEqual(boundaryLate.status, 200);

    // Malformed months -> 400 INVALID_MONTH
    for (const badMonth of ['invalid', '2026-13', '2026-0', '2026/10', '2026-1', '2026-10-19']) {
      const res = await getSchedule(`?month=${badMonth}`);
      assert.strictEqual(res.status, 400, `Month ${badMonth} should return 400`);
      assert.strictEqual(res.body.code, 'INVALID_MONTH');
    }
  });

  it('TC-DRI-SCHED-06: no month → current month', async () => {
    const res = await getSchedule('');
    assert.strictEqual(res.status, 200);
    const expectedMonth = vnDate(Date.now()).slice(0, 7);
    assert.strictEqual(res.body.data.month, expectedMonth);
    assert.strictEqual(res.body.data.today, vnDate(Date.now()));
  });

  it('TC-DRI-SCHED-07: cancelled trip shows CANCELLED status and is counted in summary', async () => {
    services.managerService.trips.push({
      trip_id: 'trip_test_cancelled_01',
      schedule_id: null,
      driver_id: 'drv_8821a',
      operator_id: 'op_saomai',
      vehicle_id: 'veh_01',
      vehicle_plate: '29B-123.45',
      route_name: 'Hà Nội — Thanh Hóa',
      departure_time: '2026-10-28T16:00:00+07:00',
      status: 'CANCELLED',
      booked_seats: 0,
      delay_minutes: 0
    });

    const res = await getSchedule('?month=2026-10');
    assert.strictEqual(res.status, 200);
    const day28 = res.body.data.days.find((d) => d.date === '2026-10-28');
    assert.ok(day28);
    const cancelledTrip = day28.trips.find((t) => t.trip_id === 'trip_test_cancelled_01');
    assert.ok(cancelledTrip);
    assert.strictEqual(cancelledTrip.status, 'CANCELLED');
    assert.strictEqual(cancelledTrip.source, 'ASSIGNED');
    assert.ok(res.body.data.summary.cancelled >= 1);
  });

  it('TC-DRI-SCHED-08: a schedule default only lists runs for today and later, never for past days without a record (D155)', async () => {
    const currentVnDate = vnDate();
    const currentMonth = currentVnDate.slice(0, 7);
    const [yearStr, monthStr] = currentMonth.split('-');
    const currentDay = Number(currentVnDate.slice(8, 10));
    const lastDayNum = new Date(Date.UTC(Number(yearStr), Number(monthStr), 0)).getUTCDate();
    const lastDate = `${currentMonth}-${String(lastDayNum).padStart(2, '0')}`;

    const templateId = 'trp_test_daily_promise';
    MOCK_TRIPS_DATABASE.push({
      trip_id: templateId,
      operator_id: 'op_saomai',
      route_id: 'rt_hn_th',
      route_name: 'Hà Nội — Ninh Bình (Hàng ngày)',
      departure_time: '2026-08-28T06:30:00+07:00',
      arrival_time: '2026-08-28T08:00:00+07:00',
      total_seats: 22,
      stops: []
    });
    reloadScheduleTemplates();

    services.managerService.scheduleAssignments[templateId] = {
      vehicle_id: 'veh_04',
      driver_id: 'drv_8821a'
    };

    const res = await getSchedule(`?month=${currentMonth}`);
    assert.strictEqual(res.status, 200);
    const { today, days } = res.body.data;

    // Filter to runs from this template
    const dailyRuns = days.flatMap((d) => d.trips.map((t) => ({ ...t, date: d.date }))).filter((t) => t.trip_id.startsWith(templateId));
    assert.ok(dailyRuns.length > 0, 'Must have future runs for this template');

    // Every returned run from this template must be on or after today
    for (const run of dailyRuns) {
      assert.ok(run.date >= today, `Schedule default run on ${run.date} must be >= today (${today})`);
      assert.strictEqual(run.source, 'SCHEDULE_DEFAULT');
    }

    // Past days (every day of that month before today) must have no entry from this template
    const pastDates = [];
    for (let day = 1; day < currentDay; day++) {
      pastDates.push(`${currentMonth}-${String(day).padStart(2, '0')}`);
    }
    for (const pastDate of pastDates) {
      const day = days.find((d) => d.date === pastDate);
      const run = day?.trips.find((t) => t.trip_id.startsWith(templateId));
      assert.strictEqual(run, undefined, `Past day ${pastDate} must not list schedule default run`);
    }

    // Today and the last day of the month must have schedule default runs
    const futureDates = Array.from(new Set([today, lastDate]));
    for (const futureDate of futureDates) {
      const day = days.find((d) => d.date === futureDate);
      const run = day?.trips.find((t) => t.trip_id === runId(templateId, futureDate));
      assert.ok(run, `Future day ${futureDate} must have schedule default run`);
      assert.strictEqual(run.source, 'SCHEDULE_DEFAULT');
      assert.strictEqual(run.status, 'SCHEDULED');
    }
  });
});
