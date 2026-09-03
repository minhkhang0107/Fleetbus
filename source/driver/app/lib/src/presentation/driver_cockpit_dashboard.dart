import 'package:flutter/material.dart';
import 'package:resources/resources.dart';
import 'driver_manifest_screen.dart';
import 'driver_qr_scanner_screen.dart';
import 'driver_navigation_screen.dart';
import 'driver_incident_dialog.dart';

class DriverCockpitDashboard extends StatelessWidget {
  const DriverCockpitDashboard({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.canvasOps,
      appBar: AppBar(
        backgroundColor: AppColors.canvasOps,
        title: const Text('29B-123.45 · ĐANG CHẠY'),
        leading: const SizedBox(),
        actions: [
          IconButton(
            tooltip: 'Báo cáo sự cố SOS (DRI-019)',
            icon: const Icon(Icons.warning_amber_rounded, color: AppColors.alertCritical),
            onPressed: () {
              showModalBottomSheet(
                context: context,
                isScrollControlled: true,
                backgroundColor: Colors.transparent,
                builder: (_) => const DriverIncidentDialog(),
              );
            },
          ),
          Container(
            margin: const EdgeInsets.only(right: 16),
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(
              color: AppColors.emeraldSafe.withOpacity(0.2),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: AppColors.emeraldSafe),
            ),
            child: const Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.circle, color: AppColors.emeraldSafe, size: 8),
                SizedBox(width: 6),
                Text(
                  'GPS LIVE',
                  style: TextStyle(
                    fontFamily: 'JetBrains Mono',
                    fontSize: 11,
                    fontWeight: FontWeight.bold,
                    color: AppColors.emeraldSafe,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
      body: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          children: [
            // Speed & ETA Deck
            Row(
              children: [
                Expanded(
                  child: _buildMetricCard('TỐC ĐỘ HIỆN TẠI', '62', 'km/h', AppColors.emeraldSafe),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: _buildMetricCard('ĐẾN TRẠM KẾ', '~14', 'phút', AppColors.primaryAction),
                ),
              ],
            ),
            const SizedBox(height: 16),

            // Next Stop Card (Tap to open Turn Navigation DRI-013)
            InkWell(
              onTap: () {
                Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const DriverNavigationScreen()),
                );
              },
              borderRadius: BorderRadius.circular(18),
              child: Container(
                padding: const EdgeInsets.all(18),
                decoration: BoxDecoration(
                  color: AppColors.surfacePanel,
                  borderRadius: BorderRadius.circular(18),
                  border: Border.all(color: AppColors.primaryAction, width: 2),
                ),
              child: const Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        'TRẠM KẾ TIẾP (Trạm 2/4):',
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.bold,
                          color: AppColors.primaryAction,
                        ),
                      ),
                      Text(
                        'Cách 8.2 km',
                        style: TextStyle(
                          fontFamily: 'JetBrains Mono',
                          fontSize: 11,
                          color: AppColors.textMuted,
                        ),
                      ),
                    ],
                  ),
                  SizedBox(height: 6),
                  Text(
                    'BẾN XE NINH BÌNH',
                    style: TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.bold,
                      color: AppColors.textHighContrast,
                    ),
                  ),
                  SizedBox(height: 12),
                  Row(
                    children: [
                      const Icon(Icons.arrow_upward_rounded, size: 14, color: AppColors.emeraldSafe),
                      const SizedBox(width: 4),
                      const Text('Đón: 4 khách', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: AppColors.emeraldSafe)),
                      const SizedBox(width: 24),
                      const Icon(Icons.arrow_downward_rounded, size: 14, color: AppColors.amberWarning),
                      const SizedBox(width: 4),
                      const Text('Trả: 8 khách', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: AppColors.amberWarning)),
                    ],
                  ),
                ],
              ),
            ),
            const Spacer(),

            // Primary 72dp QR Scan Action
            ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.primaryAction,
                minimumSize: const Size(double.infinity, 72),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
              ),
              onPressed: () {
                Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const DriverQrScannerScreen()),
                );
              },
              child: const Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.qr_code_scanner_rounded, size: 28),
                  SizedBox(width: 12),
                  Text('QUÉT VÉ QR LÊN XE (72dp)', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                ],
              ),
            ),
            const SizedBox(height: 12),

            // Secondary 64dp Manifest Action
            ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.surfacePanel,
                foregroundColor: AppColors.textHighContrast,
                minimumSize: const Size(double.infinity, 64),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(18),
                  side: const BorderSide(color: AppColors.borderTactical),
                ),
              ),
              onPressed: () {
                Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const DriverManifestScreen()),
                );
              },
              child: const Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.format_list_bulleted_rounded, size: 22, color: AppColors.textMuted),
                  SizedBox(width: 10),
                  Text('DANH SÁCH HÀNH KHÁCH (MANIFEST)', style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold)),
                ],
              ),
            ),
            const SizedBox(height: 12),
          ],
        ),
      ),
    );
  }

  Widget _buildMetricCard(String label, String value, String unit, Color color) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surfacePanel,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.borderTactical),
      ),
      child: Column(
        children: [
          Text(label, style: const TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: AppColors.textMuted)),
          const SizedBox(height: 4),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            children: [
              Text(
                value,
                style: TextStyle(
                  fontFamily: 'JetBrains Mono',
                  fontSize: 32,
                  fontWeight: FontWeight.bold,
                  color: color,
                ),
              ),
              const SizedBox(width: 4),
              Text(unit, style: const TextStyle(fontSize: 11, color: AppColors.textMuted, fontFamily: 'JetBrains Mono')),
            ],
          ),
        ],
      ),
    );
  }
}
