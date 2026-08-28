import 'package:flutter/material.dart';
import 'package:resources/resources.dart';
import 'passenger_main_shell.dart';

class PassengerSplashScreen extends StatefulWidget {
  const PassengerSplashScreen({super.key});

  @override
  State<PassengerSplashScreen> createState() => _PassengerSplashScreenState();
}

class _PassengerSplashScreenState extends State<PassengerSplashScreen> with SingleTickerProviderStateMixin {
  late AnimationController _animController;
  late Animation<double> _scaleAnimation;

  @override
  void initState() {
    super.initState();
    _animController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 800),
    );
    _scaleAnimation = CurvedAnimation(
      parent: _animController,
      curve: Curves.easeOutBack,
    );
    _animController.forward();

    // Auto-navigate to Main Shell after handshake simulation (PAX-001)
    Future.delayed(const Duration(milliseconds: 1600), () {
      if (mounted) {
        Navigator.of(context).pushReplacement(
          MaterialPageRoute(builder: (_) => const PassengerMainShell()),
        );
      }
    });
  }

  @override
  void dispose() {
    _animController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Align(
                alignment: Alignment.topRight,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: Colors.grey.shade100,
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: const Text(
                    'v3.0.0 (Build 412)',
                    style: TextStyle(
                      fontFamily: 'JetBrains Mono',
                      fontSize: 11,
                      color: AppColors.mutedSteel,
                    ),
                  ),
                ),
              ),
              ScaleTransition(
                scale: _scaleAnimation,
                child: Column(
                  children: [
                    Container(
                      width: 80,
                      height: 80,
                      decoration: BoxDecoration(
                        color: AppColors.primarySapphire,
                        borderRadius: BorderRadius.circular(24),
                        boxShadow: [
                          BoxShadow(
                            color: AppColors.primarySapphire.withOpacity(0.25),
                            blurRadius: 20,
                            offset: const Offset(0, 10),
                          )
                        ],
                      ),
                      child: const Icon(
                        Icons.directions_bus_rounded,
                        size: 44,
                        color: Colors.white,
                      ),
                    ),
                    const SizedBox(height: 16),
                    const Text(
                      'BusGo',
                      style: TextStyle(
                        fontSize: 32,
                        fontWeight: FontWeight.bold,
                        letterSpacing: -0.5,
                        color: AppColors.charcoalInk,
                      ),
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      'Hệ thống đặt xe & theo dõi liên tỉnh',
                      style: TextStyle(
                        fontSize: 14,
                        color: AppColors.mutedSteel,
                      ),
                    ),
                  ],
                ),
              ),
              const Column(
                children: [
                  SizedBox(
                    width: 24,
                    height: 24,
                    child: CircularProgressIndicator(
                      strokeWidth: 2.5,
                      color: AppColors.primarySapphire,
                    ),
                  ),
                  SizedBox(height: 12),
                  Text(
                    'Đang khởi tạo kết nối an toàn...',
                    style: TextStyle(
                      fontSize: 12,
                      color: AppColors.mutedSteel,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
