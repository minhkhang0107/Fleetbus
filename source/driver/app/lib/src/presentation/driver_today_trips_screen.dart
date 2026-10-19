import 'package:flutter/material.dart';

import 'driver_cockpit_dashboard.dart';
import 'driver_passenger_list_screen.dart';
import 'driver_readiness_screen.dart';
import 'driver_store.dart';
import 'driver_widgets.dart';

/// DRI-002: trips with vehicle check, pickup action, and shift trip selection.
class DriverTodayTripsScreen extends StatelessWidget {
  const DriverTodayTripsScreen({super.key});

  Widget _tripTile(BuildContext context, DriverStore store, ShiftTrip t) {
    final day = store.dayLabelOf(t);
    final statusText = switch (t.status) {
      'COMPLETED' => 'Đã hoàn thành',
      'CANCELLED' => 'Đã hủy',
      'IN_TRANSIT' => 'Đang chạy',
      _ => 'Chờ chạy',
    };
    final pillKind = switch (t.status) {
      'COMPLETED' => DPill.mute,
      'CANCELLED' => DPill.danger,
      'IN_TRANSIT' => DPill.info,
      _ => DPill.warn,
    };
    final canSelect = t.status != 'CANCELLED' && store.trip != TripState.inTransit;

    return Material(
      color: DTokens.panel,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: canSelect
            ? () async {
                final err = await store.selectTrip(t.id);
                if (context.mounted && err != null) {
                  dToast(context, err);
                }
              }
            : null,
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: DTokens.line),
          ),
          child: Opacity(
            opacity: canSelect ? 1.0 : 0.65,
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                if (day.isNotEmpty) ...[
                  Text(day, style: dsans(size: 13, color: DTokens.primaryInk, weight: FontWeight.w600)),
                  const SizedBox(width: 8),
                ],
                Text(t.dep, style: dmono(size: 18)),
                const Spacer(),
                StatusPill(statusText, pillKind),
              ]),
              const SizedBox(height: 6),
              Text(t.route, style: dsans(size: 16, weight: FontWeight.w600), maxLines: 2, overflow: TextOverflow.ellipsis),
              const SizedBox(height: 4),
              Text('${t.plate} · ${t.booked} khách đã đặt', style: dsans(size: 13, color: DTokens.muted), maxLines: 1, overflow: TextOverflow.ellipsis),
            ]),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final store = DriverScope.of(context);
    final codLeft = store.manifest.where((p) => p.codDue).length;
    final homes = store.manifest.where((p) => p.homePickup != null).length;
    final (pill, cta) = switch (store.trip) {
      TripState.completed => (const StatusPill('Đã hoàn thành', DPill.ok), null),
      TripState.inTransit => (const StatusPill('Đang chạy', DPill.info), BigButton(label: 'Mở cockpit', height: 72, onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const DriverCockpitDashboard())))),
      TripState.readyCheck => (
          store.readyToStart ? const StatusPill('Sẵn sàng xuất bến', DPill.ok) : const StatusPill('Chờ kiểm tra xe', DPill.warn),
          BigButton(label: 'Kiểm tra xe để xuất bến', height: 72, onPressed: () {
            store.refreshTrip();
            Navigator.of(context).push(MaterialPageRoute(builder: (_) => const DriverReadinessScreen()));
          })
        ),
    };
    final homeCta = store.trip == TripState.readyCheck && homes > 0
        ? BigButton(
            label: store.homeRunStarted ? 'Mở danh sách đón tận nhà' : 'Đi đón khách tận nhà ($homes)',
            icon: Icons.home_outlined,
            color: DTokens.warn,
            foreground: const Color(0xFF1C1917),
            height: 56,
            onPressed: () => DriverReadinessScreen.runDriverHome(context, store),
          )
        : null;

    if (store.tripId == null) {
      return SafeArea(
        child: Center(
          child: store.loading
              ? const CircularProgressIndicator()
              : Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(mainAxisSize: MainAxisSize.min, children: [
                    Text(store.loadError ?? 'Hôm nay không có chuyến', style: dsans(size: 16), textAlign: TextAlign.center),
                    const SizedBox(height: 12),
                    BigButton(label: 'Tải lại', onPressed: store.loadShift),
                  ]),
                ),
        ),
      );
    }
    final wide = dWide(context);
    final statSize = wide ? 28.0 : 20.0;
    final current = Panel(
      border: DTokens.line,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          pill,
          const Spacer(),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
            decoration: BoxDecoration(border: Border.all(color: const Color(0xFF9A3412)), borderRadius: BorderRadius.circular(4)),
            child: Text(store.plate, style: dmono(size: 14, weight: FontWeight.w600, color: DTokens.plate)),
          ),
        ]),
        const SizedBox(height: 14),
        Wrap(crossAxisAlignment: WrapCrossAlignment.end, spacing: 10, children: [
          Text(store.depTimeLabel, style: dmono(size: store.delayMinutes > 0 ? 20 : 32)),
          Text(store.route, style: dsans(size: 18, weight: FontWeight.w600)),
        ]),
        const SizedBox(height: 14),
        Row(children: [
          Expanded(child: Stat('Khách', '${store.manifest.length}', size: statSize)),
          const SizedBox(width: 8),
          Expanded(child: Stat('Điểm đón', '${store.pickupStopCount}', size: statSize)),
          const SizedBox(width: 8),
          Expanded(child: Stat('Vé COD', '$codLeft', color: DTokens.warnInk, size: statSize)),
        ]),
        const SizedBox(height: 14),
        Text('Xuất phát ${store.firstStopName} · có mặt trước ${hhmm(toMinutes(store.depTime == '--:--' ? '00:30' : store.depTime) - 30)}', style: dsans(size: 14, color: DTokens.sub)),
        if (homes == 0 && store.trip == TripState.readyCheck) ...[
          const SizedBox(height: 10),
          Text(
            'Đón tại điểm: ${store.manifest.length} khách · bấm Kiểm tra xe để xuất bến rồi Xuất bến để đón',
            style: dsans(size: 13, color: DTokens.muted),
          ),
        ],
        const SizedBox(height: 14),
        if (homeCta != null) ...[
          homeCta,
          const SizedBox(height: 10),
        ],
        if (cta != null) ...[
          cta,
          const SizedBox(height: 10),
        ],
        BigButton(
          label: 'Danh sách khách',
          outline: true,
          color: const Color(0xFFE2E8F0),
          onPressed: () => Navigator.of(context).push(
            MaterialPageRoute(builder: (_) => const DriverPassengerListScreen()),
          ),
        ),
        if (store.trip == TripState.completed && store.endedCash != null) ...[
          const SizedBox(height: 10),
          Panel(color: DTokens.bg, child: Text('Đã nộp ${vnd(store.endedCash!)} · ${store.boardedCount} khách lên xe', style: dsans(size: 14))),
        ],
      ]),
    );

    final otherTrips = store.shift.where((t) => t.id != store.tripId).toList();
    final otherList = Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (otherTrips.isNotEmpty) ...[
          Text('Chuyến khác trong ca', style: dsans(size: 14, color: DTokens.muted, weight: FontWeight.w600)),
          const SizedBox(height: 10),
          for (var i = 0; i < otherTrips.length; i++) ...[
            if (i > 0) const SizedBox(height: 10),
            _tripTile(context, store, otherTrips[i]),
          ],
        ] else if (wide) ...[
          const Panel(child: Text('Không có chuyến nào khác trong ca.', style: TextStyle(color: DTokens.muted, fontSize: 14))),
        ],
      ],
    );

    return SafeArea(
      child: RefreshIndicator(
        onRefresh: store.loadShift,
        child: ListView(padding: EdgeInsets.all(wide ? 24 : 16), children: [
          Row(children: [
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('Chuyến của bạn', style: dsans(size: 22, weight: FontWeight.w700)),
                Text('${store.driverName} · ${store.staffId}', style: dsans(size: 13, color: DTokens.muted)),
              ]),
            ),
            const StatusPill('Trong ca', DPill.ok),
          ]),
          const SizedBox(height: 16),
          if (wide)
            // Tablet: the trip to drive on the left, what comes after it on the right.
            Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Expanded(flex: 3, child: current),
              const SizedBox(width: 16),
              Expanded(flex: 2, child: otherList),
            ])
          else ...[
            current,
            if (otherTrips.isNotEmpty) ...[
              const SizedBox(height: 16),
              otherList,
            ],
          ],
        ]),
      ),
    );
  }
}
