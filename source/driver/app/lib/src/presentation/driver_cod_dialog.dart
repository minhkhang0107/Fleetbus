import 'package:flutter/material.dart';
import 'package:resources/resources.dart';

class DriverCodDialog extends StatefulWidget {
  final String seatCode;
  final String passengerName;
  final String pnr;
  final int amountVnd;

  const DriverCodDialog({
    super.key,
    this.seatCode = 'A02 (T1)',
    this.passengerName = 'Nguyễn Văn Nam',
    this.pnr = 'BG-882201',
    this.amountVnd = 220000,
  });

  @override
  State<DriverCodDialog> createState() => _DriverCodDialogState();
}

class _DriverCodDialogState extends State<DriverCodDialog> {
  bool _isConfirming = false;

  void _handleConfirm() {
    setState(() => _isConfirming = true);
    Future.delayed(const Duration(milliseconds: 800), () {
      if (mounted) {
        setState(() => _isConfirming = false);
        Navigator.of(context).pop(true);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            backgroundColor: AppColors.emeraldSafe,
            content: Row(
              children: [
                const Icon(Icons.check_circle_rounded, color: Colors.white),
                const SizedBox(width: 8),
                Text('ĐÃ THU ${widget.amountVnd} đ TỪ KHÁCH ${widget.seatCode}'),
              ],
            ),
          ),
        );
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: AppColors.canvasOps,
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      padding: const EdgeInsets.all(24),
      child: SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Row(
                  children: [
                    Icon(Icons.payments_rounded, color: AppColors.amberWarning, size: 24),
                    SizedBox(width: 8),
                    Text(
                      'THU TIỀN MẶT COD (DRI-012)',
                      style: TextStyle(
                        fontFamily: 'JetBrains Mono',
                        fontSize: 14,
                        fontWeight: FontWeight.bold,
                        color: Colors.white,
                      ),
                    ),
                  ],
                ),
                IconButton(
                  onPressed: () => Navigator.of(context).pop(false),
                  icon: const Icon(Icons.close_rounded, color: AppColors.textMuted),
                ),
              ],
            ),
            const SizedBox(height: 16),

            // Passenger Info Box
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: AppColors.surfacePanel,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: AppColors.borderTactical),
              ),
              child: Column(
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text('Ghế đặt:', style: TextStyle(fontSize: 12, color: AppColors.textMuted)),
                      Text(
                        widget.seatCode,
                        style: const TextStyle(
                          fontFamily: 'JetBrains Mono',
                          fontSize: 14,
                          fontWeight: FontWeight.bold,
                          color: AppColors.pnrOrange,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text('Hành khách:', style: TextStyle(fontSize: 12, color: AppColors.textMuted)),
                      Text(
                        widget.passengerName,
                        style: const TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: Colors.white),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text('Mã vé PNR:', style: TextStyle(fontSize: 12, color: AppColors.textMuted)),
                      Text(
                        widget.pnr,
                        style: const TextStyle(
                          fontFamily: 'JetBrains Mono',
                          fontSize: 12,
                          color: Color(0xFF60A5FA),
                        ),
                      ),
                    ],
                  ),
                  const Divider(color: AppColors.borderTactical, height: 20),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text('Số tiền phải thu:', style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: Colors.white)),
                      Text(
                        '${widget.amountVnd} đ',
                        style: const TextStyle(
                          fontFamily: 'JetBrains Mono',
                          fontSize: 20,
                          fontWeight: FontWeight.bold,
                          color: AppColors.amberWarning,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),

            // Confirm Button (64dp)
            SizedBox(
              width: double.infinity,
              height: 64,
              child: ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.amberWarning,
                  foregroundColor: Colors.black,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                ),
                onPressed: _isConfirming ? null : _handleConfirm,
                child: _isConfirming
                    ? const CircularProgressIndicator(color: Colors.black)
                    : const Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.check_circle_rounded, size: 22),
                          SizedBox(width: 8),
                          Text(
                            'XÁC NHẬN ĐÃ THU TIỀN MẶT',
                            style: TextStyle(fontFamily: 'JetBrains Mono', fontSize: 14, fontWeight: FontWeight.bold),
                          ),
                        ],
                      ),
              ),
            ),
            const SizedBox(height: 12),
          ],
        ),
      ),
    );
  }
}
