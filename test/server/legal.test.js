import test from 'node:test';
import assert from 'node:assert';
import { createFleetBusServer } from '../../source/server/apiServer.js';
import { resolveAccess } from '../../source/server/core/gateway.js';
import { LEGAL_VERSION, legalContent } from '../../source/server/core/legal.js';

// SH-006 / D157: the about and legal texts come from the server, one per app.
test('Legal texts', async (t) => {
  const { server } = createFleetBusServer({ authMode: 'enforce' });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(() => new Promise(resolve => server.close(resolve)));

  await t.test('each app gets its own terms with the shared closing sections, without login or bus company', async () => {
    const seen = {};
    for (const app of ['passenger', 'driver', 'manager']) {
      const res = await fetch(`${base}/api/v1/legal?app=${app}`);
      assert.strictEqual(res.status, 200, app);
      const data = (await res.json()).data;
      assert.strictEqual(data.app, app);
      assert.strictEqual(data.version, LEGAL_VERSION);
      assert.match(data.effective_date, /^\d{4}-\d{2}-\d{2}$/);
      assert.strictEqual(data.terms.title, 'Điều khoản sử dụng');
      const headings = data.terms.sections.map(s => s.heading);
      assert.ok(headings.includes('Thay đổi điều khoản') && headings.includes('Luật áp dụng'), app);
      for (const s of [...data.terms.sections, ...data.model_notice.sections]) {
        assert.ok(s.heading && s.body, `${app}: every section has a heading and a body`);
        assert.ok(!('apps' in s), `${app}: the audience filter stays on the server`);
      }
      seen[app] = headings;
    }
    assert.ok(seen.passenger.includes('Hủy vé và hoàn tiền'));
    assert.ok(seen.driver.includes('Vị trí trong ca'));
    assert.ok(seen.manager.includes('Quyền và nhật ký'));
  });

  await t.test('the model notice says no AI model is used and credits the map data; fonts and push only where they ship', () => {
    const headings = (app) => legalContent(app).model_notice.sections.map(s => s.heading);
    for (const app of ['passenger', 'driver', 'manager']) {
      assert.match(legalContent(app).model_notice.sections[0].body, /không tích hợp, không gọi/);
      assert.ok(headings(app).includes('Dữ liệu bản đồ'));
    }
    assert.ok(headings('passenger').includes('Phông chữ') && headings('driver').includes('Phông chữ'));
    assert.ok(!headings('manager').includes('Phông chữ'), 'the web page uses system fonts');
    assert.ok(headings('passenger').includes('Dịch vụ bên thứ ba'));
    assert.ok(!headings('driver').includes('Dịch vụ bên thứ ba'));
  });

  await t.test('a missing or unknown app is refused', async () => {
    for (const q of ['', '?app=admin']) {
      const res = await fetch(`${base}/api/v1/legal${q}`);
      assert.strictEqual(res.status, 400);
      assert.strictEqual((await res.json()).code, 'INVALID_APP');
    }
  });

  await t.test('the gateway treats it as public', () => {
    assert.strictEqual(resolveAccess('GET', '/api/v1/legal').kind, 'public');
  });
});
