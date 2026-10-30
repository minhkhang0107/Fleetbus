import 'dart:async';
import 'dart:convert';

import 'package:app/src/presentation/passenger/passenger_date_picker.dart';
import 'package:app/src/presentation/passenger/passenger_home_screen.dart';
import 'package:app/src/presentation/passenger/passenger_search_results_screen.dart';
import 'package:app/src/presentation/passenger/passenger_store.dart';
import 'package:app/src/presentation/passenger/passenger_wallet_screen.dart';
import 'package:data/src/service/passenger_api_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// D180: swapping places, picking a day and switching lists move smoothly instead of jumping.
void main() {
  Completer<void>? searchGate;
  final stops = [
    {'stop_id': 'gb', 'name': 'Bến xe Giáp Bát', 'city': 'Hà Nội', 'order': 1, 'pickup': true, 'dropoff': false, 'lat': 20.98, 'lng': 105.84},
    {'stop_id': 'th', 'name': 'Bến xe Phía Bắc', 'city': 'Thanh Hóa', 'order': 2, 'pickup': false, 'dropoff': true, 'lat': 19.81, 'lng': 105.78},
  ];
  Map<String, dynamic> trip(String id, String dep) => {
        'trip_id': id,
        'vehicle_title': 'Giường nằm 34 chỗ',
        'vehicle_type': 'SLEEPER_34',
        'plate_number': '29B-123.45',
        'departure_time': '2026-10-11T$dep:00+07:00',
        'arrival_time': '2026-10-11T23:00:00+07:00',
        'duration_minutes': 180,
        'base_fare_vnd': 220000,
        'available_seats_count': 30,
        'stops': stops,
      };

  Future<PassengerStore> store() async {
    SharedPreferences.setMockInitialValues({});
    final client = MockClient((req) async {
      final path = req.url.path;
      Object? data;
      if (path.endsWith('/app/config')) {
        data = {
          'operator': {'operator_id': 'op1', 'code': 'SAOMAI', 'name': 'Nhà xe Sao Mai', 'hotline': '1900 6868'},
          'service_calendar': {'timezone': 'Asia/Ho_Chi_Minh', 'today': '2026-10-11', 'booking_window_days': 30, 'last_date': '2026-11-10'},
        };
      }
      if (path.endsWith('/routes/stops/search')) {
        data = [
          {'stop_id': 'gb', 'name': 'Bến xe Giáp Bát', 'city': 'Hà Nội', 'popular': true},
          {'stop_id': 'th', 'name': 'Bến xe Phía Bắc', 'city': 'Thanh Hóa', 'popular': true},
        ];
      }
      if (path.endsWith('/trips/search')) {
        await searchGate?.future;
        data = req.url.queryParameters['date'] == '2026-10-11' ? [trip('t_today', '20:00')] : [trip('t_tomorrow', '06:30')];
      }
      return http.Response(jsonEncode({'status': 'success', 'data': data ?? {}}), 200, headers: {'content-type': 'application/json; charset=utf-8'});
    });
    final s = PassengerStore(api: PassengerApiClientService(baseUrl: 'http://test', client: client));
    await s.selectOperator('SAOMAI');
    return s;
  }

  Widget host(PassengerStore s, Widget child) => PassengerScope(store: s, child: MaterialApp(home: Scaffold(body: child)));

  testWidgets('swapping places turns the button and the two cities cross over', (tester) async {
    final s = await store();
    await tester.pumpWidget(host(s, const PassengerHomeScreen()));
    await tester.pumpAndSettle();
    final rotation = find.descendant(of: find.byTooltip('Đổi chiều điểm đi và điểm đến'), matching: find.byType(AnimatedRotation));
    expect(tester.widget<AnimatedRotation>(rotation).turns, 0);
    expect(s.originPlace.city, 'Hà Nội');

    await tester.tap(find.byIcon(Icons.swap_vert));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 120));
    expect(tester.widget<AnimatedRotation>(rotation).turns, 0.5);
    // Midway both values are on screen in each field: the old one leaving, the new one arriving.
    expect(find.text('Hà Nội'), findsNWidgets(2));
    expect(find.text('Thanh Hóa'), findsNWidgets(2));

    await tester.pumpAndSettle();
    expect(s.originPlace.city, 'Thanh Hóa');
    expect(find.text('Hà Nội'), findsOneWidget);
    expect(find.text('Thanh Hóa'), findsOneWidget);
  });

  testWidgets('picking any day never changes the height of the date field or the chips', (tester) async {
    final s = await store();
    await tester.pumpWidget(host(s, const SingleChildScrollView(child: TravelDateField())));
    await tester.pumpAndSettle();
    final field = find.byType(TravelDateField);
    final height = tester.getSize(field).height;
    final chip = find.textContaining('Ngày mai');
    final width = tester.getSize(chip).width;

    for (final label in ['Ngày mai', '13/10', 'Hôm nay']) {
      await tester.tap(find.textContaining(label).last);
      await tester.pumpAndSettle();
      expect(tester.getSize(field).height, height, reason: 'after picking $label');
      expect(tester.getSize(chip.last).width, width, reason: 'the chips keep their width ($label)');
    }
    // A day picked from the calendar has no "Hôm nay / Ngày mai / Ngày kia": it still gets a second line.
    s.setDate('2026-10-15');
    await tester.pumpAndSettle();
    expect(find.text('Còn 4 ngày nữa'), findsOneWidget);
    expect(tester.getSize(field).height, height);
  });

  testWidgets('a new day keeps the previous trips dimmed under a progress bar, then slides the new ones in', (tester) async {
    final s = await store();
    await tester.pumpWidget(host(s, const PassengerSearchResultsScreen()));
    await tester.pumpAndSettle();
    expect(find.text('20:00'), findsOneWidget);

    searchGate = Completer<void>();
    await tester.tap(find.text('12/10').first);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    expect(find.byType(CircularProgressIndicator), findsNothing, reason: 'no blink to a spinner');
    expect(find.byType(LinearProgressIndicator), findsOneWidget);
    expect(find.text('20:00'), findsOneWidget, reason: 'the old list stays while the new day loads');

    searchGate!.complete();
    searchGate = null;
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.text('06:30'), findsOneWidget);
    await tester.pumpAndSettle();
    expect(find.text('20:00'), findsNothing);
    expect(find.byType(LinearProgressIndicator), findsNothing);
  });

  testWidgets('the wallet tabs work like an iOS segmented control: the white thumb slides across', (tester) async {
    final s = await store();
    await tester.pumpWidget(host(s, const PassengerWalletScreen()));
    await tester.pumpAndSettle();
    final thumb = find.byType(AnimatedAlign);
    expect(tester.widget<AnimatedAlign>(thumb).alignment, Alignment.centerLeft);
    await tester.tap(find.text('Lịch sử'));
    await tester.pump();
    expect(tester.widget<AnimatedAlign>(thumb).alignment, Alignment.centerRight);
    await tester.pumpAndSettle();
  });
}
