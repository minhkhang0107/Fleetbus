import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { createFleetBusServer } from '../../source/server/apiServer.js';
import { addDays, vnDate } from '../../source/server/core/serviceDate.js';

import { signToken, TOKEN_PREFIXES } from '../../source/server/core/tokens.js';

describe('E2E Findings: F9, F10, F12, F19', () => {
  let server;
  let services;
  let baseUrl;
  let dispatcherToken;
  let cashierToken;
  let controllerToken;
  const day = addDays(vnDate(Date.now()), 2);
  const tripId = `trp_hn_th_01_${day.replaceAll('-', '')}`;

  const request = async (path, { method = 'GET', body, token, operatorCode = 'SAOMAI' } = {}) => {
    const headers = { 'Content-Type': 'application/json', 'X-Operator-Code': operatorCode };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (method === 'POST') headers['Idempotency-Key'] = crypto.randomUUID();
    const res = await fetch(`${baseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  };

  before(async () => {
    ({ server, services } = createFleetBusServer());
    await new Promise(resolve => server.listen(0, resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    dispatcherToken = (await request('/api/v1/ops/auth/login', { method: 'POST', body: { username: 'dispatcher@busgo.vn', password: 'disp123' } })).body.data.token;
    cashierToken = (await request('/api/v1/ops/auth/login', { method: 'POST', body: { username: 'cashier@busgo.vn', password: 'cash123' } })).body.data.token;
    controllerToken = signToken({ sub: 'mgr_ctrl', role: 'FINANCIAL_CONTROLLER', operator_id: 'op_saomai', kind: 'staff' }, { prefix: TOKEN_PREFIXES.staff, ttlSeconds: 3600 });
  });

  after(() => new Promise(resolve => server.close(resolve)));

  describe('F12: Decision D151 Licence Rules', () => {
    it('refuses class D driver on 34-berth bus (capacity 35), accepts class E, refuses expired licence', async () => {
      // Add a test driver with licence class D
      services.managerService.drivers.push({
        driver_id: 'drv_class_d_test',
        staff_id: 'TX8899',
        full_name: 'Nguyễn Văn Đ',
        phone: '0912998877',
        license_class: 'D',
        license_expiry: '2028-12-31',
        safety_score: 95.0,
        status: 'ACTIVE',
        operator_id: 'op_saomai'
      });

      // 1. D driver assigned to veh_01 (34 passenger berths + 1 driver = 35 capacity) -> refused
      const resD = await request(`/api/v1/ops/trips/${tripId}/assign`, {
        method: 'POST',
        token: dispatcherToken,
        body: { vehicleId: 'veh_01', driverId: 'drv_class_d_test' }
      });
      assert.strictEqual(resD.status, 409);
      assert.strictEqual(resD.body.code, 'DRIVER_LICENSE_INVALID');
      assert.match(resD.body.message, /Bằng D chỉ lái xe tối đa 30 chỗ; xe 29B-123\.45 có 35 chỗ \(gồm lái\)/);

      // 2. E driver assigned to veh_01 -> accepted
      const resE = await request(`/api/v1/ops/trips/${tripId}/assign`, {
        method: 'POST',
        token: dispatcherToken,
        body: { vehicleId: 'veh_01', driverId: 'drv_8821a' }
      });
      assert.strictEqual(resE.status, 200, JSON.stringify(resE.body));
      assert.strictEqual(resE.body.data.driver_name, 'Trần Văn Bình');

      // 3. Expired licence driver (drv_9902b, expiry 2025-01-01) -> refused
      const resExp = await request(`/api/v1/ops/trips/${tripId}/assign`, {
        method: 'POST',
        token: dispatcherToken,
        body: { vehicleId: 'veh_01', driverId: 'drv_9902b' }
      });
      assert.strictEqual(resExp.status, 409);
      assert.strictEqual(resExp.body.code, 'DRIVER_UNAVAILABLE');
      assert.match(resExp.body.message, /Bằng lái hết hạn vào ngày chạy/);

      // 4. Check getAssignOptions includes capacity for vehicles and license_class for drivers
      const optsRes = await request(`/api/v1/ops/trips/${tripId}/assign-options`, { token: dispatcherToken });
      assert.strictEqual(optsRes.status, 200);
      const veh01 = optsRes.body.data.vehicles.find(v => v.vehicle_id === 'veh_01');
      assert.strictEqual(veh01.capacity, 35);
      const drvD = optsRes.body.data.drivers.find(d => d.driver_id === 'drv_class_d_test');
      assert.strictEqual(drvD.license_class, 'D');
      assert.strictEqual(drvD.max_capacity, 30);
    });
  });

  describe('F9: Hotline hold GET and Cancel', () => {
    let createdRsv;

    it('cashier creates a hotline hold, sees it in GET /hotline-holds, and cancels it', async () => {
      // 1. Cashier creates hotline hold
      const holdRes = await request('/api/v1/ops/pos/hotline-hold', {
        method: 'POST',
        token: cashierToken,
        body: {
          tripId,
          passengerName: 'Trịnh Thị Thu',
          phone: '0987654321',
          seatCodes: ['A03'],
          pickupStopId: 'stp_hn_gb',
          dropoffStopId: 'stp_th_pb'
        }
      });
      assert.strictEqual(holdRes.status, 201, JSON.stringify(holdRes.body));
      createdRsv = holdRes.body.data;
      assert.strictEqual(createdRsv.hold_status, 'HELD_HOTLINE');
      assert.ok(createdRsv.total_fare_vnd > 0);

      // 2. Cashier queries GET /api/v1/ops/trips/:tripId/hotline-holds
      const listRes = await request(`/api/v1/ops/trips/${tripId}/hotline-holds`, { token: cashierToken });
      assert.strictEqual(listRes.status, 200);
      assert.strictEqual(listRes.body.data.trip_id, tripId);
      const item = listRes.body.data.holds.find(h => h.reservation_id === createdRsv.reservation_id);
      assert.ok(item, 'Hold must appear in hotline-holds list');
      assert.strictEqual(item.pnr, createdRsv.pnr);
      assert.strictEqual(item.name, 'Trịnh Thị Thu');
      assert.strictEqual(item.phone, '098***321');
      assert.deepStrictEqual(item.seats, ['A03']);
      assert.strictEqual(item.total_fare_vnd, createdRsv.total_fare_vnd);
      assert.strictEqual(item.pickup_stop_name, 'Bến xe Giáp Bát');
      assert.ok(item.hold_until);
      assert.strictEqual(item.status, 'HELD_HOTLINE');

      // 3. Unauthorized role (financial controller) gets 403
      const ctrlRes = await request(`/api/v1/ops/trips/${tripId}/hotline-holds`, { token: controllerToken });
      assert.strictEqual(ctrlRes.status, 403);

      // 4. Cancel hotline hold
      const cancelRes = await request(`/api/v1/ops/pos/hotline-holds/${createdRsv.reservation_id}/cancel`, {
        method: 'POST',
        token: cashierToken
      });
      assert.strictEqual(cancelRes.status, 200, JSON.stringify(cancelRes.body));
      assert.strictEqual(cancelRes.body.data.hold_status, 'CANCELLED_BY_STAFF');

      // 5. Seats are unlocked in inventory
      const invRes = await request(`/api/v1/ops/trips/${tripId}/seat-inventory`, { token: cashierToken });
      assert.strictEqual(invRes.status, 200);
      const seat = invRes.body.data.seats.find(s => s.seat_code === 'A03');
      assert.strictEqual(seat.state, 'AVAILABLE');

      // 6. Audit log entry recorded
      const cancelAudit = services.managerService.auditLog.find(a => a.action === 'HOTLINE_HOLD_CANCELLED' && a.after.reservation_id === createdRsv.reservation_id);
      assert.ok(cancelAudit);
      assert.strictEqual(cancelAudit.after.hold_status, 'CANCELLED_BY_STAFF');
    });
  });

  describe('F10: Cashier role access restrictions', () => {
    it('refuses cashier for /delay, /cancel, /sales with 403, but allows dispatcher', async () => {
      // Cashier is refused
      const delayRes = await request(`/api/v1/ops/trips/${tripId}/delay`, {
        method: 'POST',
        token: cashierToken,
        body: { delayMinutes: 15, reason: 'Kẹt xe' }
      });
      assert.strictEqual(delayRes.status, 403);

      const salesRes = await request(`/api/v1/ops/trips/${tripId}/sales`, {
        method: 'POST',
        token: cashierToken,
        body: { open: false }
      });
      assert.strictEqual(salesRes.status, 403);

      const cancelRes = await request(`/api/v1/ops/trips/${tripId}/cancel`, {
        method: 'POST',
        token: cashierToken,
        body: { reason: 'Sự cố xe' }
      });
      assert.strictEqual(cancelRes.status, 403);

      // Dispatcher is allowed
      const dispDelay = await request(`/api/v1/ops/trips/${tripId}/delay`, {
        method: 'POST',
        token: dispatcherToken,
        body: { delayMinutes: 20, reason: 'Đường ngập nước' }
      });
      assert.strictEqual(dispDelay.status, 200);
      assert.strictEqual(dispDelay.body.data.delay_minutes, 20);
    });
  });

  describe('F19: Driver trip end audit log and stop names', () => {
    it('records TRIP_COMPLETE audit entry when driver completes trip', () => {
      const drvTripId = 'trp_hn_th_01';
      const drvTrip = services.driverService.activeTrips.get(drvTripId);
      assert.ok(drvTrip);
      drvTrip.status = 'IN_TRANSIT';
      const lastStop = drvTrip.stops[drvTrip.stops.length - 1];
      lastStop.status = 'ARRIVED';
      drvTrip.total_cod_collected_vnd = 200000;
      drvTrip.total_hail_collected_vnd = 100000;

      const endResult = services.driverService.endTrip(drvTripId);
      assert.strictEqual(endResult.success, true);

      const auditEntry = services.managerService.auditLog.find(a => a.action === 'TRIP_COMPLETE' && a.resource === drvTripId);
      assert.ok(auditEntry, 'TRIP_COMPLETE entry must be present in audit log');
      assert.strictEqual(auditEntry.role, 'DRIVER');
      assert.strictEqual(auditEntry.after.cash_handed_in_vnd, 300000);
      assert.strictEqual(auditEntry.after.cash_handed_in, undefined);
    });

    it('provides stop_name in trip operations event log', () => {
      const drvTripId = 'trp_991823';
      const drvTrip = services.driverService.activeTrips.get(drvTripId);
      assert.ok(drvTrip);
      drvTrip.status = 'IN_TRANSIT';
      services.driverService.arriveAtStop(drvTripId, 'stp_hn_gb');
      const ops = services.driverService.getTripOperations(drvTripId);
      assert.strictEqual(ops.success, true);
      const eventsWithStop = ops.data.events.filter(e => e.stop_id);
      assert.ok(eventsWithStop.length > 0, 'Must have events with stop_id');
      assert.ok(eventsWithStop.every(e => typeof e.stop_name === 'string' && e.stop_name.length > 0), 'Every stop event must have stop_name');
      const gbEvent = eventsWithStop.find(e => e.stop_id === 'stp_hn_gb');
      assert.strictEqual(gbEvent.stop_name, 'Bến xe Giáp Bát');
    });
  });
});
