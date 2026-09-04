import 'package:flutter/material.dart';
import 'package:resources/resources.dart';
import 'passenger_seat_map_screen.dart';
import 'passenger_trip_detail_screen.dart';

class PassengerSearchResultsScreen extends StatefulWidget {
  const PassengerSearchResultsScreen({super.key});

  @override
  State<PassengerSearchResultsScreen> createState() => _PassengerSearchResultsScreenState();
}

class _PassengerSearchResultsScreenState extends State<PassengerSearchResultsScreen> {
  String _selectedVehicleFilter = 'ALL'; // ALL | VIP_CABIN | SLEEPER_34

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.canvasPassenger,
      appBar: AppBar(
        title: const Column(
          children: [
            Text('Hà Nội ➔ Thanh Hóa', style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold)),
            Text('Hôm nay · 3 chuyến khả dụng', style: TextStyle(fontSize: 11, color: AppColors.mutedSteel)),
          ],
        ),
      ),
      body: Column(
        children: [
          // Filter Chips Strip
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            color: Colors.white,
            child: Row(
              children: [
                _buildFilterChip('Tất cả', 'ALL'),
                const SizedBox(width: 8),
                _buildFilterChip('Cabin VIP', 'VIP_CABIN'),
                const SizedBox(width: 8),
                _buildFilterChip('Giường nằm', 'SLEEPER_34'),
              ],
            ),
          ),

          // Trip Cards List
          Expanded(
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                _buildTripCard(
                  tripId: 'trp_hn_th_01',
                  time: '07:00',
                  duration: '2h 30m',
                  vehicleType: 'Cabin Cung Điện VIP 22 Phòng',
                  plate: '29B-882.19',
                  price: '220.000 đ',
                  availableSeats: 8,
                  pickup: 'Bến xe Giáp Bát',
                  dropoff: 'Bến xe Phía Bắc Thanh Hóa',
                ),
                const SizedBox(height: 12),
                _buildTripCard(
                  tripId: 'trp_hn_th_02',
                  time: '14:00',
                  duration: '2h 30m',
                  vehicleType: 'Giường Nằm 34 Chỗ',
                  plate: '29B-991.02',
                  price: '180.000 đ',
                  availableSeats: 12,
                  pickup: 'Bến xe Mỹ Đình',
                  dropoff: 'Bến xe Phía Bắc Thanh Hóa',
                ),
                const SizedBox(height: 12),
                _buildTripCard(
                  tripId: 'trp_hn_th_03',
                  time: '19:30',
                  duration: '2h 30m',
                  vehicleType: 'Cabin VIP Sầm Sơn',
                  plate: '29B-678.90',
                  price: '250.000 đ',
                  availableSeats: 5,
                  pickup: 'Bến xe Giáp Bát',
                  dropoff: 'Bến xe Sầm Sơn (Biển)',
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildFilterChip(String label, String value) {
    final isSelected = _selectedVehicleFilter == value;
    return InkWell(
      onTap: () => setState(() => _selectedVehicleFilter = value),
      borderRadius: BorderRadius.circular(20),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
        decoration: BoxDecoration(
          color: isSelected ? AppColors.primarySapphire : Colors.grey.shade100,
          borderRadius: BorderRadius.circular(20),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 12,
            fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
            color: isSelected ? Colors.white : AppColors.charcoalInk,
          ),
        ),
      ),
    );
  }

  Widget _buildTripCard({
    required String tripId,
    required String time,
    required String duration,
    required String vehicleType,
    required String plate,
    required String price,
    required int availableSeats,
    required String pickup,
    required String dropoff,
  }) {
    return InkWell(
      onTap: () {
        Navigator.of(context).push(
          MaterialPageRoute(
            builder: (_) => PassengerTripDetailScreen(
              tripId: tripId,
              departureTime: time,
              price: price,
              vehicleType: vehicleType,
              vehiclePlate: plate,
            ),
          ),
        );
      },
      borderRadius: BorderRadius.circular(16),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: AppColors.whisperBorder),
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
                      time,
                      style: const TextStyle(
                        fontFamily: 'JetBrains Mono',
                        fontSize: 20,
                        fontWeight: FontWeight.bold,
                        color: AppColors.charcoalInk,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: Colors.grey.shade100,
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(
                        duration,
                        style: const TextStyle(fontSize: 11, color: AppColors.mutedSteel, fontFamily: 'JetBrains Mono'),
                      ),
                    ),
                  ],
                ),
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
            const SizedBox(height: 8),
            Text(
              '$vehicleType · $plate',
              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.charcoalInk),
            ),
            const SizedBox(height: 4),
            Text(
              'Đón: $pickup ➔ Trả: $dropoff',
              style: const TextStyle(fontSize: 12, color: AppColors.mutedSteel),
            ),
            const Divider(height: 20),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'Còn $availableSeats chỗ trống',
                  style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.bold,
                    color: AppColors.emeraldSafe,
                  ),
                ),
                const Text(
                  'CHỌN CHỖ ➔',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.bold,
                    color: AppColors.primarySapphire,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
