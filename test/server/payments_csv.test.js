import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { createFleetBusServer } from '../../source/server/apiServer.js';
import { generateTotp } from '../../source/server/core/totp.js';
import { DEV_TOTP_SECRET } from '../../source/server/config.js';

describe('MGR-025: money in and out as CSV for the accountant', () => {
  let server, services, base, directorToken, cashierToken;
  const login = async (username, password, totp) => (await (await fetch(`${base}/api/v1/auth/staff/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, ...(totp ? { totp } : {}) })
  })).json()).data.token;
  const csv = (token, query) => fetch(`${base}/api/v1/ops/reports/payments.csv?${query}`, { headers: { Authorization: `Bearer ${token}` } });

  before(async () => {
    ({ server, services } = createFleetBusServer({ webhookSecret: null }));
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
    directorToken = await login('admin@busgo.vn', 'admin123', generateTotp(DEV_TOTP_SECRET, Date.now()));
    cashierToken = await login('cashier@busgo.vn', 'cash123');
    const order = (id, operator_id, paid_at, name) => services.paymentService.orders.set(id, {
      order_id: id, pnr: `PNR${id}`, operator_id, paid_at, payment_status: 'PAID', payment_method: 'VIETQR_NAPAS247',
      payer: { full_name: name }, amount_vnd: 220000, payment_ref: `FT${id}`, route_name: 'Hà Nội — Thanh Hóa'
    });
    order('csv1', 'op_saomai', '2026-10-27T03:00:00.000Z', 'Nguyễn "Văn" A');
    order('csv2', 'op_saomai', '2026-10-20T03:00:00.000Z', 'Ngoài khoảng');
    order('csv3', 'op_xuyenviet', '2026-10-27T03:00:00.000Z', 'Nhà xe khác');
    services.managerService.refundRequests.push({
      refund_id: 'ref_csv', pnr: 'PNRcsv1', operator_id: 'op_saomai', status: 'REFUNDED', amount_vnd: 110000,
      processed_at: '2026-10-27T05:00:00.000Z', refund_account: { bank_name: 'Vietcombank', account_number: '0071001234567' }, reason: 'Khách hủy vé'
    });
  });
  after(() => server.close());

  it('lists the paid orders and paid refunds of the period, of this company only, for Excel', async () => {
    const res = await csv(directorToken, 'from=2026-10-27&to=2026-10-27');
    assert.strictEqual(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/csv/);
    const bytes = Buffer.from(await res.arrayBuffer());
    assert.deepStrictEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf], 'BOM so Excel reads UTF-8');
    const text = bytes.subarray(3).toString('utf8');
    const lines = text.trim().split('\r\n');
    assert.strictEqual(lines.length, 3, 'header, one payment, one refund');
    assert.match(lines[1], /THU,PNRcsv1,.*"Nguyễn ""Văn"" A",220000,FTcsv1/);
    assert.match(lines[2], /HOAN,PNRcsv1,.*,-110000,Vietcombank 0071001234567/);
    assert.ok(!text.includes('Nhà xe khác') && !text.includes('Ngoài khoảng'));
  });

  it('refuses a bad period and roles other than director and finance', async () => {
    assert.strictEqual((await csv(directorToken, 'from=2026-10-28&to=2026-10-01')).status, 400);
    assert.strictEqual((await csv(cashierToken, 'from=2026-10-27&to=2026-10-27')).status, 403);
  });
});
