import 'package:app/src/presentation/passenger/passenger_permissions.dart';

/// Permissions without a device: granted unless a test says otherwise, every request recorded.
class FakePassengerPermissions implements PassengerDevicePermissions {
  FakePassengerPermissions({this.notifications = true, this.position});
  bool? notifications;
  ({double lat, double lng})? position;
  final List<String> asked = [];

  @override
  Future<bool?> notificationsGranted() async => notifications;
  @override
  Future<bool> requestNotifications() async {
    asked.add('notifications');
    return notifications = true;
  }

  @override
  Future<({double lat, double lng})?> currentPosition() async {
    asked.add('location');
    return position;
  }

  @override
  Future<void> openSettings() async => asked.add('settings');
}
