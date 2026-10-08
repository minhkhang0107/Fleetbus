import 'dart:async';

import 'package:flutter/material.dart';

import 'passenger_store.dart';
import 'passenger_widgets.dart';

/// PAX-018: the bus on a map. When the signal is stale or offline the screen says so and marks
/// the position and the ETA as estimates (FLOW-06).
class PassengerLiveRadarScreen extends StatefulWidget {
  const PassengerLiveRadarScreen({super.key, required this.ticket});
  final Ticket ticket;

  @override
  State<PassengerLiveRadarScreen> createState() => _PassengerLiveRadarScreenState();
}

class _PassengerLiveRadarScreenState extends State<PassengerLiveRadarScreen> {
  Tracking? _tracking;
  Timer? _poll;

  @override
  void initState() {
    super.initState();
    _load();
    // FLOW-06: the passenger app asks again every 10 seconds.
    _poll = Timer.periodic(const Duration(seconds: 10), (_) => _load());
  }

  @override
  void dispose() {
    _poll?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    final t = await PassengerScope.read(context).loadTracking(widget.ticket.tripId);
    if (mounted) setState(() => _tracking = t);
  }

  @override
  Widget build(BuildContext context) {
    final ticket = widget.ticket;
    final tr = _tracking;
    final signal = tr?.signal ?? GpsSignal.none;
    final live = signal == GpsSignal.live;
    final pill = switch (signal) {
      GpsSignal.live => const Pill('Trực tiếp', PillKind.ok),
      GpsSignal.stale => const Pill('Mất tín hiệu', PillKind.warn),
      GpsSignal.offline => const Pill('Ngoại tuyến', PillKind.mute),
      GpsSignal.none => const Pill('Chưa có tín hiệu', PillKind.mute),
    };
    final banner = switch (signal) {
      GpsSignal.live => null,
      GpsSignal.stale => ('Mất tín hiệu. ', 'Vị trí dưới đây đã cũ; giờ đến chỉ là ước tính.'),
      GpsSignal.offline => ('Xe ngoại tuyến. ', 'Vị trí dưới đây đã cũ; giờ đến chỉ là ước tính.'),
      GpsSignal.none => ('Chưa nhận tín hiệu từ xe. ', 'Vị trí sẽ hiện khi xe bắt đầu chạy.'),
    };
    return Scaffold(
      appBar: TopBar(title: 'Xe của chuyến ${ticket.dep}', subtitle: '${ticket.date} · ${ticket.route}', trailing: pill),
      body: Column(children: [
        if (tr == null) const LinearProgressIndicator(minHeight: 2),
        if (banner != null)
          Semantics(
            liveRegion: true,
            child: Container(
              width: double.infinity,
              color: signal == GpsSignal.stale ? PTokens.warnSoft : const Color(0xFFF1F5F9),
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Icon(Icons.signal_wifi_off, size: 18, color: signal == GpsSignal.stale ? PTokens.warnInk : const Color(0xFF334155)),
                const SizedBox(width: 10),
                Expanded(
                  child: Text.rich(TextSpan(children: [
                    TextSpan(text: banner.$1, style: sans(size: 13, weight: FontWeight.w700, color: const Color(0xFF334155))),
                    TextSpan(text: banner.$2, style: sans(size: 13, color: const Color(0xFF334155))),
                  ])),
                ),
              ]),
            ),
          ),
        Expanded(
          child: Container(
            color: const Color(0xFFEEF2F6),
            child: LayoutBuilder(builder: (context, c) {
              final w = c.maxWidth, h = c.maxHeight;
              return Stack(children: [
                Positioned.fill(child: CustomPaint(painter: _MapPainter())),
                Positioned(left: w * 0.62, top: h * 0.08, child: Container(padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4), decoration: BoxDecoration(color: PTokens.ink, borderRadius: BorderRadius.circular(6)), child: Text('Điểm đón của bạn', style: sans(size: 12, weight: FontWeight.w600, color: Colors.white)))),
                Positioned(
                  left: w * 0.40,
                  top: h * 0.56,
                  child: Container(
                    width: 40,
                    height: 40,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: live ? PTokens.primary : Colors.white,
                      border: Border.all(color: live ? Colors.white : const Color(0xFF94A3B8), width: 3),
                    ),
                    child: Icon(Icons.directions_bus, size: 20, color: live ? Colors.white : const Color(0xFF64748B)),
                  ),
                ),
                Positioned(
                  left: w * 0.30,
                  top: h * 0.56 + 48,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(color: Colors.white, border: Border.all(color: PTokens.lineStrong), borderRadius: BorderRadius.circular(6)),
                    child: Text(live ? '${tr?.speed?.round() ?? 0} km/h · vừa cập nhật' : (signal == GpsSignal.none ? 'Chưa có vị trí' : 'Vị trí cũ'), style: sans(size: 12, color: const Color(0xFF334155))),
                  ),
                ),
              ]);
            }),
          ),
        ),
        Container(
          decoration: const BoxDecoration(color: PTokens.surface, border: Border(top: BorderSide(color: PTokens.line))),
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 16),
          child: SafeArea(
            top: false,
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Row(children: [
                Expanded(child: _Metric('Đến điểm đón', tr?.etaMinutes == null ? '—' : '${live ? '' : '~'}${tr!.etaMinutes} phút')),
                Expanded(child: _Metric('Cách điểm đón', tr?.distanceKm == null ? '—' : '${live ? '' : '~'}${tr!.distanceKm!.toStringAsFixed(1)} km')),
              ]),
              gap(14),
              GhostButton(label: 'Gọi tổng đài 1900 6868', onPressed: () => showToast(context, 'Đang gọi 1900 6868')),
            ]),
          ),
        ),
      ]),
    );
  }
}

class _Metric extends StatelessWidget {
  const _Metric(this.label, this.value);
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(label, style: sans(size: 12, color: PTokens.muted)),
        Text(value, style: mono(size: 22, weight: FontWeight.w700)),
      ]);
}

class _MapPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final road = Paint()
      ..color = const Color(0xFFE2E8F0)
      ..strokeWidth = 10;
    for (final y in [0.2, 0.55, 0.85]) {
      canvas.drawLine(Offset(0, size.height * y), Offset(size.width, size.height * y), road);
    }
    for (final x in [0.18, 0.54, 0.82]) {
      canvas.drawLine(Offset(size.width * x, 0), Offset(size.width * x, size.height), road);
    }
    final route = Path()
      ..moveTo(size.width * 0.1, size.height * 0.95)
      ..cubicTo(size.width * 0.2, size.height * 0.78, size.width * 0.3, size.height * 0.7, size.width * 0.44, size.height * 0.62)
      ..cubicTo(size.width * 0.6, size.height * 0.5, size.width * 0.7, size.height * 0.35, size.width * 0.77, size.height * 0.19);
    canvas.drawPath(route, Paint()
      ..color = const Color(0xFF94A3B8)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 5
      ..strokeCap = StrokeCap.round);
    final done = Path()
      ..moveTo(size.width * 0.1, size.height * 0.95)
      ..cubicTo(size.width * 0.2, size.height * 0.78, size.width * 0.3, size.height * 0.7, size.width * 0.44, size.height * 0.62);
    canvas.drawPath(done, Paint()
      ..color = PTokens.primary
      ..style = PaintingStyle.stroke
      ..strokeWidth = 5
      ..strokeCap = StrokeCap.round);
    canvas.drawCircle(Offset(size.width * 0.77, size.height * 0.19), 9, Paint()..color = Colors.white);
    canvas.drawCircle(Offset(size.width * 0.77, size.height * 0.19), 9, Paint()
      ..color = PTokens.ink
      ..style = PaintingStyle.stroke
      ..strokeWidth = 3);
  }

  @override
  bool shouldRepaint(_MapPainter oldDelegate) => false;
}
