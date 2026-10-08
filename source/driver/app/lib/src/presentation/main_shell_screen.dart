import 'package:flutter/material.dart';

import 'driver_login_screen.dart';
import 'driver_offline_sync_screen.dart';
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

  @override
  Widget build(BuildContext context) {
    const pages = [DriverTodayTripsScreen(), DriverOfflineSyncScreen(), _ProfileTab()];
    return Scaffold(
      body: IndexedStack(index: _index, children: pages),
      bottomNavigationBar: Container(
        decoration: const BoxDecoration(color: DTokens.panel2, border: Border(top: BorderSide(color: DTokens.lineSoft))),
        child: SafeArea(
          top: false,
          child: SizedBox(
            height: 68,
            child: Row(children: [
              _tab(0, Icons.directions_bus_outlined, 'Chuyến'),
              _tab(1, Icons.sync, 'Đồng bộ'),
              _tab(2, Icons.person_outline, 'Hồ sơ'),
            ]),
          ),
        ),
      ),
    );
  }

  Widget _tab(int i, IconData icon, String label) {
    final selected = _index == i;
    final color = selected ? DTokens.primaryInk : DTokens.muted;
    return Expanded(
      child: Semantics(
        selected: selected,
        button: true,
        label: label,
        excludeSemantics: true,
        child: InkWell(
          onTap: () => setState(() => _index = i),
          child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
            Icon(icon, color: color),
            const SizedBox(height: 4),
            Text(label, style: dsans(size: 13, weight: selected ? FontWeight.w600 : FontWeight.w400, color: color)),
          ]),
        ),
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
      child: ListView(padding: const EdgeInsets.all(16), children: [
        Text('Hồ sơ', style: dsans(size: 22, weight: FontWeight.w700)),
        const SizedBox(height: 16),
        Panel(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Trần Văn Bình', style: dsans(size: 18, weight: FontWeight.w700)),
            const SizedBox(height: 6),
            Text('Mã nhân viên TX8821', style: dsans(size: 14, color: DTokens.sub)),
            Text('Bằng lái hạng FC · còn hạn đến 31/12/2028', style: dsans(size: 14, color: DTokens.sub)),
          ]),
        ),
        const SizedBox(height: 12),
        Panel(child: Text('Định vị đã cấp quyền chạy nền', style: dsans(size: 14, color: DTokens.sub))),
        const SizedBox(height: 16),
        BigButton(
          label: 'Kết thúc ca và đăng xuất',
          outline: true,
          color: const Color(0xFFE2E8F0),
          onPressed: () {
            if (store.trip == TripState.inTransit) {
              dToast(context, 'Chuyến đang chạy: hãy kết thúc chuyến trước');
              return;
            }
            store.logout();
            Navigator.of(context).pushAndRemoveUntil(MaterialPageRoute(builder: (_) => const DriverLoginScreen()), (_) => false);
          },
        ),
      ]),
    );
  }
}
