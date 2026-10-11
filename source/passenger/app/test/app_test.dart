import 'dart:convert';

import 'package:app/main.dart';
import 'package:app/src/presentation/passenger/passenger_home_address_screen.dart';
import 'package:app/src/presentation/passenger/passenger_store.dart';
import 'package:app/src/presentation/passenger/passenger_payment_processing_screen.dart';
import 'package:app/src/presentation/passenger/passenger_checkout_screen.dart';
import 'package:app/src/presentation/passenger/passenger_seat_map_screen.dart';
import 'package:app/src/presentation/passenger/passenger_trip_detail_screen.dart';
import 'package:app/src/presentation/passenger/passenger_search_results_screen.dart';
import 'package:app/src/presentation/passenger/passenger_main_shell.dart';
import 'package:app/src/presentation/passenger/passenger_login_screen.dart';
import 'package:app/src/presentation/passenger/passenger_splash_screen.dart';
import 'package:app/src/presentation/passenger/passenger_ticket_qr_screen.dart';
import 'package:app/src/presentation/passenger/passenger_live_radar_screen.dart';
import 'package:app/src/presentation/passenger/passenger_route_map.dart';
import 'package:flutter/material.dart';
import 'package:data/src/service/passenger_api_service.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Rules of the passenger app state against a fake FleetBus server (shapes taken from the live API).
void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });
  passengerMapTiles = false;
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
    'dropoff_stop': 'Bến xe Phía Bắc Thanh Hóa',
    'status': 'ACTIVE',
  };

  late List<http.Request> sent;
  late bool paid;
  late String ticketStatus;

  Future<PassengerStore> storeWithServer({bool selectOp = true}) async {
    sent = [];
    paid = false;
    ticketStatus = 'ACTIVE';
    final client = MockClient((req) async {
      sent.add(req);
      Map<String, dynamic>? data;
      Object? list;
      final path = req.url.path;
      if (path.endsWith('/app/config')) {
        final code = req.url.queryParameters['operator'] ?? '';
        if (code == 'SAOMAI') {
          data = {'operator': {'operator_id': 'op1', 'code': 'SAOMAI', 'name': 'Nhà xe Sao Mai', 'short_name': 'Sao Mai', 'hotline': '1900 6868', 'primary_color': '#E11D48', 'pickup_modes': ['FIXED_STOP', 'HOME_PICKUP'], 'dropoff_modes': ['FIXED_LOCATION']}};
        } else if (code == 'XUYENVIET') {
          data = {'operator': {'operator_id': 'op2', 'code': 'XUYENVIET', 'name': 'Xuyên Việt Lines', 'short_name': 'Xuyên Việt', 'hotline': '1900 2468', 'primary_color': '#2563EB'}};
        } else {
          return http.Response(jsonEncode({'status': 'error', 'code': 'OPERATOR_NOT_FOUND', 'message': 'Mã nhà xe không đúng'}), 404, headers: {'content-type': 'application/json; charset=utf-8'});
        }
      }
      if (path.endsWith('/routes/stops/search')) {
        final op = req.headers['x-operator-code'];
        if (op == 'XUYENVIET') {
          list = [
            {'stop_id': 'md', 'name': 'Bến xe Mỹ Đình', 'city': 'Hà Nội', 'popular': true},
            {'stop_id': 'nb', 'name': 'Bến xe Ninh Bình', 'city': 'Ninh Bình', 'popular': true},
            {'stop_id': 'th', 'name': 'Bến xe Phía Bắc', 'city': 'Thanh Hóa', 'popular': true},
          ];
        } else {
          list = [
            {'stop_id': 'gb', 'name': 'Bến xe Giáp Bát', 'city': 'Hà Nội', 'popular': true},
            {'stop_id': 'md', 'name': 'Bến xe Mỹ Đình', 'city': 'Hà Nội', 'popular': false},
            {'stop_id': 'nb', 'name': 'Bến xe Ninh Bình', 'city': 'Ninh Bình', 'popular': true},
            {'stop_id': 'th', 'name': 'Bến xe Phía Bắc', 'city': 'Thanh Hóa', 'popular': true},
            {'stop_id': 'hp', 'name': 'Bến xe Niệm Nghĩa', 'city': 'Hải Phòng', 'popular': true},
          ];
        }
      }
      if (path.endsWith('/otp/request')) data = {'mock_otp': '123456'};
      if (path.endsWith('/otp/verify')) {
        data = {'token': 'tok', 'user': {'full_name': 'Hành khách BusGo', 'operator': {'code': req.headers['x-operator-code'] ?? 'SAOMAI'}}};
      }
      if (path.endsWith('/service-config')) {
        data = {
          'pickup_modes': ['FIXED_STOP', 'HOME_PICKUP'],
          'dropoff_modes': ['FIXED_LOCATION'],
          'service_areas': [
            {'area_id': 'sa_hn', 'name': 'Nội thành Hà Nội', 'kind': 'PICKUP', 'polygon': [[21.075, 105.755], [21.075, 105.885], [20.945, 105.885], [20.945, 105.755]], 'fee_vnd': 50000, 'lead_time_minutes': 120, 'service_hours': {'from': '04:30', 'to': '22:00'}},
          ],
        };
      }
      if (path.endsWith('/service-areas/check')) {
        final body = jsonDecode(req.body) as Map<String, dynamic>;
        if ((body['lat'] as num) > 21.075) {
          return http.Response(jsonEncode({'status': 'error', 'code': 'OUTSIDE_SERVICE_AREA', 'message': 'Địa chỉ nằm ngoài vùng phục vụ'}), 422, headers: {'content-type': 'application/json; charset=utf-8'});
        }
        data = {'serviceable': true, 'area_id': 'sa_hn', 'area_name': 'Nội thành Hà Nội', 'fee_vnd': 50000};
      }
      if (path.endsWith('/tickets/tkt_BG1_A02/share')) data = {'share_token': 'abc', 'share_url': '/t/abc'};
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
    final store = PassengerStore(api: PassengerApiClientService(baseUrl: 'http://test', client: client));
    if (selectOp) {
      await store.selectOperator('SAOMAI');
    }
    return store;
  }

  Map<String, dynamic> bodyOf(String suffix) => jsonDecode(sent.lastWhere((r) => r.url.path.endsWith(suffix)).body) as Map<String, dynamic>;

  test('OTP: the development code is kept for the field and the token logs in', () async {
    final store = await storeWithServer();
    expect(await store.requestOtp('0987654321'), isNull);
    expect(store.devOtp, '123456');
    expect(await store.verifyOtp('0987654321', '123456'), isNull);
    expect(store.loggedIn, isTrue);
    expect(store.userName, isNull, reason: 'the placeholder name is not shown as the user name');
  });

  test('search maps trips and spreads stop times between departure and arrival', () async {
    final store = await storeWithServer();
    await store.loadTrips();
    expect(store.trips, hasLength(1));
    final t = store.trips.single;
    expect((t.dep, t.arr, t.duration, t.price), ('07:00', '10:00', '3 giờ', 220000));
    expect(t.stops.map((s) => s.time), ['07:00', '08:30', '10:00']);
    store.chooseTrip(t);
    expect((store.pickup, store.dropoff), ('stp_hn_gb', 'stp_th_pb'));
  });

  test('the hold carries the chosen segment and seats taken by others cannot be picked', () async {
    final store = await storeWithServer();
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

  test('home pickup: the server checks the pinned address, the ride starts at the first stop and the order carries it', () async {
    final store = await storeWithServer();
    expect(store.operator!.homePickup, isTrue);
    expect(store.operator!.homeDropoff, isFalse);
    await store.verifyOtp('0987654321', '123456');
    await store.loadTrips();
    store.chooseTrip(store.trips.single);
    await Future<void>.delayed(Duration.zero);
    expect(store.serviceAreas.single.feeVnd, 50000);
    store.setPickup('stp_nb');

    expect(await store.setHomeAddress(pickupSide: true, address: '  ', lat: 21.0, lng: 105.8), 'Nhập địa chỉ để tài xế tìm được bạn');
    expect(await store.setHomeAddress(pickupSide: true, address: 'Sóc Sơn', lat: 21.25, lng: 105.85), 'Địa chỉ nằm ngoài vùng phục vụ');
    expect(store.homePickup, isNull);

    expect(await store.setHomeAddress(pickupSide: true, address: '12 ngõ 34 Giải Phóng', lat: 20.99, lng: 105.84, note: 'cổng xanh'), isNull);
    expect(bodyOf('/service-areas/check'), {'kind': 'PICKUP', 'lat': 20.99, 'lng': 105.84, 'trip_id': 'trp_hn_th_01'});
    expect(store.pickup, 'stp_hn_gb', reason: 'a home pickup rides from the first stop');
    expect(store.homeFees, 50000);

    await store.loadSeatMap();
    store.toggleSeat('A02');
    await store.holdSeats();
    expect(await store.createOrder('Nguyễn An', '0987654321'), isNull);
    expect(bodyOf('/bookings/create')['homePickup'], {'address': '12 ngõ 34 Giải Phóng', 'lat': 20.99, 'lng': 105.84, 'note': 'cổng xanh'});
    expect(bodyOf('/bookings/create').containsKey('homeDropoff'), isFalse);

    store.setPickup('stp_nb');
    expect(store.homePickup, isNull, reason: 'choosing a fixed stop drops the home address');
  });

  test('a ticket shows its home pickup and window, and a tracking link is made absolute', () async {
    final store = await storeWithServer();
    final t = Ticket.fromJson({
      ...ticket,
      'home_pickup': {'address': '12 ngõ 34 Giải Phóng', 'window_from': '2026-08-27T22:00:00Z', 'window_to': '2026-08-27T22:40:00Z'},
    });
    expect(t.homePickup, '12 ngõ 34 Giải Phóng');
    expect(t.pickupWindow, '05:00–05:40');
    expect(t.homeDropoff, isNull);
    final link = await store.shareTracking(t);
    expect(link.value, 'http://test/t/abc');
  });

  test('no ticket before the bank confirms; after it the wallet ticket becomes the receipt', () async {
    final store = await storeWithServer();
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
    final store = await storeWithServer();
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
    final store = await storeWithServer();
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

  testWidgets('the ticket screen turns to "Đã lên xe" after the fake server switches the ticket to BOARDED and the poll fires', (tester) async {
    final store = await storeWithServer();
    paid = true;
    await store.verifyOtp('0987654321', '123456');
    await store.loadTickets();
    final ticket = store.tickets.single;

    await tester.pumpWidget(MaterialApp(
      home: PassengerScope(
        store: store,
        child: PassengerTicketQrScreen(ticket: ticket),
      ),
    ));
    await tester.pumpAndSettle();

    expect(find.text('Hợp lệ'), findsOneWidget);
    
    // Switch the server to BOARDED
    ticketStatus = 'BOARDED';
    
    // Wait for the poll (10 seconds)
    await tester.pump(const Duration(seconds: 11));
    await tester.pumpAndSettle();
    
    expect(find.text('Đã lên xe'), findsWidgets); // Pill and text
    expect(find.text('Bạn đã lên xe. Vé không còn mã QR để dùng lại hay chia sẻ.'), findsOneWidget);
    
    // Cleanup pending timers
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('the radar shows Đã lên xe for a boarded ticket', (tester) async {
    final store = await storeWithServer();
    paid = true;
    await store.verifyOtp('0987654321', '123456');
    await store.loadTickets();
    final ticket = store.tickets.single;

    await tester.pumpWidget(MaterialApp(
      home: PassengerScope(
        store: store,
        child: PassengerLiveRadarScreen(ticket: ticket),
      ),
    ));
    await tester.pumpAndSettle();

    expect(find.text('Đến điểm đón'), findsOneWidget);
    expect(find.text('Cách điểm đón'), findsOneWidget);
    expect(find.byType(PassengerRouteMap), findsOneWidget);

    // Switch to boarded
    ticketStatus = 'BOARDED';
    
    // Wait for the radar's poll (10 seconds)
    await tester.pump(const Duration(seconds: 11));
    await tester.pumpAndSettle();
    
    expect(find.text('Trạng thái'), findsOneWidget);
    expect(find.text('Đã lên xe'), findsOneWidget);
    expect(find.text('Điểm trả'), findsOneWidget);
    expect(find.text('Phía Bắc Thanh Hóa'), findsOneWidget);
    expect(find.byType(PassengerRouteMap), findsOneWidget);
    
    // Cleanup pending timers
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('phones and tablets use the full screen; only desktop widths get a 1280 dp frame', (tester) async {
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    tester.view.devicePixelRatio = 1.0;
    final store = await storeWithServer(selectOp: false);
    for (final (size, width) in const [(Size(1500, 1000), 1280.0), (Size(1200, 768), 1200.0), (Size(768, 1200), 768.0), (Size(400, 800), 400.0)]) {
      tester.view.physicalSize = size;
      await tester.pumpWidget(BusGoPassengerApp(store: store));
      await tester.pumpAndSettle();
      expect(tester.getSize(find.byType(Scaffold)).width, width, reason: '$size');
    }
    await tester.pumpWidget(const SizedBox());
  });

  // ROD2 tablet in landscape (1200x768 dp) and portrait (768x1200 dp), and a phone.
  for (final (name, size) in const [('landscape tablet', Size(1200, 768)), ('portrait tablet', Size(768, 1200)), ('phone', Size(390, 844))]) {
    testWidgets('every passenger screen lays out without overflow on a $name', (tester) async {
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
        tester.platformDispatcher.clearTextScaleFactorTestValue();
      });
      tester.view.physicalSize = size;
      tester.view.devicePixelRatio = 1.0;
      // The test font draws every glyph 1 em wide; Geist averages about 0.6 em, so scale text to match it.
      tester.platformDispatcher.textScaleFactorTestValue = 0.6;
      final store = await storeWithServer();
      paid = true;
      await store.verifyOtp('0987654321', '123456');
      await store.loadTrips();
      store.chooseTrip(store.trips.single);
      await store.loadSeatMap();
      store.toggleSeat('A02');
      await store.holdSeats();
      await store.createOrder('Nguyễn An', '0987654321');
      await store.loadTickets();
      final ticket = store.tickets.single;
      await store.loadPass(ticket);

      final unselectedStore = await storeWithServer(selectOp: false);

      final screens = <Widget>[
        PassengerScope(store: unselectedStore, child: const PassengerSplashScreen()),
        PassengerScope(store: store, child: const PassengerSplashScreen()),
        PassengerScope(store: store, child: const PassengerLoginScreen()),
        PassengerScope(store: store, child: const PassengerMainShell()),
        PassengerScope(store: store, child: const PassengerMainShell(initialTab: 1)),
        PassengerScope(store: store, child: const PassengerMainShell(initialTab: 3)),
        PassengerScope(store: store, child: const PassengerSearchResultsScreen()),
        PassengerScope(store: store, child: const PassengerTripDetailScreen()),
        PassengerScope(store: store, child: const PassengerHomeAddressScreen(pickupSide: true)),
        PassengerScope(store: store, child: const PassengerSeatMapScreen()),
        PassengerScope(store: store, child: const PassengerCheckoutScreen()),
        PassengerScope(store: store, child: const PassengerPaymentProcessingScreen(name: 'Nguyễn An', phone: '0987654321')),
        PassengerScope(store: store, child: PassengerBookingSuccessScreen(ticket: ticket, phone: '0987654321')),
        PassengerScope(store: store, child: PassengerTicketQrScreen(ticket: ticket)),
        PassengerScope(store: store, child: PassengerLiveRadarScreen(ticket: ticket)),
      ];
      for (final screen in screens) {
        await tester.pumpWidget(MaterialApp(builder: phoneColumnBuilder, home: screen));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 100));
        expect(tester.takeException(), isNull, reason: '${screen.runtimeType} on $name');
      }
      await tester.pumpWidget(const SizedBox());
      store.stopHold();
    });
  }
}
