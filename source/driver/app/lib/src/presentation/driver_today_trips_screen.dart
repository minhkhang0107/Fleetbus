import 'package:flutter/material.dart';

import 'driver_cockpit_dashboard.dart';
import 'driver_device_ready.dart';
import 'driver_passenger_list_screen.dart';
import 'driver_readiness_screen.dart';
import 'driver_store.dart';
import 'driver_widgets.dart';

/// DRI-002: trips with vehicle check, pickup action, and shift trip selection.
/// The list under the big card keeps one order (by departure, trips to drive first, finished ones last);
/// tapping a trip highlights it and puts it on the big card without moving anything in the list (D188).
class DriverTodayTripsScreen extends StatelessWidget {
  const DriverTodayTripsScreen({super.key});

  Widget _tripTile(BuildContext context, DriverStore store, ShiftTrip t) {
    final day = store.dayLabelOf(t);
    final past = !t.done && tripDayPast(t.departureTime, store.vnNow());
    final current = t.id == store.tripId;
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
    final canSelect = t.status != 'CANCELLED' && store.trip != TripState.inTransit && !current;

    return Material(
      color: current ? const Color(0xFF172554) : DTokens.panel,
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
            border: Border.all(color: current ? const Color(0xFF1D4ED8) : DTokens.line, width: current ? 2 : 1),
          ),
          child: Opacity(
            opacity: t.done && !current ? 0.65 : 1.0,
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              if (current) ...[
                Text('Đang hiện ở trên', style: dsans(size: 12, color: const Color(0xFFBFDBFE), weight: FontWeight.w600)),
                const SizedBox(height: 4),
              ],
              Row(children: [
                if (day.isNotEmpty) ...[
                  Text(past ? '$day · đã qua ngày' : day, style: dsans(size: 13, color: past ? DTokens.dangerInk : DTokens.primaryInk, weight: FontWeight.w600)),
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
    final now = store.vnNow();
    final day = tripDayLabel(store.depAt, now);
    final pastDay = tripDayPast(store.depAt, now);
    final lateBy = store.depAt == null || pastDay ? 0 : now.difference(store.depAt!).inMinutes;
    final (pill, cta) = switch (store.trip) {
      TripState.completed => (const StatusPill('Đã hoàn thành', DPill.ok), null),
      TripState.inTransit => (const StatusPill('Đang chạy', DPill.info), BigButton(label: 'Mở màn hình lái xe', height: 72, onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const DriverCockpitDashboard())))),
      TripState.readyCheck => (
          pastDay
              ? StatusPill('Chuyến ngày $day đã qua · hỏi điều hành', DPill.danger)
              : lateBy > 5
                  ? StatusPill('Trễ ${lateBy >= 60 ? '${lateBy ~/ 60} giờ ${lateBy % 60} phút' : '$lateBy phút'}', DPill.danger)
                  : store.readyToStart
                      ? const StatusPill('Sẵn sàng xuất bến', DPill.ok)
                      : const StatusPill('Chờ kiểm tra xe', DPill.warn),
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
        Wrap(alignment: WrapAlignment.spaceBetween, crossAxisAlignment: WrapCrossAlignment.center, spacing: 8, runSpacing: 8, children: [
          pill,
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
            decoration: BoxDecoration(border: Border.all(color: const Color(0xFF9A3412)), borderRadius: BorderRadius.circular(4)),
            child: Text(store.plate, style: dmono(size: 14, weight: FontWeight.w600, color: DTokens.plate)),
          ),
        ]),
        const SizedBox(height: 14),
        if (day.isNotEmpty)
          Text(day, style: dsans(size: 15, weight: FontWeight.w700, color: pastDay ? DTokens.dangerInk : DTokens.primaryInk)),
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
          Expanded(child: Stat('Thu tiền mặt', '$codLeft', color: DTokens.warnInk, size: statSize)),
        ]),
        const SizedBox(height: 14),
        Text('Xuất phát ${store.firstStopName} · có mặt trước ${hhmm(toMinutes(store.depTime == '--:--' ? '00:30' : store.depTime) - 30)}', style: dsans(size: 14, color: DTokens.sub)),
        if (homes == 0 && store.trip == TripState.readyCheck) ...[
          const SizedBox(height: 10),
          Text(
            'Đón ${store.manifest.length} khách tại bến · bấm Kiểm tra xe, rồi Xuất bến',
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

    // One fixed order: trips still to drive by departure, then the finished ones.
    final toDrive = store.shift.where((t) => !t.done).toList();
    final finished = store.shift.where((t) => t.done).toList();
    final otherTrips = store.shift.length > 1 ? store.shift : const <ShiftTrip>[];
    List<Widget> group(String title, List<ShiftTrip> trips, int from) => [
          Text(title, style: dsans(size: 14, color: DTokens.muted, weight: FontWeight.w600)),
          const SizedBox(height: 10),
          for (var i = 0; i < trips.length; i++) ...[
            if (i > 0) const SizedBox(height: 10),
            FadeSlideIn(index: from + i, child: _tripTile(context, store, trips[i])),
          ],
        ];
    final otherList = Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (otherTrips.isNotEmpty) ...[
          if (toDrive.isNotEmpty) ...group('Chuyến cần chạy (${toDrive.length})', toDrive, 0),
          if (toDrive.isNotEmpty && finished.isNotEmpty) const SizedBox(height: 18),
          if (finished.isNotEmpty) ...group('Đã chạy xong (${finished.length})', finished, toDrive.length),
        ] else if (wide) ...[
          const Panel(child: Text('Không có chuyến nào khác trong ca.', style: TextStyle(color: DTokens.muted, fontSize: 14))),
        ],
      ],
    );

    return SafeArea(
      child: RefreshIndicator(
        onRefresh: store.loadShift,
        child: ListView(padding: EdgeInsets.all(wide ? 24 : 16), children: [
          Reveal(
            visible: store.shiftSavedAt != null,
            child: Container(
              margin: const EdgeInsets.only(bottom: 12),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: DTokens.warnBg, borderRadius: BorderRadius.circular(12)),
              child: Text(
                'Mất mạng · danh sách chuyến và khách lưu lúc ${_hhmm(store.shiftSavedAt ?? DateTime.now())}. Quét vé vẫn được; máy gửi lên khi có sóng.',
                style: dsans(size: 13, color: DTokens.warnInk),
              ),
            ),
          ),
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
          const DriverDeviceReadyBanner(),
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

String _hhmm(DateTime at) {
  final vn = at.toUtc().add(const Duration(hours: 7));
  return '${vn.hour.toString().padLeft(2, '0')}:${vn.minute.toString().padLeft(2, '0')}';
}
