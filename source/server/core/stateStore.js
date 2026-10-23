/**
 * Keeps the server's working data in the company databases (D127).
 *
 * The services keep their objects in memory; this store loads them from the databases at start and, after
 * every request, writes what changed before the response leaves (`flush`). A record goes to the database of
 * the company it belongs to (`scope`), or to the platform database for data that is no single company's.
 * Each record is sealed (core/dbCrypto.js) and stored under an HMAC of its id.
 *
 * Writing is per database, in one transaction each. When a write fails the store turns `failed`: the
 * request gets no success answer and later requests get 503 until a restart reloads from the databases,
 * so memory never runs ahead of what is stored.
 */
import crypto from 'crypto';
import { hashId, open, seal } from './dbCrypto.js';
import { PLATFORM_SCOPE } from './tenantDb.js';

const MARKER = (name) => `collection:${name}`;

export const FROZEN_DIGESTS = new WeakMap();

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

export class StateStore {
  /**
   * @param {object} options
   * @param {import('./tenantDb.js').TenantDatabases} options.tenantDbs
   * @param {Array<{name: string, dump: () => Array<{key: string, order: number, value: any, scope: string}>, restore: (records: Array<{key: string, order: number, value: any}>) => void}>} options.collections
   * @param {() => string[]} options.knownScopes  company ids that may have data (from the registry)
   */
  constructor({ tenantDbs, collections, knownScopes = () => [] }) {
    this.tenantDbs = tenantDbs;
    this.collections = collections;
    this.knownScopes = knownScopes;
    this.stored = new Map(); // collection -> Map(scope|idHash -> digest)
    this.idCache = new Map();
    this.failed = null;
  }

  db(scope) {
    return scope === PLATFORM_SCOPE ? this.tenantDbs.forPlatform() : this.tenantDbs.forOperator(scope);
  }

  readScope(scope, wanted) {
    const db = this.db(scope);
    const keys = this.tenantDbs.keysFor(scope);
    const out = new Map();
    for (const row of db.prepare('SELECT collection, id_hash, data FROM records').all()) {
      if (!wanted.has(row.collection)) continue;
      const rec = open(keys, row.collection, row.id_hash, row.data);
      if (!out.has(row.collection)) out.set(row.collection, []);
      out.get(row.collection).push({ key: rec.k, order: rec.o, value: rec.v, scope, idHash: row.id_hash, digest: digest(row.collection, rec) });
    }
    return out;
  }

  /** Loads every collection that was stored before; the others keep their seed and are written now. */
  boot() {
    const platform = this.db(PLATFORM_SCOPE);
    const initialized = new Set(this.collections.map(c => c.name).filter(n => platform.prepare('SELECT 1 FROM tenant_meta WHERE key = ?').get(MARKER(n))));
    const found = new Map([...initialized].map(n => [n, []]));
    const merge = (scopeRecords) => { for (const [name, recs] of scopeRecords) found.get(name).push(...recs); };

    merge(this.readScope(PLATFORM_SCOPE, initialized));
    // The registry is restored first: it names the companies whose databases to read.
    for (const c of this.collections.filter(c => c.platformFirst && initialized.has(c.name))) c.restore(sorted(found.get(c.name)));
    const scopes = new Set([...this.knownScopes(), ...this.tenantDbs.existingScopes()]);
    for (const scope of scopes) merge(this.readScope(scope, initialized));

    for (const c of this.collections) {
      if (!initialized.has(c.name)) continue;
      const recs = found.get(c.name);
      if (!c.platformFirst) c.restore(sorted(recs));
      this.stored.set(c.name, new Map(recs.map(r => [`${r.scope}|${r.idHash}`, r.digest])));
    }
    this.flush();
  }

  idHash(scope, name, key) {
    const cacheKey = `${scope}\0${name}\0${key}`;
    let id = this.idCache.get(cacheKey);
    if (!id) {
      id = hashId(this.tenantDbs.keysFor(scope), name, key);
      this.idCache.set(cacheKey, id);
    }
    return id;
  }

  /** Writes what changed since the last flush. Throws (and marks the store failed) when a write fails. */
  flush() {
    if (this.failed) throw this.failed;
    const writes = new Map(); // scope -> { upserts: [], deletes: [], markers: Set }
    const pending = [];
    const plan = (scope) => {
      if (!writes.has(scope)) writes.set(scope, { upserts: [], deletes: [], markers: new Set() });
      return writes.get(scope);
    };
    for (const c of this.collections) {
      const before = this.stored.get(c.name);
      const now = new Map();
      for (const rec of c.dump()) {
        const scope = rec.scope || PLATFORM_SCOPE;
        const idHash = this.idHash(scope, c.name, rec.key);
        const payload = { k: rec.key, o: rec.order, v: rec.value };
        const d = digest(c.name, payload, c.freeze);
        const slot = `${scope}|${idHash}`;
        now.set(slot, d);
        if (before?.get(slot) !== d) plan(scope).upserts.push({ name: c.name, idHash, payload });
      }
      if (before) {
        for (const slot of before.keys()) {
          if (now.has(slot)) continue;
          const cut = slot.indexOf('|');
          plan(slot.slice(0, cut)).deletes.push({ name: c.name, idHash: slot.slice(cut + 1) });
        }
      } else {
        plan(PLATFORM_SCOPE).markers.add(c.name);
      }
      pending.push([c.name, now]);
    }
    try {
      for (const [scope, w] of writes) {
        if (!w.upserts.length && !w.deletes.length && !w.markers.size) continue;
        const db = this.db(scope);
        const keys = this.tenantDbs.keysFor(scope);
        const at = new Date().toISOString();
        const upsert = db.prepare('INSERT INTO records (collection, id_hash, data, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT (collection, id_hash) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at');
        const remove = db.prepare('DELETE FROM records WHERE collection = ? AND id_hash = ?');
        const mark = db.prepare("INSERT OR IGNORE INTO tenant_meta (key, value) VALUES (?, '1')");

        let attempts = 0;
        const maxAttempts = 2; // single retry if transient busy/locked (busy_timeout is already 3000ms)
        while (true) {
          try {
            db.exec('BEGIN IMMEDIATE');
            try {
              for (const u of w.upserts) upsert.run(u.name, u.idHash, seal(keys, u.name, u.idHash, u.payload), at);
              for (const d of w.deletes) remove.run(d.name, d.idHash);
              for (const name of w.markers) mark.run(MARKER(name));
              db.exec('COMMIT');
              break;
            } catch (err) {
              db.exec('ROLLBACK');
              throw err;
            }
          } catch (err) {
            attempts++;
            const isTransient = err?.errcode === 5 || err?.errcode === 6 || err?.code === 'SQLITE_BUSY' || err?.code === 'SQLITE_LOCKED';
            if (isTransient && attempts < maxAttempts) {
              sleepSync(25);
              continue;
            }
            throw err;
          }
        }
      }
    } catch (err) {
      this.failed = Object.assign(new Error(`Không lưu được dữ liệu: ${err.message}`), { code: 'STORAGE_FAILED', cause: err });
      throw this.failed;
    }
    for (const [name, now] of pending) this.stored.set(name, now);
  }
}

function digest(name, payload, freeze = false) {
  if (freeze && payload?.v && typeof payload.v === 'object') {
    const cached = FROZEN_DIGESTS.get(payload.v);
    if (cached) return cached;
    const d = crypto.createHash('sha256').update(name).update('\0').update(JSON.stringify(payload)).digest('base64');
    FROZEN_DIGESTS.set(payload.v, d);
    return d;
  }
  return crypto.createHash('sha256').update(name).update('\0').update(JSON.stringify(payload)).digest('base64');
}

const sorted = (recs) => [...recs].sort((a, b) => a.order - b.order);

// ---------- collection helpers ----------

/** A Map keyed by string. */
export function mapCollection(name, getMap, scopeOf) {
  return {
    name,
    dump: () => [...getMap().entries()].map(([key, value], order) => ({ key: String(key), order, value, scope: scopeOf(value, key) })),
    restore: (recs) => { const m = getMap(); m.clear(); for (const r of recs) m.set(r.key, r.value); }
  };
}

/** An array changed in place (it may be a module-level constant that other modules hold). */
export function listCollection(name, getList, scopeOf, { freeze = false, platformFirst = false, afterRestore = null } = {}) {
  return {
    name,
    freeze,
    platformFirst,
    dump: () => getList().map((value, order) => ({ key: String(order), order, value, scope: scopeOf(value) })),
    restore: (recs) => {
      const list = getList();
      list.length = 0;
      for (const r of recs) list.push(freeze ? Object.freeze(r.value) : r.value);
      afterRestore?.();
    }
  };
}

/** A plain object used as a dictionary; `setObject` replaces it. */
export function objectCollection(name, getObject, setObject, scopeOf) {
  return {
    name,
    dump: () => Object.entries(getObject() || {}).map(([key, value], order) => ({ key, order, value, scope: scopeOf(value, key) })),
    restore: (recs) => setObject(Object.fromEntries(recs.map(r => [r.key, r.value])))
  };
}

/** A Set of strings; `setSet` replaces it. */
export function setCollection(name, getSet, setSet, scopeOf) {
  return {
    name,
    dump: () => [...(getSet() || [])].map((key, order) => ({ key, order, value: 1, scope: scopeOf(key) })),
    restore: (recs) => setSet(new Set(recs.map(r => r.key)))
  };
}

/** A Map of lists (e.g. notifications per phone) stored one item per record, so each item finds its company. */
export function groupedCollection(name, getMap, scopeOf) {
  return {
    name,
    dump: () => [...getMap().entries()].flatMap(([group, items]) => items.map((value, order) => ({ key: `${group}\0${order}`, order, value: { group, item: value }, scope: scopeOf(value, group) }))),
    restore: (recs) => {
      const m = getMap();
      m.clear();
      for (const r of recs) {
        if (!m.has(r.value.group)) m.set(r.value.group, []);
        m.get(r.value.group).push(r.value.item);
      }
    }
  };
}
