import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import 'passenger_store.dart';
import 'passenger_widgets.dart';

/// When false, TileLayer is omitted so tests do not make network requests.
bool passengerMapTiles = true;

/// OpenStreetMap raster tiles. The main tile.openstreetmap.org host is blocked by some Vietnamese ISPs,
/// so the default is the OSM France community server (same OSM data, Vietnamese labels only);
/// override with --dart-define=MAP_TILE_URL=... for another provider.
const passengerMapTileUrl = String.fromEnvironment('MAP_TILE_URL', defaultValue: 'https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png');

/// Real OpenStreetMap route tracking map showing trip route, stops, target, and bus.
class PassengerRouteMap extends StatefulWidget {
  const PassengerRouteMap({
    super.key,
    this.tracking,
    this.route,
    this.stops,
    this.busLat,
    this.busLng,
    this.bearing,
    this.speed,
    this.target,
    this.signal,
    this.tileProvider,
    this.pickupStopId,
    this.dropoffStopId,
    this.focusStopId,
  });

  final Tracking? tracking;
  final List<(double, double)>? route;
  final List<TrackingStop>? stops;
  final double? busLat;
  final double? busLng;
  final double? bearing;
  final double? speed;
  final TrackingTarget? target;
  final GpsSignal? signal;
  final TileProvider? tileProvider;
  /// Booking: the stops the passenger gets on (green, "Lên") and off (red, "Xuống").
  final String? pickupStopId;
  final String? dropoffStopId;
  /// Booking: the stop just chosen; the map moves to it.
  final String? focusStopId;

  @override
  State<PassengerRouteMap> createState() => PassengerRouteMapState();
}

class PassengerRouteMapState extends State<PassengerRouteMap> {
  // One tile provider for the map's life: the radar rebuilds on every position update, and a new provider per build
  // disposes the previous one (and its HTTP client) before slow tiles arrive (seen on the driver tablet).
  late final TileProvider _tiles = widget.tileProvider ?? NetworkTileProvider(abortObsoleteRequests: false);

  late final MapController _mapController;
  bool _mapReady = false;
  bool _fitted = false;

  @visibleForTesting
  MapController get mapController => _mapController;

  @visibleForTesting
  bool get isFitted => _fitted;

  @override
  void initState() {
    super.initState();
    _mapController = MapController();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _checkInitialFit();
    });
  }

  @override
  void didUpdateWidget(PassengerRouteMap oldWidget) {
    super.didUpdateWidget(oldWidget);
    _checkInitialFit();
    final focus = widget.focusStopId;
    if (_mapReady && focus != null && focus != oldWidget.focusStopId) {
      final stop = _effectiveStops.where((s) => s.stopId == focus).firstOrNull;
      if (stop != null) _mapController.move(LatLng(stop.lat, stop.lng), 13);
    }
  }

  @override
  void dispose() {
    _mapController.dispose();
    super.dispose();
  }

  void _checkInitialFit() {
    if (!_mapReady || _fitted) return;
    final pts = _getFitPoints();
    if (pts.isNotEmpty) {
      _fitted = true;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _fitRoute();
      });
    }
  }

  List<(double, double)> get _effectiveRoute =>
      widget.route ?? widget.tracking?.route ?? const [];

  List<TrackingStop> get _effectiveStops =>
      widget.stops ?? widget.tracking?.stops ?? const [];

  double? get _effectiveBusLat => widget.busLat ?? widget.tracking?.busLat;
  double? get _effectiveBusLng => widget.busLng ?? widget.tracking?.busLng;
  double? get _effectiveBearing => widget.bearing ?? widget.tracking?.bearing;
  double? get _effectiveSpeed => widget.speed ?? widget.tracking?.speed;
  TrackingTarget? get _effectiveTarget =>
      widget.target ?? widget.tracking?.target;
  GpsSignal get _effectiveSignal =>
      widget.signal ?? widget.tracking?.signal ?? GpsSignal.none;

  List<LatLng> _getFitPoints() {
    // D143: a home pickup happens in town, far from most of the route: frame the address and the bus only.
    final home = _effectiveTarget;
    if (home != null && home.isHome) {
      final lat = _effectiveBusLat;
      final lng = _effectiveBusLng;
      // At least the streets around the address (~1.3 km), so a bus at the door does not shrink the frame to a point.
      return [
        LatLng(home.lat - 0.006, home.lng - 0.006),
        LatLng(home.lat + 0.006, home.lng + 0.006),
        if (lat != null && lng != null) LatLng(lat, lng),
      ];
    }
    final route = _effectiveRoute;
    if (route.isNotEmpty) {
      return [for (final p in route) LatLng(p.$1, p.$2)];
    }
    final stops = _effectiveStops;
    if (stops.isNotEmpty) {
      return [for (final s in stops) LatLng(s.lat, s.lng)];
    }
    final busLat = _effectiveBusLat;
    final busLng = _effectiveBusLng;
    final target = _effectiveTarget;
    final fallback = <LatLng>[
      if (busLat != null && busLng != null) LatLng(busLat, busLng),
      if (target != null) LatLng(target.lat, target.lng),
    ];
    return fallback;
  }

  void _fitRoute() {
    final pts = _getFitPoints();
    if (pts.isNotEmpty) {
      // Fit, then snap to a whole zoom level so the raster tiles are drawn at their native size.
      final fitted = CameraFit.bounds(
        bounds: LatLngBounds.fromPoints(pts),
        padding: const EdgeInsets.all(40),
        maxZoom: 15,
      ).fit(_mapController.camera);
      _mapController.move(fitted.center, fitted.zoom.floorToDouble());
    } else {
      _mapController.move(const LatLng(20.5, 105.9), 8);
    }
  }

  void _focusBus() {
    final lat = _effectiveBusLat;
    final lng = _effectiveBusLng;
    if (lat != null && lng != null) {
      _mapController.move(LatLng(lat, lng), 13);
    }
  }

  @override
  Widget build(BuildContext context) {
    final fitPoints = _getFitPoints();
    final hasBus = _effectiveBusLat != null && _effectiveBusLng != null;

    final routePts = [for (final p in _effectiveRoute) LatLng(p.$1, p.$2)];
    int closestIndex = -1;
    if (hasBus && routePts.isNotEmpty) {
      final bLat = _effectiveBusLat!;
      final bLng = _effectiveBusLng!;
      var minDistSq = double.infinity;
      for (var i = 0; i < routePts.length; i++) {
        final dLat = routePts[i].latitude - bLat;
        final dLng = routePts[i].longitude - bLng;
        final dSq = dLat * dLat + dLng * dLng;
        if (dSq < minDistSq) {
          minDistSq = dSq;
          closestIndex = i;
        }
      }
    }

    final polylines = <Polyline>[
      if (routePts.length >= 2)
        Polyline(
          points: routePts,
          strokeWidth: 5,
          color: const Color(0xFF94A3B8),
        ),
      if (closestIndex >= 1)
        Polyline(
          points: routePts.sublist(0, closestIndex + 1),
          strokeWidth: 5,
          color: PTokens.primary,
        ),
    ];

    final markers = <Marker>[];
    final target = _effectiveTarget;

    for (final s in _effectiveStops) {
      final isTarget = target != null &&
          ((s.stopId.isNotEmpty && s.stopId == target.stopId) ||
              (s.lat == target.lat && s.lng == target.lng));
      final role = s.stopId.isEmpty ? null : (s.stopId == widget.pickupStopId ? true : (s.stopId == widget.dropoffStopId ? false : null));
      if (!isTarget && role != null) {
        final color = role ? PTokens.success : PTokens.danger;
        markers.add(
          Marker(
            point: LatLng(s.lat, s.lng),
            // The dot sits on the stop; the label hangs above it outside the marker box.
            width: 18,
            height: 18,
            child: Stack(clipBehavior: Clip.none, alignment: Alignment.center, children: [
              Container(width: 18, height: 18, decoration: BoxDecoration(shape: BoxShape.circle, color: color, border: Border.all(color: Colors.white, width: 3))),
              Positioned(
                bottom: 21,
                child: Container(
                  constraints: const BoxConstraints(maxWidth: 160),
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(6)),
                  child: Text('${role ? 'Lên' : 'Xuống'} · ${s.name.replaceFirst('Bến xe ', '')}', maxLines: 1, softWrap: false, overflow: TextOverflow.ellipsis, style: sans(size: 11, weight: FontWeight.w700, color: Colors.white)),
                ),
              ),
            ]),
          ),
        );
      } else if (!isTarget) {
        markers.add(
          Marker(
            point: LatLng(s.lat, s.lng),
            width: 14,
            height: 14,
            alignment: Alignment.center,
            child: Container(
              width: 14,
              height: 14,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: Colors.white,
                border: Border.all(color: PTokens.ink, width: 2.5),
              ),
            ),
          ),
        );
      }
    }

    if (target != null) {
      // The ring sits on the stop; the label hangs above it outside the marker box.
      markers.add(
        Marker(
          point: LatLng(target.lat, target.lng),
          width: 20,
          height: 20,
          child: Stack(clipBehavior: Clip.none, alignment: Alignment.center, children: [
            Container(
              width: 20,
              height: 20,
              decoration: BoxDecoration(shape: BoxShape.circle, color: Colors.white, border: Border.all(color: PTokens.ink, width: 3.5)),
            ),
            Positioned(
              bottom: 24,
              child: Container(
                constraints: const BoxConstraints(maxWidth: 180),
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(color: PTokens.ink, borderRadius: BorderRadius.circular(6)),
                child: Text(
                  '${target.isHome ? 'Đón bạn' : target.isDropoff ? 'Điểm trả' : 'Điểm đón'} · ${target.name.replaceFirst('Bến xe ', '')}',
                  maxLines: 1,
                  softWrap: false,
                  overflow: TextOverflow.ellipsis,
                  style: sans(size: 11, weight: FontWeight.w700, color: Colors.white),
                ),
              ),
            ),
          ]),
        ),
      );
    }

    if (hasBus) {
      final live = _effectiveSignal == GpsSignal.live;
      final bearing = _effectiveBearing;
      final speedText = live
          ? '${_effectiveSpeed?.round() ?? 0} km/h · vừa cập nhật'
          : (_effectiveSignal == GpsSignal.none ? 'Chưa có vị trí' : 'Vị trí cũ');

      final busCircleWithArrow = SizedBox(
        width: 52,
        height: 52,
        child: Stack(
          alignment: Alignment.center,
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: live ? PTokens.primary : Colors.white,
                border: Border.all(
                  color: live ? Colors.white : const Color(0xFF94A3B8),
                  width: 3,
                ),
              ),
              child: Center(
                child: Icon(
                  Icons.directions_bus,
                  size: 20,
                  color: live ? Colors.white : const Color(0xFF64748B),
                ),
              ),
            ),
            if (bearing != null)
              Transform.rotate(
                angle: bearing * math.pi / 180,
                child: Align(
                  alignment: Alignment.topCenter,
                  child: Icon(
                    Icons.navigation,
                    size: 14,
                    color: live ? PTokens.primary : const Color(0xFF64748B),
                  ),
                ),
              ),
          ],
        ),
      );

      markers.add(
        Marker(
          point: LatLng(_effectiveBusLat!, _effectiveBusLng!),
          // The marker is the bus circle only, centred on the position; the speed label hangs below it outside the
          // marker box, so it never shifts the bus off its real place.
          width: 52,
          height: 52,
          child: Stack(
            clipBehavior: Clip.none,
            alignment: Alignment.center,
            children: [
              busCircleWithArrow,
              Positioned(
                top: 56,
                child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: Colors.white,
                  border: Border.all(color: PTokens.lineStrong),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(
                  speedText,
                  maxLines: 1,
                  softWrap: false,
                  style: sans(size: 11, color: const Color(0xFF334155)),
                ),
              ),
              ),
            ],
          ),
        ),
      );
    }

    return Stack(
      children: [
        FlutterMap(
          mapController: _mapController,
          options: MapOptions(
            onMapReady: () {
              _mapReady = true;
              _checkInitialFit();
            },
            initialCameraFit: fitPoints.isNotEmpty
                ? CameraFit.bounds(
                    bounds: LatLngBounds.fromPoints(fitPoints),
                    padding: const EdgeInsets.all(40),
                    maxZoom: 15,
                  )
                : null,
            initialCenter: const LatLng(20.5, 105.9),
            initialZoom: 8,
            // North stays up: a rotated map only confuses someone checking where the bus is.
            interactionOptions: const InteractionOptions(flags: InteractiveFlag.all & ~InteractiveFlag.rotate),
          ),
          children: [
            if (passengerMapTiles)
              TileLayer(
                urlTemplate: passengerMapTileUrl,
                subdomains: const ['a', 'b', 'c'],
                userAgentPackageName: 'vn.busgo.passenger',
                // Keep requests that the first camera jump makes obsolete: aborting them left the
                // whole-route tiles stuck on the ROD2 tablet until the user moved the map.
                tileProvider: _tiles,
              ),
            PolylineLayer(polylines: polylines),
            MarkerLayer(markers: markers),
            const RichAttributionWidget(
              attributions: [
                TextSourceAttribution('OpenStreetMap contributors'),
              ],
            ),
          ],
        ),
        Positioned(
          top: 12,
          right: 12,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            mainAxisSize: MainAxisSize.min,
            children: [
              _MapFloatingButton(
                label: 'Toàn tuyến',
                onPressed: _fitRoute,
              ),
              if (hasBus) ...[
                const SizedBox(height: 8),
                _MapFloatingButton(
                  label: 'Theo xe',
                  onPressed: _focusBus,
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

class _MapFloatingButton extends StatelessWidget {
  const _MapFloatingButton({required this.label, required this.onPressed});
  final String label;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: const Color(0xEBFFFFFF),
      elevation: 2,
      shadowColor: Colors.black26,
      borderRadius: BorderRadius.circular(PTokens.radiusControl),
      child: InkWell(
        onTap: onPressed,
        borderRadius: BorderRadius.circular(PTokens.radiusControl),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          decoration: BoxDecoration(
            border: Border.all(color: PTokens.line),
            borderRadius: BorderRadius.circular(PTokens.radiusControl),
          ),
          child: Text(
            label,
            style: sans(size: 12, weight: FontWeight.w600, color: PTokens.ink),
          ),
        ),
      ),
    );
  }
}
