import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { createFleetBusServer } from '../../source/server/apiServer.js';

describe('The driver cannot reach a home pickup address (spec A9)', () => {
  let server;
  let services;
  let baseUrl;
  let pax;
  let driver;
  let otherDriver;
  let homeTicket;
  let plainTicket;
  const TRIP = 'trp_hn_th_01';

  const request = async (path, { method = 'GET', body, token } = {}) => {
    const headers = { 'Content-Type': 'application/json', 'X-Operator-Code': 'SAOMAI' };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (method === 'POST') headers['Idempotency-Key'] = crypto.randomUUID();
    const res = await fetch(`${baseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  };
  const buy = async (seat, extra = {}) => {
    const hold = await request(`/api/v1/passenger/trips/${TRIP}/hold-seats`, { method: 'POST', token: pax, body: { seatCodes: [seat], pickupStopId: 'stp_hn_gb', dropoffStopId: 'stp_th_pb' } });
    const order = await request('/api/v1/passenger/bookings/create', { method: 'POST', token: pax, body: { tripId: TRIP, holdId: hold.body.data.hold_id, seatCodes: [seat], payer: { full_name: 'Ngô Thị Ngõ', phone: '0908889900' }, passengers: [{ seat_code: seat, full_name: 'Ngô Thị Ngõ', phone: '0908889900' }], ...extra } });
    assert.strictEqual(order.status, 201, JSON.stringify(order.body));
    services.paymentService.settlePayment(order.body.data.payment.order_id);
    return [...services.paymentService.tickets.values()].find(t => t.pnr === order.body.data.payment.pnr).ticket_id;
  };
  const report = (ticketId, body, token = driver) => request(`/api/v1/driver/trips/${TRIP}/tickets/${ticketId}/inaccessible`, { method: 'POST', token, body });

  before(async () => {
    ({ server, services } = createFleetBusServer());
    await new Promise(resolve => server.listen(0, resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    const otp = await request('/api/v1/auth/passenger/otp/request', { method: 'POST', body: { phone: '0908889900' } });
    pax = (await request('/api/v1/auth/passenger/otp/verify', { method: 'POST', body: { phone: '0908889900', otp: otp.body.data.mock_otp } })).body.data.token;
    driver = (await request('/api/v1/driver/auth/login', { method: 'POST', body: { staff_id: 'TX8821', pin: '123456' } })).body.data.token;
    otherDriver = (await request('/api/v1/driver/auth/login', { method: 'POST', body: { staff_id: 'TX9912', pin: '112233' } })).body.data.token;
    homeTicket = await buy('B08', { homePickup: { address: '45 ngõ 12 Kim Đồng', lat: 20.98, lng: 105.84 } });
    plainTicket = await buy('B09');
  });

  after(() => new Promise(resolve => server.close(resolve)));

  it('needs a reason, a home pickup ticket and the trip\'s own driver', async () => {
    assert.strictEqual((await report(homeTicket, { reason: 'x' })).status, 400);
    const plain = await report(plainTicket, { reason: 'Ngõ quá hẹp' });
    assert.strictEqual(plain.body.code, 'NOT_HOME_PICKUP');
    assert.strictEqual((await report(homeTicket, { reason: 'Ngõ quá hẹp' }, otherDriver)).status, 403);
  });

  it('tells the passenger once with the meeting point, notes the ticket and alerts the office', async () => {
    const res = await report(homeTicket, { reason: 'Ngõ quá hẹp, xe 22 chỗ không vào được', meeting_point: 'đầu ngõ 12 Kim Đồng' });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.ok(res.body.data.home_pickup.inaccessible_at);
    await report(homeTicket, { reason: 'Ngõ quá hẹp, xe 22 chỗ không vào được', meeting_point: 'đầu ngõ 12 Kim Đồng' });

    const inbox = services.trackingService.getNotifications('0908889900', 'op_saomai');
    const sent = (inbox.data?.notifications ?? inbox.data).filter(n => n.type === 'HOME_PICKUP_INACCESSIBLE');
    assert.strictEqual(sent.length, 1);
    assert.match(sent[0].body, /đầu ngõ 12 Kim Đồng/);
    assert.strictEqual(services.paymentService.tickets.get(homeTicket).home_pickup.meeting_point, 'đầu ngõ 12 Kim Đồng');
    const alerts = services.managerService.alerts.filter(a => a.type === 'HOME_PICKUP_INACCESSIBLE');
    assert.strictEqual(alerts.length, 1);
    assert.match(alerts[0].message, /Ghế B08/);
    assert.ok(services.driverService.activeTrips.get(TRIP).events.some(e => e.type === 'HOME_ADDRESS_INACCESSIBLE' && e.ticket_id === homeTicket));
  });
});
