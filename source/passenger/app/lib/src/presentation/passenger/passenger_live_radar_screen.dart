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

class _PassengerLiveRadarScreenState extends State<PassengerLiveRadarScreen> with WidgetsBindingObserver {
  /// Without the pushed stream, the screen asks this often (FLOW-06).
  static const pollEvery = Duration(seconds: 10);
  /// After the stream drops, it is opened again this much later; meanwhile the screen asks.
  static const reconnectAfter = Duration(seconds: 30);

  Tracking? _tracking;
  StreamSubscription<Tracking>? _stream;
  Timer? _poll;
  Timer? _reconnect;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _load();
    _watch();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _stop();
    super.dispose();
  }

  /// In the background the screen neither listens nor asks; back in front it catches up at once.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _load();
      _watch();
    } else if (state == AppLifecycleState.paused || state == AppLifecycleState.hidden) {
      _stop();
    }
  }

  void _stop() {
    _stream?.cancel();
    _stream = null;
    _poll?.cancel();
    _poll = null;
    _reconnect?.cancel();
    _reconnect = null;
  }

  /// The server pushes the bus after each of its positions; asking every 10 s is only the fallback.
  void _watch() {
    _stop();
    final ticket = widget.ticket;
    _stream = PassengerScope.read(context).watchTracking(ticket.tripId, ticketId: ticket.id).listen(
      _show,
      onError: (_) => _fallBack(),
      onDone: _fallBack,
      cancelOnError: true,
    );
  }

  void _fallBack() {
    _stream = null;
    if (!mounted) return;
    _poll ??= Timer.periodic(pollEvery, (_) => _load());
    _reconnect ??= Timer(reconnectAfter, () {
      _reconnect = null;
      if (mounted) _watch();
    });
  }

  Future<void> _load() async {
    final store = PassengerScope.read(context);
    if (widget.ticket.status == TicketStatus.active) {
      await store.loadPass(widget.ticket);
    }
    if (!mounted) return;
    _show(await store.loadTracking(widget.ticket.tripId, ticketId: widget.ticket.id));
  }

  void _show(Tracking t) {
    if (!mounted) return;
    setState(() => _tracking = t);
    // Boarded: the server now aims at the drop-off; the ticket learns it from its pass.
    if (widget.ticket.status == TicketStatus.active && t.target?.isDropoff == true) {
      PassengerScope.read(context).loadPass(widget.ticket);
    }
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
      GpsSignal.none => tr?.target?.isHome == true
          ? ('Chưa nhận tín hiệu từ xe. ', 'Vị trí sẽ hiện khi tài xế lên đường đón bạn.')
          : ('Chưa nhận tín hiệu từ xe. ', 'Vị trí sẽ hiện khi xe bắt đầu chạy.'),
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
            if (ticket.status == TicketStatus.boarded)
              Row(children: [
                const Expanded(child: _Metric('Trạng thái', 'Đã lên xe')),
                Expanded(child: _Metric('Điểm trả', ticket.dropoff.isNotEmpty ? ticket.dropoff : ticket.route.split(' → ').last)),
              ])
            else
              _Coming(tracking: tr, ticket: ticket, live: live),
            // Without a position the banner above already says why; the server line would repeat it.
            // For a home pickup the headline above already says it all.
            if (tr != null && tr.text.isNotEmpty && tr.signal != GpsSignal.none && tr.target?.isHome != true) ...[
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

/// D143: where the bus is on its way to the passenger, when it will be there and whether it runs late.
class _Coming extends StatelessWidget {
  const _Coming({required this.tracking, required this.ticket, required this.live});
  final Tracking? tracking;
  final Ticket ticket;
  final bool live;

  @override
  Widget build(BuildContext context) {
    final tr = tracking;
    final home = tr?.target?.isHome == true;
    final moving = tr?.busLat != null && tr?.etaMinutes != null;
    final place = home ? (tr?.target?.name ?? '') : (tr?.target?.name ?? ticket.pickup);
    final arrived = moving && tr!.atTarget;
    final headline = !moving
        ? (home ? 'Tài xế chưa lên đường đón bạn' : 'Xe chưa chạy tới điểm đón')
        : arrived
            ? (home ? 'Xe đã tới chỗ bạn, mời bạn ra xe' : 'Xe đã tới điểm đón, mời bạn lên xe')
            : home
            ? 'Xe đang trên đường tới chỗ bạn'
            : (tr!.location?.sentence ?? 'Xe đang trên đường tới điểm đón');
    final detail = home
        ? 'Đón tại $place'
        : (moving ? tr!.location?.stopsLeft : null) ?? 'Điểm đón: ${place.replaceFirst('Bến xe ', '')}';
    final windowText = tr?.windowFrom != null && tr?.windowTo != null ? '${clockOf(tr!.windowFrom!)}–${clockOf(tr.windowTo!)}' : null;
    final plannedText = windowText ?? (tr?.plannedAt != null ? clockOf(tr!.plannedAt!) : null);
    final late = tr?.lateMinutes ?? 0;
    // Before the bus moves, the planned time is the figure itself; the chip only compares once there is an estimate.
    final (chipText, chipKind) = !moving
        ? (null, PillKind.mute)
        : late >= 5
            ? ('Trễ khoảng $late phút${plannedText == null ? '' : ' so với ${home ? 'khung' : 'dự kiến'} $plannedText'}', PillKind.warn)
            : (plannedText == null ? null : 'Đúng ${home ? 'khung đón' : 'giờ dự kiến'} $plannedText', PillKind.ok);
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Text(headline, style: sans(size: 17, weight: FontWeight.w700, color: PTokens.ink)),
      const SizedBox(height: 2),
      Text(detail, style: sans(size: 14, color: PTokens.muted)),
      const SizedBox(height: 12),
      Row(children: [
        Expanded(
          child: tr?.expectedAt != null
              ? _Metric('Xe tới lúc', '~${clockOf(tr!.expectedAt!)}')
              : _Metric(home ? 'Khung đón' : 'Dự kiến đón', plannedText ?? '—'),
        ),
        Expanded(
          child: _Metric(
            '${home ? 'Đến chỗ bạn' : 'Đến điểm đón'}${moving && !arrived && tr!.distanceKm != null ? ' · ${tr.distanceKm!.toStringAsFixed(1)} km' : ''}',
            !moving ? '—' : arrived ? 'Đã tới' : '${live ? '' : '~'}${tr!.etaMinutes} phút',
          ),
        ),
      ]),
      if (chipText != null) ...[
        const SizedBox(height: 10),
        Align(alignment: Alignment.centerLeft, child: Pill(chipText, chipKind)),
      ],
    ]);
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
