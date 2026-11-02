/**
 * PAX-022 profile (D186): the passenger changes their name and photo; the phone number stays the login.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { createFleetBusServer } from '../../source/server/apiServer.js';

const PHONE = '0901234569';
const JPEG = `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]).toString('base64')}`;

describe('Passenger profile (D186)', () => {
  let server;
  let services;
  let baseUrl;
  const request = async (path, { method = 'GET', body, token } = {}) => {
    const headers = { 'Content-Type': 'application/json', 'X-Operator-Code': 'SAOMAI' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${baseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  };
  const login = async () => {
    const otp = await request('/api/v1/auth/passenger/otp/request', { method: 'POST', body: { phone: PHONE } });
    return (await request('/api/v1/auth/passenger/otp/verify', { method: 'POST', body: { phone: PHONE, otp: otp.body.data.mock_otp } })).body.data;
  };

  before(async () => {
    ({ server, services } = createFleetBusServer());
    await new Promise(resolve => server.listen(0, resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });
  after(() => new Promise(resolve => server.close(resolve)));

  it('TC-PF-01: name and photo are saved, the phone is refused, and the next login keeps them', async () => {
    const { token } = await login();
    const patch = (body) => request('/api/v1/passenger/profile', { method: 'PATCH', token, body });

    assert.strictEqual((await request('/api/v1/passenger/profile', { method: 'PATCH', body: { full_name: 'Trần Bình' } })).status, 401);
    assert.strictEqual((await patch({ phone: '0987654321' })).body.code, 'PHONE_NOT_EDITABLE');
    assert.strictEqual((await patch({ full_name: 'A' })).status, 400);
    assert.strictEqual((await patch({ full_name: 'Bình <script>' })).status, 400);
    assert.strictEqual((await patch({ avatar: 'data:image/png;base64,AAAA' })).status, 400, 'bytes that are not a PNG');
    assert.strictEqual((await patch({ avatar: `data:image/jpeg;base64,${Buffer.alloc(300 * 1024, 0xff).toString('base64')}` })).status, 400, 'too big');

    const saved = await patch({ full_name: '  Trần   Thị Bình ', avatar: JPEG });
    assert.strictEqual(saved.status, 200, JSON.stringify(saved.body));
    assert.deepStrictEqual([saved.body.data.full_name, saved.body.data.avatar, saved.body.data.phone], ['Trần Thị Bình', JPEG, PHONE]);
    const read = (await request('/api/v1/passenger/profile', { token })).body.data;
    assert.strictEqual(read.full_name, 'Trần Thị Bình');
    assert.strictEqual(typeof read.wallet_balance_vnd, 'number');

    const again = await login();
    assert.strictEqual(again.user.full_name, 'Trần Thị Bình', 'a new login shows the chosen name');
    const removed = await request('/api/v1/passenger/profile', { method: 'PATCH', token: again.token, body: { avatar: null } });
    assert.strictEqual(removed.body.data.avatar, null);
    assert.strictEqual(removed.body.data.full_name, 'Trần Thị Bình');
  });

  it('TC-PF-02: deleting the account deletes the profile', async () => {
    const { token } = await login();
    assert.ok(services.authService.profiles.has(`op_saomai:${PHONE}`));
    const res = await request('/api/v1/passenger/me', { method: 'DELETE', token });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(services.authService.profiles.has(`op_saomai:${PHONE}`), false);
  });
});
