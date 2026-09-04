import 'package:flutter/material.dart';
import 'package:resources/resources.dart';
import 'passenger_payment_processing_screen.dart';

class PassengerCheckoutScreen extends StatelessWidget {
  final List<String> selectedSeats;

  const PassengerCheckoutScreen({
    super.key,
    required this.selectedSeats,
  });

  @override
  Widget build(BuildContext context) {
    final subtotal = selectedSeats.length * 220000;
    const discount = 50000; // BUSGO50K
    final total = subtotal - discount;

    return Scaffold(
      backgroundColor: AppColors.canvasPassenger,
      appBar: AppBar(
        title: const Text('Xác nhận đặt vé'),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Trip Summary
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: AppColors.whisperBorder),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(
                    color: AppColors.pnrOrangeSoft,
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: const Text(
                    'HÀ NỘI ➔ THANH HÓA',
                    style: TextStyle(
                      fontFamily: 'JetBrains Mono',
                      fontSize: 11,
                      fontWeight: FontWeight.bold,
                      color: AppColors.pnrOrange,
                    ),
                  ),
                ),
                const SizedBox(height: 8),
                const Text(
                  '07:00 · 28/08/2026 (Hôm nay)',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                    color: AppColors.charcoalInk,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  'Ghế: ${selectedSeats.join(", ")}',
                  style: const TextStyle(
                    fontFamily: 'JetBrains Mono',
                    fontSize: 13,
                    fontWeight: FontWeight.bold,
                    color: AppColors.primarySapphire,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),

          // Payer Form
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: AppColors.whisperBorder),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'THÔNG TIN HÀNH KHÁCH',
                  style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: AppColors.mutedSteel),
                ),
                const SizedBox(height: 12),
                TextFormField(
                  initialValue: 'Nguyễn Văn An',
                  decoration: InputDecoration(
                    labelText: 'Họ và tên',
                    filled: true,
                    fillColor: AppColors.canvasPassenger,
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                ),
                const SizedBox(height: 12),
                TextFormField(
                  initialValue: '0912345678',
                  decoration: InputDecoration(
                    labelText: 'Số điện thoại',
                    filled: true,
                    fillColor: AppColors.canvasPassenger,
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),

          // Payment Summary Breakdown
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: AppColors.whisperBorder),
            ),
            child: Column(
              children: [
                _buildRow('Tiền vé (${selectedSeats.length} ghế)', '$subtotal đ'),
                const SizedBox(height: 8),
                _buildRow('Voucher BUSGO50K', '-50.000 đ', isDiscount: true),
                const Divider(height: 24),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text('Tổng thanh toán', style: TextStyle(fontWeight: FontWeight.bold)),
                    Text(
                      '$total đ',
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
          ),
          const SizedBox(height: 24),

          ElevatedButton(
            onPressed: () {
              Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => PassengerPaymentProcessingScreen(
                    totalAmount: total,
                    selectedSeats: selectedSeats,
                  ),
                ),
              );
            },
            child: const Text('XÁC NHẬN & THANH TOÁN VIETQR ➔'),
          ),
        ],
      ),
    );
  }

  Widget _buildRow(String label, String value, {bool isDiscount = false}) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: const TextStyle(fontSize: 13, color: AppColors.mutedSteel)),
        Text(
          value,
          style: TextStyle(
            fontFamily: 'JetBrains Mono',
            fontSize: 13,
            fontWeight: FontWeight.bold,
            color: isDiscount ? AppColors.emeraldSafe : AppColors.charcoalInk,
          ),
        ),
      ],
    );
  }
}
