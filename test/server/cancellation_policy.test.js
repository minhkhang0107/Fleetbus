/**
 * Cancellation policy of a bus company (D184): the server computes the refund from it and sends the same rules the
 * passenger app shows before a cancellation; only the director changes it.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { createFleetBusServer } from '../../source/server/apiServer.js';
import { generateTotp } from '../../source/server/core/totp.js';
import { DEV_TOTP_SECRET } from '../../source/server/config.js';
import { DEFAULT_CANCELLATION_POLICY, policyRules, refundByPolicy, validateCancellationPolicy } from '../../source/server/core/cancellationPolicy.js';

const PHONE = '0901234568';
const CUSTOM = { tiers: [{ min_hours_before: 24, refund_percent: 100 }, { min_hours_before: 2, refund_percent: 50 }, { min_hours_before: 0, refund_percent: 0 }], delay_waiver_minutes: 60, notes: ['Gọi tổng đài nếu cần đổi chuyến thay vì hủy.'] };

describe('Cancellation policy (D184)', () => {
  it('TC-CP-01: the default policy keeps the PAX-021 tiers', () => {
    const dep = '2026-11-02T08:00:00+07:00';
    const at = (hours) => new Date(new Date(dep).getTime() - hours * 3600000);
    assert.deepStrictEqual([12, 11.9, 6, 5.9, -1].map(h => refundByPolicy(DEFAULT_CANCELLATION_POLICY, 200000, dep, at(h)).refundAmount), [200000, 160000, 160000, 0, 0]);
    assert.strictEqual(refundByPolicy(DEFAULT_CANCELLATION_POLICY, 200000, dep, at(8)).message, 'Hủy trước giờ chạy 6-12 giờ: Hoàn tiền 80% (Phí hủy 20%)');
    assert.deepStrictEqual(policyRules(DEFAULT_CANCELLATION_POLICY).slice(0, 4), [
      'Hủy từ 12 giờ trở lên trước giờ chạy: Hoàn tiền 100%',
      'Hủy trước giờ chạy 6-12 giờ: Hoàn tiền 80% (Phí hủy 20%)',
      'Hủy dưới 6 giờ trước giờ chạy: Không hoàn tiền',
      'Chuyến chậm hơn 30 phút so với giờ chạy: Hoàn tiền 100%, không thu phí hủy'
    ]);
  });

  it('TC-CP-02: a policy that would refund more closer to the departure, or leaves a gap, is refused', () => {
    assert.strictEqual(validateCancellationPolicy(CUSTOM), null);
    assert.match(validateCancellationPolicy({ tiers: [{ min_hours_before: 12, refund_percent: 50 }, { min_hours_before: 0, refund_percent: 80 }] }), /không được hoàn nhiều hơn/);
    assert.match(validateCancellationPolicy({ tiers: [{ min_hours_before: 12, refund_percent: 100 }] }), /từ 0 giờ/);
    assert.match(validateCancellationPolicy({ tiers: [{ min_hours_before: 6, refund_percent: 100 }, { min_hours_before: 12, refund_percent: 80 }, { min_hours_before: 0, refund_percent: 0 }] }), /giảm dần/);
    assert.match(validateCancellationPolicy({ ...CUSTOM, delay_waiver_minutes: 0 }), /1-600/);
    assert.match(validateCancellationPolicy({ ...CUSTOM, notes: [''] }), /Ghi chú/);
  });

  describe('over HTTP', () => {
    let server;
    let services;
    let baseUrl;
    const request = async (path, { method = 'GET', body, token } = {}) => {
      const headers = { 'Content-Type': 'application/json', 'X-Operator-Code': 'SAOMAI' };
      if (token) headers.Authorization = `Bearer ${token}`;
      if (method !== 'GET') headers['Idempotency-Key'] = crypto.randomUUID();
      const res = await fetch(`${baseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
      return { status: res.status, body: await res.json() };
    };
    const staff = async (username, password, totp) => (await request('/api/v1/auth/staff/login', { method: 'POST', body: { username, password, totp } })).body.data.token;

    before(async () => {
      ({ server, services } = createFleetBusServer());
      await new Promise(resolve => server.listen(0, resolve));
      baseUrl = `http://127.0.0.1:${server.address().port}`;
    });
    after(() => new Promise(resolve => server.close(resolve)));

    it('TC-CP-03: the app reads the rules; only the director changes them and the refund follows', async () => {
      const shown = (await request('/api/v1/service-config')).body.data.cancellation_policy;
      assert.deepStrictEqual(shown.rules, policyRules(DEFAULT_CANCELLATION_POLICY));
      assert.strictEqual(shown.delay_waiver_minutes, 30);

      const put = (body, token) => request('/api/v1/ops/service-config/cancellation-policy', { method: 'PUT', token, body });
      const dispatcher = await staff('dispatcher@busgo.vn', 'disp123');
      const director = await staff('admin@busgo.vn', 'admin123', generateTotp(DEV_TOTP_SECRET, Date.now()));
      assert.strictEqual((await put({ cancellation_policy: CUSTOM }, dispatcher)).status, 403);
      assert.strictEqual((await put({ cancellation_policy: { tiers: [] } }, director)).status, 400);
      const ok = await put({ cancellation_policy: CUSTOM }, director);
      assert.strictEqual(ok.status, 200, JSON.stringify(ok.body));
      assert.strictEqual(ok.body.data.is_default, false);
      assert.ok(services.managerService.auditLog.some(a => a.action === 'CANCELLATION_POLICY_UPDATE'));

      const rules = (await request('/api/v1/service-config')).body.data.cancellation_policy.rules;
      assert.deepStrictEqual(rules, [
        'Hủy từ 24 giờ trở lên trước giờ chạy: Hoàn tiền 100%',
        'Hủy trước giờ chạy 2-24 giờ: Hoàn tiền 50% (Phí hủy 50%)',
        'Hủy dưới 2 giờ trước giờ chạy: Không hoàn tiền',
        'Chuyến chậm hơn 60 phút so với giờ chạy: Hoàn tiền 100%, không thu phí hủy',
        'Nhà xe không nhận đón/trả tận nhà bạn đã đặt: Hoàn tiền 100%, không thu phí hủy',
        'Gọi tổng đài nếu cần đổi chuyến thay vì hủy.'
      ]);

      // A paid ticket cancelled 3 hours before the departure: 50 % under the company's policy (80 % by default).
      const otp = await request('/api/v1/auth/passenger/otp/request', { method: 'POST', body: { phone: PHONE } });
      const pax = (await request('/api/v1/auth/passenger/otp/verify', { method: 'POST', body: { phone: PHONE, otp: otp.body.data.mock_otp } })).body.data.token;
      const seat = services.seatMapService.getSeatMap('trp_hn_th_01').data.seats.find(s => s.state === 'AVAILABLE').seat_code;
      const held = await request('/api/v1/passenger/trips/trp_hn_th_01/hold-seats', { method: 'POST', token: pax, body: { seatCodes: [seat], pickupStopId: 'stp_hn_gb', dropoffStopId: 'stp_th_pb' } });
      assert.strictEqual(held.status, 200, JSON.stringify(held.body));
      const created = await request('/api/v1/passenger/bookings/create', {
        method: 'POST',
        token: pax,
        body: { tripId: 'trp_hn_th_01', holdId: held.body.data.hold_id, seatCodes: [seat], payer: { full_name: 'Nguyễn An', phone: PHONE }, passengers: [{ seat_code: seat, full_name: 'Nguyễn An', phone: PHONE }] }
      });
      assert.strictEqual(created.status, 201, JSON.stringify(created.body));
      const ticket = services.paymentService.settlePayment(created.body.data.payment.order_id).data.tickets[0];
      const now = new Date(ticket.departure_time).getTime() - 3 * 3600000;
      const cancelled = services.paymentService.cancelTicket(ticket.ticket_id, { now, refund_account: { bank_bin: '970436', account_number: '0011004455667', account_name: 'NGUYEN AN' } });
      assert.strictEqual(cancelled.success, true, JSON.stringify(cancelled));
      assert.deepStrictEqual([cancelled.data.refund_percentage, cancelled.data.refund_amount_vnd, cancelled.data.policy_message], [50, Math.floor(ticket.fare_vnd / 2), 'Hủy trước giờ chạy 2-24 giờ: Hoàn tiền 50% (Phí hủy 50%)']);

      assert.strictEqual((await put({ cancellation_policy: null }, director)).body.data.is_default, true, 'null goes back to the default');
    });
  });
});
