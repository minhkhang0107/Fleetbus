import 'dart:async';

import 'package:flutter/material.dart';

import 'passenger_home_screen.dart';
import 'passenger_live_radar_screen.dart';
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

class _PassengerMainShellState extends State<PassengerMainShell> with WidgetsBindingObserver {
  late int _index = widget.initialTab;
  Timer? _poll;
  PassengerStore? _store;

  String? _bannerTicketId;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _startPolling();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final store = PassengerScope.read(context);
    final isNewStore = !identical(store, _store);
    if (isNewStore) {
      final wasNull = _store == null;
      _store?.removeListener(_onStore);
      _store = store..addListener(_onStore);
      if (wasNull && _index == 1) {
        store.loadTickets();
      }
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _poll?.cancel();
    _store?.removeListener(_onStore);
    super.dispose();
  }

  /// D144: while the app is open, new notices arrive by themselves every 30 s (none in the background).
  void _startPolling() {
    _poll?.cancel();
    _poll = Timer.periodic(const Duration(seconds: 30), (_) {
      final store = _store;
      if (store != null && store.loggedIn) store.loadNotices();
    });
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _store?.loadNotices();
      _store?.loadTickets();
      _startPolling();
    } else if (state == AppLifecycleState.paused || state == AppLifecycleState.hidden) {
      _poll?.cancel();
    }
  }

  /// D144: "the bus is coming" shows on top of whatever screen is open, with a way to see the bus.
  void _onStore() {
    final store = _store;
    if (store == null || !mounted) return;

    if (_bannerTicketId != null) {
      final current = store.tickets.where((t) => t.id == _bannerTicketId).firstOrNull;
      if (current != null && (current.status == TicketStatus.boarded || current.past)) {
        ScaffoldMessenger.of(context).hideCurrentMaterialBanner();
        _bannerTicketId = null;
      }
    }

    final alert = store.pendingAlert;
    if (alert == null) return;
    store.pendingAlert = null;
    _bannerTicketId = alert.ticketId;
    final ticket = store.tickets.where((t) => t.id == alert.ticketId).firstOrNull;
    final messenger = ScaffoldMessenger.of(context);
    messenger.clearMaterialBanners();
    messenger.showMaterialBanner(MaterialBanner(
      backgroundColor: PTokens.primarySoft,
      leading: const Icon(Icons.directions_bus, color: PTokens.primary),
      content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(alert.title, style: sans(size: 15, weight: FontWeight.w700, color: PTokens.ink)),
        Text(alert.body, style: sans(size: 13, color: PTokens.ink)),
      ]),
      actions: [
        TextButton(
          onPressed: () {
            _bannerTicketId = null;
            messenger.hideCurrentMaterialBanner();
          },
          child: const Text('Đóng'),
        ),
        if (ticket != null)
          TextButton(
            onPressed: () {
              _bannerTicketId = null;
              messenger.hideCurrentMaterialBanner();
              Navigator.of(context).push(MaterialPageRoute(builder: (_) => PassengerLiveRadarScreen(ticket: ticket)));
            },
            child: const Text('Xem xe'),
          ),
      ],
    ));
  }

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
          if (i == 0) {
            store.loadBanners();
            store.loadTickets();
          }
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
