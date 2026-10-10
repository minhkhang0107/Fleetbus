import 'dart:convert';

import 'package:app/src/presentation/driver_route.dart';
import 'package:app/src/presentation/driver_store.dart';
import 'package:app/src/service/driver_api_service.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  group('RoutePath', () {
    final p0 = [21.0, 105.0];
    final p1 = [20.0, 105.0];
    final p2 = [20.0, 106.0];
    final path = RoutePath([p0, p1, p2]);

    test('length matches the haversine sum within 1 m', () {
      final h1 = RoutePath.haversine(p0[0], p0[1], p1[0], p1[1]);
      final h2 = RoutePath.haversine(p1[0], p1[1], p2[0], p2[1]);
      expect((path.length - (h1 + h2)).abs(), lessThan(1.0));
    });

    test('pointAt(0) is the first point and pointAt(length) is the last', () {
      final start = path.pointAt(0);
      expect(start.lat, closeTo(p0[0], 1e-6));
      expect(start.lng, closeTo(p0[1], 1e-6));

      final end = path.pointAt(path.length);
      expect(end.lat, closeTo(p2[0], 1e-6));
      expect(end.lng, closeTo(p2[1], 1e-6));
    });

    test('pointAt(length/2) lies on the path', () {
      final mid = path.pointAt(path.length / 2);
      expect(path.distanceTo(mid.lat, mid.lng), lessThan(1.0));
      expect(path.project(mid.lat, mid.lng), closeTo(path.length / 2, 1.0));
      expect(mid.lng, closeTo(105.0, 1e-6));
      expect(mid.lat, greaterThan(20.0));
      expect(mid.lat, lessThan(21.0));
    });

    test('project(pointAt(x)) ≈ x within 5 m for several x', () {
      final xs = [0.0, 1000.0, 50000.0, path.length / 2, path.length * 0.75, path.length - 1000.0, path.length];
      for (final x in xs) {
        final pt = path.pointAt(x);
        final proj = path.project(pt.lat, pt.lng);
        expect((proj - x).abs(), lessThan(5.0), reason: 'x=$x projected to $proj');
      }
    });

    test('bearing of a due-south segment ≈ 180', () {
      expect(path.pointAt(0).bearing, closeTo(180.0, 0.5));
      expect(path.pointAt(50000).bearing, closeTo(180.0, 0.5));
    });

    test('RoutePath.straight creates a valid 2-point path', () {
      final straight = RoutePath.straight(21.0, 105.0, 20.0, 105.0);
      expect(straight.length, closeTo(RoutePath.haversine(21.0, 105.0, 20.0, 105.0), 1.0));
      expect(straight.pointAt(0).bearing, closeTo(180.0, 0.5));
    });
  });

  group('DriverStore road simulation', () {
    late Map<String, dynamic> trip;
    late List<http.Request> sent;

    http.Response ok(Object? data) => http.Response(jsonEncode({'status': 'success', 'data': data}), 200, headers: {'content-type': 'application/json; charset=utf-8'});

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
        'current_lat': 20.9806,
        'current_lng': 105.8413,
        'total_cod_collected_vnd': 0,
        'total_hail_collected_vnd': 0,
        'debts': <Map<String, dynamic>>[],
        'readiness_checklist': {for (final k in DriverStore.checkKeys) k: true},
        'stops': [
          {'stop_id': 'stp_hn_gb', 'name': 'Bến xe Giáp Bát', 'order': 1, 'lat': 20.9806, 'lng': 105.8413, 'status': 'PENDING'},
          {'stop_id': 'stp_nb', 'name': 'Bến xe Ninh Bình', 'order': 2, 'lat': 20.2531, 'lng': 105.9748, 'status': 'PENDING'},
          {'stop_id': 'stp_th_pb', 'name': 'Bến xe Phía Bắc Thanh Hóa', 'order': 3, 'lat': 19.8200, 'lng': 105.7700, 'status': 'PENDING'},
        ],
        'route_shape': [
          [20.9806, 105.8413],
          [20.2531, 105.9748],
          [19.8200, 105.7700],
        ],
        'manifest': <Map<String, dynamic>>[],
      };
      final client = MockClient((req) async {
        sent.add(req);
        final path = req.url.path;
        if (path.endsWith('/auth/driver/login')) {
          return ok({'token': 'tok', 'driver': {'full_name': 'Trần Văn Bình', 'staff_id': 'TX8821'}});
        }
        if (path.endsWith('/trips/today')) return ok({'trips': [trip]});
        if (path.endsWith('/readiness')) return ok({'status': 'READY'});
        if (path.endsWith('/start')) {
          trip['status'] = 'IN_TRANSIT';
          return ok(trip);
        }
        if (path.contains('/stops/') && path.endsWith('/arrive')) {
          return ok({});
        }
        if (path.contains('/driver/trips/')) return ok(trip);
        return ok({});
      });
      return DriverStore(api: DriverApiClientService(baseUrl: 'http://test', client: client));
    }

    test('trip payload with lat/lng and 3-point route_shape parses into stops with coordinates and road', () async {
      final store = storeWithServer();
      expect(await store.login('TX8821', '123456'), isNull);
      expect(store.stops, hasLength(3));
      expect(store.stops[0].lat, 20.9806);
      expect(store.stops[0].lng, 105.8413);
      expect(store.stops[1].lat, 20.2531);
      expect(store.stops[1].lng, 105.9748);
      expect(store.stops[2].lat, 19.8200);
      expect(store.stops[2].lng, 105.7700);
      expect(store.road, isNotNull);
      expect(store.road!.length, greaterThan(0));

      expect(await store.startTrip(), isNull);
      expect(store.atStop, isTrue);
      expect(store.moving, isFalse);

      store.leaveStop();
      expect(store.moving, isTrue);
      expect(store.speed, 62);
      expect(store.stopIndex, 1);

      await store.sendTelemetry();
      final telemReq = sent.lastWhere((r) => r.url.path.contains('/telemetry'));
      final telemBody = jsonDecode(telemReq.body) as Map<String, dynamic>;
      expect(telemBody['speed_kmh'], 62.0);
      expect(telemBody['lat'], isA<double>());
      expect(telemBody['lng'], isA<double>());
      expect(telemBody['bearing_deg'], isA<double>());

      store.dispose();
    });
  });
}
