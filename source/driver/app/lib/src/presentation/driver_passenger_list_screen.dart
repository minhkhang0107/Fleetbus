import 'package:flutter/material.dart';

import 'driver_store.dart';
import 'driver_widgets.dart';

/// Read-only passenger manifest grouped by pickup stop (F13).
class DriverPassengerListScreen extends StatelessWidget {
  const DriverPassengerListScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final store = DriverScope.of(context);
    final wide = dWide(context);
    final grouped = <String, List<Passenger>>{};
    for (final p in store.manifest) {
      grouped.putIfAbsent(p.from, () => []).add(p);
    }
    final stopOrder = {for (var i = 0; i < store.stops.length; i++) store.stops[i].id: i};
    final sortedStopIds = grouped.keys.toList()
      ..sort((a, b) => (stopOrder[a] ?? 999).compareTo(stopOrder[b] ?? 999));

    final header = DHeader(
      title: 'Danh sách khách',
      subtitle: '${store.manifest.length} khách · ${store.route}',
    );

    final content = store.manifest.isEmpty
        ? Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Panel(
                child: Text('Chưa có khách đặt vé', style: dsans(size: 15, color: DTokens.sub)),
              ),
            ),
          )
        : ListView(
            padding: EdgeInsets.all(wide ? 24 : 16),
            children: [
              for (final stopId in sortedStopIds) ...[
                _buildStopSection(context, store, store.stopById(stopId), grouped[stopId]!),
                const SizedBox(height: 16),
              ],
            ],
          );

    return Scaffold(
      appBar: header,
      body: SafeArea(
        child: wide ? DMaxWidth(maxWidth: 840, child: content) : content,
      ),
    );
  }

  Widget _buildStopSection(BuildContext context, DriverStore store, DriverStop stop, List<Passenger> passengers) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                stop.name,
                style: dsans(size: 16, weight: FontWeight.w700, color: DTokens.ink),
              ),
            ),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
              decoration: BoxDecoration(
                color: DTokens.line,
                borderRadius: BorderRadius.circular(999),
              ),
              child: Text(
                '${passengers.length} khách',
                style: dsans(size: 12, weight: FontWeight.w600, color: DTokens.sub),
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        for (final p in passengers) ...[
          Container(
            margin: const EdgeInsets.only(bottom: 8),
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
            decoration: BoxDecoration(
              color: DTokens.panel,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: DTokens.line),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SizedBox(
                  width: 44,
                  child: Text(p.seat, style: dmono(size: 16, weight: FontWeight.w700)),
                ),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(p.name, style: dsans(size: 15, weight: FontWeight.w600)),
                          ),
                          if (p.cod > 0)
                            Text(
                              'Thu ${vnd(p.cod)} khi lên',
                              style: dsans(size: 13, weight: FontWeight.w600, color: DTokens.warnInk),
                            ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Text(p.phone, style: dmono(size: 12, weight: FontWeight.w500, color: DTokens.muted)),
                      const SizedBox(height: 4),
                      Text(
                        '${store.stopById(p.from).name} → ${store.stopById(p.to).name}',
                        style: dsans(size: 12, color: DTokens.sub),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ],
    );
  }
}
