import 'dart:async';
import 'package:flutter/material.dart';
import 'package:resources/resources.dart';
import 'passenger_main_shell.dart';

class PassengerLoginScreen extends StatefulWidget {
  const PassengerLoginScreen({super.key});

  @override
  State<PassengerLoginScreen> createState() => _PassengerLoginScreenState();
}

class _PassengerLoginScreenState extends State<PassengerLoginScreen> {
  final TextEditingController _phoneController = TextEditingController(text: '0912345678');
  final TextEditingController _otpController = TextEditingController();

  bool _isOtpSent = false;
  int _cooldownSeconds = 60;
  Timer? _timer;

  void _sendOtp() {
    setState(() {
      _isOtpSent = true;
      _cooldownSeconds = 60;
    });

    _timer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (mounted) {
        setState(() {
          if (_cooldownSeconds <= 1) {
            _timer?.cancel();
            _cooldownSeconds = 0;
          } else {
            _cooldownSeconds--;
          }
        });
      }
    });
  }

  void _verifyOtp() {
    Navigator.of(context).pushReplacement(
      MaterialPageRoute(builder: (_) => const PassengerMainShell()),
    );
  }

  @override
  void dispose() {
    _timer?.cancel();
    _phoneController.dispose();
    _otpController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        title: const Text('Đăng nhập hành khách'),
      ),
      body: Padding(
        padding: const EdgeInsets.all(24.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Chào mừng bạn đến với BusGo',
              style: TextStyle(
                fontSize: 22,
                fontWeight: FontWeight.bold,
                color: AppColors.charcoalInk,
              ),
            ),
            const SizedBox(height: 6),
            const Text(
              'Nhập số điện thoại để nhận mã xác thực OTP (6 số)',
              style: TextStyle(fontSize: 13, color: AppColors.mutedSteel),
            ),
            const SizedBox(height: 24),

            // Phone Input
            TextFormField(
              controller: _phoneController,
              keyboardType: TextInputType.phone,
              decoration: InputDecoration(
                labelText: 'Số điện thoại',
                prefixText: '+84 ',
                filled: true,
                fillColor: AppColors.canvasPassenger,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(14)),
              ),
            ),
            const SizedBox(height: 16),

            if (!_isOtpSent) ...[
              ElevatedButton(
                onPressed: _sendOtp,
                child: const Text('NHẬN MÃ XÁC THỰC OTP'),
              ),
            ] else ...[
              // OTP Input
              TextFormField(
                controller: _otpController,
                keyboardType: TextInputType.number,
                maxLength: 6,
                decoration: InputDecoration(
                  labelText: 'Nhập mã OTP (6 số)',
                  hintText: '123456',
                  filled: true,
                  fillColor: AppColors.canvasPassenger,
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(14)),
                ),
              ),
              const SizedBox(height: 8),

              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    _cooldownSeconds > 0 ? 'Gửi lại sau ${_cooldownSeconds}s' : 'Chưa nhận được mã?',
                    style: const TextStyle(fontSize: 12, color: AppColors.mutedSteel),
                  ),
                  if (_cooldownSeconds == 0)
                    TextButton(
                      onPressed: _sendOtp,
                      child: const Text('GỬI LẠI MÃ'),
                    ),
                ],
              ),
              const SizedBox(height: 16),

              ElevatedButton(
                onPressed: _verifyOtp,
                child: const Text('XÁC THỰC & TIẾP TỤC'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
