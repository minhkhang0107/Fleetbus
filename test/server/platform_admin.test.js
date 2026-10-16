import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { createFleetBusServer } from '../../source/server/apiServer.js';
import { generateTotp } from '../../source/server/core/totp.js';
import { DEV_TOTP_SECRET } from '../../source/server/config.js';

describe('Platform admin: bus companies, activation, onboarding page', () => {
  let server;
  let services;
  let baseUrl;
  let rootToken;
  let xvToken;

  const request = async (path, { method = 'GET', body, token, headers = {} } = {}) => {
    const h = { 'Content-Type': 'application/json', ...headers };
    if (token) h.Authorization = `Bearer ${token}`;
    if (method === 'POST') h['Idempotency-Key'] = crypto.randomUUID();
    const res = await fetch(`${baseUrl}${path}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* HTML page */ }
    return { status: res.status, body: json, text };
  };
  const totp = () => generateTotp(DEV_TOTP_SECRET, Date.now());
  const staffLogin = (username, password, code) => request('/api/v1/ops/auth/login', { method: 'POST', body: { username, password, totp: code } });
  const HAIAU = { code: 'haiau', name: 'Nhà xe Hải Âu', hotline: '1900 1122', director_name: 'Nguyễn Hải Âu', director_email: 'haiau@haiau.vn', bank: { bin: '970422', bank_name: 'MB Bank', account_number: '0123456789', account_name: 'NHA XE HAI AU' } };

  before(async () => {
    ({ server, services } = createFleetBusServer());
    await new Promise(resolve => server.listen(0, resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    xvToken = (await staffLogin('dispatcher@xuyenviet.vn', 'xv123')).body.data.token;
  });

  after(() => new Promise(resolve => server.close(resolve)));

  it('the platform admin needs a 2-step code and belongs to no company', async () => {
    const noCode = await staffLogin('root@busgo.vn', 'root123');
    assert.strictEqual(noCode.status, 401);
    assert.strictEqual(noCode.body.code, 'TOTP_REQUIRED');
    const ok = await staffLogin('root@busgo.vn', 'root123', totp());
    assert.strictEqual(ok.status, 200, JSON.stringify(ok.body));
    assert.strictEqual(ok.body.data.user.role, 'PLATFORM_ADMIN');
    assert.strictEqual(ok.body.data.operator, null);
    rootToken = ok.body.data.token;
  });

  it('creates a company that passengers can open by its code', async () => {
    const created = await request('/api/v1/platform/operators', { method: 'POST', token: rootToken, body: HAIAU });
    assert.strictEqual(created.status, 201, JSON.stringify(created.body));
    assert.strictEqual(created.body.data.operator_id, 'op_haiau');
    assert.strictEqual(created.body.data.code, 'HAIAU');
    assert.strictEqual(created.body.data.memo_prefix, 'HAIAU');

    const list = await request('/api/v1/platform/operators', { token: rootToken });
    assert.ok(list.body.data.operators.some(o => o.code === 'HAIAU' && o.active === true && o.bank.account_number === '0123456789'));

    const config = await request('/api/v1/app/config?operator=HAIAU');
    assert.strictEqual(config.status, 200);
    assert.strictEqual(JSON.stringify(config.body.data).includes('Nhà xe Hải Âu'), true);
    assert.strictEqual(JSON.stringify(config.body.data).includes('"onboarding_url":"/o/HAIAU"'), true);

    const audit = services.managerService.auditLog.find(a => a.action === 'OPERATOR_CREATE' && a.resource === 'HAIAU');
    assert.ok(audit, 'the creation is audited');
    assert.strictEqual(audit.operator_id, 'op_haiau');
  });

  it('refuses a taken or malformed code and missing bank details', async () => {
    const dup = await request('/api/v1/platform/operators', { method: 'POST', token: rootToken, body: { ...HAIAU, code: 'XUYENVIET' } });
    assert.strictEqual(dup.status, 409);
    assert.strictEqual(dup.body.code, 'OPERATOR_CODE_TAKEN');
    const bad = await request('/api/v1/platform/operators', { method: 'POST', token: rootToken, body: { ...HAIAU, code: 'HẢI ÂU' } });
    assert.strictEqual(bad.status, 400);
    const noBank = await request('/api/v1/platform/operators', { method: 'POST', token: rootToken, body: { ...HAIAU, code: 'NOBANK', bank: { bin: '970422' } } });
    assert.strictEqual(noBank.status, 400);
  });

  it('edits a company but never its code', async () => {
    const edited = await request('/api/v1/platform/operators/op_haiau', { method: 'PATCH', token: rootToken, body: { hotline: '1900 3344' } });
    assert.strictEqual(edited.status, 200, JSON.stringify(edited.body));
    assert.strictEqual(edited.body.data.hotline, '1900 3344');
    const recode = await request('/api/v1/platform/operators/op_haiau', { method: 'PATCH', token: rootToken, body: { code: 'HAIAU2' } });
    assert.strictEqual(recode.status, 400);
  });

  it('keeps company staff out of the platform endpoints', async () => {
    const res = await request('/api/v1/platform/operators', { token: xvToken });
    assert.strictEqual(res.status, 403);
  });

  it('a deactivated company is closed to passengers, staff and drivers until reactivated', async () => {
    const off = await request('/api/v1/platform/operators/op_xuyenviet/deactivate', { method: 'POST', token: rootToken });
    assert.strictEqual(off.status, 200);
    assert.strictEqual(off.body.data.active, false);

    const config = await request('/api/v1/app/config?operator=XUYENVIET');
    assert.strictEqual(config.status, 403);
    assert.strictEqual(config.body.code, 'OPERATOR_INACTIVE');
    const login = await staffLogin('dispatcher@xuyenviet.vn', 'xv123');
    assert.strictEqual(login.status, 403);
    assert.strictEqual(login.body.code, 'OPERATOR_INACTIVE');
    const issued = await request('/api/v1/ops/dispatch/board', { token: xvToken });
    assert.strictEqual(issued.status, 403, 'a token issued before deactivation stops working');
    const driver = await request('/api/v1/driver/auth/login', { method: 'POST', headers: { 'X-Operator-Code': 'XUYENVIET' }, body: { staff_id: 'TX7701', pin: '246810' } });
    assert.strictEqual(driver.status, 403);
    const page = await request('/o/XUYENVIET');
    assert.strictEqual(page.status, 404);

    const on = await request('/api/v1/platform/operators/op_xuyenviet/activate', { method: 'POST', token: rootToken });
    assert.strictEqual(on.body.data.active, true);
    assert.strictEqual((await request('/api/v1/app/config?operator=XUYENVIET')).status, 200);
    assert.strictEqual((await request('/api/v1/ops/dispatch/board', { token: xvToken })).status, 200);
  });

  it('the platform admin acts in one named company, and every such request is audited', async () => {
    const noCompany = await request('/api/v1/ops/dispatch/board', { token: rootToken });
    assert.strictEqual(noCompany.status, 400);
    assert.strictEqual(noCompany.body.code, 'OPERATOR_REQUIRED');

    const board = await request('/api/v1/ops/dispatch/board', { token: rootToken, headers: { 'X-Operator-Code': 'XUYENVIET' } });
    assert.strictEqual(board.status, 200, JSON.stringify(board.body));
    assert.ok(board.body.data.trips.length > 0);
    assert.ok(board.body.data.trips.every(t => t.operator_id === 'op_xuyenviet'));
    const audit = services.managerService.auditLog.find(a => a.role === 'PLATFORM_ADMIN' && a.resource === '/api/v1/ops/dispatch/board');
    assert.ok(audit, 'platform access is audited');
    assert.strictEqual(audit.operator_id, 'op_xuyenviet');
  });

  it('serves the onboarding page with the company code and a QR, escaping its values', async () => {
    const page = await request('/o/xuyenviet');
    assert.strictEqual(page.status, 200);
    assert.ok(page.text.includes('Xuyên Việt Lines'));
    assert.ok(page.text.includes('XUYENVIET'));
    assert.ok(page.text.includes('qrcode-generator@1.4.4'));
    assert.strictEqual((await request('/o/NOPE')).status, 404);

    await request('/api/v1/platform/operators', { method: 'POST', token: rootToken, body: { ...HAIAU, code: 'XSS1', name: '<script>alert(1)</script>', director_email: 'xss1@haiau.vn' } });
    const xss = await request('/o/XSS1');
    assert.strictEqual(xss.text.includes('<script>alert(1)</script>'), false);
    assert.ok(xss.text.includes('&lt;script&gt;'));
  });
});
