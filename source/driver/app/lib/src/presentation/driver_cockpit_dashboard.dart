import 'package:flutter/material.dart';

import 'driver_cod_dialog.dart';
import 'driver_end_trip_screen.dart';
import 'driver_incident_dialog.dart';
import 'driver_manifest_screen.dart';
import 'driver_qr_scanner_screen.dart';
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
            TextField(controller: why, maxLines: 3, style: dsans(size: 15), decoration: InputDecoration(labelText: 'Lý do', errorText: error)),
            const SizedBox(height: 14),
            BigButton(
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
            const SizedBox(height: 8),
            BigButton(label: 'Quay lại', outline: true, color: const Color(0xFFE2E8F0), onPressed: () => Navigator.of(ctx).pop()),
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
    final eta = (toMinutes(s.time) - store.clock).clamp(1, 999);
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
                Text(store.offline ? 'Mất mạng · lưu trên máy' : 'Đang gửi vị trí', style: dsans(size: 13, color: store.offline ? DTokens.warnInk : DTokens.okInk)),
                Text('  ·  ', style: dsans(size: 13, color: const Color(0xFF475569))),
                Text(store.queue.isEmpty ? 'Đã đồng bộ' : '${store.queue.length} chờ đồng bộ', style: dsans(size: 13, color: DTokens.sub)),
                const Spacer(),
                Text(hhmm(store.clock), style: dmono(size: 13, weight: FontWeight.w500, color: DTokens.muted)),
              ]),
            ),
            if (store.incident != null)
              Container(
                width: double.infinity,
                color: DTokens.dangerBg,
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                child: Text('Đã báo ${store.incident!.type.toLowerCase()} lúc ${hhmm(store.incident!.at)} · ước tính chậm ${store.incident!.delay} phút. Điều hành đã nhận.', style: dsans(size: 13, color: DTokens.dangerInk)),
              ),
            Expanded(
              child: ListView(padding: const EdgeInsets.all(16), children: [
                Row(children: [
                  Expanded(child: _bigMetric('Tốc độ', '${store.speed}', 'km/h')),
                  const SizedBox(width: 12),
                  Expanded(child: store.atStop ? _bigMetric('Đến trạm kế', 'Tại', 'trạm') : _bigMetric('Đến trạm kế', '$eta', 'phút')),
                ]),
                const SizedBox(height: 12),
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(color: const Color(0xFF172554), border: Border.all(color: const Color(0xFF1D4ED8)), borderRadius: BorderRadius.circular(12)),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                    Row(children: [
                      Text('${store.atStop ? 'Đang ở trạm' : 'Trạm kế'} ${store.stopIndex + 1}/${store.stops.length}', style: dsans(size: 13, color: const Color(0xFFBFDBFE))),
                      const Spacer(),
                      Text(s.time, style: dmono(size: 13, weight: FontWeight.w500, color: const Color(0xFFBFDBFE))),
                    ]),
                    const SizedBox(height: 8),
                    Text(s.name, style: dsans(size: 24, weight: FontWeight.w700)),
                    const SizedBox(height: 12),
                    Row(children: [
                      Expanded(child: Stat('Đón', '$board')),
                      const SizedBox(width: 8),
                      Expanded(child: Stat('Trả', '$drop')),
                      const SizedBox(width: 8),
                      Expanded(child: Stat('Thu COD', '$cod', color: DTokens.warnInk)),
                    ]),
                  ]),
                ),
                const SizedBox(height: 12),
                Panel(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                  child: Column(children: [
                    Row(children: [Text('Đã lên xe', style: dsans(size: 14, color: DTokens.sub)), const Spacer(), Text('${store.boardedCount}/${store.manifest.length}', style: dmono(size: 15))]),
                    const SizedBox(height: 8),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(999),
                      child: LinearProgressIndicator(value: store.manifest.isEmpty ? 0 : store.boardedCount / store.manifest.length, minHeight: 8, color: const Color(0xFF22C55E), backgroundColor: DTokens.line),
                    ),
                  ]),
                ),
                const SizedBox(height: 12),
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
                    label: store.lastStop ? 'Đã đến bến cuối · Kết thúc chuyến' : store.atStop ? 'Mở danh sách đón' : 'Đã đến trạm · Đón khách',
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
              ]),
            ),
            Container(
              decoration: const BoxDecoration(border: Border(top: BorderSide(color: DTokens.lineSoft))),
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                BigButton(
                  label: 'Báo sự cố',
                  height: 72,
                  outline: true,
                  color: const Color(0xFFEF4444),
                  icon: Icons.warning_amber_rounded,
                  onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const DriverIncidentScreen())),
                ),
                if (!store.moving && !store.lastStop)
                  TextButton(
                    onPressed: () => _earlyEnd(context),
                    style: TextButton.styleFrom(minimumSize: const Size(48, 48)),
                    child: Text('Kết thúc chuyến sớm', style: dsans(size: 15, weight: FontWeight.w600, color: DTokens.sub)),
                  ),
              ]),
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
