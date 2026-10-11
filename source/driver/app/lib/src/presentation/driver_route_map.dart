import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import 'driver_store.dart';
import 'driver_widgets.dart';

/// When false the tile layer is left out, so widget tests make no network requests.
bool driverMapTiles = true;

/// OSM France tiles: tile.openstreetmap.org is blocked by some Vietnamese ISPs.
const driverMapTileUrl = String.fromEnvironment('MAP_TILE_URL', defaultValue: 'https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png');

/// Driver map (spec 7.2): the bus, the road, the stops still ahead with the passengers to pick up (↑)
/// and drop off (↓) at each. A list view of the same stops is one tap away when the map cannot load.
class DriverRouteMap extends StatefulWidget {
  const DriverRouteMap({super.key, required this.store, this.height = 230});
  final DriverStore store;
  final double height;

  @override
  State<DriverRouteMap> createState() => _DriverRouteMapState();
}

class _DriverRouteMapState extends State<DriverRouteMap> {
  final _controller = MapController();
  bool _list = false;
  bool _ready = false;
  bool _fitted = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  List<({DriverStop stop, int index, int board, int drop, int boarded, int excluded})> _ahead() {
    final store = widget.store;
    return [
      for (var i = store.stopIndex; i < store.stops.length; i++)
        (
          stop: store.stops[i],
          index: i,
          board: store.manifest.where((p) => p.from == store.stops[i].id && p.status == PaxStatus.waiting).length,
          drop: store.manifest.where((p) => p.to == store.stops[i].id && p.status == PaxStatus.boarded).length,
          boarded: store.manifest.where((p) => p.from == store.stops[i].id && p.status == PaxStatus.boarded).length,
          excluded: store.manifest.where((p) => p.from == store.stops[i].id && p.status == PaxStatus.noShow).length,
        ),
    ];
  }

  List<LatLng> _routePoints() => [for (final p in widget.store.road?.points ?? const <({double lat, double lng})>[]) LatLng(p.lat, p.lng)];

  void _fit() {
    final pts = _routePoints().isNotEmpty ? _routePoints() : [for (final s in widget.store.stops) if (s.lat != null && s.lng != null) LatLng(s.lat!, s.lng!)];
    if (pts.length < 2) return;
    final camera = CameraFit.bounds(bounds: LatLngBounds.fromPoints(pts), padding: const EdgeInsets.all(24)).fit(_controller.camera);
    _controller.move(camera.center, camera.zoom.floorToDouble());
  }

  @override
  Widget build(BuildContext context) {
    final store = widget.store;
    final ahead = _ahead();
    if (_ready && !_fitted && (store.road != null || store.stops.any((s) => s.lat != null))) {
      _fitted = true;
      WidgetsBinding.instance.addPostFrameCallback((_) => mounted ? _fit() : null);
    }
    final header = Row(children: [
      Text('Lộ trình còn lại', style: dsans(size: 14, weight: FontWeight.w600, color: DTokens.sub)),
      const Spacer(),
      TextButton(onPressed: () => setState(() => _list = !_list), style: TextButton.styleFrom(minimumSize: const Size(48, 40)), child: Text(_list ? 'Xem bản đồ' : 'Xem danh sách', style: dsans(size: 13, weight: FontWeight.w600, color: DTokens.primaryInk))),
    ]);
    final list = ListView(padding: EdgeInsets.zero, children: [
      for (final a in ahead)
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 4),
          child: Row(children: [
            SizedBox(width: 44, child: Text(a.stop.time, style: dmono(size: 13, weight: FontWeight.w500, color: DTokens.muted))),
            Expanded(child: Text(a.stop.name, style: dsans(size: 14, weight: a.index == store.stopIndex ? FontWeight.w700 : FontWeight.w400), overflow: TextOverflow.ellipsis)),
            Text('↑${a.board} ↓${a.drop}', style: dmono(size: 13, color: DTokens.sub)),
            // Spec 5.2: already boarded and excluded (no-show) at this stop.
            if (a.boarded + a.excluded > 0) Text('  lên ${a.boarded} · vắng ${a.excluded}', style: dsans(size: 13, color: DTokens.muted)),
          ]),
        ),
    ]);
    final map = FlutterMap(
      mapController: _controller,
      options: MapOptions(
        initialCenter: LatLng(store.lat, store.lng),
        initialZoom: 9,
        interactionOptions: const InteractionOptions(flags: InteractiveFlag.all & ~InteractiveFlag.rotate),
        onMapReady: () {
          _ready = true;
          if (!_fitted) {
            _fitted = true;
            _fit();
          }
        },
      ),
      children: [
        if (driverMapTiles) TileLayer(urlTemplate: driverMapTileUrl, subdomains: const ['a', 'b', 'c'], userAgentPackageName: 'vn.busgo.driver', tileProvider: NetworkTileProvider(abortObsoleteRequests: false)),
        if (_routePoints().length >= 2) PolylineLayer(polylines: [Polyline(points: _routePoints(), strokeWidth: 4, color: const Color(0xFF60A5FA))]),
        MarkerLayer(markers: [
          for (final a in ahead)
            if (a.stop.lat != null && a.stop.lng != null)
              Marker(
                point: LatLng(a.stop.lat!, a.stop.lng!),
                width: 96,
                height: 40,
                child: Column(mainAxisSize: MainAxisSize.min, children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                    decoration: BoxDecoration(color: DTokens.panel2, borderRadius: BorderRadius.circular(6), border: Border.all(color: DTokens.line)),
                    child: Text('↑${a.board} ↓${a.drop}', style: dmono(size: 11, weight: FontWeight.w600)),
                  ),
                  const SizedBox(height: 2),
                  Container(width: 12, height: 12, decoration: BoxDecoration(shape: BoxShape.circle, color: Colors.white, border: Border.all(color: DTokens.bg, width: 3))),
                ]),
              ),
          // Home pickups still waiting: a house the driver (or the pickup run) has to reach.
          for (final p in store.manifest)
            if (p.status == PaxStatus.waiting && p.homeLat != null && p.homeLng != null)
              Marker(
                point: LatLng(p.homeLat!, p.homeLng!),
                width: 28,
                height: 28,
                child: Tooltip(
                  message: '${p.seat} · ${p.homePickup ?? ''}',
                  child: Container(decoration: BoxDecoration(shape: BoxShape.circle, color: DTokens.warn, border: Border.all(color: Colors.white, width: 2)), child: const Icon(Icons.home, size: 15, color: Colors.white)),
                ),
              ),
          Marker(
            point: LatLng(store.lat, store.lng),
            width: 30,
            height: 30,
            child: Container(decoration: BoxDecoration(shape: BoxShape.circle, color: DTokens.primary, border: Border.all(color: Colors.white, width: 3)), child: const Icon(Icons.directions_bus, size: 15, color: Colors.white)),
          ),
        ]),
        const RichAttributionWidget(attributions: [TextSourceAttribution('OpenStreetMap contributors')]),
      ],
    );
    return Panel(
      padding: const EdgeInsets.fromLTRB(14, 4, 8, 12),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        header,
        SizedBox(height: widget.height, child: ClipRRect(borderRadius: BorderRadius.circular(8), child: _list ? list : map)),
      ]),
    );
  }
}
