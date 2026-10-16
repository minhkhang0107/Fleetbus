import 'dart:convert';

import 'package:app/main.dart';
import 'package:app/src/presentation/passenger/passenger_date_picker.dart';
import 'package:app/src/presentation/passenger/passenger_home_address_screen.dart';
import 'package:app/src/presentation/passenger/passenger_store.dart';
import 'package:app/src/presentation/passenger/passenger_payment_processing_screen.dart';
import 'package:app/src/presentation/passenger/passenger_checkout_screen.dart';
import 'package:app/src/presentation/passenger/passenger_seat_map_screen.dart';
import 'package:app/src/presentation/passenger/passenger_trip_detail_screen.dart';
import 'package:app/src/presentation/passenger/passenger_search_results_screen.dart';
import 'package:app/src/presentation/passenger/passenger_main_shell.dart';
import 'package:app/src/presentation/passenger/passenger_wallet_screen.dart';
import 'package:app/src/presentation/passenger/passenger_home_screen.dart';
import 'package:app/src/presentation/passenger/passenger_location_picker_screen.dart';
import 'package:app/src/presentation/passenger/passenger_login_screen.dart';
import 'package:app/src/presentation/passenger/passenger_splash_screen.dart';
import 'package:app/src/presentation/passenger/passenger_ticket_qr_screen.dart';
import 'package:app/src/presentation/passenger/passenger_live_radar_screen.dart';
import 'package:app/src/presentation/passenger/passenger_route_map.dart';
import 'package:app/src/presentation/passenger/passenger_widgets.dart';
import 'package:app/src/presentation/passenger/passenger_promo_screen.dart';
import 'package:app/src/presentation/passenger/passenger_profile_screen.dart';
import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:data/src/service/passenger_api_service.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:app/src/presentation/passenger/passenger_permissions.dart';

import 'fake_permissions.dart';

/// Rules of the passenger app state against a fake FleetBus server (shapes taken from the live API).
void main() {
  setUp(() => passengerPermissions = FakePassengerPermissions());
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
    'service': {'stop_style': 'ROUTE_LINE', 'pickup_modes': ['FIXED_STOP', 'HOME_PICKUP'], 'dropoff_modes': ['FIXED_LOCATION']},
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
    'order_id': 'ord_1',
  };

  late List<http.Request> sent;
  late bool paid;
  late String ticketStatus;
  // Days the fake server says have a departure on the route; null answers nothing (old servers).
  List<String>? runDaysAnswer;
  // The company's fixed origin and destination in the app config (D135); null = passengers pick places.
  Map<String, dynamic>? fixedEndpointsAnswer;
  // Custom seat map answer for tests; null = default fake layout.
  Map<String, dynamic>? seatMapAnswer;
  // History tickets for wallet tests; null = empty.
  List<Map<String, dynamic>>? historyTicketsAnswer;
  // Tracking answer for radar tests; null = empty.
  Map<String, dynamic>? trackingAnswer;
  // Custom group QR answer for tests; null = default fake group QR.
  Map<String, dynamic>? groupQrAnswer;
  // Whether qr/reissue is allowed or refused with BOARDING_STARTED.
  bool reissueAllowed = false;

  Future<PassengerStore> storeWithServer({bool selectOp = true}) async {
    sent = [];
    paid = false;
    ticketStatus = 'ACTIVE';
    historyTicketsAnswer = null;
    trackingAnswer = null;
    groupQrAnswer = null;
    reissueAllowed = false;
    final client = MockClient((req) async {
      sent.add(req);
      Map<String, dynamic>? data;
      Object? list;
      final path = req.url.path;
      if (path.endsWith('/app/config')) {
        final code = req.url.queryParameters['operator'] ?? '';
        if (code == 'SAOMAI') {
          data = {'operator': {'operator_id': 'op1', 'code': 'SAOMAI', 'name': 'Nhà xe Sao Mai', 'short_name': 'Sao Mai', 'hotline': '1900 6868', 'primary_color': '#E11D48', 'pickup_modes': ['FIXED_STOP', 'HOME_PICKUP'], 'dropoff_modes': ['FIXED_LOCATION']}, 'service_calendar': {'timezone': 'Asia/Ho_Chi_Minh', 'today': '2026-10-11', 'booking_window_days': 30, 'last_date': '2026-11-10', 'demo_dates': ['2026-08-28']}, 'fixed_endpoints': fixedEndpointsAnswer};
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
      if (path.endsWith('/trips/run-days') && runDaysAnswer != null) data = {'days': runDaysAnswer};
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
      if (path.endsWith('/trips/search')) {
        if (req.url.queryParameters['date'] == '2026-10-12') {
          return http.Response(jsonEncode({'status': 'error', 'code': 'DATE_IN_PAST', 'message': 'Ngày đi đã qua'}), 400, headers: {'content-type': 'application/json; charset=utf-8'});
        }
        list = [trip];
      }
      if (path.endsWith('/seat-map')) {
        data = seatMapAnswer ?? {
          'layout_id': 'lay_2deck_3col',
          'total_decks': 2,
          'columns': 3,
          'seats': [
            {'seat_code': 'A01', 'deck': 1, 'row': 1, 'column': 1, 'type': 'VIP_CABIN', 'state': 'BOOKED', 'segment_state': 'BOOKED'},
            {'seat_code': 'A02', 'deck': 1, 'row': 2, 'column': 1, 'type': 'VIP_CABIN', 'state': 'AVAILABLE', 'segment_state': 'AVAILABLE'},
            {'seat_code': 'B01', 'deck': 2, 'row': 1, 'column': 3, 'type': 'VIP_CABIN', 'state': 'AVAILABLE', 'segment_state': 'AVAILABLE'},
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
      if (path.endsWith('/passenger/tickets')) {
        final tab = req.url.queryParameters['tab'];
        if (tab == 'UPCOMING') {
          list = paid ? [{...ticket, 'status': ticketStatus}] : [];
        } else if (tab == 'HISTORY') {
          list = historyTicketsAnswer ?? [];
        } else {
          list = [];
        }
      }
      if (path.endsWith('/disruptions')) data = {'has_disruption': false};
      if (path.endsWith('/notifications')) list = [];
      if (path.endsWith('/tickets/tkt_BG1_A02') || (path.contains('/tickets/') && !path.contains('/qr') && !path.contains('/share') && !path.contains('/delegate'))) {
        data = {'ticket': {...ticket, 'status': ticketStatus}, 'boarding_qr': {'qr_code_value': 'BUSGO|BG-000001|tkt_BG1_A02|v1|abc', 'version': 1}, 'offline_pin': '123456'};
      }
      if (path.contains('/orders/') && path.endsWith('/group-qr')) {
        data = groupQrAnswer ?? {
          'pnr': 'BG-000001',
          'order_id': 'ord_1',
          'total_tickets': 2,
          'active_tickets_count': 2,
          'group_qr': {'qr_code_value': 'BUSGO_GRP|BG-000001|ord_1|2|members|sig'},
        };
      }
      if (path.endsWith('/qr/reissue')) {
        if (!reissueAllowed) {
          return http.Response(jsonEncode({'status': 'error', 'code': 'BOARDING_STARTED', 'message': 'Chuyến đã xuất bến'}), 409, headers: {'content-type': 'application/json; charset=utf-8'});
        }
        data = {
          'boarding_qr': {'qr_code_value': 'BUSGO|BG-000001|tkt_reissued|v2|sig', 'version': 2},
          'offline_pin': '123456',
        };
      }
      if (path.contains('/tracking')) data = trackingAnswer ?? {};
      return http.Response(jsonEncode({'status': 'success', 'data': list ?? data ?? {}}), 200, headers: {'content-type': 'application/json; charset=utf-8'});
    });
    final store = PassengerStore(api: PassengerApiClientService(baseUrl: 'http://test', client: client));
    if (selectOp) {
      await store.selectOperator('SAOMAI');
    }
    return store;
  }

  Map<String, dynamic> bodyOf(String suffix) => jsonDecode(sent.lastWhere((r) => r.url.path.endsWith(suffix)).body) as Map<String, dynamic>;

  test('validPhone and normalizePhone accept Vietnamese mobile numbers and reject invalid prefixes', () {
    expect(validPhone('+84 912 345 678'), isTrue);
    expect(normalizePhone('+84 912 345 678'), '0912345678');
    expect(validPhone('0912.345.678'), isTrue);
    expect(normalizePhone('0912.345.678'), '0912345678');
    expect(validPhone('0123456789'), isFalse);
  });

  test('nameError validates person name according to server rules', () {
    expect(nameError('Lê Văn A'), isNull);
    expect(nameError('A'), 'Họ tên cần 2-60 ký tự.');
    expect(nameError('Nam 123'), 'Họ tên không được chứa số hoặc ký tự đặc biệt.');
    expect(nameError('<b>'), 'Họ tên không được chứa số hoặc ký tự đặc biệt.');
  });

  testWidgets('the checkout screen shows the name error for "A"', (tester) async {
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
      tester.platformDispatcher.clearTextScaleFactorTestValue();
    });
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1.0;
    tester.platformDispatcher.textScaleFactorTestValue = 0.6;

    final store = await storeWithServer();
    await store.verifyOtp('0987654321', '123456');
    await store.loadTrips();
    store.chooseTrip(store.trips.single);
    await store.loadSeatMap();
    store.toggleSeat('A02');
    await store.holdSeats();

    await tester.pumpWidget(MaterialApp(
      builder: phoneColumnBuilder,
      home: PassengerScope(store: store, child: const PassengerCheckoutScreen()),
    ));
    await tester.pump();

    await tester.enterText(find.byType(TextField).first, 'A');
    await tester.tap(find.text('Tạo mã thanh toán'));
    await tester.pump();

    expect(find.text('Họ tên cần 2-60 ký tự.'), findsOneWidget);
    store.stopHold();
  });

  test('OTP: the development code is kept for the field and the token logs in', () async {
    final store = await storeWithServer();
    expect(await store.requestOtp('0987654321'), isNull);
    expect(store.devOtp, '123456');
    expect(await store.verifyOtp('0987654321', '123456'), isNull);
    expect(store.loggedIn, isTrue);
    expect(store.userName, isNull, reason: 'the placeholder name is not shown as the user name');
  });

  testWidgets('a logged-in passenger without a name sees "Khách BusGo", not "Chưa đăng nhập"', (tester) async {
    final store = await storeWithServer();
    await store.verifyOtp('0987654321', '123456');
    expect(store.loggedIn, isTrue);
    expect(store.userName, isNull);

    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: PassengerScope(store: store, child: const PassengerProfileScreen()),
      ),
    ));
    await tester.pump();

    expect(find.text('Khách BusGo'), findsOneWidget);
    expect(find.text('Chưa đăng nhập'), findsNothing);
    expect(find.byIcon(Icons.person), findsOneWidget);
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

  testWidgets('seat map: 1-deck 5-column layout has no deck switch text and lays out without overflow at 360x800', (tester) async {
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
      seatMapAnswer = null;
    });
    tester.view.physicalSize = const Size(360, 800);
    tester.view.devicePixelRatio = 1.0;
    seatMapAnswer = {
      'layout_id': 'coach_45',
      'total_decks': 1,
      'columns': 5,
      'seats': [
        {'seat_code': 'S01', 'deck': 1, 'row': 1, 'column': 1, 'type': 'SEAT', 'state': 'AVAILABLE'},
        {'seat_code': 'S02', 'deck': 1, 'row': 1, 'column': 2, 'type': 'SEAT', 'state': 'AVAILABLE'},
        {'seat_code': 'S03', 'deck': 1, 'row': 1, 'column': 4, 'type': 'SEAT', 'state': 'AVAILABLE'},
        {'seat_code': 'S04', 'deck': 1, 'row': 1, 'column': 5, 'type': 'SEAT', 'state': 'AVAILABLE'},
        {'seat_code': 'S05', 'deck': 1, 'row': 2, 'column': 1, 'type': 'SEAT', 'state': 'AVAILABLE'},
        {'seat_code': 'S06', 'deck': 1, 'row': 2, 'column': 2, 'type': 'SEAT', 'state': 'AVAILABLE'},
        {'seat_code': 'S07', 'deck': 1, 'row': 2, 'column': 3, 'type': 'SEAT', 'state': 'AVAILABLE'},
        {'seat_code': 'S08', 'deck': 1, 'row': 2, 'column': 4, 'type': 'SEAT', 'state': 'AVAILABLE'},
        {'seat_code': 'S09', 'deck': 1, 'row': 2, 'column': 5, 'type': 'SEAT', 'state': 'AVAILABLE'},
      ],
    };

    final store = await storeWithServer();
    await store.loadTrips();
    store.chooseTrip(store.trips.single);
    await store.loadSeatMap();

    await tester.pumpWidget(MaterialApp(
      builder: phoneColumnBuilder,
      home: PassengerScope(store: store, child: const PassengerSeatMapScreen()),
    ));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.textContaining('Tầng'), findsNothing);
    expect(find.text('S01'), findsOneWidget);
    expect(find.text('S02'), findsOneWidget);
    expect(find.text('S03'), findsOneWidget);
    expect(find.text('S04'), findsOneWidget);
    expect(find.text('S05'), findsOneWidget);
    expect(find.text('S06'), findsOneWidget);
    expect(find.text('S07'), findsOneWidget);
    expect(find.text('S08'), findsOneWidget);
    expect(find.text('S09'), findsOneWidget);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('seat map: 2-deck 3-column layout shows both deck titles and B01 sits right of A01', (tester) async {
    addTearDown(() {
      seatMapAnswer = null;
    });
    seatMapAnswer = {
      'layout_id': 'cabin_22',
      'total_decks': 2,
      'columns': 3,
      'seats': [
        {'seat_code': 'A01', 'deck': 1, 'row': 1, 'column': 1, 'type': 'VIP_CABIN', 'state': 'AVAILABLE'},
        {'seat_code': 'B01', 'deck': 1, 'row': 1, 'column': 3, 'type': 'VIP_CABIN', 'state': 'AVAILABLE'},
        {'seat_code': 'A02', 'deck': 2, 'row': 1, 'column': 1, 'type': 'VIP_CABIN', 'state': 'AVAILABLE'},
        {'seat_code': 'B02', 'deck': 2, 'row': 1, 'column': 3, 'type': 'VIP_CABIN', 'state': 'AVAILABLE'},
      ],
    };

    final store = await storeWithServer();
    await store.loadTrips();
    store.chooseTrip(store.trips.single);
    await store.loadSeatMap();

    await tester.pumpWidget(MaterialApp(
      builder: phoneColumnBuilder,
      home: PassengerScope(store: store, child: const PassengerSeatMapScreen()),
    ));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.textContaining('Tầng dưới'), findsWidgets);
    expect(find.textContaining('Tầng trên'), findsWidgets);
    final a01 = tester.getCenter(find.text('A01'));
    final b01 = tester.getCenter(find.text('B01'));
    expect(b01.dx, greaterThan(a01.dx));
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
  });

  test('deckTitle helper formats single deck, 2 decks, and 3 decks correctly', () {
    expect(PassengerSeatMapScreen.deckTitle([1], 1, 9), '9 ghế trống');
    expect(PassengerSeatMapScreen.deckTitle([1, 2], 1, 5), 'Tầng dưới · 5 trống');
    expect(PassengerSeatMapScreen.deckTitle([1, 2], 2, 4), 'Tầng trên · 4 trống');
    expect(PassengerSeatMapScreen.deckTitle([1, 2, 3], 1, 3), 'Tầng 1 · 3 trống');
    expect(PassengerSeatMapScreen.deckTitle([1, 2, 3], 2, 2), 'Tầng 2 · 2 trống');
    expect(PassengerSeatMapScreen.deckTitle([1, 2, 3], 3, 1), 'Tầng 3 · 1 trống');
  });

  test('travel days come from the server calendar: today by default, nothing outside the window, sent as YYYY-MM-DD', () async {
    final store = await storeWithServer();
    expect(store.calendar.today, '2026-10-11');
    expect(store.date, '2026-10-11');
    expect(store.travelDate.long, 'Chủ Nhật, 11/10/2026');
    expect(store.travelDate.relative, 'Hôm nay');
    expect(store.bookableDates.length, 31, reason: 'today and the 30 days after it (no demo day, D128)');
    expect(store.bookableDates.first.id, '2026-10-11', reason: 'the window starts today');
    expect(store.bookableDates.last.id, '2026-11-10');

    store.setDate('2026-11-11');
    expect(store.date, '2026-10-11', reason: 'a day beyond 30 days is ignored');
    store.setDate('2026-10-10');
    expect(store.date, '2026-10-11', reason: 'a past day is ignored');
    store.setDate('11/10/2026');
    expect(store.date, '2026-10-11', reason: 'only YYYY-MM-DD');
    store.setDate('2026-11-10');
    expect(store.date, '2026-11-10');

    await store.loadTrips();
    expect(sent.lastWhere((r) => r.url.path.endsWith('/trips/search')).url.queryParameters['date'], '2026-11-10');
    expect(store.trips.single.day, '2026-08-28', reason: 'a trip carries its own departure day');

    store.setDate('2026-10-12');
    await store.loadTrips();
    expect(store.trips, isEmpty);
    expect(store.tripsError, 'Ngày đi đã qua', reason: 'a refused day is explained, not shown as "no trips"');
  });

  testWidgets('a day without a departure is still picked and labelled "không có chuyến", with the next day offered (D137)', (tester) async {
    runDaysAnswer = ['2026-10-13', '2026-10-15'];
    addTearDown(() => runDaysAnswer = null);
    late PassengerStore store;
    await tester.runAsync(() async {
      store = await storeWithServer();
      await store.loadRunDays();
    });
    await tester.pumpWidget(PassengerScope(store: store, child: const MaterialApp(home: Scaffold(body: SingleChildScrollView(padding: EdgeInsets.all(16), child: TravelDateField())))));
    final noTrip = find.textContaining('không có chuyến');
    expect(noTrip, findsWidgets);
    await tester.tap(noTrip.first);
    await tester.pump();
    expect(store.hasDeparture(store.date), isFalse, reason: 'the chip is not dead: the day is chosen');
    expect(store.nextRunDay, isNotNull);
    expect(store.hasDeparture(store.nextRunDay!), isTrue);
  });

  test('fixed timetable: the app knows which days have a departure on the route (D128)', () async {
    runDaysAnswer = ['2026-10-13', '2026-10-15'];
    addTearDown(() => runDaysAnswer = null);
    final store = await storeWithServer();
    await store.loadRunDays();
    final asked = sent.lastWhere((r) => r.url.path.endsWith('/trips/run-days')).url.queryParameters;
    expect(asked, {'origin': 'Hà Nội', 'destination': 'Thanh Hóa'});
    expect(store.date, '2026-10-13', reason: 'today has no departure: the next day that has one');
    expect(store.hasDeparture('2026-10-14'), isFalse);
    expect(store.hasDeparture('2026-10-15'), isTrue);

    runDaysAnswer = null;
    store.swapPlaces();
    await Future<void>.delayed(Duration.zero);
    expect(store.runDays, isNull, reason: 'no answer for the new route: nothing is greyed');
    expect(store.hasDeparture('2026-10-14'), isTrue);
    store.dispose();
  });

  test('day labels: weekday, day/month with the year, and today/tomorrow', () {
    expect(parseDay('2026-02-30'), isNull);
    expect(parseDay('28/08'), isNull);
    final d = TravelDate.of('2026-10-12', today: '2026-10-11');
    expect((d.short, d.long, d.relative), ('T2 · 12/10', 'Thứ Hai, 12/10/2026', 'Ngày mai'));
    expect(TravelDate.of('2027-01-01', today: '2026-12-31').long, 'Thứ Sáu, 01/01/2027');
    expect(ServiceCalendar.fromJson({'today': 'x'}).today, vnDay(DateTime.now()), reason: 'a broken answer falls back to the phone, the server still decides');
  });

  testWidgets('the calendar greys days outside the window and picks a day', (tester) async {
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
      tester.platformDispatcher.clearTextScaleFactorTestValue();
    });
    tester.view.physicalSize = const Size(800, 1280);
    tester.view.devicePixelRatio = 1.0;
    tester.platformDispatcher.textScaleFactorTestValue = 0.6;
    late PassengerStore store;
    await tester.runAsync(() async {
      store = await storeWithServer();
    });
    await tester.pumpWidget(PassengerScope(store: store, child: const MaterialApp(home: Scaffold(body: Padding(padding: EdgeInsets.all(16), child: TravelDateField())))));
    expect(find.text('Chủ Nhật, 11/10/2026'), findsOneWidget);
    await tester.tap(find.text('Ngày mai · 12/10'));
    await tester.pump();
    expect(store.date, '2026-10-12');
    await tester.tap(find.text('Đổi'));
    await tester.pumpAndSettle();
    expect(find.text('Tháng 10/2026'), findsOneWidget);
    expect(find.text('Tháng 11/2026'), findsOneWidget);
    await tester.tap(find.bySemanticsLabel('Thứ Ba, 10/11/2026'));
    await tester.pumpAndSettle();
    expect(store.date, '2026-11-10');
    await tester.tap(find.text('Đổi'));
    await tester.pumpAndSettle();
    await tester.tap(find.bySemanticsLabel('Thứ Tư, 11/11/2026'), warnIfMissed: false);
    await tester.pumpAndSettle();
    expect(store.date, '2026-11-10', reason: 'a day beyond the window cannot be picked');
    await tester.pumpWidget(const SizedBox());
    store.dispose();
  });

  testWidgets('a ROUTE_LINE route is drawn like a bus line: pick where to get on, then where to get off', (tester) async {
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
      tester.platformDispatcher.clearTextScaleFactorTestValue();
    });
    tester.view.physicalSize = const Size(400, 1400);
    tester.view.devicePixelRatio = 1.0;
    tester.platformDispatcher.textScaleFactorTestValue = 0.6;
    late PassengerStore store;
    await tester.runAsync(() async {
      store = await storeWithServer();
      await store.loadTrips();
    });
    store.chooseTrip(store.trips.single);
    expect(store.trip!.routeLine, isTrue);
    await tester.pumpWidget(PassengerScope(store: store, child: const MaterialApp(home: PassengerTripDetailScreen())));
    await tester.pump();
    expect(find.text('Lộ trình và điểm đón trả'), findsOneWidget);
    expect(find.text('Lên xe'), findsOneWidget);
    expect(find.text('Xuống xe'), findsOneWidget);
    expect(find.text('Đón tận nhà'), findsOneWidget, reason: 'the route allows home pickup');
    expect(find.text('Trả tận nhà'), findsNothing, reason: 'the route does not allow home drop-off');

    expect(find.text('Đón trả tận nhà'), findsOneWidget, reason: 'home service comes first, not after the map');
    expect(find.textContaining('Có mặt ở điểm đón trước 15 phút'), findsOneWidget);

    // Ninh Bình both picks up and drops off, between the current stops: the app asks which.
    await tester.tap(find.bySemanticsLabel(RegExp('^Bến xe Ninh Bình')));
    await tester.pumpAndSettle();
    expect(find.text('Lên xe ở đây'), findsOneWidget);
    await tester.tap(find.text('Lên xe ở đây'));
    await tester.pumpAndSettle();
    expect((store.pickup, store.dropoff), ('stp_nb', 'stp_th_pb'));

    // Giáp Bát only picks up: one tap moves the boarding point there, no question.
    await tester.tap(find.bySemanticsLabel(RegExp('^Bến xe Giáp Bát')));
    await tester.pumpAndSettle();
    expect((store.pickup, store.dropoff), ('stp_hn_gb', 'stp_th_pb'));
    expect(find.text('Lên xe ở đây'), findsNothing);

    // Ninh Bình again, now after the boarding point and before the drop-off: choose to get off there.
    await tester.tap(find.bySemanticsLabel(RegExp('^Bến xe Ninh Bình')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Xuống xe ở đây'));
    await tester.pumpAndSettle();
    expect((store.pickup, store.dropoff), ('stp_hn_gb', 'stp_nb'));
    await tester.pumpWidget(const SizedBox());
    store.dispose();
  });

  test('estimated stop times carry "~"; the stops of the last booking in a direction are offered again', () async {
    final t = Trip.fromJson({
      ...trip,
      'stops': [
        {...stops[0], 'time_source': 'OPERATOR'},
        {...stops[1], 'time_source': 'ESTIMATED'},
        {...stops[2], 'time_source': 'OPERATOR'},
      ],
    });
    expect([for (final s in t.stops) s.timeLabel.startsWith('~')], [false, true, false]);

    final store = await storeWithServer();
    await store.loadTrips();
    store.chooseTrip(store.trips.single);
    expect((store.pickup, store.dropoff), ('stp_hn_gb', 'stp_th_pb'));
    store.setPickup('stp_nb');
    await store.rememberRide();
    store.chooseTrip(store.trips.single);
    expect(store.pickup, 'stp_nb', reason: 'remembered for Hà Nội → Thanh Hóa');
    store.dispose();
  });

  testWidgets('a STATIONS route lists its bus stations only, without the roadside points', (tester) async {
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
      tester.platformDispatcher.clearTextScaleFactorTestValue();
    });
    tester.view.physicalSize = const Size(400, 1400);
    tester.view.devicePixelRatio = 1.0;
    tester.platformDispatcher.textScaleFactorTestValue = 0.6;
    late PassengerStore store;
    await tester.runAsync(() async {
      store = await storeWithServer();
    });
    store.chooseTrip(Trip.fromJson({
      ...trip,
      'service': {'stop_style': 'STATIONS', 'pickup_modes': ['FIXED_STOP'], 'dropoff_modes': ['FIXED_LOCATION']},
      'stops': [
        ...stops.take(1),
        {'stop_id': 'stp_rs_pv', 'name': 'Nút giao Pháp Vân', 'city': 'Hà Nội', 'order': 2, 'pickup_allowed': true, 'dropoff_allowed': false, 'kind': 'ROADSIDE'},
        ...[for (final s in stops.skip(1)) {...s, 'order': (s['order'] as int) + 1}],
      ],
    }));
    await tester.pumpWidget(PassengerScope(store: store, child: const MaterialApp(home: PassengerTripDetailScreen())));
    await tester.pump();
    expect(find.text('Bạn lên xe ở bến nào?'), findsOneWidget);
    expect(find.text('Lộ trình và điểm đón trả'), findsNothing);
    expect(find.text('Nút giao Pháp Vân'), findsNothing, reason: 'roadside points are not offered on a stations-only route');
    expect(find.text('Đón tận nhà'), findsNothing, reason: 'the route does not pick up at home');
    await tester.pumpWidget(const SizedBox());
    store.dispose();
  });

  test('stops: the server\'s planned times, hidden stops left out, and the ride preset from the home-screen stations', () async {
    final store = await storeWithServer();
    final t = Trip.fromJson({
      ...trip,
      'stops': [
        {...stops[0], 'planned_time': '2026-08-28T00:00:00.000Z'},
        {'stop_id': 'stp_rs_pv', 'name': 'Nút giao Pháp Vân', 'city': 'Hà Nội', 'order': 2, 'pickup_allowed': false, 'dropoff_allowed': false, 'kind': 'ROADSIDE', 'hidden': true, 'planned_time': '2026-08-28T00:04:00.000Z'},
        {...stops[1], 'order': 3, 'planned_time': '2026-08-28T01:15:00.000Z'},
        {...stops[2], 'order': 4, 'planned_time': '2026-08-28T02:09:00.000Z'},
      ],
    });
    expect(t.stops.map((s) => s.id), ['stp_hn_gb', 'stp_nb', 'stp_th_pb'], reason: 'a hidden stop is not offered');
    expect(t.stops.map((s) => s.time), ['07:00', '08:15', '09:09'], reason: 'times from the server, Vietnam time');
    store.setPlace(isOrigin: true, code: store.places.keys.firstWhere((k) => store.places[k]!.city == 'Ninh Bình'));
    final ride = store.rideFor(t);
    expect((ride.on.id, ride.off.id), ('stp_nb', 'stp_th_pb'), reason: 'gets on at the station picked on the home screen');
    store.chooseTrip(t);
    expect((store.pickup, store.dropoff), ('stp_nb', 'stp_th_pb'));
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

    expect(await store.setHomeAddress(pickupSide: true, address: '  ', lat: 21.0, lng: 105.8), 'Địa chỉ cần 5-200 ký tự');
    expect(await store.setHomeAddress(pickupSide: true, address: 'Sóc Sơn', lat: 21.25, lng: 105.85), 'Địa chỉ nằm ngoài vùng phục vụ');
    expect(store.homePickup, isNull);

    expect(await store.setHomeAddress(pickupSide: true, address: '12 ngõ 34 Giải Phóng', lat: 20.99, lng: 105.84, note: 'cổng xanh'), isNull);
    expect(bodyOf('/service-areas/check'), {'kind': 'PICKUP', 'lat': 20.99, 'lng': 105.84, 'trip_id': 'trp_hn_th_01'});
    expect(store.pickup, 'stp_hn_gb', reason: 'a home pickup rides from the first stop');
    expect(store.homeFees, 50000);

    await store.loadSeatMap();
    store.toggleSeat('A02');
    await store.holdSeats();
    expect(store.total, 220000 + 50000, reason: 'the checkout total shows the home pickup fee');
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
    expect(t.pickupNotice, isNull);
    final moved = Ticket.fromJson({...ticket, 'home_pickup': {'address': '12 ngõ 34 Giải Phóng', 'inaccessible_at': '2026-08-27T22:50:00Z', 'inaccessible_reason': 'Ngõ quá hẹp', 'meeting_point': 'đầu ngõ 34'}});
    expect(moved.pickupNotice, 'Xe không vào được địa chỉ (Ngõ quá hẹp). Hẹn ở đầu ngõ 34');
    final link = await store.shareTracking(t);
    expect(link.value, 'http://test/t/abc');
  });

  testWidgets('fixed origin and destination: shown as set, not picked; swap as the company sets it (D135, D136)', (tester) async {
    fixedEndpointsAnswer = {
      'origin': {'station_id': 'stp_hn_gb', 'name': 'Bến xe Giáp Bát', 'city': 'Hà Nội'},
      'destination': {'station_id': 'stp_th_pb', 'name': 'Bến xe Phía Bắc Thanh Hóa', 'city': 'Thanh Hóa'},
      'forward_available': true,
      'reverse_available': false,
      'allow_swap': false,
    };
    final store = await storeWithServer();
    fixedEndpointsAnswer = null;
    expect([store.originPlace.city, store.originPlace.station, store.destPlace.city, store.destPlace.station], ['Hà Nội', 'Bến xe Giáp Bát', 'Thanh Hóa', 'Bến xe Phía Bắc Thanh Hóa']);
    expect(store.recentPairs, isEmpty);
    expect(store.canSwap, isFalse);
    store.swapPlaces();
    expect(store.originPlace.city, 'Hà Nội', reason: 'one-way company: the swap does nothing');
    await tester.pumpWidget(MaterialApp(home: PassengerScope(store: store, child: const Scaffold(body: PassengerHomeScreen()))));
    await tester.pump();
    expect(find.text('Bến xe Giáp Bát'), findsOneWidget);
    expect(find.text('Tìm lại gần đây'), findsNothing);
    await tester.tap(find.text('Hà Nội'));
    await tester.pump();
    expect(find.byType(PassengerLocationPickerScreen), findsNothing, reason: 'a fixed place opens no picker');
    await tester.pumpWidget(const SizedBox());

    // Out and back (the default): the passenger swaps to the return direction.
    fixedEndpointsAnswer = {
      'origin': {'station_id': 'stp_hn_gb', 'name': 'Bến xe Giáp Bát', 'city': 'Hà Nội'},
      'destination': {'station_id': 'stp_th_pb', 'name': 'Bến xe Phía Bắc Thanh Hóa', 'city': 'Thanh Hóa'},
    };
    final both = await storeWithServer();
    fixedEndpointsAnswer = null;
    expect(both.canSwap, isTrue);
    both.swapPlaces();
    expect([both.originPlace.city, both.destPlace.station], ['Thanh Hóa', 'Bến xe Giáp Bát']);
  });

  test('a home pickup the company has not answered is never shown as confirmed (D130)', () {
    final pending = Ticket.fromJson({...ticket, 'home_pickup': {'address': '8 Ngọc Lâm', 'status': 'PENDING_REVIEW'}});
    expect(pending.homePickupStatus, 'PENDING_REVIEW');
    expect(Ticket.homeStatusLabel[pending.homePickupStatus], 'Chờ nhà xe duyệt');
    final refused = Ticket.fromJson({...ticket, 'home_pickup': {'address': '8 Ngọc Lâm', 'status': 'REJECTED', 'reject_reason': 'Ngõ quá hẹp'}});
    expect([refused.homePickupStatus, refused.homePickupReason], ['REJECTED', 'Ngõ quá hẹp']);
    expect(Ticket.fromJson({...ticket, 'home_pickup': {'address': '8 Ngọc Lâm'}}).homePickupStatus, 'CONFIRMED', reason: 'older tickets were confirmed at booking');
  });

  testWidgets('the ticket says a home pickup is waiting for review and where to board meanwhile', (tester) async {
    final store = await storeWithServer();
    final t = Ticket.fromJson({...ticket, 'home_pickup': {'address': '8 Ngọc Lâm', 'status': 'PENDING_REVIEW'}});
    await tester.pumpWidget(MaterialApp(home: PassengerScope(store: store, child: PassengerTicketQrScreen(ticket: t))));
    await tester.pump();
    expect(find.textContaining('Chờ nhà xe duyệt'), findsOneWidget);
    expect(find.textContaining('Nhà xe chưa xác nhận địa chỉ này'), findsOneWidget);
    expect(find.text('Hủy yêu cầu đón tận nhà'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
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

  testWidgets('the ticket screen shows the backup PIN caption with all covered seats', (tester) async {
    final store = await storeWithServer();
    paid = true;
    await store.verifyOtp('0987654321', '123456');
    await store.loadTickets();
    final singleTicket = store.tickets.single;

    // Single seat
    await tester.pumpWidget(MaterialApp(
      home: PassengerScope(store: store, child: PassengerTicketQrScreen(ticket: singleTicket)),
    ));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Hiện mã PIN dự phòng'));
    await tester.pumpAndSettle();
    expect(find.text('Đọc mã này cho tài xế nếu không quét được.'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());

    // Multiple seats
    final multiTicket = Ticket.fromJson({...ticket, 'seat_code': 'A05, B04'});
    await tester.pumpWidget(MaterialApp(
      home: PassengerScope(store: store, child: PassengerTicketQrScreen(ticket: multiTicket)),
    ));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Hiện mã PIN dự phòng'));
    await tester.pumpAndSettle();
    expect(find.text('Đọc mã này cho tài xế nếu không quét được. Mã dùng cho cả ghế A05, B04.'), findsOneWidget);
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
    expect(find.text('Dự kiến đón'), findsOneWidget, reason: 'no estimate yet: the planned time');
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

  testWidgets('the ticket screen shows planned pickup time label (with khoảng when estimated)', (tester) async {
    final store = await storeWithServer();

    // 1. Estimated pickup stop time (e.g. Giáp Bát: 15:15 estimate)
    final estimatedTicket = Ticket.fromJson({
      ...ticket,
      'pickup_stop': 'Bến xe Giáp Bát',
      'departure_time': '2026-08-28T14:00:00+07:00',
      'pickup_time': '2026-08-28T15:15:00+07:00',
      'pickup_time_estimated': true,
    });
    expect(estimatedTicket.pickupTimeLabel, 'khoảng 15:15');

    await tester.pumpWidget(MaterialApp(
      home: PassengerScope(store: store, child: PassengerTicketQrScreen(ticket: estimatedTicket)),
    ));
    await tester.pumpAndSettle();
    expect(find.text('Giáp Bát · khoảng 15:15'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());

    // 2. Exact operator planned pickup time (e.g. Mỹ Đình: 14:00 exact)
    final exactTicket = Ticket.fromJson({
      ...ticket,
      'pickup_stop': 'Bến xe Mỹ Đình',
      'departure_time': '2026-08-28T14:00:00+07:00',
      'pickup_time': '2026-08-28T14:00:00+07:00',
      'pickup_time_estimated': false,
    });
    expect(exactTicket.pickupTimeLabel, '14:00');

    await tester.pumpWidget(MaterialApp(
      home: PassengerScope(store: store, child: PassengerTicketQrScreen(ticket: exactTicket)),
    ));
    await tester.pumpAndSettle();
    expect(find.text('Mỹ Đình · 14:00'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());

    // 3. Booking success screen shows pickup time label
    await tester.pumpWidget(MaterialApp(
      home: PassengerScope(store: store, child: PassengerBookingSuccessScreen(ticket: estimatedTicket, phone: '0987654321')),
    ));
    await tester.pumpAndSettle();
    expect(find.text('khoảng 15:15 · 28/08'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('radar screen shows Chuyến đã kết thúc, arrival info, and Đã đi status for a completed trip', (tester) async {
    final store = await storeWithServer();
    trackingAnswer = {
      'trip_status': 'COMPLETED',
      'tracking_ended': true,
      'hud_status_text': 'Chuyến đã kết thúc',
      'gps_signal': 'none',
      'bus_location': null,
    };

    final completedTicket = Ticket.fromJson({
      ...ticket,
      'status': 'BOARDED',
      'trip_completed': true,
    }, past: true);

    await tester.pumpWidget(MaterialApp(
      home: PassengerScope(
        store: store,
        child: PassengerLiveRadarScreen(ticket: completedTicket),
      ),
    ));
    await tester.pumpAndSettle();

    expect(find.text('Chuyến đã kết thúc'), findsOneWidget);
    expect(find.text('Đã đi'), findsWidgets);
    expect(find.text('Điểm trả'), findsOneWidget);
    expect(find.text('Phía Bắc Thanh Hóa'), findsOneWidget);
    expect(find.textContaining('Chưa nhận tín hiệu từ xe'), findsNothing);
    expect(find.text('Đã lên xe'), findsNothing);

    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('the payment success text informs ticket is saved in app and no longer mentions SMS', (tester) async {
    final store = await storeWithServer();
    paid = true;
    await store.verifyOtp('0987654321', '123456');
    await store.loadTickets();
    final t = store.tickets.single;

    await tester.pumpWidget(MaterialApp(
      home: PassengerScope(
        store: store,
        child: PassengerBookingSuccessScreen(ticket: t, phone: '0987654321'),
      ),
    ));
    await tester.pumpAndSettle();

    expect(find.textContaining('SMS'), findsNothing);
    expect(find.textContaining('Vé đã lưu trong mục "Vé của tôi" của số 0987 *** 321'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('wallet puts HISTORY tickets under "Lịch sử" with "Đã đi" and UPCOMING ones under "Sắp đi"', (tester) async {
    final store = await storeWithServer();
    paid = true;
    ticketStatus = 'ACTIVE';
    historyTicketsAnswer = [
      {
        ...ticket,
        'ticket_id': 'tkt_past_01',
        'pnr': 'BG-000099',
        'status': 'BOARDED',
      },
    ];
    await store.verifyOtp('0987654321', '123456');
    await store.loadTickets();

    expect(store.tickets.length, 2);
    expect(store.tickets.first.past, isFalse);
    expect(store.tickets.last.past, isTrue);

    await tester.pumpWidget(MaterialApp(
      home: PassengerScope(
        store: store,
        child: const Scaffold(body: PassengerWalletScreen()),
      ),
    ));
    await tester.pumpAndSettle();

    // Default tab is "Sắp đi · 1": upcoming ticket shows "Đã thanh toán" and action buttons
    expect(find.text('Sắp đi · 1'), findsOneWidget);
    expect(find.text('BG-000001'), findsOneWidget);
    expect(find.text('Đã thanh toán'), findsOneWidget);
    expect(find.text('Mở vé'), findsOneWidget);
    expect(find.text('Theo dõi xe'), findsOneWidget);
    expect(find.text('BG-000099'), findsNothing);

    // Switch to "Lịch sử" tab: past boarded ticket shows "Đã đi" and no tracking/QR actions
    await tester.tap(find.text('Lịch sử'));
    await tester.pumpAndSettle();

    expect(find.text('BG-000099'), findsOneWidget);
    expect(find.text('Đã đi'), findsOneWidget);
    expect(find.text('BG-000001'), findsNothing);
    expect(find.text('Mở vé'), findsNothing);
    expect(find.text('Theo dõi xe'), findsNothing);

    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('stale "the bus is at your pickup" banner is hidden after loadTickets() when ticket is boarded or past', (tester) async {
    final store = await storeWithServer();
    paid = true;
    ticketStatus = 'ACTIVE';
    await store.verifyOtp('0987654321', '123456');
    await store.loadTickets();

    await tester.pumpWidget(MaterialApp(
      home: PassengerScope(
        store: store,
        child: const PassengerMainShell(),
      ),
    ));
    await tester.pumpAndSettle();

    // Trigger an alert for the ticket
    store.pendingAlert = AppNotice(
      'Xe sắp tới đón bạn',
      'Mời bạn lên xe, ghế A02',
      'vừa xong',
      ticketId: 'tkt_BG1_A02',
      type: 'PICKUP_APPROACHING',
    );
    store.notifyListeners();
    await tester.pumpAndSettle();

    expect(find.text('Xe sắp tới đón bạn'), findsOneWidget);
    expect(find.text('Mời bạn lên xe, ghế A02'), findsOneWidget);

    // Ticket becomes BOARDED and loadTickets runs
    ticketStatus = 'BOARDED';
    await store.loadTickets();
    await tester.pumpAndSettle();

    expect(find.text('Xe sắp tới đón bạn'), findsNothing);

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

  testWidgets('VietQR payment check failure is visible above the button without scrolling on 1080x2340 (F16)', (tester) async {
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    tester.view.physicalSize = const Size(1080, 2340);
    tester.view.devicePixelRatio = 3.0;

    final store = await storeWithServer();
    store.orderPnr = 'BG-000001';
    store.orderAmount = 220000;
    paid = false;

    await tester.pumpWidget(MaterialApp(
      home: PassengerScope(
        store: store,
        child: const PassengerPaymentProcessingScreen(name: 'Nguyễn An', phone: '0987654321'),
      ),
    ));
    await tester.pumpAndSettle();

    final checkBtn = find.text('Tôi đã chuyển tiền, kiểm tra ngay');
    expect(checkBtn, findsOneWidget);
    await tester.tap(checkBtn);
    await tester.pumpAndSettle();

    final notYetFinder = find.textContaining('Chưa nhận được tiền');
    expect(notYetFinder, findsOneWidget);

    final notYetRect = tester.getRect(notYetFinder);
    final screenHeight = 2340 / 3.0;
    expect(notYetRect.top, greaterThanOrEqualTo(0.0));
    expect(notYetRect.bottom, lessThanOrEqualTo(screenHeight));

    final btnRect = tester.getRect(checkBtn);
    expect(notYetRect.bottom, lessThanOrEqualTo(btnRect.top + 4));
    store.stopHold();
  });

  testWidgets('home promo slider first banner title is fully within screen bounds (F17)', (tester) async {
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    tester.view.physicalSize = const Size(1080, 2340);
    tester.view.devicePixelRatio = 3.0;

    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: PromoSlider(
          banners: const [
            PromoBanner(
              id: 'promo_1',
              title: 'Tết sum vầy 2027',
              subtitle: 'Ưu đãi đặt vé sớm',
            ),
          ],
        ),
      ),
    ));
    await tester.pumpAndSettle();

    final titleFinder = find.text('Tết sum vầy 2027');
    expect(titleFinder, findsOneWidget);
    final rect = tester.getRect(titleFinder);
    expect(rect.left, greaterThanOrEqualTo(0.0));
    expect(rect.right, lessThanOrEqualTo(1080 / 3.0));
  });

  testWidgets('Lịch sử groups seats of one booking into one card by PNR + trip (F20)', (tester) async {
    final store = await storeWithServer();
    await store.verifyOtp('0987654321', '123456');
    historyTicketsAnswer = [
      {
        ...ticket,
        'ticket_id': 'tkt_h1_a05',
        'seat_code': 'A05',
        'pnr': 'BG-888999',
        'trip_id': 'trp_hn_th_01',
        'fare_vnd': 220000,
        'status': 'BOARDED',
        'trip_completed': true,
      },
      {
        ...ticket,
        'ticket_id': 'tkt_h1_b04',
        'seat_code': 'B04',
        'pnr': 'BG-888999',
        'trip_id': 'trp_hn_th_01',
        'fare_vnd': 220000,
        'status': 'BOARDED',
        'trip_completed': true,
      },
    ];
    await store.loadTickets();

    await tester.pumpWidget(MaterialApp(
      home: PassengerScope(
        store: store,
        child: const Scaffold(body: PassengerWalletScreen()),
      ),
    ));
    await tester.pumpAndSettle();

    // Switch to Lịch sử tab
    await tester.tap(find.text('Lịch sử'));
    await tester.pumpAndSettle();

    // Expect single card with both seats grouped
    expect(find.byType(TicketCard), findsOneWidget);
    expect(find.textContaining('Ghế A05, B04'), findsOneWidget);
    expect(find.text('BG-888999'), findsOneWidget);
    store.stopHold();
  });

  testWidgets('single-seat card requests ticket QR and renders single-seat QR without calling group-qr (F22)', (tester) async {
    final store = await storeWithServer();
    paid = true;
    await store.verifyOtp('0987654321', '123456');
    await store.loadTickets();
    final singleTicket = store.tickets.single;

    await tester.pumpWidget(MaterialApp(
      home: PassengerScope(store: store, child: PassengerTicketQrScreen(ticket: singleTicket)),
    ));
    await tester.pumpAndSettle();

    expect(singleTicket.isGroup, isFalse);
    expect(singleTicket.qrValue, startsWith('BUSGO|'));
    expect(singleTicket.pin, '123456');

    // No group-qr request was made
    expect(sent.any((r) => r.url.path.endsWith('/group-qr')), isFalse);

    // QrImageView is rendered with semantics label
    expect(find.byType(QrImageView), findsOneWidget);
    expect(find.byWidgetPredicate((w) => w is Semantics && w.properties.label == 'Mã QR lên xe của vé ${singleTicket.pnr}, ghế ${singleTicket.seat}'), findsOneWidget);

    await tester.pumpWidget(const SizedBox());
    store.stopHold();
  });

  testWidgets('multi-seat card requests group QR and renders group QR value (F22)', (tester) async {
    final store = await storeWithServer();
    await store.verifyOtp('0987654321', '123456');

    // Ticket covering two seats from wallet grouping
    final multiTicket = Ticket(
      id: 'tkt_BG1_A05',
      pnr: 'BG-000001',
      orderId: 'ord_1',
      ticketIds: ['tkt_BG1_A05', 'tkt_BG1_B04'],
      tripId: 'trp_hn_th_01',
      route: 'Hà Nội — Thanh Hóa',
      date: 'T6 28/08',
      dep: '07:00',
      seat: 'A05, B04',
      pickup: 'Bến xe Giáp Bát',
      paid: 440000,
      name: 'Nguyễn An',
      status: TicketStatus.active,
    );

    await tester.pumpWidget(MaterialApp(
      home: PassengerScope(store: store, child: PassengerTicketQrScreen(ticket: multiTicket)),
    ));
    await tester.pumpAndSettle();

    expect(multiTicket.isGroup, isTrue);
    // Group-qr request was sent to /api/v1/passenger/orders/ord_1/group-qr
    expect(sent.any((r) => r.url.path == '/api/v1/passenger/orders/ord_1/group-qr'), isTrue);
    expect(multiTicket.qrValue, startsWith('BUSGO_GRP|'));
    expect(multiTicket.pin, '123456'); // Backup PIN preserved

    // QrImageView renders the group QR with semantics label
    expect(find.byType(QrImageView), findsOneWidget);
    expect(find.byWidgetPredicate((w) => w is Semantics && w.properties.label == 'Mã QR lên xe của vé ${multiTicket.pnr}, ghế ${multiTicket.seat}'), findsOneWidget);

    await tester.pumpWidget(const SizedBox());
    store.stopHold();
  });

  test('multi-seat card "Đổi mã QR" reissues every ticket of the group and reloads group QR (F22)', () async {
    final store = await storeWithServer();
    reissueAllowed = true;
    final multiTicket = Ticket(
      id: 'tkt_1',
      pnr: 'BG-000001',
      orderId: 'ord_1',
      ticketIds: ['tkt_1', 'tkt_2'],
      tripId: 'trp_hn_th_01',
      route: 'Hà Nội — Thanh Hóa',
      date: 'T6 28/08',
      dep: '07:00',
      seat: 'A01, A02',
      pickup: 'Bến xe Giáp Bát',
      paid: 440000,
      name: 'Nguyễn An',
      status: TicketStatus.active,
    );

    // Initial load
    await store.loadPass(multiTicket);
    expect(multiTicket.qrValue, startsWith('BUSGO_GRP|'));

    sent.clear();
    final r = await store.reissueQr(multiTicket);
    expect(r.ok, isTrue);

    // Both tickets were reissued
    final reissuedPaths = sent.where((req) => req.url.path.endsWith('/qr/reissue')).map((req) => req.url.path).toList();
    expect(reissuedPaths, [
      '/api/v1/passenger/tickets/tkt_1/qr/reissue',
      '/api/v1/passenger/tickets/tkt_2/qr/reissue',
    ]);

    // Group QR was reloaded after reissue
    expect(sent.any((req) => req.url.path == '/api/v1/passenger/orders/ord_1/group-qr'), isTrue);

    // If any reissue is refused, server message/code is returned
    reissueAllowed = false;
    final rFailed = await store.reissueQr(multiTicket);
    expect(rFailed.ok, isFalse);
    expect(rFailed.code, 'BOARDING_STARTED');
    expect(rFailed.error, 'Chuyến đã xuất bến');
  });
}
