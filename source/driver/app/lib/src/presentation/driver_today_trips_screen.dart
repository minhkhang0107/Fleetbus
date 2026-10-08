import 'package:flutter/material.dart';

import 'driver_cockpit_dashboard.dart';
import 'driver_readiness_screen.dart';
import 'driver_store.dart';
import 'driver_widgets.dart';

/// DRI-002: today's trips with the vehicle check as the only way to the start.
class DriverTodayTripsScreen extends StatelessWidget {
  const DriverTodayTripsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final store = DriverScope.of(context);
    final codLeft = store.manifest.where((p) => p.codDue).length;
    final (pill, cta) = switch (store.trip) {
      TripState.completed => (const StatusPill('Đã hoàn thành', DPill.ok), null),
      TripState.inTransit => (const StatusPill('Đang chạy', DPill.info), BigButton(label: 'Mở cockpit', height: 72, onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const DriverCockpitDashboard())))),
      TripState.readyCheck => (
          store.readyToStart ? const StatusPill('Sẵn sàng xuất bến', DPill.ok) : const StatusPill('Chờ kiểm tra xe', DPill.warn),
          BigButton(label: 'Kiểm tra xe để xuất bến', height: 72, onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const DriverReadinessScreen())))
        ),
    };
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
    return SafeArea(
      child: RefreshIndicator(
        onRefresh: store.loadShift,
        child: ListView(padding: const EdgeInsets.all(16), children: [
        Row(children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('Chuyến hôm nay', style: dsans(size: 22, weight: FontWeight.w700)),
              Text('${store.driverName} · ${store.staffId}', style: dsans(size: 13, color: DTokens.muted)),
            ]),
          ),
          const StatusPill('Trong ca', DPill.ok),
        ]),
        const SizedBox(height: 16),
        Panel(
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
              Text(store.depTime, style: dmono(size: 32)),
              Text(store.route, style: dsans(size: 18, weight: FontWeight.w600)),
            ]),
            const SizedBox(height: 14),
            Row(children: [
              Expanded(child: Stat('Khách', '${store.manifest.length}')),
              const SizedBox(width: 8),
              Expanded(child: Stat('Điểm đón', '${store.pickupStopCount}')),
              const SizedBox(width: 8),
              Expanded(child: Stat('Vé COD', '$codLeft', color: DTokens.warnInk)),
            ]),
            const SizedBox(height: 14),
            Text('Xuất phát ${store.firstStopName} · có mặt trước ${hhmm(toMinutes(store.depTime == '--:--' ? '00:30' : store.depTime) - 30)}', style: dsans(size: 14, color: DTokens.sub)),
            const SizedBox(height: 14),
            if (cta != null) cta,
            if (store.endedCash != null) Panel(color: DTokens.bg, child: Text('Đã nộp ${vnd(store.endedCash!)} · ${store.boardedCount} khách lên xe', style: dsans(size: 14))),
          ]),
        ),
        if (store.nextTrip != null) ...[
          const SizedBox(height: 14),
          Opacity(
            opacity: 0.85,
            child: Panel(
              border: DTokens.line,
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('Chuyến tiếp theo', style: dsans(size: 13, color: DTokens.muted)),
                const SizedBox(height: 4),
                Wrap(spacing: 10, crossAxisAlignment: WrapCrossAlignment.end, children: [Text(store.nextTrip!.dep, style: dmono(size: 20)), Text(store.nextTrip!.route, style: dsans(size: 16, weight: FontWeight.w600))]),
                Text('${store.nextTrip!.plate} · ${store.nextTrip!.booked} khách đã đặt', style: dsans(size: 13, color: DTokens.muted)),
              ]),
            ),
          ),
        ],
      ]),
      ),
    );
  }
}
