import 'package:flutter/material.dart';
import 'package:resources/resources.dart';
import 'passenger_ticket_qr_screen.dart';

class PassengerWalletScreen extends StatefulWidget {
  const PassengerWalletScreen({super.key});

  @override
  State<PassengerWalletScreen> createState() => _PassengerWalletScreenState();
}

class _PassengerWalletScreenState extends State<PassengerWalletScreen> {
  int _selectedTab = 0; // 0: Sắp đi, 1: Hoàn thành, 2: Đã hủy

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.canvasPassenger,
      appBar: AppBar(
        title: const Text('Vé xe của tôi (Ticket Wallet)'),
      ),
      body: Column(
        children: [
          // Tab Header Strip
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            color: Colors.white,
            child: Row(
              children: [
                _buildTabItem(0, 'Sắp đi (1)'),
                _buildTabItem(1, 'Đã đi (3)'),
                _buildTabItem(2, 'Đã hủy (0)'),
              ],
            ),
          ),

          // Ticket Cards List
          Expanded(
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                if (_selectedTab == 0) ...[
                  _buildUpcomingTicketCard(context),
                ] else ...[
                  const Center(
                    child: Padding(
                      padding: EdgeInsets.all(40.0),
                      child: Text('Không có vé nào trong danh mục này.', style: TextStyle(color: AppColors.mutedSteel)),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTabItem(int index, String title) {
    final isSelected = _selectedTab == index;
    return Expanded(
      child: InkWell(
        onTap: () => setState(() => _selectedTab = index),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 8),
          decoration: BoxDecoration(
            border: Border(
              bottom: BorderSide(
                color: isSelected ? AppColors.primarySapphire : Colors.transparent,
                width: 2.5,
              ),
            ),
          ),
          child: Center(
            child: Text(
              title,
              style: TextStyle(
                fontSize: 13,
                fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                color: isSelected ? AppColors.primarySapphire : AppColors.mutedSteel,
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildUpcomingTicketCard(BuildContext context) {
    return Container(
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
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(
                  color: AppColors.pnrOrangeSoft,
                  borderRadius: BorderRadius.circular(6),
                ),
                child: const Text(
                  'MÃ PNR: BG-882199',
                  style: TextStyle(
                    fontFamily: 'JetBrains Mono',
                    fontSize: 11,
                    fontWeight: FontWeight.bold,
                    color: AppColors.pnrOrange,
                  ),
                ),
              ),
              const Text(
                '07:00 · 28/08/2026',
                style: TextStyle(fontFamily: 'JetBrains Mono', fontSize: 12, fontWeight: FontWeight.bold),
              ),
            ],
          ),
          const SizedBox(height: 12),
          const Text(
            'Hà Nội ➔ Thanh Hóa',
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: AppColors.charcoalInk),
          ),
          const SizedBox(height: 4),
          const Text(
            'Ghế: A01 (Tầng 1) · Khách: Nguyễn Văn An',
            style: TextStyle(fontSize: 13, color: AppColors.mutedSteel),
          ),
          const Divider(height: 24),
          Row(
            children: [
              Expanded(
                child: ElevatedButton(
                  onPressed: () {
                    Navigator.of(context).push(
                      MaterialPageRoute(builder: (_) => const PassengerTicketQrScreen()),
                    );
                  },
                  child: const Text('MỞ VÉ LÊN XE (QR)', style: TextStyle(fontSize: 13)),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
