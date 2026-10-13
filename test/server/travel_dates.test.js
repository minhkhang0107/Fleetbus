import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { createFleetBusServer } from '../../source/server/apiServer.js';
import { addDays, checkBookableDeparture, checkTravelDate, parseRunId, parseServiceDate, serviceCalendar, vnDate } from '../../source/server/core/serviceDate.js';

const NOW = Date.parse('2026-10-11T07:00:00Z'); // 14:00 in Vietnam

describe('Travel dates: Vietnam calendar, 30-day booking window, one run per day', () => {
  describe('rules', () => {
    it('accepts only a real YYYY-MM-DD', () => {
      assert.strictEqual(parseServiceDate('2026-10-15'), '2026-10-15');
      for (const bad of ['28/08', '2026-2-1', '2026-02-30', '2026-13-01', '2026-10-15T00:00:00Z', '', null, 20261015]) {
        assert.strictEqual(parseServiceDate(bad), null, String(bad));
      }
    });

    it('today is the Vietnam calendar day, whatever the server time zone', () => {
      assert.strictEqual(vnDate(Date.parse('2026-10-10T16:59:00Z')), '2026-10-10');
      assert.strictEqual(vnDate(Date.parse('2026-10-10T17:00:00Z')), '2026-10-11', 'midnight in Hà Nội');
      assert.strictEqual(addDays('2026-12-31', 1), '2027-01-01');
    });

    it('books from today to 14 days ahead, nothing before or after', () => {
      const cal = serviceCalendar(NOW, { production: true });
      assert.deepStrictEqual({ today: cal.today, last: cal.last_date, demo: cal.demo_dates }, { today: '2026-10-11', last: '2026-10-25', demo: [] });
      assert.strictEqual(checkTravelDate('2026-10-11', NOW).ok, true);
      assert.strictEqual(checkTravelDate('2026-10-25', NOW).ok, true);
      assert.strictEqual(checkTravelDate('2026-10-10', NOW).code, 'DATE_IN_PAST');
      assert.strictEqual(checkTravelDate('2026-10-26', NOW).code, 'DATE_BEYOND_WINDOW');
      assert.strictEqual(checkTravelDate('11/10/2026', NOW).code, 'INVALID_DATE');
      assert.strictEqual(checkTravelDate('2026-08-28', NOW, { production: false }).ok, true, 'the seed demo day outside production');
      assert.strictEqual(checkTravelDate('2026-08-28', NOW, { production: true }).code, 'DATE_IN_PAST');
    });

    it('a run that already left, or beyond the window, is not sold', () => {
      assert.strictEqual(checkBookableDeparture('2026-10-11T13:30:00+07:00', NOW, { production: true }).code, 'TRIP_DEPARTED');
      assert.strictEqual(checkBookableDeparture('2026-10-11T19:30:00+07:00', NOW, { production: true }).ok, true);
      assert.strictEqual(checkBookableDeparture('2026-12-01T07:00:00+07:00', NOW, { production: true }).code, 'DATE_BEYOND_WINDOW');
      assert.strictEqual(checkBookableDeparture('not a time', NOW, { production: true }).code, 'TRIP_NOT_BOOKABLE');
      assert.deepStrictEqual(parseRunId('trp_hn_th_01_20261015'), { templateId: 'trp_hn_th_01', date: '2026-10-15' });
      assert.strictEqual(parseRunId('trp_hn_th_01'), null);
      assert.strictEqual(parseRunId('trp_hn_th_01_20261332'), null);
    });
  });

  describe('HTTP', () => {
    let server;
    let baseUrl;
    let token;
    const day = addDays(vnDate(Date.now()), 3);
    const request = async (path, { method = 'GET', body } = {}) => {
      const headers = { 'Content-Type': 'application/json', 'X-Operator-Code': 'SAOMAI' };
      if (token) headers.Authorization = `Bearer ${token}`;
      if (method === 'POST') headers['Idempotency-Key'] = crypto.randomUUID();
      const res = await fetch(`${baseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
      return { status: res.status, body: await res.json() };
    };

    before(async () => {
      ({ server } = createFleetBusServer());
      await new Promise(resolve => server.listen(0, resolve));
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      const otp = await request('/api/v1/auth/passenger/otp/request', { method: 'POST', body: { phone: '0903334455' } });
      token = (await request('/api/v1/auth/passenger/otp/verify', { method: 'POST', body: { phone: '0903334455', otp: otp.body.data.mock_otp } })).body.data.token;
    });

    after(() => new Promise(resolve => server.close(resolve)));

    it('the app gets today and the last bookable day from the server', async () => {
      const cal = (await request('/api/v1/app/config?operator=SAOMAI')).body.data.service_calendar;
      assert.strictEqual(cal.today, vnDate(Date.now()));
      assert.strictEqual(cal.last_date, addDays(cal.today, 14));
      assert.strictEqual(cal.timezone, 'Asia/Ho_Chi_Minh');
    });

    it('a travel day lists that day\'s runs, each with its own id and departure on that day', async () => {
      const res = await request(`/api/v1/trips/search?origin=Hà Nội&destination=Thanh Hóa&date=${day}`);
      assert.strictEqual(res.status, 200, JSON.stringify(res.body));
      assert.ok(res.body.data.length >= 3);
      for (const t of res.body.data) {
        assert.ok(t.trip_id.endsWith(day.replaceAll('-', '')), t.trip_id);
        assert.strictEqual(t.departure_time.slice(0, 10), day);
      }
      const other = await request(`/api/v1/trips/search?origin=Hà Nội&destination=Thanh Hóa&date=${addDays(day, 1)}`);
      assert.notDeepStrictEqual(other.body.data.map(t => t.trip_id), res.body.data.map(t => t.trip_id), 'another day, other runs');
    });

    it('refuses a malformed day, a past day and a day beyond 14 days', async () => {
      for (const [date, code] of [['28/08', 'INVALID_DATE'], ['2026-02-30', 'INVALID_DATE'], [addDays(vnDate(Date.now()), -1), 'DATE_IN_PAST'], [addDays(vnDate(Date.now()), 15), 'DATE_BEYOND_WINDOW']]) {
        const res = await request(`/api/v1/trips/search?date=${encodeURIComponent(date)}`);
        assert.strictEqual(res.status, 400, date);
        assert.strictEqual(res.body.code, code, date);
      }
    });

    it('a run has a free cabin and is booked like any trip', async () => {
      const tripId = `trp_hn_th_01_${day.replaceAll('-', '')}`;
      const map = await request(`/api/v1/trips/${tripId}/seat-map`);
      assert.strictEqual(map.status, 200, JSON.stringify(map.body));
      assert.ok(map.body.data.seats.every(s => s.state === 'AVAILABLE'), 'no seed bookings on a new day');
      const hold = await request(`/api/v1/passenger/trips/${tripId}/hold-seats`, { method: 'POST', body: { seatCodes: ['A03'], pickupStopId: 'stp_hn_gb', dropoffStopId: 'stp_th_pb' } });
      assert.strictEqual(hold.status, 200, JSON.stringify(hold.body));
      const order = await request('/api/v1/passenger/bookings/create', { method: 'POST', body: { tripId, holdId: hold.body.data.hold_id, seatCodes: ['A03'], payer: { full_name: 'Lê Văn Ngày', phone: '0903334455' }, passengers: [{ seat_code: 'A03', full_name: 'Lê Văn Ngày', phone: '0903334455' }] } });
      assert.strictEqual(order.status, 201, JSON.stringify(order.body));
      assert.strictEqual(order.body.data.payment.departure_time.slice(0, 10), day);
    });

    it('a crafted run id for a past or far day cannot be held or found', async () => {
      const past = `trp_hn_th_01_${addDays(vnDate(Date.now()), -1).replaceAll('-', '')}`;
      const held = await request(`/api/v1/passenger/trips/${past}/hold-seats`, { method: 'POST', body: { seatCodes: ['A01'] } });
      assert.strictEqual(held.status, 409, JSON.stringify(held.body));
      assert.strictEqual(held.body.code, 'TRIP_DEPARTED');
      const far = `trp_hn_th_01_${addDays(vnDate(Date.now()), 90).replaceAll('-', '')}`;
      assert.strictEqual((await request(`/api/v1/trips/${far}`)).status, 404);
    });
  });
});
