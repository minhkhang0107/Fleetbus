import 'package:flutter/material.dart';
import 'driver_today_trips_screen.dart';

class DriverLoginScreen extends StatefulWidget {
  const DriverLoginScreen({super.key});

  @override
  State<DriverLoginScreen> createState() => _DriverLoginScreenState();
}

class _DriverLoginScreenState extends State<DriverLoginScreen> {
  final TextEditingController _staffIdController = TextEditingController(text: 'TX8821');
  final TextEditingController _pinController = TextEditingController(text: '123456');
  bool _isLoading = false;
  String? _errorMessage;

  void _handleLogin() {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    final staffId = _staffIdController.text.trim();
    final pin = _pinController.text.trim();

    if (staffId == 'TX8821' && pin == '123456') {
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => const DriverTodayTripsScreen()),
      );
    } else {
      setState(() {
        _isLoading = false;
        _errorMessage = 'Mã nhân viên hoặc mã PIN không hợp lệ (Thử TX8821 / 123456)';
      });
    }
  }

  @override
  void dispose() {
    _staffIdController.dispose();
    _pinController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F172A), // Dark Tactical Canvas
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const SizedBox(height: 32),
              // Brand & Cockpit Header
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: const Color(0xFF2563EB),
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: const Icon(Icons.shield_rounded, color: Colors.white, size: 28),
                  ),
                  const SizedBox(width: 14),
                  const Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'BUSGO DRIVER COCKPIT',
                        style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.bold,
                          color: Colors.white,
                          fontFamily: 'JetBrains Mono',
                          letterSpacing: 1.2,
                        ),
                      ),
                      Text(
                        'Hệ thống buồng lái & Điều hành an toàn',
                        style: TextStyle(fontSize: 12, color: Color(0xFF94A3B8)),
                      ),
                    ],
                  ),
                ],
              ),

              const SizedBox(height: 48),

              const Text(
                'Đăng nhập ca lái xe',
                style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: Colors.white),
              ),
              const SizedBox(height: 6),
              const Text(
                'Yêu cầu giấy phép lái xe hạng FC còn hiệu lực',
                style: TextStyle(fontSize: 13, color: Color(0xFF94A3B8)),
              ),

              const SizedBox(height: 32),

              // Staff ID Input
              TextFormField(
                controller: _staffIdController,
                style: const TextStyle(color: Colors.white, fontFamily: 'JetBrains Mono', fontWeight: FontWeight.bold),
                decoration: InputDecoration(
                  labelText: 'MÃ TÀI XẾ / NHÂN VIÊN',
                  labelStyle: const TextStyle(color: Color(0xFF94A3B8), fontSize: 12),
                  filled: true,
                  fillColor: const Color(0xFF1E293B),
                  prefixIcon: const Icon(Icons.badge_rounded, color: Color(0xFF2563EB)),
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
                ),
              ),

              const SizedBox(height: 16),

              // PIN Input
              TextFormField(
                controller: _pinController,
                obscureText: true,
                keyboardType: TextInputType.number,
                maxLength: 6,
                style: const TextStyle(color: Colors.white, fontFamily: 'JetBrains Mono', fontSize: 18, letterSpacing: 8),
                decoration: InputDecoration(
                  labelText: 'MÃ PIN BẢO MẬT (6 SỐ)',
                  labelStyle: const TextStyle(color: Color(0xFF94A3B8), fontSize: 12),
                  counterText: '',
                  filled: true,
                  fillColor: const Color(0xFF1E293B),
                  prefixIcon: const Icon(Icons.lock_rounded, color: Color(0xFF2563EB)),
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
                ),
              ),

              if (_errorMessage != null) ...[
                const SizedBox(height: 12),
                Text(
                  _errorMessage!,
                  style: const TextStyle(color: Color(0xFFEF4444), fontSize: 12, fontWeight: FontWeight.bold),
                ),
              ],

              const Spacer(),

              // Login CTA
              SizedBox(
                width: double.infinity,
                height: 56,
                child: ElevatedButton(
                  onPressed: _isLoading ? null : _handleLogin,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF2563EB),
                    shape: BorderRadius.circular(16),
                  ),
                  child: _isLoading
                      ? const CircularProgressIndicator(color: Colors.white)
                      : const Text(
                          'BẮT ĐẦU CA LÀM VIỆC',
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                            color: Colors.white,
                            fontFamily: 'JetBrains Mono',
                          ),
                        ),
                ),
              ),
              const SizedBox(height: 16),
            ],
          ),
        ),
      ),
    );
  }
}
