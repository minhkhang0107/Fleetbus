import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'passenger_main_shell.dart';
import 'passenger_payment_processing_screen.dart';
import 'passenger_store.dart';
import 'passenger_widgets.dart';

/// PAX-011 / PAX-012: passenger, voucher, optional insurance (off by default, BR-CHECKOUT-003)
/// and payment method selection (VietQR transfer or cash on board when the operator allows it).
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
    if (_voucher.text.isEmpty && store.voucher != null) _voucher.text = store.voucher!;
  }

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    _voucher.dispose();
    super.dispose();
  }

  bool _checkingVoucher = false;

  Future<void> _applyVoucher(PassengerStore store) async {
    if (store.voucher != null) {
      store.removeVoucher();
      setState(() {
        _voucher.clear();
        _voucherMessage = null;
      });
      return;
    }
    setState(() => _checkingVoucher = true);
    final error = await store.applyVoucher(_voucher.text);
    if (!mounted) return;
    setState(() {
      _checkingVoucher = false;
      _voucherOk = error == null;
      _voucherMessage = error ?? 'Đã áp dụng: giảm ${vnd(store.discount)}';
    });
  }

  bool _creating = false;

  Future<void> _pay(PassengerStore store) async {
    setState(() {
      _nameError = nameError(_name.text);
      _phoneError = validPhone(_phone.text) ? null : 'Số điện thoại không hợp lệ (VD: 0912 345 678)';
    });
    if (_nameError != null || _phoneError != null) return;
    final normalizedName = normalizeName(_name.text);
    final normalizedPhone = normalizePhone(_phone.text);
    setState(() => _creating = true);
    final error = await store.createOrder(normalizedName, normalizedPhone);
    if (!mounted) return;
    setState(() => _creating = false);
    if (error != null) {
      // The server dropped a code that no longer applies: show it next to the field.
      if (store.voucher == null && _voucherOk) {
        setState(() {
          _voucherOk = false;
          _voucherMessage = error;
        });
      }
      showToast(context, error);
      return;
    }
    if (store.payByCash) {
      showToast(context, 'Đặt vé thành công. Bạn thanh toán tiền mặt cho tài xế khi lên xe.');
      PassengerMainShell.openTab(context, 1);
      return;
    }
    Navigator.of(context).push(MaterialPageRoute(
      settings: const RouteSettings(name: 'vietqr'),
      builder: (_) => PassengerPaymentProcessingScreen(name: normalizedName, phone: normalizedPhone),
    ));
  }

  @override
  Widget build(BuildContext context) {
    final store = PassengerScope.of(context);
    final p = store.stop(store.pickup);
    final d = store.stop(store.dropoff);
    final n = store.seats.length;
    final canPayCash = store.operator?.allowCash != false && store.total > 0;
    // Nothing to transfer for a 0 đ order, so it is always shown as settled by transfer.
    final canPayTransfer = store.operator?.allowTransfer != false || store.total <= 0;
    return Scaffold(
      appBar: const TopBar(title: 'Xác nhận đặt vé'),
      body: Column(children: [
        const HoldBanner(),
        Expanded(
          child: PSplit(leftFlex: 3, rightFlex: 2, left: [
            AppCard(
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Row(children: [
                  Expanded(child: Text('${store.originPlace.city} → ${store.destPlace.city}', style: sans(size: 15, weight: FontWeight.w600))),
                  Text('Ghế ${store.seats.join(', ')}', style: mono(size: 14)),
                ]),
                gap(6),
                Text('${TravelDate.of(store.trip!.day.isEmpty ? store.date : store.trip!.day).long} · Đón ${store.homePickup != null ? 'tận nhà: ${store.homePickup!.address}' : '${p.estimated ? 'khoảng ' : ''}${p.time} ${p.short}'} · Trả ${store.homeDropoff != null ? 'tận nhà: ${store.homeDropoff!.address}' : '${d.estimated ? 'khoảng ' : ''}${d.time} ${d.short}'}', style: sans(size: 13, color: PTokens.muted)),
              ]),
            ),
            gap(16),
            Text('Người đi', style: sans(size: 15, weight: FontWeight.w600)),
            gap(10),
            LabeledField(
              label: 'Họ và tên',
              controller: _name,
              errorText: _nameError,
              maxLength: 60,
              textCapitalization: TextCapitalization.words,
              autofillHints: const [AutofillHints.name],
              textInputAction: TextInputAction.next,
            ),
            gap(10),
            LabeledField(
              label: 'Số điện thoại nhận vé',
              controller: _phone,
              keyboardType: TextInputType.phone,
              isMono: true,
              errorText: _phoneError,
              maxLength: 15,
              inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[\d\s+.-]'))],
              autofillHints: const [AutofillHints.telephoneNumber],
            ),
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
              SizedBox(width: 120, child: GhostButton(label: store.voucher == null ? (_checkingVoucher ? 'Đang kiểm tra' : 'Áp dụng') : 'Bỏ mã', onPressed: _checkingVoucher ? null : () => _applyVoucher(store))),
            ]),
            if (_voucherMessage != null) ...[gap(6), Text(_voucherMessage!, style: sans(size: 13, weight: FontWeight.w500, color: _voucherOk ? PTokens.success : PTokens.danger))],
          ], right: [
            if (!pWide(context)) gap(16),
            if (store.insuranceEnabled) ...[
              AppCard(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                // Its own Material so the tile ripple shows above the card colour.
                child: Material(
                  color: Colors.transparent,
                  child: SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    value: store.insured,
                    onChanged: store.setInsured,
                    title: Text('Bảo hiểm chuyến đi', style: sans(size: 14, weight: FontWeight.w600)),
                    subtitle: Text('Không bắt buộc · 10.000 đ mỗi ghế', style: sans(size: 12, color: PTokens.muted)),
                  ),
                ),
              ),
              gap(16),
            ],
            _line('Giá vé ($n ghế)', vnd(store.baseFare)),
            if (store.insuranceEnabled && store.insured) _line('Bảo hiểm', vnd(store.insuranceFee)),
            if (store.homePickup != null) _line('Phụ phí đón tận nhà', vnd(store.feeOf(store.homePickup!.feeVnd))),
            if (store.homeDropoff != null) _line('Phụ phí trả tận nhà', vnd(store.feeOf(store.homeDropoff!.feeVnd))),
            // D130: disclosed before the transfer, never shown as confirmed while the company has not answered.
            if ((store.homePickup?.needsReview ?? false) || (store.homeDropoff?.needsReview ?? false))
              Container(
                width: double.infinity,
                margin: const EdgeInsets.only(top: 8),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(color: PTokens.warnSoft, borderRadius: BorderRadius.circular(PTokens.radiusControl)),
                child: Text(
                  'Địa chỉ ${(store.homePickup?.needsReview ?? false) ? 'đón' : 'trả'} tận nhà cần nhà xe duyệt sau khi bạn thanh toán. Khi chưa duyệt, bạn ${(store.homePickup?.needsReview ?? false) ? 'lên xe tại ${store.stop(store.pickup).name}' : 'xuống xe tại ${store.stop(store.dropoff).name}'}. Nếu nhà xe không nhận, phụ phí được hoàn và bạn được hủy vé không mất phí.',
                  style: sans(size: 13, weight: FontWeight.w600, color: PTokens.warnInk, height: 1.4),
                ),
              ),
            if (store.discount > 0) _line('Mã ${store.voucher}', '−${vnd(store.discount)}', color: PTokens.success),
            const Divider(height: 20, color: PTokens.line),
            if (canPayCash && canPayTransfer) ...[
              Text('Thanh toán qua', style: sans(size: 14, weight: FontWeight.w600)),
              gap(8),
              _PaymentOption(
                icon: Icons.qr_code_2,
                title: 'VietQR chuyển khoản',
                selected: !store.payByCash,
                onTap: () => store.setPaymentMethod('VIETQR_NAPAS247'),
              ),
              gap(8),
              _PaymentOption(
                icon: Icons.payments_outlined,
                title: 'Tiền mặt khi lên xe',
                subtitle: 'Trả tiền mặt cho tài xế khi lên xe',
                selected: store.payByCash,
                onTap: () => store.setPaymentMethod('CASH'),
              ),
            ] else
              Row(children: [
                Text('Thanh toán qua', style: sans(size: 14, weight: FontWeight.w600)),
                const Spacer(),
                Icon(canPayTransfer ? Icons.qr_code_2 : Icons.payments_outlined, size: 18, color: PTokens.primary),
                const SizedBox(width: 6),
                Flexible(child: Text(canPayTransfer ? 'VietQR chuyển khoản' : 'Tiền mặt khi lên xe', textAlign: TextAlign.end, style: sans(size: 14, weight: FontWeight.w600))),
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
        PrimaryButton(
          label: _creating ? 'Đang tạo đơn…' : (canPayCash && (store.payByCash || !canPayTransfer) ? 'Xác nhận đặt vé' : 'Tạo mã thanh toán'),
          onPressed: _creating ? null : () => _pay(store),
        ),
      ]),
    );
  }

  Widget _line(String label, String value, {Color color = PTokens.ink}) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 3),
        child: Row(children: [
          Expanded(child: Text(label, style: sans(size: 14, color: PTokens.muted))),
          const SizedBox(width: 8),
          Text(value, style: mono(size: 14, weight: FontWeight.w500, color: color)),
        ]),
      );
}

class _PaymentOption extends StatelessWidget {
  const _PaymentOption({required this.icon, required this.title, this.subtitle, required this.selected, required this.onTap});
  final IconData icon;
  final String title;
  final String? subtitle;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      selected: selected,
      inMutuallyExclusiveGroup: true,
      button: true,
      child: Material(
        color: selected ? PTokens.primarySoft : PTokens.surface,
        borderRadius: BorderRadius.circular(PTokens.radiusControl),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(PTokens.radiusControl),
          child: Container(
            constraints: const BoxConstraints(minHeight: 48),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(PTokens.radiusControl),
              border: Border.all(color: selected ? PTokens.primary : PTokens.line),
            ),
            child: Row(children: [
              Icon(selected ? Icons.radio_button_checked : Icons.radio_button_unchecked, size: 20, color: selected ? PTokens.primary : PTokens.muted),
              const SizedBox(width: 10),
              Icon(icon, size: 18, color: selected ? PTokens.primary : PTokens.muted),
              const SizedBox(width: 8),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(title, style: sans(size: 14, weight: FontWeight.w600)),
                  if (subtitle != null) Text(subtitle!, style: sans(size: 12, color: PTokens.muted)),
                ]),
              ),
            ]),
          ),
        ),
      ),
    );
  }
}
