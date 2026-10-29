import 'dart:convert';

import 'package:app/src/presentation/passenger/passenger_cancel_refund_screen.dart';
import 'package:app/src/presentation/passenger/passenger_checkout_screen.dart';
import 'package:app/src/presentation/passenger/passenger_login_screen.dart';
import 'package:app/src/presentation/passenger/passenger_permissions.dart';
import 'package:app/src/presentation/passenger/passenger_profile_screen.dart';
import 'package:app/src/presentation/passenger/passenger_store.dart';
import 'package:app/src/presentation/passenger/passenger_ticket_qr_screen.dart';
import 'package:app/src/presentation/passenger/passenger_widgets.dart';
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

  const sampleStops = [
    {'stop_id': 'stp_hn_md', 'name': 'Bến xe Mỹ Đình', 'city': 'Hà Nội', 'order': 1, 'pickup_allowed': true, 'dropoff_allowed': false},
    {'stop_id': 'stp_nb', 'name': 'Bến xe Ninh Bình', 'city': 'Ninh Bình', 'order': 2, 'pickup_allowed': false, 'dropoff_allowed': true},
  ];

  final sampleTripJson = {
    'trip_id': 'trp_1',
    'vehicle_title': 'VIP Limousine',
    'vehicle_type': 'VIP',
    'plate_number': '29B-123.45',
    'departure_time': '2026-08-28T08:00:00+07:00',
    'arrival_time': '2026-08-28T09:30:00+07:00',
    'duration_minutes': 90,
    'base_fare_vnd': 250000,
    'available_seats_count': 10,
    'stops': sampleStops,
    'service': {'stop_style': 'ROUTE_LINE', 'pickup_modes': ['FIXED_STOP'], 'dropoff_modes': ['FIXED_LOCATION']},
  };

  group('Step 6b: Insurance and Wallet config flags', () {
    testWidgets('insurance is hidden when flag is false, and insuranceSelected is never sent true', (tester) async {
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
        tester.platformDispatcher.clearTextScaleFactorTestValue();
      });
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1.0;
      tester.platformDispatcher.textScaleFactorTestValue = 0.6;

      Map<String, dynamic>? bookingBody;
      final client = MockClient((req) async {
        if (req.url.path.endsWith('/bookings/create')) {
          bookingBody = jsonDecode(req.body) as Map<String, dynamic>;
          return http.Response(
            jsonEncode({
              'status': 'success',
              'data': {
                'order_id': 'ord_test_1',
                'pnr': 'BG-111222',
                'payment': {
                  'order_id': 'ord_test_1',
                  'payment_status': 'PENDING_PAYMENT',
                  'amount_vnd': 250000,
                  'payment_details': null,
                },
              },
            }),
            200,
            headers: {'content-type': 'application/json; charset=utf-8'},
          );
        }
        return http.Response('{"status":"success","data":{}}', 200, headers: {'content-type': 'application/json; charset=utf-8'});
      });

      final store = PassengerStore(api: PassengerApiClientService(client: client));
      store.operator = const OperatorInfo(
        code: 'SAOMAI',
        name: 'Nhà xe Sao Mai',
        shortName: 'Sao Mai',
        hotline: '1900 6868',
        primaryColor: '#E11D48',
        insuranceEnabled: false,
        walletEnabled: false,
      );
      store.chooseTrip(Trip.fromJson(sampleTripJson));
      store.seats.add('A01');
      store.holdId = 'hold_1';

      await tester.pumpWidget(PassengerScope(
        store: store,
        child: const MaterialApp(home: PassengerCheckoutScreen()),
      ));
      await tester.pumpAndSettle();

      // SwitchListTile for insurance must NOT be rendered
      expect(find.text('Bảo hiểm chuyến đi'), findsNothing);
      expect(find.byType(SwitchListTile), findsNothing);

      // Submit order
      await store.createOrder('Trần Bình', '0912345678');
      expect(bookingBody, isNotNull);
      expect(bookingBody!['insuranceSelected'], isFalse);

      store.stopHold();
      await tester.pumpWidget(const SizedBox());
    });

    testWidgets('insurance works when flag is true', (tester) async {
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
        tester.platformDispatcher.clearTextScaleFactorTestValue();
      });
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1.0;
      tester.platformDispatcher.textScaleFactorTestValue = 0.6;

      Map<String, dynamic>? bookingBody;
      final client = MockClient((req) async {
        if (req.url.path.endsWith('/bookings/create')) {
          bookingBody = jsonDecode(req.body) as Map<String, dynamic>;
          return http.Response(
            jsonEncode({
              'status': 'success',
              'data': {
                'order_id': 'ord_test_2',
                'pnr': 'BG-333444',
                'payment': {
                  'order_id': 'ord_test_2',
                  'payment_status': 'PENDING_PAYMENT',
                  'amount_vnd': 260000,
                  'payment_details': null,
                },
              },
            }),
            200,
            headers: {'content-type': 'application/json; charset=utf-8'},
          );
        }
        return http.Response('{"status":"success","data":{}}', 200, headers: {'content-type': 'application/json; charset=utf-8'});
      });

      final store = PassengerStore(api: PassengerApiClientService(client: client));
      store.operator = const OperatorInfo(
        code: 'SAOMAI',
        name: 'Nhà xe Sao Mai',
        shortName: 'Sao Mai',
        hotline: '1900 6868',
        primaryColor: '#E11D48',
        insuranceEnabled: true,
        walletEnabled: false,
      );
      store.chooseTrip(Trip.fromJson(sampleTripJson));
      store.seats.add('A01');
      store.holdId = 'hold_2';

      await tester.pumpWidget(PassengerScope(
        store: store,
        child: const MaterialApp(home: PassengerCheckoutScreen()),
      ));
      await tester.pumpAndSettle();

      // SwitchListTile for insurance IS rendered
      expect(find.text('Bảo hiểm chuyến đi'), findsOneWidget);
      expect(find.byType(SwitchListTile), findsOneWidget);

      // Toggle insurance on
      await tester.tap(find.byType(SwitchListTile));
      await tester.pumpAndSettle();
      expect(store.insured, isTrue);

      await store.createOrder('Trần Bình', '0912345678');
      expect(bookingBody, isNotNull);
      expect(bookingBody!['insuranceSelected'], isTrue);

      store.stopHold();
      await tester.pumpWidget(const SizedBox());
    });

    testWidgets('wallet balance is hidden when wallet_enabled is false, shown when true', (tester) async {
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
        tester.platformDispatcher.clearTextScaleFactorTestValue();
      });
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1.0;
      tester.platformDispatcher.textScaleFactorTestValue = 0.6;

      final client = MockClient((req) async => http.Response('{"status":"success","data":{}}', 200, headers: {'content-type': 'application/json; charset=utf-8'}));
      final store = PassengerStore(api: PassengerApiClientService(client: client));
      store.api.authToken = 'tok_logged_in';
      store.userPhone = '0912345678';
      store.userName = 'Trần Bình';
      store.walletBalanceVnd = 150000;

      // 1. When walletEnabled is false
      store.operator = const OperatorInfo(
        code: 'SAOMAI',
        name: 'Nhà xe Sao Mai',
        shortName: 'Sao Mai',
        hotline: '1900 6868',
        primaryColor: '#E11D48',
        insuranceEnabled: false,
        walletEnabled: false,
      );
      await tester.pumpWidget(PassengerScope(
        store: store,
        child: const MaterialApp(home: Scaffold(body: PassengerProfileScreen())),
      ));
      await tester.pumpAndSettle();

      expect(find.text('Số dư ví BusGo'), findsNothing);
      expect(find.text('150.000 đ'), findsNothing);
      await tester.pumpWidget(const SizedBox());

      // 2. When walletEnabled is true
      store.operator = const OperatorInfo(
        code: 'SAOMAI',
        name: 'Nhà xe Sao Mai',
        shortName: 'Sao Mai',
        hotline: '1900 6868',
        primaryColor: '#E11D48',
        insuranceEnabled: false,
        walletEnabled: true,
      );
      await tester.pumpWidget(PassengerScope(
        store: store,
        child: const MaterialApp(home: Scaffold(body: PassengerProfileScreen())),
      ));
      await tester.pumpAndSettle();

      expect(find.text('Số dư ví BusGo'), findsOneWidget);
      expect(find.text('150.000 đ'), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
    });
  });

  group('Step 6b: Refund account at cancel', () {
    testWidgets('cancel of a transfer ticket requires refund account fields and saves to prefs', (tester) async {
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
        tester.platformDispatcher.clearTextScaleFactorTestValue();
      });
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1.0;
      tester.platformDispatcher.textScaleFactorTestValue = 0.6;

      Map<String, dynamic>? cancelBody;
      final client = MockClient((req) async {
        if (req.url.path.contains('/cancel')) {
          cancelBody = jsonDecode(req.body) as Map<String, dynamic>;
          return http.Response(
            jsonEncode({
              'status': 'success',
              'data': {
                'ticket_id': 'tkt_transfer_1',
                'pnr': 'BG-999888',
                'refund_amount_vnd': 250000,
                'status': 'REFUND_REQUESTED',
              },
            }),
            200,
            headers: {'content-type': 'application/json; charset=utf-8'},
          );
        }
        if (req.url.path.endsWith('/passenger/tickets')) {
          return http.Response('{"status":"success","data":{"tickets":[]}}', 200, headers: {'content-type': 'application/json; charset=utf-8'});
        }
        return http.Response('{"status":"success","data":{}}', 200, headers: {'content-type': 'application/json; charset=utf-8'});
      });

      final store = PassengerStore(api: PassengerApiClientService(client: client));
      final dep = DateTime.now().add(const Duration(days: 2)).toUtc().toIso8601String();
      final transferTicket = Ticket.fromJson({
        'ticket_id': 'tkt_transfer_1',
        'pnr': 'BG-999888',
        'trip_id': 'trp_1',
        'departure_time': dep,
        'fare_vnd': 250000,
        'seat_code': 'A01',
        'pickup_stop': 'Mỹ Đình',
        'passenger_name': 'Trần Bình',
        'status': 'ACTIVE',
        'payment_method': 'VIETQR_NAPAS247',
      });

      await tester.pumpWidget(PassengerScope(
        store: store,
        child: MaterialApp(
          home: Scaffold(
            body: Builder(
              builder: (ctx) => ElevatedButton(
                onPressed: () => confirmCancelTicket(ctx, transferTicket),
                child: const Text('Mở hủy vé'),
              ),
            ),
          ),
        ),
      ));
      await tester.pumpAndSettle();

      // Tap open cancel
      await tester.tap(find.text('Mở hủy vé'));
      await tester.pumpAndSettle();

      // Check that refund account fields are present
      expect(find.text('Tài khoản nhận tiền hoàn'), findsOneWidget);
      expect(find.byKey(const Key('cancel_bank_picker')), findsOneWidget);
      expect(find.byKey(const Key('cancel_account_number')), findsOneWidget);
      expect(find.byKey(const Key('cancel_account_name')), findsOneWidget);

      // Tap submit with empty account number -> validation error
      await tester.tap(find.text('Hủy vé, hoàn 250.000 đ'));
      await tester.pumpAndSettle();
      expect(find.text('Số tài khoản chỉ gồm 6-19 chữ số'), findsOneWidget);
      expect(cancelBody, isNull);

      // Enter account number and lowercase account name (which should auto-uppercase)
      await tester.enterText(find.byKey(const Key('cancel_account_number')), '123456789');
      await tester.enterText(find.byKey(const Key('cancel_account_name')), 'tran binh');
      await tester.pumpAndSettle();

      // Verify name is upper-cased
      final nameField = tester.widget<TextField>(find.byKey(const Key('cancel_account_name')));
      expect(nameField.controller?.text, 'TRAN BINH');

      // Submit cancel
      await tester.tap(find.text('Hủy vé, hoàn 250.000 đ'));
      await tester.pumpAndSettle();

      // Verify API was called with refund_account
      expect(cancelBody, isNotNull);
      final refAcc = cancelBody!['refund_account'] as Map<String, dynamic>;
      expect(refAcc['account_number'], '123456789');
      expect(refAcc['account_name'], 'TRAN BINH');
      expect(refAcc['bank_bin'], isNotEmpty);

      // Verify saved in SharedPreferences
      final prefs = await SharedPreferences.getInstance();
      final savedStr = prefs.getString('last_refund_account');
      expect(savedStr, isNotNull);
      expect(savedStr, contains('123456789'));
      expect(savedStr, contains('TRAN BINH'));

      await tester.pumpWidget(const SizedBox());
    });

    testWidgets('ticket detail shows refund status, masked account, and allows editing pending account', (tester) async {
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
        tester.platformDispatcher.clearTextScaleFactorTestValue();
      });
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1.0;
      tester.platformDispatcher.textScaleFactorTestValue = 0.6;

      Map<String, dynamic>? patchBody;
      final client = MockClient((req) async {
        if (req.method == 'PATCH' && req.url.path.contains('/refund-account')) {
          patchBody = jsonDecode(req.body) as Map<String, dynamic>;
          return http.Response(
            jsonEncode({
              'status': 'success',
              'data': {
                'ticket_id': 'tkt_refund_1',
                'refund_id': 'ref_1',
                'refund_account': {
                  'bank_bin': '970436',
                  'bank_name': 'Vietcombank',
                  'account_number': '******9999',
                  'account_name': 'TRAN BINH',
                },
              },
            }),
            200,
            headers: {'content-type': 'application/json; charset=utf-8'},
          );
        }
        if (req.url.path.endsWith('/passenger/tickets')) {
          return http.Response('{"status":"success","data":{"tickets":[]}}', 200, headers: {'content-type': 'application/json; charset=utf-8'});
        }
        return http.Response('{"status":"success","data":{}}', 200, headers: {'content-type': 'application/json; charset=utf-8'});
      });

      final store = PassengerStore(api: PassengerApiClientService(client: client));
      final dep = DateTime.now().add(const Duration(days: 2)).toUtc().toIso8601String();
      final refundedTicket = Ticket.fromJson({
        'ticket_id': 'tkt_refund_1',
        'pnr': 'BG-777666',
        'trip_id': 'trp_1',
        'departure_time': dep,
        'fare_vnd': 250000,
        'seat_code': 'A01',
        'pickup_stop': 'Mỹ Đình',
        'passenger_name': 'Trần Bình',
        'status': 'REFUND_REQUESTED',
        'refund': {
          'refund_id': 'ref_1',
          'status': 'REFUND_REQUESTED',
          'amount_vnd': 250000,
          'refund_account': {
            'bank_bin': '970415',
            'bank_name': 'VietinBank',
            'account_number': '******1234',
            'account_name': 'TRAN BINH',
          },
        },
      });

      await tester.pumpWidget(PassengerScope(
        store: store,
        child: MaterialApp(home: PassengerTicketQrScreen(ticket: refundedTicket)),
      ));
      await tester.pumpAndSettle();

      // Shows refund card
      expect(find.text('Thông tin hoàn tiền'), findsOneWidget);
      expect(find.text('Đang chờ hoàn tiền'), findsWidgets);
      expect(find.text('******1234'), findsOneWidget);
      expect(find.text('TRAN BINH'), findsWidgets);

      // Button to edit refund account is visible
      final editBtn = find.text('Sửa tài khoản nhận hoàn');
      expect(editBtn, findsOneWidget);

      await tester.tap(editBtn);
      await tester.pumpAndSettle();

      // Edit sheet opens
      expect(find.text('Sửa tài khoản nhận hoàn'), findsWidgets);
      expect(find.byKey(const Key('edit_refund_account_number')), findsOneWidget);

      await tester.enterText(find.byKey(const Key('edit_refund_account_number')), '9876543219999');
      await tester.pumpAndSettle();

      await tester.tap(find.text('Cập nhật tài khoản'));
      await tester.pumpAndSettle();

      expect(patchBody, isNotNull);
      final editedAcc = patchBody!['refund_account'] as Map<String, dynamic>;
      expect(editedAcc['account_number'], '9876543219999');

      await tester.pumpWidget(const SizedBox());
    });
  });

  group('Step 6b: Account deletion flow', () {
    testWidgets('typing XÓA enables button, 409 shows server message', (tester) async {
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
        tester.platformDispatcher.clearTextScaleFactorTestValue();
      });
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1.0;
      tester.platformDispatcher.textScaleFactorTestValue = 0.6;

      final client = MockClient((req) async {
        if (req.method == 'DELETE' && req.url.path == '/api/v1/passenger/me') {
          return http.Response(
            jsonEncode({
              'status': 'error',
              'code': 'HAS_UPCOMING_TICKETS',
              'message': 'Bạn còn vé chưa đi. Hãy hủy vé hoặc đợi chuyến kết thúc rồi xóa tài khoản.',
            }),
            409,
            headers: {'content-type': 'application/json; charset=utf-8'},
          );
        }
        return http.Response('{"status":"success","data":{}}', 200, headers: {'content-type': 'application/json; charset=utf-8'});
      });

      final store = PassengerStore(api: PassengerApiClientService(client: client));
      store.api.authToken = 'tok_logged_in';
      store.userPhone = '0912345678';
      store.userName = 'Trần Bình';

      await tester.pumpWidget(PassengerScope(
        store: store,
        child: const MaterialApp(home: Scaffold(body: PassengerProfileScreen())),
      ));
      await tester.pumpAndSettle();

      final deleteBtn = find.text('Xóa tài khoản');
      expect(deleteBtn, findsOneWidget);

      await tester.tap(deleteBtn);
      await tester.pumpAndSettle();

      // Explanation is displayed
      expect(find.textContaining('Lịch sử vé đã đi được giữ lại ở dạng ẩn danh theo quy định kế toán'), findsOneWidget);

      // Confirm button is initially disabled
      final confirmBtnFinder = find.widgetWithText(PrimaryButton, 'Xóa tài khoản');
      expect(confirmBtnFinder, findsOneWidget);
      expect(tester.widget<PrimaryButton>(confirmBtnFinder).onPressed, isNull);

      // Typing wrong text leaves button disabled
      final inputFinder = find.byType(TextField);
      await tester.enterText(inputFinder, 'XO');
      await tester.pumpAndSettle();
      expect(tester.widget<PrimaryButton>(confirmBtnFinder).onPressed, isNull);

      // XÓA with a combining accent (some Vietnamese keyboards) and plain XOA count too
      for (final typed in ['XO\u0301A', 'xoa']) {
        await tester.enterText(inputFinder, typed);
        await tester.pumpAndSettle();
        expect(tester.widget<PrimaryButton>(confirmBtnFinder).onPressed, isNotNull, reason: typed);
      }

      // Typing XÓA enables button
      await tester.enterText(inputFinder, 'XÓA');
      await tester.pumpAndSettle();
      expect(tester.widget<PrimaryButton>(confirmBtnFinder).onPressed, isNotNull);

      // Tap confirm -> 409 error
      await tester.tap(confirmBtnFinder);
      await tester.pumpAndSettle();

      expect(find.text('Bạn còn vé chưa đi. Hãy hủy vé hoặc đợi chuyến kết thúc rồi xóa tài khoản.'), findsWidgets);
      // User is still logged in
      expect(store.loggedIn, isTrue);

      await tester.pumpWidget(const SizedBox());
    });

    testWidgets('typing XÓA and success clears data, returns to login, toasts success', (tester) async {
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
        tester.platformDispatcher.clearTextScaleFactorTestValue();
      });
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1.0;
      tester.platformDispatcher.textScaleFactorTestValue = 0.6;

      final client = MockClient((req) async {
        if (req.method == 'DELETE' && req.url.path == '/api/v1/passenger/me') {
          return http.Response(
            jsonEncode({
              'status': 'success',
              'data': {'deleted': true},
            }),
            200,
            headers: {'content-type': 'application/json; charset=utf-8'},
          );
        }
        return http.Response('{"status":"success","data":{}}', 200, headers: {'content-type': 'application/json; charset=utf-8'});
      });

      final store = PassengerStore(api: PassengerApiClientService(client: client));
      store.api.authToken = 'tok_logged_in';
      store.userPhone = '0912345678';
      store.userName = 'Trần Bình';

      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('passenger_session', jsonEncode({'token': 'tok_logged_in'}));
      await prefs.setString('last_refund_account', jsonEncode({'bank_bin': '970415', 'account_number': '123456'}));

      await tester.pumpWidget(PassengerScope(
        store: store,
        child: const MaterialApp(home: Scaffold(body: PassengerProfileScreen())),
      ));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Xóa tài khoản'));
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextField), 'XÓA');
      await tester.pumpAndSettle();

      final confirmBtnFinder = find.widgetWithText(PrimaryButton, 'Xóa tài khoản');
      await tester.tap(confirmBtnFinder);
      await tester.pumpAndSettle();

      // Navigated to PassengerLoginScreen
      expect(find.byType(PassengerLoginScreen), findsOneWidget);
      // Toast displayed
      expect(find.text('Đã xóa tài khoản'), findsOneWidget);

      // Store is logged out and local data cleared
      expect(store.loggedIn, isFalse);
      expect(store.userPhone, isNull);
      expect(store.tickets, isEmpty);
      expect(prefs.getString('passenger_session'), isNull);
      expect(prefs.getString('last_refund_account'), isNull);

      await tester.pumpWidget(const SizedBox());
    });
  });
}
