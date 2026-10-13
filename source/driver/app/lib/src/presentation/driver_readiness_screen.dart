import 'package:flutter/material.dart';

import 'driver_cockpit_dashboard.dart';
import 'driver_home_run_screen.dart';
import 'driver_incident_dialog.dart';
import 'driver_manifest_screen.dart';
import 'driver_permissions.dart';
import 'driver_store.dart';
import 'driver_widgets.dart';

/// DRI-004: the start button stays disabled until the six checks are ticked (D98);
/// DRI-005 is the confirmation sheet.
class DriverReadinessScreen extends StatelessWidget {
  const DriverReadinessScreen({super.key});

  Future<void> _confirmStart(BuildContext context, DriverStore store) async {
    if (!await ensureDriverLocation(context)) return;
    if (!context.mounted) return;
    // Passengers may have booked since the shift was loaded: count them from the server, not the login snapshot.
    await store.refreshTrip();
    if (!context.mounted) return;
    final yes = await showDriverSheet<bool>(context, builder: (ctx) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text('Xuất bến chuyến ${store.depTime}?', style: dsans(size: 18, weight: FontWeight.w700)),
          const SizedBox(height: 12),
          Row(children: [
            Expanded(child: Stat('Khách đã đặt', '${store.manifest.length}', size: 28)),
            const SizedBox(width: 10),
            Expanded(child: Stat('Giờ chạy', store.depTime, size: 28)),
          ]),
          const SizedBox(height: 12),
          Text('App sẽ gửi vị trí xe liên tục cho điều hành và khách đến khi kết thúc chuyến.', style: dsans(size: 15, color: DTokens.sub, height: 1.5)),
          const SizedBox(height: 14),
          SheetActions(
            primary: BigButton(label: 'Xuất bến', color: DTokens.ok, height: 72, onPressed: () => Navigator.of(ctx).pop(true)),
            secondary: BigButton(label: 'Chưa', outline: true, color: const Color(0xFFE2E8F0), height: dWide(ctx) ? 72 : 56, onPressed: () => Navigator.of(ctx).pop(false)),
          ),
        ]));
    if (yes != true || !context.mounted) return;
    final error = await store.startTrip();
    if (!context.mounted) return;
    if (error != null) {
      dToast(context, error);
      return;
    }
    Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => const DriverCockpitDashboard()));
    Navigator.of(context).push(MaterialPageRoute(builder: (_) => const DriverManifestScreen()));
  }

  /// D143: home pickups are collected before the checks at the stop; setting off starts sending the bus position.
  Future<void> _homeRun(BuildContext context, DriverStore store) async {
    // D145: the passengers follow the bus by its position, so the app needs location first.
    if (!store.homeRunStarted && !await ensureDriverLocation(context)) return;
    if (!context.mounted) return;
    if (!store.homeRunStarted) {
      final error = await store.startHomeRun();
      if (!context.mounted) return;
      if (error != null) {
        dToast(context, error);
        return;
      }
    }
    Navigator.of(context).push(MaterialPageRoute(builder: (_) => const DriverHomeRunScreen()));
  }

  @override
  Widget build(BuildContext context) {
    final store = DriverScope.of(context);
    final homes = store.manifest.where((p) => p.homePickup != null).length;
    final homeWaiting = store.homePickupsWaiting.length;
    final homePanel = homes == 0
        ? null
        : Padding(
            padding: EdgeInsets.fromLTRB(dWide(context) ? 24 : 16, 16, dWide(context) ? 24 : 16, 0),
            child: Panel(
              border: const Color(0xFFA16207),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Text('Đón tận nhà · $homeWaiting/$homes khách chờ', style: dsans(size: 17, weight: FontWeight.w700, color: DTokens.warnInk)),
                const SizedBox(height: 4),
                Text(
                  store.homeRunStarted
                      ? 'Đang gửi vị trí, khách thấy xe đang tới nhà mình.'
                      : 'Khung đón ${store.homeWindow ?? ''}. Bấm khi lên đường: khách được báo và theo dõi được xe tới nhà.',
                  style: dsans(size: 14, color: DTokens.sub, height: 1.4),
                ),
                const SizedBox(height: 10),
                BigButton(
                  label: store.homeRunStarted ? 'Mở danh sách đón tận nhà' : 'Đi đón khách tận nhà',
                  icon: Icons.home_outlined,
                  color: DTokens.warn,
                  foreground: const Color(0xFF1C1917),
                  onPressed: () => _homeRun(context, store),
                ),
              ]),
            ),
          );
    final done = store.checked.where((c) => c).length;
    final color = done == 6 ? const Color(0xFF22C55E) : const Color(0xFFFBBF24);
    final wide = dWide(context);
    // A Material, not a decorated Container, so the tile's ink ripple stays visible.
    Widget check(int i) => Material(
          color: DTokens.panel,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10), side: BorderSide(color: store.checked[i] ? const Color(0xFF166534) : DTokens.line)),
          clipBehavior: Clip.antiAlias,
          child: CheckboxListTile(
            value: store.checked[i],
            onChanged: (v) => store.toggleCheck(i, v ?? false),
            controlAffinity: ListTileControlAffinity.leading,
            activeColor: const Color(0xFF22C55E),
            contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            title: Text(DriverStore.checks[i], style: dsans(size: wide ? 18 : 16, weight: FontWeight.w500)),
          ),
        );
    final start = BigButton(
      label: done < 6 ? 'Còn ${6 - done} mục chưa kiểm tra' : 'Xuất bến',
      subtitle: done < 6 ? null : '${store.manifest.length} khách · ${store.stops.isEmpty ? '' : store.stops.first.short} ${store.depTime}',
      color: DTokens.ok,
      height: 72,
      onPressed: done < 6 ? null : () => _confirmStart(context, store),
    );
    final report = TextButton(
      onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const DriverIncidentScreen())),
      style: TextButton.styleFrom(minimumSize: const Size(48, 48)),
      child: Text('Xe có vấn đề, báo điều hành', style: dsans(size: 15, weight: FontWeight.w600, color: DTokens.dangerInk)),
    );
    return Scaffold(
      appBar: DHeader(title: 'Kiểm tra xe', subtitle: '${store.plate} · chuyến ${store.depTime}', trailing: Text('$done/6', style: dmono(size: 16, color: color))),
      body: Column(children: [
        LinearProgressIndicator(value: done / 6, minHeight: 4, color: color, backgroundColor: DTokens.panel),
        if (homePanel != null) homePanel,
        Expanded(
          child: wide
              // Tablet: the six checks in two columns of large tiles, all visible without scrolling.
              ? GridView.builder(
                  padding: const EdgeInsets.all(24),
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 2, mainAxisSpacing: 12, crossAxisSpacing: 12, mainAxisExtent: 76),
                  itemCount: DriverStore.checks.length,
                  itemBuilder: (_, i) => check(i),
                )
              : ListView.separated(
                  padding: const EdgeInsets.all(16),
                  itemCount: DriverStore.checks.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 10),
                  itemBuilder: (_, i) => check(i),
                ),
        ),
      ]),
      bottomNavigationBar: SafeArea(
        child: Container(
          decoration: const BoxDecoration(border: Border(top: BorderSide(color: DTokens.lineSoft))),
          padding: EdgeInsets.fromLTRB(wide ? 24 : 16, 12, wide ? 24 : 16, 12),
          child: wide
              ? Row(children: [report, const Spacer(), SizedBox(width: 440, child: start)])
              : Column(mainAxisSize: MainAxisSize.min, children: [start, report]),
        ),
      ),
    );
  }
}
