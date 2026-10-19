import 'dart:async';
import 'dart:convert';

import 'package:app/src/presentation/passenger/passenger_live_radar_screen.dart';
import 'package:app/src/presentation/passenger/passenger_main_shell.dart';
import 'package:app/src/presentation/passenger/passenger_onboarding_screen.dart';
import 'package:app/src/presentation/passenger/passenger_route_map.dart';
import 'package:app/src/presentation/passenger/passenger_splash_screen.dart';
import 'package:app/src/presentation/passenger/passenger_store.dart';
import 'package:app/src/presentation/passenger/passenger_wallet_screen.dart';
import 'package:data/src/service/passenger_api_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:latlong2/latlong.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:app/src/presentation/passenger/passenger_permissions.dart';

import 'fake_permissions.dart';

void main() {
  setUp(() => passengerPermissions = FakePassengerPermissions());
  passengerMapTiles = false;

  testWidgets('pump PassengerRouteMap with a 3-point route, 2 stops, bus, target', (tester) async {
    const route = [
      (20.98, 105.84),
      (20.50, 105.90),
      (19.80, 105.78),
    ];
    const stops = [
      TrackingStop(stopId: 's1', name: 'Giáp Bát', lat: 20.98, lng: 105.84),
      TrackingStop(stopId: 's2', name: 'Ninh Bình', lat: 20.25, lng: 105.97),
    ];
    const target = TrackingTarget(
      stopId: 's1',
      name: 'Giáp Bát',
      lat: 20.98,
      lng: 105.84,
      isDropoff: false,
    );

    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: PassengerRouteMap(
            route: route,
            stops: stops,
            busLat: 20.98,
            busLng: 105.84,
            bearing: 180.0,
            speed: 55.0,
            target: target,
            signal: GpsSignal.live,
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    // Finds the "Điểm đón" label and stop name
    expect(find.textContaining('Điểm đón · Giáp Bát'), findsOneWidget);

    // The bus circle and the pickup ring sit exactly on their coordinates; the labels hang outside them.
    final state = tester.state<PassengerRouteMapState>(find.byType(PassengerRouteMap));
    final onScreen = tester.getTopLeft(find.byType(FlutterMap)) + state.mapController.camera.latLngToScreenOffset(const LatLng(20.98, 105.84));
    expect((tester.getCenter(find.byIcon(Icons.directions_bus)) - onScreen).distance, lessThan(1.5), reason: 'the bus icon is drawn on the bus position, not above or below it');

    // Finds the attribution text
    expect(find.textContaining('OpenStreetMap contributors'), findsOneWidget);

    // Finds the "Toàn tuyến" button
    expect(find.text('Toàn tuyến'), findsOneWidget);

    // Finds the "Theo xe" button because bus position is present
    expect(find.text('Theo xe'), findsOneWidget);

    // Tapping both buttons causes no errors
    await tester.tap(find.text('Toàn tuyến'));
    await tester.pump();
    await tester.tap(find.text('Theo xe'));
    await tester.pump();
  });

  testWidgets('with no bus → no "Theo xe"', (tester) async {
    const route = [
      (20.98, 105.84),
      (20.50, 105.90),
      (19.80, 105.78),
    ];
    const stops = [
      TrackingStop(stopId: 's1', name: 'Giáp Bát', lat: 20.98, lng: 105.84),
    ];
    const target = TrackingTarget(
      stopId: 's1',
      name: 'Giáp Bát',
      lat: 20.98,
      lng: 105.84,
      isDropoff: false,
    );

    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: PassengerRouteMap(
            route: route,
            stops: stops,
            target: target,
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Toàn tuyến'), findsOneWidget);
    expect(find.text('Theo xe'), findsNothing);
  });

  testWidgets('target stop with isDropoff shows "Điểm trả"', (tester) async {
    const target = TrackingTarget(
      stopId: 's2',
      name: 'Ninh Bình',
      lat: 20.25,
      lng: 105.97,
      isDropoff: true,
    );

    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: PassengerRouteMap(
            target: target,
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.textContaining('Điểm trả · Ninh Bình'), findsOneWidget);
  });

  testWidgets('pumps map with tracking: null, then rebuilds with route and camera moves', (tester) async {
    // 1. Initial build with no tracking/route (like radar screen before network load)
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: PassengerRouteMap(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    final state = tester.state<PassengerRouteMapState>(find.byType(PassengerRouteMap));
    expect(state.isFitted, isFalse);
    expect(state.mapController.camera.center.latitude, closeTo(20.5, 0.01));
    expect(state.mapController.camera.center.longitude, closeTo(105.9, 0.01));

    // 2. Data arrives and parent rebuilds with route
    const route = [
      (21.0285, 105.8542), // Hanoi
      (20.4500, 105.9500),
      (19.8000, 105.7800), // Thanh Hoa
    ];

    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: PassengerRouteMap(
            route: route,
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    // Verify _fitted flag became true and camera moved to encompass the route
    expect(state.isFitted, isTrue);
    final visibleBounds = state.mapController.camera.visibleBounds;
    expect(visibleBounds.contains(const LatLng(21.0285, 105.8542)), isTrue);
    expect(visibleBounds.contains(const LatLng(19.8000, 105.7800)), isTrue);
  });

  testWidgets('shows speed pill text "62 km/h · vừa cập nhật" when LIVE', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: PassengerRouteMap(
            busLat: 20.98,
            busLng: 105.84,
            speed: 62.0,
            bearing: 90.0,
            signal: GpsSignal.live,
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('62 km/h · vừa cập nhật'), findsOneWidget);
    // Navigation arrow rotated by bearing is rendered
    expect(find.byIcon(Icons.navigation), findsOneWidget);
    // Bus icon is upright
    expect(find.byIcon(Icons.directions_bus), findsOneWidget);
  });

  testWidgets('boarded ticket shows HUD text below metric row', (tester) async {
    final client = MockClient((req) async {
      return http.Response(
        jsonEncode({
          'status': 'success',
          'data': {
            'signal_status': 'LIVE',
            'has_passed_target': false,
            'hud_status_text': 'Xe đang di chuyển đến điểm trả (Cách 63 km, ~61 phút)',
          },
        }),
        200,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );
    });

    final store = PassengerStore(
      api: PassengerApiClientService(baseUrl: 'http://test', client: client),
    );

    final ticket = Ticket.fromJson({
      'ticket_id': 'tkt_01',
      'pnr': 'BG-0001',
      'trip_id': 'trp_01',
      'route_name': 'Hà Nội — Thanh Hóa',
      'departure_time': '2026-08-28T07:00:00+07:00',
      'seat_code': 'A01',
      'fare_vnd': 220000,
      'passenger_name': 'Nguyễn An',
      'pickup_stop': 'Bến xe Giáp Bát',
      'dropoff_stop': 'Bến xe Phía Bắc',
      'status': 'BOARDED',
    });

    await tester.pumpWidget(
      MaterialApp(
        home: PassengerScope(
          store: store,
          child: PassengerLiveRadarScreen(ticket: ticket),
        ),
      ),
    );
    await tester.pumpAndSettle();

    // Kept the two metrics
    expect(find.text('Trạng thái'), findsOneWidget);
    expect(find.text('Đã lên xe'), findsOneWidget);
    expect(find.text('Điểm trả'), findsOneWidget);
    // AND shows hud text below the metrics
    expect(find.text('Xe đang di chuyển đến điểm trả (Cách 63 km, ~61 phút)'), findsOneWidget);
  });

  testWidgets('the tracking screen shows the bus pushed by the server and asks again only when the stream drops', (tester) async {
    final pushed = StreamController<List<int>>();
    var asked = 0;
    final client = MockClient.streaming((req, _) async {
      if (req.url.path.endsWith('/tracking/stream')) {
        expect(req.headers['Accept'], 'text/event-stream');
        expect(req.url.queryParameters['ticket_id'], 'tkt_01');
        return http.StreamedResponse(pushed.stream, 200, headers: {'content-type': 'text/event-stream; charset=utf-8'});
      }
      asked++;
      final body = jsonEncode({'status': 'success', 'data': {'signal_status': 'LIVE', 'hud_status_text': 'Ảnh chụp ban đầu'}});
      return http.StreamedResponse(Stream.value(utf8.encode(body)), 200, headers: {'content-type': 'application/json; charset=utf-8'});
    });
    final store = PassengerStore(api: PassengerApiClientService(baseUrl: 'http://test', client: client));
    final ticket = Ticket.fromJson({
      'ticket_id': 'tkt_01',
      'pnr': 'BG-0001',
      'trip_id': 'trp_01',
      'route_name': 'Hà Nội — Thanh Hóa',
      'departure_time': '2026-08-28T07:00:00+07:00',
      'seat_code': 'A01',
      'fare_vnd': 220000,
      'passenger_name': 'Nguyễn An',
      'pickup_stop': 'Bến xe Giáp Bát',
      'dropoff_stop': 'Bến xe Phía Bắc',
      'status': 'BOARDED',
    });
    await tester.pumpWidget(MaterialApp(home: PassengerScope(store: store, child: PassengerLiveRadarScreen(ticket: ticket))));
    await tester.pump();
    expect(asked, 1);

    final event = jsonEncode({'signal_status': 'LIVE', 'hud_status_text': 'Xe đang dừng ở Bến xe Ninh Bình'});
    pushed.add(utf8.encode('retry: 5000\n\nevent: tracking\ndata: $event\n\n'));
    await tester.pump();
    await tester.pump();
    expect(find.text('Xe đang dừng ở Bến xe Ninh Bình'), findsOneWidget);

    // While the stream is open the screen does not ask every 10 s.
    await tester.pump(const Duration(seconds: 25));
    expect(asked, 1);

    // The stream drops: the screen asks again every 10 s until it reconnects.
    await pushed.close();
    await tester.pump();
    await tester.pump(const Duration(seconds: 10));
    expect(asked, 2);
    await tester.pumpWidget(const SizedBox());
  });

  Future<void> pumpTracking(WidgetTester tester, Map<String, dynamic> data) async {
    final client = MockClient((req) async => http.Response(
          jsonEncode({'status': 'success', 'data': data}),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        ));
    final store = PassengerStore(api: PassengerApiClientService(baseUrl: 'http://test', client: client));
    final ticket = Ticket.fromJson({
      'ticket_id': 'tkt_02',
      'pnr': 'BG-0002',
      'trip_id': 'trp_01',
      'route_name': 'Hà Nội — Thanh Hóa',
      'departure_time': '2026-08-28T07:00:00+07:00',
      'seat_code': 'A02',
      'fare_vnd': 220000,
      'passenger_name': 'Nguyễn An',
      'pickup_stop': 'Bến xe Ninh Bình',
      'dropoff_stop': 'Bến xe Phía Bắc',
      'status': 'ISSUED',
    });
    await tester.pumpWidget(MaterialApp(home: PassengerScope(store: store, child: PassengerLiveRadarScreen(ticket: ticket))));
    await tester.pump();
    await tester.pump();
  }

  testWidgets('the passenger sees where the bus is, when it will be at the stop, and how late (D143)', (tester) async {
    await pumpTracking(tester, {
      'signal_status': 'LIVE',
      'has_position': true,
      'bus_position': {'lat': 20.54, 'lng': 105.91, 'speed_kmh': 60, 'bearing_deg': 180},
      'target_stop': {'stop_id': 'stp_nb', 'name': 'Bến xe Ninh Bình', 'lat': 20.25, 'lng': 105.97, 'kind': 'PICKUP'},
      'eta_minutes': 32,
      'distance_meters': 31000,
      'target_planned_time': '2026-08-28T01:18:00.000Z',
      'expected_at': '2026-08-28T01:26:00.000Z',
      'late_minutes': 8,
      'bus_location': {'at_stop': null, 'last_passed_stop': 'Nút giao Phủ Lý (cao tốc)', 'next_stop': 'Bến xe Ninh Bình', 'stops_before_target': 0},
    });
    expect(find.text('Xe vừa qua Nút giao Phủ Lý (cao tốc), sắp tới Ninh Bình'), findsOneWidget);
    expect(find.text('Trạm kế tiếp là trạm của bạn'), findsOneWidget);
    expect(find.text('~08:26'), findsOneWidget);
    expect(find.text('32 phút'), findsOneWidget);
    expect(find.text('Đến điểm đón · 31.0 km'), findsOneWidget);
    expect(find.text('Trễ khoảng 8 phút so với dự kiến 08:18'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('a home pickup before the driver sets off shows the promised window at the address (D143)', (tester) async {
    await pumpTracking(tester, {
      'signal_status': 'NO_SIGNAL',
      'has_position': false,
      'target_stop': {'stop_id': null, 'name': '12 Hàng Bài, Hoàn Kiếm', 'lat': 21.0245, 'lng': 105.8523, 'kind': 'HOME_PICKUP'},
      'target_planned_time': '2026-08-27T22:45:00.000Z',
      'target_window': {'from': '2026-08-27T22:45:00.000Z', 'to': '2026-08-27T23:30:00.000Z'},
    });
    expect(find.text('Tài xế chưa lên đường đón bạn'), findsOneWidget);
    expect(find.text('Đón tại 12 Hàng Bài, Hoàn Kiếm'), findsOneWidget);
    expect(find.text('Khung đón'), findsOneWidget);
    expect(find.text('05:45–06:30'), findsOneWidget);
    expect(find.text('Đến chỗ bạn'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('the ticket in Vé của tôi says how long until the bus is there, once it is on its way (D143)', (tester) async {
    final client = MockClient((req) async => http.Response(
          jsonEncode({'status': 'success', 'data': {
            'signal_status': 'LIVE',
            'has_position': true,
            'view': 'TICKET',
            'bus_position': {'lat': 20.54, 'lng': 105.91, 'speed_kmh': 60},
            'target_stop': {'stop_id': 'stp_nb', 'name': 'Bến xe Ninh Bình', 'lat': 20.25, 'lng': 105.97, 'kind': 'PICKUP'},
            'eta_minutes': 12,
            'expected_at': '2026-08-28T01:20:00.000Z',
            'late_minutes': 2,
            'bus_location': {'at_stop': 'Nút giao Phủ Lý (cao tốc)', 'next_stop': 'Bến xe Ninh Bình', 'stops_before_target': 0},
          }}),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        ));
    final store = PassengerStore(api: PassengerApiClientService(baseUrl: 'http://test', client: client));
    final ticket = Ticket.fromJson({
      'ticket_id': 'tkt_03', 'pnr': 'BG-0003', 'trip_id': 'trp_01', 'route_name': 'Hà Nội — Thanh Hóa',
      'departure_time': '2026-08-28T07:00:00+07:00', 'seat_code': 'A03', 'fare_vnd': 220000, 'passenger_name': 'Nguyễn An',
      'pickup_stop': 'Bến xe Ninh Bình', 'dropoff_stop': 'Bến xe Phía Bắc', 'status': 'ACTIVE',
    });
    await tester.pumpWidget(MaterialApp(home: PassengerScope(store: store, child: Scaffold(body: TicketCard(ticket: ticket)))));
    await tester.pump();
    await tester.pump();
    expect(find.text('Xe còn 12 phút · tới lúc ~08:20'), findsOneWidget);
    expect(find.text('Xe đang ở Nút giao Phủ Lý (cao tốc)'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('a home passenger sees their place in the run and their appointment, and answers ready (D144)', (tester) async {
    final sentBodies = <Map<String, dynamic>>[];
    final client = MockClient((req) async {
      if (req.url.path.endsWith('/pickup-ready')) {
        sentBodies.add(jsonDecode(req.body) as Map<String, dynamic>);
        return http.Response(jsonEncode({'status': 'success', 'data': {'ready': {'status': 'NEED_TIME', 'minutes': 2}, 'wait_minutes': 5}}), 200, headers: {'content-type': 'application/json; charset=utf-8'});
      }
      return http.Response(
        jsonEncode({'status': 'success', 'data': {
          'signal_status': 'LIVE',
          'has_position': true,
          'view': 'TICKET',
          'bus_position': {'lat': 21.02, 'lng': 105.85, 'speed_kmh': 25},
          'target_stop': {'stop_id': null, 'name': '88 Láng Hạ, Đống Đa', 'lat': 21.0136, 'lng': 105.815, 'kind': 'HOME_PICKUP'},
          'eta_minutes': 14,
          'distance_meters': 6200,
          'appointment_at': '2026-08-27T22:55:00.000Z',
          'expected_at': '2026-08-27T23:03:00.000Z',
          'late_minutes': 8,
          'home_queue': {'position': 2, 'ahead': 1, 'total': 3},
          'home_wait_minutes': 5,
        }}),
        200,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );
    });
    final store = PassengerStore(api: PassengerApiClientService(baseUrl: 'http://test', client: client));
    final ticket = Ticket.fromJson({
      'ticket_id': 'tkt_05', 'pnr': 'BG-0005', 'trip_id': 'trp_01', 'route_name': 'Hà Nội — Thanh Hóa',
      'departure_time': '2026-08-28T07:00:00+07:00', 'seat_code': 'A02', 'fare_vnd': 220000, 'passenger_name': 'Khách B',
      'pickup_stop': 'Bến xe Mỹ Đình', 'dropoff_stop': 'Bến xe Phía Bắc', 'status': 'ACTIVE',
    });
    await tester.pumpWidget(MaterialApp(home: PassengerScope(store: store, child: PassengerLiveRadarScreen(ticket: ticket))));
    await tester.pump();
    await tester.pump();
    expect(find.text('Xe đang đón khách khác trước bạn'), findsOneWidget);
    expect(find.text('Bạn là điểm đón thứ 2/3 · Đón tại 88 Láng Hạ, Đống Đa'), findsOneWidget);
    expect(find.text('~06:03'), findsOneWidget);
    expect(find.text('Trễ khoảng 8 phút so với giờ hẹn 05:55'), findsOneWidget);

    await tester.ensureVisible(find.text('+2 phút'));
    await tester.tap(find.text('+2 phút'));
    await tester.pump();
    await tester.pump();
    expect(sentBodies, [{'status': 'NEED_2'}]);
    expect(find.textContaining('Bạn đã báo: cần thêm 2 phút.'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(seconds: 4));
  });

  test('a new "bus is coming" notice becomes an alert; the first load and other types do not (D144)', () async {
    var round = 0;
    final client = MockClient((req) async {
      final list = [
        {'id': 'n1', 'title': 'Thanh toán thành công', 'body': 'x', 'type': 'PAYMENT_SUCCESS', 'is_read': false, 'created_at': '2026-08-27T21:00:00Z', 'payload': {}},
        if (round > 0) {'id': 'n2', 'title': 'Xe sắp tới đón bạn', 'body': 'Bạn là điểm đón tiếp theo', 'type': 'PICKUP_APPROACHING', 'is_read': false, 'created_at': '2026-08-27T22:50:00Z', 'payload': {'ticket_id': 'tkt_05'}},
      ];
      return http.Response(jsonEncode({'status': 'success', 'data': list}), 200, headers: {'content-type': 'application/json; charset=utf-8'});
    });
    final store = PassengerStore(api: PassengerApiClientService(baseUrl: 'http://test', client: client));
    store.api.authToken = 'tok';
    await store.loadNotices();
    expect(store.pendingAlert, isNull, reason: 'what is there at start is not news');
    round = 1;
    await store.loadNotices();
    expect(store.pendingAlert?.title, 'Xe sắp tới đón bạn');
    expect(store.pendingAlert?.ticketId, 'tkt_05');
  });

  test('loadTracking parses full tracking payload and sends ticket_id query', () async {
    http.Request? capturedRequest;
    final client = MockClient((req) async {
      capturedRequest = req;
      return http.Response(
        jsonEncode({
          'status': 'success',
          'data': {
            'signal_status': 'LIVE',
            'has_position': true,
            'bus_position': {
              'lat': 20.9812,
              'lng': 105.8423,
              'speed_kmh': 42.5,
              'bearing_deg': 185.0,
            },
            'distance_meters': 12500,
            'eta_minutes': 18,
            'hud_status_text': 'Cách điểm đón 12.5 km',
            'has_passed_target': false,
            'target_stop': {
              'stop_id': 'stp_hn_gb',
              'name': 'Bến xe Giáp Bát',
              'lat': 20.9800,
              'lng': 105.8400,
              'kind': 'PICKUP',
            },
            'stops': [
              {
                'stop_id': 'stp_hn_gb',
                'name': 'Bến xe Giáp Bát',
                'order': 1,
                'lat': 20.9800,
                'lng': 105.8400,
              },
              {
                'stop_id': 'stp_nb',
                'name': 'Bến xe Ninh Bình',
                'order': 2,
                'lat': 20.2500,
                'lng': 105.9700,
              },
            ],
            'route_shape': [
              [20.9800, 105.8400],
              [20.5000, 105.9000],
              [19.8000, 105.7800],
            ],
            'distance_basis': 'ROUTE',
            'view': 'TICKET',
          },
        }),
        200,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );
    });

    final store = PassengerStore(
      api: PassengerApiClientService(baseUrl: 'http://test', client: client),
    );

    final tracking = await store.loadTracking('trp_hn_th_01', ticketId: 'tkt_BG1_A02');

    // Query parameter assertion
    expect(capturedRequest, isNotNull);
    expect(capturedRequest!.url.path, '/api/v1/trips/trp_hn_th_01/tracking');
    expect(capturedRequest!.url.queryParameters['ticket_id'], 'tkt_BG1_A02');

    // Field parsing assertions
    expect(tracking.signal, GpsSignal.live);
    expect(tracking.busLat, 20.9812);
    expect(tracking.busLng, 105.8423);
    expect(tracking.speed, 42.5);
    expect(tracking.bearing, 185.0);
    expect(tracking.distanceKm, 12.5);
    expect(tracking.etaMinutes, 18);
    expect(tracking.text, 'Cách điểm đón 12.5 km');
    expect(tracking.passedTarget, isFalse);
    expect(tracking.publicView, isFalse);

    expect(tracking.target, isNotNull);
    expect(tracking.target!.stopId, 'stp_hn_gb');
    expect(tracking.target!.name, 'Bến xe Giáp Bát');
    expect(tracking.target!.lat, 20.9800);
    expect(tracking.target!.lng, 105.8400);
    expect(tracking.target!.isDropoff, isFalse);

    expect(tracking.stops.length, 2);
    expect(tracking.stops[0].stopId, 'stp_hn_gb');
    expect(tracking.stops[0].name, 'Bến xe Giáp Bát');
    expect(tracking.stops[0].order, 1);
    expect(tracking.stops[0].lat, 20.9800);
    expect(tracking.stops[0].lng, 105.8400);
    expect(tracking.stops[1].stopId, 'stp_nb');
    expect(tracking.stops[1].name, 'Bến xe Ninh Bình');
    expect(tracking.stops[1].order, 2);
    expect(tracking.stops[1].lat, 20.2500);
    expect(tracking.stops[1].lng, 105.9700);

    expect(tracking.route.length, 3);
    expect(tracking.route[0], (20.9800, 105.8400));
    expect(tracking.route[1], (20.5000, 105.9000));
    expect(tracking.route[2], (19.8000, 105.7800));
  });

  test('loadTracking parses defensively when response is empty', () async {
    http.Request? capturedRequest;
    final client = MockClient((req) async {
      capturedRequest = req;
      return http.Response(
        jsonEncode({'status': 'success', 'data': {}}),
        200,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );
    });

    final store = PassengerStore(
      api: PassengerApiClientService(baseUrl: 'http://test', client: client),
    );

    final tracking = await store.loadTracking('trp_empty');

    expect(capturedRequest, isNotNull);
    expect(capturedRequest!.url.queryParameters.containsKey('ticket_id'), isFalse);
    expect(tracking.signal, GpsSignal.none);
    expect(tracking.busLat, isNull);
    expect(tracking.busLng, isNull);
    expect(tracking.bearing, isNull);
    expect(tracking.speed, isNull);
    expect(tracking.distanceKm, isNull);
    expect(tracking.etaMinutes, isNull);
    expect(tracking.text, '');
    expect(tracking.target, isNull);
    expect(tracking.stops, isEmpty);
    expect(tracking.route, isEmpty);
    expect(tracking.passedTarget, isFalse);
    expect(tracking.publicView, isFalse);
  });

  testWidgets('radar screen shows hud status text when passedTarget is true', (tester) async {
    final client = MockClient((req) async {
      return http.Response(
        jsonEncode({
          'status': 'success',
          'data': {
            'signal_status': 'LIVE',
            'has_passed_target': true,
            'hud_status_text': 'Xe đã qua Giáp Bát',
          },
        }),
        200,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );
    });

    final store = PassengerStore(
      api: PassengerApiClientService(baseUrl: 'http://test', client: client),
    );

    final ticket = Ticket.fromJson({
      'ticket_id': 'tkt_01',
      'pnr': 'BG-0001',
      'trip_id': 'trp_01',
      'route_name': 'Hà Nội — Thanh Hóa',
      'departure_time': '2026-08-28T07:00:00+07:00',
      'seat_code': 'A01',
      'fare_vnd': 220000,
      'passenger_name': 'Nguyễn An',
      'pickup_stop': 'Bến xe Giáp Bát',
      'dropoff_stop': 'Bến xe Phía Bắc',
      'status': 'ACTIVE',
    });

    await tester.pumpWidget(
      MaterialApp(
        home: PassengerScope(
          store: store,
          child: PassengerLiveRadarScreen(ticket: ticket),
        ),
      ),
    );
    await tester.pumpAndSettle();

    // Instead of metrics, HUD text is shown
    expect(find.text('Xe đã qua Giáp Bát'), findsOneWidget);
    expect(find.text('Đến điểm đón'), findsNothing);
    expect(find.text('Cách điểm đón'), findsNothing);
  });

  testWidgets('notifications are asked once, with the reason, before the system dialog (D145)', (tester) async {
    SharedPreferences.setMockInitialValues({});
    final fake = FakePassengerPermissions(notifications: false);
    passengerPermissions = fake;
    await tester.pumpWidget(MaterialApp(home: Builder(builder: (context) => Scaffold(body: TextButton(onPressed: () => offerNotifications(context, reason: 'Để biết khi xe sắp tới.'), child: const Text('go'))))));
    await tester.tap(find.text('go'));
    await tester.pumpAndSettle();
    expect(find.text('Bật thông báo để không lỡ xe'), findsOneWidget);
    expect(find.text('Để biết khi xe sắp tới.'), findsOneWidget);
    expect(fake.asked, isEmpty, reason: 'the system dialog comes only after the passenger agrees');
    await tester.tap(find.text('Để sau'));
    await tester.pumpAndSettle();
    expect(fake.asked, isEmpty);
    await tester.tap(find.text('go'));
    await tester.pumpAndSettle();
    expect(find.text('Bật thông báo để không lỡ xe'), findsNothing, reason: 'asked once, not every time');
  });

  testWidgets('without a chosen company every launch shows the feature pages; with one it goes straight in (D146)', (tester) async {
    SharedPreferences.setMockInitialValues({});
    final store = PassengerStore(api: PassengerApiClientService(baseUrl: 'http://test', client: MockClient((_) async => http.Response('{}', 404))));
    Future<void> launch() async {
      await tester.pumpWidget(PassengerScope(store: store, child: MaterialApp(key: UniqueKey(), home: PassengerLaunchScreen(restore: () async {}))));
      await tester.pump(const Duration(seconds: 1));
      await tester.pumpAndSettle();
    }

    await launch();
    expect(find.text('Đặt vé trong một phút'), findsOneWidget);
    await tester.tap(find.text('Tiếp'));
    await tester.pumpAndSettle();
    expect(find.text('Đón tận nhà, biết lượt của mình'), findsOneWidget);
    await tester.tap(find.text('Bỏ qua'));
    await tester.pumpAndSettle();
    expect(find.text('Ứng dụng đặt vé của nhà xe'), findsOneWidget, reason: 'the welcome screen, to choose the company');

    await launch();
    expect(find.text('Đặt vé trong một phút'), findsOneWidget, reason: 'still no company: the pages again');

    store.operator = OperatorInfo.fromJson({'operator_id': 'op_saomai', 'code': 'SAOMAI', 'name': 'Nhà xe Sao Mai', 'hotline': '1900 6868'});
    await launch();
    expect(find.text('Đặt vé trong một phút'), findsNothing);
    expect(find.text('Nhà xe Sao Mai'), findsOneWidget);
  });

  testWidgets('launch with a saved valid session lands on the home shell, without one lands on the splash', (tester) async {
    final token = 'pax_jwt_${base64Url.encode(utf8.encode(jsonEncode({'sub': 'usr_1', 'kind': 'passenger', 'exp': DateTime.now().add(const Duration(hours: 1)).millisecondsSinceEpoch}))).replaceAll('=', '')}.sig';
    SharedPreferences.setMockInitialValues({
      'operator_code': 'SAOMAI',
      'passenger_session': jsonEncode({'token': token, 'operator_code': 'SAOMAI', 'phone': '0987654321', 'name': 'Pham Thu Ha'}),
    });
    final client = MockClient((req) async {
      if (req.url.path.endsWith('/app/config')) {
        return http.Response(
          jsonEncode({
            'status': 'success',
            'data': {
              'operator': {
                'operator_id': 'op_saomai',
                'code': 'SAOMAI',
                'name': 'Nhà xe Sao Mai',
                'short_name': 'Sao Mai',
                'hotline': '1900 6868',
                'primary_color': '#E11D48',
              }
            }
          }),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      }
      return http.Response(jsonEncode({'status': 'success', 'data': []}), 200, headers: {'content-type': 'application/json; charset=utf-8'});
    });

    final store = PassengerStore(api: PassengerApiClientService(baseUrl: 'http://test', client: client));
    await tester.pumpWidget(PassengerScope(
      store: store,
      child: MaterialApp(home: PassengerLaunchScreen(restore: store.restoreOperator)),
    ));
    await tester.pump(const Duration(seconds: 1));
    await tester.pumpAndSettle();

    expect(find.byType(PassengerMainShell), findsOneWidget);
    expect(find.byType(PassengerSplashScreen), findsNothing);

    await tester.pumpWidget(const SizedBox());

    // Without a saved session
    SharedPreferences.setMockInitialValues({
      'operator_code': 'SAOMAI',
    });
    final storeNoSession = PassengerStore(api: PassengerApiClientService(baseUrl: 'http://test', client: client));
    await tester.pumpWidget(PassengerScope(
      store: storeNoSession,
      child: MaterialApp(key: UniqueKey(), home: PassengerLaunchScreen(restore: storeNoSession.restoreOperator)),
    ));
    await tester.pump(const Duration(seconds: 1));
    await tester.pumpAndSettle();

    expect(find.byType(PassengerSplashScreen), findsOneWidget);
    expect(find.byType(PassengerMainShell), findsNothing);

    await tester.pumpWidget(const SizedBox());
  });
}
