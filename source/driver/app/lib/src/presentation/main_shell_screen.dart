import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import 'driver_change_pin_screen.dart';
import 'driver_login_screen.dart';
import 'driver_about_screen.dart';
import 'driver_device_ready.dart';
import 'driver_offline_sync_screen.dart';
import 'driver_schedule_screen.dart';
import 'driver_store.dart';
import 'driver_today_trips_screen.dart';
import 'driver_widgets.dart';

/// Pre-start mode: three tabs (DRI-002 trips, DRI-015 sync, DRI-018 profile). The cockpit opens on top
/// of it once the trip starts and has no tab bar.
class MainShellScreen extends StatefulWidget {
  const MainShellScreen({super.key});

  @override
  State<MainShellScreen> createState() => _MainShellScreenState();
}

class _MainShellScreenState extends State<MainShellScreen> {
  int _index = 0;
  bool _redirecting = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _checkPinChange();
  }

  void _checkPinChange() {
    final store = DriverScope.of(context);
    if (store.mustChangePin && !_redirecting) {
      _redirecting = true;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted && store.mustChangePin) {
          Navigator.of(context).pushAndRemoveUntil(
            MaterialPageRoute(builder: (_) => const DriverChangePinScreen()),
            (_) => false,
          );
        } else {
          _redirecting = false;
        }
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    _checkPinChange();
    const pages = [DriverTodayTripsScreen(), DriverScheduleScreen(), DriverOfflineSyncScreen(), _ProfileTab()];
    if (dWide(context)) {
      // Landscape tablet: the tabs move to a rail on the left and give the height back to the content.
      return Scaffold(
        body: Row(children: [
          Container(
            width: 104,
            decoration: const BoxDecoration(color: DTokens.panel2, border: Border(right: BorderSide(color: DTokens.lineSoft))),
            child: SafeArea(
              right: false,
              child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                for (final (i, icon, label) in const [
                  (0, Icons.directions_bus_outlined, 'Chuyến'),
                  (1, Icons.calendar_month_outlined, 'Lịch'),
                  (2, Icons.sync, 'Đồng bộ'),
                  (3, Icons.person_outline, 'Hồ sơ')
                ])
                  SizedBox(height: 88, child: _tab(i, icon, label)),
              ]),
            ),
          ),
          Expanded(child: FadeIndexedStack(index: _index, children: pages)),
        ]),
      );
    }
    return Scaffold(
      body: FadeIndexedStack(index: _index, children: pages),
      bottomNavigationBar: Container(
        decoration: const BoxDecoration(color: DTokens.panel2, border: Border(top: BorderSide(color: DTokens.lineSoft))),
        child: SafeArea(
          top: false,
          child: SizedBox(
            height: 68,
            child: Row(children: [
              Expanded(child: _tab(0, Icons.directions_bus_outlined, 'Chuyến')),
              Expanded(child: _tab(1, Icons.calendar_month_outlined, 'Lịch')),
              Expanded(child: _tab(2, Icons.sync, 'Đồng bộ')),
              Expanded(child: _tab(3, Icons.person_outline, 'Hồ sơ')),
            ]),
          ),
        ),
      ),
    );
  }

  Widget _tab(int i, IconData icon, String label) {
    final selected = _index == i;
    final color = selected ? DTokens.primaryInk : DTokens.muted;
    return Semantics(
      selected: selected,
      button: true,
      label: label,
      excludeSemantics: true,
      child: InkWell(
        onTap: () => setState(() => _index = i),
        child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
          // The chosen tab's icon gives a small bounce, as SF Symbols do on iOS 17.
          AnimatedScale(scale: selected ? 1.12 : 1, duration: Motion.base, curve: Curves.easeOutBack, child: Icon(icon, color: color)),
          const SizedBox(height: 4),
          Text(label, style: dsans(size: 13, weight: selected ? FontWeight.w600 : FontWeight.w400, color: color)),
        ]),
      ),
    );
  }
}

/// DRI-018: driver, licence, device; ending the shift is refused while a trip runs.
class _ProfileTab extends StatelessWidget {
  const _ProfileTab();

  @override
  Widget build(BuildContext context) {
    final store = DriverScope.of(context);
    return SafeArea(
      child: DMaxWidth(child: ListView(padding: const EdgeInsets.all(16), children: [
        Text('Hồ sơ', style: dsans(size: 22, weight: FontWeight.w700)),
        const SizedBox(height: 16),
        Panel(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(store.driverName.isNotEmpty ? store.driverName : 'Trần Văn Bình', style: dsans(size: 18, weight: FontWeight.w700)),
            const SizedBox(height: 6),
            Text('Mã nhân viên ${store.staffId.isNotEmpty ? store.staffId : 'TX8821'}', style: dsans(size: 14, color: DTokens.sub)),
            if (store.operatorName.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 2),
                child: Text(store.operatorHotline.isEmpty ? store.operatorName : '${store.operatorName} · Tổng đài ${store.operatorHotline}', style: dsans(size: 14, color: DTokens.sub)),
              ),
            if (store.licenseClass.isNotEmpty)
              Text(
                'Bằng lái hạng ${store.licenseClass}${_date(store.licenseValidUntil).isEmpty ? '' : ' · còn hạn đến ${_date(store.licenseValidUntil)}'}',
                style: dsans(size: 14, color: DTokens.sub),
              ),
          ]),
        ),
        const SizedBox(height: 12),
        const Panel(child: DriverLocationStatus()),
        const SizedBox(height: 16),
        if (store.operatorHotline.isNotEmpty) ...[
          BigButton(
            label: 'Gọi tổng đài ${store.operatorHotline}',
            icon: Icons.call,
            onPressed: () => _call(context, store.operatorHotline),
          ),
          const SizedBox(height: 12),
        ],
        BigButton(
          label: 'Đổi mã PIN',
          outline: true,
          color: const Color(0xFFE2E8F0),
          onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const DriverChangePinScreen())),
        ),
        const SizedBox(height: 12),
        // SH-006: terms of use and licences (D157).
        BigButton(
          label: 'Giới thiệu và điều khoản',
          outline: true,
          color: DTokens.sub,
          onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const DriverAboutScreen())),
        ),
        const SizedBox(height: 12),
        BigButton(
          label: 'Kết thúc ca và đăng xuất',
          outline: true,
          color: const Color(0xFFE2E8F0),
          onPressed: () async {
            if (store.trip == TripState.inTransit) {
              dToast(context, 'Chuyến đang chạy: hãy kết thúc chuyến trước');
              return;
            }
            final yes = await showDriverSheet<bool>(context, builder: (ctx) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  Text('Kết thúc ca và đăng xuất?', style: dsans(size: 18, weight: FontWeight.w700)),
                  const SizedBox(height: 8),
                  Text('Lần sau vào ca chỉ cần nhập lại mã PIN.', style: dsans(size: 15, color: DTokens.sub, height: 1.5)),
                  const SizedBox(height: 14),
                  SheetActions(
                    primary: BigButton(label: 'Đăng xuất', onPressed: () => Navigator.of(ctx).pop(true)),
                    secondary: BigButton(label: 'Ở lại', outline: true, color: const Color(0xFFE2E8F0), onPressed: () => Navigator.of(ctx).pop(false)),
                  ),
                ]));
            if (yes != true || !context.mounted) return;
            store.logout();
            Navigator.of(context).pushAndRemoveUntil(MaterialPageRoute(builder: (_) => const DriverLoginScreen()), (_) => false);
          },
        ),
      ])),
    );
  }
}

/// "2028-12-31" as "31/12/2028"; anything else as it is.
String _date(String iso) {
  final d = DateTime.tryParse(iso);
  if (d == null) return iso;
  return '${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')}/${d.year}';
}

Future<void> _call(BuildContext context, String number) async {
  var ok = false;
  try {
    ok = await launchUrl(Uri.parse('tel:${number.replaceAll(RegExp(r'[^0-9+]'), '')}'));
  } catch (_) {
    ok = false;
  }
  if (!ok && context.mounted) dToast(context, 'Không mở được trình gọi điện, hãy gọi $number');
}
