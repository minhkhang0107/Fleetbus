import 'dart:convert';
import 'dart:math';
import 'package:http/http.dart' as http;

/// A new random key for one logical mutation. Reuse the same key when retrying that mutation.
String newManagerIdempotencyKey() {
  final random = Random.secure();
  return List<int>.generate(16, (_) => random.nextInt(256))
      .map((b) => b.toRadixString(16).padLeft(2, '0'))
      .join();
}

/// Client of the Operations API. [baseUrl] already ends with `/api/v1`.
///
/// Every request goes through [_get] or [_post], which add the session token and, for the mutations the
/// server marks as idempotent, an Idempotency-Key. The role of the signed-in staff member (MGR-029)
/// decides what the server accepts: a 403 FORBIDDEN means the role may not do it.
class ManagerApiService {
  final String baseUrl;
  final http.Client _client;

  /// Session token of the signed-in staff member (set by [login]).
  String? authToken;

  ManagerApiService({
    String? baseUrl,
    http.Client? client,
    this.authToken,
  })  : baseUrl = baseUrl ?? const String.fromEnvironment('API_BASE_URL', defaultValue: 'http://localhost:3000/api/v1'),
        _client = client ?? http.Client();

  Map<String, String> _headers({String? idempotencyKey}) => {
    'Content-Type': 'application/json',
    'x-app-version': '3.0.0',
    if (authToken != null) 'Authorization': 'Bearer $authToken',
    if (idempotencyKey != null) 'Idempotency-Key': idempotencyKey,
  };

  Map<String, dynamic> _decode(http.Response response) {
    return jsonDecode(response.body) as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> _get(String path, {Map<String, String>? query}) async {
    final uri = Uri.parse('$baseUrl$path').replace(queryParameters: query);
    return _decode(await _client.get(uri, headers: _headers()));
  }

  Future<Map<String, dynamic>> _post(
    String path, {
    Object? body,
    bool idempotent = false,
    String? idempotencyKey,
  }) async {
    final response = await _client.post(
      Uri.parse('$baseUrl$path'),
      headers: _headers(idempotencyKey: idempotent ? (idempotencyKey ?? newManagerIdempotencyKey()) : null),
      body: body == null ? null : jsonEncode(body),
    );
    return _decode(response);
  }

  Future<Map<String, dynamic>> _patch(String path, {Object? body}) async {
    final response = await _client.patch(Uri.parse('$baseUrl$path'), headers: _headers(), body: body == null ? null : jsonEncode(body));
    return _decode(response);
  }

  Future<Map<String, dynamic>> _delete(String path) async {
    return _decode(await _client.delete(Uri.parse('$baseUrl$path'), headers: _headers()));
  }

  // MGR-001 / MGR-029: RBAC Login. Five wrong passwords lock the account (429 ACCOUNT_LOCKED).
  // The director and the finance controller must also send the 6-digit TOTP code (401 TOTP_REQUIRED without it).
  Future<Map<String, dynamic>> login(String username, String password, {String? totp}) async {
    final data = await _post('/auth/staff/login', body: {'username': username, 'password': password, if (totp != null) 'totp': totp});
    final token = data['data']?['token'];
    if (data['status'] == 'success' && token is String) {
      authToken = token;
    }
    return data;
  }

  // MGR-002: Executive Operations KPIs
  /// D144: messages sent to passengers outside the app (push, SMS), newest first.
  Future<Map<String, dynamic>> getMessages({String? tripId}) {
    return _get('/ops/messages', query: tripId == null ? null : {'trip_id': tripId});
  }

  Future<Map<String, dynamic>> getKpis() {
    return _get('/ops/dashboard/kpis');
  }

  // MGR-003: Live Fleet Telemetry Radar
  Future<Map<String, dynamic>> getLiveRadar() {
    return _get('/ops/fleet/live-positions');
  }

  // MGR-005: Fleet Roster
  Future<Map<String, dynamic>> getFleet() {
    return _get('/ops/vehicles');
  }

  // MGR-015: Crew Directory
  Future<Map<String, dynamic>> getCrew() {
    return _get('/ops/drivers');
  }

  // MGR-008: Routes Corridors
  Future<Map<String, dynamic>> getRoutes() {
    return _get('/ops/routes');
  }

  // MGR-010: Trip list
  Future<Map<String, dynamic>> getTrips() {
    return _get('/ops/trips');
  }

  // MGR-012: Trip detail
  Future<Map<String, dynamic>> getTripMaster(String tripId) {
    return _get('/ops/trips/$tripId/master');
  }

  // MGR-013: Trip seat inventory
  Future<Map<String, dynamic>> getTripSeatMatrix(String tripId) {
    return _get('/ops/trips/$tripId/seat-matrix');
  }

  // MGR-014: Dispatch Board
  Future<Map<String, dynamic>> getDispatchBoard() {
    return _get('/ops/dispatch/matrix');
  }

  // MGR-017: Booking search (phones are masked unless the role is the admin)
  Future<Map<String, dynamic>> getBookings() {
    return _get('/ops/bookings');
  }

  // MGR-018: Booking detail, by PNR
  Future<Map<String, dynamic>> getBooking(String pnr) {
    return _get('/ops/bookings/$pnr');
  }

  // MGR-020: Counter ticket sale. Pass [reservationId] to collect the seats of a hotline hold.
  Future<Map<String, dynamic>> createPosBooking({
    required String tripId,
    required String passengerName,
    required String phone,
    required List<String> seatCodes,
    String paymentMethod = 'CASH_POS',
    String? reservationId,
    String? idempotencyKey,
  }) {
    return _post(
      '/ops/pos/orders',
      body: {
        'tripId': tripId,
        'passengerName': passengerName,
        'phone': phone,
        'seatCodes': seatCodes,
        'paymentMethod': paymentMethod,
        if (reservationId != null) 'reservationId': reservationId,
      },
      idempotent: true,
      idempotencyKey: idempotencyKey,
    );
  }

  // MGR-020: Hotline seat hold. [holdPolicy] is UNTIL_DEPARTURE_OFFSET or CUSTOM_EXPIRY_MINUTES.
  Future<Map<String, dynamic>> createHotlineHold({
    required String tripId,
    required String passengerName,
    required String phone,
    required List<String> seatCodes,
    String holdPolicy = 'UNTIL_DEPARTURE_OFFSET',
    int departureOffsetMinutes = 30,
    int customExpiryMinutes = 60,
    String? notes,
    String? idempotencyKey,
  }) {
    return _post(
      '/ops/pos/hotline-hold',
      body: {
        'tripId': tripId,
        'passengerName': passengerName,
        'phone': phone,
        'seatCodes': seatCodes,
        'holdPolicy': holdPolicy,
        'departureOffsetMinutes': departureOffsetMinutes,
        'customExpiryMinutes': customExpiryMinutes,
        if (notes != null) 'notes': notes,
      },
      idempotent: true,
      idempotencyKey: idempotencyKey,
    );
  }

  // MGR-013: Block seats for a technical reason (a reason is required) or open them again
  Future<Map<String, dynamic>> setSeatLock(
    String tripId, {
    required List<String> seatCodes,
    required bool locked,
    String? reason,
    String? idempotencyKey,
  }) {
    return _post(
      '/ops/trips/$tripId/seats/override-lock',
      body: {'seatCodes': seatCodes, 'locked': locked, if (reason != null) 'reason': reason},
      idempotent: true,
      idempotencyKey: idempotencyKey,
    );
  }

  // MGR-022: Pay out a change debt receipt at the cash desk, once
  Future<Map<String, dynamic>> redeemDebtReceipt(String receiptCode, {String? stationId, String? idempotencyKey}) {
    return _post(
      '/ops/debt-receipts/$receiptCode/redeem',
      body: {if (stationId != null) 'station_id': stationId},
      idempotent: true,
      idempotencyKey: idempotencyKey,
    );
  }

  // MGR-022: Approve or reject a refund request, once
  Future<Map<String, dynamic>> processRefund(String refundId, {required bool approved, String? notes, String? idempotencyKey}) {
    return _post(
      '/ops/refunds/$refundId/process',
      body: {'approved': approved, if (notes != null) 'notes': notes},
      idempotent: true,
      idempotencyKey: idempotencyKey,
    );
  }

  // MGR-023: Emergency Vehicle Replacement Wizard. The vehicle must be free and have enough seats.
  Future<Map<String, dynamic>> swapEmergencyVehicle({
    required String tripId,
    required String newVehiclePlate,
    required String replacementReason,
    String? newDriverId,
    String? idempotencyKey,
  }) {
    return _post(
      '/ops/trips/$tripId/replace-vehicle',
      body: {
        'newVehiclePlate': newVehiclePlate,
        'replacementReason': replacementReason,
        if (newDriverId != null) 'newDriverId': newDriverId,
      },
      idempotent: true,
      idempotencyKey: idempotencyKey,
    );
  }

  // MGR-024: Declare a trip delay
  Future<Map<String, dynamic>> delayTrip(String tripId, {required int delayMinutes, String? reason, String? idempotencyKey}) {
    return _post(
      '/ops/trips/$tripId/delay',
      body: {'delayMinutes': delayMinutes, if (reason != null) 'reason': reason},
      idempotent: true,
      idempotencyKey: idempotencyKey,
    );
  }

  // MGR-017: buses and drivers the office may give a trip, each with the reason it cannot when it cannot
  Future<Map<String, dynamic>> getAssignOptions(String tripId) {
    return _get('/ops/trips/$tripId/assign-options');
  }

  // MGR-017: give a trip its bus and driver; scope SCHEDULE makes them the default of the schedule's later runs
  Future<Map<String, dynamic>> assignTrip(String tripId, {required String vehicleId, required String driverId, String scope = 'TRIP', String? idempotencyKey}) {
    return _post(
      '/ops/trips/$tripId/assign',
      body: {'vehicleId': vehicleId, 'driverId': driverId, 'scope': scope},
      idempotent: true,
      idempotencyKey: idempotencyKey,
    );
  }

  // MGR-025: Operations alerts feed
  Future<Map<String, dynamic>> getAlerts() {
    return _get('/ops/alerts');
  }

  // MGR-027: Executive report for a period (inclusive dates, YYYY-MM-DD)
  Future<Map<String, dynamic>> getExecutiveReports({String? from, String? to}) {
    return _get('/ops/reports/yield', query: {
      if (from != null) 'from': from,
      if (to != null) 'to': to,
    });
  }

  // MGR-028: Audit log (who did what, to what, from where, before and after)
  Future<Map<String, dynamic>> getAuditLogs() {
    return _get('/ops/audit-logs');
  }

  // MGR-031: Promotion banners of the passenger home slider, with status LIVE / SCHEDULED / ENDED / OFF (director only)
  Future<Map<String, dynamic>> getPromoBanners() {
    return _get('/ops/promo-banners');
  }

  // MGR-031: New banner; `content_html` may not hold scripts, iframes, forms or on... handlers (400 VALIDATION_ERROR)
  Future<Map<String, dynamic>> createPromoBanner(Map<String, dynamic> banner, {String? idempotencyKey}) {
    return _post('/ops/promo-banners', body: banner, idempotent: true, idempotencyKey: idempotencyKey);
  }

  // MGR-031: Edit some fields of a banner; fields left out are kept
  Future<Map<String, dynamic>> updatePromoBanner(String bannerId, Map<String, dynamic> fields) {
    return _patch('/ops/promo-banners/${Uri.encodeComponent(bannerId)}', body: fields);
  }

  // MGR-031: Show or hide a banner on the passenger app
  Future<Map<String, dynamic>> setPromoBannerActive(String bannerId, {required bool active, String? idempotencyKey}) {
    final id = Uri.encodeComponent(bannerId);
    if (active) return _post('/ops/promo-banners/$id/activate', idempotent: true, idempotencyKey: idempotencyKey);
    return _post('/ops/promo-banners/$id/deactivate', idempotent: true, idempotencyKey: idempotencyKey);
  }

  // MGR-031: Delete a banner (kept in the audit log)
  Future<Map<String, dynamic>> deletePromoBanner(String bannerId) {
    return _delete('/ops/promo-banners/${Uri.encodeComponent(bannerId)}');
  }

  // MGR-032: Fixed timetable (schedules) and the routes a new one may run on
  Future<Map<String, dynamic>> getSchedules() {
    return _get('/ops/schedules');
  }

  // MGR-032: New fixed departure: route_id, departure (HH:mm), days_of_week (1 = Monday .. 7), valid_from (from change_from on), valid_to, base_fare_vnd
  Future<Map<String, dynamic>> createSchedule(Map<String, dynamic> schedule, {String? idempotencyKey}) {
    return _post('/ops/schedules', body: schedule, idempotent: true, idempotencyKey: idempotencyKey);
  }

  // MGR-032: Change a departure; it starts on the first day not on sale (change_from) or a later effective_from
  Future<Map<String, dynamic>> updateSchedule(String scheduleId, Map<String, dynamic> fields) {
    return _patch('/ops/schedules/${Uri.encodeComponent(scheduleId)}', body: fields);
  }

  // MGR-032: Cancel the changes of a departure that are not on sale yet
  Future<Map<String, dynamic>> cancelScheduleChanges(String scheduleId) {
    return _delete('/ops/schedules/${Uri.encodeComponent(scheduleId)}/changes');
  }

  // MGR-014 (D131): Cancel one day's departure; every ticket is refunded in full and its passenger told
  Future<Map<String, dynamic>> cancelTrip(String tripId, {required String reason, String? idempotencyKey}) {
    return _post('/ops/trips/${Uri.encodeComponent(tripId)}/cancel', body: {'reason': reason}, idempotent: true, idempotencyKey: idempotencyKey);
  }

  // MGR-014 (D131): Stop (open: false) or resume (open: true) online sales of a departure
  Future<Map<String, dynamic>> setTripSales(String tripId, {required bool open, String? reason, String? idempotencyKey}) {
    return _post('/ops/trips/${Uri.encodeComponent(tripId)}/sales', body: {'open': open, if (reason != null) 'reason': reason}, idempotent: true, idempotencyKey: idempotencyKey);
  }

  // MGR-033 (D130): Home pickup / drop-off requests; status PENDING_REVIEW (default), CONFIRMED, REJECTED, WITHDRAWN or ALL
  Future<Map<String, dynamic>> getHomeRequests({String status = 'PENDING_REVIEW'}) {
    return _get('/ops/home-requests', query: {'status': status});
  }

  // MGR-033 (D130): Confirm a request; side is PICKUP or DROPOFF
  Future<Map<String, dynamic>> confirmHomeRequest(String orderId, String side, {String? idempotencyKey}) {
    return _post('/ops/home-requests/${Uri.encodeComponent(orderId)}/$side/confirm', body: {}, idempotent: true, idempotencyKey: idempotencyKey);
  }

  // MGR-033 (D130): Refuse a request with a reason the passenger reads; its fee is refunded
  Future<Map<String, dynamic>> rejectHomeRequest(String orderId, String side, {required String reason, String? idempotencyKey}) {
    return _post('/ops/home-requests/${Uri.encodeComponent(orderId)}/$side/reject', body: {'reason': reason}, idempotent: true, idempotencyKey: idempotencyKey);
  }
}
