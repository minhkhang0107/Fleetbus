/**
 * FleetBus Staff RBAC & Permissions Engine Test Suite
 * Validates the 2-role model (FLEET_DIRECTOR & STAFF with permissions),
 * dynamic permission checks, default-deny mutations, data normalization,
 * phone masking rules, and TOTP requirement enforcement.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { createFleetBusServer } from '../../source/server/apiServer.js';
import { generateTotp } from '../../source/server/core/totp.js';
import { DEV_TOTP_SECRET } from '../../source/server/config.js';
import { API_CATALOG } from '../../source/server/core/apiCatalog.js';
import { signToken, TOKEN_PREFIXES } from '../../source/server/core/tokens.js';
import { STAFF_RULES, DIRECTOR_ONLY, STAFF_AUTH_EXEMPT } from '../../source/server/core/gateway.js';
import {
  ALLOWED_PERMISSIONS,
  STAFF_ROLE_TEMPLATES,
  normalizeStaffAccount,
  getPermissionsCatalog
} from '../../source/server/services/manager/modules/staffAccounts.js';
import { MOCK_MANAGERS_DB } from '../../source/server/services/manager/modules/managerService.js';

describe('Staff RBAC & Granular Permissions Engine', () => {
  let server;
  let services;
  let baseUrl;
  let directorToken;
  let dispatcherToken;

  const totp = () => generateTotp(DEV_TOTP_SECRET, Date.now());

  const api = async (path, { method = 'GET', body, token, operatorCode, key } = {}) => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (operatorCode) headers['X-Operator-Code'] = operatorCode;
    if (method === 'POST') headers['Idempotency-Key'] = key || crypto.randomUUID();
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const text = await res.text();
    let json = {};
    try { json = JSON.parse(text); } catch (_) {}
    return { status: res.status, body: json, text };
  };

  before(async () => {
    ({ server, services } = createFleetBusServer({ authMode: 'enforce' }));
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    // Director login (Sao Mai)
    const dirRes = await api('/api/v1/ops/auth/login', {
      method: 'POST',
      body: { username: 'admin@busgo.vn', password: 'admin123', totp: totp() }
    });
    assert.strictEqual(dirRes.status, 200, JSON.stringify(dirRes.body));
    directorToken = dirRes.body.data.token;

    // Dispatcher login (Sao Mai, role STAFF with DISPATCH template)
    const dispRes = await api('/api/v1/ops/auth/login', {
      method: 'POST',
      body: { username: 'dispatcher@busgo.vn', password: 'disp123' }
    });
    assert.strictEqual(dispRes.status, 200);
    dispatcherToken = dispRes.body.data.token;
  });

  after(() => new Promise(resolve => server.close(resolve)));

  describe('1. API Catalog Audit: Default-deny for mutations & default-allow for GET', () => {
    it('every mutation in API_CATALOG has explicit rule or falls into DIRECTOR_ONLY', () => {
      const ops = API_CATALOG.filter(e => e.path.startsWith('/api/v1/ops/'));
      assert.ok(ops.length > 0, 'Must have ops endpoints in API_CATALOG');

      const defaultGet = [];
      const defaultMutations = [];
      const matched = [];

      for (const entry of ops) {
        const testPath = entry.path.replace(/\{[^}]+\}/g, 'test_val_123');
        const rule = STAFF_RULES.find((r) => {
          if (r.length === 3) {
            const [methods, re] = r;
            const matchesMethod = Array.isArray(methods) ? methods.includes(entry.method) : methods === entry.method;
            return matchesMethod && re.test(testPath);
          }
          return r[0].test(testPath);
        });

        if (rule) {
          const reqPerms = rule.length === 3 ? rule[2] : rule[1];
          matched.push({ ...entry, reqPerms });
        } else {
          if (entry.method === 'GET') {
            defaultGet.push(entry);
          } else {
            defaultMutations.push(entry);
          }
        }
      }

      // Assert that any mutation that lacks a rule is either in STAFF_AUTH_EXEMPT or falls to DIRECTOR_ONLY
      for (const m of defaultMutations) {
        assert.ok(
          STAFF_AUTH_EXEMPT.includes(m.path),
          `Mutation ${m.method} ${m.path} without rule must be in STAFF_AUTH_EXEMPT`
        );
      }

      // Default deny: every catalogued ops read has its own rule, none relies on the fallback
      assert.deepStrictEqual(defaultGet.map(g => g.path), [], 'GET endpoints without a rule fall to DIRECTOR_ONLY');
    });

    it('an ops endpoint without a rule is director only, reads included (default deny)', async () => {
      const unknown = await api('/api/v1/ops/some-new-screen', { token: dispatcherToken });
      assert.strictEqual(unknown.status, 403);
      const board = await api('/api/v1/ops/dispatch/board', { token: dispatcherToken });
      assert.strictEqual(board.status, 200);
    });

    it('GET /api/v1/ops/staff/permissions-catalog returns catalog of 11 permissions and 3 templates', async () => {
      const res = await api('/api/v1/ops/staff/permissions-catalog', { token: directorToken });
      assert.strictEqual(res.status, 200);
      assert.ok(res.body.data.permissions);
      assert.strictEqual(res.body.data.permissions.length, 11);
      assert.ok(res.body.data.templates);
      assert.strictEqual(res.body.data.templates.length, 3);
      assert.deepStrictEqual(
        res.body.data.permissions.map(p => p.code),
        ALLOWED_PERMISSIONS
      );
    });
  });

  describe('2. normalizeStaffAccount: Data migration & idempotence', () => {
    it('converts DISPATCHER, CASHIER, FINANCIAL_CONTROLLER correctly', () => {
      // 1. DISPATCHER
      const disp = normalizeStaffAccount({
        user_id: 'u_disp',
        role: 'DISPATCHER',
        permissions: ['DISPATCH_MANAGE', 'TRIP_EDIT']
      });
      assert.strictEqual(disp.role, 'STAFF');
      assert.deepStrictEqual(disp.permissions, STAFF_ROLE_TEMPLATES.DISPATCHER.permissions);
      assert.strictEqual(disp.totp_required, false);

      // 2. CASHIER
      const cash = normalizeStaffAccount({
        user_id: 'u_cash',
        role: 'CASHIER',
        permissions: ['POS_ISSUE']
      });
      assert.strictEqual(cash.role, 'STAFF');
      assert.deepStrictEqual(cash.permissions, STAFF_ROLE_TEMPLATES.CASHIER.permissions);
      assert.strictEqual(cash.totp_required, false);

      // 3. FINANCIAL_CONTROLLER -> totp_required is true
      const ctrl = normalizeStaffAccount({
        user_id: 'u_ctrl',
        role: 'FINANCIAL_CONTROLLER',
        permissions: ['FINANCE_MANAGE']
      });
      assert.strictEqual(ctrl.role, 'STAFF');
      assert.deepStrictEqual(ctrl.permissions, STAFF_ROLE_TEMPLATES.FINANCIAL_CONTROLLER.permissions);
      assert.strictEqual(ctrl.totp_required, true);

      // 4. FLEET_DIRECTOR stays FLEET_DIRECTOR with ['ALL']
      const dir = normalizeStaffAccount({
        user_id: 'u_dir',
        role: 'FLEET_DIRECTOR',
        permissions: ['SOMETHING']
      });
      assert.strictEqual(dir.role, 'FLEET_DIRECTOR');
      assert.deepStrictEqual(dir.permissions, ['ALL']);

      // 5. Idempotence: re-running on normalized staff produces identical result
      const disp2 = normalizeStaffAccount({ ...disp });
      assert.deepStrictEqual(disp2, disp);
    });
  });

  describe('3. Staff Creation & Validation', () => {
    it('creating staff with legacy role (DISPATCHER/CASHIER) returns 400 VALIDATION_ERROR', async () => {
      const res = await api('/api/v1/ops/staff', {
        method: 'POST',
        token: directorToken,
        body: {
          username: 'legacy_disp@saomai.vn',
          full_name: 'Lê Cũ',
          role: 'DISPATCHER'
        }
      });
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.code, 'VALIDATION_ERROR');
      assert.ok(res.body.message.includes('STAFF'));
    });

    it('creating staff with role STAFF and invalid permission returns 400', async () => {
      const res = await api('/api/v1/ops/staff', {
        method: 'POST',
        token: directorToken,
        body: {
          username: 'bad_perm@saomai.vn',
          full_name: 'Sai Quyền',
          role: 'STAFF',
          permissions: ['DISPATCH', 'SUPER_ADMIN_HACK']
        }
      });
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.code, 'VALIDATION_ERROR');
      assert.ok(res.body.message.includes('SUPER_ADMIN_HACK'));
    });

    it('staff member cannot create or manage other staff (DIRECTOR_ONLY -> 403)', async () => {
      const res = await api('/api/v1/ops/staff', {
        method: 'POST',
        token: dispatcherToken,
        body: {
          username: 'hacker_staff@saomai.vn',
          full_name: 'Hacker',
          role: 'STAFF',
          permissions: ['PAYMENTS']
        }
      });
      assert.strictEqual(res.status, 403);
    });
  });

  describe('4. Dynamic Real-time Permission Changes on Existing Tokens', () => {
    let testStaff;
    let testStaffToken;
    let testStaffTempPw;

    it('creates staff with only BOOKINGS_VIEW; verify permissions', async () => {
      const createRes = await api('/api/v1/ops/staff', {
        method: 'POST',
        token: directorToken,
        body: {
          username: 'dyn_staff@saomai.vn',
          full_name: 'Nhân Viên Động',
          phone: '0977889900',
          role: 'STAFF',
          permissions: ['BOOKINGS_VIEW']
        }
      });
      assert.strictEqual(createRes.status, 201);
      testStaff = createRes.body.data.staff;
      testStaffTempPw = createRes.body.data.temporary_password;

      // Login & change password to get an active token
      const loginRes = await api('/api/v1/ops/auth/login', {
        method: 'POST',
        body: { username: 'dyn_staff@saomai.vn', password: testStaffTempPw }
      });
      assert.strictEqual(loginRes.status, 200);

      const changeRes = await api('/api/v1/ops/auth/change-password', {
        method: 'POST',
        token: loginRes.body.data.token,
        body: { current_password: testStaffTempPw, new_password: 'StaffStrong123' }
      });
      assert.strictEqual(changeRes.status, 200);
      testStaffToken = changeRes.body.data.token;
    });

    it('testStaff can read bookings (has BOOKINGS_VIEW) but gets 403 on payments', async () => {
      const bookRes = await api('/api/v1/ops/bookings', { token: testStaffToken });
      assert.strictEqual(bookRes.status, 200);

      const payRes = await api('/api/v1/ops/pending-payments', { token: testStaffToken });
      assert.strictEqual(payRes.status, 403, 'Must get 403 without PAYMENTS');
    });

    it('director grants PAYMENTS permission; testStaffToken immediately works on payments without re-login', async () => {
      const patchRes = await api(`/api/v1/ops/staff/${testStaff.user_id}`, {
        method: 'PATCH',
        token: directorToken,
        body: {
          permissions: ['BOOKINGS_VIEW', 'PAYMENTS']
        }
      });
      assert.strictEqual(patchRes.status, 200);
      assert.deepStrictEqual(patchRes.body.data.staff.permissions, ['BOOKINGS_VIEW', 'PAYMENTS']);

      // Audit log check: STAFF_PERMISSIONS_UPDATE recorded
      const audit = services.managerService.auditLog.find(a => a.action === 'STAFF_PERMISSIONS_UPDATE' && a.resource === testStaff.user_id);
      assert.ok(audit, 'STAFF_PERMISSIONS_UPDATE must be audited');

      // Crucial test: Using the SAME testStaffToken (NO new login, NO token_version bump)
      const payRes = await api('/api/v1/ops/pending-payments', { token: testStaffToken });
      assert.strictEqual(payRes.status, 200, 'Existing token must immediately gain access to PAYMENTS');
    });

    it('director revokes PAYMENTS permission; testStaffToken immediately gets 403 again', async () => {
      const patchRes = await api(`/api/v1/ops/staff/${testStaff.user_id}`, {
        method: 'PATCH',
        token: directorToken,
        body: {
          permissions: ['BOOKINGS_VIEW']
        }
      });
      assert.strictEqual(patchRes.status, 200);

      // Immediate revocation check
      const payRes = await api('/api/v1/ops/pending-payments', { token: testStaffToken });
      assert.strictEqual(payRes.status, 403, 'Existing token must immediately lose access to PAYMENTS');
    });

    it('GET /api/v1/ops/auth/me returns current user profile and permissions in real-time', async () => {
      // 1. Director auth/me returns full permissions and director role
      const dirMe = await api('/api/v1/ops/auth/me', { token: directorToken });
      assert.strictEqual(dirMe.status, 200);
      assert.strictEqual(dirMe.body.data.role, 'FLEET_DIRECTOR');
      assert.deepStrictEqual(dirMe.body.data.permissions, ALLOWED_PERMISSIONS);
      assert.strictEqual(dirMe.body.data.totp_required, true);
      assert.ok(dirMe.body.data.operator?.name, 'Must include operator profile');

      // 2. Staff auth/me returns current permissions
      const staffMe1 = await api('/api/v1/ops/auth/me', { token: testStaffToken });
      assert.strictEqual(staffMe1.status, 200);
      assert.strictEqual(staffMe1.body.data.role, 'STAFF');
      assert.deepStrictEqual(staffMe1.body.data.permissions, ['BOOKINGS_VIEW']);

      // 3. Director grants PAYMENTS + REFUNDS; calling auth/me immediately reflects changes
      await api(`/api/v1/ops/staff/${testStaff.user_id}`, {
        method: 'PATCH',
        token: directorToken,
        body: { permissions: ['BOOKINGS_VIEW', 'PAYMENTS', 'REFUNDS'] }
      });
      const staffMe2 = await api('/api/v1/ops/auth/me', { token: testStaffToken });
      assert.strictEqual(staffMe2.status, 200);
      assert.deepStrictEqual(staffMe2.body.data.permissions, ['BOOKINGS_VIEW', 'PAYMENTS', 'REFUNDS']);

      // Reset back to BOOKINGS_VIEW
      await api(`/api/v1/ops/staff/${testStaff.user_id}`, {
        method: 'PATCH',
        token: directorToken,
        body: { permissions: ['BOOKINGS_VIEW'] }
      });
    });

    it('staff cannot modify their own permissions or others', async () => {
      const patchSelf = await api(`/api/v1/ops/staff/${testStaff.user_id}`, {
        method: 'PATCH',
        token: testStaffToken,
        body: {
          permissions: ['PAYMENTS', 'REFUNDS', 'FLEET']
        }
      });
      assert.strictEqual(patchSelf.status, 403, 'Staff cannot call /ops/staff/*');
    });
  });

  describe('5. Phone Masking: Full phone for DISPATCH / TICKETING, Masked for others', () => {
    let financeOnlyToken;

    before(async () => {
      // Create staff with only PAYMENTS (no DISPATCH, no TICKETING)
      const res = await api('/api/v1/ops/staff', {
        method: 'POST',
        token: directorToken,
        body: {
          username: 'fin_only@saomai.vn',
          full_name: 'Kế Toán Chỉ Thu Chi',
          role: 'STAFF',
          permissions: ['PAYMENTS', 'REFUNDS', 'BOOKINGS_VIEW']
        }
      });
      assert.strictEqual(res.status, 201);
      const tempPw = res.body.data.temporary_password;

      const login = await api('/api/v1/ops/auth/login', {
        method: 'POST',
        body: { username: 'fin_only@saomai.vn', password: tempPw }
      });
      const change = await api('/api/v1/ops/auth/change-password', {
        method: 'POST',
        token: login.body.data.token,
        body: { current_password: tempPw, new_password: 'FinOnlyPass123' }
      });
      financeOnlyToken = change.body.data.token;
    });

    it('director sees full phone numbers in bookings', async () => {
      const res = await api('/api/v1/ops/bookings', { token: directorToken });
      assert.strictEqual(res.status, 200);
      const b = res.body.data.bookings.find(x => x.phone);
      if (b) {
        assert.ok(!b.phone.includes('***'), `Director sees unmasked phone: ${b.phone}`);
      }
    });

    it('dispatcher (has DISPATCH) sees full phone numbers to call passengers', async () => {
      const res = await api('/api/v1/ops/bookings', { token: dispatcherToken });
      assert.strictEqual(res.status, 200);
      const b = res.body.data.bookings.find(x => x.phone);
      if (b) {
        assert.ok(!b.phone.includes('***'), `Dispatcher sees unmasked phone: ${b.phone}`);
      }
    });

    it('finance-only staff (no DISPATCH, no TICKETING) sees masked phone numbers', async () => {
      const res = await api('/api/v1/ops/bookings', { token: financeOnlyToken });
      assert.strictEqual(res.status, 200);
      const b = res.body.data.bookings.find(x => x.phone);
      if (b) {
        assert.ok(b.phone.includes('***'), `Finance staff sees masked phone: ${b.phone}`);
      }
    });
  });

  describe('6. TOTP: Enforced by totp_required for staff', () => {
    it('staff with totp_required: true must enroll TOTP before performing ops', async () => {
      const res = await api('/api/v1/ops/staff', {
        method: 'POST',
        token: directorToken,
        body: {
          username: 'totp_staff@saomai.vn',
          full_name: 'Nguyễn Văn Bảo Mật',
          role: 'STAFF',
          permissions: ['PAYMENTS'],
          totp_required: true
        }
      });
      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.data.staff.totp_required, true);
      const tempPw = res.body.data.temporary_password;

      // Login
      const login = await api('/api/v1/ops/auth/login', {
        method: 'POST',
        body: { username: 'totp_staff@saomai.vn', password: tempPw }
      });
      assert.strictEqual(login.status, 200);
      assert.strictEqual(login.body.data.user.must_enroll_totp, true);

      // Change password
      const change = await api('/api/v1/ops/auth/change-password', {
        method: 'POST',
        token: login.body.data.token,
        body: { current_password: tempPw, new_password: 'TotpStaffPass123' }
      });
      assert.strictEqual(change.status, 200);
      const token = change.body.data.token;

      // Attempting to call an ops endpoint before enrolling TOTP gets TOTP_ENROLLMENT_REQUIRED
      const blocked = await api('/api/v1/ops/pending-payments', { token });
      assert.strictEqual(blocked.status, 403);
      assert.strictEqual(blocked.body.code, 'TOTP_ENROLLMENT_REQUIRED');
    });
  });
  it('a signed token of an account the server does not hold gets no rights, even if it says FLEET_DIRECTOR (D196)', async () => {
    const forged = signToken(
      { kind: 'staff', sub: 'mgr_not_in_db', username: 'ghost@busgo.vn', role: 'FLEET_DIRECTOR', permissions: ['ALL'], operator_id: 'op_saomai' },
      { prefix: TOKEN_PREFIXES.staff, ttlSeconds: 3600 }
    );
    const write = await api('/api/v1/ops/vouchers', { method: 'POST', token: forged, body: { code: 'GHOST10' } });
    assert.strictEqual(write.status, 401);
    const read = await api('/api/v1/ops/bookings', { token: forged });
    assert.strictEqual(read.status, 401);
  });

  it('role and company come from the stored account, not the token', async () => {
    // A real dispatcher account (op_saomai) whose token claims to be a director of another company.
    const dispatcher = MOCK_MANAGERS_DB.find(m => m.username === 'dispatcher@busgo.vn');
    const lying = signToken(
      { kind: 'staff', sub: dispatcher.user_id, role: 'FLEET_DIRECTOR', permissions: ['ALL'], operator_id: 'op_xuyenviet', tv: dispatcher.token_version || 0 },
      { prefix: TOKEN_PREFIXES.staff, ttlSeconds: 3600 }
    );
    const write = await api('/api/v1/ops/vouchers', { method: 'POST', token: lying, body: { code: 'LIAR10' } });
    assert.strictEqual(write.status, 403);
    const asPlatform = signToken(
      { kind: 'staff', sub: dispatcher.user_id, role: 'PLATFORM_ADMIN', operator_id: null, tv: dispatcher.token_version || 0 },
      { prefix: TOKEN_PREFIXES.staff, ttlSeconds: 3600 }
    );
    const platform = await api('/api/v1/platform/operators', { token: asPlatform });
    assert.strictEqual(platform.status, 403);
  });
});
