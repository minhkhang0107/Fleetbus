import 'dart:async';
import 'package:flutter/material.dart';
import 'package:resources/resources.dart';
import 'passenger_live_radar_screen.dart';

class PassengerTicketQrScreen extends StatefulWidget {
  const PassengerTicketQrScreen({super.key});

  @override
  State<PassengerTicketQrScreen> createState() => _PassengerTicketQrScreenState();
}

class _PassengerTicketQrScreenState extends State<PassengerTicketQrScreen> {
  int _secondsLeft = 30;
  Timer? _timer;
  String _currentHmac = '9B7C12EF8821';

  @override
  void initState() {
    super.initState();
    _startQrTimer();
  }

  void _startQrTimer() {
    _timer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (mounted) {
        setState(() {
          if (_secondsLeft <= 1) {
            _secondsLeft = 30;
            // Rotate signature (PAX-017)
            _currentHmac = (10000000 + (DateTime.now().millisecondsSinceEpoch % 90000000)).toRadixString(16).toUpperCase();
          } else {
            _secondsLeft--;
          }
        });
      }
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.canvasPassenger,
      appBar: AppBar(
        title: const Text('Vé điện tử lên xe'),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // E-Ticket Card
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: AppColors.whisperBorder),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withOpacity(0.04),
                  blurRadius: 16,
                  offset: const Offset(0, 4),
                )
              ],
            ),
            child: Column(
              children: [
                const Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Mã vé PNR', style: TextStyle(fontSize: 11, color: AppColors.mutedSteel)),
                        Text(
                          'BG-882199',
                          style: TextStyle(
                            fontFamily: 'JetBrains Mono',
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                            color: AppColors.pnrOrange,
                          ),
                        ),
                      ],
                    ),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text('Chỗ ngồi', style: TextStyle(fontSize: 11, color: AppColors.mutedSteel)),
                        Text(
                          'A01 (Tầng 1)',
                          style: TextStyle(
                            fontFamily: 'JetBrains Mono',
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                            color: AppColors.primarySapphire,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
                const Divider(height: 32),

                // Dynamic Rotating QR Code Pass (PAX-017)
                Container(
                  width: 200,
                  height: 200,
                  decoration: BoxDecoration(
                    color: AppColors.charcoalInk,
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(Icons.qr_code_2_rounded, size: 130, color: Colors.white),
                      Text(
                        'HMAC: $_currentHmac',
                        style: const TextStyle(
                          fontFamily: 'JetBrains Mono',
                          fontSize: 10,
                          fontWeight: FontWeight.bold,
                          color: AppColors.emeraldSafe,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                Text(
                  'Mã QR tự xoay sau: ${_secondsLeft}s',
                  style: const TextStyle(
                    fontFamily: 'JetBrains Mono',
                    fontSize: 12,
                    color: AppColors.mutedSteel,
                  ),
                ),
                const SizedBox(height: 16),
                const Text(
                  'Hành khách: Nguyễn Văn An\nĐón: Bến xe Giáp Bát · 07:00 (28/08/2026)',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 13, color: AppColors.charcoalInk, height: 1.4),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),

          ElevatedButton.icon(
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.charcoalInk,
            ),
            onPressed: () {
              Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const PassengerLiveRadarScreen()),
              );
            },
            icon: const Icon(Icons.radar_rounded, color: AppColors.emeraldSafe),
            label: const Text('THEO DÕI XE TRỰC TIẾP (RADAR GPS)'),
          ),
        ],
      ),
    );
  }
}
