/**
 * Phase C: cross-app flows FLOW-01 to FLOW-07 played over HTTP with real logins.
 * Each test follows one flow across the passenger, driver and manager sides and checks what every side sees.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import http from 'node:http';
import { generateTotp } from '../../source/server/core/totp.js';
import { DEV_TOTP_SECRET } from '../../source/server/config.js';
import { createFleetBusServer } from '../../source/server/apiServer.js';

const TRIP = 'trp_hn_th_01';
const READY = {
  tires_checked: true,
  brakes_fluid_checked: true,
  ac_cleanliness_checked: true,
  first_aid_extinguisher_checked: true,
  fuel_level_sufficient: true,
  gps_telemetry_beacon_active: true
};

describe('Cross-app flows (FLOW-01 to FLOW-07)', () => {
  let server;
  let services;
  let baseUrl;
  let driver;
  let admin;
  let dispatcher;
  let cashier;
  let nextPhone = 912000000;

  before(async () => {
    ({ server, services } = createFleetBusServer({ webhookSecret: null }));
    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        baseUrl = `http://127.0.0.1:${server.address().port}`;
        resolve();
      });
    });
    driver = (await login('/api/v1/auth/driver/login', { staffIdOrPhone: 'TX8821', pin: '123456' })).token;
    admin = (await login('/api/v1/auth/staff/login', { username: 'admin@busgo.vn', password: 'admin123', totp: generateTotp(DEV_TOTP_SECRET, Date.now() - 30000) })).token;
    dispatcher = (await login('/api/v1/auth/staff/login', { username: 'dispatcher@busgo.vn', password: 'disp123' })).token;
    cashier = (await login('/api/v1/auth/staff/login', { username: 'cashier@busgo.vn', password: 'cash123' })).token;
  });

  after(() => new Promise((resolve) => server.close(resolve)));

  function api(path, { method = 'GET', body, token } = {}) {
    return new Promise((resolve, reject) => {
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      if (method === 'POST') headers['Idempotency-Key'] = crypto.randomUUID();
      const req = http.request(`${baseUrl}${path}`, { method, headers }, (res) => {
        let raw = '';
        res.on('data', (c) => { raw += c; });
        res.on('end', () => {
          let parsed;
          try { parsed = JSON.parse(raw); } catch { parsed = raw; }
          resolve({ status: res.statusCode, body: parsed });
        });
      });
      req.on('error', reject);
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }

  async function login(path, body) {
    const res = await api(path, { method: 'POST', body });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    return res.body.data;
  }

  async function newPassenger() {
    const phone = `0${nextPhone++}`;
    const otp = await api('/api/v1/auth/passenger/otp/request', { method: 'POST', body: { phone } });
    const ver = await api('/api/v1/auth/passenger/otp/verify', { method: 'POST', body: { phone, otp: otp.body.data.mock_otp } });
    assert.strictEqual(ver.status, 200, JSON.stringify(ver.body));
    return { phone, token: ver.body.data.token };
  }

  // FLOW-01 steps 1 to 4: hold, order, bank notification. Returns the issued tickets.
  async function buyTickets(pax, seatCodes, tripId = TRIP) {
    const hold = await api(`/api/v1/trips/${tripId}/seats/hold`, { method: 'POST', token: pax.token, body: { seatCodes } });
    assert.strictEqual(hold.status, 200, JSON.stringify(hold.body));
    const order = await api('/api/v1/bookings/create', {
      method: 'POST',
      token: pax.token,
      body: {
        tripId,
        holdId: hold.body.data.hold_id,
        seatCodes,
        payer: { full_name: 'Khach Flow', phone: pax.phone, email: 'flow@busgo.vn' },
        passengers: seatCodes.map((seat_code) => ({ full_name: `Khach ${seat_code}`, phone: pax.phone, seat_code }))
      }
    });
    assert.strictEqual(order.status, 201, JSON.stringify(order.body));
    const memo = order.body.data.payment.payment_details.transfer_memo;
    const amountVnd = order.body.data.order.total_payment_vnd;
    const ipn = await api('/api/v1/webhooks/vietqr/ipn', { method: 'POST', body: { transferMemo: memo, amountVnd, bankRef: `FT${crypto.randomUUID()}` } });
    assert.strictEqual(ipn.status, 200, JSON.stringify(ipn.body));
    return { tickets: ipn.body.data.issued_tickets, memo, amountVnd, pnr: ipn.body.data.pnr };
  }

  async function startTrip(tripId = TRIP) {
    const trip = await api(`/api/v1/driver/trips/${tripId}`, { token: driver });
    if (trip.body.data.status === 'IN_TRANSIT') return;
    assert.strictEqual((await api(`/api/v1/driver/trips/${tripId}/readiness`, { method: 'POST', token: driver, body: { checklist: READY } })).status, 200);
    assert.strictEqual((await api(`/api/v1/driver/trips/${tripId}/start`, { method: 'POST', token: driver })).status, 200);
  }

  const matrix = async (tripId = TRIP) => (await api(`/api/v1/ops/trips/${tripId}/seat-matrix`, { token: dispatcher })).body.data;
  const seatOf = (m, code) => m.seats.find((s) => s.seat_code === code);
  const mgrTrip = async (tripId = TRIP) => (await api(`/api/v1/ops/trips/${tripId}`, { token: admin })).body.data;

  describe('FLOW-01 booking and VietQR settlement', () => {
    it('TC-FLOW-C01: the dispatcher sees a held seat as HELD, then BOOKED once paid, and a repeated bank notification changes nothing (MGR-013)', async () => {
      const pax = await newPassenger();
      const hold = await api(`/api/v1/trips/${TRIP}/seats/hold`, { method: 'POST', token: pax.token, body: { seatCodes: ['A06'] } });
      assert.strictEqual(hold.status, 200);

      const held = seatOf(await matrix(), 'A06');
      assert.ok(held, 'the matrix lists every seat');
      assert.strictEqual(held.state, 'HELD');
      assert.ok(held.held_until, 'a held seat shows when the hold ends');

      const order = await api('/api/v1/bookings/create', {
        method: 'POST',
        token: pax.token,
        body: { tripId: TRIP, holdId: hold.body.data.hold_id, seatCodes: ['A06'], payer: { full_name: 'An', phone: pax.phone, email: 'a@b.vn' }, passengers: [{ full_name: 'An', phone: pax.phone, seat_code: 'A06' }] }
      });
      const note = { transferMemo: order.body.data.payment.payment_details.transfer_memo, amountVnd: order.body.data.order.total_payment_vnd, bankRef: 'FT-REPLAY-1' };
      assert.strictEqual((await api('/api/v1/webhooks/vietqr/ipn', { method: 'POST', body: note })).status, 200);

      const before = await mgrTrip();
      const bookedBefore = (await api('/api/v1/ops/bookings', { token: admin })).body.data.total;
      const manifestBefore = (await api(`/api/v1/driver/trips/${TRIP}/manifest`, { token: driver })).body.data.manifest.length;
      assert.strictEqual((await api('/api/v1/webhooks/vietqr/ipn', { method: 'POST', body: note })).status, 200);
      const after = await mgrTrip();

      const sold = seatOf(await matrix(), 'A06');
      assert.strictEqual(sold.state, 'BOOKED');
      assert.strictEqual(sold.pnr, order.body.data.payment.pnr);
      assert.strictEqual(after.booked_seats, before.booked_seats, 'a replayed notification must not count the seat twice');
      assert.strictEqual((await api('/api/v1/ops/bookings', { token: admin })).body.data.total, bookedBefore);
      assert.strictEqual((await api(`/api/v1/driver/trips/${TRIP}/manifest`, { token: driver })).body.data.manifest.length, manifestBefore);
    });

    it('TC-FLOW-C02: a hold that lapsed no longer shows in the matrix and the seat can be sold again (FLOW-01 timeout)', async () => {
      const pax = await newPassenger();
      services.seatMapService.holdSeats(TRIP, ['A04'], 'usr_lapsed', Date.now() - 11 * 60 * 1000);
      assert.strictEqual(seatOf(await matrix(), 'A04').state, 'AVAILABLE');
      const hold = await api(`/api/v1/trips/${TRIP}/seats/hold`, { method: 'POST', token: pax.token, body: { seatCodes: ['A04'] } });
      assert.strictEqual(hold.status, 200);
      await api(`/api/v1/trips/${TRIP}/seats/hold`, { method: 'DELETE', token: pax.token });
    });

    it('TC-FLOW-C03: a dispatcher blocks a seat for a technical reason; the app cannot hold it until it is unblocked (MGR-013, BR-INVENTORY-001)', async () => {
      const pax = await newPassenger();
      const noReason = await api(`/api/v1/ops/trips/${TRIP}/seats/override-lock`, { method: 'POST', token: dispatcher, body: { seatCodes: ['B04'], locked: true } });
      assert.strictEqual(noReason.status, 400);
      assert.strictEqual(noReason.body.code, 'REASON_REQUIRED');

      const block = await api(`/api/v1/ops/trips/${TRIP}/seats/override-lock`, { method: 'POST', token: dispatcher, body: { seatCodes: ['B04'], locked: true, reason: 'Hỏng ghế' } });
      assert.strictEqual(block.status, 200, JSON.stringify(block.body));
      const blocked = seatOf(await matrix(), 'B04');
      assert.strictEqual(blocked.state, 'BLOCKED');
      assert.strictEqual(blocked.reason, 'Hỏng ghế');

      const appMap = (await api(`/api/v1/trips/${TRIP}/seat-map`)).body.data.seats.find((s) => s.seat_code === 'B04');
      assert.strictEqual(appMap.segment_state, 'BLOCKED');
      const hold = await api(`/api/v1/trips/${TRIP}/seats/hold`, { method: 'POST', token: pax.token, body: { seatCodes: ['B04'] } });
      assert.strictEqual(hold.status, 409);
      assert.strictEqual(hold.body.code, 'SEAT_BLOCKED');
      const sale = await api('/api/v1/ops/pos/orders', { method: 'POST', token: cashier, body: { tripId: TRIP, passengerName: 'Khach', phone: '0933000111', seatCodes: ['B04'] } });
      assert.strictEqual(sale.status, 409, 'the counter cannot sell a blocked seat either');

      const driverRole = await api(`/api/v1/ops/trips/${TRIP}/seats/override-lock`, { method: 'POST', token: cashier, body: { seatCodes: ['B04'], locked: false } });
      assert.strictEqual(driverRole.status, 403, 'a cashier may not change the inventory');

      const unblock = await api(`/api/v1/ops/trips/${TRIP}/seats/override-lock`, { method: 'POST', token: dispatcher, body: { seatCodes: ['B04'], locked: false } });
      assert.strictEqual(unblock.status, 200);
      assert.strictEqual(seatOf(await matrix(), 'B04').state, 'AVAILABLE');
      const again = await api(`/api/v1/ops/trips/${TRIP}/seats/override-lock`, { method: 'POST', token: dispatcher, body: { seatCodes: ['B04'], locked: false } });
      assert.strictEqual(again.status, 409);
      assert.strictEqual(again.body.code, 'SEAT_NOT_BLOCKED');

      const booked = await api(`/api/v1/ops/trips/${TRIP}/seats/override-lock`, { method: 'POST', token: dispatcher, body: { seatCodes: ['A03'], locked: true, reason: 'Thử' } });
      assert.strictEqual(booked.status, 409, 'a sold seat cannot be blocked');
      assert.strictEqual(booked.body.code, 'SEAT_ALREADY_BOOKED');
    });
  });

  describe('FLOW-02 boarding and no-show', () => {
    it('TC-FLOW-C04: a boarded passenger keeps the ticket under "Sắp đi" with status BOARDED until the trip ends, then it moves to "Lịch sử" (PAX-016, PAX-017)', async () => {
      const pax = await newPassenger();
      const { tickets } = await buyTickets(pax, ['A10']);
      const ticketId = tickets[0].ticket_id;
      await startTrip();

      const qr = (await api(`/api/v1/tickets/${ticketId}`, { token: pax.token })).body.data.boarding_qr.qr_code_value;
      const scan = await api(`/api/v1/driver/trips/${TRIP}/boarding`, { method: 'POST', token: driver, body: { qrPayload: qr } });
      assert.strictEqual(scan.status, 200, JSON.stringify(scan.body));
      const again = await api(`/api/v1/driver/trips/${TRIP}/boarding`, { method: 'POST', token: driver, body: { qrPayload: qr } });
      assert.strictEqual(again.status, 400);
      assert.strictEqual(again.body.code, 'ALREADY_BOARDED', 'a ticket that already boarded is refused');

      const upcoming = (await api('/api/v1/passenger/tickets?tab=UPCOMING', { token: pax.token })).body.data;
      assert.deepStrictEqual(upcoming.map((t) => [t.ticket_id, t.status]), [[ticketId, 'BOARDED']]);
      assert.strictEqual((await api('/api/v1/passenger/tickets?tab=HISTORY', { token: pax.token })).body.data.length, 0);

      const detail = await api(`/api/v1/tickets/${ticketId}`, { token: pax.token });
      assert.strictEqual(detail.status, 200, 'the boarded passenger still opens the ticket (PAX-017 status pill)');
      assert.strictEqual(detail.body.data.ticket.status, 'BOARDED');
      assert.strictEqual(detail.body.data.boarding_qr ?? null, null, 'a used ticket has no QR to share');

      services.eventBridge.emit('TRIP_COMPLETED', { tripId: TRIP, summary: {} });
      services.managerService.findTrip(TRIP).status = 'IN_TRANSIT';
      assert.strictEqual((await api('/api/v1/passenger/tickets?tab=UPCOMING', { token: pax.token })).body.data.length, 0);
      const history = (await api('/api/v1/passenger/tickets?tab=HISTORY', { token: pax.token })).body.data;
      assert.deepStrictEqual(history.map((t) => t.ticket_id), [ticketId]);
    });

    it('TC-FLOW-C05: a no-show reaches the passenger ticket, the wallet history and the manager count (DRI-011, FLOW-02 mode 3)', async () => {
      const pax = await newPassenger();
      const { tickets } = await buyTickets(pax, ['B03']);
      const ticketId = tickets[0].ticket_id;
      await startTrip();
      const before = (await mgrTrip()).no_show_passengers || 0;

      const res = await api(`/api/v1/driver/trips/${TRIP}/tickets/${ticketId}/no-show`, { method: 'POST', token: driver, body: { reason: 'Gọi 3 cuộc không nghe máy' } });
      assert.strictEqual(res.status, 200, JSON.stringify(res.body));

      const detail = await api(`/api/v1/tickets/${ticketId}`, { token: pax.token });
      assert.strictEqual(detail.body.data.ticket.status, 'NO_SHOW');
      assert.strictEqual((await api('/api/v1/passenger/tickets?tab=UPCOMING', { token: pax.token })).body.data.length, 0);
      assert.deepStrictEqual((await api('/api/v1/passenger/tickets?tab=HISTORY', { token: pax.token })).body.data.map((t) => t.ticket_id), [ticketId]);
      assert.strictEqual((await mgrTrip()).no_show_passengers, before + 1);
      const notes = (await api('/api/v1/passenger/notifications', { token: pax.token })).body.data;
      assert.ok(notes.some((n) => n.type === 'NO_SHOW'), 'the passenger is told');
    });
  });

  describe('FLOW-03 cash on delivery and change debt', () => {
    function codTicket(id, fare = 220000) {
      const trip = services.driverService.activeTrips.get(TRIP);
      trip.manifest.push({
        ticket_id: id, pnr: `COD-${id}`, passenger_name: 'Khach COD', passenger_phone: '0933111222', seat_code: id.slice(-3),
        pickup_stop: 'Giap Bat', dropoff_stop: 'Thanh Hoa', boarding_status: 'BOARDED', payment_method: 'COD', cod_amount_vnd: fare, boarded_at: null
      });
      return id;
    }

    it('TC-FLOW-C06: change owed as a debt receipt is capped at 1.000.000 đ per trip (DRI-012, BR-COD-005)', async () => {
      await startTrip();
      const pay = (ticket_id, received) => api(`/api/v1/driver/trips/${TRIP}/payments/cod-collect`, {
        method: 'POST', token: driver,
        body: { ticket_id, amount_collected_vnd: received, change_settlement_method: 'REST_STOP_DEBT_RECEIPT' }
      });
      const first = await pay(codTicket('tkt_cod_C06A'), 520000);
      assert.strictEqual(first.status, 200, JSON.stringify(first.body));
      assert.strictEqual(first.body.data.change_settlement.change_due_vnd, 300000);
      assert.ok(first.body.data.change_settlement.debt_receipt_code);
      const second = await pay(codTicket('tkt_cod_C06B'), 820000);
      assert.strictEqual(second.status, 200, JSON.stringify(second.body));
      const atCap = await pay(codTicket('tkt_cod_C06C'), 320000);
      assert.strictEqual(atCap.status, 200, 'receipts totalling exactly 1.000.000 đ are allowed');
      const tooMuch = await pay(codTicket('tkt_cod_C06D'), 230000);
      assert.strictEqual(tooMuch.status, 400, JSON.stringify(tooMuch.body));
      assert.strictEqual(tooMuch.body.code, 'DEBT_LIMIT_EXCEEDED');
      const refused = services.driverService.activeTrips.get(TRIP).manifest.find((m) => m.ticket_id === 'tkt_cod_C06D');
      assert.ok(!refused.cod_collected, 'a refused collection leaves the ticket unpaid');
      const cashBack = await api(`/api/v1/driver/trips/${TRIP}/payments/cod-collect`, {
        method: 'POST', token: driver,
        body: { ticket_id: codTicket('tkt_cod_C06E'), amount_collected_vnd: 230000, change_settlement_method: 'CASH_RETURNED' }
      });
      assert.strictEqual(cashBack.status, 200, 'change handed back in cash is not a debt and is not capped');
    });

    it('TC-FLOW-C07: the cashier redeems a debt receipt once and only once, and the redemption is audited (FLOW-03 phase 2)', async () => {
      await startTrip();
      const trip = services.driverService.activeTrips.get(TRIP);
      trip.debts.length = 0;
      const collect = await api(`/api/v1/driver/trips/${TRIP}/payments/cod-collect`, {
        method: 'POST', token: driver,
        body: { ticket_id: codTicket('tkt_cod_C07A'), amount_collected_vnd: 500000, change_settlement_method: 'REST_STOP_DEBT_RECEIPT' }
      });
      assert.strictEqual(collect.status, 200, JSON.stringify(collect.body));
      const code = collect.body.data.change_settlement.debt_receipt_code;

      assert.strictEqual((await api(`/api/v1/ops/debt-receipts/${code}/redeem`, { method: 'POST', token: driver, body: {} })).status, 403, 'a driver token is not a cashier');
      assert.strictEqual((await api(`/api/v1/ops/debt-receipts/${code}/redeem`, { method: 'POST', token: dispatcher, body: {} })).status, 403, 'the dispatcher role has no cash desk');
      assert.strictEqual((await api('/api/v1/ops/debt-receipts/DR-NOPE-1K/redeem', { method: 'POST', token: cashier, body: {} })).status, 404);

      const redeem = await api(`/api/v1/ops/debt-receipts/${code}/redeem`, { method: 'POST', token: cashier, body: { station_id: 'REST-PHU-LY' } });
      assert.strictEqual(redeem.status, 200, JSON.stringify(redeem.body));
      assert.strictEqual(redeem.body.data.status, 'REDEEMED');
      assert.strictEqual(redeem.body.data.amount_vnd, 280000);
      assert.ok(!JSON.stringify(redeem.body).includes('0933111222'), 'the cashier sees a masked phone');

      const twice = await api(`/api/v1/ops/debt-receipts/${code}/redeem`, { method: 'POST', token: cashier, body: {} });
      assert.strictEqual(twice.status, 409);
      assert.strictEqual(twice.body.code, 'DEBT_ALREADY_REDEEMED');
      const log = (await api('/api/v1/ops/audit-logs', { token: admin })).body.data.audit_logs;
      assert.ok(log.some((l) => l.action === 'DEBT_REDEEMED' && l.resource === code));
    });
  });

  describe('FLOW-04 hail passenger', () => {
    it('TC-FLOW-C08: a hailed seat is sold for the whole system at once: matrix, app, counter, manager sales (DRI-007, OQ-014)', async () => {
      const pax = await newPassenger();
      await startTrip();
      const hail = await api(`/api/v1/driver/trips/${TRIP}/onboard-hail`, { method: 'POST', token: driver, body: { seat_code: 'B09', dropoff_stop_id: 'stp_th_sam_son', passenger_name: 'Khách vẫy' } });
      assert.strictEqual(hail.status, 201, JSON.stringify(hail.body));

      assert.strictEqual(seatOf(await matrix(), 'B09').state, 'BOOKED');
      const hold = await api(`/api/v1/trips/${TRIP}/seats/hold`, { method: 'POST', token: pax.token, body: { seatCodes: ['B09'] } });
      assert.strictEqual(hold.status, 409);
      const sale = await api('/api/v1/ops/pos/orders', { method: 'POST', token: cashier, body: { tripId: TRIP, passengerName: 'Khach', phone: '0933000222', seatCodes: ['B09'] } });
      assert.strictEqual(sale.status, 409);
      const bookings = (await api('/api/v1/ops/bookings', { token: admin })).body.data.bookings;
      const row = bookings.find((b) => b.pnr === hail.body.data.pnr);
      assert.strictEqual(row.channel, 'DRIVER_HAIL');
      assert.ok(row.total_fare_vnd > 0);
    });
  });

  describe('FLOW-05 hotline hold', () => {
    it('TC-FLOW-C09: a hotline hold shows as HOTLINE_HOLD, one phone holds at most 4 seats, and it releases itself at expiry (MGR-020, BR-POS-006)', async () => {
      const hold = (seatCodes, phone, now) => api('/api/v1/ops/pos/hotline-hold', {
        method: 'POST', token: cashier,
        body: { tripId: TRIP, passengerName: 'Khách gọi', phone, seatCodes, holdPolicy: 'CUSTOM_EXPIRY_MINUTES', customExpiryMinutes: 30, now }
      });
      const first = await hold(['A07', 'A08', 'A09'], '0977000999');
      assert.strictEqual(first.status, 201, JSON.stringify(first.body));
      const state = seatOf(await matrix(), 'A07');
      assert.strictEqual(state.state, 'HOTLINE_HOLD');
      assert.ok(state.held_until);

      const over = await hold(['A11', 'B07'], '0977000999');
      assert.strictEqual(over.status, 400, JSON.stringify(over.body));
      assert.strictEqual(over.body.code, 'HOTLINE_LIMIT_EXCEEDED');
      assert.strictEqual(seatOf(await matrix(), 'A11').state, 'AVAILABLE', 'a refused hold locks nothing');
      const fine = await hold(['A11'], '0977000999');
      assert.strictEqual(fine.status, 201, 'the fourth seat is still allowed');

      const lapsed = await hold(['B08'], '0977000888', Date.now() - 2 * 60 * 60 * 1000);
      assert.strictEqual(lapsed.status, 201, JSON.stringify(lapsed.body));
      services.managerService.releaseExpiredHotlineHolds();
      assert.strictEqual(seatOf(await matrix(), 'B08').state, 'AVAILABLE');
      const pax = await newPassenger();
      assert.strictEqual((await api(`/api/v1/trips/${TRIP}/seats/hold`, { method: 'POST', token: pax.token, body: { seatCodes: ['B08'] } })).status, 200);

      // An expired reservation does not count towards the limit of the phone
      const afterExpiry = await hold(['B10'], '0977000888');
      assert.strictEqual(afterExpiry.status, 201, JSON.stringify(afterExpiry.body));
    });
  });

  describe('FLOW-06 GPS telemetry', () => {
    it('TC-FLOW-C10: a driver ping reaches the passenger app and the manager radar of the same vehicle (DRI-006, PAX-018, MGR-003)', async () => {
      await startTrip();
      const ping = await api(`/api/v1/driver/trips/${TRIP}/telemetry`, { method: 'POST', token: driver, body: { lat: 20.5511, lng: 105.9122, speed_kmh: 71, bearing_deg: 140 } });
      assert.strictEqual(ping.status, 200, JSON.stringify(ping.body));

      const tracking = (await api(`/api/v1/trips/${TRIP}/tracking`)).body.data;
      assert.strictEqual(tracking.signal_status, 'LIVE');
      const plate = services.driverService.activeTrips.get(TRIP).vehicle_plate;
      const radar = (await api('/api/v1/ops/fleet/live-positions', { token: admin })).body.data.vehicles;
      const bus = radar.find((v) => v.plate_number === plate);
      assert.ok(bus, `the vehicle ${plate} of the trip is on the manager fleet list`);
      assert.strictEqual(bus.lat, 20.5511);
      assert.strictEqual(bus.speed_kmh, 71);
      assert.strictEqual(bus.gps_health, 'LIVE');
    });

    it('TC-FLOW-C11: silence turns the passenger badge STALE after 60 s and OFFLINE after 180 s, and the manager radar follows (BR-TRACK-002, FLOW-06)', async () => {
      await startTrip();
      const t0 = Date.now();
      services.driverService.recordTelemetry(TRIP, { lat: 20.6, lng: 105.9, speed_kmh: 60, bearing_deg: 90, mockNow: t0 });
      const plate = services.driverService.activeTrips.get(TRIP).vehicle_plate;
      const hud = (secs) => services.trackingService.getLiveTrackingHUD(TRIP, undefined, undefined, t0 + secs * 1000).data;
      const radar = (secs) => services.managerService.getLiveFleetRadar(t0 + secs * 1000).data.vehicles.find((v) => v.plate_number === plate);

      assert.strictEqual(hud(30).signal_status, 'LIVE');
      assert.strictEqual(radar(30).gps_health, 'LIVE');
      assert.strictEqual(hud(61).signal_status, 'STALE');
      assert.strictEqual(radar(61).gps_health, 'STALE');
      assert.strictEqual(hud(181).signal_status, 'OFFLINE');
      assert.strictEqual(radar(181).gps_health, 'OFFLINE');
      assert.strictEqual(radar(181).gps_status, 'OFFLINE');
    });
  });

  describe('FLOW-07 incident, vehicle replacement and delay', () => {
    it('TC-FLOW-C13: a replacement driver with an expired licence is refused and nothing changes (MGR-023, DRI-001)', async () => {
      const before = await mgrTrip('trp_991824');
      const res = await api('/api/v1/ops/trips/trp_991824/replace-vehicle', {
        method: 'POST', token: dispatcher,
        body: { newVehiclePlate: '29B-888.22', newDriverId: 'drv_9902b', reason: 'Thử' }
      });
      assert.strictEqual(res.status, 409, JSON.stringify(res.body));
      assert.strictEqual(res.body.code, 'DRIVER_UNAVAILABLE');
      assert.strictEqual((await mgrTrip('trp_991824')).vehicle_plate, before.vehicle_plate);
    });

    it('TC-FLOW-C12: replacing the vehicle moves the trip to the new vehicle and driver on every side and tells the passengers (MGR-023, PAX-024, DRI-003)', async () => {
      const pax = await newPassenger();
      await buyTickets(pax, ['B11']);
      const standby = services.managerService.vehicles.find((v) => v.status === 'STANDBY');
      assert.ok(standby, 'a standby vehicle exists');
      const swap = await api(`/api/v1/ops/trips/${TRIP}/replace-vehicle`, {
        method: 'POST', token: dispatcher,
        body: { newVehiclePlate: standby.plate_number, newDriverId: 'drv_9912b', reason: 'Hỏng hộp số' }
      });
      assert.strictEqual(swap.status, 200, JSON.stringify(swap.body));

      const info = (await api(`/api/v1/trips/${TRIP}/replacement-info`)).body.data;
      assert.strictEqual(info.has_replacement, true);
      assert.strictEqual(info.new_plate_number, standby.plate_number);
      assert.ok((await api('/api/v1/passenger/notifications', { token: pax.token })).body.data.some((n) => n.type === 'SWAP'));

      const newDriver = (await login('/api/v1/auth/driver/login', { staffIdOrPhone: 'TX9912', pin: '112233' })).token;
      const mine = (await api('/api/v1/driver/trips/today', { token: newDriver })).body.data.trips.map((t) => t.trip_id);
      assert.ok(mine.includes(TRIP), 'the replacement driver now sees the trip');
      const old = (await api('/api/v1/driver/trips/today', { token: driver })).body.data.trips.map((t) => t.trip_id);
      assert.ok(!old.includes(TRIP), 'the replaced driver no longer sees it');
      assert.strictEqual((await api(`/api/v1/driver/trips/${TRIP}`, { token: driver })).status, 403);
      assert.strictEqual((await api(`/api/v1/driver/trips/${TRIP}`, { token: newDriver })).body.data.vehicle_plate, standby.plate_number);
    });

    it('TC-FLOW-C14: after an official delay over 30 minutes a passenger cancels with a full refund even inside 6 hours (PAX-025, BR-DELAY-001)', async () => {
      const pax = await newPassenger();
      const { tickets } = await buyTickets(pax, ['A05']);
      const ticketId = tickets[0].ticket_id;
      const dly = await api(`/api/v1/ops/trips/${TRIP}/delay`, { method: 'POST', token: dispatcher, body: { delayMinutes: 45, reason: 'Sự cố kỹ thuật' } });
      assert.strictEqual(dly.status, 200);

      const cancel = await api(`/api/v1/passenger/tickets/${ticketId}/cancel`, { method: 'POST', token: pax.token, body: { reason: 'Chậm quá' } });
      assert.strictEqual(cancel.status, 200, JSON.stringify(cancel.body));
      assert.strictEqual(cancel.body.data.refund_percentage, 100);
      assert.strictEqual(cancel.body.data.refund_amount_vnd, cancel.body.data.total_price_vnd);
      assert.strictEqual(cancel.body.data.tier, 'DELAY_WAIVER');
      await api(`/api/v1/ops/trips/${TRIP}/delay`, { method: 'POST', token: dispatcher, body: { delayMinutes: 0, reason: 'Hết chậm' } });
    });

    it('TC-FLOW-C15: a delay of 30 minutes or less does not waive the cancellation fee (PAX-025)', async () => {
      const pax = await newPassenger();
      const { tickets } = await buyTickets(pax, ['A02']);
      await api(`/api/v1/ops/trips/${TRIP}/delay`, { method: 'POST', token: dispatcher, body: { delayMinutes: 30, reason: 'Kẹt xe' } });
      const cancel = await api(`/api/v1/passenger/tickets/${tickets[0].ticket_id}/cancel`, { method: 'POST', token: pax.token, body: {} });
      assert.strictEqual(cancel.status, 200);
      assert.notStrictEqual(cancel.body.data.tier, 'DELAY_WAIVER');
      await api(`/api/v1/ops/trips/${TRIP}/delay`, { method: 'POST', token: dispatcher, body: { delayMinutes: 0, reason: 'Hết chậm' } });
    });

    it('TC-FLOW-C16: starting a trip puts it and its vehicle in transit on the manager side (DRI-005, MGR-014)', async () => {
      const tripId = 'trp_991823';
      // The demo data shows this trip as already running; put it back before departure
      const managerTrip = services.managerService.findTrip(tripId);
      const vehicle = services.managerService.vehicles.find((v) => v.vehicle_id === managerTrip.vehicle_id);
      managerTrip.status = 'DISPATCHED';
      vehicle.status = 'ASSIGNED';
      assert.strictEqual((await api(`/api/v1/driver/trips/${tripId}/readiness`, { method: 'POST', token: driver, body: { checklist: READY } })).status, 200);
      assert.strictEqual((await mgrTrip(tripId)).status, 'DISPATCHED', 'nothing moves before the driver starts');
      assert.strictEqual((await api(`/api/v1/driver/trips/${tripId}/start`, { method: 'POST', token: driver })).status, 200);
      assert.strictEqual((await mgrTrip(tripId)).status, 'IN_TRANSIT');
      assert.strictEqual(vehicle.status, 'IN_TRANSIT');
    });
  });
});
