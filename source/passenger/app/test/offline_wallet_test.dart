import 'dart:convert';

import 'package:app/src/presentation/passenger/passenger_home_screen.dart';
import 'package:app/src/presentation/passenger/passenger_payment_processing_screen.dart';
import 'package:app/src/presentation/passenger/passenger_permissions.dart';
import 'package:app/src/presentation/passenger/passenger_seat_map_screen.dart';
import 'package:app/src/presentation/passenger/passenger_store.dart';
import 'package:app/src/presentation/passenger/passenger_ticket_qr_screen.dart';
import 'package:app/src/presentation/passenger/passenger_wallet_screen.dart';
import 'package:data/src/service/passenger_api_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'fake_permissions.dart';

void main() {
  setUp(() {
    passengerPermissions = FakePassengerPermissions();
    SharedPreferences.setMockInitialValues({});
  });

  String tokenExpiring(DateTime exp) =>
      'pax_jwt_${base64Url.encode(utf8.encode(jsonEncode({'sub': 'usr_1', 'kind': 'passenger', 'exp': exp.millisecondsSinceEpoch}))).replaceAll('=', '')}.sig';

  final ticketRaw = {
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
    'order_id': 'ord_1',
  };

  MockClient makeMockClient({bool Function()? isOnline}) {
    return MockClient((req) async {
      if (isOnline != null && !isOnline()) {
        throw http.ClientException('Network down');
      }
      final path = req.url.path;
      if (path.endsWith('/app/config')) {
        return http.Response(
          jsonEncode({
            'status': 'success',
            'data': {
              'operator': {
                'operator_id': 'op1',
                'code': 'SAOMAI',
                'name': 'Nhà xe Sao Mai',
                'short_name': 'Sao Mai',
                'hotline': '1900 6868',
              },
              'service_calendar': {
                'today': '2026-10-11',
                'last_date': '2026-11-10',
              },
              'fixed_endpoints': null,
            },
          }),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      }
      if (path.endsWith('/otp/request')) {
        return http.Response(jsonEncode({'status': 'success', 'data': {'mock_otp': '123456'}}), 200, headers: {'content-type': 'application/json; charset=utf-8'});
      }
      if (path.endsWith('/otp/verify')) {
        return http.Response(
          jsonEncode({
            'status': 'success',
            'data': {
              'token': tokenExpiring(DateTime.now().add(const Duration(hours: 2))),
              'user': {
                'full_name': 'Nguyễn An',
                'operator': {'code': 'SAOMAI'},
              },
            },
          }),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      }
      if (path.endsWith('/passenger/tickets')) {
        final tab = req.url.queryParameters['tab'];
        return http.Response(
          jsonEncode({
            'status': 'success',
            'data': tab == 'UPCOMING' ? [ticketRaw] : [],
          }),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      }
      if (path.endsWith('/tickets/tkt_BG1_A02')) {
        return http.Response(
          jsonEncode({
            'status': 'success',
            'data': {
              'ticket': ticketRaw,
              'boarding_qr': {'qr_code_value': 'BUSGO|BG-000001|tkt_BG1_A02|v1|abc', 'version': 1},
              'offline_pin': '123456',
            },
          }),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      }
      if (path.endsWith('/disruptions')) {
        return http.Response(jsonEncode({'status': 'success', 'data': {'has_disruption': false}}), 200, headers: {'content-type': 'application/json; charset=utf-8'});
      }
      if (path.endsWith('/routes/stops/search')) {
        return http.Response(
          jsonEncode({
            'status': 'success',
            'data': [
              {'stop_id': 's1', 'name': 'Bến xe Giáp Bát', 'city': 'Hà Nội', 'popular': true},
              {'stop_id': 's2', 'name': 'Bến xe Phía Bắc', 'city': 'Thanh Hóa', 'popular': true},
            ],
          }),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      }
      if (path.endsWith('/notifications') || path.endsWith('/trips/run-days') || path.endsWith('/promo-banners')) {
        return http.Response(jsonEncode({'status': 'success', 'data': []}), 200, headers: {'content-type': 'application/json; charset=utf-8'});
      }
      return http.Response(jsonEncode({'status': 'success', 'data': {}}), 200, headers: {'content-type': 'application/json; charset=utf-8'});
    });
  }

  test('load tickets online, then the client throws -> loadTickets() keeps tickets and walletOfflineSince is set', () async {
    var online = true;
    final client = makeMockClient(isOnline: () => online);
    final store = PassengerStore(api: PassengerApiClientService(baseUrl: 'http://test', client: client));

    await store.selectOperator('SAOMAI');
    await store.verifyOtp('0987654321', '123456');

    // Online load
    await store.loadTickets();
    expect(store.tickets.length, 1);
    expect(store.walletOfflineSince, isNull);

    // Client throws (network down)
    online = false;
    await store.loadTickets();
    // Keeps the tickets in memory
    expect(store.tickets.length, 1);
    expect(store.tickets.first.id, 'tkt_BG1_A02');
    // walletOfflineSince is set
    expect(store.walletOfflineSince, isNotNull);
  });

  test('a new store instance whose client always throws: restoreOperator() restores operator and session, and loadTickets() shows cached tickets with qrValue', () async {
    // 1. First run with online store to populate cache
    {
      final client = makeMockClient(isOnline: () => true);
      final onlineStore = PassengerStore(api: PassengerApiClientService(baseUrl: 'http://test', client: client));
      await onlineStore.selectOperator('SAOMAI');
      await onlineStore.verifyOtp('0987654321', '123456');
      await onlineStore.loadTickets();
      expect(onlineStore.tickets.isNotEmpty, isTrue);
      // Load pass so qrValue is cached
      await onlineStore.loadPass(onlineStore.tickets.first);
      expect(onlineStore.tickets.first.qrValue, 'BUSGO|BG-000001|tkt_BG1_A02|v1|abc');
    }

    // 2. Now a new store instance with a client that always throws
    final throwingClient = MockClient((_) async => throw http.ClientException('offline'));
    final offlineStore = PassengerStore(api: PassengerApiClientService(baseUrl: 'http://test', client: throwingClient));

    // restoreOperator restores operator and session from cache
    await offlineStore.restoreOperator();
    expect(offlineStore.operator, isNotNull);
    expect(offlineStore.operator?.code, 'SAOMAI');
    expect(offlineStore.loggedIn, isTrue);
    expect(offlineStore.userPhone, '0987654321');

    // loadTickets shows cached tickets with qrValue
    await offlineStore.loadTickets();
    expect(offlineStore.tickets.length, 1);
    expect(offlineStore.tickets.first.id, 'tkt_BG1_A02');
    expect(offlineStore.tickets.first.qrValue, 'BUSGO|BG-000001|tkt_BG1_A02|v1|abc');
    expect(offlineStore.walletOfflineSince, isNotNull);
  });

  testWidgets('loadPass offline with cached QR returns null and sets qrFromCache; QR screen shows QR and offline note', (tester) async {
    // 1. Populate cache online
    {
      final client = makeMockClient(isOnline: () => true);
      final store = PassengerStore(api: PassengerApiClientService(baseUrl: 'http://test', client: client));
      await store.selectOperator('SAOMAI');
      await store.verifyOtp('0987654321', '123456');
      await store.loadTickets();
      await store.loadPass(store.tickets.first);
    }

    // 2. Offline store
    final throwingClient = MockClient((_) async => throw http.ClientException('offline'));
    final offlineStore = PassengerStore(api: PassengerApiClientService(baseUrl: 'http://test', client: throwingClient));
    await offlineStore.restoreOperator();
    await offlineStore.loadTickets();

    final ticket = offlineStore.tickets.first;
    expect(ticket.qrValue, 'BUSGO|BG-000001|tkt_BG1_A02|v1|abc');

    // loadPass offline with cached QR returns null and sets qrFromCache
    final err = await offlineStore.loadPass(ticket);
    expect(err, isNull);
    expect(ticket.qrFromCache, isTrue);

    // Widget test: QR screen shows QrImageView and offline note
    await tester.pumpWidget(MaterialApp(
      home: PassengerScope(
        store: offlineStore,
        child: PassengerTicketQrScreen(ticket: ticket),
      ),
    ));
    await tester.pump();

    expect(find.byType(QrImageView), findsOneWidget);
    expect(
      find.text('Đang không có mạng — đây là mã QR đã lưu trên máy. Mã vẫn dùng được nếu bạn chưa đổi mã.'),
      findsOneWidget,
    );

    await tester.pumpWidget(const SizedBox());
  });

  test('logout() removes the wallet key from prefs', () async {
    final client = makeMockClient(isOnline: () => true);
    final store = PassengerStore(api: PassengerApiClientService(baseUrl: 'http://test', client: client));
    await store.selectOperator('SAOMAI');
    await store.verifyOtp('0987654321', '123456');
    await store.loadTickets();

    final prefs = await SharedPreferences.getInstance();
    expect(prefs.containsKey('wallet_SAOMAI_0987654321'), isTrue);

    // Logout
    await store.logout();
    expect(prefs.containsKey('wallet_SAOMAI_0987654321'), isFalse);
  });

  testWidgets('wallet screen shows offline banner when walletOfflineSince is set', (tester) async {
    final throwingClient = MockClient((_) async => throw http.ClientException('offline'));
    final store = PassengerStore(api: PassengerApiClientService(baseUrl: 'http://test', client: throwingClient));
    store.userPhone = '0987654321';
    store.tickets = [Ticket.fromJson(ticketRaw)];
    store.walletOfflineSince = DateTime.utc(2026, 10, 29, 7, 5); // 14:05 VN time

    await tester.pumpWidget(MaterialApp(
      home: PassengerScope(
        store: store,
        child: const Scaffold(body: PassengerWalletScreen()),
      ),
    ));
    await tester.pump();

    expect(find.text('Không có mạng — vé đã lưu lúc 14:05'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });

  // ---------- D178: Stations offline (G) ----------
  testWidgets('G: online load caches stations; offline new store gets places from cache; no cache sets placesError and home screen shows Thử lại', (tester) async {
    final client = makeMockClient(isOnline: () => true);
    final store = PassengerStore(api: PassengerApiClientService(baseUrl: 'http://test', client: client));
    await store.selectOperator('SAOMAI');
    await store.loadPlaces();

    final prefs = await SharedPreferences.getInstance();
    expect(prefs.containsKey('stations_SAOMAI'), isTrue);

    // Offline new store gets places from cache
    final throwingClient = MockClient((_) async => throw http.ClientException('offline'));
    final offlineStore = PassengerStore(api: PassengerApiClientService(baseUrl: 'http://test', client: throwingClient));
    await offlineStore.restoreOperator();
    await offlineStore.loadPlaces();

    expect(offlineStore.places.isNotEmpty, isTrue);
    expect(offlineStore.placesError, isNull);
    expect(offlineStore.places.values.any((p) => p.city == 'Hà Nội'), isTrue);

    // With no cache, placesError is set and home screen shows 'Thử lại'
    await prefs.remove('stations_SAOMAI');
    final noCacheStore = PassengerStore(api: PassengerApiClientService(baseUrl: 'http://test', client: throwingClient));
    await noCacheStore.restoreOperator();
    await noCacheStore.loadPlaces();

    expect(noCacheStore.placesError, isNotNull);

    await tester.pumpWidget(MaterialApp(
      home: PassengerScope(
        store: noCacheStore,
        child: const Scaffold(body: PassengerHomeScreen()),
      ),
    ));
    await tester.pump();

    expect(find.text('Thử lại'), findsOneWidget);
    expect(find.text(noCacheStore.placesError!), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });

  // ---------- D178: Seat map retry (H) ----------
  testWidgets('H: seat map error shows "Thử lại" and tapping it reloads (request count increments)', (tester) async {
    int seatMapRequests = 0;
    final client = MockClient((req) async {
      if (req.url.path.contains('/seat-map')) {
        seatMapRequests++;
        throw http.ClientException('Network down');
      }
      return http.Response(jsonEncode({'status': 'success', 'data': {}}), 200, headers: {'content-type': 'application/json; charset=utf-8'});
    });
    final store = PassengerStore(api: PassengerApiClientService(baseUrl: 'http://test', client: client));
    store.trip = Trip.fromJson({
      'trip_id': 'trp_test_01',
      'vehicle_title': 'Giường nằm 34 chỗ',
      'vehicle_type': 'SLEEPER_34',
      'plate_number': '29B-123.45',
      'departure_time': '2026-08-28T07:00:00+07:00',
      'arrival_time': '2026-08-28T10:00:00+07:00',
      'duration_minutes': 180,
      'base_fare_vnd': 220000,
      'available_seats_count': 30,
      'stops': [
        {'stop_id': 'stp_1', 'name': 'Bến xe Giáp Bát', 'city': 'Hà Nội', 'order': 1, 'pickup_allowed': true, 'dropoff_allowed': false},
        {'stop_id': 'stp_2', 'name': 'Bến xe Phía Bắc', 'city': 'Thanh Hóa', 'order': 2, 'pickup_allowed': false, 'dropoff_allowed': true},
      ],
      'service': {'stop_style': 'ROUTE_LINE', 'pickup_modes': ['FIXED_STOP'], 'dropoff_modes': ['FIXED_LOCATION']},
    });
    store.pickup = 'stp_1';
    store.dropoff = 'stp_2';

    await tester.pumpWidget(MaterialApp(
      home: PassengerScope(
        store: store,
        child: const PassengerSeatMapScreen(),
      ),
    ));
    await tester.pumpAndSettle();

    expect(seatMapRequests, 1);
    final retryBtn = find.text('Thử lại');
    expect(retryBtn, findsOneWidget);

    await tester.tap(retryBtn);
    await tester.pumpAndSettle();

    expect(seatMapRequests, 2);
    expect(find.text('Thử lại'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });

  // ---------- D178: Payment offline error text (I) ----------
  testWidgets('I: manual check while the client throws shows the network text, not "chưa nhận được tiền"', (tester) async {
    final client = MockClient((req) async {
      throw http.ClientException('Network down');
    });
    final store = PassengerStore(api: PassengerApiClientService(baseUrl: 'http://test', client: client));
    store.orderId = 'ord_1';
    store.orderPnr = 'BG-000001';
    store.orderAmount = 220000;
    store.vietQrPayload = 'TEST_VIETQR';

    await tester.pumpWidget(MaterialApp(
      home: PassengerScope(
        store: store,
        child: const PassengerPaymentProcessingScreen(name: 'Nguyễn An', phone: '0987654321'),
      ),
    ));
    await tester.pump();

    final checkBtn = find.text('Tôi đã chuyển tiền, kiểm tra ngay');
    expect(checkBtn, findsOneWidget);

    await tester.tap(checkBtn);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(
      find.text('Không kết nối được máy chủ. Tiền bạn đã chuyển không mất — kiểm tra mạng rồi bấm lại.'),
      findsOneWidget,
    );
    expect(find.textContaining('Chưa nhận được tiền'), findsNothing);

    await tester.pumpWidget(const SizedBox());
  });
}
