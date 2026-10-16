import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';

import 'passenger_store.dart';

/// D145: push notifications through Firebase Cloud Messaging. The phone's token goes to the server, which then
/// sends "the bus is coming" by push instead of SMS. Without the project's Firebase files the app runs on: no push,
/// the server keeps sending SMS.
Future<void> startPush(PassengerStore store) async {
  try {
    await Firebase.initializeApp();
  } catch (_) {
    return;
  }
  final messaging = FirebaseMessaging.instance;
  try {
    final token = await messaging.getToken();
    // Debug builds print it, to send a test push from the server or the Firebase console.
    if (kDebugMode) debugPrint('BusGo push token: $token');
    await store.setPushToken(token);
  } catch (_) {
    // No Google Play services (some emulators, Huawei phones): SMS keeps the passenger informed.
  }
  messaging.onTokenRefresh.listen((t) => unawaited(store.setPushToken(t)));
  // A push while the app is open: the notice list reloads and its banner shows on top of the screen.
  FirebaseMessaging.onMessage.listen((_) => unawaited(store.loadNotices()));
  FirebaseMessaging.onMessageOpenedApp.listen((_) => unawaited(store.loadNotices()));
}
