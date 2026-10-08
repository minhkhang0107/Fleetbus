import 'package:flutter/material.dart';

import 'passenger_payment_processing_screen.dart';
import 'passenger_store.dart';
import 'passenger_widgets.dart';

/// PAX-011 / PAX-012: passenger, voucher, optional insurance (off by default, BR-CHECKOUT-003)
/// and VietQR as the only method of this version (BR-CHECKOUT-004).
class PassengerCheckoutScreen extends StatefulWidget {
  const PassengerCheckoutScreen({super.key});

  @override
  State<PassengerCheckoutScreen> createState() => _PassengerCheckoutScreenState();
}

class _PassengerCheckoutScreenState extends State<PassengerCheckoutScreen> {
  final _name = TextEditingController();
  final _phone = TextEditingController();
  final _voucher = TextEditingController();
  String? _nameError;
  String? _phoneError;
  String? _voucherMessage;
  bool _voucherOk = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final store = PassengerScope.read(context);
    if (_name.text.isEmpty && store.userName != null) _name.text = store.userName!;
    if (_phone.text.isEmpty && store.userPhone != null) _phone.text = store.userPhone!;
  }

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    _voucher.dispose();
    super.dispose();
  }

  void _applyVoucher(PassengerStore store) {
    if (store.voucher != null) {
      store.removeVoucher();
      setState(() {
        _voucher.clear();
        _voucherMessage = null;
      });
      return;
    }
    final error = store.applyVoucher(_voucher.text);
    setState(() {
      _voucherOk = error == null;
      _voucherMessage = error ?? 'Đã áp dụng: giảm ${vnd(PassengerStore.knownVouchers[store.voucher]!)}';
    });
  }

  bool _creating = false;

  Future<void> _pay(PassengerStore store) async {
    setState(() {
      _nameError = _name.text.trim().length < 2 ? 'Nhập họ và tên người đi.' : null;
      _phoneError = validPhone(_phone.text) ? null : 'Số điện thoại cần 10 chữ số, bắt đầu bằng 0.';
    });
    if (_nameError != null || _phoneError != null) return;
    setState(() => _creating = true);
    final error = await store.createOrder(_name.text.trim(), _phone.text.replaceAll(' ', ''));
    if (!mounted) return;
    setState(() => _creating = false);
    if (error != null) {
      showToast(context, error);
      return;
    }
    Navigator.of(context).push(MaterialPageRoute(
      settings: const RouteSettings(name: 'vietqr'),
      builder: (_) => PassengerPaymentProcessingScreen(name: _name.text.trim(), phone: _phone.text.replaceAll(' ', '')),
    ));
  }

  @override
  Widget build(BuildContext context) {
    final store = PassengerScope.of(context);
    final p = store.stop(store.pickup);
    final d = store.stop(store.dropoff);
    final n = store.seats.length;
    return Scaffold(
      appBar: const TopBar(title: 'Xác nhận đặt vé'),
      body: Column(children: [
        const HoldBanner(),
        Expanded(
          child: ListView(padding: const EdgeInsets.all(16), children: [
            AppCard(
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Row(children: [
                  Expanded(child: Text('${store.originPlace.city} → ${store.destPlace.city}', style: sans(size: 15, weight: FontWeight.w600))),
                  Text('Ghế ${store.seats.join(', ')}', style: mono(size: 14)),
                ]),
                gap(6),
                Text('${store.travelDate.short.replaceAll(' · ', ' ')} · Đón ${p.time} ${p.short} · Trả ${d.time} ${d.short}', style: sans(size: 13, color: PTokens.muted)),
              ]),
            ),
            gap(16),
            Text('Người đi', style: sans(size: 15, weight: FontWeight.w600)),
            gap(10),
            LabeledField(label: 'Họ và tên', controller: _name, errorText: _nameError),
            gap(10),
            LabeledField(label: 'Số điện thoại nhận vé', controller: _phone, keyboardType: TextInputType.phone, isMono: true, errorText: _phoneError),
            gap(16),
            Text('Mã giảm giá', style: sans(size: 15, weight: FontWeight.w600)),
            gap(8),
            Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Expanded(
                child: TextField(
                  controller: _voucher,
                  enabled: store.voucher == null,
                  textCapitalization: TextCapitalization.characters,
                  style: mono(size: 15),
                  decoration: const InputDecoration(hintText: 'Nhập mã'),
                ),
              ),
              const SizedBox(width: 8),
              SizedBox(width: 120, child: GhostButton(label: store.voucher == null ? 'Áp dụng' : 'Bỏ mã', onPressed: () => _applyVoucher(store))),
            ]),
            if (_voucherMessage != null) ...[gap(6), Text(_voucherMessage!, style: sans(size: 13, weight: FontWeight.w500, color: _voucherOk ? PTokens.success : PTokens.danger))],
            gap(16),
            AppCard(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
              child: SwitchListTile(
                contentPadding: EdgeInsets.zero,
                value: store.insured,
                onChanged: store.setInsured,
                title: Text('Bảo hiểm chuyến đi', style: sans(size: 14, weight: FontWeight.w600)),
                subtitle: Text('Không bắt buộc · 10.000 đ mỗi ghế', style: sans(size: 12, color: PTokens.muted)),
              ),
            ),
            gap(16),
            _line('Giá vé ($n ghế)', vnd(store.baseFare)),
            if (store.insuranceFee > 0) _line('Bảo hiểm', vnd(store.insuranceFee)),
            if (store.discount > 0) _line('Mã ${store.voucher}', '−${vnd(store.discount)}', color: PTokens.success),
            const Divider(height: 20, color: PTokens.line),
            Row(children: [
              Text('Thanh toán qua', style: sans(size: 14, weight: FontWeight.w600)),
              const Spacer(),
              const Icon(Icons.qr_code_2, size: 18, color: PTokens.primary),
              const SizedBox(width: 6),
              Text('VietQR chuyển khoản', style: sans(size: 14, weight: FontWeight.w600)),
            ]),
          ]),
        ),
      ]),
      bottomNavigationBar: BottomAction(children: [
        Expanded(
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Tổng thanh toán', style: sans(size: 12, color: PTokens.muted)),
            Text(vnd(store.total), style: mono(size: 19, weight: FontWeight.w700)),
          ]),
        ),
        PrimaryButton(label: _creating ? 'Đang tạo đơn…' : 'Tạo mã thanh toán', onPressed: _creating ? null : () => _pay(store)),
      ]),
    );
  }

  Widget _line(String label, String value, {Color color = PTokens.ink}) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 3),
        child: Row(children: [Text(label, style: sans(size: 14, color: PTokens.muted)), const Spacer(), Text(value, style: mono(size: 14, weight: FontWeight.w500, color: color))]),
      );
}
