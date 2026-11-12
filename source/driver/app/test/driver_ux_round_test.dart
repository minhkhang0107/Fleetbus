import 'dart:convert';

import 'package:app/src/presentation/driver_manifest_screen.dart';
import 'package:app/src/presentation/driver_permissions.dart';
import 'package:app/src/presentation/driver_readiness_screen.dart';
import 'package:app/src/presentation/driver_store.dart';
import 'package:app/src/presentation/driver_today_trips_screen.dart';
import 'package:app/src/presentation/driver_widgets.dart';
import 'package:app/src/service/driver_api_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _AlwaysLocation implements DevicePermissions {
  @override
  Future<LocationAccess> location() async => LocationAccess.always;
  @override
  Future<LocationAccess> requestLocation() async => LocationAccess.always;
  @override
  Future<LocationAccess> requestBackgroundLocation() async => LocationAccess.always;
  @override
  Future<bool> requestNotifications() async => true;
  @override
  Future<bool> camera({bool request = false}) async => true;
  @override
  Future<void> openSettings() async {}
  @override
  Future<void> openLocationSettings() async {}
}

/// D188: what the driver walk-through of 30/10 changed (trip list order, undo of a boarding, walk-up fares by
/// distance, seat order, plain words).
void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    driverPermissions = _AlwaysLocation();
  });

  Map<String, dynamic> tripJson(String id, String departure, String status, {List<Map<String, dynamic>> manifest = const []}) => {
        'trip_id': id,
        'route_name': 'Hà Nội — Thanh Hóa (Cao tốc)',
        'planned_departure_time': departure,
        'status': status,
        'vehicle_plate': '29B-882.19',
        'base_fare_vnd': 220000,
        'current_stop_index': 0,
        'stops': [
          {'stop_id': 'stp_a', 'name': 'Bến xe Giáp Bát', 'order': 1, 'status': status == 'IN_TRANSIT' ? 'ARRIVED' : 'PENDING'},
          {'stop_id': 'stp_b', 'name': 'Nút giao Pháp Vân', 'order': 2, 'status': 'PENDING'},
          {'stop_id': 'stp_c', 'name': 'Bến xe Phía Bắc Thanh Hóa', 'order': 3, 'status': 'PENDING'},
        ],
        'hail_fares': {'stp_b': 70000, 'stp_c': 220000},
        'manifest': manifest,
      };

  // 30/10/2026 10:00 in Vietnam.
  final now = DateTime.utc(2026, 10, 30, 3);

  DriverStore storeWith(List<Map<String, dynamic>> trips, {List<http.Request>? sent}) {
    final byId = {for (final t in trips) t['trip_id'] as String: t};
    final client = MockClient((req) async {
      sent?.add(req);
      Map<String, dynamic>? data;
      final path = req.url.path;
      if (path.endsWith('/driver/trips/today')) {
        data = {'trips': trips};
      } else if (path.endsWith('/boarding/manual')) {
        data = {'ticket_id': jsonDecode(req.body)['ticket_id']};
      } else {
        final id = path.split('/').where((s) => s.startsWith('trp_')).firstOrNull;
        if (id != null) data = trips.where((t) => t['trip_id'] == id).firstOrNull ?? byId[id];
      }
      return http.Response(jsonEncode({'status': 'success', 'data': data ?? {}}), 200, headers: {'content-type': 'application/json; charset=utf-8'});
    });
    return DriverStore(api: DriverApiClientService(baseUrl: 'http://test', client: client), clock: () => now);
  }

  test('seat codes sort by letter then number, as on the bus', () {
    expect(sortedSeats(['A04', 'B02', 'A10', 'A05', 'B10', 'A07', 'B03']), ['A04', 'A05', 'A07', 'A10', 'B02', 'B03', 'B10']);
  });

  test('how a passenger pays is said in plain words, never COD or a gateway name', () {
    Passenger p(Map<String, dynamic> extra) => Passenger.fromJson({'ticket_id': 't', 'seat_code': 'A01', ...extra});
    expect(payNote(p({'payment_method': 'VNPAY_ONLINE'})), 'đã trả tiền');
    expect(payNote(p({'payment_method': 'COD', 'cod_amount_vnd': 220000})), 'thu 220.000 đ khi lên');
    expect(payNote(p({'payment_method': 'COD', 'cod_amount_vnd': 220000, 'cod_collected': true})), 'đã thu tiền mặt');
    expect(payNote(p({'is_hail_passenger': true})), 'khách vẫy, đã thu tiền');
  });

  test('a trip of an earlier day is marked as past; today and tomorrow are named', () {
    final vnNow = DateTime.utc(2026, 10, 30, 10);
    expect(tripDayPast(DateTime.utc(2026, 8, 28, 14), vnNow), isTrue);
    expect(tripDayPast(DateTime.utc(2026, 10, 30, 7), vnNow), isFalse);
    expect(tripDayLabel(DateTime.utc(2026, 10, 30, 7), vnNow), 'Hôm nay');
    expect(tripDayLabel(DateTime.utc(2026, 10, 31, 7), vnNow), 'Ngày mai');
    expect(tripDayLabel(DateTime.utc(2026, 8, 28, 7), vnNow), '28/08');
  });

  test('the walk-up fare follows the drop-off the server priced; unknown stops cost the trip fare', () async {
    final store = storeWith([tripJson('trp_today', '2026-10-30T14:00:00+07:00', 'IN_TRANSIT')]);
    await store.loadShift();
    expect(store.hailFareTo('stp_b'), 70000);
    expect(store.hailFareTo('stp_c'), 220000);
    expect(store.hailFareTo('stp_unknown'), 220000);
    store.dispose();
  });

  test('the big card takes the trip on the road, then the next one to drive, never a finished one', () async {
    final store = storeWith([
      tripJson('trp_done', '2026-10-30T07:00:00+07:00', 'COMPLETED'),
      tripJson('trp_next', '2026-10-30T14:00:00+07:00', 'DISPATCHED'),
    ]);
    await store.loadShift();
    expect(store.tripId, 'trp_next');
    // Looking at the finished trip, then reloading, brings the trip to drive back.
    await store.selectTrip('trp_done');
    expect(store.tripId, 'trp_done');
    await store.loadShift();
    expect(store.tripId, 'trp_next');
    store.dispose();
  });

  test('a trip hours past its time with no one on board does not hide the next trip to drive (D191)', () async {
    final store = storeWith([
      tripJson('trp_missed', '2026-10-30T07:00:00+07:00', 'DISPATCHED'),
      tripJson('trp_evening', '2026-10-30T19:30:00+07:00', 'DISPATCHED'),
    ]);
    await store.loadShift();
    expect(store.tripId, 'trp_evening');
    // Nothing else left today: the overdue trip still shows.
    final alone = storeWith([tripJson('trp_missed', '2026-10-30T07:00:00+07:00', 'DISPATCHED')]);
    await alone.loadShift();
    expect(alone.tripId, 'trp_missed');
    store.dispose();
    alone.dispose();
  });

  test('an auto-picked overdue trip yields to the next trip on reload unless explicitly picked (D191)', () async {
    final trips = [tripJson('trp_missed', '2026-10-30T07:00:00+07:00', 'DISPATCHED')];
    final store = storeWith(trips);
    await store.loadShift();
    expect(store.tripId, 'trp_missed');

    trips.add(tripJson('trp_evening', '2026-10-30T19:30:00+07:00', 'DISPATCHED'));
    await store.loadShift();
    expect(store.tripId, 'trp_evening');

    await store.selectTrip('trp_missed');
    expect(store.tripId, 'trp_missed');
    await store.loadShift();
    expect(store.tripId, 'trp_missed');
    store.dispose();
  });

  testWidgets('more than an hour before its time the start button says from when and asks nothing (D191)', (tester) async {
    final sent = <http.Request>[];
    final store = storeWith([tripJson('trp_next', '2026-10-30T14:00:00+07:00', 'DISPATCHED')], sent: sent);
    await tester.runAsync(store.loadShift);
    for (var i = 0; i < 6; i++) {
      store.toggleCheck(i, true);
    }
    await tester.pumpWidget(DriverScope(store: store, child: const MaterialApp(home: DriverReadinessScreen())));
    await tester.pumpAndSettle();
    expect(find.text('Xuất bến từ 13:00'), findsOneWidget);
    await tester.tap(find.text('Xuất bến từ 13:00'));
    await tester.pumpAndSettle();
    expect(find.text('Chưa tới giờ xuất bến'), findsOneWidget);
    expect(find.textContaining('xuất bến được từ 13:00'), findsOneWidget);
    expect(sent.where((r) => r.url.path.endsWith('/start')), isEmpty);
    store.dispose();
  });

  test('a tapped push puts its trip on the big card, but never while a trip is on the road (D192)', () async {
    final store = storeWith([
      tripJson('trp_next', '2026-10-30T14:00:00+07:00', 'DISPATCHED'),
      tripJson('trp_given', '2026-10-30T18:00:00+07:00', 'DISPATCHED'),
    ]);
    // Before sign-in the push waits; nothing is loaded.
    await store.openFromPush('trp_given');
    expect(store.tripId, isNull);
    store.api.authToken = 'tok';
    await store.openFromPush('trp_given');
    expect(store.tripId, 'trp_given');

    final onRoad = storeWith([
      tripJson('trp_running', '2026-10-30T09:00:00+07:00', 'IN_TRANSIT'),
      tripJson('trp_given', '2026-10-30T18:00:00+07:00', 'DISPATCHED'),
    ])..api.authToken = 'tok';
    await onRoad.openFromPush('trp_given');
    expect(onRoad.tripId, 'trp_running');
    store.dispose();
    onRoad.dispose();
  });

  test('the push token reaches the server once signed in, and signing out sends none (D192)', () async {
    final sent = <http.Request>[];
    final store = storeWith([tripJson('trp_next', '2026-10-30T14:00:00+07:00', 'DISPATCHED')], sent: sent);
    await store.setPushToken('drv-token');
    expect(sent.where((r) => r.url.path.endsWith('/driver/devices')), isEmpty, reason: 'not signed in yet');
    store.api.authToken = 'tok';
    store.pushToken = null;
    await store.setPushToken('drv-token');
    expect(jsonDecode(sent.last.body), {'platform': 'android', 'token': 'drv-token'});
    store.logout();
    await Future<void>.delayed(Duration.zero);
    expect(jsonDecode(sent.where((r) => r.url.path.endsWith('/driver/devices')).last.body), {'platform': 'android'});
    store.dispose();
  });

  test('a push while the app is open reloads the trips and leaves the office\'s words to show (D192)', () async {
    final sent = <http.Request>[];
    final store = storeWith([tripJson('trp_next', '2026-10-30T14:00:00+07:00', 'DISPATCHED')], sent: sent)..api.authToken = 'tok';
    await store.onPushWhileOpen('Bạn có chuyến mới', 'Chuyến 14:00 ngày 30/10, xe 29B-882.19.');
    expect(store.pushMessage, 'Bạn có chuyến mới. Chuyến 14:00 ngày 30/10, xe 29B-882.19.');
    expect(sent.where((r) => r.url.path.endsWith('/driver/trips/today')), isNotEmpty);
    store.dispose();
  });

  testWidgets('tapping a trip in the list highlights it and keeps the list order; finished trips sit apart', (tester) async {
    final store = storeWith([
      tripJson('trp_done', '2026-10-30T07:00:00+07:00', 'COMPLETED'),
      tripJson('trp_next', '2026-10-30T14:00:00+07:00', 'DISPATCHED'),
      tripJson('trp_late', '2026-10-30T18:00:00+07:00', 'DISPATCHED'),
    ]);
    await tester.runAsync(store.loadShift);
    await tester.pumpWidget(DriverScope(store: store, child: const MaterialApp(home: Scaffold(body: DriverTodayTripsScreen()))));
    await tester.pumpAndSettle();
    expect(find.text('Chuyến cần chạy (2)'), findsOneWidget);
    expect(find.text('Đã chạy xong (1)'), findsOneWidget);
    expect(find.text('Đang hiện ở trên'), findsOneWidget);

    Finder tile(String time) => find.descendant(of: find.byType(InkWell), matching: find.text(time)).first;
    double top(String time) => tester.getTopLeft(tile(time)).dy;
    await tester.ensureVisible(tile('18:00'));
    await tester.pumpAndSettle();
    expect(top('14:00') < top('18:00') && top('18:00') < top('07:00'), isTrue);
    await tester.tap(tile('18:00'));
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 50)));
    await tester.pumpAndSettle();
    expect(store.tripId, 'trp_late');
    // Same order after the tap: only the highlight moved.
    expect(top('14:00') < top('18:00') && top('18:00') < top('07:00'), isTrue);
    store.dispose();
  });

  testWidgets('the big card says the trip is late, with its day', (tester) async {
    final store = storeWith([tripJson('trp_morning', '2026-10-30T07:00:00+07:00', 'DISPATCHED')]);
    await tester.runAsync(store.loadShift);
    await tester.pumpWidget(DriverScope(store: store, child: const MaterialApp(home: Scaffold(body: DriverTodayTripsScreen()))));
    await tester.pumpAndSettle();
    expect(find.text('Hôm nay'), findsWidgets);
    expect(find.text('Trễ 3 giờ 0 phút'), findsOneWidget);
    store.dispose();
  });

  testWidgets('"Cho lên xe" waits a few seconds and can be taken back', (tester) async {
    final sent = <http.Request>[];
    final store = storeWith([
      tripJson('trp_run', '2026-10-30T14:00:00+07:00', 'IN_TRANSIT', manifest: [
        {'ticket_id': 'tkt_1', 'seat_code': 'A01', 'passenger_name': 'Trần Văn Hùng', 'pickup_stop_id': 'stp_a', 'dropoff_stop_id': 'stp_c', 'payment_method': 'VNPAY_ONLINE', 'boarding_status': 'ISSUED'},
      ]),
    ], sent: sent);
    await tester.runAsync(store.loadShift);
    await tester.pumpWidget(DriverScope(store: store, child: const MaterialApp(home: DriverManifestScreen())));
    await tester.pumpAndSettle();
    expect(find.textContaining('đã trả tiền'), findsOneWidget);

    await tester.tap(find.widgetWithText(BigButton, 'Cho lên xe'));
    await tester.pump();
    expect(find.text('Đang cho lên…'), findsOneWidget);
    await tester.tap(find.widgetWithText(BigButton, 'Bấm nhầm? Hoàn tác'));
    await tester.pump(DriverStore.boardUndoDelay + const Duration(seconds: 1));
    expect(sent.where((r) => r.url.path.endsWith('/boarding/manual')), isEmpty);
    expect(find.widgetWithText(BigButton, 'Cho lên xe'), findsOneWidget);

    await tester.tap(find.widgetWithText(BigButton, 'Cho lên xe'));
    await tester.pump(DriverStore.boardUndoDelay + const Duration(milliseconds: 100));
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 50)));
    expect(sent.where((r) => r.url.path.endsWith('/boarding/manual')), hasLength(1));
    store.dispose();
  });

  test('cancelled manifest items are dropped so manifest has 1 passenger and shift entry counts 1', () async {
    final store = storeWith([
      tripJson(
        'trp_cancel_test',
        '2026-10-30T14:00:00+07:00',
        'READY',
        manifest: [
          {
            'ticket_id': 'tkt_active',
            'seat_code': 'A03',
            'passenger_name': 'Nguyễn An',
            'pickup_stop_id': 'stp_a',
            'dropoff_stop_id': 'stp_c',
            'boarding_status': 'NOT_BOARDED',
            'payment_method': 'CASH',
            'cod_amount_vnd': 220000,
          },
          {
            'ticket_id': 'tkt_cancelled',
            'seat_code': 'B03',
            'passenger_name': 'Trần Bình',
            'pickup_stop_id': 'stp_a',
            'dropoff_stop_id': 'stp_c',
            'boarding_status': 'CANCELLED',
            'payment_method': 'CASH',
            'cod_amount_vnd': 220000,
          },
        ],
      ),
    ]);
    await store.loadShift();
    expect(store.manifest, hasLength(1));
    expect(store.manifest.first.seat, 'A03');
    expect(store.shift.first.booked, 1);
    store.dispose();
  });
}
