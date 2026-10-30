import 'dart:async';

import 'package:flutter/material.dart';

import 'src/presentation/passenger/passenger_about_screen.dart';
import 'src/presentation/passenger/passenger_onboarding_screen.dart';
import 'src/presentation/passenger/passenger_push.dart';
import 'src/presentation/passenger/passenger_store.dart';
import 'src/presentation/passenger/passenger_widgets.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  registerPassengerFontLicenses();
  runApp(BusGoPassengerApp(store: PassengerStore()));
}

// Phones and tablets use the whole screen; only very wide screens (desktop, web) get a centered
// 1280 dp frame. Screens switch to two columns from 720 dp (pWide).
Widget phoneColumnBuilder(BuildContext context, Widget? child) {
  if (child == null) return const SizedBox.shrink();
  final mq = MediaQuery.of(context);
  const maxWidth = 1280.0;
  if (mq.size.width <= maxWidth) return child;
  return ColoredBox(
    color: PTokens.line,
    child: Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: maxWidth),
        child: MediaQuery(
          data: mq.copyWith(size: Size(maxWidth, mq.size.height)),
          child: child,
        ),
      ),
    ),
  );
}

class BusGoPassengerApp extends StatefulWidget {
  const BusGoPassengerApp({super.key, required this.store});
  final PassengerStore store;

  @override
  State<BusGoPassengerApp> createState() => _BusGoPassengerAppState();
}

class _BusGoPassengerAppState extends State<BusGoPassengerApp> {
  final _navigator = GlobalKey<NavigatorState>();

  @override
  void initState() {
    super.initState();
    // D145: push through Firebase when the project's files are in the build.
    unawaited(startPush(widget.store));
    // BR-HOLD-004: when the hold or the payment window runs out, go back to the seat map and say why.
    widget.store.onHoldExpired = () {
      final nav = _navigator.currentState;
      if (nav == null) return;
      final wasPayment = widget.store.holdPhase == null;
      nav.popUntil((r) => r.settings.name == 'seats' || r.isFirst);
      final ctx = _navigator.currentContext;
      if (ctx == null) return;
      showAppSheet<void>(ctx, dismissible: false, builder: (sheet) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text('Hết thời gian giữ ghế', style: sans(size: 18, weight: FontWeight.w700)),
            gap(8),
            Text(
              'Ghế đã được nhả cho người khác. ${wasPayment ? 'Nếu bạn đã chuyển tiền sau giờ này, nhà xe sẽ hoàn lại tiền. ' : ''}Bạn có thể chọn lại ghế.',
              style: sans(size: 14, color: PTokens.muted, height: 1.5),
            ),
            gap(14),
            PrimaryButton(label: 'Chọn lại ghế', onPressed: () => Navigator.of(sheet).pop()),
          ]));
    };
  }

  @override
  void dispose() {
    widget.store.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return PassengerScope(
      store: widget.store,
      child: MaterialApp(
        navigatorKey: _navigator,
        title: 'BusGo',
        debugShowCheckedModeBanner: false,
        theme: passengerTheme(),
        scrollBehavior: const IosScrollBehavior(),
        builder: phoneColumnBuilder,
        home: PassengerLaunchScreen(restore: widget.store.restoreOperator),
      ),
    );
  }
}
