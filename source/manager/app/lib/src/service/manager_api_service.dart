import 'dart:convert';
import 'package:http/http.dart' as http;

class ManagerApiService {
  final String baseUrl;
  String? authToken;

  ManagerApiService({
    String? baseUrl,
    this.authToken,
  }) : baseUrl = baseUrl ?? const String.fromEnvironment('API_BASE_URL', defaultValue: 'http://localhost:3000/api/v1');

  Map<String, String> get _headers => {
    'Content-Type': 'application/json',
    'x-app-version': '3.0.0',
    if (authToken != null) 'Authorization': 'Bearer $authToken',
  };

  // MGR-001 / MGR-029: RBAC Login
  Future<Map<String, dynamic>> login(String username, String password) async {
    final response = await http.post(
      Uri.parse('$baseUrl/ops/auth/login'),
      headers: _headers,
      body: jsonEncode({'username': username, 'password': password}),
    );
    final data = jsonDecode(response.body);
    if (data['status'] == 'success' && data['data']?['token'] != null) {
      authToken = data['data']['token'];
    }
    return data;
  }

  // MGR-002: Executive Operations KPIs
  Future<Map<String, dynamic>> getKpis() async {
    final response = await http.get(
      Uri.parse('$baseUrl/ops/dashboard/kpis'),
      headers: _headers,
    );
    return jsonDecode(response.body);
  }

  // MGR-003, MGR-004: 60Hz Live Fleet Telemetry Radar
  Future<Map<String, dynamic>> getLiveRadar() async {
    final response = await http.get(
      Uri.parse('$baseUrl/ops/radar'),
      headers: _headers,
    );
    return jsonDecode(response.body);
  }

  // MGR-005: Fleet Roster
  Future<Map<String, dynamic>> getFleet() async {
    final response = await http.get(
      Uri.parse('$baseUrl/ops/fleet'),
      headers: _headers,
    );
    return jsonDecode(response.body);
  }

  // MGR-008: Crew Directory
  Future<Map<String, dynamic>> getCrew() async {
    final response = await http.get(
      Uri.parse('$baseUrl/ops/crew'),
      headers: _headers,
    );
    return jsonDecode(response.body);
  }

  // MGR-011: Routes Corridors
  Future<Map<String, dynamic>> getRoutes() async {
    final response = await http.get(
      Uri.parse('$baseUrl/ops/routes'),
      headers: _headers,
    );
    return jsonDecode(response.body);
  }

  // MGR-014: Dispatch Board
  Future<Map<String, dynamic>> getDispatchBoard() async {
    final response = await http.get(
      Uri.parse('$baseUrl/ops/dispatch/board'),
      headers: _headers,
    );
    return jsonDecode(response.body);
  }

  // MGR-019: Hotline POS Booking
  Future<Map<String, dynamic>> createPosBooking({
    required String tripId,
    required String passengerName,
    required String phone,
    required List<String> seatCodes,
    String? note,
  }) async {
    final response = await http.post(
      Uri.parse('$baseUrl/ops/pos/bookings'),
      headers: _headers,
      body: jsonEncode({
        'tripId': tripId,
        'passengerName': passengerName,
        'phone': phone,
        'seatCodes': seatCodes,
        'note': note ?? 'Đặt vé qua tổng đài điều hành POS',
      }),
    );
    return jsonDecode(response.body);
  }

  // MGR-023: Emergency Vehicle Replacement Wizard
  Future<Map<String, dynamic>> swapEmergencyVehicle({
    required String tripId,
    required String newVehiclePlate,
    required String replacementReason,
  }) async {
    final response = await http.post(
      Uri.parse('$baseUrl/ops/trips/$tripId/swap-vehicle'),
      headers: _headers,
      body: jsonEncode({
        'newVehiclePlate': newVehiclePlate,
        'replacementReason': replacementReason,
      }),
    );
    return jsonDecode(response.body);
  }

  // MGR-025: Executive Reports
  Future<Map<String, dynamic>> getExecutiveReports() async {
    final response = await http.get(
      Uri.parse('$baseUrl/ops/reports/executive'),
      headers: _headers,
    );
    return jsonDecode(response.body);
  }
}
