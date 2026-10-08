import 'package:flutter/material.dart';

import 'passenger_login_screen.dart';
import 'passenger_splash_screen.dart';
import 'passenger_store.dart';
import 'passenger_widgets.dart';

/// PAX-022: account, saved stops and support.
class PassengerProfileScreen extends StatelessWidget {
  const PassengerProfileScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final store = PassengerScope.of(context);
    return Column(children: [
      Container(
        color: PTokens.surface,
        width: double.infinity,
        child: SafeArea(bottom: false, child: Padding(padding: const EdgeInsets.fromLTRB(16, 20, 16, 14), child: Text('Cá nhân', style: sans(size: 22, weight: FontWeight.w700)))),
      ),
      const Divider(height: 1, color: PTokens.line),
      Expanded(
        child: ListView(padding: const EdgeInsets.all(16), children: [
          AppCard(
            child: Row(children: [
              CircleAvatar(radius: 24, backgroundColor: PTokens.primarySoft, child: Text(store.loggedIn ? 'NA' : '?', style: sans(size: 15, weight: FontWeight.w600, color: PTokens.primaryDark))),
              const SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(store.userName ?? 'Chưa đăng nhập', style: sans(size: 16, weight: FontWeight.w600)),
                  if (store.userPhone != null) Text(store.userPhone!, style: mono(size: 13, weight: FontWeight.w500, color: PTokens.muted)),
                ]),
              ),
            ]),
          ),
          gap(16),
          AppCard(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
            child: Column(children: [
              _row('Hành khách thường đi', '2'),
              const Divider(height: 1, color: Color(0xFFF1F5F9)),
              _row('Điểm đón đã lưu', 'Giáp Bát'),
              const Divider(height: 1, color: Color(0xFFF1F5F9)),
              _row('Tổng đài hỗ trợ', '1900 6868'),
            ]),
          ),
          gap(16),
          GhostButton(
            label: store.loggedIn ? 'Đăng xuất' : 'Đăng nhập',
            onPressed: () {
              if (store.loggedIn) {
                store.logout();
                Navigator.of(context).pushAndRemoveUntil(MaterialPageRoute(builder: (_) => const PassengerSplashScreen()), (_) => false);
              } else {
                Navigator.of(context).push(MaterialPageRoute(builder: (_) => const PassengerLoginScreen()));
              }
            },
          ),
        ]),
      ),
    ]);
  }

  Widget _row(String label, String value) => SizedBox(
        height: 48,
        child: Row(children: [Expanded(child: Text(label, style: sans(size: 15))), Text(value, style: sans(size: 14, color: PTokens.muted))]),
      );
}
