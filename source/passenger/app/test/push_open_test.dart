import 'dart:convert';

import 'package:app/src/presentation/passenger/passenger_main_shell.dart';
import 'package:app/src/presentation/passenger/passenger_permissions.dart';
import 'package:app/src/presentation/passenger/passenger_push.dart';
import 'package:app/src/presentation/passenger/passenger_store.dart';
import 'package:app/src/presentation/passenger/passenger_ticket_qr_screen.dart';
import 'package:data/src/service/passenger_api_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'fake_permissions.dart';

/// D192: a tapped push opens what it is about; it is not shown again on top of the app; signing out stops pushes.
void main() {
  setUp(() {
    passengerPermissions = FakePassengerPermissions();
    SharedPreferences.setMockInitialValues({});
  });

  const json = {'content-type': 'application/json; charset=utf-8'};
  final ticket = {
    'ticket_id': 'tkt_push_1',
    'pnr': 'BG-0101',
    'trip_id': 'trp_01',
    'route_name': 'Hà Nội — Thanh Hóa',
    'departure_time': '2026-08-28T07:00:00+07:00',
    'seat_code': 'A01',
    'fare_vnd': 220000,
    'passenger_name': 'Khách A',
    'pickup_stop': 'Bến xe Giáp Bát',
    'status': 'ACTIVE',
  };

  PassengerStore storeWith({List<Map<String, dynamic>> Function()? notices, List<http.Request>? sent}) {
    final client = MockClient((req) async {
      sent?.add(req);
      final path = req.url.path;
      if (path.endsWith('/passenger/tickets')) {
        return http.Response(jsonEncode({'status': 'success', 'data': req.url.queryParameters['tab'] == 'UPCOMING' ? [ticket] : []}), 200, headers: json);
      }
      if (path.endsWith('/passenger/notifications')) {
        return http.Response(jsonEncode({'status': 'success', 'data': notices?.call() ?? []}), 200, headers: json);
      }
      return http.Response('{"status":"success","data":{}}', 200, headers: json);
    });
    final store = PassengerStore(api: PassengerApiClientService(baseUrl: 'http://test', client: client));
    store.api.authToken = 'tok';
    store.userPhone = '0987654321';
    return store;
  }

  test('push data becomes the notice it stands for; empty values are none', () {
    final n = noticeOfPushData({'type': 'TRIP_DELAY', 'notice_id': 'notif_9', 'ticket_id': 'tkt_1', 'pnr': '', 'trip_id': 'trp_1'}, title: 'Chuyến trễ', body: 'Trễ 20 phút');
    expect([n.title, n.body, n.type, n.id, n.ticketId, n.pnr, n.tripId], ['Chuyến trễ', 'Trễ 20 phút', 'TRIP_DELAY', 'notif_9', 'tkt_1', null, 'trp_1']);
  });

  testWidgets('a push tapped before the app was open opens its ticket once the tabs are up', (tester) async {
    final store = storeWith();
    store.openFromPush(noticeOfPushData({'type': 'PAYMENT_SUCCESS', 'notice_id': 'notif_1', 'ticket_id': 'tkt_push_1'}, title: 'Thanh toán thành công'));
    await tester.pumpWidget(PassengerScope(store: store, child: const MaterialApp(home: PassengerMainShell())));
    await tester.pumpAndSettle();
    expect(find.byType(PassengerTicketQrScreen), findsOneWidget);
    expect(store.pushToOpen, isNull);
    await tester.pumpWidget(const SizedBox());
    await tester.pumpAndSettle();
  });

  test('a tapped push is not shown again as a heads-up when the notices load', () async {
    var list = <Map<String, dynamic>>[];
    final store = storeWith(notices: () => list);
    await store.loadNotices();
    store.openFromPush(noticeOfPushData({'type': 'TRIP_DELAY', 'notice_id': 'notif_2'}));
    list = [
      {'id': 'notif_2', 'title': 'Chuyến trễ', 'body': 'x', 'type': 'TRIP_DELAY', 'is_read': false, 'created_at': '2026-11-04T10:00:00Z', 'payload': {}},
    ];
    await store.loadNotices();
    expect(store.pendingAlert, isNull);
  });

  test('signing out tells the server this phone no longer takes the account\'s pushes', () async {
    final sent = <http.Request>[];
    final store = storeWith(sent: sent);
    await store.setPushToken('fcm-token-1');
    expect(jsonDecode(sent.last.body), {'platform': 'android', 'token': 'fcm-token-1'});
    await store.logout();
    await Future<void>.delayed(Duration.zero);
    final last = sent.where((r) => r.url.path.endsWith('/passenger/devices')).last;
    expect(jsonDecode(last.body), {'platform': 'android'});
    expect(last.headers['Authorization'], 'Bearer tok');
  });
}
