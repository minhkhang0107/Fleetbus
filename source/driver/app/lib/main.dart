import 'dart:async';

import 'package:flutter/material.dart';

import 'src/presentation/driver_about_screen.dart';
import 'src/presentation/driver_login_screen.dart';
import 'src/presentation/driver_push.dart';
import 'src/presentation/driver_store.dart';
import 'src/presentation/driver_widgets.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  registerDriverFontLicenses();
  runApp(BusGoDriverApp(store: DriverStore()));
}

class BusGoDriverApp extends StatefulWidget {
  const BusGoDriverApp({super.key, required this.store});
  final DriverStore store;

  @override
  State<BusGoDriverApp> createState() => _BusGoDriverAppState();
}

class _BusGoDriverAppState extends State<BusGoDriverApp> {
  final _navigator = GlobalKey<NavigatorState>();

  @override
  void initState() {
    super.initState();
    widget.store.addListener(_onStore);
    // D192: the office's changes reach the phone by push when the Firebase settings are in the build.
    unawaited(startDriverPush(widget.store));
  }

  @override
  void dispose() {
    widget.store.removeListener(_onStore);
    super.dispose();
  }

  /// A session the server ended (H-06) sends the driver back to the login screen with the reason.
  void _onStore() {
    // A push while the app is open: the trips already reload; say what the office changed.
    final pushed = widget.store.pushMessage;
    if (pushed != null) {
      widget.store.pushMessage = null;
      final context = _navigator.currentContext;
      if (context != null) dToast(context, pushed);
    }
    final reason = widget.store.sessionEnded;
    if (reason == null) return;
    widget.store.sessionEnded = null;
    final nav = _navigator.currentState;
    if (nav == null) return;
    nav.pushAndRemoveUntil(MaterialPageRoute(builder: (_) => const DriverLoginScreen()), (_) => false);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final context = _navigator.currentContext;
      if (context != null) dToast(context, reason);
    });
  }

  @override
  Widget build(BuildContext context) {
    return DriverScope(
      store: widget.store,
      child: MaterialApp(
        navigatorKey: _navigator,
        title: 'BusGo Driver',
        debugShowCheckedModeBanner: false,
        theme: driverTheme(),
        scrollBehavior: const IosScrollBehavior(),
        home: const DriverLoginScreen(restoreSession: true),
      ),
    );
  }
}
