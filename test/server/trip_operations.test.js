import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { createFleetBusServer } from '../../source/server/apiServer.js';

const TRIP = 'trp_hn_th_01';
const READY = { tires_checked: true, brakes_fluid_checked: true, ac_cleanliness_checked: true, first_aid_extinguisher_checked: true, fuel_level_sufficient: true, gps_telemetry_beacon_active: true };

describe('Trip and stop states, stop counts and the boarding event log (spec 5)', () => {
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
  const trip = () => services.driverService.activeTrips.get(TRIP);

  before(async () => {
    ({ server, services } = createFleetBusServer());
    await new Promise(resolve => server.listen(0, resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    driverToken = (await request('/api/v1/driver/auth/login', { method: 'POST', body: { staff_id: 'TX8821', pin: '123456' } })).body.data.token;
    saomaiOps = (await request('/api/v1/ops/auth/login', { method: 'POST', body: { username: 'dispatcher@busgo.vn', password: 'disp123' } })).body.data.token;
    xvOps = (await request('/api/v1/ops/auth/login', { method: 'POST', code: 'XUYENVIET', body: { username: 'dispatcher@xuyenviet.vn', password: 'xv123' } })).body.data.token;
  });

  after(() => new Promise(resolve => server.close(resolve)));

  it('maps the trip status to the spec names as the trip goes', async () => {
    const dispatched = (await request('/api/v1/driver/trips/trp_991823', { token: driverToken })).body.data;
    assert.strictEqual(dispatched.status, 'DISPATCHED');
    assert.strictEqual(dispatched.lifecycle_status, 'SCHEDULED');
    const before = await request(`/api/v1/driver/trips/${TRIP}`, { token: driverToken });
    assert.ok(before.body.data.stops.every(s => s.lifecycle_status === 'UPCOMING'));
    services.driverService.submitReadinessChecklist(TRIP, READY);
    assert.strictEqual((await request(`/api/v1/driver/trips/${TRIP}`, { token: driverToken })).body.data.lifecycle_status, 'BOARDING');
    assert.strictEqual(services.driverService.startTrip(TRIP).success, true);
    assert.strictEqual((await request(`/api/v1/driver/trips/${TRIP}`, { token: driverToken })).body.data.lifecycle_status, 'IN_PROGRESS');
  });

  it('counts passengers per stop and logs boardings with the actor; a second boarding is refused', async () => {
    const gb = trip().stops[0].stop_id;
    const pax = (seat, extra = {}) => ({ ticket_id: `tkt_ops_${seat}`, pnr: 'BG-OPS', seat_code: seat, passenger_name: `Khách ${seat}`, passenger_phone: '0901000111', pickup_stop_id: gb, dropoff_stop_id: 'stp_th_pb', boarding_status: 'ISSUED', payment_method: 'VIETQR', cod_amount_vnd: 0, ...extra });
    trip().manifest.push(pax('C01'), pax('C02', { home_pickup: { address: '1 Giải Phóng' } }), pax('C03', { boarding_status: 'NO_SHOW' }), pax('C04', { boarding_status: 'CANCELLED' }));
    assert.strictEqual(services.driverService.arriveAtStop(TRIP, gb).success, true);
    const first = trip().manifest.find(p => p.seat_code === 'C01');
    const boarded = services.driverService.boardPassengerManually(TRIP, { ticketId: first.ticket_id });
    assert.strictEqual(boarded.success, true, JSON.stringify(boarded));
    assert.strictEqual(services.driverService.boardPassengerManually(TRIP, { ticketId: first.ticket_id }).code, 'ALREADY_BOARDED');

    const event = trip().events.find(e => e.type === 'BOARDED' && e.ticket_id === first.ticket_id);
    assert.strictEqual(event.actor, trip().driver_id);
    assert.strictEqual(event.manual, true, 'a manual boarding is flagged for review');
    assert.strictEqual(event.stop_id, gb);
    assert.strictEqual(trip().events.filter(e => e.type === 'BOARDED' && e.ticket_id === first.ticket_id).length, 1);

    const view = (await request(`/api/v1/driver/trips/${TRIP}`, { token: driverToken })).body.data;
    const stop = view.stops.find(s => s.stop_id === gb);
    assert.strictEqual(stop.lifecycle_status, 'ARRIVED');
    assert.deepStrictEqual(stop.counts, { confirmed: 3, boarded: 1, excluded: 2, home_pickups: 1, dropoffs: 0, alighted: 0 });
    assert.strictEqual(view.events, undefined, 'the event log is not sent to the driver app');
  });

  it('a stop passed without a visit becomes SKIPPED, and the bus cannot go back to it', async () => {
    const stops = trip().stops;
    const nb = stops.findIndex(s => s.stop_id === 'stp_nb');
    const arrive = await request(`/api/v1/driver/trips/${TRIP}/stops/stp_nb/arrive`, { method: 'POST', token: driverToken });
    assert.strictEqual(arrive.status, 200, JSON.stringify(arrive.body));
    const view = (await request(`/api/v1/driver/trips/${TRIP}`, { token: driverToken })).body.data;
    assert.strictEqual(view.stops[0].lifecycle_status, 'COMPLETED');
    for (let i = 1; i < nb; i++) assert.strictEqual(view.stops[i].lifecycle_status, 'SKIPPED', view.stops[i].stop_id);
    assert.strictEqual(view.stops[nb].lifecycle_status, 'ARRIVED');

    const back = await request(`/api/v1/driver/trips/${TRIP}/stops/${stops[1].stop_id}/arrive`, { method: 'POST', token: driverToken });
    assert.strictEqual(back.status, 409);
    assert.strictEqual(back.body.code, 'STOP_OUT_OF_ORDER');
    const again = await request(`/api/v1/driver/trips/${TRIP}/stops/stp_nb/arrive`, { method: 'POST', token: driverToken });
    assert.strictEqual(again.status, 200, 'repeating the current arrival is harmless');
    assert.strictEqual(trip().events.filter(e => e.type === 'STOP_ARRIVED' && e.stop_id === 'stp_nb').length, 1);
  });

  it('the office reads stops, counts and events of its own trips only', async () => {
    const ops = await request(`/api/v1/ops/trips/${TRIP}/operations`, { token: saomaiOps });
    assert.strictEqual(ops.status, 200, JSON.stringify(ops.body));
    assert.strictEqual(ops.body.data.lifecycle_status, 'IN_PROGRESS');
    assert.ok(ops.body.data.stops.every(s => s.counts && s.lifecycle_status));
    const types = ops.body.data.events.map(e => e.type);
    for (const type of ['TRIP_STARTED', 'STOP_ARRIVED', 'BOARDED', 'STOP_SKIPPED']) assert.ok(types.includes(type), type);
    assert.strictEqual(ops.body.data.events[0].type, 'STOP_ARRIVED', 'newest first');

    const foreign = await request(`/api/v1/ops/trips/${TRIP}/operations`, { token: xvOps, code: 'XUYENVIET' });
    assert.strictEqual(foreign.status, 404);
  });

  it('ending the trip completes it and every visited stop', async () => {
    const end = services.driverService.endTrip(TRIP, { earlyEndReason: 'Xe hỏng, chuyển khách' });
    assert.strictEqual(end.success, true, JSON.stringify(end));
    const ops = (await request(`/api/v1/ops/trips/${TRIP}/operations`, { token: saomaiOps })).body.data;
    assert.strictEqual(ops.lifecycle_status, 'COMPLETED');
    assert.strictEqual(ops.stops.find(s => s.stop_id === 'stp_nb').lifecycle_status, 'COMPLETED');
    assert.strictEqual(ops.events[0].type, 'TRIP_COMPLETED');
    assert.strictEqual(ops.events[0].early_end_reason, 'Xe hỏng, chuyển khách');
  });
});
