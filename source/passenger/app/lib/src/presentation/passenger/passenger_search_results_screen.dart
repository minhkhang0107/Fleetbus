import 'package:flutter/material.dart';

import 'passenger_store.dart';
import 'passenger_trip_detail_screen.dart';
import 'passenger_widgets.dart';

/// PAX-006: trips with seats first, sold-out trips last and not tappable.
class PassengerSearchResultsScreen extends StatefulWidget {
  const PassengerSearchResultsScreen({super.key});

  @override
  State<PassengerSearchResultsScreen> createState() => _PassengerSearchResultsScreenState();
}

class _PassengerSearchResultsScreenState extends State<PassengerSearchResultsScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => PassengerScope.read(context).loadTrips());
  }

  @override
  Widget build(BuildContext context) {
    final store = PassengerScope.of(context);
    final all = store.trips;
    final open = all.where((t) => t.seatsLeft > 0).toList()
      ..sort((a, b) => switch (store.sort) {
            'price' => a.price.compareTo(b.price),
            'seats' => b.seatsLeft.compareTo(a.seatsLeft),
            _ => a.dep.compareTo(b.dep),
          });
    final full = all.where((t) => t.seatsLeft == 0).toList();
    return Scaffold(
      appBar: TopBar(
        title: '${store.originPlace.city} → ${store.destPlace.city}',
        subtitle: store.loadingTrips ? 'Đang tìm chuyến…' : (open.isEmpty ? 'Không có chuyến còn chỗ' : '${open.length} chuyến còn chỗ'),
      ),
      body: Column(children: [
        Container(
          color: PTokens.surface,
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
          child: Column(children: [
            Row(children: [
              for (final d in PassengerStore.dates) ...[
                if (d != PassengerStore.dates.first) const SizedBox(width: 8),
                Expanded(child: _Choice(label: d.short, selected: store.date == d.id, onTap: () {
                  store.setDate(d.id);
                  store.loadTrips();
                }, height: 48)),
              ],
            ]),
            gap(10),
            Row(children: [
              _Choice(label: 'Sớm nhất', selected: store.sort == 'time', onTap: () => store.setSort('time'), pill: true),
              const SizedBox(width: 8),
              _Choice(label: 'Giá thấp', selected: store.sort == 'price', onTap: () => store.setSort('price'), pill: true),
              const SizedBox(width: 8),
              _Choice(label: 'Nhiều chỗ', selected: store.sort == 'seats', onTap: () => store.setSort('seats'), pill: true),
            ]),
          ]),
        ),
        const Divider(height: 1, color: PTokens.line),
        Expanded(
          child: store.loadingTrips
              ? const Center(child: CircularProgressIndicator())
              : store.tripsError != null
              ? Padding(
                  padding: const EdgeInsets.all(16),
                  child: AppCard(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                      Text(store.tripsError!, style: sans(size: 15, weight: FontWeight.w600)),
                      gap(10),
                      PrimaryButton(label: 'Thử lại', onPressed: store.loadTrips),
                    ]),
                  ),
                )
              : all.isEmpty
              ? Padding(
                  padding: const EdgeInsets.all(16),
                  child: AppCard(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text('Chưa có chuyến cho tuyến này', style: sans(size: 15, weight: FontWeight.w600)),
                      gap(6),
                      Text('Thử Hà Nội → Thanh Hóa hoặc Hà Nội → Ninh Bình, hoặc gọi 1900 6868.', style: sans(size: 14, color: PTokens.muted)),
                    ]),
                  ),
                )
              : ListView(padding: const EdgeInsets.all(16), children: [
                  for (final t in open) ...[_TripCard(trip: t), gap(12)],
                  for (final t in full)
                    Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(borderRadius: BorderRadius.circular(PTokens.radius), border: Border.all(color: PTokens.lineStrong)),
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text('${t.dep} · ${t.type} · Hết chỗ', style: sans(size: 14, weight: FontWeight.w600, color: PTokens.muted)),
                        gap(4),
                        Text('Bến xe ${t.from} → ${t.to}', style: sans(size: 13, color: PTokens.muted)),
                      ]),
                    ),
                ]),
        ),
      ]),
    );
  }
}

class _Choice extends StatelessWidget {
  const _Choice({required this.label, required this.selected, required this.onTap, this.pill = false, this.height = 36});
  final String label;
  final bool selected;
  final VoidCallback onTap;
  final bool pill;
  final double height;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      selected: selected,
      button: true,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(pill ? 999 : PTokens.radiusControl),
        child: Container(
          height: height,
          padding: const EdgeInsets.symmetric(horizontal: 12),
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: selected ? PTokens.primarySoft : PTokens.surface,
            borderRadius: BorderRadius.circular(pill ? 999 : PTokens.radiusControl),
            border: Border.all(color: selected ? PTokens.primary : PTokens.line),
          ),
          child: Text(label, style: sans(size: 13, weight: selected ? FontWeight.w600 : FontWeight.w500, color: selected ? PTokens.primaryDark : PTokens.ink)),
        ),
      ),
    );
  }
}

class _TripCard extends StatelessWidget {
  const _TripCard({required this.trip});
  final Trip trip;

  @override
  Widget build(BuildContext context) {
    final few = trip.seatsLeft <= 3;
    return AppCard(
      padding: const EdgeInsets.all(16),
      onTap: () {
        PassengerScope.read(context).chooseTrip(trip);
        Navigator.of(context).push(MaterialPageRoute(builder: (_) => const PassengerTripDetailScreen()));
      },
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(color: trip.vip ? PTokens.primarySoft : const Color(0xFFF1F5F9), borderRadius: BorderRadius.circular(4)),
            child: Text(trip.type, style: sans(size: 12, weight: FontWeight.w600, color: trip.vip ? PTokens.primaryDark : const Color(0xFF334155))),
          ),
          const Spacer(),
          Text(vnd(trip.price), style: mono(size: 17, weight: FontWeight.w700)),
        ]),
        gap(12),
        Row(children: [
          Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(trip.dep, style: mono(size: 20, weight: FontWeight.w700)), Text(trip.from, style: sans(size: 12, color: PTokens.muted))]),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 10),
              child: Column(children: [
                Text(trip.duration, style: sans(size: 12, color: PTokens.muted)),
                const Divider(color: PTokens.lineStrong, height: 6),
                Text(trip.via, style: sans(size: 12, color: PTokens.muted)),
              ]),
            ),
          ),
          Column(crossAxisAlignment: CrossAxisAlignment.end, children: [Text(trip.arr, style: mono(size: 20, weight: FontWeight.w700)), Text(trip.to, style: sans(size: 12, color: PTokens.muted))]),
        ]),
        const Divider(height: 20, color: Color(0xFFF1F5F9)),
        Row(children: [
          Text(few ? 'Sắp hết: còn ${trip.seatsLeft} chỗ' : 'Còn ${trip.seatsLeft} chỗ', style: sans(size: 13, weight: FontWeight.w600, color: few ? const Color(0xFFB45309) : PTokens.success)),
          const Spacer(),
          Text('Xe ${trip.plate}', style: sans(size: 13, color: PTokens.muted)),
        ]),
      ]),
    );
  }
}
