import 'package:flutter/material.dart';

import 'driver_cod_dialog.dart';
import 'driver_manifest_screen.dart';
import 'driver_route_map.dart';
import 'driver_store.dart';
import 'driver_widgets.dart';

/// DRI-020 (D143): the home pickups collected before departure. While this run is on, the app sends the bus
/// position, so each passenger waiting at home sees the bus coming and is told when it is close and at the door.
class DriverHomeRunScreen extends StatelessWidget {
  const DriverHomeRunScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final store = DriverScope.of(context);
    final homes = store.manifest.where((p) => p.homePickup != null).toList();
    final waiting = store.homePickupsWaiting.length;
    final window = store.homeWindow;
    Widget row(Passenger p) => PassengerRow(
          p: p,
          // A passenger missing at home is marked at the departure stop, like everyone else.
          noShowOpen: false,
          opensAt: 'tại bến',
          onBoard: () async {
            final error = await store.board(p);
            if (context.mounted) dToast(context, error ?? 'Ghế ${p.seat} đã lên xe');
          },
          onCod: () => showCodSheet(context, p),
          onNoShow: () {},
          onInaccessible: () => DriverManifestScreen.reportInaccessible(context, store, p),
        );
    final live = Panel(
      border: const Color(0xFF166534),
      child: Row(children: [
        Container(width: 10, height: 10, decoration: const BoxDecoration(shape: BoxShape.circle, color: Color(0xFF22C55E))),
        const SizedBox(width: 10),
        Expanded(
          child: Text(
            waiting == 0 ? 'Đã đón hết khách tận nhà. Về bến để xuất bến.' : 'Đang gửi vị trí: $waiting khách đang thấy xe tới và được báo khi xe gần tới nhà.',
            style: dsans(size: 15, color: DTokens.okInk, height: 1.4),
          ),
        ),
      ]),
    );
    return Scaffold(
      appBar: DHeader(
        title: 'Đón khách tận nhà',
        subtitle: '${homes.length} khách${window == null ? '' : ' · khung $window'} · xuất bến ${store.depTime}',
        trailing: Text('${homes.length - waiting}/${homes.length}', style: dmono(size: 16, color: DTokens.okInk)),
      ),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 16), children: [
        live,
        const SizedBox(height: 12),
        DriverRouteMap(store: store, height: 220),
        const SizedBox(height: 12),
        for (final p in homes) ...[row(p), const SizedBox(height: 8)],
      ]),
      bottomNavigationBar: SafeArea(
        child: Container(
          decoration: const BoxDecoration(border: Border(top: BorderSide(color: DTokens.lineSoft))),
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
          child: BigButton(
            label: waiting == 0 ? 'Về bến · kiểm tra xe' : 'Về màn kiểm tra xe',
            color: waiting == 0 ? DTokens.ok : const Color(0xFFE2E8F0),
            outline: waiting != 0,
            onPressed: () => Navigator.of(context).pop(),
          ),
        ),
      ),
    );
  }
}
