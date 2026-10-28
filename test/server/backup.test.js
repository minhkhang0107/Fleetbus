import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TenantDatabases } from '../../source/server/core/tenantDb.js';
import { backupConfig, backupNow, pruneBackups, restoreBackup } from '../../source/server/core/backup.js';
import { createBanner, listOfficeBanners } from '../../source/server/core/promoBanners.js';

const page = { title: 'Khai trương', background_color: '#0F766E', content_html: '<p>Tuyến mới</p>' };
const dirs = [];
const tempDir = () => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fleetbus-bak-')); dirs.push(dir); return dir; };
test.after(() => dirs.forEach(dir => fs.rmSync(dir, { recursive: true, force: true })));

test('TC-BAK-01: a backup copies the platform and every company database, and restores them', () => {
  const dir = tempDir();
  const backups = tempDir();
  let dbs = new TenantDatabases({ dataDir: dir });
  createBanner(dbs.forOperator('op_saomai'), page);
  dbs.forOperator('op_xuyenviet');
  const { folder, files } = backupNow(dbs, backups, Date.UTC(2026, 9, 28, 1, 2, 3));
  assert.strictEqual(path.basename(folder), '20261028-010203');
  assert.deepStrictEqual(files.sort(), ['platform.sqlite', path.join('tenants', 'op_saomai.sqlite'), path.join('tenants', 'op_xuyenviet.sqlite')].sort());

  // Data changes after the backup, then the backup is restored with the databases closed.
  createBanner(dbs.forOperator('op_saomai'), { ...page, title: 'Sau sao lưu' });
  assert.strictEqual(listOfficeBanners(dbs.forOperator('op_saomai')).length, 2);
  dbs.close();
  const { restored, aside } = restoreBackup(folder, new TenantDatabases({ dataDir: dir }));
  assert.strictEqual(restored.length, 3);
  assert.ok(fs.existsSync(path.join(aside, 'tenants', 'op_saomai.sqlite')), 'the replaced file is kept aside');
  dbs = new TenantDatabases({ dataDir: dir });
  assert.strictEqual(listOfficeBanners(dbs.forOperator('op_saomai')).length, 1);
  dbs.close();
});

test('TC-BAK-02: only the newest backups are kept; a running server blocks a restore', () => {
  const dir = tempDir();
  const backups = tempDir();
  const dbs = new TenantDatabases({ dataDir: dir });
  dbs.forOperator('op_saomai');
  for (let i = 0; i < 4; i++) backupNow(dbs, backups, Date.UTC(2026, 9, 28, i));
  assert.deepStrictEqual(pruneBackups(backups, 2), ['20261028-000000', '20261028-010000']);
  assert.deepStrictEqual(fs.readdirSync(backups).sort(), ['20261028-020000', '20261028-030000']);
  dbs.lock();
  assert.throws(() => restoreBackup(path.join(backups, '20261028-030000'), dbs), /dừng server/);
  dbs.close();
});

test('TC-BAK-03: backups are on by default with a data folder and follow the environment', () => {
  assert.strictEqual(backupConfig(null), null);
  assert.strictEqual(backupConfig('/srv/data', { FLEETBUS_BACKUP: 'off' }), null);
  assert.deepStrictEqual(backupConfig('/srv/data', {}), { backupDir: '/srv/data/backups', intervalMs: 360 * 60000, keep: 28 });
  assert.deepStrictEqual(
    backupConfig('/srv/data', { FLEETBUS_BACKUP_DIR: '/mnt/bak', FLEETBUS_BACKUP_INTERVAL_MINUTES: '60', FLEETBUS_BACKUP_KEEP: '48' }),
    { backupDir: '/mnt/bak', intervalMs: 3600000, keep: 48 }
  );
});
