/**
 * Launch security tests:
 * - B-03: Client-supplied `now` ignored in production across routes
 * - B-01: OTP sent via SMS webhook, masked in outbox, 503 OTP_PROVIDER_UNAVAILABLE in production without provider
 * - H-05: Per-IP sliding-window rate limiting and FLEETBUS_TRUST_PROXY client IP resolution
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { createFleetBusServer } from '../../source/server/apiServer.js';
import { RateLimiter, clientIp } from '../../source/server/core/rateLimit.js';
import { clientNow } from '../../source/server/middleware/httpUtils.js';

const TRIP = 'trp_hn_th_01';

describe('Launch security (B-01, B-03, H-05)', () => {
  let server;
  let services;
  let baseUrl;
  const webhookCalls = [];

  const fakeFetch = async (url, init = {}) => {
    webhookCalls.push({
      url,
      method: init.method || 'GET',
      headers: init.headers || {},
      body: init.body ? JSON.parse(init.body) : null
    });
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  };

  const api = async (path, { method = 'GET', body, token, operatorCode = 'SAOMAI', headers = {} } = {}) => {
    const h = { 'Content-Type': 'application/json', ...headers };
    if (token) h.Authorization = `Bearer ${token}`;
    if (operatorCode) h['X-Operator-Code'] = operatorCode;
    if (method === 'POST' && !h['Idempotency-Key']) h['Idempotency-Key'] = crypto.randomUUID();
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: h,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    return {
      status: res.status,
      headers: res.headers,
      body: await res.json()
    };
  };

  before(async () => {
    ({ server, services } = createFleetBusServer({
      authMode: 'enforce',
      webhookSecret: null,
      fetchImpl: fakeFetch
    }));
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(() => new Promise(resolve => server.close(resolve)));

  it('1. B-03: clientNow honours body.now outside production and always uses Date.now() in production', async () => {
    const pastMs = 1700000000000;
    assert.strictEqual(clientNow({ now: pastMs }), pastMs);

    // Issue a paid ticket and set its departure 2 hours from real Date.now() (< 4h -> 0% refund at real time, 100% refund 24h before)
    const otpReq = await api('/api/v1/auth/passenger/otp/request', {
      method: 'POST',
      body: { phone: '0912340091' }
    });
    assert.strictEqual(otpReq.status, 200);
    const paxVerify = await api('/api/v1/auth/passenger/otp/verify', {
      method: 'POST',
      body: { phone: '0912340091', otp: otpReq.body.data.mock_otp }
    });
    assert.strictEqual(paxVerify.status, 200);
    const paxToken = paxVerify.body.data.token;

    const hold = await api(`/api/v1/trips/${TRIP}/seats/hold`, {
      method: 'POST',
      token: paxToken,
      body: { seatCodes: ['A01'] }
    });
    assert.strictEqual(hold.status, 200);

    const booking = await api('/api/v1/bookings/create', {
      method: 'POST',
      token: paxToken,
      body: {
        tripId: TRIP,
        holdId: hold.body.data.hold_id,
        seatCodes: ['A01'],
        paymentMethod: 'CASH',
        payer: { full_name: 'Nguyễn Văn Bảo Mật', phone: '0912340091' },
        passengers: [{ seat_code: 'A01', full_name: 'Nguyễn Văn Bảo Mật', phone: '0912340091' }]
      }
    });
    assert.strictEqual(booking.status, 201, JSON.stringify(booking.body));
    const order = services.paymentService.orders.get(booking.body.data.payment.order_id);
    const ticketId = order.ticket_ids[0];
    const ticket = services.paymentService.tickets.get(ticketId);

    // Put departure 2 hours from real Date.now() so real time gives 0% refund (< 4h before departure),
    // whereas a forged client `now` 24h before departure would give 100% refund if not ignored.
    const realNow = Date.now();
    const depMs = realNow + 2 * 3600 * 1000;
    ticket.departure_time = new Date(depMs).toISOString();
    const forgedEarlyNow = depMs - 24 * 3600 * 1000;

    const savedEnv = process.env.NODE_ENV;
    const savedTokenSecret = process.env.FLEETBUS_TOKEN_SECRET;
    process.env.NODE_ENV = 'production';
    process.env.FLEETBUS_TOKEN_SECRET = 'fleetbus_dev_only_token_secret';
    try {
      assert.ok(Math.abs(clientNow({ now: forgedEarlyNow }) - Date.now()) < 5000);

      const cancelRes = await api(`/api/v1/passenger/tickets/${ticketId}/cancel`, {
        method: 'POST',
        token: paxToken,
        body: { now: forgedEarlyNow }
      });
      assert.strictEqual(cancelRes.status, 200, JSON.stringify(cancelRes.body));
      assert.strictEqual(cancelRes.body.data.refund_amount_vnd, 0, 'forged early body.now must be ignored in production');
      const cancelledAtMs = Date.parse(cancelRes.body.data.cancelled_at);
      assert.ok(Math.abs(cancelledAtMs - Date.now()) < 10000, 'cancelled_at must use real server time');
    } finally {
      if (savedEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = savedEnv;
      if (savedTokenSecret === undefined) delete process.env.FLEETBUS_TOKEN_SECRET;
      else process.env.FLEETBUS_TOKEN_SECRET = savedTokenSecret;
    }
  });

  it('2. B-01: OTP is sent to FLEETBUS_SMS_WEBHOOK_URL without diacritics, mock_otp is omitted, and outbox masks the code', async () => {
    webhookCalls.length = 0;
    services.messenger.smsUrl = 'https://sms.busgo.example/webhook';
    try {
      const phone = '0903112233';
      const res = await api('/api/v1/passenger/auth/request-otp', {
        method: 'POST',
        body: { phone }
      });
      assert.strictEqual(res.status, 200, JSON.stringify(res.body));
      assert.strictEqual(res.body.data.mock_otp, undefined, 'mock_otp must never be returned when SMS provider is configured');

      assert.strictEqual(webhookCalls.length, 1);
      const call = webhookCalls[0];
      assert.strictEqual(call.url, 'https://sms.busgo.example/webhook');
      assert.strictEqual(call.method, 'POST');
      assert.strictEqual(call.body.to, phone);
      assert.strictEqual(call.body.type, 'OTP');
      assert.match(call.body.text, /^BusGo: Ma xac thuc cua ban la (\d{6}), hieu luc 5 phut\. Khong chia se ma nay\.$/);
      // Verify no Vietnamese diacritics in SMS text
      assert.strictEqual(/^[\x20-\x7E]+$/.test(call.body.text), true, 'SMS text must be pure ASCII without diacritics');

      const sentOtp = call.body.text.match(/(\d{6})/)[1];

      // Outbox entry must mask the OTP as ****** and must not contain the code
      const outboxEntry = services.messenger.outbox.find(m => m.type === 'OTP' && m.to === phone);
      assert.ok(outboxEntry, 'OTP message must be recorded in messenger outbox');
      assert.ok(outboxEntry.text.includes('******'), 'outbox entry must mask OTP as ******');
      assert.strictEqual(outboxEntry.text.includes(sentOtp), false, 'outbox entry must not contain the raw OTP');

      // The OTP sent to the webhook verifies and issues a token
      const verifyRes = await api('/api/v1/passenger/auth/verify-otp', {
        method: 'POST',
        body: { phone, otp: sentOtp }
      });
      assert.strictEqual(verifyRes.status, 200, JSON.stringify(verifyRes.body));
      assert.ok(verifyRes.body.data.token);
    } finally {
      services.messenger.smsUrl = null;
    }
  });

  it('3. B-01: in production without an SMS provider, requestOTP returns 503 OTP_PROVIDER_UNAVAILABLE, stores no OTP, and server start logs a warning', async () => {
    const savedEnv = process.env.NODE_ENV;
    const savedSmsUrl = process.env.FLEETBUS_SMS_WEBHOOK_URL;
    const savedTokenSecret = process.env.FLEETBUS_TOKEN_SECRET;
    const savedTicketSecret = process.env.FLEETBUS_TICKET_SECRET;
    const savedWebhookSecret = process.env.FLEETBUS_WEBHOOK_SECRET;
    const savedDbKey = process.env.FLEETBUS_DB_KEY;

    process.env.NODE_ENV = 'production';
    delete process.env.FLEETBUS_SMS_WEBHOOK_URL;
    process.env.FLEETBUS_TOKEN_SECRET = 'prod_token_secret_test';
    process.env.FLEETBUS_TICKET_SECRET = 'prod_ticket_secret_test';
    process.env.FLEETBUS_WEBHOOK_SECRET = 'prod_webhook_secret_test';
    process.env.FLEETBUS_DB_KEY = Buffer.alloc(32, 7).toString('base64');

    const warnings = [];
    const origWarn = console.warn;
    console.warn = (...args) => warnings.push(args.join(' '));
    let prodInstance = null;
    try {
      prodInstance = createFleetBusServer({ authMode: 'enforce', dataDir: null });
      assert.ok(
        warnings.some(w => w.includes('FLEETBUS_SMS_WEBHOOK_URL')),
        `Expected startup warning mentioning FLEETBUS_SMS_WEBHOOK_URL, got: ${JSON.stringify(warnings)}`
      );

      const phone = '0904556677';
      const cacheKey = `op_saomai:${phone}`;
      services.authService.otpStore.delete(cacheKey);

      const res = await api('/api/v1/auth/passenger/otp/request', {
        method: 'POST',
        operatorCode: 'SAOMAI',
        body: { phone }
      });
      assert.strictEqual(res.status, 503, JSON.stringify(res.body));
      assert.strictEqual(res.body.code, 'OTP_PROVIDER_UNAVAILABLE');
      assert.strictEqual(
        res.body.message,
        'Chưa gửi được mã OTP. Vui lòng thử lại sau hoặc gọi tổng đài nhà xe.'
      );
      assert.strictEqual(services.authService.otpStore.has(cacheKey), false, 'no OTP may be stored when provider is unavailable');
    } finally {
      console.warn = origWarn;
      prodInstance?.services?.tenantDbs?.close();
      if (savedEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = savedEnv;
      if (savedSmsUrl === undefined) delete process.env.FLEETBUS_SMS_WEBHOOK_URL;
      else process.env.FLEETBUS_SMS_WEBHOOK_URL = savedSmsUrl;
      if (savedTokenSecret === undefined) delete process.env.FLEETBUS_TOKEN_SECRET;
      else process.env.FLEETBUS_TOKEN_SECRET = savedTokenSecret;
      if (savedTicketSecret === undefined) delete process.env.FLEETBUS_TICKET_SECRET;
      else process.env.FLEETBUS_TICKET_SECRET = savedTicketSecret;
      if (savedWebhookSecret === undefined) delete process.env.FLEETBUS_WEBHOOK_SECRET;
      else process.env.FLEETBUS_WEBHOOK_SECRET = savedWebhookSecret;
      if (savedDbKey === undefined) delete process.env.FLEETBUS_DB_KEY;
      else process.env.FLEETBUS_DB_KEY = savedDbKey;
    }
  });

  it('4. H-05: RateLimiter sliding window, bounded entry eviction, HTTP 429 with Retry-After, and FLEETBUS_TRUST_PROXY', async () => {
    // Unit test sliding window and bounded size
    const unitLimiter = new RateLimiter({ max: 2, windowMs: 1000, maxKeys: 3 });
    const t0 = 1_000_000;
    assert.strictEqual(unitLimiter.check('10.0.0.1', t0).ok, true);
    assert.strictEqual(unitLimiter.check('10.0.0.1', t0 + 200).ok, true);
    const blocked = unitLimiter.check('10.0.0.1', t0 + 300);
    assert.strictEqual(blocked.ok, false);
    assert.strictEqual(blocked.retryAfterSeconds, 1);

    // After first hit slides out of window (t0 + 1001), one slot is free again
    assert.strictEqual(unitLimiter.check('10.0.0.1', t0 + 1001).ok, true);

    // Bounded entries cap
    unitLimiter.check('ip_1', t0 + 2000);
    unitLimiter.check('ip_2', t0 + 2001);
    unitLimiter.check('ip_3', t0 + 2002);
    unitLimiter.check('ip_4', t0 + 2003);
    assert.ok(unitLimiter.hits.size <= 3, 'limiter must not grow beyond maxKeys');

    // Configure small limits on the server for HTTP test
    services.rateLimits.requestOtp = new RateLimiter({ max: 2, windowMs: 60000 });
    services.rateLimits.verifyOtp = new RateLimiter({ max: 2, windowMs: 60000 });
    services.rateLimits.staffLogin = new RateLimiter({ max: 2, windowMs: 60000 });
    services.rateLimits.driverLogin = new RateLimiter({ max: 2, windowMs: 60000 });

    const savedTrustProxy = process.env.FLEETBUS_TRUST_PROXY;
    try {
      // Without FLEETBUS_TRUST_PROXY=1, X-Forwarded-For is ignored (all requests share socket IP)
      delete process.env.FLEETBUS_TRUST_PROXY;
      assert.strictEqual(
        clientIp({ headers: { 'x-forwarded-for': '203.0.113.5' }, socket: { remoteAddress: '127.0.0.1' } }),
        '127.0.0.1'
      );

      const r1 = await api('/api/v1/auth/passenger/otp/request', {
        method: 'POST',
        headers: { 'X-Forwarded-For': '198.51.100.1' },
        body: { phone: '0905111001' }
      });
      const r2 = await api('/api/v1/auth/passenger/otp/request', {
        method: 'POST',
        headers: { 'X-Forwarded-For': '198.51.100.2' },
        body: { phone: '0905111002' }
      });
      const r3 = await api('/api/v1/auth/passenger/otp/request', {
        method: 'POST',
        headers: { 'X-Forwarded-For': '198.51.100.3' },
        body: { phone: '0905111003' }
      });
      assert.strictEqual(r1.status, 200);
      assert.strictEqual(r2.status, 200);
      assert.strictEqual(r3.status, 429);
      assert.strictEqual(r3.body.code, 'RATE_LIMITED');
      assert.strictEqual(r3.body.message, 'Quá nhiều yêu cầu, vui lòng thử lại sau ít phút');
      assert.ok(Number(r3.headers.get('retry-after')) > 0, 'Retry-After header must be set on 429');

      // With FLEETBUS_TRUST_PROXY=1, first IP of X-Forwarded-For is used for rate limiting and audit logs
      process.env.FLEETBUS_TRUST_PROXY = '1';
      services.rateLimits.staffLogin = new RateLimiter({ max: 2, windowMs: 60000 });
      services.rateLimits.driverLogin = new RateLimiter({ max: 1, windowMs: 60000 });
      services.rateLimits.verifyOtp = new RateLimiter({ max: 1, windowMs: 60000 });

      const proxyHeaderA = { 'X-Forwarded-For': '203.0.113.10, 10.0.0.1' };
      const proxyHeaderB = { 'X-Forwarded-For': '203.0.113.11, 10.0.0.1' };

      const s1 = await api('/api/v1/ops/auth/login', {
        method: 'POST',
        headers: proxyHeaderA,
        body: { username: 'cashier@busgo.vn', password: 'cash123' }
      });
      assert.strictEqual(s1.status, 200);
      const lastAudit = services.managerService.auditLog[services.managerService.auditLog.length - 1];
      assert.strictEqual(lastAudit.ip, '203.0.113.10', 'audit log must record the first X-Forwarded-For IP when FLEETBUS_TRUST_PROXY=1');

      const s2 = await api('/api/v1/ops/auth/login', {
        method: 'POST',
        headers: proxyHeaderA,
        body: { username: 'cashier@busgo.vn', password: 'cash123' }
      });
      assert.strictEqual(s2.status, 200);

      const s3 = await api('/api/v1/ops/auth/login', {
        method: 'POST',
        headers: proxyHeaderA,
        body: { username: 'cashier@busgo.vn', password: 'cash123' }
      });
      assert.strictEqual(s3.status, 429);
      assert.strictEqual(s3.body.code, 'RATE_LIMITED');
      assert.ok(Number(s3.headers.get('retry-after')) > 0);

      // Different client IP behind proxy is not blocked
      const sOtherIp = await api('/api/v1/ops/auth/login', {
        method: 'POST',
        headers: proxyHeaderB,
        body: { username: 'cashier@busgo.vn', password: 'cash123' }
      });
      assert.strictEqual(sOtherIp.status, 200);

      // Driver login and passenger verify-otp also enforce per-IP rate limits
      const d1 = await api('/api/v1/driver/auth/login', {
        method: 'POST',
        headers: proxyHeaderA,
        body: { staffIdOrPhone: 'TX8821', pin: '123456' }
      });
      assert.strictEqual(d1.status, 200);
      const d2 = await api('/api/v1/driver/auth/login', {
        method: 'POST',
        headers: proxyHeaderA,
        body: { staffIdOrPhone: 'TX8821', pin: '123456' }
      });
      assert.strictEqual(d2.status, 429);
      assert.strictEqual(d2.body.code, 'RATE_LIMITED');

      const v1 = await api('/api/v1/passenger/auth/verify-otp', {
        method: 'POST',
        headers: proxyHeaderA,
        body: { phone: '0905111001', otp: '000000' }
      });
      assert.strictEqual(v1.status, 400);
      const v2 = await api('/api/v1/passenger/auth/verify-otp', {
        method: 'POST',
        headers: proxyHeaderA,
        body: { phone: '0905111001', otp: '000000' }
      });
      assert.strictEqual(v2.status, 429);
      assert.strictEqual(v2.body.code, 'RATE_LIMITED');
    } finally {
      if (savedTrustProxy === undefined) delete process.env.FLEETBUS_TRUST_PROXY;
      else process.env.FLEETBUS_TRUST_PROXY = savedTrustProxy;
    }
  });
});
