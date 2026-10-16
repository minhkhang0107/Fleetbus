import 'dart:async';

import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import 'driver_cod_dialog.dart';
import 'driver_manifest_screen.dart';
import 'driver_route_map.dart';
import 'driver_store.dart';
import 'driver_widgets.dart';

/// DRI-020 (D143, D144): the home pickups collected before departure, in the order the bus takes them.
/// While this run is on, the app sends the bus position: each passenger sees their place in the run and the time
/// the bus reaches them, and is told when they are next and when the bus is at the door. The passenger can answer
/// "ready" or "a few more minutes"; at the door the bus waits the company's time, then may go on.
class DriverHomeRunScreen extends StatefulWidget {
  const DriverHomeRunScreen({super.key});

  @override
  State<DriverHomeRunScreen> createState() => _DriverHomeRunScreenState();
}

class _DriverHomeRunScreenState extends State<DriverHomeRunScreen> {
  Timer? _tick;

  @override
  void initState() {
    super.initState();
    // The wait at a door counts down on its own; the passengers' answers come with each refresh.
    _tick = Timer.periodic(const Duration(seconds: 15), (_) {
      if (!mounted) return;
      DriverScope.read(context).refreshTrip();
      setState(() {});
    });
  }

  @override
  void dispose() {
    _tick?.cancel();
    super.dispose();
  }

  Future<void> _call(DriverStore store, Passenger p) async {
    final r = await store.contactOf(p);
    if (!mounted) return;
    if (r.error != null) {
      dToast(context, r.error!);
      return;
    }
    final ok = await launchUrl(Uri(scheme: 'tel', path: r.phone));
    if (!ok && mounted) dToast(context, 'Không mở được trình gọi điện');
  }

  Future<void> _run(Future<String?> Function() action, String done) async {
    final error = await action();
    if (mounted) dToast(context, error ?? done);
  }

  @override
  Widget build(BuildContext context) {
    final store = DriverScope.of(context);
    final homes = store.homePickupsInOrder;
    final waiting = store.homePickupsWaiting;
    final window = store.homeWindow;
    final live = Panel(
      border: const Color(0xFF166534),
      child: Row(children: [
        Container(width: 10, height: 10, decoration: const BoxDecoration(shape: BoxShape.circle, color: Color(0xFF22C55E))),
        const SizedBox(width: 10),
        Expanded(
          child: Text(
            waiting.isEmpty
                ? 'Đã đón hết khách tận nhà. Về bến để xuất bến.'
                : 'Đang gửi vị trí: khách thấy mình là điểm đón thứ mấy và khi nào xe tới. Xe chờ mỗi nhà tối đa ${store.homeWaitMinutes} phút.',
            style: dsans(size: 15, color: DTokens.okInk, height: 1.4),
          ),
        ),
      ]),
    );
    return Scaffold(
      appBar: DHeader(
        title: 'Đón khách tận nhà',
        subtitle: '${homes.length} khách${window == null ? '' : ' · khung $window'} · xuất bến ${store.depTimeLabel}',
        trailing: Text('${homes.where((p) => p.status == PaxStatus.boarded).length}/${homes.length}', style: dmono(size: 16, color: DTokens.okInk)),
      ),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 16), children: [
        live,
        const SizedBox(height: 12),
        DriverRouteMap(store: store, height: 200),
        const SizedBox(height: 12),
        for (var i = 0; i < homes.length; i++) ...[
          _HomeCard(
            p: homes[i],
            stop: store.homeStopOf(homes[i]),
            next: waiting.isNotEmpty && waiting.first.ticketId == homes[i].ticketId,
            canMoveUp: i > 0 && homes[i].status == PaxStatus.waiting,
            canMoveDown: i < homes.length - 1 && homes[i].status == PaxStatus.waiting,
            onUp: () => _run(() => store.moveHome(homes[i], -1), 'Đã đổi thứ tự đón'),
            onDown: () => _run(() => store.moveHome(homes[i], 1), 'Đã đổi thứ tự đón'),
            onArrived: () => _run(() => store.homeArrived(homes[i]), 'Đã báo khách: xe đang chờ ${store.homeWaitMinutes} phút'),
            onBoard: () => _run(() => store.board(homes[i]), 'Ghế ${homes[i].seat} đã lên xe'),
            onCod: () => showCodSheet(context, homes[i]),
            onMissed: () => _run(() => store.homeMissed(homes[i]), 'Đã báo khách ra bến'),
            onCall: () => _call(store, homes[i]),
            onInaccessible: () => DriverManifestScreen.reportInaccessible(context, store, homes[i]),
          ),
          const SizedBox(height: 8),
        ],
      ]),
      bottomNavigationBar: SafeArea(
        child: Container(
          decoration: const BoxDecoration(border: Border(top: BorderSide(color: DTokens.lineSoft))),
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
          child: BigButton(
            label: waiting.isEmpty ? 'Về bến · kiểm tra xe' : 'Về màn kiểm tra xe',
            color: waiting.isEmpty ? DTokens.ok : const Color(0xFFE2E8F0),
            outline: waiting.isNotEmpty,
            onPressed: () => Navigator.of(context).pop(),
          ),
        ),
      ),
    );
  }
}

class _HomeCard extends StatelessWidget {
  const _HomeCard({
    required this.p,
    required this.stop,
    required this.next,
    required this.canMoveUp,
    required this.canMoveDown,
    required this.onUp,
    required this.onDown,
    required this.onArrived,
    required this.onBoard,
    required this.onCod,
    required this.onMissed,
    required this.onCall,
    required this.onInaccessible,
  });
  final Passenger p;
  final HomeRunStop? stop;
  final bool next;
  final bool canMoveUp;
  final bool canMoveDown;
  final VoidCallback onUp;
  final VoidCallback onDown;
  final VoidCallback onArrived;
  final VoidCallback onBoard;
  final VoidCallback onCod;
  final VoidCallback onMissed;
  final VoidCallback onCall;
  final VoidCallback onInaccessible;

  static String _clock(DateTime t) {
    final v = t.toUtc().add(const Duration(hours: 7));
    return '${v.hour.toString().padLeft(2, '0')}:${v.minute.toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    final waiting = p.status == PaxStatus.waiting && !p.homeMissed && !p.inaccessible;
    final arrived = stop?.arrivedAt != null;
    final missable = stop?.missableAt;
    final canMiss = missable != null && !DateTime.now().isBefore(missable);
    final ready = stop?.readyLabel;
    final (pill, border) = p.status == PaxStatus.boarded
        ? (const StatusPill('Đã lên xe', DPill.ok), const Color(0xFF166534))
        : p.homeMissed
            ? (const StatusPill('Không ra · đi bến', DPill.mute), DTokens.line)
            : p.inaccessible
                ? (const StatusPill('Không vào được', DPill.warn), const Color(0xFFA16207))
                : arrived
                    // At the door the passenger's answer matters most: coming out, or a few more minutes.
                    ? (StatusPill(ready == null ? 'Đang chờ khách' : 'Chờ · $ready', stop?.readyStatus == 'READY' ? DPill.ok : DPill.warn), const Color(0xFFA16207))
                    : ready != null
                        ? (StatusPill(ready, stop?.readyStatus == 'READY' ? DPill.ok : DPill.warn), next ? const Color(0xFF1D4ED8) : DTokens.line)
                        : (const StatusPill('Chưa báo', DPill.mute), next ? const Color(0xFF1D4ED8) : DTokens.line);
    final call = OutlinedButton.icon(
      onPressed: onCall,
      icon: const Icon(Icons.call, size: 18),
      label: const Text('Gọi khách'),
      style: OutlinedButton.styleFrom(minimumSize: const Size(48, 48), foregroundColor: const Color(0xFFE2E8F0)),
    );
    return Panel(
      border: border,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          Text('#${stop?.position ?? '-'}', style: dmono(size: 22, color: next ? const Color(0xFF93C5FD) : DTokens.sub)),
          const SizedBox(width: 10),
          Text(p.seat, style: dmono(size: 18)),
          const SizedBox(width: 10),
          Expanded(child: Text(p.name, style: dsans(size: 16, weight: FontWeight.w600), overflow: TextOverflow.ellipsis)),
          pill,
          if (canMoveUp || canMoveDown) ...[
            IconButton(onPressed: canMoveUp ? onUp : null, icon: const Icon(Icons.arrow_upward), tooltip: 'Đón sớm hơn'),
            IconButton(onPressed: canMoveDown ? onDown : null, icon: const Icon(Icons.arrow_downward), tooltip: 'Đón muộn hơn'),
          ],
        ]),
        const SizedBox(height: 6),
        Text('${p.homePickup}${p.homeNote.isNotEmpty ? ' · ${p.homeNote}' : ''}', style: dsans(size: 14, weight: FontWeight.w600, color: DTokens.warnInk)),
        Text(
          [
            if (stop?.appointment != null) 'Hẹn ${stop!.appointment}',
            if (p.pickupWindow != null) 'khung ${p.pickupWindow}',
            p.pay,
          ].join(' · '),
          style: dsans(size: 13, color: DTokens.muted),
        ),
        if (waiting) ...[
          const SizedBox(height: 10),
          if (!arrived)
            Row(children: [
              Expanded(child: BigButton(label: 'Đã tới nhà khách', color: next ? DTokens.ok : const Color(0xFFE2E8F0), outline: !next, onPressed: onArrived)),
              const SizedBox(width: 8),
              call,
            ])
          else ...[
            Text('Xe đang chờ, tới ${_clock(missable!)} được đi tiếp', style: dsans(size: 14, color: DTokens.warnInk)),
            const SizedBox(height: 8),
            Row(children: [
              Expanded(
                child: p.codDue
                    ? BigButton(label: 'Thu ${vnd(p.cod)} và cho lên xe', color: DTokens.warn, foreground: const Color(0xFF1C1917), onPressed: onCod)
                    : BigButton(label: 'Cho lên xe', color: DTokens.ok, onPressed: onBoard),
              ),
              const SizedBox(width: 8),
              call,
            ]),
            const SizedBox(height: 8),
            BigButton(
              label: canMiss ? 'Khách không ra · đi tiếp' : 'Khách không ra · sau ${_clock(missable)}',
              outline: true,
              color: const Color(0xFFEF4444),
              onPressed: canMiss ? onMissed : null,
            ),
          ],
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton(onPressed: onInaccessible, style: TextButton.styleFrom(minimumSize: const Size(48, 44)), child: Text('Không vào được địa chỉ', style: dsans(size: 14, weight: FontWeight.w600, color: DTokens.warn))),
          ),
        ],
      ]),
    );
  }
}
