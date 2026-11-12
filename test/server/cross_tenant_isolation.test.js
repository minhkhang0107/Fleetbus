/**
 * Cross-tenant isolation (D198): the working data of every bus company shares memory, so each ops read must
 * filter by company. A director of Xuyên Việt calls every catalogued ops read (with Sao Mai's ids where the
 * path takes one) and must never see a Sao Mai trip, booking, vehicle, driver or staff member.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { createFleetBusServer } from '../../source/server/apiServer.js';
import { API_CATALOG } from '../../source/server/core/apiCatalog.js';
import { signToken, TOKEN_PREFIXES } from '../../source/server/core/tokens.js';
import { MOCK_MANAGERS_DB } from '../../source/server/services/manager/modules/managerService.js';
import { MOCK_DRIVERS_DB } from '../../source/server/services/driver/modules/driverService.js';

const SAOMAI = 'op_saomai';
const XV_DIRECTOR = {
  user_id: 'mgr_xv_dir_test',
  username: 'director-test@xuyenviet.vn',
  full_name: 'Giám đốc Xuyên Việt (test)',
  role: 'FLEET_DIRECTOR',
  permissions: ['ALL'],
  operator_id: 'op_xuyenviet',
  totp_required: true,
  totp_enrolled: true,
  active: true,
  token_version: 0
};

describe('Cross-tenant isolation of ops reads', () => {
  let server;
  let services;
  let baseUrl;
  let token;
  const markers = new Set();
  const ids = {};

  before(async () => {
    ({ server, services } = createFleetBusServer({ authMode: 'enforce' }));
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    MOCK_MANAGERS_DB.push(XV_DIRECTOR);
    token = signToken(
      { kind: 'staff', sub: XV_DIRECTOR.user_id, role: XV_DIRECTOR.role, operator_id: XV_DIRECTOR.operator_id, tv: 0 },
      { prefix: TOKEN_PREFIXES.staff, ttlSeconds: 3600 }
    );

    const m = services.managerService;
    const own = (x) => (x?.operator_id || SAOMAI) === SAOMAI;
    const trips = m.trips.filter(own);
    const bookings = m.bookings.filter(b => own(m.findTrip(b.trip_id)));
    for (const t of trips) markers.add(t.trip_id);
    for (const b of bookings) markers.add(b.pnr);
    for (const v of m.vehicles.filter(own)) markers.add(v.plate_number);
    for (const d of MOCK_DRIVERS_DB.filter(own)) markers.add(d.staff_id);
    for (const u of MOCK_MANAGERS_DB.filter(u => u.operator_id === SAOMAI)) markers.add(u.username);
    for (const r of m.refundRequests.filter(own)) markers.add(r.refund_id);
    ids.tripId = trips[0]?.trip_id;
    ids.bookingId = bookings[0]?.pnr;
    assert.ok(ids.tripId && ids.bookingId && markers.size > 5, 'Sao Mai has data to leak');
  });

  after(() => {
    const i = MOCK_MANAGERS_DB.indexOf(XV_DIRECTOR);
    if (i >= 0) MOCK_MANAGERS_DB.splice(i, 1);
    return new Promise(resolve => server.close(resolve));
  });

  it('no catalogued ops read returns Sao Mai data to Xuyên Việt', async () => {
    const reads = API_CATALOG.filter(e => e.method === 'GET' && e.path.startsWith('/api/v1/ops/'));
    assert.ok(reads.length > 20);
    const leaks = [];
    for (const entry of reads) {
      const path = entry.path.replace(/\{(\w+)\}/g, (_, name) => ids[name] ?? 'unknown');
      const res = await fetch(`${baseUrl}${path}`, { headers: { Authorization: `Bearer ${token}` } });
      const text = await res.text();
      const found = [...markers].filter(mk => text.includes(mk));
      if (found.length) leaks.push(`${path} (${res.status}): ${found.slice(0, 5).join(', ')}`);
    }
    assert.deepStrictEqual(leaks, []);
  });

  it('naming another company in the header is refused', async () => {
    const res = await fetch(`${baseUrl}/api/v1/ops/bookings`, { headers: { Authorization: `Bearer ${token}`, 'X-Operator-Code': 'SAOMAI' } });
    assert.strictEqual(res.status, 403);
  });
});
