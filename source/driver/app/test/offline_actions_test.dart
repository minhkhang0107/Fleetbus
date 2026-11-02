import 'dart:convert';

import 'package:app/src/presentation/driver_end_trip_screen.dart';
import 'package:app/src/presentation/driver_permissions.dart';
import 'package:app/src/presentation/driver_qr_scanner_screen.dart';
import 'package:app/src/presentation/driver_store.dart';
import 'package:app/src/presentation/driver_widgets.dart';
import 'package:app/src/service/driver_api_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _FakePermissions implements DevicePermissions {
  _FakePermissions(this.access, {this.cameraOk = true});
  LocationAccess access;
  final bool cameraOk;
  final List<String> asked = [];

  @override
  Future<LocationAccess> location() async => access;
  @override
  Future<LocationAccess> requestLocation() async => access;
  @override
  Future<LocationAccess> requestBackgroundLocation() async => access;
  @override
  Future<bool> requestNotifications() async => true;
  @override
  Future<bool> camera({bool request = false}) async => cameraOk;
  @override
  Future<void> openSettings() async => asked.add('settings');
  @override
  Future<void> openLocationSettings() async => asked.add('location-settings');
}

void main() {
  late bool networkDown;
  late List<http.Request> sent;
  late Map<String, dynamic> trip;

  http.Response ok(Object? data) => http.Response(
        jsonEncode({'status': 'success', 'data': data}),
        200,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );

  setUp(() {
    SharedPreferences.setMockInitialValues({});
    networkDown = false;
    sent = [];
    trip = {
      'trip_id': 'trp_hn_th_01',
      'route_name': 'Hà Nội — Thanh Hóa (Cao tốc)',
      'planned_departure_time': '2026-08-28T07:00:00+07:00',
      'status': 'IN_TRANSIT',
      'vehicle_plate': '29B-882.19',
      'base_fare_vnd': 220000,
      'current_stop_index': 0,
      'total_cod_collected_vnd': 0,
      'total_hail_collected_vnd': 0,
      'debts': <Map<String, dynamic>>[],
      'readiness_checklist': {for (final k in DriverStore.checkKeys) k: true},
      'stops': [
        {'stop_id': 'stp_hn_gb', 'name': 'Bến xe Giáp Bát', 'order': 1, 'status': 'ARRIVED'},
        {'stop_id': 'stp_nb', 'name': 'Bến xe Ninh Bình', 'order': 2, 'status': 'PENDING'},
        {'stop_id': 'stp_th_pb', 'name': 'Bến xe Phía Bắc Thanh Hóa', 'order': 3, 'status': 'PENDING'},
      ],
      'manifest': [
        {
          'ticket_id': 't_a01',
          'seat_code': 'A01',
          'passenger_name': 'Trần Văn Hùng',
          'phone_masked': '098***112',
          'pickup_stop_id': 'stp_hn_gb',
          'dropoff_stop_id': 'stp_th_pb',
          'boarding_status': 'ISSUED',
          'payment_method': 'VIETQR',
          'cod_amount_vnd': 0,
          'pnr': 'BG-000001',
        },
        {
          'ticket_id': 't_a02',
          'seat_code': 'A02',
          'passenger_name': 'Nguyễn Văn Nam',
          'phone_masked': '098***321',
          'pickup_stop_id': 'stp_hn_gb',
          'dropoff_stop_id': 'stp_th_pb',
          'boarding_status': 'ISSUED',
          'payment_method': 'COD',
          'cod_amount_vnd': 220000,
          'pnr': 'BG-000002',
        },
      ],
    };
  });

  DriverApiClientService buildApi() {
    final client = MockClient((req) async {
      sent.add(req);
      if (networkDown) {
        throw http.ClientException('network down');
      }
      final path = req.url.path;
      final body = req.body.isEmpty ? <String, dynamic>{} : jsonDecode(req.body) as Map<String, dynamic>;

      if (path.endsWith('/auth/driver/login')) {
        return ok({
          'token': 'tok_driver',
          'driver': {'full_name': 'Trần Văn Bình', 'staff_id': 'TX8821'},
          'operator': {'code': 'SAOMAI', 'name': 'Sao Mai Bus', 'hotline': '1900 6868'},
        });
      }
      if (path.endsWith('/trips/today')) {
        return ok({'trips': [trip]});
      }
      if (path.endsWith('/telemetry/batch-replay')) {
        return ok({'replayed_count': (body['telemetryBuffer'] as List).length});
      }
      if (path.contains('/telemetry')) {
        return ok({});
      }
      if (path.endsWith('/end')) {
        return ok({'total_cash_to_handover_vnd': 0});
      }
      if (path.contains('/driver/trips/')) {
        return ok(trip);
      }
      return ok({});
    });
    return DriverApiClientService(baseUrl: 'http://test', client: client);
  }

  test('offline QR scan of a manifest ticket -> QUEUED_OFFLINE + passenger boarded locally + 1 queued item', () async {
    final store = DriverStore(api: buildApi());
    expect(await store.login('SAOMAI', 'TX8821', '123456'), isNull);
    expect(store.manifest.firstWhere((p) => p.seat == 'A01').status, PaxStatus.waiting);

    networkDown = true;
    final r = await store.boardWithQr('BUSGO|BG-000001|t_a01|v1|sig');

    expect(r.code, 'QUEUED_OFFLINE');
    expect(r.error, isNull);
    expect(r.data?['seat_code'], 'A01');
    expect(r.data?['passenger_name'], 'Trần Văn Hùng');
    expect(store.manifest.firstWhere((p) => p.seat == 'A01').status, PaxStatus.boarded);
    expect(store.queue, hasLength(1));
    expect(store.queue.single.label, 'Quét vé');

    store.dispose();
  });

  test('unknown ticket offline -> rejected and queue empty', () async {
    final store = DriverStore(api: buildApi());
    expect(await store.login('SAOMAI', 'TX8821', '123456'), isNull);

    networkDown = true;
    final r = await store.boardWithQr('BUSGO|BG-UNKNOWN|t_unknown|v1|sig');

    expect(r.code, 'TICKET_NOT_FOUND');
    expect(r.error, contains('Mất mạng và vé không có trong danh sách chuyến này. Gọi nhà xe để kiểm tra.'));
    expect(store.queue, isEmpty);

    store.dispose();
  });

  test('second scan of same ticket -> đã lên xe and no extra item', () async {
    final store = DriverStore(api: buildApi());
    expect(await store.login('SAOMAI', 'TX8821', '123456'), isNull);

    networkDown = true;
    final r1 = await store.boardWithQr('BUSGO|BG-000001|t_a01|v1|sig');
    expect(r1.code, 'QUEUED_OFFLINE');
    expect(store.queue, hasLength(1));

    final r2 = await store.boardWithQr('BUSGO|BG-000001|t_a01|v1|sig');
    expect(r2.code, 'ALREADY_BOARDED');
    expect(r2.error, contains('đã lên xe'));
    expect(store.queue, hasLength(1));

    store.dispose();
  });

  test('endTrip twice offline -> one queued item, trip completed', () async {
    final store = DriverStore(api: buildApi());
    expect(await store.login('SAOMAI', 'TX8821', '123456'), isNull);

    networkDown = true;
    final err1 = await store.endTrip();
    expect(err1, isNull);
    expect(store.trip, TripState.completed);
    expect(store.queue, hasLength(1));
    expect(store.queue.single.label, 'Kết thúc chuyến');

    final err2 = await store.endTrip();
    expect(err2, isNull);
    expect(store.trip, TripState.completed);
    expect(store.queue, hasLength(1));

    store.dispose();
  });

  test('telemetry offline 3 times then back online -> one batch-replay request containing 3 pings, buffer empty after', () async {
    final store = DriverStore(api: buildApi());
    expect(await store.login('SAOMAI', 'TX8821', '123456'), isNull);

    networkDown = true;
    sent.clear();

    await store.sendTelemetry();
    await store.sendTelemetry();
    await store.sendTelemetry();

    expect(store.telemetryBuffer, hasLength(3));
    expect(store.queue, isEmpty);

    networkDown = false;
    sent.clear();

    await store.sendTelemetry();

    final batchRequests = sent.where((r) => r.url.path.endsWith('/telemetry/batch-replay')).toList();
    expect(batchRequests, hasLength(1));

    final body = jsonDecode(batchRequests.single.body) as Map<String, dynamic>;
    final pings = body['telemetryBuffer'] as List;
    expect(pings, hasLength(3));
    expect(pings.first['trip_id'], 'trp_hn_th_01');
    expect(store.telemetryBuffer, isEmpty);

    store.dispose();
  });

  test('offline scan of unpaid COD ticket returns COD_PAYMENT_REQUIRED and drops queued board action', () async {
    final store = DriverStore(api: buildApi());
    expect(await store.login('SAOMAI', 'TX8821', '123456'), isNull);

    networkDown = true;
    final r = await store.boardWithQr('BUSGO|BG-000002|t_a02|v1|sig');

    expect(r.code, 'COD_PAYMENT_REQUIRED');
    expect(r.data?['ticket_id'], 't_a02');
    expect(store.queue, isEmpty);

    store.dispose();
  });

  testWidgets('DriverEndTripScreen displays extra offline line when endTrip is queued offline', (tester) async {
    final store = DriverStore(api: buildApi());
    expect(await store.login('SAOMAI', 'TX8821', '123456'), isNull);
    await store.arrive();

    networkDown = true;
    await tester.pumpWidget(DriverScope(
      store: store,
      child: const MaterialApp(home: DriverEndTripScreen()),
    ));
    await tester.pumpAndSettle();

    await tester.tap(find.widgetWithText(BigButton, 'Kết thúc và nộp 0 đ'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(BigButton, 'Kết thúc chuyến'));
    await tester.pumpAndSettle();

    expect(find.textContaining('Chưa gửi được lên máy chủ — máy sẽ gửi khi có sóng. Nộp tiền tại bến như bình thường.'), findsOneWidget);
    store.dispose();
  });

  testWidgets('DriverQrScannerScreen PIN sheet displays amber warning sheet when boarding offline', (tester) async {
    driverPermissions = _FakePermissions(LocationAccess.always, cameraOk: true);
    tester.view.physicalSize = const Size(800, 1200);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    final store = DriverStore(api: buildApi());
    expect(await store.login('SAOMAI', 'TX8821', '123456'), isNull);
    await store.arrive();

    networkDown = true;
    await tester.pumpWidget(DriverScope(
      store: store,
      child: const MaterialApp(home: DriverQrScannerScreen()),
    ));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Khách không có vé trên máy: nhập PIN'));
    await tester.pumpAndSettle();

    expect(find.text('Lên xe bằng mã PIN'), findsOneWidget);
    await tester.enterText(find.byType(TextField), '482107');
    await tester.tap(find.widgetWithText(BigButton, 'Kiểm tra'));
    await tester.pumpAndSettle();

    expect(find.text('Đã ghi nhận · chưa xác minh'), findsOneWidget);
    expect(find.text('Mất mạng: vé có trong danh sách chuyến (ghế A01). Máy sẽ gửi lên khi có sóng.'), findsOneWidget);

    store.dispose();
  });

  test('reopened without a network: today\'s trips and passengers come from the device, queued boardings stay boarded', () async {
    final first = DriverStore(api: buildApi());
    expect(await first.login('SAOMAI', 'TX8821', '123456'), isNull);
    networkDown = true;
    expect((await first.boardWithQr('BUSGO|BG-000001|t_a01|v1|sig')).code, 'QUEUED_OFFLINE');
    first.dispose();

    // The app is closed and opened again in a place without a network: the session token is still valid.
    final prefs = await SharedPreferences.getInstance();
    final session = jsonDecode(prefs.getString('driver_session')!) as Map<String, dynamic>;
    final exp = DateTime.now().add(const Duration(hours: 4)).millisecondsSinceEpoch;
    session['token'] = 'drv_jwt_${base64Url.encode(utf8.encode(jsonEncode({'sub': 'drv_8821a', 'exp': exp}))).replaceAll('=', '')}.sig';
    await prefs.setString('driver_session', jsonEncode(session));

    final store = DriverStore(api: buildApi());
    expect(await store.restoreSession(), isTrue);
    await store.loadShift(autoFlush: false);
    expect(store.loadError, isNull);
    expect(store.shiftSavedAt, isNotNull);
    expect(store.manifest, isNotEmpty);
    expect(store.manifest.firstWhere((p) => p.seat == 'A01').status, PaxStatus.boarded, reason: 'the queued scan is not lost on screen');
    expect(store.queue, hasLength(1));

    final again = await store.boardWithQr('BUSGO|BG-000001|t_a01|v1|sig');
    expect(again.code, 'ALREADY_BOARDED');
    expect(store.queue, hasLength(1));

    store.logout();
    await Future<void>.delayed(Duration.zero);
    expect(prefs.getKeys().where((k) => k.startsWith('driver_shift_')), isEmpty, reason: 'the passenger list leaves the device with the session');
    store.dispose();
  });

  test('a shift saved on another day is not shown offline', () async {
    SharedPreferences.setMockInitialValues({
      'driver_shift_TX8821': jsonEncode({'saved_at': '2026-01-01T00:00:00Z', 'day': '2026-1-1', 'data': {'trips': []}}),
    });
    final store = DriverStore(api: buildApi());
    store.staffId = 'TX8821';
    networkDown = true;
    await store.loadShift(autoFlush: false);
    expect(store.loadError, isNotNull);
    expect(store.shiftSavedAt, isNull);
    store.dispose();
  });
}
