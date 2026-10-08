import 'dart:async';

import 'package:flutter/widgets.dart';

import '../service/driver_api_service.dart';

/// State of the driver app, backed by the FleetBus API (`DriverApiClientService`, OQ-029).
///
/// The server owns the trip: after every action the store reads the trip again and takes the manifest,
/// the cash, the debt receipts and the stop states from it. Only the speed and the clock between two
/// stops are local, until the GPS plugin is wired; the position sent to the server follows them.

class DriverStop {
  const DriverStop(this.id, this.name, this.time, {this.arrived = false});
  final String id;
  final String name;
  final String time;
  final bool arrived;
  String get short => name.replaceFirst('Bến xe ', '');
}

enum PaxStatus { waiting, boarded, noShow }

class Passenger {
  Passenger({
    required this.ticketId,
    required this.seat,
    required this.name,
    required this.phone,
    required this.pay,
    required this.from,
    required this.to,
    this.cod = 0,
    this.paid = false,
    this.status = PaxStatus.waiting,
    this.boardedAt,
    this.hail = false,
  });
  final String ticketId;
  final String seat;
  final String name;
  final String phone;
  final String pay;
  final String from;
  final String to;
  final int cod;
  final bool paid;
  final PaxStatus status;
  final int? boardedAt;
  final bool hail;
  bool get codDue => cod > 0 && !paid;

  factory Passenger.fromJson(Map<String, dynamic> j) {
    final boardedAt = DateTime.tryParse('${j['boarded_at']}')?.toUtc().add(const Duration(hours: 7));
    return Passenger(
      ticketId: j['ticket_id'],
      seat: j['seat_code'] ?? '',
      name: j['passenger_name'] ?? '',
      phone: j['phone_masked'] ?? '',
      pay: switch (j['payment_method']) {
        'COD' => 'COD',
        'VIETQR' => 'VietQR',
        'VNPAY_ONLINE' => 'VNPAY',
        'COUNTER' => 'Quầy vé',
        'CASH' => 'Tiền mặt',
        'PREPAID' => 'Đã trả trước',
        final other => '${other ?? ''}',
      },
      from: j['pickup_stop_id'] ?? '',
      to: j['dropoff_stop_id'] ?? '',
      cod: (j['cod_amount_vnd'] as num?)?.toInt() ?? 0,
      paid: j['cod_collected'] == true,
      status: switch (j['boarding_status']) { 'BOARDED' => PaxStatus.boarded, 'NO_SHOW' => PaxStatus.noShow, _ => PaxStatus.waiting },
      boardedAt: boardedAt == null ? null : boardedAt.hour * 60 + boardedAt.minute,
      hail: j['is_hail_passenger'] == true,
    );
  }
}

class QueuedAction {
  QueuedAction(this.label, this.at);
  final String label;
  final int at;
}

/// A trip of the shift as listed on the home screen.
class ShiftTrip {
  const ShiftTrip(this.id, this.dep, this.route, this.plate, this.booked, this.status);
  final String id;
  final String dep;
  final String route;
  final String plate;
  final int booked;
  final String status;
}

enum TripState { readyCheck, inTransit, completed }

String hhmm(int minutes) => '${((minutes ~/ 60) % 24).toString().padLeft(2, '0')}:${(minutes % 60).toString().padLeft(2, '0')}';
int toMinutes(String t) {
  final p = t.split(':').map(int.parse).toList();
  return p[0] * 60 + p[1];
}

String vnd(int amount) {
  final s = amount.toString();
  final b = StringBuffer();
  for (var i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 == 0) b.write('.');
    b.write(s[i]);
  }
  return '$b đ';
}

String routeLabel(String name) => name.replaceAll(RegExp(r'\s*\(.*\)'), '').replaceAll(' — ', ' → ');

const _networkError = 'Không kết nối được máy chủ. Thao tác chưa được gửi, thử lại khi có mạng.';

class DriverStore extends ChangeNotifier {
  DriverStore({DriverApiClientService? api}) : api = api ?? DriverApiClientService();

  final DriverApiClientService api;

  static const debtLimit = 1000000;
  static const noShowGrace = 10;
  static const minutesBetweenStops = 45;
  static const checkKeys = ['tires_checked', 'brakes_fluid_checked', 'ac_cleanliness_checked', 'first_aid_extinguisher_checked', 'fuel_level_sufficient', 'gps_telemetry_beacon_active'];
  static const checks = ['Lốp và áp suất lốp', 'Phanh và dầu phanh', 'Điều hòa, vệ sinh khoang', 'Bình chữa cháy, túi cứu thương', 'Nhiên liệu đủ cho chuyến', 'Định vị GPS đang hoạt động'];

  // Session and shift
  String driverName = '';
  String staffId = '';
  bool get loggedIn => api.authToken != null;
  List<ShiftTrip> shift = [];
  bool loading = false;
  String? loadError;

  // Current trip, as the server last returned it
  String? tripId;
  String route = '';
  String plate = '';
  String depTime = '--:--';
  int fare = 0;
  TripState trip = TripState.readyCheck;
  List<DriverStop> stops = const [];
  List<Passenger> manifest = [];
  int stopIndex = 0;
  int codCash = 0;
  int hailCash = 0;
  List<({String code, int amount})> debts = [];
  List<String> freeSeats = [];
  int? endedCash;

  // Local to the cab
  final List<bool> checked = List.filled(6, false);
  int clock = toMinutes('06:40');
  bool atStop = false;
  bool moving = false;
  final Map<int, int> arrivedAt = {};
  final List<QueuedAction> queue = [];
  bool offline = false;
  ({String type, int delay, int at})? incident;
  String? earlyEndReason;
  double _lat = 20.9806, _lng = 105.8413;

  Timer? _clockTimer;
  Timer? _driveTimer;
  Timer? _telemetryTimer;

  DriverStop get stop => stops.isEmpty ? const DriverStop('', '', '--:--') : stops[stopIndex];
  bool get lastStop => stops.isNotEmpty && stopIndex == stops.length - 1;
  int get speed => moving ? 62 : 0;
  List<Passenger> get atStopPassengers => manifest.where((p) => p.from == stop.id && !p.hail).toList();
  int get boardedCount => manifest.where((p) => p.status == PaxStatus.boarded).length;
  int get hailCount => manifest.where((p) => p.hail).length;
  int get debtIssued => debts.fold(0, (a, d) => a + d.amount);
  bool get readyToStart => checked.every((c) => c);
  String get firstStopName => stops.isEmpty ? '' : stops.first.name;
  int get pickupStopCount => stops.where((s) => manifest.any((p) => p.from == s.id)).length;
  ShiftTrip? get nextTrip => shift.where((t) => t.id != tripId && t.status != 'COMPLETED').firstOrNull;
  DriverStop stopById(String id) => stops.firstWhere((s) => s.id == id, orElse: () => DriverStop(id, id, '--:--'));

  String? _error(Map<String, dynamic> json) => json['status'] == 'success' ? null : '${json['message'] ?? 'Có lỗi, thử lại sau.'}';

  /// Runs one call; on a network failure the action is listed as waiting for the network.
  Future<({Map<String, dynamic>? data, String? error, String? code})> _call(Future<Map<String, dynamic>> Function() request, {String? label}) async {
    try {
      final json = await request();
      final error = _error(json);
      if (offline && error == null) offline = false;
      return (data: json['data'] is Map<String, dynamic> ? json['data'] as Map<String, dynamic> : null, error: error, code: json['code']?.toString());
    } catch (_) {
      offline = true;
      if (label != null) queue.add(QueuedAction(label, clock));
      notifyListeners();
      return (data: null, error: _networkError, code: 'NETWORK');
    }
  }

  // ---------- Session (DRI-001, DRI-002) ----------
  Future<String?> login(String staff, String pin) async {
    if (staff.trim().isEmpty) return 'Nhập mã nhân viên hoặc số điện thoại.';
    if (!RegExp(r'^\d{6}$').hasMatch(pin)) return 'Mã PIN gồm đúng 6 chữ số.';
    try {
      final json = await api.login(staff.trim(), pin);
      final error = _error(json);
      if (error != null) return error;
      final d = json['data']['driver'] as Map<String, dynamic>;
      driverName = d['full_name'] ?? '';
      staffId = d['staff_id'] ?? staff.trim();
    } catch (_) {
      return 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.';
    }
    await loadShift();
    return null;
  }

  void logout() {
    api.authToken = null;
    _stopTimers();
    tripId = null;
    shift = [];
    manifest = [];
    notifyListeners();
  }

  /// DRI-003: the trips of today; the current one is the earliest that is not completed.
  Future<void> loadShift() async {
    loading = true;
    loadError = null;
    notifyListeners();
    final r = await _call(api.getTodayTrips);
    loading = false;
    if (r.error != null) {
      loadError = r.error;
      notifyListeners();
      return;
    }
    final trips = (r.data!['trips'] as List).cast<Map<String, dynamic>>()
      ..sort((a, b) => '${a['planned_departure_time']}'.compareTo('${b['planned_departure_time']}'));
    shift = [
      for (final t in trips)
        ShiftTrip(t['trip_id'], _depOf(t), routeLabel(t['route_name'] ?? ''), t['vehicle_plate'] ?? '', (t['manifest'] as List? ?? []).length, t['status'] ?? ''),
    ];
    final current = trips.where((t) => t['status'] != 'COMPLETED').firstOrNull ?? trips.lastOrNull;
    if (current != null) _apply(current, fresh: tripId != current['trip_id']);
    notifyListeners();
  }

  String _depOf(Map<String, dynamic> t) {
    final dep = DateTime.tryParse('${t['planned_departure_time']}')?.toUtc().add(const Duration(hours: 7));
    return dep == null ? '--:--' : hhmm(dep.hour * 60 + dep.minute);
  }

  void _apply(Map<String, dynamic> t, {bool fresh = false}) {
    tripId = t['trip_id'];
    route = routeLabel(t['route_name'] ?? '');
    plate = t['vehicle_plate'] ?? '';
    depTime = _depOf(t);
    fare = (t['base_fare_vnd'] as num?)?.toInt() ?? fare;
    final dep = toMinutes(depTime == '--:--' ? '07:00' : depTime);
    final raw = (t['stops'] as List? ?? []).cast<Map<String, dynamic>>()..sort((a, b) => (a['order'] as num).compareTo(b['order'] as num));
    stops = [
      for (var i = 0; i < raw.length; i++) DriverStop(raw[i]['stop_id'], raw[i]['name'], hhmm(dep + i * minutesBetweenStops), arrived: raw[i]['status'] == 'ARRIVED'),
    ];
    manifest = (t['manifest'] as List? ?? []).cast<Map<String, dynamic>>().map(Passenger.fromJson).toList();
    stopIndex = ((t['current_stop_index'] as num?)?.toInt() ?? 0).clamp(0, stops.isEmpty ? 0 : stops.length - 1);
    codCash = (t['total_cod_collected_vnd'] as num?)?.toInt() ?? 0;
    hailCash = (t['total_hail_collected_vnd'] as num?)?.toInt() ?? 0;
    debts = [for (final d in (t['debts'] as List? ?? []).cast<Map<String, dynamic>>()) (code: '${d['receipt_code']}', amount: (d['amount_vnd'] as num).toInt())];
    trip = switch (t['status']) { 'IN_TRANSIT' => TripState.inTransit, 'COMPLETED' => TripState.completed, _ => TripState.readyCheck };
    if (t['current_lat'] is num) _lat = (t['current_lat'] as num).toDouble();
    if (t['current_lng'] is num) _lng = (t['current_lng'] as num).toDouble();
    if (fresh) {
      final list = t['readiness_checklist'] as Map<String, dynamic>? ?? {};
      for (var i = 0; i < checkKeys.length; i++) {
        checked[i] = trip != TripState.readyCheck || list[checkKeys[i]] == true && t['status'] == 'READY';
      }
      clock = dep - 20;
      if (trip == TripState.inTransit) {
        atStop = stops.isNotEmpty && stops[stopIndex].arrived;
        _startTimers();
      }
    }
  }

  Future<String?> refreshTrip() async {
    if (tripId == null) return null;
    final r = await _call(() => api.getTrip(tripId!));
    if (r.error != null) return r.error;
    _apply(r.data!);
    notifyListeners();
    return null;
  }

  /// Runs an action on the trip, then reads the trip again from the server.
  Future<String?> _act(String label, Future<Map<String, dynamic>> Function() request) async {
    final r = await _call(request, label: label);
    if (r.error == null) await refreshTrip();
    notifyListeners();
    return r.error;
  }

  // ---------- Readiness and start (DRI-004, DRI-005) ----------
  void toggleCheck(int i, bool value) {
    checked[i] = value;
    notifyListeners();
  }

  Future<String?> startTrip() async {
    final checklist = {for (var i = 0; i < checkKeys.length; i++) checkKeys[i]: checked[i]};
    final ready = await _call(() => api.submitReadinessCheck(tripId!, checklist));
    if (ready.error != null) return ready.error;
    final r = await _call(() => api.startTrip(tripId!));
    if (r.error != null) return r.error;
    clock = clock < toMinutes(depTime) - 2 ? toMinutes(depTime) - 2 : clock;
    stopIndex = 0;
    moving = false;
    await _call(() => api.arriveAtStop(tripId!, stops.first.id));
    atStop = true;
    arrivedAt[0] = clock;
    await refreshTrip();
    _startTimers();
    notifyListeners();
    return null;
  }

  void _startTimers() {
    _clockTimer ??= Timer.periodic(const Duration(seconds: 3), (_) {
      clock++;
      notifyListeners();
    });
    // FLOW-06: the position goes to the server while the trip runs.
    _telemetryTimer ??= Timer.periodic(const Duration(seconds: 5), (_) => sendTelemetry());
  }

  Future<void> sendTelemetry() async {
    if (tripId == null || trip != TripState.inTransit) return;
    if (moving) {
      _lat -= 0.004;
      _lng -= 0.001;
    }
    await _call(() => api.sendTelemetry(tripId!, lat: _lat, lng: _lng, speedKmh: speed.toDouble(), bearingDeg: 200));
  }

  // ---------- Stops (DRI-008) ----------
  Future<String?> arrive() async {
    if (atStop) return null;
    final error = await _act('Đến ${stop.name}', () => api.arriveAtStop(tripId!, stop.id));
    if (error != null && !offline) return error;
    atStop = true;
    moving = false;
    clock = clock < toMinutes(stop.time) - 2 ? toMinutes(stop.time) - 2 : clock;
    arrivedAt[stopIndex] = clock;
    notifyListeners();
    return null;
  }

  void leaveStop() {
    clock = clock < toMinutes(stop.time) + 1 ? toMinutes(stop.time) + 1 : clock;
    atStop = false;
    moving = true;
    stopIndex = (stopIndex + 1).clamp(0, stops.length - 1);
    _driveTimer?.cancel();
    _driveTimer = Timer(const Duration(seconds: 8), () {
      moving = false;
      notifyListeners();
    });
    unawaited(sendTelemetry());
    notifyListeners();
  }

  /// BR-NOSHOW-004: 10 minutes at the passenger's own stop (first stop: from the planned departure).
  int noShowFrom() => (stopIndex == 0 ? toMinutes(depTime) : arrivedAt[stopIndex] ?? toMinutes(stop.time)) + noShowGrace;
  bool get noShowOpen => atStop && clock >= noShowFrom();

  // ---------- Boarding (DRI-009 to DRI-012) ----------
  /// The server refuses an unpaid COD ticket (409 COD_PAYMENT_REQUIRED, BR-COD-006).
  Future<String?> board(Passenger p) => _act('Cho lên xe ghế ${p.seat}', () => api.boardManually(tripId!, ticketId: p.ticketId));

  /// DRI-010: the backup PIN is checked by the server against the ticket's current QR version.
  Future<({String? error, String? code})> boardWithPin(Passenger p, String pin) async {
    final r = await _call(() => api.boardWithQr(tripId!, 'PIN:${p.ticketId}:$pin'), label: 'PIN ghế ${p.seat}');
    if (r.error == null) await refreshTrip();
    return (error: r.error, code: r.code);
  }

  /// DRI-009: a scanned boarding QR (BUSGO|pnr|ticket|v<n>|hmac).
  Future<({String? error, String? code, Map<String, dynamic>? data})> boardWithQr(String payload) async {
    final r = await _call(() => api.boardWithQr(tripId!, payload), label: 'Quét vé');
    if (r.error == null) await refreshTrip();
    return (error: r.error, code: r.code, data: r.data);
  }

  Future<String?> markNoShow(Passenger p) => _act('Vắng mặt ghế ${p.seat}', () => api.markNoShow(tripId!, p.ticketId));

  /// DRI-012: collect the fare; change returned in cash, credited to the wallet, or as a debt receipt.
  Future<String?> collectCod(Passenger p, {required int given, required String method}) =>
      _act('Thu COD ghế ${p.seat}', () => api.collectCod(tripId!, p.ticketId, given, changeSettlementMethod: method));

  /// DRI-006: free seats for a hailing passenger, from the seat map minus the manifest.
  Future<void> loadFreeSeats() async {
    final r = await _call(() => api.getSeatMap(tripId!));
    if (r.error != null) return;
    final taken = manifest.where((p) => p.status != PaxStatus.noShow).map((p) => p.seat).toSet();
    freeSeats = [
      for (final s in (r.data!['seats'] as List).cast<Map<String, dynamic>>())
        if (s['state'] == 'AVAILABLE' && !taken.contains(s['seat_code'])) s['seat_code'] as String,
    ];
    notifyListeners();
  }

  Future<String?> sellHail(String seat, String toStop) =>
      _act('Bán vé khách vẫy ghế $seat', () => api.onboardHailPassenger(tripId!, seatCode: seat, amountCollectedVnd: fare, dropoffStopId: toStop));

  // ---------- Incident, sync, end (DRI-015, DRI-017, DRI-019) ----------
  Future<String?> reportIncident(String type, int delay) async {
    const types = {'Kẹt xe': 'TRAFFIC_JAM', 'Xe hỏng': 'BREAKDOWN', 'Tai nạn': 'ACCIDENT'};
    final r = await _call(
      () => api.reportIncident(tripId!, incidentType: types[type] ?? 'OTHER', description: type, lat: _lat, lng: _lng, estimatedDelayMinutes: delay),
      label: 'Báo sự cố: $type',
    );
    if (r.error != null && !offline) return r.error;
    incident = (type: type, delay: delay, at: clock);
    notifyListeners();
    return null;
  }

  void setOffline(bool value) {
    offline = value;
    notifyListeners();
  }

  /// Tries the server again; the listed actions are cleared once it answers.
  Future<int> flushQueue() async {
    final error = await refreshTrip();
    if (error != null) return 0;
    final n = queue.length;
    queue.clear();
    offline = false;
    notifyListeners();
    return n;
  }

  Future<String?> endTrip() async {
    final r = await _call(() => api.endTrip(tripId!, earlyEndReason: lastStop && atStop ? null : earlyEndReason), label: 'Kết thúc chuyến');
    if (r.error != null) return r.error;
    endedCash = (r.data!['total_cash_to_handover_vnd'] as num?)?.toInt() ?? codCash + hailCash;
    _stopTimers();
    moving = false;
    trip = TripState.completed;
    shift = [for (final t in shift) t.id == tripId ? ShiftTrip(t.id, t.dep, t.route, t.plate, t.booked, 'COMPLETED') : t];
    notifyListeners();
    return null;
  }

  void _stopTimers() {
    _clockTimer?.cancel();
    _driveTimer?.cancel();
    _telemetryTimer?.cancel();
    _clockTimer = null;
    _driveTimer = null;
    _telemetryTimer = null;
  }

  @override
  void dispose() {
    _stopTimers();
    super.dispose();
  }
}

class DriverScope extends InheritedNotifier<DriverStore> {
  const DriverScope({super.key, required DriverStore store, required super.child}) : super(notifier: store);
  static DriverStore of(BuildContext context) => context.dependOnInheritedWidgetOfExactType<DriverScope>()!.notifier!;
  static DriverStore read(BuildContext context) => context.getInheritedWidgetOfExactType<DriverScope>()!.notifier!;
}
