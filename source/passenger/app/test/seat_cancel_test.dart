import 'dart:convert';

import 'package:app/src/presentation/passenger/passenger_cancel_refund_screen.dart';
import 'package:app/src/presentation/passenger/passenger_permissions.dart';
import 'package:app/src/presentation/passenger/passenger_store.dart';
import 'package:data/src/service/passenger_api_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'fake_permissions.dart';

/// D190: one passenger of a two-seat order cannot go; the success screen cancels only the seat they pick.
void main() {
  setUp(() {
    passengerPermissions = FakePassengerPermissions();
    SharedPreferences.setMockInitialValues({});
  });

  testWidgets('a multi-seat order cancels only the chosen seat and refunds its fare', (tester) async {
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1.0;

    final dep = DateTime.now().add(const Duration(hours: 24)).toUtc().toIso8601String();
    Map<String, dynamic> ticket(String id, String seat) => {
          'ticket_id': id,
          'pnr': 'BG-777777',
          'order_id': 'ord_2',
          'trip_id': 'trp_1',
          'route_name': 'Hà Nội - Thanh Hóa',
          'departure_time': dep,
          'seat_code': seat,
          'fare_vnd': 250000,
          'status': 'ACTIVE',
          'payment_status': 'PAID',
          'payment_method': 'VIETQR_NAPAS247',
        };
    final cancelled = <String>[];
    const json = {'content-type': 'application/json; charset=utf-8'};
    final client = MockClient((req) async {
      final path = req.url.path;
      if (path.contains('/verify-status')) {
        return http.Response(jsonEncode({'status': 'success', 'data': {'payment_status': 'PAID', 'data': {'order_id': 'ord_2', 'pnr': 'BG-777777', 'payment_status': 'PAID'}}}), 200, headers: json);
      }
      if (path.endsWith('/passenger/tickets')) {
        final upcoming = [ticket('tkt_a', 'A01'), ticket('tkt_b', 'A02')].where((t) => !cancelled.contains(t['ticket_id'])).toList();
        return http.Response(jsonEncode({'status': 'success', 'data': req.url.queryParameters['tab'] == 'UPCOMING' ? upcoming : []}), 200, headers: json);
      }
      if (path.endsWith('/cancel')) {
        cancelled.add(path.split('/')[5]);
        return http.Response(jsonEncode({'status': 'success', 'data': {'refund_amount_vnd': 250000}}), 200, headers: json);
      }
      if (path.endsWith('/service-config')) {
        return http.Response(
          jsonEncode({
            'status': 'success',
            'data': {
              'cancellation_policy': {
                'tiers': [
                  {'min_hours_before': 6, 'refund_percent': 100},
                  {'min_hours_before': 0, 'refund_percent': 0},
                ],
                'rules': ['Hủy trước 6 tiếng: 100%'],
              },
            },
          }),
          200,
          headers: json,
        );
      }
      return http.Response('{"status":"success","data":[]}', 200, headers: json);
    });

    final store = PassengerStore(api: PassengerApiClientService(baseUrl: 'http://test', client: client));
    store.api.authToken = 'token';
    store.userPhone = '0912345678';
    store.orderId = 'ord_2';
    store.orderPnr = 'BG-777777';
    store.orderAmount = 500000;
    expect(await store.checkPayment(manual: true), isTrue);
    expect(store.lastTicket!.ticketIds, ['tkt_a', 'tkt_b']);

    await tester.pumpWidget(PassengerScope(
      store: store,
      child: MaterialApp(
        home: Scaffold(
          body: Builder(builder: (ctx) => Center(child: ElevatedButton(onPressed: () => confirmCancelTicket(ctx, store.lastTicket!), child: const Text('Mở hủy vé')))),
        ),
      ),
    ));
    await tester.tap(find.text('Mở hủy vé'));
    await tester.pumpAndSettle();

    // Both seats start chosen; dropping A02 halves what is refunded.
    expect(find.text('Chọn ghế muốn hủy'), findsOneWidget);
    expect(find.text('500.000 đ'), findsWidgets);
    await tester.tap(find.byKey(const Key('cancel_seat_A02')));
    await tester.pumpAndSettle();
    expect(find.text('Ghế A01 được nhả ngay cho người khác và không lấy lại được.'), findsOneWidget);
    expect(find.text('Hủy vé, hoàn 250.000 đ'), findsOneWidget);

    await tester.enterText(find.byKey(const Key('cancel_account_number')), '108821999');
    await tester.enterText(find.byKey(const Key('cancel_account_name')), 'NGUYEN VAN A');
    await tester.ensureVisible(find.byKey(const Key('cancel_policy_agree')));
    await tester.tap(find.byKey(const Key('cancel_policy_agree')));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Hủy vé, hoàn 250.000 đ'));
    await tester.tap(find.text('Hủy vé, hoàn 250.000 đ'));
    await tester.pumpAndSettle();

    expect(cancelled, ['tkt_a']);
    expect(store.tickets.map((t) => t.seat), ['A02']);
  });
}
