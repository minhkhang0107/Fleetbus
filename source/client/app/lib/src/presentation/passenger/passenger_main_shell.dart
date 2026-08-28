import 'package:flutter/material.dart';
import 'package:resources/resources.dart';

import 'passenger_home_screen.dart';
import 'passenger_wallet_screen.dart';
import 'passenger_live_radar_screen.dart';
import 'passenger_notifications_screen.dart';

class PassengerMainShell extends StatefulWidget {
  const PassengerMainShell({super.key});

  @override
  State<PassengerMainShell> createState() => _PassengerMainShellState();
}

class _PassengerMainShellState extends State<PassengerMainShell> {
  int _currentIndex = 0;

  final List<Widget> _screens = const [
    PassengerHomeScreen(),
    PassengerWalletScreen(),
    PassengerLiveRadarScreen(),
    PassengerNotificationsScreen(),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(
        index: _currentIndex,
        children: _screens,
      ),
      bottomNavigationBar: Container(
        decoration: BoxDecoration(
          color: Colors.white.withOpacity(0.98),
          border: const Border(
            top: BorderSide(color: AppColors.whisperBorder, width: 1),
          ),
        ),
        child: SafeArea(
          child: SizedBox(
            height: 60,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceAround,
              children: [
                _buildNavItem(0, Icons.home_rounded, 'Trang chủ'),
                _buildNavItem(1, Icons.confirmation_number_rounded, 'Vé của tôi'),
                _buildNavItem(2, Icons.radar_rounded, 'Radar GPS'),
                _buildNavItem(3, Icons.notifications_rounded, 'Thông báo'),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildNavItem(int index, IconData icon, String label) {
    final isSelected = _currentIndex == index;
    return InkWell(
      onTap: () => setState(() => _currentIndex = index),
      borderRadius: BorderRadius.circular(12),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              icon,
              size: 22,
              color: isSelected ? AppColors.primarySapphire : AppColors.mutedSteel,
            ),
            const SizedBox(height: 2),
            Text(
              label,
              style: TextStyle(
                fontSize: 10,
                fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                color: isSelected ? AppColors.primarySapphire : AppColors.mutedSteel,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
