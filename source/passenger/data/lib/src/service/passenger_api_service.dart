/**
 * FleetBus Passenger Flutter API Client Service
 * Connects the mobile client with the Node.js API gateway.
 *
 * Every request goes through [_get], [_post] or [_delete], which add the session token and, for the
 * mutations the server marks as idempotent, an Idempotency-Key. The token comes from [verifyOtp] (or is
 * set by the app); the server derives the user and the phone from it, so no identity is sent in a body.
 */

import 'dart:convert';
import 'dart:math';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

/// Helper function to resolve the target backend URL adaptively across Android & iOS
String resolvePassengerBaseUrl([String? customUrl]) {
  if (customUrl != null && customUrl.isNotEmpty) {
    return customUrl;
  }
  // Physical device on the LAN: --dart-define=FLEETBUS_API_URL=http://<host-ip>:3000
  const fromDefine = String.fromEnvironment('FLEETBUS_API_URL');
  if (fromDefine.isNotEmpty) {
    return fromDefine;
  }
  // Android emulator loopback alias to host machine
  if (!kIsWeb && defaultTargetPlatform == TargetPlatform.android) {
    return 'http://10.0.2.2:3000';
  }
  // iOS Simulator, macOS/Web, desktop, or default host
  return 'http://localhost:3000';
}

/// A new random key for one logical mutation. Reuse the same key when retrying that mutation.
String newIdempotencyKey() {
  final random = Random.secure();
  return List<int>.generate(16, (_) => random.nextInt(256))
      .map((b) => b.toRadixString(16).padLeft(2, '0'))
      .join();
}

class PassengerApiClientService {
  final String baseUrl;
  final http.Client _client;

  /// Session token of the signed-in passenger (set by [verifyOtp]).
  String? authToken;

  /// Selected operator code (sent as X-Operator-Code)
  String? operatorCode;

  PassengerApiClientService({
    String? baseUrl,
    http.Client? client,
    this.authToken,
    this.operatorCode,
  })  : baseUrl = resolvePassengerBaseUrl(baseUrl),
        _client = client ?? http.Client();

  Map<String, String> _headers({String? idempotencyKey}) => {
    'Content-Type': 'application/json',
    'x-app-version': '3.0.0',
    if (authToken != null) 'Authorization': 'Bearer $authToken',
    if (idempotencyKey != null) 'Idempotency-Key': idempotencyKey,
    if (operatorCode != null) 'X-Operator-Code': operatorCode!,
  };

  Map<String, dynamic> _decode(http.Response response) {
    return jsonDecode(response.body) as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> _get(String path, {Map<String, String>? query}) async {
    final uri = Uri.parse('$baseUrl$path').replace(queryParameters: query);
    return _decode(await _client.get(uri, headers: _headers()));
  }

  /// A GET answered with server-sent events: the data of each `tracking` event, until the connection drops.
  Stream<Map<String, dynamic>> _stream(String path, {Map<String, String>? query}) async* {
    final uri = Uri.parse('$baseUrl$path').replace(queryParameters: query);
    final request = http.Request('GET', uri)
      ..headers.addAll(_headers())
      ..headers['Accept'] = 'text/event-stream';
    final response = await _client.send(request);
    if (response.statusCode != 200 || !(response.headers['content-type'] ?? '').startsWith('text/event-stream')) {
      throw http.ClientException('Stream refused (${response.statusCode})', uri);
    }
    var event = '';
    final data = StringBuffer();
    await for (final line in response.stream.transform(utf8.decoder).transform(const LineSplitter())) {
      if (line.isEmpty) {
        if (event == 'tracking' && data.isNotEmpty) yield jsonDecode(data.toString()) as Map<String, dynamic>;
        event = '';
        data.clear();
      } else if (line.startsWith('event:')) {
        event = line.substring(6).trim();
      } else if (line.startsWith('data:')) {
        data.write(line.substring(5).trimLeft());
      }
    }
  }

  Future<Map<String, dynamic>> _post(
    String path, {
    Object? body,
    bool idempotent = false,
    String? idempotencyKey,
  }) async {
    final response = await _client.post(
      Uri.parse('$baseUrl$path'),
      headers: _headers(idempotencyKey: idempotent ? (idempotencyKey ?? newIdempotencyKey()) : null),
      body: body == null ? null : jsonEncode(body),
    );
    return _decode(response);
  }

  Future<Map<String, dynamic>> _delete(String path, {Map<String, String>? query}) async {
    final uri = Uri.parse('$baseUrl$path').replace(queryParameters: query);
    return _decode(await _client.delete(uri, headers: _headers()));
  }

  /**
   * PAX-001: App Config handshake
   */
  Future<Map<String, dynamic>> getAppConfig({String? operatorCode}) {
    return _get('/api/v1/app/config', query: operatorCode != null ? {'operator': operatorCode} : null);
  }

  /**
   * PAX-002: Request Phone OTP
   */
  Future<Map<String, dynamic>> requestOtp(String phone) {
    return _post('/api/v1/auth/passenger/otp/request', body: {'phone': phone});
  }

  /**
   * PAX-003: Verify Phone OTP. On success the session token is kept for every later request.
   */
  Future<Map<String, dynamic>> verifyOtp(String phone, String otp) async {
    final json = await _post('/api/v1/auth/passenger/otp/verify', body: {'phone': phone, 'otp': otp});
    final token = json['data']?['token'];
    if (json['status'] == 'success' && token is String) {
      authToken = token;
    }
    return json;
  }

  /**
   * PAX-004: Home Feed Recommendations & Active Ticket
   */
  Future<Map<String, dynamic>> getHomeFeed() {
    return _get('/api/v1/passenger/home-feed');
  }

  /**
   * PAX-004: Days of the booking window with a departure from [origin] to [destination] (D128)
   */
  Future<Map<String, dynamic>> getRunDays(String origin, String destination) {
    return _get('/api/v1/trips/run-days', query: {'origin': origin, 'destination': destination});
  }

  /**
   * PAX-004: Promotion slides of the operator; an empty list hides the slider (D124)
   */
  Future<Map<String, dynamic>> getPromoBanners() {
    return _get('/api/v1/passenger/promo-banners');
  }

  /**
   * PAX-004: HTML page behind one promotion slide
   */
  Future<Map<String, dynamic>> getPromoBanner(String bannerId) {
    return _get('/api/v1/passenger/promo-banners/${Uri.encodeComponent(bannerId)}');
  }

  /**
   * PAX-005: Search Stations
   */
  Future<List<dynamic>> searchStations(String query) async {
    final json = await _get('/api/v1/routes/stops/search', query: {'q': query});
    return json['data'] ?? [];
  }

  /**
   * PAX-006: Search Trips
   */
  Future<List<dynamic>> searchTrips({
    required String origin,
    required String destination,
    String? vehicleType,
    String? timeSlot,
    String? date,
  }) async {
    final json = await _get('/api/v1/trips/search', query: {
      'origin': origin,
      'destination': destination,
      if (vehicleType != null) 'vehicle_type': vehicleType,
      if (timeSlot != null) 'time_slot': timeSlot,
      if (date != null) 'date': date,
    });
    // A refused travel day (past, beyond the booking window, malformed) is reported, not shown as "no trips".
    if (json['status'] == 'error') throw SearchRefused('${json['message'] ?? 'Không tìm được chuyến'}', '${json['code'] ?? ''}');
    return json['data'] ?? [];
  }

  /**
   * PAX-007: Trip Itinerary & Amenities Detail
   */
  Future<Map<String, dynamic>> getTripDetail(String tripId) {
    return _get('/api/v1/trips/$tripId');
  }

  /**
   * PAX-008: Selectable pickup and drop-off stops
   */
  Future<Map<String, dynamic>> getTripStops(String tripId) {
    return _get('/api/v1/trips/$tripId/stops');
  }

  /**
   * PAX-009: Get 2D Seat Map
   */
  Future<Map<String, dynamic>> getSeatMap(String tripId, {String? pickupId, String? dropoffId}) {
    return _get('/api/v1/trips/$tripId/seat-map', query: {
      if (pickupId != null) 'pickup_stop_id': pickupId,
      if (dropoffId != null) 'dropoff_stop_id': dropoffId,
    });
  }

  /**
   * PAX-010: Hold Seats (10 minutes, at most 5). The response carries the hold_id that the booking needs.
   */
  Future<Map<String, dynamic>> holdSeats(String tripId, List<String> seatCodes, {String? pickupStopId, String? dropoffStopId, String? idempotencyKey}) {
    return _post(
      '/api/v1/trips/$tripId/seats/hold',
      body: {
        'seatCodes': seatCodes,
        // The segment decides which seats are free (BR-SEAT-001), none means the whole route.
        if (pickupStopId != null) 'pickupStopId': pickupStopId,
        if (dropoffStopId != null) 'dropoffStopId': dropoffStopId,
      },
      idempotent: true,
      idempotencyKey: idempotencyKey,
    );
  }

  /**
   * PAX-010: Release the hold of the signed-in passenger
   */
  Future<Map<String, dynamic>> releaseHold(String tripId) {
    return _delete('/api/v1/trips/$tripId/seats/hold');
  }

  /**
   * PAX-011 / PAX-012 / PAX-013: Create the booking and its VietQR payment order.
   * The server prices the order; [holdId] must be the live hold of the same passenger on exactly [seatCodes].
   */
  /// Pickup / drop-off modes and home service areas of the bus company (spec 3).
  Future<Map<String, dynamic>> getServiceConfig() {
    return _get('/api/v1/service-config');
  }

  /// Whether an address can be served at home: kind is PICKUP or DROPOFF; with a trip, its departure decides lead time and hours.
  Future<Map<String, dynamic>> checkServiceArea({required String kind, required double lat, required double lng, String? tripId}) {
    return _post('/api/v1/service-areas/check', body: {'kind': kind, 'lat': lat, 'lng': lng, if (tripId != null) 'trip_id': tripId});
  }

  /// A link the ticket owner sends to relatives so they can follow the bus without the app.
  Future<Map<String, dynamic>> shareTicketTracking(String ticketId) {
    return _post('/api/v1/passenger/tickets/$ticketId/share');
  }

  Future<Map<String, dynamic>> createBookingOrder({
    required String tripId,
    required String holdId,
    required List<String> seatCodes,
    required Map<String, dynamic> payer,
    required List<Map<String, dynamic>> passengers,
    String? voucherCode,
    String? pickupStop,
    String? dropoffStop,
    Map<String, dynamic>? homePickup,
    Map<String, dynamic>? homeDropoff,
    bool insuranceSelected = false,
    String? idempotencyKey,
  }) {
    return _post(
      '/api/v1/bookings/create',
      body: {
        'tripId': tripId,
        'holdId': holdId,
        'seatCodes': seatCodes,
        'payer': payer,
        'passengers': passengers,
        'voucherCode': voucherCode,
        'pickupStop': pickupStop,
        'dropoffStop': dropoffStop,
        if (homePickup != null) 'homePickup': homePickup,
        if (homeDropoff != null) 'homeDropoff': homeDropoff,
        'insuranceSelected': insuranceSelected,
      },
      idempotent: true,
      idempotencyKey: idempotencyKey,
    );
  }

  /**
   * PAX-013: Resume polling, or ask for an immediate reconciliation after "Tôi đã chuyển tiền".
   * It never marks the order paid by itself; the bank notification does.
   */
  Future<Map<String, dynamic>> verifyPaymentStatus(String orderId, {bool manualTrigger = false}) {
    return _post(
      '/api/v1/passenger/payments/$orderId/verify-status',
      body: {'manualTrigger': manualTrigger},
    );
  }

  /**
   * PAX-014: Authoritative payment status
   */
  Future<Map<String, dynamic>> getPaymentStatus(String orderId) {
    return _get('/api/v1/payments/$orderId/status');
  }

  /**
   * PAX-015: Booking and its tickets, by order id or PNR
   */
  Future<Map<String, dynamic>> getBooking(String bookingId) {
    return _get('/api/v1/bookings/$bookingId');
  }

  /**
   * PAX-016: Ticket Wallet of the signed-in passenger
   */
  Future<Map<String, dynamic>> getTicketWallet({String tab = 'UPCOMING'}) {
    return _get('/api/v1/passenger/tickets', query: {'tab': tab});
  }

  /**
   * PAX-017: Ticket with its dynamic 30s HMAC QR boarding pass
   */
  Future<Map<String, dynamic>> getTicketQR(String ticketId) {
    return _get('/api/v1/tickets/$ticketId');
  }

  /**
   * PAX-017: Group boarding QR for a multi-seat booking
   */
  Future<Map<String, dynamic>> getGroupQr(String orderId) {
    return _get('/api/v1/passenger/orders/$orderId/group-qr');
  }

  /**
   * PAX-017: Reissue the boarding QR. The old QR and PIN stop working; refused with
   * 409 BOARDING_STARTED once the trip has left (D104).
   */
  Future<Map<String, dynamic>> reissueBoardingQr(String ticketId, {String? idempotencyKey}) {
    return _post(
      '/api/v1/passenger/tickets/$ticketId/qr/reissue',
      body: const {},
      idempotent: true,
      idempotencyKey: idempotencyKey,
    );
  }

  /**
   * PAX-017: Share a ticket with a companion (SMS link and offline PIN)
   */
  Future<Map<String, dynamic>> delegateTicket(
    String ticketId, {
    required String delegateToPhone,
    required String delegateToName,
    String? idempotencyKey,
  }) {
    return _post(
      '/api/v1/passenger/tickets/$ticketId/delegate',
      body: {'delegateToPhone': delegateToPhone, 'delegateToName': delegateToName},
      idempotent: true,
      idempotencyKey: idempotencyKey,
    );
  }

  /**
   * PAX-018: Live tracking snapshot. When no GPS ping has arrived, `has_position` is false and
   * `signal_status` is NO_SIGNAL; the screen must say so instead of drawing a bus.
   */
  Future<Map<String, dynamic>> getLiveRadarHUD(String tripId, {String? ticketId}) {
    return _get(
      '/api/v1/trips/$tripId/tracking',
      query: ticketId == null ? null : {'ticket_id': ticketId},
    );
  }

  /**
   * PAX-018: the same view as [getLiveRadarHUD], pushed by the server as server-sent events: one now, one
   * after each position of the bus, and one every 20 s without. The stream ends (or errors) when the
   * connection drops; the caller then reconnects or asks with [getLiveRadarHUD].
   */
  Stream<Map<String, dynamic>> watchLiveRadarHUD(String tripId, {String? ticketId}) {
    return _stream(
      '/api/v1/trips/$tripId/tracking/stream',
      query: ticketId == null ? null : {'ticket_id': ticketId},
    );
  }

  /// D144: a home passenger answers before the bus comes: READY, NEED_2 or NEED_5.
  Future<Map<String, dynamic>> sendPickupReady(String ticketId, String status) {
    return _post('/api/v1/passenger/tickets/$ticketId/pickup-ready', body: {'status': status});
  }

  /// D144: tells the server this phone runs the app (with a push token once there is one).
  Future<Map<String, dynamic>> registerDevice({String? token, required String platform}) {
    return _post('/api/v1/passenger/devices', body: {'platform': platform, if (token != null) 'token': token});
  }

  /**
   * PAX-020: Notifications Center of the signed-in passenger
   */
  Future<Map<String, dynamic>> getNotifications() {
    return _get('/api/v1/passenger/notifications');
  }

  /**
   * PAX-021: Cancel one ticket and request the tiered refund. The server uses the paid amount and the
   * departure stored on the ticket.
   */
  Future<Map<String, dynamic>> cancelTicket(String ticketId, {String? idempotencyKey}) {
    return _post(
      '/api/v1/passenger/tickets/$ticketId/cancel',
      body: <String, dynamic>{},
      idempotent: true,
      idempotencyKey: idempotencyKey,
    );
  }

  /**
   * PAX-017 (D133): Move the pickup or drop-off of a ticket to another stop inside the paid segment
   * (a later pickup or an earlier drop-off), up to 30 minutes before the departure.
   */
  Future<Map<String, dynamic>> changeTicketStops(String ticketId, {String? pickupStopId, String? dropoffStopId, String? idempotencyKey}) {
    return _post(
      '/api/v1/passenger/tickets/$ticketId/stops',
      body: <String, dynamic>{
        if (pickupStopId != null) 'pickup_stop_id': pickupStopId,
        if (dropoffStopId != null) 'dropoff_stop_id': dropoffStopId,
      },
      idempotent: true,
      idempotencyKey: idempotencyKey,
    );
  }

  /**
   * PAX-017 (D130): Take back a home pickup (side PICKUP) or drop-off (DROPOFF) the company has not reviewed
   * yet; its fee is refunded and the ticket keeps its stop.
   */
  Future<Map<String, dynamic>> withdrawHomeRequest(String ticketId, String side, {String? idempotencyKey}) {
    return _post(
      '/api/v1/passenger/tickets/$ticketId/home-request/withdraw',
      body: <String, dynamic>{'side': side},
      idempotent: true,
      idempotencyKey: idempotencyKey,
    );
  }

  /**
   * PAX-022: Profile of the signed-in passenger
   */
  Future<Map<String, dynamic>> getProfile() {
    return _get('/api/v1/passenger/profile');
  }

  /**
   * PAX-024: Vehicle replacement notice
   */
  Future<Map<String, dynamic>> getReplacementInfo(String tripId) {
    return _get('/api/v1/trips/$tripId/replacement-info');
  }

  /**
   * PAX-025: Delay and disruption notice
   */
  Future<Map<String, dynamic>> getDisruptions(String tripId) {
    return _get('/api/v1/trips/$tripId/disruptions');
  }
}

/// The server refused a search (for example a travel day outside the booking window).
class SearchRefused implements Exception {
  const SearchRefused(this.message, this.code);
  final String message;
  final String code;
  @override
  String toString() => message;
}
