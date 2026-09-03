import 'package:flutter/material.dart';
import 'package:resources/resources.dart';

class PassengerCancelRefundScreen extends StatefulWidget {
  final String pnr;
  final int ticketPrice;
  final String departureTime;

  const PassengerCancelRefundScreen({
    super.key,
    this.pnr = 'BG-882199',
    this.ticketPrice = 220000,
    this.departureTime = '07:00 · 28/08/2026',
  });

  @override
  State<PassengerCancelRefundScreen> createState() => _PassengerCancelRefundScreenState();
}

class _PassengerCancelRefundScreenState extends State<PassengerCancelRefundScreen> {
  bool _isProcessing = false;
  String _selectedReason = 'Thay đổi lịch trình cá nhân';

  final List<String> _reasons = [
    'Thay đổi lịch trình cá nhân',
    'Bị ốm / sự cố sức khỏe',
    'Tìm thấy phương tiện khác thuận tiện hơn',
    'Lý do thời tiết / công tác',
  ];

  @override
  Widget build(BuildContext context) {
    const refundPercent = 90; // > 24h
    final fee = (widget.ticketPrice * (100 - refundPercent) / 100).round();
    final refundAmount = widget.ticketPrice - fee;

    return Scaffold(
      backgroundColor: AppColors.canvasPassenger,
      appBar: AppBar(
        title: const Text('Hủy vé & Yêu cầu hoàn tiền'),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Warning Banner
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: AppColors.alertCrimsonSoft,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: AppColors.alertCrimson.withOpacity(0.3)),
            ),
            child: const Row(
              children: [
                Icon(Icons.warning_amber_rounded, color: AppColors.alertCrimson, size: 24),
                SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Lưu ý quan trọng',
                        style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13, color: AppColors.alertCrimson),
                      ),
                      SizedBox(height: 2),
                      Text(
                        'Sau khi xác nhận hủy, ghế đã chọn sẽ được giải phóng ngay lập tức trên sơ đồ chuyến xe.',
                        style: TextStyle(fontSize: 11, color: AppColors.charcoalInk),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),

          // Ticket Info Card
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
                    Text(
                      'MÃ PNR: ${widget.pnr}',
                      style: const TextStyle(
                        fontFamily: 'JetBrains Mono',
                        fontWeight: FontWeight.bold,
                        fontSize: 14,
                        color: AppColors.pnrOrange,
                      ),
                    ),
                    Text(
                      widget.departureTime,
                      style: const TextStyle(fontFamily: 'JetBrains Mono', fontSize: 11, color: AppColors.mutedSteel),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                const Text(
                  'Hà Nội ➔ Thanh Hóa (Cabin Cung Điện VIP)',
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: AppColors.charcoalInk),
                ),
                const SizedBox(height: 4),
                const Text(
                  'Ghế: A01 · Khách: Nguyễn Văn An',
                  style: TextStyle(fontSize: 12, color: AppColors.mutedSteel),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),

          // Policy Tiers Explanation Card
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
                  'CHÍNH SÁCH HOÀN TIỀN TỰ ĐỘNG (PAX-021)',
                  style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: AppColors.mutedSteel),
                ),
                const SizedBox(height: 12),
                _buildTierRow('Trước giờ khởi hành > 24h:', 'Hoàn 90%', isActive: true),
                const SizedBox(height: 8),
                _buildTierRow('Từ 12h đến 24h trước khởi hành:', 'Hoàn 70%', isActive: false),
                const SizedBox(height: 8),
                _buildTierRow('Dưới 12h trước khởi hành:', 'Không hỗ trợ hoàn vé', isActive: false),
              ],
            ),
          ),
          const SizedBox(height: 16),

          // Refund Breakdown Card
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: AppColors.whisperBorder),
            ),
            child: Column(
              children: [
                _buildBreakdownRow('Giá trị vé ban đầu:', '${widget.ticketPrice} đ'),
                const SizedBox(height: 8),
                _buildBreakdownRow('Tỷ lệ hoàn tiền áp dụng:', '$refundPercent%'),
                const SizedBox(height: 8),
                _buildBreakdownRow('Phí dịch vụ hủy vé (10%):', '-$fee đ', isNegative: true),
                const Divider(height: 24),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text('Số tiền hoàn lại:', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                    Text(
                      '$refundAmount đ',
                      style: const TextStyle(
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
          const SizedBox(height: 16),

          // Reason Selector
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
                  'LÝ DO HỦY VÉ',
                  style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: AppColors.mutedSteel),
                ),
                const SizedBox(height: 8),
                DropdownButtonFormField<String>(
                  value: _selectedReason,
                  decoration: InputDecoration(
                    filled: true,
                    fillColor: AppColors.canvasPassenger,
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                  items: _reasons
                      .map((r) => DropdownMenuItem(value: r, child: Text(r, style: const TextStyle(fontSize: 13))))
                      .toList(),
                  onChanged: (val) => setState(() => _selectedReason = val ?? _selectedReason),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),

          // Confirm Cancel Button
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.alertCrimson,
            ),
            onPressed: _isProcessing
                ? null
                : () {
                    setState(() => _isProcessing = true);
                    Future.delayed(const Duration(milliseconds: 1200), () {
                      if (mounted) {
                        setState(() => _isProcessing = false);
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(
                            backgroundColor: AppColors.emeraldSafe,
                            content: Text('Đã hủy vé ${widget.pnr} và khởi tạo hoàn $refundAmount đ.'),
                          ),
                        );
                        Navigator.of(context).pop();
                      }
                    });
                  },
            child: _isProcessing
                ? const CircularProgressIndicator(color: Colors.white)
                : const Text('XÁC NHẬN HỦY VÉ & HOÀN TIỀN'),
          ),
          const SizedBox(height: 16),
        ],
      ),
    );
  }

  Widget _buildTierRow(String label, String value, {required bool isActive}) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: isActive ? AppColors.emeraldSoft : AppColors.canvasPassenger,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(
          color: isActive ? AppColors.emeraldSafe.withOpacity(0.4) : AppColors.whisperBorder,
        ),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: TextStyle(
              fontSize: 12,
              fontWeight: isActive ? FontWeight.bold : FontWeight.normal,
              color: isActive ? AppColors.charcoalInk : AppColors.mutedSteel,
            ),
          ),
          Text(
            value,
            style: TextStyle(
              fontFamily: 'JetBrains Mono',
              fontSize: 12,
              fontWeight: FontWeight.bold,
              color: isActive ? AppColors.emeraldSafe : AppColors.mutedSteel,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildBreakdownRow(String label, String value, {bool isNegative = false}) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: const TextStyle(fontSize: 13, color: AppColors.mutedSteel)),
        Text(
          value,
          style: TextStyle(
            fontFamily: 'JetBrains Mono',
            fontSize: 13,
            fontWeight: FontWeight.w600,
            color: isNegative ? AppColors.alertCrimson : AppColors.charcoalInk,
          ),
        ),
      ],
    );
  }
}
