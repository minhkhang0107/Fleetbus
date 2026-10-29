import 'dart:async';

import 'package:flutter/material.dart';

import 'passenger_permissions.dart';
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
  /// The server pushes at least every 20 s: a longer silence is a dead connection the socket has not noticed.
  static const streamIdle = Duration(seconds: 45);

  Tracking? _tracking;
  StreamSubscription<Tracking>? _stream;
  Timer? _poll;
  Timer? _reconnect;
  Timer? _idle;
  /// The last answer could not reach the server: the bus shown is the last one known.
  bool _phoneOffline = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _load();
    _watch();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) offerNotifications(context, reason: 'Để biết khi xe sắp tới và khi xe đang chờ bạn mà không phải mở màn này.');
    });
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
    _idle?.cancel();
    _idle = null;
  }

  void _armIdle() {
    _idle?.cancel();
    _idle = Timer(streamIdle, () {
      _stream?.cancel();
      _fallBack();
    });
  }

  /// The server pushes the bus after each of its positions; asking every 10 s is only the fallback.
  void _watch() {
    _stop();
    final ticket = widget.ticket;
    _armIdle();
    _stream = PassengerScope.read(context).watchTracking(ticket.tripId, ticketId: ticket.id).listen(
      (t) {
        _armIdle();
        _show(t);
      },
      onError: (_) => _fallBack(),
      onDone: _fallBack,
      cancelOnError: true,
    );
  }

  void _fallBack() {
    _stream = null;
    _idle?.cancel();
    _idle = null;
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
    // Offline the bus stays where it was last seen, marked as old, rather than vanishing as if it had no signal.
    if (t.unreachable && _tracking != null) {
      setState(() => _phoneOffline = true);
      return;
    }
    setState(() {
      _phoneOffline = false;
      _tracking = t;
    });
    // Boarded: the server now aims at the drop-off; the ticket learns it from its pass.
    if (widget.ticket.status == TicketStatus.active && t.target?.isDropoff == true) {
      PassengerScope.read(context).loadPass(widget.ticket);
    }
  }

  @override
  Widget build(BuildContext context) {
    final ticket = widget.ticket;
    final hotline = PassengerScope.of(context).operator?.hotline ?? '';
    final tr = _tracking;
    final isCompleted = ticket.past || tr?.ended == true || tr?.tripStatus == 'COMPLETED';
    final signal = tr?.signal ?? GpsSignal.none;
    final live = signal == GpsSignal.live;
    final pill = isCompleted
        ? const Pill('Đã đi', PillKind.mute)
        : _phoneOffline
            ? const Pill('Mất mạng', PillKind.warn)
            : switch (signal) {
            GpsSignal.live => const Pill('Trực tiếp', PillKind.ok),
            GpsSignal.stale => const Pill('Mất tín hiệu', PillKind.warn),
            GpsSignal.offline => const Pill('Ngoại tuyến', PillKind.mute),
            GpsSignal.none => const Pill('Chưa có tín hiệu', PillKind.mute),
          };
    final banner = isCompleted
        ? null
        : _phoneOffline
            ? ('Điện thoại của bạn đang mất mạng. ', 'Vị trí xe dưới đây là lần cập nhật cuối; màn hình tự cập nhật khi có mạng lại.')
            : switch (signal) {
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
        // D159: the home pickup card grows (queue, door countdown); it scrolls rather than overflow.
        child: SingleChildScrollView(
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            if (isCompleted) ...[
              Text(
                'Chuyến đã kết thúc',
                style: sans(size: 16, weight: FontWeight.w600, color: PTokens.ink),
              ),
              gap(12),
              Row(children: [
                const Expanded(child: _Metric('Trạng thái', 'Đã đi')),
                Expanded(child: _Metric('Điểm trả', ticket.dropoff.isNotEmpty ? ticket.dropoff : ticket.route.split(' → ').last)),
              ]),
            ] else if (tr?.passedTarget == true)
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
            if (hotline.isNotEmpty) GhostButton(label: 'Gọi tổng đài $hotline', onPressed: () => callHotline(context, hotline)),
          ]),
        ),
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
              color: signal == GpsSignal.stale || _phoneOffline ? PTokens.warnSoft : const Color(0xFFF1F5F9),
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Icon(Icons.signal_wifi_off, size: 18, color: signal == GpsSignal.stale || _phoneOffline ? PTokens.warnInk : const Color(0xFF334155)),
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
        // Below the map the figures take at most 60 % of the height, so the bus stays in view.
        if (!wide) ConstrainedBox(constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.6), child: info),
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
    final waitingAtDoor = arrived && home && tr.doorArrivedAt != null && tr.homeWaitMinutes != null;
    final position = tr?.queuePosition;
    final headline = !moving
        ? (home ? 'Tài xế chưa lên đường đón bạn' : 'Xe chưa chạy tới điểm đón')
        : waitingAtDoor
            ? 'Xe đang chờ bạn, tới ${clockOf(tr.doorArrivedAt!.add(Duration(minutes: tr.homeWaitMinutes!)))}'
            : arrived
                ? (home ? 'Xe đã tới chỗ bạn, mời bạn ra xe' : 'Xe đã tới điểm đón, mời bạn lên xe')
                : home
                    // D144: the bus collects other addresses first; the passenger sees where they are in the run.
                    ? (position != null && position > 1 ? 'Xe đang đón khách khác trước bạn' : 'Bạn là điểm đón tiếp theo')
                    : (tr!.location?.sentence ?? 'Xe đang trên đường tới điểm đón');
    // D159: the place in the run has its own indicator below.
    final detail = home
        ? 'Đón tại $place'
        : (moving ? tr!.location?.stopsLeft : null) ?? 'Điểm đón: ${place.replaceFirst('Bến xe ', '')}';
    final windowText = tr?.windowFrom != null && tr?.windowTo != null ? '${clockOf(tr!.windowFrom!)}–${clockOf(tr.windowTo!)}' : null;
    final appointment = tr?.appointmentAt != null ? clockOf(tr!.appointmentAt!) : null;
    final plannedText = appointment ?? windowText ?? (tr?.plannedAt != null ? clockOf(tr!.plannedAt!) : null);
    final plannedLabel = appointment != null ? 'giờ hẹn' : home ? 'khung' : 'dự kiến';
    final late = tr?.lateMinutes ?? 0;
    // Before the bus moves, the planned time is the figure itself; the chip only compares once there is an estimate.
    final (chipText, chipKind) = !moving || arrived
        ? (null, PillKind.mute)
        : late >= 5
            ? ('Trễ khoảng $late phút${plannedText == null ? '' : ' so với $plannedLabel $plannedText'}', PillKind.warn)
            : (plannedText == null ? null : 'Đúng $plannedLabel $plannedText', PillKind.ok);
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Text(headline, style: sans(size: 17, weight: FontWeight.w700, color: PTokens.ink)),
      const SizedBox(height: 2),
      Text(detail, style: sans(size: 14, color: PTokens.muted)),
      if (tr != null && tr.nearDoor && !tr.atDoor) ...[
        const SizedBox(height: 10),
        const _NearDoor(),
      ],
      if (home && position != null) ...[
        const SizedBox(height: 10),
        _QueueIndicator(position: position, total: tr!.queueTotal ?? position),
      ],
      if (waitingAtDoor) ...[
        const SizedBox(height: 10),
        _DoorCountdown(until: tr.doorArrivedAt!.add(Duration(minutes: tr.homeWaitMinutes!)), total: Duration(minutes: tr.homeWaitMinutes!)),
      ],
      const SizedBox(height: 12),
      Row(children: [
        Expanded(
          child: tr?.expectedAt != null
              ? _Metric('Xe tới lúc', '~${clockOf(tr!.expectedAt!)}')
              : _Metric(appointment != null ? 'Giờ hẹn đón' : home ? 'Khung đón' : 'Dự kiến đón', plannedText ?? '—'),
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
      if (home) _ReadyBox(ticket: ticket, tracking: tr),
    ]);
  }
}

/// D159: the bus is a few hundred metres away; the passenger should head for the door now.
class _NearDoor extends StatelessWidget {
  const _NearDoor();

  @override
  Widget build(BuildContext context) => Semantics(
        liveRegion: true,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: BoxDecoration(color: PTokens.successSoft, border: Border.all(color: PTokens.success), borderRadius: BorderRadius.circular(PTokens.radiusControl)),
          child: Row(children: [
            const Icon(Icons.directions_walk, size: 18, color: PTokens.success),
            const SizedBox(width: 8),
            Expanded(child: Text('Xe đã tới gần chỗ đón · Mời bạn chuẩn bị ra cửa', style: sans(size: 14, weight: FontWeight.w700, color: PTokens.success))),
          ]),
        ),
      );
}

/// D159: the passenger's place in the home pickup run, as a row of segments and a line of text.
class _QueueIndicator extends StatelessWidget {
  const _QueueIndicator({required this.position, required this.total});
  final int position;
  final int total;

  @override
  Widget build(BuildContext context) {
    final count = total < position ? position : total;
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 10),
      decoration: BoxDecoration(color: PTokens.primarySoft, borderRadius: BorderRadius.circular(PTokens.radiusControl)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text(
          'Điểm đón thứ $position/$count · ${position > 1 ? '${position - 1} điểm trước bạn' : 'Bạn là điểm tiếp theo'}',
          style: sans(size: 13, weight: FontWeight.w700, color: PTokens.primaryDark),
        ),
        const SizedBox(height: 6),
        // Segments before the passenger are the stops still ahead of them; theirs is the dark one.
        Row(children: [
          for (var i = 1; i <= count; i++)
            Expanded(
              child: Container(
                height: 6,
                margin: EdgeInsets.only(right: i < count ? 4 : 0),
                decoration: BoxDecoration(
                  color: i < position ? PTokens.primary.withValues(alpha: 0.45) : i == position ? PTokens.primaryDark : PTokens.lineStrong,
                  borderRadius: BorderRadius.circular(3),
                ),
              ),
            ),
        ]),
      ]),
    );
  }
}

/// D159: how long the bus still waits at the door; red in the last minute.
class _DoorCountdown extends StatefulWidget {
  const _DoorCountdown({required this.until, required this.total});
  /// Vietnam time, like the other tracking times.
  final DateTime until;
  final Duration total;

  @override
  State<_DoorCountdown> createState() => _DoorCountdownState();
}

class _DoorCountdownState extends State<_DoorCountdown> {
  Timer? _tick;

  @override
  void initState() {
    super.initState();
    _tick = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _tick?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now().toUtc().add(const Duration(hours: 7));
    final left = widget.until.difference(now);
    final secs = left.isNegative ? 0 : left.inSeconds;
    if (secs == 0) _tick?.cancel();
    final urgent = secs < 60;
    final fg = urgent ? PTokens.danger : PTokens.warnInk;
    final totalSecs = widget.total.inSeconds;
    return Semantics(
      liveRegion: urgent,
      child: Container(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 10),
        decoration: BoxDecoration(
          color: urgent ? PTokens.dangerSoft : PTokens.warnSoft,
          border: Border.all(color: urgent ? PTokens.danger : PTokens.warn),
          borderRadius: BorderRadius.circular(PTokens.radiusControl),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [
            Icon(Icons.timer_outlined, size: 18, color: fg),
            const SizedBox(width: 8),
            Expanded(child: Text(secs == 0 ? 'Đã hết thời gian chờ' : 'Xe chờ bạn thêm', style: sans(size: 13, weight: FontWeight.w600, color: fg))),
            Text('${secs ~/ 60}:${(secs % 60).toString().padLeft(2, '0')}', style: mono(size: 22, weight: FontWeight.w700, color: fg)),
          ]),
          const SizedBox(height: 6),
          ClipRRect(
            borderRadius: BorderRadius.circular(3),
            child: LinearProgressIndicator(
              value: totalSecs <= 0 ? 0 : (secs / totalSecs).clamp(0.0, 1.0),
              minHeight: 6,
              color: fg,
              backgroundColor: Colors.white,
            ),
          ),
        ]),
      ),
    );
  }
}

/// D144: the passenger tells the driver they are ready, or need a couple of minutes, instead of a phone call.
class _ReadyBox extends StatefulWidget {
  const _ReadyBox({required this.ticket, required this.tracking});
  final Ticket ticket;
  final Tracking? tracking;

  @override
  State<_ReadyBox> createState() => _ReadyBoxState();
}

class _ReadyBoxState extends State<_ReadyBox> {
  String? _sent;
  bool _busy = false;

  Future<void> _send(String status) async {
    setState(() => _busy = true);
    final error = await PassengerScope.read(context).sendPickupReady(widget.ticket, status);
    if (!mounted) return;
    setState(() {
      _busy = false;
      if (error == null) _sent = status;
    });
    showToast(context, error ?? 'Đã báo tài xế');
  }

  @override
  Widget build(BuildContext context) {
    final tr = widget.tracking;
    final status = _sent ?? (tr?.readyStatus == 'READY' ? 'READY' : tr?.readyStatus == 'NEED_TIME' ? 'NEED_${tr?.readyMinutes ?? 5}' : null);
    final wait = tr?.homeWaitMinutes;
    final said = switch (status) {
      'READY' => 'Bạn đã báo: sẵn sàng.',
      'NEED_2' => 'Bạn đã báo: cần thêm 2 phút.',
      'NEED_5' => 'Bạn đã báo: cần thêm 5 phút.',
      _ => 'Báo tài xế khi bạn xong, không cần gọi điện.',
    };
    Widget choice(String value, String label) => Expanded(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 3),
            child: status == value
                ? FilledButton(onPressed: _busy ? null : () => _send(value), child: Text(label, textAlign: TextAlign.center))
                : OutlinedButton(onPressed: _busy ? null : () => _send(value), child: Text(label, textAlign: TextAlign.center)),
          ),
        );
    return Padding(
      padding: const EdgeInsets.only(top: 12),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text('$said${wait != null ? ' Xe chờ mỗi nhà tối đa $wait phút.' : ''}', style: sans(size: 13, color: PTokens.muted)),
        const SizedBox(height: 6),
        Row(children: [
          choice('READY', 'Sẵn sàng'),
          choice('NEED_2', '+2 phút'),
          choice('NEED_5', '+5 phút'),
        ]),
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
