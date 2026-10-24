import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:geolocator/geolocator.dart';
import 'package:permission_handler/permission_handler.dart';

import 'driver_widgets.dart';

/// D145: the permissions the cab needs, each asked with a sheet that says why before the system dialog, and a way
/// to the settings when the driver refused for good.
///
/// Location: while the app is used (the bus position for passengers and the office), then "all the time" so the
/// position keeps going with the screen off. Camera: the boarding QR; without it the PIN path still works.

enum LocationAccess { off, denied, deniedForever, whileInUse, always }

/// The system side, behind an interface so tests and the simulator run without a device.
abstract class DevicePermissions {
  Future<LocationAccess> location();
  Future<LocationAccess> requestLocation();
  Future<LocationAccess> requestBackgroundLocation();
  Future<bool> camera({bool request = false});
  Future<void> openSettings();
  Future<void> openLocationSettings();
}

class SystemPermissions implements DevicePermissions {
  const SystemPermissions();

  LocationAccess _of(LocationPermission p) => switch (p) {
        LocationPermission.always => LocationAccess.always,
        LocationPermission.whileInUse => LocationAccess.whileInUse,
        LocationPermission.deniedForever => LocationAccess.deniedForever,
        _ => LocationAccess.denied,
      };

  // A device without a location provider throws LOCATION_SERVICES_DISABLED instead of answering false: treat it
  // as location off so the driver sees the sheet rather than a button that does nothing.
  Future<bool> _serviceOn() async {
    try {
      return await Geolocator.isLocationServiceEnabled();
    } on PlatformException {
      return false;
    }
  }

  @override
  Future<LocationAccess> location() async {
    if (!await _serviceOn()) return LocationAccess.off;
    return _of(await Geolocator.checkPermission());
  }

  @override
  Future<LocationAccess> requestLocation() async {
    if (!await _serviceOn()) return LocationAccess.off;
    return _of(await Geolocator.requestPermission());
  }

  @override
  Future<LocationAccess> requestBackgroundLocation() async {
    final status = await Permission.locationAlways.request();
    if (status.isGranted) return LocationAccess.always;
    return location();
  }

  @override
  Future<bool> camera({bool request = false}) async {
    final status = request ? await Permission.camera.request() : await Permission.camera.status;
    return status.isGranted;
  }

  @override
  Future<void> openSettings() => openAppSettings();

  @override
  Future<void> openLocationSettings() async {
    await Geolocator.openLocationSettings();
  }
}

/// The permissions of this app run; tests swap in a fake.
DevicePermissions driverPermissions = const SystemPermissions();

/// Asks for location the way a driver understands it. Returns true when the app may send the bus position
/// (while in use at least); "all the time" is asked for after, and its refusal only warns.
Future<bool> ensureDriverLocation(BuildContext context) async {
  var access = await driverPermissions.location();
  if (access == LocationAccess.always) return true;
  if (!context.mounted) return false;

  if (access == LocationAccess.off) {
    final open = await _sheet(context,
        title: 'Bật định vị trên máy',
        body: 'Định vị (GPS) của máy đang tắt. Khách và điều hành cần vị trí xe để biết xe đang ở đâu và khi nào tới.',
        primary: 'Mở cài đặt định vị');
    if (open == true) await driverPermissions.openLocationSettings();
    return false;
  }

  if (access == LocationAccess.deniedForever) {
    final open = await _sheet(context,
        title: 'Cần quyền vị trí',
        body: 'Bạn đã từ chối quyền vị trí. Vào Cài đặt > Quyền > Vị trí, chọn "Luôn cho phép" để app gửi vị trí xe trong cả chuyến.',
        primary: 'Mở cài đặt');
    if (open == true) await driverPermissions.openSettings();
    return false;
  }

  if (access == LocationAccess.denied) {
    final go = await _sheet(context,
        title: 'Cho phép app biết vị trí xe',
        body: 'App gửi vị trí xe cho khách đang chờ và cho điều hành trong suốt chuyến: khách biết xe đang ở đâu, khi nào tới đón, không cần gọi điện cho bạn.',
        primary: 'Tiếp tục');
    if (go != true) return false;
    access = await driverPermissions.requestLocation();
    if (access == LocationAccess.denied || access == LocationAccess.deniedForever) {
      if (context.mounted) dToast(context, 'Chưa có quyền vị trí: khách sẽ không thấy xe');
      return false;
    }
  }

  if (access == LocationAccess.whileInUse && context.mounted) {
    final go = await _sheet(context,
        title: 'Chọn "Luôn cho phép"',
        body: 'Để vị trí vẫn được gửi khi màn hình tắt hoặc bạn mở app khác (bản đồ, điện thoại), chọn "Luôn cho phép" ở màn tiếp theo.',
        primary: 'Tiếp tục',
        secondary: 'Để sau');
    if (go == true) access = await driverPermissions.requestBackgroundLocation();
    if (access != LocationAccess.always && context.mounted) {
      dToast(context, 'Vị trí chỉ gửi khi app đang mở trên màn hình');
    }
  }
  return access == LocationAccess.whileInUse || access == LocationAccess.always;
}

/// Asks for the camera when the scanner opens. Returns true when it may be used.
Future<bool> ensureDriverCamera(BuildContext context) async {
  if (await driverPermissions.camera()) return true;
  if (!context.mounted) return false;
  final go = await _sheet(context,
      title: 'Cho phép dùng camera',
      body: 'Camera dùng để quét mã QR trên vé của khách khi lên xe. Không có camera vẫn cho lên xe được bằng mã PIN.',
      primary: 'Tiếp tục',
      secondary: 'Dùng mã PIN');
  if (go != true) return false;
  if (await driverPermissions.camera(request: true)) return true;
  if (!context.mounted) return false;
  final open = await _sheet(context,
      title: 'Chưa có quyền camera',
      body: 'Vào Cài đặt > Quyền > Camera để bật lại. Trong lúc đó, nhập mã PIN của khách.',
      primary: 'Mở cài đặt',
      secondary: 'Dùng mã PIN');
  if (open == true) await driverPermissions.openSettings();
  return false;
}

Future<bool?> _sheet(BuildContext context, {required String title, required String body, required String primary, String secondary = 'Không phải bây giờ'}) {
  return showDriverSheet<bool>(context, builder: (ctx) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text(title, style: dsans(size: 18, weight: FontWeight.w700)),
        const SizedBox(height: 8),
        Text(body, style: dsans(size: 15, color: DTokens.sub, height: 1.5)),
        const SizedBox(height: 16),
        SheetActions(
          primary: BigButton(label: primary, onPressed: () => Navigator.of(ctx).pop(true)),
          secondary: BigButton(label: secondary, outline: true, color: const Color(0xFFE2E8F0), onPressed: () => Navigator.of(ctx).pop(false)),
        ),
      ]));
}
