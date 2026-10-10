import 'dart:math' as math;

/// Precomputed road geometry for interpolating and projecting vehicle positions.
class RoutePath {
  RoutePath(List<dynamic> points) {
    if (points.length < 2) {
      throw ArgumentError('RoutePath requires at least 2 points');
    }
    for (final p in points) {
      if (p is List && p.length >= 2) {
        _points.add((lat: (p[0] as num).toDouble(), lng: (p[1] as num).toDouble()));
      } else if (p is ({double lat, double lng})) {
        _points.add(p);
      } else {
        throw ArgumentError('Invalid point in RoutePath: $p');
      }
    }
    if (_points.length < 2) {
      throw ArgumentError('RoutePath requires at least 2 valid points');
    }
    _init();
  }

  /// Two-point straight path between two coordinates.
  factory RoutePath.straight(num fromLat, num fromLng, num toLat, num toLng) => RoutePath([
        [fromLat.toDouble(), fromLng.toDouble()],
        [toLat.toDouble(), toLng.toDouble()],
      ]);

  final List<({double lat, double lng})> _points = [];
  final List<double> _segmentLengths = [];
  final List<double> _cumulative = [0.0];
  final List<double> _bearings = [];

  /// Segment lengths in metres.
  List<double> get segmentLengths => List.unmodifiable(_segmentLengths);

  /// Cumulative distance along the path at each point in metres.
  List<double> get cumulativeDistance => List.unmodifiable(_cumulative);

  /// Total length of the route path in metres.
  double get length => _cumulative.last;

  void _init() {
    for (var i = 0; i < _points.length - 1; i++) {
      final p1 = _points[i];
      final p2 = _points[i + 1];
      final segLen = haversine(p1.lat, p1.lng, p2.lat, p2.lng);
      _segmentLengths.add(segLen);
      _cumulative.add(_cumulative.last + segLen);
      _bearings.add(bearingBetween(p1.lat, p1.lng, p2.lat, p2.lng));
    }
  }

  /// Great-circle distance between two GPS coordinates in metres.
  static double haversine(double lat1, double lng1, double lat2, double lng2) {
    const r = 6371000.0;
    final phi1 = lat1 * math.pi / 180;
    final phi2 = lat2 * math.pi / 180;
    final dPhi = (lat2 - lat1) * math.pi / 180;
    final dLambda = (lng2 - lng1) * math.pi / 180;
    final a = math.sin(dPhi / 2) * math.sin(dPhi / 2) + math.cos(phi1) * math.cos(phi2) * math.sin(dLambda / 2) * math.sin(dLambda / 2);
    final c = 2 * math.asin(math.sqrt(a.clamp(0.0, 1.0)));
    return r * c;
  }

  /// Initial bearing from point 1 to point 2 in degrees 0-360.
  static double bearingBetween(double lat1, double lng1, double lat2, double lng2) {
    final phi1 = lat1 * math.pi / 180;
    final phi2 = lat2 * math.pi / 180;
    final dLambda = (lng2 - lng1) * math.pi / 180;
    final y = math.sin(dLambda) * math.cos(phi2);
    final x = math.cos(phi1) * math.sin(phi2) - math.sin(phi1) * math.cos(phi2) * math.cos(dLambda);
    final theta = math.atan2(y, x);
    return (theta * 180 / math.pi + 360) % 360;
  }

  ({double along, double offset}) _project(double lat, double lng) {
    var bestAlong = 0.0;
    var bestOffset = double.infinity;
    for (var i = 0; i < _points.length - 1; i++) {
      final p1 = _points[i];
      final p2 = _points[i + 1];
      final segLen = _segmentLengths[i];
      final midLatRad = ((p1.lat + p2.lat) / 2) * (math.pi / 180);
      final cosLat = math.cos(midLatRad);
      final dx = (p2.lng - p1.lng) * cosLat;
      final dy = p2.lat - p1.lat;
      final px = (lng - p1.lng) * cosLat;
      final py = lat - p1.lat;
      final len2 = dx * dx + dy * dy;
      var t = len2 > 0 ? (px * dx + py * dy) / len2 : 0.0;
      t = t.clamp(0.0, 1.0);
      final projLat = p1.lat + t * (p2.lat - p1.lat);
      final projLng = p1.lng + t * (p2.lng - p1.lng);
      final offset = haversine(lat, lng, projLat, projLng);
      if (offset < bestOffset) {
        bestOffset = offset;
        bestAlong = _cumulative[i] + t * segLen;
      }
    }
    return (along: bestAlong, offset: bestOffset);
  }

  /// Metres along the path of the closest point via equirectangular projection.
  double project(double lat, double lng) => _project(lat, lng).along;

  /// Shortest distance in metres from the given point to the path.
  double distanceTo(double lat, double lng) => _project(lat, lng).offset;

  /// Interpolated point along the path clamped to [0, length] with segment bearing in degrees 0-360.
  ({double lat, double lng, double bearing}) pointAt(double along) {
    if (_points.length == 1) return (lat: _points[0].lat, lng: _points[0].lng, bearing: 0.0);
    final target = along.clamp(0.0, length);
    for (var i = 0; i < _segmentLengths.length; i++) {
      final endDist = _cumulative[i + 1];
      if (target <= endDist || i == _segmentLengths.length - 1) {
        final segLen = _segmentLengths[i];
        final fraction = segLen == 0 ? 0.0 : ((target - _cumulative[i]) / segLen).clamp(0.0, 1.0);
        final lat = _points[i].lat + fraction * (_points[i + 1].lat - _points[i].lat);
        final lng = _points[i].lng + fraction * (_points[i + 1].lng - _points[i].lng);
        return (lat: lat, lng: lng, bearing: _bearings[i]);
      }
    }
    return (lat: _points.last.lat, lng: _points.last.lng, bearing: _bearings.last);
  }
}
