/**
 * FleetBus Driver Flutter API Client Service
 * Connects the driver tactical client with the Node.js API gateway.
 *
 * Every request goes through [_get] or [_post], which add the session token and, for the mutations the
 * server marks as idempotent, an Idempotency-Key. The token comes from [login]; the server knows the
 * driver from it, so the app sends no driver id.
 */

import 'dart:convert';
import 'dart:math';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

/// Helper function to resolve the target backend URL adaptively across Android & iOS
String resolveDriverBaseUrl([String? customUrl]) {
  if (customUrl != null && customUrl.isNotEmpty) {
    return customUrl;
  }
  // Android emulator loopback alias to host machine
  if (!kIsWeb && defaultTargetPlatform == TargetPlatform.android) {
    return 'http://10.0.2.2:3000';
  }
  // iOS Simulator, macOS/Web, desktop, or default host
  return 'http://localhost:3000';
}

/// A new random key for one logical mutation. Reuse the same key when retrying that mutation.
String newDriverIdempotencyKey() {
  final random = Random.secure();
  return List<int>.generate(16, (_) => random.nextInt(256))
      .map((b) => b.toRadixString(16).padLeft(2, '0'))
      .join();
}

class DriverApiClientService {
  final String baseUrl;
  final http.Client _client;

  /// Session token of the signed-in driver (set by [login]).
  String? authToken;

  DriverApiClientService({
    String? baseUrl,
    http.Client? client,
    this.authToken,
  })  : baseUrl = resolveDriverBaseUrl(baseUrl),
        _client = client ?? http.Client();

  Map<String, String> _headers({String? idempotencyKey}) => {
    'Content-Type': 'application/json',
    if (authToken != null) 'Authorization': 'Bearer $authToken',
    if (idempotencyKey != null) 'Idempotency-Key': idempotencyKey,
  };

  Map<String, dynamic> _decode(http.Response response) {
    return jsonDecode(response.body) as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> _get(String path) async {
    return _decode(await _client.get(Uri.parse('$baseUrl$path'), headers: _headers()));
  }

  Future<Map<String, dynamic>> _post(
    String path, {
    Object? body,
    bool idempotent = false,
    String? idempotencyKey,
  }) async {
    final response = await _client.post(
      Uri.parse('$baseUrl$path'),
      headers: _headers(idempotencyKey: idempotent ? (idempotencyKey ?? newDriverIdempotencyKey()) : null),
      body: body == null ? null : jsonEncode(body),
    );
    return _decode(response);
  }

  /**
   * DRI-001: Driver PIN Login. On success the session token is kept for every later request.
   * Five wrong PINs lock the account (429 ACCOUNT_LOCKED); an expired license gives 403 LICENSE_EXPIRED.
   */
  Future<Map<String, dynamic>> login(String staffId, String pin) async {
    final json = await _post('/api/v1/auth/driver/login', body: {'staffIdOrPhone': staffId, 'pin': pin});
    final token = json['data']?['token'];
    if (json['status'] == 'success' && token is String) {
      authToken = token;
    }
    return json;
  }

  /**
   * DRI-002: Trips assigned to the signed-in driver for today
   */
  Future<Map<String, dynamic>> getTodayTrips() {
    return _get('/api/v1/driver/trips/today');
  }

  /**
   * DRI-003: Pre-start trip detail
   */
  Future<Map<String, dynamic>> getTrip(String tripId) {
    return _get('/api/v1/driver/trips/$tripId');
  }

  /**
   * DRI-004: Pre-Start Readiness Checklist (the trip becomes READY when every item is true)
   */
  Future<Map<String, dynamic>> submitReadinessCheck(String tripId, Map<String, bool> checklist, {String? idempotencyKey}) {
    return _post(
      '/api/v1/driver/trips/$tripId/readiness',
      body: {'checklist': checklist},
      idempotent: true,
      idempotencyKey: idempotencyKey,
    );
  }

  /**
   * DRI-005: Start Trip (only from READY)
   */
  Future<Map<String, dynamic>> startTrip(String tripId, {String? idempotencyKey}) {
    return _post(
      '/api/v1/driver/trips/$tripId/start',
      idempotent: true,
      idempotencyKey: idempotencyKey,
    );
  }

  /**
   * DRI-006: Stream Telemetry GPS Ping (only while the trip is IN_TRANSIT)
   */
  Future<Map<String, dynamic>> sendTelemetry(String tripId, {
    required double lat,
    required double lng,
    required double speedKmh,
    required double bearingDeg,
  }) {
    return _post('/api/v1/driver/trips/$tripId/telemetry', body: {
      'lat': lat,
      'lng': lng,
      'speed_kmh': speedKmh,
      'bearing_deg': bearingDeg,
    });
  }

  /**
   * DRI-007: Passenger Manifest (phones are masked by the server)
   */
  Future<Map<String, dynamic>> getManifest(String tripId) {
    return _get('/api/v1/driver/trips/$tripId/manifest');
  }

  /**
   * DRI-007: Board a hail passenger on a free seat. The fare is set by the server.
   */
  Future<Map<String, dynamic>> onboardHailPassenger(String tripId, {
    required String seatCode,
    required int amountCollectedVnd,
    String passengerName = 'Khách vẫy dọc đường',
    String? phone,
    String? dropoffStopId,
    String changeSettlementMethod = 'CASH_RETURNED',
    String? idempotencyKey,
  }) {
    return _post(
      '/api/v1/driver/trips/$tripId/onboard-hail',
      body: {
        'seat_code': seatCode,
        'amount_collected_vnd': amountCollectedVnd,
        'passenger_name': passengerName,
        if (phone != null) 'phone': phone,
        if (dropoffStopId != null) 'dropoff_stop_id': dropoffStopId,
        'change_settlement_method': changeSettlementMethod,
      },
      idempotent: true,
      idempotencyKey: idempotencyKey,
    );
  }

  /**
   * DRI-008: Confirm arrival at a stop of the running trip
   */
  Future<Map<String, dynamic>> arriveAtStop(String tripId, String stopId, {String? idempotencyKey}) {
    return _post(
      '/api/v1/driver/trips/$tripId/stops/$stopId/arrive',
      idempotent: true,
      idempotencyKey: idempotencyKey,
    );
  }

  /**
   * DRI-009: Board with a scanned QR (single, group or offline ticket). The server verifies the signature.
   */
  Future<Map<String, dynamic>> boardWithQr(String tripId, String qrPayload, {String? idempotencyKey}) {
    return _post(
      '/api/v1/driver/trips/$tripId/boarding',
      body: {'qrPayload': qrPayload},
      idempotent: true,
      idempotencyKey: idempotencyKey,
    );
  }

  /**
   * DRI-010: Board by the 6-digit PIN of a ticket, or by hand when no scan is possible
   */
  Future<Map<String, dynamic>> boardManually(String tripId, {
    String? ticketId,
    String? seatCode,
    String? pin,
    String? idempotencyKey,
  }) {
    return _post(
      '/api/v1/driver/trips/$tripId/boarding/manual',
      body: {
        if (ticketId != null) 'ticket_id': ticketId,
        if (seatCode != null) 'seat_code': seatCode,
        if (pin != null) 'pin': pin,
      },
      idempotent: true,
      idempotencyKey: idempotencyKey,
    );
  }

  /**
   * DRI-011: Mark a passenger as no-show (10 minutes after departure, or when the passenger asked to cancel)
   */
  Future<Map<String, dynamic>> markNoShow(String tripId, String ticketId, {
    String? reason,
    bool passengerRequestedCancel = false,
    String? idempotencyKey,
  }) {
    return _post(
      '/api/v1/driver/trips/$tripId/tickets/$ticketId/no-show',
      body: {
        if (reason != null) 'reason': reason,
        'passenger_requested_cancel': passengerRequestedCancel,
      },
      idempotent: true,
      idempotencyKey: idempotencyKey,
    );
  }

  /**
   * DRI-012: Collect COD cash for one ticket, at the fare stored on the ticket
   */
  Future<Map<String, dynamic>> collectCod(String tripId, String ticketId, int amountCollectedVnd, {
    String changeSettlementMethod = 'CASH_RETURNED',
    String? idempotencyKey,
  }) {
    return _post(
      '/api/v1/driver/trips/$tripId/payments/cod-collect',
      body: {
        'ticket_id': ticketId,
        'amount_collected_vnd': amountCollectedVnd,
        'change_settlement_method': changeSettlementMethod,
      },
      idempotent: true,
      idempotencyKey: idempotencyKey,
    );
  }

  /**
   * DRI-014: GPS health of the device
   */
  Future<Map<String, dynamic>> getGpsHealth() {
    return _get('/api/v1/driver/system/gps-health');
  }

  /**
   * DRI-015: Offline Batch Telemetry Replay
   */
  Future<Map<String, dynamic>> replayOfflineTelemetry(List<Map<String, dynamic>> buffer, {String? idempotencyKey}) {
    return _post(
      '/api/v1/driver/telemetry/batch-replay',
      body: {'telemetryBuffer': buffer},
      idempotent: true,
      idempotencyKey: idempotencyKey,
    );
  }

  /**
   * DRI-016: Diagnostics ping to the gateway
   */
  Future<Map<String, dynamic>> getDiagnosticsPing() {
    return _get('/api/v1/driver/system/diagnostics-ping');
  }

  /**
   * DRI-017: End Trip. The server reconciles the cash from the manifest; no totals are sent.
   */
  Future<Map<String, dynamic>> endTrip(String tripId, {String? idempotencyKey}) {
    return _post(
      '/api/v1/driver/trips/$tripId/end',
      idempotent: true,
      idempotencyKey: idempotencyKey,
    );
  }

  /**
   * DRI-018: Profile of the signed-in driver
   */
  Future<Map<String, dynamic>> getProfile() {
    return _get('/api/v1/driver/profile');
  }

  /**
   * DRI-019: Report Emergency Incident / SOS
   */
  Future<Map<String, dynamic>> reportIncident(String tripId, {
    required String incidentType,
    required String description,
    required double lat,
    required double lng,
    int estimatedDelayMinutes = 0,
    String? idempotencyKey,
  }) {
    return _post(
      '/api/v1/driver/trips/$tripId/incidents',
      body: {
        'incident_type': incidentType,
        'description': description,
        'estimated_delay_minutes': estimatedDelayMinutes,
        'lat': lat,
        'lng': lng,
      },
      idempotent: true,
      idempotencyKey: idempotencyKey,
    );
  }
}
