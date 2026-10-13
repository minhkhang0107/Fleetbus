import 'package:flutter/material.dart';

import 'driver_store.dart';
import 'driver_widgets.dart';
import 'main_shell_screen.dart';

/// DRI-001: staff id and 6-digit PIN. No GPS or device status before the shift starts (D101).
class DriverLoginScreen extends StatefulWidget {
  const DriverLoginScreen({super.key});

  @override
  State<DriverLoginScreen> createState() => _DriverLoginScreenState();
}

class _DriverLoginScreenState extends State<DriverLoginScreen> {
  final _operator = TextEditingController();
  final _id = TextEditingController(text: 'TX8821');
  final _pin = TextEditingController();
  String? _error;

  @override
  void initState() {
    super.initState();
    DriverStore.savedOperatorCode().then((code) {
      if (mounted && code.isNotEmpty) {
        setState(() => _operator.text = code);
      }
    });
  }

  @override
  void dispose() {
    _operator.dispose();
    _id.dispose();
    _pin.dispose();
    super.dispose();
  }

  bool _busy = false;

  Future<void> _submit() async {
    setState(() => _busy = true);
    final error = await DriverScope.read(context).login(_operator.text, _id.text, _pin.text);
    if (!mounted) return;
    setState(() => _busy = false);
    if (error != null) {
      setState(() => _error = error);
      return;
    }
    Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => const MainShellScreen()));
  }

  Widget _brand({bool large = false}) {
    final store = DriverScope.of(context);
    final subtitle = store.operatorName.isNotEmpty ? store.operatorName : 'Ứng dụng cho tài xế và phụ xe';
    return Row(children: [
      // D146: the BusGo Driver logo (tools/brand).
      Image.asset('assets/brand/logo.png', width: large ? 72 : 48, height: large ? 72 : 48),
      SizedBox(width: large ? 16 : 12),
      Flexible(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('BusGo Driver', style: dsans(size: large ? 30 : 20, weight: FontWeight.w700)),
          Text(subtitle, style: dsans(size: large ? 16 : 13, color: DTokens.muted)),
        ]),
      ),
    ]);
  }

  Widget _hotline() {
    final store = DriverScope.of(context);
    final number = store.operatorHotline.isNotEmpty ? store.operatorHotline : '1900 6868';
    return Text.rich(
      TextSpan(children: [
        TextSpan(text: 'Quên PIN? Gọi điều độ ', style: dsans(size: 13, color: DTokens.muted)),
        TextSpan(text: number, style: dmono(size: 13, weight: FontWeight.w600)),
      ]),
      textAlign: TextAlign.center,
    );
  }

  List<Widget> _fields() => [
        Text('MÃ NHÀ XE', style: dsans(size: 13, weight: FontWeight.w600, color: DTokens.sub)),
        const SizedBox(height: 6),
        TextField(controller: _operator, style: dmono(size: 18, weight: FontWeight.w600), decoration: const InputDecoration(hintText: 'Ví dụ SAOMAI'), textCapitalization: TextCapitalization.characters),
        const SizedBox(height: 18),
        Text('MÃ NHÂN VIÊN HOẶC SỐ ĐIỆN THOẠI', style: dsans(size: 13, weight: FontWeight.w600, color: DTokens.sub)),
        const SizedBox(height: 6),
        TextField(controller: _id, style: dmono(size: 18, weight: FontWeight.w600)),
        const SizedBox(height: 18),
        Text('MÃ PIN 6 SỐ', style: dsans(size: 13, weight: FontWeight.w600, color: DTokens.sub)),
        const SizedBox(height: 6),
        TextField(
          controller: _pin,
          obscureText: true,
          maxLength: 6,
          keyboardType: TextInputType.number,
          style: dmono(size: 18, weight: FontWeight.w600),
          decoration: InputDecoration(counterText: '', errorText: _error, hintText: 'Nhập 6 số'),
          onChanged: (_) {
            if (_error != null) setState(() => _error = null);
          },
          onSubmitted: (_) => _submit(),
        ),
      ];

  Widget _submitButton() => BigButton(label: _busy ? 'Đang vào ca…' : 'Vào ca', height: 72, onPressed: _busy ? null : _submit);

  @override
  Widget build(BuildContext context) {
    if (dWide(context)) {
      // Tablet: brand on the left, a 440 dp form on the right with the button right under the PIN.
      return Scaffold(
        body: SafeArea(
          child: Row(children: [
            Expanded(
              child: Container(
                color: DTokens.panel2,
                padding: const EdgeInsets.all(48),
                child: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.start, children: [
                  _brand(large: true),
                  const SizedBox(height: 24),
                  Text('Vào ca bằng mã nhân viên và mã PIN do nhà xe cấp.', style: dsans(size: 16, color: DTokens.sub, height: 1.5)),
                ]),
              ),
            ),
            Expanded(
              child: Center(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.all(32),
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 440),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                      ..._fields(),
                      const SizedBox(height: 24),
                      _submitButton(),
                      const SizedBox(height: 12),
                      _hotline(),
                    ]),
                  ),
                ),
              ),
            ),
          ]),
        ),
      );
    }
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 32, 16, 24),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            _brand(),
            const SizedBox(height: 28),
            ..._fields(),
            const Spacer(),
            _submitButton(),
            const SizedBox(height: 10),
            _hotline(),
          ]),
        ),
      ),
    );
  }
}
