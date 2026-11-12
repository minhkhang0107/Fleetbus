import 'dart:async';
import 'dart:convert';

import 'package:app/src/presentation/passenger/passenger_live_radar_screen.dart';
import 'package:flutter/material.dart';

import 'package:app/src/presentation/passenger/passenger_store.dart';
import 'package:data/src/service/passenger_api_service.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  test('hanging HTTP client times out and store surfaces network error', () async {
    final client = MockClient((_) => Completer<http.Response>().future);
    final api = PassengerApiClientService(
      baseUrl: 'http://test',
      client: client,
      timeout: const Duration(milliseconds: 50),
    );
    final store = PassengerStore(api: api);

    final otpError = await store.requestOtp('0987654321');
    expect(otpError, contains('Không kết nối được'));

    await store.loadTrips();
    expect(store.tripsError, isNotNull);
    expect(store.tripsError, contains('Không kết nối được'));
  });

  Ticket boardedTicket() => Ticket.fromJson({
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

  http.StreamedResponse jsonReply(Map<String, dynamic> data) => http.StreamedResponse(
        Stream.value(utf8.encode(jsonEncode({'status': 'success', 'data': data}))),
        200,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );

  testWidgets('a live stream that goes silent for 45 s is treated as dropped: the screen asks instead', (tester) async {
    final silent = StreamController<List<int>>();
    var asked = 0;
    final client = MockClient.streaming((req, _) async {
      if (req.url.path.endsWith('/tracking/stream')) {
        return http.StreamedResponse(silent.stream, 200, headers: {'content-type': 'text/event-stream'});
      }
      asked++;
      return jsonReply({'signal_status': 'LIVE', 'hud_status_text': 'Xe đang chạy'});
    });
    final store = PassengerStore(api: PassengerApiClientService(baseUrl: 'http://test', client: client));
    await tester.pumpWidget(MaterialApp(home: PassengerScope(store: store, child: PassengerLiveRadarScreen(ticket: boardedTicket()))));
    await tester.pump();
    expect(asked, 1);

    // The connection stays open but nothing arrives (a half-open socket after a cell change).
    await tester.pump(const Duration(seconds: 44));
    expect(asked, 1);
    await tester.pump(const Duration(seconds: 2));
    await tester.pump(const Duration(seconds: 10));
    expect(asked, 2);
    await tester.pumpWidget(const SizedBox());
    await silent.close();
  });

  testWidgets('when the phone loses the network the bus stays on screen, marked as the last known position', (tester) async {
    var offline = false;
    final client = MockClient.streaming((req, _) async {
      if (offline) throw http.ClientException('no network');
      if (req.url.path.endsWith('/tracking/stream')) throw http.ClientException('stream refused');
      return jsonReply({'signal_status': 'LIVE', 'hud_status_text': 'Xe đang dừng ở Bến xe Ninh Bình'});
    });
    final store = PassengerStore(api: PassengerApiClientService(baseUrl: 'http://test', client: client));
    await tester.pumpWidget(MaterialApp(home: PassengerScope(store: store, child: PassengerLiveRadarScreen(ticket: boardedTicket()))));
    await tester.pump();
    await tester.pump();
    expect(find.text('Trực tiếp'), findsOneWidget);

    offline = true;
    await tester.pump(const Duration(seconds: 10));
    await tester.pump();
    expect(find.text('Mất mạng'), findsOneWidget);
    expect(find.text('Chưa có tín hiệu'), findsNothing);
    expect(find.textContaining('Điện thoại của bạn đang mất mạng'), findsOneWidget);
    expect(find.textContaining('Xe đang dừng ở Bến xe Ninh Bình'), findsWidgets);

    offline = false;
    await tester.pump(const Duration(seconds: 10));
    await tester.pump();
    expect(find.text('Trực tiếp'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });
}
