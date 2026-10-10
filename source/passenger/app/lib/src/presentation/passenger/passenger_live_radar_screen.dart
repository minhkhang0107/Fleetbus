import 'dart:async';

import 'package:flutter/material.dart';

import 'passenger_route_map.dart';
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
    final store = PassengerScope.read(context);
    if (widget.ticket.status == TicketStatus.active) {
      await store.loadPass(widget.ticket);
    }
    final t = await store.loadTracking(widget.ticket.tripId, ticketId: widget.ticket.id);
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
    final wide = pWide(context);
    final map = PassengerRouteMap(tracking: tr);
    final info = Container(
      decoration: BoxDecoration(color: PTokens.surface, border: wide ? const Border(left: BorderSide(color: PTokens.line)) : const Border(top: BorderSide(color: PTokens.line))),
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 16),
      child: SafeArea(
        top: false,
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          if (tr?.passedTarget == true)
            Text(
              tr!.text.isNotEmpty ? tr.text : 'Xe đã qua điểm đón',
              style: sans(size: 16, weight: FontWeight.w600, color: PTokens.ink),
            )
          else ...[
            Row(children: [
              if (ticket.status == TicketStatus.boarded) ...[
                const Expanded(child: _Metric('Trạng thái', 'Đã lên xe')),
                Expanded(child: _Metric('Điểm trả', ticket.dropoff.isNotEmpty ? ticket.dropoff : ticket.route.split(' → ').last)),
              ] else ...[
                Expanded(child: _Metric('Đến điểm đón', tr?.etaMinutes == null ? '—' : '${live ? '' : '~'}${tr!.etaMinutes} phút')),
                Expanded(child: _Metric('Cách điểm đón', tr?.distanceKm == null ? '—' : '${live ? '' : '~'}${tr!.distanceKm!.toStringAsFixed(1)} km')),
              ],
            ]),
            if (tr != null && tr.text.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(tr.text, style: sans(size: 13, color: PTokens.muted)),
            ],
          ],
          gap(14),
          GhostButton(label: 'Gọi tổng đài 1900 6868', onPressed: () => showToast(context, 'Đang gọi 1900 6868')),
        ]),
      ),
    );
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
          // Wide screens keep the map large and put the figures in a side panel.
          child: wide ? Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [Expanded(child: map), SizedBox(width: 360, child: info)]) : map,
        ),
        if (!wide) info,
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
