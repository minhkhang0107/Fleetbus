import 'dart:convert';

import 'package:app/src/presentation/driver_permissions.dart';
import 'package:app/src/presentation/driver_qr_scanner_screen.dart';
import 'package:app/src/presentation/driver_store.dart';
import 'package:app/src/presentation/driver_widgets.dart';
import 'package:app/src/service/driver_api_service.dart';
import 'package:crypto/crypto.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _FakePermissions implements DevicePermissions {
  _FakePermissions(this.access, {this.cameraOk = true});
  LocationAccess access;
  final bool cameraOk;

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
  Future<void> openSettings() async {}
  @override
  Future<void> openLocationSettings() async {}
}

void main() {
  late bool networkDown;
  late Map<String, dynamic> trip;

  http.Response ok(Object? data) => http.Response(
        jsonEncode({'status': 'success', 'data': data}),
        200,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );

  String sha256Hex(String input) => sha256.convert(utf8.encode(input)).toString();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
    networkDown = false;
    trip = {
      'trip_id': 'trp_test_01',
      'route_name': 'Hà Nội — Thanh Hóa',
      'planned_departure_time': '2026-08-28T07:00:00+07:00',
      'status': 'IN_TRANSIT',
      'vehicle_plate': '29B-882.19',
      'base_fare_vnd': 200000,
      'current_stop_index': 0,
      'total_cod_collected_vnd': 0,
      'total_hail_collected_vnd': 0,
      'debts': <Map<String, dynamic>>[],
      'stops': [
        {'stop_id': 'stp_1', 'name': 'Bến Giáp Bát', 'order': 1, 'status': 'ARRIVED'},
        {'stop_id': 'stp_2', 'name': 'Bến Thanh Hóa', 'order': 2, 'status': 'PENDING'},
      ],
      'manifest': [
        {
          'ticket_id': 'tkt_01',
          'seat_code': 'A01',
          'passenger_name': 'Nguyễn Văn A',
          'phone_masked': '090***001',
          'pickup_stop_id': 'stp_1',
          'dropoff_stop_id': 'stp_2',
          'boarding_status': 'ISSUED',
          'payment_method': 'VIETQR',
          'cod_amount_vnd': 0,
          'pnr': 'PNR_01',
          'boarding_check': {
            'qr_version': 2,
            'qr_digest': 'hmac16_valid_01',
            'pin_digest': sha256Hex('tkt_01|123456'),
            'group_digest': 'grp_hmac_01',
          },
        },
        {
          'ticket_id': 'tkt_02',
          'seat_code': 'A02',
          'passenger_name': 'Nguyễn Văn B',
          'phone_masked': '090***002',
          'pickup_stop_id': 'stp_1',
          'dropoff_stop_id': 'stp_2',
          'boarding_status': 'ISSUED',
          'payment_method': 'VIETQR',
          'cod_amount_vnd': 0,
          'pnr': 'PNR_01',
          'boarding_check': {
            'qr_version': 1,
            'qr_digest': 'hmac16_valid_02',
            'pin_digest': sha256Hex('tkt_02|654321'),
            'group_digest': 'grp_hmac_01',
          },
        },
        {
          'ticket_id': 'tkt_no_bc',
          'seat_code': 'A03',
          'passenger_name': 'Trần Văn C',
          'phone_masked': '090***003',
          'pickup_stop_id': 'stp_1',
          'dropoff_stop_id': 'stp_2',
          'boarding_status': 'ISSUED',
          'payment_method': 'VIETQR',
          'cod_amount_vnd': 0,
          'pnr': 'PNR_02',
        },
      ],
    };
  });

  DriverApiClientService buildApi() {
    final client = MockClient((req) async {
      if (networkDown) {
        throw http.ClientException('network down');
      }
      final path = req.url.path;
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
      if (path.contains('/driver/trips/')) {
        return ok(trip);
      }
      return ok({});
    });
    return DriverApiClientService(baseUrl: 'http://test', client: client);
  }

  test('valid single QR boards offline', () async {
    final store = DriverStore(api: buildApi());
    expect(await store.login('SAOMAI', 'TX8821', '123456'), isNull);

    networkDown = true;
    final r = await store.boardWithQr('BUSGO|PNR_01|tkt_01|v2|hmac16_valid_01');

    expect(r.code, 'QUEUED_OFFLINE');
    expect(r.error, isNull);
    expect(r.data?['seat_code'], 'A01');
    expect(store.manifest.firstWhere((p) => p.ticketId == 'tkt_01').status, PaxStatus.boarded);
    expect(store.queue, hasLength(1));
    store.dispose();
  });

  test('wrong hmac rejected', () async {
    final store = DriverStore(api: buildApi());
    expect(await store.login('SAOMAI', 'TX8821', '123456'), isNull);

    networkDown = true;
    final r = await store.boardWithQr('BUSGO|PNR_01|tkt_01|v2|hmac16_WRONG');

    expect(r.code, 'INVALID_SIGNATURE');
    expect(r.error, 'Mã vé bị sửa hoặc giả. Không cho lên xe.');
    expect(store.manifest.firstWhere((p) => p.ticketId == 'tkt_01').status, PaxStatus.waiting);
    expect(store.queue, isEmpty);
    store.dispose();
  });

  test('old version rejected', () async {
    final store = DriverStore(api: buildApi());
    expect(await store.login('SAOMAI', 'TX8821', '123456'), isNull);

    networkDown = true;
    final r = await store.boardWithQr('BUSGO|PNR_01|tkt_01|v1|hmac16_valid_01');

    expect(r.code, 'QR_REVOKED');
    expect(r.error, 'Khách đã đổi mã QR. Đề nghị khách mở lại vé trong app.');
    expect(store.manifest.firstWhere((p) => p.ticketId == 'tkt_01').status, PaxStatus.waiting);
    expect(store.queue, isEmpty);
    store.dispose();
  });

  test('ticket not in manifest (cancelled) rejected without boarding other seats of the PNR', () async {
    final store = DriverStore(api: buildApi());
    expect(await store.login('SAOMAI', 'TX8821', '123456'), isNull);

    networkDown = true;
    // tkt_cancelled shares PNR_01 with tkt_01 and tkt_02, but is not in manifest
    final r = await store.boardWithQr('BUSGO|PNR_01|tkt_cancelled|v1|hmac_cancelled');

    expect(r.code, 'TICKET_NOT_FOUND');
    expect(r.error, 'Vé không có trong danh sách chuyến này (có thể đã hủy hoặc của chuyến khác). Gọi nhà xe.');
    expect(store.manifest.firstWhere((p) => p.ticketId == 'tkt_01').status, PaxStatus.waiting);
    expect(store.manifest.firstWhere((p) => p.ticketId == 'tkt_02').status, PaxStatus.waiting);
    expect(store.queue, isEmpty);
    store.dispose();
  });

  test('group QR with right digest boards members', () async {
    final store = DriverStore(api: buildApi());
    expect(await store.login('SAOMAI', 'TX8821', '123456'), isNull);

    networkDown = true;
    final r = await store.boardWithQr('BUSGO_GRP|PNR_01|ord_01|2|tkt_01:v2,tkt_02:v1|grp_hmac_01');

    expect(r.code, 'QUEUED_OFFLINE');
    expect(r.error, isNull);
    expect(store.manifest.firstWhere((p) => p.ticketId == 'tkt_01').status, PaxStatus.boarded);
    expect(store.manifest.firstWhere((p) => p.ticketId == 'tkt_02').status, PaxStatus.boarded);
    expect(store.queue, hasLength(1));
    store.dispose();
  });

  test('wrong group digest rejected', () async {
    final store = DriverStore(api: buildApi());
    expect(await store.login('SAOMAI', 'TX8821', '123456'), isNull);

    networkDown = true;
    final r = await store.boardWithQr('BUSGO_GRP|PNR_01|ord_01|2|tkt_01:v2,tkt_02:v1|grp_hmac_WRONG');

    expect(r.code, 'INVALID_SIGNATURE');
    expect(r.error, 'Mã nhóm cũ hoặc không hợp lệ. Đề nghị khách mở lại vé trong app, hoặc quét từng vé.');
    expect(store.manifest.firstWhere((p) => p.ticketId == 'tkt_01').status, PaxStatus.waiting);
    expect(store.manifest.firstWhere((p) => p.ticketId == 'tkt_02').status, PaxStatus.waiting);
    expect(store.queue, isEmpty);
    store.dispose();
  });

  test('group QR boards only members listed in the QR that are in the manifest', () async {
    final store = DriverStore(api: buildApi());
    expect(await store.login('SAOMAI', 'TX8821', '123456'), isNull);

    networkDown = true;
    // Group QR lists tkt_01 and tkt_cancelled (not in manifest); tkt_02 is in manifest but not in QR
    final r = await store.boardWithQr('BUSGO_GRP|PNR_01|ord_01|2|tkt_01:v2,tkt_cancelled:v1|grp_hmac_01');

    expect(r.code, 'QUEUED_OFFLINE');
    expect(r.error, isNull);
    expect(store.manifest.firstWhere((p) => p.ticketId == 'tkt_01').status, PaxStatus.boarded);
    expect(store.manifest.firstWhere((p) => p.ticketId == 'tkt_02').status, PaxStatus.waiting);
    expect(store.queue, hasLength(1));
    store.dispose();
  });

  test('item without boarding_check rejected', () async {
    final store = DriverStore(api: buildApi());
    expect(await store.login('SAOMAI', 'TX8821', '123456'), isNull);

    networkDown = true;
    final r = await store.boardWithQr('BUSGO|PNR_02|tkt_no_bc|v1|some_sig');

    expect(r.code, 'OFFLINE_UNVERIFIED');
    expect(r.error, 'Mất mạng, máy chưa có dữ liệu để kiểm vé này. Nhập mã PIN hoặc chờ có sóng.');
    expect(store.manifest.firstWhere((p) => p.ticketId == 'tkt_no_bc').status, PaxStatus.waiting);
    expect(store.queue, isEmpty);
    store.dispose();
  });

  test('not a BusGo string rejected', () async {
    final store = DriverStore(api: buildApi());
    expect(await store.login('SAOMAI', 'TX8821', '123456'), isNull);

    networkDown = true;
    final r = await store.boardWithQr('https://busgo.vn/ticket/123');

    expect(r.code, 'INVALID_FORMAT');
    expect(r.error, 'Không phải mã vé BusGo. Đề nghị khách mở vé trong app.');
    expect(store.queue, isEmpty);
    store.dispose();
  });

  test('offline PIN right boards passenger', () async {
    final store = DriverStore(api: buildApi());
    expect(await store.login('SAOMAI', 'TX8821', '123456'), isNull);

    networkDown = true;
    final p1 = store.manifest.firstWhere((p) => p.ticketId == 'tkt_01');
    final r = await store.boardWithPin(p1, '123456');

    expect(r.code, 'QUEUED_OFFLINE');
    expect(r.error, isNull);
    expect(store.manifest.firstWhere((p) => p.ticketId == 'tkt_01').status, PaxStatus.boarded);
    expect(store.queue, hasLength(1));
    store.dispose();
  });

  test('offline PIN wrong rejected', () async {
    final store = DriverStore(api: buildApi());
    expect(await store.login('SAOMAI', 'TX8821', '123456'), isNull);

    networkDown = true;
    final p1 = store.manifest.firstWhere((p) => p.ticketId == 'tkt_01');
    final r = await store.boardWithPin(p1, '999999');

    expect(r.code, 'INVALID_PIN');
    expect(r.error, 'Mã PIN không đúng.');
    expect(store.manifest.firstWhere((p) => p.ticketId == 'tkt_01').status, PaxStatus.waiting);
    expect(store.queue, isEmpty);
    store.dispose();
  });

  testWidgets('DriverQrScannerScreen never shows raw English code on rejects', (tester) async {
    driverPermissions = _FakePermissions(LocationAccess.always, cameraOk: true);
    tester.view.physicalSize = const Size(800, 1200);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    final store = DriverStore(api: buildApi());
    expect(await store.login('SAOMAI', 'TX8821', '123456'), isNull);
    await store.arrive();

    networkDown = true;
    await tester.pumpWidget(MaterialApp(
      home: DriverScope(store: store, child: const DriverQrScannerScreen()),
    ));
    await tester.pumpAndSettle();

    // 1. Test wrong PIN in PIN modal
    await tester.tap(find.text('Khách không có vé trên máy: nhập PIN'));
    await tester.pumpAndSettle();
    expect(find.text('Lên xe bằng mã PIN'), findsOneWidget);
    await tester.enterText(find.byType(TextField), '000000');
    await tester.tap(find.widgetWithText(BigButton, 'Kiểm tra'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Mã PIN không đúng'), findsOneWidget);
    expect(find.text('INVALID_PIN'), findsNothing);

    // Dismiss PIN dialog
    await tester.tapAt(const Offset(10, 10));
    await tester.pumpAndSettle();

    // 2. Test scanned QR reject (wrong HMAC) via MobileScanner onDetect
    final scannerWidget = tester.widget<MobileScanner>(find.byType(MobileScanner));
    scannerWidget.onDetect?.call(const BarcodeCapture(barcodes: [Barcode(rawValue: 'BUSGO|PNR_01|tkt_01|v2|wrong_hmac')]));
    await tester.pumpAndSettle();

    expect(find.text('Không cho lên xe'), findsOneWidget);
    expect(find.text('Mã vé bị sửa hoặc giả. Không cho lên xe.'), findsOneWidget);
    expect(find.text('INVALID_SIGNATURE'), findsNothing);

    // Close sheet
    await tester.tap(find.widgetWithText(BigButton, 'Quét vé tiếp'));
    await tester.pumpAndSettle();

    // 3. Test scanned QR revoked
    scannerWidget.onDetect?.call(const BarcodeCapture(barcodes: [Barcode(rawValue: 'BUSGO|PNR_01|tkt_01|v1|hmac16_valid_01')]));
    await tester.pumpAndSettle();

    expect(find.text('Không cho lên xe'), findsOneWidget);
    expect(find.text('Khách đã đổi mã QR. Đề nghị khách mở lại vé trong app.'), findsOneWidget);
    expect(find.text('QR_REVOKED'), findsNothing);

    // Close sheet
    await tester.tap(find.widgetWithText(BigButton, 'Quét vé tiếp'));
    await tester.pumpAndSettle();

    // 4. Test group QR wrong digest
    scannerWidget.onDetect?.call(const BarcodeCapture(barcodes: [Barcode(rawValue: 'BUSGO_GRP|PNR_01|ord_01|2|tkt_01:v2,tkt_02:v1|wrong_group_hmac')]));
    await tester.pumpAndSettle();

    expect(find.text('Không cho lên xe'), findsOneWidget);
    expect(find.text('Mã nhóm cũ hoặc không hợp lệ. Đề nghị khách mở lại vé trong app, hoặc quét từng vé.'), findsOneWidget);
    expect(find.text('INVALID_SIGNATURE'), findsNothing);

    // Close sheet
    await tester.tap(find.widgetWithText(BigButton, 'Quét vé tiếp'));
    await tester.pumpAndSettle();

    // 5. Test item without boarding_check
    scannerWidget.onDetect?.call(const BarcodeCapture(barcodes: [Barcode(rawValue: 'BUSGO|PNR_02|tkt_no_bc|v1|sig')]));
    await tester.pumpAndSettle();

    expect(find.text('Không cho lên xe'), findsOneWidget);
    expect(find.text('Mất mạng, máy chưa có dữ liệu để kiểm vé này. Nhập mã PIN hoặc chờ có sóng.'), findsOneWidget);
    expect(find.text('OFFLINE_UNVERIFIED'), findsNothing);

    // Close sheet
    await tester.tap(find.widgetWithText(BigButton, 'Quét vé tiếp'));
    await tester.pumpAndSettle();

    // 6. Test unknown ticket
    scannerWidget.onDetect?.call(const BarcodeCapture(barcodes: [Barcode(rawValue: 'BUSGO|PNR_01|tkt_unknown|v1|sig')]));
    await tester.pumpAndSettle();

    expect(find.text('Không cho lên xe'), findsOneWidget);
    expect(find.text('Vé không có trong danh sách chuyến này (có thể đã hủy hoặc của chuyến khác). Gọi nhà xe.'), findsOneWidget);
    expect(find.text('TICKET_NOT_FOUND'), findsNothing);

    // Close sheet
    await tester.tap(find.widgetWithText(BigButton, 'Quét vé tiếp'));
    await tester.pumpAndSettle();

    // 7. Test invalid format
    scannerWidget.onDetect?.call(const BarcodeCapture(barcodes: [Barcode(rawValue: 'NOT_BUSGO_CODE')]));
    await tester.pumpAndSettle();

    expect(find.text('Không cho lên xe'), findsOneWidget);
    expect(find.text('Không phải mã vé BusGo. Đề nghị khách mở vé trong app.'), findsOneWidget);
    expect(find.text('INVALID_FORMAT'), findsNothing);

    store.dispose();
  });

  test('boarding_check survives offline shift persistence and verifies offline after restore', () async {
    final first = DriverStore(api: buildApi());
    expect(await first.login('SAOMAI', 'TX8821', '123456'), isNull);
    first.dispose();

    // Simulate reopening app in offline state
    final prefs = await SharedPreferences.getInstance();
    final session = jsonDecode(prefs.getString('driver_session')!) as Map<String, dynamic>;
    final exp = DateTime.now().add(const Duration(hours: 4)).millisecondsSinceEpoch;
    session['token'] = 'drv_jwt_${base64Url.encode(utf8.encode(jsonEncode({'sub': 'drv_8821a', 'exp': exp}))).replaceAll('=', '')}.sig';
    await prefs.setString('driver_session', jsonEncode(session));

    networkDown = true;
    final second = DriverStore(api: buildApi());
    expect(await second.restoreSession(), isTrue);
    await second.loadShift(autoFlush: false);
    expect(second.loadError, isNull);
    expect(second.shiftSavedAt, isNotNull);

    final p1 = second.manifest.firstWhere((p) => p.ticketId == 'tkt_01');
    expect(p1.boardingCheck, isNotNull);
    expect(p1.boardingCheck?.qrVersion, 2);
    expect(p1.boardingCheck?.qrDigest, 'hmac16_valid_01');
    expect(p1.boardingCheck?.groupDigest, 'grp_hmac_01');

    // Valid offline scan with restored data
    final rOk = await second.boardWithQr('BUSGO|PNR_01|tkt_01|v2|hmac16_valid_01');
    expect(rOk.code, 'QUEUED_OFFLINE');
    expect(p1.status, PaxStatus.waiting);
    expect(second.manifest.firstWhere((p) => p.ticketId == 'tkt_01').status, PaxStatus.boarded);

    // Wrong hmac with restored data is rejected
    final rBad = await second.boardWithQr('BUSGO|PNR_01|tkt_02|v1|wrong_hmac');
    expect(rBad.code, 'INVALID_SIGNATURE');
    expect(second.manifest.firstWhere((p) => p.ticketId == 'tkt_02').status, PaxStatus.waiting);

    second.dispose();
  });
}
