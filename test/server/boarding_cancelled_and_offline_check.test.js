import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { createFleetBusServer } from '../../source/server/apiServer.js';
import { addDays, vnDate, runId } from '../../source/server/core/serviceDate.js';
import { VIP_PASSENGER_PHONE, VIP_PASSENGER_OTP } from '../../source/server/config.js';

describe('Boarding cancelled tickets protection and offline check data', () => {
  let server;
  let services;
  let baseUrl;
  let paxToken;
  let driverToken;
  let tripId;
  let ops;
  let order;
  let a03Ticket;
  let b03Ticket;
  let a03SingleQr;
  let b03SingleQr;
  let oldGroupQr;

  const request = async (path, { method = 'GET', body, token } = {}) => {
    const headers = { 'Content-Type': 'application/json', 'X-Operator-Code': 'SAOMAI' };
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

    // VIP Passenger login (0999888777 / 888777) -> instant prepaid booking
    const otp = await request('/api/v1/auth/passenger/otp/request', {
      method: 'POST',
      body: { phone: VIP_PASSENGER_PHONE }
    });
    assert.strictEqual(otp.status, 200);
    const verifyRes = await request('/api/v1/auth/passenger/otp/verify', {
      method: 'POST',
      body: { phone: VIP_PASSENGER_PHONE, otp: VIP_PASSENGER_OTP }
    });
    assert.strictEqual(verifyRes.status, 200);
    paxToken = verifyRes.body.data.token;

    // Driver login (TX8821 / 123456)
    const drvRes = await request('/api/v1/driver/auth/login', {
      method: 'POST',
      body: { staffIdOrPhone: 'TX8821', pin: '123456' }
    });
    assert.strictEqual(drvRes.status, 200);
    driverToken = drvRes.body.data.token;

    // Setup tomorrow trip run
    const day = addDays(vnDate(), 1);
    tripId = runId('trp_hn_th_01', day);
    ops = services.eventBridge.ensureRunOperations(tripId);
    assert.ok(ops?.driverTrip, 'driver trip materialized');

    // Hold 2 seats: A03 and B03
    const holdRes = await request(`/api/v1/passenger/trips/${tripId}/hold-seats`, {
      method: 'POST',
      token: paxToken,
      body: { seatCodes: ['A03', 'B03'], pickupStopId: 'stp_hn_gb', dropoffStopId: 'stp_th_pb' }
    });
    assert.strictEqual(holdRes.status, 200, JSON.stringify(holdRes.body));
    const holdId = holdRes.body.data.hold_id;

    // Book 2 seats with VIP passenger (prepaid)
    const bookRes = await request('/api/v1/passenger/bookings/create', {
      method: 'POST',
      token: paxToken,
      body: {
        tripId,
        holdId,
        seatCodes: ['A03', 'B03'],
        payer: { full_name: 'Khách Hàng VIP', phone: VIP_PASSENGER_PHONE },
        passengers: [
          { seat_code: 'A03', full_name: 'Nguyễn Văn An', phone: VIP_PASSENGER_PHONE },
          { seat_code: 'B03', full_name: 'Trần Văn Bình', phone: VIP_PASSENGER_PHONE }
        ]
      }
    });
    assert.strictEqual(bookRes.status, 201, JSON.stringify(bookRes.body));
    order = bookRes.body.data;

    // Fetch passenger tickets
    const ticketsRes = await request('/api/v1/passenger/tickets', { token: paxToken });
    assert.strictEqual(ticketsRes.status, 200);
    a03Ticket = ticketsRes.body.data.find(t => t.seat_code === 'A03');
    b03Ticket = ticketsRes.body.data.find(t => t.seat_code === 'B03');
    assert.ok(a03Ticket, 'A03 ticket exists');
    assert.ok(b03Ticket, 'B03 ticket exists');

    const pnr = b03Ticket.pnr;

    // Single QR codes
    const a03Pass = services.paymentService.getBoardingPass(a03Ticket.ticket_id);
    a03SingleQr = a03Pass.data.boarding_qr.qr_code_value;
    const b03Pass = services.paymentService.getBoardingPass(b03Ticket.ticket_id);
    b03SingleQr = b03Pass.data.boarding_qr.qr_code_value;

    // Old Group QR (issued before cancel of B03)
    const groupPass = services.paymentService.getGroupBoardingPass(pnr);
    assert.strictEqual(groupPass.success, true);
    oldGroupQr = groupPass.data.group_qr.qr_code_value;

    // Cancel seat B03
    const cancelRes = await request(`/api/v1/passenger/tickets/${b03Ticket.ticket_id}/cancel`, {
      method: 'POST',
      token: paxToken,
      body: { reason: 'Khách hủy ghế B03' }
    });
    assert.strictEqual(cancelRes.status, 200, JSON.stringify(cancelRes.body));

    // Ensure trip is upcoming so it appears in driver's today trips
    ops.driverTrip.planned_departure_time = new Date(Date.now() + 2 * 3600000).toISOString();
  });

  after(() => new Promise(resolve => server.close(resolve)));

  it('TC-OFFLINE-CHECK-01: trips/today, trip detail, and manifest carry boarding_check with matching group_digest', async () => {
    // Current group pass has active ticket A03 only (B03 was cancelled)
    const currentGroupPass = services.paymentService.getGroupBoardingPass(a03Ticket.pnr);
    assert.strictEqual(currentGroupPass.success, true);
    const expectedGroupHmac = currentGroupPass.data.group_qr.hmac_signature;
    assert.ok(expectedGroupHmac && typeof expectedGroupHmac === 'string');

    // 1. GET /api/v1/driver/trips/today
    const todayRes = await request('/api/v1/driver/trips/today', { token: driverToken });
    assert.strictEqual(todayRes.status, 200);
    const todayTrip = todayRes.body.data.trips.find(t => t.trip_id === tripId);
    assert.ok(todayTrip, 'trip found in today trips');

    const todayA03 = todayTrip.manifest.find(m => m.seat_code === 'A03');
    const todayB03 = todayTrip.manifest.find(m => m.seat_code === 'B03');
    assert.ok(todayA03.boarding_check, 'active seat A03 has boarding_check');
    assert.strictEqual(todayA03.boarding_check.qr_version, 1);
    assert.ok(todayA03.boarding_check.qr_digest, 'has qr_digest');
    assert.ok(todayA03.boarding_check.pin_digest, 'has pin_digest');
    assert.strictEqual(todayA03.boarding_check.group_digest, expectedGroupHmac);
    assert.strictEqual(todayB03.boarding_check, undefined, 'cancelled seat B03 omits boarding_check');

    // 2. GET /api/v1/driver/trips/:tripId (trip detail)
    const detailRes = await request(`/api/v1/driver/trips/${tripId}`, { token: driverToken });
    assert.strictEqual(detailRes.status, 200);
    const detailA03 = detailRes.body.data.manifest.find(m => m.seat_code === 'A03');
    const detailB03 = detailRes.body.data.manifest.find(m => m.seat_code === 'B03');
    assert.ok(detailA03.boarding_check, 'active seat A03 has boarding_check');
    assert.strictEqual(detailA03.boarding_check.group_digest, expectedGroupHmac);
    assert.strictEqual(detailB03.boarding_check, undefined, 'cancelled seat B03 omits boarding_check');

    // 3. GET /api/v1/driver/trips/:tripId/manifest (manifest endpoint)
    const manifestRes = await request(`/api/v1/driver/trips/${tripId}/manifest`, { token: driverToken });
    assert.strictEqual(manifestRes.status, 200);
    const manifestA03 = manifestRes.body.data.manifest.find(m => m.seat_code === 'A03');
    const manifestB03 = manifestRes.body.data.manifest.find(m => m.seat_code === 'B03');
    assert.ok(manifestA03.boarding_check, 'active seat A03 has boarding_check');
    assert.strictEqual(manifestA03.boarding_check.group_digest, expectedGroupHmac);
    assert.strictEqual(manifestB03.boarding_check, undefined, 'cancelled seat B03 omits boarding_check');
  });

  it('TC-BOARD-CANCEL-01: cancelled single QR is rejected with TICKET_CANCELLED (status 400)', async () => {
    const res = await request(`/api/v1/driver/trips/${tripId}/board-qr`, {
      method: 'POST',
      token: driverToken,
      body: { qrString: b03SingleQr }
    });

    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.code, 'TICKET_CANCELLED');
    assert.strictEqual(res.body.message, 'Vé ghế B03 đã hủy, không cho lên xe.');

    // Manifest check: B03 remains CANCELLED
    const mItem = ops.driverTrip.manifest.find(m => m.ticket_id === b03Ticket.ticket_id);
    assert.strictEqual(mItem.boarding_status, 'CANCELLED');
  });

  it('TC-BOARD-CANCEL-02: old group QR boards active seat A03 and returns B03 in cancelled_passengers', async () => {
    const res = await request(`/api/v1/driver/trips/${tripId}/board-qr`, {
      method: 'POST',
      token: driverToken,
      body: { qrString: oldGroupQr }
    });

    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const data = res.body.data;
    assert.strictEqual(data.boarded_passengers.length, 1);
    assert.strictEqual(data.boarded_passengers[0].seat_code, 'A03');
    assert.strictEqual(data.cancelled_passengers.length, 1);
    assert.strictEqual(data.cancelled_passengers[0].seat_code, 'B03');

    // Manifest check
    const a03Item = ops.driverTrip.manifest.find(m => m.ticket_id === a03Ticket.ticket_id);
    const b03Item = ops.driverTrip.manifest.find(m => m.ticket_id === b03Ticket.ticket_id);
    assert.strictEqual(a03Item.boarding_status, 'BOARDED');
    assert.strictEqual(b03Item.boarding_status, 'CANCELLED');
  });

  it('TC-BOARD-CANCEL-03: group QR fails with TICKET_CANCELLED naming the seat when nobody could board', async () => {
    // Both members in old group QR cannot board now: A03 is already BOARDED, B03 is CANCELLED
    const res = await request(`/api/v1/driver/trips/${tripId}/board-qr`, {
      method: 'POST',
      token: driverToken,
      body: { qrString: oldGroupQr }
    });

    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.code, 'TICKET_CANCELLED');
    assert.strictEqual(res.body.message, 'Vé ghế B03 đã hủy, không cho lên xe.');
  });

  it('TC-BOARD-FORGED-01: forged QR error text has no INVALID_SIGNATURE and uses plain Vietnamese', async () => {
    const forgedSingle = a03SingleQr.replace(/\|[0-9a-f]{16}$/, '|deadbeefdeadbeef');
    const resSingle = await request(`/api/v1/driver/trips/${tripId}/board-qr`, {
      method: 'POST',
      token: driverToken,
      body: { qrString: forgedSingle }
    });
    assert.strictEqual(resSingle.status, 400);
    assert.strictEqual(resSingle.body.code, 'INVALID_SIGNATURE');
    assert.ok(!resSingle.body.message.includes('INVALID_SIGNATURE'));
    assert.strictEqual(resSingle.body.message, 'Mã vé bị sửa hoặc giả. Không cho lên xe, gọi nhà xe nếu khách phản đối.');

    const forgedGroup = oldGroupQr.replace(/\|[0-9a-f]{16}$/, '|deadbeefdeadbeef');
    const resGroup = await request(`/api/v1/driver/trips/${tripId}/board-qr`, {
      method: 'POST',
      token: driverToken,
      body: { qrString: forgedGroup }
    });
    assert.strictEqual(resGroup.status, 400);
    assert.strictEqual(resGroup.body.code, 'INVALID_SIGNATURE');
    assert.ok(!resGroup.body.message.includes('INVALID_SIGNATURE'));
    assert.strictEqual(resGroup.body.message, 'Mã vé bị sửa hoặc giả. Không cho lên xe, gọi nhà xe nếu khách phản đối.');

    const resMalformed = await request(`/api/v1/driver/trips/${tripId}/board-qr`, {
      method: 'POST',
      token: driverToken,
      body: { qrString: 'NOT_A_BUSGO_CODE' }
    });
    assert.strictEqual(resMalformed.status, 400);
    assert.strictEqual(resMalformed.body.code, 'INVALID_FORMAT');
    assert.ok(!resMalformed.body.message.includes('INVALID_FORMAT'));
    assert.strictEqual(resMalformed.body.message, 'Không phải mã vé BusGo. Đề nghị khách mở vé trong app.');
  });

  it('TC-PIN-CANCEL-01: PIN boarding skips cancelled seat and places it into cancelled_passengers', async () => {
    // Book 2 new seats A05 and B05
    const holdRes = await request(`/api/v1/passenger/trips/${tripId}/hold-seats`, {
      method: 'POST',
      token: paxToken,
      body: { seatCodes: ['A05', 'B05'], pickupStopId: 'stp_hn_gb', dropoffStopId: 'stp_th_pb' }
    });
    assert.strictEqual(holdRes.status, 200, JSON.stringify(holdRes.body));
    const holdId = holdRes.body.data.hold_id;

    const bookRes = await request('/api/v1/passenger/bookings/create', {
      method: 'POST',
      token: paxToken,
      body: {
        tripId,
        holdId,
        seatCodes: ['A05', 'B05'],
        payer: { full_name: 'Khách Hàng VIP', phone: VIP_PASSENGER_PHONE },
        passengers: [
          { seat_code: 'A05', full_name: 'Nguyễn Văn Cường', phone: VIP_PASSENGER_PHONE },
          { seat_code: 'B05', full_name: 'Lê Văn Dũng', phone: VIP_PASSENGER_PHONE }
        ]
      }
    });
    assert.strictEqual(bookRes.status, 201, JSON.stringify(bookRes.body));

    const ticketsRes = await request('/api/v1/passenger/tickets', { token: paxToken });
    const a05Ticket = ticketsRes.body.data.find(t => t.seat_code === 'A05');
    const b05Ticket = ticketsRes.body.data.find(t => t.seat_code === 'B05');
    assert.ok(a05Ticket && b05Ticket);

    // Cancel B05
    const cancelRes = await request(`/api/v1/passenger/tickets/${b05Ticket.ticket_id}/cancel`, {
      method: 'POST',
      token: paxToken,
      body: { reason: 'Khách hủy B05' }
    });
    assert.strictEqual(cancelRes.status, 200);

    // Get A05 offline PIN
    const ticketPass = services.paymentService.getBoardingPass(a05Ticket.ticket_id);
    assert.strictEqual(ticketPass.success, true);
    const pin = ticketPass.data.offline_pin;
    assert.ok(pin, 'PIN found');

    // Board via PIN
    const pinRes = await request(`/api/v1/driver/trips/${tripId}/boarding/manual`, {
      method: 'POST',
      token: driverToken,
      body: { ticket_id: a05Ticket.ticket_id, pin }
    });

    assert.strictEqual(pinRes.status, 200, JSON.stringify(pinRes.body));
    const data = pinRes.body.data;
    assert.ok(data.boarded_passengers.some(p => p.seat_code === 'A05'));
    assert.ok(data.cancelled_passengers.some(p => p.seat_code === 'B05'));
    assert.strictEqual(data.revoked_passengers.length, 0);
  });
  it('TC-PIN-CANCEL-02: the PIN of a booking whose seats are all cancelled is refused, not a success with nobody aboard', async () => {
    const holdRes = await request(`/api/v1/passenger/trips/${tripId}/hold-seats`, {
      method: 'POST',
      token: paxToken,
      body: { seatCodes: ['A06'], pickupStopId: 'stp_hn_gb', dropoffStopId: 'stp_th_pb' }
    });
    assert.strictEqual(holdRes.status, 200, JSON.stringify(holdRes.body));
    const bookRes = await request('/api/v1/passenger/bookings/create', {
      method: 'POST',
      token: paxToken,
      body: {
        tripId,
        holdId: holdRes.body.data.hold_id,
        seatCodes: ['A06'],
        payer: { full_name: 'Khách Hàng VIP', phone: VIP_PASSENGER_PHONE },
        passengers: [{ seat_code: 'A06', full_name: 'Phạm Văn Em', phone: VIP_PASSENGER_PHONE }]
      }
    });
    assert.strictEqual(bookRes.status, 201, JSON.stringify(bookRes.body));
    const ticket = (await request('/api/v1/passenger/tickets', { token: paxToken })).body.data.find(t => t.seat_code === 'A06');
    const pin = services.paymentService.getBoardingPass(ticket.ticket_id).data.offline_pin;
    const cancelRes = await request(`/api/v1/passenger/tickets/${ticket.ticket_id}/cancel`, { method: 'POST', token: paxToken, body: { reason: 'Khách hủy A06' } });
    assert.strictEqual(cancelRes.status, 200);

    const pinRes = await request(`/api/v1/driver/trips/${tripId}/boarding/manual`, {
      method: 'POST',
      token: driverToken,
      body: { ticket_id: ticket.ticket_id, pin }
    });
    assert.notStrictEqual(pinRes.status, 200, JSON.stringify(pinRes.body));
    assert.strictEqual(pinRes.body.code, 'TICKET_CANCELLED');
  });
});
