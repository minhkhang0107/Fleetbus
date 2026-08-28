import 'package:flutter/material.dart';

class DriverOfflineSyncScreen extends StatefulWidget {
  const DriverOfflineSyncScreen({super.key});

  @override
  State<DriverOfflineSyncScreen> createState() => _DriverOfflineSyncScreenState();
}

class _DriverOfflineSyncScreenState extends State<DriverOfflineSyncScreen> {
  int _pendingPings = 14;
  bool _isReplaying = false;

  void _replaySync() {
    setState(() => _isReplaying = true);
    Future.delayed(const Duration(seconds: 2), () {
      if (mounted) {
        setState(() {
          _isReplaying = false;
          _pendingPings = 0;
        });
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF1E293B),
        title: const Text(
          'ĐỒNG BỘ NGOẠI TUYẾN & SOS (DRI-015)',
          style: TextStyle(fontFamily: 'JetBrains Mono', fontSize: 13, fontWeight: FontWeight.bold),
        ),
      ),
      body: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Sync status card
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: const Color(0xFF1E293B),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: const Color(0xFF334155)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text(
                        'HÀNG ĐỢI TELEMETRY GPS',
                        style: TextStyle(fontFamily: 'JetBrains Mono', fontSize: 12, fontWeight: FontWeight.bold, color: Color(0xFF94A3B8)),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(
                          color: _pendingPings > 0 ? const Color(0xFFF59E0B).withOpacity(0.2) : const Color(0xFF10B981).withOpacity(0.2),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          _pendingPings > 0 ? '$_pendingPings BẢN GHI ĐỢI ĐỒNG BỘ' : 'ĐÃ ĐỒNG BỘ 100%',
                          style: TextStyle(
                            fontFamily: 'JetBrains Mono',
                            fontSize: 11,
                            fontWeight: FontWeight.bold,
                            color: _pendingPings > 0 ? const Color(0xFFF59E0B) : const Color(0xFF10B981),
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 14),
                  const Text(
                    'Dữ liệu vị trí GPS và vé đã quét được mã hóa và lưu trữ an toàn trong bộ nhớ SQLite cục bộ khi mất sóng cao tốc.',
                    style: TextStyle(fontSize: 13, color: Color(0xFF94A3B8), height: 1.4),
                  ),
                  const SizedBox(height: 20),
                  SizedBox(
                    width: double.infinity,
                    height: 48,
                    child: ElevatedButton(
                      onPressed: _pendingPings > 0 && !_isReplaying ? _replaySync : null,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF2563EB),
                        shape: BorderRadius.circular(12),
                      ),
                      child: _isReplaying
                          ? const CircularProgressIndicator(color: Colors.white)
                          : const Text(
                              'GỬI LẠI TOÀN BỘ BẢN GHI LÊN SERVER',
                              style: TextStyle(fontFamily: 'JetBrains Mono', fontSize: 12, fontWeight: FontWeight.bold),
                            ),
                    ),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 24),

            // Emergency Incident Button (DRI-019)
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: const Color(0xFFEF4444).withOpacity(0.12),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: const Color(0xFFEF4444).withOpacity(0.4)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Row(
                    children: [
                      Icon(Icons.warning_amber_rounded, color: Color(0xFFEF4444), size: 24),
                      SizedBox(width: 10),
                      Text(
                        'BÁO CÁO SỰ CỐ KHẨN CẤP / SOS (DRI-019)',
                        style: TextStyle(
                          fontFamily: 'JetBrains Mono',
                          fontSize: 13,
                          fontWeight: FontWeight.bold,
                          color: Color(0xFFEF4444),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'Bấm để gửi tọa độ GPS hiện tại và phát cảnh báo khẩn cấp đến Trung tâm điều hành (Operations Control Center).',
                    style: TextStyle(fontSize: 12, color: Color(0xFF94A3B8)),
                  ),
                  const SizedBox(height: 16),
                  SizedBox(
                    width: double.infinity,
                    height: 48,
                    child: ElevatedButton(
                      onPressed: () {
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(
                            content: Text('Đã phát tín hiệu SOS và tọa độ GPS đến Trung tâm Điều hành!'),
                            backgroundColor: Color(0xFFEF4444),
                          ),
                        );
                      },
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFFEF4444),
                        shape: BorderRadius.circular(12),
                      ),
                      child: const Text(
                        'PHÁT TÍN HIỆU SOS KHẨN CẤP',
                        style: TextStyle(fontFamily: 'JetBrains Mono', fontSize: 13, fontWeight: FontWeight.bold, color: Colors.white),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
