import 'package:flutter/material.dart';

import 'passenger_location_picker_screen.dart';
import 'passenger_promo_screen.dart';
import 'passenger_search_results_screen.dart';
import 'passenger_date_picker.dart';
import 'passenger_store.dart';
import 'passenger_ticket_qr_screen.dart';
import 'passenger_widgets.dart';

/// PAX-004: search by route and date only; the seats picked later are the passenger count (D109).
/// Two zones (D124): booking (search, recent searches, the next trip), then the company's promotion
/// slider, which is left out when the server has no slide. Side by side on wide screens.
class PassengerHomeScreen extends StatelessWidget {
  const PassengerHomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final store = PassengerScope.of(context);
    final upcoming = store.tickets.where((t) => t.status == TicketStatus.active).toList();
    final name = store.userName;
    final op = store.operator;
    final recent = store.recentPairs;
    return SafeArea(
      child: PSplit(padding: const EdgeInsets.fromLTRB(16, 24, 16, 24), leftFlex: 5, rightFlex: 4, left: [
        Row(children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              if (op != null) Text(op.name, style: sans(size: 12, weight: FontWeight.w600, color: PTokens.primary)),
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
              // Both fields have the same height (one line each), so the swap button centred on the box sits on the
              // divider between them.
              child: Stack(alignment: Alignment.centerRight, children: [
                Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  _PlaceField(label: 'Điểm đi', place: store.originPlace, isOrigin: true, fixed: store.fixedRoute),
                  const Divider(height: 1, color: PTokens.line),
                  _PlaceField(label: 'Điểm đến', place: store.destPlace, isOrigin: false, fixed: store.fixedRoute),
                ]),
                Padding(
                  padding: const EdgeInsets.only(right: 12),
                  child: Tooltip(
                    message: store.canSwap ? 'Đổi chiều điểm đi và điểm đến' : 'Nhà xe chỉ chạy một chiều',
                    child: Material(
                      color: PTokens.surface,
                      shape: const CircleBorder(side: BorderSide(color: PTokens.line)),
                      clipBehavior: Clip.antiAlias,
                      child: InkWell(
                        onTap: store.canSwap ? store.swapPlaces : null,
                        child: SizedBox(
                          width: 44,
                          height: 44,
                          child: Icon(Icons.swap_vert, size: 22, color: store.canSwap ? PTokens.primary : PTokens.line),
                        ),
                      ),
                    ),
                  ),
                ),
              ]),
            ),
            gap(12),
            Text('Ngày đi', style: sans(size: 12, color: PTokens.muted)),
            gap(4),
            const TravelDateField(),
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
        if (recent.isNotEmpty) ...[
          gap(20),
          Text('Tìm lại gần đây', style: sans(size: 15, weight: FontWeight.w600)),
          gap(10),
          Wrap(spacing: 8, runSpacing: 8, children: [
            for (final pair in recent)
              _RecentChip(
                label: '${store.places[pair[0]]?.city} → ${store.places[pair[1]]?.city}',
                origin: pair[0],
                dest: pair[1],
              ),
          ]),
        ],
        if (upcoming.isNotEmpty) ...[
          gap(20),
          Text('Chuyến sắp đi', style: sans(size: 15, weight: FontWeight.w600)),
          gap(10),
          _UpcomingCard(ticket: upcoming.last),
        ],
      ], right: [
        if (store.banners.isNotEmpty) ...[
          if (!pWide(context)) gap(24),
          PromoSlider(banners: store.banners),
        ],
      ]),
    );
  }
}

class _PlaceField extends StatelessWidget {
  const _PlaceField({required this.label, required this.place, required this.isOrigin, this.fixed = false});
  final String label;
  final Place place;
  final bool isOrigin;
  /// The company fixed its origin and destination (D135): shown, not picked.
  final bool fixed;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: fixed ? null : () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => PassengerLocationPickerScreen(isOrigin: isOrigin))),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 10, 68, 10),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(label, style: sans(size: 12, color: PTokens.muted)),
          const SizedBox(height: 2),
          Text(place.city, maxLines: 1, overflow: TextOverflow.ellipsis, style: sans(size: 15, weight: FontWeight.w600)),
          Text(place.station, maxLines: 1, overflow: TextOverflow.ellipsis, style: sans(size: 13, color: PTokens.muted)),
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
