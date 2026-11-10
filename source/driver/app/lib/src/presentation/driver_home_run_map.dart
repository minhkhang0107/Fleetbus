import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:url_launcher/url_launcher.dart';

import 'driver_route_map.dart';
import 'driver_store.dart';
import 'driver_widgets.dart';

/// Home run pickup map showing the road, door stops, end stop, and bus position.
class DriverHomeRunMap extends StatefulWidget {
  const DriverHomeRunMap({super.key, required this.store, this.height = 260});
  final DriverStore store;
  final double height;

  @override
  State<DriverHomeRunMap> createState() => _DriverHomeRunMapState();
}

class _DriverHomeRunMapState extends State<DriverHomeRunMap> {
  final MapController _controller = MapController();
  final NetworkTileProvider _tiles = NetworkTileProvider(abortObsoleteRequests: false);
  bool _ready = false;
  bool _fitted = false;
  MapOptions? _options;
  int? _selectedDoor;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  List<LatLng> _framePoints(HomeRunMap map) {
    return [
      LatLng(widget.store.lat, widget.store.lng),
      for (final d in map.doors) LatLng(d.lat, d.lng),
      if (map.end?.lat != null && map.end?.lng != null) LatLng(map.end!.lat!, map.end!.lng!),
    ];
  }

  void _fit(HomeRunMap map) {
    final pts = _framePoints(map);
    if (pts.length < 2) return;
    final camera = CameraFit.bounds(
      bounds: LatLngBounds.fromPoints(pts),
      padding: const EdgeInsets.all(24),
      maxZoom: 16,
    ).fit(_controller.camera);
    _controller.move(camera.center, camera.zoom.floorToDouble());
  }

  String _formatKm(double km) {
    if (km == km.truncateToDouble()) {
      return km.toInt().toString();
    }
    return km.toStringAsFixed(1).replaceAll(RegExp(r'\.0$'), '');
  }

  String _directionsUrl(HomeRunMap map) {
    final doors = [...map.doors]..sort((a, b) => a.position.compareTo(b.position));
    String? destination;
    String waypoints = '';
    // Google Maps takes 9 stops on the way at most: a longer run goes to the 10th door, the driver opens the
    // directions again from there for the rest.
    if (doors.length > 9) {
      destination = '${doors[9].lat},${doors[9].lng}';
      waypoints = doors.take(9).map((d) => '${d.lat},${d.lng}').join('|');
    } else if (map.end?.lat != null && map.end?.lng != null) {
      destination = '${map.end!.lat},${map.end!.lng}';
      final pts = doors.map((d) => '${d.lat},${d.lng}').toList();
      if (pts.isNotEmpty) waypoints = pts.join('|');
    } else if (doors.isNotEmpty) {
      destination = '${doors.last.lat},${doors.last.lng}';
      final pts = doors.take(doors.length - 1).take(9).map((d) => '${d.lat},${d.lng}').toList();
      if (pts.isNotEmpty) waypoints = pts.join('|');
    }
    if (destination == null) return '';
    final wp = waypoints.isNotEmpty ? '&waypoints=$waypoints' : '';
    return 'https://www.google.com/maps/dir/?api=1&destination=$destination$wp&travelmode=driving';
  }

  Future<void> _openDirections(HomeRunMap map) async {
    final url = _directionsUrl(map);
    if (url.isEmpty) return;
    final uri = Uri.parse(url);
    try {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    } catch (_) {}
  }

  Widget _doorCircle(int position, bool isNext) {
    final size = isNext ? 32.0 : 24.0;
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: isNext ? DTokens.warn : DTokens.primary,
        border: Border.all(color: Colors.white, width: isNext ? 2.5 : 2),
        boxShadow: const [
          BoxShadow(color: Colors.black38, blurRadius: 2, offset: Offset(0, 1)),
        ],
      ),
      alignment: Alignment.center,
      child: Text(
        '$position',
        style: dmono(
          size: isNext ? 14 : 11,
          weight: FontWeight.w700,
          color: Colors.white,
        ),
      ),
    );
  }

  // A tapped door is ringed on the map; its address and seats show under the map (a label on the map
  // overflowed its marker and covered the doors and the bus station around it).
  Marker _buildDoorMarker(HomeRunDoor d) {
    final isSelected = _selectedDoor == d.position;
    final size = (d.next ? 36.0 : 28.0) + (isSelected ? 8 : 0);
    return Marker(
      point: LatLng(d.lat, d.lng),
      width: size,
      height: size,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: () => setState(() => _selectedDoor = isSelected ? null : d.position),
        child: Center(
          child: Container(
            decoration: isSelected
                ? BoxDecoration(shape: BoxShape.circle, border: Border.all(color: DTokens.ink, width: 3))
                : null,
            padding: EdgeInsets.all(isSelected ? 1 : 0),
            child: _doorCircle(d.position, d.next),
          ),
        ),
      ),
    );
  }

  Widget _selectedDoorInfo(HomeRunMap map) {
    final d = map.doors.where((x) => x.position == _selectedDoor).firstOrNull;
    if (d == null) return const SizedBox.shrink();
    return Container(
      margin: const EdgeInsets.only(top: 8),
      padding: const EdgeInsets.fromLTRB(12, 8, 4, 8),
      decoration: BoxDecoration(color: DTokens.panel2, borderRadius: BorderRadius.circular(8), border: Border.all(color: DTokens.line)),
      child: Row(children: [
        _doorCircle(d.position, d.next),
        const SizedBox(width: 10),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(d.address.isEmpty ? 'Điểm đón ${d.position}' : d.address, style: dsans(size: 14, weight: FontWeight.w600, color: DTokens.ink)),
            if (d.seats.isNotEmpty) Text('Ghế ${d.seats.join(', ')}', style: dmono(size: 13, color: DTokens.primaryInk, weight: FontWeight.w600)),
          ]),
        ),
        IconButton(
          tooltip: 'Đóng',
          onPressed: () => setState(() => _selectedDoor = null),
          icon: const Icon(Icons.close, size: 20, color: DTokens.sub),
        ),
      ]),
    );
  }

  Marker _buildEndMarker(HomeRunEnd end) {
    return Marker(
      point: LatLng(end.lat!, end.lng!),
      width: 130,
      height: 48,
      alignment: Alignment.topCenter,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
            decoration: BoxDecoration(
              color: DTokens.panel2,
              borderRadius: BorderRadius.circular(6),
              border: Border.all(color: DTokens.line),
            ),
            child: Text(
              end.name,
              style: dsans(size: 11, weight: FontWeight.w600, color: DTokens.ink),
              overflow: TextOverflow.ellipsis,
              maxLines: 1,
            ),
          ),
          const SizedBox(height: 2),
          Container(
            width: 24,
            height: 24,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: DTokens.ok,
              border: Border.all(color: Colors.white, width: 2),
            ),
            child: const Icon(Icons.directions_bus, size: 14, color: Colors.white),
          ),
        ],
      ),
    );
  }

  Marker _buildBusMarker() {
    return Marker(
      point: LatLng(widget.store.lat, widget.store.lng),
      width: 30,
      height: 30,
      child: Container(
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: DTokens.primary,
          border: Border.all(color: Colors.white, width: 3),
        ),
        child: const Icon(Icons.directions_bus, size: 15, color: Colors.white),
      ),
    );
  }

  Polyline _buildPolyline(HomeRunMap map) {
    final points = [for (final p in map.line) LatLng(p.lat, p.lng)];
    if (map.lineOnRoad) {
      return Polyline(
        points: points,
        strokeWidth: 4.0,
        color: const Color(0xFF3B82F6),
        pattern: const StrokePattern.solid(),
      );
    } else {
      return Polyline(
        points: points,
        strokeWidth: 2.5,
        color: const Color(0xFF64748B),
        pattern: StrokePattern.dashed(segments: const [6, 4]),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final map = widget.store.homeRunMap;
    if (map == null) {
      return DriverRouteMap(store: widget.store, height: widget.height);
    }

    final frame = _framePoints(map);
    _options ??= MapOptions(
      initialCenter: LatLng(widget.store.lat, widget.store.lng),
      initialZoom: 13,
      initialCameraFit: frame.length >= 2
          ? CameraFit.bounds(
              bounds: LatLngBounds.fromPoints(frame),
              padding: const EdgeInsets.all(24),
              maxZoom: 16,
            )
          : null,
      interactionOptions: const InteractionOptions(
        flags: InteractiveFlag.all & ~InteractiveFlag.rotate,
        keyboardOptions: KeyboardOptions.disabled(),
      ),
      onMapReady: () {
        _ready = true;
        if (!_fitted) {
          _fitted = true;
          if (frame.length >= 2) {
            _fit(map);
          }
        }
      },
    );

    if (_ready && !_fitted && frame.length >= 2) {
      _fitted = true;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _fit(map);
      });
    }

    final mode = map.byRoad ? 'theo đường bộ' : 'đường thẳng ước tính';
    final summary = 'Lộ trình đón: ${map.doors.length} nhà · ${_formatKm(map.distanceKm)} km · $mode';

    // Later doors under earlier ones; the next door and the tapped one on top.
    final unselectedDoors = [
      for (final d in map.doors.reversed)
        if (_selectedDoor != d.position && !d.next) _buildDoorMarker(d),
      for (final d in map.doors)
        if (_selectedDoor != d.position && d.next) _buildDoorMarker(d),
    ];
    final selectedDoor = [
      for (final d in map.doors)
        if (_selectedDoor == d.position) _buildDoorMarker(d),
    ];

    final mapWidget = FlutterMap(
      key: ValueKey(widget.store.tripId),
      mapController: _controller,
      options: _options!,
      children: [
        if (driverMapTiles)
          TileLayer(
            urlTemplate: driverMapTileUrl,
            subdomains: const ['a', 'b', 'c'],
            userAgentPackageName: 'vn.busgo.driver',
            tileProvider: _tiles,
            tileDisplay: const TileDisplay.instantaneous(),
          ),
        if (map.line.length >= 2) PolylineLayer(polylines: [_buildPolyline(map)]),
        MarkerLayer(
          markers: [
            if (map.end != null && map.end!.lat != null && map.end!.lng != null)
              _buildEndMarker(map.end!),
            // The bus under the doors: at a door it must not hide its number.
            _buildBusMarker(),
            ...unselectedDoors,
            ...selectedDoor,
          ],
        ),
        const RichAttributionWidget(attributions: [TextSourceAttribution('OpenStreetMap contributors')]),
      ],
    );

    return Panel(
      padding: const EdgeInsets.fromLTRB(14, 8, 14, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  summary,
                  style: dsans(size: 13, weight: FontWeight.w600, color: DTokens.sub),
                ),
              ),
              const SizedBox(width: 8),
              TextButton.icon(
                onPressed: () => _openDirections(map),
                icon: const Icon(Icons.navigation_outlined, size: 16, color: DTokens.primaryInk),
                label: Text(
                  'Mở chỉ đường',
                  style: dsans(size: 13, weight: FontWeight.w600, color: DTokens.primaryInk),
                ),
                style: TextButton.styleFrom(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  minimumSize: const Size(48, 36),
                ),
              ),
            ],
          ),
          if (map.slowerThanBestMinutes > 0) ...[
            const SizedBox(height: 6),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
              decoration: BoxDecoration(
                color: DTokens.warnBg,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: const Color(0xFFA16207)),
              ),
              child: Text(
                'Thứ tự bạn đang chọn chậm hơn gợi ý khoảng ${map.slowerThanBestMinutes} phút.',
                style: dsans(size: 13, color: DTokens.warnInk, height: 1.3),
              ),
            ),
          ],
          const SizedBox(height: 8),
          SizedBox(
            height: widget.height,
            child: ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: mapWidget,
            ),
          ),
          _selectedDoorInfo(map),
        ],
      ),
    );
  }
}
