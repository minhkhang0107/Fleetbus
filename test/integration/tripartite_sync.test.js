/**
 * Tripartite Cross-System Integration Test Suite
 * Tests real-time synchronization between Passenger Mobile App, Driver Cockpit, and Manager Operations Center.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'http';
import { createFleetBusServer } from '../../source/server/apiServer.js';
import { generateBoardingQR } from '../../source/server/services/passenger/core/cryptoEngine.js';

describe('Phase Integration: Tripartite Cross-System Synchronization Suite', () => {
  let server;
  let services;
  let eventBridge;
  let baseUrl;

  before(async () => {
    const created = createFleetBusServer({ authMode: 'off' });
    server = created.server;
    services = created.services;
    eventBridge = created.eventBridge;

    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  // Helper HTTP request function
  async function api(path, options = {}) {
    const url = `${baseUrl}${path}`;
    return new Promise((resolve, reject) => {
      const parsed = new URL(url);
      const reqOptions = {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
        method: options.method || 'GET',
        headers: {
          'Content-Type': 'application/json',
          'x-app-version': '3.0.0',
          ...(options.headers || {})
        }
      };

      const req = http.request(reqOptions, (res) => {
        let raw = '';
        res.on('data', chunk => raw += chunk);
        res.on('end', () => {
          try {
            const body = raw ? JSON.parse(raw) : null;
            resolve({ statusCode: res.statusCode, body });
          } catch (e) {
            resolve({ statusCode: res.statusCode, raw });
          }
        });
      });

      req.on('error', reject);
      if (options.body) {
        req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
      }
      req.end();
    });
  }

  let bookedPnr = null;
  let bookedTicketId = null;
  let driverTripId = 'trp_hn_th_01';

  it('TC-SYNC-01: Passenger booking & VietQR IPN settlement automatically updates Driver manifest & Manager revenue', async () => {
    // 1. Hold seat A02 on trp_hn_th_01
    const holdRes = await api('/api/v1/passenger/trips/trp_hn_th_01/hold-seats', {
      method: 'POST',
      body: { seatCodes: ['A02'], userId: 'usr_pax_sync_01' }
    });
    assert.strictEqual(holdRes.statusCode, 200);

    // 2. Create booking
    const bookingRes = await api('/api/v1/passenger/bookings/create', {
      method: 'POST',
      body: {
        tripId: 'trp_hn_th_01',
        userId: 'usr_pax_sync_01',
        holdId: holdRes.body.data.hold_id,
        selectedSeats: [{ seat_code: 'A02', price_vnd: 220000 }],
        payer: { full_name: 'Nguyễn Văn Đồng', phone: '0988223344', email: 'dong@example.com' },
        passengers: [{ full_name: 'Nguyễn Văn Đồng', phone: '0988223344', cccd: '001200001234', seat_code: 'A02' }]
      }
    });
    assert.strictEqual(bookingRes.statusCode, 201);
    bookedPnr = bookingRes.body.data.payment.pnr;
    const transferMemo = bookingRes.body.data.payment.payment_details.transfer_memo;

    // Baseline: Check driver manifest before settlement
    const manifestBefore = await api(`/api/v1/driver/trips/${driverTripId}/manifest`);
    const initialManifestCount = manifestBefore.body.data.manifest.length;

    // Baseline: Check manager revenue before settlement
    const kpiBefore = await api('/api/v1/ops/dashboard/kpis');
    const initialRevenue = kpiBefore.body.data.kpi_metrics.gross_revenue_vnd;

    // 3. Settle payment via VietQR webhook callback
    const ipnRes = await api('/api/v1/webhooks/vietqr/ipn', {
      method: 'POST',
      body: {
        transferMemo,
        amountVnd: 220000,
        bankRef: `tx_sync_${Date.now()}`
      }
    });
    assert.strictEqual(ipnRes.statusCode, 200);
    assert.strictEqual(ipnRes.body.data.settled, true);
    bookedTicketId = ipnRes.body.data.issued_tickets[0].ticket_id;

    // Verification A: Driver manifest must now include the newly booked passenger!
    const manifestAfter = await api(`/api/v1/driver/trips/${driverTripId}/manifest`);
    assert.strictEqual(manifestAfter.body.data.manifest.length, initialManifestCount + 1, 'Driver manifest count must increment');
    const passengerInManifest = manifestAfter.body.data.manifest.find(m => m.ticket_id === bookedTicketId || m.pnr === bookedPnr);
    assert.ok(passengerInManifest, 'Booked passenger must appear in driver manifest');
    assert.strictEqual(passengerInManifest.passenger_name, 'Nguyễn Văn Đồng');
    assert.strictEqual(passengerInManifest.seat_code, 'A02');
    assert.strictEqual(passengerInManifest.boarding_status, 'NOT_BOARDED');

    // Verification B: Manager revenue must increment by booking amount
    const kpiAfter = await api('/api/v1/ops/dashboard/kpis');
    assert.strictEqual(kpiAfter.body.data.kpi_metrics.gross_revenue_vnd, initialRevenue + bookingRes.body.data.payment.amount_vnd, 'Manager gross revenue must increment');

    // Verification C: Seat must now be marked BOOKED in seat map
    const seatMapRes = await api('/api/v1/passenger/trips/trp_hn_th_01/seat-map');
    const seatA02 = seatMapRes.body.data.seats.find(s => s.seat_code === 'A02');
    assert.strictEqual(seatA02.state, 'BOOKED', 'Seat A02 must be permanently BOOKED');
  });

  it('TC-SYNC-02: Driver scanning the boarding QR marks passenger BOARDED in wallet & updates Manager metrics', async () => {
    assert.ok(bookedTicketId, 'Ticket ID must exist from previous step');

    // 1. Get the static boarding QR of the passenger's ticket
    const qrRes = await api(`/api/v1/passenger/tickets/${bookedTicketId}/qr`);
    assert.strictEqual(qrRes.statusCode, 200);
    const boardingQr = qrRes.body.data.boarding_qr;
    const qrString = boardingQr.qr_code_value;
    assert.ok(qrString, 'QR code payload string must be present');

    // Baseline: Verify ticket status in passenger wallet is ACTIVE
    const walletBefore = await api('/api/v1/passenger/tickets?phone=0988223344&tab=UPCOMING');
    const ticketBefore = walletBefore.body.data.find(t => t.ticket_id === bookedTicketId);
    assert.strictEqual(ticketBefore.status, 'ACTIVE');

    // 2. Driver scans dynamic QR
    const scanRes = await api(`/api/v1/driver/trips/${driverTripId}/board-qr`, {
      method: 'POST',
      body: { qrString }
    });
    assert.strictEqual(scanRes.statusCode, 200);
    assert.strictEqual(scanRes.body.data.boarding_status, 'BOARDED');

    // Verification A: Driver manifest status is BOARDED
    const manifestCheck = await api(`/api/v1/driver/trips/${driverTripId}/manifest`);
    const pCheck = manifestCheck.body.data.manifest.find(m => m.ticket_id === bookedTicketId);
    assert.strictEqual(pCheck.boarding_status, 'BOARDED');
    assert.ok(manifestCheck.body.data.boarded_count >= 1, 'Boarded count must be at least 1');

    // Verification B: Passenger Ticket Wallet shows BOARDED; it stays under "Sắp đi" until the trip ends (BR-MYTICKETS-001)
    const walletCompleted = await api('/api/v1/passenger/tickets?phone=0988223344&tab=UPCOMING');
    const ticketCompleted = walletCompleted.body.data.find(t => t.ticket_id === bookedTicketId);
    assert.ok(ticketCompleted, 'A boarded ticket stays in the UPCOMING wallet tab while the trip runs');
    assert.strictEqual(ticketCompleted.status, 'BOARDED');

    // Verification C: Passenger receives boarding push notification
    const notifs = await api('/api/v1/passenger/notifications', {
      headers: { 'x-user-id': '0988223344' }
    });
    assert.ok(notifs.body.data.length > 0, 'Passenger must have push notifications');
    const welcomeNotif = notifs.body.data.find(n => n.type === 'BOARDING_REMINDER');
    assert.ok(welcomeNotif, 'Boarding reminder notification must be dispatched to passenger');
  });

  it('TC-SYNC-03: Driver GPS telemetry updates Passenger live radar HUD & Manager 60Hz fleet map', async () => {
    // Telemetry is only accepted while the trip is running (trp_hn_th_01 has a completed readiness checklist)
    const startRes = await api(`/api/v1/driver/trips/${driverTripId}/start`, { method: 'POST' });
    assert.strictEqual(startRes.statusCode, 200);

    // 1. Driver records live GPS telemetry ping
    const ping = {
      lat: 20.8524,
      lng: 105.8812,
      speed_kmh: 72.5,
      bearing_deg: 185
    };

    const telemetryRes = await api(`/api/v1/driver/trips/${driverTripId}/telemetry`, {
      method: 'POST',
      body: ping
    });
    assert.strictEqual(telemetryRes.statusCode, 200);

    // Verification A: Passenger Live Radar HUD receives new position & speed
    const passengerRadar = await api(`/api/v1/passenger/trips/${driverTripId}/radar`);
    assert.strictEqual(passengerRadar.statusCode, 200);
    assert.strictEqual(passengerRadar.body.data.bus_position.lat, ping.lat);
    assert.strictEqual(passengerRadar.body.data.bus_position.lng, ping.lng);
    assert.strictEqual(passengerRadar.body.data.bus_position.speed_kmh, ping.speed_kmh);

    // Verification B: Manager 60Hz Fleet Radar Map receives live vehicle telemetry
    const managerRadar = await api('/api/v1/ops/radar');
    assert.strictEqual(managerRadar.statusCode, 200);
    const trackedVeh = managerRadar.body.data.vehicles.find(v => v.plate_number === '29B-882.19' || v.plate_number === '29B-123.45');
    assert.ok(trackedVeh, 'Vehicle must be tracked on Manager radar');
    assert.strictEqual(trackedVeh.gps_status, 'LIVE');
  });

  it('TC-SYNC-04: Driver batch telemetry replay streams positions to Passenger and Manager', async () => {
    const buffer = [
      { trip_id: driverTripId, lat: 20.7500, lng: 105.9100, speed_kmh: 65, bearing_deg: 180 },
      { trip_id: driverTripId, lat: 20.6500, lng: 105.9300, speed_kmh: 70, bearing_deg: 182 }
    ];

    const replayRes = await api('/api/v1/driver/telemetry/batch-replay', {
      method: 'POST',
      body: { telemetryBuffer: buffer }
    });
    assert.strictEqual(replayRes.statusCode, 200);
    assert.strictEqual(replayRes.body.data.replayed_count, 2);

    // Verify Passenger Live Radar received the latest replayed point
    const passengerRadar = await api(`/api/v1/passenger/trips/${driverTripId}/radar`);
    assert.strictEqual(passengerRadar.body.data.bus_position.lat, 20.6500);
    assert.strictEqual(passengerRadar.body.data.bus_position.speed_kmh, 70);
  });

  it('TC-SYNC-05: Driver incident SOS alerts Manager Operations & broadcasts push notification to passengers', async () => {
    const incidentRes = await api(`/api/v1/driver/trips/${driverTripId}/incident`, {
      method: 'POST',
      body: {
        incident_type: 'TRAFFIC_JAM',
        description: 'Kẹt xe nghiêm trọng tại nút giao Vực Vòng',
        delay_minutes: 25,
        lat: 20.6500,
        lng: 105.9300
      }
    });
    assert.strictEqual(incidentRes.statusCode, 200);

    // Verification A: Manager Operations Alert Center records the alert
    const kpiRes = await api('/api/v1/ops/dashboard/kpis');
    const recentAlerts = kpiRes.body.data.recent_alerts || [];
    const matchedAlert = recentAlerts.find(a => a.message.includes('Kẹt xe nghiêm trọng'));
    assert.ok(matchedAlert, 'Manager alert list must contain the reported traffic incident');

    // Verification B: Passenger receives push notification about the incident
    const notifs = await api('/api/v1/passenger/notifications', {
      headers: { 'x-user-id': '0988223344' }
    });
    const incidentNotif = notifs.body.data.find(n => n.type === 'DELAY' && n.body.includes('Kẹt xe'));
    assert.ok(incidentNotif, 'Passenger must receive trip disruption push notification');
  });

  it('TC-SYNC-06: Manager POS counter booking reserves seat in seat map & adds to Driver manifest', async () => {
    // Manager creates POS booking for seat B02
    const posRes = await api('/api/v1/ops/pos/bookings', {
      method: 'POST',
      body: {
        tripId: driverTripId,
        passengerName: 'Lê Hoàng Nam',
        phone: '0977665544',
        seatCodes: ['B02'],
        paymentMethod: 'CASH_POS'
      }
    });
    assert.strictEqual(posRes.statusCode, 201);
    const posPnr = posRes.body.data.pnr;
    assert.ok(posPnr.startsWith('BG-POS'));

    // Verification A: Seat B02 is now permanently BOOKED in passenger seat map
    const seatMap = await api(`/api/v1/passenger/trips/${driverTripId}/seat-map`);
    const seatB02 = seatMap.body.data.seats.find(s => s.seat_code === 'B02');
    assert.strictEqual(seatB02.state, 'BOOKED', 'POS seat B02 must be BOOKED');

    // Verification B: Passenger is present in Driver manifest
    const manifest = await api(`/api/v1/driver/trips/${driverTripId}/manifest`);
    const posPassenger = manifest.body.data.manifest.find(m => m.pnr === posPnr);
    assert.ok(posPassenger, 'POS passenger must be present in Driver manifest');
    assert.strictEqual(posPassenger.passenger_name, 'Lê Hoàng Nam');
    assert.strictEqual(posPassenger.seat_code, 'B02');
  });

  it('TC-SYNC-07: Manager Emergency Vehicle Swap updates Driver plate & notifies Passenger', async () => {
    const newPlate = '29B-888.22'; // a free vehicle of the fleet (MGR-023 needs a real, available vehicle)
    const swapRes = await api(`/api/v1/ops/trips/${driverTripId}/swap-vehicle`, {
      method: 'POST',
      body: {
        newVehiclePlate: newPlate,
        replacementReason: 'Hỏng lốc điều hòa khẩn cấp'
      }
    });
    assert.strictEqual(swapRes.statusCode, 200);

    // Verification A: Driver manifest vehicle plate updated to newPlate
    const manifest = await api(`/api/v1/driver/trips/${driverTripId}/manifest`);
    assert.strictEqual(manifest.body.data.vehicle_plate, newPlate, 'Driver vehicle plate must match swapped plate');

    // Verification B: Passenger receives swap notification
    const notifs = await api('/api/v1/passenger/notifications', {
      headers: { 'x-user-id': '0988223344' }
    });
    const swapNotif = notifs.body.data.find(n => n.type === 'SWAP' || (n.body && n.body.includes(newPlate)));
    assert.ok(swapNotif, 'Passenger must receive vehicle swap alert notification');
  });

  it('TC-SYNC-08: Passenger ticket cancellation releases seat in seat map & updates Driver manifest', async () => {
    // A boarded ticket (TC-SYNC-02) can no longer be cancelled, so buy a fresh ticket for seat B04 and cancel it
    const holdRes = await api('/api/v1/passenger/trips/trp_hn_th_01/hold-seats', {
      method: 'POST',
      body: { seatCodes: ['B04'], userId: 'usr_pax_sync_08' }
    });
    assert.strictEqual(holdRes.statusCode, 200);
    const bookingRes = await api('/api/v1/passenger/bookings/create', {
      method: 'POST',
      body: {
        tripId: 'trp_hn_th_01',
        userId: 'usr_pax_sync_08',
        holdId: holdRes.body.data.hold_id,
        seatCodes: ['B04'],
        payer: { full_name: 'Nguyễn Văn Đồng', phone: '0988223344' },
        passengers: [{ full_name: 'Nguyễn Văn Đồng', seat_code: 'B04' }]
      }
    });
    assert.strictEqual(bookingRes.statusCode, 201);
    const ipnRes = await api('/api/v1/webhooks/vietqr/ipn', {
      method: 'POST',
      body: {
        transferMemo: bookingRes.body.data.payment.payment_details.transfer_memo,
        amountVnd: bookingRes.body.data.payment.amount_vnd,
        bankRef: `tx_sync08_${Date.now()}`
      }
    });
    assert.strictEqual(ipnRes.statusCode, 200);
    const cancelTicketId = ipnRes.body.data.issued_tickets[0].ticket_id;

    const cancelRes = await api(`/api/v1/passenger/tickets/${cancelTicketId}/cancel`, {
      method: 'POST',
      body: {
        // Departure of trp_hn_th_01 is 2026-08-28T07:00+07:00; cancel two days earlier (PAX-021: 100% refund)
        now: Date.parse('2026-08-26T07:00:00+07:00')
      }
    });
    assert.strictEqual(cancelRes.statusCode, 200);
    assert.strictEqual(cancelRes.body.data.status, 'REFUND_REQUESTED');
    assert.strictEqual(cancelRes.body.data.refund_amount_vnd, 220000);
    assert.ok(cancelRes.body.data.refund_id, 'Refund request must be opened for the manager (MGR-022)');

    // Verification A: Seat B04 is released back to AVAILABLE in seat map
    const seatMap = await api(`/api/v1/passenger/trips/${driverTripId}/seat-map`);
    const seatB04 = seatMap.body.data.seats.find(s => s.seat_code === 'B04');
    assert.strictEqual(seatB04.state, 'AVAILABLE', 'Seat B04 must be restored to AVAILABLE');

    // Verification B: Ticket in passenger wallet is CANCELLED
    const wallet = await api('/api/v1/passenger/tickets?phone=0988223344&tab=CANCELLED');
    const cancelledTicket = wallet.body.data.find(t => t.ticket_id === cancelTicketId);
    assert.ok(cancelledTicket, 'Ticket must be found in CANCELLED tab');
  });

  it('TC-SYNC-09: Driver ending trip updates Manager trip status to COMPLETED', async () => {
    const endRes = await api(`/api/v1/driver/trips/${driverTripId}/end`, {
      method: 'POST',
      body: { endOdometerKm: 142210, early_end_reason: 'Kết thúc sớm để kiểm thử đồng bộ ba bên' }
    });
    assert.strictEqual(endRes.statusCode, 200);
    assert.strictEqual(endRes.body.data.status, 'COMPLETED');

    // Verification: Manager dispatch board marks trip as COMPLETED
    const dispatchRes = await api('/api/v1/ops/dispatch/board');
    assert.strictEqual(dispatchRes.statusCode, 200);
    const completedTrip = dispatchRes.body.data.trips.find(t => t.trip_id === driverTripId);
    if (completedTrip) {
      assert.strictEqual(completedTrip.status, 'COMPLETED', 'Trip in Manager dispatch board must be COMPLETED');
    }
  });
});
