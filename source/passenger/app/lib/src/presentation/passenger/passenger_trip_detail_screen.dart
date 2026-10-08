import 'package:flutter/material.dart';

import 'passenger_seat_map_screen.dart';
import 'passenger_store.dart';
import 'passenger_widgets.dart';

/// PAX-007 / PAX-008: the trip and its stops. The segment decides which seats are free, so it
/// comes before the seat map (D96).
class PassengerTripDetailScreen extends StatelessWidget {
  const PassengerTripDetailScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final store = PassengerScope.of(context);
    final trip = store.trip!;
    final stops = store.stops();
    final pickupIndex = stops.indexWhere((s) => s.id == store.pickup);
    final p = store.stop(store.pickup);
    final d = store.stop(store.dropoff);
    return Scaffold(
      appBar: TopBar(title: 'Điểm đón và điểm trả', subtitle: '${trip.dep} · ${store.travelDate.short.replaceAll(' · ', ' ')} · ${trip.type.split(' ').first} ${trip.plate}'),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        Text('Bạn lên xe ở đâu?', style: sans(size: 15, weight: FontWeight.w600)),
        gap(8),
        for (final s in stops.where((s) => s.pickup)) ...[
          _StopOption(stop: s, selected: s.id == store.pickup, enabled: true, onTap: () => store.setPickup(s.id)),
          gap(8),
        ],
        gap(12),
        Text('Bạn xuống xe ở đâu?', style: sans(size: 15, weight: FontWeight.w600)),
        gap(8),
        for (final s in stops.where((s) => s.dropoff)) ...[
          _StopOption(stop: s, selected: s.id == store.dropoff, enabled: stops.indexOf(s) > pickupIndex, onTap: () => store.setDropoff(s.id)),
          gap(8),
        ],
        gap(8),
        Text('Ghế trống ở bước sau tính theo đoạn bạn đi. Giá vé hiện là giá chung của chuyến, dù bạn đi đoạn nào.', style: sans(size: 13, color: PTokens.muted, height: 1.5)),
      ]),
      bottomNavigationBar: BottomAction(children: [
        Expanded(
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('${p.short} → ${d.short}', style: sans(size: 12, color: PTokens.muted)),
            Text(vnd(trip.price), style: mono(size: 17, weight: FontWeight.w700)),
          ]),
        ),
        PrimaryButton(label: 'Chọn ghế', onPressed: () => Navigator.of(context).push(MaterialPageRoute(settings: const RouteSettings(name: 'seats'), builder: (_) => const PassengerSeatMapScreen()))),
      ]),
    );
  }
}

class _StopOption extends StatelessWidget {
  const _StopOption({required this.stop, required this.selected, required this.enabled, required this.onTap});
  final Stop stop;
  final bool selected;
  final bool enabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Opacity(
      opacity: enabled ? 1 : 0.5,
      child: Semantics(
        selected: selected,
        enabled: enabled,
        inMutuallyExclusiveGroup: true,
        child: InkWell(
          onTap: enabled ? onTap : null,
          borderRadius: BorderRadius.circular(PTokens.radiusControl),
          child: Container(
            constraints: const BoxConstraints(minHeight: 56),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
            decoration: BoxDecoration(
              color: selected ? PTokens.primarySoft : PTokens.surface,
              borderRadius: BorderRadius.circular(PTokens.radiusControl),
              border: Border.all(color: selected ? PTokens.primary : PTokens.line),
            ),
            child: Row(children: [
              Icon(selected ? Icons.radio_button_checked : Icons.radio_button_unchecked, color: selected ? PTokens.primary : PTokens.muted, size: 20),
              const SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(stop.name, style: sans(size: 15, weight: FontWeight.w600)),
                  Text(stop.note, style: sans(size: 12, color: PTokens.muted)),
                ]),
              ),
              Text(stop.time, style: mono(size: 14)),
            ]),
          ),
        ),
      ),
    );
  }
}
