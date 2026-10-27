import { describe, it } from 'node:test';
import assert from 'node:assert';
import { homeAppointments, homeRunOutlook } from '../../source/server/core/homeRun.js';

/** Appointments are times the bus can keep, and the driver sees when a run no longer fits the departure. */
describe('Home run appointments and outlook', () => {
  const FROM = Date.parse('2026-10-26T15:15:00.000Z'); // 22:15 VN
  const TO = Date.parse('2026-10-26T16:00:00.000Z'); // 23:00 VN
  const home = (id, lat, lng) => ({
    ticket_id: id,
    boarding_status: 'NOT_BOARDED',
    home_pickup: { status: 'CONFIRMED', lat, lng, window_from: new Date(FROM).toISOString(), window_to: new Date(TO).toISOString() }
  });
  // The four doors of the live test of 26/10: Cầu Giấy, Long Biên, Hoàn Kiếm, Bạch Mai; departure 23:30 from Giáp Bát.
  const trip = () => ({
    planned_departure_time: '2026-10-26T23:30:00+07:00',
    stops: [{ stop_id: 'stp_hn_gb' }],
    home_order: ['cg', 'lb', 'hk', 'bm'],
    manifest: [home('cg', 21.0362, 105.7906), home('lb', 21.04, 105.89), home('hk', 21.0285, 105.8542), home('bm', 21.0059, 105.8573)]
  });

  it('TC-HOME-PLAN-01: a run longer than the window gets its real times, not all of them at the window end', () => {
    const times = homeAppointments(trip(), { now: FROM - 3600000 });
    assert.strictEqual(times.cg, new Date(FROM).toISOString());
    const later = ['lb', 'hk', 'bm'].map(id => Date.parse(times[id]));
    assert.ok(later.every((t, i) => i === 0 || t > later[i - 1]), 'each door after the one before');
    assert.ok(later.at(-1) > TO, 'the last door is past the window, as the bus will be');
  });

  it('TC-HOME-PLAN-02: a run started after the window opened never gives a time already gone', () => {
    const now = FROM + 75 * 60000; // 23:30: the window opened 75 minutes ago
    const times = homeAppointments(trip(), { now });
    assert.ok(Object.values(times).every(t => Date.parse(t) >= now));
  });

  it('TC-HOME-PLAN-03: the outlook says when the bus is back at the first stop, how late, and who is past the window', () => {
    const t = trip();
    const outlook = homeRunOutlook(t, FROM - 3600000);
    assert.ok(outlook.late_departure_minutes > 0, `back at ${outlook.back_at}`);
    assert.ok(Date.parse(outlook.back_at) > Date.parse(t.planned_departure_time));
    assert.deepStrictEqual(outlook.past_window, ['hk', 'bm']);

    // Two doors fit: nothing to warn about.
    t.manifest = t.manifest.filter(p => ['hk', 'bm'].includes(p.ticket_id));
    t.home_order = ['hk', 'bm'];
    const short = homeRunOutlook(t, FROM - 3600000);
    assert.strictEqual(short.late_departure_minutes, 0);
    assert.deepStrictEqual(short.past_window, []);
  });
});
