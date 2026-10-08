import 'package:flutter/material.dart';

import 'passenger_login_screen.dart';
import 'passenger_main_shell.dart';
import 'passenger_widgets.dart';

/// PAX-001: welcome. Browsing needs no account; holding seats asks for one (D106).
class PassengerSplashScreen extends StatelessWidget {
  const PassengerSplashScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: PTokens.surface,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 24, 16, 16),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Expanded(
              child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                Container(
                  width: 72,
                  height: 72,
                  decoration: BoxDecoration(color: PTokens.primary, borderRadius: BorderRadius.circular(18)),
                  child: const Icon(Icons.directions_bus_outlined, color: Colors.white, size: 36),
                ),
                gap(16),
                Text('BusGo', style: sans(size: 32, weight: FontWeight.w700)),
                gap(8),
                Text('Đặt vé xe liên tỉnh, giữ ghế 10 phút, theo dõi xe trên đường.', textAlign: TextAlign.center, style: sans(size: 15, color: PTokens.muted, height: 1.5)),
              ]),
            ),
            PrimaryButton(
              label: 'Đăng nhập bằng số điện thoại',
              onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const PassengerLoginScreen())),
            ),
            gap(8),
            GhostButton(
              label: 'Xem chuyến, đăng nhập sau',
              onPressed: () => Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => const PassengerMainShell())),
            ),
          ]),
        ),
      ),
    );
  }
}
