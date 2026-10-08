import 'package:flutter/material.dart';
import 'package:resources/resources.dart';

class DriverNavigationScreen extends StatelessWidget {
  const DriverNavigationScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: SafeArea(
        child: Stack(
          children: [
            // Tactical Vector Map Simulator Canvas
            Positioned.fill(
              child: Container(
                color: const Color(0xFF0B1120),
                child: CustomPaint(
                  painter: _CorridorMapPainter(),
                ),
              ),
            ),

            // Top Maneuver Banner (Tactical Dark HUD)
            Positioned(
              top: 16,
              left: 16,
              right: 16,
              child: Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: AppColors.surfacePanel.withOpacity(0.95),
                  borderRadius: BorderRadius.circular(18),
                  border: Border.all(color: AppColors.borderTactical),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withOpacity(0.5),
                      blurRadius: 16,
                      offset: const Offset(0, 6),
                    ),
                  ],
                ),
                child: Row(
                  children: [
                    Container(
                      padding: EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: AppColors.primaryAction,
                        shape: BoxShape.circle,
                      ),
                      child: Icon(Icons.straight_rounded, color: Colors.white, size: 28),
                    ),
                    SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            '450m nữa: Tiếp tục thẳng',
                            style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Colors.white),
                          ),
                          SizedBox(height: 2),
                          Text(
                            'Vào Cao tốc Pháp Vân — Cầu Giẽ (Tối đa: 100 km/h)',
                            style: TextStyle(fontSize: 12, color: AppColors.textMuted),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),

            // Bottom Navigation HUD Deck
            Positioned(
              bottom: 16,
              left: 16,
              right: 16,
              child: Column(
                children: [
                  // Next Stop Floating Strip
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: AppColors.surfacePanel,
                      borderRadius: BorderRadius.circular(18),
                      border: Border.all(color: AppColors.borderTactical),
                    ),
                    child: const Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'TRẠM KẾ TIẾP (CÁCH 8.2 KM):',
                              style: TextStyle(fontFamily: 'JetBrains Mono', fontSize: 10, color: AppColors.textMuted),
                            ),
                            SizedBox(height: 4),
                            Text(
                              'BẾN XE NINH BÌNH',
                              style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Colors.white),
                            ),
                          ],
                        ),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            Text(
                              'DỰ KIẾN ĐẾN',
                              style: TextStyle(fontFamily: 'JetBrains Mono', fontSize: 10, color: AppColors.textMuted),
                            ),
                            SizedBox(height: 4),
                            Text(
                              '16:10',
                              style: TextStyle(
                                fontFamily: 'JetBrains Mono',
                                fontSize: 18,
                                fontWeight: FontWeight.bold,
                                color: AppColors.emeraldSafe,
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),

                  // Action Buttons Row (64dp)
                  Row(
                    children: [
                      Expanded(
                        child: ElevatedButton.icon(
                          style: ElevatedButton.styleFrom(
                            backgroundColor: AppColors.surfaceActive,
                            foregroundColor: Colors.white,
                            minimumSize: const Size(0, 60),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(16),
                              side: const BorderSide(color: AppColors.borderTactical),
                            ),
                          ),
                          onPressed: () => Navigator.of(context).pop(),
                          icon: const Icon(Icons.close_rounded, size: 20),
                          label: const Text('THOÁT BẢN ĐỒ', style: TextStyle(fontFamily: 'JetBrains Mono', fontSize: 12)),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Container(
                        height: 60,
                        padding: const EdgeInsets.symmetric(horizontal: 16),
                        decoration: BoxDecoration(
                          color: AppColors.surfacePanel,
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(color: AppColors.borderTactical),
                        ),
                        child: const Center(
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Text(
                                '62',
                                style: TextStyle(
                                  fontFamily: 'JetBrains Mono',
                                  fontSize: 22,
                                  fontWeight: FontWeight.bold,
                                  color: AppColors.emeraldSafe,
                                ),
                              ),
                              Text('km/h', style: TextStyle(fontSize: 9, color: AppColors.textMuted)),
                            ],
                          ),
                        ),
                      ),
                    ],
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

class _CorridorMapPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final corridorPaint = Paint()
      ..color = const Color(0xFF2563EB).withOpacity(0.5)
      ..strokeWidth = 14
      ..strokeCap = StrokeCap.round
      ..style = PaintingStyle.stroke;

    final centerPaint = Paint()
      ..color = const Color(0xFF60A5FA)
      ..strokeWidth = 4
      ..strokeCap = StrokeCap.round
      ..style = PaintingStyle.stroke;

    final path = Path();
    path.moveTo(size.width * 0.5, size.height * 0.9);
    path.lineTo(size.width * 0.5, size.height * 0.5);
    path.quadraticBezierTo(
      size.width * 0.5,
      size.height * 0.35,
      size.width * 0.7,
      size.height * 0.2,
    );

    canvas.drawPath(path, corridorPaint);
    canvas.drawPath(path, centerPaint);

    // Draw bus indicator
    final busCenter = Offset(size.width * 0.5, size.height * 0.65);
    final busHalo = Paint()..color = const Color(0xFF10B981).withOpacity(0.3);
    final busCore = Paint()..color = const Color(0xFF10B981);

    canvas.drawCircle(busCenter, 20, busHalo);
    canvas.drawCircle(busCenter, 8, busCore);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
