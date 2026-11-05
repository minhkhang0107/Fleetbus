import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { createFleetBusServer } from '../../source/server/apiServer.js';
import { Messenger, PUSH_CHANNEL_ID } from '../../source/server/core/messaging.js';
import { addDays, vnDate } from '../../source/server/core/serviceDate.js';

/** D192: push for every notice of a phone with a token, data to open the right screen, dead tokens, the driver app. */
describe('Push notifications for both apps (D192)', () => {
  const tick = () => new Promise(r => setTimeout(r, 20));

  it('a phone with a token gets every notice by push, with what the app needs to open it; without one only SMS types leave', async () => {
    const sent = [];
    const fcm = { send: async (m) => { sent.push(m); return { ok: true, status: 200 }; } };
    const m = new Messenger({ env: {}, fcm });
    m.registerDevice('0901000008', { token: 'tok-1', platform: 'ios', operatorId: 'op_saomai' });
    const e = m.dispatch({ operatorId: 'op_saomai', phone: '0901000008', title: 'Thanh toán thành công', body: 'Vé BG-1', type: 'PAYMENT_SUCCESS', payload: { ticket_id: 'tkt_1', pnr: 'BG-1', trip_id: 'trp_1' }, noticeId: 'notif_1' });
    await tick();
    assert.deepStrictEqual([e.channel, e.status], ['PUSH', 'SENT']);
    assert.deepStrictEqual(sent[0].data, { notice_id: 'notif_1', ticket_id: 'tkt_1', pnr: 'BG-1', trip_id: 'trp_1' });
    assert.strictEqual(m.dispatch({ operatorId: 'op_saomai', phone: '0901000009', title: 't', body: 'b', type: 'PAYMENT_SUCCESS' }), null, 'no token: a payment notice stays in the app');
  });

  it('the FCM message names the Android channel and the iPhone sound, and carries only strings', async () => {
    const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const account = { project_id: 'busgo-test', client_email: 'a@b.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) };
    const bodies = [];
    const fetchImpl = async (url, init) => {
      if (url.includes('oauth2')) return { ok: true, status: 200, json: async () => ({ access_token: 't', expires_in: 3600 }) };
      bodies.push(JSON.parse(init.body));
      return { ok: true, status: 200, json: async () => ({}) };
    };
    const { FcmSender } = await import('../../source/server/core/messaging.js');
    await new FcmSender(account, fetchImpl).send({ to: 'tok', title: 'T', body: 'B', type: 'TRIP_DELAY', data: { ticket_id: 'tkt_1', notice_id: null } });
    const msg = bodies[0].message;
    assert.strictEqual(msg.android.notification.channel_id, PUSH_CHANNEL_ID);
    assert.strictEqual(msg.apns.payload.aps.sound, 'default');
    assert.deepStrictEqual(msg.data, { ticket_id: 'tkt_1', type: 'TRIP_DELAY', link: '' });
  });

  it('a token FCM calls UNREGISTERED is dropped, so the next "bus is coming" goes by SMS', async () => {
    const fcm = { send: async () => ({ ok: false, status: 404, json: async () => ({ error: { status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } }) }) };
    const m = new Messenger({ env: {}, fcm });
    m.registerDevice('0901000008', { token: 'gone', platform: 'android', operatorId: 'op_saomai' });
    const first = m.dispatch({ operatorId: 'op_saomai', phone: '0901000008', title: 't', body: 'b', type: 'PICKUP_APPROACHING' });
    await tick();
    assert.strictEqual(first.status, 'FAILED');
    assert.strictEqual(m.dispatch({ operatorId: 'op_saomai', phone: '0901000008', title: 't', body: 'b', type: 'PICKUP_APPROACHING' }).channel, 'SMS');
  });

  describe('the driver app', () => {
    let server, services, baseUrl, dispatcher;
    const pushes = [];
    const request = async (path, { method = 'GET', token, body } = {}) => {
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      if (method === 'POST') headers['Idempotency-Key'] = crypto.randomUUID();
      const res = await fetch(`${baseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
      return { status: res.status, body: await res.json() };
    };
    const driverLogin = async (id, pin) => (await request('/api/v1/auth/driver/login', { method: 'POST', body: { staffIdOrPhone: id, pin } })).body.data.token;

    before(async () => {
      const fcm = { send: async (m) => { pushes.push(m); return { ok: true, status: 200 }; } };
      ({ server, services } = createFleetBusServer({ messenger: new Messenger({ env: {}, fcm }) }));
      await new Promise(resolve => server.listen(0, resolve));
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      dispatcher = (await request('/api/v1/ops/auth/login', { method: 'POST', body: { username: 'dispatcher@busgo.vn', password: 'disp123' } })).body.data.token;
    });
    after(() => new Promise(resolve => server.close(resolve)));

    it('registers its token, then hears of a trip given, taken to another driver, and cancelled', async () => {
      for (const [id, pin, token] of [['TX8821', '123456', 'drv-tok-a'], ['TX9912', '112233', 'drv-tok-b']]) {
        const r = await request('/api/v1/driver/devices', { method: 'POST', token: await driverLogin(id, pin), body: { token, platform: 'android' } });
        assert.strictEqual(r.status, 200, JSON.stringify(r.body));
      }
      assert.strictEqual((await request('/api/v1/driver/devices', { method: 'POST', body: { token: 'x' } })).status, 401);

      const tripId = `trp_hn_th_02_${addDays(vnDate(Date.now()), 2).replaceAll('-', '')}`;
      assert.strictEqual((await request(`/api/v1/ops/trips/${tripId}/assign`, { method: 'POST', token: dispatcher, body: { vehicleId: 'veh_01', driverId: 'drv_8821a' } })).status, 200);
      assert.strictEqual((await request(`/api/v1/ops/trips/${tripId}/assign`, { method: 'POST', token: dispatcher, body: { vehicleId: 'veh_01', driverId: 'drv_9912b' } })).status, 200);
      const cancel = await request(`/api/v1/ops/trips/${tripId}/cancel`, { method: 'POST', token: dispatcher, body: { reason: 'Đường ngập, nghỉ chạy' } });
      assert.strictEqual(cancel.status, 200, JSON.stringify(cancel.body));
      await tick();

      assert.deepStrictEqual(pushes.map(p => [p.to, p.type]), [
        ['drv-tok-a', 'TRIP_ASSIGNED'],
        ['drv-tok-b', 'TRIP_ASSIGNED'],
        ['drv-tok-a', 'TRIP_UNASSIGNED'],
        ['drv-tok-b', 'TRIP_CANCELLED']
      ]);
      assert.match(pushes[0].body, /^Chuyến 14:00 ngày \d\d\/\d\d, .*xe 29B-123\.45/);
      assert.match(pushes[3].body, /Đường ngập, nghỉ chạy/);
      assert.ok(pushes.every(p => p.data.trip_id === tripId));
    });

    it('a cancelled trip tells a two-seat booking once, with both seats and the whole refund (D193)', async () => {
      const otp = await request('/api/v1/auth/passenger/otp/request', { method: 'POST', body: { phone: '0906667799' } });
      const pax = (await request('/api/v1/auth/passenger/otp/verify', { method: 'POST', body: { phone: '0906667799', otp: otp.body.data.mock_otp } })).body.data.token;
      const tripId = `trp_hn_th_02_${addDays(vnDate(Date.now()), 3).replaceAll('-', '')}`;
      const hold = await request(`/api/v1/passenger/trips/${tripId}/hold-seats`, { method: 'POST', token: pax, body: { seatCodes: ['A04', 'A05'] } });
      assert.strictEqual(hold.status, 200, JSON.stringify(hold.body));
      const order = await request('/api/v1/passenger/bookings/create', { method: 'POST', token: pax, body: { tripId, holdId: hold.body.data.hold_id, seatCodes: ['A04', 'A05'], payer: { full_name: 'Vũ Thị Hủy', phone: '0906667799' }, passengers: [{ seat_code: 'A04', full_name: 'Vũ Thị Hủy', phone: '0906667799' }, { seat_code: 'A05', full_name: 'Vũ Thị Hủy', phone: '0906667799' }] } });
      assert.strictEqual(order.status, 201, JSON.stringify(order.body));
      services.paymentService.settlePayment(order.body.data.payment.order_id);
      const fare = [...services.paymentService.tickets.values()].filter(t => t.pnr === order.body.data.pnr || t.order_id === order.body.data.payment.order_id).reduce((sum, t) => sum + t.fare_vnd, 0);

      assert.strictEqual((await request(`/api/v1/ops/trips/${tripId}/cancel`, { method: 'POST', token: dispatcher, body: { reason: 'Xe hỏng, nghỉ chạy' } })).status, 200);
      const inbox = services.trackingService.getNotifications('0906667799', 'op_saomai');
      const list = (inbox.data?.notifications ?? inbox.data).filter(n => n.type === 'TRIP_CANCELLED');
      assert.strictEqual(list.length, 1);
      assert.match(list[0].body, /ghế A04, A05\) đã bị hủy: Xe hỏng, nghỉ chạy\./);
      assert.ok(list[0].body.includes(`hoàn 100% ${fare.toLocaleString('vi-VN')} đ`), list[0].body);
      assert.strictEqual(list[0].payload.refund_amount_vnd, fare);
    });
  });
});
