import 'package:flutter/material.dart';
import 'package:resources/resources.dart';
import 'driver_readiness_screen.dart';
import 'driver_manifest_screen.dart';

class DriverTripDetailScreen extends StatelessWidget {
  final String tripId;
  final String route;
  final String departureTime;
  final String vehiclePlate;
  final String vehicleType;
  final int totalSeats;
  final int manifestCount;

  const DriverTripDetailScreen({
    super.key,
    this.tripId = 'trp_991823',
    this.route = 'Hà Nội ➔ Thanh Hóa (Cao tốc)',
    this.departureTime = '14:00',
    this.vehiclePlate = '29B-882.19',
    this.vehicleType = 'Cabin Cung Điện VIP 22 Phòng',
    this.totalSeats = 22,
    this.manifestCount = 18,
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.canvasOps,
      appBar: AppBar(
        backgroundColor: AppColors.surfacePanel,
        title: const Text(
          'THÔNG TIN CHUYẾN XUẤT BẾN (DRI-003)',
          style: TextStyle(fontFamily: 'JetBrains Mono', fontSize: 13, fontWeight: FontWeight.bold),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Overview Card
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              color: AppColors.surfacePanel,
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: AppColors.borderTactical),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      departureTime,
                      style: const TextStyle(
                        fontFamily: 'JetBrains Mono',
                        fontSize: 24,
                        fontWeight: FontWeight.bold,
                        color: Colors.white,
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: AppColors.primaryAction.withOpacity(0.2),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        vehiclePlate,
                        style: const TextStyle(
                          fontFamily: 'JetBrains Mono',
                          fontSize: 12,
                          fontWeight: FontWeight.bold,
                          color: Color(0xFF60A5FA),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                Text(
                  route,
                  style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Colors.white),
                ),
                const SizedBox(height: 4),
                Text(vehicleType, style: const TextStyle(fontSize: 12, color: AppColors.textMuted)),
                const Divider(color: AppColors.borderTactical, height: 24),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Row(
                      children: [
                        const Icon(Icons.people_alt_rounded, size: 16, color: AppColors.emeraldSafe),
                        const SizedBox(width: 6),
                        Text(
                          '$manifestCount/$totalSeats Khách',
                          style: const TextStyle(
                            fontFamily: 'JetBrains Mono',
                            fontSize: 12,
                            fontWeight: FontWeight.bold,
                            color: AppColors.emeraldSafe,
                          ),
                        ),
                      ],
                    ),
                    Row(
                      children: [
                        const Icon(Icons.payments_rounded, size: 16, color: AppColors.amberWarning),
                        const SizedBox(width: 6),
                        const Text(
                          'COD: 4 vé (880.000 đ)',
                          style: TextStyle(
                            fontFamily: 'JetBrains Mono',
                            fontSize: 12,
                            fontWeight: FontWeight.bold,
                            color: AppColors.amberWarning,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),

          // Stop Sequence Card
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              color: AppColors.surfacePanel,
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: AppColors.borderTactical),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'LỘ TRÌNH ĐÓN TRẢọc TUYẾN',
                  style: TextStyle(
                    fontFamily: 'JetBrains Mono',
                    fontSize: 11,
                    fontWeight: FontWeight.bold,
                    color: AppColors.textMuted,
                  ),
                ),
                const SizedBox(height: 16),
                _buildStopRow('14:00', 'Bến xe Giáp Bát (Xuất phát)', 'Đón 12 khách', isFirst: true),
                _buildStopRow('14:30', 'Trạm thu phí Pháp Vân', 'Đón 6 khách'),
                _buildStopRow('16:10', 'Bến xe Ninh Bình', 'Đón 4 khách · Trả 8 khách'),
                _buildStopRow('17:30', 'Bến xe Phía Bắc (Thanh Hóa)', 'Trả 14 khách (Điểm cuối)', isLast: true),
              ],
            ),
          ),
          const SizedBox(height: 16),

          // Manifest Shortcut Button
          OutlinedButton.icon(
            style: OutlinedButton.styleFrom(
              foregroundColor: AppColors.textHighContrast,
              side: const BorderSide(color: AppColors.borderTactical),
              minimumSize: const Size(double.infinity, 52),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
            ),
            onPressed: () {
              Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const DriverManifestScreen()),
              );
            },
            icon: const Icon(Icons.list_alt_rounded, size: 20, color: AppColors.textMuted),
            label: const Text('XEM DANH SÁCH HÀNH KHÁCH (MANIFEST)'),
          ),
          const SizedBox(height: 20),

          // Proceed to Readiness CTA (64dp)
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.primaryAction,
              minimumSize: const Size(double.infinity, 64),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
            ),
            onPressed: () {
              Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const DriverReadinessScreen()),
              );
            },
            child: const Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(Icons.checklist_rounded, size: 22),
                SizedBox(width: 10),
                Text(
                  'KIỂM TRA AN TOÀN TRƯỚC XUẤT BẾN ➔',
                  style: TextStyle(fontFamily: 'JetBrains Mono', fontSize: 13, fontWeight: FontWeight.bold),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
        ],
      ),
    );
  }

  Widget _buildStopRow(String time, String stopName, String paxDetail, {bool isFirst = false, bool isLast = false}) {
    Color dotColor = AppColors.textMuted;
    if (isFirst) dotColor = AppColors.emeraldSafe;
    if (isLast) dotColor = AppColors.alertCritical;

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 50,
          child: Text(
            time,
            style: const TextStyle(
              fontFamily: 'JetBrains Mono',
              fontSize: 13,
              fontWeight: FontWeight.bold,
              color: Colors.white,
            ),
          ),
        ),
        Column(
          children: [
            Container(
              width: 12,
              height: 12,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: dotColor,
                border: Border.all(color: Colors.white, width: 2),
              ),
            ),
            if (!isLast)
              Container(
                width: 2,
                height: 40,
                color: AppColors.borderTactical,
              ),
          ],
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                stopName,
                style: const TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: Colors.white),
              ),
              const SizedBox(height: 2),
              Text(
                paxDetail,
                style: const TextStyle(fontSize: 11, color: AppColors.textMuted),
              ),
              const SizedBox(height: 14),
            ],
          ),
        ),
      ],
    );
  }
}
