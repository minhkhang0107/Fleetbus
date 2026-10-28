import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'passenger_main_shell.dart';
import 'passenger_store.dart';
import 'passenger_widgets.dart';

/// PAX-002 / PAX-003: phone number, then the 6-digit OTP. No test code is printed on screen (D101).
class PassengerLoginScreen extends StatelessWidget {
  const PassengerLoginScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final op = PassengerScope.of(context).operator;
    final title = op != null ? 'Đăng nhập · ${op.shortName}' : 'Đăng nhập';
    final intro = op != null ? 'Nhập số điện thoại để đăng nhập vào ${op.name}.' : 'Nhập số điện thoại để nhận mã xác thực.';
    
    return Scaffold(
      appBar: TopBar(title: title),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: PMaxWidth(maxWidth: 480, child: OtpForm(
          intro: intro,
          confirmLabel: 'Xác nhận',
          onVerified: (phone) {
            Navigator.of(context).pushAndRemoveUntil(MaterialPageRoute(builder: (_) => const PassengerMainShell()), (_) => false);
            showToast(context, 'Đã đăng nhập');
          },
        )),
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

  void _startTimer() {
    _timer?.cancel();
    _timer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted) return;
      setState(() {
        _resendIn--;
        if (_resendIn <= 0) t.cancel();
      });
    });
  }

  Future<void> _resendOtp() async {
    if (_busy || _resendIn > 0) return;
    final store = PassengerScope.read(context);
    final phone = normalizePhone(_phone.text);
    setState(() {
      _busy = true;
      _error = null;
    });
    final error = await store.requestOtp(phone);
    if (!mounted) return;
    setState(() {
      _busy = false;
      if (error != null) {
        _error = error;
        if (store.lastRemainingCooldown != null && store.lastRemainingCooldown! > 0) {
          _resendIn = store.lastRemainingCooldown!;
          _startTimer();
        }
        return;
      }
      _resendIn = store.otpCooldownSeconds;
      if (store.devOtp != null) _otp.text = store.devOtp!;
    });
    if (error != null) return;
    _startTimer();
    showToast(context, 'Đã gửi lại mã');
  }

  Future<void> _submit() async {
    final store = PassengerScope.read(context);
    if (!_codeSent) {
      if (!validPhone(_phone.text)) {
        setState(() => _error = 'Số điện thoại không hợp lệ (VD: 0912 345 678)');
        return;
      }
      final phone = normalizePhone(_phone.text);
      setState(() => _busy = true);
      final error = await store.requestOtp(phone);
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = error;
        if (error != null) {
          if (store.lastRemainingCooldown != null && store.lastRemainingCooldown! > 0) {
            _codeSent = true;
            _resendIn = store.lastRemainingCooldown!;
            _startTimer();
          }
          return;
        }
        _codeSent = true;
        _resendIn = store.otpCooldownSeconds;
        // Development server: the code arrives in the response, filled in like an SMS autofill.
        if (store.devOtp != null) _otp.text = store.devOtp!;
      });
      if (error != null) return;
      _startTimer();
      return;
    }
    final code = _otp.text.trim();
    if (!RegExp(r'^\d{6}$').hasMatch(code)) {
      setState(() => _error = 'Mã chưa đúng. Kiểm tra tin nhắn và nhập lại.');
      return;
    }
    final phone = normalizePhone(_phone.text);
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
      LabeledField(
        label: 'Số điện thoại',
        controller: _phone,
        keyboardType: TextInputType.phone,
        isMono: true,
        hint: '0912 345 678',
        errorText: !_codeSent ? _error : null,
        maxLength: 15,
        inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[\d\s+.-]'))],
        autofillHints: const [AutofillHints.telephoneNumber],
      ),
      if (_codeSent) ...[
        gap(12),
        LabeledField(
          label: 'Mã 6 số đã gửi tới ${maskPhone(normalizePhone(_phone.text))}',
          controller: _otp,
          keyboardType: TextInputType.number,
          isMono: true,
          maxLength: 6,
          autofocus: true,
          errorText: _error,
          inputFormatters: [FilteringTextInputFormatter.digitsOnly],
        ),
        gap(4),
        Align(
          alignment: Alignment.centerLeft,
          child: LinkButton(
            label: _resendIn > 0 ? 'Gửi lại mã sau ${_resendIn}s' : 'Gửi lại mã',
            onPressed: (_resendIn > 0 || _busy) ? null : _resendOtp,
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
