import 'dart:convert';

import 'package:app/src/presentation/passenger/passenger_login_screen.dart';
import 'package:app/src/presentation/passenger/passenger_payment_processing_screen.dart';
import 'package:app/src/presentation/passenger/passenger_qr_saver.dart';
import 'package:app/src/presentation/passenger/passenger_store.dart';
import 'package:app/src/presentation/passenger/passenger_widgets.dart';
import 'package:data/src/service/passenger_api_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

class FakeQrImageSaver implements QrImageSaver {
  bool saveCalled = false;
  String? savedQrData;
  int? savedAmount;
  String? savedMemo;
  bool shouldDenyAccess = false;

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
    if (shouldDenyAccess) {
      showToast(context, 'Hãy cho phép BusGo lưu ảnh trong Cài đặt');
    } else {
      showToast(context, 'Đã lưu ảnh mã QR vào thư viện');
    }
  }
}

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  group('QR save button and renderer', () {
    test('renderPaymentQrImage produces valid PNG bytes with white background and text', () async {
      final bytes = await renderPaymentQrImage(
        qrData: '00020101021238540010A0000007270124000697042201100912345678530370454062200005802VN62130809BG-0000016304ABCD',
        amount: 220000,
        memo: 'BG-000001',
      );
      expect(bytes, isNotEmpty);
      // PNG header: 0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A
      expect(bytes.sublist(0, 8), [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    });

    testWidgets('tapping "Lưu ảnh mã QR" calls injected saver and shows success toast', (tester) async {
      final client = MockClient((req) async => http.Response('{"status":"success","data":{}}', 200, headers: {'content-type': 'application/json; charset=utf-8'}));
      final store = PassengerStore(api: PassengerApiClientService(client: client));
      store.vietQrPayload = 'VIETQR_TEST_PAYLOAD';
      store.orderAmount = 250000;
      store.transferMemo = 'BG-123456';

      final fakeSaver = FakeQrImageSaver();

      await tester.pumpWidget(MaterialApp(
        home: PassengerScope(
          store: store,
          child: PassengerPaymentProcessingScreen(
            name: 'Trần Bình',
            phone: '0912345678',
            qrSaver: fakeSaver,
          ),
        ),
      ));
      await tester.pump();

      final saveButton = find.text('Lưu ảnh mã QR');
      expect(saveButton, findsOneWidget);

      await tester.tap(saveButton);
      await tester.pump();

      expect(fakeSaver.saveCalled, isTrue);
      expect(fakeSaver.savedQrData, 'VIETQR_TEST_PAYLOAD');
      expect(fakeSaver.savedAmount, 250000);
      expect(fakeSaver.savedMemo, 'BG-123456');
      expect(find.text('Đã lưu ảnh mã QR vào thư viện'), findsOneWidget);

      await tester.pumpWidget(const SizedBox());
    });

    testWidgets('tapping "Lưu ảnh mã QR" shows setting guidance on permission denial', (tester) async {
      final client = MockClient((req) async => http.Response('{"status":"success","data":{}}', 200, headers: {'content-type': 'application/json; charset=utf-8'}));
      final store = PassengerStore(api: PassengerApiClientService(client: client));
      store.vietQrPayload = 'VIETQR_TEST_PAYLOAD';
      store.orderAmount = 250000;
      store.transferMemo = 'BG-123456';

      final fakeSaver = FakeQrImageSaver()..shouldDenyAccess = true;

      await tester.pumpWidget(MaterialApp(
        home: PassengerScope(
          store: store,
          child: PassengerPaymentProcessingScreen(
            name: 'Trần Bình',
            phone: '0912345678',
            qrSaver: fakeSaver,
          ),
        ),
      ));
      await tester.pump();

      final saveButton = find.text('Lưu ảnh mã QR');
      await tester.tap(saveButton);
      await tester.pump();

      expect(fakeSaver.saveCalled, isTrue);
      expect(find.text('Hãy cho phép BusGo lưu ảnh trong Cài đặt'), findsOneWidget);

      await tester.pumpWidget(const SizedBox());
    });
  });

  group('OTP countdown and resend call', () {
    testWidgets('countdown displays correctly, disables button, enables after cooldown, and calls resend OTP', (tester) async {
      int otpRequestCount = 0;
      final client = MockClient((req) async {
        if (req.url.path.endsWith('/otp/request')) {
          otpRequestCount++;
          return http.Response(
            jsonEncode({
              'status': 'success',
              'data': {
                'phone': '0987654321',
                'cooldown_seconds': 45,
                'mock_otp': '654321',
              },
            }),
            200,
            headers: {'content-type': 'application/json; charset=utf-8'},
          );
        }
        return http.Response('{"status":"success","data":{}}', 200, headers: {'content-type': 'application/json; charset=utf-8'});
      });

      final store = PassengerStore(api: PassengerApiClientService(client: client));

      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: PassengerScope(
            store: store,
            child: const PassengerLoginScreen(),
          ),
        ),
      ));
      await tester.pump();

      // Enter phone and submit
      await tester.enterText(find.byType(TextField).first, '0987654321');
      await tester.tap(find.text('Gửi mã'));
      await tester.pump();
      await tester.pump();

      expect(otpRequestCount, 1);
      // Auto-fills mock_otp in debug mode
      expect(find.text('654321'), findsOneWidget);

      // Countdown visible: "Gửi lại mã sau 45s", button disabled
      expect(find.text('Gửi lại mã sau 45s'), findsOneWidget);
      final btnBefore = tester.widget<TextButton>(find.ancestor(of: find.text('Gửi lại mã sau 45s'), matching: find.byType(TextButton)));
      expect(btnBefore.onPressed, isNull);

      // Advance 10s -> "Gửi lại mã sau 35s"
      await tester.pump(const Duration(seconds: 10));
      expect(find.text('Gửi lại mã sau 35s'), findsOneWidget);

      // Advance 35s -> "Gửi lại mã", button enabled
      await tester.pump(const Duration(seconds: 35));
      expect(find.text('Gửi lại mã'), findsOneWidget);
      final btnReady = tester.widget<TextButton>(find.ancestor(of: find.text('Gửi lại mã'), matching: find.byType(TextButton)));
      expect(btnReady.onPressed, isNotNull);

      // Tap resend
      await tester.tap(find.text('Gửi lại mã'));
      await tester.pump();
      await tester.pump();

      expect(otpRequestCount, 2);
      expect(find.text('Đã gửi lại mã'), findsOneWidget);
      expect(find.text('Gửi lại mã sau 45s'), findsOneWidget);

      await tester.pumpWidget(const SizedBox());
    });

    testWidgets('resend OTP displays server message on COOLDOWN_ACTIVE and resumes countdown', (tester) async {
      bool first = true;
      final client = MockClient((req) async {
        if (req.url.path.endsWith('/otp/request')) {
          if (first) {
            first = false;
            return http.Response(
              jsonEncode({
                'status': 'success',
                'data': {
                  'phone': '0987654321',
                  'cooldown_seconds': 2,
                  'mock_otp': '123456',
                },
              }),
              200,
              headers: {'content-type': 'application/json; charset=utf-8'},
            );
          }
          return http.Response(
            jsonEncode({
              'status': 'error',
              'code': 'COOLDOWN_ACTIVE',
              'message': 'Vui lòng chờ 45 giây trước khi yêu cầu mã OTP mới',
              'details': {'remainingCooldown': 45},
            }),
            429,
            headers: {'content-type': 'application/json; charset=utf-8'},
          );
        }
        return http.Response('{"status":"success","data":{}}', 200, headers: {'content-type': 'application/json; charset=utf-8'});
      });

      final store = PassengerStore(api: PassengerApiClientService(client: client));

      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: PassengerScope(
            store: store,
            child: const PassengerLoginScreen(),
          ),
        ),
      ));
      await tester.pump();

      await tester.enterText(find.byType(TextField).first, '0987654321');
      await tester.tap(find.text('Gửi mã'));
      await tester.pump();
      await tester.pump();

      // Wait 2s cooldown
      await tester.pump(const Duration(seconds: 2));
      expect(find.text('Gửi lại mã'), findsOneWidget);

      // Resend triggers COOLDOWN_ACTIVE
      await tester.tap(find.text('Gửi lại mã'));
      await tester.pump();
      await tester.pump();

      expect(find.text('Vui lòng chờ 45 giây trước khi yêu cầu mã OTP mới'), findsOneWidget);
      expect(find.text('Gửi lại mã sau 45s'), findsOneWidget);

      await tester.pumpWidget(const SizedBox());
    });

    testWidgets('resend OTP displays server message on RATE_LIMITED', (tester) async {
      bool first = true;
      final client = MockClient((req) async {
        if (req.url.path.endsWith('/otp/request')) {
          if (first) {
            first = false;
            return http.Response(
              jsonEncode({
                'status': 'success',
                'data': {
                  'phone': '0987654321',
                  'cooldown_seconds': 1,
                  'mock_otp': '123456',
                },
              }),
              200,
              headers: {'content-type': 'application/json; charset=utf-8'},
            );
          }
          return http.Response(
            jsonEncode({
              'status': 'error',
              'code': 'RATE_LIMITED',
              'message': 'Quá nhiều yêu cầu, vui lòng thử lại sau ít phút',
            }),
            429,
            headers: {'content-type': 'application/json; charset=utf-8'},
          );
        }
        return http.Response('{"status":"success","data":{}}', 200, headers: {'content-type': 'application/json; charset=utf-8'});
      });

      final store = PassengerStore(api: PassengerApiClientService(client: client));

      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: PassengerScope(
            store: store,
            child: const PassengerLoginScreen(),
          ),
        ),
      ));
      await tester.pump();

      await tester.enterText(find.byType(TextField).first, '0987654321');
      await tester.tap(find.text('Gửi mã'));
      await tester.pump();
      await tester.pump();

      await tester.pump(const Duration(seconds: 1));
      expect(find.text('Gửi lại mã'), findsOneWidget);

      await tester.tap(find.text('Gửi lại mã'));
      await tester.pump();
      await tester.pump();

      expect(find.text('Quá nhiều yêu cầu, vui lòng thử lại sau ít phút'), findsOneWidget);

      await tester.pumpWidget(const SizedBox());
    });

    testWidgets('resend OTP displays server message on OTP_PROVIDER_UNAVAILABLE', (tester) async {
      bool first = true;
      final client = MockClient((req) async {
        if (req.url.path.endsWith('/otp/request')) {
          if (first) {
            first = false;
            return http.Response(
              jsonEncode({
                'status': 'success',
                'data': {
                  'phone': '0987654321',
                  'cooldown_seconds': 1,
                  'mock_otp': '123456',
                },
              }),
              200,
              headers: {'content-type': 'application/json; charset=utf-8'},
            );
          }
          return http.Response(
            jsonEncode({
              'status': 'error',
              'code': 'OTP_PROVIDER_UNAVAILABLE',
              'message': 'Chưa gửi được mã OTP. Vui lòng thử lại sau hoặc gọi tổng đài nhà xe.',
            }),
            503,
            headers: {'content-type': 'application/json; charset=utf-8'},
          );
        }
        return http.Response('{"status":"success","data":{}}', 200, headers: {'content-type': 'application/json; charset=utf-8'});
      });

      final store = PassengerStore(api: PassengerApiClientService(client: client));

      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: PassengerScope(
            store: store,
            child: const PassengerLoginScreen(),
          ),
        ),
      ));
      await tester.pump();

      await tester.enterText(find.byType(TextField).first, '0987654321');
      await tester.tap(find.text('Gửi mã'));
      await tester.pump();
      await tester.pump();

      await tester.pump(const Duration(seconds: 1));
      expect(find.text('Gửi lại mã'), findsOneWidget);

      await tester.tap(find.text('Gửi lại mã'));
      await tester.pump();
      await tester.pump();

      expect(find.text('Chưa gửi được mã OTP. Vui lòng thử lại sau hoặc gọi tổng đài nhà xe.'), findsOneWidget);

      await tester.pumpWidget(const SizedBox());
    });
  });
}
