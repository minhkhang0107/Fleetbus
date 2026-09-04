import 'package:flutter/material.dart';
import '../../../../resources/lib/src/theme/app_colors.dart';

class ManagerEmergencySwapScreen extends StatefulWidget {
  const ManagerEmergencySwapScreen({super.key});

  @override
  State<ManagerEmergencySwapScreen> createState() => _ManagerEmergencySwapScreenState();
}

class _ManagerEmergencySwapScreenState extends State<ManagerEmergencySwapScreen> {
  String _selectedReason = 'SỰ CỐ ĐỘNG CƠ / HỎNG HÓC KỸ THUẬT';
  bool _isSwapped = false;

  void _handleSwap() {
    setState(() => _isSwapped = true);
  }

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('ĐIỀU ĐỘ ĐỔI XE KHẨN CẤP (EMERGENCY VEHICLE SWAP)', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: ManagerColors.textPrimary)),
          const SizedBox(height: 4),
          const Text('Tự động phân bổ lại ghế và gửi thông báo đẩy SMS/Push tức thì cho hành khách (MGR-023, PAX-024)', style: TextStyle(color: ManagerColors.textMuted, fontSize: 13)),
          const SizedBox(height: 24),
          Container(
            width: 680,
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              color: ManagerColors.surfaceCard,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: ManagerColors.borderSubtle),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: ManagerColors.badgeRedBg,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: ManagerColors.redCritical.withOpacity(0.3)),
                  ),
                  child: const Row(
                    children: [
                      Icon(Icons.warning_amber_rounded, color: ManagerColors.redCritical, size: 24),
                      SizedBox(width: 12),
                      Expanded(
                        child: Text(
                          'Chuyến xe gặp sự cố: TRP-HN-TH-01 · Xe 29B-882.19 (22 ghế) — Thay thế bằng xe dự phòng 29B-999.01',
                          style: TextStyle(color: ManagerColors.textPrimary, fontWeight: FontWeight.w600, fontSize: 13),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 20),
                DropdownButtonFormField<String>(
                  value: _selectedReason,
                  dropdownColor: ManagerColors.surfaceElevated,
                  style: const TextStyle(color: ManagerColors.textPrimary),
                  decoration: InputDecoration(
                    labelText: 'Lý do thay xe khẩn cấp',
                    labelStyle: const TextStyle(color: ManagerColors.textSecondary),
                    filled: true,
                    fillColor: ManagerColors.surfaceElevated,
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: BorderSide.none),
                  ),
                  items: const [
                    DropdownMenuItem(value: 'SỰ CỐ ĐỘNG CƠ / HỎNG HÓC KỸ THUẬT', child: Text('Sự cố động cơ / hỏng hóc kỹ thuật')),
                    DropdownMenuItem(value: 'TÀI XẾ SỨC KHỎE KHÔNG ĐẢM BẢO', child: Text('Tài xế sức khỏe không đảm bảo')),
                    DropdownMenuItem(value: 'ÙN TẮC GIAO THÔNG ĐIỂM XUẤT PHÁT', child: Text('Ùn tắc giao thông điểm xuất phát')),
                  ],
                  onChanged: (val) => setState(() => _selectedReason = val ?? _selectedReason),
                ),
                const SizedBox(height: 24),
                ElevatedButton(
                  onPressed: _handleSwap,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: ManagerColors.redCritical,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 16),
                  ),
                  child: const Text('XÁC NHẬN ĐỔI XE & BROADCAST THÔNG BÁO CHO 20 HÀNH KHÁCH', style: TextStyle(fontWeight: FontWeight.w700)),
                ),
                if (_isSwapped) ...[
                  const SizedBox(height: 20),
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: ManagerColors.badgeGreenBg,
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: ManagerColors.emeraldSafe),
                    ),
                    child: const Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('ĐIỀU ĐỘ ĐỔI XE THÀNH CÔNG', style: TextStyle(color: ManagerColors.emeraldSafe, fontWeight: FontWeight.w800)),
                        SizedBox(height: 6),
                        Text('Đã chuyển 20 hành khách sang xe 29B-999.01 và cập nhật vị trí live radar.', style: TextStyle(color: ManagerColors.textPrimary)),
                      ],
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}
