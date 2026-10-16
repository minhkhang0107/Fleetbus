/**
 * Fixed timetable of a company (D128, MGR-032) and its two-week rule (D129): passengers book up to 14 days ahead;
 * a new schedule or a change starts on the first day not yet on sale, so no day on sale ever changes.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { createFleetBusServer } from '../../source/server/apiServer.js';
import { addDays, scheduleChangeFrom, serviceCalendar } from '../../source/server/core/serviceDate.js';
import { runsOn, settingsOn, weekdayOf } from '../../source/server/services/passenger/modules/search.js';

describe('TC-SCHED-01: when a schedule runs, and which version applies', () => {
  it('weekday, validity and on/off decide', () => {
    assert.strictEqual(weekdayOf('2026-10-12'), 1, '12/10/2026 is a Monday');
    assert.strictEqual(weekdayOf('2026-10-18'), 7, 'Sunday is 7');
    const s = { days_of_week: [1, 3, 5], valid_from: '2026-10-12', valid_to: '2026-10-31' };
    assert.strictEqual(runsOn(s, '2026-10-12'), true);
    assert.strictEqual(runsOn(s, '2026-10-13'), false, 'not on Tuesday');
    assert.strictEqual(runsOn(s, '2026-11-02'), false, 'after the validity');
    assert.strictEqual(runsOn({ ...s, active: false }, '2026-10-12'), false, 'switched off');
    assert.strictEqual(runsOn({}, '2026-10-13'), true, 'a schedule without rules runs every day');
  });

  it('a day takes the latest version in force on it', () => {
    const s = { departure_time: '2026-08-28T07:00:00+07:00', days_of_week: [1, 2, 3, 4, 5, 6, 7], versions: [
      { effective_from: '2026-10-27', departure_time: '2026-08-28T10:15:00+07:00' },
      { effective_from: '2026-11-03', active: false }
    ] };
    assert.strictEqual(settingsOn(s, '2026-10-26').departure_time.slice(11, 16), '07:00');
    assert.strictEqual(settingsOn(s, '2026-10-27').departure_time.slice(11, 16), '10:15');
    assert.strictEqual(runsOn(s, '2026-11-02'), true);
    assert.strictEqual(runsOn(s, '2026-11-03'), false, 'stopped from the second change on');
  });
});

describe('TC-SCHED-02: the office edits the timetable two weeks ahead', () => {
  let server;
  let services;
  let base;
  let dispatcher;
  let cashier;
  const { today, last_date: lastSale } = serviceCalendar();
  const changeFrom = scheduleChangeFrom();

  const api = async (path, { method = 'GET', body, token } = {}) => {
    const headers = { 'Content-Type': 'application/json', 'X-Operator-Code': 'SAOMAI' };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (method === 'POST') headers['Idempotency-Key'] = crypto.randomUUID();
    const res = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  };
  const search = async (date) => (await api(`/api/v1/trips/search?origin=${encodeURIComponent('Hà Nội')}&destination=${encodeURIComponent('Thanh Hóa')}&date=${date}`)).body.data;
  const hhmm = (iso) => iso.slice(11, 16);
  const runOn = (scheduleId, date) => services.searchService.materializeRun(scheduleId, date);

  before(async () => {
    ({ server, services } = createFleetBusServer({ dataDir: null }));
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
    dispatcher = (await api('/api/v1/auth/staff/login', { method: 'POST', body: { username: 'dispatcher@busgo.vn', password: 'disp123' } })).body.data.token;
    cashier = (await api('/api/v1/auth/staff/login', { method: 'POST', body: { username: 'cashier@busgo.vn', password: 'cash123' } })).body.data.token;
  });

  after(() => new Promise(resolve => server.close(resolve)));

  it('passengers book 14 days ahead; changes start the day after', () => {
    assert.strictEqual(lastSale, addDays(today, 14));
    assert.strictEqual(changeFrom, addDays(today, 15));
  });

  it('lists the timetable with the first day a change may start; only the director and dispatchers', async () => {
    const list = await api('/api/v1/ops/schedules', { token: dispatcher });
    assert.strictEqual(list.status, 200);
    assert.strictEqual(list.body.data.change_from, changeFrom);
    const s = list.body.data.schedules.find(x => x.schedule_id === 'trp_hn_th_01');
    assert.deepStrictEqual([s.departure, s.days_of_week.length, s.status, s.upcoming.length], ['07:00', 7, 'ACTIVE', 0]);
    assert.strictEqual((await api('/api/v1/ops/schedules', { token: cashier })).status, 403);
  });

  it('a new departure starts two weeks out, never on a day on sale', async () => {
    const early = await api('/api/v1/ops/schedules', { method: 'POST', token: dispatcher, body: { route_id: 'rt_hn_th', departure: '19:30', valid_from: addDays(today, 3) } });
    assert.strictEqual(early.status, 400);
    const r = await api('/api/v1/ops/schedules', { method: 'POST', token: dispatcher, body: { route_id: 'rt_hn_th', departure: '19:30', days_of_week: [1, 2, 3, 4, 5], base_fare_vnd: 250000 } });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    const id = r.body.data.schedule_id;
    assert.deepStrictEqual([r.body.data.valid_from, r.body.data.status], [changeFrom, 'UPCOMING']);
    for (let n = 0; n <= 14; n++) assert.ok(!(await search(addDays(today, n))).some(t => t.schedule_id === id), `not on sale on day +${n}`);
    const firstWeekday = [0, 1, 2, 3, 4, 5, 6].map(n => addDays(changeFrom, n)).find(d => weekdayOf(d) <= 5);
    const run = runOn(id, firstWeekday);
    assert.ok(run && hhmm(run.departure_time) === '19:30' && run.base_fare_vnd === 250000 && run.stops.length > 2);

    // Not on sale yet: it is changed outright, no dated version.
    const edit = await api(`/api/v1/ops/schedules/${id}`, { method: 'PATCH', token: dispatcher, body: { departure: '20:00' } });
    assert.strictEqual(edit.status, 200, JSON.stringify(edit.body));
    assert.deepStrictEqual([edit.body.data.departure, edit.body.data.upcoming.length], ['20:00', 0]);
  });

  it('a change of a schedule on sale keeps every day on sale and starts after them', async () => {
    const soldDay = addDays(today, 2);
    const before = (await search(soldDay)).find(t => t.schedule_id === 'trp_hn_th_02');
    const tooEarly = await api('/api/v1/ops/schedules/trp_hn_th_02', { method: 'PATCH', token: dispatcher, body: { departure: '10:15', effective_from: lastSale } });
    assert.strictEqual(tooEarly.status, 400, 'the last day on sale is still on sale');

    const edit = await api('/api/v1/ops/schedules/trp_hn_th_02', { method: 'PATCH', token: dispatcher, body: { departure: '10:15', base_fare_vnd: 200000 } });
    assert.strictEqual(edit.status, 200, JSON.stringify(edit.body));
    assert.strictEqual(edit.body.data.effective_from, changeFrom);
    assert.strictEqual(edit.body.data.departure, hhmm(before.departure_time), 'today\'s settings are unchanged');
    assert.deepStrictEqual(edit.body.data.upcoming.map(u => [u.effective_from, u.departure, u.base_fare_vnd, u.locked]), [[changeFrom, '10:15', 200000, false]]);

    for (const n of [0, 2, 14]) {
      const t = (await search(addDays(today, n))).find(x => x.schedule_id === 'trp_hn_th_02');
      // Late in the day today's run has left and is no longer listed.
      if (n === 0 && !t) continue;
      assert.strictEqual(hhmm(t.departure_time), hhmm(before.departure_time), `day +${n} on sale keeps its time`);
    }
    assert.strictEqual(hhmm(runOn('trp_hn_th_02', changeFrom).departure_time), '10:15');
    assert.strictEqual(runOn('trp_hn_th_02', changeFrom).base_fare_vnd, 200000);

    const cancel = await api('/api/v1/ops/schedules/trp_hn_th_02/changes', { method: 'DELETE', token: dispatcher });
    assert.strictEqual(cancel.status, 200);
    assert.deepStrictEqual(cancel.body.data.upcoming, []);
    assert.strictEqual((await api('/api/v1/ops/schedules/trp_hn_th_02/changes', { method: 'DELETE', token: dispatcher })).body.code, 'NO_PENDING_CHANGE');
  });

  it('stopping a schedule ends it after the days on sale; the app still sees them', async () => {
    for (const id of ['trp_hn_th_01', 'trp_hn_th_02', 'trp_hn_th_03']) {
      const r = await api(`/api/v1/ops/schedules/${id}`, { method: 'PATCH', token: dispatcher, body: { active: false } });
      assert.strictEqual(r.body.data.status, 'ACTIVE', 'still running for the days on sale');
    }
    const r = await api(`/api/v1/trips/run-days?origin=${encodeURIComponent('Hà Nội')}&destination=${encodeURIComponent('Thanh Hóa')}`);
    assert.strictEqual(r.body.data.days.length, 15, 'every day on sale keeps its departures');
    assert.strictEqual(runsOn(services.searchService.templateForRoute('rt_hn_th', 'op_saomai'), changeFrom), false);
  });

  it('refuses a bad timetable and another company\'s schedule', async () => {
    const empty = await api('/api/v1/ops/schedules/trp_hn_th_01', { method: 'PATCH', token: dispatcher, body: { days_of_week: [] } });
    assert.strictEqual(empty.status, 400);
    const time = await api('/api/v1/ops/schedules', { method: 'POST', token: dispatcher, body: { route_id: 'rt_hn_th', departure: '25:00' } });
    assert.strictEqual(time.status, 400);
    const start = await api('/api/v1/ops/schedules/trp_hn_th_01', { method: 'PATCH', token: dispatcher, body: { valid_from: changeFrom } });
    assert.strictEqual(start.status, 400, 'a schedule on sale keeps its start');
    const other = await api('/api/v1/ops/schedules/trp_xv_hn_th_01', { method: 'PATCH', token: dispatcher, body: { active: false } });
    assert.strictEqual(other.status, 404);
  });
});

describe('TC-SCHED-03: trips set up beyond the window before the two-week rule follow a change', () => {
  it('an unsold one is set up again from the new timetable; a sold one is kept and reported', async () => {
    const { server, services } = createFleetBusServer({ dataDir: null });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const api = async (path, { method = 'GET', body, token } = {}) => {
      const headers = { 'Content-Type': 'application/json', 'X-Operator-Code': 'SAOMAI' };
      if (token) headers.Authorization = `Bearer ${token}`;
      if (method === 'POST') headers['Idempotency-Key'] = crypto.randomUUID();
      const res = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
      return { status: res.status, body: await res.json() };
    };
    const dispatcher = (await api('/api/v1/auth/staff/login', { method: 'POST', body: { username: 'dispatcher@busgo.vn', password: 'disp123' } })).body.data.token;
    const changeFrom = scheduleChangeFrom();
    const later = addDays(changeFrom, 3);
    // The timetable is shared by every server of this process: start from the schedule without changes.
    services.searchService.cancelScheduleChanges('op_saomai', 'trp_hn_th_03', { changeFrom });
    try {
      // Set up under the old 30-day window: one day sold, one not.
      const sold = services.searchService.materializeRun('trp_hn_th_03', changeFrom);
      const free = services.searchService.materializeRun('trp_hn_th_03', later);
      services.paymentService.tickets.set('tkt_legacy', { ticket_id: 'tkt_legacy', trip_id: sold.trip_id, operator_id: 'op_saomai' });

      const edit = await api('/api/v1/ops/schedules/trp_hn_th_03', { method: 'PATCH', token: dispatcher, body: { departure: '21:45' } });
      assert.strictEqual(edit.status, 200, JSON.stringify(edit.body));
      assert.deepStrictEqual(edit.body.data.kept_runs.map(k => k.trip_id), [sold.trip_id]);
      assert.strictEqual(services.searchService.materializeRun('trp_hn_th_03', later).departure_time.slice(11, 16), '21:45');
      assert.notStrictEqual(services.searchService.materializeRun('trp_hn_th_03', later), free, 'set up again');
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });
});
