import test from 'node:test';
import assert from 'node:assert';
import { createFleetBusServer } from '../../source/server/apiServer.js';
import { LEGAL_APPS, legalContent, PRIVACY_CONTACT_EMAIL } from '../../source/server/core/legal.js';
import { OPERATORS } from '../../source/server/core/operators.js';

test('Legal and account deletion HTML pages', async (t) => {
  const { server } = createFleetBusServer({ authMode: 'enforce' });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(() => new Promise(resolve => server.close(resolve)));

  await t.test('each app terms and privacy page is 200 HTML containing its title and every section heading', async () => {
    for (const app of LEGAL_APPS) {
      const content = legalContent(app);
      for (const doc of ['terms', 'privacy']) {
        const res = await fetch(`${base}/legal/${app}/${doc}`);
        assert.strictEqual(res.status, 200, `${app}/${doc} should be 200`);
        assert.match(res.headers.get('content-type') || '', /text\/html/, `${app}/${doc} content-type`);
        assert.strictEqual(res.headers.get('cache-control'), 'public, max-age=300');
        assert.ok(res.headers.get('content-security-policy'), 'has CSP header');

        const html = await res.text();
        const docData = content[doc];
        assert.ok(html.includes(docData.title), `${app}/${doc} contains document title "${docData.title}"`);
        assert.ok(html.includes(content.version), `${app}/${doc} contains version`);
        assert.match(html, /Phiên bản \d+\.\d+ · hiệu lực từ \d{2}\/\d{2}\/\d{4}/, `${app}/${doc} contains formatted version and date`);

        for (const section of docData.sections) {
          assert.ok(html.includes(section.heading), `${app}/${doc} contains section heading "${section.heading}"`);
        }

        const otherDoc = doc === 'terms' ? 'privacy' : 'terms';
        assert.ok(html.includes(`/legal/${app}/${otherDoc}`), `${app}/${doc} contains link to ${otherDoc}`);

        if (app === 'passenger') {
          assert.ok(html.includes('/xoa-tai-khoan'), 'passenger page links to account deletion');
        } else {
          assert.ok(!html.includes('/xoa-tai-khoan'), `${app} page does not link to account deletion`);
        }

        // Test HEAD request
        const headRes = await fetch(`${base}/legal/${app}/${doc}`, { method: 'HEAD' });
        assert.strictEqual(headRes.status, 200);
        assert.match(headRes.headers.get('content-type') || '', /text\/html/);
        assert.strictEqual(await headRes.text(), '');
      }
    }
  });

  await t.test('unknown app or doc returns 404 HTML', async () => {
    const invalidPaths = [
      '/legal/unknown_app/terms',
      '/legal/passenger/unknown_doc',
      '/legal/foo',
      '/legal'
    ];
    for (const p of invalidPaths) {
      const res = await fetch(`${base}${p}`);
      assert.strictEqual(res.status, 404, `${p} should be 404`);
      assert.match(res.headers.get('content-type') || '', /text\/html/, `${p} should return HTML 404`);
      const html = await res.text();
      assert.ok(html.includes('404'), `${p} HTML contains 404`);
    }
  });

  await t.test('deletion page 200, lists active companies, contains no OTP and has no-store', async () => {
    const res = await fetch(`${base}/xoa-tai-khoan`);
    assert.strictEqual(res.status, 200);
    assert.match(res.headers.get('content-type') || '', /text\/html/);
    assert.strictEqual(res.headers.get('cache-control'), 'no-store');
    assert.ok(res.headers.get('content-security-policy'));

    const html = await res.text();
    const activeCompanies = OPERATORS.filter(op => op.active !== false);
    for (const op of activeCompanies) {
      assert.ok(html.includes(op.code), `deletion page lists active company code ${op.code}`);
      assert.ok(html.includes(op.name), `deletion page lists active company name ${op.name}`);
    }

    assert.ok(!html.includes('mock_otp'), 'page must not contain mock_otp');
    assert.ok(html.includes(PRIVACY_CONTACT_EMAIL), 'page includes privacy contact email');
    assert.ok(html.includes('Cá nhân &gt; Xóa tài khoản') || html.includes('Cá nhân > Xóa tài khoản'), 'explains how to delete in app');
    assert.ok(html.includes('ẩn danh'), 'explains data kept anonymised');
    assert.ok(html.includes('XÓA'), 'requires typing XÓA');

    // Test HEAD request
    const headRes = await fetch(`${base}/xoa-tai-khoan`, { method: 'HEAD' });
    assert.strictEqual(headRes.status, 200);
    assert.match(headRes.headers.get('content-type') || '', /text\/html/);
    assert.strictEqual(await headRes.text(), '');
  });

  await t.test('/api/v1/legal?app=passenger has privacy.sections and the three urls; driver has urls.account_deletion === null', async () => {
    const paxRes = await fetch(`${base}/api/v1/legal?app=passenger`);
    assert.strictEqual(paxRes.status, 200);
    const paxData = (await paxRes.json()).data;
    assert.ok(Array.isArray(paxData.privacy.sections) && paxData.privacy.sections.length > 0);
    assert.ok(paxData.urls, 'passenger has urls');
    assert.strictEqual(typeof paxData.urls.terms, 'string');
    assert.strictEqual(typeof paxData.urls.privacy, 'string');
    assert.strictEqual(typeof paxData.urls.account_deletion, 'string');
    assert.ok(paxData.urls.terms.endsWith('/legal/passenger/terms'));
    assert.ok(paxData.urls.privacy.endsWith('/legal/passenger/privacy'));
    assert.ok(paxData.urls.account_deletion.endsWith('/xoa-tai-khoan'));

    const drvRes = await fetch(`${base}/api/v1/legal?app=driver`);
    assert.strictEqual(drvRes.status, 200);
    const drvData = (await drvRes.json()).data;
    assert.ok(drvData.urls, 'driver has urls');
    assert.strictEqual(drvData.urls.account_deletion, null);
    assert.ok(drvData.urls.terms.endsWith('/legal/driver/terms'));
    assert.ok(drvData.urls.privacy.endsWith('/legal/driver/privacy'));

    const mgrRes = await fetch(`${base}/api/v1/legal?app=manager`);
    assert.strictEqual(mgrRes.status, 200);
    const mgrData = (await mgrRes.json()).data;
    assert.ok(mgrData.urls, 'manager has urls');
    assert.strictEqual(mgrData.urls.account_deletion, null);
  });

  await t.test('end-to-end check that the deletion flow the page uses works: request OTP, verify, DELETE with token -> 200', async () => {
    const phone = '0988665544';
    const opCode = 'SAOMAI';

    // 1. Request OTP
    const reqOtpRes = await fetch(`${base}/api/v1/auth/passenger/otp/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Operator-Code': opCode },
      body: JSON.stringify({ phone })
    });
    assert.strictEqual(reqOtpRes.status, 200);
    const reqOtpBody = await reqOtpRes.json();
    assert.strictEqual(reqOtpBody.status, 'success');
    const mockOtp = reqOtpBody.data.mock_otp;
    assert.ok(mockOtp, 'received mock OTP');

    // 2. Verify OTP
    const verOtpRes = await fetch(`${base}/api/v1/auth/passenger/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Operator-Code': opCode },
      body: JSON.stringify({ phone, otp: mockOtp })
    });
    assert.strictEqual(verOtpRes.status, 200);
    const verOtpBody = await verOtpRes.json();
    assert.strictEqual(verOtpBody.status, 'success');
    const token = verOtpBody.data.token;
    assert.ok(token, 'received session token');

    // 3. DELETE /api/v1/passenger/me
    const delRes = await fetch(`${base}/api/v1/passenger/me`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-Operator-Code': opCode
      }
    });
    assert.strictEqual(delRes.status, 200);
    const delBody = await delRes.json();
    assert.strictEqual(delBody.status, 'success');
    assert.strictEqual(delBody.data.deleted, true);

    // 4. Verification that token is now revoked
    const profileRes = await fetch(`${base}/api/v1/passenger/profile`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-Operator-Code': opCode
      }
    });
    assert.strictEqual(profileRes.status, 401);
  });
});
