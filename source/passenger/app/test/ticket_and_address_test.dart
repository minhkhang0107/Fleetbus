import 'dart:convert';

import 'package:app/src/presentation/passenger/passenger_home_address_screen.dart';
import 'package:app/src/presentation/passenger/passenger_home_screen.dart';
import 'package:app/src/presentation/passenger/passenger_permissions.dart';
import 'package:app/src/presentation/passenger/passenger_store.dart';
import 'package:data/src/service/passenger_api_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'fake_permissions.dart';

/// D187: the ticket says whether it is paid and how; "my location" fills a street address; the home screen shows
/// the passenger's own photo or initials.
void main() {
  test('the home card shows the booking that leaves first, with all its seats (D191)', () {
    Ticket t(String id, String pnr, String seat, String dep) => Ticket(id: id, pnr: pnr, tripId: 'trp_$pnr', route: 'Hà Nội — Thanh Hóa', date: 'T4 04/11', dep: dep.substring(11, 16), seat: seat, pickup: 'Giáp Bát', paid: 250000, name: 'An', status: TicketStatus.active, departureTime: dep);
    final next = nextBooking([
      t('t3', 'BG-2', 'B01', '2026-11-05T07:00:00+07:00'),
      t('t1', 'BG-1', 'A03', '2026-11-04T19:30:00+07:00'),
      t('t2', 'BG-1', 'A04', '2026-11-04T19:30:00+07:00'),
    ]);
    expect(next.map((x) => x.seat), ['A03', 'A04']);
  });

  final geocoded = <String>[];

  PassengerStore store({String? address}) {
    SharedPreferences.setMockInitialValues({});
    final client = MockClient((req) async {
      Object data = {};
      if (req.url.path.endsWith('/geocode/reverse')) {
        geocoded.add('${req.url.queryParameters['lat']},${req.url.queryParameters['lng']}');
        if (address == null) return http.Response(jsonEncode({'status': 'error', 'code': 'GEOCODE_UNAVAILABLE', 'message': 'x'}), 503, headers: {'content-type': 'application/json; charset=utf-8'});
        data = {'address': address};
      }
      return http.Response(jsonEncode({'status': 'success', 'data': data}), 200, headers: {'content-type': 'application/json; charset=utf-8'});
    });
    return PassengerStore(api: PassengerApiClientService(baseUrl: 'http://test', client: client));
  }

  Ticket ticket(Map<String, dynamic> extra) => Ticket.fromJson({
        'ticket_id': 't1',
        'pnr': 'BG-1',
        'trip_id': 'trp_1',
        'departure_time': '2026-10-31T08:00:00+07:00',
        'fare_vnd': 220000,
        'seat_code': 'A01',
        'status': 'ACTIVE',
        ...extra,
      });

  test('the ticket says paid or not, and how', () {
    expect(ticket({'payment_method': 'VIETQR_NAPAS247', 'payment_status': 'PAID'}).paymentLabel, 'Đã thanh toán · chuyển khoản VietQR');
    expect(ticket({'payment_method': 'CASH', 'payment_status': 'UNPAID_COD', 'cod_amount_vnd': 220000}).paymentLabel, 'Chưa thanh toán · trả 220.000 đ tiền mặt khi lên xe');
    expect(ticket({'payment_method': 'CASH', 'payment_status': 'PAID'}).paymentLabel, 'Đã thanh toán · tiền mặt');
    expect(ticket({'payment_method': 'SOMETHING_NEW', 'payment_status': 'PAID'}).paymentLabel, 'Đã thanh toán', reason: 'an unknown code is never shown raw');
  });

  testWidgets('"my location" fills the street address; text the passenger typed is never replaced', (tester) async {
    passengerPermissions = FakePassengerPermissions(position: (lat: 21.03419, lng: 105.79505));
    final s = store(address: '265 Đường Cầu Giấy, Dịch Vọng, Hà Nội');
    await tester.pumpWidget(MaterialApp(home: PassengerScope(store: s, child: const PassengerHomeAddressScreen(pickupSide: true))));
    await tester.pump();

    await tester.ensureVisible(find.text('Dùng vị trí của tôi'));
    await tester.tap(find.text('Dùng vị trí của tôi'));
    await tester.pumpAndSettle();
    expect(find.widgetWithText(TextField, '265 Đường Cầu Giấy, Dịch Vọng, Hà Nội'), findsOneWidget);
    expect(find.textContaining('Địa chỉ điền theo vị trí trên bản đồ'), findsOneWidget);
    expect(geocoded.last, '21.03419,105.79505');

    await tester.enterText(find.byType(TextField).first, 'Số 7, 265 Cầu Giấy');
    await tester.pump();
    expect(find.textContaining('Địa chỉ điền theo vị trí trên bản đồ'), findsNothing);
    final calls = geocoded.length;
    await tester.ensureVisible(find.text('Dùng vị trí của tôi'));
    await tester.tap(find.text('Dùng vị trí của tôi'));
    await tester.pumpAndSettle();
    expect(geocoded.length, calls, reason: 'typed text is kept, no lookup needed');
    expect(find.widgetWithText(TextField, 'Số 7, 265 Cầu Giấy'), findsOneWidget);
  });

  testWidgets('without an answer from the address service the field stays empty and the GPS label is used', (tester) async {
    passengerPermissions = FakePassengerPermissions(position: (lat: 21.03419, lng: 105.79505));
    final s = store();
    await tester.pumpWidget(MaterialApp(home: PassengerScope(store: s, child: const PassengerHomeAddressScreen(pickupSide: true))));
    await tester.pump();
    await tester.ensureVisible(find.text('Dùng vị trí của tôi'));
    await tester.tap(find.text('Dùng vị trí của tôi'));
    await tester.pumpAndSettle();
    expect(find.text('Địa chỉ (không bắt buộc, đã có vị trí của bạn)'), findsOneWidget);
    expect(tester.widget<TextField>(find.byType(TextField).first).controller!.text, isEmpty);
  });

  testWidgets('the home screen shows the passenger initials, not a fixed placeholder', (tester) async {
    final s = store();
    s.api.authToken = 'tok';
    s.userName = 'Trần Thị Bình';
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: PassengerScope(store: s, child: const PassengerHomeScreen()))));
    await tester.pump();
    expect(find.text('TB'), findsOneWidget);
    expect(find.text('NA'), findsNothing);
  });
}
