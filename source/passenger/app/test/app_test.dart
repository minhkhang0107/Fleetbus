import 'dart:convert';

import 'package:app/src/presentation/passenger/passenger_store.dart';
import 'package:data/src/service/passenger_api_service.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

/// Rules of the passenger app state against a fake FleetBus server (shapes taken from the live API).
void main() {
  const stops = [
    {'stop_id': 'stp_hn_gb', 'name': 'Bến xe Giáp Bát', 'city': 'Hà Nội', 'order': 1, 'pickup_allowed': true, 'dropoff_allowed': false},
    {'stop_id': 'stp_nb', 'name': 'Bến xe Ninh Bình', 'city': 'Ninh Bình', 'order': 2, 'pickup_allowed': true, 'dropoff_allowed': true},
    {'stop_id': 'stp_th_pb', 'name': 'Bến xe Phía Bắc Thanh Hóa', 'city': 'Thanh Hóa', 'order': 3, 'pickup_allowed': false, 'dropoff_allowed': true},
  ];
  final trip = {
    'trip_id': 'trp_hn_th_01',
    'vehicle_title': 'Giường nằm 34 chỗ',
    'vehicle_type': 'SLEEPER_34',
    'plate_number': '29B-123.45',
    'departure_time': '2026-08-28T07:00:00+07:00',
    'arrival_time': '2026-08-28T10:00:00+07:00',
    'duration_minutes': 180,
    'base_fare_vnd': 220000,
    'available_seats_count': 30,
    'stops': stops,
  };
  final ticket = {
    'ticket_id': 'tkt_BG1_A02',
    'pnr': 'BG-000001',
    'trip_id': 'trp_hn_th_01',
    'route_name': 'Hà Nội — Thanh Hóa (Cao tốc)',
    'departure_time': '2026-08-28T07:00:00+07:00',
    'seat_code': 'A02',
    'fare_vnd': 220000,
    'passenger_name': 'Nguyễn An',
    'pickup_stop': 'Bến xe Giáp Bát',
    'status': 'ACTIVE',
  };

  late List<http.Request> sent;
  late bool paid;
  late String ticketStatus;

  PassengerStore storeWithServer() {
    sent = [];
    paid = false;
    ticketStatus = 'ACTIVE';
    final client = MockClient((req) async {
      sent.add(req);
      Map<String, dynamic>? data;
      Object? list;
      final path = req.url.path;
      if (path.endsWith('/otp/request')) data = {'mock_otp': '123456'};
      if (path.endsWith('/otp/verify')) data = {'token': 'tok', 'user': {'full_name': 'Hành khách BusGo'}};
      if (path.endsWith('/trips/search')) list = [trip];
      if (path.endsWith('/seat-map')) {
        data = {
          'seats': [
            {'seat_code': 'A01', 'deck': 1, 'state': 'BOOKED', 'segment_state': 'BOOKED'},
            {'seat_code': 'A02', 'deck': 1, 'state': 'AVAILABLE', 'segment_state': 'AVAILABLE'},
            {'seat_code': 'B01', 'deck': 2, 'state': 'AVAILABLE', 'segment_state': 'AVAILABLE'},
          ],
        };
      }
      if (path.endsWith('/seats/hold')) data = {'hold_id': 'hld_1', 'seconds_remaining': 600};
      if (path.endsWith('/bookings/create')) {
        data = {
          'payment': {
            'order_id': 'ord_1',
            'pnr': 'BG-000001',
            'amount_vnd': 220000,
            'expires_at': DateTime.now().add(const Duration(minutes: 10)).toIso8601String(),
            'payment_details': {'bank_name': 'VietinBank', 'account_number': '108821999', 'transfer_memo': 'BUSGO BG000001', 'qr_payload': '000201'},
          },
        };
      }
      if (path.endsWith('/verify-status')) data = {'payment_status': paid ? 'PAID' : 'PENDING_PAYMENT', 'is_settled': paid};
      if (path.endsWith('/passenger/tickets')) list = req.url.queryParameters['tab'] == 'UPCOMING' && paid ? [{...ticket, 'status': ticketStatus}] : [];
      if (path.endsWith('/disruptions')) data = {'has_disruption': false};
      if (path.endsWith('/notifications')) list = [];
      if (path.endsWith('/tickets/tkt_BG1_A02')) {
        data = {'ticket': {...ticket, 'status': ticketStatus}, 'boarding_qr': {'qr_code_value': 'BUSGO|BG-000001|tkt_BG1_A02|v1|abc', 'version': 1}, 'offline_pin': '123456'};
      }
      if (path.endsWith('/qr/reissue')) {
        return http.Response(jsonEncode({'status': 'error', 'code': 'BOARDING_STARTED', 'message': 'Chuyến đã xuất bến'}), 409, headers: {'content-type': 'application/json; charset=utf-8'});
      }
      return http.Response(jsonEncode({'status': 'success', 'data': list ?? data ?? {}}), 200, headers: {'content-type': 'application/json; charset=utf-8'});
    });
    return PassengerStore(api: PassengerApiClientService(baseUrl: 'http://test', client: client));
  }

  Map<String, dynamic> bodyOf(String suffix) => jsonDecode(sent.lastWhere((r) => r.url.path.endsWith(suffix)).body) as Map<String, dynamic>;

  test('OTP: the development code is kept for the field and the token logs in', () async {
    final store = storeWithServer();
    expect(await store.requestOtp('0987654321'), isNull);
    expect(store.devOtp, '123456');
    expect(await store.verifyOtp('0987654321', '123456'), isNull);
    expect(store.loggedIn, isTrue);
    expect(store.userName, isNull, reason: 'the placeholder name is not shown as the user name');
  });

  test('search maps trips and spreads stop times between departure and arrival', () async {
    final store = storeWithServer();
    await store.loadTrips();
    expect(store.trips, hasLength(1));
    final t = store.trips.single;
    expect((t.dep, t.arr, t.duration, t.price), ('07:00', '10:00', '3 giờ', 220000));
    expect(t.stops.map((s) => s.time), ['07:00', '08:30', '10:00']);
    store.chooseTrip(t);
    expect((store.pickup, store.dropoff), ('stp_hn_gb', 'stp_th_pb'));
  });

  test('the hold carries the chosen segment and seats taken by others cannot be picked', () async {
    final store = storeWithServer();
    await store.loadTrips();
    store.chooseTrip(store.trips.single);
    expect(await store.loadSeatMap(), isNull);
    expect(store.decks, [1, 2]);
    expect(store.deckSeats(1)['A01'], SeatState.booked);
    expect(store.freeOnDeck(1), 1);
    store.toggleSeat('A02');
    expect(await store.holdSeats(), isNull);
    expect(bodyOf('/seats/hold'), {'seatCodes': ['A02'], 'pickupStopId': 'stp_hn_gb', 'dropoffStopId': 'stp_th_pb'});
    expect(store.holdPhase, 'hold');
    store.stopHold();
  });

  test('no ticket before the bank confirms; after it the wallet ticket becomes the receipt', () async {
    final store = storeWithServer();
    await store.verifyOtp('0987654321', '123456');
    await store.loadTrips();
    store.chooseTrip(store.trips.single);
    await store.loadSeatMap();
    store.toggleSeat('A02');
    await store.holdSeats();
    expect(await store.createOrder('Nguyễn An', '0987654321'), isNull);
    expect((store.orderPnr, store.orderAmount, store.transferMemo), ('BG-000001', 220000, 'BUSGO BG000001'));
    expect(store.holdPhase, 'pay');
    expect(await store.checkPayment(manual: true), isFalse);
    expect(bodyOf('/verify-status'), {'manualTrigger': true});
    paid = true;
    expect(await store.checkPayment(), isTrue);
    expect(store.lastTicket!.pnr, 'BG-000001');
    expect(store.lastTicket!.plate, '29B-123.45');
    expect(store.tickets.single.route, 'Hà Nội → Thanh Hóa');
    expect(store.holdPhase, isNull);
  });

  test('the pass shows the server QR and PIN; a boarded ticket stays in upcoming as Đã lên xe', () async {
    final store = storeWithServer();
    paid = true;
    await store.verifyOtp('0987654321', '123456');
    final t = store.tickets.isEmpty ? (await store.loadTickets().then((_) => store.tickets.single)) : store.tickets.single;
    expect(await store.loadPass(t), isNull);
    expect(t.qrValue, startsWith('BUSGO|BG-000001|'));
    expect(t.pin, '123456');
    ticketStatus = 'BOARDED';
    await store.loadTickets();
    expect(store.tickets.single.status, TicketStatus.boarded);
    expect(store.tickets.single.active, isTrue);
  });

  test('a reissue after departure reports BOARDING_STARTED', () async {
    final store = storeWithServer();
    paid = true;
    await store.verifyOtp('0987654321', '123456');
    await store.loadTickets();
    final r = await store.reissueQr(store.tickets.single);
    expect(r.ok, isFalse);
    expect(r.code, 'BOARDING_STARTED');
  });

  test('a server that cannot be reached gives a readable error, not a crash', () async {
    final store = PassengerStore(api: PassengerApiClientService(baseUrl: 'http://test', client: MockClient((_) async => throw http.ClientException('down'))));
    expect(await store.requestOtp('0987654321'), contains('Không kết nối được'));
    await store.loadTrips();
    expect(store.tripsError, isNotNull);
  });

  test('vnd groups thousands with dots', () {
    expect(vnd(1250000), '1.250.000 đ');
    expect(vnd(-50000), '−50.000 đ');
  });
}
