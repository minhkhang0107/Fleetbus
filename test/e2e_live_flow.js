/**
 * Live End-to-End System Flow Verification
 * Plays the three apps against the live Node.js server on http://localhost:3000 the way the Flutter clients
 * must: canonical paths, a real login for each actor, a Bearer token, and an Idempotency-Key on mutations.
 * Every step is checked; a failed check stops the run with a non-zero exit code.
 */

import crypto from 'node:crypto';
import { server } from '../source/server/apiServer.js';
import { generateTotp } from '../source/server/core/totp.js';
import { DEV_TOTP_SECRET } from '../source/server/config.js';

const BASE_URL = 'http://localhost:3000';

async function request(path, { method = 'GET', body, token } = {}) {
  const headers = { 'Content-Type': 'application/json', 'x-app-version': '3.0.0' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (method === 'POST') headers['Idempotency-Key'] = crypto.randomUUID();
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json };
}

function expect(condition, message, response) {
  if (!condition) {
    const detail = response ? ` | ${response.status} ${JSON.stringify(response.body)}` : '';
    throw new Error(`FAILED: ${message}${detail}`);
  }
}

const READY_CHECKLIST = {
  tires_checked: true,
  brakes_fluid_checked: true,
  ac_cleanliness_checked: true,
  first_aid_extinguisher_checked: true,
  fuel_level_sufficient: true,
  gps_telemetry_beacon_active: true
};

async function runLiveE2E() {
  console.log('🚀 Starting FleetBus Live End-to-End Verification against', BASE_URL);

  console.log('\n--- 1. SYSTEM HEALTHCHECK ---');
  const health = await request('/health');
  expect(health.status === 200 && health.body.data.status === 'UP', 'health must be UP', health);
  console.log('✅ Health status:', health.body.data.status, '| Services:', Object.keys(health.body.data.services).length);

  console.log('\n--- 2. PASSENGER BOOKING JOURNEY ---');
  const config = await request('/api/v1/app/config');
  expect(config.status === 200 && config.body.data.force_upgrade === false, 'app config handshake', config);
  console.log('✅ Handshake Client Version:', config.body.data.client_version, '| Force Upgrade:', config.body.data.force_upgrade);

  const anonymousWallet = await request('/api/v1/passenger/tickets');
  expect(anonymousWallet.status === 401, 'the wallet must refuse a caller without a token', anonymousWallet);
  console.log('✅ Wallet refuses an anonymous caller (401)');

  const phone = '0912345678';
  const otpRequest = await request('/api/v1/auth/passenger/otp/request', { method: 'POST', body: { phone } });
  expect(otpRequest.status === 200, 'OTP request', otpRequest);
  const otpVerify = await request('/api/v1/auth/passenger/otp/verify', {
    method: 'POST',
    body: { phone, otp: otpRequest.body.data.mock_otp }
  });
  expect(otpVerify.status === 200 && otpVerify.body.data.token, 'OTP verify must return a token', otpVerify);
  const passengerToken = otpVerify.body.data.token;
  console.log('✅ Passenger signed in with OTP:', otpVerify.body.data.user.full_name);

  const stations = await request('/api/v1/routes/stops/search?q=giap%20bat');
  expect(stations.status === 200 && stations.body.data.length > 0, 'station search', stations);
  console.log('✅ Found Station:', stations.body.data[0].name, 'in', stations.body.data[0].city);

  const trips = await request('/api/v1/trips/search?origin=Hà%20Nội&destination=Thanh%20Hóa');
  expect(trips.status === 200 && trips.body.data.length > 0, 'trip search', trips);
  console.log('✅ Found Trips count:', trips.body.data.length, '| First Trip:', trips.body.data[0].route_name);

  const tripId = trips.body.data[0].trip_id;
  const seatMap = await request(`/api/v1/trips/${tripId}/seat-map`);
  expect(seatMap.status === 200, 'seat map', seatMap);
  console.log('✅ Seat Map retrieved: Total seats =', seatMap.body.data.total_seats, '| Decks =', seatMap.body.data.total_decks);

  const hold = await request(`/api/v1/trips/${tripId}/seats/hold`, {
    method: 'POST',
    token: passengerToken,
    body: { seatCodes: ['A01'] }
  });
  expect(hold.status === 200 && hold.body.data.hold_id, 'seat hold', hold);
  console.log('✅ 10-Minute Seat Hold Acquired:', hold.body.data.seat_codes);

  const booking = await request('/api/v1/bookings/create', {
    method: 'POST',
    token: passengerToken,
    body: {
      tripId,
      holdId: hold.body.data.hold_id,
      seatCodes: ['A01'],
      payer: { full_name: 'Nguyễn Văn An', phone, email: 'an.nguyen@email.com' },
      passengers: [{ full_name: 'Nguyễn Văn An', phone, cccd: '001200012345', seat_code: 'A01' }],
      voucherCode: 'BUSGO50K'
    }
  });
  expect(booking.status === 201 && booking.body.data.payment, 'booking creation', booking);
  const payment = booking.body.data.payment;
  const totalAmount = booking.body.data.order.total_payment_vnd;
  expect(totalAmount === 170000, 'the server prices the order: 220.000 minus the 50.000 voucher', booking);
  console.log('✅ Booking Created! PNR:', payment.pnr, '| Amount:', totalAmount.toLocaleString('vi-VN'), 'VND | Memo:', payment.payment_details.transfer_memo);

  const pending = await request(`/api/v1/passenger/payments/${payment.order_id}/verify-status`, {
    method: 'POST',
    token: passengerToken,
    body: { manualTrigger: true }
  });
  expect(pending.status === 200 && pending.body.data.payment_status === 'PENDING_PAYMENT', '"Tôi đã chuyển tiền" must not settle the order', pending);
  console.log('✅ "Tôi đã chuyển tiền" only asks for reconciliation (still PENDING_PAYMENT)');

  console.log('\n--- 3. NAPAS247 / VIETQR PAYMENT SETTLEMENT ---');
  const underpaid = await request('/api/v1/webhooks/vietqr/ipn', {
    method: 'POST',
    body: { transferMemo: payment.payment_details.transfer_memo, amountVnd: 1000, bankRef: `FT${Date.now()}` }
  });
  expect(underpaid.status === 400 && underpaid.body.code === 'AMOUNT_MISMATCH', 'a wrong amount must not issue tickets', underpaid);
  const settlement = await request('/api/v1/webhooks/vietqr/ipn', {
    method: 'POST',
    body: { transferMemo: payment.payment_details.transfer_memo, amountVnd: totalAmount, bankRef: `FT${Date.now()}` }
  });
  expect(settlement.status === 200 && settlement.body.data.settled === true, 'settlement', settlement);
  const ticketId = settlement.body.data.issued_tickets[0].ticket_id;
  console.log('✅ Wrong amount refused, exact amount settled. Issued Tickets count:', settlement.body.data.issued_tickets.length);

  console.log('\n--- 4. PASSENGER TICKET WALLET & DYNAMIC QR ---');
  const wallet = await request('/api/v1/passenger/tickets', { token: passengerToken });
  expect(wallet.status === 200 && wallet.body.data.some((t) => t.ticket_id === ticketId), 'the wallet must hold the ticket', wallet);
  console.log('✅ Ticket Wallet Active Tickets:', wallet.body.data.length);

  const qrPass = await request(`/api/v1/tickets/${ticketId}`, { token: passengerToken });
  expect(qrPass.status === 200, 'ticket QR', qrPass);
  const qrString = qrPass.body.data.dynamic_qr.qr_code_value;
  console.log('✅ Dynamic 30s HMAC QR Payload Generated:', qrString, '| Validity: 30s');

  console.log('\n--- 5. DRIVER TACTICAL COCKPIT ---');
  const driverLogin = await request('/api/v1/auth/driver/login', {
    method: 'POST',
    body: { staffIdOrPhone: 'TX8821', pin: '123456' }
  });
  expect(driverLogin.status === 200 && driverLogin.body.data.token, 'driver login', driverLogin);
  const driverToken = driverLogin.body.data.token;
  console.log('✅ Driver Authenticated:', driverLogin.body.data.driver.full_name, '| License:', driverLogin.body.data.driver.license_class);

  const driverTrips = await request('/api/v1/driver/trips/today', { token: driverToken });
  expect(driverTrips.status === 200 && driverTrips.body.data.trips.length > 0, 'driver shift trips', driverTrips);
  console.log('✅ Driver Shift Trips:', driverTrips.body.data.trips.length);

  const driverTripId = driverTrips.body.data.trips.find((t) => t.trip_id === tripId).trip_id;
  const readiness = await request(`/api/v1/driver/trips/${driverTripId}/readiness`, {
    method: 'POST',
    token: driverToken,
    body: { checklist: READY_CHECKLIST }
  });
  expect(readiness.status === 200 && readiness.body.data.status === 'READY', 'readiness', readiness);
  console.log('✅ Pre-start 6-Point Readiness Inspection Passed:', readiness.body.data.status);

  const startTrip = await request(`/api/v1/driver/trips/${driverTripId}/start`, { method: 'POST', token: driverToken });
  expect(startTrip.status === 200 && startTrip.body.data.status === 'IN_TRANSIT', 'trip start', startTrip);
  console.log('✅ Trip Started! Status:', startTrip.body.data.status);

  const forged = await request(`/api/v1/driver/trips/${driverTripId}/boarding`, {
    method: 'POST',
    token: driverToken,
    body: { qrPayload: qrString.replace(/\|[0-9a-f]{16}$/, '|deadbeefdeadbeef') }
  });
  expect(forged.status === 400 && forged.body.code === 'INVALID_SIGNATURE', 'a forged QR must be refused', forged);
  const boardScan = await request(`/api/v1/driver/trips/${driverTripId}/boarding`, {
    method: 'POST',
    token: driverToken,
    body: { qrPayload: qrString }
  });
  expect(boardScan.status === 200 && boardScan.body.data.boarding_status === 'BOARDED', 'the genuine QR must board the passenger', boardScan);
  expect(!JSON.stringify(boardScan.body).includes(phone), 'the driver must only see a masked phone', boardScan);
  console.log('✅ Forged QR refused; genuine QR boarded:', boardScan.body.data.passenger_name, '| Seat:', boardScan.body.data.seat_code);

  const telemetry = await request(`/api/v1/driver/trips/${driverTripId}/telemetry`, {
    method: 'POST',
    token: driverToken,
    body: { lat: 20.9812, lng: 105.8430, speed_kmh: 65.2, bearing_deg: 180 }
  });
  expect(telemetry.status === 200 && telemetry.body.data.data.speed_kmh === 65.2, 'telemetry', telemetry);
  console.log('✅ Driver Telemetry Streamed: Speed =', telemetry.body.data.data.speed_kmh, 'km/h');

  const tracking = await request(`/api/v1/trips/${driverTripId}/tracking`);
  expect(tracking.status === 200 && tracking.body.data.has_position === true && tracking.body.data.signal_status === 'LIVE', 'the passenger sees the live bus', tracking);
  console.log('✅ Passenger tracking shows the live position (signal LIVE)');

  console.log('\n--- 6. MANAGER OPERATIONS CONTROL CENTER ---');
  const noCode = await request('/api/v1/auth/staff/login', { method: 'POST', body: { username: 'admin@busgo.vn', password: 'admin123' } });
  expect(noCode.status === 401 && noCode.body.code === 'TOTP_REQUIRED', 'the director must give a TOTP code', noCode);
  // A code works once, so a second run within 30 s takes the next step (the server accepts one step ahead)
  let mgrLogin;
  for (const stepOffset of [0, 30000]) {
    mgrLogin = await request('/api/v1/auth/staff/login', {
      method: 'POST',
      body: { username: 'admin@busgo.vn', password: 'admin123', totp: generateTotp(DEV_TOTP_SECRET, Date.now() + stepOffset) }
    });
    if (mgrLogin.status === 200) break;
  }
  expect(mgrLogin.status === 200 && mgrLogin.body.data.token, 'staff login', mgrLogin);
  const staffToken = mgrLogin.body.data.token;
  console.log('✅ Manager Logged In:', mgrLogin.body.data.user.full_name, '| Role:', mgrLogin.body.data.user.role);

  const wrongKind = await request('/api/v1/ops/dashboard/kpis', { token: passengerToken });
  expect(wrongKind.status === 403, 'a passenger token must not open the operations API', wrongKind);

  const kpis = await request('/api/v1/ops/dashboard/kpis', { token: staffToken });
  expect(kpis.status === 200, 'KPIs', kpis);
  const metrics = kpis.body.data.kpi_metrics;
  console.log('✅ Operations KPIs: Active Fleet =', metrics.active_vehicles_count, '| Load Factor =', metrics.overall_load_factor_pct, '% | Revenue =', metrics.gross_revenue_vnd.toLocaleString('vi-VN'), 'VND (net', metrics.net_revenue_vnd.toLocaleString('vi-VN'), ')');

  const radar = await request('/api/v1/ops/fleet/live-positions', { token: staffToken });
  expect(radar.status === 200 && radar.body.data.total_tracked_vehicles > 0, 'fleet radar', radar);
  console.log('✅ Live Fleet Radar Tracked Vehicles:', radar.body.data.total_tracked_vehicles);

  const posBooking = await request('/api/v1/ops/pos/orders', {
    method: 'POST',
    token: staffToken,
    body: { tripId: driverTripId, passengerName: 'Hoàng Văn Thái', phone: '0933445566', seatCodes: ['B03'] }
  });
  expect(posBooking.status === 201, 'POS sale', posBooking);
  const soldTwice = await request('/api/v1/ops/pos/orders', {
    method: 'POST',
    token: staffToken,
    body: { tripId: driverTripId, passengerName: 'Khách Hai', phone: '0933445577', seatCodes: ['B03'] }
  });
  expect(soldTwice.status === 409, 'a seat must not be sold twice', soldTwice);
  console.log('✅ POS Ticket Issued! PNR:', posBooking.body.data.pnr, '| the same seat is refused the second time (409)');

  const report = await request('/api/v1/ops/reports/yield', { token: staffToken });
  expect(report.status === 200, 'executive report', report);
  console.log('✅ Executive Financial & Punctuality Report: On-time rate =', report.body.data.punctuality_summary.on_time_departure_rate);

  const audit = await request('/api/v1/ops/audit-logs', { token: staffToken });
  expect(audit.status === 200 && audit.body.data.audit_logs.some((l) => l.action === 'POS_ISSUE'), 'the POS sale must be in the audit log', audit);
  console.log('✅ Audit log records the POS sale');

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
