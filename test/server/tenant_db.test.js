import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createFleetBusServer } from '../../source/server/apiServer.js';
import { MIGRATIONS, TenantDatabases } from '../../source/server/core/tenantDb.js';
import { createBanner, listOfficeBanners, seedPromoBanners } from '../../source/server/core/promoBanners.js';

const page = { title: 'Khai trương', background_color: '#0F766E', content_html: '<p>Khai trương tuyến mới</p>' };
const dirs = [];
const tempDir = () => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fleetbus-db-')); dirs.push(dir); return dir; };
test.after(() => dirs.forEach(dir => fs.rmSync(dir, { recursive: true, force: true })));

test('TC-DB-01: each company has its own database file; writes never cross', () => {
  const dir = tempDir();
  const dbs = new TenantDatabases({ dataDir: dir });
  createBanner(dbs.forOperator('op_saomai'), page);
  assert.strictEqual(listOfficeBanners(dbs.forOperator('op_saomai')).length, 1);
  assert.strictEqual(listOfficeBanners(dbs.forOperator('op_xuyenviet')).length, 0);
  assert.ok(fs.existsSync(path.join(dir, 'tenants', 'op_saomai.sqlite')));
  assert.ok(fs.existsSync(path.join(dir, 'tenants', 'op_xuyenviet.sqlite')));
  dbs.close();
});

test('TC-DB-02: data survives a restart; the seed runs only when a database is created', () => {
  const dir = tempDir();
  let dbs = new TenantDatabases({ dataDir: dir, seed: seedPromoBanners });
  const seeded = listOfficeBanners(dbs.forOperator('op_saomai')).length;
  createBanner(dbs.forOperator('op_saomai'), page);
  dbs.close();
  dbs = new TenantDatabases({ dataDir: dir, seed: seedPromoBanners });
  const db = dbs.forOperator('op_saomai');
  assert.strictEqual(listOfficeBanners(db).length, seeded + 1);
  const versions = db.prepare('SELECT version FROM schema_migrations').all().map(r => r.version);
  assert.deepStrictEqual(versions, MIGRATIONS.map(m => m.version));
  dbs.close();
});

test('TC-DB-03: a company may live in its own database; one file never serves two companies', () => {
  const dir = tempDir();
  const own = path.join(tempDir(), 'xuyenviet.sqlite');
  fs.writeFileSync(path.join(dir, 'tenants.json'), JSON.stringify({ op_xuyenviet: { path: own }, op_haiau: { path: own } }));
  const dbs = new TenantDatabases({ dataDir: dir });
  createBanner(dbs.forOperator('op_xuyenviet'), page);
  assert.ok(fs.existsSync(own), 'the registry moves the company to its own file');
  assert.throws(() => dbs.forOperator('op_haiau'), { code: 'TENANT_DB_MISMATCH' });
  assert.throws(() => dbs.forOperator(undefined), { code: 'TENANT_REQUIRED' });
  assert.throws(() => dbs.forOperator('../op_saomai'), { code: 'TENANT_REQUIRED' });
  dbs.close();
});

test('TC-DB-04: a server on a data folder keeps banners across restarts', async () => {
  const dir = tempDir();
  const start = async () => {
    const { server } = createFleetBusServer({ dataDir: dir });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    return { server, base: `http://127.0.0.1:${server.address().port}` };
  };
  const live = async (base) => (await (await fetch(`${base}/api/v1/passenger/promo-banners`, { headers: { 'x-operator-code': 'SAOMAI' } })).json()).data.banners.length;
  let { server, base } = await start();
  const before = await live(base);
  createBanner(new TenantDatabases({ dataDir: dir }).forOperator('op_saomai'), page);
  await new Promise(resolve => server.close(resolve));
  ({ server, base } = await start());
  assert.strictEqual(await live(base), before + 1);
  await new Promise(resolve => server.close(resolve));
});
