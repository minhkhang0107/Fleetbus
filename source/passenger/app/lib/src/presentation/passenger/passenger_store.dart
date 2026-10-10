import 'dart:async';

import 'package:data/src/service/passenger_api_service.dart';
import 'package:flutter/widgets.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// State of the passenger app, backed by the FleetBus API (`PassengerApiClientService`, OQ-029).
/// Screens follow the Claude Design canvas "FleetBus — Thiết kế lại 3 app".

class OperatorInfo {
  const OperatorInfo({
    required this.code,
    required this.name,
    required this.shortName,
    required this.hotline,
    required this.primaryColor,
  });
  final String code;
  final String name;
  final String shortName;
  final String hotline;
  final String primaryColor;

  factory OperatorInfo.fromJson(Map<String, dynamic> j) => OperatorInfo(
        code: j['code'] ?? '',
        name: j['name'] ?? '',
        shortName: j['short_name'] ?? '',
        hotline: j['hotline'] ?? '',
        primaryColor: j['primary_color'] ?? '',
      );
}

class Place {
  const Place(this.code, this.city, this.station, this.altStations);
  final String code;
  final String city;
  final String station;
  final List<String> altStations;
}

class TravelDate {
  const TravelDate(this.id, this.short, this.long);
  final String id;
  final String short;
  final String long;
}

class Stop {
  const Stop(this.id, this.name, this.city, this.time, {required this.pickup, required this.dropoff});
  final String id;
  final String name;
  final String city;
  final String time;
  final bool pickup;
  final bool dropoff;
  String get note => pickup && dropoff ? 'Đón và trả khách' : (pickup ? 'Điểm đón' : 'Điểm trả');
  String get short => name.replaceFirst('Bến xe ', '').replaceFirst('Phía Bắc Thanh Hóa', 'Phía Bắc TH');
}

class Trip {
  const Trip({
    required this.id,
    required this.dep,
    required this.arr,
    required this.duration,
    required this.type,
    required this.vip,
    required this.price,
    required this.from,
    required this.to,
    required this.via,
    required this.seatsLeft,
    required this.plate,
    required this.stops,
  });
  final String id;
  final String dep;
  final String arr;
  final String duration;
  final String type;
  final bool vip;
  final int price;
  final String from;
  final String to;
  final String via;
  final int seatsLeft;
  final String plate;
  final List<Stop> stops;

  factory Trip.fromJson(Map<String, dynamic> j) {
    final dep = DateTime.parse(j['departure_time']).toUtc().add(const Duration(hours: 7));
    final arr = DateTime.parse(j['arrival_time']).toUtc().add(const Duration(hours: 7));
    final minutes = (j['duration_minutes'] as num?)?.toInt() ?? arr.difference(dep).inMinutes;
    final raw = (j['stops'] as List? ?? []).cast<Map<String, dynamic>>()..sort((a, b) => (a['order'] as num).compareTo(b['order'] as num));
    final n = raw.length;
    final stops = [
      for (var i = 0; i < n; i++)
        Stop(
          raw[i]['stop_id'],
          raw[i]['name'],
          raw[i]['city'] ?? '',
          _hhmm(dep.add(Duration(minutes: n > 1 ? (minutes * i / (n - 1)).round() : 0))),
          pickup: raw[i]['pickup_allowed'] == true,
          dropoff: raw[i]['dropoff_allowed'] == true,
        ),
    ];
    final firstPick = stops.firstWhere((s) => s.pickup, orElse: () => stops.first);
    final middle = stops.where((s) => s.pickup && s.dropoff).toList();
    return Trip(
      id: j['trip_id'],
      dep: _hhmm(dep),
      arr: _hhmm(arr),
      duration: '${minutes ~/ 60} giờ${minutes % 60 == 0 ? '' : ' ${minutes % 60} phút'}',
      type: j['vehicle_title'] ?? j['vehicle_type'] ?? '',
      vip: '${j['vehicle_type']}'.contains('VIP'),
      price: (j['base_fare_vnd'] as num).toInt(),
      from: firstPick.short,
      to: stops.lastWhere((s) => s.dropoff, orElse: () => stops.last).short,
      via: middle.isEmpty ? 'Thẳng' : 'Qua ${middle.first.short}',
      seatsLeft: (j['available_seats_count'] as num?)?.toInt() ?? 0,
      plate: j['plate_number'] ?? '',
      stops: stops,
    );
  }
}

enum SeatState { free, held, booked, blocked }

class Seat {
  const Seat(this.code, this.deck, this.state);
  final String code;
  final int deck;
  final SeatState state;
}

enum TicketStatus { active, boarded, refunding, cancelled, noShow }

class Ticket {
  Ticket({
    required this.id,
    required this.pnr,
    required this.tripId,
    required this.route,
    required this.date,
    required this.dep,
    required this.seat,
    required this.pickup,
    this.dropoff = '',
    required this.paid,
    required this.name,
    required this.status,
    this.plate = '',
  });
  final String id;
  final String pnr;
  final String tripId;
  final String route;
  final String date;
  final String dep;
  final String seat;
  final String pickup;
  final String dropoff;
  final int paid;
  final String name;
  String plate;
  TicketStatus status;
  int delay = 0;
  int qrVersion = 1;
  String? qrValue;
  String? pin;
  int? refund;

  bool get active => status == TicketStatus.active || status == TicketStatus.boarded;
  String get departure => delay == 0 ? dep : addMinutes(dep, delay);

  factory Ticket.fromJson(Map<String, dynamic> j) {
    final dep = DateTime.parse(j['departure_time']).toUtc().add(const Duration(hours: 7));
    final status = switch (j['status']) {
      'ACTIVE' => TicketStatus.active,
      'BOARDED' => TicketStatus.boarded,
      'NO_SHOW' => TicketStatus.noShow,
      'REFUND_REQUESTED' || 'REFUNDED' => TicketStatus.refunding,
      _ => TicketStatus.cancelled,
    };
    return Ticket(
      id: j['ticket_id'],
      pnr: j['pnr'],
      tripId: j['trip_id'],
      route: routeLabel(j['route_name'] ?? ''),
      date: '${const ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][dep.weekday % 7]} ${_two(dep.day)}/${_two(dep.month)}',
      dep: _hhmm(dep),
      seat: j['seat_code'] ?? '',
      pickup: '${j['pickup_stop'] ?? ''}'.replaceFirst('Bến xe ', ''),
      dropoff: '${j['dropoff_stop'] ?? ''}'.replaceFirst('Bến xe ', ''),
      paid: (j['fare_vnd'] as num?)?.toInt() ?? 0,
      name: j['passenger_name'] ?? '',
      status: status,
    )..refund = (j['refund_amount_vnd'] as num?)?.toInt();
  }
}

class AppNotice {
  AppNotice(this.title, this.body, this.time, {this.tripId, this.type = ''});
  final String title;
  final String body;
  final String time;
  final String? tripId;
  final String type;
}

enum GpsSignal { live, stale, offline, none }

class TrackingTarget {
  const TrackingTarget({
    required this.stopId,
    required this.name,
    required this.lat,
    required this.lng,
    required this.isDropoff,
  });
  final String stopId;
  final String name;
  final double lat;
  final double lng;
  final bool isDropoff;
}

class TrackingStop {
  const TrackingStop({
    required this.name,
    required this.lat,
    required this.lng,
    this.stopId = '',
    this.order,
  });
  final String stopId;
  final String name;
  final double lat;
  final double lng;
  final int? order;
}

class Tracking {
  const Tracking(
    this.signal, {
    this.etaMinutes,
    this.distanceKm,
    this.speed,
    this.text = '',
    this.busLat,
    this.busLng,
    this.bearing,
    this.target,
    this.stops = const [],
    this.route = const [],
    this.passedTarget = false,
    this.publicView = false,
  });

  final GpsSignal signal;
  final int? etaMinutes;
  final double? distanceKm;
  final double? speed;
  final String text;
  final double? busLat;
  final double? busLng;
  final double? bearing;
  final TrackingTarget? target;
  final List<TrackingStop> stops;
  final List<(double, double)> route;
  final bool passedTarget;
  final bool publicView;
}

/// Result of a call: null message means success.
class ApiResult<T> {
  const ApiResult(this.value, [this.error, this.code]);
  final T? value;
  final String? error;
  final String? code;
  bool get ok => error == null;
}

String _two(int v) => v.toString().padLeft(2, '0');
String _hhmm(DateTime t) => '${_two(t.hour)}:${_two(t.minute)}';
String routeLabel(String name) => name.replaceAll(RegExp(r'\s*\(.*\)'), '').replaceAll(' — ', ' → ');

String addMinutes(String hhmm, int minutes) {
  final parts = hhmm.split(':').map(int.parse).toList();
  final total = parts[0] * 60 + parts[1] + minutes;
  return '${_two((total ~/ 60) % 24)}:${_two(total % 60)}';
}

String vnd(int amount) {
  final s = amount.abs().toString();
  final buf = StringBuffer();
  for (var i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 == 0) buf.write('.');
    buf.write(s[i]);
  }
  return '${amount < 0 ? '−' : ''}$buf đ';
}

String maskPhone(String phone) => phone.length < 7 ? phone : '${phone.substring(0, 4)} *** ${phone.substring(phone.length - 3)}';

const _networkError = 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.';

class PassengerStore extends ChangeNotifier {
  PassengerStore({PassengerApiClientService? api}) : api = api ?? PassengerApiClientService();

  final PassengerApiClientService api;

  OperatorInfo? operator;
  Map<String, Place> places = {};

  static const dates = [
    TravelDate('27/08', 'T5 · 27/08', 'Thứ Năm, 27/08'),
    TravelDate('28/08', 'T6 · 28/08', 'Thứ Sáu, 28/08'),
    TravelDate('29/08', 'T7 · 29/08', 'Thứ Bảy, 29/08'),
  ];
  static const knownVouchers = {'BUSGO50K': 50000};
  static const maxSeats = 5;

  // Session
  String? userName;
  String? userPhone;
  bool get loggedIn => api.authToken != null;
  String? devOtp; // development server only: fills the OTP field like an SMS autofill

  // Search
  String origin = '';
  String dest = '';
  String date = '28/08';
  String sort = 'time';
  List<Trip> trips = [];
  bool loadingTrips = false;
  String? tripsError;

  // Booking funnel
  Trip? trip;
  String pickup = '';
  String dropoff = '';
  int deck = 1;
  List<Seat> seatMap = [];
  bool loadingSeats = false;
  final List<String> seats = [];
  String? holdId;
  String? voucher;
  bool insured = false;

  // Order and payment (PAX-013)
  String? orderId;
  String? orderPnr;
  int orderAmount = 0;
  String bankName = '';
  String accountNumber = '';
  String transferMemo = '';
  String vietQrPayload = '';
  Ticket? lastTicket;

  // Countdown of the hold, then of the payment window (BR-HOLD-001..004)
  int holdLeft = 0;
  String? holdPhase;
  Timer? _holdTimer;
  VoidCallback? onHoldExpired;

  // Wallet and notices
  List<Ticket> tickets = [];
  bool loadingTickets = false;
  List<AppNotice> notices = [];
  bool unread = false;

  Place get originPlace => places.isEmpty ? const Place('', '—', '', []) : (places[origin] ?? const Place('', '—', '', []));
  Place get destPlace => places.isEmpty ? const Place('', '—', '', []) : (places[dest] ?? const Place('', '—', '', []));

  List<List<String>> get recentPairs {
    if (places.isEmpty) return [];
    final hn = places.values.where((p) => p.city == 'Hà Nội').firstOrNull?.code;
    final th = places.values.where((p) => p.city == 'Thanh Hóa').firstOrNull?.code;
    final nb = places.values.where((p) => p.city == 'Ninh Bình').firstOrNull?.code;
    final hp = places.values.where((p) => p.city == 'Hải Phòng').firstOrNull?.code;
    
    final list = <List<String>>[];
    if (hn != null && th != null) list.add([hn, th]);
    if (hn != null && nb != null) list.add([hn, nb]);
    if (hn != null && hp != null) list.add([hn, hp]);
    if (list.isEmpty && places.length >= 2) {
      final keys = places.keys.toList();
      list.add([keys[0], keys[1]]);
    }
    return list.take(2).toList();
  }

  TravelDate get travelDate => dates.firstWhere((d) => d.id == date);

  ApiResult<Map<String, dynamic>> _result(Map<String, dynamic> json) {
    if (json['status'] == 'success') return ApiResult(json['data'] is Map<String, dynamic> ? json['data'] as Map<String, dynamic> : {'value': json['data']});
    return ApiResult(null, '${json['message'] ?? 'Có lỗi, thử lại sau.'}', '${json['code'] ?? ''}');
  }

  Future<ApiResult<Map<String, dynamic>>> _call(Future<Map<String, dynamic>> Function() request) async {
    try {
      return _result(await request());
    } catch (_) {
      return const ApiResult(null, _networkError, 'NETWORK');
    }
  }

  // ---------- Operator & Places ----------
  Future<String?> selectOperator(String rawCode) async {
    final code = rawCode.trim().toUpperCase();
    if (code.isEmpty) return 'Nhập mã nhà xe';
    
    final r = await _call(() => api.getAppConfig(operatorCode: code));
    if (!r.ok) return r.error;
    
    api.operatorCode = code;
    operator = OperatorInfo.fromJson(r.value!['operator'] as Map<String, dynamic>);
    
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('operator_code', code);
    
    await loadPlaces();
    notifyListeners();
    return null;
  }

  Future<void> restoreOperator() async {
    final prefs = await SharedPreferences.getInstance();
    final code = prefs.getString('operator_code');
    if (code != null && code.isNotEmpty) {
      await selectOperator(code); // silently ignore errors
    }
  }

  Future<void> changeOperator() async {
    logout();
    operator = null;
    places.clear();
    trips.clear();
    tickets.clear();
    notices.clear();
    api.operatorCode = null;
    
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('operator_code');
    
    notifyListeners();
  }

  String _foldToCode(String text) {
    const from = 'àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ';
    const to = 'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd';
    var lower = text.toLowerCase().replaceAll(' ', '');
    for (var i = 0; i < from.length; i++) {
      lower = lower.replaceAll(from[i], to[i]);
    }
    return lower;
  }

  Future<void> loadPlaces() async {
    try {
      final json = await api.searchStations('');
      final cityGroups = <String, List<Map<String, dynamic>>>{};
      for (final s in json) {
        final city = s['city'] as String? ?? '';
        if (city.isEmpty) continue;
        final code = _foldToCode(city);
        (cityGroups[code] ??= []).add(s as Map<String, dynamic>);
      }
      
      places.clear();
      for (final e in cityGroups.entries) {
        final code = e.key;
        final group = e.value;
        final city = group.first['city'] as String;
        final sorted = group.toList()..sort((a, b) => (b['popular'] == true ? 1 : 0).compareTo(a['popular'] == true ? 1 : 0));
        final mainStation = sorted.first['name'] as String;
        final alt = sorted.skip(1).map((s) => s['name'] as String).toList();
        places[code] = Place(code, city, mainStation, alt);
      }

      if (places.isNotEmpty) {
        final hn = places.values.where((p) => p.city == 'Hà Nội').firstOrNull;
        origin = hn?.code ?? places.keys.first;
        
        final th = places.values.where((p) => p.city == 'Thanh Hóa').firstOrNull;
        dest = th?.code ?? places.keys.lastWhere((k) => k != origin, orElse: () => places.keys.first);
      }
    } catch (_) {
      // Ignore network errors on loadPlaces as instructed or leave empty
    }
  }


  // ---------- Login (PAX-002 / PAX-003) ----------
  Future<String?> requestOtp(String phone) async {
    final r = await _call(() => api.requestOtp(phone));
    if (!r.ok) return r.error;
    devOtp = r.value!['mock_otp']?.toString();
    return null;
  }

  Future<String?> verifyOtp(String phone, String otp) async {
    final r = await _call(() => api.verifyOtp(phone, otp));
    if (!r.ok) return r.error;
    
    final userOperatorCode = r.value!['user']?['operator']?['code'];
    if (userOperatorCode != operator?.code) {
      api.authToken = null;
      return 'Tài khoản không thuộc nhà xe này';
    }
    
    userPhone = phone;
    final name = r.value!['user']?['full_name'];
    userName = name is String && name != 'Hành khách BusGo' ? name : null;
    devOtp = null;
    notifyListeners();
    unawaited(loadTickets());
    unawaited(loadNotices());
    return null;
  }

  void logout() {
    api.authToken = null;
    userPhone = null;
    userName = null;
    tickets = [];
    notices = [];
    notifyListeners();
  }

  // ---------- Search (PAX-004 to PAX-006) ----------
  void swapPlaces() {
    final o = origin;
    origin = dest;
    dest = o;
    notifyListeners();
  }

  void setPlace({required bool isOrigin, required String code}) {
    if (isOrigin) {
      origin = code;
    } else {
      dest = code;
    }
    notifyListeners();
  }

  void setDate(String id) {
    date = id;
    notifyListeners();
  }

  void setSort(String value) {
    sort = value;
    notifyListeners();
  }

  Future<void> loadTrips() async {
    loadingTrips = true;
    tripsError = null;
    notifyListeners();
    try {
      final list = await api.searchTrips(origin: originPlace.city, destination: destPlace.city);
      trips = list.cast<Map<String, dynamic>>().map(Trip.fromJson).toList();
    } catch (_) {
      trips = [];
      tripsError = _networkError;
    }
    loadingTrips = false;
    notifyListeners();
  }

  void chooseTrip(Trip t) {
    trip = t;
    pickup = t.stops.firstWhere((s) => s.pickup, orElse: () => t.stops.first).id;
    final inDest = t.stops.where((s) => s.dropoff && s.city == destPlace.city).toList();
    dropoff = (inDest.isNotEmpty ? inDest.first : t.stops.lastWhere((s) => s.dropoff, orElse: () => t.stops.last)).id;
    seats.clear();
    seatMap = [];
    deck = 1;
    notifyListeners();
  }

  List<Stop> stops() => trip?.stops ?? const [];
  Stop stop(String id) => stops().firstWhere((s) => s.id == id, orElse: () => stops().first);

  void setPickup(String id) {
    pickup = id;
    final list = stops();
    final p = list.indexWhere((s) => s.id == id);
    if (list.indexWhere((s) => s.id == dropoff) <= p) {
      dropoff = list.skip(p + 1).firstWhere((s) => s.dropoff, orElse: () => list.last).id;
    }
    notifyListeners();
  }

  void setDropoff(String id) {
    dropoff = id;
    notifyListeners();
  }

  // ---------- Seat map and hold (PAX-009 / PAX-010) ----------
  Future<String?> loadSeatMap() async {
    loadingSeats = true;
    notifyListeners();
    final r = await _call(() => api.getSeatMap(trip!.id, pickupId: pickup, dropoffId: dropoff));
    loadingSeats = false;
    if (!r.ok) {
      notifyListeners();
      return r.error;
    }
    seatMap = (r.value!['seats'] as List).cast<Map<String, dynamic>>().map((s) {
      final state = switch ('${s['segment_state'] ?? s['state']}') {
        'AVAILABLE' => SeatState.free,
        'BOOKED' => SeatState.booked,
        'BLOCKED' => SeatState.blocked,
        _ => SeatState.held,
      };
      return Seat(s['seat_code'], (s['deck'] as num?)?.toInt() ?? 1, state);
    }).toList();
    seats.removeWhere((c) => seatMap.any((s) => s.code == c && s.state != SeatState.free));
    notifyListeners();
    return null;
  }

  Map<String, SeatState> deckSeats(int d) => {for (final s in seatMap.where((s) => s.deck == d)) s.code: s.state};
  List<int> get decks => (seatMap.map((s) => s.deck).toSet().toList()..sort());
  int freeOnDeck(int d) => seatMap.where((s) => s.deck == d && s.state == SeatState.free && !seats.contains(s.code)).length;

  void setDeck(int d) {
    deck = d;
    notifyListeners();
  }

  bool toggleSeat(String code) {
    if (seats.contains(code)) {
      seats.remove(code);
    } else {
      if (seats.length >= maxSeats) return false;
      seats.add(code);
    }
    notifyListeners();
    return true;
  }

  Future<String?> holdSeats() async {
    final r = await _call(() => api.holdSeats(trip!.id, List.of(seats), pickupStopId: pickup, dropoffStopId: dropoff));
    if (!r.ok) {
      if (r.code == 'SEAT_LOCKED_BY_OTHER' || r.code == 'SEAT_ALREADY_BOOKED' || r.code == 'SEAT_BLOCKED') await loadSeatMap();
      return r.error;
    }
    holdId = r.value!['hold_id'];
    _startCountdown('hold', (r.value!['seconds_remaining'] as num?)?.toInt() ?? 600);
    return null;
  }

  // ---------- Checkout (PAX-011 / PAX-012) ----------
  int get baseFare => (trip?.price ?? 0) * seats.length;
  int get insuranceFee => insured ? 10000 * seats.length : 0;
  int get discount => voucher == null ? 0 : (knownVouchers[voucher]! < baseFare ? knownVouchers[voucher]! : baseFare);
  int get total => baseFare + insuranceFee - discount;

  void setInsured(bool value) {
    insured = value;
    notifyListeners();
  }

  String? applyVoucher(String code) {
    final c = code.trim().toUpperCase();
    if (c.isEmpty) return 'Nhập mã giảm giá.';
    if (!knownVouchers.containsKey(c)) return 'Mã không hợp lệ hoặc đã hết hạn.';
    voucher = c;
    notifyListeners();
    return null;
  }

  void removeVoucher() {
    voucher = null;
    notifyListeners();
  }

  /// Creates the order; the server prices it (BR-CHECKOUT-003) and its total is what is shown next.
  Future<String?> createOrder(String name, String phone) async {
    final r = await _call(() => api.createBookingOrder(
          tripId: trip!.id,
          holdId: holdId!,
          seatCodes: List.of(seats),
          payer: {'full_name': name, 'phone': phone},
          passengers: [for (final s in seats) {'seat_code': s, 'full_name': name, 'phone': phone}],
          voucherCode: voucher,
          pickupStop: pickup,
          dropoffStop: dropoff,
          insuranceSelected: insured,
        ));
    if (!r.ok) return r.error;
    final pay = r.value!['payment'] as Map<String, dynamic>;
    final details = pay['payment_details'] as Map<String, dynamic>;
    orderId = pay['order_id'];
    orderPnr = pay['pnr'];
    orderAmount = (pay['amount_vnd'] as num).toInt();
    bankName = details['bank_name'] ?? '';
    accountNumber = details['account_number'] ?? '';
    transferMemo = details['transfer_memo'] ?? '';
    vietQrPayload = details['qr_payload'] ?? '';
    final expires = DateTime.tryParse('${pay['expires_at']}');
    _startCountdown('pay', expires == null ? 600 : expires.difference(DateTime.now()).inSeconds.clamp(60, 1800));
    return null;
  }

  /// PAX-013 / PAX-014: asks the server; the ticket exists only once the bank confirmed (BR-PAY-004).
  Future<bool> checkPayment({bool manual = false}) async {
    if (orderId == null) return false;
    final r = await _call(() => api.verifyPaymentStatus(orderId!, manualTrigger: manual));
    if (!r.ok || r.value!['payment_status'] != 'PAID') return false;
    stopHold();
    await loadTickets();
    final issued = tickets.where((t) => t.pnr == orderPnr).toList();
    if (issued.isNotEmpty) {
      final first = issued.first;
      lastTicket = Ticket(id: first.id, pnr: first.pnr, tripId: first.tripId, route: first.route, date: first.date, dep: first.dep, seat: issued.map((t) => t.seat).join(', '), pickup: first.pickup, paid: orderAmount, name: first.name, status: first.status, plate: trip?.plate ?? '');
      for (final t in issued) {
        t.plate = trip?.plate ?? '';
      }
    }
    orderId = null;
    seats.clear();
    voucher = null;
    insured = false;
    await loadNotices();
    return true;
  }

  Future<void> cancelOrder() async {
    stopHold();
    if (trip != null) await _call(() => api.releaseHold(trip!.id));
    orderId = null;
    orderPnr = null;
    seats.clear();
    notifyListeners();
  }

  void _startCountdown(String phase, int seconds) {
    _holdTimer?.cancel();
    holdPhase = phase;
    holdLeft = seconds;
    _holdTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      holdLeft--;
      if (holdLeft <= 0) {
        stopHold();
        orderId = null;
        seats.clear();
        onHoldExpired?.call();
      }
      notifyListeners();
    });
    notifyListeners();
  }

  void stopHold() {
    _holdTimer?.cancel();
    _holdTimer = null;
    holdPhase = null;
  }

  // ---------- Wallet, pass, cancellation (PAX-016, PAX-017, PAX-021) ----------
  Future<void> loadTickets() async {
    if (!loggedIn) return;
    loadingTickets = true;
    notifyListeners();
    final up = await _call(() => api.getTicketWallet(tab: 'UPCOMING'));
    final past = await _call(() => api.getTicketWallet(tab: 'HISTORY'));
    final list = <Ticket>[];
    for (final r in [up, past]) {
      if (r.ok) list.addAll(((r.value!['value'] ?? r.value) as List).cast<Map<String, dynamic>>().map(Ticket.fromJson));
    }
    for (final t in list) {
      final old = tickets.where((o) => o.id == t.id).firstOrNull;
      if (old != null) t.plate = old.plate;
    }
    tickets = list;
    for (final tripId in tickets.where((t) => t.active).map((t) => t.tripId).toSet()) {
      final d = await _call(() => api.getDisruptions(tripId));
      final minutes = d.ok ? (d.value!['delay_minutes'] ?? d.value!['current_delay_minutes'] ?? 0) : 0;
      for (final t in tickets.where((t) => t.tripId == tripId)) {
        t.delay = (minutes as num).toInt();
      }
    }
    loadingTickets = false;
    notifyListeners();
  }

  Future<String?> loadPass(Ticket t) async {
    final r = await _call(() => api.getTicketQR(t.id));
    if (!r.ok) return r.error;
    final qr = r.value!['boarding_qr'] as Map<String, dynamic>?;
    t.qrValue = qr?['qr_code_value'];
    t.qrVersion = (qr?['version'] as num?)?.toInt() ?? t.qrVersion;
    t.pin = r.value!['offline_pin']?.toString();
    final status = r.value!['ticket']?['status'];
    if (status == 'BOARDED') t.status = TicketStatus.boarded;
    notifyListeners();
    return null;
  }

  /// D104: a new QR version; the server refuses it once the trip has left (BOARDING_STARTED).
  Future<ApiResult<void>> reissueQr(Ticket t) async {
    final r = await _call(() => api.reissueBoardingQr(t.id));
    if (!r.ok) return ApiResult(null, r.error, r.code);
    final qr = r.value!['boarding_qr'] as Map<String, dynamic>;
    t.qrValue = qr['qr_code_value'];
    t.qrVersion = (qr['version'] as num).toInt();
    t.pin = r.value!['offline_pin']?.toString();
    notifyListeners();
    return const ApiResult(null);
  }

  Future<String?> shareTicket(Ticket t, String phone) async {
    final r = await _call(() => api.delegateTicket(t.id, delegateToPhone: phone, delegateToName: 'Người đi cùng'));
    return r.ok ? null : r.error;
  }

  /// Preview of PAX-021 tiers; the server decides the refund.
  ({int percent, String tier}) refundFor(Ticket t) {
    if (t.delay > 30) return (percent: 100, tier: 'Chuyến chậm hơn 30 phút: hoàn 100%, không phí');
    return (percent: -1, tier: 'Mức hoàn tính theo số giờ trước giờ chạy: từ 12 giờ hoàn 100%, 6 đến 12 giờ hoàn 80%, dưới 6 giờ không hoàn.');
  }

  Future<ApiResult<int>> cancelTicket(Ticket t) async {
    final r = await _call(() => api.cancelTicket(t.id));
    if (!r.ok) return ApiResult(null, r.error, r.code);
    final amount = (r.value!['refund_amount_vnd'] as num?)?.toInt() ?? 0;
    await loadTickets();
    await loadNotices();
    return ApiResult(amount);
  }

  // ---------- Tracking and notices (PAX-018, PAX-020) ----------
  Future<Tracking> loadTracking(String tripId, {String? ticketId}) async {
    final r = await _call(() => api.getLiveRadarHUD(tripId, ticketId: ticketId));
    if (!r.ok) return Tracking(GpsSignal.none, text: r.error!);
    final d = r.value!;
    final signal = switch (d['signal_status']) {
      'LIVE' => GpsSignal.live,
      'STALE' => GpsSignal.stale,
      'OFFLINE' => GpsSignal.offline,
      _ => GpsSignal.none,
    };
    final pos = d['bus_position'] as Map<String, dynamic>?;
    final busLat = (pos?['lat'] as num?)?.toDouble();
    final busLng = (pos?['lng'] as num?)?.toDouble();
    final bearing = (pos?['bearing_deg'] as num?)?.toDouble();
    final speed = (pos?['speed_kmh'] as num?)?.toDouble();

    final rawTarget = d['target_stop'] as Map<String, dynamic>?;
    TrackingTarget? target;
    if (rawTarget != null && rawTarget['lat'] is num && rawTarget['lng'] is num) {
      target = TrackingTarget(
        stopId: '${rawTarget['stop_id'] ?? ''}',
        name: '${rawTarget['name'] ?? ''}',
        lat: (rawTarget['lat'] as num).toDouble(),
        lng: (rawTarget['lng'] as num).toDouble(),
        isDropoff: rawTarget['kind'] == 'DROPOFF',
      );
    }

    final rawStops = d['stops'] as List?;
    final stops = <TrackingStop>[
      if (rawStops != null)
        for (final s in rawStops)
          if (s is Map && s['lat'] is num && s['lng'] is num)
            TrackingStop(
              stopId: '${s['stop_id'] ?? ''}',
              name: '${s['name'] ?? ''}',
              lat: (s['lat'] as num).toDouble(),
              lng: (s['lng'] as num).toDouble(),
              order: (s['order'] as num?)?.toInt(),
            ),
    ];

    final rawRoute = d['route_shape'] as List?;
    final route = <(double, double)>[
      if (rawRoute != null)
        for (final pt in rawRoute)
          if (pt is List && pt.length >= 2 && pt[0] is num && pt[1] is num)
            ((pt[0] as num).toDouble(), (pt[1] as num).toDouble()),
    ];

    final passedTarget = d['has_passed_target'] == true;
    final publicView = d['view'] == 'PUBLIC';

    return Tracking(
      signal,
      etaMinutes: (d['eta_minutes'] as num?)?.toInt(),
      distanceKm: (d['distance_meters'] as num?) == null ? null : (d['distance_meters'] as num) / 1000,
      speed: speed,
      text: '${d['hud_status_text'] ?? ''}',
      busLat: busLat,
      busLng: busLng,
      bearing: bearing,
      target: target,
      stops: stops,
      route: route,
      passedTarget: passedTarget,
      publicView: publicView,
    );
  }

  Future<void> loadNotices() async {
    if (!loggedIn) return;
    final r = await _call(() => api.getNotifications());
    if (!r.ok) return;
    final list = ((r.value!['value'] ?? r.value) as List).cast<Map<String, dynamic>>();
    notices = [
      for (final n in list)
        AppNotice(n['title'] ?? '', n['body'] ?? '', _ago(n['created_at']), tripId: n['payload']?['trip_id'], type: n['type'] ?? ''),
    ];
    unread = list.any((n) => n['is_read'] == false);
    notifyListeners();
  }

  String _ago(Object? iso) {
    final t = DateTime.tryParse('$iso');
    if (t == null) return '';
    final m = DateTime.now().difference(t).inMinutes;
    if (m < 1) return 'Vừa xong';
    if (m < 60) return '$m phút trước';
    return '${m ~/ 60} giờ trước';
  }

  void markRead() {
    unread = false;
    notifyListeners();
  }

  @override
  void dispose() {
    _holdTimer?.cancel();
    super.dispose();
  }
}

class PassengerScope extends InheritedNotifier<PassengerStore> {
  const PassengerScope({super.key, required PassengerStore store, required super.child}) : super(notifier: store);

  static PassengerStore of(BuildContext context) => context.dependOnInheritedWidgetOfExactType<PassengerScope>()!.notifier!;
  static PassengerStore read(BuildContext context) => context.getInheritedWidgetOfExactType<PassengerScope>()!.notifier!;
}
