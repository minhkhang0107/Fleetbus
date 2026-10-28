import 'package:flutter/material.dart';

import 'passenger_about_screen.dart';
import 'passenger_login_screen.dart';
import 'passenger_onboarding_screen.dart';
import 'passenger_splash_screen.dart';
import 'passenger_store.dart';
import 'passenger_widgets.dart';

/// PAX-022: account, saved stops and support.
class PassengerProfileScreen extends StatelessWidget {
  const PassengerProfileScreen({super.key});

  static String _initials(String name) {
    final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
    if (parts.isEmpty) return '';
    if (parts.length == 1) return parts.first.substring(0, 1).toUpperCase();
    return '${parts.first[0]}${parts.last[0]}'.toUpperCase();
  }

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
        child: PMaxWidth(maxWidth: 720, child: ListView(padding: const EdgeInsets.all(16), children: [
          AppCard(
            child: Row(children: [
              CircleAvatar(
                radius: 24,
                backgroundColor: PTokens.primarySoft,
                child: !store.loggedIn
                    ? Text('?', style: sans(size: 15, weight: FontWeight.w600, color: PTokens.primaryDark))
                    : (store.userName != null && store.userName!.trim().isNotEmpty
                        ? Text(_initials(store.userName!), style: sans(size: 15, weight: FontWeight.w600, color: PTokens.primaryDark))
                        : const Icon(Icons.person, color: PTokens.primaryDark, size: 24)),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(
                    !store.loggedIn
                        ? 'Chưa đăng nhập'
                        : (store.userName ?? 'Khách BusGo'),
                    style: sans(size: 16, weight: FontWeight.w600),
                  ),
                  if (store.userPhone != null) Text(store.userPhone!, style: mono(size: 13, weight: FontWeight.w500, color: PTokens.muted)),
                  if (store.isVip) ...[
                    gap(4),
                    const Pill('Tài khoản VIP · mọi vé 0 đ', PillKind.ok),
                  ],
                ]),
              ),
            ]),
          ),
          gap(16),
          if (store.operator != null) ...[
            AppCard(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('Nhà xe', style: sans(size: 13, color: PTokens.muted)),
                gap(4),
                Text(store.operator!.name, style: sans(size: 15, weight: FontWeight.w600)),
                if (store.operator!.hotline.isNotEmpty)
                  GestureDetector(
                    onTap: () => callHotline(context, store.operator!.hotline),
                    child: Text('Tổng đài ${store.operator!.hotline}', style: sans(size: 14, color: PTokens.muted)),
                  ),
                if (store.operator!.supportEmail.isNotEmpty) Text('Email ${store.operator!.supportEmail}', style: sans(size: 14, color: PTokens.muted)),
                if (store.operator!.address.isNotEmpty) Text(store.operator!.address, style: sans(size: 14, color: PTokens.muted)),
              ]),
            ),
            gap(16),
            GhostButton(
              label: 'Đổi nhà xe',
              onPressed: () {
                store.changeOperator();
                Navigator.of(context).pushAndRemoveUntil(MaterialPageRoute(builder: (_) => const PassengerSplashScreen()), (_) => false);
              },
            ),
            gap(16),
          ],
          // D146: the feature pages again, any time.
          GhostButton(
            label: 'Xem giới thiệu tính năng',
            onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const PassengerOnboardingScreen(replay: true))),
          ),
          gap(16),
          // SH-006: terms of use and licences (D157).
          GhostButton(
            label: 'Giới thiệu và điều khoản',
            onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const PassengerAboutScreen())),
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
        ])),
      ),
    ]);
  }
}
