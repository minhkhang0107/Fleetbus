/**
 * FleetBus Driver Flutter API Client Service
 * Connects driver tactical client with the Node.js API Gateway.
 */

import 'dart:convert';
import 'package:http/http.dart' as http;

class DriverApiClientService {
  final String baseUrl;
  final http.Client _client;

  DriverApiClientService({
    this.baseUrl = 'http://localhost:3000',
    http.Client? client,
  }) : _client = client ?? http.Client();

  Map<String, String> get _headers => {
    'Content-Type': 'application/json',
    'x-driver-id': 'drv_8821a',
  };

  /**
   * DRI-001: Driver PIN Login
   */
  async Future<Map<String, dynamic>> login(String staffId, String pin) async {
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
  async Future<Map<String, dynamic>> getTodayTrips() async {
    final response = await _client.get(
      Uri.parse('$baseUrl/api/v1/driver/trips/today'),
      headers: _headers,
    );
    return jsonDecode(response.body);
  }

  /**
   * DRI-004: Pre-Start Readiness Checklist
   */
  async Future<Map<String, dynamic>> submitReadinessCheck(String tripId, Map<String, bool> checklist) async {
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
  async Future<Map<String, dynamic>> sendTelemetry(String tripId, {
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
  async Future<Map<String, dynamic>> boardWithQr(String tripId, String qrPayload) async {
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
  async Future<Map<String, dynamic>> collectCod(String tripId, String pnr, int amountVnd) async {
    final response = await _client.post(
      Uri.parse('$baseUrl/api/v1/driver/trips/$tripId/collect-cod'),
      headers: _headers,
      body: jsonEncode({'pnr': pnr, 'amountVnd': amountVnd}),
    );
    return jsonDecode(response.body);
  }

  /**
   * DRI-015: Offline Batch Telemetry Replay
   */
  async Future<Map<String, dynamic>> replayOfflineTelemetry(List<Map<String, dynamic>> buffer) async {
    final response = await _client.post(
      Uri.parse('$baseUrl/api/v1/driver/telemetry/batch-replay'),
      headers: _headers,
      body: jsonEncode({'telemetryBuffer': buffer}),
    );
    return jsonDecode(response.body);
  }
}
