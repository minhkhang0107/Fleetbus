import 'dart:convert';

import 'package:app/src/presentation/passenger/passenger_edit_profile_screen.dart';
import 'package:app/src/presentation/passenger/passenger_profile_screen.dart';
import 'package:app/src/presentation/passenger/passenger_store.dart';
import 'package:data/src/service/passenger_api_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:image_picker/image_picker.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// D186: the settings tab edits the name and photo; the phone number is shown locked and never sent.
void main() {
  // A real 1x1 PNG, so the avatar can be drawn.
  final png = base64Decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=');

  testWidgets('name and photo are edited and saved; the phone cannot be changed', (tester) async {
    SharedPreferences.setMockInitialValues({});
    final patches = <Map<String, dynamic>>[];
    final client = MockClient((req) async {
      Object data = {};
      if (req.url.path.endsWith('/passenger/profile') && req.method == 'PATCH') {
        final body = jsonDecode(req.body) as Map<String, dynamic>;
        patches.add(body);
        data = {'phone': '0987654321', 'full_name': body['full_name'] ?? 'Trần Bình', 'avatar': body['avatar']};
      }
      return http.Response(jsonEncode({'status': 'success', 'data': data}), 200, headers: {'content-type': 'application/json; charset=utf-8'});
    });
    final store = PassengerStore(api: PassengerApiClientService(baseUrl: 'http://test', client: client));
    store.api.authToken = 'tok';
    store.userPhone = '0987654321';
    store.userName = 'Trần Bình';
    ImageSource? asked;
    pickAvatarImage = (source) async {
      asked = source;
      return png;
    };

    await tester.pumpWidget(PassengerScope(store: store, child: const MaterialApp(home: Scaffold(body: PassengerProfileScreen()))));
    await tester.pumpAndSettle();
    expect(find.text('TB'), findsOneWidget, reason: 'initials until a photo is chosen');
    expect(find.text('TÀI KHOẢN'), findsOneWidget);

    await tester.tap(find.text('Sửa tên và ảnh đại diện'));
    await tester.pumpAndSettle();
    expect(find.byType(PassengerEditProfileScreen), findsOneWidget);
    expect(find.byIcon(Icons.lock_outline), findsOneWidget);
    expect(find.widgetWithText(TextField, '0987654321'), findsNothing, reason: 'the phone is not an input');
    final save = find.ancestor(of: find.text('Lưu thay đổi'), matching: find.byType(FilledButton));
    expect(tester.widget<FilledButton>(save).onPressed, isNull, reason: 'nothing changed yet');

    await tester.tap(find.text('Thêm ảnh đại diện'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Chọn từ thư viện'));
    await tester.pumpAndSettle();
    expect(asked, ImageSource.gallery);

    await tester.enterText(find.byType(TextField), '1');
    await tester.pump();
    await tester.tap(save);
    await tester.pumpAndSettle();
    expect(find.text('Họ tên cần 2-60 ký tự.'), findsOneWidget);
    expect(patches, isEmpty);

    await tester.enterText(find.byType(TextField), '  Trần   Thị Bình ');
    await tester.pump();
    await tester.tap(save);
    await tester.pumpAndSettle();
    expect(patches.single, {'full_name': 'Trần Thị Bình', 'avatar': 'data:image/png;base64,${base64Encode(png)}'});
    expect(store.userName, 'Trần Thị Bình');
    expect(store.userAvatar, png);
    expect(find.byType(PassengerEditProfileScreen), findsNothing, reason: 'back on the settings tab');
    expect(find.text('Trần Thị Bình'), findsOneWidget);
  });
}
