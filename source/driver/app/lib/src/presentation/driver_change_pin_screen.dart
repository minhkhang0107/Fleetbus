import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'driver_store.dart';
import 'driver_widgets.dart';
import 'main_shell_screen.dart';

/// Screen for mandatory driver PIN change (DRI-001).
class DriverChangePinScreen extends StatefulWidget {
  const DriverChangePinScreen({super.key});

  @override
  State<DriverChangePinScreen> createState() => _DriverChangePinScreenState();
}

class _DriverChangePinScreenState extends State<DriverChangePinScreen> {
  final _currentPin = TextEditingController();
  final _newPin = TextEditingController();
  final _confirmPin = TextEditingController();
  String? _error;
  bool _busy = false;

  @override
  void dispose() {
    _currentPin.dispose();
    _newPin.dispose();
    _confirmPin.dispose();
    super.dispose();
  }

  String? _validate() {
    final current = _currentPin.text.trim();
    final next = _newPin.text.trim();
    final confirm = _confirmPin.text.trim();

    if (!RegExp(r'^\d{6}$').hasMatch(current)) {
      return 'Mã PIN tạm gồm đúng 6 chữ số';
    }
    if (!RegExp(r'^\d{6}$').hasMatch(next)) {
      return 'Mã PIN mới phải gồm đúng 6 chữ số';
    }
    if (next == current) {
      return 'Mã PIN mới không được trùng với mã PIN hiện tại';
    }
    final isAllSame = Set.from(next.split('')).length == 1;
    const runs = [
      '012345', '123456', '234567', '345678', '456789',
      '987654', '876543', '765432', '654321', '543210',
    ];
    if (isAllSame || next == '000000' || runs.contains(next)) {
      return 'Mã PIN mới quá yếu hoặc dễ đoán';
    }
    if (next != confirm) {
      return 'Hai mã PIN mới không khớp';
    }
    return null;
  }

  Future<void> _submit() async {
    final validation = _validate();
    if (validation != null) {
      setState(() => _error = validation);
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    final store = DriverScope.read(context);
    final error = await store.changePin(_currentPin.text.trim(), _newPin.text.trim());
    if (!mounted) return;
    if (error != null) {
      setState(() {
        _busy = false;
        _error = error;
      });
      return;
    }
    store.mustChangePin = false;
    await store.loadShift();
    if (!mounted) return;
    setState(() => _busy = false);
    Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => const MainShellScreen()));
    dToast(context, 'Đã đổi mã PIN');
  }

  Widget _buildField({
    required String label,
    required TextEditingController controller,
    required String hint,
    required TextInputAction action,
    void Function(String)? onSubmitted,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: dsans(size: 13, weight: FontWeight.w600, color: DTokens.sub)),
        const SizedBox(height: 6),
        TextField(
          controller: controller,
          obscureText: true,
          maxLength: 6,
          keyboardType: TextInputType.number,
          inputFormatters: [FilteringTextInputFormatter.digitsOnly],
          textInputAction: action,
          style: dmono(size: 18, weight: FontWeight.w600),
          decoration: InputDecoration(counterText: '', hintText: hint),
          onChanged: (_) {
            if (_error != null) setState(() => _error = null);
          },
          onSubmitted: onSubmitted,
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final wide = dWide(context);
    final formContent = Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Panel(
          child: Text(
            'Mã PIN tạm do nhà xe cấp chỉ dùng một lần. Đặt mã 6 số của riêng bạn, không dùng 123456 hay 6 số giống nhau.',
            style: dsans(size: 14, color: DTokens.sub, height: 1.5),
          ),
        ),
        const SizedBox(height: 20),
        _buildField(
          label: 'Mã PIN tạm',
          controller: _currentPin,
          hint: 'Nhập 6 số tạm',
          action: TextInputAction.next,
        ),
        const SizedBox(height: 16),
        _buildField(
          label: 'Mã PIN mới',
          controller: _newPin,
          hint: 'Nhập 6 số mới',
          action: TextInputAction.next,
        ),
        const SizedBox(height: 16),
        _buildField(
          label: 'Nhập lại mã PIN mới',
          controller: _confirmPin,
          hint: 'Nhập lại 6 số mới',
          action: TextInputAction.done,
          onSubmitted: (_) => _submit(),
        ),
        if (_error != null) ...[
          const SizedBox(height: 14),
          Panel(
            color: DTokens.dangerBg,
            border: const Color(0xFFEF4444),
            child: Text(_error!, style: dsans(size: 14, color: DTokens.dangerInk)),
          ),
        ],
        const SizedBox(height: 24),
        BigButton(
          label: _busy ? 'Đang lưu…' : 'Đổi mã PIN',
          height: wide ? 72 : 56,
          onPressed: _busy ? null : _submit,
        ),
      ],
    );

    return Scaffold(
      appBar: const DHeader(title: 'Đặt mã PIN mới'),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: EdgeInsets.all(wide ? 32 : 16),
          child: wide
              ? Center(
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 480),
                    child: formContent,
                  ),
                )
              : formContent,
        ),
      ),
    );
  }
}
