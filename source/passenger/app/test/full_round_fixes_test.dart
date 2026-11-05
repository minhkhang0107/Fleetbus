import 'dart:convert';

import 'package:app/src/presentation/passenger/passenger_cancel_refund_screen.dart';
import 'package:app/src/presentation/passenger/passenger_notifications_screen.dart';
import 'package:app/src/presentation/passenger/passenger_payment_processing_screen.dart';
import 'package:app/src/presentation/passenger/passenger_permissions.dart';
import 'package:app/src/presentation/passenger/passenger_profile_screen.dart';
import 'package:app/src/presentation/passenger/passenger_qr_saver.dart';
import 'package:app/src/presentation/passenger/passenger_store.dart';
import 'package:app/src/presentation/passenger/passenger_ticket_qr_screen.dart';
import 'package:app/src/presentation/passenger/passenger_wallet_screen.dart';
import 'package:app/src/presentation/passenger/passenger_widgets.dart';
import 'package:data/src/service/passenger_api_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'fake_permissions.dart';

class _FakeSaver implements QrImageSaver {
  bool saveCalled = false;
  String? savedQrData;
  int? savedAmount;
  String? savedMemo;

  @override
  Future<void> savePaymentQr({
    required BuildContext context,
    required String qrData,
    required int amount,
    required String memo,
  }) async {
    saveCalled = true;
    savedQrData = qrData;
    savedAmount = amount;
    savedMemo = memo;
  }
}

/// D189: what the real-scenario round of 02/11 changed in the passenger app (underpaid transfer, cancel from the
/// success screen, cancelled tickets in History, notices that open their ticket, logout confirmation, long sheets).
void main() {
  setUp(() {
    passengerPermissions = FakePassengerPermissions();
    SharedPreferences.setMockInitialValues({});
  });

  group('D189 full round', () {
    // 1. Underpaid notice + remaining amount on payment screen
    testWidgets('1. underpaid transfer shows amber notice, remaining amount on row and copy, and uses remaining for QR', (tester) async {
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1.0;

      final fakeSaver = _FakeSaver();
      final client = MockClient((req) async {
        if (req.url.path.contains('/verify-status')) {
          return http.Response(
            jsonEncode({
              'status': 'success',
              // As the server sends it: the check result, with the order under `data`.
              'data': {
                'payment_status': 'PENDING_PAYMENT',
                'is_settled': false,
                'data': {
                  'order_id': 'ord_123',
                  'pnr': 'BG-123456',
                  'payment_status': 'PENDING_PAYMENT',
                  'amount_vnd': 500000,
                  'paid_amount_vnd': 400000,
                  'remaining_vnd': 100000,
                  'payment_details': {'qr_payload': 'QR_FOR_100000'},
                },
              },
            }),
            200,
            headers: {'content-type': 'application/json; charset=utf-8'},
          );
        }
        return http.Response('{"status":"success","data":{}}', 200, headers: {'content-type': 'application/json; charset=utf-8'});
      });

      final store = PassengerStore(api: PassengerApiClientService(baseUrl: 'http://test', client: client));
      store.orderId = 'ord_123';
      store.orderPnr = 'BG-123456';
      store.orderAmount = 500000;
      store.bankName = 'VietinBank';
      store.accountNumber = '108821999';
      store.transferMemo = 'BUSGO BG123456';
      store.vietQrPayload = '00020101021238570010A0000007270127000697041501131088219990208QRIBFTTA530370454065000005802VN62180814BUSGO BG1234566304E85D';

      await tester.pumpWidget(PassengerScope(
        store: store,
        child: MaterialApp(
          home: PassengerPaymentProcessingScreen(
            name: 'Nguyễn Văn A',
            phone: '0912345678',
            qrSaver: fakeSaver,
          ),
        ),
      ));
      await tester.pump();

      // Trigger manual check
      final checkBtn = find.text('Tôi đã chuyển tiền, kiểm tra ngay');
      expect(checkBtn, findsOneWidget);
      await tester.tap(checkBtn);
      await tester.pumpAndSettle();

      // Store updated
      expect(store.orderPaidVnd, 400000);
      expect(store.orderRemainingVnd, 100000);

      // Amber notice text is displayed
      final noticeFinder = find.text('Đã nhận 400.000 đ. Còn thiếu 100.000 đ: chuyển thêm 100.000 đ với đúng nội dung bên dưới.');
      expect(noticeFinder, findsWidgets);

      // Does not say "Chưa nhận được tiền"
      expect(find.textContaining('Chưa nhận được tiền'), findsNothing);

      // Amount row uses 100.000 đ and not 500.000 đ
      expect(find.text('100.000 đ'), findsWidgets);

      // Test save QR saves with remaining amount (100.000 đ)
      await tester.ensureVisible(find.text('Lưu ảnh mã QR'));
      await tester.tap(find.text('Lưu ảnh mã QR'));
      await tester.pump();
      expect(fakeSaver.saveCalled, isTrue);
      expect(fakeSaver.savedAmount, 100000);
      // The QR is the server's, asking for the rest only.
      expect(fakeSaver.savedQrData, 'QR_FOR_100000');

      await tester.pumpWidget(const SizedBox());
    });

    // 2. lastTicket keeps departureTime and cancel sheet from success path shows "Được hoàn" and no bank fields when refund is 0
    testWidgets('2. lastTicket keeps departureTime; cancel sheet shows "Được hoàn" and no bank fields when refund is 0', (tester) async {
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1.0;

      final now = DateTime.now();
      final depTimeStr = now.add(const Duration(hours: 3)).toUtc().toIso8601String();
      final ticketMap = {
        'ticket_id': 'tkt_success_1',
        'pnr': 'BG-999999',
        'order_id': 'ord_success_1',
        'trip_id': 'trp_1',
        'route_name': 'Hà Nội - Ninh Bình',
        'departure_time': depTimeStr,
        'seat_code': 'A01',
        'fare_vnd': 300000,
        'status': 'ACTIVE',
        'payment_status': 'PAID',
        'payment_method': 'VIETQR_NAPAS247',
        'pickup_stop': 'Giáp Bát',
        'dropoff_stop': 'Ninh Bình',
      };

      final client = MockClient((req) async {
        if (req.url.path.contains('/verify-status')) {
          return http.Response(
            jsonEncode({
              'status': 'success',
              'data': {
                'order_id': 'ord_success_1',
                'pnr': 'BG-999999',
                'payment_status': 'PAID',
                'tickets': [ticketMap],
              },
            }),
            200,
            headers: {'content-type': 'application/json; charset=utf-8'},
          );
        }
        if (req.url.path.endsWith('/passenger/tickets')) {
          final tab = req.url.queryParameters['tab'];
          return http.Response(
            jsonEncode({
              'status': 'success',
              'data': tab == 'UPCOMING' ? [ticketMap] : [],
            }),
            200,
            headers: {'content-type': 'application/json; charset=utf-8'},
          );
        }
        if (req.url.path.endsWith('/notifications')) {
          return http.Response('{"status":"success","data":[]}', 200, headers: {'content-type': 'application/json; charset=utf-8'});
        }
        if (req.url.path.endsWith('/service-config')) {
          return http.Response(
            jsonEncode({
              'status': 'success',
              'data': {
                'cancellation_policy': {
                  'tiers': [
                    {'min_hours_before': 6, 'refund_percent': 100},
                    {'min_hours_before': 0, 'refund_percent': 0},
                  ],
                  'rules': ['Hủy trước 6 tiếng: 100%', 'Dưới 6 tiếng: không hoàn tiền'],
                },
              },
            }),
            200,
            headers: {'content-type': 'application/json; charset=utf-8'},
          );
        }
        return http.Response('{"status":"success","data":{}}', 200, headers: {'content-type': 'application/json; charset=utf-8'});
      });

      final store = PassengerStore(api: PassengerApiClientService(baseUrl: 'http://test', client: client));
      store.api.authToken = 'dummy_auth_token';
      store.userPhone = '0912345678';
      store.orderId = 'ord_success_1';
      store.orderPnr = 'BG-999999';
      store.orderAmount = 300000;

      final success = await store.checkPayment(manual: true);
      expect(success, isTrue);
      expect(store.lastTicket, isNotNull);
      expect(store.lastTicket!.departureTime, isNotNull);
      expect(store.lastTicket!.departureTime, depTimeStr);

      // Now open cancel confirmation sheet with store.lastTicket!
      await tester.pumpWidget(PassengerScope(
        store: store,
        child: MaterialApp(
          home: Scaffold(
            body: Builder(builder: (ctx) {
              return Center(
                child: ElevatedButton(
                  onPressed: () => confirmCancelTicket(ctx, store.lastTicket!),
                  child: const Text('Mở hủy vé'),
                ),
              );
            }),
          ),
        ),
      ));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Mở hủy vé'));
      await tester.pumpAndSettle();

      // Sheet is open: check "Được hoàn" is visible and refund amount is 0 đ
      expect(find.text('Được hoàn'), findsOneWidget);
      expect(find.text('0 đ'), findsOneWidget);

      // Bank account inputs are NOT present because refund is 0 đ
      expect(find.byKey(const Key('cancel_bank_picker')), findsNothing);
      expect(find.byKey(const Key('cancel_account_number')), findsNothing);
      expect(find.byKey(const Key('cancel_account_name')), findsNothing);

      // Sheet content is wrapped in SingleChildScrollView
      expect(find.byType(SingleChildScrollView), findsWidgets);

      await tester.pumpWidget(const SizedBox());
    });

    // 3. Cancelled ticket from tab=CANCELLED appears in History
    testWidgets('3. a cancelled ticket from tab=CANCELLED appears in History and persists offline', (tester) async {
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1.0;

      final cancelledTicketJson = {
        'ticket_id': 'tkt_cancelled_10',
        'pnr': 'BG-CAN001',
        'trip_id': 'trp_cancelled',
        'route_name': 'Hà Nội - Thanh Hóa',
        'departure_time': '2026-10-25T08:00:00+07:00',
        'fare_vnd': 220000,
        'seat_code': 'B02',
        'status': 'CANCELLED',
        'payment_status': 'PAID',
        'payment_method': 'VIETQR_NAPAS247',
        'pickup_stop': 'Giáp Bát',
        'dropoff_stop': 'Bến xe Phía Bắc',
        'refund': {
          'refund_id': 'ref_001',
          'status': 'REFUND_REQUESTED',
          'amount_vnd': 220000,
          'refund_account': null,
        },
      };

      bool networkFailed = false;
      final client = MockClient((req) async {
        if (networkFailed) {
          throw http.ClientException('Offline');
        }
        if (req.url.path.endsWith('/passenger/tickets')) {
          final tab = req.url.queryParameters['tab'];
          if (tab == 'CANCELLED') {
            return http.Response(jsonEncode({'status': 'success', 'data': [cancelledTicketJson]}), 200, headers: {'content-type': 'application/json; charset=utf-8'});
          }
          return http.Response(jsonEncode({'status': 'success', 'data': []}), 200, headers: {'content-type': 'application/json; charset=utf-8'});
        }
        return http.Response('{"status":"success","data":{}}', 200, headers: {'content-type': 'application/json; charset=utf-8'});
      });

      final store = PassengerStore(api: PassengerApiClientService(baseUrl: 'http://test', client: client));
      store.api.authToken = 'dummy_auth_token';
      store.userPhone = '0987654321';

      await store.loadTickets();

      // Ticket is loaded and marked past: true
      final cancelled = store.tickets.where((t) => t.id == 'tkt_cancelled_10').firstOrNull;
      expect(cancelled, isNotNull);
      expect(cancelled!.past, isTrue);
      expect(cancelled.status, TicketStatus.cancelled);

      // Pump wallet screen
      await tester.pumpWidget(PassengerScope(
        store: store,
        child: const MaterialApp(
          home: Scaffold(
            body: PassengerWalletScreen(),
          ),
        ),
      ));
      await tester.pumpAndSettle();

      // Switch to History tab ("Lịch sử")
      await tester.tap(find.text('Lịch sử'));
      await tester.pumpAndSettle();

      // Cancelled ticket card shows in History with "Đã hủy" status pill
      expect(find.text('BG-CAN001'), findsOneWidget);
      expect(find.text('Đã hủy'), findsWidgets);
      // No refund account yet: the card asks for one
      expect(find.text('Thêm tài khoản nhận hoàn'), findsOneWidget);

      // Offline check: network fails on subsequent call, tickets are preserved from cache
      networkFailed = true;
      await store.loadTickets();
      expect(store.tickets.where((t) => t.id == 'tkt_cancelled_10'), isNotEmpty);

      await tester.pumpWidget(const SizedBox());
    });

    // 4. Tapping TRIP_CANCELLED notice opens the ticket
    testWidgets('4. tapping a TRIP_CANCELLED notice opens the ticket', (tester) async {
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1.0;

      final client = MockClient((req) async {
        if (req.url.path.endsWith('/notifications')) {
          return http.Response(
            jsonEncode({
              'status': 'success',
              'data': [
                {
                  'id': 'notif_1',
                  'title': 'Nhà xe hủy chuyến',
                  'body': 'Chuyến xe của bạn đã bị hủy do thời tiết.',
                  'type': 'TRIP_CANCELLED',
                  'created_at': DateTime.now().toIso8601String(),
                  'payload': {
                    'trip_id': 'trp_notif_1',
                    'ticket_id': 'tkt_notif_cancel_1',
                    'pnr': 'BG-NOTIF01',
                  },
                },
              ],
            }),
            200,
            headers: {'content-type': 'application/json; charset=utf-8'},
          );
        }
        if (req.url.path.endsWith('/passenger/tickets')) {
          // The company cancelled the trip after the wallet was loaded: the ticket comes only from the CANCELLED tab.
          final cancelled = req.url.queryParameters['tab'] == 'CANCELLED';
          return http.Response(
            jsonEncode({
              'status': 'success',
              'data': [
                if (cancelled)
                  {
                    'ticket_id': 'tkt_notif_cancel_1',
                    'pnr': 'BG-NOTIF01',
                    'trip_id': 'trp_notif_1',
                    'route_name': 'Hà Nội - Nam Định',
                    'departure_time': DateTime.now().add(const Duration(days: 1)).toUtc().toIso8601String(),
                    'seat_code': 'A05',
                    'fare_vnd': 200000,
                    'status': 'CANCELLED',
                    'payment_method': 'VIETQR_NAPAS247',
                    'pickup_stop': 'Giáp Bát',
                  },
              ],
            }),
            200,
            headers: {'content-type': 'application/json; charset=utf-8'},
          );
        }
        return http.Response('{"status":"success","data":{}}', 200, headers: {'content-type': 'application/json; charset=utf-8'});
      });

      final store = PassengerStore(api: PassengerApiClientService(baseUrl: 'http://test', client: client));
      store.api.authToken = 'dummy_auth_token';
      store.userPhone = '0987654321';
      store.tickets = [];

      await store.loadNotices();
      expect(store.notices.length, 1);
      expect(store.notices.first.ticketId, 'tkt_notif_cancel_1');

      await tester.pumpWidget(PassengerScope(
        store: store,
        child: const MaterialApp(
          home: Scaffold(
            body: PassengerNotificationsScreen(),
          ),
        ),
      ));
      await tester.pumpAndSettle();

      // Tap notification
      await tester.tap(find.text('Nhà xe hủy chuyến'));
      await tester.pumpAndSettle();

      // Verify PassengerTicketQrScreen opened with the cancelled ticket
      expect(find.byType(PassengerTicketQrScreen), findsOneWidget);
      expect(find.text('BG-NOTIF01'), findsOneWidget);
      expect(find.text('Đã hủy'), findsWidgets);

      await tester.pumpWidget(const SizedBox());
    });

    // 5. Logout asks first
    testWidgets('5. logout asks first with confirmation sheet', (tester) async {
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1.0;

      final client = MockClient((req) async => http.Response('{"status":"success","data":{}}', 200));
      final store = PassengerStore(api: PassengerApiClientService(baseUrl: 'http://test', client: client));
      store.api.authToken = 'dummy_auth_token';
      store.userPhone = '0987654321';
      store.userName = 'Người dùng test';

      await tester.pumpWidget(PassengerScope(
        store: store,
        child: const MaterialApp(
          home: Scaffold(
            body: PassengerProfileScreen(),
          ),
        ),
      ));
      await tester.pumpAndSettle();

      expect(store.loggedIn, isTrue);

      // Tap "Đăng xuất" tile
      final logoutTile = find.text('Đăng xuất');
      expect(logoutTile, findsOneWidget);
      await tester.tap(logoutTile);
      await tester.pumpAndSettle();

      // Confirmation sheet is shown
      expect(find.text('Đăng xuất?'), findsOneWidget);
      expect(
        find.text('Vé đã mua vẫn còn. Đăng nhập lại bằng số điện thoại này để xem.'),
        findsOneWidget,
      );
      expect(find.widgetWithText(PrimaryButton, 'Đăng xuất'), findsOneWidget);
      expect(find.widgetWithText(GhostButton, 'Ở lại'), findsOneWidget);

      // Tap "Ở lại": remains logged in
      await tester.tap(find.widgetWithText(GhostButton, 'Ở lại'));
      await tester.pumpAndSettle();
      expect(store.loggedIn, isTrue);

      // Tap "Đăng xuất" again, then confirm logout
      await tester.tap(find.text('Đăng xuất'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(PrimaryButton, 'Đăng xuất'));
      await tester.pumpAndSettle();

      // User is logged out
      expect(store.loggedIn, isFalse);

      await tester.pumpWidget(const SizedBox());
    });
    // 6. A long sheet scrolls on a small phone instead of overflowing (the cancel sheet with bank fields did)
    testWidgets('6. a long sheet scrolls on a small phone', (tester) async {
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });
      tester.view.physicalSize = const Size(360, 640);
      tester.view.devicePixelRatio = 1.0;
      await tester.pumpWidget(MaterialApp(
        home: Builder(builder: (context) => TextButton(
              onPressed: () => showAppSheet<void>(context, builder: (_) => Column(children: [for (var i = 0; i < 30; i++) SizedBox(height: 40, child: Text('Dòng $i'))])),
              child: const Text('Mở'),
            )),
      ));
      await tester.tap(find.text('Mở'));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      await tester.scrollUntilVisible(find.text('Dòng 29'), 200, scrollable: find.byType(Scrollable).last);
      expect(find.text('Dòng 29'), findsOneWidget);
    });
  });
}
