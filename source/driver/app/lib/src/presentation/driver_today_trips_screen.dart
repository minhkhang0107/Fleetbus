import 'package:flutter/material.dart';
import 'driver_readiness_screen.dart';

class DriverTodayTripsScreen extends StatelessWidget {
  const DriverTodayTripsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF1E293B),
        elevation: 0,
        title: const Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'LỊCH CHẠY HÔM NAY',
              style: TextStyle(
                fontFamily: 'JetBrains Mono',
                fontSize: 15,
                fontWeight: FontWeight.bold,
                letterSpacing: 1.1,
              ),
            ),
            Text(
              'Tài xế: Nguyễn Thành Long (TX8821) · FC Hợp lệ',
              style: TextStyle(fontSize: 11, color: Color(0xFF10B981)),
            ),
          ],
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _buildTripCard(
            context,
            tripId: 'trp_991823',
            route: 'Hà Nội ➔ Thanh Hóa (Cao tốc)',
            departureTime: '14:00',
            vehiclePlate: '29B-882.19',
            vehicleType: 'Cabin Cung Điện VIP 22 Phòng',
            manifestCount: 18,
            totalSeats: 22,
            status: 'READY_FOR_INSPECTION',
          ),
          const SizedBox(height: 16),
          _buildTripCard(
            context,
            tripId: 'trp_991825',
            route: 'Thanh Hóa ➔ Hà Nội',
            departureTime: '19:30',
            vehiclePlate: '29B-882.19',
            vehicleType: 'Cabin Cung Điện VIP 22 Phòng',
            manifestCount: 22,
            totalSeats: 22,
            status: 'SCHEDULED',
          ),
        ],
      ),
    );
  }

  Widget _buildTripCard(
    BuildContext context, {
    required String tripId,
    required String route,
    required String departureTime,
    required String vehiclePlate,
    required String vehicleType,
    required int manifestCount,
    required int totalSeats,
    required String status,
  }) {
    return Container(
      padding: const EdgeInsets.all(18),
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
              Row(
                children: [
                  Text(
                    departureTime,
                    style: const TextStyle(
                      fontFamily: 'JetBrains Mono',
                      fontSize: 22,
                      fontWeight: FontWeight.bold,
                      color: Colors.white,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: const Color(0xFF2563EB).withOpacity(0.2),
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
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: const Color(0xFF10B981).withOpacity(0.15),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  '$manifestCount/$totalSeats KHÁCH',
                  style: const TextStyle(
                    fontFamily: 'JetBrains Mono',
                    fontSize: 11,
                    fontWeight: FontWeight.bold,
                    color: Color(0xFF10B981),
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
          Text(
            vehicleType,
            style: const TextStyle(fontSize: 12, color: Color(0xFF94A3B8)),
          ),
          const Divider(color: Color(0xFF334155), height: 24),
          SizedBox(
            width: double.infinity,
            height: 48,
            child: ElevatedButton(
              onPressed: () {
                Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const DriverReadinessScreen()),
                );
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF2563EB),
                shape: BorderRadius.circular(12),
              ),
              child: const Text(
                'KIỂM TRA AN TOÀN TRƯỚC XUẤT BẾN ➔',
                style: TextStyle(fontFamily: 'JetBrains Mono', fontSize: 12, fontWeight: FontWeight.bold),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
