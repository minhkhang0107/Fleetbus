import 'dart:convert';

import 'package:app/src/presentation/driver_store.dart';
import 'package:app/src/service/driver_api_service.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

/// Rules of the driver app state against a fake FleetBus server that keeps the trip like the real one.
void main() {
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
        if (body['pin'] != '123456') return fail(401, 'INVALID_CREDENTIALS', 'Mã nhân viên hoặc mã PIN không chính xác');
        return ok({'token': 'tok', 'driver': {'full_name': 'Trần Văn Bình', 'staff_id': 'TX8821'}});
      }
      if (path.endsWith('/trips/today')) return ok({'trips': [trip]});
      if (path.endsWith('/readiness')) return ok({'status': 'READY'});
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
    expect(await store.login('TX8821', '123456'), isNull);
    expect(await store.startTrip(), isNull);
    return store;
  }

  test('login loads the shift: route, departure, stops and manifest come from the server', () async {
    final store = storeWithServer();
    expect(await store.login('TX8821', '000000'), 'Mã nhân viên hoặc mã PIN không chính xác');
    expect(await store.login('TX8821', '123456'), isNull);
    expect((store.driverName, store.tripId, store.route, store.depTime, store.plate), ('Trần Văn Bình', 'trp_hn_th_01', 'Hà Nội → Thanh Hóa', '07:00', '29B-882.19'));
    expect(store.stops.map((s) => s.time), ['07:00', '07:45', '08:30']);
    expect(store.manifest, hasLength(2));
    expect(store.readyToStart, isTrue, reason: 'the server already holds a complete checklist');
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

  test('a lost network lists the action for later instead of failing silently', () async {
    final store = DriverStore(api: DriverApiClientService(baseUrl: 'http://test', client: MockClient((_) async => throw http.ClientException('down'))));
    expect(await store.login('TX8821', '123456'), contains('Không kết nối được'));
    store.tripId = 'trp_hn_th_01';
    store.stops = const [DriverStop('stp_hn_gb', 'Bến xe Giáp Bát', '07:00')];
    await store.reportIncident('Kẹt xe', 15);
    expect(store.offline, isTrue);
    expect(store.queue.single.label, 'Báo sự cố: Kẹt xe');
    expect(store.incident!.delay, 15);
    store.dispose();
  });
}
