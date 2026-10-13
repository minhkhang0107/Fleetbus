import { describe, it } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { FcmSender, Messenger } from '../../source/server/core/messaging.js';

/** D145: push goes straight to Firebase Cloud Messaging with the project's service account key. */
describe('Push through Firebase Cloud Messaging (D145)', () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const account = {
    project_id: 'busgo-test',
    client_email: 'fcm@busgo-test.iam.gserviceaccount.com',
    private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    token_uri: 'https://oauth2.googleapis.com/token'
  };

  it('TC-FCM-01: signs a JWT the service account can be checked with, reuses the access token, sends to the device', async () => {
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push({ url, init });
      if (url === account.token_uri) {
        const assertion = new URLSearchParams(init.body).get('assertion');
        const [h, c, sig] = assertion.split('.');
        assert.ok(crypto.createVerify('RSA-SHA256').update(`${h}.${c}`).verify(publicKey, Buffer.from(sig, 'base64url')), 'signed with the account key');
        const claims = JSON.parse(Buffer.from(c, 'base64url').toString());
        assert.strictEqual(claims.iss, account.client_email);
        assert.strictEqual(claims.scope, 'https://www.googleapis.com/auth/firebase.messaging');
        return { ok: true, status: 200, json: async () => ({ access_token: 'ya29.test', expires_in: 3600 }) };
      }
      return { ok: true, status: 200, json: async () => ({ name: 'projects/busgo-test/messages/1' }) };
    };
    const fcm = new FcmSender(account, fetchImpl);
    const m = new Messenger({ env: {}, fetchImpl, fcm });
    m.registerDevice('0901000008', { token: 'device-token-1', platform: 'android', operatorId: 'op_saomai' });
    const a = m.dispatch({ operatorId: 'op_saomai', phone: '0901000008', title: 'Xe sắp tới đón bạn', body: 'còn 8 phút', type: 'PICKUP_APPROACHING', link: 'http://x/t/abc' });
    await new Promise(r => setTimeout(r, 20));
    const b = m.dispatch({ operatorId: 'op_saomai', phone: '0901000008', title: 'Xe đang chờ bạn', body: 'tối đa 5 phút', type: 'HOME_PICKUP_DOOR' });
    await new Promise(r => setTimeout(r, 20));
    assert.deepStrictEqual([a.channel, a.status, b.channel, b.status], ['PUSH', 'SENT', 'PUSH', 'SENT']);
    assert.strictEqual(calls.filter(c => c.url === account.token_uri).length, 1, 'one access token for both');
    const sends = calls.filter(c => c.url.includes('/messages:send'));
    assert.strictEqual(sends[0].url, 'https://fcm.googleapis.com/v1/projects/busgo-test/messages:send');
    assert.strictEqual(sends[0].init.headers.Authorization, 'Bearer ya29.test');
    const msg = JSON.parse(sends[0].init.body).message;
    assert.deepStrictEqual([msg.token, msg.notification.title, msg.data.link], ['device-token-1', 'Xe sắp tới đón bạn', 'http://x/t/abc']);
    // A phone without a push token still gets the SMS.
    const sms = m.dispatch({ operatorId: 'op_saomai', phone: '0901000009', title: 'Xe sắp tới đón bạn', body: 'còn 8 phút', type: 'PICKUP_APPROACHING' });
    assert.strictEqual(sms.channel, 'SMS');
  });

  it('TC-FCM-02: a refused send is marked FAILED, the message stays in the outbox', async () => {
    const fetchImpl = async (url) => (url === account.token_uri
      ? { ok: true, status: 200, json: async () => ({ access_token: 't', expires_in: 3600 }) }
      : { ok: false, status: 404, json: async () => ({}) });
    const m = new Messenger({ env: {}, fetchImpl, fcm: new FcmSender(account, fetchImpl) });
    m.registerDevice('0901000008', { token: 'gone', platform: 'android', operatorId: 'op_saomai' });
    const e = m.dispatch({ operatorId: 'op_saomai', phone: '0901000008', title: 't', body: 'b', type: 'PICKUP_APPROACHING' });
    await new Promise(r => setTimeout(r, 20));
    assert.deepStrictEqual([e.status, e.error], ['FAILED', 'HTTP 404']);
  });
});
