import 'dart:convert';

import 'package:app/src/presentation/passenger/passenger_heads_up.dart';
import 'package:app/src/presentation/passenger/passenger_home_screen.dart';
import 'package:app/src/presentation/passenger/passenger_live_radar_screen.dart';
import 'package:app/src/presentation/passenger/passenger_main_shell.dart';
import 'package:app/src/presentation/passenger/passenger_permissions.dart';
import 'package:app/src/presentation/passenger/passenger_store.dart';
import 'package:app/src/presentation/passenger/passenger_ticket_qr_screen.dart';
import 'package:data/src/service/passenger_api_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'fake_permissions.dart';

void main() {
  setUp(() {
    passengerPermissions = FakePassengerPermissions();
    SharedPreferences.setMockInitialValues({});
  });

  Future<PassengerStore> createTestStore({List<Map<String, dynamic>> tickets = const []}) async {
    final client = MockClient((req) async {
      final path = req.url.path;
      if (path.endsWith('/passenger/tickets')) {
        return http.Response(
          jsonEncode({'status': 'success', 'data': tickets}),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      }
      if (path.endsWith('/app/config')) {
        return http.Response(
          jsonEncode({
            'status': 'success',
            'data': {
              'operator': {
                'operator_id': 'op1',
                'code': 'SAOMAI',
                'name': 'Nhà xe Sao Mai',
                'short_name': 'Sao Mai',
              },
            },
          }),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      }
      if (path.endsWith('/passenger/tracking')) {
        return http.Response(
          jsonEncode({
            'status': 'success',
            'data': {
              'trip_id': 'trp_01',
              'plate_number': '29B-12345',
              'status': 'RUNNING',
              'trip_status': 'RUNNING',
              'lat': 21.0,
              'lng': 105.8,
              'pickup_ready': {'status': 'READY', 'minutes': 5},
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

    final store = PassengerStore(api: PassengerApiClientService(baseUrl: 'http://test', client: client));
    store.api.authToken = 'tok_test';
    store.userPhone = '0987654321';
    store.operator = OperatorInfo.fromJson({
      'operator_id': 'op1',
      'code': 'SAOMAI',
      'name': 'Nhà xe Sao Mai',
      'short_name': 'Sao Mai',
      'hotline': '1900 6868',
      'primary_color': '#2563EB',
    });
    if (tickets.isNotEmpty) {
      await store.loadTickets();
    }
    return store;
  }

  testWidgets('the heads-up appears over the shell without moving the page', (tester) async {
    final store = await createTestStore();
    await tester.pumpWidget(PassengerScope(
      store: store,
      child: const MaterialApp(
        home: PassengerMainShell(),
      ),
    ));
    await tester.pumpAndSettle();

    final beforeTopLeft = tester.getTopLeft(find.byType(PassengerHomeScreen));

    store.pendingAlert = AppNotice(
      'Thông báo kiểm tra',
      'Nội dung thông báo kiểm tra vị trí',
      'vừa xong',
      id: 'n_pos_1',
      type: 'GENERAL',
    );
    store.notifyListeners();
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));

    expect(find.byKey(const Key('heads_up')), findsOneWidget);
    final afterTopLeft = tester.getTopLeft(find.byType(PassengerHomeScreen));
    expect(afterTopLeft, equals(beforeTopLeft));
    // Text in the overlay has a Material above it, so it is not drawn with the debug underline.
    expect(find.ancestor(of: find.text('Thông báo kiểm tra'), matching: find.byType(Material)), findsWidgets);

    await tester.pumpWidget(const SizedBox());
    await tester.pumpAndSettle();
  });

  testWidgets('it goes away by itself after the duration', (tester) async {
    final store = await createTestStore();
    await tester.pumpWidget(PassengerScope(
      store: store,
      child: const MaterialApp(
        home: PassengerMainShell(),
      ),
    ));
    await tester.pumpAndSettle();

    store.pendingAlert = AppNotice(
      'Thông báo tự biến mất',
      'Nội dung thông báo tự đóng',
      'vừa xong',
      id: 'n_auto_1',
      type: 'GENERAL',
    );
    store.notifyListeners();
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));

    expect(find.byKey(const Key('heads_up')), findsOneWidget);

    // Default duration for non-alert types is 5 seconds
    await tester.pump(const Duration(seconds: 5));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('heads_up')), findsNothing);

    await tester.pumpWidget(const SizedBox());
    await tester.pumpAndSettle();
  });

  testWidgets('tapping a PAYMENT_SUCCESS notice with a ticket_id opens the ticket screen (PassengerTicketQrScreen)', (tester) async {
    final ticketJson = {
      'ticket_id': 'tkt_pay_1',
      'pnr': 'BG-0001',
      'trip_id': 'trp_01',
      'route_name': 'Hà Nội — Thanh Hóa',
      'departure_time': '2026-08-28T07:00:00+07:00',
      'seat_code': 'A01',
      'fare_vnd': 220000,
      'passenger_name': 'Khách A',
      'pickup_stop': 'Bến xe Mỹ Đình',
      'dropoff_stop': 'Bến xe Phía Bắc',
      'status': 'ACTIVE',
    };
    final store = await createTestStore(tickets: [ticketJson]);
    await tester.pumpWidget(PassengerScope(
      store: store,
      child: const MaterialApp(
        home: PassengerMainShell(),
      ),
    ));
    await tester.pumpAndSettle();

    store.pendingAlert = AppNotice(
      'Thanh toán thành công',
      'Vé của bạn đã thanh toán xong',
      'vừa xong',
      id: 'n_pay_1',
      ticketId: 'tkt_pay_1',
      type: 'PAYMENT_SUCCESS',
    );
    store.notifyListeners();
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));

    expect(find.byKey(const Key('heads_up')), findsOneWidget);

    await tester.tap(find.byKey(const Key('heads_up')));
    await tester.pumpAndSettle();

    expect(find.byType(PassengerTicketQrScreen), findsOneWidget);

    await tester.pumpWidget(const SizedBox());
    await tester.pumpAndSettle();
  });

  testWidgets('tapping a PICKUP_APPROACHING notice for an active ticket opens PassengerLiveRadarScreen', (tester) async {
    final ticketJson = {
      'ticket_id': 'tkt_bus_1',
      'pnr': 'BG-0002',
      'trip_id': 'trp_01',
      'route_name': 'Hà Nội — Thanh Hóa',
      'departure_time': '2026-08-28T07:00:00+07:00',
      'seat_code': 'A02',
      'fare_vnd': 220000,
      'passenger_name': 'Khách B',
      'pickup_stop': 'Bến xe Mỹ Đình',
      'dropoff_stop': 'Bến xe Phía Bắc',
      'status': 'ACTIVE',
    };
    final store = await createTestStore(tickets: [ticketJson]);
    await tester.pumpWidget(PassengerScope(
      store: store,
      child: const MaterialApp(
        home: PassengerMainShell(),
      ),
    ));
    await tester.pumpAndSettle();

    store.pendingAlert = AppNotice(
      'Xe sắp tới đón bạn',
      'Mời bạn ra điểm đón',
      'vừa xong',
      id: 'n_bus_1',
      ticketId: 'tkt_bus_1',
      type: 'PICKUP_APPROACHING',
    );
    store.notifyListeners();
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));

    expect(find.byKey(const Key('heads_up')), findsOneWidget);

    await tester.tap(find.byKey(const Key('heads_up')));
    await tester.pumpAndSettle();

    expect(find.byType(PassengerLiveRadarScreen), findsOneWidget);

    await tester.pumpWidget(const SizedBox());
    await tester.pumpAndSettle();
  });

  testWidgets('swiping up dismisses the heads-up', (tester) async {
    final store = await createTestStore();
    await tester.pumpWidget(PassengerScope(
      store: store,
      child: const MaterialApp(
        home: PassengerMainShell(),
      ),
    ));
    await tester.pumpAndSettle();

    store.pendingAlert = AppNotice(
      'Thông báo vuốt',
      'Vuốt lên để đóng',
      'vừa xong',
      id: 'n_swipe_1',
      type: 'GENERAL',
    );
    store.notifyListeners();
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));

    expect(find.byKey(const Key('heads_up')), findsOneWidget);

    await tester.drag(find.byKey(const Key('heads_up')), const Offset(0, -100));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('heads_up')), findsNothing);

    await tester.pumpWidget(const SizedBox());
    await tester.pumpAndSettle();
  });

  testWidgets('TC-HEADSUP-SLIDE: the card comes out from under the status bar, never behind the clock', (tester) async {
    late BuildContext ctx;
    await tester.pumpWidget(MaterialApp(
      builder: (c, child) => MediaQuery(data: MediaQuery.of(c).copyWith(padding: const EdgeInsets.only(top: 44)), child: child!),
      home: Builder(builder: (c) {
        ctx = c;
        return const Scaffold(body: SizedBox());
      }),
    ));
    showHeadsUp(ctx, notice: AppNotice('Giờ hẹn đón đã đổi', 'Bạn là điểm đón thứ 4, giờ hẹn mới khoảng 19:25.', 'now', type: 'HOME_APPOINTMENT_CHANGED'), onTap: () {});
    await tester.pump();
    expect(tester.getRect(find.byKey(const Key('heads_up'))).bottom, lessThanOrEqualTo(44), reason: 'wholly above the status bar edge at the start');
    final clip = tester.getRect(find.ancestor(of: find.byKey(const Key('heads_up')), matching: find.byType(ClipRect)).first);
    expect(clip.top, 44, reason: 'nothing of the card is drawn under the status bar');
    await tester.pumpAndSettle(const Duration(milliseconds: 50));
    expect(tester.getRect(find.byKey(const Key('heads_up'))).top, 52, reason: 'under the status bar once in');
    hideHeadsUp();
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 1));
    expect(tester.getRect(find.byKey(const Key('heads_up'))).bottom, greaterThan(44));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('heads_up')), findsNothing);
  });

  testWidgets('TC-HEADSUP-NOTICES-TAB: on the notices tab a new notice shows in the list only, and is read', (tester) async {
    final store = await createTestStore();
    await tester.pumpWidget(PassengerScope(store: store, child: const MaterialApp(home: PassengerMainShell(initialTab: 2))));
    await tester.pumpAndSettle();
    store.unread = true;
    store.pendingAlert = AppNotice('Giờ hẹn đón đã đổi', 'Bạn là điểm đón thứ 3.', 'Vừa xong', id: 'n_tab_1', type: 'HOME_APPOINTMENT_CHANGED', isRead: false);
    store.notifyListeners();
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.byKey(const Key('heads_up')), findsNothing, reason: 'no card over the title and the same notice');
    expect(store.pendingAlert, isNull);
    expect(store.unread, isFalse, reason: 'no red dot on the tab being looked at');
    await tester.pumpWidget(const SizedBox());
    await tester.pumpAndSettle();
  });
}
