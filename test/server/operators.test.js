import test from 'node:test';
import assert from 'node:assert';
import http from 'http';
import { createFleetBusServer } from '../../source/server/apiServer.js';
import { OPERATORS, DEFAULT_OPERATOR_ID, findOperatorByCode, normalizeOperatorCode } from '../../source/server/core/operators.js';
import { resolveOperator } from '../../source/server/core/gateway.js';

test('Operators Registry', async (t) => {
  await t.test('Registry lookups', () => {
    assert.strictEqual(normalizeOperatorCode(' xuyenviet '), 'XUYENVIET');
    assert.strictEqual(findOperatorByCode('SaoMai').code, 'SAOMAI');
    assert.strictEqual(findOperatorByCode('nope'), null);
  });
});

test('Gateway resolveOperator', async (t) => {
  await t.test('No code -> default in dev', () => {
    const res = resolveOperator({ headers: {} }, new URL('http://x'), null, { production: false });
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.operator.operator_id, DEFAULT_OPERATOR_ID);
  });
  
  await t.test('No code -> OPERATOR_REQUIRED in production', () => {
    const res = resolveOperator({ headers: {} }, new URL('http://x'), null, { production: true });
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.code, 'OPERATOR_REQUIRED');
  });

  await t.test('Unknown code -> OPERATOR_NOT_FOUND', () => {
    const res = resolveOperator({ headers: {} }, new URL('http://x?operator=NOPE'), null, { production: false });
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.code, 'OPERATOR_NOT_FOUND');
  });

  await t.test('Token claim wins', () => {
    const res = resolveOperator({ headers: {} }, new URL('http://x'), { operator_id: 'op_xuyenviet' }, { production: true });
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.operator.code, 'XUYENVIET');
  });

  await t.test('Token mismatch with explicit code -> OPERATOR_MISMATCH', () => {
    const res = resolveOperator({ headers: { 'x-operator-code': 'XUYENVIET' } }, new URL('http://x'), { operator_id: 'op_saomai' }, { production: false });
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.code, 'OPERATOR_MISMATCH');
  });

  await t.test('Token without claim -> default', () => {
    const res = resolveOperator({ headers: {} }, new URL('http://x'), { }, { production: false });
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.operator.operator_id, DEFAULT_OPERATOR_ID);
  });
});

test('App Config HTTP', async (t) => {
  const { server } = createFleetBusServer();
  let port = 0;
  
  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      port = server.address().port;
      resolve();
    });
  });

  const fetchJson = (path, headers = {}) => {
    return new Promise((resolve, reject) => {
      const req = http.request({
        host: '127.0.0.1',
        port,
        path,
        method: 'GET',
        headers
      }, (res) => {
        let body = '';
        res.on('data', d => body += d);
        res.on('end', () => {
          resolve({
            status: res.statusCode,
            data: body ? JSON.parse(body) : null
          });
        });
      });
      req.on('error', reject);
      req.end();
    });
  };

  await t.test('?operator=xuyenviet returns profile without bank fields', async () => {
    const res = await fetchJson('/api/v1/app/config?operator=xuyenviet');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.data.operator.code, 'XUYENVIET');
    assert.strictEqual(res.data.data.operator.name, 'Xuyên Việt Lines');
    assert.strictEqual(res.data.data.operator.bank, undefined);
  });

  await t.test('?operator=NOPE returns 404', async () => {
    const res = await fetchJson('/api/v1/app/config?operator=NOPE');
    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.data.code, 'OPERATOR_NOT_FOUND');
  });

  await t.test('No operator returns Sao Mai', async () => {
    const res = await fetchJson('/api/v1/app/config');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.data.operator.code, 'SAOMAI');
  });

  server.close();
});
