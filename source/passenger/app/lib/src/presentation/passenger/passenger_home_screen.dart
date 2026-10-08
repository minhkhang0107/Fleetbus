import 'package:flutter/material.dart';

import 'passenger_location_picker_screen.dart';
import 'passenger_search_results_screen.dart';
import 'passenger_store.dart';
import 'passenger_ticket_qr_screen.dart';
import 'passenger_widgets.dart';

/// PAX-004: search by route and date only; the seats picked later are the passenger count (D109).
class PassengerHomeScreen extends StatelessWidget {
  const PassengerHomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final store = PassengerScope.of(context);
    final upcoming = store.tickets.where((t) => t.status == TicketStatus.active).toList();
    final name = store.userName;
    return SafeArea(
      child: ListView(padding: const EdgeInsets.fromLTRB(16, 24, 16, 24), children: [
        Row(children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(name == null ? 'Xin chào' : 'Xin chào, ${name.split(' ').last}', style: sans(size: 13, color: PTokens.muted)),
              Text('Bạn muốn đi đâu?', style: sans(size: 22, weight: FontWeight.w700)),
            ]),
          ),
          CircleAvatar(
            radius: 20,
            backgroundColor: PTokens.primarySoft,
            child: Text(name == null ? '?' : 'NA', style: sans(size: 14, weight: FontWeight.w600, color: PTokens.primaryDark)),
          ),
        ]),
        gap(20),
        AppCard(
          padding: const EdgeInsets.all(16),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Container(
              decoration: BoxDecoration(border: Border.all(color: PTokens.line), borderRadius: BorderRadius.circular(PTokens.radiusControl)),
              child: Stack(children: [
                Column(children: [
                  _PlaceField(label: 'Điểm đi', place: store.originPlace, isOrigin: true),
                  const Divider(height: 1, color: PTokens.line),
                  _PlaceField(label: 'Điểm đến', place: store.destPlace, isOrigin: false),
                ]),
                Positioned(
                  right: 10,
                  top: 0,
                  bottom: 0,
                  child: Center(
                    child: Material(
                      color: PTokens.surface,
                      shape: const CircleBorder(side: BorderSide(color: PTokens.line)),
                      child: IconButton(tooltip: 'Đổi chiều điểm đi và điểm đến', onPressed: store.swapPlaces, icon: const Icon(Icons.swap_vert, color: PTokens.primary)),
                    ),
                  ),
                ),
              ]),
            ),
            gap(12),
            Text('Ngày đi', style: sans(size: 12, color: PTokens.muted)),
            gap(4),
            DropdownButtonFormField<String>(
              initialValue: store.date,
              items: [for (final d in PassengerStore.dates) DropdownMenuItem(value: d.id, child: Text(d.long, style: sans(size: 15, weight: FontWeight.w600)))],
              onChanged: (v) => store.setDate(v!),
            ),
            gap(12),
            PrimaryButton(
              label: 'Tìm chuyến',
              icon: Icons.search,
              onPressed: () {
                if (store.origin == store.dest) {
                  showToast(context, 'Điểm đi và điểm đến phải khác nhau.');
                  return;
                }
                Navigator.of(context).push(MaterialPageRoute(builder: (_) => const PassengerSearchResultsScreen()));
              },
            ),
          ]),
        ),
        if (upcoming.isNotEmpty) ...[
          gap(20),
          Text('Chuyến sắp đi', style: sans(size: 15, weight: FontWeight.w600)),
          gap(10),
          _UpcomingCard(ticket: upcoming.last),
        ],
        gap(20),
        Text('Tìm lại gần đây', style: sans(size: 15, weight: FontWeight.w600)),
        gap(10),
        Wrap(spacing: 8, runSpacing: 8, children: [
          _RecentChip(label: 'Hà Nội → Thanh Hóa', origin: 'hn', dest: 'th'),
          _RecentChip(label: 'Hà Nội → Ninh Bình', origin: 'hn', dest: 'nb'),
        ]),
      ]),
    );
  }
}

class _PlaceField extends StatelessWidget {
  const _PlaceField({required this.label, required this.place, required this.isOrigin});
  final String label;
  final Place place;
  final bool isOrigin;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => PassengerLocationPickerScreen(isOrigin: isOrigin))),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 10, 64, 10),
        child: Row(children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(label, style: sans(size: 12, color: PTokens.muted)),
              const SizedBox(height: 2),
              Text('${place.city} · ${place.station}', style: sans(size: 15, weight: FontWeight.w600)),
            ]),
          ),
        ]),
      ),
    );
  }
}

class _UpcomingCard extends StatelessWidget {
  const _UpcomingCard({required this.ticket});
  final Ticket ticket;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => PassengerTicketQrScreen(ticket: ticket))),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [PnrTag(ticket.pnr), const Spacer(), const Pill('Đã thanh toán', PillKind.ok)]),
        gap(10),
        Row(crossAxisAlignment: CrossAxisAlignment.baseline, textBaseline: TextBaseline.alphabetic, children: [
          Text(ticket.departure, style: mono(size: 20, weight: FontWeight.w700)),
          const SizedBox(width: 8),
          Expanded(child: Text(ticket.route, style: sans(size: 15, weight: FontWeight.w600))),
        ]),
        gap(10),
        Row(children: [
          Expanded(child: Text('${ticket.date} · Ghế ${ticket.seat}', style: sans(size: 13, color: PTokens.muted))),
          Text('Mở vé', style: sans(size: 13, weight: FontWeight.w600, color: PTokens.primaryDark)),
        ]),
      ]),
    );
  }
}

class _RecentChip extends StatelessWidget {
  const _RecentChip({required this.label, required this.origin, required this.dest});
  final String label;
  final String origin;
  final String dest;

  @override
  Widget build(BuildContext context) {
    return ActionChip(
      label: Text(label, style: sans(size: 14)),
      backgroundColor: PTokens.surface,
      side: const BorderSide(color: PTokens.line),
      shape: const StadiumBorder(),
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 10),
      onPressed: () {
        final store = PassengerScope.read(context);
        store.setPlace(isOrigin: true, code: origin);
        store.setPlace(isOrigin: false, code: dest);
        Navigator.of(context).push(MaterialPageRoute(builder: (_) => const PassengerSearchResultsScreen()));
      },
    );
  }
}
