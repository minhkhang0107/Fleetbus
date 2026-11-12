import 'dart:async';
import 'dart:convert';

import 'package:app/src/presentation/driver_store.dart';
import 'package:app/src/service/driver_api_service.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  test('a hanging client with a 50 ms timeout makes a driver action end up in store.queue and store.offline == true', () async {
    var hanging = false;
    final trip = {
      'trip_id': 'trp_01',
      'route_name': 'Hà Nội — Thanh Hóa',
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
        {'stop_id': 'stp_1', 'name': 'Bến xe Giáp Bát', 'order': 1, 'status': 'ARRIVED'},
      ],
      'manifest': [
        {
          'ticket_id': 't_a01',
          'seat_code': 'A01',
          'passenger_name': 'Trần Văn Hùng',
          'phone_masked': '098***112',
          'pickup_stop_id': 'stp_1',
          'dropoff_stop_id': 'stp_2',
          'boarding_status': 'ISSUED',
          'payment_method': 'VIETQR',
          'cod_amount_vnd': 0,
        },
      ],
    };

    final client = MockClient((req) async {
      if (hanging) {
        return Completer<http.Response>().future;
      }
      final path = req.url.path;
      if (path.endsWith('/auth/driver/login')) {
        return http.Response(
          jsonEncode({
            'status': 'success',
            'data': {
              'token': 'tok_driver',
              'driver': {'full_name': 'Trần Văn Bình', 'staff_id': 'TX8821'},
              'operator': {'code': 'SAOMAI', 'name': 'Sao Mai Bus'},
            },
          }),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      }
      if (path.endsWith('/trips/today')) {
        return http.Response(
          jsonEncode({
            'status': 'success',
            'data': {
              'trips': [trip],
            },
          }),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      }
      return http.Response(
        jsonEncode({'status': 'success', 'data': {}}),
        200,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );
    });

    final api = DriverApiClientService(
      baseUrl: 'http://test',
      client: client,
      timeout: const Duration(milliseconds: 50),
    );
    final store = DriverStore(api: api);
    addTearDown(() => store.dispose());

    expect(await store.login('SAOMAI', 'TX8821', '123456'), isNull);
    expect(store.manifest, isNotEmpty);
    final passenger = store.manifest.firstWhere((m) => m.seat == 'A01');

    hanging = true;
    final err = await store.board(passenger);

    expect(err, savedOffline);
    expect(store.manifest.firstWhere((m) => m.seat == 'A01').status, PaxStatus.boarded);
    expect(store.offline, isTrue);
    expect(store.queue, isNotEmpty);
    expect(store.queue.single.label, contains('A01'));
  });
}
