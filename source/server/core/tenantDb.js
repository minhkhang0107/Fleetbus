/**
 * One database per bus company (D126). Code reaches a database only through `forOperator(operatorId)`,
 * so no query can run without saying whose data it is, and two companies never share tables.
 *
 * - Where: `<dataDir>/tenants/<operator_id>.sqlite` by default. A company that wants its own database
 *   (another disk, another machine) is listed in `<dataDir>/tenants.json`: { "<operator_id>": { "path": "..." } }.
 * - Without a data directory (tests, `createFleetBusServer()` imported as a library) every company gets an
 *   in-memory database: same schema and rules, nothing written to disk.
 * - Guard: a database records the company it belongs to on first open; opening it for another company fails
 *   (TENANT_DB_MISMATCH) instead of mixing data, e.g. when two entries of tenants.json point at one file.
 * - Schema: numbered migrations, applied in order to each database when it is opened.
 * - Platform data (the company registry, platform staff) lives apart in `<dataDir>/platform.sqlite` (D127).
 * - Records are sealed with the database's own key (core/dbCrypto.js); a stored sample checks the key on
 *   open, so a wrong key stops the server instead of failing later. Files are 0600, folders 0700.
 */
import fs from 'fs';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';
import { DbKeyError, open as openRecord, scopeKeys, seal } from './dbCrypto.js';

export class TenantDbError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/** Schema of a company's database; append only, never edit a released step. */
export const MIGRATIONS = [
  {
    version: 1,
    name: 'promo_banners',
    sql: `CREATE TABLE promo_banners (
      banner_id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      subtitle TEXT NOT NULL DEFAULT '',
      background_color TEXT NOT NULL,
      image_url TEXT,
      sort_order INTEGER NOT NULL DEFAULT 1,
      starts_at TEXT,
      ends_at TEXT,
      content_html TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX promo_banners_order ON promo_banners (sort_order);`
  },
  {
    version: 2,
    name: 'records',
    // Every other kind of data: one sealed JSON document per record, id stored as HMAC (D127).
    sql: `CREATE TABLE records (
      collection TEXT NOT NULL,
      id_hash TEXT NOT NULL,
      data BLOB NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (collection, id_hash)
    );`
  }
];

/** Scope name of the platform database; operator ids never start with an underscore. */
export const PLATFORM_SCOPE = '_platform';

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
}

function checkKey(db, keys, scope) {
  const sample = db.prepare("SELECT value FROM tenant_meta WHERE key = 'key_check'").get()?.value;
  if (!sample) {
    db.prepare("INSERT INTO tenant_meta (key, value) VALUES ('key_check', ?)").run(seal(keys, 'key_check', scope, { scope }).toString('base64'));
    return;
  }
  try {
    openRecord(keys, 'key_check', scope, Buffer.from(sample, 'base64'));
  } catch {
    throw new DbKeyError('DB_KEY_MISMATCH', `Khóa mã hóa không khớp với cơ sở dữ liệu của ${scope}`);
  }
}

function restrict(file) {
  for (const f of [file, `${file}-wal`, `${file}-shm`]) {
    if (fs.existsSync(f)) fs.chmodSync(f, 0o600);
  }
}

function migrate(db, operatorId, migrations) {
  db.exec(`CREATE TABLE IF NOT EXISTS tenant_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL);`);
  const owner = db.prepare("SELECT value FROM tenant_meta WHERE key = 'operator_id'").get()?.value;
  if (owner && owner !== operatorId) {
    throw new TenantDbError('TENANT_DB_MISMATCH', `Cơ sở dữ liệu này thuộc nhà xe ${owner}, không mở cho ${operatorId}`);
  }
  if (!owner) db.prepare("INSERT INTO tenant_meta (key, value) VALUES ('operator_id', ?)").run(operatorId);
  const done = new Set(db.prepare('SELECT version FROM schema_migrations').all().map(r => r.version));
  for (const m of migrations) {
    if (done.has(m.version)) continue;
    db.exec('BEGIN');
    try {
      db.exec(m.sql);
      db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)').run(m.version, m.name, new Date().toISOString());
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
  return !owner;
}

export class TenantDatabases {
  /**
   * @param {object} options
   * @param {string|null} options.dataDir  folder of the company databases; null keeps them in memory
   * @param {(db: DatabaseSync, operatorId: string) => void} [options.seed]  runs once, when a database is created
   */
  constructor({ dataDir = null, seed = null, migrations = MIGRATIONS, masterKey = null } = {}) {
    this.dataDir = dataDir;
    this.masterKey = masterKey;
    this.keys = new Map();
    this.seed = seed;
    this.migrations = migrations;
    this.open = new Map();
    this.registry = this.readRegistry();
  }

  readRegistry() {
    if (!this.dataDir) return {};
    const file = path.join(this.dataDir, 'tenants.json');
    if (!fs.existsSync(file)) return {};
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  }

  /** Where a company's database lives (':memory:' without a data directory). */
  locate(operatorId) {
    if (!this.dataDir) return ':memory:';
    if (operatorId === PLATFORM_SCOPE) return path.join(this.dataDir, 'platform.sqlite');
    const own = this.registry[operatorId]?.path;
    if (own) return path.isAbsolute(own) ? own : path.join(this.dataDir, own);
    return path.join(this.dataDir, 'tenants', `${operatorId}.sqlite`);
  }

  /** The database of one company, opened and migrated on first use. */
  forOperator(operatorId) {
    if (typeof operatorId !== 'string' || !ID_RE.test(operatorId) || operatorId === PLATFORM_SCOPE) {
      throw new TenantDbError('TENANT_REQUIRED', 'Thiếu hoặc sai mã nhà xe khi truy cập dữ liệu');
    }
    return this.openScope(operatorId);
  }

  /** The platform database: company registry and platform staff. */
  forPlatform() {
    return this.openScope(PLATFORM_SCOPE);
  }

  /** Encryption keys of one database (operator id or PLATFORM_SCOPE). */
  keysFor(scope) {
    if (!this.masterKey) throw new DbKeyError('DB_KEY_REQUIRED', 'Chưa có khóa mã hóa dữ liệu');
    if (!this.keys.has(scope)) this.keys.set(scope, scopeKeys(this.masterKey, scope));
    return this.keys.get(scope);
  }

  /** Scopes that already have a database on disk (all open ones in memory). */
  existingScopes() {
    const scopes = new Set(this.open.keys());
    if (this.dataDir) {
      const dir = path.join(this.dataDir, 'tenants');
      if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir)) if (f.endsWith('.sqlite')) scopes.add(f.slice(0, -7));
      for (const id of Object.keys(this.registry)) if (fs.existsSync(this.locate(id))) scopes.add(id);
    }
    scopes.delete(PLATFORM_SCOPE);
    return [...scopes];
  }

  openScope(scope) {
    const cached = this.open.get(scope);
    if (cached) return cached;
    const file = this.locate(scope);
    if (file !== ':memory:') {
      fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
      // mkdir only sets the mode of a new folder: tighten folders made before (or by hand) too.
      for (const dir of new Set([path.dirname(file), this.dataDir])) fs.chmodSync(dir, 0o700);
    }
    const db = new DatabaseSync(file);
    try {
      db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000; PRAGMA secure_delete = ON;');
      const created = migrate(db, scope, this.migrations);
      if (this.masterKey) checkKey(db, this.keysFor(scope), scope);
      if (created && this.seed && scope !== PLATFORM_SCOPE) this.seed(db, scope);
    } catch (err) {
      db.close();
      throw err;
    }
    if (file !== ':memory:') restrict(file);
    this.open.set(scope, db);
    return db;
  }

  /**
   * One server per data folder: the working data is held in memory, so a second server on the same files
   * would overwrite the first one's writes. A lock left by a dead process is taken over.
   */
  lock() {
    if (!this.dataDir || this.lockFile) return;
    fs.mkdirSync(this.dataDir, { recursive: true, mode: 0o700 });
    const file = path.join(this.dataDir, '.lock');
    try {
      fs.writeFileSync(file, String(process.pid), { flag: 'wx', mode: 0o600 });
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      const pid = Number(fs.readFileSync(file, 'utf8'));
      if (pid && alive(pid)) throw new TenantDbError('DATA_DIR_LOCKED', `Thư mục dữ liệu đang được server khác dùng (pid ${pid})`);
      fs.writeFileSync(file, String(process.pid), { mode: 0o600 });
    }
    this.lockFile = file;
  }

  close() {
    for (const db of this.open.values()) db.close();
    this.open.clear();
    if (this.lockFile) {
      fs.rmSync(this.lockFile, { force: true });
      this.lockFile = null;
    }
  }
}
