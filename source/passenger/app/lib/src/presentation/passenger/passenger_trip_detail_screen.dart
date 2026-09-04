import 'package:flutter/material.dart';
import 'package:resources/resources.dart';
import 'passenger_seat_map_screen.dart';

class PassengerTripDetailScreen extends StatelessWidget {
  final String tripId;
  final String origin;
  final String destination;
  final String departureTime;
  final String price;
  final String vehicleType;
  final String vehiclePlate;

  const PassengerTripDetailScreen({
    super.key,
    this.tripId = 'trp_hn_th_01',
    this.origin = 'Hà Nội',
    this.destination = 'Thanh Hóa',
    this.departureTime = '07:00',
    this.price = '220.000 đ',
    this.vehicleType = 'Cabin Cung Điện VIP 22 Phòng',
    this.vehiclePlate = '29B-882.19',
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.canvasPassenger,
      appBar: AppBar(
        title: const Text('Chi tiết chuyến đi'),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Vehicle & Operator Card
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: AppColors.whisperBorder),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: AppColors.primarySapphireSoft,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        vehiclePlate,
                        style: const TextStyle(
                          fontFamily: 'JetBrains Mono',
                          fontSize: 12,
                          fontWeight: FontWeight.bold,
                          color: AppColors.primarySapphire,
                        ),
                      ),
                    ),
                    Row(
                      children: [
                        const Icon(Icons.star_rounded, color: AppColors.amberHold, size: 18),
                        const SizedBox(width: 4),
                        const Text(
                          '4.9',
                          style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                        ),
                        const SizedBox(width: 4),
                        Text(
                          '(1.4k đánh giá)',
                          style: TextStyle(fontSize: 11, color: AppColors.mutedSteel),
                        ),
                      ],
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Text(
                  '$origin ➔ $destination',
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                    color: AppColors.charcoalInk,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  vehicleType,
                  style: const TextStyle(fontSize: 13, color: AppColors.mutedSteel),
                ),
                const Divider(height: 24),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('Khởi hành', style: TextStyle(fontSize: 11, color: AppColors.mutedSteel)),
                        const SizedBox(height: 2),
                        Text(
                          '$departureTime (Hôm nay)',
                          style: const TextStyle(
                            fontFamily: 'JetBrains Mono',
                            fontSize: 15,
                            fontWeight: FontWeight.bold,
                            color: AppColors.charcoalInk,
                          ),
                        ),
                      ],
                    ),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        const Text('Giá vé niêm yết', style: TextStyle(fontSize: 11, color: AppColors.mutedSteel)),
                        const SizedBox(height: 2),
                        Text(
                          price,
                          style: const TextStyle(
                            fontFamily: 'JetBrains Mono',
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                            color: AppColors.primarySapphire,
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

          // Route Timeline Itinerary Card
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: AppColors.whisperBorder),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'LỘ TRÌNH & CÁC ĐIỂM DỪNG',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.bold,
                    letterSpacing: 0.5,
                    color: AppColors.mutedSteel,
                  ),
                ),
                const SizedBox(height: 16),
                _buildTimelineItem(
                  time: '07:00',
                  station: 'Bến xe Giáp Bát (Hà Nội)',
                  note: 'Điểm xuất phát · Cổng số 3',
                  isStart: true,
                ),
                _buildTimelineItem(
                  time: '08:15',
                  station: 'Trạm dừng nghỉ Liêm Tuyền (Hà Nam)',
                  note: 'Dừng nghỉ 15 phút',
                ),
                _buildTimelineItem(
                  time: '08:50',
                  station: 'Bến xe Ninh Bình',
                  note: 'Trả khách & đón tiếp khách',
                ),
                _buildTimelineItem(
                  time: '09:30',
                  station: 'Bến xe Phía Bắc (Thanh Hóa)',
                  note: 'Điểm kết thúc hành trình',
                  isEnd: true,
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),

          // Amenities Card
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: AppColors.whisperBorder),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'TIỆN ÍCH TRÊN XE',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.bold,
                    letterSpacing: 0.5,
                    color: AppColors.mutedSteel,
                  ),
                ),
                const SizedBox(height: 14),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceAround,
                  children: [
                    _buildAmenityBadge(Icons.wifi_rounded, 'Wi-Fi 5G'),
                    _buildAmenityBadge(Icons.usb_rounded, 'Sạc Type-C'),
                    _buildAmenityBadge(Icons.ac_unit_rounded, 'Điều hòa ion'),
                    _buildAmenityBadge(Icons.water_drop_rounded, 'Nước uống'),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),

          // Policy Summary Card
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: AppColors.primarySapphireSoft.withOpacity(0.5),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: AppColors.primarySapphire.withOpacity(0.2)),
            ),
            child: const Row(
              children: [
                Icon(Icons.verified_user_rounded, color: AppColors.primarySapphire, size: 24),
                SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Chính sách hoàn hủy linh hoạt',
                        style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13, color: AppColors.charcoalInk),
                      ),
                      SizedBox(height: 2),
                      Text(
                        'Hoàn 90% khi hủy trước 24 giờ khởi hành. Không thu phụ phí ẩn.',
                        style: TextStyle(fontSize: 11, color: AppColors.mutedSteel),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),

          // Sticky Button
          ElevatedButton(
            onPressed: () {
              Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => const PassengerSeatMapScreen(),
                ),
              );
            },
            child: const Text('CHỌN CHỖ NGỒI (PAX-009) ➔'),
          ),
        ],
      ),
    );
  }

  Widget _buildTimelineItem({
    required String time,
    required String station,
    required String note,
    bool isStart = false,
    bool isEnd = false,
  }) {
    Color dotColor = AppColors.mutedSteel;
    if (isStart) dotColor = AppColors.emeraldSafe;
    if (isEnd) dotColor = AppColors.alertCrimson;

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 50,
          child: Text(
            time,
            style: const TextStyle(
              fontFamily: 'JetBrains Mono',
              fontSize: 12,
              fontWeight: FontWeight.bold,
              color: AppColors.charcoalInk,
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
            if (!isEnd)
              Container(
                width: 2,
                height: 40,
                color: AppColors.whisperBorder,
              ),
          ],
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                station,
                style: const TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.bold,
                  color: AppColors.charcoalInk,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                note,
                style: const TextStyle(fontSize: 11, color: AppColors.mutedSteel),
              ),
              const SizedBox(height: 14),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildAmenityBadge(IconData icon, String label) {
    return Column(
      children: [
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: AppColors.canvasPassenger,
            shape: BoxShape.circle,
            border: Border.all(color: AppColors.whisperBorder),
          ),
          child: Icon(icon, color: AppColors.primarySapphire, size: 20),
        ),
        const SizedBox(height: 6),
        Text(
          label,
          style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w500, color: AppColors.charcoalInk),
        ),
      ],
    );
  }
}
