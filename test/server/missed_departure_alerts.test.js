import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { createFleetBusServer } from '../../source/server/apiServer.js';
import { missedDepartureAlerts } from '../../source/server/core/missedDepartures.js';
import { DEMO_DATE } from '../../source/server/core/serviceDate.js';

describe('Missed departure alerts (MGR-025)', () => {
  const fixedNow = Date.parse('2026-11-04T17:30:00+07:00');

  describe('missedDepartureAlerts helper', () => {
    it('run of today 30 min past with passengers gives a RED alert with the right message', () => {
      const mockManager = {
        trips: [
          {
            trip_id: 'trp_missed_30m',
            operator_id: 'op_saomai',
            departure_time: '2026-11-04T17:00:00+07:00',
            status: 'SCHEDULED',
            vehicle_plate: '29B-882.19',
            booked_seats: 2
          }
        ]
      };

      const alerts = missedDepartureAlerts(mockManager, 'op_saomai', fixedNow);
      assert.strictEqual(alerts.length, 1);
      const a = alerts[0];
      assert.strictEqual(a.alert_id, 'alt_missed_trp_missed_30m');
      assert.strictEqual(a.type, 'DEPARTURE_MISSED');
      assert.strictEqual(a.trip_id, 'trp_missed_30m');
      assert.strictEqual(a.vehicle_plate, '29B-882.19');
      assert.strictEqual(a.severity, 'RED');
      assert.strictEqual(a.operator_id, 'op_saomai');
      assert.strictEqual(a.created_at, new Date(Date.parse('2026-11-04T17:00:00+07:00') + 15 * 60 * 1000).toISOString());
      assert.strictEqual(
        a.message,
        'Chuyến 17:00 chưa xuất bến, đã quá giờ 30 phút · 2 khách đã đặt. Gọi tài xế, hoặc hủy chuyến nếu không chạy.'
      );
      assert.ok(a.message.includes('đã quá giờ 30 phút · 2 khách đã đặt'));
    });

    it('10 h 5 min past gives 10 giờ 5 phút', () => {
      const mockManager = {
        trips: [
          {
            trip_id: 'trp_missed_10h5m',
            operator_id: 'op_saomai',
            departure_time: '2026-11-04T07:25:00+07:00',
            status: 'SCHEDULED',
            vehicle_plate: '29B-882.19',
            booked_seats: 0
          }
        ]
      };

      const alerts = missedDepartureAlerts(mockManager, 'op_saomai', fixedNow);
      assert.strictEqual(alerts.length, 1);
      const a = alerts[0];
      assert.strictEqual(a.severity, 'AMBER');
      assert.strictEqual(
        a.message,
        'Chuyến 07:25 chưa xuất bến, đã quá giờ 10 giờ 5 phút. Gọi tài xế, hoặc hủy chuyến nếu không chạy.'
      );
      assert.ok(a.message.includes('10 giờ 5 phút'));
    });

    it('10 h past gives 10 giờ (exact hours omit " M phút")', () => {
      const mockManager = {
        trips: [
          {
            trip_id: 'trp_missed_10h',
            operator_id: 'op_saomai',
            departure_time: '2026-11-04T07:00:00+07:00',
            status: 'SCHEDULED',
            vehicle_plate: '29B-882.19',
            booked_seats: 0
          }
        ]
      };

      const at1700 = Date.parse('2026-11-04T17:00:00+07:00');
      const alerts = missedDepartureAlerts(mockManager, 'op_saomai', at1700);
      assert.strictEqual(alerts.length, 1);
      const a = alerts[0];
      assert.strictEqual(
        a.message,
        'Chuyến 07:00 chưa xuất bến, đã quá giờ 10 giờ. Gọi tài xế, hoặc hủy chuyến nếu không chạy.'
      );
    });

    it('hours without extra minutes omits " M phút"', () => {
      const mockManager = {
        trips: [
          {
            trip_id: 'trp_missed_1h',
            operator_id: 'op_saomai',
            departure_time: '2026-11-04T16:30:00+07:00',
            status: 'DISPATCHED',
            vehicle_plate: '29B-123.45',
            booked_seats: 0
          }
        ]
      };

      const alerts = missedDepartureAlerts(mockManager, 'op_saomai', fixedNow);
      assert.strictEqual(alerts.length, 1);
      assert.strictEqual(
        alerts[0].message,
        'Chuyến 16:30 chưa xuất bến, đã quá giờ 1 giờ. Gọi tài xế, hoặc hủy chuyến nếu không chạy.'
      );
    });

    it('an IN_TRANSIT, COMPLETED or CANCELLED run, a run 10 min past, a run of another operator, and a demo-day trip give none', () => {
      const mockManager = {
        trips: [
          // IN_TRANSIT run
          {
            trip_id: 'trp_in_transit',
            operator_id: 'op_saomai',
            departure_time: '2026-11-04T17:00:00+07:00',
            status: 'IN_TRANSIT',
            booked_seats: 5
          },
          // COMPLETED run
          {
            trip_id: 'trp_completed',
            operator_id: 'op_saomai',
            departure_time: '2026-11-04T17:00:00+07:00',
            status: 'COMPLETED',
            booked_seats: 5
          },
          // CANCELLED run
          {
            trip_id: 'trp_cancelled',
            operator_id: 'op_saomai',
            departure_time: '2026-11-04T17:00:00+07:00',
            status: 'CANCELLED',
            booked_seats: 5
          },
          // 10 minutes past departure (17:20 vs 17:30)
          {
            trip_id: 'trp_10m_past',
            operator_id: 'op_saomai',
            departure_time: '2026-11-04T17:20:00+07:00',
            status: 'SCHEDULED',
            booked_seats: 5
          },
          // Another operator's trip
          {
            trip_id: 'trp_other_op',
            operator_id: 'op_xuyenviet',
            departure_time: '2026-11-04T17:00:00+07:00',
            status: 'SCHEDULED',
            booked_seats: 5
          },
          // Fixed demo-day trip
          {
            trip_id: 'trp_demo_day',
            operator_id: 'op_saomai',
            departure_time: `${DEMO_DATE}T07:00:00+07:00`,
            status: 'SCHEDULED',
            booked_seats: 5
          }
        ]
      };

      const alerts = missedDepartureAlerts(mockManager, 'op_saomai', fixedNow);
      assert.strictEqual(alerts.length, 0);

      // Even if clock was on demo day, demo day trips are ignored
      const demoNow = Date.parse(`${DEMO_DATE}T17:00:00+07:00`);
      const demoAlerts = missedDepartureAlerts(mockManager, 'op_saomai', demoNow);
      assert.strictEqual(demoAlerts.length, 0);
    });
  });

  describe('HTTP endpoints integration', () => {
    let server;
    let services;
    let baseUrl;
    let opsToken;

    const request = async (path, { method = 'GET', body, token } = {}) => {
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      if (method === 'POST') headers['Idempotency-Key'] = crypto.randomUUID();
      const res = await fetch(`${baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body)
      });
      return { status: res.status, body: await res.json() };
    };

    before(async () => {
      ({ server, services } = createFleetBusServer());
      await new Promise(resolve => server.listen(0, resolve));
      baseUrl = `http://127.0.0.1:${server.address().port}`;

      const loginRes = await request('/api/v1/ops/auth/login', {
        method: 'POST',
        body: { username: 'dispatcher@busgo.vn', password: 'disp123' }
      });
      assert.strictEqual(loginRes.status, 200);
      opsToken = loginRes.body.data.token;
    });

    after(() => new Promise(resolve => server.close(resolve)));

    it('GET /api/v1/ops/alerts returns derived missed departure alert first', async () => {
      const tripId = 'trp_http_missed_test';
      services.managerService.trips.push({
        trip_id: tripId,
        operator_id: 'op_saomai',
        departure_time: '2026-11-04T17:00:00+07:00',
        status: 'SCHEDULED',
        vehicle_plate: '29B-882.19',
        booked_seats: 3
      });

      const res = await request(`/api/v1/ops/alerts?now=${fixedNow}`, { token: opsToken });
      assert.strictEqual(res.status, 200);
      assert.ok(res.body.data.total >= 1);
      const alerts = res.body.data.alerts;
      assert.ok(alerts.length >= 1);

      // Derived alerts are put first
      const first = alerts[0];
      assert.strictEqual(first.alert_id, `alt_missed_${tripId}`);
      assert.strictEqual(first.type, 'DEPARTURE_MISSED');
      assert.strictEqual(first.trip_id, tripId);
      assert.strictEqual(first.vehicle_plate, '29B-882.19');
      assert.strictEqual(first.severity, 'RED');
      assert.ok(first.message.includes('đã quá giờ 30 phút · 3 khách đã đặt'));

      // Clean up trip
      const idx = services.managerService.trips.findIndex(t => t.trip_id === tripId);
      if (idx !== -1) services.managerService.trips.splice(idx, 1);
    });

    it('the KPI count in GET /api/v1/ops/dashboard/kpis includes derived missed departure alerts', async () => {
      // Base KPI count without missed trip
      const baseRes = await request(`/api/v1/ops/dashboard/kpis?now=${fixedNow}`, { token: opsToken });
      assert.strictEqual(baseRes.status, 200);
      const baseCount = baseRes.body.data.kpi_metrics.active_alerts_count;

      const tripId = 'trp_kpi_missed_test';
      services.managerService.trips.push({
        trip_id: tripId,
        operator_id: 'op_saomai',
        departure_time: '2026-11-04T17:00:00+07:00',
        status: 'SCHEDULED',
        vehicle_plate: '29B-999.88',
        booked_seats: 1
      });

      const resWithMissed = await request(`/api/v1/ops/dashboard/kpis?now=${fixedNow}`, { token: opsToken });
      assert.strictEqual(resWithMissed.status, 200);
      assert.strictEqual(resWithMissed.body.data.kpi_metrics.active_alerts_count, baseCount + 1);

      // Clean up trip
      const idx = services.managerService.trips.findIndex(t => t.trip_id === tripId);
      if (idx !== -1) services.managerService.trips.splice(idx, 1);
    });
  });

  describe('Manager web distribution index.html overview alerts', () => {
    it('index.html maps alert codes to Vietnamese labels and supports clickable alerts', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const vm = await import('vm');
      const htmlPath = path.resolve('source/manager/web_dist/index.html');
      const html = fs.readFileSync(htmlPath, 'utf8');

      // Check inline script parses with node vm
      const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
      assert.ok(scriptMatch, 'index.html must have an inline script');
      assert.doesNotThrow(() => new vm.Script(scriptMatch[1]), 'Inline script must parse cleanly');

      // Check Vietnamese labels mapping
      assert.ok(html.includes("DEPARTURE_MISSED: 'Chưa xuất bến'"));
      assert.ok(html.includes("DELAY_WARNING: 'Trễ giờ'"));
      assert.ok(html.includes("TRIP_DELAY: 'Trễ giờ'"));
      assert.ok(html.includes("GPS_LIVE: 'GPS'"));
      assert.ok(html.includes("PAYMENT_AMOUNT_MISMATCH: 'Sai số tiền'"));
      assert.ok(html.includes("PAYMENT_UNMATCHED: 'Tiền chưa khớp đơn'"));
      assert.ok(html.includes("PAYMENT_UNMATCHED_OVERDUE: 'Tiền chưa khớp đơn'"));
      assert.ok(html.includes("TRIP_ENDED_EARLY: 'Kết thúc sớm'"));
      assert.ok(html.includes("SOS_INCIDENT: 'Sự cố'"));

      // Check clickable row attributes & behavior
      assert.ok(html.includes('role="button"'));
      assert.ok(html.includes('tabindex="0"'));
      assert.ok(html.includes('cursor:pointer'));
      assert.ok(html.includes("show('dispatch')"));
      assert.ok(html.includes('openTrip(el.dataset.tripId)'));
    });
  });
});
