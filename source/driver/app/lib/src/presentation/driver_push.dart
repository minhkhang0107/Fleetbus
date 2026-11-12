import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';

import 'driver_store.dart';

/// D192: pushes from the office through Firebase Cloud Messaging: a trip given, taken to another driver, its bus
/// changed, or cancelled. Without the project's Firebase settings the app runs on and the trip list still reloads.
Future<void> startDriverPush(DriverStore store) async {
  if (!await initDriverFirebase()) return;
  final messaging = FirebaseMessaging.instance;
  try {
    // iPhone: the Firebase token needs the APNs one first, which comes a moment after start.
    if (defaultTargetPlatform == TargetPlatform.iOS) {
      for (var i = 0; i < 5 && await messaging.getAPNSToken() == null; i++) {
        await Future<void>.delayed(const Duration(seconds: 1));
      }
    }
    final token = await messaging.getToken();
    if (kDebugMode) debugPrint('BusGo driver push token: $token');
    await store.setPushToken(token);
  } catch (_) {
    // No Google Play services or no APNs yet: the refresh below brings the token later.
  }
  messaging.onTokenRefresh.listen((t) => unawaited(store.setPushToken(t)));
  FirebaseMessaging.onMessage.listen((m) => unawaited(store.onPushWhileOpen(m.notification?.title ?? '', m.notification?.body ?? '')));
  FirebaseMessaging.onMessageOpenedApp.listen((m) => unawaited(store.openFromPush(m.data['trip_id']?.toString())));
  final first = await messaging.getInitialMessage();
  if (first != null) unawaited(store.openFromPush(first.data['trip_id']?.toString()));
}

/// Firebase from the build's files, else from `--dart-define`s (docs/firebase-push.md); false when neither is there.
Future<bool> initDriverFirebase() async {
  if (Firebase.apps.isNotEmpty) return true;
  try {
    await Firebase.initializeApp();
    return true;
  } catch (_) {}
  final options = driverFirebaseOptions(defaultTargetPlatform);
  if (options == null) return false;
  try {
    await Firebase.initializeApp(options: options);
    return true;
  } catch (_) {
    return false;
  }
}

/// The app's Firebase settings given at build time for the platform it runs on; null when not given.
FirebaseOptions? driverFirebaseOptions(TargetPlatform platform) {
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
