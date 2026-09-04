import 'package:flutter/material.dart';
import '../../../../resources/lib/src/theme/app_colors.dart';

class ManagerDispatchScreen extends StatelessWidget {
  const ManagerDispatchScreen({super.key});

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
                  Text('BẢNG ĐIỀU ĐỘ CHUYẾN XE (DISPATCH GANTT BOARD)', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: ManagerColors.textPrimary)),
                  SizedBox(height: 4),
                  Text('Giám sát lịch trình, phân tài xế và trạng thái chuẩn bị xe (DRI-004)', style: TextStyle(color: ManagerColors.textMuted, fontSize: 13)),
                ],
              ),
              ElevatedButton.icon(
                onPressed: () {},
                icon: const Icon(Icons.add_rounded, size: 16),
                label: const Text('THÊM CHUYẾN MỚI'),
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
                _buildTripRow('TRP-HN-TH-01', '07:00 — 10:15', '29B-882.19 (VIP Cabin 22)', 'Trần Văn Bình (TX8821)', 'ĐANG CHẠY (IN_TRANSIT)', '20/22 khách', ManagerColors.emeraldSafe),
                const Divider(color: ManagerColors.borderSubtle, height: 24),
                _buildTripRow('TRP-HN-TH-02', '14:00 — 17:15', '29B-991.82 (Sleeper 34)', 'Nguyễn Tiến Dũng (TX9912)', 'ĐÃ KIỂM TRA XE (READY)', '18/34 khách', ManagerColors.cyanAccent),
                const Divider(color: ManagerColors.borderSubtle, height: 24),
                _buildTripRow('TRP-HN-HP-01', '16:30 — 18:30', '15B-772.30 (VIP Limousine)', 'Phạm Văn Long (TX7720)', 'CHỜ TÀI XẾ (SCHEDULED)', '12/16 khách', ManagerColors.amberWarning),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTripRow(String tripId, String time, String vehicle, String driver, String status, String occupancy, Color statusColor) {
    return Row(
      children: [
        Expanded(flex: 2, child: Text(tripId, style: const TextStyle(fontWeight: FontWeight.w700, color: ManagerColors.cyanAccent, fontSize: 13))),
        Expanded(flex: 2, child: Text(time, style: const TextStyle(color: ManagerColors.textPrimary, fontSize: 13))),
        Expanded(flex: 3, child: Text(vehicle, style: const TextStyle(color: ManagerColors.textSecondary, fontSize: 13))),
        Expanded(flex: 3, child: Text(driver, style: const TextStyle(color: ManagerColors.textPrimary, fontSize: 13))),
        Expanded(flex: 2, child: Text(occupancy, style: const TextStyle(color: ManagerColors.textMuted, fontSize: 13))),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
          decoration: BoxDecoration(color: statusColor.withOpacity(0.15), borderRadius: BorderRadius.circular(6)),
          child: Text(status, style: TextStyle(color: statusColor, fontWeight: FontWeight.w700, fontSize: 11)),
        ),
      ],
    );
  }
}
