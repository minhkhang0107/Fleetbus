import 'package:flutter/material.dart';
import 'driver_cockpit_dashboard.dart';
import 'driver_manifest_screen.dart';
import 'driver_qr_scanner_screen.dart';
import 'driver_offline_sync_screen.dart';

class MainShellScreen extends StatefulWidget {
  const MainShellScreen({super.key});

  @override
  State<MainShellScreen> createState() => _MainShellScreenState();
}

class _MainShellScreenState extends State<MainShellScreen> {
  int _currentIndex = 0;

  final List<Widget> _screens = const [
    DriverCockpitDashboard(),
    DriverManifestScreen(),
    DriverQrScannerScreen(),
    DriverOfflineSyncScreen(),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      body: IndexedStack(
        index: _currentIndex,
        children: _screens,
      ),
      bottomNavigationBar: Container(
        decoration: const BoxDecoration(
          color: Color(0xFF1E293B),
          border: Border(top: BorderSide(color: Color(0xFF334155), width: 1)),
        ),
        child: SafeArea(
          child: SizedBox(
            height: 60,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceAround,
              children: [
                _buildNavItem(0, Icons.speed_rounded, 'BUỒNG LÁI'),
                _buildNavItem(1, Icons.people_alt_rounded, 'DANH SÁCH'),
                _buildNavItem(2, Icons.qr_code_scanner_rounded, 'QUÉT QR'),
                _buildNavItem(3, Icons.cloud_sync_rounded, 'ĐỒNG BỘ'),
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
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              icon,
              size: 22,
              color: isSelected ? const Color(0xFF2563EB) : const Color(0xFF94A3B8),
            ),
            const SizedBox(height: 2),
            Text(
              label,
              style: TextStyle(
                fontFamily: 'JetBrains Mono',
                fontSize: 10,
                fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                color: isSelected ? const Color(0xFF2563EB) : const Color(0xFF94A3B8),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
