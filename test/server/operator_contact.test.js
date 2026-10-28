import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { createFleetBusServer } from '../../source/server/apiServer.js';
import { generateTotp } from '../../source/server/core/totp.js';
import { DEV_TOTP_SECRET } from '../../source/server/config.js';
import { MOCK_MANAGERS_DB } from '../../source/server/services/manager/modules/managerService.js';
import { signToken, TOKEN_PREFIXES } from '../../source/server/core/tokens.js';
import { OPERATORS } from '../../source/server/core/operators.js';

describe('Operator Contact Info Management (Office & Platform)', () => {
  let server;
  let services;
  let baseUrl;
  let saoMaiDirectorToken;
  let dispatcherToken;
  let rootToken;
  let xuyenVietDirectorToken;

  const originalSaoMai = {
    hotline: '1900 6868',
    support_email: 'cskh@saomai.vn',
    address: 'Bến xe Giáp Bát, Giải Phóng, Hoàng Mai, Hà Nội'
  };

  before(async () => {
    const instance = createFleetBusServer({ authMode: 'enforce' });
    server = instance.server;
    services = instance.services;
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}/api/v1`;

    // 1. Sao Mai Director login (admin@busgo.vn)
    const loginRes = await fetch(`${baseUrl}/auth/staff/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'admin@busgo.vn',
        password: 'admin123',
        totp: generateTotp(DEV_TOTP_SECRET, Date.now())
      })
    });
    assert.strictEqual(loginRes.status, 200);
    const loginJson = await loginRes.json();
    saoMaiDirectorToken = loginJson.data.token;

    // 2. Dispatcher login (dispatcher@busgo.vn - non-director staff role)
    const dispRes = await fetch(`${baseUrl}/auth/staff/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'dispatcher@busgo.vn',
        password: 'disp123'
      })
    });
    assert.strictEqual(dispRes.status, 200);
    const dispJson = await dispRes.json();
    dispatcherToken = dispJson.data.token;

    // 3. Platform Admin login (root@busgo.vn)
    const rootRes = await fetch(`${baseUrl}/auth/staff/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'root@busgo.vn',
        password: 'root123',
        totp: generateTotp(DEV_TOTP_SECRET, Date.now())
      })
    });
    assert.strictEqual(rootRes.status, 200);
    const rootJson = await rootRes.json();
    rootToken = rootJson.data.token;

    // 4. Xuyên Việt Director setup
    MOCK_MANAGERS_DB.push({
      user_id: 'mgr_xv_dir_test',
      username: 'director@xuyenviet.vn',
      role: 'FLEET_DIRECTOR',
      operator_id: 'op_xuyenviet',
      permissions: ['ALL'],
      must_change_password: false,
      totp_enrolled: true
    });
    xuyenVietDirectorToken = signToken(
      { sub: 'mgr_xv_dir_test', role: 'FLEET_DIRECTOR', operator_id: 'op_xuyenviet', kind: 'staff' },
      { prefix: TOKEN_PREFIXES.staff, ttlSeconds: 3600 }
    );
  });

  after(async () => {
    // Restore Sao Mai contact fields
    const op = OPERATORS.find((o) => o.operator_id === 'op_saomai');
    if (op) {
      Object.assign(op, originalSaoMai);
    }
    // Clean up test manager
    const idx = MOCK_MANAGERS_DB.findIndex((m) => m.user_id === 'mgr_xv_dir_test');
    if (idx !== -1) {
      MOCK_MANAGERS_DB.splice(idx, 1);
    }
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('GET /api/v1/ops/company as Sao Mai director returns hotline 1900 6868 and support_email', async () => {
    const res = await fetch(`${baseUrl}/ops/company`, {
      headers: {
        Authorization: `Bearer ${saoMaiDirectorToken}`,
        'X-Operator-Code': 'SAOMAI'
      }
    });
    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.data.operator.operator_id, 'op_saomai');
    assert.strictEqual(json.data.operator.code, 'SAOMAI');
    assert.strictEqual(json.data.operator.hotline, '1900 6868');
    assert.strictEqual(json.data.operator.support_email, 'cskh@saomai.vn');
    assert.strictEqual(json.data.operator.address, 'Bến xe Giáp Bát, Giải Phóng, Hoàng Mai, Hà Nội');
    assert.deepStrictEqual(json.data.editable, ['hotline', 'support_email', 'address']);
  });

  it('PATCH as director changes hotline and the public profile seen by passenger shows the new hotline', async () => {
    const patchRes = await fetch(`${baseUrl}/ops/company`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${saoMaiDirectorToken}`,
        'X-Operator-Code': 'SAOMAI',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ hotline: '1900 9999' })
    });
    assert.strictEqual(patchRes.status, 200);
    const patchJson = await patchRes.json();
    assert.strictEqual(patchJson.data.operator.hotline, '1900 9999');

    // Public profile seen by passenger (/api/v1/app/config) shows the new hotline
    const passengerRes = await fetch(`${baseUrl}/app/config`, {
      headers: { 'X-Operator-Code': 'SAOMAI' }
    });
    assert.strictEqual(passengerRes.status, 200);
    const passengerJson = await passengerRes.json();
    assert.strictEqual(passengerJson.data.operator.hotline, '1900 9999');
    assert.strictEqual(passengerJson.data.operator.support_email, 'cskh@saomai.vn');

    // Check audit log
    const auditEntry = services.managerService.auditLog.find(
      (a) => a.action === 'OPERATOR_CONTACT_UPDATE' && a.operator_id === 'op_saomai'
    );
    assert.ok(auditEntry);
    assert.strictEqual(auditEntry.before.hotline, '1900 6868');
    assert.strictEqual(auditEntry.after.hotline, '1900 9999');
  });

  it('PATCH with bank/name in body does not change them', async () => {
    const originalRes = await fetch(`${baseUrl}/ops/company`, {
      headers: {
        Authorization: `Bearer ${saoMaiDirectorToken}`,
        'X-Operator-Code': 'SAOMAI'
      }
    });
    const originalJson = await originalRes.json();
    const originalName = originalJson.data.operator.name;
    const originalBank = { ...originalJson.data.operator.bank };

    const tamperRes = await fetch(`${baseUrl}/ops/company`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${saoMaiDirectorToken}`,
        'X-Operator-Code': 'SAOMAI',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'Tên Giả Mạo',
        bank: { bin: '000000', bank_name: 'Fake Bank', account_number: '999999', account_name: 'FAKE' },
        hotline: '1900 8888'
      })
    });
    assert.strictEqual(tamperRes.status, 200);
    const tamperJson = await tamperRes.json();
    assert.strictEqual(tamperJson.data.operator.hotline, '1900 8888');
    assert.strictEqual(tamperJson.data.operator.name, originalName);
    assert.deepStrictEqual(tamperJson.data.operator.bank, originalBank);
  });

  it('PATCH with bad email -> 400', async () => {
    const badEmailRes = await fetch(`${baseUrl}/ops/company`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${saoMaiDirectorToken}`,
        'X-Operator-Code': 'SAOMAI',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ support_email: 'khong_phai_email' })
    });
    assert.strictEqual(badEmailRes.status, 400);
    const badEmailJson = await badEmailRes.json();
    assert.strictEqual(badEmailJson.code, 'VALIDATION_ERROR');
    assert.strictEqual(badEmailJson.message, 'Email chăm sóc khách hàng không hợp lệ');
  });

  it('PATCH as a non-director staff role -> 403', async () => {
    const dispPatchRes = await fetch(`${baseUrl}/ops/company`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${dispatcherToken}`,
        'X-Operator-Code': 'SAOMAI',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ hotline: '1900 1234' })
    });
    assert.strictEqual(dispPatchRes.status, 403);
    const dispPatchJson = await dispPatchRes.json();
    assert.strictEqual(dispPatchJson.code, 'FORBIDDEN');
  });

  it("Xuyên Việt director's GET returns Xuyên Việt data only", async () => {
    const xvRes = await fetch(`${baseUrl}/ops/company`, {
      headers: {
        Authorization: `Bearer ${xuyenVietDirectorToken}`,
        'X-Operator-Code': 'XUYENVIET'
      }
    });
    assert.strictEqual(xvRes.status, 200);
    const xvJson = await xvRes.json();
    assert.strictEqual(xvJson.data.operator.operator_id, 'op_xuyenviet');
    assert.strictEqual(xvJson.data.operator.code, 'XUYENVIET');
    assert.strictEqual(xvJson.data.operator.hotline, '1900 2468');
    assert.strictEqual(xvJson.data.operator.support_email, 'hotro@xuyenviet.vn');
    assert.strictEqual(xvJson.data.operator.address, 'Bến xe Mỹ Đình, Phạm Hùng, Nam Từ Liêm, Hà Nội');
  });

  it("GET /api/v1/platform/operators returns director_email 'admin@busgo.vn' for op_saomai", async () => {
    const platRes = await fetch(`${baseUrl}/platform/operators`, {
      headers: {
        Authorization: `Bearer ${rootToken}`
      }
    });
    assert.strictEqual(platRes.status, 200);
    const platJson = await platRes.json();
    const saomai = platJson.data.operators.find((op) => op.operator_id === 'op_saomai');
    assert.ok(saomai, 'op_saomai must exist in platform operators list');
    assert.strictEqual(saomai.director_email, 'admin@busgo.vn');
  });
});
