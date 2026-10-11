import 'package:flutter/material.dart';

import 'passenger_home_address_screen.dart';
import 'passenger_route_map.dart';
import 'passenger_seat_map_screen.dart';
import 'passenger_store.dart';
import 'passenger_widgets.dart';

/// PAX-007 / PAX-008: the trip and its stops. The segment decides which seats are free, so it
/// comes before the seat map (D96). A route set to ROUTE_LINE is drawn like a bus line with every
/// pickup and drop-off point; a STATIONS route lists its bus stations only. Home pickup / drop-off
/// are offered when the route allows them.
class PassengerTripDetailScreen extends StatelessWidget {
  const PassengerTripDetailScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final store = PassengerScope.of(context);
    final trip = store.trip!;
    final p = store.stop(store.pickup);
    final d = store.stop(store.dropoff);
    final homeOptionsPickup = [
      if (trip.homePickup) ...[
        _HomeOption(pickupSide: true, home: store.homePickup),
        gap(8),
      ],
    ];
    final homeOptionsDropoff = [
      if (trip.homeDropoff) ...[
        _HomeOption(pickupSide: false, home: store.homeDropoff),
        gap(8),
      ],
    ];
    final note = Text('Ghế trống ở bước sau tính theo đoạn bạn đi. Giá vé hiện là giá chung của chuyến, dù bạn đi đoạn nào.', style: sans(size: 13, color: PTokens.muted, height: 1.5));
    final Widget body;
    if (trip.routeLine) {
      final map = _RouteMap(trip: trip, pickupId: store.pickup, dropoffId: store.dropoff);
      body = PSplit(leftFlex: 5, rightFlex: 4, left: [
        Text('Lộ trình và điểm đón trả', style: sans(size: 15, weight: FontWeight.w600)),
        gap(8),
        const _RouteLinePicker(),
        if (!pWide(context)) ...[gap(12), map],
      ], right: [
        if (pWide(context)) ...[map, gap(16)],
        if (homeOptionsPickup.isNotEmpty || homeOptionsDropoff.isNotEmpty) ...[
          Text('Hoặc đón trả tận nhà', style: sans(size: 15, weight: FontWeight.w600)),
          gap(8),
          ...homeOptionsPickup,
          ...homeOptionsDropoff,
        ],
        note,
      ]);
    } else {
      // Bus stations only: no route drawing, the stations and the home options.
      final stations = store.stops().where((s) => s.station).toList();
      final pickupIndex = stations.indexWhere((s) => s.id == store.pickup);
      body = PSplit(left: [
        Text('Bạn lên xe ở bến nào?', style: sans(size: 15, weight: FontWeight.w600)),
        gap(8),
        for (final s in stations.where((s) => s.pickup)) ...[
          _StopOption(stop: s, selected: store.homePickup == null && s.id == store.pickup, enabled: true, onTap: () => store.setPickup(s.id)),
          gap(8),
        ],
        ...homeOptionsPickup,
      ], right: [
        if (!pWide(context)) gap(12),
        Text('Bạn xuống xe ở bến nào?', style: sans(size: 15, weight: FontWeight.w600)),
        gap(8),
        for (final s in stations.where((s) => s.dropoff)) ...[
          _StopOption(stop: s, selected: store.homeDropoff == null && s.id == store.dropoff, enabled: stations.indexOf(s) > pickupIndex, onTap: () => store.setDropoff(s.id)),
          gap(8),
        ],
        ...homeOptionsDropoff,
        gap(8),
        note,
      ]);
    }
    return Scaffold(
      appBar: TopBar(title: 'Điểm đón và điểm trả', subtitle: '${trip.dep} · ${TravelDate.of(trip.day.isEmpty ? store.date : trip.day).long} · ${trip.type.split(' ').first} ${trip.plate}'),
      body: body,
      bottomNavigationBar: BottomAction(children: [
        Expanded(
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('${store.homePickup != null ? 'Tận nhà' : '${p.short} ${p.time}'} → ${store.homeDropoff != null ? 'Tận nhà' : '${d.short} ${d.time}'}', style: sans(size: 12, color: PTokens.muted)),
            Text(store.homeFees > 0 ? '${vnd(trip.price)} + ${vnd(store.homeFees)}' : vnd(trip.price), style: mono(size: 17, weight: FontWeight.w700)),
          ]),
        ),
        PrimaryButton(label: 'Chọn ghế', onPressed: () => Navigator.of(context).push(MaterialPageRoute(settings: const RouteSettings(name: 'seats'), builder: (_) => const PassengerSeatMapScreen()))),
      ]),
    );
  }
}

/// The route as a bus line: one node per stop on a vertical line, with its planned time, whether it is a
/// station or a roadside point, and what it serves. The passenger picks where to get on, then where to get
/// off; the ride between them is highlighted.
class _RouteLinePicker extends StatefulWidget {
  const _RouteLinePicker();

  @override
  State<_RouteLinePicker> createState() => _RouteLinePickerState();
}

class _RouteLinePickerState extends State<_RouteLinePicker> {
  bool _pickingDropoff = false;

  @override
  Widget build(BuildContext context) {
    final store = PassengerScope.of(context);
    final stops = store.stops();
    final p = stops.indexWhere((s) => s.id == store.pickup);
    final d = stops.indexWhere((s) => s.id == store.dropoff);
    final lastDrop = stops.lastIndexWhere((s) => s.dropoff);
    bool enabled(int i) => _pickingDropoff ? stops[i].dropoff && i > p : stops[i].pickup && i < lastDrop;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      SegmentedButton<bool>(
        segments: [
          ButtonSegment(value: false, label: Text('Điểm lên: ${store.homePickup != null ? 'tận nhà' : store.stop(store.pickup).short}', overflow: TextOverflow.ellipsis), icon: const Icon(Icons.trip_origin, size: 18)),
          ButtonSegment(value: true, label: Text('Điểm xuống: ${store.homeDropoff != null ? 'tận nhà' : store.stop(store.dropoff).short}', overflow: TextOverflow.ellipsis), icon: const Icon(Icons.place, size: 18)),
        ],
        selected: {_pickingDropoff},
        showSelectedIcon: false,
        onSelectionChanged: (v) => setState(() => _pickingDropoff = v.first),
      ),
      gap(6),
      Text(_pickingDropoff ? 'Chạm vào điểm bạn xuống xe' : 'Chạm vào điểm bạn lên xe', style: sans(size: 13, color: PTokens.muted)),
      gap(8),
      for (var i = 0; i < stops.length; i++)
        _LineStop(
          stop: stops[i],
          first: i == 0,
          last: i == stops.length - 1,
          rideAbove: i > p && i <= d,
          rideBelow: i >= p && i < d,
          role: i == p ? (store.homePickup != null ? 'Lên xe · đón tận nhà' : 'Lên xe') : (i == d ? (store.homeDropoff != null ? 'Xuống xe · trả tận nhà' : 'Xuống xe') : null),
          pickupNode: i == p,
          enabled: enabled(i),
          onTap: () {
            if (_pickingDropoff) {
              store.setDropoff(stops[i].id);
            } else {
              store.setPickup(stops[i].id);
              setState(() => _pickingDropoff = true);
            }
          },
        ),
    ]);
  }
}

class _LineStop extends StatelessWidget {
  const _LineStop({required this.stop, required this.first, required this.last, required this.rideAbove, required this.rideBelow, required this.role, required this.pickupNode, required this.enabled, required this.onTap});
  final Stop stop;
  final bool first;
  final bool last;
  final bool rideAbove;
  final bool rideBelow;
  final String? role;
  final bool pickupNode;
  final bool enabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final serves = stop.pickup && stop.dropoff ? 'Đón và trả' : (stop.pickup ? 'Chỉ đón' : 'Chỉ trả');
    final nodeColor = role == null ? PTokens.surface : (pickupNode ? PTokens.success : PTokens.danger);
    Color lineColor(bool ride) => ride ? PTokens.primary : PTokens.lineStrong;
    return Semantics(
      button: enabled,
      enabled: enabled,
      selected: role != null,
      label: '${stop.name}, ${stop.time}, ${stop.station ? 'bến xe' : 'điểm dọc đường'}, $serves${role != null ? ', $role' : ''}',
      excludeSemantics: true,
      child: InkWell(
        onTap: enabled ? onTap : null,
        borderRadius: BorderRadius.circular(PTokens.radiusControl),
        child: SizedBox(
          height: 64,
          child: Row(children: [
            SizedBox(width: 52, child: Text(stop.time, style: mono(size: 14, weight: FontWeight.w600, color: enabled || role != null ? PTokens.ink : PTokens.lineStrong))),
            SizedBox(
              width: 28,
              child: Column(children: [
                Expanded(child: Container(width: 4, color: first ? Colors.transparent : lineColor(rideAbove))),
                Container(
                  width: role != null ? 20 : 16,
                  height: role != null ? 20 : 16,
                  decoration: BoxDecoration(shape: BoxShape.circle, color: nodeColor, border: Border.all(color: role != null ? nodeColor : (stop.station ? PTokens.ink : PTokens.muted), width: stop.station ? 3 : 2)),
                ),
                Expanded(child: Container(width: 4, color: last ? Colors.transparent : lineColor(rideBelow))),
              ]),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Opacity(
                opacity: enabled || role != null ? 1 : 0.45,
                child: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(stop.name, style: sans(size: 15, weight: role != null ? FontWeight.w700 : FontWeight.w500), maxLines: 1, overflow: TextOverflow.ellipsis),
                  Text('${stop.station ? 'Bến xe' : 'Điểm dọc đường'} · $serves', style: sans(size: 12, color: PTokens.muted)),
                ]),
              ),
            ),
            if (role != null)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(color: pickupNode ? PTokens.successSoft : PTokens.dangerSoft, borderRadius: BorderRadius.circular(999)),
                child: Text(role!, style: sans(size: 12, weight: FontWeight.w600, color: pickupNode ? PTokens.success : PTokens.danger)),
              ),
          ]),
        ),
      ),
    );
  }
}

/// The route on the map with its stops; the stops of the chosen ride are listed first.
class _RouteMap extends StatelessWidget {
  const _RouteMap({required this.trip, required this.pickupId, required this.dropoffId});
  final Trip trip;
  final String pickupId;
  final String dropoffId;

  @override
  Widget build(BuildContext context) {
    final stops = [
      for (var i = 0; i < trip.stops.length; i++)
        if (trip.stops[i].lat != null && trip.stops[i].lng != null)
          TrackingStop(stopId: trip.stops[i].id, name: trip.stops[i].name, lat: trip.stops[i].lat!, lng: trip.stops[i].lng!, order: i + 1),
    ];
    if (stops.length < 2 && trip.routeShape.length < 2) return const SizedBox.shrink();
    return ClipRRect(
      borderRadius: BorderRadius.circular(PTokens.radius),
      child: SizedBox(height: pWide(context) ? 360 : 260, child: PassengerRouteMap(route: trip.routeShape, stops: stops)),
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

/// "Đón tận nhà" / "Trả tận nhà": opens the address map; once the server accepted it, shows the address and fee.
class _HomeOption extends StatelessWidget {
  const _HomeOption({required this.pickupSide, required this.home});
  final bool pickupSide;
  final HomeAddress? home;

  @override
  Widget build(BuildContext context) {
    final selected = home != null;
    final title = pickupSide ? 'Đón tận nhà' : 'Trả tận nhà';
    return Semantics(
      selected: selected,
      inMutuallyExclusiveGroup: true,
      button: true,
      child: InkWell(
        onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => PassengerHomeAddressScreen(pickupSide: pickupSide))),
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
            Icon(selected ? Icons.radio_button_checked : Icons.home_outlined, color: selected ? PTokens.primary : PTokens.muted, size: 20),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(title, style: sans(size: 15, weight: FontWeight.w600)),
                Text(selected ? home!.address : 'Chọn địa chỉ trong vùng nhà xe phục vụ', style: sans(size: 12, color: PTokens.muted), maxLines: 2, overflow: TextOverflow.ellipsis),
              ]),
            ),
            if (selected) Text('+${vnd(home!.feeVnd)}', style: mono(size: 14)) else const Icon(Icons.chevron_right, color: PTokens.muted),
          ]),
        ),
      ),
    );
  }
}
