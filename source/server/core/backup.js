/**
 * Scheduled copies of every database (H-08). Each run writes a consistent copy of the platform database and of
 * each company's database with SQLite's VACUUM INTO, into `<backupDir>/<YYYYMMDD-HHMMSS>/`, then keeps only the
 * newest `keep` runs. Records stay sealed with the databases' keys, so a backup is as safe as the data folder:
 * the master key (FLEETBUS_DB_KEY) is never copied and must be kept apart to restore.
 *
 * Restore (server stopped): copy the files of one backup folder over the data folder, see tools/restore_backup.js.
 */
import fs from 'fs';
import path from 'path';
import { PLATFORM_SCOPE } from './tenantDb.js';

const STAMP_RE = /^\d{8}-\d{6}$/;

function stamp(now) {
  const d = new Date(now);
  const two = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${two(d.getUTCMonth() + 1)}${two(d.getUTCDate())}-${two(d.getUTCHours())}${two(d.getUTCMinutes())}${two(d.getUTCSeconds())}`;
}

/** Copies every database into a new folder of `backupDir`; returns that folder and the files written. */
export function backupNow(tenantDbs, backupDir, now = Date.now()) {
  if (!tenantDbs.dataDir) throw new Error('Không có thư mục dữ liệu để sao lưu');
  const folder = path.join(backupDir, stamp(now));
  const partial = `${folder}.partial`;
  fs.rmSync(partial, { recursive: true, force: true });
  fs.mkdirSync(path.join(partial, 'tenants'), { recursive: true, mode: 0o700 });
  const files = [];
  const copy = (db, target) => {
    db.exec(`VACUUM INTO '${target.replaceAll("'", "''")}'`);
    fs.chmodSync(target, 0o600);
    files.push(path.relative(partial, target));
  };
  copy(tenantDbs.forPlatform(), path.join(partial, 'platform.sqlite'));
  for (const scope of tenantDbs.existingScopes()) {
    if (scope === PLATFORM_SCOPE) continue;
    copy(tenantDbs.forOperator(scope), path.join(partial, 'tenants', `${scope}.sqlite`));
  }
  const registry = path.join(tenantDbs.dataDir, 'tenants.json');
  if (fs.existsSync(registry)) fs.copyFileSync(registry, path.join(partial, 'tenants.json'));
  // A folder only gets its final name once complete, so a crash never leaves a half backup that looks whole.
  fs.renameSync(partial, folder);
  return { folder, files };
}

/** Deletes all but the newest `keep` backup folders. */
export function pruneBackups(backupDir, keep) {
  if (!fs.existsSync(backupDir)) return [];
  const runs = fs.readdirSync(backupDir).filter(n => STAMP_RE.test(n)).sort();
  const removed = runs.slice(0, Math.max(0, runs.length - keep));
  for (const name of removed) fs.rmSync(path.join(backupDir, name), { recursive: true, force: true });
  return removed;
}

/**
 * Runs a backup every `intervalMs` (and once at start). Failures are logged and retried at the next run;
 * returns a function that stops the timer.
 */
export function startBackups(tenantDbs, { backupDir, intervalMs, keep, log = console }) {
  const run = () => {
    try {
      const { folder } = backupNow(tenantDbs, backupDir);
      pruneBackups(backupDir, keep);
      log.info?.(`[backup] Đã sao lưu dữ liệu vào ${folder}`);
    } catch (err) {
      log.error?.(`[backup] Sao lưu thất bại: ${err.message}`);
    }
  };
  run();
  const timer = setInterval(run, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}

/** Backup settings from the environment: on by default when there is a data folder. */
export function backupConfig(dataDir, env = process.env) {
  if (!dataDir || env.FLEETBUS_BACKUP === 'off') return null;
  return {
    backupDir: path.resolve(env.FLEETBUS_BACKUP_DIR || path.join(dataDir, 'backups')),
    intervalMs: Number(env.FLEETBUS_BACKUP_INTERVAL_MINUTES || 360) * 60 * 1000,
    keep: Number(env.FLEETBUS_BACKUP_KEEP || 28)
  };
}

/**
 * Puts the databases of a backup folder back in place (server stopped). The files being replaced are moved to
 * `<dataDir>/pre-restore-<stamp>/` first, so a restore can itself be undone. A company listed in tenants.json
 * goes back to its own path.
 */
export function restoreBackup(folder, tenantDbs, now = Date.now()) {
  if (!fs.existsSync(path.join(folder, 'platform.sqlite'))) throw new Error(`${folder} không phải thư mục sao lưu`);
  const lock = path.join(tenantDbs.dataDir, '.lock');
  if (fs.existsSync(lock)) throw new Error('Server đang chạy trên thư mục dữ liệu này, hãy dừng server trước khi khôi phục');
  const aside = path.join(tenantDbs.dataDir, `pre-restore-${stamp(now)}`);
  const restored = [];
  const put = (source, target) => {
    for (const f of [target, `${target}-wal`, `${target}-shm`]) {
      if (!fs.existsSync(f)) continue;
      const moved = path.join(aside, path.relative(tenantDbs.dataDir, f).replaceAll('..', '_'));
      fs.mkdirSync(path.dirname(moved), { recursive: true, mode: 0o700 });
      fs.renameSync(f, moved);
    }
    fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
    fs.copyFileSync(source, target);
    fs.chmodSync(target, 0o600);
    restored.push(target);
  };
  put(path.join(folder, 'platform.sqlite'), tenantDbs.locate(PLATFORM_SCOPE));
  const tenants = path.join(folder, 'tenants');
  for (const name of fs.existsSync(tenants) ? fs.readdirSync(tenants) : []) {
    if (name.endsWith('.sqlite')) put(path.join(tenants, name), tenantDbs.locate(name.slice(0, -7)));
  }
  return { restored, aside };
}
