import 'dart:async';

import 'package:flutter/material.dart';

import 'passenger_cancel_refund_screen.dart';
import 'passenger_live_radar_screen.dart';
import 'passenger_login_screen.dart';
import 'passenger_main_shell.dart';
import 'passenger_store.dart';
import 'passenger_ticket_qr_screen.dart';
import 'passenger_widgets.dart';

/// PAX-016: upcoming and history tabs; a delayed trip carries its banner on the card.
class PassengerWalletScreen extends StatefulWidget {
  const PassengerWalletScreen({super.key});

  @override
  State<PassengerWalletScreen> createState() => _PassengerWalletScreenState();
}

class _PassengerWalletScreenState extends State<PassengerWalletScreen> {
  bool _history = false;

  /// What the passenger sees with no ticket: sign in first, else how to get one (or what history keeps).
  Widget _empty(BuildContext context, PassengerStore store) {
    if (store.userPhone == null) {
      return EmptyState(
        icon: Icons.lock_person_outlined,
        title: 'Đăng nhập để xem vé',
        message: 'Vé đã đặt, mã QR lên xe và vé đã hủy được lưu theo số điện thoại của bạn.',
        actionLabel: 'Đăng nhập',
        actionIcon: Icons.login,
        onAction: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const PassengerLoginScreen())),
      );
    }
    if (_history) {
      return EmptyState(
        icon: Icons.history,
        title: 'Chưa có chuyến đã đi',
        message: 'Chuyến đã đi, vé đã hủy và tiền hoàn sẽ được lưu ở đây.',
        onRefresh: store.loadTickets,
      );
    }
    return EmptyState(
      icon: Icons.confirmation_number_outlined,
      title: 'Chưa có chuyến sắp đi',
      message: 'Vé bạn đặt sẽ hiện ở đây cùng mã QR lên xe và vị trí xe trên đường.',
      actionLabel: 'Đặt vé',
      actionIcon: Icons.search,
      onAction: () => PassengerMainShell.openTab(context, 0),
      onRefresh: store.loadTickets,
    );
  }

  @override
  Widget build(BuildContext context) {
    final store = PassengerScope.of(context);
    final upcoming = store.tickets.where((t) => !t.past).toList();
    final past = store.tickets.where((t) => t.past).toList();
    final list = _history ? past : upcoming;
    return Column(children: [
      Container(
        color: PTokens.surface,
        child: SafeArea(
          bottom: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 20, 16, 12),
            child: PMaxWidth(maxWidth: 720, child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Text('Vé của tôi', style: sans(size: 22, weight: FontWeight.w700)),
              gap(14),
              Container(
                padding: const EdgeInsets.all(4),
                decoration: BoxDecoration(color: const Color(0xFFF1F5F9), borderRadius: BorderRadius.circular(PTokens.radiusControl)),
                child: Row(children: [
                  _tab('Sắp đi · ${upcoming.length}', !_history, () => setState(() => _history = false)),
                  _tab('Lịch sử', _history, () => setState(() => _history = true)),
                ]),
              ),
            ])),
          ),
        ),
      ),
      const Divider(height: 1, color: PTokens.line),
      Expanded(
        child: store.loadingTickets && list.isEmpty
            ? const Center(child: CircularProgressIndicator())
            : list.isEmpty
            ? _empty(context, store)
            : RefreshIndicator(
                onRefresh: store.loadTickets,
                child: pWide(context)
                    // Two tickets per row on wide screens.
                    ? LayoutBuilder(builder: (context, box) {
                        final w = (box.maxWidth - 48 - 16) / 2;
                        return ListView(padding: const EdgeInsets.all(24), children: [
                          Wrap(spacing: 16, runSpacing: 12, children: [for (final t in list) SizedBox(width: w, child: TicketCard(ticket: t))]),
                        ]);
                      })
                    : ListView.separated(
                        padding: const EdgeInsets.all(16),
                        itemCount: list.length,
                        separatorBuilder: (_, __) => gap(12),
                        itemBuilder: (_, i) => TicketCard(ticket: list[i]),
                      ),
              ),
      ),
    ]);
  }

  Widget _tab(String label, bool selected, VoidCallback onTap) => Expanded(
        child: Semantics(
          selected: selected,
          button: true,
          child: GestureDetector(
            onTap: onTap,
            child: Container(
              height: 40,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: selected ? PTokens.surface : Colors.transparent,
                borderRadius: BorderRadius.circular(6),
                boxShadow: selected ? const [BoxShadow(color: Color(0x140F172A), blurRadius: 2, offset: Offset(0, 1))] : null,
              ),
              child: Text(label, style: sans(size: 14, weight: FontWeight.w600, color: selected ? PTokens.primaryDark : PTokens.muted)),
            ),
          ),
        ),
      );
}

class TicketCard extends StatelessWidget {
  const TicketCard({super.key, required this.ticket});
  final Ticket ticket;

  @override
  Widget build(BuildContext context) {
    final t = ticket;
    final active = !t.past && t.active;
    final status = switch (t.status) {
      TicketStatus.active => const Pill('Đã thanh toán', PillKind.ok),
      TicketStatus.boarded => t.past ? const Pill('Đã đi', PillKind.mute) : const Pill('Đã lên xe', PillKind.ok),
      TicketStatus.refunding => const Pill('Đang hoàn tiền', PillKind.info),
      TicketStatus.noShow => const Pill('Vắng mặt', PillKind.mute),
      TicketStatus.cancelled => const Pill('Đã hủy', PillKind.mute),
    };
    return Container(
      decoration: BoxDecoration(color: PTokens.surface, borderRadius: BorderRadius.circular(PTokens.radius), border: Border.all(color: PTokens.line)),
      clipBehavior: Clip.antiAlias,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        if (t.delay > 0 && active)
          Material(
            color: PTokens.warnSoft,
            child: InkWell(
              onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => PassengerDelayNoticeScreen(ticket: t))),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                child: Row(children: [
                  const Icon(Icons.warning_amber_rounded, size: 16, color: PTokens.warnInk),
                  const SizedBox(width: 8),
                  Expanded(child: Text('Chậm ${t.delay} phút · Được hủy miễn phí', style: sans(size: 13, weight: FontWeight.w600, color: PTokens.warnInk))),
                  const Icon(Icons.chevron_right, size: 18, color: PTokens.warnInk),
                ]),
              ),
            ),
          ),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Row(children: [PnrTag(t.pnr), const Spacer(), status]),
            gap(10),
            Wrap(crossAxisAlignment: WrapCrossAlignment.end, spacing: 8, children: [
              if (t.delay > 0) Text(t.dep, style: mono(size: 20, weight: FontWeight.w700, color: const Color(0xFF94A3B8), decoration: TextDecoration.lineThrough)),
              Text(t.departure, style: mono(size: 20, weight: FontWeight.w700)),
              Text(t.route, style: sans(size: 15, weight: FontWeight.w600)),
            ]),
            gap(6),
            Text(active ? '${t.date} · Ghế ${t.seat} · ${_pickupLine(t)}' : '${t.date} · Ghế ${t.seat}${t.refund != null ? ' · hoàn ${vnd(t.refund!)}' : ''}', style: sans(size: 13, color: PTokens.muted)),
            if (active && t.status == TicketStatus.active) _BusComing(ticket: t),
            if (active) ...[
              gap(10),
              Row(children: [
                Expanded(child: PrimaryButton(label: 'Mở vé', onPressed: () {
                  final store = PassengerScope.read(context);
                  Navigator.of(context).push(MaterialPageRoute(builder: (_) => PassengerTicketQrScreen(ticket: t))).then((_) => store.loadTickets());
                })),
                const SizedBox(width: 8),
                Expanded(child: GhostButton(label: 'Theo dõi xe', onPressed: () {
                  final store = PassengerScope.read(context);
                  Navigator.of(context).push(MaterialPageRoute(builder: (_) => PassengerLiveRadarScreen(ticket: t))).then((_) => store.loadTickets());
                })),
              ]),
            ],
          ]),
        ),
      ]),
    );
  }
}

/// D143: on the ticket itself, how far the bus is and when it will be there, once it is on its way.
class _BusComing extends StatefulWidget {
  const _BusComing({required this.ticket});
  final Ticket ticket;

  @override
  State<_BusComing> createState() => _BusComingState();
}

class _BusComingState extends State<_BusComing> {
  Tracking? _tracking;
  Timer? _poll;

  @override
  void initState() {
    super.initState();
    _load();
    _poll = Timer.periodic(const Duration(seconds: 30), (_) => _load());
  }

  @override
  void dispose() {
    _poll?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    final t = await PassengerScope.read(context).loadTracking(widget.ticket.tripId, ticketId: widget.ticket.id);
    if (mounted) setState(() => _tracking = t);
  }

  @override
  Widget build(BuildContext context) {
    final tr = _tracking;
    if (tr == null || tr.busLat == null || tr.etaMinutes == null || tr.passedTarget || tr.publicView) return const SizedBox.shrink();
    final home = tr.target?.isHome == true;
    final at = tr.expectedAt == null ? '' : ' · tới lúc ~${clockOf(tr.expectedAt!)}';
    final where = tr.atTarget
        ? (tr.target?.name ?? '')
        : home
            ? 'Xe đang trên đường tới chỗ bạn'
            : (tr.location?.sentence ?? 'Xe đang trên đường tới điểm đón');
    final late = (tr.lateMinutes ?? 0) >= 5 ? ' · trễ ~${tr.lateMinutes} phút' : '';
    return Padding(
      padding: const EdgeInsets.only(top: 10),
      child: Material(
        color: PTokens.primarySoft,
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => PassengerLiveRadarScreen(ticket: widget.ticket))),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            child: Row(children: [
              const Icon(Icons.directions_bus, size: 20, color: PTokens.primary),
              const SizedBox(width: 10),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(
                    tr.atTarget ? (home ? 'Xe đã tới, mời bạn ra xe' : 'Xe đã tới điểm đón') : 'Xe còn ${tr.etaMinutes} phút$at',
                    style: sans(size: 14, weight: FontWeight.w700, color: PTokens.ink),
                  ),
                  Text('$where$late', style: sans(size: 12, color: PTokens.muted)),
                ]),
              ),
              const Icon(Icons.chevron_right, size: 18, color: PTokens.muted),
            ]),
          ),
        ),
      ),
    );
  }
}

/// A confirmed home pickup is collected at the address, not at the ticket's stop (D143).
String _pickupLine(Ticket t) => t.homePickup != null && (t.homePickupStatus ?? 'CONFIRMED') == 'CONFIRMED'
    ? 'Đón tận nhà: ${t.homePickup}'
    : 'Đón tại ${t.pickup}';
