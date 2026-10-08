/**
 * Design review (2026-10-07): an unpaid COD ticket boards only through the COD collection (DRI-007, DRI-010, DRI-012).
 * Before this, "Cho lên xe" or a QR scan boarded the passenger and the fare was never collected.
 */
import { describe, it } from 'node:test';
import http from 'node:http';
import assert from 'node:assert';
import { createFleetBusServer } from '../../source/server/apiServer.js';
import { getTicketSecret } from '../../source/server/config.js';
import { generateBoardingQR } from '../../source/server/services/passenger/core/cryptoEngine.js';

const TRIP = 'trp_991823';
const COD_TICKET = 'tkt_88219_A02';

describe('COD boarding gate (DRI-010, DRI-012)', () => {
  it('TC-DSG-01: manual boarding of an unpaid COD ticket is refused and the passenger stays waiting', () => {
    const { services } = createFleetBusServer();
    const driver = services.driverService;
    const res = driver.boardPassengerManually(TRIP, { ticketId: COD_TICKET });
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.code, 'COD_PAYMENT_REQUIRED');
    assert.strictEqual(res.cod_amount_vnd, 220000);
    const item = driver.activeTrips.get(TRIP).manifest.find((m) => m.ticket_id === COD_TICKET);
    assert.notStrictEqual(item.boarding_status, 'BOARDED');
  });

  it('TC-DSG-02: a QR scan of an unpaid COD ticket is refused', () => {
    const { services } = createFleetBusServer();
    const driver = services.driverService;
    const item = driver.activeTrips.get(TRIP).manifest.find((m) => m.ticket_id === COD_TICKET);
    const qr = generateBoardingQR({ pnr: item.pnr, ticket_id: item.ticket_id, seat_code: item.seat_code, trip_id: TRIP }, getTicketSecret(), Date.now()).qr_code_value;
    const res = driver.boardPassengerByQR(TRIP, qr);
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.code, 'COD_PAYMENT_REQUIRED');
    assert.notStrictEqual(item.boarding_status, 'BOARDED');
  });

  it('TC-DSG-03: collecting the COD fare boards the passenger in one step', () => {
    const { services } = createFleetBusServer();
    const driver = services.driverService;
    const res = driver.collectCod(TRIP, COD_TICKET, { amount_collected_vnd: 220000, change_settlement_method: 'CASH_RETURNED' });
    assert.strictEqual(res.success, true, JSON.stringify(res));
    const item = driver.activeTrips.get(TRIP).manifest.find((m) => m.ticket_id === COD_TICKET);
    assert.strictEqual(item.boarding_status, 'BOARDED');
    const again = driver.boardPassengerManually(TRIP, { ticketId: COD_TICKET });
    assert.strictEqual(again.code, 'ALREADY_BOARDED');
  });

  it('TC-DSG-04: the manual boarding API answers 409 with the fare to collect', async () => {
    const { server } = createFleetBusServer({ authMode: 'off' });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    try {
      const body = JSON.stringify({ ticket_id: COD_TICKET });
      const res = await new Promise((resolve, reject) => {
        const req = http.request(`http://127.0.0.1:${server.address().port}/api/v1/driver/trips/${TRIP}/boarding/manual`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }
        }, (r) => { let raw = ''; r.on('data', (c) => { raw += c; }); r.on('end', () => resolve({ status: r.statusCode, body: JSON.parse(raw) })); });
        req.on('error', reject);
        req.end(body);
      });
      assert.strictEqual(res.status, 409);
      assert.strictEqual(res.body.code, 'COD_PAYMENT_REQUIRED');
      assert.strictEqual(res.body.details.cod_amount_vnd, 220000);
    } finally {
      await new Promise((r) => server.close(r));
    }
  });
});
