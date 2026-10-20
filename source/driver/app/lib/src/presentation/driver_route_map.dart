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
  // A controller per map: the map is rebuilt at each stop (see build).
  MapController _controller = MapController();
  // One tile provider per map, kept for that map's life. The tile layer disposes its provider (and its HTTP client)
  // when the provider changes or the layer goes: a new provider at every rebuild (the cockpit ticks each second)
  // closed the client before tiles arrived, and a provider shared with a disposed map loaded nothing.
  NetworkTileProvider _tiles = NetworkTileProvider(abortObsoleteRequests: false);
  bool _list = false;
  bool _ready = false;
  bool _fitted = false;
  MapOptions? _options;
  int? _optionsFor;

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

  /// Frames what the driver needs next: the bus and the next two stops ahead (the whole road made a 150 km route
  /// a dot in the small cockpit map). Falls back to every stop when the bus has no position.
  /// The bus and the next two stops ahead (every stop when the bus has no position).
  List<LatLng> _framePoints() {
    final store = widget.store;
    final next = [
      for (var i = store.stopIndex; i < store.stops.length && i <= store.stopIndex + 2; i++)
        if (store.stops[i].lat != null && store.stops[i].lng != null) LatLng(store.stops[i].lat!, store.stops[i].lng!),
    ];
    final pts = [LatLng(store.lat, store.lng), ...next];
    if (pts.length < 2) pts.addAll([for (final s in store.stops) if (s.lat != null && s.lng != null) LatLng(s.lat!, s.lng!)]);
    return pts;
  }

  /// Frames what the driver needs next (see [_framePoints]), at a whole zoom of 14 at most.
  void _fit() {
    final pts = _framePoints();
    if (pts.length < 2) return;
    // Zoom 14 at most: at a station the next stop is often close, and deeper tiles load slowly on the tablet.
    final camera = CameraFit.bounds(bounds: LatLngBounds.fromPoints(pts), padding: const EdgeInsets.all(24), maxZoom: 14).fit(_controller.camera);
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
    // When the bus reaches the next stop the map is rebuilt on the new frame (a later move left tiles unloaded).
    if (_optionsFor != store.stopIndex) {
      if (_optionsFor != null) {
        final old = _controller;
        _controller = MapController();
        _tiles = NetworkTileProvider(abortObsoleteRequests: false);
        WidgetsBinding.instance.addPostFrameCallback((_) => old.dispose());
      }
      _optionsFor = store.stopIndex;
      _options = null;
      _ready = false;
    }
    final header = Row(children: [
      Expanded(child: Text('Lộ trình còn lại', style: dsans(size: 14, weight: FontWeight.w600, color: DTokens.sub))),
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
    // The same options object on every rebuild: a new one each second (the cockpit clock) kept the tile layer
    // from loading the tiles of the zoom the map moved to.
    // The map opens on the frame directly: tiles of a zoom reached by a later move did not load on the tablet.
    final frame = _framePoints();
    _options ??= MapOptions(
      initialCenter: LatLng(store.lat, store.lng),
      initialZoom: 12,
      // More room on top for the label above the stop the bus is at.
      initialCameraFit: frame.length >= 2 ? CameraFit.bounds(bounds: LatLngBounds.fromPoints(frame), padding: const EdgeInsets.fromLTRB(32, 56, 32, 24), maxZoom: 14) : null,
      interactionOptions: const InteractionOptions(flags: InteractiveFlag.all & ~InteractiveFlag.rotate),
      onMapReady: () {
        _ready = true;
        if (!_fitted && frame.length < 2) {
          _fitted = true;
          _fit();
        } else {
          _fitted = true;
        }
      },
    );
    final map = FlutterMap(
      key: ValueKey(store.stopIndex),
      mapController: _controller,
      options: _options!,
      children: [
        if (driverMapTiles) TileLayer(urlTemplate: driverMapTileUrl, subdomains: const ['a', 'b', 'c'], userAgentPackageName: 'vn.busgo.driver', tileProvider: _tiles, tileDisplay: const TileDisplay.instantaneous()),
        if (_routePoints().length >= 2) PolylineLayer(polylines: [Polyline(points: _routePoints(), strokeWidth: 4, color: const Color(0xFF60A5FA))]),
        MarkerLayer(markers: [
          // A label only where it matters (the next stop, stops with passengers); other stops are plain dots,
          // so labels do not pile up when the map is zoomed out.
          for (final a in ahead)
            if (a.stop.lat != null && a.stop.lng != null)
              a.index == store.stopIndex || a.board + a.drop > 0
                  ? Marker(
                      point: LatLng(a.stop.lat!, a.stop.lng!),
                      width: 96,
                      height: 40,
                      alignment: Alignment.topCenter,
                      child: Column(mainAxisSize: MainAxisSize.min, children: [
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                          decoration: BoxDecoration(color: DTokens.panel2, borderRadius: BorderRadius.circular(6), border: Border.all(color: DTokens.line)),
                          child: Text('↑${a.board} ↓${a.drop}', style: dmono(size: 11, weight: FontWeight.w600)),
                        ),
                        const SizedBox(height: 2),
                        Container(width: 12, height: 12, decoration: BoxDecoration(shape: BoxShape.circle, color: Colors.white, border: Border.all(color: DTokens.bg, width: 3))),
                      ]),
                    )
                  : Marker(
                      point: LatLng(a.stop.lat!, a.stop.lng!),
                      width: 10,
                      height: 10,
                      child: Container(decoration: BoxDecoration(shape: BoxShape.circle, color: Colors.white, border: Border.all(color: DTokens.bg, width: 2))),
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
