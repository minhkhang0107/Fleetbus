/**
 * Reverse geocoding for the home pickup form (D187): a street address instead of coordinates, cached, Vietnam only.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { createFleetBusServer } from '../../source/server/apiServer.js';
import { createGeocoder, shortAddress } from '../../source/server/core/geocode.js';

describe('Reverse geocoding (D187)', () => {
  it('TC-GEO-01: street, ward and province, without a name repeated inside another', () => {
    assert.strictEqual(shortAddress({ address: { road: 'Ngách 1/34 Phố Phan Đình Giót', suburb: 'Phương Liệt', city_district: 'Phường Phương Liệt', city: 'Hà Nội', country: 'Việt Nam' } }), 'Ngách 1/34 Phố Phan Đình Giót, Phường Phương Liệt, Hà Nội');
    assert.strictEqual(shortAddress({ address: { house_number: '265', road: 'Đường Cầu Giấy', suburb: 'Dịch Vọng', city: 'Hà Nội' } }), '265 Đường Cầu Giấy, Dịch Vọng, Hà Nội');
    assert.strictEqual(shortAddress({ address: { road: 'Minh Khai', city: 'Phường Hạc Thành', state: 'Tỉnh Thanh Hóa' } }), 'Minh Khai, Phường Hạc Thành, Tỉnh Thanh Hóa');
    assert.strictEqual(shortAddress({}), null);
  });

  it('TC-GEO-02: one call per place, spaced a second apart, with a User-Agent', async () => {
    const calls = [];
    let clock = 0;
    const slept = [];
    const geocoder = createGeocoder({
      env: {},
      now: () => clock,
      sleep: async (ms) => { slept.push(ms); clock += ms; },
      fetchImpl: async (url, init) => {
        calls.push({ url, ua: init.headers['User-Agent'] });
        return { ok: true, json: async () => ({ address: { road: 'Phố A', city: 'Hà Nội' } }) };
      }
    });
    assert.strictEqual(await geocoder.reverse(21.0342, 105.7951), 'Phố A, Hà Nội');
    assert.strictEqual(await geocoder.reverse(21.03421, 105.79512), 'Phố A, Hà Nội', 'same 11 m cell: cached');
    await geocoder.reverse(20.99, 105.84);
    assert.strictEqual(calls.length, 2);
    assert.match(calls[0].url, /lat=21\.0342&lon=105\.7951/);
    assert.match(calls[0].ua, /^BusGo\//);
    assert.deepStrictEqual(slept, [1000], 'the second call waits for the gap');
  });

  describe('over HTTP', () => {
    let server;
    let baseUrl;
    let answer;
    before(async () => {
      const geocoder = { reverse: async () => { if (answer instanceof Error) throw answer; return answer; } };
      ({ server } = createFleetBusServer({ geocoder }));
      await new Promise(resolve => server.listen(0, resolve));
      baseUrl = `http://127.0.0.1:${server.address().port}`;
    });
    after(() => new Promise(resolve => server.close(resolve)));
    const get = async (q) => {
      const res = await fetch(`${baseUrl}/api/v1/geocode/reverse?${q}`, { headers: { 'X-Operator-Code': 'SAOMAI' } });
      return { status: res.status, body: await res.json() };
    };

    it('TC-GEO-03: answers without login, refuses points outside Vietnam, and says when it cannot tell', async () => {
      answer = '265 Đường Cầu Giấy, Dịch Vọng, Hà Nội';
      const ok = await get('lat=21.03419&lng=105.79505');
      assert.strictEqual(ok.status, 200, JSON.stringify(ok.body));
      assert.strictEqual(ok.body.data.address, answer);
      assert.strictEqual((await get('lat=48.85&lng=2.35')).status, 400);
      assert.strictEqual((await get('lat=abc&lng=1')).status, 400);
      answer = null;
      assert.strictEqual((await get('lat=21&lng=105.8')).body.code, 'ADDRESS_NOT_FOUND');
      answer = new Error('down');
      assert.strictEqual((await get('lat=21&lng=105.8')).status, 503);
    });
  });
});
