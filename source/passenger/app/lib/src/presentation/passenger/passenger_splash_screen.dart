import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'passenger_login_screen.dart';
import 'passenger_main_shell.dart';
import 'passenger_store.dart';
import 'passenger_widgets.dart';

/// PAX-001: welcome. Browsing needs no account; holding seats asks for one (D106).
class PassengerSplashScreen extends StatefulWidget {
  const PassengerSplashScreen({super.key});

  @override
  State<PassengerSplashScreen> createState() => _PassengerSplashScreenState();
}

class _PassengerSplashScreenState extends State<PassengerSplashScreen> {
  final _codeController = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _codeController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final code = _codeController.text.trim();
    if (code.isEmpty) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    final store = PassengerScope.read(context);
    final err = await store.selectOperator(code);
    if (!mounted) return;
    setState(() {
      _busy = false;
      _error = err;
    });
  }

  @override
  Widget build(BuildContext context) {
    final store = PassengerScope.of(context);
    final op = store.operator;
    
    return Scaffold(
      backgroundColor: PTokens.surface,
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, constraints) => SingleChildScrollView(
            child: Center(
              child: ConstrainedBox(
                constraints: BoxConstraints(minHeight: constraints.maxHeight, maxWidth: 480),
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 24, 16, 16),
                  child: IntrinsicHeight(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Expanded(
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Image.asset('assets/brand/logo.png', width: 80, height: 80),
                              gap(16),
                              Text(op?.name ?? 'BusGo', style: sans(size: 32, weight: FontWeight.w700), textAlign: TextAlign.center),
                              gap(8),
                              Text(
                                op != null ? 'Đặt vé, giữ ghế 10 phút, theo dõi xe trên đường.' : 'Ứng dụng đặt vé của nhà xe',
                                textAlign: TextAlign.center,
                                style: sans(size: 15, color: PTokens.muted, height: 1.5),
                              ),
                              if (op != null && op.hotline.isNotEmpty) ...[
                                gap(8),
                                Text('Tổng đài ${op.hotline}', style: sans(size: 15, color: PTokens.muted)),
                              ],
                            ],
                          ),
                        ),
                        if (op == null) ...[
                          LabeledField(
                            label: 'Mã nhà xe',
                            controller: _codeController,
                            hint: 'Ví dụ SAOMAI',
                            maxLength: 20,
                            textCapitalization: TextCapitalization.characters,
                            inputFormatters: [
                              FilteringTextInputFormatter.allow(RegExp(r'[a-zA-Z0-9]')),
                              TextInputFormatter.withFunction((oldValue, newValue) =>
                                newValue.copyWith(text: newValue.text.toUpperCase()),
                              ),
                            ],
                            textInputAction: TextInputAction.done,
                            onSubmitted: (_) => _submit(),
                          ),
                          if (_error != null) ...[
                            gap(8),
                            Text(_error!, style: sans(size: 13, color: PTokens.danger)),
                          ],
                          gap(16),
                          PrimaryButton(
                            label: _busy ? 'Đang kiểm tra…' : 'Tiếp tục',
                            onPressed: _busy ? () {} : _submit,
                          ),
                        ] else ...[
                          PrimaryButton(
                            label: 'Đăng nhập bằng số điện thoại',
                            onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const PassengerLoginScreen())),
                          ),
                          gap(8),
                          GhostButton(
                            label: 'Xem chuyến, đăng nhập sau',
                            onPressed: () => Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => const PassengerMainShell())),
                          ),
                          gap(8),
                          LinkButton(
                            label: 'Đổi nhà xe',
                            onPressed: () {
                              _codeController.clear();
                              _error = null;
                              store.changeOperator();
                            },
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
