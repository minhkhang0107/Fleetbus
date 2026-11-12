import 'dart:convert';

import 'package:app/src/presentation/driver_store.dart';
import 'package:app/src/service/driver_api_service.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  group('A1: Driver URL security validation', () {
    test('release + http -> từ chối', () {
      expect(isSecureApiUrl('http://100.96.225.81:3000', releaseMode: true), isFalse);
      expect(isSecureApiUrl('http://localhost:3000', releaseMode: true), isFalse);
      expect(isBaseUrlAllowed('http://driver.insecure.vn', releaseMode: true), isFalse);
      expect(resolveDriverBaseUrl('http://100.96.225.81:3000', true), isEmpty);
    });

    test('release + https -> ok', () {
      expect(isSecureApiUrl('https://driver.busgo.vn:3000', releaseMode: true), isTrue);
      expect(isSecureApiUrl('https://fleetbus.example.com', releaseMode: true), isTrue);
      expect(isBaseUrlAllowed('https://driver.busgo.vn', releaseMode: true), isTrue);
      expect(resolveDriverBaseUrl('https://driver.busgo.vn', true), 'https://driver.busgo.vn');
    });

    test('debug + http -> ok', () {
      expect(isSecureApiUrl('http://100.96.225.81:3000', releaseMode: false), isTrue);
      expect(isSecureApiUrl('http://10.0.2.2:3000', releaseMode: false), isTrue);
      expect(isBaseUrlAllowed('http://100.96.225.81:3000', releaseMode: false), isTrue);
      expect(resolveDriverBaseUrl('http://100.96.225.81:3000', false), 'http://100.96.225.81:3000');
    });

    test('DriverApiClientService with releaseMode=true and http url does not send request and returns clear error', () async {
      var requestSent = false;
      final client = MockClient((req) async {
        requestSent = true;
        return http.Response(jsonEncode({'status': 'success', 'data': {}}), 200);
      });

      final api = DriverApiClientService(
        baseUrl: 'http://100.96.225.81:3000',
        client: client,
        releaseMode: true,
      );

      final res = await api.login('TX8821', '882199');
      expect(requestSent, isFalse);
      expect(res['status'], 'error');
      expect(res['message'], 'Kết nối tới máy chủ không an toàn. Cập nhật ứng dụng hoặc liên hệ nhà xe.');

      final store = DriverStore(api: api);
      final error = await store.login('SAOMAI', 'TX8821', '882199');
      expect(error, 'Kết nối tới máy chủ không an toàn. Cập nhật ứng dụng hoặc liên hệ nhà xe.');
    });
  });
}
