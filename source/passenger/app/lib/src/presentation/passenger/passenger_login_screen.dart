import 'dart:async';

import 'package:flutter/material.dart';

import 'passenger_main_shell.dart';
import 'passenger_store.dart';
import 'passenger_widgets.dart';

/// PAX-002 / PAX-003: phone number, then the 6-digit OTP. No test code is printed on screen (D101).
class PassengerLoginScreen extends StatelessWidget {
  const PassengerLoginScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: const TopBar(title: 'Đăng nhập'),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: OtpForm(
          intro: 'Nhập số điện thoại để nhận mã xác thực.',
          confirmLabel: 'Xác nhận',
          onVerified: (phone) {
            Navigator.of(context).pushAndRemoveUntil(MaterialPageRoute(builder: (_) => const PassengerMainShell()), (_) => false);
            showToast(context, 'Đã đăng nhập');
          },
        ),
      ),
    );
  }
}

/// Opens the phone and OTP sheet over the seat map (D106) and resolves true once logged in.
Future<bool> showLoginSheet(BuildContext context, {required String seats}) async {
  final ok = await showAppSheet<bool>(
    context,
    builder: (ctx) => OtpForm(
      title: 'Đăng nhập để giữ ghế $seats',
      intro: 'Vé sẽ gắn với số điện thoại này. Ghế bạn chọn vẫn được giữ nguyên trong lúc đăng nhập.',
      confirmLabel: 'Xác nhận và giữ ghế 10 phút',
      secondaryLabel: 'Để sau',
      onVerified: (phone) => Navigator.of(ctx).pop(true),
    ),
  );
  return ok ?? false;
}

class OtpForm extends StatefulWidget {
  const OtpForm({super.key, this.title, required this.intro, required this.confirmLabel, required this.onVerified, this.secondaryLabel});
  final String? title;
  final String intro;
  final String confirmLabel;
  final String? secondaryLabel;
  final void Function(String phone) onVerified;

  @override
  State<OtpForm> createState() => _OtpFormState();
}

class _OtpFormState extends State<OtpForm> {
  final _phone = TextEditingController();
  final _otp = TextEditingController();
  bool _codeSent = false;
  String? _error;
  int _resendIn = 0;
  Timer? _timer;

  @override
  void dispose() {
    _timer?.cancel();
    _phone.dispose();
    _otp.dispose();
    super.dispose();
  }

  bool _busy = false;

  Future<void> _submit() async {
    final store = PassengerScope.read(context);
    final phone = _phone.text.replaceAll(' ', '');
    if (!_codeSent) {
      if (!validPhone(phone)) {
        setState(() => _error = 'Số điện thoại cần 10 chữ số, bắt đầu bằng 0.');
        return;
      }
      setState(() => _busy = true);
      final error = await store.requestOtp(phone);
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = error;
        if (error != null) return;
        _codeSent = true;
        _resendIn = 60;
        // Development server: the code arrives in the response, filled in like an SMS autofill.
        if (store.devOtp != null) _otp.text = store.devOtp!;
      });
      if (error != null) return;
      _timer = Timer.periodic(const Duration(seconds: 1), (t) {
        if (!mounted) return;
        setState(() => _resendIn--);
        if (_resendIn <= 0) t.cancel();
      });
      return;
    }
    final code = _otp.text.trim();
    if (!RegExp(r'^\d{6}$').hasMatch(code)) {
      setState(() => _error = 'Mã chưa đúng. Kiểm tra tin nhắn và nhập lại.');
      return;
    }
    setState(() => _busy = true);
    final error = await store.verifyOtp(phone, code);
    if (!mounted) return;
    setState(() {
      _busy = false;
      _error = error;
    });
    if (error != null) return;
    _timer?.cancel();
    widget.onVerified(phone);
  }

  @override
  Widget build(BuildContext context) {
    final inSheet = widget.title != null;
    final form = Column(crossAxisAlignment: CrossAxisAlignment.stretch, mainAxisSize: MainAxisSize.min, children: [
      if (widget.title != null) ...[Text(widget.title!, style: sans(size: 18, weight: FontWeight.w700)), gap(6)],
      Text(widget.intro, style: sans(size: inSheet ? 14 : 15, color: inSheet ? PTokens.muted : PTokens.ink, height: 1.5)),
      gap(14),
      LabeledField(label: 'Số điện thoại', controller: _phone, keyboardType: TextInputType.phone, isMono: true, hint: '0912 345 678', errorText: !_codeSent ? _error : null),
      if (_codeSent) ...[
        gap(12),
        LabeledField(label: 'Mã 6 số đã gửi tới ${maskPhone(_phone.text.replaceAll(' ', ''))}', controller: _otp, keyboardType: TextInputType.number, isMono: true, maxLength: 6, autofocus: true, errorText: _error),
        gap(4),
        Align(
          alignment: Alignment.centerLeft,
          child: LinkButton(
            label: _resendIn > 0 ? 'Gửi lại mã sau $_resendIn giây' : 'Gửi lại mã',
            onPressed: _resendIn > 0 ? null : () => showToast(context, 'Đã gửi lại mã'),
          ),
        ),
      ],
      gap(14),
      PrimaryButton(label: _busy ? 'Đang gửi…' : (_codeSent ? widget.confirmLabel : 'Gửi mã'), onPressed: _busy ? null : _submit),
      if (widget.secondaryLabel != null) ...[gap(8), GhostButton(label: widget.secondaryLabel!, onPressed: () => Navigator.of(context).pop(false))],
    ]);
    return inSheet ? form : SingleChildScrollView(child: form);
  }
}
