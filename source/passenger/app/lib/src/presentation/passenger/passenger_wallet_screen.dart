import 'package:flutter/material.dart';

import 'passenger_cancel_refund_screen.dart';
import 'passenger_live_radar_screen.dart';
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

  @override
  Widget build(BuildContext context) {
    final store = PassengerScope.of(context);
    final upcoming = store.tickets.where((t) => t.active).toList();
    final past = store.tickets.where((t) => !t.active).toList();
    final list = _history ? past : upcoming;
    return Column(children: [
      Container(
        color: PTokens.surface,
        child: SafeArea(
          bottom: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 20, 16, 12),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
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
            ]),
          ),
        ),
      ),
      const Divider(height: 1, color: PTokens.line),
      Expanded(
        child: store.loadingTickets && list.isEmpty
            ? const Center(child: CircularProgressIndicator())
            : list.isEmpty
            ? Padding(
                padding: const EdgeInsets.all(16),
                child: AppCard(child: Text(_history ? 'Chưa có vé nào trong lịch sử' : 'Chưa có chuyến sắp đi', textAlign: TextAlign.center, style: sans(size: 15, weight: FontWeight.w600))),
              )
            : RefreshIndicator(
                onRefresh: store.loadTickets,
                child: ListView.separated(
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
    final active = t.active;
    final status = switch (t.status) {
      TicketStatus.active => const Pill('Đã thanh toán', PillKind.ok),
      TicketStatus.boarded => const Pill('Đã lên xe', PillKind.ok),
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
            Text(active ? '${t.date} · Ghế ${t.seat} · Đón tại ${t.pickup}' : '${t.date} · Ghế ${t.seat}${t.refund != null ? ' · hoàn ${vnd(t.refund!)}' : ''}', style: sans(size: 13, color: PTokens.muted)),
            if (active) ...[
              gap(10),
              Row(children: [
                Expanded(child: PrimaryButton(label: 'Mở vé', onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => PassengerTicketQrScreen(ticket: t))))),
                const SizedBox(width: 8),
                Expanded(child: GhostButton(label: 'Theo dõi xe', onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => PassengerLiveRadarScreen(ticket: t))))),
              ]),
            ],
          ]),
        ),
      ]),
    );
  }
}
