import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:resources/resources.dart';
import 'passenger_ticket_qr_screen.dart';

class PassengerPaymentProcessingScreen extends StatefulWidget {
  final int totalAmount;
  final String pnr;
  final List<String> selectedSeats;

  const PassengerPaymentProcessingScreen({
    super.key,
    this.totalAmount = 170000,
    this.pnr = 'BG88219',
    this.selectedSeats = const ['A01'],
  });

  @override
  State<PassengerPaymentProcessingScreen> createState() => _PassengerPaymentProcessingScreenState();
}

class _PassengerPaymentProcessingScreenState extends State<PassengerPaymentProcessingScreen> {
  int _secondsLeft = 600; // 10 minutes hold
  Timer? _timer;
  bool _isVerifying = false;

  @override
  void initState() {
    super.initState();
    _startCountdown();
  }

  void _startCountdown() {
    _timer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (mounted) {
        setState(() {
          if (_secondsLeft <= 1) {
            _timer?.cancel();
            _secondsLeft = 0;
          } else {
            _secondsLeft--;
          }
        });
      }
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  String get _formattedTime {
    final m = (_secondsLeft ~/ 60).toString().padLeft(2, '0');
    final s = (_secondsLeft % 60).toString().padLeft(2, '0');
    return '$m:$s';
  }

  void _handleConfirmPayment() {
    setState(() => _isVerifying = true);
    Future.delayed(const Duration(milliseconds: 1500), () {
      if (mounted) {
        setState(() => _isVerifying = false);
        // Show success modal then navigate to e-ticket
        showModalBottomSheet(
          context: context,
          isDismissible: false,
          enableDrag: false,
          shape: const RoundedRectangleBorder(
            borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
          ),
          builder: (ctx) => Container(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: const BoxDecoration(
                    color: AppColors.emeraldSoft,
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(Icons.check_circle_rounded, color: AppColors.emeraldSafe, size: 48),
                ),
                const SizedBox(height: 16),
                const Text(
                  'Thanh toán thành công!',
                  style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: AppColors.charcoalInk),
                ),
                const SizedBox(height: 8),
                Text(
                  'Đã nhận thanh toán ${widget.totalAmount} đ qua VietQR Napas247.',
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontSize: 13, color: AppColors.mutedSteel),
                ),
                const SizedBox(height: 24),
                ElevatedButton(
                  onPressed: () {
                    Navigator.of(ctx).pop();
                    Navigator.of(context).pushReplacement(
                      MaterialPageRoute(builder: (_) => const PassengerTicketQrScreen()),
                    );
                  },
                  child: const Text('XEM VÉ ĐIỆN TỬ (QR) ➔'),
                ),
              ],
            ),
          ),
        );
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.canvasPassenger,
      appBar: AppBar(
        title: const Text('Thanh toán VietQR Napas247'),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Hold Timer Banner (PAX-010 / PAX-013)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            decoration: BoxDecoration(
              color: AppColors.amberSoft,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: AppColors.amberHold.withOpacity(0.3)),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    const Icon(Icons.timer_outlined, color: AppColors.amberHold, size: 20),
                    const SizedBox(width: 8),
                    const Text(
                      'Thời gian giữ chỗ:',
                      style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.charcoalInk),
                    ),
                  ],
                ),
                Text(
                  _formattedTime,
                  style: const TextStyle(
                    fontFamily: 'JetBrains Mono',
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                    color: AppColors.amberHold,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),

          // VietQR Code Box Card
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: AppColors.whisperBorder),
            ),
            child: Column(
              children: [
                // Napas & VietQR Header
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: AppColors.primarySapphireSoft,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: const Text(
                        'VIETQR · NAPAS 247',
                        style: TextStyle(
                          fontFamily: 'JetBrains Mono',
                          fontSize: 11,
                          fontWeight: FontWeight.bold,
                          color: AppColors.primarySapphire,
                        ),
                      ),
                    ),
                    Text(
                      'PNR: ${widget.pnr}',
                      style: const TextStyle(
                        fontFamily: 'JetBrains Mono',
                        fontSize: 12,
                        fontWeight: FontWeight.bold,
                        color: AppColors.pnrOrange,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),

                // Simulated Dynamic VietQR Image Box
                Container(
                  width: 200,
                  height: 200,
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: AppColors.whisperBorder, width: 2),
                  ),
                  child: Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Icon(Icons.qr_code_2_rounded, size: 130, color: AppColors.charcoalInk),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                          decoration: BoxDecoration(
                            color: AppColors.emeraldSoft,
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: const Text(
                            'CHUẨN EMVCO NAPAS',
                            style: TextStyle(
                              fontFamily: 'JetBrains Mono',
                              fontSize: 9,
                              fontWeight: FontWeight.bold,
                              color: AppColors.emeraldSafe,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 12),

                const Text(
                  'Mở ứng dụng ngân hàng bất kỳ để quét mã',
                  style: TextStyle(fontSize: 12, color: AppColors.mutedSteel),
                ),
                const Divider(height: 24),

                // Transfer Details Table
                _buildTransferDetailRow('Ngân hàng thụ hưởng:', 'Techcombank (TCB)', canCopy: false),
                const SizedBox(height: 8),
                _buildTransferDetailRow('Số tài khoản:', '9821999901', canCopy: true),
                const SizedBox(height: 8),
                _buildTransferDetailRow('Tên người thụ hưởng:', 'CONG TY CP BUSGO VIET NAM', canCopy: false),
                const SizedBox(height: 8),
                _buildTransferDetailRow('Số tiền:', '${widget.totalAmount} đ', canCopy: true, isAmount: true),
                const SizedBox(height: 8),
                _buildTransferDetailRow('Nội dung chuyển khoản:', widget.pnr, canCopy: true, isHighlight: true),
              ],
            ),
          ),
          const SizedBox(height: 20),

          ElevatedButton(
            onPressed: _isVerifying ? null : _handleConfirmPayment,
            child: _isVerifying
                ? const Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      SizedBox(width: 20, height: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2)),
                      SizedBox(width: 12),
                      Text('ĐANG KIỂM TRA GIAO DỊCH...'),
                    ],
                  )
                : const Text('TÔI ĐÃ CHUYỂN KHOẢN XONG ➔'),
          ),
          const SizedBox(height: 12),

          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Thay đổi phương thức thanh toán', style: TextStyle(color: AppColors.mutedSteel, fontSize: 13)),
          ),
        ],
      ),
    );
  }

  Widget _buildTransferDetailRow(
    String label,
    String value, {
    bool canCopy = false,
    bool isAmount = false,
    bool isHighlight = false,
  }) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: const TextStyle(fontSize: 12, color: AppColors.mutedSteel)),
        Row(
          children: [
            Text(
              value,
              style: TextStyle(
                fontFamily: isAmount || isHighlight ? 'JetBrains Mono' : 'Geist',
                fontSize: isAmount ? 14 : 12,
                fontWeight: isAmount || isHighlight ? FontWeight.bold : FontWeight.w600,
                color: isHighlight
                    ? AppColors.pnrOrange
                    : (isAmount ? AppColors.primarySapphire : AppColors.charcoalInk),
              ),
            ),
            if (canCopy) ...[
              const SizedBox(width: 6),
              InkWell(
                onTap: () {
                  Clipboard.setData(ClipboardData(text: value.replaceAll(' đ', '').trim()));
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('Đã sao chép: $value')),
                  );
                },
                child: const Icon(Icons.copy_rounded, size: 14, color: AppColors.primarySapphire),
              ),
            ],
          ],
        ),
      ],
    );
  }
}
