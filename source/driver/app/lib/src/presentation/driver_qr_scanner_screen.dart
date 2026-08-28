import 'package:flutter/material.dart';
import 'package:resources/resources.dart';

class DriverQrScannerScreen extends StatelessWidget {
  const DriverQrScannerScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        title: const Text('Quét mã QR Vé Xe', style: TextStyle(color: Colors.white)),
      ),
      body: Padding(
        padding: const EdgeInsets.all(24.0),
        child: Column(
          children: [
            const Spacer(),
            // Reticle Frame Simulation
            Center(
              child: Container(
                width: 240,
                height: 240,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(24),
                  border: Border.all(color: AppColors.emeraldSafe, width: 2.5),
                  color: AppColors.emeraldSafe.withOpacity(0.05),
                ),
                child: const Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.qr_code_scanner_rounded, size: 90, color: AppColors.emeraldSafe),
                    SizedBox(height: 8),
                    Text(
                      'Căn chỉnh mã QR vào khung',
                      style: TextStyle(fontSize: 11, color: Colors.white70),
                    ),
                  ],
                ),
              ),
            ),
            const Spacer(),

            ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.emeraldSafe,
              ),
              onPressed: () {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    backgroundColor: AppColors.emeraldSafe,
                    content: Text('✅ SOÁT VÉ THÀNH CÔNG: A01 - Trần Văn Hùng'),
                  ),
                );
                Navigator.of(context).pop();
              },
              child: const Text('GIẢ LẬP QUÉT THÀNH CÔNG (A01)'),
            ),
          ],
        ),
      ),
    );
  }
}
