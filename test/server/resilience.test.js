/**
 * What the server answers to requests from a bad network or a broken client (D178): a body cut in pieces,
 * a body that is not a JSON object, one that is far too large, a client that stops sending.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { createFleetBusServer } from '../../source/server/apiServer.js';
import { MAX_BODY_BYTES, readRawBody } from '../../source/server/middleware/httpUtils.js';

const OTP = '/api/v1/passenger/auth/request-otp';
const HEADERS = { 'content-type': 'application/json', 'x-operator-code': 'SAOMAI' };

describe('D178: requests from a bad network or a broken client', () => {
  let dir;
  let server;
  let base;

  before(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fleetbus-resilience-'));
    ({ server } = createFleetBusServer({ dataDir: dir, persistIntervalMs: 100 }));
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const post = async (body) => {
    const res = await fetch(base + OTP, { method: 'POST', headers: HEADERS, body });
    return { status: res.status, json: await res.json() };
  };

  it('a body that is not JSON, or JSON that is not an object, gets a readable 400', async () => {
    for (const body of ['{bad', '[1,2]', 'null', '42', '"0901234567"']) {
      const { status, json } = await post(body);
      assert.strictEqual(status, 400, body);
      assert.strictEqual(json.code, 'BAD_REQUEST', body);
      assert.match(json.message, /^Dữ liệu gửi lên/, body);
    }
  });

  it('a phone that is not a string is an invalid phone, not a JS error', async () => {
    for (const phone of [12345, { a: 1 }, ['0901234567']]) {
      const { status, json } = await post(JSON.stringify({ phone }));
      assert.strictEqual(status, 400);
      assert.strictEqual(json.code, 'INVALID_PHONE');
      assert.doesNotMatch(json.message, /is not a function|Cannot read/);
    }
  });

  it('an invalid phone is a 400, only the cooldown is a 429', async () => {
    const bad = await post(JSON.stringify({ phone: '123' }));
    assert.strictEqual(bad.status, 400);
    assert.strictEqual(bad.json.code, 'INVALID_PHONE');

    const phone = '0912000178';
    assert.strictEqual((await post(JSON.stringify({ phone }))).status, 200);
    const again = await post(JSON.stringify({ phone }));
    assert.strictEqual(again.status, 429);
    assert.strictEqual(again.json.code, 'COOLDOWN_ACTIVE');
  });

  it('a body over the limit is refused and the server keeps serving', async () => {
    const { status, json } = await post('x'.repeat(MAX_BODY_BYTES + 1024));
    assert.strictEqual(status, 400);
    assert.strictEqual(json.message, 'Dữ liệu gửi lên quá lớn');
    const config = await fetch(`${base}/api/v1/app/config?operator=SAOMAI`);
    assert.strictEqual(config.status, 200);
  });

  it('a Vietnamese name split between two TCP packets arrives intact', async () => {
    // "Ạ" is 3 bytes in UTF-8: cut it in the middle, as a slow mobile network may.
    const bytes = Buffer.from(JSON.stringify({ full_name: 'Lê Thị Ạnh' }), 'utf8');
    const cut = bytes.indexOf(Buffer.from('Ạ', 'utf8')) + 1;
    const req = new EventEmitter();
    const body = readRawBody(req);
    req.emit('data', bytes.subarray(0, cut));
    req.emit('data', bytes.subarray(cut));
    req.emit('end');
    assert.deepStrictEqual(JSON.parse(await body), { full_name: 'Lê Thị Ạnh' });
  });

  it('a client that stops sending mid-request is cut off in seconds, not minutes', () => {
    assert.ok(server.requestTimeout > 0 && server.requestTimeout <= 30000);
    assert.ok(server.headersTimeout > 0 && server.headersTimeout <= server.requestTimeout);
  });
});
