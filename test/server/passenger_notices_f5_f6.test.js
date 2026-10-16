import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import { createFleetBusServer } from '../../source/server/apiServer.js';
import { STOP_COORDS } from '../../source/server/core/geo.js';
import { generateGroupBoardingQR } from '../../source/server/services/passenger/core/cryptoEngine.js';

const TRIP = 'trp_hn_th_01';
const READY = {
  tires_checked: true,
  brakes_fluid_checked: true,
  ac_cleanliness_checked: true,
  first_aid_extinguisher_checked: true,
  fuel_level_sufficient: true,
  gps_telemetry_beacon_active: true
};

describe('Passenger notices F5 & F6: 2-seat booking deduplication, delay and approaching', () => {
  let services;
  const phone = '0987000444';
  const pnr = 'BG-829527';
  const trip = () => services.driverService.activeTrips.get(TRIP);
  const inbox = (ph) => services.trackingService.getNotifications(ph, 'op_saomai').data?.notifications
    ?? services.trackingService.getNotifications(ph, 'op_saomai').data;
  const ofType = (ph, type) => (inbox(ph) || []).filter(n => n.type === type);
  const outboxOfType = (ph, type) => (services.messenger.outbox || []).filter(m => m.to === ph && m.type === type);
  const ping = (lat, lng, at = Date.now()) => services.driverService.recordTelemetry(TRIP, { lat, lng, speed_kmh: 60, mockNow: at, recorded_at: at });

  before(() => {
    ({ services } = createFleetBusServer());

    // Setup 2-seat booking on trip trp_hn_th_01
    const tktA = {
      ticket_id: 'tkt_829527_A05',
      pnr,
      seat_code: 'A05',
      passenger_name: 'Nguyễn Văn An',
      passenger_phone: phone,
      pickup_stop_id: 'stp_nb',
      dropoff_stop_id: 'stp_th_pb',
      boarding_status: 'ISSUED',
      payment_method: 'VIETQR',
      trip_id: TRIP,
      route_name: 'Hà Nội — Thanh Hóa (Cao tốc)',
      departure_time: '2026-10-16T14:00:00+07:00',
      status: 'ACTIVE'
    };

    const tktB = {
      ticket_id: 'tkt_829527_B04',
      pnr,
      seat_code: 'B04',
      passenger_name: 'Nguyễn Văn An',
      passenger_phone: phone,
      pickup_stop_id: 'stp_nb',
      dropoff_stop_id: 'stp_th_pb',
      boarding_status: 'ISSUED',
      payment_method: 'VIETQR',
      trip_id: TRIP,
      route_name: 'Hà Nội — Thanh Hóa (Cao tốc)',
      departure_time: '2026-10-16T14:00:00+07:00',
      status: 'ACTIVE'
    };

    services.paymentService.tickets.set(tktA.ticket_id, tktA);
    services.paymentService.tickets.set(tktB.ticket_id, tktB);

    trip().manifest.push(tktA, tktB);
    trip().planned_departure_time = '2026-10-16T14:00:00+07:00';
    trip().route_name = 'Hà Nội — Thanh Hóa (Cao tốc)';
  });

  it('F5: TRIP_DELAY sends exactly one in-app notice and one outbox message without Radar jargon', () => {
    // Dispatcher delays trip by 15 minutes
    const res = services.managerService.broadcastTripDelay(TRIP, 15, 'Kẹt xe trạm thu phí');
    assert.strictEqual(res.success, true);

    // In-app notices: exactly 1 for the 2-seat booking
    const inAppDelay = ofType(phone, 'TRIP_DELAY');
    assert.strictEqual(inAppDelay.length, 1, 'must have exactly one in-app delay notice for the phone');
    const notif = inAppDelay[0];

    // Assert text has NO developer wording like "Radar"
    assert.ok(!notif.body.includes('Radar'), 'delay notice text must NOT mention Radar');
    assert.ok(!notif.title.includes('Radar'), 'delay notice title must NOT mention Radar');

    // Assert friendly delay message format
    assert.match(notif.body, /chạy trễ 15 phút/);
    assert.match(notif.body, /giờ chạy mới 14:15/);
    assert.match(notif.body, /A05, B04/);
    assert.match(notif.body, /Kẹt xe trạm thu phí/);
    assert.ok(notif.body.length <= 320, 'must be under SMS limit of 320 chars');

    // Outbox messages: exactly 1 for this phone
    const outboxDelay = outboxOfType(phone, 'TRIP_DELAY');
    assert.strictEqual(outboxDelay.length, 1, 'must have exactly one outbox message for the phone');
    const outMsg = outboxDelay[0];
    assert.ok(!outMsg.text.includes('Radar'), 'outbox message text must NOT mention Radar');
    assert.match(outMsg.text, /chạy trễ 15 phút/);
    assert.match(outMsg.text, /14:15/);
  });

  it('F5: two delay announcements (15 then 30) send two notices for the phone', () => {
    // Second announcement with 30 minutes
    const res = services.managerService.broadcastTripDelay(TRIP, 30, 'Sạt lở đèo');
    assert.strictEqual(res.success, true);

    const inAppDelay = ofType(phone, 'TRIP_DELAY');
    assert.strictEqual(inAppDelay.length, 2, 'must have two in-app delay notices for the phone');

    const outboxDelay = outboxOfType(phone, 'TRIP_DELAY');
    assert.strictEqual(outboxDelay.length, 2, 'must have two outbox delay messages for the phone');

    const secondNotice = inAppDelay[0];
    assert.match(secondNotice.body, /chạy trễ 30 phút/);
    assert.match(secondNotice.body, /giờ chạy mới 14:30/);
    assert.match(secondNotice.body, /Sạt lở đèo/);
  });

  it('F5: delay text omits unknown route and empty reason without fallback placeholders', () => {
    const savedRoute = trip().route_name;
    trip().route_name = '';
    for (const t of services.paymentService.tickets.values()) {
      if (t.trip_id === TRIP) t.route_name = '';
    }

    const res = services.managerService.broadcastTripDelay(TRIP, 45, '   ');
    assert.strictEqual(res.success, true);

    const inAppDelay = ofType(phone, 'TRIP_DELAY');
    const notice = inAppDelay[0];
    assert.ok(!notice.body.includes('Hà Nội — Thanh Hóa'), 'must not contain hardcoded route fallback');
    assert.ok(!notice.body.includes('Hà Nội → Thanh Hóa'), 'must not contain hardcoded route fallback');
    assert.ok(!notice.body.includes('Kẹt xe đường bộ'), 'must not contain hardcoded reason fallback');
    assert.ok(!notice.body.includes('Lý do:'), 'must omit "Lý do:" when reason is empty');
    assert.match(notice.body, /^Chuyến 14:00 ngày 16\/10/);

    // Restore route_name
    trip().route_name = savedRoute;
    for (const t of services.paymentService.tickets.values()) {
      if (t.trip_id === TRIP) t.route_name = savedRoute;
    }
  });

  it('F6: PICKUP_APPROACHING sends exactly one in-app notice and one outbox message listing both seats', () => {
    services.driverService.submitReadinessChecklist(TRIP, READY);
    assert.strictEqual(services.driverService.startTrip(TRIP).success, true);

    // Ping bus approaching pickup stop (Ninh Bình, ~3 km away at 60 km/h)
    const nb = STOP_COORDS.stp_nb;
    ping(nb.lat + 0.03, nb.lng, Date.now());

    // In-app notifications
    const approachingNotifs = ofType(phone, 'PICKUP_APPROACHING');
    assert.strictEqual(approachingNotifs.length, 1, 'must have exactly one in-app approaching notice for the phone');
    const notif = approachingNotifs[0];
    assert.match(notif.body, /Ninh Bình/);
    assert.match(notif.body, /ghế A05, B04/);
    assert.strictEqual(notif.payload.trip_id, TRIP);
    assert.deepStrictEqual(notif.payload.seat_codes, ['A05', 'B04']);

    // Outbox messages
    const approachingOutbox = outboxOfType(phone, 'PICKUP_APPROACHING');
    assert.strictEqual(approachingOutbox.length, 1, 'must have exactly one outbox message for approaching');

    // Repeated ping does not duplicate
    ping(nb.lat + 0.02, nb.lng, Date.now() + 1000);
    assert.strictEqual(ofType(phone, 'PICKUP_APPROACHING').length, 1, 'must not duplicate on subsequent pings');
    assert.strictEqual(outboxOfType(phone, 'PICKUP_APPROACHING').length, 1, 'must not duplicate in outbox');
  });

  it('F6: Boarding welcome sends exactly one reminder naming both seats when 2 seats board together', () => {
    // Generate Group QR for the 2 seats
    const tktA = trip().manifest.find(m => m.seat_code === 'A05');
    const tktB = trip().manifest.find(m => m.seat_code === 'B04');
    const groupQR = generateGroupBoardingQR([tktA, tktB], services.driverService.secretKey);

    const boardRes = services.driverService.boardPassengerByQR(TRIP, groupQR.qr_code_value);
    assert.strictEqual(boardRes.success, true);
    assert.strictEqual(boardRes.data.boarded_passengers.length, 2);

    // Verify exactly one BOARDING_REMINDER notification for phone
    const reminders = ofType(phone, 'BOARDING_REMINDER');
    assert.strictEqual(reminders.length, 1, 'must have exactly one boarding reminder for the phone');
    const reminder = reminders[0];
    assert.match(reminder.body, /Ghế A05, B04/);
    assert.ok(reminder.body.includes('Hà Nội — Thanh Hóa') || reminder.body.includes('Hà Nội → Thanh Hóa'));
  });
});
