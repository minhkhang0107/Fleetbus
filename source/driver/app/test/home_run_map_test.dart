import 'dart:convert';

import 'package:app/src/presentation/driver_home_run_map.dart';
import 'package:app/src/presentation/driver_home_run_screen.dart';
import 'package:app/src/presentation/driver_permissions.dart';
import 'package:app/src/presentation/driver_route_map.dart';
import 'package:app/src/presentation/driver_store.dart';
import 'package:app/src/service/driver_api_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  driverMapTiles = false;

  setUp(() {
    SharedPreferences.setMockInitialValues({});
    driverPermissions = FakePermissions(LocationAccess.always);
  });

  late Map<String, dynamic> trip;

  http.Response ok(Object? data) => http.Response(
        jsonEncode({'status': 'success', 'data': data}),
        200,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );

  DriverStore storeWithServer({Map<String, dynamic>? homeRunOverride}) {
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
        {'stop_id': 'stp_hn_gb', 'name': 'Bến xe Giáp Bát', 'order': 1, 'status': 'PENDING', 'lat': 20.98, 'lng': 105.84},
        {'stop_id': 'stp_nb', 'name': 'Bến xe Ninh Bình', 'order': 2, 'status': 'PENDING', 'lat': 20.25, 'lng': 105.97},
      ],
      'manifest': [
        {
          'ticket_id': 't_h1',
          'seat_code': 'A01',
          'passenger_name': 'Trần Văn Hùng',
          'phone_masked': '098***112',
          'pickup_stop_id': 'stp_hn_gb',
          'dropoff_stop_id': 'stp_nb',
          'boarding_status': 'ISSUED',
          'payment_method': 'VIETQR',
          'cod_amount_vnd': 0,
          'home_pickup': {
            'address': '12 Phố Huế',
            'lat': 21.01,
            'lng': 105.81,
            'window_from': '2026-08-27T22:45:00Z',
            'window_to': '2026-08-27T23:30:00Z',
          },
        },
        {
          'ticket_id': 't_h2',
          'seat_code': 'A02',
          'passenger_name': 'Nguyễn Văn Nam',
          'phone_masked': '098***321',
          'pickup_stop_id': 'stp_hn_gb',
          'dropoff_stop_id': 'stp_nb',
          'boarding_status': 'ISSUED',
          'payment_method': 'COD',
          'cod_amount_vnd': 220000,
          'home_pickup': {
            'address': '45 Bà Triệu',
            'lat': 21.03,
            'lng': 105.83,
            'window_from': '2026-08-27T22:50:00Z',
            'window_to': '2026-08-27T23:35:00Z',
          },
        },
      ],
      'home_run': homeRunOverride ?? {
        'wait_minutes': 5,
        'stops': [
          {'ticket_id': 't_h1', 'position': 1, 'waiting': true},
          {'ticket_id': 't_h2', 'position': 2, 'waiting': true},
        ],
        'map': {
          'source': 'ROAD',
          'doors': [
            {
              'position': 1,
              'lat': 21.01,
              'lng': 105.81,
              'address': '12 Phố Huế',
              'ticket_ids': ['t_h1'],
              'seats': ['A01', 'A02'],
              'next': true,
            },
            {
              'position': 2,
              'lat': 21.03,
              'lng': 105.83,
              'address': '45 Bà Triệu',
              'ticket_ids': ['t_h2'],
              'seats': ['B01'],
            },
          ],
          'end': {
            'stop_id': 'stp_hn_gb',
            'name': 'Bến xe Giáp Bát',
            'lat': 20.98,
            'lng': 105.84,
          },
          'line': [
            [20.9806, 105.8413],
            [21.01, 105.81],
            [21.03, 105.83],
            [20.98, 105.84],
          ],
          'line_on_road': true,
          'distance_km': 8.5,
          'slower_than_best_minutes': 4,
        },
      },
    };

    final client = MockClient((req) async {
      final path = req.url.path;
      if (path.endsWith('/auth/driver/login')) {
        return ok({
          'token': 'tok',
          'driver': {'full_name': 'Trần Văn Bình', 'staff_id': 'TX8821'},
          'operator': {'code': 'SAOMAI', 'name': 'Sao Mai Bus', 'hotline': '1900 6868'},
        });
      }
      if (path.endsWith('/trips/today')) {
        return ok({'trips': [trip]});
      }
      if (path.contains('/driver/trips/')) return ok(trip);
      return ok({});
    });

    return DriverStore(api: DriverApiClientService(baseUrl: 'http://test', client: client));
  }

  group('HomeRunMap tests', () {
    test('store.homeRunMap is null without map in home_run', () async {
      final store = storeWithServer(homeRunOverride: {
        'wait_minutes': 5,
        'stops': [
          {'ticket_id': 't_h1', 'position': 1, 'waiting': true},
        ],
      });
      expect(await store.login('SAOMAI', 'TX8821', '123456'), isNull);
      expect(store.homeRunMap, isNull);
      store.dispose();
    });

    test('store parses home_run.map into immutable HomeRunMap model', () async {
      final store = storeWithServer();
      expect(await store.login('SAOMAI', 'TX8821', '123456'), isNull);

      final map = store.homeRunMap;
      expect(map, isNotNull);
      expect(map!.byRoad, isTrue);
      expect(map.lineOnRoad, isTrue);
      expect(map.distanceKm, 8.5);
      expect(map.slowerThanBestMinutes, 4);
      expect(map.doors.length, 2);
      expect(map.doors[0].position, 1);
      expect(map.doors[0].address, '12 Phố Huế');
      expect(map.doors[0].seats, ['A01', 'A02']);
      expect(map.doors[1].position, 2);
      expect(map.doors[1].address, '45 Bà Triệu');
      expect(map.doors[1].seats, ['B01']);
      expect(map.end?.name, 'Bến xe Giáp Bát');
      expect(map.line.length, 4);

      store.dispose();
    });

    testWidgets('DriverHomeRunMap renders numbered markers 1..N, end name, summary line, and yellow note', (tester) async {
      final store = storeWithServer();
      await tester.runAsync(() async {
        expect(await store.login('SAOMAI', 'TX8821', '123456'), isNull);
      });

      await tester.pumpWidget(
        DriverScope(
          store: store,
          child: MaterialApp(
            home: Scaffold(
              body: SingleChildScrollView(
                child: DriverHomeRunMap(store: store, height: 260),
              ),
            ),
          ),
        ),
      );
      await tester.pump();

      // Assert numbered markers 1..N
      expect(find.text('1'), findsOneWidget);
      expect(find.text('2'), findsOneWidget);

      // Assert end name
      expect(find.text('Bến xe Giáp Bát'), findsOneWidget);

      // Assert summary line text
      expect(find.text('Lộ trình đón: 2 nhà · 8.5 km · theo đường bộ'), findsOneWidget);

      // Assert yellow note when slower_than_best_minutes > 0
      expect(find.text('Thứ tự bạn đang chọn chậm hơn gợi ý khoảng 4 phút.'), findsOneWidget);

      // Assert "Mở chỉ đường" button exists
      expect(find.text('Mở chỉ đường'), findsOneWidget);

      // Tap marker 1: shows address and seats ("Ghế A1, A2")
      await tester.tap(find.text('1'));
      await tester.pump();
      expect(find.textContaining('12 Phố Huế'), findsOneWidget);
      expect(find.textContaining('Ghế A01, A02'), findsOneWidget);
      // The details sit under the map (a label on the map overflowed its marker); closing hides them.
      await tester.tap(find.byTooltip('Đóng'));
      await tester.pump();
      expect(find.textContaining('12 Phố Huế'), findsNothing);
      expect(store.homeRunMap!.doors.first.next, isTrue);
      expect(store.homeRunMap!.doors.last.next, isFalse);

      await tester.pumpWidget(const SizedBox());
      store.dispose();
    });

    testWidgets('straight source and 0 slower minutes shows correct summary and no yellow note', (tester) async {
      final store = storeWithServer(homeRunOverride: {
        'wait_minutes': 5,
        'stops': [
          {'ticket_id': 't_h1', 'position': 1, 'waiting': true},
        ],
        'map': {
          'source': 'STRAIGHT',
          'doors': [
            {
              'position': 1,
              'lat': 21.01,
              'lng': 105.81,
              'address': '12 Phố Huế',
              'ticket_ids': ['t_h1'],
              'seats': ['A01'],
            },
          ],
          'end': {
            'stop_id': 'stp_hn_gb',
            'name': 'Bến xe Giáp Bát',
            'lat': 20.98,
            'lng': 105.84,
          },
          'line': [
            [20.9806, 105.8413],
            [21.01, 105.81],
          ],
          'line_on_road': false,
          'distance_km': 5.0,
          'slower_than_best_minutes': 0,
        },
      });
      await tester.runAsync(() async {
        expect(await store.login('SAOMAI', 'TX8821', '123456'), isNull);
      });

      await tester.pumpWidget(
        DriverScope(
          store: store,
          child: MaterialApp(
            home: Scaffold(
              body: SingleChildScrollView(
                child: DriverHomeRunMap(store: store, height: 260),
              ),
            ),
          ),
        ),
      );
      await tester.pump();

      // Summary line with đường thẳng ước tính
      expect(find.text('Lộ trình đón: 1 nhà · 5 km · đường thẳng ước tính'), findsOneWidget);

      // No yellow note
      expect(find.textContaining('chậm hơn gợi ý'), findsNothing);

      await tester.pumpWidget(const SizedBox());
      store.dispose();
    });

    testWidgets('DriverHomeRunScreen uses DriverHomeRunMap when homeRunMap is present, and DriverRouteMap when absent', (tester) async {
      // With homeRunMap
      final storeWithMap = storeWithServer();
      await tester.runAsync(() async {
        expect(await storeWithMap.login('SAOMAI', 'TX8821', '123456'), isNull);
      });
      await tester.pumpWidget(
        DriverScope(
          store: storeWithMap,
          child: const MaterialApp(home: DriverHomeRunScreen()),
        ),
      );
      await tester.pump();
      expect(find.byType(DriverHomeRunMap), findsOneWidget);
      expect(find.byType(DriverRouteMap), findsNothing);
      await tester.pumpWidget(const SizedBox());
      storeWithMap.dispose();

      // Without homeRunMap
      final storeWithoutMap = storeWithServer(homeRunOverride: {
        'wait_minutes': 5,
        'stops': [
          {'ticket_id': 't_h1', 'position': 1, 'waiting': true},
        ],
      });
      await tester.runAsync(() async {
        expect(await storeWithoutMap.login('SAOMAI', 'TX8821', '123456'), isNull);
      });
      await tester.pumpWidget(
        DriverScope(
          store: storeWithoutMap,
          child: const MaterialApp(home: DriverHomeRunScreen()),
        ),
      );
      await tester.pump();
      expect(find.byType(DriverHomeRunMap), findsNothing);
      expect(find.byType(DriverRouteMap), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
      storeWithoutMap.dispose();
    });
  });
}

class FakePermissions implements DevicePermissions {
  FakePermissions(this.access);
  LocationAccess access;

  @override
  Future<LocationAccess> location() async => access;
  @override
  Future<LocationAccess> requestLocation() async => access;
  @override
  Future<LocationAccess> requestBackgroundLocation() async => access;
  @override
  Future<bool> requestNotifications() async => true;
  @override
  Future<bool> camera({bool request = false}) async => false;
  @override
  Future<void> openSettings() async {}
  @override
  Future<void> openLocationSettings() async {}
}

