import 'dart:convert';

import 'package:app/src/presentation/passenger/passenger_checkout_screen.dart';
import 'package:app/src/presentation/passenger/passenger_search_results_screen.dart';
import 'package:app/src/presentation/passenger/passenger_seat_map_screen.dart';
import 'package:app/src/presentation/passenger/passenger_store.dart';
import 'package:app/src/presentation/passenger/passenger_trip_detail_screen.dart';
import 'package:app/src/presentation/passenger/passenger_widgets.dart';
import 'package:data/src/service/passenger_api_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// D185: booking block handling (departed, cutoff passed, sales closed, cancelled).
void main() {
  final stops = [
    {
      'stop_id': 'gb',
      'name': 'Bến xe Giáp Bát',
      'city': 'Hà Nội',
      'order': 1,
      'pickup': true,
      'dropoff': false,
      'pickup_allowed': true,
      'dropoff_allowed': false,
      'lat': 20.98,
      'lng': 105.84,
    },
    {
      'stop_id': 'th',
      'name': 'Bến xe Phía Bắc',
      'city': 'Thanh Hóa',
      'order': 2,
      'pickup': false,
      'dropoff': true,
      'pickup_allowed': false,
      'dropoff_allowed': true,
      'lat': 19.81,
      'lng': 105.78,
    },
  ];

  Map<String, dynamic> sampleTrip(
    String id,
    String dep, {
    bool bookable = true,
    String? blockCode,
    String? blockMessage,
    String? bookUntil,
    int seats = 30,
  }) => {
        'trip_id': id,
        'vehicle_title': 'Giường nằm 34 chỗ',
        'vehicle_type': 'SLEEPER_34',
        'plate_number': '29B-123.45',
        'departure_time': '2026-10-11T$dep:00+07:00',
        'arrival_time': '2026-10-11T23:00:00+07:00',
        'duration_minutes': 180,
        'base_fare_vnd': 220000,
        'available_seats_count': seats,
        'stops': stops,
        'bookable': bookable,
        if (blockCode != null) 'block_code': blockCode,
        if (blockMessage != null) 'block_message': blockMessage,
        if (bookUntil != null) 'book_until': bookUntil,
      };

  Future<PassengerStore> createStore({
    List<Map<String, dynamic>>? tripsAnswer,
    int holdSeatsStatus = 200,
    String? holdSeatsCode,
    String? holdSeatsMessage,
    int createOrderStatus = 200,
    String? createOrderCode,
    String? createOrderMessage,
  }) async {
    SharedPreferences.setMockInitialValues({});
    final client = MockClient((req) async {
      final path = req.url.path;
      if (path.endsWith('/app/config')) {
        return http.Response(
          jsonEncode({
            'status': 'success',
            'data': {
              'operator': {'operator_id': 'op1', 'code': 'SAOMAI', 'name': 'Nhà xe Sao Mai', 'hotline': '1900 6868'},
              'service_calendar': {'timezone': 'Asia/Ho_Chi_Minh', 'today': '2026-10-11', 'booking_window_days': 30, 'last_date': '2026-11-10'},
            },
          }),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      }
      if (path.endsWith('/routes/stops/search')) {
        return http.Response(
          jsonEncode({
            'status': 'success',
            'data': [
              {'stop_id': 'gb', 'name': 'Bến xe Giáp Bát', 'city': 'Hà Nội', 'popular': true},
              {'stop_id': 'th', 'name': 'Bến xe Phía Bắc', 'city': 'Thanh Hóa', 'popular': true},
            ],
          }),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      }
      if (path.endsWith('/trips/search')) {
        return http.Response(
          jsonEncode({'status': 'success', 'data': tripsAnswer ?? []}),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      }
      if (path.endsWith('/seat-map')) {
        return http.Response(
          jsonEncode({
            'status': 'success',
            'data': {
              'seats': [
                {'seat_code': 'A01', 'deck': 1, 'state': 'AVAILABLE', 'row': 1, 'column': 1, 'type': 'VIP_CABIN'},
                {'seat_code': 'A02', 'deck': 1, 'state': 'AVAILABLE', 'row': 1, 'column': 2, 'type': 'VIP_CABIN'},
              ],
              'columns': 2,
            },
          }),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      }
      if (path.endsWith('/seats/hold') && req.method == 'POST') {
        if (holdSeatsStatus >= 400) {
          return http.Response(
            jsonEncode({
              'status': 'fail',
              'code': holdSeatsCode ?? 'BOOKING_CUTOFF_PASSED',
              'message': holdSeatsMessage ?? 'Đã hết giờ đặt vé trực tuyến cho chuyến này.',
            }),
            holdSeatsStatus,
            headers: {'content-type': 'application/json; charset=utf-8'},
          );
        }
        return http.Response(
          jsonEncode({
            'status': 'success',
            'data': {'hold_id': 'hold_1', 'seconds_remaining': 600},
          }),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      }
      if (path.endsWith('/bookings/create')) {
        if (createOrderStatus >= 400) {
          return http.Response(
            jsonEncode({
              'status': 'fail',
              'code': createOrderCode ?? 'SALES_CLOSED',
              'message': createOrderMessage ?? 'Nhà xe đã ngừng nhận đặt vé cho chuyến này.',
            }),
            createOrderStatus,
            headers: {'content-type': 'application/json; charset=utf-8'},
          );
        }
        return http.Response(
          jsonEncode({
            'status': 'success',
            'data': {
              'payment': {
                'order_id': 'ord_1',
                'pnr': 'BG-123456',
                'amount_vnd': 220000,
                'payment_method': 'VIETQR_NAPAS247',
                'payment_details': {'bank_name': 'MB Bank', 'account_number': '0912345678', 'transfer_memo': 'BG123456', 'qr_payload': '000201...'},
                'expires_at': DateTime.now().add(const Duration(minutes: 15)).toIso8601String(),
              },
            },
          }),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      }
      return http.Response('{"status":"success","data":{}}', 200, headers: {'content-type': 'application/json; charset=utf-8'});
    });
    final s = PassengerStore(api: PassengerApiClientService(baseUrl: 'http://test', client: client));
    await s.selectOperator('SAOMAI');
    return s;
  }

  Widget host(PassengerStore s, Widget child) => PassengerScope(store: s, child: MaterialApp(home: child));

  testWidgets('(a) search results show a departed trip greyed with "Đã xuất bến" and it is not tappable, and a bookable one is', (tester) async {
    final departed = sampleTrip(
      't_departed',
      '06:00',
      bookable: false,
      blockCode: 'TRIP_DEPARTED',
      blockMessage: 'Chuyến xe đã khởi hành lúc 06:00.',
    );
    final bookable = sampleTrip(
      't_bookable',
      '14:00',
      bookable: true,
      seats: 10,
    );

    final s = await createStore(tripsAnswer: [bookable, departed]);

    await tester.pumpWidget(host(s, const PassengerSearchResultsScreen()));
    await tester.pumpAndSettle();

    // The departed trip shows "Đã xuất bến" and its server message
    expect(find.textContaining('Đã xuất bến'), findsOneWidget);
    expect(find.text('Chuyến xe đã khởi hành lúc 06:00.'), findsOneWidget);

    // Tapping the departed trip card does not open trip details
    await tester.tap(find.textContaining('Đã xuất bến'));
    await tester.pumpAndSettle();
    expect(find.byType(PassengerTripDetailScreen), findsNothing);

    // The bookable trip is tappable and opens trip details
    expect(find.text('14:00'), findsOneWidget);
    await tester.tap(find.text('14:00'));
    await tester.pumpAndSettle();
    expect(find.byType(PassengerTripDetailScreen), findsOneWidget);
  });

  testWidgets('(b) a trip whose book_until is in the past shows "Hết giờ đặt online"', (tester) async {
    final pastTime = DateTime.now().subtract(const Duration(minutes: 15)).toIso8601String();
    final expiredTrip = sampleTrip(
      't_expired',
      '12:00',
      bookable: true,
      bookUntil: pastTime,
    );

    final s = await createStore(tripsAnswer: [expiredTrip]);

    await tester.pumpWidget(host(s, const PassengerSearchResultsScreen()));
    await tester.pumpAndSettle();

    expect(find.textContaining('Hết giờ đặt online'), findsOneWidget);
    expect(find.text('Đã hết giờ đặt vé trực tuyến. Gọi tổng đài nhà xe để được hỗ trợ.'), findsOneWidget);

    // Blocked trip is not tappable
    await tester.tap(find.textContaining('Hết giờ đặt online'));
    await tester.pumpAndSettle();
    expect(find.byType(PassengerTripDetailScreen), findsNothing);
  });

  testWidgets('(c) holdSeats answering 409 BOOKING_CUTOFF_PASSED shows the dialog and pressing "Chọn chuyến khác" returns to the results screen', (tester) async {
    final bookable = sampleTrip('t_bookable', '18:00', bookable: true, seats: 10);
    final s = await createStore(
      tripsAnswer: [bookable],
      holdSeatsStatus: 409,
      holdSeatsCode: 'BOOKING_CUTOFF_PASSED',
      holdSeatsMessage: 'Đã hết thời gian đặt vé trực tuyến cho chuyến này.',
    );
    s.api.authToken = 'test_token';

    await tester.pumpWidget(host(s, const PassengerSearchResultsScreen()));
    await tester.pumpAndSettle();
    expect(find.byType(PassengerSearchResultsScreen), findsOneWidget);

    // Tap the trip card to open details
    await tester.tap(find.text('18:00'));
    await tester.pumpAndSettle();
    expect(find.byType(PassengerTripDetailScreen), findsOneWidget);

    // Tap "Chọn ghế" to open seat map
    await tester.tap(find.text('Chọn ghế'));
    await tester.pumpAndSettle();
    expect(find.byType(PassengerSeatMapScreen), findsOneWidget);

    // Select seat A01
    await tester.tap(find.text('A01'));
    await tester.pumpAndSettle();

    // Tap "Giữ ghế 10 phút" -> holdSeats fails with 409 BOOKING_CUTOFF_PASSED
    await tester.tap(find.text('Giữ ghế 10 phút'));
    await tester.pumpAndSettle();

    // Dialog appears
    expect(find.byType(AlertDialog), findsOneWidget);
    expect(find.text('Không đặt được chuyến này'), findsOneWidget);
    expect(find.text('Đã hết thời gian đặt vé trực tuyến cho chuyến này.'), findsOneWidget);
    expect(find.text('Chọn chuyến khác'), findsOneWidget);

    // Tap "Chọn chuyến khác" -> returns to search results screen
    await tester.tap(find.text('Chọn chuyến khác'));
    await tester.pumpAndSettle();

    expect(find.byType(AlertDialog), findsNothing);
    expect(find.byType(PassengerSearchResultsScreen), findsOneWidget);
    expect(find.byType(PassengerSeatMapScreen), findsNothing);
    expect(find.byType(PassengerTripDetailScreen), findsNothing);
  });

  testWidgets('detail and seat map screens show warning banner and disable button when trip is not bookableNow', (tester) async {
    final t = Trip.fromJson(sampleTrip(
      't_closed',
      '09:00',
      bookable: false,
      blockCode: 'SALES_CLOSED',
      blockMessage: 'Nhà xe tạm dừng nhận khách chuyến này.',
    ));

    final s = await createStore();
    s.chooseTrip(t);

    // Detail screen
    await tester.pumpWidget(host(s, const PassengerTripDetailScreen()));
    await tester.pumpAndSettle();

    expect(find.byType(TripBlockedBanner), findsOneWidget);
    expect(find.text('Nhà xe ngừng bán'), findsOneWidget);
    expect(find.text('Nhà xe tạm dừng nhận khách chuyến này.'), findsOneWidget);

    final continueBtn = tester.widget<FilledButton>(
      find.descendant(of: find.widgetWithText(PrimaryButton, 'Chọn ghế'), matching: find.byType(FilledButton)),
    );
    expect(continueBtn.onPressed, isNull);

    // Seat map screen
    await tester.pumpWidget(host(s, const PassengerSeatMapScreen()));
    await tester.pumpAndSettle();

    expect(find.byType(TripBlockedBanner), findsOneWidget);
    expect(find.text('Nhà xe ngừng bán'), findsOneWidget);

    final holdBtn = tester.widget<FilledButton>(
      find.descendant(of: find.byType(PrimaryButton), matching: find.byType(FilledButton)),
    );
    expect(holdBtn.onPressed, isNull);
  });

  testWidgets('createOrder answering 409 TRIP_CANCELLED shows dialog and returns to results screen', (tester) async {
    final t = Trip.fromJson(sampleTrip('t_cancel', '10:00', bookable: true));
    final s = await createStore(
      tripsAnswer: [sampleTrip('t_cancel', '10:00', bookable: true)],
      createOrderStatus: 409,
      createOrderCode: 'TRIP_CANCELLED',
      createOrderMessage: 'Chuyến xe đã bị hủy do thời tiết xấu.',
    );
    s.api.authToken = 'test_token';
    s.chooseTrip(t);
    s.seats.add('A01');
    s.holdId = 'hold_123';

    await tester.pumpWidget(host(s, const PassengerSearchResultsScreen()));
    await tester.pumpAndSettle();

    // Push checkout screen
    final nav = tester.state<NavigatorState>(find.byType(Navigator));
    nav.push(MaterialPageRoute(builder: (_) => const PassengerCheckoutScreen()));
    await tester.pumpAndSettle();
    expect(find.byType(PassengerCheckoutScreen), findsOneWidget);

    // Enter name & phone
    await tester.enterText(
      find.descendant(of: find.widgetWithText(LabeledField, 'Họ và tên'), matching: find.byType(TextField)),
      'Nguyễn Văn A',
    );
    await tester.enterText(
      find.descendant(of: find.widgetWithText(LabeledField, 'Số điện thoại nhận vé'), matching: find.byType(TextField)),
      '0912345678',
    );
    await tester.pump();

    // Tap confirm / pay
    await tester.tap(find.text('Tạo mã thanh toán'));
    await tester.pumpAndSettle();

    // Dialog appears
    expect(find.byType(AlertDialog), findsOneWidget);
    expect(find.text('Không đặt được chuyến này'), findsOneWidget);
    expect(find.text('Chuyến xe đã bị hủy do thời tiết xấu.'), findsOneWidget);

    // Tap "Chọn chuyến khác"
    await tester.tap(find.text('Chọn chuyến khác'));
    await tester.pumpAndSettle();

    expect(find.byType(AlertDialog), findsNothing);
    expect(find.byType(PassengerSearchResultsScreen), findsOneWidget);
    expect(find.byType(PassengerCheckoutScreen), findsNothing);
  });
}
