import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { createFleetBusServer } from '../../source/server/apiServer.js';

describe('Trip start and end rules', () => {
  let server;
  let services;
  let baseUrl;
  let driverToken;
  let saomaiOps;
  let xvOps;

  const request = async (path, { method = 'GET', body, token, code = 'SAOMAI' } = {}) => {
    const headers = { 'Content-Type': 'application/json', 'X-Operator-Code': code };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (method === 'POST') headers['Idempotency-Key'] = crypto.randomUUID();
    const res = await fetch(`${baseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  };

  before(async () => {
    ({ server, services } = createFleetBusServer());
    await new Promise(resolve => server.listen(0, resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    driverToken = (await request('/api/v1/driver/auth/login', { method: 'POST', body: { staff_id: 'TX8821', pin: '123456' } })).body.data.token;
    saomaiOps = (await request('/api/v1/ops/auth/login', { method: 'POST', body: { username: 'dispatcher@busgo.vn', password: 'disp123' } })).body.data.token;
    xvOps = (await request('/api/v1/ops/auth/login', { method: 'POST', code: 'XUYENVIET', body: { username: 'dispatcher@xuyenviet.vn', password: 'xv123' } })).body.data.token;
  });

  after(() => new Promise(resolve => server.close(resolve)));

  it('1. too early refused / allowed 60 min before', async () => {
    const tripId = 'trp_test_early_check';
    const departureTime = '2026-10-15T07:00:00+07:00';
    const depMs = Date.parse(departureTime);

    services.driverService.activeTrips.set(tripId, {
      trip_id: tripId,
      operator_id: 'op_saomai',
      driver_id: 'drv_test_early',
      vehicle_plate: '29B-777.01',
      route_name: 'Hà Nội — Thanh Hóa',
      planned_departure_time: departureTime,
      status: 'READY',
      manifest: [],
      debts: [],
      stops: [
        { stop_id: 's1', name: 'Bến 1', status: 'PENDING' },
        { stop_id: 's2', name: 'Bến 2', status: 'PENDING' }
      ]
    });

    // 61 minutes before departure -> refused with TRIP_TOO_EARLY
    const tooEarlyNow = depMs - 61 * 60 * 1000;
    const resTooEarly = services.driverService.startTrip(tripId, { now: tooEarlyNow });
    assert.strictEqual(resTooEarly.success, false);
    assert.strictEqual(resTooEarly.code, 'TRIP_TOO_EARLY');
    assert.strictEqual(resTooEarly.error, 'Chưa tới giờ chạy. Chuyến 07:00 ngày 15/10, bắt đầu được từ 06:00.');

    // Exactly 60 minutes before departure -> allowed
    const exact60Now = depMs - 60 * 60 * 1000;
    const resAllowed = services.driverService.startTrip(tripId, { now: exact60Now });
    assert.strictEqual(resAllowed.success, true);
    assert.strictEqual(services.driverService.activeTrips.get(tripId).status, 'IN_TRANSIT');

    // Clean up
    services.driverService.activeTrips.delete(tripId);
  });

  it('2. demo-day trip exempt outside production', async () => {
    const tripId = 'trp_test_demo_exempt';
    const departureTime = '2026-08-28T07:00:00+07:00';

    services.driverService.activeTrips.set(tripId, {
      trip_id: tripId,
      operator_id: 'op_saomai',
      driver_id: 'drv_test_demo',
      vehicle_plate: '29B-777.02',
      route_name: 'Hà Nội — Thanh Hóa',
      planned_departure_time: departureTime,
      status: 'READY',
      manifest: [],
      debts: [],
      stops: [
        { stop_id: 's1', name: 'Bến 1', status: 'PENDING' },
        { stop_id: 's2', name: 'Bến 2', status: 'PENDING' }
      ]
    });

    // Simulated clock 24 hours earlier
    const dayBeforeNow = Date.parse('2026-08-27T07:00:00+07:00');
    const res = services.driverService.startTrip(tripId, { now: dayBeforeNow });
    assert.strictEqual(res.success, true);
    assert.strictEqual(services.driverService.activeTrips.get(tripId).status, 'IN_TRANSIT');

    // Clean up
    services.driverService.activeTrips.delete(tripId);
  });

  it('3. OTHER_TRIP_RUNNING for same driver and same plate', async () => {
    const runningTripId = 'trp_test_running_base';
    services.driverService.activeTrips.set(runningTripId, {
      trip_id: runningTripId,
      operator_id: 'op_saomai',
      driver_id: 'drv_shared_driver',
      vehicle_plate: '29B-888.88',
      route_name: 'Hà Nội — Thanh Hóa',
      planned_departure_time: '2026-08-28T07:00:00+07:00',
      status: 'IN_TRANSIT',
      manifest: [],
      debts: [],
      stops: [
        { stop_id: 's1', name: 'Bến 1', status: 'PENDING' },
        { stop_id: 's2', name: 'Bến 2', status: 'PENDING' }
      ]
    });

    // 3a. Same driver, different vehicle plate
    const sameDriverTripId = 'trp_test_same_driver';
    services.driverService.activeTrips.set(sameDriverTripId, {
      trip_id: sameDriverTripId,
      operator_id: 'op_saomai',
      driver_id: 'drv_shared_driver',
      vehicle_plate: '29B-111.11',
      route_name: 'Hà Nội — Thanh Hóa',
      planned_departure_time: '2026-08-28T14:00:00+07:00',
      status: 'READY',
      manifest: [],
      debts: [],
      stops: [
        { stop_id: 's1', name: 'Bến 1', status: 'PENDING' },
        { stop_id: 's2', name: 'Bến 2', status: 'PENDING' }
      ]
    });

    const resSameDriver = services.driverService.startTrip(sameDriverTripId);
    assert.strictEqual(resSameDriver.success, false);
    assert.strictEqual(resSameDriver.code, 'OTHER_TRIP_RUNNING');
    assert.strictEqual(resSameDriver.error, 'Chuyến 07:00 ngày 28/08 (biển số 29B-888.88) vẫn đang chạy. Kết thúc chuyến đó trước, hoặc gọi điều hành.');

    // 3b. Same plate, different driver
    const samePlateTripId = 'trp_test_same_plate';
    services.driverService.activeTrips.set(samePlateTripId, {
      trip_id: samePlateTripId,
      operator_id: 'op_saomai',
      driver_id: 'drv_different_driver',
      vehicle_plate: '29B-888.88',
      route_name: 'Hà Nội — Thanh Hóa',
      planned_departure_time: '2026-08-28T14:00:00+07:00',
      status: 'READY',
      manifest: [],
      debts: [],
      stops: [
        { stop_id: 's1', name: 'Bến 1', status: 'PENDING' },
        { stop_id: 's2', name: 'Bến 2', status: 'PENDING' }
      ]
    });

    const resSamePlate = services.driverService.startTrip(samePlateTripId);
    assert.strictEqual(resSamePlate.success, false);
    assert.strictEqual(resSamePlate.code, 'OTHER_TRIP_RUNNING');
    assert.strictEqual(resSamePlate.error, 'Chuyến 07:00 ngày 28/08 (biển số 29B-888.88) vẫn đang chạy. Kết thúc chuyến đó trước, hoặc gọi điều hành.');

    // 3c. Check order: state check first
    services.driverService.activeTrips.get(sameDriverTripId).status = 'DISPATCHED';
    const resDispatched = services.driverService.startTrip(sameDriverTripId);
    assert.strictEqual(resDispatched.code, 'INVALID_TRIP_STATE');

    // Clean up
    services.driverService.activeTrips.delete(runningTripId);
    services.driverService.activeTrips.delete(sameDriverTripId);
    services.driverService.activeTrips.delete(samePlateTripId);
  });

  it('4. office end (validation, success, other operator 404)', async () => {
    const tripId = 'trp_test_office_end';
    services.driverService.activeTrips.set(tripId, {
      trip_id: tripId,
      operator_id: 'op_saomai',
      driver_id: 'drv_8821a',
      vehicle_plate: '29B-882.19',
      route_name: 'Hà Nội — Thanh Hóa',
      planned_departure_time: '2026-08-28T07:00:00+07:00',
      status: 'IN_TRANSIT',
      booked_passengers_count: 0,
      boarded_count: 0,
      total_cod_collected_vnd: 0,
      total_hail_collected_vnd: 0,
      manifest: [],
      debts: [],
      stops: [
        { stop_id: 's1', name: 'Bến 1', status: 'ARRIVED' },
        { stop_id: 's2', name: 'Bến 2', status: 'PENDING' }
      ]
    });

    // Only the director and the dispatcher end a trip, as they cancel one
    const cashier = (await request('/api/v1/ops/auth/login', { method: 'POST', body: { username: 'cashier@busgo.vn', password: 'cash123' } })).body.data.token;
    const resCashier = await request(`/api/v1/ops/trips/${tripId}/end`, { method: 'POST', token: cashier, body: { reason: 'Tài xế quên kết thúc' } });
    assert.strictEqual(resCashier.status, 403);

    // Validation: reason missing
    const resNoReason = await request(`/api/v1/ops/trips/${tripId}/end`, {
      method: 'POST',
      token: saomaiOps,
      body: {}
    });
    assert.strictEqual(resNoReason.status, 400);
    assert.strictEqual(resNoReason.body.code, 'VALIDATION_ERROR');

    // Validation: reason too short (< 5 chars)
    const resShortReason = await request(`/api/v1/ops/trips/${tripId}/end`, {
      method: 'POST',
      token: saomaiOps,
      body: { reason: 'hỏng' }
    });
    assert.strictEqual(resShortReason.status, 400);
    assert.strictEqual(resShortReason.body.code, 'VALIDATION_ERROR');

    // Validation: reason too long (> 200 chars)
    const resLongReason = await request(`/api/v1/ops/trips/${tripId}/end`, {
      method: 'POST',
      token: saomaiOps,
      body: { reason: 'x'.repeat(201) }
    });
    assert.strictEqual(resLongReason.status, 400);
    assert.strictEqual(resLongReason.body.code, 'VALIDATION_ERROR');

    // 404 for unknown trip
    const resNotFound = await request('/api/v1/ops/trips/trp_non_existent/end', {
      method: 'POST',
      token: saomaiOps,
      body: { reason: 'Xe hỏng hóc giữa đường' }
    });
    assert.strictEqual(resNotFound.status, 404);
    assert.strictEqual(resNotFound.body.code, 'TRIP_NOT_FOUND');

    // 404 for trip belonging to another operator
    const resOtherOp = await request(`/api/v1/ops/trips/${tripId}/end`, {
      method: 'POST',
      token: xvOps,
      code: 'XUYENVIET',
      body: { reason: 'Điều hành khác kết thúc' }
    });
    assert.strictEqual(resOtherOp.status, 404);
    assert.strictEqual(resOtherOp.body.code, 'TRIP_NOT_FOUND');

    // 400 when not IN_TRANSIT
    services.driverService.activeTrips.get(tripId).status = 'READY';
    const resNotRunning = await request(`/api/v1/ops/trips/${tripId}/end`, {
      method: 'POST',
      token: saomaiOps,
      body: { reason: 'Xe gặp sự cố trước khi chạy' }
    });
    assert.strictEqual(resNotRunning.status, 400);
    assert.strictEqual(resNotRunning.body.code, 'INVALID_TRIP_STATE');

    // Successful office end
    services.driverService.activeTrips.get(tripId).status = 'IN_TRANSIT';
    const resSuccess = await request(`/api/v1/ops/trips/${tripId}/end`, {
      method: 'POST',
      token: saomaiOps,
      body: { reason: 'Xe hỏng hóc máy nén khí tại Ninh Bình' }
    });
    assert.strictEqual(resSuccess.status, 200);
    assert.strictEqual(resSuccess.body.data.status, 'COMPLETED');
    assert.strictEqual(resSuccess.body.data.ended_by, 'OFFICE');
    assert.strictEqual(resSuccess.body.data.early_end_reason, 'Điều hành kết thúc: Xe hỏng hóc máy nén khí tại Ninh Bình');

    const endedTrip = services.driverService.activeTrips.get(tripId);
    assert.strictEqual(endedTrip.status, 'COMPLETED');
    assert.strictEqual(endedTrip.ended_by, 'OFFICE');

    // Clean up
    services.driverService.activeTrips.delete(tripId);
  });

  it('5. early end cancels + refunds + notifies unpicked passengers and adds the alert', async () => {
    const tripId = 'trp_test_early_passengers';
    const departureTime = '2026-08-28T07:00:00+07:00';

    const tktPrepaid = {
      ticket_id: 'tkt_early_prepaid_01',
      pnr: 'BG-EP01',
      trip_id: tripId,
      seat_code: 'A01',
      route_name: 'Hà Nội — Thanh Hóa (Cao tốc)',
      fare_vnd: 220000,
      payment_method: 'VIETQR',
      status: 'ACTIVE',
      owner_phone: '0981112233',
      passenger_phone: '0981112233'
    };

    const tktCash = {
      ticket_id: 'tkt_early_cash_02',
      pnr: 'BG-EP02',
      trip_id: tripId,
      seat_code: 'A02',
      route_name: 'Hà Nội — Thanh Hóa (Cao tốc)',
      fare_vnd: 220000,
      payment_method: 'CASH',
      cod_collected: false,
      status: 'ACTIVE',
      owner_phone: '0982223344',
      passenger_phone: '0982223344'
    };

    const tktBoarded = {
      ticket_id: 'tkt_early_boarded_03',
      pnr: 'BG-EP03',
      trip_id: tripId,
      seat_code: 'A03',
      route_name: 'Hà Nội — Thanh Hóa (Cao tốc)',
      fare_vnd: 220000,
      payment_method: 'VIETQR',
      status: 'BOARDED',
      owner_phone: '0983334455',
      passenger_phone: '0983334455'
    };

    services.paymentService.tickets.set(tktPrepaid.ticket_id, tktPrepaid);
    services.paymentService.tickets.set(tktCash.ticket_id, tktCash);
    services.paymentService.tickets.set(tktBoarded.ticket_id, tktBoarded);

    services.driverService.activeTrips.set(tripId, {
      trip_id: tripId,
      operator_id: 'op_saomai',
      driver_id: 'drv_8821a',
      vehicle_plate: '29B-882.19',
      route_name: 'Hà Nội — Thanh Hóa (Cao tốc)',
      planned_departure_time: departureTime,
      status: 'IN_TRANSIT',
      booked_passengers_count: 3,
      boarded_count: 1,
      total_cod_collected_vnd: 0,
      total_hail_collected_vnd: 0,
      stops: [
        { stop_id: 's1', name: 'Bến 1', status: 'ARRIVED' },
        { stop_id: 's2', name: 'Bến 2', status: 'PENDING' }
      ],
      debts: [],
      manifest: [
        { ticket_id: tktPrepaid.ticket_id, pnr: tktPrepaid.pnr, seat_code: tktPrepaid.seat_code, boarding_status: 'NOT_BOARDED', payment_method: 'VIETQR' },
        { ticket_id: tktCash.ticket_id, pnr: tktCash.pnr, seat_code: tktCash.seat_code, boarding_status: 'NOT_BOARDED', payment_method: 'CASH' },
        { ticket_id: tktBoarded.ticket_id, pnr: tktBoarded.pnr, seat_code: tktBoarded.seat_code, boarding_status: 'BOARDED', payment_method: 'VIETQR' }
      ]
    });

    // Office ends trip early
    const res = await request(`/api/v1/ops/trips/${tripId}/end`, {
      method: 'POST',
      token: saomaiOps,
      body: { reason: 'Sự cố trục trặc kỹ thuật động cơ' }
    });
    assert.strictEqual(res.status, 200);

    // 1. Prepaid unboarded passenger: cancelled + 100% refund
    assert.strictEqual(tktPrepaid.status, 'CANCELLED');
    assert.strictEqual(tktPrepaid.cancel_source, 'TRIP_ENDED_EARLY');
    assert.ok(tktPrepaid.cancelled_at);

    const refunds = services.managerService.refundRequests || [];
    const prepaidRefund = refunds.find(r => r.ticket_id === tktPrepaid.ticket_id);
    assert.ok(prepaidRefund, 'Prepaid ticket must have refund requested');
    assert.strictEqual(prepaidRefund.source, 'TRIP_ENDED_EARLY');
    assert.strictEqual(prepaidRefund.amount_vnd, 220000);

    // 2. Unpaid cash unboarded passenger: cancelled, no refund
    assert.strictEqual(tktCash.status, 'CANCELLED');
    assert.strictEqual(tktCash.cancel_source, 'TRIP_ENDED_EARLY');
    assert.ok(tktCash.cancelled_at);
    const cashRefund = refunds.find(r => r.ticket_id === tktCash.ticket_id);
    assert.strictEqual(cashRefund, undefined, 'Unpaid cash ticket should have no refund');

    // 3. Boarded passenger is unchanged
    assert.strictEqual(tktBoarded.status, 'BOARDED');

    // 4. Passenger notifications
    const prepaidNotifs = services.trackingService.getNotifications(tktPrepaid.passenger_phone, 'op_saomai').data || [];
    const prepaidNotif = prepaidNotifs.find(n => n.type === 'TRIP_ENDED_EARLY' && n.payload?.ticket_id === tktPrepaid.ticket_id);
    assert.ok(prepaidNotif, 'Notification must be sent to prepaid unpicked passenger');
    assert.strictEqual(prepaidNotif.title, 'Xe không đón được bạn');
    assert.ok(prepaidNotif.body.includes('Hà Nội — Thanh Hóa'));
    assert.ok(prepaidNotif.body.includes('BG-EP01'));
    assert.ok(prepaidNotif.body.includes('A01'));
    assert.ok(prepaidNotif.body.includes('Nhà xe hoàn 100% 220.000 đ, đang chờ xử lý.'));

    const cashNotifs = services.trackingService.getNotifications(tktCash.passenger_phone, 'op_saomai').data || [];
    const cashNotif = cashNotifs.find(n => n.type === 'TRIP_ENDED_EARLY' && n.payload?.ticket_id === tktCash.ticket_id);
    assert.ok(cashNotif, 'Notification must be sent to unpaid cash unpicked passenger');
    assert.strictEqual(cashNotif.title, 'Xe không đón được bạn');
    assert.ok(cashNotif.body.includes('Bạn chưa thanh toán nên không mất khoản nào.'));

    // 5. Office alert
    const alert = (services.managerService.alerts || []).find(a => a.trip_id === tripId && a.type === 'TRIP_ENDED_EARLY');
    assert.ok(alert, 'RED alert must be pushed to manager alerts');
    assert.strictEqual(alert.severity, 'RED');
    assert.ok(alert.message.includes('07:00 ngày 28/08'));
    assert.ok(alert.message.includes('2 khách chưa được đón'));

    // Clean up
    services.driverService.activeTrips.delete(tripId);
    services.paymentService.tickets.delete(tktPrepaid.ticket_id);
    services.paymentService.tickets.delete(tktCash.ticket_id);
    services.paymentService.tickets.delete(tktBoarded.ticket_id);
  });

  it('6. normal end at the final stop changes no ticket', async () => {
    const tripId = 'trp_test_normal_final_stop';
    const departureTime = '2026-08-28T07:00:00+07:00';

    const tktNormal = {
      ticket_id: 'tkt_normal_01',
      pnr: 'BG-NORM01',
      trip_id: tripId,
      seat_code: 'B01',
      route_name: 'Hà Nội — Thanh Hóa',
      fare_vnd: 220000,
      payment_method: 'VIETQR',
      status: 'ACTIVE',
      owner_phone: '0984445566'
    };

    services.paymentService.tickets.set(tktNormal.ticket_id, tktNormal);

    services.driverService.activeTrips.set(tripId, {
      trip_id: tripId,
      operator_id: 'op_saomai',
      driver_id: 'drv_8821a',
      vehicle_plate: '29B-882.19',
      route_name: 'Hà Nội — Thanh Hóa',
      planned_departure_time: departureTime,
      status: 'IN_TRANSIT',
      booked_passengers_count: 1,
      boarded_count: 0,
      total_cod_collected_vnd: 0,
      total_hail_collected_vnd: 0,
      debts: [],
      stops: [
        { stop_id: 's1', name: 'Bến đầu', status: 'ARRIVED' },
        { stop_id: 's2', name: 'Bến cuối', status: 'ARRIVED' } // Arrived at final stop!
      ],
      manifest: [
        { ticket_id: tktNormal.ticket_id, pnr: tktNormal.pnr, seat_code: tktNormal.seat_code, boarding_status: 'NOT_BOARDED', payment_method: 'VIETQR' }
      ]
    });

    const initialRefundCount = (services.managerService.refundRequests || []).length;
    const initialAlertCount = (services.managerService.alerts || []).filter(a => a.trip_id === tripId).length;

    // Driver ends trip normally at final terminal
    const endRes = services.driverService.endTrip(tripId);
    assert.strictEqual(endRes.success, true);
    assert.strictEqual(endRes.data.early_end_reason, null);

    // Ticket remains ACTIVE (unchanged)
    assert.strictEqual(tktNormal.status, 'ACTIVE');
    assert.strictEqual(tktNormal.cancel_source, undefined);

    // No refund requested
    const currentRefundCount = (services.managerService.refundRequests || []).length;
    assert.strictEqual(currentRefundCount, initialRefundCount);

    // No early end alert pushed
    const currentAlertCount = (services.managerService.alerts || []).filter(a => a.trip_id === tripId).length;
    assert.strictEqual(currentAlertCount, initialAlertCount);

    // Clean up
    services.driverService.activeTrips.delete(tripId);
    services.paymentService.tickets.delete(tktNormal.ticket_id);
  });

  it('7. driver HTTP routes: /start validates early start and /end triggers early end handling', async () => {
    const tripId = 'trp_test_driver_http_flow';
    const departureTime = '2026-10-20T10:00:00+07:00';
    const depMs = Date.parse(departureTime);

    const tktPrepaid = {
      ticket_id: 'tkt_driver_http_01',
      pnr: 'BG-DH01',
      trip_id: tripId,
      seat_code: 'A05',
      route_name: 'Hà Nội — Thanh Hóa',
      fare_vnd: 250000,
      payment_method: 'VIETQR',
      status: 'ACTIVE',
      owner_phone: '0985556677',
      passenger_phone: '0985556677'
    };
    services.paymentService.tickets.set(tktPrepaid.ticket_id, tktPrepaid);

    services.driverService.activeTrips.set(tripId, {
      trip_id: tripId,
      operator_id: 'op_saomai',
      driver_id: 'drv_8821a',
      vehicle_plate: '29B-882.19',
      route_name: 'Hà Nội — Thanh Hóa',
      planned_departure_time: departureTime,
      status: 'READY',
      booked_passengers_count: 1,
      boarded_count: 0,
      total_cod_collected_vnd: 0,
      total_hail_collected_vnd: 0,
      debts: [],
      stops: [
        { stop_id: 's1', name: 'Bến 1', status: 'PENDING' },
        { stop_id: 's2', name: 'Bến 2', status: 'PENDING' }
      ],
      manifest: [
        { ticket_id: tktPrepaid.ticket_id, pnr: tktPrepaid.pnr, seat_code: tktPrepaid.seat_code, boarding_status: 'NOT_BOARDED', payment_method: 'VIETQR' }
      ]
    });

    // HTTP POST /start when too early (> 60 min before)
    const tooEarlyRes = await request(`/api/v1/driver/trips/${tripId}/start`, {
      method: 'POST',
      token: driverToken,
      body: { now: depMs - 90 * 60000 }
    });
    assert.strictEqual(tooEarlyRes.status, 400);
    assert.strictEqual(tooEarlyRes.body.code, 'TRIP_TOO_EARLY');

    // HTTP POST /start allowed at 60 min before
    const startRes = await request(`/api/v1/driver/trips/${tripId}/start`, {
      method: 'POST',
      token: driverToken,
      body: { now: depMs - 60 * 60000 }
    });
    assert.strictEqual(startRes.status, 200);
    assert.strictEqual(services.driverService.activeTrips.get(tripId).status, 'IN_TRANSIT');

    // HTTP POST /end early with reason
    const endRes = await request(`/api/v1/driver/trips/${tripId}/end`, {
      method: 'POST',
      token: driverToken,
      body: { early_end_reason: 'Xe bị nổ lốp, chuyển hành khách sang xe khác' }
    });
    assert.strictEqual(endRes.status, 200);
    assert.strictEqual(tktPrepaid.status, 'CANCELLED');
    assert.strictEqual(tktPrepaid.cancel_source, 'TRIP_ENDED_EARLY');

    const refund = (services.managerService.refundRequests || []).find(r => r.ticket_id === tktPrepaid.ticket_id);
    assert.ok(refund);
    assert.strictEqual(refund.source, 'TRIP_ENDED_EARLY');

    // Clean up
    services.driverService.activeTrips.delete(tripId);
    services.paymentService.tickets.delete(tktPrepaid.ticket_id);
  });
});
