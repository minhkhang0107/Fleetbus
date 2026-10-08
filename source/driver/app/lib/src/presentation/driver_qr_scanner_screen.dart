import 'package:flutter/material.dart';

import 'driver_cod_dialog.dart';
import 'driver_store.dart';
import 'driver_widgets.dart';

/// DRI-009 / DRI-010: scan the static boarding QR, or take the backup PIN when the passenger has no
/// phone at hand. Results show on a sheet; an unpaid COD ticket opens the collection (BR-COD-006).
/// Camera decoding needs the scanner plugin of the device build (OQ-029); the PIN path works here.
class DriverQrScannerScreen extends StatelessWidget {
  const DriverQrScannerScreen({super.key});

  Future<void> _pinEntry(BuildContext context) async {
    final store = DriverScope.read(context);
    final waiting = store.atStopPassengers.where((p) => p.status == PaxStatus.waiting).toList();
    if (waiting.isEmpty) {
      dToast(context, 'Không còn khách chờ ở trạm này');
      return;
    }
    var selected = waiting.first;
    final pin = TextEditingController();
    String? error;
    final result = await showDriverSheet<Passenger>(context, builder: (ctx) => StatefulBuilder(
          builder: (ctx, setSheet) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text('Lên xe bằng mã PIN', style: dsans(size: 18, weight: FontWeight.w700)),
            const SizedBox(height: 8),
            Text('Khách đọc mã PIN dự phòng trên vé. Chọn ghế của khách rồi nhập mã.', style: dsans(size: 14, color: DTokens.sub, height: 1.5)),
            const SizedBox(height: 12),
            Wrap(spacing: 8, runSpacing: 8, children: [
              for (final p in waiting) SizedBox(width: 100, child: ChoiceTile(label: p.seat, center: true, selected: selected == p, onTap: () => setSheet(() => selected = p))),
            ]),
            const SizedBox(height: 12),
            TextField(
              controller: pin,
              keyboardType: TextInputType.number,
              maxLength: 6,
              style: dmono(size: 18, weight: FontWeight.w600),
              decoration: InputDecoration(labelText: 'Mã PIN 6 số', counterText: '', errorText: error),
            ),
            const SizedBox(height: 14),
            BigButton(
              label: 'Kiểm tra',
              onPressed: () async {
                if (!RegExp(r'^\d{6}$').hasMatch(pin.text.trim())) {
                  setSheet(() => error = 'Mã PIN gồm đúng 6 chữ số.');
                  return;
                }
                if (selected.codDue) {
                  Navigator.of(ctx).pop(selected);
                  return;
                }
                final r = await store.boardWithPin(selected, pin.text.trim());
                if (r.error != null) {
                  setSheet(() => error = r.code == 'INVALID_PIN' ? 'Mã PIN không đúng với vé ghế ${selected.seat}.' : r.error);
                  return;
                }
                if (ctx.mounted) Navigator.of(ctx).pop(selected);
              },
            ),
          ]),
        ));
    if (result == null || !context.mounted) return;
    if (result.codDue) {
      await showCodSheet(context, result);
      return;
    }
    await _result(context, true, 'Hợp lệ · Ghế ${result.seat}', '${result.name} · ${result.phone}\nXuống tại ${store.stopById(result.to).name}');
  }

  Future<void> _result(BuildContext context, bool ok, String title, String body) => showDriverSheet<void>(context, builder: (ctx) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(color: ok ? DTokens.okBg : DTokens.dangerBg, borderRadius: BorderRadius.circular(12)),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(title, style: dsans(size: 20, weight: FontWeight.w700, color: ok ? DTokens.okInk : DTokens.dangerInk)),
            const SizedBox(height: 6),
            Text(body, style: dsans(size: 15, height: 1.5)),
          ]),
        ),
        const SizedBox(height: 14),
        BigButton(label: 'Quét vé tiếp', onPressed: () => Navigator.of(ctx).pop()),
      ]));

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: const DHeader(title: 'Quét vé lên xe', close: true),
      body: Stack(fit: StackFit.expand, children: [
        Center(
          child: Container(
          width: 240,
          height: 240,
          decoration: BoxDecoration(border: Border.all(color: const Color(0xFF22C55E), width: 3), borderRadius: BorderRadius.circular(16)),
          child: Center(child: Container(height: 2, margin: const EdgeInsets.symmetric(horizontal: 8), color: const Color(0xCC22C55E))),
          ),
        ),
        Positioned(
          bottom: 32,
          left: 16,
          right: 16,
          child: Text('Đưa mã QR trên điện thoại hoặc vé in của khách vào khung', textAlign: TextAlign.center, style: dsans(size: 14, color: DTokens.sub)),
        ),
      ]),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
          child: BigButton(label: 'Khách không có vé trên máy: nhập PIN', outline: true, color: const Color(0xFFE2E8F0), onPressed: () => _pinEntry(context)),
        ),
      ),
    );
  }
}
