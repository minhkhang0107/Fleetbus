import 'package:flutter/material.dart';

import 'passenger_home_screen.dart';
import 'passenger_notifications_screen.dart';
import 'passenger_profile_screen.dart';
import 'passenger_store.dart';
import 'passenger_wallet_screen.dart';
import 'passenger_widgets.dart';

/// The four tab roots. The tab bar shows only here, never inside the booking funnel (D96).
class PassengerMainShell extends StatefulWidget {
  const PassengerMainShell({super.key, this.initialTab = 0});
  final int initialTab;

  static void openTab(BuildContext context, int tab) {
    Navigator.of(context).pushAndRemoveUntil(MaterialPageRoute(builder: (_) => PassengerMainShell(initialTab: tab)), (_) => false);
  }

  @override
  State<PassengerMainShell> createState() => _PassengerMainShellState();
}

class _PassengerMainShellState extends State<PassengerMainShell> {
  late int _index = widget.initialTab;

  @override
  Widget build(BuildContext context) {
    final store = PassengerScope.of(context);
    const pages = [PassengerHomeScreen(), PassengerWalletScreen(), PassengerNotificationsScreen(), PassengerProfileScreen()];
    if (pWide(context)) {
      // Wide screens: the tabs move to a rail on the left.
      return Scaffold(
        body: Row(children: [
          Container(
            width: 96,
            decoration: const BoxDecoration(color: PTokens.surface, border: Border(right: BorderSide(color: PTokens.line))),
            child: SafeArea(
              right: false,
              child: Column(children: [
                const SizedBox(height: 24),
                SizedBox(height: 80, child: _tab(0, Icons.home_outlined, 'Trang chủ')),
                SizedBox(height: 80, child: _tab(1, Icons.confirmation_number_outlined, 'Vé của tôi')),
                SizedBox(height: 80, child: _tab(2, Icons.notifications_none, 'Thông báo', dot: store.unread)),
                SizedBox(height: 80, child: _tab(3, Icons.person_outline, 'Cá nhân')),
              ]),
            ),
          ),
          Expanded(child: IndexedStack(index: _index, children: pages)),
        ]),
      );
    }
    return Scaffold(
      body: IndexedStack(index: _index, children: pages),
      bottomNavigationBar: Container(
        decoration: const BoxDecoration(color: PTokens.surface, border: Border(top: BorderSide(color: PTokens.line))),
        child: SafeArea(
          top: false,
          child: SizedBox(
            height: 64,
            child: Row(children: [
              Expanded(child: _tab(0, Icons.home_outlined, 'Trang chủ')),
              Expanded(child: _tab(1, Icons.confirmation_number_outlined, 'Vé của tôi')),
              Expanded(child: _tab(2, Icons.notifications_none, 'Thông báo', dot: store.unread)),
              Expanded(child: _tab(3, Icons.person_outline, 'Cá nhân')),
            ]),
          ),
        ),
      ),
    );
  }

  Widget _tab(int i, IconData icon, String label, {bool dot = false}) {
    final selected = _index == i;
    final color = selected ? PTokens.primaryDark : PTokens.muted;
    return Semantics(
      selected: selected,
      button: true,
      label: label,
      child: InkWell(
        onTap: () {
          setState(() => _index = i);
          final store = PassengerScope.read(context);
          if (i == 1) store.loadTickets();
          if (i == 2) store.loadNotices().then((_) => store.markRead());
        },
        child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
          Stack(clipBehavior: Clip.none, children: [
            Icon(icon, color: color, size: 22),
            if (dot) Positioned(right: -2, top: -1, child: Container(width: 8, height: 8, decoration: const BoxDecoration(color: PTokens.danger, shape: BoxShape.circle))),
          ]),
          const SizedBox(height: 4),
          Text(label, style: sans(size: 12, weight: selected ? FontWeight.w600 : FontWeight.w400, color: color)),
        ]),
      ),
    );
  }
}
