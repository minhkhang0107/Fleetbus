import 'package:flutter/material.dart';
import '../../../../resources/lib/src/theme/app_colors.dart';

class ManagerPosBookingScreen extends StatefulWidget {
  const ManagerPosBookingScreen({super.key});

  @override
  State<ManagerPosBookingScreen> createState() => _ManagerPosBookingScreenState();
}

class _ManagerPosBookingScreenState extends State<ManagerPosBookingScreen> {
  final _nameController = TextEditingController();
  final _phoneController = TextEditingController();
  String _selectedSeat = 'A01';
  bool _isCreated = false;
  String _pnrResult = '';

  void _handleCreateBooking() {
    if (_nameController.text.trim().isEmpty || _phoneController.text.trim().isEmpty) return;
    setState(() {
      _pnrResult = 'BG-POS${(1000 + (DateTime.now().millisecondsSinceEpoch % 9000))}';
      _isCreated = true;
    });
  }

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('BÁN VÉ TỔNG ĐÀI / QUẦY VÉ (POS DESK)', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: ManagerColors.textPrimary)),
          const SizedBox(height: 4),
          const Text('Xuất vé nhanh cho khách gọi điện hoặc mua trực tiếp tại quầy bến xe', style: TextStyle(color: ManagerColors.textMuted, fontSize: 13)),
          const SizedBox(height: 24),
          Container(
            width: 600,
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              color: ManagerColors.surfaceCard,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: ManagerColors.borderSubtle),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                TextField(
                  controller: _nameController,
                  style: const TextStyle(color: ManagerColors.textPrimary),
                  decoration: InputDecoration(
                    labelText: 'Họ và tên hành khách',
                    labelStyle: const TextStyle(color: ManagerColors.textSecondary),
                    filled: true,
                    fillColor: ManagerColors.surfaceElevated,
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: BorderSide.none),
                  ),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: _phoneController,
                  style: const TextStyle(color: ManagerColors.textPrimary),
                  decoration: InputDecoration(
                    labelText: 'Số điện thoại',
                    labelStyle: const TextStyle(color: ManagerColors.textSecondary),
                    filled: true,
                    fillColor: ManagerColors.surfaceElevated,
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: BorderSide.none),
                  ),
                ),
                const SizedBox(height: 16),
                DropdownButtonFormField<String>(
                  value: _selectedSeat,
                  dropdownColor: ManagerColors.surfaceElevated,
                  style: const TextStyle(color: ManagerColors.textPrimary),
                  decoration: InputDecoration(
                    labelText: 'Chọn ghế trống',
                    labelStyle: const TextStyle(color: ManagerColors.textSecondary),
                    filled: true,
                    fillColor: ManagerColors.surfaceElevated,
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: BorderSide.none),
                  ),
                  items: const [
                    DropdownMenuItem(value: 'A01', child: Text('A01 · Tầng 1 (VIP) · 220.000 đ')),
                    DropdownMenuItem(value: 'A02', child: Text('A02 · Tầng 1 (VIP) · 220.000 đ')),
                    DropdownMenuItem(value: 'B01', child: Text('B01 · Tầng 2 (VIP) · 220.000 đ')),
                  ],
                  onChanged: (val) => setState(() => _selectedSeat = val ?? 'A01'),
                ),
                const SizedBox(height: 24),
                ElevatedButton(
                  onPressed: _handleCreateBooking,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: ManagerColors.cyanAccent,
                    foregroundColor: Colors.black,
                    padding: const EdgeInsets.symmetric(vertical: 16),
                  ),
                  child: const Text('XUẤT VÉ & GỬI SMS CHO KHÁCH', style: TextStyle(fontWeight: FontWeight.w700)),
                ),
                if (_isCreated) ...[
                  const SizedBox(height: 20),
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: ManagerColors.badgeGreenBg,
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: ManagerColors.emeraldSafe),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('XUẤT VÉ THÀNH CÔNG', style: TextStyle(color: ManagerColors.emeraldSafe, fontWeight: FontWeight.w800)),
                        const SizedBox(height: 6),
                        Text('Mã vé PNR: $_pnrResult | Ghế: $_selectedSeat | Giá: 220.000 đ', style: const TextStyle(color: ManagerColors.textPrimary)),
                      ],
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
}
