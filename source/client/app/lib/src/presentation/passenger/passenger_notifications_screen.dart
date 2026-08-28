import 'package:flutter/material.dart';
import 'package:resources/resources.dart';

class PassengerNotificationsScreen extends StatelessWidget {
  const PassengerNotificationsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.canvasPassenger,
      appBar: AppBar(
        title: const Text('Thông báo (2 mới)'),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _buildNotificationItem(
            icon: Icons.directions_bus_rounded,
            iconColor: AppColors.primarySapphire,
            bgColor: AppColors.primarySapphireSoft,
            title: 'Xe sắp đến điểm đón (Còn 15 phút)',
            message: 'Xe 29B-882.19 đang cách Bến xe Giáp Bát 8.5 km. Quý khách vui lòng có mặt tại cổng 3 trước 06:45.',
            time: '06:30 (Hôm nay)',
            isUnread: true,
          ),
          const SizedBox(height: 12),
          _buildNotificationItem(
            icon: Icons.check_circle_rounded,
            iconColor: AppColors.emeraldSafe,
            bgColor: AppColors.emeraldSoft,
            title: 'Đặt vé thành công (Mã PNR: BG-882199)',
            message: 'Thanh toán VietQR 220.000 đ thành công. Mã vé đã được lưu vào ví vé điện tử.',
            time: '27/08/2026',
            isUnread: false,
          ),
        ],
      ),
    );
  }

  Widget _buildNotificationItem({
    required IconData icon,
    required Color iconColor,
    required Color bgColor,
    required String title,
    required String message,
    required String time,
    required bool isUnread,
  }) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: isUnread ? AppColors.primarySapphire.withOpacity(0.4) : AppColors.whisperBorder,
          width: isUnread ? 1.5 : 1,
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: bgColor,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(icon, color: iconColor, size: 22),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Expanded(
                      child: Text(
                        title,
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: isUnread ? FontWeight.bold : FontWeight.w600,
                          color: AppColors.charcoalInk,
                        ),
                      ),
                    ),
                    if (isUnread)
                      Container(
                        width: 8,
                        height: 8,
                        decoration: const BoxDecoration(
                          shape: BoxShape.circle,
                          color: AppColors.primarySapphire,
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  message,
                  style: const TextStyle(fontSize: 12, color: AppColors.mutedSteel, height: 1.35),
                ),
                const SizedBox(height: 6),
                Text(
                  time,
                  style: const TextStyle(fontFamily: 'JetBrains Mono', fontSize: 10, color: AppColors.mutedSteel),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
