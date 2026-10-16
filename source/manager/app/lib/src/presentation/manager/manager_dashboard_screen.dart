import 'package:flutter/material.dart';
import '../../../../resources/lib/src/theme/app_colors.dart';

class ManagerDashboardScreen extends StatelessWidget {
  const ManagerDashboardScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'TỔNG QUAN ĐIỀU HÀNH THỜI GIAN THỰC',
                    style: TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.w800,
                      color: ManagerColors.textPrimary,
                      letterSpacing: 0.5,
                    ),
                  ),
                  SizedBox(height: 4),
                  Text('Dữ liệu đồng bộ trực tiếp từ Telemetry Hub & Cổng Thanh Toán', style: TextStyle(color: ManagerColors.textMuted, fontSize: 13)),
                ],
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                decoration: BoxDecoration(
                  color: ManagerColors.badgeGreenBg,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: ManagerColors.emeraldSafe.withOpacity(0.3)),
                ),
                child: const Row(
                  children: [
                    Icon(Icons.sensors, color: ManagerColors.emeraldSafe, size: 16),
                    SizedBox(width: 8),
                    Text('60Hz LIVE STREAM ACTIVE', style: TextStyle(color: ManagerColors.emeraldSafe, fontWeight: FontWeight.w700, fontSize: 12)),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 24),
          // KPI Metric Cards Grid
          Row(
            children: [
              _buildKpiCard('ĐANG HOẠT ĐỘNG', '18 Xe', '+2 xe tăng cường', ManagerColors.cyanAccent, Icons.directions_bus_rounded),
              const SizedBox(width: 16),
              _buildKpiCard('HỆ SỐ LẤP ĐẦY', '87.5%', 'Cao điểm tuyến Bắc - Nam', ManagerColors.emeraldSafe, Icons.airline_seat_recline_extra_rounded),
              const SizedBox(width: 16),
              _buildKpiCard('DOANH THU CA', '88.450.000 đ', '98.2% qua VietQR Napas247', ManagerColors.amberWarning, Icons.account_balance_wallet_rounded),
              const SizedBox(width: 16),
              _buildKpiCard('ĐÚNG GIỜ (OTP)', '96.8%', '0 chuyến hủy kỹ thuật', ManagerColors.cyanGlow, Icons.verified_rounded),
            ],
          ),
          const SizedBox(height: 28),
          // Active Corridor Status
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: ManagerColors.surfaceCard,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: ManagerColors.borderSubtle),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('TRẠNG THÁI HÀNH LANG TUYẾN TRỌNG ĐIỂM', style: TextStyle(fontWeight: FontWeight.w700, color: ManagerColors.textPrimary, fontSize: 15)),
                const SizedBox(height: 16),
                _buildCorridorRow('Hà Nội — Thanh Hóa (Cao tốc)', '6 xe đang chạy', '92% lấp đầy', 'Bình thường', ManagerColors.emeraldSafe),
                const Divider(color: ManagerColors.borderSubtle, height: 24),
                _buildCorridorRow('Hà Nội — Hải Phòng', '4 xe đang chạy', '85% lấp đầy', 'Bình thường', ManagerColors.emeraldSafe),
                const Divider(color: ManagerColors.borderSubtle, height: 24),
                _buildCorridorRow('Hà Nội — Nam Định', '3 xe đang chạy', '78% lấp đầy', 'Chậm 5 phút', ManagerColors.amberWarning),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildKpiCard(String label, String value, String sub, Color color, IconData icon) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: ManagerColors.surfaceCard,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: ManagerColors.borderSubtle),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(label, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: ManagerColors.textMuted)),
                Icon(icon, color: color, size: 20),
              ],
            ),
            const SizedBox(height: 12),
            Text(value, style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: color)),
            const SizedBox(height: 6),
            Text(sub, style: const TextStyle(fontSize: 11, color: ManagerColors.textSecondary)),
          ],
        ),
      ),
    );
  }

  Widget _buildCorridorRow(String name, String activeBuses, String load, String status, Color statusColor) {
    return Row(
      children: [
        Expanded(flex: 3, child: Text(name, style: const TextStyle(color: ManagerColors.textPrimary, fontWeight: FontWeight.w600, fontSize: 14))),
        Expanded(flex: 2, child: Text(activeBuses, style: const TextStyle(color: ManagerColors.textSecondary, fontSize: 13))),
        Expanded(flex: 2, child: Text(load, style: const TextStyle(color: ManagerColors.cyanAccent, fontWeight: FontWeight.w600, fontSize: 13))),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
          decoration: BoxDecoration(color: statusColor.withOpacity(0.15), borderRadius: BorderRadius.circular(6)),
          child: Text(status, style: TextStyle(color: statusColor, fontWeight: FontWeight.w700, fontSize: 11)),
        ),
      ],
    );
  }
}
