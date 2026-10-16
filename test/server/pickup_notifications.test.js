import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import { createFleetBusServer } from '../../source/server/apiServer.js';
import { STOP_COORDS } from '../../source/server/core/geo.js';
import { findOperatorByCode } from '../../source/server/core/operators.js';

const TRIP = 'trp_hn_th_01';
const READY = { tires_checked: true, brakes_fluid_checked: true, ac_cleanliness_checked: true, first_aid_extinguisher_checked: true, fuel_level_sufficient: true, gps_telemetry_beacon_active: true };

describe('Approaching / arrived pickup notifications (spec 9)', () => {
  let services;
  const trip = () => services.driverService.activeTrips.get(TRIP);
  const inbox = (phone) => services.trackingService.getNotifications(phone, 'op_saomai').data?.notifications
    ?? services.trackingService.getNotifications(phone, 'op_saomai').data;
  const ofType = (phone, type) => (inbox(phone) || []).filter(n => n.type === type);
  const ping = (lat, lng, at = Date.now()) => services.driverService.recordTelemetry(TRIP, { lat, lng, speed_kmh: 60, mockNow: at, recorded_at: at });

  before(() => {
    ({ services } = createFleetBusServer());
    const pax = (seat, phone, pickup, extra = {}) => ({ ticket_id: `tkt_n_${seat}`, pnr: 'BG-N', seat_code: seat, passenger_name: seat, passenger_phone: phone, pickup_stop_id: pickup, dropoff_stop_id: 'stp_th_pb', boarding_status: 'ISSUED', payment_method: 'VIETQR', cod_amount_vnd: 0, ...extra });
    trip().manifest.push(
      pax('D01', '0911000001', 'stp_nb'),
      pax('D02', '0911000002', 'stp_nb', { home_pickup: { address: 'nhà' } }),
      pax('D03', '0911000003', 'stp_nb', { boarding_status: 'NO_SHOW' }),
      pax('D04', '0911000004', 'stp_th_pb')
    );
    services.driverService.submitReadinessChecklist(TRIP, READY);
    assert.strictEqual(services.driverService.startTrip(TRIP).success, true);
  });

  it('says nothing while the bus is far from the pickup', () => {
    ping(STOP_COORDS.stp_hn_gb.lat, STOP_COORDS.stp_hn_gb.lng);
    assert.strictEqual(ofType('0911000001', 'PICKUP_APPROACHING').length, 0);
  });

  it('tells a waiting passenger once when the live ETA is within the company threshold', () => {
    const nb = STOP_COORDS.stp_nb;
    ping(nb.lat + 0.03, nb.lng, Date.now());
    const sent = ofType('0911000001', 'PICKUP_APPROACHING');
    assert.strictEqual(sent.length, 1, 'about 3-4 km before Ninh Bình at 60 km/h is within 10 minutes');
    assert.match(sent[0].body, /Ninh Bình/);
    assert.strictEqual(sent[0].payload.ticket_id, 'tkt_n_D01');
    ping(nb.lat + 0.02, nb.lng, Date.now() + 1000);
    assert.strictEqual(ofType('0911000001', 'PICKUP_APPROACHING').length, 1, 'never twice for a ticket');
    assert.strictEqual(ofType('0911000002', 'PICKUP_APPROACHING').length, 0, 'a home pickup waits at home, not at the stop');
    assert.strictEqual(ofType('0911000003', 'PICKUP_APPROACHING').length, 0, 'a no-show is not told');
    assert.strictEqual(ofType('0911000004', 'PICKUP_APPROACHING').length, 0, 'a later pickup is still far');
  });

  it('a stale position does not trigger it', () => {
    const th = STOP_COORDS.stp_th_pb;
    ping(th.lat + 0.02, th.lng, Date.now() - 100000);
    assert.strictEqual(ofType('0911000004', 'PICKUP_APPROACHING').length, 0);
  });

  it('the threshold is the company setting', () => {
    const config = findOperatorByCode('SAOMAI').service_config;
    const old = config.approaching_threshold_minutes;
    config.approaching_threshold_minutes = 1;
    const th = STOP_COORDS.stp_th_pb;
    ping(th.lat + 0.05, th.lng, Date.now() + 2000);
    assert.strictEqual(ofType('0911000004', 'PICKUP_APPROACHING').length, 0, '5 km is more than 1 minute away');
    config.approaching_threshold_minutes = old;
  });

  it('tells waiting passengers once when the bus arrives at their stop', () => {
    assert.strictEqual(services.driverService.arriveAtStop(TRIP, 'stp_nb').success, true);
    services.driverService.arriveAtStop(TRIP, 'stp_nb');
    const arrived = ofType('0911000001', 'PICKUP_ARRIVED');
    assert.strictEqual(arrived.length, 1);
    assert.match(arrived[0].body, /ghế D01/);
    assert.strictEqual(ofType('0911000003', 'PICKUP_ARRIVED').length, 0);
    assert.strictEqual(ofType('0911000004', 'PICKUP_ARRIVED').length, 0);
  });
});
