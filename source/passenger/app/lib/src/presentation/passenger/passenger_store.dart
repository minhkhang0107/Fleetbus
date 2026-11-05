import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:data/src/service/passenger_api_service.dart';
import 'package:flutter/foundation.dart' show TargetPlatform, defaultTargetPlatform;
import 'package:flutter/widgets.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'passenger_dates.dart';

export 'passenger_banks.dart';
export 'passenger_dates.dart';
import 'passenger_banks.dart';

/// State of the passenger app, backed by the FleetBus API (`PassengerApiClientService`, OQ-029).
/// Screens follow the Claude Design canvas "FleetBus — Thiết kế lại 3 app".

class RefundAccount {
  const RefundAccount({
    required this.bankBin,
    this.bankName,
    this.bankShortName,
    required this.accountNumber,
    required this.accountName,
  });

  final String bankBin;
  final String? bankName;
  final String? bankShortName;
  final String accountNumber;
  final String accountName;

  String get displayBankName {
    if (bankName != null && bankName!.isNotEmpty) return bankName!;
    if (bankShortName != null && bankShortName!.isNotEmpty) return bankShortName!;
    final found = vietQrBanks.where((b) => b.bin == bankBin).firstOrNull;
    if (found != null) return found.shortName;
    return bankBin;
  }

  factory RefundAccount.fromJson(Map<String, dynamic> j) => RefundAccount(
        bankBin: '${j['bank_bin'] ?? j['bin'] ?? ''}',
        bankName: j['bank_name'] as String?,
        bankShortName: j['bank_short_name'] as String?,
        accountNumber: '${j['account_number'] ?? ''}',
        accountName: '${j['account_name'] ?? ''}',
      );

  Map<String, dynamic> toJson() => {
        'bank_bin': bankBin,
        if (bankName != null) 'bank_name': bankName,
        if (bankShortName != null) 'bank_short_name': bankShortName,
        'account_number': accountNumber,
        'account_name': accountName,
      };
}

class TicketRefund {
  TicketRefund({
    required this.refundId,
    required this.status,
    required this.amountVnd,
    this.rejectNote,
    this.account,
  });

  final String refundId;
  final String status;
  final int amountVnd;
  final String? rejectNote;
  final RefundAccount? account;

  bool get isPending => status == 'REFUND_REQUESTED';
  bool get isRefunded => status == 'REFUNDED';
  bool get isRejected => status == 'REFUND_REJECTED' || status == 'REJECTED';

  String get statusLabel => switch (status) {
        'REFUND_REQUESTED' => 'Đang chờ hoàn tiền',
        'REFUNDED' => 'Đã hoàn tiền',
        'REFUND_REJECTED' || 'REJECTED' => 'Từ chối',
        _ => status,
      };

  factory TicketRefund.fromJson(Map<String, dynamic> j) => TicketRefund(
        refundId: '${j['refund_id'] ?? ''}',
        status: '${j['status'] ?? ''}',
        amountVnd: (j['amount_vnd'] as num?)?.toInt() ?? 0,
        rejectNote: (j['reject_note'] ?? j['notes'] ?? j['reason']) as String?,
        account: j['refund_account'] is Map<String, dynamic>
            ? RefundAccount.fromJson(j['refund_account'] as Map<String, dynamic>)
            : null,
      );
}

class OperatorInfo {
  const OperatorInfo({
    required this.code,
    required this.name,
    required this.shortName,
    required this.hotline,
    required this.primaryColor,
    this.supportEmail = '',
    this.address = '',
    this.pickupModes = const ['FIXED_STOP'],
    this.dropoffModes = const ['FIXED_LOCATION'],
    this.allowCash = true,
    this.allowTransfer = true,
    this.insuranceEnabled = false,
    this.walletEnabled = false,
  });
  final String code;
  final String name;
  final String shortName;
  final String hotline;
  final String primaryColor;
  final String supportEmail;
  final String address;
  final List<String> pickupModes;
  final List<String> dropoffModes;
  final bool allowCash;
  final bool allowTransfer;
  final bool insuranceEnabled;
  final bool walletEnabled;

  bool get homePickup => pickupModes.contains('HOME_PICKUP');
  bool get homeDropoff => dropoffModes.contains('HOME_DROPOFF');

  factory OperatorInfo.fromJson(Map<String, dynamic> j) => OperatorInfo(
        code: j['code'] ?? '',
        name: j['name'] ?? '',
        shortName: j['short_name'] ?? '',
        hotline: j['hotline'] ?? '',
        primaryColor: j['primary_color'] ?? '',
        supportEmail: j['support_email'] ?? '',
        address: j['address'] ?? '',
        pickupModes: [for (final m in (j['pickup_modes'] as List? ?? const ['FIXED_STOP'])) '$m'],
        dropoffModes: [for (final m in (j['dropoff_modes'] as List? ?? const ['FIXED_LOCATION'])) '$m'],
        allowCash: j['allow_cash_payment'] != false,
        // Older servers send no payment_methods: they always took transfers.
        allowTransfer: (j['payment_methods'] as List?)?.contains('BANK_TRANSFER') ?? true,
        insuranceEnabled: j['insurance_enabled'] == true,
        walletEnabled: j['wallet_enabled'] == true,
      );
}

/// A home service area drawn by the bus company (spec 3.3).
class ServiceArea {
  const ServiceArea({required this.id, required this.name, required this.kind, required this.polygon, required this.feeVnd, required this.leadMinutes, required this.from, required this.to, this.manual = false});
  final String id;
  final String name;
  final String kind; // PICKUP | DROPOFF
  final List<({double lat, double lng})> polygon;
  final int feeVnd;
  final int leadMinutes;
  final String from;
  final String to;
  /// The company reviews each address of this area first (D130).
  final bool manual;

  factory ServiceArea.fromJson(Map<String, dynamic> j) => ServiceArea(
        id: '${j['area_id']}',
        name: '${j['name'] ?? ''}',
        kind: '${j['kind']}',
        polygon: [for (final p in (j['polygon'] as List? ?? const [])) (lat: (p[0] as num).toDouble(), lng: (p[1] as num).toDouble())],
        feeVnd: (j['fee_vnd'] as num? ?? 0).toInt(),
        leadMinutes: (j['lead_time_minutes'] as num? ?? 0).toInt(),
        from: '${j['service_hours']?['from'] ?? ''}',
        to: '${j['service_hours']?['to'] ?? ''}',
        manual: j['confirmation'] == 'MANUAL',
      );
}

/// The company's cancellation policy (D184): refund tiers by hours before the departure, and the lines the passenger
/// reads and agrees to before cancelling. The server applies the same policy; [fallback] is its default.
class CancelPolicy {
  const CancelPolicy({required this.tiers, required this.delayWaiverMinutes, required this.rules});
  /// Highest bound first; the last one starts at 0 hours.
  final List<({int minHours, int percent})> tiers;
  final int? delayWaiverMinutes;
  final List<String> rules;

  static const fallback = CancelPolicy(
    tiers: [(minHours: 12, percent: 100), (minHours: 6, percent: 80), (minHours: 0, percent: 0)],
    delayWaiverMinutes: 30,
    rules: [
      'Hủy từ 12 giờ trở lên trước giờ chạy: Hoàn tiền 100%',
      'Hủy trước giờ chạy 6-12 giờ: Hoàn tiền 80% (Phí hủy 20%)',
      'Hủy dưới 6 giờ trước giờ chạy: Không hoàn tiền',
      'Chuyến chậm hơn 30 phút so với giờ chạy: Hoàn tiền 100%, không thu phí hủy',
      'Nhà xe không nhận đón/trả tận nhà bạn đã đặt: Hoàn tiền 100%, không thu phí hủy',
      'Vé đã hủy không khôi phục được, ghế được nhả ngay cho người khác.',
    ],
  );

  static CancelPolicy fromJson(Map<String, dynamic>? j) {
    final tiers = [
      for (final t in (j?['tiers'] as List? ?? const []))
        (minHours: (t['min_hours_before'] as num).toInt(), percent: (t['refund_percent'] as num).toInt()),
    ];
    if (tiers.isEmpty) return fallback;
    return CancelPolicy(
      tiers: tiers,
      delayWaiverMinutes: (j!['delay_waiver_minutes'] as num?)?.toInt(),
      rules: [for (final r in (j['rules'] as List? ?? const [])) '$r'],
    );
  }

  /// The tier for a cancellation [hours] before the departure, worded as the server words it.
  ({int percent, String tier}) tierFor(double hours) {
    var i = tiers.indexWhere((t) => hours >= t.minHours);
    if (i < 0) i = tiers.length - 1;
    final (minHours: from, :percent) = tiers[i];
    final refund = percent >= 100 ? 'Hoàn tiền 100%' : (percent <= 0 ? 'Không hoàn tiền' : 'Hoàn tiền $percent% (Phí hủy ${100 - percent}%)');
    if (i == 0) return (percent: percent, tier: from == 0 ? 'Hủy trước giờ chạy: $refund' : 'Hủy từ $from giờ trở lên trước giờ chạy: $refund');
    final to = tiers[i - 1].minHours;
    return (percent: percent, tier: from == 0 ? 'Hủy dưới $to giờ trước giờ chạy: $refund' : 'Hủy trước giờ chạy $from-$to giờ: $refund');
  }
}

/// A home address the server accepted for pickup or drop-off, with its fee.
class HomeAddress {
  const HomeAddress({required this.address, required this.lat, required this.lng, required this.feeVnd, required this.areaName, this.note = '', this.needsReview = false});
  final String address;
  /// The area's company reviews each address first (D130): until then the passenger boards at the stop.
  final bool needsReview;
  final double lat;
  final double lng;
  final int feeVnd;
  final String areaName;
  final String note;

  Map<String, dynamic> toJson() => {'address': address, 'lat': lat, 'lng': lng, if (note.isNotEmpty) 'note': note};
}

/// The company's fixed origin and destination (D135), set on the web portal; null lets passengers pick places.
class FixedEndpoints {
  const FixedEndpoints({required this.originCity, required this.originStation, required this.destCity, required this.destStation, required this.forward, required this.reverse, this.allowSwap = true});
  final String originCity;
  final String originStation;
  final String destCity;
  final String destStation;
  /// Whether a schedule runs origin -> destination, and the other way.
  final bool forward;
  final bool reverse;
  /// The company runs out and back and lets passengers swap (D136); off for a one-way line.
  final bool allowSwap;

  static FixedEndpoints? fromJson(dynamic j) {
    if (j is! Map<String, dynamic> || j['origin'] == null || j['destination'] == null) return null;
    return FixedEndpoints(
      originCity: '${j['origin']['city']}',
      originStation: '${j['origin']['name']}',
      destCity: '${j['destination']['city']}',
      destStation: '${j['destination']['name']}',
      forward: j['forward_available'] != false,
      reverse: j['reverse_available'] == true,
      allowSwap: j['allow_swap'] != false,
    );
  }
}

class Place {
  const Place(this.code, this.city, this.station, this.altStations);
  final String code;
  final String city;
  final String station;
  final List<String> altStations;
}


class Stop {
  const Stop(this.id, this.name, this.city, this.time, {required this.pickup, required this.dropoff, this.station = true, this.lat, this.lng, this.estimated = false});
  final String id;
  final String name;
  final String city;
  final String time;
  final bool pickup;
  final bool dropoff;
  /// A bus station (bến xe); false for a roadside point (điểm dọc đường).
  final bool station;
  final double? lat;
  final double? lng;
  /// The time is the server's estimate along the road, not one the company set (source spec 4.5).
  final bool estimated;
  /// "07:40", or "~07:40" when it is an estimate.
  String get timeLabel => estimated ? '~$time' : time;
  String get note => pickup && dropoff ? 'Đón và trả khách' : (pickup ? 'Điểm đón' : 'Điểm trả');
  String get short => name.replaceFirst('Bến xe ', '').replaceFirst('Phía Bắc Thanh Hóa', 'Phía Bắc TH');
}

const bookingClosedCodes = {
  'TRIP_DEPARTED',
  'BOOKING_CUTOFF_PASSED',
  'SALES_CLOSED',
  'TRIP_CANCELLED',
  'TRIP_COMPLETED',
  'ROUTE_SUSPENDED',
  'TRIP_NOT_SCHEDULED',
};

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
    this.day = '',
    this.stopStyle = 'STATIONS',
    this.pickupModes = const ['FIXED_STOP'],
    this.dropoffModes = const ['FIXED_LOCATION'],
    this.routeShape = const [],
    this.bookable = true,
    this.blockCode,
    this.blockMessage,
    this.bookUntil,
  });
  /// How the route offers fixed stops: ROUTE_LINE (drawn like a bus line) or STATIONS (stations only).
  final String stopStyle;
  /// The route's pickup / drop-off modes (the company default unless the route sets its own).
  final List<String> pickupModes;
  final List<String> dropoffModes;
  final List<(double, double)> routeShape;
  bool get routeLine => stopStyle == 'ROUTE_LINE';
  bool get homePickup => pickupModes.contains('HOME_PICKUP');
  bool get homeDropoff => dropoffModes.contains('HOME_DROPOFF');
  final String id;
  /// Departure day (YYYY-MM-DD, Vietnam time) of this run: what the ticket will say, whatever was picked.
  final String day;
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

  final bool bookable;
  final String? blockCode;
  final String? blockMessage;
  final DateTime? bookUntil;

  bool get bookableNow => bookable && (bookUntil == null || DateTime.now().isBefore(bookUntil!));

  String get blockLabel {
    if (blockCode == 'TRIP_DEPARTED') return 'Đã xuất bến';
    if (blockCode == 'SALES_CLOSED') return 'Nhà xe ngừng bán';
    if (blockCode == 'TRIP_CANCELLED') return 'Nhà xe đã hủy chuyến';
    if (blockCode == 'BOOKING_CUTOFF_PASSED' || (bookUntil != null && !DateTime.now().isBefore(bookUntil!))) {
      return 'Hết giờ đặt online';
    }
    return 'Không đặt được';
  }

  String? get effectiveBlockMessage {
    if (blockMessage != null && blockMessage!.isNotEmpty) return blockMessage;
    if (bookUntil != null && !DateTime.now().isBefore(bookUntil!)) {
      return 'Đã hết giờ đặt vé trực tuyến. Gọi tổng đài nhà xe để được hỗ trợ.';
    }
    return null;
  }

  Trip copyWith({
    String? id,
    String? dep,
    String? arr,
    String? duration,
    String? type,
    bool? vip,
    int? price,
    String? from,
    String? to,
    String? via,
    int? seatsLeft,
    String? plate,
    List<Stop>? stops,
    String? day,
    String? stopStyle,
    List<String>? pickupModes,
    List<String>? dropoffModes,
    List<(double, double)>? routeShape,
    bool? bookable,
    String? blockCode,
    String? blockMessage,
    DateTime? bookUntil,
  }) {
    return Trip(
      id: id ?? this.id,
      dep: dep ?? this.dep,
      arr: arr ?? this.arr,
      duration: duration ?? this.duration,
      type: type ?? this.type,
      vip: vip ?? this.vip,
      price: price ?? this.price,
      from: from ?? this.from,
      to: to ?? this.to,
      via: via ?? this.via,
      seatsLeft: seatsLeft ?? this.seatsLeft,
      plate: plate ?? this.plate,
      stops: stops ?? this.stops,
      day: day ?? this.day,
      stopStyle: stopStyle ?? this.stopStyle,
      pickupModes: pickupModes ?? this.pickupModes,
      dropoffModes: dropoffModes ?? this.dropoffModes,
      routeShape: routeShape ?? this.routeShape,
      bookable: bookable ?? this.bookable,
      blockCode: blockCode ?? this.blockCode,
      blockMessage: blockMessage ?? this.blockMessage,
      bookUntil: bookUntil ?? this.bookUntil,
    );
  }

  factory Trip.fromJson(Map<String, dynamic> j) {
    final dep = DateTime.parse(j['departure_time']).toUtc().add(const Duration(hours: 7));
    final arr = DateTime.parse(j['arrival_time']).toUtc().add(const Duration(hours: 7));
    final minutes = (j['duration_minutes'] as num?)?.toInt() ?? arr.difference(dep).inMinutes;
    // Stops the company hid are not offered; the others keep their order.
    final raw = (j['stops'] as List? ?? []).cast<Map<String, dynamic>>().where((s) => s['hidden'] != true).toList()..sort((a, b) => (a['order'] as num).compareTo(b['order'] as num));
    final n = raw.length;
    final stops = [
      for (var i = 0; i < n; i++)
        Stop(
          raw[i]['stop_id'],
          raw[i]['name'],
          raw[i]['city'] ?? '',
          // The server's planned time (set by the company or estimated along the road); an even split otherwise.
          DateTime.tryParse('${raw[i]['planned_time']}') != null
              ? _hhmm(DateTime.parse('${raw[i]['planned_time']}').toUtc().add(const Duration(hours: 7)))
              : _hhmm(dep.add(Duration(minutes: n > 1 ? (minutes * i / (n - 1)).round() : 0))),
          pickup: raw[i]['pickup_allowed'] == true,
          dropoff: raw[i]['dropoff_allowed'] == true,
          station: raw[i]['kind'] != 'ROADSIDE',
          lat: (raw[i]['lat'] as num?)?.toDouble(),
          lng: (raw[i]['lng'] as num?)?.toDouble(),
          // The departure is exact; any other time without a company value is an estimate.
          estimated: i > 0 && raw[i]['time_source'] != 'OPERATOR',
        ),
    ];
    final firstPick = stops.firstWhere((s) => s.pickup, orElse: () => stops.first);
    final middle = stops.where((s) => s.pickup && s.dropoff).toList();
    return Trip(
      id: j['trip_id'],
      day: '${dep.year.toString().padLeft(4, '0')}-${_two(dep.month)}-${_two(dep.day)}',
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
      stopStyle: '${j['service']?['stop_style'] ?? 'STATIONS'}',
      pickupModes: [for (final m in (j['service']?['pickup_modes'] as List? ?? const ['FIXED_STOP'])) '$m'],
      dropoffModes: [for (final m in (j['service']?['dropoff_modes'] as List? ?? const ['FIXED_LOCATION'])) '$m'],
      routeShape: [for (final p in (j['route_shape'] as List? ?? const [])) ((p[0] as num).toDouble(), (p[1] as num).toDouble())],
      bookable: (j['bookable'] == false || j['bookable'] == 'false') ? false : true,
      blockCode: j['block_code'] as String?,
      blockMessage: j['block_message'] as String?,
      bookUntil: j['book_until'] != null ? DateTime.tryParse('${j['book_until']}') : null,
    );
  }
}

enum SeatState { free, held, booked, blocked }

/// A seat or sleeper berth on a deck grid.
class Seat {
  const Seat(
    this.code,
    this.deck,
    this.state, {
    this.row = 1,
    this.column = 1,
    this.type = 'VIP_CABIN',
  });
  final String code;
  final int deck;
  final SeatState state;
  final int row;
  final int column;
  final String type;
}

enum TicketStatus { active, boarded, refunding, cancelled, noShow }

class Ticket {
  Ticket({
    required this.id,
    required this.pnr,
    this.orderId,
    List<String>? ticketIds,
    required this.tripId,
    required this.route,
    required this.date,
    required this.dep,
    this.departureTime,
    required this.seat,
    required this.pickup,
    this.dropoff = '',
    required this.paid,
    required this.name,
    required this.status,
    this.plate = '',
    this.homePickup,
    this.homeDropoff,
    this.pickupWindow,
    this.pickupNotice,
    this.homePickupStatus,
    this.homeDropoffStatus,
    this.homePickupReason,
    this.homeDropoffReason,
    this.past = false,
    this.pickupTime,
    this.pickupTimeEstimated = false,
    this.paymentStatus = '',
    this.paymentMethod = 'VIETQR_NAPAS247',
    this.codDue = 0,
    this.refundInfo,
  }) : ticketIds = ticketIds ?? (id.isNotEmpty ? [id] : const []);
  final String id;
  final String pnr;
  final String? orderId;
  final List<String> ticketIds;
  final String tripId;
  final String route;
  final String date;
  final String dep;
  final String? departureTime;
  final String seat;
  final String pickup;
  final String dropoff;
  final int paid;
  final String name;
  final String paymentStatus;
  final String paymentMethod;
  final int codDue;
  /// Planned pickup stop time if different from first departure.
  final String? pickupTime;
  final bool pickupTimeEstimated;
  /// Home pickup / drop-off address (spec 3.1); the ticket still rides from [pickup] to [dropoff].
  final String? homePickup;
  final String? homeDropoff;
  /// "05:00–05:40": when the pickup run reaches a home pickup.
  final String? pickupWindow;
  /// Set when the driver reported the home address unreachable: why, and where to meet.
  final String? pickupNotice;
  /// CONFIRMED, PENDING_REVIEW (the company has not answered), REJECTED or WITHDRAWN (D130).
  final String? homePickupStatus;
  final String? homeDropoffStatus;
  /// Why the company refused it.
  final String? homePickupReason;
  final String? homeDropoffReason;

  static const homeStatusLabel = {'CONFIRMED': 'Đã xác nhận', 'PENDING_REVIEW': 'Chờ nhà xe duyệt', 'REJECTED': 'Nhà xe không nhận', 'WITHDRAWN': 'Đã hủy yêu cầu'};
  bool homeLive(String? status) => status == 'CONFIRMED' || status == 'PENDING_REVIEW';
  String plate;
  TicketStatus status;
  int delay = 0;
  int qrVersion = 1;
  String? qrValue;
  String? pin;
  int? refund;
  TicketRefund? refundInfo;
  bool past;
  /// D178: the pass shown is the one saved on the device; the server could not be reached.
  bool qrFromCache = false;

  Ticket copyWith({
    String? id,
    String? pnr,
    String? orderId,
    List<String>? ticketIds,
    String? tripId,
    String? route,
    String? date,
    String? dep,
    String? departureTime,
    String? seat,
    String? pickup,
    String? dropoff,
    int? paid,
    String? name,
    TicketStatus? status,
    String? plate,
    String? homePickup,
    String? homeDropoff,
    String? pickupWindow,
    String? pickupNotice,
    String? homePickupStatus,
    String? homeDropoffStatus,
    String? homePickupReason,
    String? homeDropoffReason,
    bool? past,
    String? pickupTime,
    bool? pickupTimeEstimated,
    String? paymentStatus,
    String? paymentMethod,
    int? codDue,
    TicketRefund? refundInfo,
    int? delay,
    int? qrVersion,
    String? qrValue,
    String? pin,
    int? refund,
    bool? qrFromCache,
  }) {
    final t = Ticket(
      id: id ?? this.id,
      pnr: pnr ?? this.pnr,
      orderId: orderId ?? this.orderId,
      ticketIds: ticketIds ?? this.ticketIds,
      tripId: tripId ?? this.tripId,
      route: route ?? this.route,
      date: date ?? this.date,
      dep: dep ?? this.dep,
      departureTime: departureTime ?? this.departureTime,
      seat: seat ?? this.seat,
      pickup: pickup ?? this.pickup,
      dropoff: dropoff ?? this.dropoff,
      paid: paid ?? this.paid,
      name: name ?? this.name,
      status: status ?? this.status,
      plate: plate ?? this.plate,
      homePickup: homePickup ?? this.homePickup,
      homeDropoff: homeDropoff ?? this.homeDropoff,
      pickupWindow: pickupWindow ?? this.pickupWindow,
      pickupNotice: pickupNotice ?? this.pickupNotice,
      homePickupStatus: homePickupStatus ?? this.homePickupStatus,
      homeDropoffStatus: homeDropoffStatus ?? this.homeDropoffStatus,
      homePickupReason: homePickupReason ?? this.homePickupReason,
      homeDropoffReason: homeDropoffReason ?? this.homeDropoffReason,
      past: past ?? this.past,
      pickupTime: pickupTime ?? this.pickupTime,
      pickupTimeEstimated: pickupTimeEstimated ?? this.pickupTimeEstimated,
      paymentStatus: paymentStatus ?? this.paymentStatus,
      paymentMethod: paymentMethod ?? this.paymentMethod,
      codDue: codDue ?? this.codDue,
      refundInfo: refundInfo ?? this.refundInfo,
    );
    t.delay = delay ?? this.delay;
    t.qrVersion = qrVersion ?? this.qrVersion;
    t.qrValue = qrValue ?? this.qrValue;
    t.pin = pin ?? this.pin;
    t.refund = refund ?? this.refund;
    t.qrFromCache = qrFromCache ?? this.qrFromCache;
    return t;
  }

  bool get unpaidCash => paymentStatus == 'UNPAID_COD' && codDue > 0;

  /// Whether the ticket is paid and how, as the passenger reads it (D187).
  String get paymentLabel {
    if (unpaidCash) return 'Chưa thanh toán · trả ${vnd(codDue)} tiền mặt khi lên xe';
    final how = switch (paymentMethod) {
      'CASH' || 'COD' => 'tiền mặt',
      'VIETQR' || 'VIETQR_NAPAS247' || 'BANK_TRANSFER' => 'chuyển khoản VietQR',
      'VNPAY_ONLINE' => 'VNPAY',
      'COUNTER' || 'CASH_POS' => 'tại quầy',
      'CARD_POS' => 'thẻ tại quầy',
      _ => '',
    };
    return how.isEmpty ? 'Đã thanh toán' : 'Đã thanh toán · $how';
  }

  bool get isTransferPayment => !unpaidCash && paymentMethod != 'CASH';
  bool get active => status == TicketStatus.active || status == TicketStatus.boarded;
  bool get isGroup => ticketIds.length > 1 || seat.contains(',');
  String get departure => delay == 0 ? dep : addMinutes(dep, delay);
  String get effectivePickupTime {
    final base = pickupTime ?? dep;
    return delay == 0 ? base : addMinutes(base, delay);
  }
  String get pickupTimeLabel => '${pickupTimeEstimated ? 'khoảng ' : ''}$effectivePickupTime';

  factory Ticket.fromJson(Map<String, dynamic> j, {bool past = false}) {
    final dep = DateTime.parse(j['departure_time']).toUtc().add(const Duration(hours: 7));
    String? pTime;
    if (j['pickup_time'] != null) {
      try {
        final parsed = DateTime.parse(j['pickup_time']).toUtc().add(const Duration(hours: 7));
        pTime = _hhmm(parsed);
      } catch (_) {
        pTime = j['pickup_time']?.toString();
      }
    }
    final status = switch (j['status']) {
      'ACTIVE' => TicketStatus.active,
      'BOARDED' => TicketStatus.boarded,
      'NO_SHOW' => TicketStatus.noShow,
      'REFUND_REQUESTED' || 'REFUNDED' => TicketStatus.refunding,
      _ => TicketStatus.cancelled,
    };
    final tktIds = (j['ticket_ids'] as List?)?.map((e) => e.toString()).toList() ??
        (j['ticket_id'] != null ? [j['ticket_id'].toString()] : const <String>[]);
    return Ticket(
      id: j['ticket_id'] ?? (tktIds.isNotEmpty ? tktIds.first : ''),
      pnr: j['pnr'] ?? '',
      orderId: j['order_id']?.toString(),
      ticketIds: tktIds,
      tripId: j['trip_id'],
      route: routeLabel(j['route_name'] ?? ''),
      date: '${const ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][dep.weekday % 7]} ${_two(dep.day)}/${_two(dep.month)}',
      dep: _hhmm(dep),
      departureTime: j['departure_time']?.toString(),
      seat: j['seat_code'] ?? '',
      pickup: '${j['pickup_stop'] ?? ''}'.replaceFirst('Bến xe ', ''),
      dropoff: '${j['dropoff_stop'] ?? ''}'.replaceFirst('Bến xe ', ''),
      paid: (j['fare_vnd'] as num?)?.toInt() ?? 0,
      name: j['passenger_name'] ?? '',
      status: status,
      plate: j['vehicle_plate']?.toString() ?? j['plate']?.toString() ?? '',
      homePickup: j['home_pickup']?['address'],
      homeDropoff: j['home_dropoff']?['address'],
      pickupWindow: _window(j['home_pickup']),
      homePickupStatus: j['home_pickup'] == null ? null : '${j['home_pickup']['status'] ?? 'CONFIRMED'}',
      homeDropoffStatus: j['home_dropoff'] == null ? null : '${j['home_dropoff']['status'] ?? 'CONFIRMED'}',
      homePickupReason: j['home_pickup']?['reject_reason'],
      homeDropoffReason: j['home_dropoff']?['reject_reason'],
      pickupNotice: j['home_pickup']?['inaccessible_at'] == null
          ? null
          : 'Xe không vào được địa chỉ (${j['home_pickup']['inaccessible_reason'] ?? ''})${j['home_pickup']['meeting_point'] != null ? '. Hẹn ở ${j['home_pickup']['meeting_point']}' : '. Tài xế sẽ gọi cho bạn'}',
      past: past || j['trip_completed'] == true,
      pickupTime: pTime,
      pickupTimeEstimated: j['pickup_time_estimated'] == true,
      paymentStatus: '${j['payment_status'] ?? ''}',
      paymentMethod: '${j['payment_method'] ?? (j['payment_status'] == 'UNPAID_COD' ? 'CASH' : 'VIETQR_NAPAS247')}',
      codDue: (j['cod_amount_vnd'] as num?)?.toInt() ?? 0,
      refundInfo: j['refund'] is Map<String, dynamic>
          ? TicketRefund.fromJson(j['refund'] as Map<String, dynamic>)
          : (j['refund_id'] != null || j['refund_status'] != null ? TicketRefund.fromJson(j) : null),
    )..refund = (j['refund'] is Map<String, dynamic> ? (j['refund']['amount_vnd'] as num?)?.toInt() : null) ?? (j['refund_amount_vnd'] as num?)?.toInt();
  }
}

String? _window(dynamic home) {
  final from = DateTime.tryParse('${home?['window_from'] ?? ''}');
  final to = DateTime.tryParse('${home?['window_to'] ?? ''}');
  if (from == null || to == null) return null;
  DateTime vn(DateTime d) => d.toUtc().add(const Duration(hours: 7));
  return '${_hhmm(vn(from))}–${_hhmm(vn(to))}';
}

/// One slide of the home promotion slider (PAX-004, D124); its HTML page is fetched on open.
class PromoBanner {
  const PromoBanner({required this.id, required this.title, this.subtitle = '', this.color, this.imageUrl});
  final String id;
  final String title;
  final String subtitle;
  final Color? color;
  final String? imageUrl;

  factory PromoBanner.fromJson(Map<String, dynamic> j) => PromoBanner(
        id: '${j['banner_id'] ?? ''}',
        title: '${j['title'] ?? ''}',
        subtitle: '${j['subtitle'] ?? ''}',
        color: _hexColor(j['background_color']),
        imageUrl: (j['image_url'] as String?)?.isNotEmpty == true ? j['image_url'] as String : null,
      );
}

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

Color? _hexColor(Object? hex) {
  if (hex is! String || !RegExp(r'^#[0-9A-Fa-f]{6}$').hasMatch(hex)) return null;
  return Color(0xFF000000 | int.parse(hex.substring(1), radix: 16));
}

class AppNotice {
  AppNotice(this.title, this.body, this.time, {this.tripId, this.type = '', this.id = '', this.ticketId, this.pnr, this.isRead = true});
  final String title;
  final String body;
  final String time;
  final String? tripId;
  final String type;
  final String id;
  final String? ticketId;
  final String? pnr;
  final bool isRead;

  /// D144: the notices that make someone go out to the bus; the app shows them on top of any screen.
  static const alertTypes = {'HOME_RUN_STARTED', 'PICKUP_APPROACHING', 'PICKUP_ARRIVED', 'HOME_PICKUP_ARRIVED', 'HOME_PICKUP_DOOR', 'HOME_PICKUP_MISSED', 'HOME_PICKUP_INACCESSIBLE'};
}

enum GpsSignal { live, stale, offline, none }

class TrackingTarget {
  const TrackingTarget({
    required this.stopId,
    required this.name,
    required this.lat,
    required this.lng,
    required this.isDropoff,
    this.isHome = false,
  });
  final String stopId;
  final String name;
  final double lat;
  final double lng;
  final bool isDropoff;
  /// D143: the bus collects the passenger at their home address.
  final bool isHome;
}

/// Where the bus is on its route, as the server names it (D143).
class BusLocation {
  const BusLocation({this.atStop, this.lastPassed, this.next, this.stopsBefore});
  final String? atStop;
  final String? lastPassed;
  final String? next;
  /// Stops the bus still serves before the passenger's own; null when unknown.
  final int? stopsBefore;

  static String _short(String name) => name.replaceFirst('Bến xe ', '');

  /// "Xe đang ở Phủ Lý" / "Xe vừa qua Phủ Lý, sắp tới Ninh Bình".
  String get sentence {
    if (atStop != null) return 'Xe đang ở ${_short(atStop!)}';
    if (lastPassed != null && next != null) return 'Xe vừa qua ${_short(lastPassed!)}, sắp tới ${_short(next!)}';
    if (next != null) return 'Xe đang trên đường tới ${_short(next!)}';
    return 'Xe đang trên đường';
  }

  /// "Còn 2 trạm nữa tới bạn" / "Trạm kế tiếp là trạm của bạn".
  String? get stopsLeft => switch (stopsBefore) {
        null => null,
        0 => 'Trạm kế tiếp là trạm của bạn',
        final n => 'Còn $n trạm nữa tới trạm của bạn',
      };
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
    this.plannedAt,
    this.windowFrom,
    this.windowTo,
    this.expectedAt,
    this.lateMinutes,
    this.location,
    this.atTarget = false,
    this.appointmentAt,
    this.queuePosition,
    this.queueTotal,
    this.readyStatus,
    this.unreachable = false,
    this.readyMinutes,
    this.homeWaitMinutes,
    this.doorArrivedAt,
    this.nearDoor = false,
    this.atDoor = false,
    this.ended = false,
    this.tripStatus,
  });

  /// The passenger's phone could not reach the server; nothing is known about the bus from this answer.
  final bool unreachable;
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
  /// When the passenger was told to be ready (the stop time, or the start of the home pickup window), Vietnam time.
  final DateTime? plannedAt;
  final DateTime? windowFrom;
  final DateTime? windowTo;
  /// When the bus is expected at the passenger, from its live position.
  final DateTime? expectedAt;
  final int? lateMinutes;
  final BusLocation? location;
  /// The bus is at the passenger's stop or door.
  final bool atTarget;
  /// D144, home pickup: the time given to this passenger, their place in the run, their answer, the wait at the door.
  final DateTime? appointmentAt;
  final int? queuePosition;
  final int? queueTotal;
  final String? readyStatus;
  final int? readyMinutes;
  final int? homeWaitMinutes;
  final DateTime? doorArrivedAt;
  /// D159, home pickup: the bus is a few hundred metres from the door, or pulled up at it.
  final bool nearDoor;
  final bool atDoor;
  final bool ended;
  final String? tripStatus;
}

/// Result of a call: null message means success.
class ApiResult<T> {
  const ApiResult(this.value, [this.error, this.code, this.raw]);
  final T? value;
  final String? error;
  final String? code;
  final Map<String, dynamic>? raw;
  bool get ok => error == null;
}

String _two(int v) => v.toString().padLeft(2, '0');
String _hhmm(DateTime t) => '${_two(t.hour)}:${_two(t.minute)}';
/// "08:12" of a Vietnam-time instant.
String clockOf(DateTime t) => _hhmm(t);
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

  static const appVersion = passengerAppVersion;

  OperatorInfo? operator;
  Map<String, Place> places = {};

  bool get insuranceEnabled => operator?.insuranceEnabled ?? false;
  bool get walletEnabled => operator?.walletEnabled ?? false;

  int walletBalanceVnd = 0;

  static const maxSeats = 5;

  // Session
  String? userName;
  String? userPhone;
  /// The photo the passenger chose (D186), kept on the device so it shows offline too.
  Uint8List? userAvatar;
  bool isVip = false;
  bool get loggedIn => api.authToken != null;

  /// D178: when the wallet shown was saved, while the server cannot be reached; null when it is fresh.
  DateTime? walletOfflineSince;
  /// Why the last payment check had no answer ('NETWORK'), so a manual check does not blame the transfer.
  String? lastPaymentCheckCode;
  /// Error code of the last holdSeats or createOrder failure (D185).
  String? lastErrorCode;
  /// No station could be shown, not even saved ones; the home screen offers to try again.
  String? placesError;

  /// The server refused the saved session as expired; the wallet asks to sign in again and says why.
  bool sessionExpired = false;
  String? devOtp; // development server only: fills the OTP field like an SMS autofill

  // Search
  String origin = '';
  String dest = '';
  /// Travel day, YYYY-MM-DD in Vietnam time; empty means the server's today.
  String _date = '';
  /// Today and the last bookable day, from the server (never the phone clock alone).
  ServiceCalendar calendar = ServiceCalendar.fallback();
  String get date => _date.isEmpty || !calendar.allows(_date) ? calendar.today : _date;
  String sort = 'time';
  List<Trip> trips = [];
  bool loadingTrips = false;
  String? tripsError;

  // Booking funnel
  Trip? trip;
  String pickup = '';
  String dropoff = '';
  HomeAddress? homePickup;
  HomeAddress? homeDropoff;
  List<ServiceArea> serviceAreas = [];
  CancelPolicy cancelPolicy = CancelPolicy.fallback;
  int get homeFees => isVip ? 0 : (homePickup?.feeVnd ?? 0) + (homeDropoff?.feeVnd ?? 0);
  int deck = 1;
  int seatColumns = 1;
  List<Seat> seatMap = [];
  bool loadingSeats = false;
  final List<String> seats = [];
  String? holdId;
  String? voucher;
  int voucherDiscount = 0;
  bool insured = false;
  String paymentMethod = 'VIETQR_NAPAS247';
  bool get payByCash => paymentMethod == 'CASH';
  /// A company that takes cash only starts on cash; a 0 đ order is always settled as a transfer.
  String get defaultPaymentMethod => operator?.allowTransfer == false && operator?.allowCash != false ? 'CASH' : 'VIETQR_NAPAS247';

  // Order and payment (PAX-013)
  String? orderId;
  String? orderPnr;
  int orderAmount = 0;
  /// After an underpaid transfer: what the bank reported and what is still missing (D189).
  int orderPaidVnd = 0;
  int orderRemainingVnd = 0;
  bool get underpaid => orderPaidVnd > 0 && orderRemainingVnd > 0;
  /// What the passenger still has to transfer.
  int get amountDue => underpaid ? orderRemainingVnd : orderAmount;
  String get underpaidNotice => 'Đã nhận ${vnd(orderPaidVnd)}. Còn thiếu ${vnd(orderRemainingVnd)}: chuyển thêm ${vnd(orderRemainingVnd)} với đúng nội dung bên dưới.';
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

  // Home promotion slider: empty (also on any error) hides it
  List<PromoBanner> banners = [];

  // Wallet and notices
  List<Ticket> tickets = [];
  bool loadingTickets = false;
  List<AppNotice> notices = [];
  bool unread = false;

  Place get originPlace => places.isEmpty ? const Place('', '—', '', []) : (places[origin] ?? const Place('', '—', '', []));
  Place get destPlace => places.isEmpty ? const Place('', '—', '', []) : (places[dest] ?? const Place('', '—', '', []));

  /// Fixed origin and destination of the company (D135).
  FixedEndpoints? fixedEndpoints;
  bool get fixedRoute => fixedEndpoints != null;
  /// The company decides on the web portal whether passengers may swap (D136).
  bool get canSwap => fixedEndpoints?.allowSwap ?? true;

  List<List<String>> get recentPairs {
    if (places.isEmpty || fixedRoute) return [];
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

  TravelDate get travelDate => TravelDate.of(date, today: calendar.today);
  List<TravelDate> get bookableDates => [for (final d in calendar.days) TravelDate.of(d, today: calendar.today)];

  ApiResult<Map<String, dynamic>> _result(Map<String, dynamic> json) {
    // A session that ran out while the app stayed open (12 h): sign out at once instead of showing an empty wallet.
    if ((json['code'] == 'TOKEN_EXPIRED' || json['code'] == 'INVALID_TOKEN') && api.authToken != null) {
      sessionExpired = true;
      logout();
    }
    if (json['status'] == 'success') return ApiResult(json['data'] is Map<String, dynamic> ? json['data'] as Map<String, dynamic> : {'value': json['data']});
    return ApiResult(null, '${json['message'] ?? 'Có lỗi, thử lại sau.'}', '${json['code'] ?? ''}', json);
  }

  Future<ApiResult<Map<String, dynamic>>> _call(Future<Map<String, dynamic>> Function() request) async {
    try {
      return _result(await request());
    } catch (_) {
      return const ApiResult(null, _networkError, 'NETWORK');
    }
  }

  // ---------- Operator & Places ----------
  void _applyConfig(String code, Map<String, dynamic> config, SharedPreferences prefs) {
    api.operatorCode = code;
    operator = OperatorInfo.fromJson(config['operator'] as Map<String, dynamic>);
    paymentMethod = defaultPaymentMethod;
    calendar = ServiceCalendar.fromJson(config['service_calendar'] as Map<String, dynamic>?);
    fixedEndpoints = FixedEndpoints.fromJson(config['fixed_endpoints']);
    _rememberedRides = _readRides(prefs.getString('rides_$code'));
  }

  Future<String?> selectOperator(String rawCode) async {
    final code = rawCode.trim().toUpperCase();
    if (code.isEmpty) return 'Nhập mã nhà xe';
    
    final r = await _call(() => api.getAppConfig(operatorCode: code));
    if (!r.ok) return r.error;
    
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('operator_code', code);
    // D178: kept so the app opens on this company without a network.
    await prefs.setString('config_$code', jsonEncode(r.value!));
    _applyConfig(code, r.value!, prefs);
    
    await loadPlaces();
    notifyListeners();
    unawaited(loadBanners());
    unawaited(loadRunDays());
    return null;
  }

  Future<void> loadBanners() async {
    final r = await _call(api.getPromoBanners);
    final list = r.ok ? r.value!['banners'] : null;
    banners = list is List ? [for (final b in list) if (b is Map<String, dynamic> && b['banner_id'] != null) PromoBanner.fromJson(b)] : [];
    notifyListeners();
  }

  LegalInfo? legalInfo;

  /// SH-006: the terms and notices come from the server so they change without an app release (D157).
  Future<ApiResult<LegalInfo>> loadLegal() async {
    final r = await _call(api.getLegal);
    if (!r.ok) return ApiResult(null, r.error, r.code);
    final info = LegalInfo.fromJson(r.value!);
    legalInfo = info;
    return ApiResult(info);
  }

  /// The HTML page of one slide; the error is shown in place of the page.
  Future<ApiResult<String>> loadBannerPage(String bannerId) async {
    final r = await _call(() => api.getPromoBanner(bannerId));
    if (!r.ok) return ApiResult(null, r.error, r.code);
    return ApiResult('${r.value!['content_html'] ?? ''}');
  }

  Future<void> restoreOperator() async {
    final prefs = await SharedPreferences.getInstance();
    final code = prefs.getString('operator_code');
    if (code != null && code.isNotEmpty) {
      final error = await selectOperator(code); // other errors: the passenger picks the company again
      // D178: offline, the company saved on the last start; the wallet and its passes come from the device too.
      final cached = prefs.getString('config_$code');
      if (operator == null && error == _networkError && cached != null) {
        try {
          _applyConfig(code, jsonDecode(cached) as Map<String, dynamic>, prefs);
          await loadPlaces();
        } catch (_) {}
      }
      if (operator != null) await _restoreSession(prefs);
    }
  }

  static const _sessionKey = 'passenger_session';

  /// Keeps the signed-in passenger on the device so reopening the app does not ask for an OTP again.
  Future<void> _saveSession() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_sessionKey, jsonEncode({'token': api.authToken, 'operator_code': operator?.code, 'phone': userPhone, 'name': userName, 'vip': isVip}));
  }

  /// Signs the passenger back in with the saved token of this company while it has not expired.
  Future<void> _restoreSession(SharedPreferences prefs) async {
    final raw = prefs.getString(_sessionKey);
    if (raw == null) return;
    try {
      final s = jsonDecode(raw) as Map<String, dynamic>;
      final token = s['token'];
      if (token is! String || s['operator_code'] != operator?.code || !tokenStillValid(token)) {
        isVip = false;
        await prefs.remove(_sessionKey);
        return;
      }
      api.authToken = token;
      userPhone = s['phone'] as String?;
      userName = s['name'] as String?;
      isVip = s['vip'] == true;
      final avatar = prefs.getString(_avatarKey);
      userAvatar = avatar == null ? null : base64Decode(avatar);
    } catch (_) {
      isVip = false;
      await prefs.remove(_sessionKey);
      return;
    }
    notifyListeners();
    unawaited(loadTickets());
    unawaited(loadNotices());
    unawaited(_registerDevice());
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

  Future<void> changeOperator() async {
    await logout();
    operator = null;
    fixedEndpoints = null;
    places.clear();
    banners = [];
    runDays = null;
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

  void _populatePlaces(List<dynamic> json) {
    final cityGroups = <String, List<Map<String, dynamic>>>{};
    for (final s in json) {
      if (s is! Map<String, dynamic>) continue;
      final city = s['city'] as String? ?? '';
      if (city.isEmpty) continue;
      final code = _foldToCode(city);
      (cityGroups[code] ??= []).add(s);
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

    final fixed = fixedEndpoints;
    if (fixed != null) {
      // The two stations the company set: shown as they are, nothing else to pick.
      final o = _foldToCode(fixed.originCity);
      final d = _foldToCode(fixed.destCity);
      places[o] = Place(o, fixed.originCity, fixed.originStation, const []);
      places[d] = Place(d, fixed.destCity, fixed.destStation, const []);
      origin = o;
      dest = d;
    } else if (places.isNotEmpty) {
      final hn = places.values.where((p) => p.city == 'Hà Nội').firstOrNull;
      origin = hn?.code ?? places.keys.first;
      
      final th = places.values.where((p) => p.city == 'Thanh Hóa').firstOrNull;
      dest = th?.code ?? places.keys.lastWhere((k) => k != origin, orElse: () => places.keys.first);
    }
  }

  Future<void> loadPlaces() async {
    final prefs = await SharedPreferences.getInstance();
    final op = operator?.code ?? api.operatorCode ?? prefs.getString('operator_code') ?? '';
    try {
      final json = await api.searchStations('');
      _populatePlaces(json);
      placesError = null;
      if (op.isNotEmpty) {
        await prefs.setString('stations_$op', jsonEncode(json));
      }
    } catch (_) {
      // D178: offline, the stations saved on the last start, so the search form is never blank.
      final cached = op.isNotEmpty ? prefs.getString('stations_$op') : null;
      if (cached != null) {
        try {
          final list = (jsonDecode(cached) as List).cast<dynamic>();
          _populatePlaces(list);
          placesError = null;
          notifyListeners();
          return;
        } catch (_) {}
      }
      placesError = _networkError;
    }
    notifyListeners();
  }


  // ---------- Login (PAX-002 / PAX-003) ----------
  int otpCooldownSeconds = 60;
  int? lastRemainingCooldown;

  Future<String?> requestOtp(String phone) async {
    final r = await _call(() => api.requestOtp(phone));
    if (!r.ok) {
      // COOLDOWN_ACTIVE tells how long to wait; the resend button counts it down.
      final details = r.raw?['details'];
      final cd = details is Map ? details['remainingCooldown'] : null;
      lastRemainingCooldown = cd is num && cd > 0 ? cd.toInt() : null;
      return r.error;
    }
    lastRemainingCooldown = null;
    devOtp = r.value!['mock_otp']?.toString();
    final cd = r.value!['cooldown_seconds'];
    if (cd is num && cd > 0) {
      otpCooldownSeconds = cd.toInt();
    }
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
    sessionExpired = false;
    userName = _chosenName(r.value!['user']?['full_name']);
    isVip = r.value!['user']?['is_vip'] == true;
    devOtp = null;
    final op = r.value!['user']?['operator'];
    if (op is Map<String, dynamic>) {
      operator = OperatorInfo.fromJson(op);
    }
    await _saveSession();
    notifyListeners();
    unawaited(loadProfile());
    unawaited(loadTickets());
    unawaited(loadNotices());
    // D144: the server learns this phone runs the app (a push token joins once push is set up).
    unawaited(_registerDevice());
    return null;
  }

  static String? _chosenName(Object? name) => name is String && name.trim().isNotEmpty && name != 'Hành khách BusGo' ? name : null;

  static const _avatarKey = 'passenger_avatar';

  static Uint8List? _avatarBytes(Object? dataUrl) {
    if (dataUrl is! String || !dataUrl.startsWith('data:image/')) return null;
    final comma = dataUrl.indexOf(',');
    try {
      return comma < 0 ? null : base64Decode(dataUrl.substring(comma + 1));
    } catch (_) {
      return null;
    }
  }

  /// JPEG, PNG or WebP by their first bytes; null for any other format (HEIC, GIF), which the server refuses.
  static String? avatarMime(Uint8List bytes) {
    bool starts(List<int> magic) => bytes.length >= magic.length && [for (var i = 0; i < magic.length; i++) bytes[i] == magic[i]].every((b) => b);
    if (starts([0xff, 0xd8, 0xff])) return 'image/jpeg';
    if (starts([0x89, 0x50, 0x4e, 0x47])) return 'image/png';
    if (starts([0x52, 0x49, 0x46, 0x46])) return 'image/webp';
    return null;
  }

  void _applyProfile(Map<String, dynamic> p) {
    final name = _chosenName(p['full_name']);
    if (name != null) userName = name;
    if (p.containsKey('avatar')) userAvatar = _avatarBytes(p['avatar']);
  }

  Future<void> _saveAvatar() async {
    final prefs = await SharedPreferences.getInstance();
    if (userAvatar == null) {
      await prefs.remove(_avatarKey);
    } else {
      await prefs.setString(_avatarKey, base64Encode(userAvatar!));
    }
  }

  /// PAX-022 (D186): saves a new name and / or photo; [removeAvatar] deletes the photo. The phone never changes.
  /// Returns an error to show, or null.
  Future<String?> updateProfile({String? name, Uint8List? avatar, bool removeAvatar = false}) async {
    String? dataUrl;
    if (avatar != null) {
      final mime = avatarMime(avatar);
      if (mime == null) return 'Chọn ảnh JPEG hoặc PNG';
      if (avatar.length > 256 * 1024) return 'Ảnh quá lớn, hãy chọn ảnh khác';
      dataUrl = 'data:$mime;base64,${base64Encode(avatar)}';
    }
    final fullName = name?.trim().replaceAll(RegExp(r'\s+'), ' ');
    // Without a photo change the avatar is left out of the request; removing it sends null.
    final r = await _call(() => removeAvatar || dataUrl != null ? api.updateProfile(fullName: fullName, avatar: dataUrl) : api.updateProfile(fullName: fullName));
    if (!r.ok) return r.error;
    _applyProfile(r.value!);
    await _saveSession();
    await _saveAvatar();
    notifyListeners();
    return null;
  }

  Future<void> loadProfile() async {
    if (!loggedIn) return;
    final r = await _call(() => api.getProfile());
    if (r.ok && r.value != null) {
      _applyProfile(r.value!);
      unawaited(_saveAvatar());
      final bal = r.value!['wallet_balance_vnd'];
      if (bal is num) {
        walletBalanceVnd = bal.toInt();
      }
      final op = r.value!['operator'];
      if (op is Map<String, dynamic>) {
        operator = OperatorInfo.fromJson(op);
      }
      notifyListeners();
    }
  }

  Future<void> logout() async {
    final cacheKey = _walletCacheKey();
    // D192: this phone stops getting the account's pushes; the request leaves before the session is cleared.
    if (pushToken != null && loggedIn) unawaited(_call(() => api.registerDevice(platform: defaultTargetPlatform == TargetPlatform.iOS ? 'ios' : 'android')));
    api.authToken = null;
    userPhone = null;
    userName = null;
    userAvatar = null;
    isVip = false;
    tickets = [];
    notices = [];
    walletOfflineSince = null;
    _walletRows = {};
    notifyListeners();
    // D178: the saved wallet leaves the device with the session.
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_sessionKey);
    await prefs.remove(_avatarKey);
    if (cacheKey != null) await prefs.remove(cacheKey);
  }

  // ---------- Search (PAX-004 to PAX-006) ----------
  void swapPlaces() {
    if (!canSwap) return;
    final o = origin;
    origin = dest;
    dest = o;
    notifyListeners();
    unawaited(loadRunDays());
  }

  void setPlace({required bool isOrigin, required String code}) {
    if (isOrigin) {
      origin = code;
    } else {
      dest = code;
    }
    notifyListeners();
    unawaited(loadRunDays());
  }

  /// Days with a departure on the chosen route (the company's fixed timetable, D128); null while unknown.
  Set<String>? runDays;

  bool hasDeparture(String day) => runDays == null || runDays!.contains(day);

  /// The first day from the chosen one on (else the earliest) that has a departure; null when none is known.
  String? get nextRunDay {
    final days = (runDays?.toList() ?? [])..sort();
    if (days.isEmpty) return null;
    return days.firstWhere((d) => d.compareTo(date) > 0, orElse: () => days.first);
  }

  Future<void> loadRunDays() async {
    if (places.isEmpty) return;
    final from = origin;
    final to = dest;
    final r = await _call(() => api.getRunDays(originPlace.city, destPlace.city));
    if (from != origin || to != dest) return; // the route changed meanwhile
    final list = r.ok ? r.value!['days'] : null;
    runDays = list is List ? {for (final d in list) '$d'} : null;
    // The chosen day has no departure on this route: go to the next day that has one.
    if (runDays != null && runDays!.isNotEmpty && !runDays!.contains(date)) {
      final days = runDays!.toList()..sort();
      _date = days.firstWhere((d) => d.compareTo(date) >= 0, orElse: () => days.first);
    }
    notifyListeners();
  }

  /// Picks a travel day; a day outside the booking window is ignored (the server refuses it anyway).
  void setDate(String id) {
    if (!calendar.allows(id)) return;
    _date = id;
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
      final list = await api.searchTrips(origin: originPlace.city, destination: destPlace.city, date: date);
      trips = list.cast<Map<String, dynamic>>().map(Trip.fromJson).toList();
    } on SearchRefused catch (e) {
      // The server's calendar moved (a new day began): take its answer and show why.
      trips = [];
      tripsError = e.message;
    } catch (_) {
      trips = [];
      tripsError = _networkError;
    }
    loadingTrips = false;
    notifyListeners();
  }

  /// Where this passenger gets on and off a trip: the station picked on the home screen when the trip stops
  /// there, else the first pickup in the origin city and the first drop-off in the destination city.
  ({Stop on, Stop off}) rideFor(Trip t) {
    final stops = t.stops;
    Stop pick(bool Function(Stop) allowed, String city, String station, Stop fallback, {int after = -1}) {
      final ok = [for (var i = after + 1; i < stops.length; i++) if (allowed(stops[i])) stops[i]];
      return ok.where((s) => s.name == station).firstOrNull ?? ok.where((s) => s.city == city).firstOrNull ?? (ok.isEmpty ? fallback : ok.first);
    }
    final hasPlaces = places.containsKey(origin) && places.containsKey(dest);
    final on = pick((s) => s.pickup, hasPlaces ? originPlace.city : '', hasPlaces ? originPlace.station : '', stops.first);
    final offCandidates = stops.indexOf(on);
    final lastDrop = stops.lastWhere((s) => s.dropoff, orElse: () => stops.last);
    final off = pick((s) => s.dropoff, hasPlaces ? destPlace.city : '', hasPlaces ? destPlace.station : '', lastDrop, after: offCandidates);
    return (on: on, off: off);
  }

  /// Where the passenger last got on and off, per direction ("Hà Nội|Thanh Hóa" -> [pickup, dropoff]).
  Map<String, List<String>> _rememberedRides = {};

  static Map<String, List<String>> _readRides(String? raw) {
    try {
      final map = jsonDecode(raw ?? '{}') as Map<String, dynamic>;
      return {for (final e in map.entries) if (e.value is List && (e.value as List).length == 2) e.key: [for (final v in e.value as List) '$v']};
    } catch (_) {
      return {};
    }
  }

  String get _rideKey => '${originPlace.city}|${destPlace.city}';

  /// Keeps the stops the passenger chose for this direction, for the next booking.
  Future<void> rememberRide() async {
    final code = operator?.code;
    if (code == null || trip == null) return;
    _rememberedRides[_rideKey] = [pickup, dropoff];
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('rides_$code', jsonEncode(_rememberedRides));
    } catch (_) {
      // Remembering is a convenience only.
    }
  }

  void chooseTrip(Trip t) {
    trip = t;
    final ride = rideFor(t);
    pickup = ride.on.id;
    dropoff = ride.off.id;
    // The stops of the last booking in this direction, when this trip serves them in that order.
    final last = _rememberedRides[_rideKey];
    if (last != null) {
      final on = t.stops.indexWhere((s) => s.id == last[0] && s.pickup);
      final off = t.stops.indexWhere((s) => s.id == last[1] && s.dropoff);
      if (on >= 0 && off > on) {
        pickup = last[0];
        dropoff = last[1];
      }
    }
    homePickup = null;
    homeDropoff = null;
    seats.clear();
    seatMap = [];
    deck = 1;
    paymentMethod = defaultPaymentMethod;
    notifyListeners();
    if (t.homePickup || t.homeDropoff) loadServiceAreas();
  }

  /// Home service areas of the company, drawn on the address map.
  Future<void> loadServiceAreas() async {
    final r = await _call(() => api.getServiceConfig());
    if (!r.ok) return;
    serviceAreas = [for (final a in (r.value!['service_areas'] as List? ?? const [])) ServiceArea.fromJson(a as Map<String, dynamic>)];
    cancelPolicy = CancelPolicy.fromJson(r.value!['cancellation_policy'] as Map<String, dynamic>?);
    notifyListeners();
  }

  /// Reads the company's cancellation policy before the cancel sheet opens; offline, the last one read (or the
  /// default) is shown and the server still applies its own.
  Future<void> loadCancelPolicy() async {
    final r = await _call(() => api.getServiceConfig());
    if (!r.ok) return;
    cancelPolicy = CancelPolicy.fromJson(r.value!['cancellation_policy'] as Map<String, dynamic>?);
  }

  /// The street address of a pinned point, or null when the server cannot tell (D187).
  Future<String?> addressAt(double lat, double lng) async {
    final r = await _call(() => api.reverseGeocode(lat, lng));
    final address = r.ok ? (r.value?['address']) : null;
    return address is String && address.trim().isNotEmpty ? address.trim() : null;
  }

  /// Checks a home address with the server for this trip; returns an error to show, or null once it is set.
  /// A home pickup rides from the first stop, a home drop-off from the last one (spec adjustment A4).
  Future<String?> setHomeAddress({required bool pickupSide, required String address, required double lat, required double lng, String note = ''}) async {
    final trimmed = address.trim();
    if (trimmed.length < 5 || trimmed.length > 200) return 'Địa chỉ cần 5-200 ký tự';
    final r = await _call(() => api.checkServiceArea(kind: pickupSide ? 'PICKUP' : 'DROPOFF', lat: lat, lng: lng, tripId: trip?.id));
    if (!r.ok) return r.error;
    final home = HomeAddress(address: trimmed, lat: lat, lng: lng, feeVnd: (r.value!['fee_vnd'] as num? ?? 0).toInt(), areaName: '${r.value!['area_name'] ?? ''}', note: note.trim().length > 200 ? note.trim().substring(0, 200) : note.trim(), needsReview: r.value!['confirmation'] == 'MANUAL');
    final list = stops();
    if (pickupSide) {
      homePickup = home;
      setPickup(list.firstWhere((s) => s.pickup, orElse: () => list.first).id, keepHome: true);
    } else {
      homeDropoff = home;
      setDropoff(list.lastWhere((s) => s.dropoff, orElse: () => list.last).id, keepHome: true);
    }
    notifyListeners();
    return null;
  }

  void clearHomeAddress({required bool pickupSide}) {
    if (pickupSide) {
      homePickup = null;
    } else {
      homeDropoff = null;
    }
    notifyListeners();
  }

  List<Stop> stops() => trip?.stops ?? const [];

  /// What a home pickup (or drop-off) costs and needs, shown before the passenger enters an address:
  /// "Từ 50.000 đ · đặt trước 2 giờ · một số khu cần nhà xe duyệt". Null while the areas are not loaded.
  String? homeServiceSummary({required bool pickupSide}) {
    final areas = serviceAreas.where((a) => a.kind == (pickupSide ? 'PICKUP' : 'DROPOFF')).toList();
    if (areas.isEmpty) return null;
    final fees = areas.map((a) => feeOf(a.feeVnd)).toList()..sort();
    final lead = areas.map((a) => a.leadMinutes).reduce((a, b) => a < b ? a : b);
    final parts = [
      fees.first == fees.last ? '+${vnd(fees.first)}' : 'Từ +${vnd(fees.first)}',
      if (pickupSide) 'xe đón 75–30 phút trước giờ chạy',
      if (lead >= 60) 'đặt trước ${lead ~/ 60} giờ' else if (lead > 0) 'đặt trước $lead phút',
      if (areas.every((a) => a.manual)) 'nhà xe duyệt địa chỉ' else if (areas.any((a) => a.manual)) 'một số khu cần nhà xe duyệt',
    ];
    return parts.join(' · ');
  }
  Stop stop(String id) => stops().firstWhere((s) => s.id == id, orElse: () => stops().first);

  void setPickup(String id, {bool keepHome = false}) {
    if (!keepHome) homePickup = null;
    pickup = id;
    final list = stops();
    final p = list.indexWhere((s) => s.id == id);
    if (list.indexWhere((s) => s.id == dropoff) <= p) {
      dropoff = list.skip(p + 1).firstWhere((s) => s.dropoff, orElse: () => list.last).id;
    }
    notifyListeners();
  }

  void setDropoff(String id, {bool keepHome = false}) {
    if (!keepHome) homeDropoff = null;
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
    if (trip != null && r.value != null) {
      final val = r.value!;
      final map = val['trip'] is Map<String, dynamic> ? val['trip'] as Map<String, dynamic> : val;
      if (map.containsKey('bookable') || map.containsKey('block_code') || map.containsKey('book_until')) {
        final b = map['bookable'];
        final bc = map['block_code'] as String?;
        final bm = map['block_message'] as String?;
        final bu = map['book_until'] != null ? DateTime.tryParse('${map['book_until']}') : null;
        trip = trip!.copyWith(
          bookable: (b == false || b == 'false') ? false : (b == true ? true : trip!.bookable),
          blockCode: bc ?? trip!.blockCode,
          blockMessage: bm ?? trip!.blockMessage,
          bookUntil: bu ?? trip!.bookUntil,
        );
      }
    }
    seatMap = (r.value!['seats'] as List).cast<Map<String, dynamic>>().map((s) {
      final state = switch ('${s['segment_state'] ?? s['state']}') {
        'AVAILABLE' => SeatState.free,
        'BOOKED' => SeatState.booked,
        'BLOCKED' => SeatState.blocked,
        _ => SeatState.held,
      };
      final row = (s['row'] as num?)?.toInt() ?? 1;
      final col = (s['column'] as num?)?.toInt() ?? 1;
      final type = s['type'] as String? ?? 'VIP_CABIN';
      return Seat(
        s['seat_code'],
        (s['deck'] as num?)?.toInt() ?? 1,
        state,
        row: row < 1 ? 1 : row,
        column: col < 1 ? 1 : col,
        type: type.isEmpty ? 'VIP_CABIN' : type,
      );
    }).toList();
    final cols = (r.value!['columns'] as num?)?.toInt();
    final maxCol = seatMap.fold<int>(1, (max, s) => s.column > max ? s.column : max);
    seatColumns = (cols != null && cols >= 1) ? cols : maxCol;
    if (!decks.contains(deck) && decks.isNotEmpty) deck = decks.first;
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
    lastErrorCode = r.ok ? null : r.code;
    if (!r.ok) {
      if (r.code == 'SEAT_LOCKED_BY_OTHER' || r.code == 'SEAT_ALREADY_BOOKED' || r.code == 'SEAT_BLOCKED') await loadSeatMap();
      return r.error;
    }
    holdId = r.value!['hold_id'];
    // Other seats or another trip price differently: a code applied before is checked again at checkout.
    voucher = null;
    voucherDiscount = 0;
    paymentMethod = defaultPaymentMethod;
    _startCountdown('hold', (r.value!['seconds_remaining'] as num?)?.toInt() ?? 600);
    return null;
  }

  int fareOf(Trip t) => isVip ? 0 : t.price;
  int feeOf(int fee) => isVip ? 0 : fee;

  // ---------- Checkout (PAX-011 / PAX-012) ----------
  int get baseFare => isVip ? 0 : (trip?.price ?? 0) * seats.length;
  int get insuranceFee => isVip ? 0 : (insured ? 10000 * seats.length : 0);
  int get discount => isVip ? 0 : (voucher == null ? 0 : (voucherDiscount < baseFare ? voucherDiscount : baseFare));
  // The home pickup / drop-off fee is per order, not per seat (server rule).
  int get total => baseFare + insuranceFee - discount + homeFees;

  void setInsured(bool value) {
    insured = value;
    notifyListeners();
  }

  void setPaymentMethod(String m) {
    if (m == 'CASH' && operator?.allowCash == false) return;
    if (m != 'CASH' && operator?.allowTransfer == false && total > 0) return;
    paymentMethod = m;
    notifyListeners();
  }

  /// PAX-012: the company's server says whether the code applies and what it takes off this order.
  Future<String?> applyVoucher(String code) async {
    if (isVip) return 'Tài khoản VIP đã được miễn phí vé.';
    final c = code.trim().toUpperCase();
    if (c.isEmpty) return 'Nhập mã giảm giá.';
    final r = await _call(() => api.checkVoucher(c, baseFare));
    if (!r.ok) return r.error;
    voucher = '${r.value!['code'] ?? c}';
    voucherDiscount = (r.value!['discount_vnd'] as num?)?.toInt() ?? 0;
    if (total <= 0) paymentMethod = 'VIETQR_NAPAS247';
    notifyListeners();
    return null;
  }

  void removeVoucher() {
    voucher = null;
    voucherDiscount = 0;
    // A free order was switched to transfer; with a fare again a cash-only company is back on cash.
    if (operator?.allowTransfer == false) paymentMethod = defaultPaymentMethod;
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
          homePickup: homePickup?.toJson(),
          homeDropoff: homeDropoff?.toJson(),
          insuranceSelected: insuranceEnabled && insured,
          paymentMethod: paymentMethod,
        ));
    lastErrorCode = r.ok ? null : r.code;
    if (!r.ok) {
      // The code stopped applying since it was checked (used up, expired): drop it so the next try is at full price, shown first.
      if (r.code != null && r.code!.startsWith('VOUCHER_')) removeVoucher();
      return r.error;
    }
    final pay = r.value!['payment'] as Map<String, dynamic>;
    final details = pay['payment_details'] as Map<String, dynamic>?;
    orderId = pay['order_id'];
    orderPnr = pay['pnr'];
    orderAmount = (pay['amount_vnd'] as num).toInt();
    orderPaidVnd = 0;
    orderRemainingVnd = 0;
    if (pay['payment_method'] == 'CASH') {
      paymentMethod = 'CASH';
      bankName = '';
      accountNumber = '';
      transferMemo = '';
      vietQrPayload = '';
      stopHold();
      await loadTickets();
      return null;
    }
    paymentMethod = 'VIETQR_NAPAS247';
    bankName = details?['bank_name'] ?? '';
    accountNumber = details?['account_number'] ?? '';
    transferMemo = details?['transfer_memo'] ?? '';
    vietQrPayload = details?['qr_payload'] ?? '';
    final expires = DateTime.tryParse('${pay['expires_at']}');
    _startCountdown('pay', expires == null ? 600 : expires.difference(DateTime.now()).inSeconds.clamp(60, 1800));
    return null;
  }

  /// A link relatives open in a browser to follow the bus of this ticket (spec adjustment A3).
  Future<ApiResult<String>> shareTracking(Ticket t) async {
    final r = await _call(() => api.shareTicketTracking(t.id));
    if (!r.ok) return ApiResult(null, r.error, r.code);
    final path = '${r.value!['share_url'] ?? ''}';
    return ApiResult(path.startsWith('http') ? path : '${api.baseUrl}$path');
  }

  /// PAX-013 / PAX-014: asks the server; the ticket exists only once the bank confirmed (BR-PAY-004).
  Future<bool> checkPayment({bool manual = false}) async {
    if (orderId == null) return false;
    final r = await _call(() => api.verifyPaymentStatus(orderId!, manualTrigger: manual));
    lastPaymentCheckCode = r.code;
    final order = r.value?['data'];
    if (order is Map<String, dynamic>) {
      orderPaidVnd = (order['paid_amount_vnd'] as num?)?.toInt() ?? orderPaidVnd;
      orderRemainingVnd = (order['remaining_vnd'] as num?)?.toInt() ?? orderRemainingVnd;
      // After an underpaid transfer the server's QR asks for the rest only.
      final qr = (order['payment_details'] as Map?)?['qr_payload'];
      if (orderRemainingVnd > 0 && qr is String && qr.isNotEmpty) vietQrPayload = qr;
    }
    if (!r.ok || r.value!['payment_status'] != 'PAID') {
      notifyListeners();
      return false;
    }
    stopHold();
    await loadTickets();
    final issued = tickets.where((t) => t.pnr == orderPnr).toList();
    if (issued.isNotEmpty) {
      final first = issued.first;
      final serverPlate = (r.value!['tickets'] as List? ?? [])
          .cast<Map<String, dynamic>>()
          .map((m) => m['vehicle_plate']?.toString() ?? m['plate']?.toString())
          .firstWhere((p) => p != null && p.isNotEmpty, orElse: () => null);
      final settledPlate = (first.plate.isNotEmpty ? first.plate : null) ??
          serverPlate ??
          (trip?.plate.isNotEmpty == true ? trip!.plate : '');
      lastTicket = first.copyWith(
        orderId: first.orderId ?? orderId,
        ticketIds: issued.expand((t) => t.ticketIds.isNotEmpty ? t.ticketIds : [t.id]).toList(),
        seat: issued.map((t) => t.seat).join(', '),
        paid: orderAmount,
        plate: settledPlate,
        codDue: issued.fold<int>(0, (sum, t) => sum + t.codDue),
      );
      for (final t in issued) {
        if (settledPlate.isNotEmpty) t.plate = settledPlate;
      }
    }
    orderId = null;
    orderPaidVnd = 0;
    orderRemainingVnd = 0;
    seats.clear();
    voucher = null;
    voucherDiscount = 0;
    insured = false;
    paymentMethod = defaultPaymentMethod;
    await loadNotices();
    return true;
  }

  Future<void> cancelOrder() async {
    stopHold();
    if (trip != null) await _call(() => api.releaseHold(trip!.id));
    orderId = null;
    orderPnr = null;
    orderPaidVnd = 0;
    orderRemainingVnd = 0;
    seats.clear();
    paymentMethod = defaultPaymentMethod;
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
  /// D178: the wallet of this phone at this company, kept on the device so the pass shows without a network.
  String? _walletCacheKey() {
    final op = operator?.code ?? api.operatorCode;
    final digits = (userPhone ?? '').replaceAll(RegExp(r'\D'), '');
    if (op == null || op.isEmpty || digits.isEmpty) return null;
    return 'wallet_${op}_$digits';
  }

  /// The server's rows of the last successful load, by tab; the cache writes them back with each pass.
  Map<String, List<Map<String, dynamic>>> _walletRows = {};

  Future<void> _saveWalletCache() async {
    final key = _walletCacheKey();
    if (key == null || _walletRows.isEmpty) return;
    Map<String, dynamic> withPass(Map<String, dynamic> j) {
      final t = tickets.where((t) => t.id == j['ticket_id']).firstOrNull;
      return t == null ? j : {...j, '_qr': t.qrValue, '_qr_version': t.qrVersion, '_pin': t.pin};
    }
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(key, jsonEncode({
      'saved_at': DateTime.now().toIso8601String(),
      for (final e in _walletRows.entries) e.key: [for (final j in e.value) withPass(j)],
    }));
  }

  /// The tickets of one tab as last saved, with their pass; empty when nothing was saved.
  List<Ticket> _cachedTickets(Map<String, dynamic>? cache, String tab) {
    final rows = cache?[tab];
    if (rows is! List) return [];
    return [
      for (final j in rows.cast<Map<String, dynamic>>())
        Ticket.fromJson(j, past: tab == 'HISTORY' || tab == 'CANCELLED')
          ..qrValue = j['_qr'] as String?
          ..qrVersion = (j['_qr_version'] as num?)?.toInt() ?? 1
          ..pin = j['_pin'] as String?,
    ];
  }

  Future<void> loadTickets() async {
    if (!loggedIn) return;
    loadingTickets = true;
    notifyListeners();
    final up = await _call(() => api.getTicketWallet(tab: 'UPCOMING'));
    final past = await _call(() => api.getTicketWallet(tab: 'HISTORY'));
    final cancelled = await _call(() => api.getTicketWallet(tab: 'CANCELLED'));
    List<Map<String, dynamic>> rows(ApiResult<Map<String, dynamic>> r) => ((r.value!['value'] ?? r.value) as List).cast<Map<String, dynamic>>();

    // D178: without a network a tab keeps what is on screen, or what was saved on the device; never an empty wallet.
    Map<String, dynamic>? cache;
    if (up.code == 'NETWORK' || past.code == 'NETWORK' || cancelled.code == 'NETWORK') {
      final raw = (await SharedPreferences.getInstance()).getString(_walletCacheKey() ?? '');
      try {
        cache = raw == null ? null : jsonDecode(raw) as Map<String, dynamic>;
      } catch (_) {}
    }
    List<Ticket> offlineTab(String tab) {
      final shown = switch (tab) {
        'UPCOMING' => tickets.where((t) => !t.past).toList(),
        'CANCELLED' => tickets.where((t) => t.past && t.status == TicketStatus.cancelled).toList(),
        _ => tickets.where((t) => t.past && t.status != TicketStatus.cancelled).toList(),
      };
      return shown.isNotEmpty ? shown : _cachedTickets(cache, tab);
    }

    // History holds the trips taken and the cancelled tickets (with their refund), latest departure first.
    final history = <Ticket>[
      if (past.ok) ...rows(past).map((j) => Ticket.fromJson(j, past: true)) else if (past.code == 'NETWORK') ...offlineTab('HISTORY'),
      if (cancelled.ok) ...rows(cancelled).map((j) => Ticket.fromJson(j, past: true)) else if (cancelled.code == 'NETWORK') ...offlineTab('CANCELLED'),
    ]..sort((a, b) => (b.departureTime ?? '').compareTo(a.departureTime ?? ''));

    final list = <Ticket>[
      if (up.ok) ...rows(up).map(Ticket.fromJson) else if (up.code == 'NETWORK') ...offlineTab('UPCOMING'),
      ...history,
    ];
    for (final t in list) {
      final old = tickets.where((o) => o.id == t.id).firstOrNull;
      if (old == null || identical(old, t)) continue;
      if (t.plate.isEmpty) t.plate = old.plate;
      // The wallet rows carry no pass: keep the one already loaded until the pass screen asks again.
      t.qrValue ??= old.qrValue;
      t.pin ??= old.pin;
      if (old.qrVersion > t.qrVersion) t.qrVersion = old.qrVersion;
    }
    tickets = list;

    if (up.ok && past.ok && cancelled.ok) {
      walletOfflineSince = null;
      _walletRows = {'UPCOMING': rows(up), 'HISTORY': rows(past), 'CANCELLED': rows(cancelled)};
      await _saveWalletCache();
      for (final tripId in tickets.where((t) => !t.past && t.active).map((t) => t.tripId).toSet()) {
        final d = await _call(() => api.getDisruptions(tripId));
        final minutes = d.ok ? (d.value!['delay_minutes'] ?? d.value!['current_delay_minutes'] ?? 0) : 0;
        for (final t in tickets.where((t) => t.tripId == tripId)) {
          t.delay = (minutes as num).toInt();
        }
      }
    } else if (up.code == 'NETWORK' || past.code == 'NETWORK' || cancelled.code == 'NETWORK') {
      walletOfflineSince = tickets.isEmpty ? null : DateTime.tryParse('${cache?['saved_at']}') ?? walletOfflineSince ?? DateTime.now();
    }
    loadingTickets = false;
    notifyListeners();
  }

  Future<String?> loadPass(Ticket t) async {
    final r = await _call(() => api.getTicketQR(t.id));
    if (!r.ok) {
      // D178: offline, the pass already on the device still boards the passenger.
      if (r.code == 'NETWORK' && t.qrValue != null) {
        t.qrFromCache = true;
        notifyListeners();
        return null;
      }
      return r.error;
    }
    t.qrFromCache = false;
    final qr = r.value!['boarding_qr'] as Map<String, dynamic>?;
    t.qrVersion = (qr?['version'] as num?)?.toInt() ?? t.qrVersion;
    t.pin = r.value!['offline_pin']?.toString();
    final status = r.value!['ticket']?['status'];
    if (status == 'BOARDED') t.status = TicketStatus.boarded;
    if (r.value!['ticket']?['trip_completed'] == true) {
      t.past = true;
      _tripEnded[t.tripId] = true;
    }
    final vp = r.value!['ticket']?['vehicle_plate']?.toString();
    final lp = r.value!['ticket']?['plate']?.toString();
    final plate = (vp != null && vp.isNotEmpty) ? vp : ((lp != null && lp.isNotEmpty) ? lp : null);
    if (plate != null) {
      t.plate = plate;
    }

    if (t.isGroup) {
      if (t.status == TicketStatus.active) {
        final orderId = t.orderId ?? '';
        if (orderId.isNotEmpty) {
          final grp = await _call(() => api.getGroupQr(orderId));
          if (!grp.ok) {
            if (grp.code == 'NETWORK' && t.qrValue != null) {
              t.qrFromCache = true;
              notifyListeners();
              return null;
            }
            return grp.error;
          }
          final groupQr = grp.value!['group_qr'] as Map<String, dynamic>?;
          t.qrValue = groupQr?['qr_code_value']?.toString();
        }
      } else {
        t.qrValue = null;
      }
    } else {
      t.qrValue = qr?['qr_code_value'];
    }

    await _saveWalletCache();
    notifyListeners();
    return null;
  }

  /// D104: a new QR version; the server refuses it once the trip has left (BOARDING_STARTED).
  Future<ApiResult<void>> reissueQr(Ticket t) async {
    if (t.isGroup) {
      final ids = t.ticketIds.isNotEmpty ? t.ticketIds : [t.id];
      for (final id in ids) {
        final r = await _call(() => api.reissueBoardingQr(id));
        if (!r.ok) return ApiResult(null, r.error, r.code);
      }
      final err = await loadPass(t);
      if (err != null) return ApiResult(null, err);
      return const ApiResult(null);
    }
    final r = await _call(() => api.reissueBoardingQr(t.id));
    if (!r.ok) return ApiResult(null, r.error, r.code);
    final qr = r.value!['boarding_qr'] as Map<String, dynamic>;
    t.qrFromCache = false;
    t.qrValue = qr['qr_code_value'];
    t.qrVersion = (qr['version'] as num).toInt();
    t.pin = r.value!['offline_pin']?.toString();
    await _saveWalletCache();
    notifyListeners();
    return const ApiResult(null);
  }

  Future<String?> shareTicket(Ticket t, String phone) async {
    final r = await _call(() => api.delegateTicket(t.id, delegateToPhone: phone, delegateToName: 'Người đi cùng'));
    return r.ok ? null : r.error;
  }

  /// Preview of PAX-021 tiers; the server decides the refund.
  ({int percent, String tier}) refundFor(Ticket t) {
    if (t.unpaidCash) return (percent: 0, tier: 'Vé tiền mặt chưa thanh toán nên không phát sinh hoàn tiền.');
    final waiver = cancelPolicy.delayWaiverMinutes;
    if (waiver != null && t.delay > waiver) return (percent: 100, tier: 'Chuyến chậm hơn $waiver phút: hoàn 100%, không phí');
    if (t.homePickupStatus == 'REJECTED' || t.homeDropoffStatus == 'REJECTED') {
      return (percent: 100, tier: 'Nhà xe không nhận đón/trả tận nhà: hoàn 100% tiền còn lại, không phí');
    }
    if (t.departureTime != null) {
      final depTime = DateTime.tryParse(t.departureTime!);
      if (depTime != null) {
        return cancelPolicy.tierFor(depTime.difference(DateTime.now()).inMinutes / 60.0);
      }
    }
    return (percent: -1, tier: 'Mức hoàn tính theo số giờ trước giờ chạy, xem chính sách hủy vé bên dưới.');
  }

  /// Takes back a home pickup (pickupSide) or drop-off still under review; the fee is refunded (D130).
  Future<ApiResult<void>> withdrawHome(Ticket t, {required bool pickupSide}) async {
    final r = await _call(() => api.withdrawHomeRequest(t.id, pickupSide ? 'PICKUP' : 'DROPOFF'));
    if (!r.ok) return ApiResult(null, r.error, r.code);
    await loadTickets();
    await loadNotices();
    return const ApiResult(null);
  }

  Future<RefundAccount?> getLastRefundAccount() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString('last_refund_account');
    if (raw == null || raw.isEmpty) return null;
    try {
      final j = jsonDecode(raw);
      if (j is Map<String, dynamic>) return RefundAccount.fromJson(j);
    } catch (_) {}
    return null;
  }

  Future<void> saveLastRefundAccount(RefundAccount account) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('last_refund_account', jsonEncode(account.toJson()));
  }

  /// Cancels the ticket, or the chosen seats of a multi-seat order one by one (D190); returns the refund asked for.
  Future<ApiResult<int>> cancelTicket(Ticket t, {List<String>? ids, Map<String, dynamic>? refundAccount}) async {
    var amount = 0;
    for (final id in ids ?? [t.id]) {
      final r = await _call(() => api.cancelTicket(id, refundAccount: refundAccount));
      if (!r.ok) {
        // Seats cancelled before the failure stay cancelled: show them as they are now.
        await loadTickets();
        return ApiResult(null, r.error, r.code);
      }
      amount += (r.value!['refund_amount_vnd'] as num?)?.toInt() ?? 0;
    }
    if (refundAccount != null) {
      await saveLastRefundAccount(RefundAccount.fromJson(refundAccount));
    }
    await loadTickets();
    await loadNotices();
    return ApiResult(amount);
  }

  Future<ApiResult<Map<String, dynamic>>> updateRefundAccount(Ticket t, Map<String, dynamic> refundAccount) async {
    final r = await _call(() => api.updateRefundAccount(t.id, refundAccount: refundAccount));
    if (!r.ok) return ApiResult(null, r.error, r.code);
    await saveLastRefundAccount(RefundAccount.fromJson(refundAccount));
    if (r.value != null && r.value!['refund_account'] is Map<String, dynamic>) {
      final masked = RefundAccount.fromJson(r.value!['refund_account'] as Map<String, dynamic>);
      if (t.refundInfo != null) {
        t.refundInfo = TicketRefund(
          refundId: t.refundInfo!.refundId,
          status: t.refundInfo!.status,
          amountVnd: t.refundInfo!.amountVnd,
          rejectNote: t.refundInfo!.rejectNote,
          account: masked,
        );
      }
    }
    await loadTickets();
    notifyListeners();
    return ApiResult(r.value);
  }

  Future<ApiResult<void>> deleteAccount() async {
    final cacheKey = _walletCacheKey();
    final r = await _call(() => api.deleteAccount());
    if (!r.ok) return ApiResult(null, r.error, r.code);

    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_sessionKey);
    await prefs.remove(_avatarKey);
    await prefs.remove('last_refund_account');
    if (cacheKey != null) await prefs.remove(cacheKey);

    api.authToken = null;
    userPhone = null;
    userName = null;
    userAvatar = null;
    isVip = false;
    tickets = [];
    notices = [];
    walletBalanceVnd = 0;
    sessionExpired = false;
    walletOfflineSince = null;
    _walletRows = {};
    notifyListeners();
    return const ApiResult(null);
  }

  // ---------- Tracking and notices (PAX-018, PAX-020) ----------
  final Map<String, bool> _tripEnded = {};
  bool isTripEnded(String tripId) => _tripEnded[tripId] == true;

  Future<Tracking> loadTracking(String tripId, {String? ticketId}) async {
    final r = await _call(() => api.getLiveRadarHUD(tripId, ticketId: ticketId));
    if (!r.ok) return Tracking(GpsSignal.none, text: r.error!, unreachable: r.code == 'NETWORK');
    final tr = _trackingFrom(r.value!);
    if (tr.ended || tr.tripStatus == 'COMPLETED') _tripEnded[tripId] = true;
    return tr;
  }

  /// The bus pushed by the server after each of its positions; errors or ends when the connection drops.
  Stream<Tracking> watchTracking(String tripId, {String? ticketId}) =>
      api.watchLiveRadarHUD(tripId, ticketId: ticketId).map((d) {
        final tr = _trackingFrom(d);
        if (tr.ended || tr.tripStatus == 'COMPLETED') _tripEnded[tripId] = true;
        return tr;
      });

  Tracking _trackingFrom(Map<String, dynamic> d) {
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
        isHome: rawTarget['kind'] == 'HOME_PICKUP',
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
    DateTime? vn(Object? iso) => DateTime.tryParse('${iso ?? ''}')?.toUtc().add(const Duration(hours: 7));
    final window = d['target_window'] as Map<String, dynamic>?;
    final loc = d['bus_location'] as Map<String, dynamic>?;

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
      plannedAt: vn(d['target_planned_time']),
      windowFrom: vn(window?['from']),
      windowTo: vn(window?['to']),
      expectedAt: vn(d['expected_at']),
      lateMinutes: (d['late_minutes'] as num?)?.toInt(),
      atTarget: d['is_at_station'] == true && !passedTarget,
      appointmentAt: vn(d['appointment_at']),
      queuePosition: (d['home_queue']?['position'] as num?)?.toInt(),
      queueTotal: (d['home_queue']?['total'] as num?)?.toInt(),
      readyStatus: d['pickup_ready']?['status'] as String?,
      readyMinutes: (d['pickup_ready']?['minutes'] as num?)?.toInt(),
      homeWaitMinutes: (d['home_wait_minutes'] as num?)?.toInt(),
      doorArrivedAt: vn(d['door_arrived_at']),
      nearDoor: d['near_door'] == true,
      atDoor: d['at_door'] == true,
      ended: d['tracking_ended'] == true || d['trip_status'] == 'COMPLETED',
      tripStatus: d['trip_status'] as String?,
      location: loc == null
          ? null
          : BusLocation(
              atStop: loc['at_stop'] as String?,
              lastPassed: loc['last_passed_stop'] as String?,
              next: loc['next_stop'] as String?,
              stopsBefore: (loc['stops_before_target'] as num?)?.toInt(),
            ),
    );
  }

  Future<void> loadNotices() async {
    if (!loggedIn) return;
    final r = await _call(() => api.getNotifications());
    if (!r.ok) return;
    final list = ((r.value!['value'] ?? r.value) as List).cast<Map<String, dynamic>>();
    notices = [
      for (final n in list)
        AppNotice(n['title'] ?? '', n['body'] ?? '', _ago(n['created_at']), tripId: n['payload']?['trip_id'], type: n['type'] ?? '', id: '${n['id'] ?? ''}', ticketId: n['payload']?['ticket_id'] as String?, pnr: n['payload']?['pnr'] as String?, isRead: n['is_read'] != false),
    ];
    unread = list.any((n) => n['is_read'] == false);
    // D144, D191: every new unread notice shows as a heads-up on top of the app; the first load only learns what is there.
    final fresh = notices.where((n) => !n.isRead && !_seenNotices.contains(n.id)).toList();
    if (_noticesLoaded && fresh.isNotEmpty) pendingAlert = fresh.first;
    _seenNotices.addAll(notices.map((n) => n.id));
    _noticesLoaded = true;
    notifyListeners();
  }

  final Set<String> _seenNotices = {};
  bool _noticesLoaded = false;

  /// The newest notice not shown yet (D191); the shell shows it and clears it.
  AppNotice? pendingAlert;

  /// D145: the phone's push token (Firebase), sent with the device so the server can push instead of texting.
  String? pushToken;

  /// D192: a push the passenger tapped; the shell opens what it is about once someone is signed in, then clears it.
  AppNotice? pushToOpen;

  void openFromPush(AppNotice notice) {
    pushToOpen = notice;
    // The phone already showed it: the next notice load must not show it again on top of the app.
    if (notice.id.isNotEmpty) _seenNotices.add(notice.id);
    notifyListeners();
  }

  Future<void> setPushToken(String? token) async {
    if (token == null || token == pushToken) return;
    pushToken = token;
    if (loggedIn) await _registerDevice();
  }

  Future<void> _registerDevice() async {
    await _call(() => api.registerDevice(token: pushToken, platform: defaultTargetPlatform == TargetPlatform.iOS ? 'ios' : 'android'));
  }

  /// D144: a home passenger answers before the bus comes: READY, NEED_2 or NEED_5.
  Future<String?> sendPickupReady(Ticket t, String status) async {
    final r = await _call(() => api.sendPickupReady(t.id, status));
    return r.ok ? null : r.error;
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
    _disposed = true;
    _holdTimer?.cancel();
    super.dispose();
  }

  // Loads started in the background (banners, run days) may answer after the screen is gone.
  bool _disposed = false;

  @override
  void notifyListeners() {
    if (!_disposed) super.notifyListeners();
  }
}

class PassengerScope extends InheritedNotifier<PassengerStore> {
  const PassengerScope({super.key, required PassengerStore store, required super.child}) : super(notifier: store);

  static PassengerStore of(BuildContext context) => context.dependOnInheritedWidgetOfExactType<PassengerScope>()!.notifier!;
  static PassengerStore read(BuildContext context) => context.getInheritedWidgetOfExactType<PassengerScope>()!.notifier!;
}
