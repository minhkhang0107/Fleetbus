import 'package:flutter/material.dart';

import 'driver_cod_dialog.dart';
import 'driver_end_trip_screen.dart';
import 'driver_incident_dialog.dart';
import 'driver_manifest_screen.dart';
import 'driver_qr_scanner_screen.dart';
import 'driver_route_map.dart';
import 'driver_store.dart';
import 'driver_widgets.dart';

/// DRI-006: glanceable cockpit. While the bus moves only the incident button stays (BR-COCKPIT-005);
/// "Kết thúc chuyến" sits at the last stop, an early end needs a reason (BR-END-005).
class DriverCockpitDashboard extends StatelessWidget {
  const DriverCockpitDashboard({super.key});

  Future<void> _earlyEnd(BuildContext context) async {
    final why = TextEditingController();
    String? error;
    final reason = await showDriverSheet<String>(context, builder: (ctx) => StatefulBuilder(
          builder: (ctx, setSheet) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text('Kết thúc chuyến trước bến cuối?', style: dsans(size: 18, weight: FontWeight.w700)),
            const SizedBox(height: 8),
            Text('Chỉ dùng khi chuyến không thể đi tiếp, ví dụ xe hỏng và khách đã chuyển sang xe khác. Lý do được gửi cho điều hành.', style: dsans(size: 15, color: DTokens.sub, height: 1.5)),
            const SizedBox(height: 12),
            TextField(controller: why, maxLines: 3, maxLength: 200, style: dsans(size: 15), decoration: InputDecoration(labelText: 'Lý do', errorText: error)),
            const SizedBox(height: 14),
            SheetActions(
              primary: BigButton(
                label: 'Tiếp tục kết thúc chuyến',
                color: DTokens.danger,
                onPressed: () {
                  if (why.text.trim().length < 5) {
                    setSheet(() => error = 'Ghi lý do, ít nhất 5 ký tự.');
                    return;
                  }
                  Navigator.of(ctx).pop(why.text.trim());
                },
              ),
              secondary: BigButton(label: 'Quay lại', outline: true, color: const Color(0xFFE2E8F0), onPressed: () => Navigator.of(ctx).pop()),
            ),
          ]),
        ));
    if (reason == null || !context.mounted) return;
    DriverScope.read(context).earlyEndReason = reason;
    Navigator.of(context).push(MaterialPageRoute(builder: (_) => const DriverEndTripScreen()));
  }

  @override
  Widget build(BuildContext context) {
    final store = DriverScope.of(context);
    final s = store.stop;
    final board = store.manifest.where((p) => p.from == s.id && p.status == PaxStatus.waiting).length;
    final drop = store.manifest.where((p) => p.to == s.id && p.status == PaxStatus.boarded).length;
    final cod = store.manifest.where((p) => p.from == s.id && p.codDue && p.status == PaxStatus.waiting).length;
    final eta = store.minutesToNextStop ?? (toMinutes(s.time) - store.clock).clamp(1, 999);
    final wide = dWide(context);
    final speed = _bigMetric('Tốc độ', '${store.speed}', 'km/h');
    // Stopped but not yet confirmed at the stop: the bus is there, a countdown would be wrong.
    final next = store.atStop
        ? _bigMetric('Đến trạm kế', 'Tại', 'trạm')
        : !store.moving
            ? _bigMetric('Đến trạm kế', 'Đã tới', '')
            : _bigMetric('Đến trạm kế', '$eta', 'phút');
    final stopCard = Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: const Color(0xFF172554), border: Border.all(color: const Color(0xFF1D4ED8)), borderRadius: BorderRadius.circular(12)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          Text('${store.atStop ? 'Đang ở trạm' : 'Trạm kế'} ${store.stopIndex + 1}/${store.stops.length}', style: dsans(size: 13, color: const Color(0xFFBFDBFE))),
          const Spacer(),
          Text(s.time, style: dmono(size: 13, weight: FontWeight.w500, color: const Color(0xFFBFDBFE))),
        ]),
        const SizedBox(height: 8),
        Text(s.name, style: dsans(size: wide ? 30 : 24, weight: FontWeight.w700)),
        const SizedBox(height: 12),
        Row(children: [
          Expanded(child: Stat('Đón', '$board', size: wide ? 28 : 20)),
          const SizedBox(width: 8),
          Expanded(child: Stat('Trả', '$drop', size: wide ? 28 : 20)),
          const SizedBox(width: 8),
          Expanded(child: Stat('Thu tiền', '$cod', color: DTokens.warnInk, size: wide ? 28 : 20)),
        ]),
      ]),
    );
    final progress = Panel(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      child: Column(children: [
        Row(children: [Text('Đã lên xe', style: dsans(size: 14, color: DTokens.sub)), const Spacer(), Text('${store.boardedCount}/${store.manifest.length}', style: dmono(size: 15))]),
        const SizedBox(height: 8),
        ClipRRect(
          borderRadius: BorderRadius.circular(999),
          child: LinearProgressIndicator(value: store.manifest.isEmpty ? 0 : store.boardedCount / store.manifest.length, minHeight: 8, color: const Color(0xFF22C55E), backgroundColor: DTokens.line),
        ),
      ]),
    );
    final actions = <Widget>[
      if (store.moving)
        Semantics(
          liveRegion: true,
          child: Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(color: DTokens.panel, borderRadius: BorderRadius.circular(12), border: Border.all(color: const Color(0xFF475569))),
            child: Row(children: [
              const Icon(Icons.lock_outline, color: DTokens.sub),
              const SizedBox(width: 12),
              Expanded(child: Text('Xe đang chạy. Quét vé, danh sách khách và bán vé vẫy mở lại khi xe dừng.', style: dsans(size: 15, color: DTokens.sub, height: 1.4))),
            ]),
          ),
        )
      else ...[
        BigButton(
          label: store.lastStop
            ? 'Đã đến bến cuối · Kết thúc chuyến'
            : store.atStop
                ? 'Mở danh sách đón trả'
                : board > 0
                    ? 'Đã đến trạm · Đón khách'
                    : drop > 0
                        ? 'Đã đến trạm · Trả khách'
                        : 'Đã đến trạm',
          height: 72,
          icon: Icons.place_outlined,
          onPressed: () async {
            final error = await store.arrive();
            if (!context.mounted) return;
            if (error != null) {
              dToast(context, error);
              return;
            }
            if (store.lastStop) {
              Navigator.of(context).push(MaterialPageRoute(builder: (_) => const DriverEndTripScreen()));
              return;
            }
            Navigator.of(context).push(MaterialPageRoute(builder: (_) => const DriverManifestScreen()));
          },
        ),
        const SizedBox(height: 10),
        Row(children: [
          Expanded(child: BigButton(label: 'Quét vé', outline: true, color: const Color(0xFFE2E8F0), icon: Icons.qr_code_scanner, onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const DriverQrScannerScreen())))),
          const SizedBox(width: 10),
          Expanded(child: BigButton(label: 'Khách vẫy', outline: true, color: const Color(0xFFE2E8F0), onPressed: () => showHailSheet(context))),
        ]),
      ],
    ];
    final incident = BigButton(
      label: 'Báo sự cố',
      height: 72,
      outline: true,
      color: const Color(0xFFEF4444),
      icon: Icons.warning_amber_rounded,
      onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const DriverIncidentScreen())),
    );
    final earlyEnd = store.moving || store.lastStop
        ? null
        : TextButton(
            onPressed: () => _earlyEnd(context),
            style: TextButton.styleFrom(minimumSize: const Size(48, 48)),
            child: Text('Kết thúc chuyến sớm', style: dsans(size: 15, weight: FontWeight.w600, color: DTokens.sub)),
          );
    return PopScope(
      canPop: false,
      child: Scaffold(
        body: SafeArea(
          child: Column(children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: DTokens.lineSoft))),
              child: Row(children: [
                Container(width: 8, height: 8, decoration: BoxDecoration(shape: BoxShape.circle, color: store.offline ? const Color(0xFFF59E0B) : const Color(0xFF22C55E))),
                const SizedBox(width: 6),
                Expanded(
                  child: Text.rich(
                    TextSpan(children: [
                      TextSpan(text: store.offline ? 'Mất mạng · lưu trên máy' : 'Đang gửi vị trí', style: dsans(size: 13, color: store.offline ? DTokens.warnInk : DTokens.okInk)),
                      TextSpan(text: '  ·  ', style: dsans(size: 13, color: const Color(0xFF475569))),
                      TextSpan(text: store.queue.isEmpty ? 'Đã đồng bộ' : '${store.queue.length} chờ đồng bộ', style: dsans(size: 13, color: DTokens.sub)),
                    ]),
                  ),
                ),
                const SizedBox(width: 8),
                // A demo trip of another day runs on a quick clock; say so rather than show a time that is not the phone's.
                Text(store.realClock ? hhmm(store.clock) : 'giờ chạy thử ${hhmm(store.clock)}', style: dmono(size: 13, weight: FontWeight.w500, color: DTokens.muted)),
              ]),
            ),
            if (store.incident != null)
              Container(
                width: double.infinity,
                color: DTokens.dangerBg,
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                child: Row(children: [
                  Expanded(child: Text('Đã báo ${store.incident!.type.toLowerCase()} lúc ${hhmm(store.incident!.at)} · ước tính chậm ${store.incident!.delay} phút. Điều hành đã nhận.', style: dsans(size: 13, color: DTokens.dangerInk))),
                  TextButton(
                    onPressed: store.clearIncident,
                    style: TextButton.styleFrom(minimumSize: const Size(48, 44)),
                    child: Text('Đã hết, đi tiếp', style: dsans(size: 14, weight: FontWeight.w700, color: DTokens.ink)),
                  ),
                ]),
              ),
            Expanded(
              child: wide
                  // Tablet: what the driver reads at a glance on the left, the next stop and its actions on the right.
                  ? SingleChildScrollView(
                      padding: const EdgeInsets.all(20),
                      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Expanded(flex: 2, child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [speed, const SizedBox(height: 12), next, const SizedBox(height: 12), progress, const SizedBox(height: 12), DriverRouteMap(store: store, height: 200)])),
                        const SizedBox(width: 20),
                        Expanded(flex: 3, child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [stopCard, const SizedBox(height: 12), ...actions])),
                      ]),
                    )
                  : ListView(padding: const EdgeInsets.all(16), children: [
                      Row(children: [Expanded(child: speed), const SizedBox(width: 12), Expanded(child: next)]),
                      const SizedBox(height: 12),
                      stopCard,
                      const SizedBox(height: 12),
                      // Stopped: the stop's actions come first, so the driver never scrolls for them.
                      if (!store.moving) ...[...actions, const SizedBox(height: 12)],
                      progress,
                      const SizedBox(height: 12),
                      DriverRouteMap(store: store),
                      if (store.moving) ...[const SizedBox(height: 12), ...actions],
                    ]),
            ),
            Container(
              decoration: const BoxDecoration(border: Border(top: BorderSide(color: DTokens.lineSoft))),
              padding: EdgeInsets.fromLTRB(wide ? 20 : 16, 12, wide ? 20 : 16, wide ? 12 : 8),
              child: wide
                  ? Row(children: [
                      if (earlyEnd != null) earlyEnd,
                      const Spacer(),
                      SizedBox(width: 400, child: incident),
                    ])
                  : Column(mainAxisSize: MainAxisSize.min, children: [incident, if (earlyEnd != null) earlyEnd]),
            ),
          ]),
        ),
      ),
    );
  }

  Widget _bigMetric(String label, String value, String unit) => Panel(
        padding: const EdgeInsets.all(14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(label, style: dsans(size: 13, color: DTokens.muted)),
          Text.rich(TextSpan(children: [TextSpan(text: value, style: dmono(size: 44)), TextSpan(text: ' $unit', style: dmono(size: 15, weight: FontWeight.w500, color: DTokens.muted))])),
        ]),
      );
}
