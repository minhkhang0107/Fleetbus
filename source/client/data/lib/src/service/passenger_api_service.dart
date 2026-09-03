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
  Future<Map<String, dynamic>> getAppConfig() async {
    final response = await _client.get(
      Uri.parse('$baseUrl/api/v1/passenger/config'),
      headers: _headers,
    );
    return jsonDecode(response.body);
  }

  /**
   * PAX-002: Request Phone OTP
   */
  Future<Map<String, dynamic>> requestOtp(String phone) async {
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
  Future<List<dynamic>> searchStations(String query) async {
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
  Future<List<dynamic>> searchTrips({
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
  Future<Map<String, dynamic>> getSeatMap(String tripId, {String? pickupId, String? dropoffId}) async {
    final uri = Uri.parse('$baseUrl/api/v1/passenger/trips/$tripId/seat-map');
    final response = await _client.get(uri, headers: _headers);
    return jsonDecode(response.body);
  }

  /**
   * PAX-010: Hold Seats
   */
  Future<Map<String, dynamic>> holdSeats(String tripId, List<String> seatCodes, String userId) async {
    final response = await _client.post(
      Uri.parse('$baseUrl/api/v1/passenger/trips/$tripId/hold-seats'),
      headers: _headers,
      body: jsonEncode({'seatCodes': seatCodes, 'userId': userId}),
    );
    return jsonDecode(response.body);
  }

  /**
   * PAX-003: Verify Phone OTP
   */
  Future<Map<String, dynamic>> verifyOtp(String phone, String otp) async {
    final response = await _client.post(
      Uri.parse('$baseUrl/api/v1/passenger/auth/verify-otp'),
      headers: _headers,
      body: jsonEncode({'phone': phone, 'otp': otp}),
    );
    return jsonDecode(response.body);
  }

  /**
   * PAX-004: Home Feed Recommendations & Active Ticket
   */
  Future<Map<String, dynamic>> getHomeFeed() async {
    final response = await _client.get(
      Uri.parse('$baseUrl/api/v1/passenger/home-feed'),
      headers: _headers,
    );
    return jsonDecode(response.body);
  }

  /**
   * PAX-007: Trip Itinerary & Amenities Detail
   */
  Future<Map<String, dynamic>> getTripDetail(String tripId) async {
    final response = await _client.get(
      Uri.parse('$baseUrl/api/v1/passenger/trips/$tripId'),
      headers: _headers,
    );
    return jsonDecode(response.body);
  }

  /**
   * PAX-011 / PAX-012 / PAX-013: Create Booking Order with VietQR Payment
   */
  Future<Map<String, dynamic>> createBookingOrder({
    required String tripId,
    required List<String> seatCodes,
    required Map<String, dynamic> payer,
    required List<Map<String, dynamic>> passengers,
    String? voucherCode,
    String? pickupStop,
    String? dropoffStop,
    int unitPriceVnd = 220000,
  }) async {
    final response = await _client.post(
      Uri.parse('$baseUrl/api/v1/passenger/bookings/create'),
      headers: _headers,
      body: jsonEncode({
        'tripId': tripId,
        'seatCodes': seatCodes,
        'payer': payer,
        'passengers': passengers,
        'voucherCode': voucherCode,
        'pickupStop': pickupStop,
        'dropoffStop': dropoffStop,
        'unitPriceVnd': unitPriceVnd,
      }),
    );
    return jsonDecode(response.body);
  }

  /**
   * PAX-016: Ticket Wallet
   */
  Future<Map<String, dynamic>> getTicketWallet({String phone = '0912345678', String tab = 'UPCOMING'}) async {
    final uri = Uri.parse('$baseUrl/api/v1/passenger/tickets').replace(queryParameters: {
      'phone': phone,
      'tab': tab,
    });
    final response = await _client.get(uri, headers: _headers);
    return jsonDecode(response.body);
  }

  /**
   * PAX-017: Dynamic 30s HMAC QR Boarding Pass
   */
  Future<Map<String, dynamic>> getTicketQR(String ticketId) async {
    final response = await _client.get(
      Uri.parse('$baseUrl/api/v1/passenger/tickets/$ticketId/qr'),
      headers: _headers,
    );
    return jsonDecode(response.body);
  }

  /**
   * PAX-018: Get Live GPS Radar HUD
   */
  Future<Map<String, dynamic>> getLiveRadarHUD(String tripId) async {
    final response = await _client.get(
      Uri.parse('$baseUrl/api/v1/passenger/trips/$tripId/radar'),
      headers: _headers,
    );
    return jsonDecode(response.body);
  }

  /**
   * PAX-020: Notifications Center
   */
  Future<Map<String, dynamic>> getNotifications({String userId = 'usr_default'}) async {
    final response = await _client.get(
      Uri.parse('$baseUrl/api/v1/passenger/notifications'),
      headers: {
        ..._headers,
        'x-user-id': userId,
      },
    );
    return jsonDecode(response.body);
  }

  /**
   * PAX-021: Cancel Ticket & Tiered Refund
   */
  Future<Map<String, dynamic>> cancelTicket(String ticketId, {String? departureTime}) async {
    final response = await _client.post(
      Uri.parse('$baseUrl/api/v1/passenger/tickets/$ticketId/cancel'),
      headers: _headers,
      body: jsonEncode({
        if (departureTime != null) 'departureTime': departureTime,
      }),
    );
    return jsonDecode(response.body);
  }
}
