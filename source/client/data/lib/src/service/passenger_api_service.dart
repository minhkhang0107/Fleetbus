/**
 * FleetBus Passenger Flutter API Client Service
 * Connects mobile client with the Node.js Universal API Gateway.
 */

import 'dart:convert';
import 'package:domain/domain.dart';
import 'package:http/http.dart' as http;

class PassengerApiClientService {
  final String baseUrl;
  final http.Client _client;

  PassengerApiClientService({
    this.baseUrl = 'http://localhost:3000',
    http.Client? client,
  }) : _client = client ?? http.Client();

  Map<String, String> get _headers => {
    'Content-Type': 'application/json',
    'x-app-version': '3.0.0',
  };

  /**
   * PAX-001: App Config handshake
   */
  async Future<Map<String, dynamic>> getAppConfig() async {
    final response = await _client.get(
      Uri.parse('$baseUrl/api/v1/passenger/config'),
      headers: _headers,
    );
    return jsonDecode(response.body);
  }

  /**
   * PAX-002: Request Phone OTP
   */
  async Future<Map<String, dynamic>> requestOtp(String phone) async {
    final response = await _client.post(
      Uri.parse('$baseUrl/api/v1/passenger/auth/request-otp'),
      headers: _headers,
      body: jsonEncode({'phone': phone}),
    );
    return jsonDecode(response.body);
  }

  /**
   * PAX-005: Search Stations
   */
  async Future<List<dynamic>> searchStations(String query) async {
    final response = await _client.get(
      Uri.parse('$baseUrl/api/v1/passenger/stations?q=${Uri.encodeComponent(query)}'),
      headers: _headers,
    );
    final json = jsonDecode(response.body);
    return json['data'] ?? [];
  }

  /**
   * PAX-006: Search Trips
   */
  async Future<List<dynamic>> searchTrips({
    required String origin,
    required String destination,
    String? vehicleType,
    String? timeSlot,
  }) async {
    final queryParams = {
      'origin': origin,
      'destination': destination,
      if (vehicleType != null) 'vehicle_type': vehicleType,
      if (timeSlot != null) 'time_slot': timeSlot,
    };

    final uri = Uri.parse('$baseUrl/api/v1/passenger/trips').replace(queryParameters: queryParams);
    final response = await _client.get(uri, headers: _headers);
    final json = jsonDecode(response.body);
    return json['data'] ?? [];
  }

  /**
   * PAX-009: Get 2D Seat Map
   */
  async Future<Map<String, dynamic>> getSeatMap(String tripId, {String? pickupId, String? dropoffId}) async {
    final uri = Uri.parse('$baseUrl/api/v1/passenger/trips/$tripId/seat-map');
    final response = await _client.get(uri, headers: _headers);
    return jsonDecode(response.body);
  }

  /**
   * PAX-010: Hold Seats
   */
  async Future<Map<String, dynamic>> holdSeats(String tripId, List<String> seatCodes, String userId) async {
    final response = await _client.post(
      Uri.parse('$baseUrl/api/v1/passenger/trips/$tripId/hold-seats'),
      headers: _headers,
      body: jsonEncode({'seatCodes': seatCodes, 'userId': userId}),
    );
    return jsonDecode(response.body);
  }

  /**
   * PAX-018: Get Live GPS Radar HUD
   */
  async Future<Map<String, dynamic>> getLiveRadarHUD(String tripId) async {
    final response = await _client.get(
      Uri.parse('$baseUrl/api/v1/passenger/trips/$tripId/radar'),
      headers: _headers,
    );
    return jsonDecode(response.body);
  }
}
