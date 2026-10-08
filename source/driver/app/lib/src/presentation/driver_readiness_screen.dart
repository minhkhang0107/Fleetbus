import 'package:flutter/material.dart';

import 'driver_cockpit_dashboard.dart';
import 'driver_incident_dialog.dart';
import 'driver_manifest_screen.dart';
import 'driver_store.dart';
import 'driver_widgets.dart';

/// DRI-004: the start button stays disabled until the six checks are ticked (D98);
/// DRI-005 is the confirmation sheet.
class DriverReadinessScreen extends StatelessWidget {
  const DriverReadinessScreen({super.key});

  Future<void> _confirmStart(BuildContext context, DriverStore store) async {
    final yes = await showDriverSheet<bool>(context, builder: (ctx) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text('Xuất bến chuyến ${store.depTime}?', style: dsans(size: 18, weight: FontWeight.w700)),
          const SizedBox(height: 12),
          Row(children: [
            Expanded(child: Stat('Khách đã đặt', '${store.manifest.length}')),
            const SizedBox(width: 10),
            Expanded(child: Stat('Giờ chạy', store.depTime)),
          ]),
          const SizedBox(height: 12),
          Text('App sẽ gửi vị trí xe liên tục cho điều hành và khách đến khi kết thúc chuyến.', style: dsans(size: 15, color: DTokens.sub, height: 1.5)),
          const SizedBox(height: 14),
          BigButton(label: 'Xuất bến', color: DTokens.ok, height: 72, onPressed: () => Navigator.of(ctx).pop(true)),
          const SizedBox(height: 8),
          BigButton(label: 'Chưa', outline: true, color: const Color(0xFFE2E8F0), onPressed: () => Navigator.of(ctx).pop(false)),
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

  @override
  Widget build(BuildContext context) {
    final store = DriverScope.of(context);
    final done = store.checked.where((c) => c).length;
    final color = done == 6 ? const Color(0xFF22C55E) : const Color(0xFFFBBF24);
    return Scaffold(
      appBar: DHeader(title: 'Kiểm tra xe', subtitle: '${store.plate} · chuyến ${store.depTime}', trailing: Text('$done/6', style: dmono(size: 16, color: color))),
      body: Column(children: [
        LinearProgressIndicator(value: done / 6, minHeight: 4, color: color, backgroundColor: DTokens.panel),
        Expanded(
          child: ListView.separated(
            padding: const EdgeInsets.all(16),
            itemCount: DriverStore.checks.length,
            separatorBuilder: (_, __) => const SizedBox(height: 10),
            itemBuilder: (_, i) => Container(
              decoration: BoxDecoration(color: DTokens.panel, borderRadius: BorderRadius.circular(10), border: Border.all(color: store.checked[i] ? const Color(0xFF166534) : DTokens.line)),
              child: CheckboxListTile(
                value: store.checked[i],
                onChanged: (v) => store.toggleCheck(i, v ?? false),
                controlAffinity: ListTileControlAffinity.leading,
                activeColor: const Color(0xFF22C55E),
                contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                title: Text(DriverStore.checks[i], style: dsans(size: 16, weight: FontWeight.w500)),
              ),
            ),
          ),
        ),
      ]),
      bottomNavigationBar: SafeArea(
        child: Container(
          decoration: const BoxDecoration(border: Border(top: BorderSide(color: DTokens.lineSoft))),
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            BigButton(
              label: done < 6 ? 'Còn ${6 - done} mục chưa kiểm tra' : 'Xuất bến',
              subtitle: done < 6 ? null : '${store.manifest.length} khách · ${store.stops.isEmpty ? '' : store.stops.first.short} ${store.depTime}',
              color: DTokens.ok,
              height: 72,
              onPressed: done < 6 ? null : () => _confirmStart(context, store),
            ),
            TextButton(
              onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const DriverIncidentScreen())),
              style: TextButton.styleFrom(minimumSize: const Size(48, 48)),
              child: Text('Xe có vấn đề, báo điều hành', style: dsans(size: 15, weight: FontWeight.w600, color: DTokens.dangerInk)),
            ),
          ]),
        ),
      ),
    );
  }
}
