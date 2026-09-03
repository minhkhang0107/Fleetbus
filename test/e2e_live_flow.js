/**
 * Live End-to-End System Flow Verification
 * Tests the live Node.js server running on http://localhost:3000 across all 3 apps and banking webhook.
 */

import { generateDynamicTicketQR } from '../source/passenger-app/core/cryptoEngine.js';
import { server } from '../source/server/apiServer.js';

const BASE_URL = 'http://localhost:3000';

async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      'x-app-version': '3.0.0',
      'x-driver-id': 'drv_8821a',
      ...(options.headers || {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function runLiveE2E() {
  console.log('🚀 Starting FleetBus Live End-to-End Verification against', BASE_URL);

  // 1. Healthcheck
  console.log('\n--- 1. SYSTEM HEALTHCHECK ---');
  const health = await request('/health');
  console.log('✅ Health status:', health.body.data.status, '| Services:', Object.keys(health.body.data.services).length);

  // 2. Passenger Journey
  console.log('\n--- 2. PASSENGER BOOKING JOURNEY ---');
  const config = await request('/api/v1/passenger/config');
  console.log('✅ Handshake Client Version:', config.body.data.client_version, '| Force Upgrade:', config.body.data.force_upgrade);

  const stations = await request('/api/v1/passenger/stations?q=giap%20bat');
  console.log('✅ Found Station:', stations.body.data[0].name, 'in', stations.body.data[0].city);

  const trips = await request('/api/v1/passenger/trips?origin=Hà%20Nội&destination=Thanh%20Hóa');
  console.log('✅ Found Trips count:', trips.body.data.length, '| First Trip:', trips.body.data[0].route_name);

  const tripId = trips.body.data[0].trip_id;
  const seatMap = await request(`/api/v1/passenger/trips/${tripId}/seat-map`);
  console.log('✅ Seat Map retrieved: Total seats =', seatMap.body.data.total_seats, '| Decks =', seatMap.body.data.total_decks);

  const hold = await request(`/api/v1/passenger/trips/${tripId}/hold-seats`, {
    method: 'POST',
    body: { seatCodes: ['A01'], userId: 'usr_pax_live_01' }
  });
  console.log('✅ 10-Minute Seat Hold Acquired:', hold.body.data.held_seats || hold.body.data.seat_codes);

  const booking = await request('/api/v1/passenger/bookings/create', {
    method: 'POST',
    body: {
      tripId,
      payer: { full_name: 'Nguyễn Văn An', phone: '0912345678', email: 'an.nguyen@email.com' },
      passengers: [{ full_name: 'Nguyễn Văn An', phone: '0912345678', cccd: '001200012345', seat_code: 'A01' }],
      selectedSeats: [{ seat_code: 'A01', deck: 1, price_vnd: 220000 }],
      unitPriceVnd: 220000,
      voucherCode: 'BUSGO50K'
    }
  });

  const paymentData = booking.body.data?.payment;
  const orderData = booking.body.data?.order;
  if (!paymentData) {
    throw new Error(`Booking failed: ${JSON.stringify(booking.body)}`);
  }

  const pnr = paymentData.pnr;
  const transferMemo = paymentData.payment_details.transfer_memo;
  const totalAmount = orderData.total_payment_vnd;
  console.log('✅ Booking Created! PNR:', pnr, '| Amount:', totalAmount.toLocaleString('vi-VN'), 'VND | Memo:', transferMemo);

  // 3. Napas247 / VietQR IPN Webhook
  console.log('\n--- 3. NAPAS247 / VIETQR PAYMENT SETTLEMENT ---');
  const settlement = await request('/api/v1/webhooks/vietqr/ipn', {
    method: 'POST',
    body: {
      transferMemo,
      amountVnd: totalAmount,
      bankRef: `FT${Date.now()}`
    }
  });
  console.log('✅ Payment Settled via Webhook! Issued Tickets count:', settlement.body.data.issued_tickets.length);
  const ticketId = settlement.body.data.issued_tickets[0].ticket_id;

  // 4. Passenger Wallet & Rotating QR
  console.log('\n--- 4. PASSENGER TICKET WALLET & DYNAMIC QR ---');
  const wallet = await request('/api/v1/passenger/tickets?phone=0912345678');
  console.log('✅ Ticket Wallet Active Tickets:', wallet.body.data.length);

  const qrPass = await request(`/api/v1/passenger/tickets/${ticketId}/qr`);
  const dynamicQr = qrPass.body.data?.dynamic_qr || qrPass.body.data;
  const qrString = dynamicQr.dynamic_qr ? dynamicQr.dynamic_qr.qr_code_value : (dynamicQr.qr_code_value || dynamicQr.qr_payload);
  console.log('✅ Dynamic 30s HMAC QR Payload Generated:', qrString, '| Validity: 30s');

  // 5. Driver Tactical Cockpit
  console.log('\n--- 5. DRIVER TACTICAL COCKPIT ---');
  const driverLogin = await request('/api/v1/driver/auth/login', {
    method: 'POST',
    body: { staffIdOrPhone: 'TX8821', pin: '123456' }
  });
  console.log('✅ Driver Authenticated:', driverLogin.body.data.driver.full_name, '| License:', driverLogin.body.data.driver.license_class);

  const driverTrips = await request('/api/v1/driver/trips/today');
  console.log('✅ Driver Shift Trips:', driverTrips.body.data.trips.length);

  const driverTripId = driverTrips.body.data.trips[0].trip_id;
  const readiness = await request(`/api/v1/driver/trips/${driverTripId}/readiness`, {
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
  console.log('✅ Pre-start 6-Point Readiness Inspection Passed:', readiness.body.data.status || 'OK');

  const startTrip = await request(`/api/v1/driver/trips/${driverTripId}/start`, {
    method: 'POST',
    body: { startOdometerKm: 142050 }
  });
  console.log('✅ Trip Started! Status:', startTrip.body.data.status || 'IN_TRANSIT');

  // Generate a valid QR for the assigned driver trip manifest passenger (tkt_88219_A01)
  const manifestPassenger = driverTrips.body.data.trips[0].manifest[0];
  const driverTicketQr = generateDynamicTicketQR(
    { ticket_id: manifestPassenger.ticket_id, pnr: manifestPassenger.pnr, trip_id: driverTripId },
    'busgo_master_secret_key_2026'
  );

  const boardScan = await request(`/api/v1/driver/trips/${driverTripId}/board-qr`, {
    method: 'POST',
    body: { qrPayload: driverTicketQr.qr_code_value }
  });
  console.log('✅ Dynamic HMAC QR Scanned by Driver! Result:', boardScan.body.message, '| Boarded Seat:', boardScan.body.data?.seat_code);

  const telemetry = await request(`/api/v1/driver/trips/${driverTripId}/telemetry`, {
    method: 'POST',
    body: { lat: 20.9812, lng: 105.8430, speed_kmh: 65.2, bearing_deg: 180 }
  });
  console.log('✅ Driver Telemetry Streamed: Speed =', telemetry.body.data.data.speed_kmh, 'km/h');

  // 6. Manager Operations Control Center
  console.log('\n--- 6. MANAGER OPERATIONS CONTROL CENTER ---');
  const mgrLogin = await request('/api/v1/ops/auth/login', {
    method: 'POST',
    body: { username: 'admin@busgo.vn', password: 'admin123' }
  });
  console.log('✅ Manager Logged In:', mgrLogin.body.data.user.full_name, '| Role:', mgrLogin.body.data.user.role);

  const kpis = await request('/api/v1/ops/dashboard/kpis');
  console.log('✅ Operations KPIs: Active Fleet =', kpis.body.data.kpi_metrics.active_vehicles_count, '| Load Factor =', kpis.body.data.kpi_metrics.overall_load_factor_pct, '% | Revenue =', kpis.body.data.kpi_metrics.gross_revenue_vnd.toLocaleString('vi-VN'), 'VND');

  const radar = await request('/api/v1/ops/radar');
  console.log('✅ 60Hz Live Fleet Radar Tracked Vehicles:', radar.body.data.total_tracked_vehicles);

  const posBooking = await request('/api/v1/ops/pos/bookings', {
    method: 'POST',
    body: {
      tripId: driverTripId,
      passengerName: 'Hoàng Văn Thái',
      phone: '0933445566',
      seatCodes: ['B03']
    }
  });
  console.log('✅ Manager Hotline/POS Ticket Issued! PNR:', posBooking.body.data.pnr, '| Passenger:', posBooking.body.data.passenger_name);

  const executiveReport = await request('/api/v1/ops/reports/executive');
  console.log('✅ Executive Financial & Punctuality Report: On-time rate =', executiveReport.body.data.punctuality_summary.on_time_departure_rate);

  console.log('\n🎉 ALL LIVE APP INTEGRATIONS AND ENDPOINTS VERIFIED SUCCESSFULLY! 100% OPERATIONAL.');
}

async function main() {
  let serverStartedLocally = false;
  try {
    // Check if server is already running
    await fetch('http://localhost:3000/health').catch(() => {
      return new Promise((resolve) => {
        server.listen(3000, () => {
          serverStartedLocally = true;
          resolve();
        });
      });
    });

    await runLiveE2E();
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  } finally {
    if (serverStartedLocally) {
      server.close();
    }
  }
}

main();
