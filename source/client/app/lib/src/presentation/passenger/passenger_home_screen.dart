import 'package:flutter/material.dart';
import 'package:resources/resources.dart';
import 'passenger_seat_map_screen.dart';

class PassengerHomeScreen extends StatelessWidget {
  const PassengerHomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.canvasPassenger,
      body: CustomScrollView(
        slivers: [
          // Sapphire App Bar
          SliverAppBar(
            expandedHeight: 140,
            pinned: true,
            backgroundColor: AppColors.primarySapphire,
            flexibleSpace: const FlexibleSpaceBar(
              titlePadding: EdgeInsets.only(left: 16, bottom: 16),
              title: Text(
                'BusGo Passenger',
                style: TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.bold,
                  fontSize: 18,
                ),
              ),
            ),
          ),

          // Search Form Card (PAX-004 / PAX-005)
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.all(16.0),
              child: Container(
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: AppColors.whisperBorder),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withOpacity(0.04),
                      blurRadius: 16,
                      offset: const Offset(0, 4),
                    )
                  ],
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'TÌM CHUYẾN XE LIÊN TỈNH',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.bold,
                        letterSpacing: 0.5,
                        color: AppColors.mutedSteel,
                      ),
                    ),
                    const SizedBox(height: 16),
                    _buildLocationField(
                      icon: Icons.trip_origin_rounded,
                      iconColor: AppColors.primarySapphire,
                      label: 'Điểm đi',
                      value: 'Hà Nội (Bến xe Giáp Bát)',
                    ),
                    const SizedBox(height: 12),
                    _buildLocationField(
                      icon: Icons.location_on_rounded,
                      iconColor: AppColors.alertCrimson,
                      label: 'Điểm đến',
                      value: 'Thanh Hóa (Bến xe Phía Bắc)',
                    ),
                    const SizedBox(height: 16),
                    ElevatedButton(
                      onPressed: () {
                        Navigator.of(context).push(
                          MaterialPageRoute(
                            builder: (_) => const PassengerSeatMapScreen(),
                          ),
                        );
                      },
                      child: const Text('TÌM KIẾM CHUYẾN XE'),
                    ),
                  ],
                ),
              ),
            ),
          ),

          // Popular Routes Header
          const SliverToBoxAdapter(
            child: Padding(
              padding: EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              child: Text(
                'Tuyến đường phổ biến',
                style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.bold,
                  color: AppColors.charcoalInk,
                ),
              ),
            ),
          ),

          // Route Cards
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Column(
                children: [
                  _buildPopularRouteCard(
                    context,
                    origin: 'Hà Nội',
                    destination: 'Thanh Hóa',
                    price: '220.000 đ',
                    time: '07:00 (Hôm nay)',
                    vehicle: 'Cabin Cung Điện VIP',
                  ),
                  const SizedBox(height: 12),
                  _buildPopularRouteCard(
                    context,
                    origin: 'Hà Nội',
                    destination: 'Sầm Sơn (Biển)',
                    price: '250.000 đ',
                    time: '14:00 (Hôm nay)',
                    vehicle: 'Cabin Cung Điện VIP',
                  ),
                  const SizedBox(height: 24),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildLocationField({
    required IconData icon,
    required Color iconColor,
    required String label,
    required String value,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: AppColors.canvasPassenger,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.whisperBorder),
      ),
      child: Row(
        children: [
          Icon(icon, color: iconColor, size: 20),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: const TextStyle(fontSize: 10, color: AppColors.mutedSteel),
                ),
                Text(
                  value,
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.bold,
                    color: AppColors.charcoalInk,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPopularRouteCard(
    BuildContext context, {
    required String origin,
    required String destination,
    required String price,
    required String time,
    required String vehicle,
  }) {
    return InkWell(
      onTap: () {
        Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => const PassengerSeatMapScreen()),
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
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Text(origin, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                    const Padding(
                      padding: EdgeInsets.symmetric(horizontal: 6),
                      child: Icon(Icons.arrow_forward_rounded, size: 14, color: AppColors.mutedSteel),
                    ),
                    Text(destination, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                  ],
                ),
                const SizedBox(height: 4),
                Text('$vehicle · $time', style: const TextStyle(fontSize: 12, color: AppColors.mutedSteel)),
              ],
            ),
            Text(
              price,
              style: const TextStyle(
                fontFamily: 'JetBrains Mono',
                fontWeight: FontWeight.bold,
                fontSize: 15,
                color: AppColors.primarySapphire,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
