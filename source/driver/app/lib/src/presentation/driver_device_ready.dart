import 'package:flutter/material.dart';

import 'driver_permissions.dart';
import 'driver_widgets.dart';

/// D188: the location and notification permissions can be given from the trips tab, before the trip, so the
/// departure is not held up by several system dialogs in a row. Hidden once location is allowed all the time.
class DriverDeviceReadyBanner extends StatefulWidget {
  const DriverDeviceReadyBanner({super.key});

  @override
  State<DriverDeviceReadyBanner> createState() => _DriverDeviceReadyBannerState();
}

class _DriverDeviceReadyBannerState extends State<DriverDeviceReadyBanner> {
  LocationAccess? _access;

  @override
  void initState() {
    super.initState();
    _check();
  }

  Future<void> _check() async {
    final access = await driverPermissions.location();
    if (mounted) setState(() => _access = access);
  }

  Future<void> _prepare() async {
    await driverPermissions.requestNotifications();
    if (!mounted) return;
    await ensureDriverLocation(context);
    await _check();
  }

  @override
  Widget build(BuildContext context) {
    if (_access == null || _access == LocationAccess.always) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Panel(
        color: DTokens.warnBg,
        border: const Color(0xFFA16207),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text('Máy chưa bật vị trí cho ca chạy', style: dsans(size: 15, weight: FontWeight.w700, color: DTokens.warnInk)),
          const SizedBox(height: 4),
          Text('Bật ngay bây giờ để lúc xuất bến không phải chờ.', style: dsans(size: 14, color: DTokens.sub)),
          const SizedBox(height: 10),
          BigButton(label: 'Bật vị trí và thông báo', color: DTokens.warn, foreground: const Color(0xFF1C1917), onPressed: _prepare),
        ]),
      ),
    );
  }
}

/// The location permission as the driver should read it, for the profile tab.
class DriverLocationStatus extends StatefulWidget {
  const DriverLocationStatus({super.key});

  @override
  State<DriverLocationStatus> createState() => _DriverLocationStatusState();
}

class _DriverLocationStatusState extends State<DriverLocationStatus> {
  LocationAccess? _access;

  @override
  void initState() {
    super.initState();
    driverPermissions.location().then((a) {
      if (mounted) setState(() => _access = a);
    });
  }

  @override
  Widget build(BuildContext context) {
    final (text, ok) = switch (_access) {
      null => ('Đang kiểm tra vị trí…', true),
      LocationAccess.always => ('Vị trí: đã cho phép cả khi tắt màn hình', true),
      LocationAccess.whileInUse => ('Vị trí: chỉ gửi khi app đang mở', false),
      LocationAccess.off => ('Vị trí: định vị của máy đang tắt', false),
      _ => ('Vị trí: chưa cho phép', false),
    };
    return Text(text, style: dsans(size: 14, color: ok ? DTokens.sub : DTokens.warnInk));
  }
}
