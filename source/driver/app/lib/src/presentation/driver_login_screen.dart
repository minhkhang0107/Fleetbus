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
  final _id = TextEditingController(text: 'TX8821');
  final _pin = TextEditingController();
  String? _error;

  @override
  void dispose() {
    _id.dispose();
    _pin.dispose();
    super.dispose();
  }

  bool _busy = false;

  Future<void> _submit() async {
    setState(() => _busy = true);
    final error = await DriverScope.read(context).login(_id.text, _pin.text);
    if (!mounted) return;
    setState(() => _busy = false);
    if (error != null) {
      setState(() => _error = error);
      return;
    }
    Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => const MainShellScreen()));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 32, 16, 24),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Row(children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(color: DTokens.primary, borderRadius: BorderRadius.circular(12)),
                child: const Icon(Icons.directions_bus_outlined, color: Colors.white, size: 26),
              ),
              const SizedBox(width: 12),
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('BusGo Driver', style: dsans(size: 20, weight: FontWeight.w700)),
                Text('Ứng dụng cho tài xế và phụ xe', style: dsans(size: 13, color: DTokens.muted)),
              ]),
            ]),
            const SizedBox(height: 28),
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
              decoration: InputDecoration(counterText: '', errorText: _error, hintText: '••••••'),
              onSubmitted: (_) => _submit(),
            ),
            const Spacer(),
            BigButton(label: _busy ? 'Đang vào ca…' : 'Vào ca', height: 72, onPressed: _busy ? null : _submit),
            const SizedBox(height: 10),
            Text.rich(
              TextSpan(children: [
                TextSpan(text: 'Quên PIN? Gọi điều độ ', style: dsans(size: 13, color: DTokens.muted)),
                TextSpan(text: '1900 6868', style: dmono(size: 13, weight: FontWeight.w600)),
              ]),
              textAlign: TextAlign.center,
            ),
          ]),
        ),
      ),
    );
  }
}
