import 'package:flutter/material.dart';

import 'passenger_cancel_refund_screen.dart';
import 'passenger_store.dart';
import 'passenger_widgets.dart';

/// PAX-020: newest first; a notice about a ticket opens that ticket's delay screen.
class PassengerNotificationsScreen extends StatelessWidget {
  const PassengerNotificationsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final store = PassengerScope.of(context);
    final notices = store.notices;
    return Column(children: [
      Container(
        color: PTokens.surface,
        width: double.infinity,
        child: SafeArea(bottom: false, child: Padding(padding: const EdgeInsets.fromLTRB(16, 20, 16, 14), child: Text('Thông báo', style: sans(size: 22, weight: FontWeight.w700)))),
      ),
      const Divider(height: 1, color: PTokens.line),
      Expanded(
        child: notices.isEmpty
            ? Padding(padding: const EdgeInsets.all(16), child: AppCard(child: Text('Chưa có thông báo', textAlign: TextAlign.center, style: sans(size: 15, weight: FontWeight.w600))))
            : RefreshIndicator(
          onRefresh: store.loadNotices,
          child: ListView.separated(
          padding: const EdgeInsets.all(16),
          itemCount: notices.length,
          separatorBuilder: (_, __) => gap(8),
          itemBuilder: (_, i) {
            final n = notices[i];
            final ticket = n.tripId == null ? null : store.tickets.where((t) => t.tripId == n.tripId && t.active).firstOrNull;
            final open = ticket != null && ticket.status == TicketStatus.active && ticket.delay > 0;
            return AppCard(
              onTap: open ? () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => PassengerDelayNoticeScreen(ticket: ticket))) : null,
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Row(children: [
                  Expanded(child: Text(n.title, style: sans(size: 14, weight: FontWeight.w700))),
                  Text(n.time, style: sans(size: 12, color: PTokens.muted)),
                ]),
                gap(4),
                Text(n.body, style: sans(size: 13, color: PTokens.muted, height: 1.5)),
              ]),
            );
          },
        ),
        ),
      ),
    ]);
  }
}
