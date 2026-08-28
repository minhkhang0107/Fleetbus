import 'package:flutter/material.dart';
import '../../../../resources/lib/src/theme/app_colors.dart';

class ManagerReportsScreen extends StatelessWidget {
  const ManagerReportsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('BÁO CÁO DOANH THU & CHỈ SỐ ĐÚNG GIỜ OTP (EXECUTIVE REPORTS)', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: ManagerColors.textPrimary)),
          const SizedBox(height: 4),
          const Text('Báo cáo phân tích doanh thu bán vé, tỷ lệ lấp đầy ghế và độ đúng giờ (MGR-025, MGR-026)', style: TextStyle(color: ManagerColors.textMuted, fontSize: 13)),
          const SizedBox(height: 24),
          Row(
            children: [
              Expanded(
                child: Container(
                  padding: const EdgeInsets.all(20),
                  decoration: BoxDecoration(
                    color: ManagerColors.surfaceCard,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: ManagerColors.borderSubtle),
                  ),
                  child: const Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('DOANH THU THỰC TẾ THEO KÊNH', style: TextStyle(fontWeight: FontWeight.w700, color: ManagerColors.textPrimary, fontSize: 14)),
                      SizedBox(height: 16),
                      Text('App Hành khách (VietQR): 76.500.000 đ (86.5%)', style: TextStyle(color: ManagerColors.emeraldSafe, fontSize: 13, fontWeight: FontWeight.w600)),
                      SizedBox(height: 8),
                      Text('Tổng đài & Quầy POS: 8.750.000 đ (9.9%)', style: TextStyle(color: ManagerColors.cyanAccent, fontSize: 13)),
                      SizedBox(height: 8),
                      Text('Thu hộ tiền mặt COD: 3.200.000 đ (3.6%)', style: TextStyle(color: ManagerColors.amberWarning, fontSize: 13)),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 20),
              Expanded(
                child: Container(
                  padding: const EdgeInsets.all(20),
                  decoration: BoxDecoration(
                    color: ManagerColors.surfaceCard,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: ManagerColors.borderSubtle),
                  ),
                  child: const Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('ĐỘ ĐÚNG GIỜ THEO TUYẾN (OTP)', style: TextStyle(fontWeight: FontWeight.w700, color: ManagerColors.textPrimary, fontSize: 14)),
                      SizedBox(height: 16),
                      Text('Hà Nội ➔ Thanh Hóa: 98.2% đúng giờ (OTP)', style: TextStyle(color: ManagerColors.emeraldSafe, fontSize: 13, fontWeight: FontWeight.w600)),
                      SizedBox(height: 8),
                      Text('Hà Nội ➔ Hải Phòng: 96.5% đúng giờ (OTP)', style: TextStyle(color: ManagerColors.emeraldSafe, fontSize: 13)),
                      SizedBox(height: 8),
                      Text('Hà Nội ➔ Nam Định: 94.0% đúng giờ (OTP)', style: TextStyle(color: ManagerColors.amberWarning, fontSize: 13)),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
