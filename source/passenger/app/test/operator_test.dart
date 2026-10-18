import 'dart:convert';
import 'package:app/src/presentation/passenger/passenger_store.dart';
import 'package:data/src/service/passenger_api_service.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:app/src/presentation/passenger/passenger_permissions.dart';

import 'fake_permissions.dart';

void main() {
  setUp(() => passengerPermissions = FakePassengerPermissions());
  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  var sent = <http.Request>[];

  PassengerStore storeWithServer() {
    sent = [];
    final client = MockClient((req) async {
      sent.add(req);
      Map<String, dynamic>? data;
      Object? list;
      final path = req.url.path;
      if (path.endsWith('/app/config')) {
        final code = req.url.queryParameters['operator'] ?? '';
        if (code == 'SAOMAI') {
          data = {'operator': {'operator_id': 'op1', 'code': 'SAOMAI', 'name': 'Nhà xe Sao Mai', 'short_name': 'Sao Mai', 'hotline': '1900 6868', 'primary_color': '#E11D48'}};
        } else if (code == 'XUYENVIET') {
          data = {'operator': {'operator_id': 'op2', 'code': 'XUYENVIET', 'name': 'Xuyên Việt Lines', 'short_name': 'Xuyên Việt', 'hotline': '1900 2468', 'primary_color': '#2563EB'}};
        } else {
          return http.Response(jsonEncode({'status': 'error', 'code': 'OPERATOR_NOT_FOUND', 'message': 'Mã nhà xe không đúng'}), 404, headers: {'content-type': 'application/json; charset=utf-8'});
        }
      }
      if (path.endsWith('/routes/stops/search')) {
        final op = req.headers['x-operator-code'];
        if (op == 'XUYENVIET') {
          list = [
            {'stop_id': 'md', 'name': 'Bến xe Mỹ Đình', 'city': 'Hà Nội', 'popular': true},
            {'stop_id': 'nb', 'name': 'Bến xe Ninh Bình', 'city': 'Ninh Bình', 'popular': true},
            {'stop_id': 'th', 'name': 'Bến xe Phía Bắc', 'city': 'Thanh Hóa', 'popular': true},
          ];
        } else {
          list = [
            {'stop_id': 'gb', 'name': 'Bến xe Giáp Bát', 'city': 'Hà Nội', 'popular': true},
            {'stop_id': 'md', 'name': 'Bến xe Mỹ Đình', 'city': 'Hà Nội', 'popular': false},
            {'stop_id': 'nb', 'name': 'Bến xe Ninh Bình', 'city': 'Ninh Bình', 'popular': true},
            {'stop_id': 'th', 'name': 'Bến xe Phía Bắc', 'city': 'Thanh Hóa', 'popular': true},
            {'stop_id': 'hp', 'name': 'Bến xe Niệm Nghĩa', 'city': 'Hải Phòng', 'popular': true},
          ];
        }
      }
      if (path.endsWith('/otp/request')) data = {'mock_otp': '123456'};
      if (path.endsWith('/otp/verify')) {
        data = {'token': 'tok', 'user': {'full_name': 'Hành khách BusGo', 'operator': {'code': req.headers['x-operator-code'] ?? 'SAOMAI'}}};
      }
      if (path.endsWith('/passenger/tickets')) list = [];
      if (path.endsWith('/notifications')) list = [];
      return http.Response(jsonEncode({'status': 'success', 'data': list ?? data ?? {}}), 200, headers: {'content-type': 'application/json; charset=utf-8'});
    });
    return PassengerStore(api: PassengerApiClientService(baseUrl: 'http://test', client: client));
  }

  String tokenExpiring(DateTime exp) =>
      'pax_jwt_${base64Url.encode(utf8.encode(jsonEncode({'sub': 'usr_1', 'kind': 'passenger', 'exp': exp.millisecondsSinceEpoch}))).replaceAll('=', '')}.sig';

  test('the login survives closing the app until its token expires, for the same company only', () async {
    expect(PassengerStore.tokenStillValid(tokenExpiring(DateTime.now().add(const Duration(hours: 1)))), isTrue);
    expect(PassengerStore.tokenStillValid(tokenExpiring(DateTime.now().subtract(const Duration(minutes: 1)))), isFalse);
    expect(PassengerStore.tokenStillValid('tok'), isFalse);

    final first = storeWithServer();
    expect(await first.selectOperator('SAOMAI'), isNull);
    expect(await first.verifyOtp('0987654321', '123456'), isNull);
    final prefs = await SharedPreferences.getInstance();
    final saved = jsonDecode(prefs.getString('passenger_session')!) as Map<String, dynamic>;
    expect((saved['token'], saved['operator_code'], saved['phone']), ('tok', 'SAOMAI', '0987654321'));

    final token = tokenExpiring(DateTime.now().add(const Duration(hours: 1)));
    await prefs.setString('passenger_session', jsonEncode({...saved, 'token': token}));
    final reopened = storeWithServer();
    await reopened.restoreOperator();
    expect((reopened.loggedIn, reopened.userPhone), (true, '0987654321'));
    await pumpEventQueue();
    expect(sent.lastWhere((r) => r.url.path.endsWith('/passenger/tickets')).headers['authorization'], 'Bearer $token');

    reopened.logout();
    await pumpEventQueue();
    expect(prefs.getString('passenger_session'), isNull, reason: 'signing out forgets the session');

    await prefs.setString('passenger_session', jsonEncode({...saved, 'token': tokenExpiring(DateTime.now().subtract(const Duration(minutes: 1)))}));
    final expired = storeWithServer();
    await expired.restoreOperator();
    expect(expired.loggedIn, isFalse);
    expect(prefs.getString('passenger_session'), isNull);

    await prefs.setString('passenger_session', jsonEncode({...saved, 'token': token, 'operator_code': 'XUYENVIET'}));
    final otherCompany = storeWithServer();
    await otherCompany.restoreOperator();
    expect(otherCompany.loggedIn, isFalse, reason: 'a session belongs to the company it was made for');
  });

  test('operator flow', () async {
    final store = storeWithServer();
    
    final err = await store.selectOperator('UNKNOWN');
    expect(err, 'Mã nhà xe không đúng');
    expect(store.operator, isNull);

    final err2 = await store.selectOperator('xuyenviet');
    expect(err2, isNull);
    expect(store.operator?.code, 'XUYENVIET');
    expect(store.operator?.name, 'Xuyên Việt Lines');
    expect(store.api.operatorCode, 'XUYENVIET');
    
    expect(store.places.length, 3);
    expect(store.places['hanoi']?.station, 'Bến xe Mỹ Đình');
    
    final req = sent.lastWhere((r) => r.url.path.endsWith('/routes/stops/search'));
    expect(req.headers['x-operator-code'], 'XUYENVIET');

    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString('operator_code'), 'XUYENVIET');

    final store2 = storeWithServer();
    await store2.restoreOperator();
    expect(store2.operator?.code, 'XUYENVIET');
    expect(store2.api.operatorCode, 'XUYENVIET');

    await store2.changeOperator();
    expect(store2.operator, isNull);
    expect(store2.api.operatorCode, isNull);
    expect(store2.places, isEmpty);
    expect(prefs.getString('operator_code'), isNull);
  });

  test('verifyOtp refuses mismatching operator', () async {
    final store = storeWithServer();
    await store.selectOperator('SAOMAI');
    var err = await store.verifyOtp('0912345678', '123456');
    expect(err, isNull);

    store.api.operatorCode = 'OTHER';
    err = await store.verifyOtp('0912345678', '123456');
    expect(err, 'Tài khoản không thuộc nhà xe này');
    expect(store.api.authToken, isNull);
  });
}
