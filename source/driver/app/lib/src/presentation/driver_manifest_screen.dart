import 'package:flutter/material.dart';
import 'package:resources/resources.dart';

class DriverManifestScreen extends StatelessWidget {
  const DriverManifestScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.canvasOps,
      appBar: AppBar(
        backgroundColor: AppColors.canvasOps,
        title: const Text('Danh sách khách (28 Khách)'),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _buildManifestCard(
            context,
            seatCode: 'A01 (T1)',
            name: 'Trần Văn Hùng',
            phoneMasked: '098***112',
            destination: 'Bến xe Ninh Bình',
            status: 'ĐÃ LÊN XE',
            isBoarded: true,
          ),
          const SizedBox(height: 12),
          _buildManifestCard(
            context,
            seatCode: 'A02 (T1)',
            name: 'Nguyễn Văn Nam',
            phoneMasked: '098***321',
            destination: 'Bến xe Phía Bắc',
            status: 'CHƯA LÊN XE',
            isBoarded: false,
            codAmount: '220.000 đ',
          ),
        ],
      ),
    );
  }

  Widget _buildManifestCard(
    BuildContext context, {
    required String seatCode,
    required String name,
    required String phoneMasked,
    required String destination,
    required String status,
    required bool isBoarded,
    String? codAmount,
  }) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surfacePanel,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: isBoarded ? AppColors.emeraldSafe : AppColors.amberWarning,
          width: 1.5,
        ),
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
                  color: isBoarded ? AppColors.emeraldSoft : AppColors.amberSoft,
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(
                  status,
                  style: TextStyle(
                    fontFamily: 'JetBrains Mono',
                    fontSize: 10,
                    fontWeight: FontWeight.bold,
                    color: isBoarded ? AppColors.emeraldSafe : AppColors.amberWarning,
                  ),
                ),
              ),
              Text(
                seatCode,
                style: const TextStyle(
                  fontFamily: 'JetBrains Mono',
                  fontSize: 14,
                  fontWeight: FontWeight.bold,
                  color: AppColors.pnrOrange,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(name, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: AppColors.textHighContrast)),
              Text(phoneMasked, style: const TextStyle(fontFamily: 'JetBrains Mono', fontSize: 12, color: AppColors.textMuted)),
            ],
          ),
          const SizedBox(height: 4),
          Text('Trả tại: $destination', style: const TextStyle(fontSize: 12, color: AppColors.textMuted)),
          if (codAmount != null) ...[
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: AppColors.amberSoft.withOpacity(0.4),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: AppColors.amberWarning.withOpacity(0.4)),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text('💵 Thu tiền mặt (COD):', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: AppColors.amberWarning)),
                  Text(codAmount, style: const TextStyle(fontFamily: 'JetBrains Mono', fontSize: 13, fontWeight: FontWeight.bold, color: Colors.white)),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}
