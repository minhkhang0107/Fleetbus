import 'package:flutter/material.dart';

import 'passenger_date_picker.dart';
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
  /// The day, sort and state the list on screen shows; it changes only once the new answer is in (D180).
  String? _shownKey;
  /// Which way the list slides when the day changes: a later day comes in from the right, an earlier from the left.
  double _direction = 1;

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
        subtitle: '${store.travelDate.long} · ${store.loadingTrips ? 'đang tìm chuyến…' : (open.isEmpty ? 'không có chuyến còn chỗ' : '${open.length} chuyến còn chỗ')}',
      ),
      body: Column(children: [
        Container(
          color: PTokens.surface,
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
          child: PMaxWidth(maxWidth: 720, child: Column(children: [
            TravelDateStrip(onChanged: (day) {
              store.setDate(day);
              store.loadTrips();
            }),
            gap(10),
            // One control for the order of the list, the same as the tabs of the wallet (D181).
            SegmentedSwitch<String>(
              segments: const [('time', 'Sớm nhất'), ('price', 'Giá thấp nhất'), ('seats', 'Nhiều chỗ nhất')],
              value: store.sort,
              onChanged: store.setSort,
            ),
          ])),
        ),
        const Divider(height: 1, color: PTokens.line),
        Expanded(
          child: _animated(store, store.loadingTrips && all.isEmpty && store.tripsError == null
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
              ? Align(
                  alignment: Alignment.topCenter,
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: AppCard(
                      child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                        Text('Không có chuyến ${store.originPlace.city} → ${store.destPlace.city} ngày ${store.travelDate.dayMonth}', style: sans(size: 15, weight: FontWeight.w600)),
                        gap(6),
                        // Spec 6.3: point to the next day that has a departure, or say the company does not run this way.
                        if (store.nextRunDay != null) ...[
                          Text('Ngày gần nhất có chuyến: ${TravelDate.of(store.nextRunDay!, today: store.calendar.today).long}.', style: sans(size: 14, color: PTokens.muted)),
                          gap(10),
                          PrimaryButton(label: 'Xem ngày ${TravelDate.of(store.nextRunDay!).dayMonth}', onPressed: () {
                            store.setDate(store.nextRunDay!);
                            store.loadTrips();
                          }),
                        ] else
                          Text('Nhà xe chưa có chuyến chiều này trong ${daysBetween(store.calendar.today, store.calendar.lastDate) + 1} ngày tới. Chọn ngày hoặc chiều khác, hoặc gọi ${store.operator?.hotline ?? 'tổng đài nhà xe'}.', style: sans(size: 14, color: PTokens.muted)),
                      ]),
                    ),
                  ),
                )
              : LayoutBuilder(builder: (context, box) {
                  // Two trip cards per row on wide screens, one on phones.
                  final cols = pWide(context) ? 2 : 1;
                  final pad = cols == 2 ? 24.0 : 16.0;
                  final cardWidth = (box.maxWidth - pad * 2 - 16 * (cols - 1)) / cols;
                  return ListView(padding: EdgeInsets.all(pad), children: [
                    Wrap(spacing: 16, runSpacing: 12, children: [
                      for (final (i, t) in open.indexed) SizedBox(width: cardWidth, child: FadeSlideIn(index: i, child: _TripCard(trip: t))),
                      for (final t in full)
                        SizedBox(
                          width: cardWidth,
                          child: Container(
                            padding: const EdgeInsets.all(16),
                            decoration: BoxDecoration(borderRadius: BorderRadius.circular(PTokens.radius), border: Border.all(color: PTokens.lineStrong)),
                            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                              Text('${t.dep} · ${t.type} · Hết chỗ', style: sans(size: 14, weight: FontWeight.w600, color: PTokens.muted)),
                              gap(4),
                              Text('Bến xe ${t.from} → ${t.to}', style: sans(size: 13, color: PTokens.muted)),
                            ]),
                          ),
                        ),
                    ]),
                  ]);
                }),
        )),
      ]),
    );
  }

  /// While a new day loads, the previous list stays, dimmed under a thin progress bar, instead of blinking to a
  /// spinner; then the new list slides in. A change of sort only cross-fades.
  Widget _animated(PassengerStore store, Widget content) {
    final reduced = Motion.reduced(context);
    if (!store.loadingTrips) {
      final key = '${store.date}|${store.sort}|${store.tripsError ?? ''}';
      final previousDay = _shownKey?.split('|').first;
      if (previousDay != null && previousDay != store.date) _direction = store.date.compareTo(previousDay) > 0 ? 1 : -1;
      if (previousDay == store.date) _direction = 0;
      _shownKey = key;
    }
    final busy = store.loadingTrips && _shownKey != null;
    return Stack(children: [
      AnimatedSwitcher(
        duration: reduced ? Duration.zero : Motion.base,
        switchInCurve: Motion.settle,
        switchOutCurve: Curves.easeIn,
        layoutBuilder: (current, previous) => Stack(alignment: Alignment.topCenter, children: [...previous, if (current != null) current]),
        transitionBuilder: (child, animation) => FadeTransition(
          opacity: animation,
          child: SlideTransition(position: Tween<Offset>(begin: Offset(0.08 * _direction, 0), end: Offset.zero).animate(animation), child: child),
        ),
        child: KeyedSubtree(
          key: ValueKey(_shownKey ?? 'first'),
          child: AnimatedOpacity(
            opacity: busy ? 0.4 : 1,
            duration: reduced ? Duration.zero : Motion.fast,
            child: IgnorePointer(ignoring: busy, child: content),
          ),
        ),
      ),
      if (busy) const Positioned(top: 0, left: 0, right: 0, child: LinearProgressIndicator(minHeight: 2)),
    ]);
  }
}

class _TripCard extends StatelessWidget {
  const _TripCard({required this.trip});
  final Trip trip;

  @override
  Widget build(BuildContext context) {
    final few = trip.seatsLeft <= 3;
    // The passenger's own ride on this trip: where they get on and off, at what time.
    final store = PassengerScope.of(context);
    final ride = store.rideFor(trip);
    final i = trip.stops.indexOf(ride.on);
    final j = trip.stops.indexOf(ride.off);
    final between = j > i ? j - i - 1 : 0;
    int toMin(String hhmm) => int.parse(hhmm.substring(0, 2)) * 60 + int.parse(hhmm.substring(3, 5));
    final mins = (toMin(ride.off.time) - toMin(ride.on.time) + 24 * 60) % (24 * 60);
    final rideDuration = '${mins ~/ 60} giờ${mins % 60 == 0 ? '' : ' ${mins % 60} phút'}';
    return AppCard(
      padding: const EdgeInsets.all(16),
      onTap: () {
        PassengerScope.read(context).chooseTrip(trip);
        Navigator.of(context).push(MaterialPageRoute(builder: (_) => const PassengerTripDetailScreen()));
      },
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          Flexible(
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(color: trip.vip ? PTokens.primarySoft : const Color(0xFFF1F5F9), borderRadius: BorderRadius.circular(4)),
              child: Text(trip.type, overflow: TextOverflow.ellipsis, maxLines: 1, style: sans(size: 12, weight: FontWeight.w600, color: trip.vip ? PTokens.primaryDark : const Color(0xFF334155))),
            ),
          ),
          const SizedBox(width: 8),
          const Spacer(),
          Text(vnd(store.fareOf(trip)), style: mono(size: 17, weight: FontWeight.w700)),
        ]),
        gap(12),
        Row(children: [
          Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(ride.on.time, style: mono(size: 20, weight: FontWeight.w700)), Text(ride.on.short, style: sans(size: 12, color: PTokens.muted))]),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 10),
              child: Column(children: [
                Text(rideDuration, style: sans(size: 12, color: PTokens.muted)),
                const Divider(color: PTokens.lineStrong, height: 6),
                Text(between == 0 ? 'Thẳng' : '$between điểm dừng', style: sans(size: 12, color: PTokens.muted)),
              ]),
            ),
          ),
          Column(crossAxisAlignment: CrossAxisAlignment.end, children: [Text(ride.off.time, style: mono(size: 20, weight: FontWeight.w700)), Text(ride.off.short, style: sans(size: 12, color: PTokens.muted))]),
        ]),
        const Divider(height: 20, color: Color(0xFFF1F5F9)),
        Row(children: [
          Text(few ? 'Sắp hết: còn ${trip.seatsLeft} chỗ' : 'Còn ${trip.seatsLeft} chỗ', style: sans(size: 13, weight: FontWeight.w600, color: few ? const Color(0xFFB45309) : PTokens.success)),
          const Spacer(),
          Text(trip.plate.isEmpty ? 'Chưa có biển số xe' : 'Xe ${trip.plate}', style: sans(size: 13, color: PTokens.muted)),
        ]),
      ]),
    );
  }
}
