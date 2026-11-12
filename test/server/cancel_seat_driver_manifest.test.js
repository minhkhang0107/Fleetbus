import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { createFleetBusServer } from '../../source/server/apiServer.js';
import { addDays, vnDate, runId } from '../../source/server/core/serviceDate.js';

describe('Driver manifest and booked_passengers_count on cancelled seat', () => {
  let server;
  let services;
  let baseUrl;
  let paxToken;
  let driverToken;

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

    // Passenger OTP login
    const otp = await request('/api/v1/auth/passenger/otp/request', { method: 'POST', body: { phone: '0905556677' } });
    paxToken = (await request('/api/v1/auth/passenger/otp/verify', { method: 'POST', body: { phone: '0905556677', otp: otp.body.data.mock_otp } })).body.data.token;

    // Driver login (TX8821 / drv_8821a)
    const drvRes = await request('/api/v1/driver/auth/login', {
      method: 'POST',
      body: { staffIdOrPhone: 'TX8821', pin: '123456' }
    });
    driverToken = drvRes.body.data.token;
  });

  after(() => new Promise(resolve => server.close(resolve)));

  it('TC-DRV-CANCEL-01: cancelling one seat of a 2-seat cash booking updates booked_passengers_count to 1 and keeps CANCELLED status on manifest', async () => {
    const day = addDays(vnDate(), 1);
    const tripId = runId('trp_hn_th_01', day);
    const ops = services.eventBridge.ensureRunOperations(tripId);
    assert.ok(ops?.driverTrip, 'driver trip materialized');

    // Hold 2 seats on the run
    const holdRes = await request(`/api/v1/passenger/trips/${tripId}/hold-seats`, {
      method: 'POST',
      token: paxToken,
      body: { seatCodes: ['A03', 'B03'], pickupStopId: 'stp_hn_gb', dropoffStopId: 'stp_th_pb' }
    });
    assert.strictEqual(holdRes.status, 200, JSON.stringify(holdRes.body));
    const holdId = holdRes.body.data.hold_id;

    // Book 2 seats with CASH (COD on board)
    const bookRes = await request('/api/v1/passenger/bookings/create', {
      method: 'POST',
      token: paxToken,
      body: {
        tripId,
        holdId,
        seatCodes: ['A03', 'B03'],
        paymentMethod: 'CASH',
        payer: { full_name: 'Nguyễn An', phone: '0905556677' },
        passengers: [
          { seat_code: 'A03', full_name: 'Nguyễn An', phone: '0905556677' },
          { seat_code: 'B03', full_name: 'Trần Bình', phone: '0905556677' }
        ]
      }
    });
    assert.strictEqual(bookRes.status, 201, JSON.stringify(bookRes.body));

    // Ensure the driver trip is within upcoming window so it appears in driver's today trips
    ops.driverTrip.planned_departure_time = new Date(Date.now() + 2 * 3600000).toISOString();

    // Check driver trips before cancel: 2 booked passengers
    const drvTripsBefore = await request('/api/v1/driver/trips/today', { token: driverToken });
    const tripBefore = drvTripsBefore.body.data.trips.find(t => t.trip_id === tripId);
    assert.ok(tripBefore, 'trip must appear in driver today trips');
    assert.strictEqual(tripBefore.booked_passengers_count, 2);
    assert.strictEqual(tripBefore.manifest.length, 2);

    // Get passenger tickets to cancel seat B03
    const ticketsRes = await request('/api/v1/passenger/tickets', { token: paxToken });
    const b03Ticket = ticketsRes.body.data.find(t => t.seat_code === 'B03');
    assert.ok(b03Ticket, 'ticket for B03 exists');

    // Cancel B03 ticket via passenger cancel API
    const cancelRes = await request(`/api/v1/passenger/tickets/${b03Ticket.ticket_id}/cancel`, {
      method: 'POST',
      token: paxToken,
      body: { reason: 'Khách hủy ghế B03' }
    });
    assert.strictEqual(cancelRes.status, 200, JSON.stringify(cancelRes.body));

    // Assert driver GET /api/v1/driver/trips/today
    const drvTripsAfter = await request('/api/v1/driver/trips/today', { token: driverToken });
    const tripAfter = drvTripsAfter.body.data.trips.find(t => t.trip_id === tripId);
    assert.ok(tripAfter, 'trip still appears in driver today trips');

    // booked_passengers_count must be 1 (only non-cancelled seats)
    assert.strictEqual(tripAfter.booked_passengers_count, 1);

    // Cancelled item stays in manifest with boarding_status CANCELLED
    const cancelledItem = tripAfter.manifest.find(m => m.seat_code === 'B03');
    assert.ok(cancelledItem, 'cancelled item still exists in manifest');
    assert.strictEqual(cancelledItem.boarding_status, 'CANCELLED');

    // Remaining seat A03 is NOT_BOARDED
    const activeItem = tripAfter.manifest.find(m => m.seat_code === 'A03');
    assert.ok(activeItem, 'active item exists in manifest');
    assert.strictEqual(activeItem.boarding_status, 'NOT_BOARDED');
  });
});
