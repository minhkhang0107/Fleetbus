import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'passenger_widgets.dart';

/// D145: the passenger app asks for a permission only when it is about to be useful, with a sentence saying why:
/// notifications after a booking or when following the bus, location when the passenger taps "my location".

/// The system side, behind an interface so tests run without a device.
abstract class PassengerDevicePermissions {
  /// Null when the platform has no such permission to ask (older Android).
  Future<bool?> notificationsGranted();
  Future<bool> requestNotifications();
  Future<({double lat, double lng})?> currentPosition();
  Future<void> openSettings();
}

class PassengerSystemPermissions implements PassengerDevicePermissions {
  const PassengerSystemPermissions();

  @override
  Future<bool?> notificationsGranted() async {
    final status = await Permission.notification.status;
    return status.isGranted || status.isProvisional ? true : (status.isPermanentlyDenied ? false : (status.isDenied ? false : null));
  }

  @override
  Future<bool> requestNotifications() async {
    final status = await Permission.notification.request();
    return status.isGranted || status.isProvisional;
  }

  @override
  Future<({double lat, double lng})?> currentPosition() async {
    if (!await Geolocator.isLocationServiceEnabled()) return null;
    var p = await Geolocator.checkPermission();
    if (p == LocationPermission.denied) p = await Geolocator.requestPermission();
    if (p == LocationPermission.denied || p == LocationPermission.deniedForever) return null;
    final pos = await Geolocator.getCurrentPosition(locationSettings: const LocationSettings(accuracy: LocationAccuracy.high, timeLimit: Duration(seconds: 15)));
    return (lat: pos.latitude, lng: pos.longitude);
  }

  @override
  Future<void> openSettings() => openAppSettings();
}

PassengerDevicePermissions passengerPermissions = const PassengerSystemPermissions();

const _askedKey = 'notifications_asked';

/// Asks once for notifications, with the reason, after a booking or when the passenger opens the bus tracking.
/// A refusal is remembered: the app does not ask again on its own (the profile screen can send to the settings).
Future<void> offerNotifications(BuildContext context, {required String reason}) async {
  final granted = await passengerPermissions.notificationsGranted();
  if (granted == true) return;
  final prefs = await SharedPreferences.getInstance();
  if (prefs.getBool(_askedKey) == true) return;
  if (!context.mounted) return;
  final go = await showModalBottomSheet<bool>(
    context: context,
    showDragHandle: true,
    builder: (ctx) => SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          const Icon(Icons.notifications_active_outlined, size: 40, color: PTokens.primary),
          gap(12),
          Text('Bật thông báo để không lỡ xe', textAlign: TextAlign.center, style: sans(size: 18, weight: FontWeight.w700, color: PTokens.ink)),
          gap(8),
          Text(reason, textAlign: TextAlign.center, style: sans(size: 14, color: PTokens.muted, height: 1.5)),
          gap(16),
          PrimaryButton(label: 'Bật thông báo', onPressed: () => Navigator.of(ctx).pop(true)),
          gap(8),
          GhostButton(label: 'Để sau', onPressed: () => Navigator.of(ctx).pop(false)),
        ]),
      ),
    ),
  );
  await prefs.setBool(_askedKey, true);
  if (go == true) await passengerPermissions.requestNotifications();
}

/// The passenger's position for the home address pin, or null with a message shown (no service, refused).
Future<({double lat, double lng})?> myLocation(BuildContext context) async {
  try {
    final pos = await passengerPermissions.currentPosition();
    if (pos == null && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: const Text('Chưa lấy được vị trí: bật định vị và cho phép app dùng vị trí, hoặc chạm lên bản đồ.'),
        action: SnackBarAction(label: 'Cài đặt', onPressed: passengerPermissions.openSettings),
      ));
    }
    return pos;
  } catch (_) {
    if (context.mounted) showToast(context, 'Chưa lấy được vị trí, hãy chạm lên bản đồ');
    return null;
  }
}
