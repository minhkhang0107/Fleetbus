import 'package:flutter/material.dart';
import 'driver_cockpit_dashboard.dart';

class DriverReadinessScreen extends StatefulWidget {
  const DriverReadinessScreen({super.key});

  @override
  State<DriverReadinessScreen> createState() => _DriverReadinessScreenState();
}

class _DriverReadinessScreenState extends State<DriverReadinessScreen> {
  final Map<String, bool> _checklist = {
    'TIRES': true,
    'BRAKES': true,
    'LIGHTS': true,
    'WIPERS': true,
    'FUEL': true,
    'EMERGENCY_KIT': true,
  };

  bool get _allPassed => _checklist.values.every((v) => v);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF1E293B),
        title: const Text(
          'KIỂM TRA AN TOÀN 6 ĐIỂM (DRI-004)',
          style: TextStyle(fontFamily: 'JetBrains Mono', fontSize: 14, fontWeight: FontWeight.bold),
        ),
      ),
      body: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          children: [
            Expanded(
              child: ListView(
                children: [
                  _buildChecklistItem('TIRES', '1. Áp suất và độ mòn lốp xe', 'Kiểm tra 6 bánh xe và lốp dự phòng'),
                  _buildChecklistItem('BRAKES', '2. Hệ thống phanh khí nén & ABS', 'Bình khí nén đạt áp suất chuẩn 8.0 bar'),
                  _buildChecklistItem('LIGHTS', '3. Đèn pha, cos, xi-nhan và đèn phanh', 'Toàn bộ đèn cảnh báo hoạt động tốt'),
                  _buildChecklistItem('WIPERS', '4. Cần gạt mưa và nước rửa kính', 'Gạt sạch, đủ nước rửa kính chuyên dụng'),
                  _buildChecklistItem('FUEL', '5. Mức nhiên liệu dầu Diesel', 'Đạt trên 85% dung tích bình chứa'),
                  _buildChecklistItem('EMERGENCY_KIT', '6. Búa phá kính & Bình cứu hỏa', 'Đủ 4 búa thoát hiểm và 2 bình bột chữa cháy'),
                ],
              ),
            ),

            // Start Trip CTA
            SizedBox(
              width: double.infinity,
              height: 56,
              child: ElevatedButton(
                onPressed: _allPassed
                    ? () {
                        Navigator.of(context).pushReplacement(
                          MaterialPageRoute(builder: (_) => const DriverCockpitDashboard()),
                        );
                      }
                    : null,
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF10B981),
                  shape: BorderRadius.circular(16),
                ),
                child: const Text(
                  'XÁC NHẬN AN TOÀN & XUẤT BẾN ➔',
                  style: TextStyle(
                    fontFamily: 'JetBrains Mono',
                    fontSize: 14,
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                  ),
                ),
              ),
            ),
            const SizedBox(height: 12),
          ],
        ),
      ),
    );
  }

  Widget _buildChecklistItem(String key, String title, String subtitle) {
    final isChecked = _checklist[key] ?? false;
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF1E293B),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: isChecked ? const Color(0xFF10B981).withOpacity(0.4) : const Color(0xFF334155)),
      ),
      child: Row(
        children: [
          IconButton(
            onPressed: () => setState(() => _checklist[key] = !isChecked),
            icon: Icon(
              isChecked ? Icons.check_circle_rounded : Icons.radio_button_unchecked_rounded,
              color: isChecked ? const Color(0xFF10B981) : const Color(0xFF94A3B8),
              size: 26,
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Colors.white),
                ),
                const SizedBox(height: 2),
                Text(
                  subtitle,
                  style: const TextStyle(fontSize: 12, color: Color(0xFF94A3B8)),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
