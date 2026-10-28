import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import crypto from 'crypto';
import { createFleetBusServer } from '../../source/server/apiServer.js';
import { OPERATORS } from '../../source/server/core/operators.js';
import { signToken, TOKEN_PREFIXES } from '../../source/server/core/tokens.js';

describe('Tenant Home Feed, Checkout Payee Check, Onboarding & Webhooks', () => {
  let server;
  let baseUrl;
  let rootUrl;
  let passengerToken;

  before(async () => {
    const instance = createFleetBusServer({ authMode: 'enforce' });
    server = instance.server;
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    rootUrl = `http://127.0.0.1:${port}`;
    baseUrl = `http://127.0.0.1:${port}/api/v1`;

    passengerToken = signToken(
      { sub: 'usr_tenant_test', phone: '0912345678', kind: 'passenger', operator_id: 'op_saomai' },
      { prefix: TOKEN_PREFIXES.passenger, ttlSeconds: 3600 }
    );
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('home-feed for SAOMAI vs XUYENVIET returns different corridors and never another company\'s routes', async () => {
    // 1. Home feed for SAOMAI
    const saomaiRes = await fetch(`${baseUrl}/passenger/home-feed`, {
      headers: { 'X-Operator-Code': 'SAOMAI' }
    });
    assert.strictEqual(saomaiRes.status, 200);
    const saomaiJson = await saomaiRes.json();
    assert.strictEqual(saomaiJson.status, 'success');
    assert.strictEqual(saomaiJson.data.active_ticket, null);

    const saomaiCorridors = saomaiJson.data.popular_corridors;
    assert.ok(saomaiCorridors.length > 0 && saomaiCorridors.length <= 3);
    for (const c of saomaiCorridors) {
      assert.ok(c.route_id, 'corridor must have route_id');
      assert.ok(c.route_name, 'corridor must have route_name');
      assert.ok(typeof c.fare_from_vnd === 'number', 'corridor must have fare_from_vnd');
      assert.ok(c.route_id.startsWith('rt_hn_'), `Route ${c.route_id} must belong to SAOMAI`);
      assert.notStrictEqual(c.route_id, 'rt_xv_hn_th', 'SAOMAI corridors must not contain XUYENVIET routes');
    }

    // SAOMAI promotions from tenant DB
    assert.ok(Array.isArray(saomaiJson.data.promotions));
    const busgoPromo = saomaiJson.data.promotions.find((p) => p.code === 'BUSGO50K');
    if (busgoPromo) {
      assert.strictEqual(busgoPromo.discount, '50.000 đ');
      assert.ok(busgoPromo.description);
    }

    // 2. Home feed for XUYENVIET
    const xvRes = await fetch(`${baseUrl}/passenger/home-feed`, {
      headers: { 'X-Operator-Code': 'XUYENVIET' }
    });
    assert.strictEqual(xvRes.status, 200);
    const xvJson = await xvRes.json();
    assert.strictEqual(xvJson.status, 'success');
    assert.strictEqual(xvJson.data.active_ticket, null);

    const xvCorridors = xvJson.data.popular_corridors;
    assert.ok(xvCorridors.length > 0 && xvCorridors.length <= 3);
    for (const c of xvCorridors) {
      assert.strictEqual(c.route_id, 'rt_xv_hn_th', `Route ${c.route_id} must belong to XUYENVIET`);
    }

    // Corridors must be different
    assert.notDeepStrictEqual(saomaiCorridors, xvCorridors);
  });

  it('checkout with an operator whose bank was cleared in memory returns 409 PAYEE_MISSING (restore after)', async () => {
    const op = OPERATORS.find((o) => o.operator_id === 'op_saomai');
    assert.ok(op);
    const savedBank = op.bank;

    // Hold a seat on SAOMAI trip
    const holdRes = await fetch(`${baseUrl}/trips/trp_hn_th_01/seats/hold`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${passengerToken}`,
        'Idempotency-Key': crypto.randomUUID(),
        'X-Operator-Code': 'SAOMAI'
      },
      body: JSON.stringify({ seatCodes: ['A11'] })
    });
    assert.strictEqual(holdRes.status, 200);
    const holdJson = await holdRes.json();
    const holdId = holdJson.data.hold_id;

    try {
      // Clear bank in memory
      op.bank = null;

      // Attempt checkout with VietQR payment
      const checkoutRes = await fetch(`${baseUrl}/passenger/checkout/create-order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${passengerToken}`,
          'Idempotency-Key': crypto.randomUUID(),
          'X-Operator-Code': 'SAOMAI'
        },
        body: JSON.stringify({
          holdId,
          tripId: 'trp_hn_th_01',
          seatCodes: ['A11'],
          paymentMethod: 'VIETQR_NAPAS247',
          payer: { full_name: 'Nguyễn Văn Test', phone: '0912345678' },
          passengers: [{ full_name: 'Nguyễn Văn Test', phone: '0912345678' }]
        })
      });

      assert.strictEqual(checkoutRes.status, 409);
      const checkoutJson = await checkoutRes.json();
      assert.strictEqual(checkoutJson.status, 'error');
      assert.strictEqual(checkoutJson.code, 'PAYEE_MISSING');
      assert.strictEqual(checkoutJson.message, 'Nhà xe chưa có tài khoản nhận tiền, vui lòng liên hệ tổng đài nhà xe');
    } finally {
      // Restore bank in memory
      op.bank = savedBank;
    }
  });

  it('onboarding page /o/SAOMAI contains the support email', async () => {
    const res = await fetch(`${rootUrl}/o/SAOMAI`);
    assert.strictEqual(res.status, 200);
    const html = await res.text();
    const op = OPERATORS.find((o) => o.operator_id === 'op_saomai');
    assert.ok(op?.support_email);
    assert.ok(html.includes(op.support_email), `Onboarding page must include support email ${op.support_email}`);
    if (op.address) {
      assert.ok(html.includes(op.address), `Onboarding page must include address ${op.address}`);
    }
  });

  it('VietQR webhook without company code: rejected with 400 OPERATOR_REQUIRED in production, allowed outside production', async () => {
    const savedEnv = process.env.NODE_ENV;

    try {
      // Exercise in production mode
      process.env.NODE_ENV = 'production';

      const prodRes = await fetch(`${baseUrl}/webhooks/vietqr/ipn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transferMemo: 'SAOMAI BG12345', amountVnd: 220000 })
      });

      assert.strictEqual(prodRes.status, 400);
      const prodJson = await prodRes.json();
      assert.strictEqual(prodJson.status, 'error');
      assert.strictEqual(prodJson.code, 'OPERATOR_REQUIRED');
      assert.strictEqual(prodJson.message, 'Webhook cần mã nhà xe: /api/v1/webhooks/vietqr/{mã nhà xe}/ipn');

      // With operator code in production, it is not rejected as OPERATOR_REQUIRED
      const prodWithCodeRes = await fetch(`${baseUrl}/webhooks/vietqr/SAOMAI/ipn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transferMemo: 'SAOMAI NO_MATCH', amountVnd: 220000 })
      });
      const prodWithCodeJson = await prodWithCodeRes.json();
      assert.notStrictEqual(prodWithCodeJson.code, 'OPERATOR_REQUIRED');
    } finally {
      if (savedEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = savedEnv;
      }
    }

    // Outside production, calling /api/v1/webhooks/vietqr/ipn without operator code is allowed
    const devRes = await fetch(`${baseUrl}/webhooks/vietqr/ipn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transferMemo: 'SAOMAI NO_MATCH', amountVnd: 220000 })
    });
    const devJson = await devRes.json();
    assert.notStrictEqual(devJson.code, 'OPERATOR_REQUIRED');
  });
});
