import 'package:flutter/material.dart';
import '../../../../resources/lib/src/theme/app_colors.dart';

class ManagerRadarMapScreen extends StatelessWidget {
  const ManagerRadarMapScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Padding(
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
                    'BẢN ĐỒ RADAR HẠM ĐỘI THỜI GIAN THỰC',
                    style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: ManagerColors.textPrimary),
                  ),
                  SizedBox(height: 4),
                  Text('Tần số quét 60Hz · Giám sát tọa độ, tốc độ & tình trạng kết nối beacon', style: TextStyle(color: ManagerColors.textMuted, fontSize: 13)),
                ],
              ),
              ElevatedButton.icon(
                onPressed: () {},
                icon: const Icon(Icons.refresh_rounded, size: 16),
                label: const Text('LÀM MỚI TỌA ĐỘ'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: ManagerColors.surfaceElevated,
                  foregroundColor: ManagerColors.cyanAccent,
                  side: const BorderSide(color: ManagerColors.borderSubtle),
                ),
              ),
            ],
          ),
          const SizedBox(height: 20),
          Expanded(
            child: Row(
              children: [
                // Radar Map Simulation Canvas
                Expanded(
                  flex: 3,
                  child: Container(
                    decoration: BoxDecoration(
                      color: const Color(0xFF070A0F),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: ManagerColors.borderSubtle),
                    ),
                    child: Stack(
                      children: [
                        // Radar Grid Rings
                        Center(
                          child: Container(
                            width: 400,
                            height: 400,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              border: Border.all(color: ManagerColors.cyanAccent.withOpacity(0.15), width: 1.5),
                            ),
                          ),
                        ),
                        Center(
                          child: Container(
                            width: 250,
                            height: 250,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              border: Border.all(color: ManagerColors.cyanAccent.withOpacity(0.25), width: 1.5),
                            ),
                          ),
                        ),
                        // Radar Vehicle Beacons
                        _buildVehicleMarker('29B-882.19', '68 km/h', 'Hà Nội ➔ Thanh Hóa', 0.45, 0.48, ManagerColors.emeraldSafe),
                        _buildVehicleMarker('29B-991.82', '74 km/h', 'Hà Nội ➔ Hải Phòng', 0.62, 0.35, ManagerColors.cyanAccent),
                        _buildVehicleMarker('36B-441.20', '0 km/h (Đón khách)', 'Bến xe Giáp Bát', 0.38, 0.65, ManagerColors.amberWarning),
                      ],
                    ),
                  ),
                ),
                const SizedBox(width: 20),
                // Telemetry Live Stream Panel
                Expanded(
                  flex: 2,
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
                        const Text('DANH SÁCH XE PHÁT BEACON', style: TextStyle(fontWeight: FontWeight.w700, color: ManagerColors.textPrimary, fontSize: 14)),
                        const SizedBox(height: 16),
                        _buildTelemetryItem('29B-882.19', 'Trần Văn Bình', '68 km/h', 'Vừa cập nhật 1s trước', ManagerColors.emeraldSafe),
                        const Divider(color: ManagerColors.borderSubtle, height: 20),
                        _buildTelemetryItem('29B-991.82', 'Nguyễn Tiến Dũng', '74 km/h', 'Vừa cập nhật 2s trước', ManagerColors.emeraldSafe),
                        const Divider(color: ManagerColors.borderSubtle, height: 20),
                        _buildTelemetryItem('36B-441.20', 'Lê Hoàng Nam', '0 km/h', 'Tại trạm dừng đón', ManagerColors.amberWarning),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildVehicleMarker(String plate, String speed, String corridor, double leftRatio, double topRatio, Color color) {
    return Positioned(
      left: 600 * leftRatio,
      top: 400 * topRatio,
      child: Column(
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(color: color, shape: BoxShape.circle, boxShadow: [BoxShadow(color: color.withOpacity(0.6), blurRadius: 12)]),
            child: const Icon(Icons.directions_bus_filled_rounded, color: Colors.black, size: 16),
          ),
          const SizedBox(height: 4),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(color: Colors.black.withOpacity(0.8), borderRadius: BorderRadius.circular(4), border: Border.all(color: color)),
            child: Text('$plate · $speed', style: TextStyle(color: color, fontSize: 10, fontWeight: FontWeight.w700)),
          ),
        ],
      ),
    );
  }

  Widget _buildTelemetryItem(String plate, String driver, String speed, String time, Color statusColor) {
    return Row(
      children: [
        Container(
          width: 8,
          height: 8,
          decoration: BoxDecoration(color: statusColor, shape: BoxShape.circle),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(plate, style: const TextStyle(fontWeight: FontWeight.w700, color: ManagerColors.textPrimary, fontSize: 13)),
              Text('$driver · $time', style: const TextStyle(color: ManagerColors.textMuted, fontSize: 11)),
            ],
          ),
        ),
        Text(speed, style: TextStyle(fontWeight: FontWeight.w700, color: statusColor, fontSize: 13)),
      ],
    );
  }
}
