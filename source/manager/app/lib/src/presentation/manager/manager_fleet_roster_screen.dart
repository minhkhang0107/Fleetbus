import 'package:flutter/material.dart';
import '../../../../resources/lib/src/theme/app_colors.dart';

class ManagerFleetRosterScreen extends StatelessWidget {
  const ManagerFleetRosterScreen({super.key});

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
                  Text('HỒ SƠ HẠM ĐỘI & ĐỘI NGŨ TÀI XẾ (FLEET & CREW)', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: ManagerColors.textPrimary)),
                  SizedBox(height: 4),
                  Text('Quản lý phương tiện, kiểm định an toàn và giấy phép lái xe hạng FC (MGR-005, MGR-008)', style: TextStyle(color: ManagerColors.textMuted, fontSize: 13)),
                ],
              ),
              ElevatedButton.icon(
                onPressed: () {},
                icon: const Icon(Icons.add_rounded, size: 16),
                label: const Text('THÊM PHƯƠNG TIỆN'),
                style: ElevatedButton.styleFrom(backgroundColor: ManagerColors.cyanAccent, foregroundColor: Colors.black),
              ),
            ],
          ),
          const SizedBox(height: 24),
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: ManagerColors.surfaceCard,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: ManagerColors.borderSubtle),
            ),
            child: Column(
              children: [
                _buildVehicleRow('29B-882.19', 'Thaco Mobihome VIP (22 Phòng)', '142.050 km', 'Hạn Đăng Kiểm: 12/2026', 'HOẠT ĐỘNG (ACTIVE)', ManagerColors.emeraldSafe),
                const Divider(color: ManagerColors.borderSubtle, height: 24),
                _buildVehicleRow('29B-991.82', 'Tracomeco Limousine (34 Giường)', '88.200 km', 'Hạn Đăng Kiểm: 08/2026', 'HOẠT ĐỘNG (ACTIVE)', ManagerColors.emeraldSafe),
                const Divider(color: ManagerColors.borderSubtle, height: 24),
                _buildVehicleRow('36B-441.20', 'Universe Express (45 Chỗ)', '210.000 km', 'Bảo dưỡng định kỳ 200k km', 'BẢO DƯỠNG (MAINTENANCE)', ManagerColors.amberWarning),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildVehicleRow(String plate, String model, String odo, String note, String status, Color color) {
    return Row(
      children: [
        Container(
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(color: ManagerColors.surfaceElevated, borderRadius: BorderRadius.circular(8)),
          child: const Icon(Icons.directions_bus_rounded, color: ManagerColors.cyanAccent, size: 20),
        ),
        const SizedBox(width: 14),
        Expanded(
          flex: 3,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(plate, style: const TextStyle(fontWeight: FontWeight.w700, color: ManagerColors.textPrimary, fontSize: 14)),
              Text(model, style: const TextStyle(color: ManagerColors.textMuted, fontSize: 12)),
            ],
          ),
        ),
        Expanded(flex: 2, child: Text(odo, style: const TextStyle(color: ManagerColors.textSecondary, fontSize: 13))),
        Expanded(flex: 3, child: Text(note, style: const TextStyle(color: ManagerColors.textMuted, fontSize: 12))),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
          decoration: BoxDecoration(color: color.withOpacity(0.15), borderRadius: BorderRadius.circular(6)),
          child: Text(status, style: TextStyle(color: color, fontWeight: FontWeight.w700, fontSize: 11)),
        ),
      ],
    );
  }
}
