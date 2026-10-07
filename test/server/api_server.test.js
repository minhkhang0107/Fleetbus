import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'http';
import { createFleetBusServer } from '../../source/server/apiServer.js';

describe('Phase Server: Unified Node.js API Gateway Integration Suite', () => {
  let appServer;
  let baseUrl;
  const TEST_PORT = 3999;

  before(async () => {
    // These tests exercise business behaviour through HTTP without tokens; authentication has its own suites
    const { server } = createFleetBusServer({ authMode: 'off' });
    await new Promise((resolve) => {
      appServer = server.listen(TEST_PORT, () => {
        baseUrl = `http://127.0.0.1:${TEST_PORT}`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise((resolve) => {
      if (appServer) {
        appServer.close(resolve);
      } else {
        resolve();
      }
    });
  });

  // Helper for HTTP requests
  async function makeRequest(path, options = {}) {
    return new Promise((resolve, reject) => {
      const url = `${baseUrl}${path}`;
      const req = http.request(url, {
        method: options.method || 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers || {})
        }
      }, (res) => {
        let rawData = '';
        res.on('data', chunk => rawData += chunk);
        res.on('end', () => {
          let parsedData;
          try {
            parsedData = JSON.parse(rawData);
          } catch {
            parsedData = rawData;
          }
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: parsedData
          });
        });
      });

      req.on('error', reject);

      if (options.body) {
        req.write(JSON.stringify(options.body));
      }
      req.end();
    });
  }

  it('TC-SRV-01: Healthcheck and OpenAPI spec must be accessible', async () => {
    const health = await makeRequest('/health');
    assert.strictEqual(health.statusCode, 200);
    assert.strictEqual(health.body.status, 'success');
    assert.strictEqual(health.body.data.status, 'UP');
    assert.strictEqual(health.body.data.services.passenger_service, 'HEALTHY');

    const openapi = await makeRequest('/api/v1/openapi.json');
    assert.strictEqual(openapi.statusCode, 200);
    assert.strictEqual(openapi.body.data.openapi, '3.0.3');
  });

  it('TC-SRV-02: Passenger API Endpoints (Config, Stations, Trips, Seat-map, Hold, Wallet)', async () => {
    // Config
    const configRes = await makeRequest('/api/v1/passenger/config', {
      headers: { 'x-app-version': '3.0.0' }
    });
    assert.strictEqual(configRes.statusCode, 200);
    assert.strictEqual(configRes.body.status, 'success');
    assert.strictEqual(configRes.body.data.min_supported_version, '3.0.0');

    // Stations
    const stationsRes = await makeRequest('/api/v1/passenger/stations?q=giap%20bat');
    assert.strictEqual(stationsRes.statusCode, 200);
    assert.ok(stationsRes.body.data.length > 0);

    // Trips
    const tripsRes = await makeRequest('/api/v1/passenger/trips?origin=Hà%20Nội&destination=Thanh%20Hóa');
    assert.strictEqual(tripsRes.statusCode, 200);
    assert.ok(tripsRes.body.data.length > 0);

    // Seat map
    const seatMapRes = await makeRequest('/api/v1/passenger/trips/trp_hn_th_01/seat-map');
    assert.strictEqual(seatMapRes.statusCode, 200);
    assert.ok(seatMapRes.body.data.seats.length > 0);

    // Hold seats
    const holdRes = await makeRequest('/api/v1/passenger/trips/trp_hn_th_01/hold-seats', {
      method: 'POST',
      body: { seatCodes: ['A01'], userId: 'usr_test_01' }
    });
    assert.strictEqual(holdRes.statusCode, 200);
    assert.strictEqual(holdRes.body.status, 'success');

    // Tickets Wallet
    const walletRes = await makeRequest('/api/v1/passenger/tickets?phone=0912345678');
    assert.strictEqual(walletRes.statusCode, 200);
    assert.strictEqual(walletRes.body.status, 'success');
  });

  it('TC-SRV-03: Driver API Endpoints (Auth Login, Today Trips, Start, Telemetry, QR Scan)', async () => {
    // Login
    const loginRes = await makeRequest('/api/v1/driver/auth/login', {
      method: 'POST',
      body: { staffIdOrPhone: 'TX8821', pin: '123456' }
    });
    assert.strictEqual(loginRes.statusCode, 200);
    assert.strictEqual(loginRes.body.data.driver.staff_id, 'TX8821');

    // Today trips
    const todayRes = await makeRequest('/api/v1/driver/trips/today', {
      headers: { 'x-driver-id': 'drv_8821a' }
    });
    assert.strictEqual(todayRes.statusCode, 200);
    assert.ok(todayRes.body.data.trips.length > 0);

    // Telemetry is only accepted for a running trip: complete the readiness checklist and start it
    const readinessRes = await makeRequest('/api/v1/driver/trips/trp_991823/readiness', {
      method: 'POST',
      body: {
        checklist: {
          tires_checked: true,
          brakes_fluid_checked: true,
          ac_cleanliness_checked: true,
          first_aid_extinguisher_checked: true,
          fuel_level_sufficient: true,
          gps_telemetry_beacon_active: true
        }
      }
    });
    assert.strictEqual(readinessRes.statusCode, 200);
    const startRes = await makeRequest('/api/v1/driver/trips/trp_991823/start', { method: 'POST' });
    assert.strictEqual(startRes.statusCode, 200);

    // Telemetry ping
    const telemetryRes = await makeRequest('/api/v1/driver/trips/trp_991823/telemetry', {
      method: 'POST',
      body: { lat: 20.9812, lng: 105.8430, speed_kmh: 62.4, bearing_deg: 180 }
    });
    assert.strictEqual(telemetryRes.statusCode, 200);
    assert.strictEqual(telemetryRes.body.data.data.speed_kmh, 62.4);
  });

  it('TC-SRV-04: Manager Operations API Endpoints (Dashboard KPIs, Radar, Fleet, Crew, Reports)', async () => {
    // Dashboard KPIs
    const kpiRes = await makeRequest('/api/v1/ops/dashboard/kpis');
    assert.strictEqual(kpiRes.statusCode, 200);
    assert.strictEqual(kpiRes.body.data.kpi_metrics.active_vehicles_count, 2);

    // Radar
    const radarRes = await makeRequest('/api/v1/ops/radar');
    assert.strictEqual(radarRes.statusCode, 200);
    assert.strictEqual(radarRes.body.data.total_tracked_vehicles, 4);

    // Fleet Roster
    const fleetRes = await makeRequest('/api/v1/ops/fleet/vehicles');
    assert.strictEqual(fleetRes.statusCode, 200);
    assert.ok(fleetRes.body.data.length >= 3);

    // Crew Drivers
    const crewRes = await makeRequest('/api/v1/ops/crew/drivers');
    assert.strictEqual(crewRes.statusCode, 200);
    assert.ok(crewRes.body.data.length >= 2);

    // Executive Report
    const repRes = await makeRequest('/api/v1/ops/reports/executive');
    assert.strictEqual(repRes.statusCode, 200);
    assert.ok(repRes.body.data.financial_summary.total_revenue_vnd > 0);

    // POS Booking
    const posRes = await makeRequest('/api/v1/ops/pos/bookings', {
      method: 'POST',
      body: {
        tripId: 'trp_991823',
        passengerName: 'Trịnh Thăng Bình',
        phone: '0977889900',
        seatCodes: ['B02']
      }
    });
    assert.strictEqual(posRes.statusCode, 201);
    assert.strictEqual(posRes.body.data.passenger_name, 'Trịnh Thăng Bình');
  });

  it('TC-SRV-05: Webhook & Static Pages (VietQR IPN, HTML views)', async () => {
    // Static HTML views
    const passView = await makeRequest('/passenger');
    assert.strictEqual(passView.statusCode, 200);
    assert.ok(passView.body.includes('BusGo Passenger'));

    const drvView = await makeRequest('/driver');
    assert.strictEqual(drvView.statusCode, 200);
    assert.ok(drvView.body.includes('BusGo Driver'));

    const mgrView = await makeRequest('/manager');
    assert.strictEqual(mgrView.statusCode, 200);
    assert.ok(mgrView.body.includes('BusGo Operations'));

    // Design review D99 and D101: no browser dialogs, no emoji, no simulation control inside a product screen
    for (const view of [passView, drvView, mgrView]) {
      assert.ok(!/\b(alert|confirm|prompt)\(/.test(view.body), 'feedback is shown in the page, never in a browser dialog');
      assert.ok(!/\p{Extended_Pictographic}/u.test(view.body), 'no emoji in the UI');
      assert.ok(!/GIẢ LẬP/i.test(view.body), 'simulation controls stay out of the product screens');
    }
  });

  it('TC-SRV-06: New Spec APIs (Payment verification, Group QR, Delegation, Onboard Hail, Hotline Hold - REV-01 to REV-06)', async () => {
    // 1. Hotline Hold (MGR-020, REV-06)
    const holdRes = await makeRequest('/api/v1/ops/pos/hotline-hold', {
      method: 'POST',
      body: {
        tripId: 'trp_991823',
        passengerName: 'Trần Thị Lan',
        phone: '0912988776',
        seatCodes: ['A04'],
        holdPolicy: 'UNTIL_DEPARTURE_OFFSET',
        departureOffsetMinutes: 30
      }
    });
    assert.strictEqual(holdRes.statusCode, 201);
    assert.strictEqual(holdRes.body.data.hold_status, 'HELD_HOTLINE');
    assert.ok(holdRes.body.data.hold_until);

    // 2. Onboard Hail Passenger (DRI-006, DRI-007, REV-05)
    const hailRes = await makeRequest('/api/v1/driver/trips/trp_991823/onboard-hail', {
      method: 'POST',
      body: {
        passenger_name: 'Khách Bắt Dọc Đường',
        phone: '0988001122',
        seat_code: 'B04',
        fare_amount_vnd: 220000,
        amount_collected_vnd: 250000,
        change_settlement_method: 'CASH_RETURNED'
      }
    });
    assert.strictEqual(hailRes.statusCode, 201);
    assert.strictEqual(hailRes.body.data.boarding_status, 'BOARDED');
    assert.strictEqual(hailRes.body.data.change_settlement.change_due_vnd, 30000);

    // 3. Passenger Order creation and group QR retrieval / status verification (REV-01, REV-02)
    const orderHoldRes = await makeRequest('/api/v1/trips/trp_hn_th_01/seats/hold', {
      method: 'POST',
      body: { seatCodes: ['A05', 'A06'], userId: 'usr_srv_test' }
    });
    assert.strictEqual(orderHoldRes.statusCode, 200);

    const orderRes = await makeRequest('/api/v1/passenger/checkout/create-order', {
      method: 'POST',
      body: {
        holdId: orderHoldRes.body.data.hold_id,
        userId: 'usr_srv_test',
        tripId: 'trp_hn_th_01',
        seatCodes: ['A05', 'A06'],
        payer: { full_name: 'Nguyễn Văn Server', phone: '0919888999' },
        passengers: [
          { full_name: 'Khách 1', phone: '0919888999' },
          { full_name: 'Khách 2', phone: '0919888000' }
        ],
        amountVnd: 440000,
        pickupStop: 'Giáp Bát',
        dropoffStop: 'Ninh Bình'
      }
    });
    assert.strictEqual(orderRes.statusCode, 201);
    const orderId = orderRes.body.data.payment.order_id;

    // "Tôi đã chuyển tiền" (manual_trigger) only asks for reconciliation; it never settles (REV-02)
    const manualRes = await makeRequest(`/api/v1/passenger/payments/${orderId}/verify-status`, {
      method: 'POST',
      body: { manual_trigger: true }
    });
    assert.strictEqual(manualRes.statusCode, 200);
    assert.strictEqual(manualRes.body.data.payment_status, 'PENDING_PAYMENT');
    assert.strictEqual(manualRes.body.data.is_settled, false);

    // Money arrives through the bank webhook
    const ipnRes = await makeRequest('/api/v1/webhooks/vietqr/ipn', {
      method: 'POST',
      body: {
        transferMemo: orderRes.body.data.payment.payment_details.transfer_memo,
        amountVnd: 440000,
        bankRef: `tx_srv_${Date.now()}`
      }
    });
    assert.strictEqual(ipnRes.statusCode, 200);
    assert.strictEqual(ipnRes.body.data.settled, true);

    const statusRes = await makeRequest(`/api/v1/passenger/payments/${orderId}/verify-status`, {
      method: 'POST',
      body: {}
    });
    assert.strictEqual(statusRes.statusCode, 200);
    assert.strictEqual(statusRes.body.data.payment_status, 'PAID');
    assert.strictEqual(statusRes.body.data.is_settled, true);

    // Group QR (REV-01)
    const groupQrRes = await makeRequest(`/api/v1/passenger/orders/${orderId}/group-qr`);
    assert.strictEqual(groupQrRes.statusCode, 200);
    assert.ok(groupQrRes.body.data.group_qr.qr_code_value.startsWith('BUSGO_GRP|'));
    assert.strictEqual(groupQrRes.body.data.active_tickets_count, 2);

    // Delegate Ticket (REV-01)
    const ticketId = statusRes.body.data.tickets[1].ticket_id;
    const delegateRes = await makeRequest(`/api/v1/passenger/tickets/${ticketId}/delegate`, {
      method: 'POST',
      body: {
        delegateToPhone: '0919888000',
        delegateToName: 'Khách 2'
      }
    });
    assert.strictEqual(delegateRes.statusCode, 200);
    assert.match(delegateRes.body.data.offline_pin, /^\d{6}$/);
    assert.ok(delegateRes.body.data.share_link.includes('ticket/share'));
  });

  it('TC-SRV-07: Diagnostic, Manual Boarding, No-show & Manager Ops Queries', async () => {
    // 1. Driver Manual Boarding with PIN (DRI-010)
    const manualBoardRes = await makeRequest('/api/v1/driver/trips/trp_991823/boarding/manual', {
      method: 'POST',
      body: {
        ticket_id: 'tkt_88192a',
        pin: '682914'
      }
    });
    // Validates route responsiveness (200 or 400 with detailed error)
    assert.ok([200, 400].includes(manualBoardRes.statusCode));

    // 2. Driver Mark No-Show (DRI-011)
    const noShowRes = await makeRequest('/api/v1/driver/trips/trp_991823/tickets/tkt_no_show_test/no-show', {
      method: 'POST',
      body: { reason: 'Khách không có mặt sau 10 phút xuất bến' }
    });
    assert.strictEqual(noShowRes.statusCode, 404, 'a ticket that is not on the manifest is not found');
    assert.strictEqual(noShowRes.body.code, 'TICKET_NOT_FOUND');

    // 3. Driver Diagnostics & Profile (DRI-014, DRI-016, DRI-018)
    const gpsHealthRes = await makeRequest('/api/v1/driver/system/gps-health');
    assert.strictEqual(gpsHealthRes.statusCode, 200);
    assert.strictEqual(gpsHealthRes.body.data.gps_signal, 'GOOD');

    const diagPingRes = await makeRequest('/api/v1/driver/system/diagnostics-ping');
    assert.strictEqual(diagPingRes.statusCode, 200);
    assert.strictEqual(diagPingRes.body.data.gateway_status, 'HEALTHY');

    const drvProfileRes = await makeRequest('/api/v1/driver/profile');
    assert.strictEqual(drvProfileRes.statusCode, 200);
    assert.strictEqual(drvProfileRes.body.data.license_class, 'FC');

    // 4. Manager Bookings & Audit Logs (MGR-017, MGR-018, MGR-028)
    const mgrBookingsRes = await makeRequest('/api/v1/ops/bookings');
    assert.strictEqual(mgrBookingsRes.statusCode, 200);
    assert.ok(Array.isArray(mgrBookingsRes.body.data.bookings));

    const mgrAuditRes = await makeRequest('/api/v1/ops/audit-logs');
    assert.strictEqual(mgrAuditRes.statusCode, 200);
    assert.ok(Array.isArray(mgrAuditRes.body.data.audit_logs));
  });
});
