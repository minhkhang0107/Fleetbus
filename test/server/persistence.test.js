/**
 * Working data in the company databases (D127): kept across restarts, sealed at rest, one company per file,
 * and the server refuses to start on a wrong key or an edited record.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createFleetBusServer } from '../../source/server/apiServer.js';
import { loadMasterKey } from '../../source/server/core/dbCrypto.js';

const PHONE = '0987650001';

describe('TC-DB-PERSIST: data kept in sealed company databases', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fleetbus-persist-'));
  let server;
  let baseUrl;
  let pax;
  let ticketId;

  const start = async (options = {}) => {
    ({ server } = createFleetBusServer({ dataDir: dir, ...options }));
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  };
  const stop = () => new Promise(resolve => server.close(resolve));
  const api = async (p, { method = 'GET', body, token } = {}) => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (method === 'POST') headers['Idempotency-Key'] = crypto.randomUUID();
    const res = await fetch(`${baseUrl}${p}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  };
  const files = () => fs.readdirSync(dir, { recursive: true }).map(f => path.join(dir, f)).filter(f => fs.statSync(f).isFile());
  const count = (file, collection) => {
    const db = new DatabaseSync(file, { readOnly: true });
    const n = db.prepare('SELECT count(*) n FROM records WHERE collection = ?').get(collection).n;
    db.close();
    return n;
  };

  before(async () => {
    await start();
    const otp = await api('/api/v1/auth/passenger/otp/request', { method: 'POST', body: { phone: PHONE } });
    pax = (await api('/api/v1/auth/passenger/otp/verify', { method: 'POST', body: { phone: PHONE, otp: otp.body.data.mock_otp } })).body.data.token;
    const hold = await api('/api/v1/trips/trp_hn_th_01/seats/hold', { method: 'POST', token: pax, body: { seatCodes: ['B05'] } });
    assert.strictEqual(hold.status, 200, JSON.stringify(hold.body));
    const order = await api('/api/v1/bookings/create', {
      method: 'POST',
      token: pax,
      body: { tripId: 'trp_hn_th_01', holdId: hold.body.data.hold_id, seatCodes: ['B05'], payer: { full_name: 'Trần Lưu Trữ', phone: PHONE }, passengers: [{ full_name: 'Trần Lưu Trữ', phone: PHONE, seat_code: 'B05' }] }
    });
    assert.strictEqual(order.status, 201, JSON.stringify(order.body));
    const ipn = await api('/api/v1/webhooks/vietqr/ipn', { method: 'POST', body: { transferMemo: order.body.data.payment.payment_details.transfer_memo, amountVnd: order.body.data.order.total_payment_vnd, bankRef: `FT${crypto.randomUUID()}` } });
    assert.strictEqual(ipn.status, 200, JSON.stringify(ipn.body));
    ticketId = ipn.body.data.issued_tickets[0].ticket_id;
    for (let i = 0; i < 5; i++) await api('/api/v1/auth/staff/login', { method: 'POST', body: { username: 'cashier@busgo.vn', password: 'sai-mat-khau' } });
    await stop();
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('a restart keeps the ticket, the sold seat and the login lockout', async () => {
    await start();
    const wallet = await api('/api/v1/passenger/tickets', { token: pax });
    assert.ok(JSON.stringify(wallet.body).includes(ticketId), 'the ticket is still in the wallet');
    const seats = await api('/api/v1/trips/trp_hn_th_01/seat-map');
    const b05 = JSON.stringify(seats.body).match(/\{"seat_code":"B05"[^}]*"state":"([A-Z_]+)"/);
    assert.ok(b05, 'the seat map lists B05');
    assert.notStrictEqual(b05[1], 'AVAILABLE', 'B05 is still sold');
    const locked = await api('/api/v1/auth/staff/login', { method: 'POST', body: { username: 'cashier@busgo.vn', password: 'cash123' } });
    assert.strictEqual(locked.body.code, 'ACCOUNT_LOCKED', 'a restart does not reopen password guessing');
    await stop();
  });

  it('nothing readable on disk: no phone, name, bank account or token', () => {
    for (const f of files()) {
      const raw = fs.readFileSync(f);
      for (const secret of [PHONE, 'Trần Lưu Trữ', '1088219999', pax, ticketId]) {
        assert.ok(!raw.includes(Buffer.from(secret)), `${path.basename(f)} holds "${secret.slice(0, 12)}" in clear`);
      }
    }
  });

  it('each company file holds its own records; the platform file holds the registry', () => {
    assert.ok(count(path.join(dir, 'tenants', 'op_saomai.sqlite'), 'tickets') >= 1);
    assert.strictEqual(count(path.join(dir, 'tenants', 'op_xuyenviet.sqlite'), 'tickets'), 0);
    assert.strictEqual(count(path.join(dir, 'platform.sqlite'), 'tickets'), 0);
    assert.strictEqual(count(path.join(dir, 'platform.sqlite'), 'operators'), 2);
    assert.strictEqual(count(path.join(dir, 'tenants', 'op_saomai.sqlite'), 'operators'), 0);
  });

  it('files are readable by the server account only', () => {
    if (process.platform === 'win32') return;
    assert.strictEqual(fs.statSync(path.join(dir, '.db-key')).mode & 0o777, 0o600);
    assert.strictEqual(fs.statSync(path.join(dir, 'platform.sqlite')).mode & 0o777, 0o600);
    assert.strictEqual(fs.statSync(path.join(dir, 'tenants')).mode & 0o777, 0o700);
    assert.strictEqual(fs.statSync(dir).mode & 0o777, 0o700, 'the data folder itself is closed to other accounts');
  });

  it('one server per data folder', async () => {
    await start();
    assert.throws(() => createFleetBusServer({ dataDir: dir }), { code: 'DATA_DIR_LOCKED' });
    await stop();
    assert.ok(!fs.existsSync(path.join(dir, '.lock')), 'a stop releases the folder');
  });

  it('a wrong key stops the start instead of reading garbage', () => {
    assert.throws(() => createFleetBusServer({ dataDir: dir, env: { FLEETBUS_DB_KEY: crypto.randomBytes(32).toString('base64') } }), { code: 'DB_KEY_MISMATCH' });
  });

  it('an edited record stops the start', () => {
    const file = path.join(dir, 'tenants', 'op_saomai.sqlite');
    const db = new DatabaseSync(file);
    const row = db.prepare("SELECT id_hash, data FROM records WHERE collection = 'tickets' LIMIT 1").get();
    const data = Buffer.from(row.data);
    data[data.length - 1] ^= 1;
    db.prepare("UPDATE records SET data = ? WHERE collection = 'tickets' AND id_hash = ?").run(data, row.id_hash);
    db.close();
    assert.throws(() => createFleetBusServer({ dataDir: dir }), { code: 'DB_RECORD_TAMPERED' });
  });

  it('production needs FLEETBUS_DB_KEY', () => {
    assert.throws(() => loadMasterKey({ dataDir: dir, production: true, env: {} }), { code: 'DB_KEY_REQUIRED' });
    assert.throws(() => loadMasterKey({ dataDir: dir, production: true, env: { FLEETBUS_DB_KEY: 'ngan' } }), { code: 'DB_KEY_INVALID' });
  });

  it('OPTIONS and static routes bypass storage flush', async () => {
    let flushed = false;
    const { server, services } = createFleetBusServer({ dataDir: null });
    const originalFlush = services.store.flush.bind(services.store);
    services.store.flush = () => { flushed = true; return originalFlush(); };
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const testUrl = `http://127.0.0.1:${server.address().port}`;

    flushed = false;
    const optRes = await fetch(`${testUrl}/api/v1/trips`, { method: 'OPTIONS' });
    assert.strictEqual(optRes.status, 204);
    assert.strictEqual(flushed, false, 'OPTIONS must bypass flush');

    flushed = false;
    const staticRes = await fetch(`${testUrl}/passenger`, { method: 'GET' });
    assert.strictEqual(staticRes.status, 200);
    assert.strictEqual(flushed, false, 'static GET must bypass flush');

    await new Promise(resolve => server.close(resolve));
  });
});

describe('TC-AUDIT-CHAIN: each company audit log is a hash chain', () => {
  it('stays intact as entries are added; a removed entry breaks it', () => {
    const { services } = createFleetBusServer({ dataDir: null });
    const audit = services.managerService;
    const start = audit.auditLog.length;
    for (const action of ['A', 'B', 'C']) audit.recordAudit({ action, operator_id: 'op_saomai' });
    audit.recordAudit({ action: 'X', operator_id: 'op_xuyenviet' });
    assert.strictEqual(audit.verifyAuditChain('op_saomai').intact, true);
    const saomai = audit.auditLog.slice(start).filter(a => a.operator_id === 'op_saomai');
    assert.strictEqual(saomai[1].prev_hash, saomai[0].hash, 'each entry names the one before');
    audit.auditLog.splice(audit.auditLog.indexOf(saomai[1]), 1);
    const broken = audit.verifyAuditChain('op_saomai');
    assert.strictEqual(broken.intact, false);
    assert.strictEqual(broken.broken_at, saomai[2].audit_id);
    assert.strictEqual(audit.verifyAuditChain('op_xuyenviet').intact, true, 'another company keeps its own chain');
  });
});
