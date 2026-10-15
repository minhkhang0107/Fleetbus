import 'dart:convert';

import 'package:app/src/presentation/driver_cockpit_dashboard.dart';
import 'package:app/src/presentation/driver_end_trip_screen.dart';
import 'package:app/src/presentation/driver_home_run_screen.dart';
import 'package:app/src/presentation/driver_incident_dialog.dart';
import 'package:app/src/presentation/driver_login_screen.dart';
import 'package:app/src/presentation/driver_manifest_screen.dart';
import 'package:app/src/presentation/driver_permissions.dart';
import 'package:app/src/presentation/driver_qr_scanner_screen.dart';
import 'package:app/src/presentation/driver_readiness_screen.dart';
import 'package:app/src/presentation/driver_route_map.dart';
import 'package:app/src/presentation/driver_store.dart';
import 'package:app/src/presentation/driver_widgets.dart';
import 'package:app/src/presentation/main_shell_screen.dart';
import 'package:app/src/service/driver_api_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Rules of the driver app state against a fake FleetBus server that keeps the trip like the real one.
void main() {
  driverMapTiles = false;
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    driverPermissions = FakePermissions(LocationAccess.always);
  });
  late Map<String, dynamic> trip;
  late List<http.Request> sent;

  http.Response ok(Object? data) => http.Response(jsonEncode({'status': 'success', 'data': data}), 200, headers: {'content-type': 'application/json; charset=utf-8'});
  http.Response fail(int status, String code, String message) =>
      http.Response(jsonEncode({'status': 'error', 'code': code, 'message': message}), status, headers: {'content-type': 'application/json; charset=utf-8'});

  DriverStore storeWithServer() {
    sent = [];
    trip = {
      'trip_id': 'trp_hn_th_01',
      'route_name': 'Hà Nội — Thanh Hóa (Cao tốc)',
      'planned_departure_time': '2026-08-28T07:00:00+07:00',
      'status': 'READY',
      'vehicle_plate': '29B-882.19',
      'base_fare_vnd': 220000,
      'current_stop_index': 0,
      'total_cod_collected_vnd': 0,
      'total_hail_collected_vnd': 0,
      'debts': <Map<String, dynamic>>[],
      'readiness_checklist': {for (final k in DriverStore.checkKeys) k: true},
      'stops': [
        {'stop_id': 'stp_hn_gb', 'name': 'Bến xe Giáp Bát', 'order': 1, 'status': 'PENDING'},
        {'stop_id': 'stp_nb', 'name': 'Bến xe Ninh Bình', 'order': 2, 'status': 'PENDING'},
        {'stop_id': 'stp_th_pb', 'name': 'Bến xe Phía Bắc Thanh Hóa', 'order': 3, 'status': 'PENDING'},
      ],
      'manifest': [
        {'ticket_id': 't_a01', 'seat_code': 'A01', 'passenger_name': 'Trần Văn Hùng', 'phone_masked': '098***112', 'pickup_stop_id': 'stp_hn_gb', 'dropoff_stop_id': 'stp_th_pb', 'boarding_status': 'ISSUED', 'payment_method': 'VIETQR', 'cod_amount_vnd': 0},
        {'ticket_id': 't_a02', 'seat_code': 'A02', 'passenger_name': 'Nguyễn Văn Nam', 'phone_masked': '098***321', 'pickup_stop_id': 'stp_hn_gb', 'dropoff_stop_id': 'stp_th_pb', 'boarding_status': 'ISSUED', 'payment_method': 'COD', 'cod_amount_vnd': 220000},
      ],
    };
    Map<String, dynamic> pax(String id) => (trip['manifest'] as List).cast<Map<String, dynamic>>().firstWhere((m) => m['ticket_id'] == id);
    final client = MockClient((req) async {
      sent.add(req);
      final path = req.url.path;
      final body = req.body.isEmpty ? <String, dynamic>{} : jsonDecode(req.body) as Map<String, dynamic>;
      if (path.endsWith('/auth/driver/login')) {
        final op = req.headers['x-operator-code'] ?? 'SAOMAI';
        if (op == 'XUYENVIET') {
          if (body['pin'] != '246810' || body['staffIdOrPhone'] != 'TX7701') return fail(401, 'INVALID_CREDENTIALS', 'Mã nhân viên hoặc mã PIN không chính xác');
          return ok({'token': 'tok', 'driver': {'full_name': 'Lê Văn Bảy', 'staff_id': 'TX7701'}, 'operator': {'code': 'XUYENVIET', 'name': 'Xuyên Việt Lines', 'hotline': '1900 1234'}});
        } else if (op == 'SAOMAI') {
          if (body['pin'] != '123456') return fail(401, 'INVALID_CREDENTIALS', 'Mã nhân viên hoặc mã PIN không chính xác');
          return ok({'token': 'tok', 'driver': {'full_name': 'Trần Văn Bình', 'staff_id': 'TX8821'}, 'operator': {'code': 'SAOMAI', 'name': 'Sao Mai Bus', 'hotline': '1900 6868'}});
        }
        return fail(404, 'OPERATOR_NOT_FOUND', 'Mã nhà xe không đúng');
      }
      if (path.endsWith('/trips/today')) return ok({'trips': [trip]});
      if (path.endsWith('/inaccessible')) {
        final ticket = pax(path.split('/')[path.split('/').length - 2]);
        ticket['home_pickup'] = {...ticket['home_pickup'] as Map, 'inaccessible_at': '2026-08-28T00:10:00Z', 'meeting_point': body['meeting_point']};
        return ok(ticket);
      }
      if (path.endsWith('/readiness')) return ok({'status': 'READY'});
      if (path.endsWith('/home-order')) {
        final ids = (body['ticket_ids'] as List).cast<String>();
        trip['home_run'] = {
          'wait_minutes': 5,
          'stops': [for (var i = 0; i < ids.length; i++) {'ticket_id': ids[i], 'position': i + 1, 'appointment_at': '2026-08-27T22:${(45 + i * 10).toString().padLeft(2, '0')}:00Z', 'waiting': true}],
        };
        return ok(trip['home_run']);
      }
      if (path.endsWith('/home-arrived') || path.endsWith('/home-missed')) {
        final id = path.split('/')[path.split('/').length - 2];
        final stop = ((trip['home_run'] as Map)['stops'] as List).cast<Map<String, dynamic>>().firstWhere((x) => x['ticket_id'] == id);
        if (path.endsWith('/home-arrived')) {
          stop['arrived_at'] = DateTime.now().toUtc().toIso8601String();
          stop['missable_at'] = DateTime.now().toUtc().subtract(const Duration(seconds: 1)).toIso8601String();
        } else {
          stop['missed_at'] = DateTime.now().toUtc().toIso8601String();
          pax(id)['home_pickup'] = {...pax(id)['home_pickup'] as Map, 'missed_at': stop['missed_at']};
        }
        return ok(trip['home_run']);
      }
      if (path.endsWith('/contact')) return ok({'phone': '0901000003'});
      if (path.endsWith('/home-run')) {
        trip['home_run_started_at'] = '2026-08-27T22:00:00Z';
        return ok(trip);
      }
      if (path.endsWith('/start')) {
        trip['status'] = 'IN_TRANSIT';
        return ok(trip);
      }
      if (path.contains('/stops/') && path.endsWith('/arrive')) {
        final id = path.split('/')[path.split('/').length - 2];
        final stops = (trip['stops'] as List).cast<Map<String, dynamic>>();
        stops.firstWhere((s) => s['stop_id'] == id)['status'] = 'ARRIVED';
        trip['current_stop_index'] = stops.indexWhere((s) => s['stop_id'] == id);
        return ok({});
      }
      if (path.endsWith('/boarding/manual')) {
        final p = pax(body['ticket_id']);
        if (p['payment_method'] == 'COD' && p['cod_collected'] != true) return fail(409, 'COD_PAYMENT_REQUIRED', 'Vé COD chưa thu tiền');
        p['boarding_status'] = 'BOARDED';
        p['boarded_at'] = '2026-08-28T00:05:00Z';
        return ok(p);
      }
      if (path.endsWith('/boarding')) {
        final parts = '${body['qrPayload']}'.split(':');
        if (parts[2] != '482107') return fail(422, 'INVALID_PIN', 'Mã PIN vé không chính xác');
        pax(parts[1])['boarding_status'] = 'BOARDED';
        return ok({});
      }
      if (path.endsWith('/payments/cod-collect')) {
        final p = pax(body['ticket_id']);
        final change = (body['amount_collected_vnd'] as int) - 220000;
        p['cod_collected'] = true;
        p['boarding_status'] = 'BOARDED';
        trip['total_cod_collected_vnd'] = 220000;
        if (change > 0 && body['change_settlement_method'] == 'DEBT') {
          (trip['debts'] as List).add({'receipt_code': 'DR-t_a02-${change ~/ 1000}K', 'amount_vnd': change});
        }
        return ok(p);
      }
      if (path.endsWith('/end')) {
        final last = (trip['stops'] as List).last as Map<String, dynamic>;
        if (last['status'] != 'ARRIVED' && '${body['early_end_reason'] ?? ''}'.length < 5) {
          return fail(409, 'TRIP_NOT_AT_FINAL_STOP', 'Xe chưa tới bến cuối. Kết thúc giữa đường cần ghi lý do');
        }
        trip['status'] = 'COMPLETED';
        return ok({'total_cash_to_handover_vnd': trip['total_cod_collected_vnd'] + trip['total_hail_collected_vnd']});
      }
      if (path.contains('/driver/trips/')) return ok(trip);
      return ok({});
    });
    return DriverStore(api: DriverApiClientService(baseUrl: 'http://test', client: client));
  }

  Future<DriverStore> started() async {
    final store = storeWithServer();
    expect(await store.login('SAOMAI', 'TX8821', '123456'), isNull);
    expect(await store.startTrip(), isNull);
    return store;
  }

  test('login loads the shift: route, departure, stops and manifest come from the server', () async {
    final store = storeWithServer();
    expect(await store.login('SAOMAI', 'TX8821', '000000'), 'Mã nhân viên hoặc mã PIN không chính xác');
    expect(await store.login('SAOMAI', 'TX8821', '123456'), isNull);
    expect((store.driverName, store.tripId, store.route, store.depTime, store.plate), ('Trần Văn Bình', 'trp_hn_th_01', 'Hà Nội → Thanh Hóa', '07:00', '29B-882.19'));
    expect(store.stops.map((s) => s.time), ['07:00', '07:45', '08:30']);
    expect(store.manifest, hasLength(2));
    expect(store.readyToStart, isTrue, reason: 'the server already holds a complete checklist');
    store.dispose();
  });

  test('login honours X-Operator-Code and updates operator fields', () async {
    final store = storeWithServer();
    expect(await store.login('', 'TX7701', '246810'), 'Nhập mã nhà xe.');
    expect(await store.login('UNKNOWN', 'TX7701', '246810'), 'Mã nhà xe không đúng');
    expect(await store.login('SAOMAI', 'TX7701', '246810'), 'Mã nhân viên hoặc mã PIN không chính xác');
    
    expect(await store.login('xuyenviet', 'TX7701', '246810'), isNull);
    
    final header = sent.lastWhere((r) => r.url.path.endsWith('/login')).headers['x-operator-code'];
    expect(header, 'XUYENVIET', reason: 'Sends upper-case operator code in header');
    
    expect(store.operatorName, 'Xuyên Việt Lines');
    expect(store.operatorHotline, '1900 1234');
    expect(await DriverStore.savedOperatorCode(), 'XUYENVIET');
    store.dispose();
  });

  test('start sends the checklist, starts the trip and marks the first stop reached', () async {
    final store = await started();
    expect(store.trip, TripState.inTransit);
    expect(store.atStop, isTrue);
    final paths = sent.map((r) => r.url.path.split('/').last).toList();
    expect(paths, containsAllInOrder(['readiness', 'start', 'arrive']));
    store.dispose();
  });

  test('an unpaid COD ticket boards only through the collection (BR-COD-006)', () async {
    final store = await started();
    final cod = store.manifest.firstWhere((p) => p.codDue);
    expect(await store.board(cod), 'Vé COD chưa thu tiền');
    expect(await store.collectCod(cod, given: 500000, method: 'DEBT'), isNull);
    final after = store.manifest.firstWhere((p) => p.seat == 'A02');
    expect(after.status, PaxStatus.boarded);
    expect(store.codCash, 220000);
    expect(store.debts.single, (code: 'DR-t_a02-280K', amount: 280000));
    store.dispose();
  });

  test('a demo trip on another day keeps the simulated clock; a boarding shows on that clock, not the server time', () async {
    final store = await started();
    expect(store.realClock, isFalse);
    final p = store.manifest.firstWhere((p) => p.seat == 'A01');
    final before = store.clock;
    expect(await store.board(p), isNull);
    final boarded = store.manifest.firstWhere((p) => p.seat == 'A01');
    expect(store.boardedTime(boarded), before, reason: 'the server says 07:05 real time; the cab shows its own clock');
    store.dispose();
  });

  test('a trip running today uses the real time, for the clock and for each boarding', () async {
    final store = storeWithServer();
    final now = DateTime.now().toUtc();
    trip['planned_departure_time'] = now.toIso8601String();
    expect(await store.login('SAOMAI', 'TX8821', '123456'), isNull);
    expect(store.realClock, isTrue);
    final vn = now.add(const Duration(hours: 7));
    expect(store.clock, vn.hour * 60 + vn.minute);
    expect(await store.startTrip(), isNull);
    expect(await store.board(store.manifest.firstWhere((p) => p.seat == 'A01')), isNull);
    expect(store.boardedTime(store.manifest.firstWhere((p) => p.seat == 'A01')), 7 * 60 + 5, reason: 'boarded_at 00:05Z is 07:05 in Vietnam');
    store.dispose();
  });

  test('stop times are the planned times the server sends, as the passenger sees them', () async {
    final store = storeWithServer();
    final stops = (trip['stops'] as List).cast<Map<String, dynamic>>();
    stops[1]['planned_time'] = '2026-08-28T01:18:00.000Z';
    expect(await store.login('SAOMAI', 'TX8821', '123456'), isNull);
    expect(store.stops.map((s) => s.time), ['07:00', '08:18', '08:30'], reason: 'a stop without a planned time falls back to the even split');
    store.dispose();
  });

  test('the backup PIN is checked by the server', () async {
    final store = await started();
    final p = store.manifest.firstWhere((p) => p.seat == 'A01');
    expect((await store.boardWithPin(p, '000000')).code, 'INVALID_PIN');
    expect((await store.boardWithPin(p, '482107')).error, isNull);
    expect(store.manifest.firstWhere((p) => p.seat == 'A01').status, PaxStatus.boarded);
    store.dispose();
  });

  test('the trip ends at the last stop; earlier it needs a reason (D108)', () async {
    final store = await started();
    expect(await store.endTrip(), contains('bến cuối'));
    store.leaveStop();
    expect(store.moving, isTrue, reason: 'the cockpit locks while the bus moves (BR-COCKPIT-005)');
    await store.arrive();
    store.leaveStop();
    await store.arrive();
    expect(store.lastStop, isTrue);
    expect(await store.endTrip(), isNull);
    expect(store.trip, TripState.completed);
    expect(store.endedCash, 0);
    store.dispose();
  });

  testWidgets('the end of a trip asks for nothing: one tap ends it', (tester) async {
    tester.view.physicalSize = const Size(1280, 720);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);
    final store = await started();
    store.leaveStop();
    await store.arrive();
    store.leaveStop();
    await store.arrive();
    await tester.pumpWidget(DriverScope(store: store, child: const MaterialApp(home: DriverEndTripScreen())));
    expect(find.byType(TextField), findsNothing);
    await tester.tap(find.widgetWithText(BigButton, 'Kết thúc và nộp 0 đ'));
    await tester.pumpAndSettle();
    expect(store.trip, TripState.completed);
    final body = jsonDecode(sent.lastWhere((r) => r.url.path.endsWith('/end')).body) as Map<String, dynamic>;
    expect(body.keys, isNot(contains('odometer_km')));
    store.dispose();
  });

  testWidgets('login fields formatters, max lengths, and actions', (tester) async {
    final store = storeWithServer();
    await tester.pumpWidget(DriverScope(
      store: store,
      child: const MaterialApp(home: DriverLoginScreen()),
    ));
    await tester.pump();

    final textFields = tester.widgetList<TextField>(find.byType(TextField)).toList();
    expect(textFields.length, 3);

    // Operator field
    expect(textFields[0].textCapitalization, TextCapitalization.characters);
    expect(textFields[0].maxLength, 20);

    // ID field
    expect(textFields[1].maxLength, 20);
    expect(textFields[1].textInputAction, TextInputAction.next);

    // PIN field
    expect(textFields[2].maxLength, 6);
    expect(textFields[2].inputFormatters?.contains(FilteringTextInputFormatter.digitsOnly), isTrue);

    // Test operator typing uppercase and filtering
    await tester.enterText(find.byType(TextField).at(0), 'saomai123');
    await tester.pump();
    expect(find.text('SAOMAI123'), findsOneWidget);

    store.dispose();
  });

  testWidgets('free text fields have maxLength 200 with visible counter', (tester) async {
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    tester.view.physicalSize = const Size(1280, 720);
    tester.view.devicePixelRatio = 1.0;

    final store = storeWithServer();

    await tester.pumpWidget(DriverScope(store: store, child: const MaterialApp(home: DriverIncidentScreen())));
    await tester.pump();
    final incidentTf = tester.widget<TextField>(find.byType(TextField));
    expect(incidentTf.maxLength, 200);

    store.dispose();
  });

  test('the stop screen lists who gets off there, once they are on board', () async {
    final store = await started();
    final a01 = store.manifest.firstWhere((p) => p.seat == 'A01');
    expect(store.dropOffPassengers, isEmpty);
    expect(await store.board(a01), isNull);
    store.leaveStop();
    await store.arrive();
    expect(store.dropOffPassengers, isEmpty, reason: 'A01 gets off at Thanh Hóa, not Ninh Bình');
    store.leaveStop();
    await store.arrive();
    expect(store.dropOffPassengers.map((p) => p.seat), ['A01'], reason: 'A02 never boarded, so only A01 gets off');
    store.dispose();
  });

  test('a lost network lists the action for later instead of failing silently', () async {
    final store = DriverStore(api: DriverApiClientService(baseUrl: 'http://test', client: MockClient((_) async => throw http.ClientException('down'))));
    expect(await store.login('SAOMAI', 'TX8821', '123456'), contains('Không kết nối được'));
    store.tripId = 'trp_hn_th_01';
    store.stops = const [DriverStop('stp_hn_gb', 'Bến xe Giáp Bát', '07:00')];
    await store.reportIncident('Kẹt xe', 15);
    expect(store.offline, isTrue);
    expect(store.queue.single.label, 'Báo sự cố: Kẹt xe');
    expect(store.incident!.delay, 15);
    store.dispose();
  });

  // The dashboard tablet is 1280x720 landscape; phones stay the reference design.
  for (final (name, size) in const [('tablet 1280x720', Size(1280, 720)), ('phone 390x844', Size(390, 844))]) {
    testWidgets('every driver screen lays out without overflow on a $name', (tester) async {
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
        tester.platformDispatcher.clearTextScaleFactorTestValue();
      });
      tester.view.physicalSize = size;
      tester.view.devicePixelRatio = 1.0;
      // The test font draws every glyph 1 em wide; Geist averages about 0.6 em, so scale text to match it.
      tester.platformDispatcher.textScaleFactorTestValue = 0.6;
      final store = storeWithServer();
      await tester.runAsync(() async {
        expect(await store.login('SAOMAI', 'TX8821', '123456'), isNull);
      });
      const screens = <Widget>[DriverLoginScreen(), MainShellScreen(), DriverReadinessScreen(), DriverHomeRunScreen(), DriverCockpitDashboard(), DriverManifestScreen(), DriverQrScannerScreen(), DriverEndTripScreen(), DriverIncidentScreen()];
      for (final screen in screens) {
        await tester.pumpWidget(DriverScope(store: store, child: MaterialApp(home: screen)));
        await tester.pump();
        expect(tester.takeException(), isNull, reason: '${screen.runtimeType} on $name');
      }
      if (size.width >= 840) {
        // Wide: the login form keeps a readable width instead of spanning the screen.
        await tester.pumpWidget(DriverScope(store: store, child: const MaterialApp(home: DriverLoginScreen())));
        await tester.pump();
        expect(tester.getSize(find.byType(TextField).first).width, lessThanOrEqualTo(440));
        expect(dWide(tester.element(find.byType(DriverLoginScreen))), isTrue);
      }
      await tester.pumpWidget(const SizedBox());
      store.dispose();
    });
  }

  testWidgets('the driver map lists the stops still ahead with passengers to pick up and drop off', (tester) async {
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
      tester.platformDispatcher.clearTextScaleFactorTestValue();
    });
    tester.view.physicalSize = const Size(1280, 720);
    tester.view.devicePixelRatio = 1.0;
    tester.platformDispatcher.textScaleFactorTestValue = 0.6;
    final store = storeWithServer();
    await tester.runAsync(() async {
      expect(await store.login('SAOMAI', 'TX8821', '123456'), isNull);
    });
    await tester.pumpWidget(DriverScope(store: store, child: MaterialApp(home: Scaffold(body: SingleChildScrollView(child: DriverRouteMap(store: store))))));
    await tester.pump();
    expect(find.text('Lộ trình còn lại'), findsOneWidget);
    await tester.tap(find.text('Xem danh sách'));
    await tester.pump();
    expect(find.text('Bến xe Giáp Bát'), findsOneWidget);
    expect(find.text('↑2 ↓0'), findsOneWidget, reason: 'two passengers wait at the first stop');
    expect(find.text('Xem bản đồ'), findsOneWidget);
    await tester.tap(find.text('Xem bản đồ'));
    await tester.pump();
    // Reaching the next stop rebuilds the map on the new frame, with a fresh controller.
    store.stopIndex = 1;
    await tester.pumpWidget(DriverScope(store: store, child: MaterialApp(home: Scaffold(body: SingleChildScrollView(child: DriverRouteMap(store: store))))));
    await tester.pump();
    expect(tester.takeException(), isNull);
    expect(find.byType(FlutterMap), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
    store.dispose();
  });

  test('a home pickup passenger carries the address, note, window and pin', () {
    final p = Passenger.fromJson({
      'ticket_id': 'tkt_1',
      'seat_code': 'A05',
      'passenger_name': 'Nguyễn An',
      'phone_masked': '098****321',
      'payment_method': 'VIETQR',
      'pickup_stop_id': 'stp_hn_gb',
      'dropoff_stop_id': 'stp_th_pb',
      'boarding_status': 'ISSUED',
      'home_pickup': {'address': '12 ngõ 34 Giải Phóng', 'lat': 20.99, 'lng': 105.84, 'note': 'cổng xanh', 'window_from': '2026-08-27T22:00:00Z', 'window_to': '2026-08-27T22:40:00Z'},
    });
    expect((p.homePickup, p.homeNote, p.pickupWindow, p.homeLat, p.homeLng, p.homeDropoff), ('12 ngõ 34 Giải Phóng', 'cổng xanh', '05:00–05:40', 20.99, 105.84, null));
  });

  test('a home pickup the bus cannot reach is reported with a reason and a meeting point, then shown as reported', () async {
    final store = storeWithServer();
    (trip['manifest'] as List).add({'ticket_id': 't_b03', 'seat_code': 'B03', 'passenger_name': 'Ngô Thị Ngõ', 'phone_masked': '090***900', 'pickup_stop_id': 'stp_hn_gb', 'dropoff_stop_id': 'stp_th_pb', 'boarding_status': 'ISSUED', 'payment_method': 'VIETQR', 'cod_amount_vnd': 0, 'home_pickup': {'address': '45 ngõ 12 Kim Đồng', 'lat': 20.98, 'lng': 105.84}});
    expect(await store.login('SAOMAI', 'TX8821', '123456'), isNull);
    final p = store.manifest.firstWhere((m) => m.seat == 'B03');
    expect((p.homePickup, p.inaccessible), ('45 ngõ 12 Kim Đồng', false));
    expect(await store.reportInaccessible(p, 'Ngõ quá hẹp, xe không vào được', 'đầu ngõ 12'), isNull);
    final req = sent.lastWhere((r) => r.url.path.endsWith('/inaccessible'));
    expect(req.url.path, '/api/v1/driver/trips/trp_hn_th_01/tickets/t_b03/inaccessible');
    expect(jsonDecode(req.body), {'reason': 'Ngõ quá hẹp, xe không vào được', 'meeting_point': 'đầu ngõ 12'});
    expect(req.headers['idempotency-key'], isNotNull);
    final after = store.manifest.firstWhere((m) => m.seat == 'B03');
    expect((after.inaccessible, after.meetingPoint), (true, 'đầu ngõ 12'));
    store.dispose();
  });
  test('setting off for the home pickups sends the bus position before departure, heading to the next address (D143)', () async {
    final store = storeWithServer();
    (trip['manifest'] as List).add({'ticket_id': 't_b04', 'seat_code': 'B04', 'passenger_name': 'Đỗ Văn Nhà', 'phone_masked': '090***011', 'pickup_stop_id': 'stp_hn_gb', 'dropoff_stop_id': 'stp_th_pb', 'boarding_status': 'ISSUED', 'payment_method': 'VIETQR', 'cod_amount_vnd': 0, 'home_pickup': {'address': '12 Hàng Bài', 'lat': 21.0245, 'lng': 105.8523, 'window_from': '2026-08-27T22:45:00Z', 'window_to': '2026-08-27T23:30:00Z'}});
    expect(await store.login('SAOMAI', 'TX8821', '123456'), isNull);
    expect((store.homePickupsWaiting.single.seat, store.homeWindow), ('B04', '05:45–06:30'));
    await store.sendTelemetry();
    expect(sent.where((r) => r.url.path.endsWith('/telemetry')), isEmpty, reason: 'no position before the run starts');

    final from = (store.lat, store.lng);
    expect(await store.startHomeRun(), isNull);
    expect(store.homeRunStarted, isTrue);
    expect(sent.any((r) => r.url.path == '/api/v1/driver/trips/trp_hn_th_01/home-run' && r.headers['idempotency-key'] != null), isTrue);
    await store.sendTelemetry();
    final pings = sent.where((r) => r.url.path.endsWith('/telemetry')).map((r) => jsonDecode(r.body) as Map<String, dynamic>).toList();
    expect(pings, isNotEmpty);
    double gap(double lat, double lng) => (lat - 21.0245).abs() + (lng - 105.8523).abs();
    expect(gap(pings.last['lat'], pings.last['lng']), lessThan(gap(from.$1, from.$2)), reason: 'the bus moves toward the address');
    expect(pings.last['speed_kmh'], greaterThan(0));
    store.dispose();
  });

  test('the home run follows the server order; the driver reorders, waits at a door, goes on, and calls (D144)', () async {
    final store = storeWithServer();
    Map<String, dynamic> home(String id, String seat, double lat) => {'ticket_id': id, 'seat_code': seat, 'passenger_name': 'Khách $seat', 'phone_masked': '090***00$seat', 'pickup_stop_id': 'stp_hn_gb', 'dropoff_stop_id': 'stp_th_pb', 'boarding_status': 'ISSUED', 'payment_method': 'VIETQR', 'cod_amount_vnd': 0, 'home_pickup': {'address': 'Nhà $seat', 'lat': lat, 'lng': 105.85, 'window_from': '2026-08-27T22:45:00Z', 'window_to': '2026-08-27T23:30:00Z'}};
    trip['manifest'] = <Map<String, dynamic>>[...(trip['manifest'] as List).cast<Map<String, dynamic>>(), home('t_h1', 'B01', 21.02), home('t_h2', 'B02', 21.03)];
    trip['home_run'] = {
      'wait_minutes': 5,
      'stops': [
        {'ticket_id': 't_h2', 'position': 1, 'appointment_at': '2026-08-27T22:45:00Z', 'waiting': true, 'ready': {'status': 'NEED_TIME', 'minutes': 5}},
        {'ticket_id': 't_h1', 'position': 2, 'appointment_at': '2026-08-27T22:55:00Z', 'waiting': true},
      ],
    };
    expect(await store.login('SAOMAI', 'TX8821', '123456'), isNull);
    expect(store.homePickupsWaiting.map((p) => p.seat), ['B02', 'B01'], reason: 'the server order, not the manifest order');
    final first = store.homeStopOf(store.homePickupsWaiting.first)!;
    expect((first.appointment, first.readyLabel), ('05:45', 'Cần 5 phút'));

    expect(await store.moveHome(store.homePickupsWaiting.last, -1), isNull);
    final order = sent.lastWhere((r) => r.url.path.endsWith('/home-order'));
    expect(jsonDecode(order.body), {'ticket_ids': ['t_h1', 't_h2']});
    expect(order.headers['idempotency-key'], isNotNull);
    expect(store.homePickupsWaiting.map((p) => p.seat), ['B01', 'B02']);

    final b01 = store.homePickupsWaiting.first;
    expect(await store.homeArrived(b01), isNull);
    expect(store.homeStopOf(b01)!.arrivedAt, isNotNull);
    expect(await store.homeMissed(b01), isNull);
    expect(store.homePickupsWaiting.map((p) => p.seat), ['B02'], reason: 'a missed passenger boards at the stop');

    final call = await store.contactOf(store.homePickupsWaiting.first);
    expect(call, (phone: '0901000003', error: null));
    store.dispose();
  });

  testWidgets('location is asked with a reason first, then "all the time"; a refusal keeps the bus from leaving (D145)', (tester) async {
    final fake = FakePermissions(LocationAccess.denied, afterRequest: LocationAccess.whileInUse);
    driverPermissions = fake;
    bool? allowed;
    await tester.pumpWidget(MaterialApp(home: Builder(builder: (context) => Scaffold(body: TextButton(onPressed: () async => allowed = await ensureDriverLocation(context), child: const Text('go'))))));
    await tester.tap(find.text('go'));
    await tester.pumpAndSettle();
    expect(find.text('Cho phép app biết vị trí xe'), findsOneWidget, reason: 'the reason comes before the system dialog');
    expect(fake.asked, isEmpty);
    await tester.tap(find.text('Tiếp tục'));
    await tester.pumpAndSettle();
    expect(fake.asked, ['location']);
    expect(find.text('Chọn "Luôn cho phép"'), findsOneWidget);
    await tester.tap(find.text('Tiếp tục'));
    await tester.pumpAndSettle();
    expect(fake.asked, ['location', 'background']);
    expect(allowed, isTrue, reason: 'while in use is enough to send the position');

    final refused = FakePermissions(LocationAccess.deniedForever);
    driverPermissions = refused;
    allowed = null;
    await tester.tap(find.text('go'));
    await tester.pumpAndSettle();
    expect(find.text('Cần quyền vị trí'), findsOneWidget);
    await tester.tap(find.text('Mở cài đặt'));
    await tester.pumpAndSettle();
    expect(refused.asked, ['settings']);
    expect(allowed, isFalse);
  });
}

class FakePermissions implements DevicePermissions {
  FakePermissions(this.access, {this.afterRequest, this.cameraOk = false});
  LocationAccess access;
  final LocationAccess? afterRequest;
  final bool cameraOk;
  final List<String> asked = [];

  @override
  Future<LocationAccess> location() async => access;
  @override
  Future<LocationAccess> requestLocation() async {
    asked.add('location');
    return access = afterRequest ?? access;
  }

  @override
  Future<LocationAccess> requestBackgroundLocation() async {
    asked.add('background');
    return access;
  }

  @override
  Future<bool> camera({bool request = false}) async {
    if (request) asked.add('camera');
    return cameraOk;
  }

  @override
  Future<void> openSettings() async => asked.add('settings');
  @override
  Future<void> openLocationSettings() async => asked.add('location-settings');
}
