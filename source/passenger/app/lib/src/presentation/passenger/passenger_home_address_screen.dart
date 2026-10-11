import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import 'passenger_route_map.dart' show passengerMapTiles, passengerMapTileUrl;
import 'passenger_store.dart';
import 'passenger_widgets.dart';

/// Home pickup or home drop-off address (spec 3.1, adjustment A4): the passenger pins the place on the map
/// inside an area the bus company serves, types the address the driver will read, and the server checks it.
class PassengerHomeAddressScreen extends StatefulWidget {
  const PassengerHomeAddressScreen({super.key, required this.pickupSide});
  final bool pickupSide;

  @override
  State<PassengerHomeAddressScreen> createState() => _PassengerHomeAddressScreenState();
}

class _PassengerHomeAddressScreenState extends State<PassengerHomeAddressScreen> {
  final _address = TextEditingController();
  final _note = TextEditingController();
  final _map = MapController();
  // One tile provider for the screen's life (a new one per rebuild cancels slow tile loads).
  final _tiles = NetworkTileProvider(abortObsoleteRequests: false);
  bool _mapReady = false;
  bool _fitted = false;
  LatLng? _pin;
  String? _error;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    final store = PassengerScope.read(context);
    final current = widget.pickupSide ? store.homePickup : store.homeDropoff;
    if (current != null) {
      _address.text = current.address;
      _note.text = current.note;
      _pin = LatLng(current.lat, current.lng);
    }
  }

  @override
  void dispose() {
    _address.dispose();
    _note.dispose();
    _map.dispose();
    super.dispose();
  }

  /// Frames the service areas at a whole zoom level: at a fractional zoom the ROD2 tablet left the raster tiles
  /// grey (same fix as the route map). Runs once the map is ready and the areas have arrived.
  void _fitAreas(List<LatLng> points) {
    if (!_mapReady || _fitted || points.length < 3) return;
    _fitted = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final camera = CameraFit.bounds(bounds: LatLngBounds.fromPoints(points), padding: const EdgeInsets.all(24), maxZoom: 15).fit(_map.camera);
      _map.move(camera.center, camera.zoom.floorToDouble());
    });
  }

  Future<void> _confirm() async {
    final pin = _pin;
    if (pin == null) {
      setState(() => _error = 'Chạm lên bản đồ để chọn vị trí đón');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    final error = await PassengerScope.read(context).setHomeAddress(pickupSide: widget.pickupSide, address: _address.text, lat: pin.latitude, lng: pin.longitude, note: _note.text);
    if (!mounted) return;
    setState(() {
      _busy = false;
      _error = error;
    });
    if (error == null) Navigator.of(context).pop(true);
  }

  @override
  Widget build(BuildContext context) {
    final store = PassengerScope.of(context);
    final kind = widget.pickupSide ? 'PICKUP' : 'DROPOFF';
    final areas = store.serviceAreas.where((a) => a.kind == kind).toList();
    final points = [for (final a in areas) for (final p in a.polygon) LatLng(p.lat, p.lng)];
    final verb = widget.pickupSide ? 'đón' : 'trả';
    _fitAreas(points);
    final map = ClipRRect(
      borderRadius: BorderRadius.circular(PTokens.radius),
      child: SizedBox(
        height: pWide(context) ? 460 : 300,
        child: FlutterMap(
          mapController: _map,
          options: MapOptions(
            initialCenter: _pin ?? (points.isEmpty ? const LatLng(21.0, 105.84) : points.first),
            initialZoom: 11,
            onMapReady: () {
              _mapReady = true;
              _fitAreas(points);
            },
            interactionOptions: const InteractionOptions(flags: InteractiveFlag.all & ~InteractiveFlag.rotate),
            onTap: (_, point) => setState(() {
              _pin = point;
              _error = null;
            }),
          ),
          children: [
            if (passengerMapTiles) TileLayer(urlTemplate: passengerMapTileUrl, subdomains: const ['a', 'b', 'c'], userAgentPackageName: 'vn.busgo.passenger', tileProvider: _tiles),
            PolygonLayer(polygons: [
              for (final a in areas) Polygon(points: [for (final p in a.polygon) LatLng(p.lat, p.lng)], color: PTokens.primary.withValues(alpha: 0.12), borderColor: PTokens.primary, borderStrokeWidth: 2),
            ]),
            if (_pin != null) MarkerLayer(markers: [Marker(point: _pin!, width: 40, height: 40, alignment: Alignment.topCenter, child: const Icon(Icons.location_on, size: 40, color: PTokens.danger))]),
            const RichAttributionWidget(attributions: [TextSourceAttribution('OpenStreetMap contributors')]),
          ],
        ),
      ),
    );
    return Scaffold(
      appBar: TopBar(title: widget.pickupSide ? 'Đón tận nhà' : 'Trả tận nhà', subtitle: 'Trong vùng nhà xe phục vụ'),
      body: PSplit(left: [
        map,
        gap(8),
        Text('Chạm lên bản đồ để ghim chỗ $verb. Vùng tô xanh là nơi nhà xe phục vụ.', style: sans(size: 13, color: PTokens.muted, height: 1.4)),
      ], right: [
        if (!pWide(context)) gap(12),
        for (final a in areas) ...[
          Text('${a.name}: phụ phí ${vnd(a.feeVnd)}${a.leadMinutes > 0 ? ' · đặt trước ${a.leadMinutes} phút' : ''} · ${a.from}–${a.to}', style: sans(size: 13, color: PTokens.muted)),
          gap(4),
        ],
        gap(8),
        LabeledField(label: 'Địa chỉ (số nhà, ngõ, đường)', controller: _address, hint: 'VD: 12 ngõ 34 Giải Phóng, Hoàng Mai'),
        gap(12),
        LabeledField(label: 'Ghi chú cho tài xế (không bắt buộc)', controller: _note, hint: 'VD: cổng xanh, gọi trước 10 phút'),
        gap(12),
        Text(
          widget.pickupSide ? 'Xe đón trước giờ xuất bến; nhà xe sẽ báo khung giờ đón. Xe lớn có thể không vào được ngõ nhỏ, tài xế sẽ gọi cho bạn.' : 'Xe trả bạn sau khi tới bến cuối, trong vùng phục vụ.',
          style: sans(size: 13, color: PTokens.muted, height: 1.4),
        ),
        if (_error != null) ...[
          gap(12),
          Semantics(liveRegion: true, child: Text(_error!, style: sans(size: 14, color: PTokens.danger, weight: FontWeight.w600))),
        ],
      ]),
      bottomNavigationBar: BottomAction(children: [
        Expanded(child: PrimaryButton(label: _busy ? 'Đang kiểm tra…' : 'Xác nhận địa chỉ', onPressed: _busy ? null : _confirm)),
      ]),
    );
  }
}
