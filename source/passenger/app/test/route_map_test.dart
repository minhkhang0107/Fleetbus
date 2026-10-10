import 'dart:convert';

import 'package:app/src/presentation/passenger/passenger_live_radar_screen.dart';
import 'package:app/src/presentation/passenger/passenger_route_map.dart';
import 'package:app/src/presentation/passenger/passenger_store.dart';
import 'package:data/src/service/passenger_api_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:latlong2/latlong.dart';

void main() {
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
    expect(find.text('Điểm đón'), findsOneWidget);
    expect(find.text('Giáp Bát'), findsOneWidget);

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

    expect(find.text('Điểm trả'), findsOneWidget);
    expect(find.text('Ninh Bình'), findsOneWidget);
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
}
