import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import 'driver_cod_dialog.dart';
import 'driver_permissions.dart';
import 'driver_store.dart';
import 'driver_widgets.dart';

/// DRI-009 / DRI-010: scan the static boarding QR, or take the backup PIN when the passenger has no
/// phone at hand. Results show on a sheet; an unpaid COD ticket opens the collection (BR-COD-006).
/// The camera is asked for when the screen opens (D145); refused, the PIN path still boards the passenger.
class DriverQrScannerScreen extends StatefulWidget {
  const DriverQrScannerScreen({super.key});

  @override
  State<DriverQrScannerScreen> createState() => _DriverQrScannerScreenState();
}

class _DriverQrScannerScreenState extends State<DriverQrScannerScreen> {
  /// Null while asking, then whether the camera may be used.
  bool? _camera;
  bool _busy = false;
  MobileScannerController? _scanner;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _askCamera());
  }

  @override
  void dispose() {
    _scanner?.dispose();
    super.dispose();
  }

  Future<void> _askCamera() async {
    final ok = await ensureDriverCamera(context);
    if (!mounted) return;
    setState(() {
      _camera = ok;
      if (ok) _scanner ??= MobileScannerController(detectionSpeed: DetectionSpeed.noDuplicates, formats: const [BarcodeFormat.qrCode]);
    });
  }

  /// DRI-009: a QR read by the camera goes to the server; the answer shows on a sheet.
  Future<void> _onDetect(BarcodeCapture capture) async {
    final payload = capture.barcodes.map((b) => b.rawValue).whereType<String>().firstOrNull;
    if (payload == null || _busy) return;
    setState(() => _busy = true);
    await _scanner?.stop();
    if (!mounted) return;
    final store = DriverScope.read(context);
    final r = await store.boardWithQr(payload);
    if (!mounted) return;
    final seat = r.data?['seat_code'] ?? r.data?['passenger']?['seat_code'];
    final name = r.data?['passenger_name'] ?? r.data?['passenger']?['passenger_name'];
    await _result(
      context,
      r.error == null,
      r.error == null ? 'Hợp lệ${seat != null ? ' · Ghế $seat' : ''}' : 'Không cho lên xe',
      r.error == null ? (name != null ? '$name đã lên xe.' : 'Khách đã lên xe.') : r.error!,
    );
    if (!mounted) return;
    setState(() => _busy = false);
    await _scanner?.start();
  }

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
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
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
    final camera = _camera == true && _scanner != null
        ? MobileScanner(controller: _scanner!, onDetect: _onDetect)
        : Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                Text(_camera == null ? 'Đang mở camera…' : 'Camera chưa được bật. Nhập mã PIN của khách, hoặc bật camera.', textAlign: TextAlign.center, style: dsans(size: 15, color: DTokens.sub, height: 1.5)),
                if (_camera == false) ...[
                  const SizedBox(height: 12),
                  TextButton(onPressed: _askCamera, child: Text('Bật camera', style: dsans(size: 15, weight: FontWeight.w600, color: const Color(0xFF93C5FD)))),
                ],
              ]),
            ),
          );
    final frame = Center(
      child: Container(
        width: 240,
        height: 240,
        decoration: BoxDecoration(border: Border.all(color: const Color(0xFF22C55E), width: 3), borderRadius: BorderRadius.circular(16)),
        child: Center(child: Container(height: 2, margin: const EdgeInsets.symmetric(horizontal: 8), color: const Color(0xCC22C55E))),
      ),
    );
    final pinButton = BigButton(label: 'Khách không có vé trên máy: nhập PIN', outline: true, color: const Color(0xFFE2E8F0), height: dWide(context) ? 72 : 56, onPressed: () => _pinEntry(context));
    if (dWide(context)) {
      // Tablet: camera frame on the left, the instruction and the PIN path on the right.
      return Scaffold(
        backgroundColor: Colors.black,
        appBar: const DHeader(title: 'Quét vé lên xe', close: true),
        body: Row(children: [
          Expanded(child: Stack(fit: StackFit.expand, children: [camera, if (_camera == true) frame])),
          Container(
            width: 420,
            color: DTokens.bg,
            padding: const EdgeInsets.all(24),
            child: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Text('Đưa mã QR trên điện thoại hoặc vé in của khách vào khung', style: dsans(size: 20, weight: FontWeight.w600, height: 1.4)),
              const SizedBox(height: 12),
              Text('Không quét được thì hỏi khách mã PIN dự phòng 6 số in trên vé.', style: dsans(size: 16, color: DTokens.sub, height: 1.5)),
              const SizedBox(height: 24),
              pinButton,
            ]),
          ),
        ]),
      );
    }
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: const DHeader(title: 'Quét vé lên xe', close: true),
      body: Stack(fit: StackFit.expand, children: [
        camera,
        if (_camera == true) frame,
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
          child: pinButton,
        ),
      ),
    );
  }
}
