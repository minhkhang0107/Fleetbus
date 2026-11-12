import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';

import 'passenger_store.dart';

/// D145, D192: push notifications through Firebase Cloud Messaging. The phone's token goes to the server, which then
/// sends every notice by push (SMS only for the moments that make someone go out to the bus when there is no token).
/// Without the project's Firebase settings the app runs on: no push, the in-app list and SMS keep the passenger informed.
Future<void> startPush(PassengerStore store) async {
  if (!await initFirebase()) return;
  final messaging = FirebaseMessaging.instance;
  try {
    // iPhone: the Firebase token needs the APNs one first, which comes a moment after start.
    if (defaultTargetPlatform == TargetPlatform.iOS) {
      for (var i = 0; i < 5 && await messaging.getAPNSToken() == null; i++) {
        await Future<void>.delayed(const Duration(seconds: 1));
      }
    }
    final token = await messaging.getToken();
    // Debug builds print it, to send a test push from the server or the Firebase console.
    if (kDebugMode) debugPrint('BusGo push token: $token');
    await store.setPushToken(token);
  } catch (_) {
    // No Google Play services (some emulators, Huawei phones) or no APNs yet: the refresh below brings it later.
  }
  messaging.onTokenRefresh.listen((t) => unawaited(store.setPushToken(t)));
  // A push while the app is open: the notice list reloads and its heads-up shows on top of the screen (D191).
  FirebaseMessaging.onMessage.listen((_) => unawaited(store.loadNotices()));
  // A push tapped while the app was in the background, or the one that started it: open what it is about.
  FirebaseMessaging.onMessageOpenedApp.listen((m) => store.openFromPush(noticeOfPush(m)));
  final first = await messaging.getInitialMessage();
  if (first != null) store.openFromPush(noticeOfPush(first));
}

/// Firebase from the build's files (android/app/google-services.json, ios/Runner/GoogleService-Info.plist), else from
/// `--dart-define`s (docs/firebase-push.md); false when neither is there.
Future<bool> initFirebase() async {
  if (Firebase.apps.isNotEmpty) return true;
  try {
    await Firebase.initializeApp();
    return true;
  } catch (_) {}
  final options = firebaseOptionsFromDefines(defaultTargetPlatform);
  if (options == null) return false;
  try {
    await Firebase.initializeApp(options: options);
    return true;
  } catch (_) {
    return false;
  }
}

/// The app's Firebase settings given at build time for the platform it runs on; null when not given.
FirebaseOptions? firebaseOptionsFromDefines(TargetPlatform platform) {
  const iosAppId = String.fromEnvironment('FIREBASE_IOS_APP_ID');
  const iosApiKey = String.fromEnvironment('FIREBASE_IOS_API_KEY');
  const androidAppId = String.fromEnvironment('FIREBASE_ANDROID_APP_ID');
  const androidApiKey = String.fromEnvironment('FIREBASE_ANDROID_API_KEY');
  const projectId = String.fromEnvironment('FIREBASE_PROJECT_ID', defaultValue: 'busgo-fleetbus');
  const senderId = String.fromEnvironment('FIREBASE_SENDER_ID', defaultValue: '1080641813109');
  const bundleId = String.fromEnvironment('FIREBASE_IOS_BUNDLE_ID');
  final ios = platform == TargetPlatform.iOS;
  final appId = ios ? iosAppId : androidAppId;
  final apiKey = ios ? iosApiKey : androidApiKey;
  if (appId.isEmpty || apiKey.isEmpty) return null;
  return FirebaseOptions(apiKey: apiKey, appId: appId, messagingSenderId: senderId, projectId: projectId, iosBundleId: ios && bundleId.isNotEmpty ? bundleId : null);
}

/// The in-app notice a push stands for: the server sends the notice's id and what it is about as push data.
AppNotice noticeOfPush(RemoteMessage m) => noticeOfPushData(m.data, title: m.notification?.title, body: m.notification?.body);

AppNotice noticeOfPushData(Map<String, dynamic> data, {String? title, String? body}) {
  String? text(String key) {
    final v = data[key]?.toString();
    return v == null || v.isEmpty ? null : v;
  }

  return AppNotice(title ?? '', body ?? '', 'vừa xong', type: text('type') ?? '', id: text('notice_id') ?? '', ticketId: text('ticket_id'), pnr: text('pnr'), tripId: text('trip_id'), isRead: false);
}
