import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;

import 'package:flutter/foundation.dart' show TargetPlatform, defaultTargetPlatform;
import 'package:flutter/widgets.dart';
import 'package:geolocator/geolocator.dart';

import '../service/driver_api_service.dart';
import 'driver_route.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// State of the driver app, backed by the FleetBus API (`DriverApiClientService`, OQ-029).
///
/// The server owns the trip: after every action the store reads the trip again and takes the manifest,
/// the cash, the debt receipts and the stop states from it. Only the speed and the clock between two
/// stops are local, until the GPS plugin is wired; the position sent to the server follows them.

/// D144: one home passenger in the run, as the server orders and times it.
class HomeRunStop {
  const HomeRunStop(
      {required this.ticketId,
      required this.position,
      this.appointment,
      this.arrivedAt,
      this.missableAt,
      this.missed = false,
      this.readyStatus,
      this.readyMinutes,
      this.waiting = true});
  final String ticketId;
  final int position;

  /// "18:20": the time given to the passenger.
  final String? appointment;
  final DateTime? arrivedAt;

  /// When the driver may go on without the passenger.
  final DateTime? missableAt;
  final bool missed;

  /// READY or NEED_TIME, with the minutes asked.
  final String? readyStatus;
  final int? readyMinutes;
  final bool waiting;

  static String? _clock(Object? iso) {
    final t = DateTime.tryParse('${iso ?? ''}')?.toUtc().add(const Duration(hours: 7));
    return t == null ? null : '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';
  }

  factory HomeRunStop.fromJson(Map<String, dynamic> j) => HomeRunStop(
        ticketId: '${j['ticket_id']}',
        position: (j['position'] as num?)?.toInt() ?? 0,
        appointment: _clock(j['appointment_at']),
        arrivedAt: DateTime.tryParse('${j['arrived_at'] ?? ''}'),
        missableAt: DateTime.tryParse('${j['missable_at'] ?? ''}'),
        missed: j['missed_at'] != null,
        readyStatus: j['ready']?['status'] as String?,
        readyMinutes: (j['ready']?['minutes'] as num?)?.toInt(),
        waiting: j['waiting'] != false,
      );

  /// "Sẵn sàng" / "Cần 5 phút" / null when the passenger has not answered.
  String? get readyLabel => readyStatus == 'READY'
      ? 'Sẵn sàng'
      : readyStatus == 'NEED_TIME'
          ? 'Cần $readyMinutes phút'
          : null;
}

class DriverStop {
  const DriverStop(this.id, this.name, this.time, {this.arrived = false, this.lat, this.lng});
  final String id;
  final String name;
  final String time;
  final bool arrived;
  final double? lat;
  final double? lng;
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
    this.homePickup,
    this.homeDropoff,
    this.homeNote = '',
    this.pickupWindow,
    this.homeLat,
    this.homeLng,
    this.inaccessible = false,
    this.meetingPoint,
    this.homeMissed = false,
    this.isHotline = false,
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
  final bool isHotline;

  /// Home pickup / drop-off address (spec 3.1); the passenger still rides from [from] to [to].
  final String? homePickup;
  final String? homeDropoff;
  final String homeNote;

  /// "05:00–05:40": the window promised to a home pickup.
  final String? pickupWindow;

  /// Pinned position of the home pickup, drawn on the driver map.
  final double? homeLat;
  final double? homeLng;

  /// The driver reported the home address unreachable (spec A9), with the meeting point given, if any.
  final bool inaccessible;

  /// D144: the bus waited at the door and went on; the passenger boards at the first stop.
  final bool homeMissed;
  final String? meetingPoint;
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
      homePickup: j['home_pickup']?['address'],
      homeDropoff: j['home_dropoff']?['address'],
      homeNote: '${j['home_pickup']?['note'] ?? j['home_dropoff']?['note'] ?? ''}',
      pickupWindow: _window(j['home_pickup']),
      homeLat: (j['home_pickup']?['lat'] as num?)?.toDouble(),
      homeLng: (j['home_pickup']?['lng'] as num?)?.toDouble(),
      inaccessible: j['home_pickup']?['inaccessible_at'] != null,
      meetingPoint: j['home_pickup']?['meeting_point'],
      homeMissed: j['home_pickup']?['missed_at'] != null,
      isHotline: j['source'] == 'HOTLINE',
    );
  }
}

String? _window(dynamic home) {
  final from = DateTime.tryParse('${home?['window_from'] ?? ''}')?.toUtc().add(const Duration(hours: 7));
  final to = DateTime.tryParse('${home?['window_to'] ?? ''}')?.toUtc().add(const Duration(hours: 7));
  if (from == null || to == null) return null;
  String two(int n) => n.toString().padLeft(2, '0');
  return '${two(from.hour)}:${two(from.minute)}–${two(to.hour)}:${two(to.minute)}';
}

class QueuedAction {
  QueuedAction(
    this.label,
    this.at, {
    this.method = 'POST',
    this.path = '',
    this.body,
    String? idempotencyKey,
  }) : idempotencyKey = idempotencyKey ?? newDriverIdempotencyKey();

  final String label;
  final int at;
  final String method;
  final String path;
  final Map<String, dynamic>? body;
  final String idempotencyKey;

  Map<String, dynamic> toJson() => {
        'label': label,
        'at': at,
        'method': method,
        'path': path,
        if (body != null) 'body': body,
        'idempotency_key': idempotencyKey,
      };

  factory QueuedAction.fromJson(Map<String, dynamic> j) => QueuedAction(
        '${j['label'] ?? ''}',
        (j['at'] as num?)?.toInt() ?? 0,
        method: '${j['method'] ?? 'POST'}',
        path: '${j['path'] ?? ''}',
        body: j['body'] is Map ? Map<String, dynamic>.from(j['body'] as Map) : null,
        idempotencyKey: j['idempotency_key']?.toString(),
      );
}

class _DriveLeg {
  _DriveLeg({required this.path, required this.start, required this.end, required this.startedAt, this.targetStop});
  final RoutePath path;
  final double start;
  final double end;
  final DateTime startedAt;
  final DriverStop? targetStop;
}

/// A trip of the shift as listed on the home screen.
class ShiftTrip {
  const ShiftTrip(this.id, this.dep, this.route, this.plate, this.booked, this.status, [this.departureTime]);
  final String id;
  final String dep;
  final String route;
  final String plate;
  final int booked;
  final String status;
  final DateTime? departureTime;

  String dayLabel([DateTime? vnNow]) {
    if (departureTime == null) return '';
    final ref = vnNow ?? DateTime.now().toUtc().add(const Duration(hours: 7));
    if (departureTime!.year == ref.year && departureTime!.month == ref.month && departureTime!.day == ref.day) {
      return 'Hôm nay';
    }
    final tomorrow = DateTime.utc(ref.year, ref.month, ref.day).add(const Duration(days: 1));
    if (departureTime!.year == tomorrow.year && departureTime!.month == tomorrow.month && departureTime!.day == tomorrow.day) {
      return 'Ngày mai';
    }
    return '${departureTime!.day.toString().padLeft(2, '0')}/${departureTime!.month.toString().padLeft(2, '0')}';
  }
}

/// DRI-021: A trip in the driver's monthly schedule.
class ScheduleTrip {
  const ScheduleTrip({
    required this.tripId,
    required this.departureTime,
    required this.departure,
    this.routeName,
    this.vehiclePlate,
    required this.status,
    required this.source,
    this.passengers,
    this.delayMinutes = 0,
    this.cashHandedInVnd,
  });

  final String tripId;
  final String departureTime;
  final String departure;
  final String? routeName;
  final String? vehiclePlate;
  final String status;
  final String source;
  final int? passengers;
  final int delayMinutes;
  final int? cashHandedInVnd;

  factory ScheduleTrip.fromJson(Map<String, dynamic> j) {
    return ScheduleTrip(
      tripId: j['trip_id']?.toString() ?? '',
      departureTime: j['departure_time']?.toString() ?? '',
      departure: j['departure']?.toString() ?? '',
      routeName: j['route_name']?.toString(),
      vehiclePlate: j['vehicle_plate']?.toString(),
      status: j['status']?.toString() ?? 'SCHEDULED',
      source: j['source']?.toString() ?? 'ASSIGNED',
      passengers: (j['passengers'] as num?)?.toInt(),
      delayMinutes: (j['delay_minutes'] as num?)?.toInt() ?? 0,
      cashHandedInVnd: (j['cash_handed_in_vnd'] as num?)?.toInt(),
    );
  }
}

/// DRI-021: One day in the monthly schedule containing its scheduled trips.
class ScheduleDay {
  const ScheduleDay({
    required this.date,
    required this.trips,
  });

  final String date;
  final List<ScheduleTrip> trips;

  factory ScheduleDay.fromJson(Map<String, dynamic> j) {
    return ScheduleDay(
      date: j['date']?.toString() ?? '',
      trips: (j['trips'] as List? ?? const [])
          .cast<Map<String, dynamic>>()
          .map(ScheduleTrip.fromJson)
          .toList(),
    );
  }
}

/// DRI-021: Summary counts for the monthly schedule.
class ScheduleSummary {
  const ScheduleSummary({
    this.total = 0,
    this.completed = 0,
    this.upcoming = 0,
    this.cancelled = 0,
  });

  final int total;
  final int completed;
  final int upcoming;
  final int cancelled;

  factory ScheduleSummary.fromJson(Map<String, dynamic>? j) {
    if (j == null) return const ScheduleSummary();
    return ScheduleSummary(
      total: (j['total'] as num?)?.toInt() ?? 0,
      completed: (j['completed'] as num?)?.toInt() ?? 0,
      upcoming: (j['upcoming'] as num?)?.toInt() ?? 0,
      cancelled: (j['cancelled'] as num?)?.toInt() ?? 0,
    );
  }
}

/// DRI-021: Monthly schedule payload returned by the server.
class ScheduleMonthData {
  ScheduleMonthData({
    required this.month,
    required this.today,
    required this.days,
    required this.summary,
  }) : tripsByDate = {for (final d in days) d.date: d.trips};

  final String month;
  final String today;
  final List<ScheduleDay> days;
  final ScheduleSummary summary;
  final Map<String, List<ScheduleTrip>> tripsByDate;

  factory ScheduleMonthData.fromJson(Map<String, dynamic> j) {
    return ScheduleMonthData(
      month: j['month']?.toString() ?? '',
      today: j['today']?.toString() ?? '',
      days: (j['days'] as List? ?? const [])
          .cast<Map<String, dynamic>>()
          .map(ScheduleDay.fromJson)
          .toList(),
      summary: ScheduleSummary.fromJson(j['summary'] as Map<String, dynamic>?),
    );
  }
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

/// Remaining travel minutes: along the road if both points are within 2000 m, else straight-line x1.3.
int? minutesToStop({
  required double busLat,
  required double busLng,
  double? stopLat,
  double? stopLng,
  RoutePath? road,
  required num speedKmh,
}) {
  if (stopLat == null || stopLng == null) return null;
  final double distance;
  if (road != null && road.distanceTo(busLat, busLng) <= 2000 && road.distanceTo(stopLat, stopLng) <= 2000) {
    distance = (road.project(stopLat, stopLng) - road.project(busLat, busLng)).abs();
  } else {
    distance = RoutePath.haversine(busLat, busLng, stopLat, stopLng) * 1.3;
  }
  final effectiveSpeed = math.max(speedKmh, 30);
  final rawMinutes = (distance / 1000.0) / effectiveSpeed * 60;
  return rawMinutes.ceil().clamp(1, 999);
}

const _networkError = 'Không kết nối được máy chủ. Thao tác chưa được gửi, thử lại khi có mạng.';

/// SH-006: one titled text of the about screen (terms of use, or the model and data notice).
class LegalDoc {
  const LegalDoc(this.title, this.sections);
  final String title;
  final List<LegalSection> sections;

  factory LegalDoc.fromJson(Map<String, dynamic> j) => LegalDoc('${j['title'] ?? ''}', [
        for (final s in (j['sections'] as List? ?? const []))
          if (s is Map<String, dynamic>) LegalSection.fromJson(s),
      ]);
}

class LegalSection {
  const LegalSection(this.heading, this.body, [this.links = const []]);
  final String heading;
  final String body;
  final List<({String label, String url})> links;

  factory LegalSection.fromJson(Map<String, dynamic> j) => LegalSection('${j['heading'] ?? ''}', '${j['body'] ?? ''}', [
        for (final l in (j['links'] as List? ?? const []))
          if (l is Map<String, dynamic>) (label: '${l['label'] ?? ''}', url: '${l['url'] ?? ''}'),
      ]);
}

class LegalUrls {
  const LegalUrls({this.terms, this.privacy, this.accountDeletion});
  final String? terms;
  final String? privacy;
  final String? accountDeletion;

  factory LegalUrls.fromJson(Map<String, dynamic> j) => LegalUrls(
        terms: j['terms'] as String?,
        privacy: j['privacy'] as String?,
        accountDeletion: j['account_deletion'] as String?,
      );
}

class LegalInfo {
  const LegalInfo({
    required this.version,
    required this.effectiveDate,
    required this.terms,
    required this.privacy,
    required this.modelNotice,
    this.urls = const LegalUrls(),
  });
  final String version;
  final String effectiveDate;
  final LegalDoc terms;
  final LegalDoc privacy;
  final LegalDoc modelNotice;
  final LegalUrls urls;

  factory LegalInfo.fromJson(Map<String, dynamic> j) => LegalInfo(
        version: '${j['version'] ?? ''}',
        effectiveDate: '${j['effective_date'] ?? ''}',
        terms: LegalDoc.fromJson(j['terms'] as Map<String, dynamic>? ?? const {}),
        privacy: LegalDoc.fromJson(j['privacy'] as Map<String, dynamic>? ?? const {}),
        modelNotice: LegalDoc.fromJson(j['model_notice'] as Map<String, dynamic>? ?? const {}),
        urls: LegalUrls.fromJson(j['urls'] as Map<String, dynamic>? ?? const {}),
      );
}

class DriverStore extends ChangeNotifier {
  DriverStore({DriverApiClientService? api, DateTime Function()? clock})
      : api = api ?? DriverApiClientService(),
        _now = clock ?? DateTime.now {
    unawaited(_loadInitialQueue());
  }

  final DriverApiClientService api;
  final DateTime Function() _now;

  static const debtLimit = 1000000;
  static const noShowGrace = 10;
  static const minutesBetweenStops = 45;

  /// Simulated drive duration between two stops (demo speed-up; a real GPS replaces it).
  static const driveSeconds = 30;
  static const checkKeys = [
    'tires_checked',
    'brakes_fluid_checked',
    'ac_cleanliness_checked',
    'first_aid_extinguisher_checked',
    'fuel_level_sufficient',
    'gps_telemetry_beacon_active'
  ];
  static const checks = [
    'Lốp và áp suất lốp',
    'Phanh và dầu phanh',
    'Điều hòa, vệ sinh khoang',
    'Bình chữa cháy, túi cứu thương',
    'Nhiên liệu đủ cho chuyến',
    'Định vị GPS đang hoạt động'
  ];

  // Session and shift
  String operatorCode = '';
  String operatorName = '';
  String operatorHotline = '';
  /// Change may go to the passenger's BusGo wallet only when the company turned the wallet on (H-03).
  bool walletEnabled = false;
  String driverName = '';
  String staffId = '';
  bool mustChangePin = false;
  String? temporaryPin;

  static Future<String> savedOperatorCode() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString('driver_operator_code') ?? '';
  }

  bool get loggedIn => api.authToken != null;

  static const _sessionKey = 'driver_session';

  static String queueKeyFor(String staffId) => 'driver_queue_${staffId.isEmpty ? 'default' : staffId}';
  String get _queueKey => queueKeyFor(staffId);

  static List<QueuedAction> _decodeQueue(String raw) {
    try {
      final list = jsonDecode(raw) as List;
      return [
        for (final item in list)
          if (item is Map) QueuedAction.fromJson(Map<String, dynamic>.from(item)),
      ];
    } catch (_) {
      return const [];
    }
  }

  Future<void> _saveQueue() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_queueKey, jsonEncode([for (final q in queue) q.toJson()]));
  }

  Future<void> _loadInitialQueue() async {
    final prefs = await SharedPreferences.getInstance();
    var targetStaff = staffId;
    if (targetStaff.isEmpty) {
      final rawSession = prefs.getString(_sessionKey);
      if (rawSession != null) {
        try {
          final s = jsonDecode(rawSession) as Map<String, dynamic>;
          targetStaff = '${s['staff_id'] ?? ''}';
        } catch (_) {}
      }
    }
    if (targetStaff.isEmpty) return;
    final raw = prefs.getString(queueKeyFor(targetStaff));
    if (raw == null) return;
    final loaded = _decodeQueue(raw);
    if (loaded.isEmpty) return;
    final existingKeys = {for (final q in queue) q.idempotencyKey};
    queue.insertAll(0, [for (final q in loaded) if (!existingKeys.contains(q.idempotencyKey)) q]);
    notifyListeners();
  }

  Future<void> _loadQueueForDriver() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_queueKey);
    queue
      ..clear()
      ..addAll(raw == null ? const [] : _decodeQueue(raw));
    _syncRetryTimer();
    notifyListeners();
  }

  /// Keeps the signed-in session on the device so reopening the app skips the login screen.
  Future<void> _saveSession() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_sessionKey, jsonEncode({
      'token': api.authToken,
      'operator_code': operatorCode,
      'operator_name': operatorName,
      'operator_hotline': operatorHotline,
      'wallet_enabled': walletEnabled,
      'driver_name': driverName,
      'staff_id': staffId,
    }));
  }

  /// Restores the saved session while its token has not expired; true when the driver is signed in again.
  Future<bool> restoreSession() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_sessionKey);
    if (raw == null) return false;
    try {
      final s = jsonDecode(raw) as Map<String, dynamic>;
      final token = s['token'];
      if (token is! String || !tokenStillValid(token)) {
        await prefs.remove(_sessionKey);
        return false;
      }
      api.authToken = token;
      operatorCode = s['operator_code'] ?? '';
      api.operatorCode = operatorCode.isEmpty ? null : operatorCode;
      operatorName = s['operator_name'] ?? '';
      operatorHotline = s['operator_hotline'] ?? '';
      walletEnabled = s['wallet_enabled'] == true;
      driverName = s['driver_name'] ?? '';
      staffId = s['staff_id'] ?? '';
    } catch (_) {
      await prefs.remove(_sessionKey);
      return false;
    }
    await _loadQueueForDriver();
    notifyListeners();
    unawaited(loadShift(autoFlush: false));
    return true;
  }

  /// The server's token is `<prefix><base64url(json)>.<signature>` with `exp` in milliseconds.
  static bool tokenStillValid(String token, {DateTime? now}) {
    try {
      final body = token.split('_jwt_').last.split('.').first;
      final payload = jsonDecode(utf8.decode(base64Url.decode(base64Url.normalize(body)))) as Map<String, dynamic>;
      final exp = payload['exp'];
      return exp is num && exp > (now ?? DateTime.now()).millisecondsSinceEpoch;
    } catch (_) {
      return false;
    }
  }
  List<ShiftTrip> shift = [];
  bool loading = false;
  String? loadError;

  // DRI-021: monthly schedule state
  ScheduleMonthData? scheduleData;
  bool scheduleLoading = false;
  String? scheduleError;
  String? scheduleReferenceMonth;

  // Current trip, as the server last returned it
  String? tripId;
  String route = '';
  String plate = '';
  String depTime = '--:--';
  int delayMinutes = 0;
  String? estimatedDepTime;

  String get depTimeLabel {
    if (delayMinutes > 0 && depTime != '--:--') {
      final est = estimatedDepTime ?? hhmm(toMinutes(depTime) + delayMinutes);
      return '$depTime → $est (trễ $delayMinutes phút)';
    }
    return depTime;
  }
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

  /// The trip runs today: the cab clock is the real time. Otherwise (a demo trip on another day) the clock
  /// is simulated, one minute every 3 seconds, and moved to each stop's planned time.
  bool realClock = false;

  /// D143: the driver set off to collect the home pickups; the bus position goes to the server from then on.
  bool homeRunStarted = false;

  /// D144: the home pickups in the order the bus collects them, with times and answers.
  List<HomeRunStop> homeRun = [];
  int homeWaitMinutes = 5;

  /// Whether the home run still fits the departure (server outlook): back at the first stop at [homeBackAt],
  /// [homeLateMinutes] late, and how many passengers were given a time past their window.
  DateTime? homeBackAt;
  int homeLateMinutes = 0;
  int homePastWindow = 0;
  int _homeSpeed = 0;

  /// Simulated clock only: when this session saw each passenger board, on the cab clock.
  final Map<String, int> _boardedOnClock = {};
  bool atStop = false;
  bool moving = false;
  final Map<int, int> arrivedAt = {};
  final List<QueuedAction> queue = [];
  final List<({String label, String error, int at})> syncErrors = [];
  bool offline = false;
  bool _flushing = false;
  Future<int>? _flushFuture;
  Timer? _retryTimer;
  ({String type, int delay, int at})? incident;
  String? earlyEndReason;
  RoutePath? _road;
  _DriveLeg? _leg;
  DateTime? _lastPing;
  double _lat = 20.9806, _lng = 105.8413;
  double _bearing = 200;

  Timer? _clockTimer;
  Timer? _driveTimer;
  Timer? _telemetryTimer;
  int _seq = 0;

  DriverStop get stop => stops.isEmpty ? const DriverStop('', '', '--:--') : stops[stopIndex];
  bool get lastStop => stops.isNotEmpty && stopIndex == stops.length - 1;
  int get speed => deviceGps && _gpsSpeedKmh != null ? _gpsSpeedKmh!.round() : (moving ? 62 : _homeSpeed);

  /// D145: the bus position comes from the phone's GPS (production builds: --dart-define=FLEETBUS_DEVICE_GPS=true).
  /// Without it the app drives the bus along the route on its own, for demos and tests.
  static const deviceGps = bool.fromEnvironment('FLEETBUS_DEVICE_GPS');
  StreamSubscription<Position>? _gps;
  double? _gpsSpeedKmh;
  double? _gpsAccuracy;

  /// Starts reading the GPS, with the Android foreground notification that keeps it alive with the screen off.
  void _startGps() {
    if (!deviceGps || _gps != null) return;
    final LocationSettings settings = defaultTargetPlatform == TargetPlatform.iOS
        ? AppleSettings(
            accuracy: LocationAccuracy.bestForNavigation,
            distanceFilter: 10,
            allowBackgroundLocationUpdates: true,
            showBackgroundLocationIndicator: true,
            pauseLocationUpdatesAutomatically: false)
        : AndroidSettings(
            accuracy: LocationAccuracy.high,
            distanceFilter: 10,
            intervalDuration: const Duration(seconds: 5),
            foregroundNotificationConfig: ForegroundNotificationConfig(
              notificationTitle: 'BusGo Driver đang gửi vị trí xe',
              notificationText: 'Khách và điều hành đang theo dõi chuyến $depTimeLabel',
              enableWakeLock: true,
              setOngoing: true,
            ),
          );
    _gps = Geolocator.getPositionStream(locationSettings: settings).listen((p) {
      _lat = p.latitude;
      _lng = p.longitude;
      if (p.heading >= 0) _bearing = p.heading;
      _gpsSpeedKmh = p.speed < 0 ? 0 : p.speed * 3.6;
      _gpsAccuracy = p.accuracy;
      notifyListeners();
    }, onError: (_) {});
  }

  void _stopGps() {
    _gps?.cancel();
    _gps = null;
  }

  double get lat => _lat;
  double get lng => _lng;
  double get bearing => _bearing;
  RoutePath? get road => _road;

  /// Estimated minutes to the next stop, or null if the stop has no coordinates.
  int? get minutesToNextStop => minutesToStop(
        busLat: _lat,
        busLng: _lng,
        stopLat: stop.lat,
        stopLng: stop.lng,
        road: _road,
        speedKmh: speed,
      );

  List<Passenger> get atStopPassengers => manifest.where((p) => p.from == stop.id && !p.hail).toList();

  /// Passengers on board who get off at the current stop, so the crew can open the hold for them.
  List<Passenger> get dropOffPassengers => manifest.where((p) => p.to == stop.id && p.status == PaxStatus.boarded).toList();
  int get boardedCount => manifest.where((p) => p.status == PaxStatus.boarded).length;
  int get hailCount => manifest.where((p) => p.hail).length;
  int get debtIssued => debts.fold(0, (a, d) => a + d.amount);
  bool get readyToStart => checked.every((c) => c);
  String get firstStopName => stops.isEmpty ? '' : stops.first.name;
  int get pickupStopCount => stops.where((s) => manifest.any((p) => p.from == s.id)).length;
  // A departure the office cancelled (D131) is no longer work: neither the current nor the next trip.
  ShiftTrip? get nextTrip => shift.where((t) => t.id != tripId && t.status != 'COMPLETED' && t.status != 'CANCELLED').firstOrNull;
  DriverStop stopById(String id) => stops.firstWhere((s) => s.id == id, orElse: () => DriverStop(id, id, '--:--'));

  String? _error(Map<String, dynamic> json) => json['status'] == 'success' ? null : '${json['message'] ?? json['error'] ?? 'Có lỗi, thử lại sau.'}';

  static const _sessionEndCodes = {'TOKEN_REVOKED', 'TOKEN_EXPIRED', 'INVALID_TOKEN'};

  /// Why the session was ended by the server; the app shows it once on the login screen.
  String? sessionEnded;

  /// Runs one call; on a network failure the action is listed as waiting for the network.
  Future<({Map<String, dynamic>? data, String? error, String? code})> _call(
    Future<Map<String, dynamic>> Function() request, {
    String? label,
    String method = 'POST',
    String? path,
    Map<String, dynamic>? body,
    String? idempotencyKey,
    bool autoFlush = true,
  }) async {
    try {
      final json = await request();
      final error = _error(json);
      final code = json['code']?.toString();
      if (code == 'PIN_CHANGE_REQUIRED') {
        mustChangePin = true;
        notifyListeners();
      }
      // The office locked the account, the PIN changed elsewhere, or the session expired: back to the login.
      if (_sessionEndCodes.contains(code) && api.authToken != null) {
        sessionEnded = error;
        logout();
        return (data: null, error: error, code: code);
      }
      if (offline && error == null) {
        offline = false;
        _syncRetryTimer();
      }
      if (autoFlush && queue.isNotEmpty && !_flushing) {
        unawaited(flushQueue());
      }
      final data = json['data'] is Map<String, dynamic>
          ? json['data'] as Map<String, dynamic>
          // The COD refusal carries the ticket to charge at the top level of the body.
          : (code == 'COD_PAYMENT_REQUIRED' ? json : null);
      return (data: data, error: error, code: code);
    } catch (_) {
      offline = true;
      if (label != null) {
        queue.add(QueuedAction(
          label,
          clock,
          method: method,
          path: path ?? '',
          body: body,
          idempotencyKey: idempotencyKey,
        ));
        await _saveQueue();
        _syncRetryTimer();
      }
      notifyListeners();
      return (data: null, error: _networkError, code: 'NETWORK');
    }
  }

  // ---------- Session (DRI-001, DRI-002) ----------
  Future<String?> login(String opCode, String staff, String pin) async {
    if (opCode.trim().isEmpty) return 'Nhập mã nhà xe.';
    if (staff.trim().isEmpty) return 'Nhập mã nhân viên hoặc số điện thoại.';
    if (!RegExp(r'^\d{6}$').hasMatch(pin)) return 'Mã PIN gồm đúng 6 chữ số.';
    try {
      api.operatorCode = opCode.trim().toUpperCase();
      final json = await api.login(staff.trim(), pin);
      final error = _error(json);
      if (error != null) return error;

      final d = json['data']['driver'] as Map<String, dynamic>;
      final op = json['data']['operator'] as Map<String, dynamic>?;

      driverName = d['full_name'] ?? '';
      staffId = d['staff_id'] ?? staff.trim();
      mustChangePin = d['must_change_pin'] == true;
      temporaryPin = pin.trim();

      if (op != null) {
        operatorCode = op['code'] ?? api.operatorCode ?? '';
        operatorName = op['name'] ?? '';
        operatorHotline = op['hotline'] ?? '';
        walletEnabled = op['wallet_enabled'] == true;

        final prefs = await SharedPreferences.getInstance();
        await prefs.setString('driver_operator_code', operatorCode);
      }
    } catch (_) {
      return 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.';
    }
    if (!mustChangePin) {
      await _saveSession();
      await loadShift(autoFlush: false);
    }
    await _loadQueueForDriver();
    return null;
  }

  /// DRI-001: Change driver PIN
  Future<String?> changePin(String currentPin, String newPin) async {
    final r = await _call(() => api.changePin(currentPin: currentPin, newPin: newPin));
    if (r.error != null) return r.error;
    // A PIN change ends every session (H-06); this phone goes on with the token it gets back.
    final token = r.data?['token'];
    if (token is String && token.isNotEmpty) api.authToken = token;
    mustChangePin = false;
    temporaryPin = null;
    await _saveSession();
    notifyListeners();
    return null;
  }

  void logout() {
    api.authToken = null;
    unawaited(SharedPreferences.getInstance().then((prefs) => prefs.remove(_sessionKey)));
    _stopTimers();
    _retryTimer?.cancel();
    _retryTimer = null;
    tripId = null;
    shift = [];
    manifest = [];
    _road = null;
    mustChangePin = false;
    temporaryPin = null;
    endedCash = null;
    earlyEndReason = null;
    scheduleData = null;
    scheduleLoading = false;
    scheduleError = null;
    scheduleReferenceMonth = null;
    notifyListeners();
  }

  /// DRI-003: the trips of today; the current one is the earliest that is not completed.
  Future<void> loadShift({bool autoFlush = true}) async {
    loading = true;
    loadError = null;
    notifyListeners();
    final r = await _call(api.getTodayTrips, autoFlush: autoFlush);
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
        ShiftTrip(
          t['trip_id'],
          _depLabelOf(t),
          routeLabel(t['route_name'] ?? ''),
          t['vehicle_plate'] ?? '',
          (t['manifest'] as List? ?? []).length,
          t['status'] ?? '',
          DateTime.tryParse('${t['planned_departure_time']}')?.toUtc().add(const Duration(hours: 7)),
        ),
    ];
    final live = trips.where((t) => t['status'] != 'CANCELLED').toList();
    final now = _vnNow();
    final selected = tripId == null ? null : live.where((t) => t['trip_id'] == tripId).firstOrNull;
    final notStale = live.where((t) {
      if (t['status'] == 'COMPLETED') return false;
      final depAt = DateTime.tryParse('${t['planned_departure_time']}')?.toUtc().add(const Duration(hours: 7));
      if (depAt == null) return false;
      return !depAt.isBefore(now.subtract(const Duration(hours: 12)));
    }).firstOrNull;
    final current = selected ?? notStale ?? live.where((t) => t['status'] != 'COMPLETED').firstOrNull ?? live.lastOrNull;
    if (current != null) _apply(current, fresh: tripId != current['trip_id']);
    notifyListeners();
  }

  LegalInfo? legalInfo;

  /// DRI-021: loads the driver's monthly trip schedule from the server.
  /// SH-006: the terms and notices come from the server so they change without an app release (D157).
  Future<({LegalInfo? info, String? error})> loadLegal() async {
    final r = await _call(api.getLegal);
    if (r.error != null || r.data == null) return (info: null, error: r.error ?? 'Không tải được, thử lại sau');
    final info = LegalInfo.fromJson(r.data!);
    legalInfo = info;
    return (info: info, error: null);
  }

  Future<void> loadMonthlySchedule([String month = '']) async {
    scheduleLoading = true;
    scheduleError = null;
    notifyListeners();
    final r = await _call(() => api.getMonthlySchedule(month));
    scheduleLoading = false;
    if (r.error != null) {
      scheduleError = r.error;
      notifyListeners();
      return;
    }
    if (r.data != null && r.data!['month'] != null && r.data!['month'].toString().isNotEmpty) {
      scheduleData = ScheduleMonthData.fromJson(r.data!);
      if (scheduleData!.today.length >= 7) {
        scheduleReferenceMonth = scheduleData!.today.substring(0, 7);
      }
      scheduleError = null;
    }
    notifyListeners();
  }

  /// Planned time at each stop as the company set it (the passenger sees the same), kept across replies
  /// that do not carry it.
  final Map<String, String> _plannedTimes = {};

  DateTime vnNow() => _now().toUtc().add(const Duration(hours: 7));
  DateTime _vnNow() => vnNow();
  String dayLabelOf(ShiftTrip t) => t.dayLabel(vnNow());
  int _realMinutes() {
    final now = _vnNow();
    return now.hour * 60 + now.minute;
  }

  /// When the passenger boarded, on the clock the cab shows; null when unknown.
  int? boardedTime(Passenger p) => realClock ? p.boardedAt : _boardedOnClock[p.ticketId];

  String _depOf(Map<String, dynamic> t) {
    final dep = DateTime.tryParse('${t['planned_departure_time']}')?.toUtc().add(const Duration(hours: 7));
    return dep == null ? '--:--' : hhmm(dep.hour * 60 + dep.minute);
  }

  static String? _estimatedDepOf(dynamic estimatedIso, String depTime, int delay) {
    if (estimatedIso != null) {
      final estDt = DateTime.tryParse('$estimatedIso')?.toUtc().add(const Duration(hours: 7));
      if (estDt != null) return hhmm(estDt.hour * 60 + estDt.minute);
    }
    if (delay > 0 && depTime != '--:--') {
      return hhmm(toMinutes(depTime) + delay);
    }
    return null;
  }

  String _depLabelOf(Map<String, dynamic> t) {
    final dep = _depOf(t);
    final delay = (t['delay_minutes'] as num?)?.toInt() ?? 0;
    final est = _estimatedDepOf(t['estimated_departure_time'], dep, delay);
    if (delay > 0 && dep != '--:--' && est != null) {
      return '$dep → $est (trễ $delay phút)';
    }
    return dep;
  }

  void _apply(Map<String, dynamic> t, {bool fresh = false}) {
    tripId = t['trip_id'];
    route = routeLabel(t['route_name'] ?? '');
    plate = t['vehicle_plate'] ?? '';
    depTime = _depOf(t);
    delayMinutes = (t['delay_minutes'] as num?)?.toInt() ?? 0;
    estimatedDepTime = _estimatedDepOf(t['estimated_departure_time'], depTime, delayMinutes);
    final depAt = DateTime.tryParse('${t['planned_departure_time']}')?.toUtc().add(const Duration(hours: 7));
    final today = _vnNow();
    realClock = depAt != null && depAt.year == today.year && depAt.month == today.month && depAt.day == today.day;
    fare = (t['base_fare_vnd'] as num?)?.toInt() ?? fare;
    final dep = toMinutes(depTime == '--:--' ? '07:00' : depTime);
    final raw = (t['stops'] as List? ?? []).cast<Map<String, dynamic>>()..sort((a, b) => (a['order'] as num).compareTo(b['order'] as num));
    if (fresh) _plannedTimes.clear();
    for (final s in raw) {
      final at = DateTime.tryParse('${s['planned_time']}')?.toUtc().add(const Duration(hours: 7));
      if (at != null) _plannedTimes['${s['stop_id']}'] = hhmm(at.hour * 60 + at.minute);
    }
    stops = [
      for (var i = 0; i < raw.length; i++)
        DriverStop(
          raw[i]['stop_id'],
          raw[i]['name'],
          _plannedTimes['${raw[i]['stop_id']}'] ?? hhmm(dep + i * minutesBetweenStops),
          arrived: raw[i]['status'] == 'ARRIVED',
          lat: (raw[i]['lat'] as num?)?.toDouble(),
          lng: (raw[i]['lng'] as num?)?.toDouble(),
        ),
    ];
    final rawShape = t['route_shape'];
    if (rawShape is List && rawShape.length >= 2) {
      try {
        _road = RoutePath(rawShape);
      } catch (_) {
        _road = null;
      }
    } else {
      _road = null;
    }
    if (fresh) _boardedOnClock.clear();
    final waiting = {
      for (final p in manifest)
        if (p.status == PaxStatus.waiting) p.ticketId
    };
    manifest = (t['manifest'] as List? ?? []).cast<Map<String, dynamic>>().map(Passenger.fromJson).toList();
    for (final p in manifest) {
      if (p.status == PaxStatus.boarded && waiting.contains(p.ticketId)) _boardedOnClock.putIfAbsent(p.ticketId, () => clock);
    }
    stopIndex = ((t['current_stop_index'] as num?)?.toInt() ?? 0).clamp(0, stops.isEmpty ? 0 : stops.length - 1);
    codCash = (t['total_cod_collected_vnd'] as num?)?.toInt() ?? 0;
    hailCash = (t['total_hail_collected_vnd'] as num?)?.toInt() ?? 0;
    debts = [
      for (final d in (t['debts'] as List? ?? []).cast<Map<String, dynamic>>()) (code: '${d['receipt_code']}', amount: (d['amount_vnd'] as num).toInt())
    ];
    homeRunStarted = t['home_run_started_at'] != null;
    final run = t['home_run'] as Map<String, dynamic>?;
    homeRun = [for (final s in (run?['stops'] as List? ?? []).cast<Map<String, dynamic>>()) HomeRunStop.fromJson(s)];
    homeWaitMinutes = (run?['wait_minutes'] as num?)?.toInt() ?? 5;
    final outlook = run?['outlook'] as Map<String, dynamic>?;
    homeBackAt = DateTime.tryParse('${outlook?['back_at'] ?? ''}');
    homeLateMinutes = (outlook?['late_departure_minutes'] as num?)?.toInt() ?? 0;
    homePastWindow = (outlook?['past_window'] as List?)?.length ?? 0;
    trip = switch (t['status']) { 'IN_TRANSIT' => TripState.inTransit, 'COMPLETED' => TripState.completed, _ => TripState.readyCheck };
    if (trip == TripState.completed) {
      endedCash = (t['total_cash_to_handover_vnd'] as num?)?.toInt() ?? codCash + hailCash;
    } else {
      endedCash = null;
    }
    if (t['current_lat'] is num) _lat = (t['current_lat'] as num).toDouble();
    if (t['current_lng'] is num) _lng = (t['current_lng'] as num).toDouble();
    if (fresh) {
      earlyEndReason = null;
      final list = t['readiness_checklist'] as Map<String, dynamic>? ?? {};
      for (var i = 0; i < checkKeys.length; i++) {
        checked[i] = trip != TripState.readyCheck || list[checkKeys[i]] == true && t['status'] == 'READY';
      }
      clock = realClock ? _realMinutes() : dep - 20;
      if (trip == TripState.inTransit) {
        atStop = stops.isNotEmpty && stops[stopIndex].arrived;
        _startTimers();
      } else if (homeRunStarted && trip != TripState.completed) {
        _telemetryTimer ??= Timer.periodic(const Duration(seconds: 5), (_) => sendTelemetry());
        _startGps();
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

  /// Switches to another trip in the shift. Refused while the current trip is in transit.
  Future<String?> selectTrip(String tripId) async {
    if (trip == TripState.inTransit) {
      return 'Xe đang chạy, không thể đổi chuyến.';
    }
    final r = await _call(() => api.getTrip(tripId));
    if (r.error != null) return r.error;
    if (r.data != null) {
      if (this.tripId != tripId) _stopTimers();
      _apply(r.data!, fresh: this.tripId != tripId);
      notifyListeners();
    }
    return null;
  }

  /// Runs an action on the trip, then reads the trip again from the server.
  Future<String?> _act(
    String label,
    String path, {
    Map<String, dynamic>? body,
    Future<Map<String, dynamic>> Function(String key)? request,
  }) async {
    final key = newDriverIdempotencyKey();
    final r = await _call(
      () => request != null ? request(key) : api.replay('POST', path, body, key),
      label: label,
      path: path,
      body: body,
      idempotencyKey: key,
    );
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
    earlyEndReason = null;
    final checklist = {for (var i = 0; i < checkKeys.length; i++) checkKeys[i]: checked[i]};
    final ready = await _call(() => api.submitReadinessCheck(tripId!, checklist));
    if (ready.error != null) return ready.error;
    final r = await _call(() => api.startTrip(tripId!));
    if (r.error != null) return r.error;
    if (!realClock) clock = clock < toMinutes(depTime) - 2 ? toMinutes(depTime) - 2 : clock;
    // The home run ends at the first stop, where the trip starts.
    _homeSpeed = 0;
    if (stops.isNotEmpty && stops.first.lat != null && stops.first.lng != null) {
      _lat = stops.first.lat!;
      _lng = stops.first.lng!;
    }
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

  /// Home pickups still to collect before departure: confirmed, reachable, not on board yet.
  List<Passenger> get homePickupsWaiting {
    final waiting = manifest.where((p) => p.homePickup != null && !p.inaccessible && !p.homeMissed && p.status == PaxStatus.waiting).toList();
    // In the run's order (D144); an address the server has not placed yet goes last.
    waiting.sort((a, b) => _homeRank(a).compareTo(_homeRank(b)));
    return waiting;
  }

  /// Every home pickup of the trip in the run's order (on board, missed and unreachable ones included).
  List<Passenger> get homePickupsInOrder {
    final all = manifest.where((p) => p.homePickup != null).toList();
    all.sort((a, b) => _homeRank(a).compareTo(_homeRank(b)));
    return all;
  }

  int _homeRank(Passenger p) {
    final i = homeRun.indexWhere((s) => s.ticketId == p.ticketId);
    return i < 0 ? 999 : i;
  }

  HomeRunStop? homeStopOf(Passenger p) => homeRun.where((s) => s.ticketId == p.ticketId).firstOrNull;

  /// D144: moves a home pickup earlier (-1) or later (+1) in the run.
  Future<String?> moveHome(Passenger p, int delta) async {
    final order = homePickupsInOrder.map((x) => x.ticketId).toList();
    final i = order.indexOf(p.ticketId);
    final j = i + delta;
    if (i < 0 || j < 0 || j >= order.length) return null;
    order.insert(j, order.removeAt(i));
    final r = await _call(() => api.setHomeOrder(tripId!, order));
    if (r.error != null) return r.error;
    await refreshTrip();
    return null;
  }

  /// D144: the bus is at the passenger's door; the wait starts and the passenger is told.
  Future<String?> homeArrived(Passenger p) => _act(
        'Tới nhà khách ghế ${p.seat}',
        '/api/v1/driver/trips/$tripId/tickets/${p.ticketId}/home-arrived',
        request: (key) => api.homeArrived(tripId!, p.ticketId, idempotencyKey: key),
      );

  /// D144: the passenger did not come out in time; the bus goes on, the passenger is sent to the first stop.
  Future<String?> homeMissed(Passenger p) => _act(
        'Khách ghế ${p.seat} không ra',
        '/api/v1/driver/trips/$tripId/tickets/${p.ticketId}/home-missed',
        request: (key) => api.homeMissed(tripId!, p.ticketId, idempotencyKey: key),
      );

  /// D144: the passenger's number, for a call while the bus is stopped. The server logs every request.
  Future<({String? phone, String? error})> contactOf(Passenger p) async {
    final r = await _call(() => api.passengerContact(tripId!, p.ticketId));
    if (r.error != null) return (phone: null, error: r.error);
    return (phone: '${r.data!['phone']}', error: null);
  }

  /// The window the home pickups were promised, earliest start to latest end ("05:45–06:30").
  String? get homeWindow {
    final windows = homePickupsWaiting.map((p) => p.pickupWindow).whereType<String>().toList()..sort();
    if (windows.isEmpty) return null;
    return '${windows.first.split('–').first}–${windows.last.split('–').last}';
  }

  /// D143: sets off to collect the home pickups. The app sends the bus position from now on, so each passenger
  /// waiting at home sees the bus coming and is told when it is close.
  Future<String?> startHomeRun() async {
    final r = await _call(() => api.startHomeRun(tripId!));
    if (r.error != null) return r.error;
    homeRunStarted = true;
    _telemetryTimer ??= Timer.periodic(const Duration(seconds: 5), (_) => sendTelemetry());
    _startGps();
    await refreshTrip();
    unawaited(sendTelemetry());
    notifyListeners();
    return null;
  }

  /// Until the GPS plugin is wired, the bus drives to the next home pickup on its own (250 m a ping).
  void _driveToNextHome() {
    final next = homePickupsWaiting.where((p) => p.homeLat != null && p.homeLng != null).firstOrNull;
    if (next == null) {
      _homeSpeed = 0;
      return;
    }
    final dLat = next.homeLat! - _lat;
    final dLng = next.homeLng! - _lng;
    final metres = math.sqrt(math.pow(dLat * 111000, 2) + math.pow(dLng * 104000, 2));
    if (metres < 60) {
      _homeSpeed = 0;
      return;
    }
    final step = math.min(1.0, 250 / metres);
    _lat += dLat * step;
    _lng += dLng * step;
    _bearing = (math.atan2(dLng * 104000, dLat * 111000) * 180 / math.pi + 360) % 360;
    _homeSpeed = 30;
  }

  void _startTimers() {
    _clockTimer ??= Timer.periodic(const Duration(seconds: 3), (_) {
      clock = realClock ? _realMinutes() : clock + 1;
      notifyListeners();
    });
    // FLOW-06: the position goes to the server while the trip runs.
    _telemetryTimer ??= Timer.periodic(const Duration(seconds: 5), (_) => sendTelemetry());
    _startGps();
  }

  Future<void> sendTelemetry() async {
    final beforeDeparture = trip != TripState.inTransit;
    if (tripId == null || trip == TripState.completed || (beforeDeparture && !homeRunStarted)) return;
    _lastPing = DateTime.now();
    if (!deviceGps && beforeDeparture) _driveToNextHome();
    if (!deviceGps && moving) {
      if (_leg != null) {
        final elapsed = DateTime.now().difference(_leg!.startedAt).inMilliseconds / 1000.0;
        final fraction = (elapsed / driveSeconds).clamp(0.0, 1.0);
        final pos = _leg!.path.pointAt(_leg!.start + fraction * (_leg!.end - _leg!.start));
        _lat = pos.lat;
        _lng = pos.lng;
        _bearing = pos.bearing;
      } else {
        _lat -= 0.004;
        _lng -= 0.001;
      }
    }
    // The server ignores a ping older than the last one it applied (spec 6.4): the sequence is the device time in ms,
    // so it keeps growing across app restarts.
    final at = DateTime.now();
    _seq = at.millisecondsSinceEpoch > _seq ? at.millisecondsSinceEpoch : _seq + 1;
    final seq = _seq;
    await _call(() =>
        api.sendTelemetry(tripId!, lat: _lat, lng: _lng, speedKmh: speed.toDouble(), bearingDeg: _bearing, seq: seq, recordedAt: at, accuracyM: _gpsAccuracy));
  }

  // ---------- Stops (DRI-008) ----------
  Future<String?> arrive() async {
    if (atStop) return null;
    final stopId = stop.id;
    final error = await _act(
      'Đến ${stop.name}',
      '/api/v1/driver/trips/$tripId/stops/$stopId/arrive',
      request: (key) => api.arriveAtStop(tripId!, stopId, idempotencyKey: key),
    );
    if (error != null && !offline) return error;
    atStop = true;
    moving = false;
    if (!realClock) clock = clock < toMinutes(stop.time) - 2 ? toMinutes(stop.time) - 2 : clock;
    arrivedAt[stopIndex] = clock;
    notifyListeners();
    return null;
  }

  void leaveStop() {
    final current = stops.isNotEmpty ? stop : null;
    if (!realClock && current != null) clock = clock < toMinutes(current.time) + 1 ? toMinutes(current.time) + 1 : clock;
    atStop = false;
    moving = true;
    if (tripId != null && current != null) {
      unawaited(_act(
        'Rời ${current.name}',
        '/api/v1/driver/trips/$tripId/stops/${current.id}/depart',
        request: (key) => api.departStop(tripId!, current.id, idempotencyKey: key),
      ));
    }
    stopIndex = (stopIndex + 1).clamp(0, stops.length - 1);
    final nextStop = stops.isNotEmpty ? stops[stopIndex] : null;
    final now = DateTime.now();
    if (nextStop != null && nextStop.lat != null && nextStop.lng != null) {
      final toLat = nextStop.lat!;
      final toLng = nextStop.lng!;
      if (_road != null && _road!.distanceTo(_lat, _lng) <= 2000 && _road!.distanceTo(toLat, toLng) <= 2000) {
        _leg = _DriveLeg(
          path: _road!,
          start: _road!.project(_lat, _lng),
          end: _road!.project(toLat, toLng),
          startedAt: now,
          targetStop: nextStop,
        );
      } else {
        final straight = RoutePath.straight(_lat, _lng, toLat, toLng);
        _leg = _DriveLeg(
          path: straight,
          start: 0,
          end: straight.length,
          startedAt: now,
          targetStop: nextStop,
        );
      }
    } else {
      _leg = null;
    }
    _driveTimer?.cancel();
    _driveTimer = Timer(const Duration(seconds: driveSeconds), () {
      final target = stops.isNotEmpty ? stops[stopIndex] : null;
      if (target != null && target.lat != null && target.lng != null) {
        _lat = target.lat!;
        _lng = target.lng!;
      }
      moving = false;
      _leg = null;
      unawaited(sendTelemetry());
      notifyListeners();
    });
    if (_lastPing == null || now.difference(_lastPing!).inMilliseconds >= 1000) {
      unawaited(sendTelemetry());
    }
    notifyListeners();
  }

  /// BR-NOSHOW-004: 10 minutes at the passenger's own stop (first stop: from the planned departure).
  int noShowFrom() => (stopIndex == 0 ? toMinutes(depTime) : arrivedAt[stopIndex] ?? toMinutes(stop.time)) + noShowGrace;
  bool get noShowOpen => atStop && clock >= noShowFrom();

  // ---------- Boarding (DRI-009 to DRI-012) ----------
  /// The server refuses an unpaid COD ticket (409 COD_PAYMENT_REQUIRED, BR-COD-006).
  Future<String?> board(Passenger p) => _act(
        'Cho lên xe ghế ${p.seat}',
        '/api/v1/driver/trips/$tripId/boarding/manual',
        body: {'ticket_id': p.ticketId},
        request: (key) => api.boardManually(tripId!, ticketId: p.ticketId, idempotencyKey: key),
      );

  /// DRI-010: the backup PIN is checked by the server against the ticket's current QR version.
  Future<({String? error, String? code, Map<String, dynamic>? data})> boardWithPin(Passenger p, String pin) async {
    final payload = 'PIN:${p.ticketId}:$pin';
    final key = newDriverIdempotencyKey();
    final r = await _call(
      () => api.boardWithQr(tripId!, payload, idempotencyKey: key),
      label: 'PIN ghế ${p.seat}',
      path: '/api/v1/driver/trips/$tripId/boarding',
      body: {'qrPayload': payload},
      idempotencyKey: key,
    );
    if (r.error == null) await refreshTrip();
    return (error: r.error, code: r.code, data: r.data);
  }

  /// DRI-009: a scanned boarding QR (BUSGO|pnr|ticket|`v<n>`|hmac).
  Future<({String? error, String? code, Map<String, dynamic>? data})> boardWithQr(String payload) async {
    final key = newDriverIdempotencyKey();
    final r = await _call(
      () => api.boardWithQr(tripId!, payload, idempotencyKey: key),
      label: 'Quét vé',
      path: '/api/v1/driver/trips/$tripId/boarding',
      body: {'qrPayload': payload},
      idempotencyKey: key,
    );
    if (r.error == null) await refreshTrip();
    return (error: r.error, code: r.code, data: r.data);
  }

  /// Spec A9: the bus cannot reach this home pickup; the manifest reloads to show it.
  Future<String?> reportInaccessible(Passenger p, String reason, String meetingPoint) => _act(
        'Không vào được địa chỉ ghế ${p.seat}',
        '/api/v1/driver/trips/$tripId/tickets/${p.ticketId}/inaccessible',
        body: {'reason': reason, if (meetingPoint.isNotEmpty) 'meeting_point': meetingPoint},
        request: (key) => api.reportInaccessible(tripId!, p.ticketId, reason: reason, meetingPoint: meetingPoint, idempotencyKey: key),
      );

  Future<String?> markNoShow(Passenger p) => _act(
        'Vắng mặt ghế ${p.seat}',
        '/api/v1/driver/trips/$tripId/tickets/${p.ticketId}/no-show',
        body: {'passenger_requested_cancel': false},
        request: (key) => api.markNoShow(tripId!, p.ticketId, idempotencyKey: key),
      );

  static const changeSettlementMethods = {
    'CASH': 'CASH_RETURNED',
    'DEBT': 'REST_STOP_DEBT_RECEIPT',
    'WALLET': 'WALLET_CREDIT',
  };

  /// DRI-012: collect the fare; change returned in cash, credited to the wallet, or as a debt receipt.
  Future<String?> collectCod(Passenger p, {required int given, required String method}) {
    final settlement = changeSettlementMethods[method]!;
    return _act(
      'Thu COD ghế ${p.seat}',
      '/api/v1/driver/trips/$tripId/payments/cod-collect',
      body: {
        'ticket_id': p.ticketId,
        'amount_collected_vnd': given,
        'change_settlement_method': settlement,
      },
      request: (key) => api.collectCod(tripId!, p.ticketId, given, changeSettlementMethod: settlement, idempotencyKey: key),
    );
  }

  /// DRI-006: free seats for a hailing passenger, from the seat map minus the manifest.
  Future<void> loadFreeSeats() async {
    final r = await _call(() => api.getSeatMap(tripId!));
    if (r.error != null) return;
    final seatsList = (r.data?['seats'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
    final taken = manifest.where((p) => p.status != PaxStatus.noShow).map((p) => p.seat).toSet();
    freeSeats = [
      for (final s in seatsList)
        if (s['state'] == 'AVAILABLE' && !taken.contains(s['seat_code'])) s['seat_code'] as String,
    ];
    notifyListeners();
  }

  Future<String?> sellHail(
    String seat,
    String toStop, {
    int? given,
    String? method,
    String? phone,
    String? name,
  }) {
    final amount = given ?? fare;
    final settlement = method != null ? (changeSettlementMethods[method] ?? method) : 'CASH_RETURNED';
    final cleanPhone = (phone != null && phone.trim().isNotEmpty) ? phone.trim() : null;
    final cleanName = (name != null && name.trim().isNotEmpty) ? name.trim() : 'Khách vẫy dọc đường';
    return _act(
      'Bán vé khách vẫy ghế $seat',
      '/api/v1/driver/trips/$tripId/onboard-hail',
      body: {
        'seat_code': seat,
        'amount_collected_vnd': amount,
        'passenger_name': cleanName,
        if (cleanPhone != null) 'phone': cleanPhone,
        'dropoff_stop_id': toStop,
        'change_settlement_method': settlement,
      },
      request: (key) => api.onboardHailPassenger(
        tripId!,
        seatCode: seat,
        amountCollectedVnd: amount,
        dropoffStopId: toStop,
        changeSettlementMethod: settlement,
        phone: cleanPhone,
        passengerName: cleanName,
        idempotencyKey: key,
      ),
    );
  }

  // ---------- Incident, sync, end (DRI-015, DRI-017, DRI-019) ----------
  Future<String?> reportIncident(String type, int delay, [String note = '']) async {
    const types = {'Kẹt xe': 'TRAFFIC_JAM', 'Xe hỏng': 'BREAKDOWN', 'Tai nạn': 'ACCIDENT'};
    final incidentType = types[type] ?? 'OTHER';
    final description = note.trim().isEmpty ? type : note.trim();
    final lat = _lat;
    final lng = _lng;
    final key = newDriverIdempotencyKey();
    final r = await _call(
      () => api.reportIncident(
        tripId!,
        incidentType: incidentType,
        description: description,
        lat: lat,
        lng: lng,
        estimatedDelayMinutes: delay,
        idempotencyKey: key,
      ),
      label: 'Báo sự cố: $type',
      path: '/api/v1/driver/trips/$tripId/incidents',
      body: {
        'incident_type': incidentType,
        'description': description,
        'estimatedDelayMinutes': delay,
        'lat': lat,
        'lng': lng,
      },
      idempotencyKey: key,
    );
    if (r.error != null && !offline) return r.error;
    incident = (type: type, delay: delay, at: clock);
    notifyListeners();
    return null;
  }

  void setOffline(bool value) {
    offline = value;
    _syncRetryTimer();
    notifyListeners();
  }

  void _syncRetryTimer() {
    if (offline && queue.isNotEmpty) {
      _retryTimer ??= Timer.periodic(const Duration(seconds: 30), (_) {
        if (offline && queue.isNotEmpty && !_flushing) {
          unawaited(flushQueue());
        }
      });
    } else {
      _retryTimer?.cancel();
      _retryTimer = null;
    }
  }

  /// Sends queued actions oldest first; stops at the first network failure and keeps the rest.
  Future<int> flushQueue() => _flushFuture ??= _doFlush().whenComplete(() => _flushFuture = null);

  Future<int> _doFlush() async {
    if (queue.isEmpty) {
      final error = await refreshTrip();
      if (error == null) {
        offline = false;
        _syncRetryTimer();
        notifyListeners();
      }
      return 0;
    }
    _flushing = true;
    var sent = 0;
    var networkFailed = false;
    try {
      while (queue.isNotEmpty) {
        final action = queue.first;
        try {
          final json = await api.replay(
            action.method,
            action.path,
            action.body,
            action.idempotencyKey,
          );
          final error = _error(json);
          final code = json['code']?.toString();
          if (code == 'PIN_CHANGE_REQUIRED') {
            mustChangePin = true;
          }
          if (error != null) {
            syncErrors.add((label: action.label, error: error, at: action.at));
          }
          queue.removeAt(0);
          sent++;
          offline = false;
          await _saveQueue();
        } catch (_) {
          offline = true;
          networkFailed = true;
          break;
        }
      }
      if (sent > 0 && !networkFailed) {
        await refreshTrip();
      }
    } finally {
      _flushing = false;
      _syncRetryTimer();
      notifyListeners();
    }
    return sent;
  }

  Future<String?> endTrip() async {
    final reason = lastStop && atStop ? null : earlyEndReason;
    final key = newDriverIdempotencyKey();
    final r = await _call(
      () => api.endTrip(tripId!, earlyEndReason: reason, idempotencyKey: key),
      label: 'Kết thúc chuyến',
      path: '/api/v1/driver/trips/$tripId/end',
      body: {if (reason != null) 'early_end_reason': reason},
      idempotencyKey: key,
    );
    if (r.error != null) return r.error;
    endedCash = (r.data!['total_cash_to_handover_vnd'] as num?)?.toInt() ?? codCash + hailCash;
    earlyEndReason = null;
    _stopTimers();
    moving = false;
    trip = TripState.completed;
    shift = [for (final t in shift) t.id == tripId ? ShiftTrip(t.id, t.dep, t.route, t.plate, t.booked, 'COMPLETED', t.departureTime) : t];
    notifyListeners();
    return null;
  }

  void _stopTimers() {
    _stopGps();
    _clockTimer?.cancel();
    _driveTimer?.cancel();
    _telemetryTimer?.cancel();
    _clockTimer = null;
    _driveTimer = null;
    _telemetryTimer = null;
    _leg = null;
  }

  @override
  void dispose() {
    _stopTimers();
    _retryTimer?.cancel();
    _retryTimer = null;
    super.dispose();
  }
}

class DriverScope extends InheritedNotifier<DriverStore> {
  const DriverScope({super.key, required DriverStore store, required super.child}) : super(notifier: store);
  static DriverStore of(BuildContext context) => context.dependOnInheritedWidgetOfExactType<DriverScope>()!.notifier!;
  static DriverStore read(BuildContext context) => context.getInheritedWidgetOfExactType<DriverScope>()!.notifier!;
}
