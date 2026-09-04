/**
 * FleetBus Driver Flutter API Client Service
 * Connects driver tactical client with the Node.js API Gateway.
 */

import 'dart:convert';
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

class DriverApiClientService {
  final String baseUrl;
  final http.Client _client;

  DriverApiClientService({
    String? baseUrl,
    http.Client? client,
  })  : baseUrl = resolveDriverBaseUrl(baseUrl),
        _client = client ?? http.Client();

  Map<String, String> get _headers => {
    'Content-Type': 'application/json',
    'x-driver-id': 'drv_8821a',
  };

  /**
   * DRI-001: Driver PIN Login
   */
  Future<Map<String, dynamic>> login(String staffId, String pin) async {
    final response = await _client.post(
      Uri.parse('$baseUrl/api/v1/driver/auth/login'),
      headers: _headers,
      body: jsonEncode({'staffIdOrPhone': staffId, 'pin': pin}),
    );
    return jsonDecode(response.body);
  }

  /**
   * DRI-002: Today Assigned Trips
   */
  Future<Map<String, dynamic>> getTodayTrips() async {
    final response = await _client.get(
      Uri.parse('$baseUrl/api/v1/driver/trips/today'),
      headers: _headers,
    );
    return jsonDecode(response.body);
  }

  /**
   * DRI-004: Pre-Start Readiness Checklist
   */
  Future<Map<String, dynamic>> submitReadinessCheck(String tripId, Map<String, bool> checklist) async {
    final response = await _client.post(
      Uri.parse('$baseUrl/api/v1/driver/trips/$tripId/readiness'),
      headers: _headers,
      body: jsonEncode({'checklist': checklist}),
    );
    return jsonDecode(response.body);
  }

  /**
   * DRI-006: Stream Telemetry GPS Ping
   */
  Future<Map<String, dynamic>> sendTelemetry(String tripId, {
    required double lat,
    required double lng,
    required double speedKmh,
    required double bearingDeg,
  }) async {
    final response = await _client.post(
      Uri.parse('$baseUrl/api/v1/driver/trips/$tripId/telemetry'),
      headers: _headers,
      body: jsonEncode({
        'lat': lat,
        'lng': lng,
        'speed_kmh': speedKmh,
        'bearing_deg': bearingDeg,
      }),
    );
    return jsonDecode(response.body);
  }

  /**
   * DRI-009: Scan Dynamic HMAC QR
   */
  Future<Map<String, dynamic>> boardWithQr(String tripId, String qrPayload) async {
    final response = await _client.post(
      Uri.parse('$baseUrl/api/v1/driver/trips/$tripId/board-qr'),
      headers: _headers,
      body: jsonEncode({'qrPayload': qrPayload}),
    );
    return jsonDecode(response.body);
  }

  /**
   * DRI-012: Collect COD Cash
   */
  Future<Map<String, dynamic>> collectCod(String tripId, String pnr, int amountVnd) async {
    final response = await _client.post(
      Uri.parse('$baseUrl/api/v1/driver/trips/$tripId/collect-cod'),
      headers: _headers,
      body: jsonEncode({'pnr': pnr, 'amountVnd': amountVnd}),
    );
    return jsonDecode(response.body);
  }

  /**
   * DRI-005: Start Trip Dispatch
   */
  Future<Map<String, dynamic>> startTrip(String tripId) async {
    final response = await _client.post(
      Uri.parse('$baseUrl/api/v1/driver/trips/$tripId/start'),
      headers: _headers,
    );
    return jsonDecode(response.body);
  }

  /**
   * DRI-007: Passenger Manifest
   */
  Future<Map<String, dynamic>> getManifest(String tripId) async {
    final response = await _client.get(
      Uri.parse('$baseUrl/api/v1/driver/trips/$tripId/manifest'),
      headers: _headers,
    );
    return jsonDecode(response.body);
  }

  /**
   * DRI-015: Offline Batch Telemetry Replay
   */
  Future<Map<String, dynamic>> replayOfflineTelemetry(List<Map<String, dynamic>> buffer) async {
    final response = await _client.post(
      Uri.parse('$baseUrl/api/v1/driver/telemetry/batch-replay'),
      headers: _headers,
      body: jsonEncode({'telemetryBuffer': buffer}),
    );
    return jsonDecode(response.body);
  }

  /**
   * DRI-017: End Trip & Complete Shift
   */
  Future<Map<String, dynamic>> endTrip(String tripId) async {
    final response = await _client.post(
      Uri.parse('$baseUrl/api/v1/driver/trips/$tripId/end'),
      headers: _headers,
    );
    return jsonDecode(response.body);
  }

  /**
   * DRI-019: Report Emergency Incident / SOS
   */
  Future<Map<String, dynamic>> reportIncident(String tripId, {
    required String incidentType,
    required String description,
    required double lat,
    required double lng,
  }) async {
    final response = await _client.post(
      Uri.parse('$baseUrl/api/v1/driver/trips/$tripId/incident'),
      headers: _headers,
      body: jsonEncode({
        'incident_type': incidentType,
        'description': description,
        'lat': lat,
        'lng': lng,
      }),
    );
    return jsonDecode(response.body);
  }
}
