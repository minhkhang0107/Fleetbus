import 'package:flutter/material.dart';
import 'package:resources/resources.dart';

class DriverIncidentDialog extends StatefulWidget {
  final String tripId;

  const DriverIncidentDialog({
    super.key,
    this.tripId = 'trp_991823',
  });

  @override
  State<DriverIncidentDialog> createState() => _DriverIncidentDialogState();
}

class _DriverIncidentDialogState extends State<DriverIncidentDialog> {
  String _selectedType = 'TRAFFIC_JAM';
  int _delayMinutes = 30;
  bool _isSending = false;

  final List<Map<String, dynamic>> _incidentTypes = const [
    {
      'type': 'TRAFFIC_JAM',
      'label': 'Ùn tắc giao thông / Kẹt xe cao tốc',
      'icon': Icons.traffic_rounded,
      'color': AppColors.amberWarning,
    },
    {
      'type': 'TIRE_PUNCTURE',
      'label': 'Thay lốp / Sự cố kỹ thuật nhỏ',
      'icon': Icons.build_circle_rounded,
      'color': AppColors.amberWarning,
    },
    {
      'type': 'VEHICLE_BREAKDOWN',
      'label': 'Hỏng máy nặng / Cần xe cứu hộ thay thế',
      'icon': Icons.car_crash_rounded,
      'color': AppColors.alertCritical,
    },
    {
      'type': 'WEATHER_DELAY',
      'label': 'Thời tiết xấu / Mưa bão giảm tốc độ',
      'icon': Icons.thunderstorm_rounded,
      'color': AppColors.primaryAction,
    },
    {
      'type': 'MEDICAL_EMERGENCY',
      'label': 'Cấp cứu y tế / Báo động khẩn cấp SOS',
      'icon': Icons.emergency_rounded,
      'color': AppColors.alertCritical,
    },
  ];

  void _handleSubmit() {
    setState(() => _isSending = true);
    Future.delayed(const Duration(milliseconds: 1000), () {
      if (mounted) {
        setState(() => _isSending = false);
        Navigator.of(context).pop();
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            backgroundColor: AppColors.alertCritical,
            content: Row(
              children: [
                Icon(Icons.check_circle_rounded, color: Colors.white),
                SizedBox(width: 8),
                Text('ĐÃ GỬI BÁO CÁO SỰ CỐ VỀ TRUNG TÂM ĐIỀU ĐỘ (MGR-025)'),
              ],
            ),
          ),
        );
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: AppColors.canvasOps,
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      padding: const EdgeInsets.all(20),
      child: SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Row(
                  children: [
                    Icon(Icons.warning_amber_rounded, color: AppColors.alertCritical, size: 24),
                    SizedBox(width: 8),
                    Text(
                      'BÁO CÁO SỰ CỐ & TRỄ CHUYẾN (DRI-019)',
                      style: TextStyle(
                        fontFamily: 'JetBrains Mono',
                        fontSize: 13,
                        fontWeight: FontWeight.bold,
                        color: Colors.white,
                      ),
                    ),
                  ],
                ),
                IconButton(
                  onPressed: () => Navigator.of(context).pop(),
                  icon: const Icon(Icons.close_rounded, color: AppColors.textMuted),
                ),
              ],
            ),
            const SizedBox(height: 12),

            // Incident Types List
            const Text(
              'CHỌN LOẠI SỰ CỐ (CHẠM 1 CHẠM):',
              style: TextStyle(fontFamily: 'JetBrains Mono', fontSize: 10, color: AppColors.textMuted),
            ),
            const SizedBox(height: 8),
            ..._incidentTypes.map((item) {
              final isSelected = _selectedType == item['type'];
              return Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: InkWell(
                  onTap: () => setState(() => _selectedType = item['type']),
                  borderRadius: BorderRadius.circular(14),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                    decoration: BoxDecoration(
                      color: isSelected ? AppColors.surfaceActive : AppColors.surfacePanel,
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(
                        color: isSelected ? item['color'] as Color : AppColors.borderTactical,
                        width: isSelected ? 2 : 1,
                      ),
                    ),
                    child: Row(
                      children: [
                        Icon(item['icon'] as IconData, color: item['color'] as Color, size: 20),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Text(
                            item['label'] as String,
                            style: TextStyle(
                              fontSize: 13,
                              fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                              color: Colors.white,
                            ),
                          ),
                        ),
                        if (isSelected)
                          Icon(Icons.check_rounded, color: item['color'] as Color, size: 18),
                      ],
                    ),
                  ),
                ),
              );
            }),
            const SizedBox(height: 12),

            // Delay Minutes Selector Strip
            const Text(
              'DỰ KIẾN THỜI GIAN TRỄ:',
              style: TextStyle(fontFamily: 'JetBrains Mono', fontSize: 10, color: AppColors.textMuted),
            ),
            const SizedBox(height: 8),
            Row(
              children: [15, 30, 45, 60].map((mins) {
                final isSelected = _delayMinutes == mins;
                return Expanded(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 4),
                    child: ElevatedButton(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: isSelected ? AppColors.amberWarning : AppColors.surfacePanel,
                        foregroundColor: isSelected ? Colors.black : Colors.white,
                        minimumSize: const Size(0, 44),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                          side: BorderSide(
                            color: isSelected ? AppColors.amberWarning : AppColors.borderTactical,
                          ),
                        ),
                      ),
                      onPressed: () => setState(() => _delayMinutes = mins),
                      child: Text(
                        '+${mins}p',
                        style: const TextStyle(fontFamily: 'JetBrains Mono', fontSize: 12, fontWeight: FontWeight.bold),
                      ),
                    ),
                  ),
                );
              }).toList(),
            ),
            const SizedBox(height: 20),

            // Submit Incident CTA (72dp)
            SizedBox(
              width: double.infinity,
              height: 72,
              child: ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.alertCritical,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
                ),
                onPressed: _isSending ? null : _handleSubmit,
                child: _isSending
                    ? const CircularProgressIndicator(color: Colors.white)
                    : const Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.send_rounded, size: 24),
                          SizedBox(width: 10),
                          Text(
                            'GỬI BÁO CÁO VỀ ĐIỀU ĐỘ (72dp)',
                            style: TextStyle(fontFamily: 'JetBrains Mono', fontSize: 15, fontWeight: FontWeight.bold),
                          ),
                        ],
                      ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
