import 'dart:convert';

import 'package:app/src/presentation/driver_incident_dialog.dart';
import 'package:app/src/presentation/driver_offline_sync_screen.dart';
import 'package:app/src/presentation/driver_store.dart';
import 'package:app/src/presentation/driver_widgets.dart';
import 'package:app/src/service/driver_api_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  late bool networkDown;
  late int failAfterRequests;
  late List<http.Request> sent;
  late Map<String, dynamic> trip;
  late Map<String, http.Response Function(http.Request, Map<String, dynamic>)> customHandlers;

  http.Response ok(Object? data) => http.Response(
        jsonEncode({'status': 'success', 'data': data}),
        200,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );

  http.Response fail(int status, String code, String message) => http.Response(
        jsonEncode({'status': 'error', 'code': code, 'message': message}),
        status,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );

  setUp(() {
    SharedPreferences.setMockInitialValues({});
    networkDown = false;
    failAfterRequests = -1;
    sent = [];
    customHandlers = {};
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
        },
      ],
    };
  });

  DriverApiClientService buildApi() {
    Map<String, dynamic> pax(String id) =>
        (trip['manifest'] as List).cast<Map<String, dynamic>>().firstWhere((m) => m['ticket_id'] == id);

    final client = MockClient((req) async {
      sent.add(req);
      if (networkDown) {
        throw http.ClientException('network down');
      }
      if (failAfterRequests >= 0) {
        if (failAfterRequests == 0) {
          throw http.ClientException('network down during flush');
        }
        failAfterRequests--;
      }
      final path = req.url.path;
      final body = req.body.isEmpty ? <String, dynamic>{} : jsonDecode(req.body) as Map<String, dynamic>;

      for (final entry in customHandlers.entries) {
        if (path.endsWith(entry.key)) {
          return entry.value(req, body);
        }
      }

      if (path.endsWith('/auth/driver/login')) {
        final staff = body['staffIdOrPhone']?.toString() ?? 'TX8821';
        return ok({
          'token': 'tok_$staff',
          'driver': {'full_name': 'Trần Văn Bình', 'staff_id': staff},
          'operator': {'code': 'SAOMAI', 'name': 'Sao Mai Bus', 'hotline': '1900 6868'},
        });
      }
      if (path.endsWith('/trips/today')) {
        return ok({'trips': [trip]});
      }
      if (path.endsWith('/boarding/manual')) {
        final p = pax(body['ticket_id']);
        p['boarding_status'] = 'BOARDED';
        p['boarded_at'] = '2026-08-28T00:05:00Z';
        return ok(p);
      }
      if (path.endsWith('/boarding')) {
        final payload = '${body['qrPayload'] ?? ''}';
        if (payload.endsWith('|dup')) {
          return fail(409, 'TICKET_ALREADY_BOARDED', 'Vé đã được quét');
        }
        final p = pax('t_a01');
        p['boarding_status'] = 'BOARDED';
        return ok(p);
      }
      if (path.endsWith('/payments/cod-collect')) {
        final p = pax(body['ticket_id']);
        p['cod_collected'] = true;
        p['boarding_status'] = 'BOARDED';
        trip['total_cod_collected_vnd'] = 220000;
        return ok(p);
      }
      if (path.endsWith('/incidents')) {
        return ok({'incident_id': 'inc_01'});
      }
      if (path.contains('/driver/trips/')) {
        return ok(trip);
      }
      return ok({});
    });
    return DriverApiClientService(baseUrl: 'http://test', client: client);
  }

  test('a revoked session signs the driver out and keeps the reason for the login screen (H-06)', () async {
    final store = DriverStore(api: buildApi());
    expect(await store.login('SAOMAI', 'TX8821', '123456'), isNull);
    customHandlers['/trips/today'] = (_, __) => fail(401, 'TOKEN_REVOKED', 'Phiên đăng nhập đã hết hiệu lực, vui lòng đăng nhập lại');
    await store.loadShift();
    expect(store.api.authToken, isNull);
    expect(store.sessionEnded, 'Phiên đăng nhập đã hết hiệu lực, vui lòng đăng nhập lại');
    store.dispose();
  });

  test('changing the PIN carries on with the token the server returns', () async {
    final store = DriverStore(api: buildApi());
    expect(await store.login('SAOMAI', 'TX8821', '123456'), isNull);
    customHandlers['/auth/change-pin'] = (_, __) => ok({'success': true, 'token': 'tok_after_change'});
    expect(await store.changePin('123456', '849201'), isNull);
    expect(store.api.authToken, 'tok_after_change');
    store.dispose();
  });

  test('offline action is queued with its original idempotency key and replayed with the SAME key on flush', () async {
    final store = DriverStore(api: buildApi());
    expect(await store.login('SAOMAI', 'TX8821', '123456'), isNull);
    final p = store.manifest.firstWhere((m) => m.seat == 'A01');

    // Go offline and attempt to board passenger A01.
    networkDown = true;
    final err = await store.board(p);
    expect(err, savedOffline);
    expect(store.offline, isTrue);
    expect(store.queue, hasLength(1));

    final firstAttempt = sent.last;
    final firstKey = firstAttempt.headers['idempotency-key'];
    expect(firstKey, isNotNull);
    expect(firstKey, isNotEmpty);

    final queued = store.queue.single;
    expect(queued.label, 'Cho lên xe ghế A01');
    expect(queued.method, 'POST');
    expect(queued.path, '/api/v1/driver/trips/trp_hn_th_01/boarding/manual');
    expect(queued.body, {'ticket_id': 't_a01'});
    expect(queued.idempotencyKey, firstKey);

    // Network comes back; flushQueue resends with the exact same idempotency key and refreshes the trip.
    networkDown = false;
    sent.clear();
    final flushedCount = await store.flushQueue();
    expect(flushedCount, 1);
    expect(store.queue, isEmpty);
    expect(store.offline, isFalse);

    final replayReq = sent.firstWhere((r) => r.url.path.endsWith('/boarding/manual'));
    expect(replayReq.headers['idempotency-key'], firstKey);
    expect(jsonDecode(replayReq.body), {'ticket_id': 't_a01'});
    expect(sent.any((r) => r.url.path == '/api/v1/driver/trips/trp_hn_th_01'), isTrue, reason: 'trip is refreshed after flushing');
    expect(store.manifest.firstWhere((m) => m.seat == 'A01').status, PaxStatus.boarded);

    store.dispose();
  });

  test('a network failure during flush stops at the failure and keeps the remaining items in order', () async {
    final store = DriverStore(api: buildApi());
    expect(await store.login('SAOMAI', 'TX8821', '123456'), isNull);
    final p1 = store.manifest.firstWhere((m) => m.seat == 'A01');
    final p2 = store.manifest.firstWhere((m) => m.seat == 'A02');

    networkDown = true;
    await store.boardWithQr('BUSGO|BG-000001|t_a01|v1|sig');
    await store.collectCod(p2, given: 220000, method: 'CASH');
    await store.reportIncident('Kẹt xe', 15, 'Tắc đường cao tốc');
    expect(store.queue, hasLength(3));

    final keys = store.queue.map((q) => q.idempotencyKey).toList();
    expect(keys.toSet(), hasLength(3));

    // Allow only the first replay request to succeed; the second throws a network error.
    networkDown = false;
    failAfterRequests = 1;
    sent.clear();

    final count = await store.flushQueue();
    expect(count, 1);
    expect(store.offline, isTrue);
    expect(store.queue, hasLength(2));
    expect(store.queue.map((q) => q.idempotencyKey).toList(), [keys[1], keys[2]]);
    expect(store.queue.first.label, 'Thu COD ghế ${p2.seat}');
    expect(store.queue.last.label, 'Báo sự cố: Kẹt xe');

    // Now let the network stay up and flush the rest.
    failAfterRequests = -1;
    final restCount = await store.flushQueue();
    expect(restCount, 2);
    expect(store.queue, isEmpty);
    expect(store.offline, isFalse);
    expect(store.manifest.firstWhere((m) => m.seat == p1.seat).status, PaxStatus.boarded);
    expect(store.codCash, 220000);

    store.dispose();
  });

  test('the queue survives a new store instance via SharedPreferences under one key per driver', () async {
    // 1. Seed SharedPreferences directly with setMockInitialValues and verify a new store loads it.
    final presetKey = 'idem_preset_123456';
    SharedPreferences.setMockInitialValues({
      DriverStore.queueKeyFor('TX8821'): jsonEncode([
        {
          'label': 'Cho lên xe ghế A01',
          'at': 420,
          'method': 'POST',
          'path': '/api/v1/driver/trips/trp_hn_th_01/boarding/manual',
          'body': {'ticket_id': 't_a01'},
          'idempotency_key': presetKey,
        }
      ]),
    });

    final store1 = DriverStore(api: buildApi());
    expect(await store1.login('SAOMAI', 'TX8821', '123456'), isNull);
    expect(store1.queue, hasLength(1));
    expect(store1.queue.single.idempotencyKey, presetKey);
    expect(store1.queue.single.label, 'Cho lên xe ghế A01');

    // Also add another offline action on store1, then dispose store1 without flushing.
    networkDown = true;
    await store1.reportIncident('Xe hỏng', 30, 'Nổ lốp sau');
    expect(store1.queue, hasLength(2));
    final secondKey = store1.queue.last.idempotencyKey;
    store1.dispose();

    // 2. A different driver (TX7701) has a separate empty queue.
    networkDown = false;
    final otherDriverStore = DriverStore(api: buildApi());
    expect(await otherDriverStore.login('SAOMAI', 'TX7701', '123456'), isNull);
    expect(otherDriverStore.queue, isEmpty);
    otherDriverStore.dispose();

    // 3. Reopening a new store instance for TX8821 restores both queued items and flushes them with their keys.
    final store2 = DriverStore(api: buildApi());
    expect(await store2.login('SAOMAI', 'TX8821', '123456'), isNull);
    expect(store2.queue, hasLength(2));
    expect(store2.queue.map((q) => q.idempotencyKey).toList(), [presetKey, secondKey]);

    sent.clear();
    final sentCount = await store2.flushQueue();
    expect(sentCount, 2);
    expect(store2.queue, isEmpty);

    final boardReq = sent.firstWhere((r) => r.url.path.endsWith('/boarding/manual'));
    final incReq = sent.firstWhere((r) => r.url.path.endsWith('/incidents'));
    expect(boardReq.headers['idempotency-key'], presetKey);
    expect(incReq.headers['idempotency-key'], secondKey);
    expect(jsonDecode(incReq.body)['description'], 'Nổ lốp sau');

    final prefs = await SharedPreferences.getInstance();
    expect(jsonDecode(prefs.getString(DriverStore.queueKeyFor('TX8821'))!), isEmpty);
    store2.dispose();
  });

  testWidgets('business error during flush removes the item and displays the error on DriverOfflineSyncScreen', (tester) async {
    final store = DriverStore(api: buildApi());
    expect(await store.login('SAOMAI', 'TX8821', '123456'), isNull);

    networkDown = true;
    await store.boardWithQr('BUSGO|BG-000001|t_a01|v1|dup');
    expect(store.queue, hasLength(1));

    networkDown = false;
    final sentCount = await store.flushQueue();
    expect(sentCount, 1);
    expect(store.queue, isEmpty);
    expect(store.syncErrors, hasLength(1));
    expect(store.syncErrors.single.error, 'Vé đã được quét');

    await tester.pumpWidget(DriverScope(
      store: store,
      child: const MaterialApp(home: Scaffold(body: DriverOfflineSyncScreen())),
    ));
    await tester.pump();

    expect(find.text('Quét vé'), findsOneWidget);
    expect(find.text('Vé đã được quét'), findsOneWidget);

    store.dispose();
  });

  test('when a later call succeeds while queue is not empty, it automatically starts a flush', () async {
    final store = DriverStore(api: buildApi());
    expect(await store.login('SAOMAI', 'TX8821', '123456'), isNull);
    final p = store.manifest.firstWhere((m) => m.seat == 'A01');

    networkDown = true;
    await store.board(p);
    expect(store.queue, hasLength(1));
    final queuedKey = store.queue.single.idempotencyKey;

    // Network recovers; a subsequent call (e.g. sendTelemetry) succeeds and triggers auto-flush.
    networkDown = false;
    sent.clear();
    await store.sendTelemetry();
    await pumpEventQueue();

    expect(store.queue, isEmpty);
    expect(store.offline, isFalse);
    final replayed = sent.where((r) => r.url.path.endsWith('/boarding/manual')).toList();
    expect(replayed, hasLength(1));
    expect(replayed.single.headers['idempotency-key'], queuedKey);

    store.dispose();
  });

  testWidgets('retries automatically every 30 seconds while offline with items queued, and cancels on logout/dispose', (tester) async {
    trip['status'] = 'READY';
    final store = DriverStore(api: buildApi());
    expect(await store.login('SAOMAI', 'TX8821', '123456'), isNull);
    final p = store.manifest.firstWhere((m) => m.seat == 'A01');

    networkDown = true;
    await store.board(p);
    expect(store.offline, isTrue);
    expect(store.queue, hasLength(1));
    final key = store.queue.single.idempotencyKey;

    // Network recovers; advancing 30 seconds triggers the periodic retry timer.
    networkDown = false;
    sent.clear();
    await tester.pump(const Duration(seconds: 30));
    await tester.pump();

    expect(store.queue, isEmpty);
    expect(store.offline, isFalse);
    final replayed = sent.where((r) => r.url.path.endsWith('/boarding/manual')).toList();
    expect(replayed, hasLength(1));
    expect(replayed.single.headers['idempotency-key'], key);

    // Queue another item offline, then logout: timer is cancelled so no retry happens after 30s.
    networkDown = true;
    await store.reportIncident('Kẹt xe', 15);
    expect(store.queue, hasLength(1));
    store.logout();
    networkDown = false;
    sent.clear();
    await tester.pump(const Duration(seconds: 30));
    await tester.pump();
    expect(sent, isEmpty);

    store.dispose();
  });

  testWidgets('B-08: Gọi 112 launches tel:112 or shows fallback toast, and incident note is sent as description', (tester) async {
    tester.view.physicalSize = const Size(1280, 720);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    final launchedUrls = <String>[];
    var canLaunch = false;
    const channel = MethodChannel('plugins.flutter.io/url_launcher');
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(channel, (call) async {
      if (call.method == 'launch' || call.method == 'launchUrl') {
        final url = (call.arguments as Map?)?['url']?.toString() ?? '';
        launchedUrls.add(url);
        return canLaunch;
      }
      if (call.method == 'canLaunch') return canLaunch;
      return false;
    });
    addTearDown(() {
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(channel, null);
    });

    final store = DriverStore(api: buildApi());
    expect(await store.login('SAOMAI', 'TX8821', '123456'), isNull);

    await tester.pumpWidget(DriverScope(
      store: store,
      child: const MaterialApp(home: DriverIncidentScreen()),
    ));
    await tester.pump();

    // 1. Failing dialer launch shows the required fallback toast.
    canLaunch = false;
    await tester.tap(find.text('Gọi 112'));
    await tester.pump();
    expect(launchedUrls, contains('tel:112'));
    expect(find.text('Không mở được trình gọi điện, hãy gọi 112 trực tiếp'), findsOneWidget);

    // 2. Entering a note sends it as description while keeping incident_type.
    await tester.tap(find.text('Tai nạn'));
    await tester.pump();
    await tester.enterText(find.byType(TextField), 'Va chạm nhẹ tại nút giao Pháp Vân');
    await tester.tap(find.widgetWithText(BigButton, 'Gửi cho điều hành'));
    await tester.pumpAndSettle();

    final incReq = sent.lastWhere((r) => r.url.path.endsWith('/incidents'));
    final body = jsonDecode(incReq.body) as Map<String, dynamic>;
    expect(body['incident_type'], 'ACCIDENT');
    expect(body['description'], 'Va chạm nhẹ tại nút giao Pháp Vân');

    // 3. When note is empty, reportIncident sends the type label as description.
    await store.reportIncident('Kẹt xe', 15);
    final emptyNoteReq = sent.lastWhere((r) => r.url.path.endsWith('/incidents'));
    final emptyBody = jsonDecode(emptyNoteReq.body) as Map<String, dynamic>;
    expect(emptyBody['incident_type'], 'TRAFFIC_JAM');
    expect(emptyBody['description'], 'Kẹt xe');

    store.dispose();
  });
}
