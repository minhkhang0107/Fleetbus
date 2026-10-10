/**
 * Task T4: Boarding notice names the route and departure, not the raw trip id.
 * Tests that PASSENGER_BOARDED notification uses route name and Vietnam time (UTC+7),
 * strips trailing parentheses from the route name, and never exposes internal trip IDs.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createFleetBusServer } from '../../source/server/apiServer.js';

describe('Boarding notice: route and departure naming (Task T4)', () => {
  it('TC-T4-01: boarding notice uses route name and departure time, not raw trip ID', () => {
    const { services } = createFleetBusServer();
    const tripId = 'trp_hn_th_01';
    const ticketId = 'tkt_t4_01';
    const phone = '0988112233';

    services.paymentService.tickets.set(ticketId, {
      ticket_id: ticketId,
      pnr: 'BG-112233',
      trip_id: tripId,
      route_name: 'Hà Nội — Thanh Hóa (Cao tốc)',
      departure_time: '2026-08-28T07:00:00+07:00',
      seat_code: 'A01',
      passenger_phone: phone,
      status: 'ACTIVE'
    });

    services.eventBridge.emit('PASSENGER_BOARDED', {
      tripId,
      passenger: { passenger_phone: phone, seat_code: 'A01', ticket_id: ticketId, pnr: 'BG-112233' },
      ticketId,
      pnr: 'BG-112233'
    });

    const notifs = services.trackingService.getNotifications(phone);
    assert.strictEqual(notifs.success, true);
    assert.ok(notifs.data.length > 0);

    const reminder = notifs.data.find((n) => n.type === 'BOARDING_REMINDER');
    assert.ok(reminder, 'BOARDING_REMINDER notification should exist');
    assert.ok(reminder.body.includes('Hà Nội — Thanh Hóa'), 'body must contain route name');
    assert.ok(reminder.body.includes('07:00'), 'body must contain departure time HH:MM');
    assert.ok(reminder.body.includes('28/08'), 'body must contain departure date DD/MM');
    assert.ok(!reminder.body.includes('trp_'), 'body must NOT contain internal trip id "trp_"');
    assert.strictEqual(
      reminder.body,
      'Bạn đã lên xe chuyến Hà Nội — Thanh Hóa khởi hành 07:00 ngày 28/08 (Ghế A01). Chúc bạn thượng lộ bình an!'
    );
    // Machine payload must still carry raw trip_id
    assert.strictEqual(reminder.payload.trip_id, tripId);
    assert.strictEqual(reminder.payload.ticket_id, ticketId);
    assert.strictEqual(reminder.payload.seat_code, 'A01');
  });

  it('TC-T4-02: falls back to "chuyến của bạn" when ticket is missing, never printing trip ID', () => {
    const { services } = createFleetBusServer();
    const tripId = 'trp_hn_th_01';
    const phone = '0988445566';

    services.eventBridge.emit('PASSENGER_BOARDED', {
      tripId,
      passenger: { passenger_phone: phone, seat_code: 'B02' }
    });

    const notifs = services.trackingService.getNotifications(phone);
    assert.strictEqual(notifs.success, true);
    const reminder = notifs.data.find((n) => n.type === 'BOARDING_REMINDER');
    assert.ok(reminder);
    assert.ok(!reminder.body.includes('trp_'), 'body must NOT contain internal trip id "trp_"');
    assert.strictEqual(
      reminder.body,
      'Bạn đã lên xe chuyến của bạn (Ghế B02). Chúc bạn thượng lộ bình an!'
    );
    assert.strictEqual(reminder.payload.trip_id, tripId);
  });

  it('TC-T4-03: falls back to "chuyến của bạn" when ticket route or departure time is missing', () => {
    const { services } = createFleetBusServer();
    const tripId = 'trp_hn_th_01';
    const ticketId = 'tkt_t4_no_fields';
    const phone = '0988778899';

    services.paymentService.tickets.set(ticketId, {
      ticket_id: ticketId,
      pnr: 'BG-445566',
      trip_id: tripId,
      seat_code: 'A03',
      passenger_phone: phone,
      status: 'ACTIVE'
    });

    services.eventBridge.emit('PASSENGER_BOARDED', {
      tripId,
      passenger: { passenger_phone: phone, seat_code: 'A03' },
      ticketId,
      pnr: 'BG-445566'
    });

    const notifs = services.trackingService.getNotifications(phone);
    const reminder = notifs.data.find((n) => n.type === 'BOARDING_REMINDER');
    assert.ok(reminder);
    assert.ok(!reminder.body.includes('trp_'));
    assert.strictEqual(
      reminder.body,
      'Bạn đã lên xe chuyến của bạn (Ghế A03). Chúc bạn thượng lộ bình an!'
    );
  });

  it('TC-T4-04: driver boarding flow generates the updated notice without raw trip ID', () => {
    const { services } = createFleetBusServer();
    const tripId = 'trp_991823';
    const ticketId = 'tkt_88219_A01';
    const phone = '0988000111';

    // Set up ticket in payment service
    services.paymentService.tickets.set(ticketId, {
      ticket_id: ticketId,
      pnr: 'BG-991823-A01',
      trip_id: tripId,
      route_name: 'Hà Nội — Thanh Hóa (Đường cao tốc Bắc Nam)',
      departure_time: '2026-08-28T14:00:00+07:00',
      seat_code: 'A01',
      passenger_phone: phone,
      status: 'ACTIVE'
    });

    const driverTrip = services.driverService.activeTrips.get(tripId);
    assert.ok(driverTrip, 'driver trip should exist');
    const passenger = driverTrip.manifest.find((m) => m.ticket_id === ticketId);
    assert.ok(passenger, 'passenger should exist in manifest');
    passenger.passenger_phone = phone;

    // Board passenger manually via driverService
    const res = services.driverService.boardPassengerManually(tripId, { ticketId });
    assert.strictEqual(res.success, true);

    const notifs = services.trackingService.getNotifications(phone);
    const reminder = notifs.data.find((n) => n.type === 'BOARDING_REMINDER');
    assert.ok(reminder);
    assert.ok(reminder.body.includes('Hà Nội — Thanh Hóa'));
    assert.ok(reminder.body.includes('14:00'));
    assert.ok(reminder.body.includes('28/08'));
    assert.ok(!reminder.body.includes('trp_'));
  });
});
