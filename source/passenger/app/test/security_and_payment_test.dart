import 'dart:convert';

import 'package:app/src/presentation/passenger/passenger_payment_processing_screen.dart';
import 'package:app/src/presentation/passenger/passenger_store.dart';
import 'package:data/src/service/passenger_api_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  group('A1: Passenger URL security validation', () {
    test('release + http -> từ chối', () {
      expect(isSecureApiUrl('http://100.96.225.81:3000', releaseMode: true), isFalse);
      expect(isSecureApiUrl('http://localhost:3000', releaseMode: true), isFalse);
      expect(isBaseUrlAllowed('http://api.insecure.vn', releaseMode: true), isFalse);
      expect(resolvePassengerBaseUrl('http://100.96.225.81:3000', true), isEmpty);
    });

    test('release + https -> ok', () {
      expect(isSecureApiUrl('https://api.busgo.vn:3000', releaseMode: true), isTrue);
      expect(isSecureApiUrl('https://fleetbus.example.com', releaseMode: true), isTrue);
      expect(isBaseUrlAllowed('https://api.busgo.vn', releaseMode: true), isTrue);
      expect(resolvePassengerBaseUrl('https://api.busgo.vn', true), 'https://api.busgo.vn');
    });

    test('debug + http -> ok', () {
      expect(isSecureApiUrl('http://100.96.225.81:3000', releaseMode: false), isTrue);
      expect(isSecureApiUrl('http://10.0.2.2:3000', releaseMode: false), isTrue);
      expect(isBaseUrlAllowed('http://100.96.225.81:3000', releaseMode: false), isTrue);
      expect(resolvePassengerBaseUrl('http://100.96.225.81:3000', false), 'http://100.96.225.81:3000');
    });

    test('PassengerApiClientService with releaseMode=true and http url does not send request and returns clear error', () async {
      var requestSent = false;
      final client = MockClient((req) async {
        requestSent = true;
        return http.Response(jsonEncode({'status': 'success', 'data': {}}), 200);
      });

      final api = PassengerApiClientService(
        baseUrl: 'http://100.96.225.81:3000',
        client: client,
        releaseMode: true,
      );

      final res = await api.getAppConfig();
      expect(requestSent, isFalse);
      expect(res['status'], 'error');
      expect(res['message'], 'Kết nối tới máy chủ không an toàn. Cập nhật ứng dụng hoặc liên hệ nhà xe.');

      final store = PassengerStore(api: api);
      final err = await store.selectOperator('SAOMAI');
      expect(err, 'Kết nối tới máy chủ không an toàn. Cập nhật ứng dụng hoặc liên hệ nhà xe.');
    });
  });

  group('A2: Passenger payment processing screen', () {
    testWidgets('shows warning text and account name in bold', (tester) async {
      final client = MockClient((_) async => http.Response('{"status":"success","data":{}}', 200));
      final store = PassengerStore(api: PassengerApiClientService(client: client));
      store.bankName = 'VietinBank';
      store.accountName = 'CÔNG TY TNHH VẬN TẢI SAO MAI';
      store.accountNumber = '108821999';
      store.orderAmount = 250000;
      store.transferMemo = 'BG-123456';
      store.vietQrPayload = '000201...';

      await tester.pumpWidget(MaterialApp(
        home: PassengerScope(
          store: store,
          child: const PassengerPaymentProcessingScreen(
            name: 'Nguyễn Văn An',
            phone: '0912345678',
          ),
        ),
      ));
      await tester.pump();

      // Warning text above the information block
      expect(
        find.textContaining(
          'Chỉ chuyển khoản theo mã QR trong app. Nhà xe không bao giờ nhắn số tài khoản khác qua tin nhắn hay điện thoại.',
        ),
        findsOneWidget,
      );

      // Bank row and account name row
      expect(find.text('Ngân hàng'), findsOneWidget);
      expect(find.text('VietinBank'), findsOneWidget);
      expect(find.text('Chủ tài khoản'), findsOneWidget);
      expect(find.text('CÔNG TY TNHH VẬN TẢI SAO MAI'), findsOneWidget);

      final accountNameWidget = tester.widget<Text>(find.text('CÔNG TY TNHH VẬN TẢI SAO MAI'));
      expect(accountNameWidget.style?.fontWeight, FontWeight.w700);
    });

    testWidgets('shows "—" when accountName is empty (not hidden)', (tester) async {
      final client = MockClient((_) async => http.Response('{"status":"success","data":{}}', 200));
      final store = PassengerStore(api: PassengerApiClientService(client: client));
      store.bankName = 'MB Bank';
      store.accountName = '';
      store.accountNumber = '0912345678';
      store.orderAmount = 150000;
      store.transferMemo = 'BG-654321';
      store.vietQrPayload = '000201...';

      await tester.pumpWidget(MaterialApp(
        home: PassengerScope(
          store: store,
          child: const PassengerPaymentProcessingScreen(
            name: 'Lê Thị Bình',
            phone: '0987654321',
          ),
        ),
      ));
      await tester.pump();

      expect(find.text('Chủ tài khoản'), findsOneWidget);
      expect(find.text('—'), findsOneWidget);
    });
  });
}
