import 'package:flutter/material.dart';
import '../../../../resources/lib/src/theme/app_colors.dart';
import 'manager_dashboard_screen.dart';
import 'manager_radar_map_screen.dart';
import 'manager_dispatch_screen.dart';
import 'manager_pos_booking_screen.dart';
import 'manager_emergency_swap_screen.dart';
import 'manager_fleet_roster_screen.dart';
import 'manager_reports_screen.dart';

class ManagerWebShell extends StatefulWidget {
  final VoidCallback onLogout;
  const ManagerWebShell({super.key, required this.onLogout});

  @override
  State<ManagerWebShell> createState() => _ManagerWebShellState();
}

class _ManagerWebShellState extends State<ManagerWebShell> {
  int _selectedIndex = 0;

  final List<Widget> _pages = const [
    ManagerDashboardScreen(),
    ManagerRadarMapScreen(),
    ManagerDispatchScreen(),
    ManagerPosBookingScreen(),
    ManagerEmergencySwapScreen(),
    ManagerFleetRosterScreen(),
    ManagerReportsScreen(),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: ManagerColors.bgDark,
      body: Row(
        children: [
          // Desktop Navigation Sidebar
          Container(
            width: 260,
            decoration: const BoxDecoration(
              color: ManagerColors.surfaceCard,
              border: Border(right: BorderSide(color: ManagerColors.borderSubtle)),
            ),
            child: Column(
              children: [
                // Top Header Logo
                Padding(
                  padding: const EdgeInsets.all(24),
                  child: Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          color: ManagerColors.cyanAccent.withOpacity(0.15),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: const Icon(Icons.hub_rounded, color: ManagerColors.cyanAccent, size: 22),
                      ),
                      const SizedBox(width: 12),
                      const Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'BUSGO OPS',
                            style: TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w800,
                              color: ManagerColors.textPrimary,
                              letterSpacing: 0.5,
                            ),
                          ),
                          Text('Control Center v3.0', style: TextStyle(fontSize: 11, color: ManagerColors.textMuted)),
                        ],
                      ),
                    ],
                  ),
                ),
                const Divider(color: ManagerColors.borderSubtle, height: 1),
                const SizedBox(height: 12),
                // Nav Items
                _buildNavItem(0, 'Tổng Quan (KPIs)', Icons.dashboard_rounded),
                _buildNavItem(1, 'Radar Hạm Đội (60Hz)', Icons.radar_rounded),
                _buildNavItem(2, 'Điều Độ Chuyến (Gantt)', Icons.view_timeline_rounded),
                _buildNavItem(3, 'Quầy Bán Vé (POS)', Icons.point_of_sale_rounded),
                _buildNavItem(4, 'Đổi Xe Khẩn Cấp', Icons.swap_horiz_rounded),
                _buildNavItem(5, 'Hồ Sơ Hạm Đội', Icons.directions_bus_rounded),
                _buildNavItem(6, 'Báo Cáo Doanh Thu', Icons.insights_rounded),
                const Spacer(),
                const Divider(color: ManagerColors.borderSubtle, height: 1),
                ListTile(
                  leading: const Icon(Icons.logout_rounded, color: ManagerColors.redCritical),
                  title: const Text('Đăng Xuất', style: TextStyle(color: ManagerColors.redCritical, fontSize: 13, fontWeight: FontWeight.w600)),
                  onTap: widget.onLogout,
                ),
                const SizedBox(height: 12),
              ],
            ),
          ),
          // Main Body Screen
          Expanded(
            child: _pages[_selectedIndex],
          ),
        ],
      ),
    );
  }

  Widget _buildNavItem(int index, String label, IconData icon) {
    final isSelected = _selectedIndex == index;
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 2),
      decoration: BoxDecoration(
        color: isSelected ? ManagerColors.cyanAccent.withOpacity(0.15) : Colors.transparent,
        borderRadius: BorderRadius.circular(8),
        border: isSelected ? Border.all(color: ManagerColors.cyanAccent.withOpacity(0.3)) : null,
      ),
      child: ListTile(
        leading: Icon(icon, color: isSelected ? ManagerColors.cyanAccent : ManagerColors.textSecondary, size: 20),
        title: Text(
          label,
          style: TextStyle(
            color: isSelected ? ManagerColors.cyanAccent : ManagerColors.textSecondary,
            fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
            fontSize: 13,
          ),
        ),
        onTap: () => setState(() => _selectedIndex = index),
      ),
    );
  }
}
