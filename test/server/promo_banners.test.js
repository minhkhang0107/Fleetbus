import test from 'node:test';
import assert from 'node:assert';
import http from 'http';
import { createFleetBusServer } from '../../source/server/apiServer.js';
import { findLiveBanner, listLiveBanners, seedPromoBanners } from '../../source/server/core/promoBanners.js';
import { TenantDatabases } from '../../source/server/core/tenantDb.js';

const OCT_12 = Date.parse('2026-10-12T09:00:00+07:00');

test('TC-PAX-004-04: slides are per company, switched on and inside their window', () => {
  const dbs = new TenantDatabases({ seed: seedPromoBanners });
  const saomai = dbs.forOperator('op_saomai');
  const xuyenviet = dbs.forOperator('op_xuyenviet');
  const ids = listLiveBanners(saomai, OCT_12).map(b => b.banner_id);
  assert.deepStrictEqual(ids, ['bn_saomai_early', 'bn_saomai_home_pickup']);
  assert.strictEqual(listLiveBanners(saomai, OCT_12)[0].content_html, undefined, 'the list carries no HTML');
  assert.deepStrictEqual(listLiveBanners(xuyenviet, OCT_12), [], 'a company with no slide gets an empty list');
  assert.strictEqual(findLiveBanner(saomai, 'bn_saomai_summer', OCT_12), null, 'an ended promotion is gone');
  assert.strictEqual(findLiveBanner(xuyenviet, 'bn_saomai_early', OCT_12), null, 'another company cannot open it');
  assert.match(findLiveBanner(saomai, 'bn_saomai_early', OCT_12).content_html, /BUSGO50K/);
  dbs.close();
});

test('TC-PAX-004-05: promo banner endpoints', async (t) => {
  const { server } = createFleetBusServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const get = (path, headers = {}) => new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path, headers }, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => resolve({ status: res.statusCode, json: JSON.parse(body) }));
    }).on('error', reject);
  });

  await t.test('list needs no login and follows the operator header', async () => {
    const saomai = await get('/api/v1/passenger/promo-banners', { 'x-operator-code': 'SAOMAI' });
    assert.strictEqual(saomai.status, 200);
    assert.ok(saomai.json.data.banners.length > 0);
    const xuyenviet = await get('/api/v1/passenger/promo-banners', { 'x-operator-code': 'XUYENVIET' });
    assert.deepStrictEqual(xuyenviet.json.data.banners, []);
  });

  await t.test('detail returns the HTML, 404 across companies', async () => {
    const ok = await get('/api/v1/passenger/promo-banners/bn_saomai_early', { 'x-operator-code': 'SAOMAI' });
    assert.strictEqual(ok.status, 200);
    assert.match(ok.json.data.content_html, /<h2>/);
    const other = await get('/api/v1/passenger/promo-banners/bn_saomai_early', { 'x-operator-code': 'XUYENVIET' });
    assert.strictEqual(other.status, 404);
    assert.strictEqual(other.json.code, 'BANNER_NOT_FOUND');
  });

  server.close();
});

test('TC-MGR-031: the director edits banners; the passenger list follows', async (t) => {
  const crypto = await import('node:crypto');
  const { generateTotp } = await import('../../source/server/core/totp.js');
  const { DEV_TOTP_SECRET } = await import('../../source/server/config.js');
  const { server } = createFleetBusServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, { method = 'GET', body, token, headers = {} } = {}) => {
    const h = { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID(), ...headers };
    if (token) h.Authorization = `Bearer ${token}`;
    const res = await fetch(`${base}${path}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, json: await res.json() };
  };
  const login = async (username, password, totp) => (await call('/api/v1/ops/auth/login', { method: 'POST', body: { username, password, totp } })).json.data?.token;
  const director = await login('admin@busgo.vn', 'admin123', generateTotp(DEV_TOTP_SECRET, Date.now()));
  const dispatcher = await login('dispatcher@busgo.vn', 'disp123');
  const live = async () => (await call('/api/v1/passenger/promo-banners', { headers: { 'x-operator-code': 'SAOMAI' } })).json.data.banners.map(b => b.banner_id);
  const page = { title: 'Tết sum vầy', subtitle: 'Giảm 10%', background_color: '#B91C1C', sort_order: 0, content_html: '<p>Đặt vé Tết</p>' };
  let id;

  await t.test('office list has every banner with its status', async () => {
    const r = await call('/api/v1/ops/promo-banners', { token: director });
    assert.strictEqual(r.status, 200);
    const summer = r.json.data.banners.find(b => b.banner_id === 'bn_saomai_summer');
    assert.strictEqual(summer.status, 'ENDED');
    assert.ok(summer.content_html);
  });

  await t.test('only the director (or the platform) may edit', async () => {
    const r = await call('/api/v1/ops/promo-banners', { token: dispatcher });
    assert.strictEqual(r.status, 403);
  });

  await t.test('create shows on the passenger slider first; scripts are refused', async () => {
    const bad = await call('/api/v1/ops/promo-banners', { method: 'POST', token: director, body: { ...page, content_html: '<img src=x onerror=alert(1)>' } });
    assert.strictEqual(bad.status, 400);
    assert.strictEqual(bad.json.code, 'VALIDATION_ERROR');
    const r = await call('/api/v1/ops/promo-banners', { method: 'POST', token: director, body: page });
    assert.strictEqual(r.status, 201);
    id = r.json.data.banner_id;
    assert.strictEqual(r.json.data.status, 'LIVE');
    assert.strictEqual((await live())[0], id);
  });

  await t.test('edit, switch off, delete; each step reaches the app and the audit log', async () => {
    const edit = await call(`/api/v1/ops/promo-banners/${id}`, { method: 'PATCH', token: director, body: { title: 'Tết 2027' } });
    assert.strictEqual(edit.json.data.title, 'Tết 2027');
    assert.strictEqual(edit.json.data.content_html, '<p>Đặt vé Tết</p>', 'fields left out are kept');
    await call(`/api/v1/ops/promo-banners/${id}/deactivate`, { method: 'POST', token: director });
    assert.ok(!(await live()).includes(id));
    const gone = await call(`/api/v1/passenger/promo-banners/${id}`, { headers: { 'x-operator-code': 'SAOMAI' } });
    assert.strictEqual(gone.status, 404);
    const del = await call(`/api/v1/ops/promo-banners/${id}`, { method: 'DELETE', token: director });
    assert.strictEqual(del.status, 200);
    const again = await call(`/api/v1/ops/promo-banners/${id}`, { method: 'DELETE', token: director });
    assert.strictEqual(again.status, 404);
    const audit = (await call('/api/v1/ops/audit-logs', { token: director })).json.data.audit_logs.filter(a => a.resource === id).map(a => a.action);
    for (const action of ['PROMO_BANNER_CREATE', 'PROMO_BANNER_UPDATE', 'PROMO_BANNER_DEACTIVATE', 'PROMO_BANNER_DELETE']) assert.ok(audit.includes(action), action);
  });

  await t.test("a company cannot touch another company's banner", async () => {
    const root = await login('root@busgo.vn', 'root123', generateTotp(DEV_TOTP_SECRET, Date.now()));
    const r = await call('/api/v1/ops/promo-banners/bn_saomai_early', { method: 'PATCH', token: root, headers: { 'x-operator-code': 'XUYENVIET' }, body: { title: 'x' } });
    assert.strictEqual(r.status, 404);
    const list = await call('/api/v1/ops/promo-banners', { token: root, headers: { 'x-operator-code': 'XUYENVIET' } });
    assert.deepStrictEqual(list.json.data.banners, []);
  });

  server.close();
});
